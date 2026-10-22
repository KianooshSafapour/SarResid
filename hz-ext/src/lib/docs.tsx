/**
 * hz-ext/src/lib/docs.tsx — کتابخانهٔ اسناد چاپی رسمی «هایپر زیتون» (SarResid / سررسید)
 * ─────────────────────────────────────────────────────────────────────────────
 * docHTML(kind, data) → سند HTML کامل و مستقل (RTL، وزیرمتن از /fonts) آمادهٔ
 * چاپ/ذخیرهٔ PDF از طریق printDoc/printHTML (iframe مخفی + @page).
 *
 * خودکفا (Self-contained): این فایل «هیچ» وابستگی به ./hz ندارد تا در Node هم
 * اجرا شود (سازنده‌های سند هرگز document/window نمی‌گیرند؛ فقط printDoc سمت
 * مرورگر است). موتور جلالی، حروف‌خوانی مبالغ و چاپگر، پورتِ وفادارِ
 * ماژول‌های زندهٔ برنامه است (956657 + lib/ui.tsx) — خروجی هم‌قالب برنامه.
 * DocPreview تنها جای استفاده از پل hz است: jsx از 'hz:jsx' (بدون سینتکس JSX
 * تا باندل مستقل با ‎--external:hz:*‎ ممکن بماند).
 *
 * انواع سند: return | return-thermal | order | cheque | handover |
 *            performance | problems | stockcount | contract | payslip
 */
import { jsx } from 'hz:jsx'

/* ══════════════════════════════════════════════════════════════════
 * ۱) موتور جلالی — پورت دقیق ماژول زندهٔ 956657 (فرمت‌ها یکسان با برنامه)
 * ══════════════════════════════════════════════════════════════════ */

const J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
/** نام روز هفته بر اساس Date.getDay() (یکشنبه=۰ … شنبه=۶) */
const WEEKDAY_JS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']

function div(a: number, b: number): number { return Math.trunc(a / b) }

/** تقویم جلالی (jalCal) — الگوریتم exact مطابق jalaali-js/ماژول زنده */
function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]
  let n = 0, o = -14, i = breaks[0]
  for (let k = 1; k < breaks.length; k++) {
    const a = breaks[k]
    n = a - i
    if (jy < a) break
    o += 8 * div(n, 33) + div(n % 33, 4)
    i = a
  }
  let l = jy - i
  o += 8 * div(l, 33) + div(l % 33 + 3, 4)
  if (n % 33 === 4 && n - l === 4) o += 1
  const march = 20 + o - (div(jy + 621, 4) - div(jy + 621, 100) + div(jy + 621, 400) - 150)
  if (n - l < 6) l = l - n + 33 * div(n + 4, 33)
  let s = ((l + 1) % 33 - 1) % 4
  if (s === -1) s = 4
  return { leap: s, gy: jy + 621, march }
}

/** میلادی → شمارهٔ روز جلالی-ستاره‌ای (g2d) */
function g2d(gy: number, gm: number, gd: number): number {
  const d0 = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(((gm + 9) % 12) * 153 + 2, 5) + gd - 0x2139f58
  return d0 - div(3 * div(gy + 100100 + div(gm - 8, 6), 100), 4) + 752
}

/** شمارهٔ روز → میلادی (d2g) */
function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  const r0 = 4 * jdn + 0x84e7d5f
  const r = r0 + 4 * div(3 * div(4 * jdn + 0xaeb3908, 146097), 4) - 3908
  const n = 5 * div((r % 1461) / 4, 1) + 308
  const gd = div(n % 153, 5) + 1
  const gm = (div(n, 153) % 12) + 1
  const gy = div(r, 1461) - 100100 + div(8 - gm, 6)
  return { gy, gm, gd }
}

/** (jy, jm, jd) → Date میلادی */
function jalaliToDate(jy: number, jm: number, jd: number): Date {
  const r = jalCal(jy)
  const jdn = g2d(jy + 621, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
  const g = d2g(jdn)
  return new Date(g.gy, g.gm - 1, g.gd)
}

/** Date → {jy, jm, jd} */
function jalaliOf(date: Date): { jy: number; jm: number; jd: number } {
  const gy = date.getFullYear()
  const jdn = g2d(gy, date.getMonth() + 1, date.getDate())
  let jy = gy - 621
  const r = jalCal(jy)
  let s = jdn - g2d(gy, 3, r.march)
  if (s >= 0) {
    if (s <= 185) return { jy, jm: 1 + div(s, 31), jd: (s % 31) + 1 }
    s -= 186
  } else {
    jy -= 1
    s += 179
    if (r.leap === 1) s += 1
  }
  return { jy, jm: 7 + div(s, 30), jd: (s % 30) + 1 }
}

/** رشتهٔ تاریخ جلالی/میلادی-ISO → Date (ناسازگار → null) */
function resolveDate(s?: string | null): Date | null {
  if (!s) return null
  const v = String(s).trim()
  if (/^\d{4}-\d{2}-\d{2}T/.test(v) || /^\d{4}-\d{2}-\d{2} \d{2}:/.test(v)) {
    const d = new Date(v)
    return isNaN(+d) ? null : d
  }
  const en = toEn(v).replace(/[/]/g, '-')
  const m = en.match(/^(\d{3,4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return null
  const jy = parseInt(m[1], 10), jm = parseInt(m[2], 10), jd = parseInt(m[3], 10)
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null
  return jalaliToDate(jy, jm, jd)
}

function pad2(n: number): string { return n < 10 ? '0' + n : String(n) }

/** «۲۷ مهر ۱۴۰۵» — از Date */
function jalaliLong(date: Date): string {
  const j = jalaliOf(date)
  return toFa(`${j.jd} ${J_MONTHS[j.jm - 1]} ${j.jy}`)
}

/** ۱۴۰۵-۰۷-۲۷ → ۱۴۰۵/۰۷/۲۷ (ارقام فارسی + خط مورب — سبک R4) */
function faSlash(s?: string | null): string {
  if (!s) return ''
  return toFa(String(s).replace(/-/g, '/'))
}

/** «۱۴۰۵-۰۷-۲۷» — از Date */
function jalaliDash(date: Date): string {
  const j = jalaliOf(date)
  return `${j.jy}-${pad2(j.jm)}-${pad2(j.jd)}`
}

/** نام روز هفته از رشتهٔ تاریخ جلالی */
function weekdayOf(s?: string | null): string {
  const d = resolveDate(s)
  return d ? WEEKDAY_JS[d.getDay()] : ''
}

/** مقایسهٔ دو تاریخ جلالی (a < b → منفی) */
function cmpJalali(a?: string | null, b?: string | null): number {
  const da = resolveDate(a), db = resolveDate(b)
  const ta = da ? +da : 0, tb = db ? +db : 0
  return ta - tb
}

/* ══════════════════════════════════════════════════════════════════
 * ۲) ارقام، پول و حروف‌خوانی (هم‌قالب lib/ui.tsx)
 * ══════════════════════════════════════════════════════════════════ */

function toFa(s: number | string | null | undefined): string {
  if (s === null || s === undefined || s === '') return ''
  return String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
}
function toEn(s: string): string {
  return String(s).replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
}
/** پول به ریال با جداکنندهٔ هزارگان (ارقام فارسی) */
function money(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(+n)) return '۰'
  return toFa(Math.round(+n).toLocaleString('en-US'))
}
/** عدد صحیح/اعشاری فارسی (حداکثر یک رقم اعشار) */
function faNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(+n)) return '—'
  const v = +n
  const s = Math.abs(v % 1) < 0.05 ? String(Math.round(v)) : v.toFixed(1)
  return toFa(s.replace('.', '٫'))
}
/** درصد فارسی: ۳۵٪ */
function faPct(n: number): string { return toFa(String(Math.round(n * 100))) + '٪' }

const YEKAN = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه']
const DAHYEK = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده']
const DAHGAN = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود']
const SADGAN = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد']
const SCALE = ['', 'هزار', 'میلیون', 'میلیارد', 'هزار میلیارد']

function threeDigitToWords(n: number): string {
  const parts: string[] = []
  const s = Math.floor(n / 100)
  const rest = n % 100
  if (s > 0) parts.push(SADGAN[s])
  if (rest >= 10 && rest < 20) parts.push(DAHYEK[rest - 10])
  else {
    const d = Math.floor(rest / 10)
    const y = rest % 10
    if (d > 0) parts.push(DAHGAN[d])
    if (y > 0) parts.push(YEKAN[y])
  }
  return parts.join(' و ')
}

function numberToPersianWords(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'صفر'
  if (n >= 1e15) return 'عدد بسیار بزرگ'
  const groups: number[] = []
  let x = n
  while (x > 0) { groups.push(x % 1000); x = Math.floor(x / 1000) }
  const parts: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    if (g === 0) continue
    parts.push(`${threeDigitToWords(g)}${SCALE[i] ? ' ' + SCALE[i] : ''}`)
  }
  return parts.join(' و ')
}

/** حروف‌خوانی مبلغ در دو سطر: ریال + معادل تومان (منطبق بر lib/ui.tsx) */
function amountWords(amount: number): { rial: string; toman: string } {
  const a = Math.max(0, Math.round(+amount || 0))
  const rial = `${numberToPersianWords(a)} ریال`
  const tomans = Math.floor(a / 10)
  const rem = a % 10
  const toman = rem === 0
    ? `${numberToPersianWords(tomans)} تومان`
    : `${numberToPersianWords(tomans)} تومان و ${numberToPersianWords(rem)} ریال`
  return { rial, toman }
}

/** فرار HTML برای متن‌های کاربر */
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
/** مقدار ناموجود */
const NA = '<span class="na">—</span>'
function orNA(v: string | null | undefined): string { return (v === null || v === undefined || v === '') ? NA : esc(v) }

/** شمارهٔ کارت ۱۶ رقمی → ۶۲۱۸-****-****-۱۲۳۴ (فارسی) */
function maskCard(card?: string | null): string {
  if (!card) return ''
  const d = String(card).replace(/\D/g, '')
  if (d.length === 16) return toFa(`${d.slice(0, 4)}-****-****-${d.slice(12)}`)
  return toFa(String(card))
}

