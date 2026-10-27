import { useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn, Button, Input, Textarea, Badge, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, money, toman, fa, toEnDigits, toFaDigits, todayJalali, formatJalali, formatJalaliLong, parseJalali, Icon, I, barcode128, amountWords, MoneyInput, NumInput, ensureBrand, brandNow, DocPreview, printDoc } from '../lib/hz'

/* ═══════════════════════════════════════════════════════════════
   returns/new — «ثبت مرجوعی جدید» هایپر زیتون
   چیدمان اصلی بازگردانده شد: اقلام در ستون بزرگ راست،
   اطلاعات مشتری و علت در ستون کنارِ فرم، تسویه در پایین.
   + چاپ رسید حرارتی Bixolon SRP-330II (Web Print SDK)
   + R8-RECEIPT: دیالوگ دو‌نسخه‌ای — حرارتی ۸۰mm (canvas) و
     رسید رسمی A4 به سبک فاکتور Apex (docs.tsx + DocPreview/printDoc)
   ═══════════════════════════════════════════════════════════════ */

const REASONS = ['کالای معیوب', 'اشتباه در خرید', 'اختلاف قیمت', 'انقضای کالا', 'عدم رضایت از کیفیت', 'خطای کارت‌خوان', 'سایر']

/** R7: واحدهای وزنی — مقدار اعشاری مجاز (۰٫۷۲ کیلو) */
const WEIGHT_UNITS = ['کیلوگرم', 'گرم', 'کیلو', 'لیتر', 'متر']
const fmtQty = (q: number): string => {
  const r = Math.round(q * 1000) / 1000
  return toFaDigits(String(r)).replace('.', '٫')
}

type SettleType = 'full' | 'exchange' | 'partial' | 'debt'
const SETTLE_META: Record<SettleType, { label: string; badge: string; box: string }> = {
  full: { label: 'پرداخت کامل به کارت', badge: 'bg-emerald-100 text-emerald-700', box: 'border-emerald-500/40 bg-emerald-500/5' },
  exchange: { label: 'تسویه با کالای جایگزین', badge: 'bg-yellow-500/15 text-yellow-800', box: 'border-yellow-500/40 bg-yellow-500/5' },
  partial: { label: 'تسویه جزئی (دارای مانده)', badge: 'bg-amber-100 text-amber-700', box: 'border-amber-500/40 bg-amber-500/5' },
  debt: { label: 'بدهی مشتری', badge: 'bg-rose-100 text-rose-700', box: 'border-destructive/40 bg-destructive/5' },
}

type RetItem = {
  key: number
  productId: string | null
  name: string
  barcode: string | null
  unit: string
  manual: boolean
  qty: string
  unitPrice: string
}
let itemSeq = 0

const num = (s: string): number => {
  const v = Number(toEnDigits(String(s ?? '')).replace(/[^\d.]/g, ''))
  return isFinite(v) ? v : 0
}
const normalizeMobile = (v: string) => toEnDigits(v).replace(/\D/g, '')

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: 'پیش‌نویس', cls: 'bg-stone-100 text-stone-600' },
  pending: { label: 'در انتظار تأیید', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'تأیید شده', cls: 'bg-teal-100 text-teal-700' },
  paid: { label: 'پرداخت‌شده', cls: 'bg-emerald-100 text-emerald-700' },
}

/* نشان نوع تسویه در دیالوگ سابقه — full/exchange/partial/debt + مقادیر قدیمی دیتابیس (transfer/both) */
const HIST_SETTLE: Record<string, { label: string; cls: string }> = {
  full: { label: 'بازگشت کامل وجه', cls: 'bg-emerald-100 text-emerald-700' },
  exchange: { label: 'تسویه با کالا', cls: 'bg-amber-100 text-amber-700' },
  partial: { label: 'بازگشت جزئی', cls: 'bg-stone-200 text-stone-700' },
  debt: { label: 'بدهی مشتری', cls: 'bg-rose-100 text-rose-700' },
  transfer: { label: 'بازگشت کامل وجه', cls: 'bg-emerald-100 text-emerald-700' },
  both: { label: 'بازگشت جزئی', cls: 'bg-stone-200 text-stone-700' },
}

/* ───── اعتبارسنجی شماره کارت (الگوریتم لان) + تشخیص بانک ───── */
function isValidCardNumber(digits: string): boolean {
  if (!/^\d{16}$/.test(digits)) return false
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10)
    if (alt) { d *= 2; if (d > 9) d -= 9 }
    sum += d
    alt = !alt
  }
  return sum % 10 === 0
}
/* ───── شناسایی لحظه‌ای بانک از ارقام اول کارت ─────
   پیشوندهای ۶ رقمی (BIN) بانک‌های ایران + رنگ برند؛
   تشخیص از ۴ رقم اول به‌صورت پیش‌رونده انجام می‌شود:
   اگر همهٔ BINهای سازگار با ارقام تایپ‌شده متعلق به یک بانک باشند،
   همان بانک همان لحظه نمایش داده می‌شود (بدون صبر برای ۱۶ رقم). */
