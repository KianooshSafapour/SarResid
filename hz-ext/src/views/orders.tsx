import { toFaDigits,
  useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn,
  Button, Input, Card, CardContent, CardHeader, CardTitle, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Tabs, TabsContent, TabsList, TabsTrigger,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Popover, Checkbox,
  money, fa, toman, toEnDigits, todayJalali, addJalaliDays,
  formatJalaliLong, parseJalali, formatJalali, JALALI_MONTHS, jalaliMonthLength, WEEKDAY_FA, I,
  JalaliDate, MoneyInput, NumInput, printHTML,
} from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   supply/orders — «سفارش‌گذاری هوشمند» (نسخهٔ جدولی R3)
   جریان اصلی: انتخاب طرف حساب (نخستین کارت) → جست‌وجوی فازی کالا
   (مثل «بیژن») → جدول RTL نتایج (نام، موجودی، آخرین سفارش، قیمت،
   استپر «عدد»، استپر «کارتن») — هر +/− یا چیپ +N همان لحظه
   مستقیم در سبد می‌نشیند (بدون دکمهٔ «افزودن») → ثبت با تاریخ‌گیر
   جلالی و برآورد هزینه. سبد: استپر عدد/کارتن + قیمت قابل اصلاح.
   Tabs: سفارش جدید | سفارش‌ها | تقویم پرداخت

   R9-V2 — بازطراحی تب «سفارش جدید»:
   (الف) جدولِ واقعیِ هم‌تراز: گرید با ستون‌های ثابت برای سربرگ و همهٔ
        سطرهای سبد (نام تک‌خطی truncate+title، ردیف‌های هم‌قد min-h،
        چیپ‌های افزودن سریع همیشه زیر استپر، درون overflow-x-auto)؛
        جدول نتایج جست‌وجو هم با همان نظم (نام truncate، قیمت راست‌چین،
        خوشهٔ «افزودن سریع» ثابت در انتهای ردیف).
   (ب) سابقهٔ خرید هلو: بعد از هر جست‌وجو، /api/trades?lastBuys=1 برای
        شناسه‌های تازه (کش روی productId در ref) → چیپ «آخرین خرید:
        ماه · تعداد» در ردیف نتیجه + خط دوم سطر سبد؛ بدون سابقه =
        «بدون سابقهٔ خرید».
   (ج) اندازهٔ کارتنِ ماندگار: پیش‌فرضِ ثبت‌شده روی خود کالا
        (Product.unitsPerCarton از full=1 جست‌وجو — بدون درخواست اضافه)
        بلافاصله کار می‌کند؛ دیالوگ فقط برای کالای بی‌اندازه باز می‌شود و
        با تأیید، اندازه PATCH می‌شود (fire-and-forget) + توست
        «اندازهٔ کارتن این کالا ذخیره شد».
   (د) پنل ضایعاتِ تأمین‌کننده: با انتخاب طرف حساب، اقلام PENDING از
        /api/store/waste?supplierId&status=PENDING می‌آید؛ همه به‌طور
        پیش‌فرض تیک می‌خورند؛ wasteIds در POST /api/orders می‌نشیند و
        سرور آنها را SELECTED (برگشت با همین سفارش) می‌کند.
   ───────────────────────────────────────────────────────────── */

const PAY_LABEL: Record<string, string> = { CASH: 'نقدی', CHEQUE: 'چک', POS: 'کارتخوان (POS)' }
const PAY_CLS: Record<string, string> = {
  CASH: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CHEQUE: 'bg-amber-100 text-amber-700 border-amber-200',
  POS: 'bg-teal-50 text-teal-800 border-teal-200',
}
const ORDER_STATUS_FA: Record<string, string> = {
  DRAFT: 'پیش‌نویس', SUBMITTED: 'در انتظار تأیید', APPROVED: 'تأیید‌شده (آماده دریافت)',
  RECEIVING: 'در حال دریافت', RECEIVED: 'دریافت‌شده', VERIFIED: 'راستی‌آزمایی‌شده',
  ACCOUNTED: 'ثبت‌شده در حسابداری', DONE: 'تکمیل‌شده', CANCELLED: 'لغو‌شده',
}
const ORDER_STATUS_CLS: Record<string, string> = {
  DRAFT: 'bg-stone-100 text-stone-600 border-stone-200',
  SUBMITTED: 'bg-amber-100 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  RECEIVING: 'bg-teal-50 text-teal-800 border-teal-200',
  RECEIVED: 'bg-teal-50 text-teal-800 border-teal-200',
  VERIFIED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ACCOUNTED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  DONE: 'bg-emerald-600 text-white border-emerald-600',
  CANCELLED: 'bg-rose-100 text-rose-700 border-rose-200',
}
const CHEQUE_STATUS_FA: Record<string, string> = {
  PENDING_OWNER: 'در انتظار امضا', SIGNED: 'امضا‌شده', DELIVERED: 'تحویل‌شده',
  CLEARED: 'پرداخت‌شده', REJECTED: 'ردشده', RETURNED: 'برگشتی', BOUNCED: 'برگشت خورد',
}
const PLAN_STATUS_FA: Record<string, string> = { PLANNED: 'برنامه‌ریزی‌شده', CONFIRMED: 'تأیید‌شده', DONE: 'انجام‌شده' }

/* R8: وضعیت هر قلم در دریافت کالا */
const ITEM_STATUS_FA: Record<string, string> = {
  PENDING: 'در انتظار', OK: 'کامل', PARTIAL: 'کسری', MISSING: 'نرسید',
  PARTIAL_RETURN: 'مرجوعی جزئی', RETURNED: 'کامل مرجوع', REJECTED: 'ردشده',
}
const ITEM_STATUS_CLS: Record<string, string> = {
  PENDING: 'bg-stone-100 text-stone-600 border-stone-200',
  OK: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-amber-100 text-amber-700 border-amber-200',
  MISSING: 'bg-rose-100 text-rose-700 border-rose-200',
  PARTIAL_RETURN: 'bg-amber-100 text-amber-800 border-amber-300',
  RETURNED: 'bg-rose-100 text-rose-700 border-rose-300',
  REJECTED: 'bg-rose-100 text-rose-700 border-rose-200',
}

/* R8: علت‌های مرجوعی جزئی هنگام دریافت */
const RETURN_REASONS = ['شکسته/مخدوش', 'قیمت چاپی متفاوت', 'تاریخ انقضا گذشته', 'کالای اشتباه', 'دیگر']

/* ── helpers ─────────────────────────────────────────────── */
function pad2(n: number) { return String(n).padStart(2, '0') }

function normDate(s: string): string {
  const v = toEnDigits(String(s || '')).trim().replace(/\//g, '-')
  const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return v
  return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`
}

function numify(raw: string): number {
  return Number(toEnDigits(String(raw)).replace(/[^\d]/g, '')) || 0
}

/** تاریخ شمسی با ارقام فارسی و «/» — هرگز خط تیره */
function faDate(s: string | null | undefined): string {
  return toFaDigits(String(s ?? '')).replace(/-/g, '/')
}

function jShort(v: any): string {
  try {
    const d = new Date(v)
    return isNaN(d.getTime()) ? '' : toFaDigits(formatJalali(d)).replace(/-/g, '/')
  } catch { return '' }
}

/* R8: وضعیت هر قلم پس از دریافت — همان فرمول سرور (هماهنگ با /api/orders/[id]) */
function computeItemStatus(qty: number, receivedQty: number, returnedQty: number): string {
  if (receivedQty <= 0) return 'MISSING'
  if (qty > 0 && returnedQty >= qty) return 'RETURNED'
  if (returnedQty > 0) return 'PARTIAL_RETURN'
  if (receivedQty >= qty) return 'OK'
  return 'PARTIAL'
}

/* ── atoms ───────────────────────────────────────────────── */
function PayBadge({ v }: { v?: string }) {
  return <span className={cn('rounded-md border px-2 py-0.5 text-[11px] font-medium', PAY_CLS[v ?? ''] || 'bg-stone-100 text-stone-600 border-stone-200')}>{PAY_LABEL[v ?? ''] || v}</span>
}

/* ═══ R8: نسخهٔ چاپی A4 سفارش — برای دیالوگ بازبینی (دکمهٔ «چاپ») ═══ */
function orderPrintHTML(d: any): string {
  const rows = (d.items ?? [])
    .map(
      (it: any, i: number) => `<tr>
        <td style="padding:6px 8px;border:1px solid #d6d3d1;text-align:center;color:#78716c">${fa(i + 1)}</td>
        <td style="padding:6px 8px;border:1px solid #d6d3d1;font-weight:700">${it.name ?? ''}</td>
        <td style="padding:6px 8px;border:1px solid #d6d3d1;text-align:center">${fa(it.qty ?? 0)}</td>
        <td style="padding:6px 8px;border:1px solid #d6d3d1;text-align:center;color:#57534e">${it.cartonQty ? `${fa(it.cartonQty)} × ${fa(it.unitsPerCarton || 0)}` : '—'}</td>
        <td style="padding:6px 8px;border:1px solid #d6d3d1;text-align:center">${money(it.unitBuyPrice)}</td>
        <td style="padding:6px 8px;border:1px solid #d6d3d1;text-align:center">${money(it.printedPrice)}</td>
        <td style="padding:6px 8px;border:1px solid #d6d3d1;text-align:center;font-weight:800">${money((it.qty ?? 0) * (it.unitBuyPrice ?? 0))}</td>
      </tr>`,
    )
    .join('')
  const meta: [string, string][] = [
    ['طرف حساب', d.supplierName || 'بدون تأمین‌کننده'],
    ['تاریخ تحویل', d.deliveryDate ? faDate(d.deliveryDate) : '—'],
    ['روش پرداخت', PAY_LABEL[d.payMethod] ?? d.payMethod ?? '—'],
  ]
  if (d.payMethod === 'CHEQUE') meta.push(['مهلت چک', (d.chequeDays ?? 0) > 0 ? `${fa(d.chequeDays)} روز` : 'بدون مهلت مشخص'])
  meta.push(['ثبت‌کننده', d.createdBy?.fullName ?? '—'])
  meta.push(['تاریخ ثبت', jShort(d.createdAt)])
  meta.push(['وضعیت', ORDER_STATUS_FA[d.status] ?? d.status ?? '—'])
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><title>سفارش ${toFaDigits(d.code ?? '')}</title>
<style>
@page{size:210mm auto;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0}
body{font-family:'Vazirmatn','Segoe UI',Tahoma,sans-serif;color:#292524;font-size:12px;line-height:1.9;background:#fff}
.sheet{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:12mm 13mm}
.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.hd-name{font-size:22px;font-weight:800;color:#065f46}
.hd-sub{font-size:10.5px;font-weight:600;color:#57534e}
.hd-doc{text-align:left}
.doc-title{font-size:16px;font-weight:800;color:#1c1917}
.doc-code{font-size:11px;color:#57534e;margin-top:4px;font-family:monospace}
.rule{height:3px;border-radius:2px;background:linear-gradient(to left,#065f46,#047857 45%,#14b8a6);margin:9px 0 13px}
.kv{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 14px;border:1px solid #e7e5e4;border-radius:11px;padding:9px 12px;background:#fafaf9;margin-bottom:12px}
.kv .k{font-size:9px;color:#78716c}
.kv .v{font-size:12px;font-weight:700;color:#1c1917}
table{width:100%;border-collapse:collapse;font-size:11.5px}
thead th{background:#065f46;color:#fff;padding:7px 8px;border:1px solid #047857;font-size:11px}
.tot td{background:#ecfdf5;font-weight:800;color:#065f46}
.note{margin-top:10px;border:1px dashed #d6d3d1;border-radius:9px;padding:8px 12px;font-size:11px;color:#57534e}
.ft{margin-top:14px;display:flex;justify-content:space-between;font-size:10px;color:#a8a29e}
</style></head>
<body><div class="sheet">
  <div class="hd">
    <div>
      <div class="hd-name">هایپر زیتون</div>
      <div class="hd-sub">سامانهٔ جامع سر رسید — سفارش‌گذاری</div>
    </div>
    <div class="hd-doc">
      <div class="doc-title">سفارش خرید</div>
      <div class="doc-code">${toFaDigits(d.code ?? '')}</div>
    </div>
  </div>
  <div class="rule"></div>
  <div class="kv">
    ${meta.map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}
  </div>
  <table>
    <thead><tr>
      <th style="width:26px">#</th><th>شرح کالا</th><th style="width:52px">تعداد</th><th style="width:74px">کارتن</th>
      <th style="width:84px">قیمت واحد (ریال)</th><th style="width:84px">قیمت چاپی</th><th style="width:96px">جمع سطر (ریال)</th>
    </tr></thead>
    <tbody>
      ${rows}
      <tr class="tot"><td colspan="6" style="padding:7px 8px;border:1px solid #047857;text-align:left">جمع کل (${fa((d.items ?? []).length)} قلم)</td>
      <td style="padding:7px 8px;border:1px solid #047857;text-align:center">${money(d.totalAmount)}</td></tr>
    </tbody>
  </table>
  ${d.note ? `<div class="note"><b>یادداشت:</b> ${d.note}</div>` : ''}
  <div class="ft"><span>چاپ: ${toFaDigits(formatJalali(new Date()))}</span><span>هایپر زیتون — Hyper Zeytoon</span></div>
</div></body></html>`
}

function OrderStatusBadge({ v }: { v?: string }) {
  return <span className={cn('rounded-md border px-2 py-0.5 text-[11px] font-medium', ORDER_STATUS_CLS[v ?? ''] || 'bg-stone-100 text-stone-600 border-stone-200')}>{ORDER_STATUS_FA[v ?? ''] || v}</span>
}

/** موجودی — قرمز بحرانی / کهربایی کم / سبز کافی */
function StockView({ stock, threshold }: { stock: number; threshold: number | null | undefined }) {
  const t = threshold && threshold > 0 ? threshold : 6
  const low = stock <= t
  const mid = !low && stock <= t * 2
  const cls = low ? 'bg-rose-100 text-rose-700 border-rose-200' : mid ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'
  const label = low ? 'بحرانی' : mid ? 'کم' : 'کافی'
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold', cls)}>
      <I.package size={12} /> {fa(stock)} — {label}
    </span>
  )
}

/* ── استپر تایپی: دکمه‌های ± + ورود مستقیم عدد (هم فارسی هم انگلیسی) ── */
function NumStepper(props: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  hint?: string
  /** تغییر این عدد = پالس بصری روی مقدار (بازخورد افزودن سریع) */
  bumpKey?: number
  disabled?: boolean
}) {
  const { value, onChange, min = 0, max = 9999, step = 1, hint, bumpKey = 0, disabled } = props
  const [txt, setTxt] = useState<string | null>(null) // null = نمایش مقدار والد
  const [big, setBig] = useState(false)

  /* هر تغییر بیرونی مقدار (دکمه / چیپ / والد) متنِ در حال ویرایش را رها می‌کند */
  useEffect(() => { setTxt(null) }, [value])

  /* پالس بصری: بزرگ‌شدن لحظه‌ای عدد هنگام افزودن سریع */
  useEffect(() => {
    if (!bumpKey) return
    setBig(true)
    const t = setTimeout(() => setBig(false), 320)
    return () => clearTimeout(t)
  }, [bumpKey])

  const shown = txt ?? toFaDigits(String(value))
  const btn = 'flex h-9 w-9 items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-stone-100 active:scale-95 disabled:opacity-30'
  const commit = (n: number) => onChange(Math.max(min, Math.min(max, n)))
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-stone-200 bg-white p-1" dir="rtl">
        <button type="button" className={btn} disabled={disabled || value <= min}
          onClick={() => { setTxt(null); commit(value - step) }}
          aria-label="کم کردن" title="کم کردن (یک واحد)">
          <I.minus size={14} />
        </button>
        <input
          dir="ltr"
          inputMode="numeric"
          disabled={disabled}
          aria-label={hint || 'مقدار'}
          className="num h-9 w-16 rounded-md border-0 bg-transparent text-center text-sm font-bold tabular-nums text-stone-700 focus:outline-none"
          style={{ transform: big ? 'scale(1.18)' : 'scale(1)', transition: 'transform 210ms cubic-bezier(.34,1.56,.64,1)' }}
          value={shown}
          onChange={(e: any) => {
            const cleaned = toEnDigits(String(e.target.value ?? '')).replace(/[^\d]/g, '')
            setTxt(toFaDigits(cleaned))
            commit(Number(cleaned) || 0)
          }}
          onBlur={() => setTxt(null)}
        />
        <button type="button" className={btn} disabled={disabled || value >= max}
          onClick={() => { setTxt(null); commit(value + step) }}
          aria-label="زیاد کردن" title="زیاد کردن (یک واحد)">
          <I.plus size={14} />
        </button>
      </div>
      {hint && <span className="text-[9.5px] text-stone-400">{hint}</span>}
    </div>
  )
}

/* ── کمبوباکس تأمین‌کننده: جست‌وجوی زنده + فهرست بازشو در «یک» کنترل ──
   دکمهٔ ماشه = مقدار فعلی؛ پنل = جست‌وجو (نام/کد/تلفن) + گزینهٔ سنجاق‌شدهٔ «بدون تأمین‌کننده»؛
   کیبورد: ↑/↓ جابه‌جایی گزینهٔ فعال (با چرخش)، Enter انتخاب، Esc بستن؛ کلیک بیرون می‌بندد. */