/** ساعت جاری HH:MM فارسی */
function nowHM(): string { const d = new Date(); return toFa(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`) }

/* ══════════════════════════════════════════════════════════════════
 * ۳) ثابت‌ها و برچسب‌ها (هم‌واژه با نماها)
 * ══════════════════════════════════════════════════════════════════ */

export type DocKind =
  | 'return' | 'return-thermal' | 'order' | 'cheque'
  | 'handover' | 'performance' | 'problems' | 'stockcount'
  | 'contract' | 'payslip'

export const DOC_TITLES: Record<DocKind, string> = {
  'return': 'رسید مرجوعی کالا',
  'return-thermal': 'رسید مرجوعی (نسخهٔ حرارتی)',
  'order': 'سفارش خرید کالا',
  'cheque': 'اطلاع‌نامهٔ چک',
  'handover': 'گزارش تحویل شیفت',
  'performance': 'کارنامهٔ عملکرد',
  'problems': 'فهرست مشکلات',
  'stockcount': 'گزارش انبارگردانی',
  'contract': 'قرارداد کار',
  'payslip': 'رسید حقوق',
}

/** انواع قرارداد کار (R4-6) */
const CONTRACT_TYPE_LABEL: Record<string, string> = {
  FULL_TIME: 'تمام‌وقت',
  PART_TIME: 'پاره‌وقت',
  CONTRACT: 'قراردادی',
}

const STORE = {
  name: 'هایپر زیتون',
  sub: 'فروشگاه زنجیره‌ای — رفسنجان',
  addr: 'نشانی: رفسنجان، بلوار ... — تلفن: ۰۳۴-۳۳ ...',
}

const SETTLE_LABEL: Record<string, string> = {
  full: 'بازگشت کامل وجه', exchange: 'تسویه با کالای جایگزین',
  partial: 'تسویه جزئی (دارای مانده)', debt: 'بدهی مشتری',
  transfer: 'بازگشت کامل وجه', both: 'تسویه جزئی (دارای مانده)',
}
const RETURN_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: 'پیش‌نویس', tone: 'stone' },
  pending: { label: 'در انتظار تأیید', tone: 'amber' },
  approved: { label: 'تأییدشده', tone: 'teal' },
  paid: { label: 'پرداخت‌شده', tone: 'emerald' },
}
const PAY_LABEL: Record<string, string> = { CASH: 'نقدی', CHEQUE: 'چک', POS: 'کارتخوان (POS)' }
const ORDER_STATUS: Record<string, string> = {
  DRAFT: 'پیش‌نویس', SUBMITTED: 'در انتظار تأیید', APPROVED: 'تأییدشده (آمادهٔ دریافت)',
  RECEIVING: 'در حال دریافت', RECEIVED: 'دریافت‌شده', VERIFIED: 'راستی‌آزمایی‌شده',
  ACCOUNTED: 'ثبت‌شده در حسابداری', DONE: 'تکمیل‌شده', CANCELLED: 'لغوشده',
}
const CHEQUE_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING_OWNER: { label: 'در انتظار امضا', tone: 'amber' },
  WRITTEN: { label: 'نوشته‌شده', tone: 'stone' },
  SIGNED: { label: 'امضاشده', tone: 'teal' },
  READY: { label: 'آمادهٔ تحویل', tone: 'teal' },
  COLLECTED: { label: 'تحویل‌شده', tone: 'stone' },
  DONE: { label: 'پرداخت‌شده', tone: 'emerald' },
  REJECTED: { label: 'ردشده', tone: 'rose' },
  UNCOLLECTED: { label: 'وصول‌نشده', tone: 'rose' },
}
const CATEGORY_LABEL: Record<string, string> = {
  equipment: 'تجهیزات', it: 'فناوری', supply: 'تأمین', cleaning: 'نظافت', product: 'کالا',
  staff: 'پرسنل', customer: 'مشتری', security: 'امنیت', other: 'سایر',
}
const SEVERITY_LABEL: Record<string, { label: string; cls: string }> = {
  urgent: { label: 'فوری', cls: 'sev-urgent' },
  high: { label: 'زیاد', cls: 'sev-high' },
  normal: { label: 'معمولی', cls: 'sev-normal' },
  low: { label: 'کم', cls: 'sev-low' },
}
const PROBLEM_STATUS: Record<string, { label: string; tone: string }> = {
  OPEN: { label: 'باز', tone: 'rose' },
  IN_PROGRESS: { label: 'در حال بررسی', tone: 'amber' },
  RESOLVED: { label: 'حل‌شده', tone: 'emerald' },
}
const SHIFT_LABEL: Record<string, string> = { MORNING: 'شیفت صبح', EVENING: 'شیفت عصر' }
const GRADE_LABEL: Record<string, { label: string; tone: string }> = {
  A: { label: 'الف', tone: 'emerald' }, B: { label: 'ب', tone: 'teal' },
  C: { label: 'ج', tone: 'amber' }, D: { label: 'د', tone: 'rose' },
}
const COUNT_STATUS: Record<string, { label: string; tone: string }> = {
  SCHEDULED: { label: 'زمان‌بندی‌شده', tone: 'stone' },
  IN_PROGRESS: { label: 'در حال شمارش', tone: 'amber' },
  DONE: { label: 'انجام‌شده', tone: 'emerald' },
  MISMATCH: { label: 'دارای مغایرت', tone: 'rose' },
}
/** معیارهای کارنامه — وزن‌های موتور /api/performance */
const PERF_CRITERIA: { key: string; label: string; weight: number }[] = [
  { key: 'task', label: 'انجام دستور کار', weight: 0.35 },
  { key: 'section', label: 'ارزیابی چیدمان و نظم بخش', weight: 0.25 },
  { key: 'checklist', label: 'چک‌لیست‌های روزانه', weight: 0.15 },
  { key: 'attendance', label: 'حضور و ساعت‌کاری', weight: 0.10 },
  { key: 'zoneCount', label: 'انبارگردانی و شمارش', weight: 0.10 },
  { key: 'extra', label: 'امتیاز دستی مدیر', weight: 0.05 },
]

/* ══════════════════════════════════════════════════════════════════
 * ۴) اسکلت سند: فونت، CSS مشترک، سربرگ، پابرگ، قطعات تکرارشونده
 * ══════════════════════════════════════════════════════════════════ */

const FONT_FACES = [
  [400, 'Regular'], [500, 'Medium'], [600, 'SemiBold'], [700, 'Bold'], [800, 'ExtraBold'],
].map(([w, n]) => `@font-face{font-family:'Vazirmatn';src:url(/fonts/Vazirmatn-${n}.woff2) format('woff2');font-weight:${w};font-display:swap}`).join('\n')

function baseCSS(thermal: boolean): string {
  const t = thermal ? `
.sheet{width:80mm;min-height:auto;padding:5mm 4.5mm;font-size:10px;line-height:1.75;border-radius:0}
.lh{flex-direction:column;align-items:center;text-align:center;gap:5px}
.lh-emblem{width:40px;height:40px;font-size:19px}
.lh-name{font-size:16px}
.lh-sub{font-size:9px}
.lh-doc{max-width:100%;text-align:center}
.doc-title{font-size:12px;margin-bottom:2px}
.doc-code{font-size:10.5px}
.rule{margin:5px 0 7px;height:2.5px}
.dash{border-top:1.5px dashed #a8a29e;margin:5px 0}
.sec-title{font-size:10.5px;margin:8px 0 5px}
.docfoot{margin-top:9px;font-size:7.8px}` : ''
  return `
${FONT_FACES}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0}
body{font-family:'Vazirmatn','Segoe UI',Tahoma,sans-serif;color:#292524;background:#f5f5f4;font-size:12.5px;line-height:1.85}
.sheet{position:relative;width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:11mm 12mm 13mm;overflow:hidden}
.doc{position:relative;z-index:1}
.na{color:#a8a29e}
/* سربرگ */
.lh{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}
.lh-brand{display:flex;align-items:center;gap:11px;min-width:0}
.lh-emblem{flex:none;width:54px;height:54px;border-radius:50%;background:linear-gradient(145deg,#ecfdf5,#d1fae5);border:2px solid #047857;display:flex;align-items:center;justify-content:center;font-size:27px}
.lh-name{font-size:22px;font-weight:800;color:#065f46;line-height:1.35}
.lh-sub{font-size:10.5px;font-weight:600;color:#57534e}
.lh-addr{font-size:8.8px;color:#78716c;margin-top:1px}
.lh-doc{text-align:left;flex:none;max-width:47%}
.doc-title{font-size:15.5px;font-weight:800;color:#1c1917;margin-bottom:4px}
.doc-code{direction:ltr;display:inline-block;font-family:ui-monospace,'Courier New',monospace;font-size:12px;font-weight:700;color:#047857;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;padding:1px 9px;letter-spacing:.4px}
.doc-meta{font-size:9.5px;color:#57534e;margin-top:5px;line-height:1.75}
.rule{height:3px;border-radius:2px;background:linear-gradient(to left,#065f46,#047857 45%,#14b8a6);margin:8px 0 11px}
/* واترمارک */
.wm{position:absolute;inset:0;z-index:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.wm-in{transform:rotate(-22deg);text-align:center;opacity:.045;color:#065f46;font-weight:800}
.wm-in .wm-olive{font-size:110px;line-height:1}
.wm-in .wm-text{font-size:58px;letter-spacing:10px;margin-top:2px}
/* بخش‌ها */
.sec-title{font-size:12.5px;font-weight:800;color:#065f46;border-right:3.5px solid #14b8a6;padding-right:9px;margin:12px 0 7px}
.box{border:1px solid #e7e5e4;border-radius:11px;padding:9px 12px;background:#fff}
.box.soft{background:#fafaf9}
.row2{display:flex;gap:10px;align-items:stretch;flex-wrap:wrap}
.row2>*{flex:1;min-width:220px}
/* جفت کلید-مقدار */
.kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(146px,1fr));gap:7px 14px}
.kv .k{font-size:9px;color:#78716c;margin-bottom:1px}
.kv .v{font-size:11.5px;font-weight:700;color:#292524;word-break:break-word}
.num{direction:ltr;text-align:left;font-variant-numeric:tabular-nums;unicode-bidi:embed}
/* چیپ */
.chip{display:inline-flex;align-items:center;gap:4px;padding:2px 11px;border-radius:999px;font-size:10.5px;font-weight:700;border:1px solid transparent;white-space:nowrap}
.chip.emerald{background:#ecfdf5;color:#047857;border-color:#a7f3d0}
.chip.teal{background:#f0fdfa;color:#0f766e;border-color:#99f6e4}
.chip.amber{background:#fffbeb;color:#b45309;border-color:#fde68a}
.chip.rose{background:#fff1f2;color:#be123c;border-color:#fecdd3}
.chip.stone{background:#f5f5f4;color:#57534e;border-color:#e7e5e4}
/* جدول */
table.tbl{width:100%;border-collapse:collapse;font-size:10.8px}
.tbl th{background:#065f46;color:#fff;font-weight:700;padding:5px 8px;border:1px solid #0b7a5c;font-size:10.3px;white-space:nowrap}
.tbl td{border:1px solid #d6d3d1;padding:4.5px 8px;vertical-align:middle}
.tbl tbody tr:nth-child(even){background:#fafaf9}
.tbl .c{text-align:center}
.tbl .mono{font-family:ui-monospace,'Courier New',monospace;font-size:9.6px}
.tbl tfoot td{background:#ecfdf5;font-weight:800;border:1px solid #b9e6d2;color:#065f46}
.bad{color:#be123c;font-weight:800}
.good{color:#047857;font-weight:800}
.sev-urgent{color:#be123c;font-weight:800}
.sev-high{color:#b45309;font-weight:700}
.sev-normal{color:#57534e}
.sev-low{color:#a8a29e}
/* جمع‌ها */
.totwrap{display:flex;justify-content:flex-end;margin-top:10px}
.totbox{width:330px;border:1px solid #d6d3d1;border-radius:10px;overflow:hidden;background:#fff}
.totbox .trow{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 12px;border-bottom:1px solid #e7e5e4;font-size:11px}
.totbox .trow:last-child{border-bottom:0}
.totbox .lbl{color:#57534e}
.totbox .val{font-weight:700}
.totbox .grand{background:#ecfdf5;font-size:12.5px;font-weight:800;color:#065f46;padding:6px 12px}
.totbox .grand .lbl{color:#065f46}
/* حروف مبلغ */
.words{margin-top:8px;border:1px dashed #a7f3d0;background:#f6fefb;border-radius:10px;padding:7px 12px;font-size:11px}
.words .w1{font-weight:700;color:#065f46}
.words .w2{color:#57534e;font-size:9.8px;margin-top:1px}
.words.big .w1{font-size:15px;font-weight:800}
/* هایلایت مبلغ */
.hl{border:1.5px solid #a7f3d0;background:linear-gradient(180deg,#ecfdf5,#f6fefb);border-radius:11px;padding:9px 14px;margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.hl .hl-lbl{font-size:11.5px;font-weight:800;color:#065f46}
.hl .hl-amt{font-size:17px;font-weight:800;color:#065f46}
/* هشدارها */
.warn{border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:10px;padding:8px 12px;font-size:11px;font-weight:600;margin-top:10px}
.danger{border:1px solid #fecdd3;background:#fff1f2;color:#9f1239;border-radius:10px;padding:8px 12px;font-size:11px;font-weight:600;margin-top:10px}
.note{border:1px solid #e7e5e4;border-radius:10px;background:#fafaf9;padding:6px 11px;font-size:11px;color:#44403c;margin-top:8px;line-height:1.9}
/* کد پیگیری + مهری */
.stamp-row{display:flex;gap:10px;align-items:stretch;margin-top:10px;flex-wrap:wrap}
.tracking{flex:1;min-width:220px;border:1px solid #e7e5e4;border-radius:11px;padding:8px 13px;background:#fafaf9}
.tracking .t-label{font-size:9.5px;color:#78716c;font-weight:600}
.tracking .t-code{direction:ltr;text-align:left;font-family:ui-monospace,'Courier New',monospace;font-size:22px;font-weight:800;color:#1c1917;letter-spacing:1px;margin-top:2px}
.stampbox{flex:none;width:150px;border:1.6px dashed #a8a29e;border-radius:11px;display:flex;align-items:center;justify-content:center;color:#a8a29e;font-size:10px;font-weight:600;text-align:center;line-height:1.9;padding:8px}
/* شبکهٔ شاخص‌ها */
.mgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.mcell{border:1px solid #e7e5e4;border-radius:9px;padding:6px 11px;background:#fafaf9;display:flex;justify-content:space-between;align-items:center;gap:6px}
.mcell .ml{font-size:9.3px;color:#57534e}
.mcell .mv{font-size:14.5px;font-weight:800;color:#292524}
.mcell.warnv .mv{color:#be123c}
/* کارنامه */
.score-hero{display:flex;align-items:center;gap:16px;border:1.5px solid #a7f3d0;background:linear-gradient(180deg,#ecfdf5,#f6fefb);border-radius:12px;padding:12px 18px;margin-top:4px;flex-wrap:wrap}
.score-num{font-size:42px;font-weight:800;color:#065f46;line-height:1}
.score-sub{font-size:10.5px;color:#57534e}
.score-bar{flex:1;min-width:160px;height:9px;background:#e7e5e4;border-radius:999px;overflow:hidden}
.score-bar>div{height:100%;border-radius:999px;background:linear-gradient(to left,#065f46,#14b8a6)}
/* امضا */
.sigs{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
.sig{flex:1;min-width:150px;border:1.5px dashed #d6d3d1;border-radius:11px;min-height:76px;padding:8px 12px;position:relative}
.sig .s-label{font-size:10px;font-weight:800;color:#57534e}
.sig .s-name{font-size:11px;font-weight:600;color:#292524;margin-top:2px}
.sig .s-hint{position:absolute;bottom:6px;right:12px;left:12px;text-align:center;font-size:8.4px;color:#a8a29e}
/* پابرگ */
.docfoot{margin-top:12px;border-top:1px solid #e7e5e4;padding-top:6px;display:flex;justify-content:space-between;gap:10px;font-size:8.6px;color:#78716c;flex-wrap:wrap}
.pfoot{display:none}
.legend{display:flex;gap:8px;flex-wrap:wrap;margin-top:7px}
.legend .chip{font-size:9.6px}
@media print{
  .no-print{display:none}
  body{background:#fff}
  .sheet{margin:0;width:auto;min-height:auto;padding:12mm;border-radius:0}
  .pfoot{display:block;position:fixed;bottom:1.5mm;right:0;left:0;text-align:center;font-size:7.6px;color:#a8a29e}
}
@page{margin:12mm}${t}`
}

function chipHtml(text: string, tone: 'emerald' | 'teal' | 'amber' | 'rose' | 'stone' = 'stone'): string {
  return `<span class="chip ${tone}">${esc(text)}</span>`
}

function kvHtml(rows: { k: string; v: string; num?: boolean }[]): string {
  return `<div class="kv">${rows.map((r) => `<div><div class="k">${esc(r.k)}</div><div class="v${r.num ? ' num' : ''}">${r.v}</div></div>`).join('')}</div>`
}

function boxHtml(title: string | null, inner: string, soft?: boolean): string {
  return `<div class="box${soft ? ' soft' : ''}">${title ? `<div class="box-title">${esc(title)}</div>` : ''}${inner}</div>`
}

function totBoxHtml(rows: { label: string; value: string; grand?: boolean }[]): string {
  const normal = rows.filter((r) => !r.grand)
    .map((r) => `<div class="trow"><span class="lbl">${esc(r.label)}</span><span class="val">${r.value}</span></div>`).join('')
  const grand = rows.find((r) => r.grand)
  return `<div class="totwrap"><div class="totbox">${normal}${grand ? `<div class="grand"><span class="lbl">${esc(grand.label)}</span><span class="val">${grand.value}</span></div>` : ''}</div></div>`
}

/** جعبهٔ حروف مبلغ — دو سطر: ریال + معادل تومان */
function wordsBox(amount: number | null | undefined, big?: boolean): string {
  if (amount === null || amount === undefined || !isFinite(+amount) || +amount <= 0) return ''
  const w = amountWords(+amount)
  return `<div class="words${big ? ' big' : ''}"><div class="w1">${esc(w.rial)}</div><div class="w2">معادل: ${esc(w.toman)}</div></div>`
}

function sigsHtml(boxes: { label: string; name?: string | null; hint?: string }[]): string {
  return `<div class="sigs">${boxes.map((b) => `<div class="sig"><div class="s-label">${esc(b.label)}</div>${b.name ? `<div class="s-name">${esc(b.name)}</div>` : ''}<div class="s-hint">${esc(b.hint || 'مهر و امضا')}</div></div>`).join('')}</div>`
}

interface ShellParams {
  kind: DocKind
  title: string
  code?: string | null
  date?: string | null
  time?: string | null
  watermark?: boolean
  body: string
}

/** اسکلت کامل سند: <!DOCTYPE html> … </html> */
function shell(p: ShellParams): string {
  const thermal = p.kind === 'return-thermal'
  const dt = resolveDate(p.date) || new Date()
  const dateLong = jalaliLong(dt)
  const dateDash = jalaliDash(dt)
  const time = p.time ? toFa(p.time) : nowHM()
  const code = p.code ? String(p.code) : ''
  const wm = p.watermark
    ? `<div class="wm"><div class="wm-in"><div class="wm-olive">🫒</div><div class="wm-text">سر رسید</div></div></div>`
    : ''
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)} — ${esc(STORE.name)}</title>
<style>${baseCSS(thermal)}</style>
</head>
<body>
<div class="sheet${thermal ? ' thermal' : ''}">
${wm}
<div class="doc">
<header class="lh">
  <div class="lh-brand">
    <div class="lh-emblem">🫒</div>
    <div>
      <div class="lh-name">${esc(STORE.name)}</div>
      <div class="lh-sub">${esc(STORE.sub)}</div>
      <div class="lh-addr">${esc(STORE.addr)}</div>
    </div>
  </div>
  <div class="lh-doc">
    <div class="doc-title">${esc(p.title)}</div>
    ${code ? `<div class="doc-code">${esc(code)}</div>` : ''}
    <div class="doc-meta">تاریخ: ${dateLong}${thermal ? '' : ' — ساعت: ' + time}</div>
    ${thermal ? `<div class="doc-meta">ساعت: ${time}</div>` : ''}
  </div>
</header>
<div class="rule"></div>
${p.body}
<footer class="docfoot">
  <span>سند توسط سامانهٔ سررسید (SarResid) تولید شده${code ? ` — کد سند: <span class="num">${esc(code)}</span>` : ''}</span>
  <span>تاریخ تولید: ${dateLong} — ساعت ${time}</span>
</footer>
</div>
<div class="pfoot">${esc(STORE.name)} — ${esc(p.title)}${code ? ` — کد سند: ${esc(code)}` : ''}</div>
</div>
</body>
</html>`
}

/* ══════════════════════════════════════════════════════════════════
 * ۵) قرارداد دادهٔ اسناد (فیلدها جزئی‌اند — نداشته = «—»)
 * ══════════════════════════════════════════════════════════════════ */

export interface DocOpts {
  /** واترمارک برند (پیش‌فرض: رسید مرجوعی و چک روشن است) */
  watermark?: boolean
  /** تاریخ سند — جلالی «۱۴۰۵-۰۷-۲۷» یا ISO */
  date?: string
  /** ساعت سند HH:MM */
  time?: string
  /** کد سند (پابرگ) */
  code?: string
}

export interface ReturnItemData { name?: string; barcode?: string | null; qty?: number; unit?: string; unitPrice?: number; lineTotal?: number }
export interface ReturnDocData {
  code?: string
  date?: string
  time?: string
  customerName?: string
  customerPhone?: string
  customerCardNumber?: string
  purchaseAt?: string
  settleType?: string
  items?: ReturnItemData[]
  totalAmount?: number
  exchangeValue?: number
  transferAmount?: number
  transferNote?: string
  reason?: string
  note?: string
  cashierName?: string
  authorName?: string
  status?: string
  watermark?: boolean
}

export interface OrderItemData { name?: string; barcode?: string | null; qty?: number; cartonQty?: number; unitsPerCarton?: number; unitBuyPrice?: number; lineTotal?: number }
export interface OrderDocData {
  code?: string
  date?: string
  time?: string
  supplierName?: string
  supplierPhone?: string
  supplierBalance?: number | null
  deliveryDate?: string
  items?: OrderItemData[]
  totalAmount?: number
  payMethod?: string
  note?: string
  status?: string
  authorName?: string
  watermark?: boolean
}

export interface ChequeDocData {
  number?: string
  sayadSerial?: string
  bankName?: string
  amount?: number
  dueDate?: string
  recipient?: string
  orderCode?: string
  note?: string
  status?: string
  /** سررسید در روز تعطیل (جمعه/تعطیل رسمی) است */
  isOff?: boolean
  /** نام تعطیلی یا «جمعه» */
  offReason?: string
  date?: string
  time?: string
  authorName?: string
  watermark?: boolean
}

export interface HandoverDocData {
  date?: string
  time?: string
  shift?: string
  authorName?: string
  handoverTo?: string
  cashCounted?: number
  cashExpected?: number
  cashDiff?: number
  posTotal?: number
  cardTotal?: number
  chequesCollected?: number
  pendingDeliveries?: string[] | string
  priceChangeNotes?: string[] | string
  staffNotes?: { staffName?: string; note?: string }[]
  problemsCarried?: (string | { title?: string; problem?: string; severity?: string; status?: string })[]
  tasksForNext?: { text?: string; assignee?: string; assigneeName?: string }[]
  notes?: string
  metrics?: Partial<Record<'returnsToday' | 'returnsPending' | 'lowStockCount' | 'ordersWaiting' | 'chequesThisWeek' | 'tasksOpen' | 'tasksOverdue' | 'problemsOpen' | 'morningChecksFlagged', number>>
  acknowledgedBy?: string
  acknowledgedAt?: string
  code?: string
  watermark?: boolean
}

export interface PerformanceDocData {
  staffName?: string
  honorific?: string
  role?: string
  roleLabel?: string
  title?: string
  period?: string
  periodType?: string
  total?: number
  grade?: string
  criteria?: { key?: string; label?: string; weight?: number; score?: number }[]
  managerNote?: string
  authorName?: string
  code?: string
  date?: string
  watermark?: boolean
}

export interface ProblemRowData {
  title?: string
  problem?: string
  category?: string
  categoryLabel?: string
  severity?: string
  location?: string
  status?: string
  assigneeName?: string
  responsible?: string
  dueDate?: string
  date?: string
  time?: string
  shift?: string
}
export interface ProblemsDocData {
  from?: string
  to?: string
  shift?: string
  category?: string
  items?: ProblemRowData[]
  stats?: { open?: number; inProgress?: number; resolved?: number; byCategory?: Record<string, number> }
  authorName?: string
  code?: string
  date?: string
  watermark?: boolean
}

export interface StockCountItemData { name?: string; barcode?: string | null; systemQty?: number; countedQty?: number; diff?: number; unit?: string }
export interface StockCountDocData {
  date?: string
  scheduledFor?: string
  blockLabel?: string
  zoneName?: string
  staffName?: string
  status?: string
  itemsCounted?: number
  mismatches?: number
  items?: StockCountItemData[]
  note?: string
  authorName?: string
  code?: string
  watermark?: boolean
}

/** قرارداد کار — R4-6 */
export interface ContractDocData {
  employeeName?: string
  employeeNationalId?: string
  employeeJobTitle?: string
  employeePhone?: string
  hireDate?: string
  contractType?: string // FULL_TIME | PART_TIME | CONTRACT | برچسب آزاد
  contractStart?: string // Jalali
  contractEnd?: string // Jalali
  contractSalary?: number // ریال
  contractNote?: string
  employerName?: string
  employerSigner?: string
  code?: string
  date?: string
  authorName?: string
  watermark?: boolean
}

/** رسید حقوق (فیش) — R4-6؛ فیلدها از SalaryProfile + PayrollRecord/computed */
export interface PayslipDocData {
  staffName?: string
  honorific?: string
  nationalId?: string
  jobTitle?: string
  department?: string
  year?: number
  month?: number
  monthLabel?: string
  base?: number
  housing?: number
  food?: number
  childAllowance?: number
  children?: number
  childTotal?: number
  seniorityDaily?: number
  seniorityTotal?: number
  monthly?: number
  overtimeMinutes?: number
  overtimePay?: number
  adjustment?: number
  gross?: number
  absenceDays?: number
  absenceDeduction?: number
  insurance?: number
  tax?: number
  net?: number
  bankCard?: string
  shaba?: string
  extraRows?: { label?: string; amount?: number }[]
  extraDeductions?: { label?: string; amount?: number }[]
  authorName?: string
  code?: string
  date?: string
  watermark?: boolean
}

export type AnyDocData = ReturnDocData | OrderDocData | ChequeDocData | HandoverDocData | PerformanceDocData | ProblemsDocData | StockCountDocData | ContractDocData | PayslipDocData

/* ══════════════════════════════════════════════════════════════════
 * ۶) سازنده‌های سند
 * ══════════════════════════════════════════════════════════════════ */

/** ۱) رسید مرجوعی کالا — نسخهٔ A4 (رونوشت چاپی) */
export function returnDocHTML(data: ReturnDocData, opts?: DocOpts): string {
  const d = data || {}
  const items = Array.isArray(d.items) ? d.items : []
  const total = +(d.totalAmount ?? items.reduce((s, it) => s + (+((it && it.lineTotal) ?? 0) || 0), 0)) || 0
  const exchange = +d.exchangeValue || 0
  const transfer = +d.transferAmount || 0
  const settle = SETTLE_LABEL[d.settleType || ''] || d.settleType || ''
  const st = RETURN_STATUS[d.status || ''] || { label: d.status || '', tone: 'stone' }
  const card = maskCard(d.customerCardNumber)

  const rowsHtml = items.map((it, i) => {
    const qty = +(it && it.qty) || 0
    const price = +(it && it.unitPrice) || 0
    const line = +((it && it.lineTotal) ?? qty * price) || 0
    return `<tr>
<td class="c">${toFa(i + 1)}</td>
<td><b>${orNA(it && it.name)}</b>${it && it.unit ? `<div style="font-size:9px;color:#78716c">واحد: ${esc(it.unit)}</div>` : ''}</td>
<td class="c mono">${(it && it.barcode) ? esc(it.barcode) : NA}</td>
<td class="num">${money(qty)}</td>
<td class="num">${money(price)}</td>
<td class="num"><b>${money(line)}</b></td>
</tr>`
  }).join('')

  const body = `
<div class="row2">
  ${boxHtml('مشخصات مشتری', kvHtml([
    { k: 'نام مشتری', v: orNA(d.customerName) },
    { k: 'تلفن همراه', v: d.customerPhone ? `<span class="num">${toFa(d.customerPhone)}</span>` : NA },
    { k: 'کارت بانکی', v: card ? `<span class="num">${card}</span>` : NA },
    { k: 'تاریخ خرید', v: d.purchaseAt ? jalaliLong(resolveDate(d.purchaseAt) || new Date()) : NA },
  ]))}
  ${boxHtml('مشخصات سند', `<div style="display:flex;flex-direction:column;gap:7px;align-items:flex-start">
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      ${chipHtml('نوع تسویه: ' + (settle || '—'), settle === 'exchange' || settle === 'بدهی مشتری' ? 'amber' : 'emerald')}
      ${st.label ? chipHtml('وضعیت: ' + st.label, st.tone as any) : ''}
    </div>
    ${kvHtml([
      { k: 'صندوکار', v: orNA(d.cashierName || d.authorName) },
      { k: 'تعداد اقلام', v: toFa(items.length) + ' قلم' },
      { k: 'کد پیگیری', v: d.code ? `<span class="num">${esc(d.code)}</span>` : NA },
    ])}
  </div>`)}
</div>

<div class="sec-title">اقلام مرجوعی</div>
<table class="tbl">
<thead><tr><th class="c" style="width:34px">ردیف</th><th>نام کالا</th><th class="c" style="width:110px">بارکد</th><th class="c" style="width:64px">تعداد</th><th class="c" style="width:100px">فی (ریال)</th><th class="c" style="width:110px">جمع (ریال)</th></tr></thead>
<tbody>${rowsHtml || `<tr><td colspan="6" class="c" style="color:#a8a29e">قلمی ثبت نشده است</td></tr>`}</tbody>
<tfoot><tr><td colspan="5" style="text-align:right">جمع کل اقلام مرجوعی</td><td class="num">${money(total)}</td></tr></tfoot>
</table>

<div class="totwrap"><div class="totbox">
  <div class="trow"><span class="lbl">ارزش کل اقلام مرجوعی</span><span class="val">${money(total)} ریال</span></div>
  ${exchange > 0 ? `<div class="trow"><span class="lbl">ارزش کالای جایگزین</span><span class="val">${money(exchange)} ریال</span></div>` : ''}
  <div class="grand"><span class="lbl">${transfer > 0 ? 'مبلغ بازگشت وجه به کارت' : 'مبلغ قابل تسویه'}</span><span class="val">${money(transfer > 0 ? transfer : total - exchange)} ریال</span></div>
</div></div>
${wordsBox(transfer > 0 ? transfer : total - exchange)}
${d.transferNote ? `<div class="note">یادداشت بازگشت وجه: ${esc(d.transferNote)}</div>` : ''}
${d.reason ? `<div class="note"><b>علت مرجوعی:</b> ${esc(d.reason)}</div>` : ''}
${d.note ? `<div class="note"><b>یادداشت:</b> ${esc(d.note)}</div>` : ''}

<div class="stamp-row">
  <div class="tracking">
    <div class="t-label">کد پیگیری مرجوعی</div>
    <div class="t-code">${d.code ? esc(d.code) : '—'}</div>
  </div>
  <div class="stampbox">محل مهر و امضای فروشگاه</div>
</div>

${sigsHtml([
    { label: 'تنظیم‌کننده', name: d.cashierName || d.authorName, hint: 'صندوکار' },
    { label: 'تأییدکننده', hint: 'مدیر فروشگاه' },
    { label: 'امضای مشتری', hint: 'تحویل‌گیرندهٔ کالا/وجه' },
  ])}`

  return shell({
    kind: 'return',
    title: 'رسید مرجوعی کالا',
    code: d.code,
    date: opts?.date || d.date,
    time: opts?.time ?? d.time,
    watermark: opts?.watermark ?? d.watermark ?? true,
    body,
  })
}

/** ۱-ب) رسید مرجوعی — نسخهٔ حرارتی ۸۰ میلی‌متری */
export function returnThermalHTML(data: ReturnDocData, opts?: DocOpts): string {
  const d = data || {}
  const items = Array.isArray(d.items) ? d.items : []
  const total = +(d.totalAmount ?? items.reduce((s, it) => s + (+((it && it.lineTotal) ?? 0) || 0), 0)) || 0
  const exchange = +d.exchangeValue || 0
  const transfer = +d.transferAmount || 0
  const settle = SETTLE_LABEL[d.settleType || ''] || d.settleType || '—'
  const st = RETURN_STATUS[d.status || ''] || { label: d.status || '—', tone: 'stone' }
  const pay = transfer > 0 ? transfer : total - exchange

  const rowsHtml = items.map((it) => {
    const qty = +(it && it.qty) || 0
    const price = +(it && it.unitPrice) || 0
    const line = +((it && it.lineTotal) ?? qty * price) || 0
    return `<tr>
<td style="padding:2.5px 3px"><b>${orNA(it && it.name)}</b><div style="font-size:8.2px;color:#78716c">${money(qty)} × ${money(price)}</div></td>
<td class="num" style="padding:2.5px 3px"><b>${money(line)}</b></td>
</tr>`
  }).join('')

  const body = `
<div>${d.code ? `<div class="doc-code" style="font-size:13px">${esc(d.code)}</div>` : ''}</div>
<div class="dash"></div>
<div style="font-size:9.5px;line-height:1.9">
  ${d.customerName ? `<div>مشتری: <b>${esc(d.customerName)}</b></div>` : ''}
  ${d.customerPhone ? `<div>تلفن: <span class="num">${toFa(d.customerPhone)}</span></div>` : ''}
  ${maskCard(d.customerCardNumber) ? `<div>کارت: <span class="num">${maskCard(d.customerCardNumber)}</span></div>` : ''}
  <div>نوع تسویه: <b>${esc(settle)}</b> — وضعیت: <b>${esc(st.label)}</b></div>
  ${d.purchaseAt ? `<div>تاریخ خرید: ${toFa(jalaliLong(resolveDate(d.purchaseAt) || new Date()))}</div>` : ''}
</div>
<div class="dash"></div>
<table class="tbl" style="font-size:9.6px">
<thead><tr><th>شرح کالا</th><th style="width:86px">جمع (ریال)</th></tr></thead>
<tbody>${rowsHtml || `<tr><td colspan="2" class="c" style="color:#a8a29e">قلمی ثبت نشده است</td></tr>`}</tbody>
</table>
<div class="dash"></div>
<div style="display:flex;justify-content:space-between;font-size:11px"><b>جمع اقلام:</b><b class="num">${money(total)} ریال</b></div>
${exchange > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px"><span>کالای جایگزین:</span><span class="num">${money(exchange)} ریال</span></div>` : ''}
<div style="display:flex;justify-content:space-between;font-size:12.5px;margin-top:2px"><b style="color:#065f46">بازگشت وجه:</b><b class="num" style="color:#065f46">${money(pay)} ریال</b></div>
<div class="dash"></div>
<div style="font-size:9px;line-height:1.9;color:#44403c">${esc(amountWords(pay).rial)}<br>معادل: ${esc(amountWords(pay).toman)}</div>
${d.reason ? `<div class="dash"></div><div style="font-size:9px">علت: ${esc(d.reason)}</div>` : ''}
<div class="dash"></div>
<div style="font-size:9.5px;line-height:1.9">
  ${d.cashierName ? `<div>صندوکار: <b>${esc(d.cashierName)}</b></div>` : ''}
  <div>کد پیگیری: <b class="num">${d.code ? esc(d.code) : '—'}</b></div>
</div>
<div class="dash"></div>
<div style="font-size:8.4px;color:#78716c;text-align:center;line-height:1.8">
  این رسید توسط سامانهٔ سررسید (SarResid) صادر شده است.<br>
  حسن شما، اعتمادِ ما — ${esc(STORE.name)}
</div>`

  return shell({
    kind: 'return-thermal',
    title: 'رسید مرجوعی کالا',
    code: d.code,
    date: opts?.date || d.date,
    time: opts?.time ?? d.time,
    watermark: false,
    body,
  })
}

/** ۲) سفارش خرید کالا — A4 */
export function orderDocHTML(data: OrderDocData, opts?: DocOpts): string {
  const d = data || {}
  const items = Array.isArray(d.items) ? d.items : []
  const total = +(d.totalAmount ?? items.reduce((s, it) => {
    const itd = it || {}
    const qty = +itd.qty || 0
    const cq = +itd.cartonQty || 0
    const upc = +itd.unitsPerCarton || 0
    const price = +itd.unitBuyPrice || 0
    return s + (+(itd.lineTotal ?? (qty + cq * upc) * price) || 0)
  }, 0)) || 0
  const bal = d.supplierBalance
  const balChip = bal === null || bal === undefined
    ? chipHtml('بدون بدهی', 'stone')
    : (+bal > 0 ? chipHtml('بدهی به تأمین‌کننده: ' + money(+bal) + ' ریال', 'rose')
      : +bal < 0 ? chipHtml('اعتبار: ' + money(-+bal) + ' ریال', 'emerald')
        : chipHtml('بدون بدهی', 'stone'))

  const rowsHtml = items.map((it, i) => {
    const itd = it || {}
    const qty = +itd.qty || 0
    const cq = +itd.cartonQty || 0
    const upc = +itd.unitsPerCarton || 0
    const price = +itd.unitBuyPrice || 0
    const line = +(itd.lineTotal ?? (qty + cq * upc) * price) || 0
    const cartonCell = cq > 0
      ? `${toFa(cq)}${upc > 0 ? ` <span style="font-size:8.8px;color:#78716c">× ${toFa(upc)}</span>` : ''}`
      : `<span style="color:#a8a29e">تکی</span>`
    return `<tr>
<td class="c">${toFa(i + 1)}</td>
<td><b>${orNA(itd.name)}</b></td>
<td class="c mono">${itd.barcode ? esc(itd.barcode) : NA}</td>
<td class="num">${money(qty)}</td>
<td class="c">${cartonCell}</td>
<td class="num">${money(price)}</td>
<td class="num"><b>${money(line)}</b></td>
</tr>`
  }).join('')

  const body = `
<div class="row2">
  ${boxHtml('طرف حساب (تأمین‌کننده)', `${kvHtml([
    { k: 'نام تأمین‌کننده', v: orNA(d.supplierName) },
    { k: 'تلفن', v: d.supplierPhone ? `<span class="num">${toFa(d.supplierPhone)}</span>` : NA },
    { k: 'ماندهٔ حساب', v: balChip },
  ])}<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
    ${d.deliveryDate ? chipHtml('تحویل: ' + jalaliLong(resolveDate(d.deliveryDate) || new Date()) + (weekdayOf(d.deliveryDate) ? ' (' + weekdayOf(d.deliveryDate) + ')' : ''), 'teal') : ''}
    ${d.payMethod ? chipHtml('پرداخت: ' + (PAY_LABEL[d.payMethod] || d.payMethod), d.payMethod === 'CHEQUE' ? 'amber' : 'emerald') : ''}
    ${d.status ? chipHtml('وضعیت: ' + (ORDER_STATUS[d.status] || d.status), d.status === 'CANCELLED' ? 'rose' : 'stone') : ''}
  </div>`)}
  ${boxHtml('مشخصات سفارش', kvHtml([
    { k: 'شمارهٔ سفارش', v: d.code ? `<span class="num">${esc(d.code)}</span>` : NA },
    { k: 'ثبت‌کننده', v: orNA(d.authorName) },
    { k: 'تعداد اقلام', v: toFa(items.length) + ' قلم' },
    { k: 'تاریخ سفارش', v: jalaliLong(resolveDate(opts?.date || d.date) || new Date()) },
  ]))}
</div>

<div class="sec-title">اقلام سفارش</div>
<table class="tbl">
<thead><tr><th class="c" style="width:34px">ردیف</th><th>نام کالا</th><th class="c" style="width:106px">بارکد</th><th class="c" style="width:56px">عدد</th><th class="c" style="width:80px">کارتن</th><th class="c" style="width:96px">فی واحد (ریال)</th><th class="c" style="width:104px">جمع سطر (ریال)</th></tr></thead>
<tbody>${rowsHtml || `<tr><td colspan="7" class="c" style="color:#a8a29e">قلمی ثبت نشده است</td></tr>`}</tbody>
<tfoot><tr><td colspan="6" style="text-align:right">جمع کل برآورد سفارش</td><td class="num">${money(total)}</td></tr></tfoot>
</table>

${totBoxHtml([{ label: 'جمع کل سفارش (ریال)', value: `<b>${money(total)}</b>`, grand: true }])}
${wordsBox(total)}
${d.note ? `<div class="note"><b>یادداشت سفارش:</b> ${esc(d.note)}</div>` : ''}

${sigsHtml([
    { label: 'تنظیم‌کننده', name: d.authorName, hint: 'کارشناس سفارش' },
    { label: 'تأییدکننده', hint: 'مدیر فروشگاه' },
    { label: 'مهر و امضای تأمین‌کننده', hint: 'طرف حساب' },
  ])}`

  return shell({
    kind: 'order',
    title: 'سفارش خرید کالا',
    code: d.code,
    date: opts?.date || d.date,
    time: opts?.time ?? d.time,
    watermark: opts?.watermark ?? d.watermark ?? false,
    body,
  })
}

/** ۳) اطلاع‌نامهٔ چک — A4 */
export function chequeDocHTML(data: ChequeDocData, opts?: DocOpts): string {
  const d = data || {}
  const amount = +d.amount || 0
  const due = d.dueDate ? jalaliLong(resolveDate(d.dueDate) || new Date()) : ''
  const wday = weekdayOf(d.dueDate)
  const st = CHEQUE_STATUS[d.status || ''] || null
  const w = amountWords(amount)

  const body = `
<div class="row2">
  ${boxHtml('مشخصات چک', kvHtml([
    { k: 'شمارهٔ چک', v: d.number ? `<span class="num">${toFa(d.number)}</span>` : NA },
    { k: 'سریال ساید', v: d.sayadSerial ? `<span class="num">${toFa(d.sayadSerial)}</span>` : NA },
    { k: 'بانک', v: orNA(d.bankName) },
    { k: 'گیرنده', v: orNA(d.recipient) },
    { k: 'مبلغ (ریال)', v: money(amount), num: true },
    { k: 'سررسید', v: due ? `${due}${wday ? ' — ' + esc(wday) : ''}` : NA },
    { k: 'سفارش مرتبط', v: d.orderCode ? `<span class="num">${esc(d.orderCode)}</span>` : NA },
    { k: 'وضعیت', v: st ? chipHtml(st.label, st.tone as any) : NA },
  ]))}
</div>

${d.isOff ? `<div class="danger">⚠ هشدار تعطیلی: سررسید این چک ${d.offReason ? '«' + esc(d.offReason) + '»' : 'روز تعطیل'} است؛ وصول/تسویه در روز کاری پیش از سررسید برنامه‌ریزی شود.</div>` : ''}

<div class="hl" style="margin-top:12px">
  <span class="hl-lbl">مبلغ چک</span>
  <span class="hl-amt">${money(amount)} ریال</span>
</div>
<div class="words big" style="margin-top:9px">
  <div class="w1">${esc(w.rial)}</div>
  <div class="w2">معادل: ${esc(w.toman)}</div>
</div>

<div class="warn">لطفاً پیش از سررسید، موجودی حساب را تأمین فرمایید. صدور چک بدون موجودی، پیگرد قانونی (انتشار چک برگشتی) خواهد داشت.</div>
${d.note ? `<div class="note"><b>یادداشت:</b> ${esc(d.note)}</div>` : ''}

${sigsHtml([
    { label: 'تنظیم‌کننده', name: d.authorName, hint: 'واحد مالی' },
    { label: 'تأییدکننده', hint: 'مهر و امضای مدیرعامل' },
  ])}`

  return shell({
    kind: 'cheque',
    title: 'اطلاع‌نامهٔ چک',
    code: d.number ? `CHK-${d.number}` : opts?.code,
    date: opts?.date || d.date,
    time: opts?.time ?? d.time,
    watermark: opts?.watermark ?? d.watermark ?? true,
    body,
  })
}

/** ۴) گزارش تحویل شیفت — A4 */
export function handoverDocHTML(data: HandoverDocData, opts?: DocOpts): string {
  const d = data || {}
  const counted = d.cashCounted
  const expected = d.cashExpected
  const diff = (counted !== undefined && expected !== undefined)
    ? Math.round(((+counted) - (+expected)) * 100) / 100
    : (d.cashDiff !== undefined ? +d.cashDiff : undefined)

  const toLines = (v: string[] | string | undefined): string[] => {
    if (!v) return []
    if (Array.isArray(v)) return v.map((x) => String(x || '').trim()).filter(Boolean)
    return String(v).split('\n').map((x) => x.trim()).filter(Boolean)
  }
  const deliveries = toLines(d.pendingDeliveries)
  const priceNotes = toLines(d.priceChangeNotes)
  const staffNotes = Array.isArray(d.staffNotes) ? d.staffNotes : []
  const problems = (Array.isArray(d.problemsCarried) ? d.problemsCarried : []).map((p) =>
    typeof p === 'string' ? { title: p } : (p || {}))
  const tasks = Array.isArray(d.tasksForNext) ? d.tasksForNext : []

  const m = d.metrics || {}
  const metricDefs: { key: string; label: string; warn?: boolean }[] = [
    { key: 'returnsToday', label: 'مرجوعی‌های امروز' },
    { key: 'returnsPending', label: 'مرجوعی در انتظار تأیید', warn: true },
    { key: 'lowStockCount', label: 'کالای کم‌موجود', warn: true },
    { key: 'ordersWaiting', label: 'سفارش در انتظار دریافت' },
    { key: 'chequesThisWeek', label: 'چک‌های ۷ روز آینده' },
    { key: 'tasksOpen', label: 'وظایف باز' },
    { key: 'tasksOverdue', label: 'وظایف از سررسید گذشته', warn: true },
    { key: 'problemsOpen', label: 'مشکلات باز', warn: true },
    { key: 'morningChecksFlagged', label: 'موارد پرچم‌دار کنترل تاریخ' },
  ]

  const body = `
<div class="row2">
  ${boxHtml('مشخصات گزارش', kvHtml([
    { k: 'تاریخ گزارش', v: jalaliLong(resolveDate(d.date) || new Date()) },
    { k: 'شیفت', v: SHIFT_LABEL[d.shift || ''] || orNA(d.shift) },
    { k: 'تحویل‌دهنده', v: orNA(d.authorName) },
    { k: 'تحویل‌گیرنده', v: orNA(d.handoverTo) },
  ]))}
</div>

<div class="sec-title">صندوق و پرداخت</div>
<div class="mgrid">
  <div class="mcell"><span class="ml">وجه نقد شمارش‌شده</span><span class="mv num">${money(counted)}</span></div>
  <div class="mcell"><span class="ml">وجه نقد مورد انتظار</span><span class="mv num">${money(expected)}</span></div>
  <div class="mcell${diff !== undefined && +diff !== 0 ? ' warnv' : ''}"><span class="ml">مغایرت صندوق (ریال)</span><span class="mv num">${diff === undefined ? '—' : money(diff)}</span></div>
  <div class="mcell"><span class="ml">کارتخوان (POS)</span><span class="mv num">${money(d.posTotal)}</span></div>
  <div class="mcell"><span class="ml">کارت به کارت</span><span class="mv num">${money(d.cardTotal)}</span></div>
  <div class="mcell"><span class="ml">چک‌های دریافت‌شده</span><span class="mv num">${money(d.chequesCollected)}</span></div>
</div>

<div class="sec-title">شاخص‌های وضعیت فروشگاه</div>
<div class="mgrid">
${metricDefs.map((md) => {
    const v = (m as any)[md.key]
    return `<div class="mcell${md.warn && +v > 0 ? ' warnv' : ''}"><span class="ml">${esc(md.label)}</span><span class="mv num">${v === undefined || v === null ? '—' : toFa(String(v))}</span></div>`
  }).join('')}
</div>

${staffNotes.length ? `
<div class="sec-title">یادداشت پرسنل</div>
<table class="tbl">
<thead><tr><th class="c" style="width:180px">پرسنل</th><th>یادداشت</th></tr></thead>
<tbody>${staffNotes.map((s) => `<tr><td class="c"><b>${orNA(s && s.staffName)}</b></td><td>${orNA(s && s.note)}</td></tr>`).join('')}</tbody>
</table>` : ''}

${problems.length ? `
<div class="sec-title">مشکلات واگذارشده به شیفت بعد</div>
<table class="tbl">
<thead><tr><th>عنوان</th><th class="c" style="width:76px">شدت</th><th class="c" style="width:104px">وضعیت</th></tr></thead>
<tbody>${problems.map((p) => {
    const sev = SEVERITY_LABEL[p.severity || ''] || { label: p.severity || 'معمولی', cls: 'sev-normal' }
    const ps = PROBLEM_STATUS[p.status || ''] || { label: p.status || '—', tone: 'stone' }
    return `<tr><td><b>${orNA(p.title || p.problem)}</b></td><td class="c ${sev.cls}">${esc(sev.label)}</td><td class="c">${chipHtml(ps.label, ps.tone as any)}</td></tr>`
  }).join('')}</tbody>
</table>` : ''}

${tasks.length ? `
<div class="sec-title">کارهای واگذارشده به شیفت بعد</div>
<table class="tbl">
<thead><tr><th>شرح کار</th><th class="c" style="width:170px">مسئول انجام</th></tr></thead>
<tbody>${tasks.map((t) => `<tr><td>${orNA(t && t.text)}</td><td class="c">${orNA((t && (t.assigneeName || t.assignee)))}</td></tr>`).join('')}</tbody>
</table>` : ''}

${deliveries.length || priceNotes.length ? `
<div class="sec-title">وضعیت دریافت و تغییرات قیمت</div>
${deliveries.length ? boxHtml('دریافت‌های در انتظار', `<ul style="margin:0;padding-right:16px;font-size:11px">${deliveries.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`, true) : ''}
${priceNotes.length ? boxHtml('یادداشت تغییرات قیمت', `<ul style="margin:0;padding-right:16px;font-size:11px">${priceNotes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`, true) : ''}` : ''}

${d.notes ? `<div class="note"><b>یادداشت پایانی:</b> ${esc(d.notes)}</div>` : ''}

${d.acknowledgedBy
      ? `<div class="hl"><span class="hl-lbl">✓ دریافت‌شده توسط</span><span style="font-weight:800">${esc(d.acknowledgedBy)}${d.acknowledgedAt ? ` — ${toFa(jalaliLong(resolveDate(d.acknowledgedAt) || new Date()))}` : ''}</span></div>`
      : `<div class="warn">این گزارش هنوز توسط تحویل‌گیرنده تأیید نشده است.</div>`}

${sigsHtml([
    { label: 'تحویل‌دهنده', name: d.authorName, hint: 'امضای پایان شیفت' },
    { label: 'تحویل‌گیرنده', name: d.handoverTo, hint: 'تأیید دریافت شیفت' },
    { label: 'تأییدکننده', hint: 'مدیر فروشگاه' },
  ])}`

  return shell({
    kind: 'handover',
    title: 'گزارش تحویل شیفت',
    code: d.code || opts?.code,
    date: opts?.date || d.date,
    time: opts?.time ?? d.time,
    watermark: opts?.watermark ?? d.watermark ?? false,
    body,
  })
}

/** ۵) کارنامهٔ عملکرد پرسنل — A4 (یک نفر در هر سند) */
export function performanceDocHTML(data: PerformanceDocData, opts?: DocOpts): string {
  const d = data || {}
  const total = d.total !== undefined && d.total !== null ? +d.total : null
  const gradeInfo = GRADE_LABEL[d.grade || ''] || (d.grade ? { label: d.grade, tone: 'stone' } : null)
  const score = total === null ? 0 : Math.max(0, Math.min(100, total))

  // معیارها: دادهٔ صریح یا ترکیب با پیش‌فرض‌ها بر اساس کلید
  const given = new Map<string, { label?: string; weight?: number; score?: number }>()
  const extra: { label?: string; weight?: number; score?: number }[] = []
  for (const c of (Array.isArray(d.criteria) ? d.criteria : [])) {
    const cd = c || {}
    if (cd.key && PERF_CRITERIA.some((x) => x.key === cd.key)) given.set(cd.key, cd)
    else extra.push(cd)
  }
  const criteria = [
    ...PERF_CRITERIA.map((pc) => {
      const g = given.get(pc.key)
      return { label: (g && g.label) || pc.label, weight: (g && g.weight !== undefined ? g.weight : pc.weight), score: g && g.score }
    }),
    ...extra.map((e) => ({ label: e.label || 'معیار', weight: e.weight ?? 0, score: e.score })),
  ].filter((c) => c.weight > 0 || c.score !== undefined)

  const rowsHtml = criteria.map((c) => {
    const sc = c.score
    const share = (sc !== undefined && sc !== null) ? (+sc) * (+c.weight || 0) : null
    return `<tr>
<td>${esc(c.label)}</td>
<td class="c">${faPct(+c.weight || 0)}</td>
<td class="c">${sc === undefined || sc === null ? '—' : faNum(+sc)}</td>
<td class="c"><b>${share === null ? '—' : faNum(share)}</b></td>
</tr>`
  }).join('')
  const weightSum = criteria.reduce((s, c) => s + (+c.weight || 0), 0)

  const body = `
<div class="row2">
  ${boxHtml('مشخصات پرسنل', kvHtml([
    { k: 'نام', v: orNA(d.honorific ? `${d.honorific} ${d.staffName || ''}`.trim() : d.staffName) },
    { k: 'سمت', v: orNA(d.roleLabel || d.title || d.role) },
    { k: 'دورهٔ ارزیابی', v: orNA(d.period) },
    { k: 'نوع دوره', v: d.periodType === 'WEEKLY' ? 'هفتگی' : d.periodType === 'MONTHLY' ? 'ماهانه' : (d.periodType ? esc(d.periodType) : NA) },
  ]))}
</div>

<div class="score-hero">
  <div class="score-num num">${total === null ? '—' : faNum(total)}</div>
  <div>
    <div style="font-size:11px;font-weight:700;color:#1c1917">امتیاز نهایی عملکرد <span style="color:#78716c;font-weight:500">(از ۱۰۰)</span></div>
    <div style="margin-top:4px">${gradeInfo ? chipHtml('رتبه: ' + gradeInfo.label, gradeInfo.tone as any) : ''}</div>
  </div>
  <div class="score-bar"><div style="width:${Math.round(score)}%"></div></div>
</div>

<div class="sec-title">جدول معیارها و امتیازها</div>
<table class="tbl">
<thead><tr><th>معیار</th><th class="c" style="width:80px">وزن</th><th class="c" style="width:104px">امتیاز از ۱۰۰</th><th class="c" style="width:92px">سهم وزنی</th></tr></thead>
<tbody>${rowsHtml || `<tr><td colspan="4" class="c" style="color:#a8a29e">معیاری ثبت نشده است</td></tr>`}</tbody>
<tfoot><tr><td style="text-align:right">جمع وزن‌ها</td><td class="c">${faPct(weightSum)}</td><td class="c">—</td><td class="c num">${total === null ? '—' : faNum(total)}</td></tr></tfoot>
</table>

${d.managerNote ? `<div class="note"><b>دیدگاه مدیر:</b> ${esc(d.managerNote)}</div>` : ''}

<div class="sec-title">راهنمای تفسیر (مبنای پاداش و آموزش)</div>
<div class="legend">
  ${chipHtml('الف ≥ ۹۰ → پیشنهاد پاداش', 'emerald')}
  ${chipHtml('ب ≥ ۸۰ → در افزایش حقوق در نظر گرفته شود', 'teal')}
  ${chipHtml('ج ≥ ۷۰ → دورهٔ آموزشی', 'amber')}
  ${chipHtml('د < ۷۰ → هشدار و برنامهٔ بهبود', 'rose')}
</div>

${sigsHtml([
    { label: 'مدیر ارزیاب', name: d.authorName, hint: 'مهر و امضا' },
    { label: 'اطلاع پرسنل', hint: 'امضای دریافت‌کننده' },
  ])}`

  return shell({
    kind: 'performance',
    title: 'کارنامهٔ عملکرد',
    code: d.code || opts?.code,
    date: opts?.date || d.date,
    time: opts?.time,
    watermark: opts?.watermark ?? d.watermark ?? false,
    body,
  })
}

/** ۶) فهرست مشکلات — A4 */
export function problemsDocHTML(data: ProblemsDocData, opts?: DocOpts): string {
  const d = data || {}
  const items = Array.isArray(d.items) ? d.items : []
  const stats = d.stats || {}
  const today = jalaliDash(new Date())

  const rowsHtml = items.map((p, i) => {
    const pd = p || {}
    const cat = pd.categoryLabel || CATEGORY_LABEL[pd.category || ''] || pd.category || 'سایر'
    const sev = SEVERITY_LABEL[pd.severity || ''] || { label: 'معمولی', cls: 'sev-normal' }
    const ps = PROBLEM_STATUS[pd.status || ''] || { label: pd.status || '—', tone: 'stone' }
    const overdue = pd.dueDate && pd.status !== 'RESOLVED' && cmpJalali(pd.dueDate, today) < 0
    return `<tr>
<td class="c">${toFa(i + 1)}</td>
<td><b>${orNA(pd.title || pd.problem)}</b>${pd.date || pd.time ? `<div style="font-size:8.8px;color:#78716c">${pd.date ? toFa(pd.date) : ''}${pd.time ? ' — ' + toFa(pd.time) : ''}</div>` : ''}</td>
<td class="c">${esc(cat)}</td>
<td class="c ${sev.cls}">${esc(sev.label)}</td>
<td class="c">${pd.location ? esc(pd.location) : NA}</td>
<td class="c">${chipHtml(ps.label, ps.tone as any)}</td>
<td class="c">${pd.assigneeName || pd.responsible ? esc(pd.assigneeName || pd.responsible) : NA}</td>
<td class="c">${pd.dueDate ? `<span class="${overdue ? 'bad' : ''}">${toFa(pd.dueDate)}</span>` : NA}</td>
</tr>`
  }).join('')

  const byCat = stats.byCategory || {}
  const catRows = Object.entries(byCat).filter(([, n]) => +n > 0)
    .sort((a, b) => +b[1] - +a[1])
    .map(([k, n]) => ({ label: CATEGORY_LABEL[k] || k, n: +n }))
  const maxCat = catRows.reduce((mx, c) => Math.max(mx, c.n), 0)

  const body = `
<div class="row2">
  ${boxHtml('محدودهٔ گزارش', kvHtml([
    { k: 'از تاریخ', v: d.from ? toFa(d.from) : 'ابتدا' },
    { k: 'تا تاریخ', v: d.to ? toFa(d.to) : 'امروز' },
    { k: 'شیفت', v: d.shift ? (SHIFT_LABEL[d.shift] || esc(d.shift)) : 'همهٔ شیفت‌ها' },
    { k: 'دسته', v: d.category ? (CATEGORY_LABEL[d.category] || esc(d.category)) : 'همهٔ دسته‌ها' },
  ]))}
  ${boxHtml('خلاصهٔ وضعیت', `<div style="display:flex;gap:6px;flex-wrap:wrap">
    ${chipHtml('باز: ' + toFa(stats.open ?? items.filter((x) => (x || {}).status === 'OPEN').length), 'rose')}
    ${chipHtml('در حال بررسی: ' + toFa(stats.inProgress ?? items.filter((x) => (x || {}).status === 'IN_PROGRESS').length), 'amber')}
    ${chipHtml('حل‌شده: ' + toFa(stats.resolved ?? items.filter((x) => (x || {}).status === 'RESOLVED').length), 'emerald')}
    ${chipHtml('جمع کل: ' + toFa(items.length) + ' مورد', 'stone')}
  </div>${catRows.length ? `<div style="margin-top:9px;display:flex;flex-direction:column;gap:4px">${catRows.map((c) => `
    <div style="display:flex;align-items:center;gap:7px;font-size:9.6px">
      <span style="width:64px;color:#57534e">${esc(c.label)}</span>
      <span style="flex:1;height:7px;background:#e7e5e4;border-radius:99px;overflow:hidden"><span style="display:block;height:100%;width:${maxCat ? Math.round((c.n / maxCat) * 100) : 0}%;background:linear-gradient(to left,#065f46,#14b8a6);border-radius:99px"></span></span>
      <b style="width:18px;text-align:center">${toFa(c.n)}</b>
    </div>`).join('')}</div>` : ''}`)}
</div>

<div class="sec-title">فهرست مشکلات</div>
<table class="tbl">
<thead><tr><th class="c" style="width:32px">ردیف</th><th>عنوان</th><th class="c" style="width:70px">دسته</th><th class="c" style="width:62px">شدت</th><th class="c" style="width:92px">موقعیت</th><th class="c" style="width:88px">وضعیت</th><th class="c" style="width:92px">مسئول</th><th class="c" style="width:88px">سررسید</th></tr></thead>
<tbody>${rowsHtml || `<tr><td colspan="8" class="c" style="color:#047857">موردی در این محدوده ثبت نشده است ✓</td></tr>`}</tbody>
</table>

${sigsHtml([
    { label: 'تنظیم‌کننده', name: d.authorName, hint: 'کارشناس گزارش' },
    { label: 'تأییدکننده', hint: 'مدیر فروشگاه' },
  ])}`

  return shell({
    kind: 'problems',
    title: 'فهرست مشکلات',
    code: d.code || opts?.code,
    date: opts?.date || d.date,
    time: opts?.time,
    watermark: opts?.watermark ?? d.watermark ?? false,
    body,
  })
}

/** ۷) گزارش انبارگردانی — A4 */
export function stockcountDocHTML(data: StockCountDocData, opts?: DocOpts): string {
  const d = data || {}
  const items = Array.isArray(d.items) ? d.items : []
  const st = COUNT_STATUS[d.status || ''] || { label: d.status || '—', tone: 'stone' }
  const itemsCounted = d.itemsCounted ?? items.length
  const mismatches = d.mismatches ?? items.filter((it) => +(((it || {}).diff) || 0) !== 0).length
  const matchPct = items.length ? Math.round(((items.length - mismatches) / items.length) * 100) : null

  const rowsHtml = items.map((it, i) => {
    const itd = it || {}
    const sys = itd.systemQty
    const cnt = itd.countedQty
    const diff = itd.diff !== undefined && itd.diff !== null ? +itd.diff
      : (sys !== undefined && cnt !== undefined ? +cnt - +sys : undefined)
    const diffCell = diff === undefined ? NA
      : diff === 0 ? `<span style="color:#047857;font-weight:700">✓ ${toFa(0)}</span>`
        : `<span class="${diff < 0 ? 'bad' : 'sev-high'}">${diff < 0 ? '−' : '+'}${toFa(Math.abs(diff))}</span>`
    return `<tr>
<td class="c">${toFa(i + 1)}</td>
<td><b>${orNA(itd.name)}</b>${itd.unit ? `<div style="font-size:8.8px;color:#78716c">واحد: ${esc(itd.unit)}</div>` : ''}</td>
<td class="c mono">${itd.barcode ? esc(itd.barcode) : NA}</td>
<td class="num">${sys === undefined || sys === null ? NA : money(sys)}</td>
<td class="num">${cnt === undefined || cnt === null ? NA : money(cnt)}</td>
<td class="c">${diffCell}</td>
</tr>`
  }).join('')

  const body = `
<div class="row2">
  ${boxHtml('مشخصات شمارش', kvHtml([
    { k: 'بخش / بلوک', v: orNA(d.blockLabel) },
    { k: 'ناحیه', v: orNA(d.zoneName) },
    { k: 'تاریخ شمارش', v: d.date ? toFa(jalaliLong(resolveDate(d.date) || new Date())) : NA },
    { k: 'تاریخ زمان‌بندی', v: d.scheduledFor ? toFa(d.scheduledFor) : NA },
    { k: 'شمارنده', v: orNA(d.staffName || d.authorName) },
    { k: 'وضعیت', v: chipHtml(st.label, st.tone as any) },
  ]))}
</div>

<div class="sec-title">اقلام شمارش‌شده</div>
<table class="tbl">
<thead><tr><th class="c" style="width:34px">ردیف</th><th>کالا</th><th class="c" style="width:104px">بارکد</th><th class="c" style="width:104px">موجودی سیستمی</th><th class="c" style="width:104px">شمارش‌شده</th><th class="c" style="width:86px">مغایرت</th></tr></thead>
<tbody>${rowsHtml || `<tr><td colspan="6" class="c" style="color:#a8a29e">قلمی شمارش نشده است</td></tr>`}</tbody>
</table>

<div class="mgrid" style="margin-top:10px">
  <div class="mcell"><span class="ml">اقلام شمارش‌شده</span><span class="mv num">${toFa(itemsCounted)}</span></div>
  <div class="mcell${mismatches > 0 ? ' warnv' : ''}"><span class="ml">اقلام دارای مغایرت</span><span class="mv num">${toFa(mismatches)}</span></div>
  <div class="mcell"><span class="ml">درصد تطابق</span><span class="mv num">${matchPct === null ? '—' : toFa(matchPct) + '٪'}</span></div>
</div>
${mismatches > 0 ? `<div class="warn">در صورت تأیید مدیر، موجودی سیستمی اقلام دارای مغایرت از طریق «مدیریت کالاها» اصلاح شود (شمارش، موجودی را تغییر نمی‌دهد).</div>` : ''}
${d.note ? `<div class="note"><b>یادداشت:</b> ${esc(d.note)}</div>` : ''}

${sigsHtml([
    { label: 'شمارنده', name: d.staffName || d.authorName, hint: 'امضای پرسنل شمارش' },
    { label: 'تأییدکننده', hint: 'مدیر فروشگاه' },
  ])}`

  return shell({
    kind: 'stockcount',
    title: 'گزارش انبارگردانی',
    code: d.code || opts?.code,
    date: opts?.date || d.date,
    time: opts?.time,
    watermark: opts?.watermark ?? d.watermark ?? false,
    body,
  })
}

/** ۸) قرارداد کار — A4 رسمی (R4-6) */
export function contractDocHTML(data: ContractDocData, opts?: DocOpts): string {
  const d = data || {}
  const typeLabel = CONTRACT_TYPE_LABEL[d.contractType || ''] || d.contractType || ''
  const salary = +(d.contractSalary ?? 0) || 0
  const start = d.contractStart ? faSlash(d.contractStart) : ''
  const end = d.contractEnd ? faSlash(d.contractEnd) : ''
  const periodTxt = start || end
    ? `${start || '…'} تا ${end || '…'}`
    : 'مدت‌دار (طبق تاریخ شروع به کار)'
  const today = faSlash(jalaliDash(new Date()))

  const articles: { n: number; title: string; body: string }[] = [
    { n: 1, title: 'ساعات کار', body: 'کارمند موظف است طبق شیفت‌بندی و برنامهٔ ساعت کاری فروشگاه حاضر شود. کارکرد هفتگی طبق قانون کار ۴۴ ساعت و روز کاری ۸ ساعت تعیین می‌گردد؛ اضافه‌کاری با توافق طرفین و بر اساس نرخ قانونی محاسبه و پرداخت می‌شود.' },
    { n: 2, title: 'محل کار', body: `محل انجام وظایف، ${esc(d.employerName || STORE.name)} (${esc(STORE.sub)}) است. در صورت نیاز فروشگاه، با توافق کارمند می‌تواند محل خدمت در سایر بخش‌های همان مجموعه تعیین شود.` },
    { n: 3, title: 'تعهد محرمانگی', body: 'کارمند متعهد می‌شود اطلاعات مالی، قیمت‌گذاری، قراردادهای تأمین، داده‌های مشتریان و اسرار تجاری فروشگاه را در طول مدت قرارداد و پس از پایان آن افشا نکند. تخلف از این تعهد، مشمول پیگرد قانونی و خسارت خواهد بود.' },
    { n: 4, title: 'مدت قرارداد و تمدید', body: `این قرارداد از تاریخ ${start || 'شروع به کار'} شروع و در تاریخ ${end || 'پایان مدت'} خاتمه می‌یابد. تمدید قرارداد حداکثر تا ${toFa(30)} روز پیش از پایان آن، با توافق کتبی طرفین انجام می‌شود.` },
  ]

  const body = `
<div class="row2">
  ${boxHtml('کارفرما', kvHtml([
    { k: 'نام واحد کارفرما', v: esc(d.employerName || STORE.name) },
    { k: 'فعالیت', v: esc(STORE.sub) },
    { k: 'نشانی', v: esc(STORE.addr.replace('نشانی: ', '')) },
    { k: 'امضاکننده', v: orNA(d.employerSigner || 'مدیرعامل') },
  ]))}
  ${boxHtml('کارمند', kvHtml([
    { k: 'نام و نام خانوادگی', v: orNA(d.employeeName) },
    { k: 'کد ملی', v: d.employeeNationalId ? `<span class="num">${toFa(d.employeeNationalId)}</span>` : NA },
    { k: 'سمت شغلی', v: orNA(d.employeeJobTitle) },
    { k: 'تلفن همراه', v: d.employeePhone ? `<span class="num">${toFa(d.employeePhone)}</span>` : NA },
  ]))}
</div>

<div class="sec-title">شرح قرارداد</div>
<div class="row2">
  ${boxHtml('نوع و مدت', kvHtml([
    { k: 'نوع قرارداد', v: chipHtml(typeLabel || '—', 'teal') },
    { k: 'مدت قرارداد', v: esc(periodTxt) },
    { k: 'تاریخ شروع', v: start ? `<span class="num">${esc(start)}</span>` : NA },
    { k: 'تاریخ پایان', v: end ? `<span class="num">${esc(end)}</span>` : NA },
  ]), true)}
  ${boxHtml('حقوق و مزایا', kvHtml([
    { k: 'حقوق ماهانه', v: salary > 0 ? `${money(salary)} ریال` : NA },
    { k: 'معادل تومان', v: salary > 0 ? `${money(salary / 10)} تومان` : NA },
    { k: 'سایر مزایا', v: 'طبق قانون کار و آیین‌نامهٔ داخلی فروشگاه' },
    { k: 'تاریخ استخدام', v: d.hireDate ? `<span class="num">${faSlash(d.hireDate)}</span>` : NA },
  ]), true)}
</div>
${salary > 0 ? wordsBox(salary, true) : ''}

<div class="sec-title">ماده‌های قرارداد (خلاصه)</div>
<div style="display:flex;flex-direction:column;gap:7px">
${articles.map((a) => `<div class="box" style="padding:8px 12px">
  <div style="font-size:11px;font-weight:800;color:#065f46">مادهٔ ${toFa(a.n)} — ${esc(a.title)}</div>
  <div style="font-size:10.8px;line-height:2;color:#44403c;margin-top:2px">${a.body}</div>
</div>`).join('')}
</div>

${d.contractNote ? `<div class="note"><b>ملاحظات:</b> ${esc(d.contractNote)}</div>` : ''}
<div class="warn">این سند چاپی، خلاصهٔ قرارداد کار است؛ متن کامل قانونی نزد واحد منابع انسانی نگهداری می‌شود و این نسخه جنبهٔ اطلاع‌رسانی و تأیید دارد.</div>

${sigsHtml([
    { label: 'کارفرما', name: d.employerSigner || 'هایپر زیتون', hint: 'مهر و امضای مجاز فروشگاه' },
    { label: 'کارمند', name: d.employeeName, hint: 'امضا به عنوان قبولی کلیهٔ مفاد' },
  ])}

<div class="doc-meta" style="text-align:left;margin-top:9px">تاریخ تنظیم: ${toFa(today)}</div>`

  return shell({
    kind: 'contract',
    title: 'قرارداد کار',
    code: d.code || opts?.code,
    date: opts?.date || d.date,
    time: opts?.time,
    watermark: opts?.watermark ?? d.watermark ?? true,
    body,
  })
}

/** ۹) رسید حقوق (فیش) — A4 رسمی (R4-6) */
export function payslipDocHTML(data: PayslipDocData, opts?: DocOpts): string {
  const d = data || {}
  const monthLabel = d.monthLabel
    || ((d.year && d.month) ? `${J_MONTHS[+d.month - 1] || ''} ${toFa(+d.year)}` : '')
  const ot = +(d.overtimeMinutes ?? 0) || 0
  const absence = +(d.absenceDays ?? 0) || 0
  const adj = +(d.adjustment ?? 0) || 0

  const childTotal = d.childTotal !== undefined && d.childTotal !== null
    ? +d.childTotal
    : (+(d.childAllowance ?? 0) || 0) * (+(d.children ?? 0) || 0)
  const seniorityTotal = d.seniorityTotal !== undefined && d.seniorityTotal !== null
    ? +d.seniorityTotal
    : (+(d.seniorityDaily ?? 0) || 0) * 30

  /* مزایا (اضافات) */
  type Row = { label: string; hint?: string; amount: number }
  const addRows: Row[] = [
    { label: 'حقوق پایه', amount: +(d.base ?? 0) || 0 },
    { label: 'کمک‌هزینهٔ مسکن', amount: +(d.housing ?? 0) || 0 },
    { label: 'کمک‌هزینهٔ خواربار', amount: +(d.food ?? 0) || 0 },
    { label: 'حق اولاد', hint: (+(d.children ?? 0) || 0) > 0 ? `${toFa(+(d.children ?? 0) || 0)} فرزند` : undefined, amount: childTotal },
    { label: 'پایهٔ سنوات', hint: seniorityTotal > 0 ? `روزانه ${money(+(d.seniorityDaily ?? 0) || 0)} × ${toFa(30)}` : undefined, amount: seniorityTotal },
    { label: 'اضافه‌کاری', hint: ot > 0 ? `${toFa(ot)} دقیقه` : undefined, amount: +(d.overtimePay ?? 0) || 0 },
  ]
  if (adj > 0) addRows.push({ label: 'تعدیل / مزایای سایر', amount: adj })
  for (const er of (Array.isArray(d.extraRows) ? d.extraRows : [])) {
    const e = er || {}
    addRows.push({ label: e.label || 'سایر مزایا', amount: +e.amount || 0 })
  }

  /* کسورات */
  const dedRows: Row[] = [
    { label: 'بیمهٔ سهم کارمند', hint: '۷٪ حقوق و مزایا', amount: +(d.insurance ?? 0) || 0 },
    { label: 'مالیات بر درآمد', amount: +(d.tax ?? 0) || 0 },
    { label: 'کسر غیبت', hint: absence > 0 ? `${toFa(absence)} روز` : undefined, amount: +(d.absenceDeduction ?? 0) || 0 },
  ]
  if (adj < 0) dedRows.push({ label: 'تعدیل کسوری', amount: -adj })
  for (const er of (Array.isArray(d.extraDeductions) ? d.extraDeductions : [])) {
    const e = er || {}
    dedRows.push({ label: e.label || 'سایر کسورات', amount: +e.amount || 0 })
  }

  const additionsTotal = addRows.reduce((s, r) => s + r.amount, 0)
  const deductionsTotal = dedRows.reduce((s, r) => s + r.amount, 0)
  const gross = d.gross !== undefined && d.gross !== null ? +d.gross : additionsTotal
  const net = d.net !== undefined && d.net !== null ? +d.net : (gross - deductionsTotal)

  const addHtml = addRows.map((r, i) => `<tr>
<td class="c">${toFa(i + 1)}</td>
<td><b>${esc(r.label)}</b>${r.hint ? `<div style="font-size:9px;color:#78716c">${esc(r.hint)}</div>` : ''}</td>
<td class="num">${money(r.amount)}</td>
</tr>`).join('')
  const dedHtml = dedRows.map((r, i) => `<tr>
<td class="c">${toFa(i + 1)}</td>
<td><b>${esc(r.label)}</b>${r.hint ? `<div style="font-size:9px;color:#78716c">${esc(r.hint)}</div>` : ''}</td>
<td class="num">${money(r.amount)}</td>
</tr>`).join('')

  const body = `
<div class="row2">
  ${boxHtml('مشخصات کارمند', kvHtml([
    { k: 'نام و نام خانوادگی', v: orNA(d.honorific ? `${d.honorific} ${d.staffName || ''}`.trim() : d.staffName) },
    { k: 'سمت شغلی', v: orNA(d.jobTitle) },
    { k: 'واحد سازمانی', v: orNA(d.department) },
    { k: 'کد ملی', v: d.nationalId ? `<span class="num">${toFa(d.nationalId)}</span>` : NA },
  ]))}
  ${boxHtml('مشخصات فیش', `<div style="display:flex;flex-direction:column;gap:7px;align-items:flex-start">
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      ${chipHtml('دوره: ' + (monthLabel || '—'), 'emerald')}
      ${ot > 0 ? chipHtml(`اضافه‌کاری: ${toFa(ot)} دقیقه`, 'teal') : ''}
      ${absence > 0 ? chipHtml(`غیبت: ${toFa(absence)} روز`, 'amber') : ''}
    </div>
    ${kvHtml([
      { k: 'کارت بانکی', v: maskCard(d.bankCard) ? `<span class="num">${maskCard(d.bankCard)}</span>` : NA },
      { k: 'شبا', v: d.shaba ? `<span class="num">${toFa(d.shaba)}</span>` : NA },
    ])}
  </div>`)}
</div>

<div class="sec-title">مزایا و اضافات</div>
<table class="tbl">
<thead><tr><th class="c" style="width:34px">ردیف</th><th>شرح</th><th class="c" style="width:130px">مبلغ (ریال)</th></tr></thead>
<tbody>${addHtml}</tbody>
<tfoot><tr><td colspan="2" style="text-align:right">جمع مزایا و اضافات</td><td class="num">${money(additionsTotal)}</td></tr></tfoot>
</table>

<div class="sec-title">کسورات</div>
<table class="tbl">
<thead><tr><th class="c" style="width:34px">ردیف</th><th>شرح</th><th class="c" style="width:130px">مبلغ (ریال)</th></tr></thead>
<tbody>${dedHtml}</tbody>
<tfoot><tr><td colspan="2" style="text-align:right">جمع کسورات</td><td class="num">${money(deductionsTotal)}</td></tr></tfoot>
</table>

<div class="totwrap"><div class="totbox">
  <div class="trow"><span class="lbl">جمع حقوق و مزایا (ناخالص)</span><span class="val">${money(gross)} ریال</span></div>
  <div class="trow"><span class="lbl">جمع کسورات</span><span class="val">${money(deductionsTotal)} ریال</span></div>
  <div class="grand"><span class="lbl">خالص پرداختی</span><span class="val">${money(net)} ریال</span></div>
</div></div>
${wordsBox(net, true)}

<div class="stamp-row">
  <div class="tracking">
    <div class="t-label">شمارهٔ فیش</div>
    <div class="t-code">${d.code ? esc(d.code) : (monthLabel ? esc(monthLabel) : '—')}</div>
  </div>
  <div class="stampbox">محل مهر فروشگاه</div>
</div>

${sigsHtml([
    { label: 'تنظیم‌کننده', name: d.authorName, hint: 'واحد حقوق و دستمزد' },
    { label: 'تأییدکننده', hint: 'مدیر مالی / مدیر عامل' },
    { label: 'رسید دریافت', hint: 'امضای کارمند' },
  ])}`

  return shell({
    kind: 'payslip',
    title: 'رسید حقوق',
    code: d.code || opts?.code,
    date: opts?.date || d.date,
    time: opts?.time,
    watermark: opts?.watermark ?? d.watermark ?? false,
    body,
  })
}

/* ══════════════════════════════════════════════════════════════════
 * ۷) توزیع‌کننده + چاپ
 * ══════════════════════════════════════════════════════════════════ */

/** ساخت سند کامل بر اساس نوع — در Node هم اجرا می‌شود */
export function docHTML(kind: DocKind | string, data: AnyDocData | Record<string, unknown>, opts?: DocOpts): string {
  const d: any = data || {}
  switch (kind) {
    case 'return': return returnDocHTML(d, opts)
    case 'return-thermal': return returnThermalHTML(d, opts)
    case 'order': return orderDocHTML(d, opts)
    case 'cheque': return chequeDocHTML(d, opts)
    case 'handover': return handoverDocHTML(d, opts)
    case 'performance': return performanceDocHTML(d, opts)
    case 'problems': return problemsDocHTML(d, opts)
    case 'stockcount': return stockcountDocHTML(d, opts)
    case 'contract': return contractDocHTML(d, opts)
    case 'payslip': return payslipDocHTML(d, opts)
    default: throw new Error(`نوع سند پشتیبانی نمی‌شود: ${String(kind)}`)
  }
}

/**
 * چاپ/ذخیرهٔ PDF سند — فقط سمت مرورگر.
 * پورت وفادار printHTML از lib/ui.tsx (iframe مخفی + @page + فونت‌ها).
 */
export function printDoc(kind: DocKind | string, data: AnyDocData | Record<string, unknown>, opts?: { width?: string } & DocOpts): void {
  const html = docHTML(kind, data, opts)
  const width = (opts && opts.width) || (kind === 'return-thermal' ? '80mm' : '210mm')
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.right = '-10000px'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc) { frame.remove(); return }
  doc.open()
  doc.write(html.replace('</head>', `<style>@page{size:${width} auto;margin:0}</style></head>`))
  doc.close()
  const doPrint = () => {
    try { frame.contentWindow?.focus(); frame.contentWindow?.print() } catch { /* ignore */ }
    setTimeout(() => frame.remove(), 4000)
  }
  setTimeout(() => {
    try {
      const f = (frame.contentWindow as any)?.document?.fonts
      if (f?.ready?.then) f.ready.then(() => setTimeout(doPrint, 120))
      else doPrint()
    } catch { doPrint() }
  }, 350)
}

/* ══════════════════════════════════════════════════════════════════
 * ۸) پیش‌نمایش درون‌برنامه‌ای (تنها مصرف‌کنندهٔ پل hz)
 * ══════════════════════════════════════════════════════════════════ */

export interface DocPreviewProps {
  kind: DocKind
  data?: AnyDocData | Record<string, unknown>
  className?: string
  /** بزرگ‌نمایی پیش‌نمایش (پیش‌فرض ۰٫۸۵) */
  scale?: number
}

/** پیش‌نمایش سند در iframe کوچک‌شده — پیش از چاپ */
export function DocPreview(props: DocPreviewProps) {
  const { kind, data = {}, className, scale = 0.85 } = props
  let html = ''
  try { html = docHTML(kind, data) } catch { html = '<!DOCTYPE html><html dir="rtl"><body style="font-family:Tahoma;padding:24px;color:#9f1239">خطا در تولید سند</body></html>' }
  const thermal = kind === 'return-thermal'
  return jsx('div', {
    className: 'w-full overflow-auto rounded-xl border border-stone-200 bg-stone-100' + (className ? ' ' + className : ''),
    style: { height: '600px' },
    children: jsx('div', {
      style: { width: 'fit-content', margin: '0 auto', transform: `scale(${scale})`, transformOrigin: 'top center' },
      children: jsx('iframe', {
        title: 'پیش‌نمایش سند',
        srcDoc: html,
        style: {
          width: thermal ? '80mm' : '210mm',
          height: thermal ? '170mm' : '297mm',
          border: '0',
          background: '#fff',
          display: 'block',
          borderRadius: '10px',
          boxShadow: '0 6px 24px rgba(0,0,0,.10)',
        },
      }),
    }),
  })
}