const BANK_BINS: { bin: string; name: string; short: string; cls: string }[] = [
  { bin: '636214', name: 'بانک سامان', short: 'سامان', cls: 'bg-sky-100 text-sky-800 border-sky-200' },
  { bin: '621986', name: 'بانک سامان', short: 'سامان', cls: 'bg-sky-100 text-sky-800 border-sky-200' },
  { bin: '639347', name: 'بانک پارسیان', short: 'پارسیان', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  { bin: '622106', name: 'بانک پارسیان', short: 'پارسیان', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  { bin: '502229', name: 'بانک پارسیان', short: 'پارسیان', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  { bin: '627488', name: 'بانک کارآفرین', short: 'کارآفرین', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  { bin: '502908', name: 'بانک کارآفرین', short: 'کارآفرین', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  { bin: '502910', name: 'بانک کارآفرین', short: 'کارآفرین', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  { bin: '628023', name: 'بانک ملی ایران', short: 'ملی', cls: 'bg-yellow-50 text-yellow-800 border-yellow-500/30' },
  { bin: '603799', name: 'بانک ملی ایران', short: 'ملی', cls: 'bg-yellow-50 text-yellow-800 border-yellow-500/30' },
  { bin: '610433', name: 'بانک ملت', short: 'ملت', cls: 'bg-red-100 text-red-700 border-red-200' },
  { bin: '991975', name: 'بانک ملت', short: 'ملت', cls: 'bg-red-100 text-red-700 border-red-200' },
  { bin: '639607', name: 'بانک ملت', short: 'ملت', cls: 'bg-red-100 text-red-700 border-red-200' },
  { bin: '603769', name: 'بانک صادرات ایران', short: 'صادرات', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { bin: '603770', name: 'بانک صادرات ایران', short: 'صادرات', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { bin: '639217', name: 'بانک صادرات ایران', short: 'صادرات', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { bin: '589210', name: 'بانک سپه', short: 'سپه', cls: 'bg-violet-100 text-violet-800 border-violet-200' },
  { bin: '627353', name: 'بانک شهر', short: 'شهر', cls: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-500/30' },
  { bin: '502806', name: 'بانک شهر', short: 'شهر', cls: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-500/30' },
  { bin: '504706', name: 'بانک شهر', short: 'شهر', cls: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-500/30' },
  { bin: '627412', name: 'بانک اقتصاد نوین', short: 'اقتصاد', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  { bin: '502938', name: 'بانک اقتصاد نوین', short: 'اقتصاد', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  { bin: '502916', name: 'بانک آینده', short: 'آینده', cls: 'bg-yellow-50 text-yellow-800 border-yellow-500/30' },
  { bin: '627262', name: 'بانک آینده', short: 'آینده', cls: 'bg-yellow-50 text-yellow-800 border-yellow-500/30' },
  { bin: '627381', name: 'بانک انصار', short: 'انصار', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  { bin: '505416', name: 'بانک گردشگری', short: 'گردشگری', cls: 'bg-teal-50 text-teal-800 border-teal-200' },
  { bin: '505785', name: 'بانک ایران زمین', short: 'ایران‌زمین', cls: 'bg-red-100 text-red-700 border-red-200' },
  { bin: '636795', name: 'بانک مهر ایران', short: 'مهر', cls: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-500/30' },
  { bin: '621346', name: 'بانک سینا', short: 'سینا', cls: 'bg-violet-100 text-violet-800 border-violet-200' },
  { bin: '639346', name: 'بانک سینا', short: 'سینا', cls: 'bg-violet-100 text-violet-800 border-violet-200' },
  { bin: '639599', name: 'بانک قوامین', short: 'قوامین', cls: 'bg-stone-100 text-stone-700 border-stone-300' },
  { bin: '627648', name: 'بانک توسعه صادرات', short: 'توسعه', cls: 'bg-violet-50 text-violet-800 border-violet-200' },
  { bin: '627349', name: 'بانک توسعه صادرات', short: 'توسعه', cls: 'bg-violet-50 text-violet-800 border-violet-200' },
  { bin: '639370', name: 'بانک مهر ایران', short: 'مهر', cls: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-500/30' },
  { bin: '627483', name: 'بانک کارآفرین', short: 'کارآفرین', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  { bin: '585983', name: 'بانک تجارت', short: 'تجارت', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
]

/** پیشوندهای سازگار با ارقام تایپ‌شده تا الان */
function bankCandidates(digits: string) {
  return BANK_BINS.filter((b) => b.bin.startsWith(digits))
}

/** تشخیص لحظه‌ای: اگر همهٔ گزینه‌های ممکن یک بانک باشند همان را برگردان */
function detectBankLive(digits: string): { name: string; short: string; cls: string } | null {
  const d = digits.replace(/\D/g, '')
  if (d.length < 4) return null
  /* از رقم هفتم به بعد، همیشه با ۶ رقم اول تطبیق می‌دهیم */
  if (d.length >= 6) {
    const exact = BANK_BINS.find((b) => b.bin === d.slice(0, 6))
    return exact ? { name: exact.name, short: exact.short, cls: exact.cls } : null
  }
  /* پیش‌رونده (۴-۵ رقم): همهٔ BINهای شروع‌شونده با d باید یک بانک باشند */
  const cands = bankCandidates(d)
  if (cands.length === 0) return null
  const first = cands[0]
  if (cands.every((c) => c.name === first.name)) return { name: first.name, short: first.short, cls: first.cls }
  return null /* چند بانک ممکن — هنوز قطعی نیست */
}

/** نام بانک پس از تکمیل کارت (سازگار با رفتار قبلی) */
function detectBankName(digits: string): string | null {
  const exact = BANK_BINS.find((b) => b.bin === digits.slice(0, 6))
  return exact?.name ?? null
}


/* ───── قانون نوع تسویه — همان قانون سرور ─────
   «exchange» فقط وقتی درست است که کالای جایگزین به‌تنهایی کل مبلغ را بپوشاند و
   هیچ واریزی به کارت در کار نباشد. اگر «پرداخت به کارت» بخشی از مبلغ را
   پر می‌کند (حالت ترکیبی: کالا + کارت)، نوع «full» است چون وجهی به کارت
   مشتری برمی‌گردد و شماره کارت لازم است. */
function computeSettlement(total: number, exchange: number, transfer: number): SettleType {
  if (exchange > total) return 'debt'
  if (exchange > 0 && Math.abs(transfer + exchange - total) <= 1) return transfer > 1 ? 'full' : 'exchange'
  if (transfer + exchange < total - 1) return 'partial'
  return 'full'
}

/* ───── R8-RECEIPT: دادهٔ سند رسمی — تبدیل پاسخ ثبت به قرارداد docs.tsx ───── */
type ReceiptMode = 'thermal' | 'a4'

function docDataFrom(created: any, cashierName: string) {
  const dt = created?.createdAt ? new Date(created.createdAt) : new Date()
  const p2 = (n: number) => (n < 10 ? '0' + n : String(n))
  return {
    code: String(created?.code ?? ''),
    date: formatJalali(dt),
    time: `${p2(dt.getHours())}:${p2(dt.getMinutes())}`,
    customerName: String(created?.customerName ?? ''),
    customerPhone: String(created?.customerPhone ?? ''),
    customerCardNumber: created?.customerCardNumber ?? null,
    purchaseAt: created?.purchaseAt ?? null,
    settleType: String(created?.settlementType ?? ''),
    items: (Array.isArray(created?.items) ? created.items : []).map((it: any) => ({
      name: String(it?.name ?? ''),
      barcode: it?.barcode ? String(it.barcode) : null,
      qty: Math.round((Number(it?.qty) || 0) * 1000) / 1000,
      unit: String(it?.unit ?? ''),
      unitPrice: Number(it?.unitPrice) || 0,
      lineTotal: Number(it?.lineTotal) || 0,
    })),
    totalAmount: Number(created?.totalAmount) || 0,
    exchangeValue: Number(created?.exchangeValue) || 0,
    transferAmount: Number(created?.transferAmount) || 0,
    transferNote: created?.transferNote ?? null,
    reason: String(created?.reason ?? ''),
    note: created?.note ?? null,
    cashierName,
    status: String(created?.status ?? ''),
  }
}

/* ───── پیش‌نویس خودکار — بازیابی فرم ناتمام پس از رفرش ───── */
const DRAFT_KEY = 'hz-return-draft-v2'
const DRAFT_MAX_AGE = 14 * 24 * 3600 * 1000

type Draft = {
  items: RetItem[]
  cName: string
  cPhone: string
  cCard: string
  purchaseAt: string
  reason: string
  note: string
  exchange: number
  transfer: number
  transferManual: boolean
  transferNote: string
  savedAt: number
}
function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Draft
    if (!d || !d.savedAt || Date.now() - d.savedAt > DRAFT_MAX_AGE) return null
    if (!Array.isArray(d.items) || d.items.length === 0) return null
    return d
  } catch { return null }
}

/* ═══════════════════════════════════════════════════════════
   چاپ مستقیم روی چاپگر حرارتی Bixolon SRP-330II (۸۰ میلی‌متری)
   از طریق «Web Print SDK» — سرویس محلی روی رایانهٔ صندوق
   ═══════════════════════════════════════════════════════════ */
const BIXOLON_SERVICE_DOWN = 'سرویس Bixolon روی این رایانه در حال اجرا نیست'
const BIXOLON_PRINTER_NOT_FOUND = 'چاپگری با این نام ثبت نشده'

interface BixolonSettings { logicalName: string; port: number }
interface BixolonResult { ok: boolean; error?: string }

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
let bixolonJobSeq = 0

async function bixolonRequest(
  settings: BixolonSettings,
  endpointSuffix: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ ok: boolean; status?: number; data?: { RequestID?: number; ResponseID?: string; Result?: string }; networkError?: boolean }> {
  const name = encodeURIComponent(settings.logicalName.trim())
  const url = `http://127.0.0.1:${settings.port}/WebPrintSDK/${name}${endpointSuffix}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      /* Web Print SDK service parses the raw body as JSON but expects the
         canonical form-urlencoded content type (see bxlcommon.js requestPrint) */
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    let data: any
    try { data = await res.json() } catch { data = undefined }
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, networkError: true }
  } finally {
    clearTimeout(timer)
  }
}

function bixolonHttpError(r: { status?: number; networkError?: boolean }): string {
  if (r.status === 404) return BIXOLON_PRINTER_NOT_FOUND
  if (r.networkError) return BIXOLON_SERVICE_DOWN
  return `پاسخ نامعتبر از سرویس چاپ (کد ${r.status == null ? '—' : r.status})`
}

function bixolonValidate(settings: BixolonSettings): BixolonResult | null {
  if (!settings.logicalName || !settings.logicalName.trim()) return { ok: false, error: 'نام منطقی چاپگر خالی است' }
  if (!Number.isFinite(settings.port) || settings.port < 1 || settings.port > 65535) return { ok: false, error: 'پورت سرویس نامعتبر است' }
  return null
}

/** نتیجهٔ نهایی چاپگر — همان تفسیر رسمی SDK (خطا/شکست/گرفتگی کاغذ و …) */
function bixolonInterpretFinal(result: string): BixolonResult {
  const raw = result.trim()
  const lower = raw.toLowerCase()
  if (/(error|fail|abort|cancel|offline|cover[ _]?open|paper[ _]?(end|out|empty)|cutter|overheat)/.test(lower)) {
    return { ok: false, error: `چاپگر خطا برگرداند (${raw || 'نامشخص'})` }
  }
  if (/duplicated/.test(lower)) {
    return { ok: false, error: 'درخواست تکراری — چاپگر در حال پردازش درخواست قبلی است' }
  }
  return { ok: true }
}

/** آیا نتیجه هنوز در جریان است؟ (همان بررسی SDK: شامل ready یا progress) */
function bixolonInProgress(result: string): boolean {
  const lower = result.trim().toLowerCase()
  return lower.includes('ready') || lower.includes('progress')
}

async function bixolonPollFinalStatus(
  settings: BixolonSettings,
  requestId: number,
  responseId?: string,
): Promise<BixolonResult> {
  for (let attempt = 0; attempt < 20; attempt++) {
    await sleep(600)
    const r = await bixolonRequest(
      settings,
      '/checkStatus',
      { RequestID: requestId, ResponseID: responseId ?? '', Timeout: 30 },
      8000,
    )
    if (!r.ok) return { ok: false, error: bixolonHttpError(r) }
    const result = r.data?.Result
    if (typeof result === 'string' && !bixolonInProgress(result)) {
      return bixolonInterpretFinal(result)
    }
  }
  return { ok: false, error: 'چاپگر پاسخ نهایی نداد (لطفاً وضعیت دستگاه را بررسی کنید)' }
}

async function bixolonSendJob(
  functions: Record<string, Record<string, unknown[]>>,
  settings: BixolonSettings,
): Promise<BixolonResult> {
  const invalid = bixolonValidate(settings)
  if (invalid) return invalid
  const id = ++bixolonJobSeq
  const r = await bixolonRequest(settings, '', { id, functions }, 15000)
  if (!r.ok) return { ok: false, error: bixolonHttpError(r) }
  const initial = r.data?.Result
  if (typeof initial === 'string') {
    if (!bixolonInProgress(initial)) return bixolonInterpretFinal(initial)
    return bixolonPollFinalStatus(settings, r.data?.RequestID ?? id, r.data?.ResponseID)
  }
  /* بدون Result اولیه — به‌صورت آماده فرض می‌کنیم و استعلام می‌گیریم */
  return bixolonPollFinalStatus(settings, r.data?.RequestID ?? id, r.data?.ResponseID)
}

async function probeBixolon(settings: BixolonSettings): Promise<BixolonResult> {
  const invalid = bixolonValidate(settings)
  if (invalid) return invalid
  const id = ++bixolonJobSeq
  const r = await bixolonRequest(settings, '', { id, functions: { func0: { checkPrinterStatus: [] } } }, 6000)
  if (!r.ok) return { ok: false, error: bixolonHttpError(r) }
  const result = r.data?.Result
  if (typeof result === 'string' && !bixolonInProgress(result)) return bixolonInterpretFinal(result)
  return { ok: true }
}

async function printReceiptBitmap(canvas: HTMLCanvasElement, settings: BixolonSettings): Promise<BixolonResult> {
  let dataUrl: string
  try {
    dataUrl = canvas.toDataURL('image/png')
  } catch {
    return { ok: false, error: 'ساخت تصویر رسید ناموفق بود' }
  }
  return bixolonSendJob(
    {
      func0: { checkPrinterStatus: [] },
      func1: { printBitmap: [dataUrl, 510, 1, 1] },
      func2: { cutPaper: [1] },
    },
    settings,
  )
}

/* ───── رندر رسید حرارتی روی Canvas — فقط متن مشکی #18181b ───── */
const INK = '#18181b'

function renderThermalReceipt(
  data: {
    code: string
    customerName: string
    customerPhone: string
    customerCard?: string | null
    reason: string
    note?: string | null
    totalAmount: number
    exchangeValue: number
    transferAmount: number
    createdAt: string
    items: { name: string; barcode?: string | null; qty: number; unitPrice: number; lineTotal: number }[]
  },
  cashierName: string,
  logoImg?: HTMLImageElement | null,
): HTMLCanvasElement | null {
  const W = 510
  const M = 16
  const SCALE = 2
  const CX = W / 2
  const MAX_W = W - M * 2

  /* R8-RECEIPT: تفکیک تسویه — هم‌ساخت با نسخهٔ رسمی A4 */
  const exchange = Math.max(0, +data.exchangeValue || 0)
  const transfer = Math.max(0, +data.transferAmount || 0)
  const debt = exchange - data.totalAmount
  const pay = transfer > 0 ? transfer : Math.max(0, data.totalAmount - exchange)
  const regDt = new Date(data.createdAt)
  const p2 = (n: number) => (n < 10 ? '0' + n : String(n))
  const dateDot = toFaDigits((formatJalali(regDt) || '').replace(/\//g, '.')) || '—'
  const timeHM = toFaDigits(`${p2(regDt.getHours())}:${p2(regDt.getMinutes())}`)

  const measure = document.createElement('canvas').getContext('2d')
  if (!measure) return null

  const fontOf = (size: number, weight = 400) =>
    `${weight >= 700 ? 'bold ' : weight >= 600 ? '600 ' : weight >= 500 ? '500 ' : ''}${size}px Vazirmatn, Tahoma, sans-serif`

  const wrap = (text: string, size: number, weight: number, maxWidth: number): string[] => {
    measure.font = fontOf(size, weight)
    const parts = String(text ?? '').split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let line = ''
    for (const part of parts) {
      const next = line ? `${line} ${part}` : part
      if (!line || measure.measureText(next).width <= maxWidth) line = next
      else { lines.push(line); line = part }
    }
    if (line) lines.push(line)
    return lines.length > 0 ? lines : ['']
  }

  type Op =
    | { kind: 'text'; text: string; x: number; y: number; size: number; weight: number; align: 'center' | 'right' | 'left' }
    | { kind: 'rule'; y: number; dash: boolean; width: number }
    | { kind: 'image'; img: HTMLCanvasElement; x: number; y: number; w: number; h: number }
  const ops: Op[] = []
  let y = 28

  /* فاصلهٔ سطر ≈ اندازه × ۱.۷۵ — حدود ۴۰٪ بازتر از قبل برای خوانایی چاپی */
  const center = (text: string, size: number, weight = 400, gap = 0) => {
    ops.push({ kind: 'text', text, x: CX, y: y + size, size, weight, align: 'center' })
    y += Math.round(size * 1.75) + gap
  }
  const right = (text: string, size: number, weight = 400, gap = 0) => {
    ops.push({ kind: 'text', text, x: W - M, y: y + size, size, weight, align: 'right' })
    y += Math.round(size * 1.75) + gap
  }
  /** سطر اطلاعات: برچسب ۱۸ راست + مقدار ۲۰ چپ — هر دو روی یک کرسی (بزرگ‌سازی ~۶۰٪ برای چاپ خوانا) */
  const row = (label: string, value: string) => {
    ops.push({ kind: 'text', text: label, x: W - M, y: y + 18, size: 18, weight: 500, align: 'right' })
    ops.push({ kind: 'text', text: value, x: M, y: y + 18, size: 20, weight: 700, align: 'left' })
    y += 38
  }
  /** سطر جمع کل: برچسب ۱۹/۶۰۰ + مقدار ۲۶/۸۰۰ درشت */
  const totalRow = (label: string, value: string) => {
    ops.push({ kind: 'text', text: label, x: W - M, y: y + 24, size: 19, weight: 600, align: 'right' })
    ops.push({ kind: 'text', text: value, x: M, y: y + 24, size: 26, weight: 800, align: 'left' })
    y += 48
  }
  const rule = (dash = true, advance = 18) => {
    ops.push({ kind: 'rule', y: y + 5, dash, width: 1 })
    y += advance
  }
  /** بارکد Code128 وسط‌چین زیر سطر جاری — پیشروی عمودی به اندازهٔ خود بارکد */
  const barcode = (text: string, height: number) => {
    const bc = barcode128(text, { height })
    if (!bc) return
    const w = Math.min(bc.width, MAX_W)
    const h = Math.round(bc.height * (w / bc.width))
    ops.push({ kind: 'image', img: bc, x: Math.round((W - w) / 2), y: y + 3, w, h })
    y += h + 18
  }

  /* سربرگ فروشگاه — R7: لوگوی بارگذاری‌شدهٔ مدیر (system/data) یا متن درشت */
  if (logoImg) {
    const maxH = 84
    const ratio = Math.min(1, maxH / logoImg.height, MAX_W / logoImg.width)
    const w = Math.round(logoImg.width * ratio)
    const h = Math.round(logoImg.height * ratio)
    ops.push({ kind: 'image', img: logoImg, x: Math.round((W - w) / 2), y: y + 4, w, h })
    y += h + 10
    const bn = (brandNow().storeName || '').trim()
    if (bn) center(bn, 22, 700)
  } else {
    center('هایپر زیتون', 44, 800)
  }
  center('رسید ثبت مرجوعی کالا', 26, 700)
  rule()

  /* شماره پیگیری + بارکد Code128 قابل اسکن */
  center('شماره پیگیری مرجوعی', 17, 500)
  center(toFaDigits(data.code), 32, 800, 4)
  barcode(data.code, 64)
  rule()

  /* اطلاعات مشتری و ثبت */
  row('مشتری', data.customerName || '—')
  row('موبایل', toFaDigits(data.customerPhone || '—'))
  /* شمارهٔ کارت بانکی مشتری — کامل و بدون مخفی‌سازی (برای واریز مرجوعی) */
  if (data.customerCard) {
    const d = String(data.customerCard).replace(/\D/g, '')
    if (d.length >= 12) row('کارت مشتری', toFaDigits(d.replace(/(\d{4})(?=\d)/g, '$1-')))
  }
  row('علت مرجوعی', data.reason || '—')
  row('صندوقدار', cashierName || '—')
  row('تاریخ', dateDot)
  row('ساعت', timeHM)
  if (data.note) for (const line of wrap(data.note, 16, 500, MAX_W)) right(line, 16, 500)
  rule()

  /* اقلام مرجوعی — نام ۲۰، تعداد ۱۹، فی ۱۷، جمع قلم ۲۴ + بارکد هر قلم */
  right(`اقلام مرجوعی (${toFaDigits(String(data.items.length))} قلم)`, 20, 700, 4)
  data.items.forEach((it, i) => {
    const qtyText = `×${fmtQty(it.qty)}` // R7: وزنی اعشاری با ممیز فارسی — ۰٫۷۲
    measure.font = fontOf(19, 600)
    const qtyW = Math.ceil(measure.measureText(qtyText).width) + 22
    const nameLines = wrap(it.name, 20, 700, MAX_W - qtyW)
    nameLines.forEach((line, li) => {
      ops.push({ kind: 'text', text: line, x: W - M, y: y + 20, size: 20, weight: 700, align: 'right' })
      if (li === nameLines.length - 1) {
        ops.push({ kind: 'text', text: qtyText, x: M, y: y + 20, size: 19, weight: 600, align: 'left' })
      }
      y += 36
    })
    ops.push({ kind: 'text', text: `فی: ${money(it.unitPrice)} ریال`, x: W - M, y: y + 22, size: 17, weight: 500, align: 'right' })
    ops.push({ kind: 'text', text: money(it.lineTotal), x: M, y: y + 22, size: 24, weight: 800, align: 'left' })
    y += 44
    if (it.barcode) barcode(String(it.barcode), 52)
    if (i < data.items.length - 1) rule(true, 16)
  })
  rule()

  /* R8-RECEIPT: تسویه — تفکیک کالا/کارت + مبلغ قابل پرداخت (درشت) */
  totalRow('جمع کل مرجوعی', `${money(data.totalAmount)} ریال`)
  if (exchange > 0) row('تسویه با کالا', `${money(exchange)} ریال`)
  if (transfer > 0) row('بازپرداخت به کارت', `${money(transfer)} ریال`)
  if (debt > 0) row('بدهی مشتری', `${money(debt)} ریال`)
  y += 6
  rule(false, 10)
  rule(false, 11)
  totalRow('مبلغ قابل پرداخت', `${money(pay)} ریال`)
  y += 4
  const words = amountWords(pay)
  for (const line of wrap(words.rial, 19, 600, MAX_W)) center(line, 19, 600)
  for (const line of wrap(`معادل: ${words.toman}`, 19, 600, MAX_W)) center(line, 19, 600)
  rule(false, 10)
  rule(false, 11)

  /* امضا و پابرگ */
  center('امضای مشتری: ..............................', 17, 500, 2)
  for (const line of wrap('این رسید صرفاً جهت پیگیری مرجوعی صادر شده است.', 16, 600, MAX_W)) center(line, 16, 600)
  for (const line of wrap('وجه مرجوعی پس از تأیید مدیریت به کارت مشتری واریز می‌شود.', 15, 500, MAX_W)) center(line, 15, 500)
  center('سر رسید — سامانه یکپارچه مدیریت هایپر زیتون', 15, 600)
  center(`چاپ: ${toFaDigits(formatJalaliLong(new Date()))}`, 15, 500)
  y += 26

  const height = Math.max(400, Math.ceil(y))
  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(SCALE, SCALE)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, height)
  ctx.direction = 'rtl'
  ctx.textBaseline = 'alphabetic'
  for (const op of ops) {
    if (op.kind === 'text') {
      ctx.font = fontOf(op.size, op.weight)
      ctx.fillStyle = INK
      ctx.textAlign = op.align
      ctx.fillText(op.text, op.x, op.y)
    } else if (op.kind === 'image') {
      ctx.save()
      ctx.imageSmoothingEnabled = false /* میله‌های بارکد کاملاً شارپ — قابل اسکن */
      ctx.drawImage(op.img, op.x, op.y, op.w, op.h)
      ctx.restore()
    } else {
      ctx.save()
      ctx.strokeStyle = INK
      ctx.lineWidth = op.width
      if (op.dash) ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(M, op.y)
      ctx.lineTo(W - M, op.y)
      ctx.stroke()
      ctx.restore()
    }
  }
  return canvas
}

/* ───── دیالوگ چاپ رسید — دو نسخه: حرارتی Bixolon + رسمی A4 (R8-RECEIPT) ───── */
function ReceiptDialog({
  open, onOpenChange, created, cashierName, initialMode = 'thermal',
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  created: any
  cashierName: string
  initialMode?: ReceiptMode
}) {
  const [mode, setMode] = useState<ReceiptMode>(initialMode)
  const [bx, setBx] = useState<{ logicalName: string; port: string }>(() => {
    try {
      const raw = localStorage.getItem('hz-bixolon')
      if (raw) {
        const p = JSON.parse(raw)
        return { logicalName: String(p.logicalName || 'Printer1'), port: String(p.port || 18080) }
      }
    } catch { /* حافظه در دسترس نیست */ }
    return { logicalName: 'Printer1', port: '18080' }
  })
  const [testing, setTesting] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [printingA4, setPrintingA4] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  /* دادهٔ سند رسمی A4 — همان چیزی که DocPreview نشان می‌دهد و printDoc چاپ می‌کند */
  const docData = useMemo(() => docDataFrom(created, cashierName), [created, cashierName])

  useEffect(() => { if (open) setMode(initialMode) }, [open, initialMode])

  function updateBx(patch: Partial<{ logicalName: string; port: string }>) {
    setBx((prev) => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem('hz-bixolon', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  useEffect(() => {
    if (!open || !created || mode !== 'thermal') return
    ;(async () => {
      /* R7: لوگوی فروشگاه روی رسید حرارتی — از هویت چاپی */
      let logoImg: HTMLImageElement | null = null
      try {
        const br = await ensureBrand()
        if (br?.logoUrl) {
          logoImg = await new Promise<HTMLImageElement | null>((resolve) => {
            const im = new Image()
            im.onload = () => resolve(im)
            im.onerror = () => resolve(null)
            im.src = br.logoUrl
          })
        }
      } catch { /* بدون لوگو ادامه بده */ }
      const c = renderThermalReceipt(
        {
          code: String(created.code ?? ''),
          customerName: String(created.customerName ?? ''),
          customerPhone: String(created.customerPhone ?? ''),
          customerCard: created.customerCardNumber ?? null,
          reason: String(created.reason ?? ''),
          note: created.note,
          totalAmount: Number(created.totalAmount) || 0,
          exchangeValue: Number(created.exchangeValue) || 0,
          transferAmount: Number(created.transferAmount) || 0,
          createdAt: String(created.createdAt ?? new Date().toISOString()),
          items: (Array.isArray(created.items) ? created.items : []).map((it: any) => ({
            name: String(it.name ?? ''),
            barcode: it.barcode ? String(it.barcode) : null,
            qty: Math.round((Number(it.qty) || 0) * 1000) / 1000, // R7: وزنی اعشاری (۰٫۷۲)
            unitPrice: Number(it.unitPrice) || 0,
            lineTotal: Number(it.lineTotal) || Number(it.qty) * Number(it.unitPrice) || 0,
          })),
        },
        cashierName,
        logoImg,
      )
      canvasRef.current = c
      setPreviewUrl(c ? c.toDataURL('image/png') : '')
    })()
  }, [open, created, cashierName, mode])

  function settings(): BixolonSettings {
    return { logicalName: bx.logicalName.trim() || 'Printer1', port: Math.trunc(num(bx.port)) || 18080 }
  }

  async function testConnection() {
    setTesting(true)
    const r = await probeBixolon(settings())
    setTesting(false)
    if (r.ok) toast.success('اتصال به سرویس چاپ برقرار است')
    else toast.error(r.error || 'اتصال ناموفق بود')
  }

  async function print() {
    const canvas = canvasRef.current
    if (!canvas) return toast.error('پیش‌نمایش رسید آماده نیست')
    setPrinting(true)
    const r = await printReceiptBitmap(canvas, settings())
    setPrinting(false)
    if (r.ok) toast.success('رسید به چاپگر حرارتی ارسال شد')
    else toast.error(r.error || 'چاپ ناموفق بود')
  }

  /* R8-RECEIPT: چاپ رسمی A4 از طریق printDoc (iframe + @page) — عینِ پیش‌نمایش */
  async function printA4() {
    if (!created) return toast.error('رسید آماده نیست')
    setPrintingA4(true)
    try {
      await printDoc('return', docData)
    } catch {
      toast.error('چاپ رسمی ناموفق بود')
    }
    setPrintingA4(false)
  }

  function download() {
    const canvas = canvasRef.current
    if (!canvas) return toast.error('تصویر رسید آماده نیست')
    try {
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `receipt-${created?.code ?? 'hz'}.png`
      a.click()
      toast.success('تصویر رسید دانلود شد')
    } catch {
      toast.error('ساخت تصویر رسید ناموفق بود')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><I.printer size={18} /> چاپ رسید مرجوعی</DialogTitle>
          <DialogDescription>نسخهٔ حرارتی ۸۰ میلی‌متری روی چاپگر Bixolon، یا نسخهٔ رسمی A4 با سربرگ فروشگاه</DialogDescription>
        </DialogHeader>

        {/* سوییچ نسخه — R8-RECEIPT */}
        <div className="grid grid-cols-2 gap-1 rounded-xl border bg-muted/60 p-1" role="tablist" aria-label="نسخهٔ چاپ">
          <button
            type="button" role="tab" aria-selected={mode === 'thermal'}
            onClick={() => setMode('thermal')}
            className={cn('flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors', mode === 'thermal' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500 hover:text-stone-800')}
          >
            <I.printer size={15} /> چاپگر حرارتی ۸۰mm
          </button>
          <button
            type="button" role="tab" aria-selected={mode === 'a4'}
            onClick={() => setMode('a4')}
            className={cn('flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors', mode === 'a4' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500 hover:text-stone-800')}
          >
            <I.receipt size={15} /> رسید رسمی A4
          </button>
        </div>

        {mode === 'thermal' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-stone-500">نام منطقی چاپگر</label>
                <Input dir="ltr" className="text-end" value={bx.logicalName} onChange={(e: any) => updateBx({ logicalName: e.target.value })} placeholder="Printer1" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-stone-500">پورت سرویس</label>
                <Input dir="ltr" inputMode="numeric" className="num text-end" value={bx.port} onChange={(e: any) => updateBx({ port: toEnDigits(e.target.value).replace(/\D/g, '') })} placeholder="18080" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" disabled={testing} onClick={() => void testConnection()}>
                {testing ? <I.loader size={14} className="animate-spin" /> : <I.settings size={14} />} آزمایش اتصال
              </Button>
              <span className="text-[10px] text-stone-400">تنظیمات در همین مرورگر ذخیره می‌شود</span>
            </div>

            {/* R7: پیش‌نمایش رسید با ارتفاع محدود و اسکرول — رسیدهای بلند دیگر دکمهٔ چاپ را نمی‌پوشانند */}
            <div className="flex max-h-[52vh] justify-center overflow-y-auto rounded-xl border border-stone-200 bg-stone-100 p-3 scroll-area">
              {previewUrl ? (
                <img src={previewUrl} alt="پیش‌نمایش رسید حرارتی" className="w-[306px] max-w-full rounded-md border border-stone-300 bg-white shadow-sm" />
              ) : (
                <span className="py-8 text-xs text-stone-400">در حال ساخت پیش‌نمایش…</span>
              )}
            </div>
            <p className="text-[10px] leading-4 text-stone-400">
              نوار حرارتی ۸۰ میلی‌متری — متن کاملاً مشکی روی زمینهٔ سفید. اگر سرویس چاپ روی این رایانه اجرا نمی‌شود، از دکمهٔ «دانلود تصویر رسید» استفاده کنید (چاپ مرورگر به‌دلیل حاشیهٔ اضافی مجاز نیست).
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" className="gap-1.5" onClick={download}>
                <I.banknote size={15} /> دانلود تصویر رسید
              </Button>
              <Button className="gap-1.5" disabled={printing || !previewUrl} onClick={() => void print()}>
                {printing ? <I.loader size={15} className="animate-spin" /> : <I.printer size={15} />} چاپ رسید
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] leading-5 text-stone-500">
              نسخهٔ رسمی A4 به سبک فاکتور فروشگاه — سربرگ با لوگو، نوار شماره سند/تاریخ/ساعت، جدول اقلام با سرستون تیره، بلوک تسویه و محل امضا.
              پیش‌نمایش زیر عیناً همان چیزی است که چاپ می‌شود (برای بایگانی و تأیید مدیریت).
            </p>
            <DocPreview kind="return" data={docData} scale={0.5} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] text-stone-400">قطع A4 — از پنجرهٔ چاپ مرورگر می‌توان PDF گرفت</span>
              <Button className="gap-1.5" disabled={printingA4 || !created} onClick={() => void printA4()}>
                {printingA4 ? <I.loader size={15} className="animate-spin" /> : <I.printer size={15} />} چاپ / ذخیرهٔ PDF
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ═════════════════ نمای اصلی ═════════════════ */
export default function ReturnsNewView() {
  const { user, go } = useShell()
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<any[]>([])
  const [showResults, setShowResults] = useState(false)

  const [items, setItems] = useState<RetItem[]>([])
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  /* اطلاعات مشتری */
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [purchaseAt, setPurchaseAt] = useState('')
  const [lookup, setLookup] = useState<{ loading: boolean; data: any | null; fresh: boolean }>({ loading: false, data: null, fresh: false })
  const [histOpen, setHistOpen] = useState(false)
  const autoLookupRef = useRef<string>('')

  /* تسویه */
  const [exchangeValue, setExchangeValue] = useState(0)
  const [transferAmount, setTransferAmount] = useState(0)
  const [transferManual, setTransferManual] = useState(false)
  const [transferNote, setTransferNote] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<any | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const [printMode, setPrintMode] = useState<ReceiptMode>('thermal')
  const [draftRestored, setDraftRestored] = useState<Draft | null>(null)

  const searchRef = useRef<any>(null)

  /* ───── محاسبات مشتق ───── */
  const total = useMemo(() => items.reduce((s, it) => s + (num(it.qty) || 0) * (num(it.unitPrice) || 0), 0), [items])
  const phoneOk = /^09\d{9}$/.test(normalizeMobile(phone))
  const cardDigits = toEnDigits(cardNumber).replace(/\D/g, '')
  const cardOk = isValidCardNumber(cardDigits)
  const bankName = detectBankName(cardDigits)
  const purchaseOk = (() => {
    const s = toEnDigits(purchaseAt).trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
    const d = parseJalali(s)
    return d instanceof Date && !isNaN(d.getTime())
  })()
  const settleType = computeSettlement(total, exchangeValue, transferAmount)
  const remaining = Math.max(0, total - exchangeValue - transferAmount)
  /* کارت بانکی فقط وقتی لازم است که کالای جایگزین، «کل» مبلغ مرجوعی را نپوشاند:
     - exchange < total → مبلغی باید به کارت مشتری برگردد (واریز به کارت) → کارت الزامی
     - exchange ≥ total → کالا همه‌چیز را پوشش می‌دهد (مساوی: تعویض کامل؛ بیشتر: بدهی مشتری) → کارت لازم نیست */
  const cardDisabled = total > 0 && exchangeValue >= total

  /* بازیابی پیش‌نویس هنگام بارگذاری */
  useEffect(() => {
    const d = loadDraft()
    if (d) setDraftRestored(d)
  }, [])

  function restoreDraft(d: Draft) {
    setItems(d.items.map((it) => ({ ...it, key: ++itemSeq })))
    setCustomerName(d.cName || '')
    setPhone(d.cPhone || '')
    setCardNumber(d.cCard || '')
    setPurchaseAt(d.purchaseAt || '')
    setReason(d.reason || '')
    setNote(d.note || '')
    setExchangeValue(d.exchange || 0)
    setTransferAmount(d.transfer || 0)
    setTransferManual(!!d.transferManual)
    setTransferNote(d.transferNote || '')
    setDraftRestored(null)
    toast.success('پیش‌نویس ذخیره‌شده بازیابی شد')
  }

  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    setDraftRestored(null)
  }

  /* ذخیرهٔ خودکار پیش‌نویس — ۷۰۰ میلی‌ثانیه پس از آخرین تغییر */
  useEffect(() => {
    if (created) return
    if (items.length === 0 && !customerName && !phone) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          items, cName: customerName, cPhone: phone, cCard: cardNumber,
          purchaseAt, reason, note, exchange: exchangeValue, transfer: transferAmount,
          transferManual, transferNote: transferNote, savedAt: Date.now(),
        }))
      } catch { /* ignore */ }
    }, 700)
    return () => clearTimeout(t)
  }, [items, customerName, phone, cardNumber, purchaseAt, reason, note, exchangeValue, transferAmount, transferManual, transferNote, created])

  useEffect(() => { if (!created) searchRef.current?.focus?.() }, [created])

  /* میان‌بر ثبت سریع: Ctrl+Enter */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !created && !submitting) {
        e.preventDefault()
        void submit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* ───── جستجوی کالا — بارکد دقیق، سپس جستجوی متنی ───── */
  async function doSearch(raw?: string) {
    const q = toEnDigits(String(raw ?? search)).trim()
    if (!q) return
    setSearching(true)
    let direct: any = null
    /* بارکد داخلی فروشگاه می‌تواند ۴ رقمی باشد (مثلاً ۱۵۵۰) — از ۴ رقم به بالا مسیر بارکد دقیق */
    if (/^\d{4,}$/.test(q)) {
      const exact = await api(`/api/products/search${qs({ barcode: q })}`)
      if (exact.ok && exact.data?.id && exact.data.barcode === q) direct = exact.data
    }
    if (direct) {
      setSearching(false)
      addProduct(direct)
      return
    }
    const fuzzy = await api(`/api/products/search${qs({ q })}`)
    setSearching(false)
    const list: any[] = fuzzy.ok && Array.isArray(fuzzy.data?.products) ? fuzzy.data.products : []
    if (list.length === 0 && direct) list.push(direct)
    setResults(list)
    setShowResults(true)
    if (list.length === 0 && !fuzzy.ok) toast.error(fuzzy.error || 'جستجوی کالا ناموفق بود')
    else if (list.length === 0) toast.info('کالایی یافت نشد — می‌توانید دستی اضافه کنید')
  }

  function addProduct(p: any) {
    setItems((prev) => [
      ...prev,
      {
        key: ++itemSeq,
        productId: p.id ?? null,
        name: p.name ?? '',
        barcode: p.barcode ?? null,
        unit: p.unit || 'عدد',
        manual: false,
        qty: '1',
        unitPrice: p.sellPrice != null && Number(p.sellPrice) > 0 ? String(Math.round(Number(p.sellPrice))) : '',
      },
    ])
    setSearch('')
    setResults([])
    setShowResults(false)
    toast.success(`«${p.name ?? 'کالا'}» به اقلام اضافه شد`)
    searchRef.current?.focus?.()
  }

  function addManual() {
    const n = search.trim()
    if (!n) return toast.error('نام کالا را در کادر جستجو بنویسید')
    setItems((prev) => [...prev, { key: ++itemSeq, productId: null, name: n, barcode: null, unit: 'عدد', manual: true, qty: '1', unitPrice: '' }])
    setSearch('')
    setResults([])
    setShowResults(false)
    toast.success(`«${n}» به‌صورت دستی اضافه شد — قیمت واحد را وارد کنید`)
  }

  function updateItem(key: number, patch: Partial<RetItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }
  function removeItem(key: number) {
    setItems((prev) => prev.filter((it) => it.key !== key))
  }

  /* استعلام سابقهٔ مشتری */
  async function lookupCustomer(auto = false) {
    const p = normalizeMobile(phone)
    if (!/^09\d{9}$/.test(p)) { if (!auto) toast.error('شماره موبایل معتبر نیست (فرمت: ۰۹۱۲۳۴۵۶۷۸۹)'); return }
    setLookup({ loading: true, data: null, fresh: false })
    const r = await api(`/api/return-customers/${encodeURIComponent(p)}`)
    if (r.ok && r.data) {
      setLookup({ loading: false, data: r.data, fresh: true })
      if (!customerName.trim() && r.data.customer?.name) setCustomerName(r.data.customer.name)
      if (!auto) toast.success(`سابقهٔ مشتری یافت شد — ${fa(r.data.customer?.count ?? 0)} مرجوعی`)
      else if ((r.data.customer?.count ?? 0) > 0) toast.info(`مشتری شناسایی شد — ${fa(r.data.customer?.count ?? 0)} مرجوعی قبلی`)
    } else {
      setLookup({ loading: false, data: null, fresh: true })
      if (!auto) {
        if (r.error === 'مشتری یافت نشد') toast.info('مشتری جدید — سابقهٔ مرجوعی ندارد')
        else toast.error(r.error || 'دریافت سابقه مشتری ناموفق بود')
      }
    }
  }

  /* استعلام خودکار به‌محض کامل‌شدن شمارهٔ موبایل (۱۱ رقم) — بدون نیاز به دکمه */
  useEffect(() => {
    const p = normalizeMobile(phone)
    if (!/^09\d{9}$/.test(p) || created) return
    if (autoLookupRef.current === p) return
    autoLookupRef.current = p
    const t = setTimeout(() => { void lookupCustomer(true) }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, created])

  async function submit() {
    if (items.length === 0) return toast.error('حداقل یک کالا به فهرست اضافه کنید')
    for (const it of items) {
      if (!it.name.trim()) return toast.error('نام همه اقلام را وارد کنید')
      /* R7: کالای وزنی (کیلوگرم/گرم) مقدار اعشاری می‌پذیرد — مثلاً ۰٫۷۲ کیلو بادام زمینی (بارکد ۱۵۵۰) */
      const q = num(it.qty)
      if (!(q > 0)) return toast.error(`مقدار «${it.name.trim()}» باید بیشتر از صفر باشد`)
      if (!WEIGHT_UNITS.includes(it.unit) && Math.abs(q - Math.round(q)) > 1e-9) {
        return toast.error(`«${it.name.trim()}» به ${it.unit} است — مقدار باید عدد صحیح باشد (اعشار فقط برای کالای وزنی)`)
      }
    }
    if (total <= 0) return toast.error('مبلغ کل مرجوعی باید بیشتر از صفر باشد — فی اقلام را وارد کنید')
    if (customerName.trim().length < 2) return toast.error('نام مشتری را کامل وارد کنید')
    const p = normalizeMobile(phone)
    if (!phoneOk) return toast.error('شماره موبایل مشتری معتبر نیست (فرمت: ۰۹۱۲۳۴۵۶۷۸۹)')
    if (!cardDisabled && transferAmount > 0 && !cardOk) return toast.error('بخشی از وجه به کارت مشتری برمی‌گردد — شماره کارت ۱۶ رقمی معتبر (الگوریتم لان) الزامی است')
    if (!cardDisabled && cardDigits.length > 0 && !cardOk) return toast.error('شماره کارت ۱۶ رقمی مشتری معتبر نیست (الگوریتم لان)')
    if (!purchaseOk) return toast.error('تاریخ خرید معتبر نیست (فرمت: ۱۴۰۵-۰۷-۲۷)')
    if (!reason) return toast.error('علت مرجوعی را انتخاب کنید')
    if ((settleType === 'partial' || settleType === 'debt') && !transferNote.trim()) return toast.error('برای تسویه جزئی یا بدهی، توضیح تسویه الزامی است')
    if (transferAmount > 0 && transferAmount + exchangeValue > total + 1) return toast.error('پرداخت به کارت + کالای جایگزین نباید از مبلغ کل مرجوعی بیشتر باشد')

    setSubmitting(true)
    const r = await api('/api/returns', {
      method: 'POST',
      body: {
        items: items.map((it) => ({
          productId: it.productId,
          name: it.name.trim(),
          barcode: it.manual ? null : it.barcode,
          unit: it.unit, // R7: واحد قلم — برای تشخیص وزنی/عددی
          qty: Math.round(num(it.qty) * 1000) / 1000, // R7: اعشاری برای کالای وزنی (۰٫۷۲ کیلو)
          unitPrice: Math.max(0, Math.round(num(it.unitPrice))),
        })),
        customerName: customerName.trim(),
        customerPhone: p,
        customerCardNumber: cardDigits || undefined,
        purchaseAt: toEnDigits(purchaseAt).trim() || undefined,
        reason,
        note: note.trim() || undefined,
        exchangeValue: Math.round(exchangeValue),
        transferAmount: Math.round(transferAmount),
        transferNote: transferNote.trim() || undefined,
      },
    })
    setSubmitting(false)
    if (!r.ok) return toast.error(r.error || 'ثبت مرجوعی ناموفق بود')
    setCreated(r.data)
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    toast.success(`مرجوعی ${toFaDigits(r.data.code)} با موفقیت ثبت شد — کد رهگیری را به مشتری اعلام کنید`)
  }

  function resetForm() {
    autoLookupRef.current = ''
    setItems([])
    setReason('')
    setNote('')
    setCustomerName('')
    setPhone('')
    setCardNumber('')
    setPurchaseAt('')
    setLookup({ loading: false, data: null, fresh: false })
    setExchangeValue(0)
    setTransferAmount(0)
    setTransferManual(false)
    setTransferNote('')
    setCreated(null)
    searchRef.current?.focus?.()
  }

  /* همگام‌سازی خودکار مبلغ کارت = جمع کل − کالای جایگزین */
  useEffect(() => {
    if (!transferManual) setTransferAmount(Math.max(0, total - exchangeValue))
  }, [total, exchangeValue, transferManual])

  /* با فعال‌شدن تسویه کالا، شماره کارت خودکار خالی می‌شود */
  useEffect(() => {
    if (cardDisabled && cardNumber) setCardNumber('')
  }, [cardDisabled])

  /* ───── صفحهٔ موفقیت پس از ثبت ───── */
  if (created) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><I.check size={22} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">مرجوعی با موفقیت ثبت شد</p>
            <p className="text-sm text-stone-500">
              کد رهگیری: <span className="font-mono font-bold" dir="ltr">{toFaDigits(created.code)}</span>
              <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">در انتظار تأیید مدیریت</span>
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h2 className="flex items-center gap-2 font-bold"><I.receipt size={18} /> خلاصهٔ مرجوعی</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p>مشتری: <b>{created.customerName}</b></p>
            <p className="num">موبایل: <span dir="ltr">{toFaDigits(created.customerPhone)}</span></p>
            <p>علت: <b>{created.reason}</b></p>
            <p className="num">تعداد اقلام: <b>{fa(created.items?.length ?? 0)} قلم</b></p>
            <p>صندوقدار: <b>{user?.fullName || created.cashier?.fullName || '—'}</b></p>
            <p className="num">تاریخ ثبت: <b>{toFaDigits(todayJalali())}</b></p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-center">
            <div className="text-xs text-stone-500">مبلغ کل مرجوعی</div>
            <div className="text-2xl font-black text-emerald-700" dir="ltr">{money(created.totalAmount)} <span className="text-sm font-normal">ریال</span></div>
            <div className="text-[11px] text-stone-400">معادل {toman(created.totalAmount)} تومان</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" className="touch-target flex-1 gap-1.5" onClick={() => { setPrintMode('thermal'); setPrintOpen(true) }}>
              <I.printer size={16} /> چاپ رسید حرارتی
            </Button>
            <Button size="lg" variant="outline" className="touch-target flex-1 gap-1.5" onClick={() => { setPrintMode('a4'); setPrintOpen(true) }}>
              <I.receipt size={16} /> چاپ رسمی A4
            </Button>
            <Button size="lg" variant="outline" className="touch-target flex-1 gap-1.5" onClick={resetForm}>
              <I.packagePlus size={16} /> ثبت مرجوعی جدید
            </Button>
            <Button size="lg" variant="ghost" className="touch-target" onClick={() => go('crm/history')}>
              <I.history size={16} /> تاریخچه
            </Button>
          </div>
        </div>

        <ReceiptDialog open={printOpen} onOpenChange={setPrintOpen} created={created} cashierName={user?.fullName || created.cashier?.fullName || ''} initialMode={printMode} />
      </div>
    )
  }

  /* ───── فرم اصلی — چیدمان سه‌ستونهٔ اصلی (اطلاعات مشتری کنار فرم) ───── */
  return (
    <div className="max-w-5xl space-y-4">
      {/* راهنمای اسکن */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <I.scan className="w-5 h-5 text-primary" size={20} />
        <span className="font-bold">بارکد کالا را اسکن یا تایپ کنید و Enter بزنید</span>
        <span className="text-muted-foreground hidden sm:inline">— برای کالای بدون بارکد، نام را تایپ کرده و به‌صورت دستی اضافه کنید</span>
      </div>

      {/* بنر بازیابی پیش‌نویس */}
      {draftRestored ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
          <span className="flex items-center gap-2 text-sm font-bold text-primary">
            <I.save size={16} /> پیش‌نویس ذخیره‌شده پیدا شد ({fa(draftRestored.items.length)} قلم)
          </span>
          <span className="flex items-center gap-2">
            <Button size="sm" onClick={() => restoreDraft(draftRestored)} className="gap-1.5"><I.refresh size={13} /> بازیابی پیش‌نویس</Button>
            <Button size="sm" variant="ghost" onClick={discardDraft} className="text-destructive">دور انداختن</Button>
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3 items-start">
        {/* ═══ ستون اصلی: اقلام مرجوعی ═══ */}
        <section className="rounded-xl border bg-card p-4 gap-4 flex flex-col lg:col-span-2" aria-label="اقلام مرجوعی">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold flex items-center gap-2">
              <I.package className="w-4 h-4 text-primary" size={16} /> اقلام مرجوعی
              <span className="num text-muted-foreground text-sm">({fa(items.length)} قلم)</span>
            </h2>
            {items.length > 0 ? (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setItems([])}>پاک‌کردن فهرست</Button>
            ) : null}
          </div>

          {/* جستجو / اسکن */}
          <div className="relative">
            <form
              onSubmit={(e: any) => { e.preventDefault(); void doSearch() }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <I.scan className="absolute start-3 top-1/2 w-4 h-4 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  ref={searchRef}
                  autoFocus
                  value={search}
                  onChange={(e: any) => { setSearch(e.target.value); setShowResults(false) }}
                  placeholder="بارکد یا نام کالا…"
                  className="ps-9 num h-11 text-base"
                  dir="ltr"
                />
              </div>
              <Button type="submit" disabled={searching || !search.trim()} className="touch-target px-5">
                {searching ? <I.loader size={15} className="animate-spin" /> : 'جستجو'}
              </Button>
              <Button type="button" variant="outline" className="touch-target" onClick={addManual} title="افزودن دستی">
                <I.packagePlus className="w-4 h-4" size={16} />
                <span className="hidden sm:inline">دستی</span>
              </Button>
            </form>
            {showResults && results.length > 0 ? (
              <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg">
                {results.map((p) => (
                  <button
                    key={p.id} type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-right text-xs hover:bg-emerald-50"
                    onMouseDown={(e: any) => e.preventDefault()}
                    onClick={() => addProduct(p)}
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="shrink-0 text-stone-400" dir="ltr">
                      {p.sellPrice ? `${money(p.sellPrice)} ریال` : ''} {p.unit ? `· ${p.unit}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {showResults && results.length === 0 && search.trim() ? (
              <div className="absolute z-50 mt-1 w-full rounded-lg border border-stone-200 bg-white p-2 shadow-lg">
                <p className="mb-1 px-1 text-[11px] text-stone-500">کالایی یافت نشد — «جستجو» را بزنید یا دستی اضافه کنید.</p>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addManual}>
                  <I.plus size={12} /> افزودن دستی «{search.trim()}»
                </Button>
              </div>
            ) : null}
          </div>

          {/* اقلام */}
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              هنوز کالایی اضافه نشده است. بارکد را اسکن کنید یا نامش را بنویسید.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.key} className="grid grid-cols-2 md:grid-cols-12 gap-x-3 gap-y-2 items-center rounded-xl border bg-muted/30 p-3">
                  <div className="col-span-2 md:col-span-4 min-w-0">
                    <p className="truncate text-sm font-bold">{it.name}</p>
                    <p className="num text-[11px] text-muted-foreground">
                      {toFaDigits(it.unit)}
                      {it.barcode ? <span dir="ltr"> · {it.barcode}</span> : null}
                      {it.manual ? ' · دستی' : ''}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-[10px] text-muted-foreground">
                      مقدار {WEIGHT_UNITS.includes(it.unit) ? <span className="text-emerald-600">(اعشاری مجاز)</span> : ''}
                    </label>
                    <NumInput
                      className="h-9 text-sm"
                      unit={it.unit}
                      decimals={WEIGHT_UNITS.includes(it.unit) ? 3 : 0}
                      value={it.qty}
                      onChange={(v: string) => updateItem(it.key, { qty: v })}
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="mb-1 block text-[10px] text-muted-foreground">فی (ریال)</label>
                    <MoneyInput
                      className="h-9 text-sm"
                      value={it.unitPrice}
                      placeholder="فی هر واحد"
                      onChange={(v: string) => updateItem(it.key, { unitPrice: v })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-[10px] text-muted-foreground">جمع</label>
                    <p className="num text-sm font-extrabold" dir="ltr">{money(num(it.qty) * num(it.unitPrice))}</p>
                  </div>
                  <div className="md:col-span-1 flex justify-center">
                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => removeItem(it.key)} aria-label={`حذف ${it.name}`}>
                      <I.trash size={15} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* جمع کل */}
          <div className="flex items-center justify-between rounded-xl bg-muted/60 p-3">
            <span className="text-sm text-muted-foreground">جمع کل اقلام</span>
            <span className="num font-extrabold text-lg text-emerald-700" dir="ltr">
              {money(total)} <span className="text-xs font-normal text-muted-foreground">ریال</span>
            </span>
          </div>
        </section>

        {/* ═══ ستون کنار: اطلاعات مشتری + علت مرجوعی ═══ */}
        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-4 gap-4 flex flex-col" aria-label="اطلاعات مشتری">
            <h2 className="font-bold flex items-center gap-2">
              <I.creditCard className="w-4 h-4 text-primary" size={16} /> مشتری
            </h2>

            <div className="space-y-1.5">
              <label htmlFor="c-name" className="text-sm">
                نام و نام خانوادگی <span className="text-destructive">*</span>
              </label>
              <Input id="c-name" value={customerName} onChange={(e: any) => setCustomerName(e.target.value)} placeholder="مثلاً: مریم احمدی" className="touch-target" />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="c-phone" className="text-sm">
                موبایل <span className="text-destructive">*</span>
              </label>
              <div className="flex gap-2">
                <Input
                  id="c-phone"
                  dir="ltr"
                  inputMode="numeric"
                  className="num text-end touch-target"
                  value={phone}
                  onChange={(e: any) => { setPhone(toEnDigits(e.target.value).replace(/\D/g, '').slice(0, 11)); setLookup((l) => ({ ...l, fresh: false })) }}
                  onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); void lookupCustomer() } }}
                  placeholder="09123456789"
                />
                <Button type="button" variant="outline" data-tour="history-query" className="shrink-0 gap-1 touch-target" disabled={lookup.loading} onClick={() => void lookupCustomer()}>
                  {lookup.loading ? <I.loader size={14} className="animate-spin" /> : <I.history size={14} />} استعلام
                </Button>
              </div>
              {phone.length > 0 ? (
                <p className={`text-xs ${phoneOk ? 'text-emerald-600' : 'text-destructive'}`}>
                  {phoneOk ? '✓ شماره معتبر است' : 'شماره موبایل معتبر نیست (۰۹xxxxxxxxx)'}
                </p>
              ) : null}
            </div>

            {/* سابقهٔ مشتری — یک ردیف فشرده + دیالوگ کامل (بدون فهرست داخل فرم) */}
            {lookup.loading ? (
              <div className="rounded-xl border bg-muted/40 p-3 text-center text-xs text-muted-foreground">
                <I.loader size={14} className="ml-1 inline animate-spin" /> در حال استعلام سابقهٔ مشتری…
              </div>
            ) : lookup.data && lookup.fresh ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 p-2.5">
                <span className="flex items-center gap-1.5 text-xs font-bold text-teal-800">
                  <I.history size={14} /> این مشتری سابقه دارد: {fa(lookup.data.customer.count)} مرجوعی
                </span>
                {lookup.data.customer.pendingCount > 0 ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                    {fa(lookup.data.customer.pendingCount)} در انتظار تأیید
                  </span>
                ) : null}
                <Button
                  type="button" size="sm" variant="outline"
                  className="ms-auto h-7 gap-1.5 border-teal-200 bg-white px-2.5 text-xs font-bold text-teal-800 hover:bg-emerald-50 hover:text-teal-900"
                  onClick={() => setHistOpen(true)}
                >
                  <I.eye size={13} /> نمایش سابقه
                </Button>
              </div>
            ) : lookup.fresh && !lookup.data ? (
              <div className="rounded-xl border bg-muted/40 p-2.5 text-center text-[11px] text-muted-foreground">مشتری جدید — سابقهٔ مرجوعی ثبت‌شده‌ای ندارد</div>
            ) : null}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="c-card" className="text-sm">شماره کارت (برای واریز)</label>
                {cardDisabled ? (
                  <Badge variant="outline" className="border-stone-300 bg-stone-100 text-[10px] font-bold text-stone-500">غیرفعال — تسویه با کالا</Badge>
                ) : null}
              </div>
              <div className="relative">
                <Input
                  id="c-card"
                  dir="ltr"
                  inputMode="numeric"
                  className="num text-end touch-target"
                  value={cardNumber}
                  disabled={cardDisabled}
                  onChange={(e: any) => {
                    const d = toEnDigits(e.target.value).replace(/\D/g, '').slice(0, 16)
                    setCardNumber(d.replace(/(\d{4})(?=\d)/g, '$1-'))
                  }}
                  placeholder="6037-99xx-xxxx-1234"
                />
                {/* نشان زندهٔ بانک — از ارقام اول، بدون انتظار برای کامل‌شدن کارت */}
                {!cardDisabled ? (() => {
                  const live = detectBankLive(cardDigits)
                  if (!live) return null
                  return (
                    <span className={cn('absolute top-1/2 left-2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold', live.cls)}>
                      <I.creditCard size={11} /> {live.name}
                    </span>
                  )
                })() : null}
              </div>
              {cardDisabled ? (
                <p className="rounded-lg bg-yellow-500/10 px-2.5 py-1.5 text-xs font-medium leading-5 text-yellow-800">
                  کالای جایگزین کل مبلغ مرجوعی را پوشش می‌دهد — واریزی به کارت انجام نمی‌شود و کارت بانکی لازم نیست
                </p>
              ) : cardDigits.length > 0 ? (() => {
                const live = detectBankLive(cardDigits)
                return (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className={`num text-xs ${cardDigits.length < 16 || cardOk ? 'text-emerald-600' : 'text-destructive'}`}>
                      {cardDigits.length < 16
                        ? `${toFaDigits(cardDigits.length)} از ۱۶ رقم${live ? ' — ' : ''}`
                        : cardOk
                          ? `✓ معتبر — ${bankName ?? 'بانک نامشخص'}`
                          : 'شماره کارت معتبر نیست (لان)'}
                    </p>
                    {live && cardDigits.length < 16 && (
                      <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold', live.cls)}>
                        <I.creditCard size={11} /> {live.name}
                      </span>
                    )}
                  </div>
                )
              })() : transferAmount > 0 ? (
                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                  <I.alertTriangle size={13} className="shrink-0" /> برای بازگشت وجه به مشتری، شماره کارت بانکی الزامی است
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="c-purchase" className="text-sm">
                تاریخ خرید (شمسی) <span className="text-destructive">*</span>
              </label>
              <div className="flex gap-2">
                <Input
                  id="c-purchase"
                  dir="ltr"
                  className="num text-end touch-target"
                  value={toFaDigits(purchaseAt)}
                  onChange={(e: any) => setPurchaseAt(toEnDigits(e.target.value).replace(/[^\d-]/g, '').slice(0, 10))}
                  placeholder="۱۴۰۵-۰۷-۲۷"
                />
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setPurchaseAt(todayJalali())}>امروز</Button>
              </div>
              {purchaseAt && !purchaseOk ? <p className="text-xs text-destructive">تاریخ معتبر نیست</p> : null}
            </div>
          </section>

          {/* علت مرجوعی */}
          <section className="rounded-xl border bg-card p-4 gap-4 flex flex-col" aria-label="علت مرجوعی">
            <h2 className="font-bold">علت مرجوعی</h2>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="w-full touch-target">
                <SelectValue placeholder="انتخاب علت…" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r} className="touch-target">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="c-note" className="text-sm">توضیحات (اختیاری)</label>
                <span className="num text-xs text-muted-foreground">{toFaDigits(note.length)}/۵۰۰</span>
              </div>
              <Textarea id="c-note" value={note} onChange={(e: any) => setNote(e.target.value.slice(0, 500))} rows={3} placeholder="جزئیات بیشتر…" />
            </div>
          </section>
        </div>
      </div>

      {/* ═══ تسویه — عرض کامل زیر فرم ═══ */}
      <section className="rounded-xl border bg-card p-4 gap-4 flex flex-col" aria-label="تسویه">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold flex items-center gap-2">
            <I.wallet className="w-4 h-4 text-primary" size={16} /> تسویه
          </h2>
          <Badge variant="secondary" className={cn('text-[11px] font-bold', SETTLE_META[settleType].badge)}>
            {SETTLE_META[settleType].label}
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-muted/60 p-4 flex flex-col justify-center">
            <p className="text-xs text-muted-foreground mb-1">مبلغ کل مرجوعی (خودکار)</p>
            <p className="num font-extrabold text-xl" dir="ltr">
              {money(total)} <span className="text-xs font-normal">ریال</span>
            </p>
            <p className="num text-xs text-muted-foreground mt-1">معادل {toman(total)} تومان</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm">ارزش کالای جایگزین دریافتی مشتری</label>
            <Input
              dir="ltr" inputMode="numeric" className="num text-end touch-target"
              value={exchangeValue || ''}
              onChange={(e: any) => setExchangeValue(Math.max(0, Math.round(num(toEnDigits(e.target.value).replace(/[^\d.]/g, '')))))}
              placeholder="۰"
            />
            <p className="text-xs text-muted-foreground">اگر مشتری به‌جای پول، کالای جایگزین برد، ارزش آن را وارد کنید.</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm">پرداخت به کارت مشتری</label>
              {transferManual ? (
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => { setTransferManual(false); toast.info('همگام‌سازی خودکار فعال شد') }}>
                  همگام‌سازی خودکار
                </button>
              ) : (
                <Badge variant="secondary" className="text-[10px]">خودکار</Badge>
              )}
            </div>
            <Input
              dir="ltr" inputMode="numeric" className="num text-end touch-target"
              value={transferAmount || ''}
              onChange={(e: any) => { setTransferManual(true); setTransferAmount(Math.max(0, Math.round(num(toEnDigits(e.target.value).replace(/[^\d.]/g, ''))))) }}
              placeholder="۰"
            />
            <p className="text-xs text-muted-foreground">
              {transferManual ? 'به‌صورت دستی تنظیم شده' : 'به‌طور خودکار = مبلغ کل − کالای جایگزین'}
            </p>
          </div>
        </div>

        {/* جعبهٔ وضعیت تسویه */}
        <div className={cn('rounded-xl border p-4 space-y-3', SETTLE_META[settleType].box)}>
          {settleType === 'full' ? (
            exchangeValue > 0 ? (
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                <I.check size={16} /> {money(transferAmount)} ریال پس از تأیید مدیریت به کارت مشتری واریز می‌شود و {money(exchangeValue)} ریال با کالای جایگزین تسویه شده است — شماره کارت الزامی است.
              </p>
            ) : (
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                <I.check size={16} /> کل مبلغ ({money(total)} ریال) پس از تأیید مدیریت به کارت مشتری واریز می‌شود.
              </p>
            )
          ) : settleType === 'exchange' ? (
            <p className="flex items-center gap-2 text-sm font-bold text-yellow-700">
              <I.refresh size={16} /> تسویه کامل با کالای جایگزین — وجهی به کارت واریز نمی‌شود.
            </p>
          ) : settleType === 'partial' ? (
            <p className="flex items-center gap-2 text-sm font-bold text-amber-700">
              <I.alertTriangle size={16} /> ماندهٔ تسویه‌نشده: <span className="num" dir="ltr">{money(remaining)} ریال</span> — توضیح تسویه الزامی است.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm font-bold text-destructive">
              <I.alertTriangle size={16} /> ارزش کالای جایگزین از مبلغ کل بیشتر است — <span className="num" dir="ltr">{money(exchangeValue - total)} ریال</span> بدهی مشتری می‌شود.
            </p>
          )}
          <div className="space-y-1.5">
            <label className="text-sm">توضیح تسویه {(settleType === 'partial' || settleType === 'debt') ? <span className="text-destructive">*</span> : <span className="text-xs text-muted-foreground">(اختیاری)</span>}</label>
            <Textarea
              rows={2}
              value={transferNote}
              onChange={(e: any) => setTransferNote(e.target.value.slice(0, 300))}
              placeholder={settleType === 'debt' ? 'مثلاً: باقی‌مانده در خرید بعدی تسویه می‌شود…' : 'مثلاً: نیمی از مبلغ نقدی داده شد…'}
            />
          </div>
        </div>

        {/* ثبت */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <p className="text-[11px] leading-5 text-muted-foreground">
            میان‌بر ثبت سریع: <kbd className="rounded border bg-muted px-1.5 py-0.5 num" dir="ltr">Ctrl + Enter</kbd>
            <br />
            پس از ثبت، مرجوعی‌های وجه‌دار در انتظار تأیید مدیریت قرار می‌گیرند.
          </p>
          <Button size="lg" data-tour="submit-return" disabled={submitting} className="touch-target gap-2 text-base font-extrabold" onClick={() => void submit()}>
            {submitting ? <I.loader size={18} className="animate-spin" /> : <I.send size={18} />}
            ثبت و ارسال به مدیریت
          </Button>
        </div>
      </section>

      {/* دیالوگ سابقهٔ کامل مرجوعی مشتری */}
      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <I.history size={18} /> سابقهٔ مرجوعی مشتری
            </DialogTitle>
            <DialogDescription className="num">
              {lookup.data?.customer?.name || customerName || 'مشتری'} — {toFaDigits(normalizeMobile(phone))}
            </DialogDescription>
          </DialogHeader>

          {lookup.loading ? (
            <div className="max-h-[70vh] space-y-2 overflow-y-auto">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-2 rounded-lg border border-stone-200 bg-white p-3">
                  <div className="h-3.5 w-2/3 animate-pulse rounded bg-stone-200" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-stone-100" />
                  <div className="h-3 w-5/6 animate-pulse rounded bg-stone-100" />
                </div>
              ))}
            </div>
          ) : Array.isArray(lookup.data?.returns) && lookup.data.returns.length > 0 ? (() => {
            const rows = [...lookup.data.returns].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            return (
              <div className="max-h-[70vh] space-y-2 overflow-y-auto pl-1">
                {rows.map((rv: any) => {
                  const st = STATUS_LABEL[rv.status] || { label: rv.status, cls: 'bg-stone-100 text-stone-600' }
                  const se = HIST_SETTLE[rv.settlementType] || HIST_SETTLE.partial
                  return (
                    <div key={rv.id} className="space-y-1.5 rounded-lg border border-stone-200 bg-white p-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs font-bold" dir="ltr">{toFaDigits(rv.code)}</span>
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', se.cls)}>{se.label}</span>
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', st.cls)}>{st.label}</span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-stone-500">
                        <span className="num">{toFaDigits(formatJalali(new Date(rv.createdAt)))} · {rv.reason ?? '—'}</span>
                        <span>صندوقدار: {rv.cashierName ?? '—'}</span>
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-1.5 border-t border-dashed border-stone-200 pt-1.5">
                        <span className="num text-sm font-extrabold text-stone-800" dir="ltr">
                          {money(rv.totalAmount)} <span className="text-[10px] font-normal text-stone-500">ریال</span>
                        </span>
                        <span className="num text-[10px] text-stone-400">معادل {toman(rv.totalAmount)} تومان</span>
                      </div>
                      {Number(rv.transferAmount) > 0 ? (
                        <p className="num text-[11px] font-bold text-emerald-700">واریز به کارت: {money(rv.transferAmount)} ریال</p>
                      ) : null}
                      {Array.isArray(rv.items) && rv.items.length > 0 ? (
                        <div className="rounded-md bg-stone-50 p-1.5 text-[10px] leading-5 text-stone-600">
                          {rv.items.map((it: any, i: number) => (
                            <div key={i} className="flex items-center justify-between gap-1">
                              <span className="truncate">{it.name} ×{fmtQty(Number(it.qty ?? 0))}</span>
                              <span className="num shrink-0" dir="ltr">{money(it.lineTotal ?? 0)}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )
          })() : (
            <p className="py-8 text-center text-sm text-stone-400">سابقه‌ای ثبت نشده</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setHistOpen(false)}>بستن</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