function SupplierCombo(props: { suppliers: any[]; value: string; onChange: (v: string) => void }) {
  const { suppliers, value, onChange } = props
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const boxRef = useRef<any>(null)
  const listRef = useRef<any>(null)

  const norm = (s: any) => toEnDigits(String(s ?? '')).trim().toLowerCase()
  const nq = norm(q)
  const filtered = useMemo(() => {
    if (!nq) return suppliers
    return suppliers.filter((s: any) =>
      norm(s.name).includes(nq) || norm(s.code).includes(nq) || norm(s.phone).includes(nq))
  }, [suppliers, nq])

  /* کل باز شدن: جست‌وجوی تازه + گزینهٔ فعال روی «بدون تأمین‌کننده» */
  useEffect(() => { if (open) { setQ(''); setActive(0) } }, [open])

  /* بستن با کلیک بیرون (همان الگوی تاریخ‌گیر جلالی) */
  useEffect(() => {
    if (!open) return
    const onDoc = (e: any) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  /* گزینهٔ فعال همیشه در دید بماند */
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector?.(`[data-idx="${active}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [active, open])

  const total = filtered.length + 1 // + گزینهٔ سنجاق‌شدهٔ «بدون تأمین‌کننده»
  const sel = suppliers.find((s: any) => s.id === value) ?? null
  const bal = (s: any) =>
    (s?.balance ?? 0) < 0 ? { t: 'بدهی', cls: 'bg-rose-100 text-rose-700' }
      : (s?.balance ?? 0) > 0 ? { t: 'اعتبار', cls: 'bg-emerald-100 text-emerald-700' }
        : { t: 'بدون بدهی', cls: 'bg-stone-100 text-stone-500' }

  function choose(v: string) { onChange(v); setOpen(false) }
  function onKey(e: any) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % total) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + total) % total) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (active <= 0) choose('none')
      else { const s = filtered[active - 1]; if (s) choose(s.id) }
    } else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  return (
    <Popover open={open} onOpenChange={(v: boolean) => setOpen(v)}>
      <div className="relative" ref={boxRef as any}>
        {/* ماشه: مقدار فعلی یا «بدون تأمین‌کننده» */}
        <Button type="button" variant="outline" role="combobox" aria-expanded={open}
          className="h-11 w-full justify-between"
          onClick={() => setOpen(!open)}>
          {sel ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-bold text-stone-700">{sel.name}</span>
              <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold', bal(sel).cls)}>{bal(sel).t}</span>
            </span>
          ) : value === 'none' ? (
            <span className="text-sm text-stone-600">بدون تأمین‌کنندهٔ مشخص</span>
          ) : (
            <span className="text-sm text-stone-400">بدون تأمین‌کننده <span className="text-[10px]">({fa(suppliers.length)} فعال)</span></span>
          )}
          <I.chevronDown size={16} className={cn('shrink-0 text-stone-400 transition-transform', open && 'rotate-180')} />
        </Button>

        {open && (
          <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-stone-200 bg-white p-2 shadow-xl" dir="rtl">
            <div className="relative mb-2">
              <I.search size={15} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-stone-400" />
              <Input autoFocus value={q} onChange={(e: any) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="جست‌وجوی نام / کد / تلفن تأمین‌کننده…" className="h-10 pr-9 text-sm" />
            </div>
            <div ref={listRef} role="listbox" aria-label="فهرست تأمین‌کنندگان" className="max-h-64 overflow-y-auto">
              {/* گزینهٔ سنجاق‌شده: بدون تأمین‌کنندهٔ مشخص */}
              <button type="button" data-idx="0" role="option" aria-selected={value === 'none'}
                onMouseEnter={() => setActive(0)} onClick={() => choose('none')}
                className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2.5 text-right transition-colors',
                  active === 0 && 'bg-stone-100', value === 'none' && 'bg-emerald-50 font-bold text-emerald-800')}>
                <span className="flex items-center gap-1.5 text-sm text-stone-600">
                  <I.x size={13} className="shrink-0 text-stone-400" />
                  <span>بدون تأمین‌کنندهٔ مشخص</span>
                </span>
                {value === 'none' && <I.check size={14} className="shrink-0 text-emerald-600" />}
              </button>
              {filtered.map((s: any, i: number) => {
                const ai = i + 1
                const isSel = s.id === value
                const b = bal(s)
                return (
                  <button key={s.id} type="button" data-idx={String(ai)} role="option" aria-selected={isSel}
                    onMouseEnter={() => setActive(ai)} onClick={() => choose(s.id)}
                    className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2.5 text-right transition-colors',
                      active === ai && 'bg-stone-100', isSel && 'bg-emerald-50')}>
                    <span className="flex min-w-0 flex-col items-start">
                      <span className={cn('truncate text-sm', isSel ? 'font-bold text-emerald-800' : 'font-medium text-stone-700')}>{s.name}</span>
                      <span className="text-[10px] text-stone-400" dir="rtl">
                        {s.code ? fa(s.code) : ''}{s.phone ? ` · ${fa(s.phone)}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold', b.cls)}>{b.t}</span>
                      {isSel && <I.check size={14} className="text-emerald-600" />}
                    </span>
                  </button>
                )
              })}
              {filtered.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-stone-400">تأمین‌کننده‌ای با «{fa(q)}» یافت نشد</p>
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-stone-200 px-2 pt-1.5 text-[10px] text-stone-400">
              <span>{fa(filtered.length)} از {fa(suppliers.length)} فعال</span>
              <span dir="rtl">↑↓ حرکت · Enter انتخاب · Esc بستن</span>
            </div>
          </div>
        )}
      </div>
    </Popover>
  )
}

/* ═════════ دیالوگ گردش کالا ═════════ */
function CirculationDialog({ open, onOpenChange, productId }: { open: boolean; onOpenChange: (o: boolean) => void; productId: string | null }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    if (!open || !productId) { setData(null); return }
    setLoading(true)
    api(`/api/products/${productId}/circulation`)
      .then((r: any) => { if (r.ok) setData(r.data); else { toast.error(r.error || 'گردش کالا دریافت نشد'); setData(null) } })
      .finally(() => setLoading(false))
  }, [open, productId])

  const s = data?.summary
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <I.barChart size={18} /> گردش کالا — {data?.product?.name ?? '…'}
          </DialogTitle>
          <DialogDescription>خرید، انبار و قیمت‌گذاری این کالا در یک نگاه — برای تصمیم سفارش</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-stone-500"><I.loader size={18} className="mx-auto mb-2 animate-spin" /> در حال دریافت گردش کالا…</p>
        ) : !data ? (
          <p className="py-8 text-center text-sm text-stone-400">داده‌ای یافت نشد</p>
        ) : (
          <div className="max-h-96 space-y-4 overflow-y-auto">
            {/* خلاصه */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { label: 'موجودی فعلی', value: `${fa(s.stock)} ${data.product.unit ?? ''}`, cls: s.stock <= (s.lowStockThreshold ?? 6) ? 'text-rose-700' : 'text-emerald-700' },
                { label: 'آخرین قیمت خرید', value: `${money(data.product.lastBuyPrice)} ریال` },
                { label: 'قیمت فروش', value: `${money(data.product.sellPrice)} ریال` },
                { label: 'فروش ماه اخیر', value: `${fa(s.monthlySold ?? 0)} عدد` },
                { label: 'دفعات خرید', value: `${fa(s.buyCount)} سفارش` },
                { label: 'زمان تأمین', value: `${fa(data.product.leadTimeDays ?? 1)} روز` },
              ].map((c) => (
                <div key={c.label} className="rounded-lg border border-stone-200 bg-stone-50 p-2">
                  <div className="text-[11px] text-stone-500">{c.label}</div>
                  <div className={cn('text-sm font-bold', c.cls ?? 'text-stone-700')}>{c.value}</div>
                </div>
              ))}
            </div>

            {s.avgBuyPrice != null && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-2.5 text-[11px] text-teal-800">
                بازهٔ بهای واحد در سودسنج: از {money(s.minBuyPrice)} تا {money(s.maxBuyPrice)} ریال (میانگین {money(s.avgBuyPrice)})
              </div>
            )}

            {/* تأمین‌کنندگان */}
            {Array.isArray(data.suppliers) && data.suppliers.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-bold text-stone-600">تأمین‌کنندگان این کالا</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.suppliers.map((sp: any, i: number) => {
                    const min = Math.min(...data.suppliers.map((x: any) => x.unitPrice ?? Infinity))
                    return (
                      <span key={i} className={cn('rounded-lg border px-2.5 py-1 text-[11px]',
                        sp.isPrimary ? 'border-teal-200 bg-teal-50 font-bold text-teal-800'
                        : (sp.unitPrice ?? 0) === min && data.suppliers.length > 1 ? 'border-emerald-400 bg-emerald-50 font-bold text-emerald-800'
                        : 'border-stone-200 bg-white text-stone-600')}>
                        {sp.supplierName} · <span dir="ltr">{money(sp.unitPrice)}</span> ریال{sp.perCarton ? ` · کارتن ×${fa(sp.perCarton)}` : ''}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* خریدها */}
            <div>
              <div className="mb-1.5 text-xs font-bold text-stone-600">سفارش‌ها و دریافت‌ها</div>
              {data.buys.length === 0 ? (
                <p className="rounded-lg bg-stone-50 p-2.5 text-[11px] text-stone-400">سفارشی برای این کالا ثبت نشده</p>
              ) : (
                <div className="space-y-1.5">
                  {data.buys.slice(0, 8).map((b: any, i: number) => (
                    <div key={i} className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-stone-200 p-2 text-[11px]">
                      <span className="font-mono font-bold" dir="ltr">{b.orderCode}</span>
                      <span className="text-stone-500">{b.supplierName || '—'}</span>
                      <span dir="ltr" className="text-stone-500">{jShort(b.orderedAt)}</span>
                      <span className="font-bold text-stone-700">
                        {fa(b.qty)} عدد{b.cartonQty ? ` (${fa(b.cartonQty)} کارتن)` : ''}
                      </span>
                      <span dir="ltr" className="font-bold text-stone-700">{money(b.unitBuyPrice)}</span>
                      <span className={cn('rounded px-1.5 py-0.5',
                        b.status === 'DONE' ? 'bg-emerald-100 text-emerald-700'
                        : b.status === 'CANCELLED' ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-700')}>
                        {ORDER_STATUS_FA[b.status] ?? b.status}
                      </span>
                      {b.deliveryDate && <span dir="ltr" className="text-stone-400">تحویل: {faDate(b.deliveryDate)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* سودسنج */}
            <div>
              <div className="mb-1.5 text-xs font-bold text-stone-600">کنترل‌های سودسنج (بهای واحد ← قیمت چاپی)</div>
              {data.margins.length === 0 ? (
                <p className="rounded-lg bg-stone-50 p-2.5 text-[11px] text-stone-400">کنترل قیمتی ثبت نشده</p>
              ) : (
                <div className="space-y-1.5">
                  {data.margins.slice(0, 6).map((m: any, i: number) => (
                    <div key={i} className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-stone-200 p-2 text-[11px]">
                      <span dir="ltr" className="text-stone-500">{m.dateJalali ? fa(m.dateJalali) : jShort(m.createdAt)}</span>
                      <span>{fa(m.quantity)} عدد</span>
                      <span dir="ltr">بهای واحد: <b>{money(m.unitCost)}</b></span>
                      <span dir="ltr">چاپی: <b>{money(m.printedPrice)}</b></span>
                      {m.marginPct != null && (
                        <span className={cn('rounded px-1.5 py-0.5 font-bold',
                          m.marginPct < 12 ? 'bg-rose-100 text-rose-700' : m.marginPct < 21 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>
                          {fa(Math.round(m.marginPct))}٪
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* انبارگردانی */}
            <div>
              <div className="mb-1.5 text-xs font-bold text-stone-600">انبارگردانی‌ها</div>
              {data.counts.length === 0 ? (
                <p className="rounded-lg bg-stone-50 p-2.5 text-[11px] text-stone-400">انبارگردانی ثبت نشده</p>
              ) : (
                <div className="space-y-1.5">
                  {data.counts.slice(0, 6).map((c: any, i: number) => (
                    <div key={i} className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-stone-200 p-2 text-[11px]">
                      <span dir="ltr" className="text-stone-500">{c.dateJalali ? fa(c.dateJalali) : '—'}</span>
                      <span>سیستم: <b>{fa(c.systemQty)}</b></span>
                      <span>شمارش: <b>{fa(c.countedQty)}</b></span>
                      <span className={cn('rounded px-1.5 py-0.5 font-bold',
                        c.diff === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
                        {c.diff === 0 ? 'بدون مغایرت' : `${c.diff > 0 ? '+' : '−'}${fa(Math.abs(c.diff))}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ═════════ نمای اصلی ═════════ */
export default function OrdersView() {
  const { user, refreshBadges } = useShell()

  const [tab, setTab] = useState('new')
  const [loading, setLoading] = useState(true)

  /* جست‌وجوی فازی کالا */
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [circOf, setCircOf] = useState<string | null>(null)
  const [cartonAsk, setCartonAsk] = useState<any | null>(null) // {product, size, cartons} — درخواست اندازهٔ کارتن
  const searchTimerRef = useRef<any>(null)

  /* R5-F: حذف rowAmts — سطر جست‌وجو مستقیم به سبد می‌نویسد؛ سبد تنها منبع حقیقت است */
  /* اندازهٔ کارتن آموخته‌شده در همین نشست (پس از دیالوگ «اندازهٔ کارتن») */
  const [upcKnown, setUpcKnown] = useState<Record<string, number>>({})
  /* پالس بصری «افزودن سریع» (+N عدد / +۱ کارتن / +N تایی سبد) — کلید → شمارنده */
  const [bump, setBump] = useState<Record<string, number>>({})

  /* ── R9-V2 (ب): آخرین خرید واقعی هلو (Trades) برای ردیف‌های جست‌وجو و سبد ──
     بعد از هر جست‌وجو فقط شناسه‌های تازه از /api/trades?lastBuys=1 گرفته می‌شود؛
     کش روی شناسهٔ کالا در ref می‌ماند (با هر کلید زدن دوباره گرفته نمی‌شود). شکست = بی‌صدا. */
  const [lastBuys, setLastBuys] = useState<Record<string, any>>({})
  const lastBuyCacheRef = useRef<Record<string, any>>({})
  const lastBuyReqKeyRef = useRef('')

  /* ── R9-V2 (د): ضایعاتِ در انتظارِ همین تأمین‌کننده — برای برگشت با همین سفارش ──
     با انتخاب/تغییر/پاک‌شدن طرف حساب دوباره خوانده می‌شود؛ پیش‌فرض همهٔ اقلام علامت می‌خورند؛
     خانم لطفی آنچه را که باید بماند برمی‌دارد (آن قلم PENDING می‌ماند برای دفعات بعد). */
  const [waste, setWaste] = useState<any>(null)
  const [wasteChecked, setWasteChecked] = useState<Record<string, boolean>>({})
  const wasteReqRef = useRef(0)
  const wasteSelectedIds = useMemo(
    () => ((waste?.items ?? []) as any[]).filter((it) => wasteChecked[it.id]).map((it) => it.id),
    [waste, wasteChecked],
  )

  /* سبد خرید */
  const [cart, setCart] = useState<any[]>([])
  const [deliveryDate, setDeliveryDate] = useState(addJalaliDays(todayJalali(), 1))
  const [payMethod, setPayMethod] = useState('CASH')
  const [chequeDays, setChequeDays] = useState('') // R8: مهلت چک (روز) — خالی/۰ = بدون مهلت مشخص
  const [note, setNote] = useState('')
  const [defQty, setDefQty] = useState(6)
  const [defCarton, setDefCarton] = useState(1)
  const [busy, setBusy] = useState(false)

  /* تأمین‌کنندهٔ سفارش (اختیاری — برای یکجاسازی پرداخت) */
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState('')

  /* فهرست سفارش‌ها */
  const [list, setList] = useState<any[] | null>(null)
  const [counts, setCounts] = useState<any>(null)
  /* R10: پیش‌فرض فهرست سفارش‌ها = «همه» (قبلاً «در انتظار تأیید» بود) */
  const [statusF, setStatusF] = useState('all')
  const [listQ, setListQ] = useState('')

  /* دیالوگ‌ها */
  const [cancelDlg, setCancelDlg] = useState<any>(null)
  const [receiveDlg, setReceiveDlg] = useState<any>(null)
  const [reviewDlg, setReviewDlg] = useState<any>(null) // R8: بازبینی/ویرایش پیش از تأیید {order, detail, mode, edit…}
  const [verifyDlg, setVerifyDlg] = useState<any>(null) // R8: تأیید ناظر دریافت {order, detail}
  const [accountDlg, setAccountDlg] = useState<any>(null) // R8: کنترل سود و ثبت حسابداری {order, detail, rows}

  /* نقش‌ها — دکمه‌های مدیر/حسابدار (تأیید نهایی دسترسی روی سرور بررسی می‌شود) */
  const canApprove = !!user && ['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(String(user.role))
  const canAccount = !!user && ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC'].includes(String(user.role))

  /* تقویم پرداخت */
  const t0 = todayJalali()
  const [cal, setCal] = useState({ jy: +t0.slice(0, 4), jm: +t0.slice(5, 7) })
  const [plans, setPlans] = useState<any[]>([])
  const [cheques, setCheques] = useState<any[]>([])
  const [calErr, setCalErr] = useState('')
  const [calLoading, setCalLoading] = useState(false)
  const [selDay, setSelDay] = useState<string | null>(null)

  async function init() {
    await Promise.all([loadSuppliers(''), loadDefaults(), loadList(), loadCheques(), loadCalendar(cal.jy, cal.jm)])
    setLoading(false)
  }

  /* ── بارگذاری‌ها ── */
  async function loadSuppliers(tq: string) {
    // R7: همهٔ تأمین‌کنندگان فعال یکجا (نه فقط ۱۰۰تای اول) — طرف‌حساب‌هایی مثل «بانی چاو» دیگر گم نمی‌شوند
    const r = await api('/api/suppliers' + qs({ pageSize: 2400, sort: 'name', status: 'فعال', q: tq || undefined }))
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت تأمین‌کنندگان'); return }
    setSuppliers((r.data?.items ?? []).filter((s: any) => s.status === 'فعال'))
  }

  async function loadDefaults() {
    const r = await api('/api/defaults')
    if (!r.ok) return
    const d = r.data?.defaults ?? {}
    const nq = Number(d['order.qty'] ?? d['orderQty'] ?? d['defaults:order.qty'])
    const nc = Number(d['order.carton'] ?? d['orderCarton'] ?? d['defaults:order.carton'])
    if (nq > 0) setDefQty(nq)
    if (nc >= 0) setDefCarton(nc)
  }

  async function loadList(status?: string) {
    const st = status ?? statusF
    const r = await api('/api/orders' + qs({ status: st === 'all' ? '' : st, q: listQ || undefined, pageSize: 50 }))
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت سفارش‌ها'); setList([]); return }
    setList(r.data?.items ?? [])
    setCounts(r.data?.counts ?? null)
  }

  async function loadCheques() {
    const r = await api('/api/cheques')
    if (r.ok) setCheques(r.data?.items ?? [])
  }

  async function loadCalendar(jy: number, jm: number) {
    setCalLoading(true)
    const len = jalaliMonthLength(jy, jm)
    const r = await api('/api/payment-plans' + qs({ from: `${jy}-${pad2(jm)}-01`, to: `${jy}-${pad2(jm)}-${pad2(len)}` }))
    if (r.ok) { setPlans(r.data?.plans ?? []); setCalErr('') }
    else { setPlans([]); setCalErr(r.error || 'برنامه‌های پرداخت دریافت نشد') }
    setCalLoading(false)
  }

  /* بارگذاری اولیه — پس از اعلام همهٔ بارگذارها (قاعدهٔ react-hooks/immutability: دسترسی پس از اعلام) */
  useEffect(() => {
    void init()
  }, [])

  /* ── R9-V2 (د): ضایعاتِ در انتظارِ تأمین‌کنندهٔ انتخابی — با هر تغییر طرف حساب دوباره ──
     بدون تأمین‌کننده یا بدون قلم در انتظار → هیچ پنلی نمایش داده نمی‌شود (بی‌صدا). */
  async function loadWaste(sid: string) {
    const seq = ++wasteReqRef.current
    if (!sid || sid === 'none') { setWaste(null); setWasteChecked({}); return }
    setWaste(null); setWasteChecked({}) // پنل قبلی فوراً جمع شود
    try {
      const r = await api('/api/store/waste' + qs({ supplierId: sid, status: 'PENDING' }))
      if (seq !== wasteReqRef.current) return /* پاسخِ کهنهٔ یک انتخاب قبلی */
      if (!r.ok) return
      const items = r.data?.items ?? []
      if (!items.length) { setWaste(null); setWasteChecked({}); return }
      setWaste(r.data)
      const m: Record<string, boolean> = {}
      for (const it of items) m[it.id] = true /* پیش‌فرض: همه برای برگشت با همین سفارش علامت می‌خورند */
      setWasteChecked(m)
    } catch { /* بی‌صدا */ }
  }

  useEffect(() => { void loadWaste(supplierId) }, [supplierId])

  /* ── جست‌وجوی فازی (با تأخیر ۳۰۰ms) ── */
  function onQuery(v: string) {
    setQ(v)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    const t = toEnDigits(v).trim()
    if (t.length < 2) { setResults(null); setSearching(false); return }
    setSearching(true)
    searchTimerRef.current = setTimeout(() => void doSearch(t), 300)
  }

  async function doSearch(t: string) {
    const r = await api('/api/products/search' + qs({ q: t, full: '1', limit: 20 }))
    setSearching(false)
    if (!r.ok) { toast.error(r.error || 'خطا در جست‌وجو'); setResults([]); return }
    const products = r.data?.products ?? []
    setResults(products)
    void loadLastBuys(products) /* R9-V2 (ب): سابقهٔ خرید هلو برای همین نتایج */
  }

  /* ── R9-V2 (ب): آخرین خرید هلو — فقط شناسه‌های تازه (کش در ref؛ درخواست همزمان تکراری نمی‌رود؛ شکست بی‌صدا) ── */
  async function loadLastBuys(products: any[]) {
    const ids = (products ?? []).map((p: any) => String(p.id)).filter((id: string) => !(id in lastBuyCacheRef.current))
    if (!ids.length) return
    const key = ids.slice().sort().join(',')
    if (lastBuyReqKeyRef.current === key) return
    lastBuyReqKeyRef.current = key
    try {
      const r = await api('/api/trades?lastBuys=1&ids=' + encodeURIComponent(ids.join(',')))
      if (!r.ok) return
      for (const b of (r.data?.lastBuys ?? [])) lastBuyCacheRef.current[b.productId] = b
      setLastBuys({ ...lastBuyCacheRef.current })
    } catch { /* بی‌صدا — چیپ نمایش داده نمی‌شود */ }
  }

  /* ── قیمت/کارتن بهینه + اندازهٔ کارتن مؤثر ── */
  function bestPrice(p: any): number {
    const prim = (p.suppliers ?? []).find((s: any) => s.isPrimary && s.status === 'فعال')
    const cheap = (p.suppliers ?? []).filter((s: any) => s.status === 'فعال').sort((a: any, b: any) => (a.unitPrice ?? 0) - (b.unitPrice ?? 0))[0]
    return Number(prim?.unitPrice ?? cheap?.unitPrice ?? p.lastBuyPrice ?? 0) || 0
  }

  function bestCarton(p: any): number {
    const withC = (p.suppliers ?? []).find((s: any) => (s.perCarton ?? 0) > 0)
    return Number(withC?.perCarton ?? p.unitsPerCarton ?? 0) || 0
  }

  /** R9-V2 (ج): اندازهٔ کارتن مؤثر — آموختهٔ همین نشست ← پیش‌فرض ثبت‌شدهٔ کالا (شناسنامهٔ کالا؛
      با تأیید دیالوگ اندازهٔ کارتن روی خود کالا PATCH می‌شود و دفعهٔ بعد بدون پرسش کار می‌کند)
      ← بهترین مقدار کالا/تأمین‌کننده */
  function rowUpc(p: any): number {
    const known = Number(upcKnown[p.id] ?? 0)
    if (known > 0) return known
    const own = Number(p.unitsPerCarton ?? 0)
    if (own > 0) return own
    return bestCarton(p)
  }

  /* ═══ R5-F: افزودن مستقیم — سطر جست‌وجو همان کنترل سبد است ═══
     هر تغییر استپر/چیپ بلافاصله در سطر سبد می‌نشیند؛ سطر ۰-صفر خودکار حذف می‌شود. */
  function applyRow(p: any, next: { units?: number; cartons?: number; upc?: number }) {
    setCart((c) => {
      const idx = c.findIndex((l) => l.productId === p.id)
      const units = Math.max(0, Math.round(Number(next.units ?? 0) || 0))
      const cartons = Math.max(0, Math.round(Number(next.cartons ?? 0) || 0))
      if (idx === -1) {
        if (units < 1 && cartons < 1) return c // هیچ سطری برای ساخت نیست
        const unitPrice = bestPrice(p)
        const upc = Number(next.upc ?? rowUpc(p)) || 0
        return [...c, {
          productId: p.id,
          name: p.name,
          barcode: p.barcode ?? null,
          unit: p.unit ?? 'عدد',
          unitPrice,
          upc,
          sellPrice: Number(p.sellPrice ?? 0) || 0,
          stock: Number(p.stock ?? 0),
          lowThreshold: p.lowStockThreshold ?? null,
          qty: units,
          cartonQty: cartons,
        }]
      }
      const line = c[idx]
      const nq = next.units !== undefined ? units : Number(line.qty ?? 0)
      const nc = next.cartons !== undefined ? cartons : Number(line.cartonQty ?? 0)
      if (nq < 1 && nc < 1) return c.filter((_, i) => i !== idx) // سطر صفر-صفر = حذف از سبد
      const patch: any = {}
      if (next.units !== undefined) patch.qty = nq
      if (next.cartons !== undefined) patch.cartonQty = nc
      if (next.upc !== undefined) patch.upc = next.upc
      return c.map((l, i) => (i === idx ? { ...l, ...patch } : l))
    })
  }

  /** استپر «عدد» سطر — مقدار فعلی را از سبد می‌خواند و تغییر را همان‌جا می‌نویسد */
  function rowUnitsChange(p: any, v: number) {
    applyRow(p, { units: Math.max(0, Math.round(v || 0)) })
  }

  /** استپر «کارتن» سطر — افزایش با اندازهٔ ناشناس ⇒ دیالوگ اندازهٔ کارتن */
  function rowCartonChange(p: any, v: number) {
    const line = cart.find((l) => l.productId === p.id)
    const cur = Number(line?.cartonQty ?? 0)
    const n = Math.max(0, Math.round(v || 0))
    if (n > cur && rowUpc(p) <= 0) {
      setCartonAsk({ product: p, size: '12', cartons: Math.max(n, 1) })
      return
    }
    applyRow(p, { cartons: n, upc: rowUpc(p) || undefined })
  }

  /* ── افزودن سریع (چیپ‌های +N) — با پالس بصری، بدون توست ── */
  function quickAddUnits(p: any, n: number) {
    const line = cart.find((l) => l.productId === p.id)
    const cur = Number(line?.qty ?? 0)
    applyRow(p, { units: cur + Math.max(1, Math.round(n)) })
    setBump((m) => ({ ...m, [`u:${p.id}`]: (m[`u:${p.id}`] || 0) + 1 }))
  }

  function quickAddCarton(p: any) {
    const line = cart.find((l) => l.productId === p.id)
    const cur = Number(line?.cartonQty ?? 0)
    const add = Math.max(1, Math.round(defCarton || 1)) // پیش‌فرض کارتن از تنظیمات (order.carton)
    const next = cur + add
    if (rowUpc(p) <= 0) {
      setCartonAsk({ product: p, size: '12', cartons: next })
      return
    }
    applyRow(p, { cartons: next, upc: rowUpc(p) })
    setBump((m) => ({ ...m, [`b:${p.id}`]: (m[`b:${p.id}`] || 0) + 1 }))
  }

  function confirmCartonAsk() {
    if (!cartonAsk) return
    const size = numify(cartonAsk.size)
    if (size < 1) { toast.error('تعداد در هر کارتن را وارد کنید'); return }
    const p = cartonAsk.product
    const cartons = Math.max(1, Math.round(Number(cartonAsk.cartons ?? 1) || 1))
    setUpcKnown((m) => ({ ...m, [p.id]: size }))
    if (cartonAsk.cartIdx != null) {
      editLine(cartonAsk.cartIdx, 'cartonQty', String(cartons))
      editLine(cartonAsk.cartIdx, 'upc', String(size))
    } else {
      applyRow(p, { cartons, upc: size })
    }
    setBump((m) => ({ ...m, [`b:${p.id}`]: (m[`b:${p.id}`] || 0) + 1 }))
    setCartonAsk(null)
    /* R9-V2 (ج): ذخیرهٔ اندازه به‌عنوان پیش‌فرض کارتنِ خود کالا — fire-and-forget؛
       هرگز جریان سفارش را نمی‌بندد؛ حافظهٔ نشست (upcKnown) به‌هرحال کار می‌کند */
    void api(`/api/products/${p.id}`, { method: 'PATCH', body: { unitsPerCarton: size } })
      .then((r: any) => { if (r.ok) toast.info('اندازهٔ کارتن این کالا ذخیره شد') })
      .catch(() => {})
  }

  /** استپر «کارتن» سطرِ سبد — افزایش با اندازهٔ ناشناس ⇒ همان دیالوگ اندازهٔ کارتن */
  function cartCartonChange(idx: number, v: number) {
    const l = cart[idx]
    if (!l) return
    const cur = Number(l.cartonQty ?? 0)
    const n = Math.max(0, Math.round(v || 0))
    if (n > cur && Number(l.upc ?? 0) <= 0) {
      setCartonAsk({ product: { id: l.productId, name: l.name }, size: '12', cartons: Math.max(n, 1), cartIdx: idx })
      return
    }
    editLine(idx, 'cartonQty', String(n))
  }

  function editLine(idx: number, field: string, raw: string) {
    const n = numify(raw)
    setCart((c) => c.map((l, i) => (i === idx ? { ...l, [field]: n } : l)))
  }

  function removeLine(idx: number) {
    setCart((c) => c.filter((_, i) => i !== idx))
  }

  const lineCost = (l: any) =>
    (Number(l.qty) || 0) * (Number(l.unitPrice) || 0) +
    (Number(l.cartonQty) || 0) * (Number(l.upc) || 0) * (Number(l.unitPrice) || 0)

  const lineUnits = (l: any) => (Number(l.qty) || 0) + (Number(l.cartonQty) || 0) * (Number(l.upc) || 0)

  const total = useMemo(() => cart.reduce((s, l) => s + lineCost(l), 0), [cart])

  /* ── ثبت سفارش ── */
  async function submitOrder() {
    if (!cart.length) return toast.error('سبد خرید خالی است')
    const bad = cart.find((l) => (l.qty || 0) < 1 && (l.cartonQty || 0) < 1)
    if (bad) return toast.error(`تعداد «${bad.name}» را مشخص کنید`)
    const dd = normDate(deliveryDate)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dd)) return toast.error('تاریخ تحویل را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')

    const sup = suppliers.find((s) => s.id === supplierId)
    const items = cart.map((l) => ({
      productId: l.productId,
      name: l.name,
      barcode: l.barcode,
      qty: lineUnits(l),
      unitBuyPrice: l.unitPrice,
      printedPrice: l.sellPrice || l.unitPrice,
      cartonQty: l.cartonQty,
      unitsPerCarton: l.upc,
      lineTotal: lineCost(l),
    }))
    const itemsTotal = items.reduce((s: number, it: any) => s + it.qty * it.unitBuyPrice, 0)
    const itemsSummary = cart
      .map((l) => `${l.name}: ${fa(l.qty || 0)} عدد${l.cartonQty ? ` + ${fa(l.cartonQty)} کارتن ×${fa(l.upc || 0)}` : ''}`)
      .join('؛ ')

    setBusy(true)
    const r = await api('/api/orders', {
      method: 'POST',
      body: {
        supplierId: supplierId && supplierId !== 'none' ? supplierId : null,
        deliveryDate: dd,
        payMethod,
        ...(payMethod === 'CHEQUE' ? { chequeDays: Number(chequeDays) || 0 } : {}),
        note: [itemsSummary && `اقلام: ${itemsSummary}`, note.trim() && `یادداشت: ${note.trim()}`].filter(Boolean).join(' — ') || null,
        items,
        /* R9-V2 (د): اقلام ضایعاتِ علامت‌خورده همراه همین سفارش برمی‌گردند (سرور ← SELECTED) */
        ...(wasteSelectedIds.length ? { wasteIds: wasteSelectedIds } : {}),
        submit: true,
      },
    })
    if (!r.ok) { setBusy(false); return toast.error(r.error || 'ثبت سفارش انجام نشد') }
    const code = r.data?.code ?? ''
    const wasteNote = wasteSelectedIds.length ? ` — ${fa(wasteSelectedIds.length)} قلم ضایعات برای برگشت علامت خورد` : ''
    if (payMethod !== 'CASH') {
      const pp = await api('/api/payment-plans', {
        method: 'POST',
        body: { date: dd, kind: payMethod, amount: itemsTotal, orderCode: code || null, supplierName: sup?.name ?? null },
      })
      if (!pp.ok) toast.warning(`سفارش ثبت شد اما برنامه پرداخت ثبت نشد: ${pp.error || ''}`)
      else toast.success(`سفارش ${code} ثبت شد — برنامه پرداخت (${PAY_LABEL[payMethod]}) برای ${faDate(dd)} در تقویم ثبت شد${wasteNote}`)
    } else {
      toast.success(`سفارش ${code} ثبت شد — جمع تقریبی ${money(itemsTotal)} ریال${wasteNote}`)
    }
    setCart([])
    setNote('')
    setChequeDays('')
    setBusy(false)
    void loadWaste(supplierId) /* R9-V2 (د): اقلام ثبت‌شده SELECTED شدند — پنل تازه شود */
    refreshBadges?.()
    void loadList()
    void loadCalendar(cal.jy, cal.jm)
    setTab('list')
  }

  /* ── اکشن‌های سفارش ── */
  async function orderAction(o: any, action: string, extra?: Record<string, any>) {
    const r = await api(`/api/orders/${o.id}`, { method: 'PATCH', body: { action, ...extra } })
    if (!r.ok) { toast.error(r.error || 'عملیات انجام نشد'); return }
    const d = r.data ?? {}
    toast.success(`${o.code}: ${ORDER_STATUS_FA[d.status ?? o.status] ?? 'انجام شد'}`)
    setList((prev) => (prev ?? []).map((x) => (x.id === o.id ? { ...x, ...d } : x)))
    refreshBadges?.()
    void loadCalendar(cal.jy, cal.jm)
  }

  async function openReceive(o: any) {
    setReceiveDlg({ order: o, items: null })
    const r = await api(`/api/orders/${o.id}`)
    if (!r.ok) { toast.error(r.error || 'جزئیات سفارش دریافت نشد'); setReceiveDlg(null); return }
    setReceiveDlg({
      order: o,
      items: (r.data?.items ?? []).map((it: any) => ({
        id: it.id,
        name: it.name,
        qty: it.qty,
        receivedQty: it.qty,
        returnedQty: 0,
        returnReason: '',
        printedPrice: it.printedPrice,
        sellPrice: it.productSellPrice,
      })),
    })
  }

  /* ── R8: ثبت دریافت دو‌مرحله‌ای — تعداد + مرجوعی جزئی ── */
  function patchReceiveItem(i: number, patch: Record<string, any>) {
    setReceiveDlg((d: any) => {
      if (!d?.items) return d
      const items = d.items.map((x: any, j: number) => {
        if (j !== i) return x
        const nx = { ...x, ...patch }
        /* مرجوعی هرگز بیشتر از دریافت‌شده */
        nx.returnedQty = Math.min(Number(nx.receivedQty ?? 0), Math.max(0, Number(nx.returnedQty ?? 0)))
        if (nx.returnedQty <= 0) nx.returnReason = ''
        return nx
      })
      return { ...d, items }
    })
  }

  function receiveAllFull() {
    setReceiveDlg((d: any) => {
      if (!d?.items) return d
      return { ...d, items: d.items.map((x: any) => ({ ...x, receivedQty: x.qty, returnedQty: 0, returnReason: '' })) }
    })
    toast.info('همهٔ اقلام «تحویل کامل» علامت خورد — در صورت نیاز اصلاح کنید و ثبت کنید')
  }

  async function confirmReceive() {
    if (!receiveDlg?.order || !receiveDlg?.items) return
    const r = await api(`/api/orders/${receiveDlg.order.id}`, {
      method: 'PATCH',
      body: {
        action: 'receive',
        items: receiveDlg.items.map((i: any) => ({
          id: i.id,
          receivedQty: i.receivedQty,
          returnedQty: i.returnedQty || 0,
          ...(i.returnedQty > 0 && i.returnReason ? { returnReason: i.returnReason } : {}),
        })),
      },
    })
    if (!r.ok) { toast.error(r.error || 'ثبت دریافت انجام نشد'); return }
    const d: any = r.data ?? {}
    const mm = d.mismatch ?? 0
    const rItems: any[] = d.items ?? []
    const okN = rItems.filter((x) => x.status === 'OK').length
    const retN = rItems.filter((x) => x.status === 'PARTIAL_RETURN' || x.status === 'RETURNED').length
    const missN = rItems.filter((x) => x.status === 'MISSING').length
    toast.success(
      `دریافت ثبت شد — ${fa(okN)} قلم کامل${retN ? `، ${fa(retN)} مرجوعی` : ''}${missN ? `، ${fa(missN)} نرسید` : ''}` +
      (mm ? ` (${fa(mm)} مغایرت)` : ''),
    )
    const oid = receiveDlg.order.id
    setReceiveDlg(null)
    setList((prev) => (prev ?? []).map((x) => (x.id === oid ? { ...x, ...d } : x)))
  }

  /* ── R8: بازبینی و ویرایش پیش از تأیید ── */
  async function openReview(o: any, mode: 'view' | 'edit' = 'view') {
    setReviewDlg({ order: o, detail: null, mode, edit: null, addQ: '', addRs: null, busy: false })
    const r = await api(`/api/orders/${o.id}`)
    if (!r.ok) { toast.error(r.error || 'جزئیات سفارش دریافت نشد'); setReviewDlg(null); return }
    const d: any = r.data
    setReviewDlg((rv: any) => {
      if (!rv || rv.order?.id !== o.id) return rv
      return { ...rv, detail: d, ...(mode === 'edit' ? { edit: snapshotForEdit(d) } : {}) }
    })
  }

  /** آماده‌سازی نسخهٔ قابل‌ویرایش از سفارش (آینهٔ کامل اقلام + سرآیند) */
  function snapshotForEdit(d: any) {
    return {
      items: (d.items ?? []).map((it: any) => ({
        productId: it.productId,
        name: it.name,
        barcode: it.barcode,
        qty: it.qty,
        cartonQty: it.cartonQty ?? 0,
        upc: it.unitsPerCarton ?? 0,
        unitPrice: it.unitBuyPrice,
        printedPrice: it.printedPrice ?? 0,
        sellPrice: it.productSellPrice ?? 0,
        unit: '',
      })),
      supplierId: d.supplierId ?? '',
      deliveryDate: d.deliveryDate ?? '',
      payMethod: d.payMethod ?? 'CASH',
      chequeDays: d.chequeDays ? String(d.chequeDays) : '',
      note: d.note ?? '',
    }
  }

  function patchReviewEdit(patch: Record<string, any>) {
    setReviewDlg((rv: any) => (rv ? { ...rv, edit: { ...rv.edit, ...patch } } : rv))
  }

  function patchReviewItem(i: number, patch: Record<string, any>) {
    setReviewDlg((rv: any) => {
      if (!rv?.edit) return rv
      const items = rv.edit.items.map((x: any, j: number) => (j === i ? { ...x, ...patch } : x))
      return { ...rv, edit: { ...rv.edit, items } }
    })
  }

  /* افزودن قلم در ویرایش — جست‌وجوی کالا داخل دیالوگ */
  async function reviewAddSearch(t: string) {
    patchReviewEdit({ addQ: t, addRs: null })
    if (toEnDigits(t).trim().length < 2) return
    const r = await api('/api/products/search' + qs({ q: toEnDigits(t).trim(), limit: 6 }))
    if (!r.ok) return
    setReviewDlg((rv: any) => (rv ? { ...rv, edit: { ...rv.edit, addRs: r.data?.products ?? [] } } : rv))
  }

  function reviewAddProduct(p: any) {
    setReviewDlg((rv: any) => {
      if (!rv?.edit) return rv
      if (rv.edit.items.some((x: any) => x.productId === p.id)) { toast.info('این کالا در سفارش هست — تعدادش را در همان سطر اصلاح کنید'); return rv }
      const items = [...rv.edit.items, {
        productId: p.id, name: p.name, barcode: p.barcode ?? p.code ?? null,
        qty: 1, cartonQty: 0, upc: 0,
        unitPrice: Number(p.lastBuyPrice ?? 0) || 0,
        printedPrice: Number(p.sellPrice ?? 0) || 0, sellPrice: Number(p.sellPrice ?? 0) || 0, unit: p.unit ?? 'عدد',
      }]
      return { ...rv, edit: { ...rv.edit, items, addQ: '', addRs: null } }
    })
  }

  const reviewEditTotal = (edit: any): number =>
    (edit?.items ?? []).reduce(
      (s: number, l: any) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0) + (Number(l.cartonQty) || 0) * (Number(l.upc) || 0) * (Number(l.unitPrice) || 0),
      0,
    )
  const reviewEditUnits = (l: any): number => (Number(l.qty) || 0) + (Number(l.cartonQty) || 0) * (Number(l.upc) || 0)

  async function saveReviewEdit() {
    const rv = reviewDlg
    const o = rv?.order
    const e = rv?.edit
    if (!o || !e) return
    /* سطرهای صفر-صفر (نه عدد نه کارتن) حذف می‌شوند */
    const live = e.items.filter((l: any) => (Number(l.qty) || 0) + (Number(l.cartonQty) || 0) > 0)
    if (!live.length) return toast.error('هیچ قلمی برای این سفارش باقی نمانده است')
    setReviewDlg({ ...rv, busy: true })
    const items = live.map((l: any) => ({
      productId: l.productId,
      name: l.name,
      barcode: l.barcode,
      qty: reviewEditUnits(l),
      unitBuyPrice: Number(l.unitPrice) || 0,
      printedPrice: Number(l.printedPrice) || 0,
      cartonQty: Number(l.cartonQty) || 0,
      unitsPerCarton: Number(l.upc) || 0,
      lineTotal: (Number(l.qty) || 0) * (Number(l.unitPrice) || 0) + (Number(l.cartonQty) || 0) * (Number(l.upc) || 0) * (Number(l.unitPrice) || 0),
    }))
    const dd = normDate(e.deliveryDate)
    const r = await api(`/api/orders/${o.id}`, {
      method: 'PATCH',
      body: {
        action: 'edit-submitted',
        supplierId: e.supplierId && e.supplierId !== 'none' ? e.supplierId : null,
        deliveryDate: dd || null,
        payMethod: e.payMethod,
        ...(e.payMethod === 'CHEQUE' ? { chequeDays: Number(e.chequeDays) || 0 } : {}),
        note: e.note || null,
        items,
      },
    })
    if (!r.ok) { setReviewDlg({ ...rv, busy: false }); return toast.error(r.error || 'ذخیرهٔ ویرایش انجام نشد') }
    toast.success(`ویرایش ${o.code} ذخیره شد — آمادهٔ تأیید نهایی`)
    const d: any = r.data
    setList((prev) => (prev ?? []).map((x) => (x.id === o.id ? { ...x, ...d } : x)))
    setReviewDlg({ order: { ...o, ...d }, detail: d, mode: 'view', edit: null, addQ: '', addRs: null, busy: false })
  }

  /* ── R8: تأیید ناظر دریافت ── */
  async function openVerify(o: any) {
    setVerifyDlg({ order: o, detail: null })
    const r = await api(`/api/orders/${o.id}`)
    if (!r.ok) { toast.error(r.error || 'جزئیات دریافت یافت نشد'); setVerifyDlg(null); return }
    setVerifyDlg({ order: o, detail: r.data })
  }

  /* ── R8: کنترل سود و ثبت حسابداری ── */
  async function openAccount(o: any) {
    setAccountDlg({ order: o, detail: null, rows: null })
    const r = await api(`/api/orders/${o.id}`)
    if (!r.ok) { toast.error(r.error || 'جزئیات سفارش یافت نشد'); setAccountDlg(null); return }
    const d: any = r.data
    setAccountDlg({
      order: o,
      detail: d,
      rows: (d.items ?? []).map((it: any) => ({
        id: it.id,
        name: it.name,
        qty: it.qty,
        accepted: Math.max(0, (it.receivedQty ?? 0) - (it.returnedQty ?? 0)),
        returnedQty: it.returnedQty ?? 0,
        unitBuyPrice: it.unitBuyPrice,
        printedPrice: it.printedPrice,
        markedReturned: false,
      })),
    })
  }

  function patchAccountRow(i: number, patch: Record<string, any>) {
    setAccountDlg((d: any) => {
      if (!d?.rows) return d
      return { ...d, rows: d.rows.map((x: any, j: number) => (j === i ? { ...x, ...patch } : x)) }
    })
  }

  async function submitAccount() {
    const d = accountDlg
    if (!d?.order || !d?.rows) return
    setAccountDlg({ ...d, busy: true })
    const r = await api(`/api/orders/${d.order.id}`, {
      method: 'PATCH',
      body: {
        action: 'account',
        items: d.rows.map((x: any) => ({
          id: x.id,
          unitBuyPrice: Number(x.unitBuyPrice) || 0,
          printedPrice: Number(x.printedPrice) || 0,
          ...(x.markedReturned ? { markedReturned: true } : {}),
        })),
      },
    })
    if (!r.ok) { setAccountDlg({ ...d, busy: false }); return toast.error(r.error || 'ثبت حسابداری انجام نشد') }
    const res: any = r.data
    toast.success(`ثبت حسابداری ${d.order.code} انجام شد${res?.archiveDocId ? ' — سند آرشیو فاکتور ساخته شد' : ''}`)
    const oid = d.order.id
    setAccountDlg(null)
    setList((prev) => (prev ?? []).map((x) => (x.id === oid ? { ...x, ...res } : x)))
  }

  async function planAction(p: any, status: string) {
    const r = await api(`/api/payment-plans/${p.id}`, { method: 'PATCH', body: { status } })
    if (!r.ok) { toast.error(r.error || 'عملیات انجام نشد'); return }
    setPlans((prev) => prev.map((x) => (x.id === p.id ? (r.data?.plan ?? { ...x, status }) : x)))
    toast.success(status === 'CONFIRMED' ? 'برنامه پرداخت تأیید شد' : 'پرداخت «انجام‌شده» علامت خورد')
  }

  /* ── تقویم ── */
  function shiftMonth(delta: number) {
    let { jy, jm } = cal
    jm += delta
    if (jm < 1) { jm = 12; jy -= 1 } else if (jm > 12) { jm = 1; jy += 1 }
    setCal({ jy, jm })
    setSelDay(null)
    void loadCalendar(jy, jm)
  }

  /* ── داده‌های مشتق ── */
  const monthLen = jalaliMonthLength(cal.jy, cal.jm)
  const firstCol = useMemo(() => {
    const d = parseJalali(`${cal.jy}-${pad2(cal.jm)}-01`)
    return d ? (d.getDay() + 1) % 7 : 0
  }, [cal])
  const cells: any[] = useMemo(() => {
    const out: any[] = []
    for (let i = 0; i < firstCol; i++) out.push(null)
    for (let d = 1; d <= monthLen; d++) {
      const ds = `${cal.jy}-${pad2(cal.jm)}-${pad2(d)}`
      const dayPlans = plans.filter((p) => p.date === ds)
      const dayCheques = cheques.filter((c) => c.dueDate === ds && c.selfIssued === true)
      out.push({ d, ds, dayPlans, dayCheques })
    }
    return out
  }, [cal, plans, cheques, monthLen, firstCol])

  const dayPlans = selDay ? plans.filter((p) => p.date === selDay) : []
  const dayCheques = selDay ? cheques.filter((c) => c.dueDate === selDay && c.selfIssued === true) : []
  const monthTotal = useMemo(() => plans.reduce((s, p) => s + (p.amount || 0), 0), [plans])
  const today = todayJalali()

  if (loading) {
    return (
      <Card><CardContent className="p-10 text-center text-stone-500">
        <I.loader className="mx-auto mb-3 animate-spin" size={22} />
        در حال دریافت داده‌های سفارش‌گذاری…
      </CardContent></Card>
    )
  }

  const supSelected = suppliers.find((s) => s.id === supplierId) ?? null

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v: string) => setTab(v)} dir="rtl">
        <TabsList>
          <TabsTrigger value="new">سفارش جدید</TabsTrigger>
          <TabsTrigger value="list">سفارش‌ها</TabsTrigger>
          <TabsTrigger value="calendar">تقویم پرداخت</TabsTrigger>
        </TabsList>

        {/* ══ سفارش جدید — جدولی + طرف حساب ══ */}
        <TabsContent value="new" className="mt-4 space-y-4">

          {/* R14: طرف حساب و ضایعاتِ همان تأمین‌کننده کنار هم — به‌جای دو نوار تمام‌عرض */}
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
          {/* طرف حساب (تأمین‌کننده) — نخستین کارت سربرگ سفارش */}
          <Card className="xl:col-span-5">
            <CardHeader className="space-y-3 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <I.handshake size={18} /> طرف حساب (تأمین‌کننده)
                {supplierId && supplierId !== 'none' && <Badge variant="secondary" className="text-[11px]">انتخاب‌شده</Badge>}
              </CardTitle>
              <p className="text-xs leading-5 text-stone-500">
                تأمین‌کنندهٔ این سفارش را مشخص کنید (اختیاری) — تایپ کنید (نام / کد / تلفن) و از فهرست بازشو انتخاب کنید؛ کلیدهای ↑↓ و Enter هم کار می‌کند.
              </p>
              <SupplierCombo suppliers={suppliers} value={supplierId} onChange={setSupplierId} />
            </CardHeader>
            {supplierId && supplierId !== 'none' && supSelected ? (
              <CardContent className="pt-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-teal-200 bg-teal-50 p-2.5 text-xs">
                  <span className="font-bold text-stone-700">{supSelected.name}</span>
                  <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-bold',
                    (supSelected.balance ?? 0) < 0 ? 'bg-rose-100 text-rose-700' : (supSelected.balance ?? 0) > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-600')}>
                    {(supSelected.balance ?? 0) < 0 ? `بدهی: ${money(Math.abs(supSelected.balance))} ریال` : (supSelected.balance ?? 0) > 0 ? `اعتبار: ${money(supSelected.balance)} ریال` : 'بدون بدهی'}
                  </span>
                  {supSelected.phone && <span dir="ltr" className="text-stone-500">{toFaDigits(supSelected.phone)}</span>}
                  <span className="text-[11px] text-stone-500">تمام اقلام این سبد روی همین طرف حساب ثبت می‌شود</span>
                </div>
              </CardContent>
            ) : supplierId === 'none' ? (
              <CardContent className="pt-0">
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-[11px] text-stone-500">
                  این سفارش بدون طرف حساب مشخص ثبت می‌شود — اگر فاکتور خرید دارید، بهتر است تأمین‌کننده را انتخاب کنید.
                </div>
              </CardContent>
            ) : null}
          </Card>

          {/* ── R9-V2 (د): ضایعاتِ این تأمین‌کننده — برای برگشت با همین سفارش ──
              فقط وقتی طرف حساب انتخاب شده و قلم در انتظار دارد ظاهر می‌شود؛
              اقلام علامت‌خورده با ثبت سفارش SELECTED می‌شوند و در دریافت، برگشت می‌خورند. */}
          {waste && (waste.items ?? []).length > 0 && (
            <Card className="border-amber-300 xl:col-span-7">
              <CardHeader className="space-y-2 pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <I.alertTriangle size={17} className="shrink-0 text-amber-600" /> ضایعاتِ این تأمین‌کننده — برای برگشت با همین سفارش
                  <span dir="rtl" className="rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                    {money(waste.stats?.value?.pending ?? 0)} ریال
                  </span>
                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                    {fa(wasteSelectedIds.length)} قلم برگشتی
                  </span>
                </CardTitle>
                <p className="text-xs leading-5 text-stone-500">
                  اقلام علامت‌خورده همراه همین سفارش به تأمین‌کننده برمی‌گردند؛ بقیه برای دفعات بعدی می‌ماند.
                  (علامتِ پیش‌فرض همه است — چیزهایی را که باید بمانند از تیک بردارید.)
                </p>
              </CardHeader>
              <CardContent className="space-y-1.5 pt-0">
                {(waste.items ?? []).map((it: any) => (
                  <label key={it.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-2.5 py-2 transition-colors hover:bg-amber-50"
                    title={wasteChecked[it.id] ? 'این قلم همراه همین سفارش برمی‌گردد' : 'این قلم می‌ماند و برای سفارش بعدی در انتظار است'}>
                    <span className="flex min-w-0 items-center gap-2">
                      <Checkbox
                        checked={!!wasteChecked[it.id]}
                        onCheckedChange={(v: boolean) => setWasteChecked((m) => ({ ...m, [it.id]: v === true }))}
                      />
                      <span className="truncate text-sm font-bold text-stone-700">{it.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px]">
                      <span className="whitespace-nowrap text-stone-600">{fa(it.qty)} {it.unit}</span>
                      <span className="whitespace-nowrap rounded-md border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-stone-500">{it.reasonLabel}</span>
                      <span dir="rtl" className="whitespace-nowrap font-bold text-amber-800">{money(it.estValue)} ریال</span>
                    </span>
                  </label>
                ))}
              </CardContent>
            </Card>
          )}
          </div>

          {/* جست‌وجوی سریع کالا */}
          <Card>
            <CardHeader className="space-y-3 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <I.search size={18} /> جست‌وجوی سریع کالا
              </CardTitle>
              <p className="text-xs leading-5 text-stone-500">
                اسم کالا را بنویسید (مثلاً «بیژن») — موجودی، آخرین سفارشِ سامانه و آخرین خرید هلو (ماه + تعداد) در همان ردیف نمایش داده می‌شود؛
                استپر «عدد/کارتن» یا خوشهٔ «افزودن سریع» در انتهای ردیف، همان لحظه در سبد می‌نشیند (دکمهٔ جداگانه‌ای لازم نیست).
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <I.search size={17} className="absolute top-1/2 right-3 -translate-y-1/2 text-stone-400" />
                  <Input
                    autoFocus
                    value={q}
                    onChange={(e: any) => onQuery(e.target.value)}
                    placeholder="نام کالا — مثلاً: بیژن، شیر، چیپس…"
                    className="h-12 pr-10 text-base"
                  />
                  {searching && <I.loader size={16} className="absolute top-1/2 left-3 -translate-y-1/2 animate-spin text-stone-400" />}
                </div>
                {q && (
                  <Button variant="ghost" className="text-rose-600" onClick={() => { setQ(''); setResults(null) }}>
                    <I.x size={16} />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent data-tour="results-table">
              {results === null ? (
                <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-4 text-center">
                  <I.search className="mx-auto mb-2 text-stone-400" size={26} />
                  <p className="text-sm font-medium text-stone-500">جست‌وجو کنید تا کالاها در جدول با موجودی و سابقهٔ سفارش نمایش داده شوند</p>
                  <p className="mt-1 text-[11px] text-stone-400">حداقل ۲ حرف بنویسید — نتیجه‌ها همین‌جا، بدون رفت‌وبرگشت ظاهر می‌شوند</p>
                </div>
              ) : results.length === 0 ? (
                <p className="py-6 text-center text-sm text-stone-400">
                  کالایی با «{fa(q)}» یافت نشد — املای نام را بررسی کنید یا از فهرست کامل کالاها استفاده کنید
                </p>
              ) : (
                <>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-400">
                    <span>{fa(results.length)} کالا — هر +/− یا چیپ +N همان لحظه در سبد اعمال می‌شود</span>
                    <span>کلیک روی نام کالا = گردش کالا</span>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto overflow-x-auto rounded-xl border border-stone-200 bg-white">
                    {/* R9-V2 (الف): جدول نتایج با نظم کامل — سربرگ کهرباییِ همیشه‌سبک، ستون‌های هم‌عرض، ردیف‌های هم‌قد */}
                    <table dir="rtl" className="w-full min-w-[900px] text-sm">
                      <thead>
                        <tr>
                          <th className="sticky top-0 z-10 h-9 whitespace-nowrap bg-stone-100 px-2 text-right align-middle text-[11px] font-bold text-stone-500">نام کالا</th>
                          <th className="sticky top-0 z-10 h-9 w-24 whitespace-nowrap bg-stone-100 px-2 text-center align-middle text-[11px] font-bold text-stone-500">کد / بارکد</th>
                          <th className="sticky top-0 z-10 h-9 w-28 whitespace-nowrap bg-stone-100 px-2 text-center align-middle text-[11px] font-bold text-stone-500">موجودی</th>
                          <th className="sticky top-0 z-10 h-9 w-32 whitespace-nowrap bg-stone-100 px-2 text-center align-middle text-[11px] font-bold text-stone-500">قیمت واحد</th>
                          <th className="sticky top-0 z-10 h-9 w-[150px] whitespace-nowrap bg-stone-100 px-2 text-center align-middle text-[11px] font-bold text-stone-500">تعداد (عدد)</th>
                          <th className="sticky top-0 z-10 h-9 w-[150px] whitespace-nowrap bg-stone-100 px-2 text-center align-middle text-[11px] font-bold text-stone-500">کارتن</th>
                          <th className="sticky top-0 z-10 h-9 w-48 whitespace-nowrap bg-stone-100 px-2 text-center align-middle text-[11px] font-bold text-stone-500">افزودن سریع</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((p: any) => {
                          /* R5-F: سبد تنها منبع حقیقت — مقدارهای این سطر از سطر سبد خوانده می‌شود */
                          const line = cart.find((l) => l.productId === p.id) ?? null
                          const inCart = !!line
                          const amtUnits = Number(line?.qty ?? 0)
                          const amtCartons = Number(line?.cartonQty ?? 0)
                          const price = bestPrice(p)
                          const upc = rowUpc(p) || Number(line?.upc ?? 0) || 0
                          const last = p.lastOrder
                          /* R9-V2 (ب): آخرین خرید واقعی هلو از کش /api/trades?lastBuys */
                          const lb = lastBuys[p.id]
                          /* R9-V2 (الف): تأمین‌کنندگان فعال — خلاصه در tooltip، شمارنده در چیپِ یک‌خطی */
                          const supList = (p.suppliers ?? []).filter((s: any) => s.status === 'فعال' && s.unitPrice != null)
                          const supTitle = supList.map((s: any) => `${s.supplierName}: ${money(s.unitPrice)} ریال${s.perCarton ? ` (کارتن ×${fa(s.perCarton)})` : ''}`).join('\n')
                          return (
                            <tr key={p.id} className={cn('border-t border-stone-200 transition-colors', inCart ? 'bg-emerald-50/60' : 'hover:bg-emerald-50')}>
                              {/* ۱. نام کالا — تک‌خطی (title = نام کامل) — کلیک = گردش کالا؛ خط دوم همیشه یک‌خطی: سفارش + خرید هلو + تأمین‌کننده */}
                              <td className="p-2 align-middle">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <button type="button" className="min-w-0 truncate text-right text-[13px] font-bold text-stone-700 transition-colors hover:text-emerald-800" onClick={() => setCircOf(p.id)} title={`${p.name} — نمایش گردش کالا`}>
                                    {p.name}
                                  </button>
                                  <span className="inline-flex shrink-0 items-center rounded-md border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[10px] font-bold text-stone-500">
                                    {p.unit ?? 'عدد'}
                                  </span>
                                  {inCart && (
                                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                      <I.check size={10} /> در سبد
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 flex h-5 items-center gap-1 overflow-hidden whitespace-nowrap text-[10px]">
                                  {last ? (
                                    <span
                                      title={`آخرین سفارش${last.orderCode ? ` ${last.orderCode}` : ''}${last.supplierName ? ` — ${last.supplierName}` : ''}${last.cartonQty ? ` (${fa(last.cartonQty)} کارتن)` : ''}`}
                                      className={cn('inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 font-bold',
                                        last.receivedAt ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800')}>
                                      <I.history size={10} /> سفارش: {fa(last.qty)} — {jShort(last.orderedAt)}
                                    </span>
                                  ) : (
                                    <span className="shrink-0 text-stone-400">سفارش قبلی ندارد</span>
                                  )}
                                  {lb && (lb.lastBuyMonthLabel ? (
                                    <span
                                      title={`آخرین خرید ثبت‌شده در هلو — ${toFaDigits(String(lb.lastBuyDateLabel ?? '').replace(/\./g, '/'))} · ${fa(lb.lastBuyQty)} ${p.unit ?? 'عدد'} · ${money(lb.lastBuyPrice)} ریال${lb.buyCount > 1 ? ` · ${fa(lb.buyCount)} خرید در ${fa(lb.buyMonths)} ماه` : ''}`}
                                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 font-bold text-teal-800">
                                      <I.carton size={10} /> آخرین خرید: {lb.lastBuyMonthLabel} · {fa(lb.lastBuyQty)} عدد
                                    </span>
                                  ) : (
                                    <span className="shrink-0 text-stone-400">بدون سابقهٔ خرید</span>
                                  ))}
                                  {supList.length > 1 && (
                                    <span title={`تأمین‌کنندگان این کالا:\n${supTitle}`} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-stone-500">
                                      <I.handshake size={10} /> {fa(supList.length)} تأمین‌کننده
                                    </span>
                                  )}
                                </div>
                              </td>
                              {/* ۲. کد / بارکد — ارقام با dir=ltr */}
                              <td className="p-2 text-center align-middle">
                                <div dir="ltr" className="whitespace-nowrap font-mono text-[12px] font-bold text-stone-700">
                                  {p.barcode || p.code ? toFaDigits(p.barcode ?? p.code) : '—'}
                                </div>
                                {p.bankBarcode ? (
                                  <div dir="ltr" className="whitespace-nowrap font-mono text-[10px] text-stone-400" title="بارکد بانک بارکد">
                                    {fa(p.bankBarcode)}
                                  </div>
                                ) : null}
                              </td>
                              {/* ۳. موجودی */}
                              <td className="p-2 text-center align-middle">
                                <StockView stock={p.stock ?? 0} threshold={p.lowStockThreshold ?? null} />
                              </td>
                              {/* ۴. قیمت واحد — راست‌چین (اعداد از راست شروع)؛ تأمین‌کنندگان در tooltip */}
                              <td className="whitespace-nowrap p-2 text-right align-middle" title={supList.length > 1 ? `تأمین‌کنندگان این کالا:\n${supTitle}` : undefined}>
                                <div dir="rtl" className="text-sm font-bold text-stone-700">
                                  {money(price)} <span className="text-[10px] font-normal text-stone-400">ریال</span>
                                </div>
                                <div className="text-[10px] text-stone-400">
                                  {supList.length > 1 ? `${fa(supList.length)} تأمین‌کننده` : supList.length === 1 ? 'نماینده' : 'آخرین خرید'}
                                </div>
                              </td>
                              {/* ۵. تعداد (عدد) — استپر وسط خانه؛ مقدار مستقیم در سبد */}
                              <td className="p-2 text-center align-middle">
                                <NumStepper min={0} step={1} value={amtUnits}
                                  bumpKey={bump[`u:${p.id}`] || 0}
                                  onChange={(v: number) => rowUnitsChange(p, v)} />
                              </td>
                              {/* ۶. کارتن — استپر + راهنمای ×N */}
                              <td className="p-2 text-center align-middle">
                                <NumStepper min={0} step={1} value={amtCartons}
                                  hint={upc > 0 ? `× ${fa(upc)}` : 'اندازهٔ کارتن؟'}
                                  bumpKey={bump[`b:${p.id}`] || 0}
                                  onChange={(v: number) => rowCartonChange(p, v)} />
                              </td>
                              {/* ۷. R9-V2 (الف): خوشهٔ ثابت «افزودن سریع» در انتهای هر ردیف — همیشه همان جا، همیشه همان ترتیب */}
                              <td className="p-2 align-middle">
                                <div className="flex items-center justify-center gap-1">
                                  <button type="button" title={`افزودن ${fa(defQty)} عدد به همین ردیف`}
                                    onClick={() => quickAddUnits(p, defQty)}
                                    className="h-8 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-800 transition-colors hover:bg-emerald-100 active:scale-95">
                                    +{fa(defQty)}
                                  </button>
                                  <button type="button" title={`افزودن ${fa(defQty * 2)} عدد به همین ردیف`}
                                    onClick={() => quickAddUnits(p, defQty * 2)}
                                    className="h-8 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-800 transition-colors hover:bg-emerald-100 active:scale-95">
                                    +{fa(defQty * 2)}
                                  </button>
                                  <span className="h-5 w-px bg-black/10" aria-hidden="true" />
                                  {upc > 0 ? (
                                    <button type="button" title={`افزودن ${fa(Math.max(1, defCarton || 1))} کارتن ×${fa(upc)} به همین ردیف`}
                                      onClick={() => quickAddCarton(p)}
                                      className="h-8 rounded-full border border-amber-200 bg-amber-50 px-2.5 text-[11px] font-bold text-amber-800 transition-colors hover:bg-amber-100 active:scale-95">
                                      +{fa(Math.max(1, defCarton || 1))} کارتن
                                    </button>
                                  ) : (
                                    <button type="button" title="اندازهٔ کارتن این کالا ثبت نشده — با ثبت اندازه، پیش‌فرض کارتنِ همان کالا ذخیره می‌شود و دیگر پرسیده نمی‌شود"
                                      onClick={() => quickAddCarton(p)}
                                      className="h-8 rounded-full border border-dashed border-amber-300 bg-white px-2.5 text-[11px] font-bold text-amber-800 transition-colors hover:bg-amber-50 active:scale-95">
                                      اندازهٔ کارتن؟
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* سبد خرید */}
          <Card data-tour="cart">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <I.carton size={18} /> سبد سفارش
                {cart.length > 0 && <Badge variant="secondary" className="text-[11px]">{fa(cart.length)} قلم</Badge>}
                {cart.length > 0 && (
                  <span className="text-xs font-normal text-stone-500">
                    · جمع تقریبی: <b className="text-emerald-700">{money(total)} ریال</b> ≈ {toman(total)} تومان
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cart.length === 0 ? (
                <p className="py-6 text-center text-sm text-stone-400">
                  سبد خالی است — در نتایج جست‌وجو، +/− یا چیپ‌های +N را بزنید؛ همان لحظه به سبد اضافه می‌شود
                </p>
              ) : (
                /* ── R9-V2 (الف): سبد به‌صورت جدول واقعی — ستون‌های ثابتِ گرید (هیچ‌وقت auto)،
                      ردیف‌های هم‌قد (min-h + ساختار یکسان)، کنترل‌ها همیشه در همان ستون و همان ارتفاع.
                      نام بلند؟ truncate + title — دیگر هیچ سطری «پلکانی» نمی‌شود. ── */
                <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                  <div className="min-w-[900px]">
                    {/* سربرگ ستون‌ها — دقیقاً همان قالب گرید سطرها */}
                    <div dir="rtl"
                      className="grid h-9 grid-cols-[minmax(200px,1.6fr)_150px_150px_84px_132px_132px_44px] items-center gap-x-2 bg-stone-100 px-3 text-[11px] font-bold text-stone-500">
                      <span>کالا</span>
                      <span className="text-center">تعداد (عدد)</span>
                      <span className="text-center">کارتن</span>
                      <span className="text-center">در هر کارتن</span>
                      <span className="text-center">قیمت واحد (ریال)</span>
                      <span className="text-center">جمع سطر</span>
                      <span className="text-center">حذف</span>
                    </div>
                    {cart.map((l, idx) => {
                      const cost = lineCost(l)
                      const lb = lastBuys[l.productId] /* R9-V2 (ب): آخرین خرید هلو — خط دوم سطر سبد */
                      const addCartons = Math.max(1, Math.round(defCarton || 1))
                      return (
                        <div key={l.productId} dir="rtl"
                          className="grid grid-cols-[minmax(200px,1.6fr)_150px_150px_84px_132px_132px_44px] items-center gap-x-2 min-h-[64px] border-t border-stone-200 px-3 py-2 transition-colors hover:bg-stone-100">
                          {/* ۱. کالا — نام تک‌خطی (title = نام کامل) + چیپ واحد؛ خط دوم همیشه یک‌خطی: موجودی + بارکد + آخرین خرید */}
                          <div className="flex min-w-0 flex-col items-start gap-1">
                            <div className="flex w-full min-w-0 items-center gap-1.5">
                              <span className="truncate text-sm font-bold text-stone-700" title={l.name}>{l.name}</span>
                              <span className="inline-flex shrink-0 items-center rounded-md border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[10px] font-bold text-stone-500">{l.unit}</span>
                            </div>
                            <div className="flex w-full items-center gap-1.5 overflow-hidden whitespace-nowrap">
                              <StockView stock={l.stock} threshold={l.lowThreshold} />
                              {l.barcode ? <span dir="ltr" className="shrink-0 font-mono text-[10px] text-stone-400">{toFaDigits(l.barcode)}</span> : null}
                              {lb && (lb.lastBuyMonthLabel ? (
                                <span className="shrink-0 text-[10px] text-stone-400">آخرین خرید: {lb.lastBuyMonthLabel} · {fa(lb.lastBuyQty)} عدد</span>
                              ) : (
                                <span className="shrink-0 text-[10px] text-stone-400">بدون سابقهٔ خرید</span>
                              ))}
                            </div>
                          </div>
                          {/* ۲. تعداد (عدد) — استپر وسط ستون + ردیف چیپ‌های +N (همیشه همین‌جا، همیشه زیر استپر) */}
                          <div className="flex flex-col items-center gap-1">
                            <NumStepper value={l.qty ?? 0} min={0} step={1}
                              bumpKey={bump[`c:${l.productId}`] || 0}
                              onChange={(v: number) => editLine(idx, 'qty', String(v))} />
                            <div className="flex items-center gap-1">
                              <button type="button" title={`افزودن ${fa(defQty)} عدد به همین قلم سبد`}
                                onClick={() => {
                                  editLine(idx, 'qty', String((l.qty || 0) + defQty))
                                  setBump((m) => ({ ...m, [`c:${l.productId}`]: (m[`c:${l.productId}`] || 0) + 1 }))
                                }}
                                className="h-6 rounded-full border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-800 transition-colors hover:bg-emerald-100 active:scale-95">
                                +{fa(defQty)}
                              </button>
                              <button type="button" title={`افزودن ${fa(defQty * 2)} عدد به همین قلم سبد`}
                                onClick={() => {
                                  editLine(idx, 'qty', String((l.qty || 0) + defQty * 2))
                                  setBump((m) => ({ ...m, [`c:${l.productId}`]: (m[`c:${l.productId}`] || 0) + 1 }))
                                }}
                                className="h-6 rounded-full border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-800 transition-colors hover:bg-emerald-100 active:scale-95">
                                +{fa(defQty * 2)}
                              </button>
                            </div>
                          </div>
                          {/* ۳. کارتن — استپر + چیپ «+N کارتن» یا «اندازهٔ کارتن؟» (همیشه زیر استپر؛
                              اندازهٔ هر کارتن در ستون «در هر کارتن» همین ردیف قابل مشاهده/ویرایش است) */}
                          <div className="flex flex-col items-center gap-1">
                            <NumStepper value={l.cartonQty ?? 0} min={0} step={1}
                              bumpKey={bump[`cb:${l.productId}`] || 0}
                              onChange={(v: number) => cartCartonChange(idx, v)} />
                            {(l.upc ?? 0) > 0 ? (
                              <button type="button" title={`افزودن ${fa(addCartons)} کارتن ×${fa(l.upc ?? 0)} به همین قلم سبد`}
                                onClick={() => {
                                  editLine(idx, 'cartonQty', String((l.cartonQty || 0) + addCartons))
                                  setBump((m) => ({ ...m, [`cb:${l.productId}`]: (m[`cb:${l.productId}`] || 0) + 1 }))
                                }}
                                className="h-6 rounded-full border border-amber-200 bg-amber-50 px-2 text-[10px] font-bold text-amber-800 transition-colors hover:bg-amber-100 active:scale-95">
                                +{fa(addCartons)} کارتن
                              </button>
                            ) : (
                              <button type="button" title="اندازهٔ کارتن این کالا ثبت نشده — ثبت کنید تا پیش‌فرض کارتنِ همان کالا ذخیره شود و دیگر پرسیده نشود"
                                onClick={() => setCartonAsk({ product: { id: l.productId, name: l.name }, size: '12', cartons: Math.max(1, (l.cartonQty || 0) + addCartons), cartIdx: idx })}
                                className="h-6 rounded-full border border-dashed border-amber-300 bg-white px-2 text-[10px] font-bold text-amber-800 transition-colors hover:bg-amber-50 active:scale-95">
                                اندازهٔ کارتن؟
                              </button>
                            )}
                          </div>
                          {/* ۴. در هر کارتن — عددِ فارسی/انگلیسی، وسط‌چین */}
                          <Input dir="ltr" className="h-9 w-full text-center font-mono" inputMode="numeric"
                            value={String(l.upc ?? 0)}
                            onChange={(e: any) => editLine(idx, 'upc', e.target.value)} placeholder="؟"
                            title="تعداد در هر کارتن — با تأیید دیالوگِ اندازه، پیش‌فرضِ همان کالا ذخیره می‌شود" />
                          {/* ۵. قیمت واحد (ریال) — با جداکنندهٔ ٬ هنگام تایپ */}
                          <MoneyInput value={String(l.unitPrice ?? 0)} onChange={(raw: string) => editLine(idx, 'unitPrice', raw)} />
                          {/* ۶. جمع سطر — ارقام درختی tabular، همیشه هم‌کف */}
                          <div className="text-center">
                            <div dir="ltr" className="whitespace-nowrap text-sm font-bold tabular-nums text-stone-700">{money(cost)}</div>
                            <div className="whitespace-nowrap text-[10px] text-stone-400">{fa(lineUnits(l))} عدد · ≈ {toman(cost)} تومان</div>
                          </div>
                          {/* ۷. حذف */}
                          <div className="flex justify-center">
                            <Button variant="ghost" size="icon" className="text-rose-500 hover:bg-rose-50" onClick={() => removeLine(idx)}>
                              <I.trash size={15} />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ثبت نهایی */}
              {cart.length > 0 && (
                <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-bold text-stone-700">جمع کل تقریبی سفارش</span>
                    <span className="text-lg font-black text-emerald-700">
                      {money(total)}
                      <span className="text-xs font-normal"> ریال</span>
                      <span className="text-xs font-normal text-stone-400"> ≈ {toman(total)} تومان</span>
                    </span>
                  </div>
                  <p className="text-[11px] leading-4 text-stone-500">
                    برآورد بر پایهٔ آخرین قیمت خرید / قیمت نماینده است — قیمت هر سطر را می‌توانید همان‌جا اصلاح کنید؛ قیمت اصلاح‌شده با سفارش ثبت و هنگام دریافت در کارت کالا به‌روز می‌شود.
                  </p>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-stone-600">تاریخ تحویل مورد انتظار</label>
                      <JalaliDate
                        value={deliveryDate}
                        onChange={(v: string) => setDeliveryDate(v)}
                        quickChips={[
                          { label: 'امروز', deltaDays: 0 },
                          { label: 'فردا', deltaDays: 1 },
                          { label: 'هفتهٔ آینده', deltaDays: 7 },
                        ]}
                      />
                      <p className="mt-1.5 text-[11px] text-stone-400">میان‌برهای «امروز / فردا / هفتهٔ آینده» داخل تقویم بازشو در دسترس است</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-stone-600">روش پرداخت</label>
                      {/* R10: رادیو-پییل استاندارد — نقطهٔ انتخاب + حالت انتخاب‌شدهٔ روشن */}
                      <div className="flex items-stretch gap-1.5 rounded-xl border border-stone-200 bg-stone-100/60 p-1.5">
                        {(['CASH', 'CHEQUE', 'POS'] as const).map((m) => {
                          const on = payMethod === m
                          return (
                            <button key={m} type="button" onClick={() => setPayMethod(m)} role="radio" aria-checked={on}
                              className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-all touch-target',
                                on ? 'bg-white text-emerald-800 shadow-sm ring-1 ring-primary/40' : 'text-stone-500 hover:bg-white/60 hover:text-stone-700')}>
                              <span className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors', on ? 'border-emerald-600' : 'border-stone-300')}>
                                {on && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />}
                              </span>
                              {PAY_LABEL[m]}
                            </button>
                          )
                        })}
                      </div>
                      {payMethod !== 'CASH' && (
                        <p className="mt-2 text-[11px] text-amber-700">
                          <I.banknote size={12} className="inline align-middle" /> برنامه پرداخت ({PAY_LABEL[payMethod]}) به مبلغ {money(total)} ریال برای تاریخ تحویل در تقویم ثبت می‌شود
                        </p>
                      )}
                      {/* R8: مهلت چک — سررسید چکی که هنگام پایان دریافت خودکار ثبت می‌شود */}
                      {payMethod === 'CHEQUE' && (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5">
                          <label className="mb-1 block text-[11px] font-bold text-stone-600">مهلت چک (روز)</label>
                          <NumInput value={chequeDays} onChange={(v: string) => setChequeDays(v)} placeholder="مثلاً ۴۵" />
                          <p className="mt-1.5 text-[10px] leading-4 text-amber-800">
                            {Number(chequeDays) > 0 ? (
                              <>چک {fa(Number(chequeDays) || 0)} روزه هنگام «پایان دریافت» خودکار ثبت می‌شود — سررسید = تاریخ تحویل + مهلت: <b dir="ltr">{faDate(addJalaliDays(deliveryDate || todayJalali(), Number(chequeDays) || 0))}</b></>
                            ) : (
                              <>۰ یا خالی = بدون مهلت مشخص (چک خودکار ثبت نمی‌شود) — عدد را وارد کنید، مثل ۴۵</>
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-stone-600">یادداشت سفارش</label>
                      <Input value={note} onChange={(e: any) => setNote(e.target.value)} placeholder="اختیاری…" />
                    </div>
                  </div>

                  <p className="text-[11px] leading-4 text-stone-500">
                    طرف حساب این سفارش: <b className="text-stone-700">{supSelected ? supSelected.name : 'بدون تأمین‌کنندهٔ مشخص'}</b> — از کارت «طرف حساب (تأمین‌کننده)» در ابتدای همین تب تغییر دهید.
                  </p>

                  <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 pt-3">
                    <Button variant="outline" onClick={() => setCart([])} className="gap-1 text-rose-600">
                      <I.trash size={15} /> خالی کردن سبد
                    </Button>
                    <Button disabled={busy} onClick={() => void submitOrder()} className="gap-2">
                      {busy ? <I.loader size={16} className="animate-spin" /> : <I.send size={16} />}
                      ثبت سفارش ({fa(cart.length)} قلم · {money(total)} ریال)
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ سفارش‌ها ══ */}
        <TabsContent value="list" className="mt-4">
          <Card>
            <CardHeader className="space-y-3 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base"><I.receipt size={18} /> سفارش‌ها</CardTitle>
                <div className="flex gap-2">
                  <Input className="w-52" value={listQ} onChange={(e: any) => setListQ(e.target.value)}
                    onKeyDown={(e: any) => { if (e.key === 'Enter') void loadList() }}
                    placeholder="جست‌وجو کد/تأمین‌کننده…" />
                  <Button variant="outline" size="sm" onClick={() => void loadList()} className="gap-1"><I.refresh size={14} /> به‌روزرسانی</Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'open', label: 'در انتظار تأیید', n: counts?.open },
                  { key: 'active', label: 'در جریان', n: counts?.active },
                  { key: 'done', label: 'تکمیل‌شده', n: counts?.done },
                  { key: 'cancelled', label: 'لغو‌شده', n: counts?.cancelled },
                  { key: 'all', label: 'همه', n: counts?.all },
                ].map((c) => (
                  <button key={c.key} type="button"
                    onClick={() => { setStatusF(c.key); void loadList(c.key) }}
                    className={cn('rounded-lg border px-3 py-1 text-xs transition-colors',
                      statusF === c.key ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-200 text-stone-600 hover:border-emerald-400')}>
                    {c.label} {c.n != null ? fa(c.n) : ''}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {list === null ? (
                <p className="py-8 text-center text-sm text-stone-500"><I.loader size={16} className="mx-auto mb-2 animate-spin" /> در حال دریافت…</p>
              ) : list.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-400">سفارشی با این فیلترها یافت نشد</p>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">کد</TableHead>
                        <TableHead className="text-right">تأمین‌کننده</TableHead>
                        <TableHead className="text-right">تحویل</TableHead>
                        <TableHead className="text-center">پرداخت</TableHead>
                        <TableHead className="text-center">اقلام</TableHead>
                        <TableHead className="text-right">مبلغ</TableHead>
                        <TableHead className="text-center">وضعیت</TableHead>
                        <TableHead className="text-center">عملیات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((o) => (
                        <TableRow key={o.id} className={cn(o.status === 'SUBMITTED' && 'bg-amber-50/70 hover:bg-amber-50')}>
                          <TableCell className="text-xs">
                            <span dir="ltr" className="font-mono font-bold">{o.code}</span>
                            {o.status === 'SUBMITTED' && (
                              <div className="mt-1"><span className="rounded-md border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-800">در انتظار بازبینی مدیر</span></div>
                            )}
                            {o.payMethod === 'CHEQUE' && (o.chequeDays ?? 0) > 0 && (
                              <div className="mt-1 whitespace-nowrap text-[9.5px] text-amber-700" title="مهلت چک این سفارش">چک {fa(o.chequeDays)} روزه</div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-medium">{o.supplierName || '—'}</TableCell>
                          <TableCell className="text-xs text-stone-500"><span dir="ltr">{o.deliveryDate ? faDate(o.deliveryDate) : '—'}</span></TableCell>
                          <TableCell className="text-center"><PayBadge v={o.payMethod} /></TableCell>
                          <TableCell className="text-center text-xs">{fa(o.itemsCount ?? 0)}</TableCell>
                          <TableCell className="text-xs">
                            <span className="font-bold text-stone-700">{money(o.totalAmount)}</span>
                            <span className="text-[10px] text-stone-400"> ریال ≈ {toman(o.totalAmount)} تومان</span>
                          </TableCell>
                          <TableCell className="text-center"><OrderStatusBadge v={o.status} /></TableCell>
                          <TableCell>
                            <div className="flex flex-wrap justify-center gap-1">
                              {o.status === 'DRAFT' && (
                                <Button size="sm" variant="outline" className="gap-1" onClick={() => void orderAction(o, 'submit')}><I.send size={13} /> ارسال</Button>
                              )}
                              {o.status === 'SUBMITTED' && canApprove && (
                                <Button size="sm" variant="outline" className="gap-1 border-amber-300 text-amber-800 hover:bg-amber-50" onClick={() => void openReview(o, 'view')}><I.eye size={13} /> بازبینی و تأیید</Button>
                              )}
                              {o.status === 'SUBMITTED' && !canApprove && (
                                <Button size="sm" variant="outline" className="gap-1" onClick={() => void openReview(o, 'view')} title="مشاهدهٔ کامل سفارش"><I.eye size={13} /> مشاهدهٔ کامل</Button>
                              )}
                              {o.status === 'APPROVED' && canApprove && (
                                <Button size="sm" variant="outline" className="gap-1 border-amber-300 text-amber-800 hover:bg-amber-50" onClick={() => void openReview(o, 'edit')} title="ویرایش اقلام/قیمت پیش از دریافت"><I.pencil size={13} /> ویرایش</Button>
                              )}
                              {o.status === 'APPROVED' && (
                                <Button size="sm" variant="outline" className="gap-1 border-teal-200 text-teal-700 hover:bg-emerald-50" onClick={() => void orderAction(o, 'start-receive')}><I.package size={13} /> شروع دریافت</Button>
                              )}
                              {o.status === 'RECEIVING' && (
                                <Button size="sm" variant="outline" className="gap-1 border-teal-200 text-teal-700 hover:bg-emerald-50" onClick={() => void openReceive(o)}><I.package size={13} /> ثبت دریافت</Button>
                              )}
                              {o.status === 'RECEIVED' && (
                                <Button size="sm" variant="outline" className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => void openVerify(o)}><I.shieldCheck size={13} /> تأیید ناظر دریافت</Button>
                              )}
                              {o.status === 'VERIFIED' && canAccount && (
                                <Button size="sm" variant="outline" className="gap-1 border-teal-300 text-teal-800 hover:bg-teal-50" onClick={() => void openAccount(o)}><I.banknote size={13} /> کنترل سود و ثبت حسابداری</Button>
                              )}
                              {o.status === 'ACCOUNTED' && (
                                <Button size="sm" variant="outline" className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => void orderAction(o, 'final-approve')}><I.check size={13} /> بستن سفارش</Button>
                              )}
                              {['DRAFT', 'SUBMITTED', 'APPROVED'].includes(o.status) && (
                                <Button size="sm" variant="ghost" className="gap-1 text-rose-600 hover:bg-rose-50" onClick={() => setCancelDlg({ order: o, reason: '' })}>
                                  <I.x size={13} /> لغو
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ تقویم پرداخت ══ */}
        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => shiftMonth(-1)} className="gap-1">
                  <I.chevronRight size={16} /> ماه قبل
                </Button>
                <CardTitle>{JALALI_MONTHS[cal.jm - 1]} {toFaDigits(String(cal.jy))}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => shiftMonth(1)} className="gap-1">
                  ماه بعد <I.chevronLeft size={16} />
                </Button>
              </div>
              <div className="text-xs text-stone-500">
                {fa(plans.length)} برنامه پرداخت در این ماه · جمع {money(monthTotal)} ریال
                {calErr && <span className="text-rose-600"> · {calErr}</span>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {calLoading ? (
                <p className="py-6 text-center text-sm text-stone-500"><I.loader size={16} className="mx-auto mb-2 animate-spin" /> در حال دریافت تقویم…</p>
              ) : (
                <>
                  <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-stone-500">
                    {WEEKDAY_FA.map((w) => <div key={w} className="py-1">{w}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {cells.map((c, i) =>
                      c === null ? (
                        <div key={`b${i}`} />
                      ) : (
                        <button key={c.ds} type="button" onClick={() => setSelDay(c.ds)}
                          className={cn('relative min-h-16 rounded-lg border p-1.5 text-right transition-colors',
                            selDay === c.ds ? 'border-emerald-500 bg-emerald-50'
                            : c.ds === today ? 'border-emerald-300 bg-emerald-50/50'
                            : 'border-stone-200 bg-white hover:border-emerald-400')}>
                          <span className={cn('text-xs', c.ds === today ? 'font-black text-emerald-700' : 'text-stone-600')}>{fa(c.d)}</span>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {[...new Set(c.dayPlans.map((p: any) => p.kind))].map((k) => (
                              <span key={k as string} title={PAY_LABEL[k as string]}
                                className={cn('h-1.5 w-1.5 rounded-full', k === 'CHEQUE' ? 'bg-amber-500' : k === 'POS' ? 'bg-teal-500' : 'bg-emerald-500')} />
                            ))}
                            {c.dayCheques.length > 0 && (
                              <span title={`${fa(c.dayCheques.length)} چک سررسید`} className="text-rose-500"><I.banknote size={13} /></span>
                            )}
                          </div>
                        </button>
                      ),
                    )}
                  </div>

                  {selDay && (
                    <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-bold text-stone-700">
                          {(() => { const jd = parseJalali(selDay); return jd ? toFaDigits(formatJalaliLong(jd)) : faDate(selDay) })()}
                        </div>
                        <span dir="ltr" className="text-xs text-stone-400">{faDate(selDay)}</span>
                      </div>

                      {dayPlans.length === 0 && dayCheques.length === 0 && (
                        <p className="py-2 text-center text-sm text-stone-400">برای این روز برنامه‌ای ثبت نشده</p>
                      )}

                      {dayPlans.map((p) => (
                        <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <PayBadge v={p.kind} />
                            <span className="text-sm font-bold text-stone-700">{money(p.amount)} ریال</span>
                            <span className="text-[11px] text-stone-400">≈ {toman(p.amount)} تومان</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                            {p.orderCode && <span dir="ltr" className="font-mono">{p.orderCode}</span>}
                            {p.supplierName && <span>{p.supplierName}</span>}
                            <span className={cn('rounded-md px-1.5 py-0.5',
                              p.status === 'DONE' ? 'bg-emerald-100 text-emerald-700'
                              : p.status === 'CONFIRMED' ? 'bg-teal-50 text-teal-800' : 'bg-stone-100 text-stone-600')}>
                              {PLAN_STATUS_FA[p.status] ?? p.status}
                            </span>
                            {p.status === 'PLANNED' && (
                              <Button size="sm" variant="outline" className="h-7 gap-1 border-teal-200 text-teal-700" onClick={() => void planAction(p, 'CONFIRMED')}>تأیید</Button>
                            )}
                            {p.status === 'CONFIRMED' && (
                              <Button size="sm" variant="outline" className="h-7 gap-1 border-emerald-300 text-emerald-700" onClick={() => void planAction(p, 'DONE')}><I.check size={13} /> انجام شد</Button>
                            )}
                          </div>
                        </div>
                      ))}

                      {dayCheques.map((c) => (
                        <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                              <I.banknote size={12} /> چک سررسید
                            </span>
                            <span dir="ltr" className="text-xs font-mono font-bold text-stone-700">{c.number}</span>
                            <span className="text-sm font-bold text-stone-700">{money(c.amount)} ریال</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                            {c.recipient && <span>{c.recipient}</span>}
                            <span className={cn('rounded-md px-1.5 py-0.5',
                              c.status === 'CLEARED' ? 'bg-emerald-100 text-emerald-700'
                              : ['BOUNCED', 'REJECTED', 'RETURNED'].includes(c.status) ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700')}>
                              {CHEQUE_STATUS_FA[c.status] ?? c.status}
                            </span>
                            <span className={cn((c.daysLeft ?? 0) < 0 ? 'text-rose-600' : 'text-stone-400')}>
                              {(c.daysLeft ?? 0) > 0 ? `${fa(c.daysLeft)} روز مانده` : (c.daysLeft ?? 0) === 0 ? 'امروز' : `${fa(Math.abs(c.daysLeft ?? 0))} روز گذشته`}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* دیالوگ گردش کالا */}
      <CirculationDialog open={!!circOf} onOpenChange={(v: boolean) => { if (!v) setCircOf(null) }} productId={circOf} />

      {/* دیالوگ اندازهٔ کارتن */}
      <Dialog open={!!cartonAsk} onOpenChange={(v: boolean) => { if (!v) setCartonAsk(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>اندازهٔ کارتن — {cartonAsk?.product?.name}</DialogTitle>
            <DialogDescription>
              تعداد در هر کارتن برای این کالا ثبت نشده. لطفاً از روی جعبهٔ کالا وارد کنید.
              این اندازه به‌عنوان پیش‌فرض کارتن این کالا ذخیره می‌شود — دفعهٔ بعد دیگر پرسیده نمی‌شود (قابل تغییر از شناسنامهٔ کالا).
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input dir="ltr" className="w-28 text-center font-mono" inputMode="numeric" autoFocus
              value={String(cartonAsk?.size ?? '')}
              onChange={(e: any) => setCartonAsk((a: any) => ({ ...a, size: e.target.value }))}
              onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); confirmCartonAsk() } }} />
            <span className="text-sm text-stone-600">عدد در هر کارتن</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCartonAsk(null)}>انصراف</Button>
            <Button onClick={() => confirmCartonAsk()} className="gap-1">
              <I.carton size={14} /> ثبت اندازه و افزودن کارتن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ لغو سفارش */}
      <Dialog open={!!cancelDlg} onOpenChange={(v: boolean) => { if (!v) setCancelDlg(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>لغو سفارش {cancelDlg?.order?.code}</DialogTitle>
            <DialogDescription>دلیل لغو الزامی است (حداقل ۳ حرف).</DialogDescription>
          </DialogHeader>
          <Input value={cancelDlg?.reason ?? ''} onChange={(e: any) => setCancelDlg({ ...cancelDlg, reason: e.target.value })}
            placeholder="مثلاً: تأمین‌کننده کالا را ندارد" autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDlg(null)}>انصراف</Button>
            <Button
              variant="destructive"
              disabled={(cancelDlg?.reason ?? '').trim().length < 3}
              onClick={() => {
                if (!cancelDlg) return
                void orderAction(cancelDlg.order, 'cancel', { reason: cancelDlg.reason.trim() })
                setCancelDlg(null)
              }}
              className="gap-1">
              <I.x size={14} /> لغو سفارش
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ R8: دیالوگ ثبت دریافت — دو‌مرحله‌ای: تعداد + مرجوعی جزئی ══ */}
      <Dialog open={!!receiveDlg} onOpenChange={(v: boolean) => { if (!v) setReceiveDlg(null) }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <I.package size={18} /> ثبت دریافت {receiveDlg?.order?.code}
              {receiveDlg?.items && (
                <Button size="sm" variant="outline" className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => receiveAllFull()}>
                  <I.checkCheck size={14} /> همه تحویل کامل شد
                </Button>
              )}
            </DialogTitle>
            <DialogDescription>
              تعداد دریافت‌شده و مرجوعی هر قلم را وارد کنید — فقط واحدهای سالم (دریافت − مرجوعی) وارد انبار می‌شود؛ مرجوعی علت دارد.
            </DialogDescription>
          </DialogHeader>
          {receiveDlg?.items == null ? (
            <p className="py-6 text-center text-sm text-stone-500"><I.loader size={16} className="mx-auto mb-2 animate-spin" /> در حال دریافت اقلام…</p>
          ) : (
            <div className="max-h-[62vh] space-y-2 overflow-y-auto pl-0.5">
              {receiveDlg.items.map((it: any, i: number) => {
                const st = computeItemStatus(Number(it.qty) || 0, Number(it.receivedQty ?? 0), Number(it.returnedQty ?? 0))
                const printedDiffers = Number(it.printedPrice ?? 0) > 0 && it.sellPrice != null && Number(it.printedPrice) !== Number(it.sellPrice)
                return (
                  <div key={it.id} className={cn('rounded-xl border p-2.5 transition-colors',
                    st === 'MISSING' ? 'border-rose-200 bg-rose-50/40'
                      : st === 'PARTIAL_RETURN' || st === 'RETURNED' ? 'border-amber-300 bg-amber-50/50'
                      : st === 'PARTIAL' ? 'border-amber-200 bg-amber-50/30' : 'border-stone-200')}>
                    {/* ردیف اصلی: نام | دریافت | مرجوعی | میان‌برها */}
                    <div className="grid grid-cols-[minmax(0,1fr)_120px_120px_auto] items-center gap-x-2 gap-y-1.5">
                      <div className="flex min-w-0 flex-col items-start gap-1">
                        <span className="truncate text-xs font-bold text-stone-700">{it.name}</span>
                        <span className="flex flex-wrap items-center gap-1 text-[10px] text-stone-400">
                          <span>سفارش: {fa(it.qty)}</span>
                          {printedDiffers && (
                            <span className="rounded border border-amber-300 bg-amber-100 px-1 py-px font-bold text-amber-800" title={`قیمت چاپی فاکتور ${money(it.printedPrice)} ریال با قیمت فروش فعلی (${money(it.sellPrice)} ریال) فرق دارد`}>
                              قیمت چاپی متفاوت
                            </span>
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="mb-0.5 block text-center text-[9.5px] text-stone-400">دریافت‌شده</span>
                        <NumInput value={String(it.receivedQty ?? 0)} onChange={(v: string) => patchReceiveItem(i, { receivedQty: Number(v) || 0 })} />
                      </div>
                      <div>
                        <span className="mb-0.5 block text-center text-[9.5px] text-stone-400">مرجوعی</span>
                        <NumInput value={String(it.returnedQty ?? 0)} onChange={(v: string) => patchReceiveItem(i, { returnedQty: Number(v) || 0 })} />
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" title="تحویل کامل — همین قلم"
                          onClick={() => patchReceiveItem(i, { receivedQty: it.qty, returnedQty: 0 })}
                          className="flex h-9 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 active:scale-95">
                          <I.check size={13} /> کامل
                        </button>
                        <button type="button" title="نرسید — همین قلم"
                          onClick={() => patchReceiveItem(i, { receivedQty: 0, returnedQty: 0 })}
                          className="flex h-9 items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 text-[10px] font-bold text-rose-700 transition-colors hover:bg-rose-100 active:scale-95">
                          <I.x size={13} /> نرسید
                        </button>
                      </div>
                    </div>
                    {/* علت مرجوعی — فقط وقتی مرجوعی > 0 */}
                    {Number(it.returnedQty ?? 0) > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-dashed border-amber-200 pt-2">
                        <span className="text-[10px] font-bold text-amber-800">علت مرجوعی ({fa(it.returnedQty)} عدد):</span>
                        <div className="w-52">
                          <Select dir="rtl" value={it.returnReason || ''} onValueChange={(v: string) => patchReceiveItem(i, { returnReason: v })}>
                            <SelectTrigger className="h-9 w-full text-xs"><SelectValue placeholder="انتخاب علت…" /></SelectTrigger>
                            <SelectContent>
                              {RETURN_REASONS.map((rr) => (
                                <SelectItem key={rr} value={rr} className="text-xs">{rr}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                    {/* وضعیت محاسبه‌شدهٔ همین قلم */}
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className={cn('rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold', ITEM_STATUS_CLS[st] ?? ITEM_STATUS_CLS.PENDING)}>
                        {ITEM_STATUS_FA[st] ?? st}
                      </span>
                      <span className="text-[10px] text-stone-400">
                        وارد انبار: <b className="text-stone-600">{fa(Math.max(0, Number(it.receivedQty ?? 0) - Number(it.returnedQty ?? 0)))}</b> از {fa(it.qty)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {receiveDlg?.items && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-[11px] text-stone-600">
              <span>
                {fa(receiveDlg.items.filter((x: any) => computeItemStatus(x.qty, x.receivedQty ?? 0, x.returnedQty ?? 0) === 'OK').length)} قلم کامل ·{' '}
                {fa(receiveDlg.items.filter((x: any) => ['PARTIAL_RETURN', 'RETURNED'].includes(computeItemStatus(x.qty, x.receivedQty ?? 0, x.returnedQty ?? 0))).length)} مرجوعی ·{' '}
                {fa(receiveDlg.items.filter((x: any) => computeItemStatus(x.qty, x.receivedQty ?? 0, x.returnedQty ?? 0) === 'MISSING').length)} نرسید
              </span>
              <span>جمع ورودی انبار: <b>{fa(receiveDlg.items.reduce((s: number, x: any) => s + Math.max(0, Number(x.receivedQty ?? 0) - Number(x.returnedQty ?? 0)), 0))}</b> واحد</span>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveDlg(null)}>انصراف</Button>
            <Button disabled={!receiveDlg?.items} onClick={() => void confirmReceive()} className="gap-1">
              <I.check size={14} /> پایان دریافت و ثبت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ R8: دیالوگ بازبینی و تأیید سفارش (نمای کامل + ویرایش مدیر) ══ */}
      <Dialog open={!!reviewDlg} onOpenChange={(v: boolean) => { if (!v) setReviewDlg(null) }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          {!reviewDlg?.detail ? (
            <div>
              <DialogHeader>
                <DialogTitle>بازبینی سفارش {reviewDlg?.order?.code}</DialogTitle>
                <DialogDescription>در حال دریافت جزئیات کامل…</DialogDescription>
              </DialogHeader>
              <p className="py-8 text-center text-sm text-stone-500"><I.loader size={18} className="mx-auto mb-2 animate-spin" /> در حال دریافت…</p>
            </div>
          ) : reviewDlg.mode === 'view' ? (() => {
            const d = reviewDlg.detail
            const o = reviewDlg.order
            return (
              <div>
                <DialogHeader>
                  <DialogTitle className="flex flex-wrap items-center gap-2">
                    <I.receipt size={18} /> سفارش {d.code} — بازبینی پیش از تأیید
                    <OrderStatusBadge v={d.status} />
                  </DialogTitle>
                  <DialogDescription>نمای کامل سفارش برای بررسی مدیر — در صورت نیاز ویرایش کنید و بعد تأیید نهایی.</DialogDescription>
                </DialogHeader>

                {/* شناسنامهٔ سفارش — چیدمان چاپی A4 */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] sm:grid-cols-3">
                    {[
                      { k: 'طرف حساب', v: d.supplierName || 'بدون تأمین‌کننده' },
                      { k: 'تاریخ تحویل', v: d.deliveryDate ? faDate(d.deliveryDate) : '—' },
                      { k: 'روش پرداخت', v: PAY_LABEL[d.payMethod] ?? d.payMethod },
                      ...(d.payMethod === 'CHEQUE' ? [{ k: 'مهلت چک', v: (d.chequeDays ?? 0) > 0 ? `${fa(d.chequeDays)} روز` : 'بدون مهلت مشخص' }] : []),
                      { k: 'ثبت‌کننده', v: d.createdBy?.fullName ?? '—' },
                      { k: 'تاریخ ثبت', v: jShort(d.createdAt) },
                    ].map((c) => (
                      <div key={c.k}>
                        <div className="text-stone-400">{c.k}</div>
                        <div className="font-bold text-stone-700">{c.v}</div>
                      </div>
                    ))}
                  </div>

                  {/* اقلام */}
                  <div className="overflow-x-auto rounded-xl border border-stone-200">
                    <table dir="rtl" className="w-full min-w-[640px] text-xs">
                      <thead>
                        <tr className="border-b bg-stone-50 text-[11px] font-bold text-stone-500">
                          <th className="p-2 text-right">#</th>
                          <th className="p-2 text-right">کالا</th>
                          <th className="p-2 text-center">تعداد</th>
                          <th className="p-2 text-center">کارتن</th>
                          <th className="p-2 text-center">قیمت واحد</th>
                          <th className="p-2 text-center">قیمت چاپی</th>
                          <th className="p-2 text-center">جمع سطر</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.items.map((it: any, i: number) => (
                          <tr key={it.id} className="border-b border-stone-100 last:border-b-0">
                            <td className="p-2 text-stone-400">{fa(i + 1)}</td>
                            <td className="p-2 font-medium text-stone-700">{it.name}</td>
                            <td className="p-2 text-center">{fa(it.qty)}</td>
                            <td className="p-2 text-center text-stone-500">{it.cartonQty ? `${fa(it.cartonQty)} × ${fa(it.unitsPerCarton || 0)}` : '—'}</td>
                            <td className="p-2 text-center"><span dir="ltr">{money(it.unitBuyPrice)}</span></td>
                            <td className="p-2 text-center"><span dir="ltr">{money(it.printedPrice)}</span></td>
                            <td className="p-2 text-center font-bold"><span dir="ltr">{money(it.qty * it.unitBuyPrice)}</span></td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-stone-200 bg-stone-50 font-bold">
                          <td className="p-2" colSpan={5}>جمع کل ({fa(d.items.length)} قلم)</td>
                          <td className="p-2 text-center" colSpan={2}><span dir="ltr">{money(d.totalAmount)}</span> ریال</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* R11: اقلام ضایعاتی که همراه همین سفارش به تأمین‌کننده برمی‌گردند —
                      فاکتور کامل پیش از تأیید نهایی (درخواست مالک: بازبینی و تأیید) */}
                  {(d.wasteReturns ?? []).length > 0 && (() => {
                    const wr: any[] = d.wasteReturns ?? []
                    const total = wr.reduce((sm: number, w: any) => sm + (Number(w.estValue) || 0), 0)
                    return (
                      <div className="overflow-hidden rounded-xl border border-amber-300 bg-amber-50/60">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-100/70 px-3 py-2">
                          <p className="flex items-center gap-1.5 text-[12px] font-black text-amber-900">
                            <I.trash size={15} /> اقلام برگشتی به تأمین‌کننده (ضایعات) — {fa(wr.length)} قلم
                          </p>
                          <p className="text-[10.5px] font-bold text-amber-800">ارزش تقریبی: <span dir="ltr">{money(total)}</span> ریال</p>
                        </div>
                        <div className="px-3 py-2 text-[11px] leading-5">
                          <p className="mb-2 text-amber-800">
                            این اقلام همراه مرسولهٔ برگشتی به مامور پخشِ تأمین‌کننده سپرده می‌شوند — پیش از تأیید نهایی، فاکتور کامل را با بارنامه تطبیق دهید:
                          </p>
                          <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white">
                            <table dir="rtl" className="w-full min-w-[460px] text-xs">
                              <thead>
                                <tr className="border-b bg-amber-50 text-[11px] font-bold text-amber-800">
                                  <th className="p-2 text-right">#</th>
                                  <th className="p-2 text-right">کالا</th>
                                  <th className="p-2 text-center">تعداد</th>
                                  <th className="p-2 text-center">علت</th>
                                  <th className="p-2 text-center">ارزش تقریبی (ریال)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {wr.map((w: any, i: number) => (
                                  <tr key={w.id} className="border-b border-stone-100 last:border-b-0">
                                    <td className="p-2 text-stone-400">{fa(i + 1)}</td>
                                    <td className="p-2 font-medium text-stone-700">{w.name}</td>
                                    <td className="p-2 text-center">{fa(w.qty)} {w.unit}</td>
                                    <td className="p-2 text-center text-amber-800">{w.reasonLabel}</td>
                                    <td className="p-2 text-center"><span dir="ltr">{money(w.estValue)}</span></td>
                                  </tr>
                                ))}
                                <tr className="border-t-2 border-amber-200 bg-amber-50 font-bold">
                                  <td className="p-2" colSpan={4}>جمع اقلام برگشتی</td>
                                  <td className="p-2 text-center"><span dir="ltr">{money(total)}</span> ریال</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          {(d.wasteReturns ?? []).some((w: any) => w.repName) && (
                            <p className="mt-2 flex flex-wrap items-center gap-1 text-[10.5px] text-teal-800">
                              <I.user size={13} /> مامور پخشِ تحویل‌گیرنده: <b>{(d.wasteReturns ?? []).find((w: any) => w.repName)?.repName}</b>
                              {(d.wasteReturns ?? []).find((w: any) => w.repPhone) && <span dir="ltr" className="num">{toFaDigits((d.wasteReturns ?? []).find((w: any) => w.repPhone)?.repPhone)}</span>}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  {d.note && (
                    <div className="rounded-xl border border-stone-200 bg-white p-3 text-[11px] leading-5 text-stone-600">
                      <span className="font-bold text-stone-500">یادداشت: </span>{d.note}
                    </div>
                  )}

                  <p className="text-[10px] text-stone-400 print:hidden">چاپ با دکمهٔ «چاپ» — نسخهٔ A4 بدون دکمه‌ها.</p>
                </div>

                <DialogFooter className="print:hidden">
                  <Button variant="outline" onClick={() => setReviewDlg(null)}>بستن</Button>
                  <Button variant="outline" className="gap-1" onClick={() => printHTML(orderPrintHTML(d))}>
                    <I.printer size={15} /> چاپ
                  </Button>
                  {canApprove && ['SUBMITTED', 'APPROVED'].includes(d.status) && (
                    <Button variant="outline" className="gap-1 border-amber-300 text-amber-800 hover:bg-amber-50" onClick={() => setReviewDlg({ ...reviewDlg, mode: 'edit', edit: snapshotForEdit(d) })}>
                      <I.pencil size={15} /> ویرایش سفارش
                    </Button>
                  )}
                  {d.status === 'SUBMITTED' && canApprove && (
                    <Button className="gap-1" onClick={() => { void orderAction(o, 'approve'); setReviewDlg(null) }}>
                      <I.check size={15} /> تأیید سفارش
                    </Button>
                  )}
                </DialogFooter>
              </div>
            )
          })() : (() => {
            /* ── حالت ویرایش ── */
            const d = reviewDlg.detail
            const e = reviewDlg.edit ?? snapshotForEdit(d)
            return (
              <div>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <I.pencil size={18} /> ویرایش سفارش {d.code}
                  </DialogTitle>
                  <DialogDescription>اقلام، قیمت‌ها، طرف‌حساب و شرایط را اصلاح کنید — پس از ذخیره، سفارش آمادهٔ تأیید نهایی است.</DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  {/* سرآیند ویرایش */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-bold text-stone-500">طرف حساب (تأمین‌کننده)</label>
                      <SupplierCombo suppliers={suppliers} value={e.supplierId || 'none'} onChange={(v: string) => patchReviewEdit({ supplierId: v === 'none' ? '' : v })} />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-stone-500">تاریخ تحویل</label>
                      <JalaliDate value={e.deliveryDate} onChange={(v: string) => patchReviewEdit({ deliveryDate: v })} />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-stone-500">روش پرداخت</label>
                      {/* R10: رادیو-پییل استاندارد — هم‌سان با سبد سفارش */}
                      <div className="flex items-stretch gap-1.5 rounded-xl border border-stone-200 bg-stone-100/60 p-1.5">
                        {(['CASH', 'CHEQUE', 'POS'] as const).map((m) => {
                          const on = e.payMethod === m
                          return (
                            <button key={m} type="button" onClick={() => patchReviewEdit({ payMethod: m })} role="radio" aria-checked={on}
                              className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-all touch-target',
                                on ? 'bg-white text-emerald-800 shadow-sm ring-1 ring-primary/40' : 'text-stone-500 hover:bg-white/60 hover:text-stone-700')}>
                              <span className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors', on ? 'border-emerald-600' : 'border-stone-300')}>
                                {on && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />}
                              </span>
                              {PAY_LABEL[m]}
                            </button>
                          )
                        })}
                      </div>
                      {e.payMethod === 'CHEQUE' && (
                        <div className="mt-1.5">
                          <label className="mb-1 block text-[10px] font-bold text-stone-500">مهلت چک (روز)</label>
                          <NumInput value={e.chequeDays} onChange={(v: string) => patchReviewEdit({ chequeDays: v })} placeholder="مثلاً ۴۵" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* افزودن قلم جدید */}
                  <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-2.5">
                    <label className="mb-1 block text-[11px] font-bold text-stone-500">افزودن قلم (جست‌وجوی کالا)</label>
                    <Input value={e.addQ ?? ''} onChange={(ev: any) => void reviewAddSearch(ev.target.value)} placeholder="نام کالا را بنویسید…" className="h-9" />
                    {e.addRs && e.addRs.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {e.addRs.map((p: any) => (
                          <button key={p.id} type="button" onClick={() => reviewAddProduct(p)}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800 transition-colors hover:bg-emerald-100">
                            + {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* اقلام قابل‌ویرایش */}
                  <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                    <div className="min-w-[820px]">
                      <div dir="rtl" className="grid grid-cols-[minmax(0,1fr)_170px_130px_150px_130px_40px] items-center gap-x-2 border-b border-stone-200 bg-stone-50 px-2.5 py-2 text-[11px] font-bold text-stone-500">
                        <span>کالا</span>
                        <span className="text-center">تعداد (عدد)</span>
                        <span className="text-center">کارتن</span>
                        <span className="text-center">قیمت واحد</span>
                        <span className="text-center">جمع سطر</span>
                        <span className="text-center">حذف</span>
                      </div>
                      {e.items.map((l: any, i: number) => (
                        <div key={l.productId || `new-${i}`} dir="rtl" className="grid grid-cols-[minmax(0,1fr)_170px_130px_150px_130px_40px] items-center gap-x-2 border-b border-stone-100 px-2.5 py-2 last:border-b-0 hover:bg-stone-50">
                          <span className="truncate text-xs font-bold text-stone-700" title={l.name}>{l.name}</span>
                          <div className="flex items-center justify-center gap-1">
                            <NumStepper value={Number(l.qty) || 0} min={0} step={1}
                              onChange={(v: number) => patchReviewItem(i, { qty: v })} />
                          </div>
                          <div className="flex items-center justify-center gap-1">
                            <NumStepper value={Number(l.cartonQty) || 0} min={0} step={1}
                              hint={Number(l.upc) > 0 ? `× ${fa(l.upc)}` : undefined}
                              onChange={(v: number) => patchReviewItem(i, { cartonQty: v })} />
                            <Input dir="ltr" className="h-9 w-14 text-center font-mono text-xs" inputMode="numeric"
                              value={String(l.upc ?? 0)} title="در هر کارتن"
                              onChange={(ev: any) => patchReviewItem(i, { upc: numify(ev.target.value) })} />
                          </div>
                          <MoneyInput value={String(l.unitPrice ?? 0)} onChange={(raw: string) => patchReviewItem(i, { unitPrice: numify(raw) })} />
                          <div className="text-center">
                            <span dir="ltr" className="block text-xs font-bold text-stone-700">
                              {money((Number(l.qty) || 0) * (Number(l.unitPrice) || 0) + (Number(l.cartonQty) || 0) * (Number(l.upc) || 0) * (Number(l.unitPrice) || 0))}
                            </span>
                            <span className="text-[9.5px] text-stone-400">{fa(reviewEditUnits(l))} عدد</span>
                          </div>
                          <div className="flex justify-center">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:bg-rose-50"
                              onClick={() => patchReviewEdit({ items: e.items.filter((_: any, j: number) => j !== i) })}>
                              <I.trash size={14} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* R11: اقلام برگشتی به تأمین‌کننده — در حالت ویرایش هم دیده شود (فاکتور کامل) */}
                  {(reviewDlg.detail?.wasteReturns ?? []).length > 0 && (() => {
                    const wr: any[] = reviewDlg.detail?.wasteReturns ?? []
                    const total = wr.reduce((sm: number, w: any) => sm + (Number(w.estValue) || 0), 0)
                    return (
                      <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-2.5 text-[11px] leading-5">
                        <p className="mb-1.5 flex flex-wrap items-center justify-between gap-2 font-black text-amber-900">
                          <span className="flex items-center gap-1.5"><I.trash size={14} /> اقلام برگشتی به تأمین‌کننده — {fa(wr.length)} قلم (غیرقابل ویرایش در این فرم)</span>
                          <span className="text-amber-800">ارزش تقریبی: <span dir="ltr">{money(total)}</span> ریال</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {wr.map((w: any) => (
                            <span key={w.id} className="rounded-md border border-amber-200 bg-white px-2 py-0.5 text-[10.5px] font-bold text-amber-800" title={`علت: ${w.reasonLabel} · ارزش ${money(w.estValue)} ریال`}>
                              {w.name} · {fa(w.qty)} {w.unit}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  {/* یادداشت + جمع */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-bold text-stone-500">یادداشت سفارش</label>
                      <Input value={e.note ?? ''} onChange={(ev: any) => patchReviewEdit({ note: ev.target.value })} placeholder="اختیاری…" className="h-9" />
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-center">
                      <div className="text-[10px] text-stone-500">جمع کل پس از ویرایش</div>
                      <div className="text-sm font-black text-emerald-700"><span dir="ltr">{money(reviewEditTotal(e))}</span> ریال</div>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setReviewDlg({ ...reviewDlg, mode: 'view', edit: null })}>بازگشت به نمای بازبینی</Button>
                  <Button disabled={reviewDlg.busy} onClick={() => void saveReviewEdit()} className="gap-1">
                    {reviewDlg.busy ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />} ذخیرهٔ ویرایش
                  </Button>
                </DialogFooter>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ══ R8: دیالوگ تأیید ناظر دریافت ══ */}
      <Dialog open={!!verifyDlg} onOpenChange={(v: boolean) => { if (!v) setVerifyDlg(null) }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          {!verifyDlg?.detail ? (
            <div>
              <DialogHeader>
                <DialogTitle>تأیید ناظر دریافت {verifyDlg?.order?.code}</DialogTitle>
                <DialogDescription>در حال دریافت خلاصهٔ دریافت…</DialogDescription>
              </DialogHeader>
              <p className="py-8 text-center text-sm text-stone-500"><I.loader size={18} className="mx-auto mb-2 animate-spin" /> در حال دریافت…</p>
            </div>
          ) : (() => {
            const d = verifyDlg.detail
            const items: any[] = d.items ?? []
            const okN = items.filter((x) => x.status === 'OK').length
            const retN = items.filter((x) => x.status === 'PARTIAL_RETURN' || x.status === 'RETURNED').length
            const missN = items.filter((x) => x.status === 'MISSING').length
            const partN = items.filter((x) => x.status === 'PARTIAL').length
            const acceptedTotal = items.reduce((s, x) => s + Math.max(0, (x.receivedQty ?? 0) - (x.returnedQty ?? 0)) * x.unitBuyPrice, 0)
            return (
              <div>
                <DialogHeader>
                  <DialogTitle className="flex flex-wrap items-center gap-2">
                    <I.shieldCheck size={18} /> تأیید ناظر دریافت — {d.code}
                    <OrderStatusBadge v={d.status} />
                  </DialogTitle>
                  <DialogDescription>خلاصهٔ ثبت‌شدهٔ انباردار را بررسی کنید؛ با تأیید شما سفارش به مرحلهٔ حسابداری می‌رود.</DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] sm:grid-cols-4">
                    {[
                      { k: 'دریافت‌کننده', v: d.receivedBy?.fullName ?? '—' },
                      { k: 'تاریخ دریافت', v: jShort(d.history?.find?.((h: any) => h.action === 'receive')?.at) },
                      { k: 'قلم کامل', v: `${fa(okN)} قلم` },
                      { k: 'مرجوعی', v: `${fa(retN)} قلم` },
                      { k: 'کسری بدون مرجوعی', v: `${fa(partN)} قلم` },
                      { k: 'نرسید', v: `${fa(missN)} قلم` },
                      { k: 'مبلغ سفارش', v: `${money(d.totalAmount)} ریال` },
                      { k: 'ارزش کالای واردشده', v: `${money(acceptedTotal)} ریال` },
                    ].map((c) => (
                      <div key={c.k}>
                        <div className="text-stone-400">{c.k}</div>
                        <div className="font-bold text-stone-700" dir="auto">{c.v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-stone-200">
                    <table dir="rtl" className="w-full min-w-[600px] text-xs">
                      <thead>
                        <tr className="border-b bg-stone-50 text-[11px] font-bold text-stone-500">
                          <th className="p-2 text-right">کالا</th>
                          <th className="p-2 text-center">سفارش</th>
                          <th className="p-2 text-center">دریافت</th>
                          <th className="p-2 text-center">مرجوعی</th>
                          <th className="p-2 text-center">وارد انبار</th>
                          <th className="p-2 text-center">وضعیت</th>
                          {retN > 0 && <th className="p-2 text-center">علت مرجوعی</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it: any) => (
                          <tr key={it.id} className="border-b border-stone-100 last:border-b-0">
                            <td className="p-2 font-medium text-stone-700">{it.name}</td>
                            <td className="p-2 text-center">{fa(it.qty)}</td>
                            <td className="p-2 text-center">{fa(it.receivedQty ?? 0)}</td>
                            <td className="p-2 text-center">{(it.returnedQty ?? 0) > 0 ? <span className="font-bold text-amber-700">{fa(it.returnedQty)}</span> : '—'}</td>
                            <td className="p-2 text-center font-bold">{fa(Math.max(0, (it.receivedQty ?? 0) - (it.returnedQty ?? 0)))}</td>
                            <td className="p-2 text-center">
                              <span className={cn('rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold', ITEM_STATUS_CLS[it.status] ?? ITEM_STATUS_CLS.PENDING)}>{ITEM_STATUS_FA[it.status] ?? it.status}</span>
                            </td>
                            {retN > 0 && <td className="p-2 text-center text-[10px] text-stone-500">{it.returnReason || '—'}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setVerifyDlg(null)}>انصراف</Button>
                  <Button className="gap-1" onClick={() => { void orderAction(verifyDlg.order, 'verify'); setVerifyDlg(null) }}>
                    <I.check size={15} /> تأیید دریافت و ارجاع به حسابداری
                  </Button>
                </DialogFooter>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ══ R8: دیالوگ کنترل سود و ثبت حسابداری (خانم درویشی) ══ */}
      <Dialog open={!!accountDlg} onOpenChange={(v: boolean) => { if (!v) setAccountDlg(null) }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          {!accountDlg?.rows ? (
            <div>
              <DialogHeader>
                <DialogTitle>کنترل سود و ثبت حسابداری {accountDlg?.order?.code}</DialogTitle>
                <DialogDescription>در حال دریافت اقلام…</DialogDescription>
              </DialogHeader>
              <p className="py-8 text-center text-sm text-stone-500"><I.loader size={18} className="mx-auto mb-2 animate-spin" /> در حال دریافت…</p>
            </div>
          ) : (() => {
            const d = accountDlg.detail
            const rows: any[] = accountDlg.rows
            const finalTotal = rows.reduce((s, x) => s + (Number(x.unitBuyPrice) || 0) * (Number(x.qty) || 0), 0)
            const marginOf = (x: any) => {
              const buy = Number(x.unitBuyPrice) || 0
              const sell = Number(x.printedPrice) || 0
              if (buy <= 0) return null
              return ((sell - buy) / buy) * 100
            }
            return (
              <div>
                <DialogHeader>
                  <DialogTitle className="flex flex-wrap items-center gap-2">
                    <I.banknote size={18} /> کنترل سود و ثبت حسابداری — {d.code}
                    <OrderStatusBadge v={d.status} />
                  </DialogTitle>
                  <DialogDescription>
                    بهای خرید و قیمت چاپی را از روی فاکتور اصلاح کنید — درصد سود رنگ می‌گیرد (قرمز &lt; ۱۲٪ · کهربایی &lt; ۲۱٪ · سبز ≥ ۲۱٪)؛ ثبت، سند آرشیو فاکتور هم می‌سازد.
                  </DialogDescription>
                </DialogHeader>

                <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                  <div className="min-w-[760px]">
                    <div dir="rtl" className="grid grid-cols-[minmax(0,1fr)_92px_92px_150px_150px_104px_96px] items-center gap-x-2 border-b border-stone-200 bg-stone-50 px-2.5 py-2 text-[11px] font-bold text-stone-500">
                      <span>کالا</span>
                      <span className="text-center">سفارش</span>
                      <span className="text-center">وارد انبار</span>
                      <span className="text-center">بهای واحد (ریال)</span>
                      <span className="text-center">قیمت چاپی (ریال)</span>
                      <span className="text-center">سود</span>
                      <span className="text-center">مرجوعی؟</span>
                    </div>
                    {rows.map((x: any, i: number) => {
                      const mg = marginOf(x)
                      return (
                        <div key={x.id} dir="rtl" className={cn('grid grid-cols-[minmax(0,1fr)_92px_92px_150px_150px_104px_96px] items-center gap-x-2 border-b border-stone-100 px-2.5 py-2 last:border-b-0 hover:bg-stone-50',
                          x.markedReturned && 'bg-rose-50/60')}>
                          <span className="truncate text-xs font-bold text-stone-700" title={x.name}>{x.name}</span>
                          <span className="text-center text-xs text-stone-500">{fa(x.qty)}</span>
                          <span className="text-center text-xs font-bold text-stone-700">{fa(x.accepted)}</span>
                          <MoneyInput value={String(x.unitBuyPrice ?? 0)} onChange={(raw: string) => patchAccountRow(i, { unitBuyPrice: numify(raw) })} />
                          <MoneyInput value={String(x.printedPrice ?? 0)} onChange={(raw: string) => patchAccountRow(i, { printedPrice: numify(raw) })} />
                          <div className="text-center">
                            {mg == null ? (
                              <span className="text-[10px] text-stone-400">بهای صفر</span>
                            ) : (
                              <span className={cn('inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-black',
                                mg < 12 ? 'border-rose-200 bg-rose-100 text-rose-700' : mg < 21 ? 'border-amber-200 bg-amber-100 text-amber-800' : 'border-emerald-200 bg-emerald-100 text-emerald-700')}>
                                {fa(Math.round(mg))}٪
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-center gap-1">
                            {(x.returnedQty ?? 0) > 0 && (
                              <span className="rounded border border-amber-300 bg-amber-100 px-1 py-px text-[9px] font-bold text-amber-800" title="مرجوعی ثبت‌شده هنگام دریافت">{fa(x.returnedQty)} مرجوع</span>
                            )}
                            <label className="flex cursor-pointer items-center gap-1 text-[10px] text-stone-500" title="این قلم کامل مرجوع شده و در سند آرشیو «اقلام مرجوعی» ثبت می‌شود">
                              <Checkbox checked={!!x.markedReturned} onCheckedChange={(v: boolean) => patchAccountRow(i, { markedReturned: v === true })} />
                              علامت
                            </label>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs">
                  <span className="text-stone-500">جمع نهایی (بهای خرید × تعداد سفارش):</span>
                  <span className="font-black text-emerald-700"><span dir="ltr">{money(finalTotal)}</span> ریال ≈ {toman(finalTotal)} تومان</span>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setAccountDlg(null)}>انصراف</Button>
                  <Button disabled={accountDlg.busy} onClick={() => void submitAccount()} className="gap-1">
                    {accountDlg.busy ? <I.loader size={15} className="animate-spin" /> : <I.check size={15} />} ثبت در حسابداری + ساخت سند آرشیو
                  </Button>
                </DialogFooter>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
