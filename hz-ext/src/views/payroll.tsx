import { useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn, Button, Input, Card, CardContent, CardHeader, CardTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, JALALI_MONTHS, Stepper, TimeInput, printHTML, amountWords, money, todayJalali, Icon, I } from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   hr/payroll — حقوق و دستمزد (بازنویسی R5-H)
   یک نوار افقی: ناو ماه + فیلتر پرسنل + چیپ‌های جمع + چاپ همه.
   جدول RTL با نام در راست‌ترین ستون + ویرایش درجایی
   (اضافه‌کار hh:mm × نرخ ۱٫۴، کسور مرخصی، تعدیل ±) با جمعِ زنده.
   فیش حقوقی چاپی A4 رسمی (printHTML) با حروف‌خوانی مبلغ و امضاها.
   ───────────────────────────────────────────────────────────── */

const EDIT_ROLES = ['OWNER', 'GM', 'ADMIN'] // همان canPayroll — دسترسی API

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const faD = (v: string | number): string => String(v).replace(/\d/g, (d) => FA_DIGITS[+d])
const pad2 = (n: number) => String(n).padStart(2, '0')
const faSlashD = (v: string) => faD(String(v).replace(/-/g, '/'))
/** ارقام فارسی → لاتین + فقط رقم و علامت منفی */
const enNum = (s: string): string => s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))).replace(/[^\d-]/g, '')
/** دقیقه → «۴:۰۰» فارسی */
const hmFa = (m: number) => faD(`${Math.floor(m / 60)}:${pad2(m % 60)}`)

/* ─── انواع داده (هم‌شکل پاسخ API) ─── */
export interface Statutory { year: number; minWage: number; housing: number; food: number; child: number; seniorityDaily: number; taxExempt: number; taxBands: [number, number][] }
export interface Profile { baseSalary: number; housingAllowance: number; foodAllowance: number; childAllowance: number; children: number; seniorityDaily: number }
export interface Inputs { overtimeMinutes: number; absenceDays: number; adjustment: number }
export interface Computed {
  base: number; housing: number; food: number; childTotal: number; seniorityTotal: number
  monthly: number; dailyWage: number; hourlyWage: number; overtimeRate: number; overtimePay: number
  absenceDeduction: number; adjustment: number; gross: number; insurance: number
  taxExemptMonthly: number; taxableBase: number; tax: number; net: number
}
export interface Saved { gross: number; insurance: number; tax: number; net: number; overtimeMinutes: number; absenceDays: number }
export interface Row {
  userId: string | null; fullName: string; honorific?: string; role: string
  jobTitle: string | null; department?: string | null; nationalId?: string | null
  profile: Profile; saved: Saved | null; inputs: Inputs; computed: Computed
}
interface Sheet { year: number; month: number; monthLabel: string; statutory: Statutory; rows: Row[] }

/**
 * نسخهٔ محلیِ computePayroll (عیناً همان فرمول src/lib/payroll.ts —
 * سرور هنگام ذخیره دوباره محاسبه می‌کند و مرجع نهایی است).
 */
export function computePayrollLocal(profile: Profile, inputs: Inputs, st: Statutory): Computed {
  const base = profile.baseSalary
  const housing = profile.housingAllowance
  const food = profile.foodAllowance
  const childTotal = profile.childAllowance * profile.children
  const seniorityTotal = profile.seniorityDaily * 30
  const monthly = base + housing + food + childTotal + seniorityTotal
  const dailyWage = base / 30
  const hourlyWage = dailyWage / (220 / 30) // ۲۲۰ ساعت کار ماهانه ÷ ۳۰ روز
  const overtimeRate = hourlyWage * 1.4
  const overtimePay = Math.round((overtimeRate * inputs.overtimeMinutes) / 60)
  const absenceDeduction = Math.round(((base + housing + food) / 30) * inputs.absenceDays)
  const adjustment = inputs.adjustment || 0
  const gross = monthly + overtimePay - absenceDeduction + adjustment
  const insurance = Math.round(gross * 0.07)
  const taxExemptMonthly = st.taxExempt / 12
  const taxableBase = Math.round(gross - taxExemptMonthly - insurance)
  let remaining = Math.max(0, taxableBase)
  let tax = 0
  for (const [width, rate] of st.taxBands) {
    if (remaining <= 0) break
    const take = Math.min(remaining, width)
    tax += (take * rate) / 100
    remaining -= take
  }
  tax = Math.round(tax)
  const net = gross - insurance - tax
  return {
    base, housing, food, childTotal, seniorityTotal, monthly, dailyWage, hourlyWage,
    overtimeRate, overtimePay, absenceDeduction, adjustment, gross, insurance,
    taxExemptMonthly, taxableBase, tax, net,
  }
}

/* ═══════════════ فیش حقوقی چاپی (A4 رسمی) — توابع خالص و قابل‌آزمون ═══════════════ */

export interface SlipRow {
  fullName: string
  honorific?: string
  jobTitle?: string | null
  department?: string | null
  nationalId?: string | null
  profile: { childAllowance: number; children: number; seniorityDaily: number }
  inputs: Inputs
  computed: Computed
}
export interface SlipCtx { monthLabel: string; printedAt: string; printedTime: string }

const SLIP_FONTS = [
  [400, 'Regular'], [500, 'Medium'], [600, 'SemiBold'], [700, 'Bold'], [800, 'ExtraBold'],
].map(([w, n]) => `@font-face{font-family:'Vazirmatn';src:url(/fonts/Vazirmatn-${n}.woff2) format('woff2');font-weight:${w};font-display:swap}`).join('\n')

const SLIP_CSS = `
${SLIP_FONTS}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0}
body{font-family:'Vazirmatn','Segoe UI',Tahoma,sans-serif;color:#292524;background:#fff;font-size:11px;line-height:1.9}
.num{direction:ltr;text-align:left;font-variant-numeric:tabular-nums;unicode-bidi:embed}
.sheet{position:relative;width:210mm;min-height:290mm;margin:0 auto;padding:11mm 12mm 14mm;background:#fff;page-break-after:always}
.sheet:last-child{page-break-after:auto}
/* سربرگ */
.hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.emblem{flex:none;width:52px;height:52px;border-radius:50%;background:linear-gradient(145deg,#ecfdf5,#d1fae5);border:2px solid #047857;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:#065f46}
.b-name{font-size:21px;font-weight:800;color:#065f46;line-height:1.3}
.b-sub{font-size:9.5px;font-weight:600;color:#57534e}
.doc{text-align:left;flex:none;max-width:46%}
.d-title{font-size:17px;font-weight:800;color:#1c1917}
.d-period{font-size:11.5px;font-weight:700;color:#047857;margin-top:1px}
.d-meta{font-size:9px;color:#78716c;margin-top:3px}
.rule{height:3px;border-radius:2px;background:linear-gradient(to left,#065f46,#047857 45%,#14b8a6);margin:8px 0 10px}
/* مشخصات کارمند */
.idcard{width:100%;border-collapse:collapse;margin-bottom:10px}
.idcard td{border:1px solid #d6d3d1;padding:5px 10px;width:25%;vertical-align:middle}
.idcard .k{display:block;font-size:8.8px;color:#78716c}
.idcard .v{font-size:11.5px;font-weight:700;color:#1c1917}
/* بخش‌ها */
.sec{font-size:12px;font-weight:800;color:#065f46;border-right:3.5px solid #14b8a6;padding-right:9px;margin:10px 0 6px}
/* جدول‌ها */
table.tbl{width:100%;border-collapse:collapse;font-size:10.6px}
.tbl th{background:#065f46;color:#fff;font-weight:700;padding:4px 9px;border:1px solid #0b7a5c;font-size:10.2px}
.tbl td{border:1px solid #d6d3d1;padding:3.5px 9px;vertical-align:middle}
.tbl tbody tr:nth-child(even){background:#fafaf9}
.tbl .c{text-align:center}
.tbl .hint{display:block;font-size:8.8px;color:#78716c}
.tbl tfoot td{background:#ecfdf5;font-weight:800;border:1px solid #b9e6d2;color:#065f46}
/* جمع‌ها */
.totwrap{display:flex;justify-content:flex-end;margin-top:9px}
.totbox{width:315px;border:1px solid #d6d3d1;border-radius:9px;overflow:hidden;background:#fff}
.totbox .trow{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 12px;border-bottom:1px solid #e7e5e4;font-size:10.8px}
.totbox .trow:last-child{border-bottom:0}
.totbox .lbl{color:#57534e}
.totbox .grand{background:#ecfdf5;font-size:12.5px;font-weight:800;color:#065f46;padding:6px 12px}
/* حروف مبلغ */
.words{margin-top:8px;border:1px dashed #a7f3d0;background:#f6fefb;border-radius:9px;padding:6px 12px;font-size:10.6px}
.words .w1{font-weight:800;color:#065f46}
.words .w2{color:#57534e;font-size:9.6px;margin-top:1px}
/* امضاها — از راست: تهیه‌کننده، تأیید، امضا */
.sigs{display:flex;gap:10px;margin-top:14px}
.sig{flex:1;min-width:150px;border:1.5px dashed #d6d3d1;border-radius:9px;min-height:72px;padding:7px 12px;text-align:center}
.sig .s-label{font-size:10px;font-weight:800;color:#57534e}
.sig .s-role{font-size:11.5px;font-weight:700;color:#1c1917;margin-top:1px}
.sig .s-line{margin-top:26px;border-top:1.4px dashed #a8a29e;padding-top:3px;font-size:8px;color:#a8a29e}
/* پابرگ */
.foot{margin-top:12px;border-top:1px solid #e7e5e4;padding-top:6px;text-align:center;font-size:8.6px;color:#78716c}
@media print{
  body{background:#fff}
  .sheet{margin:0;width:auto;min-height:auto;padding:10mm 12mm}
}
@page{margin:0}
`

function slipRowsHtml(rows: { label: string; hint?: string; amount: number }[]): string {
  return rows.map((r, i) => `<tr>
<td class="c">${faD(i + 1)}</td>
<td><b>${r.label}</b>${r.hint ? `<span class="hint">${r.hint}</span>` : ''}</td>
<td class="num">${money(r.amount)}</td>
</tr>`).join('')
}

/** HTML کامل فیش حقوقی یک نفر (A4 رسمی) */
export function payslipHTML(row: SlipRow, ctx: SlipCtx, seq?: string): string {
  const c = row.computed
  const p = row.profile
  const inp = row.inputs
  const ot = inp.overtimeMinutes
  const adj = inp.adjustment || 0

  const earnings: { label: string; hint?: string; amount: number }[] = [
    { label: 'حقوق پایه', amount: c.base },
    { label: 'کمک‌هزینهٔ مسکن', amount: c.housing },
    { label: 'کمک‌هزینهٔ خواروبار', amount: c.food },
    { label: 'حق اولاد', hint: p.children > 0 ? `${faD(p.children)} فرزند × ${money(p.childAllowance)}` : undefined, amount: c.childTotal },
    { label: 'پایهٔ سنوات', hint: c.seniorityTotal > 0 ? `روزانه ${money(p.seniorityDaily)} × ۳۰ روز` : undefined, amount: c.seniorityTotal },
    { label: 'اضافه‌کار', hint: ot > 0 ? `${hmFa(ot)} ساعت — نرخ ۱٫۴ برابری` : undefined, amount: c.overtimePay },
  ]
  if (adj > 0) earnings.push({ label: 'تعدیل و مزایای سایر', amount: adj })

  const deductions: { label: string; hint?: string; amount: number }[] = [
    { label: 'کسور مرخصی / غیبت', hint: inp.absenceDays > 0 ? `${faD(inp.absenceDays)} روز` : undefined, amount: c.absenceDeduction },
    { label: 'بیمهٔ سهم کارمند', hint: '۷٪ حقوق و مزایا', amount: c.insurance },
    { label: 'مالیات بر درآمد', amount: c.tax },
  ]
  if (adj < 0) deductions.push({ label: 'سایر کسورات (تعدیل)', amount: -adj })

  const additionsTotal = c.monthly + c.overtimePay + Math.max(0, adj)
  const deductionsTotal = c.absenceDeduction + c.insurance + c.tax + Math.max(0, -adj)
  const w = amountWords(c.net)
  const name = row.honorific ? `${row.honorific} ${row.fullName}`.trim() : row.fullName
  const code = seq || '—'

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8"/><title>فیش حقوقی — ${name} — ${ctx.monthLabel}</title>
<style>${SLIP_CSS}</style></head>
<body>
<div class="sheet">
  <div class="hdr">
    <div class="brand">
      <div class="emblem">ز</div>
      <div>
        <div class="b-name">هایپر زیتون</div>
        <div class="b-sub">سامانهٔ سر رسید — مدیریت فروشگاه</div>
      </div>
    </div>
    <div class="doc">
      <div class="d-title">فیش حقوقی</div>
      <div class="d-period">دوره: ${ctx.monthLabel}</div>
      <div class="d-meta num">شمارهٔ فیش: ${code} · تاریخ چاپ: ${ctx.printedAt} · ${ctx.printedTime}</div>
    </div>
  </div>
  <div class="rule"></div>

  <table class="idcard">
    <tr>
      <td><span class="k">نام و نام خانوادگی</span><span class="v">${name}</span></td>
      <td><span class="k">کد ملی</span><span class="v num">${row.nationalId ? faD(row.nationalId) : '—'}</span></td>
      <td><span class="k">سمت شغلی</span><span class="v">${row.jobTitle || '—'}</span></td>
      <td><span class="k">واحد سازمانی</span><span class="v">${row.department || '—'}</span></td>
    </tr>
  </table>

  <div class="sec">مزایا و پرداختی‌ها</div>
  <table class="tbl">
    <thead><tr><th class="c" style="width:34px">ردیف</th><th>شرح</th><th style="width:132px">مبلغ (ریال)</th></tr></thead>
    <tbody>${slipRowsHtml(earnings)}</tbody>
    <tfoot><tr><td colspan="2">جمع مزایا و پرداختی‌ها</td><td class="num">${money(additionsTotal)}</td></tr></tfoot>
  </table>

  <div class="sec">کسورات</div>
  <table class="tbl">
    <thead><tr><th class="c" style="width:34px">ردیف</th><th>شرح</th><th style="width:132px">مبلغ (ریال)</th></tr></thead>
    <tbody>${slipRowsHtml(deductions)}</tbody>
    <tfoot><tr><td colspan="2">جمع کسورات</td><td class="num">${money(deductionsTotal)}</td></tr></tfoot>
  </table>

  <div class="totwrap"><div class="totbox">
    <div class="trow"><span class="lbl">جمع مزایا</span><b class="num">${money(additionsTotal)} ریال</b></div>
    <div class="trow"><span class="lbl">جمع کسورات</span><b class="num">${money(deductionsTotal)} ریال</b></div>
    <div class="grand"><span>خالص پرداختی</span><b class="num">${money(c.net)} ریال</b></div>
  </div></div>

  <div class="words">
    <div class="w1">به حروف: ${w.rial}</div>
    <div class="w2">معادل تومان: ${w.toman}</div>
  </div>

  <div class="sigs">
    <div class="sig"><div class="s-label">تهیه‌کننده</div><div class="s-role">حسابدار</div><div class="s-line">امضا و مهر</div></div>
    <div class="sig"><div class="s-label">تأیید</div><div class="s-role">مدیر کل</div><div class="s-line">امضا و مهر</div></div>
    <div class="sig"><div class="s-label">کارفرما</div><div class="s-role">مدیر عامل هایپر زیتون</div><div class="s-line">امضا و مهر</div></div>
    <div class="sig"><div class="s-label">دریافت‌کننده</div><div class="s-role">${name}</div><div class="s-line">دریافت و تأیید کردم</div></div>
  </div>

  <div class="foot">صادرشده از سامانهٔ سر رسید هایپر زیتون · تاریخ چاپ: ${ctx.printedAt} · ساعت ${ctx.printedTime}</div>
</div>
</body>
</html>`
}

/** فیش همهٔ افراد در یک سند چندصفحه‌ای (هر نفر یک صفحهٔ A4) */
export function payslipAllHTML(rows: SlipRow[], ctx: SlipCtx, seqOf?: (i: number) => string): string {
  const pages = rows.map((r, i) => {
    const one = payslipHTML(r, ctx, seqOf ? seqOf(i) : undefined)
    return one.replace(/^<!DOCTYPE html>\s*<html[^>]*>\s*<head>[\s\S]*?<\/head>\s*<body>/, '').replace(/<\/body>\s*<\/html>\s*$/, '')
  })
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8"/><title>فیش‌های حقوقی — ${ctx.monthLabel}</title>
<style>${SLIP_CSS}</style></head>
<body>
${pages.join('\n')}
</body>
</html>`
}

/* ═══════════════ نمای اصلی ═══════════════ */

export default function PayrollView() {
  const { user } = useShell() as any
  const canEdit = !!user && EDIT_ROLES.includes(user.role)

  const today = todayJalali()
  /* قرارداد ماژول جلالیِ فروزن: parseJalali → Date میلادی (نه JDate) —
     پس سال/ماه را مستقیم از خودِ رشتهٔ تاریخ می‌خوانیم (درس R4-cheques). */
  const ym0 = useMemo(() => {
    const m = /(\d{4})[-\/](\d{1,2})/.exec(String(today || ''))
    return m ? { jy: +m[1], jm: Math.min(12, Math.max(1, +m[2])) } : { jy: 1405, jm: 7 }
  }, [today])
  const [ym, setYm] = useState<{ jy: number; jm: number }>(ym0)
  const [loading, setLoading] = useState(true)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [edits, setEdits] = useState<Record<string, Inputs>>({})
  const [staffF, setStaffF] = useState('ALL')
  const [slip, setSlip] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { void load() }, [ym])

  async function load() {
    setLoading(true)
    const r = await api(`/api/hr/payroll${qs({ year: String(ym.jy), month: String(ym.jm) })}`)
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'بارگذاری حقوق و دستمزد ناموفق بود'); return }
    setSheet(r.data as Sheet)
    setEdits({})
    setSlip(null)
  }

  /* ─── ورودی‌های مؤثر (سرور + ویرایش محلی) ─── */
  function rowInputs(r: Row): Inputs { return r.userId ? (edits[r.userId] ?? r.inputs) : r.inputs }
  function rowComputed(r: Row): Computed {
    return sheet ? computePayrollLocal(r.profile, rowInputs(r), sheet.statutory) : r.computed
  }
  function isDirty(r: Row): boolean {
    if (!r.userId) return false
    const e = edits[r.userId]
    if (!e) return false
    const s = r.inputs
    return e.overtimeMinutes !== s.overtimeMinutes || e.absenceDays !== s.absenceDays || e.adjustment !== s.adjustment
  }
  function setField(r: Row, field: keyof Inputs, value: number) {
    if (!r.userId || !canEdit) return
    setEdits((prev) => ({ ...prev, [r.userId]: { ...rowInputs(r), [field]: value } }))
  }

  const dirtyCount = useMemo(() => (sheet ? sheet.rows.filter((r) => isDirty(r)).length : 0), [sheet, edits])

  /* ─── ردیف‌های قابل مشاهده + جمع‌های زنده ─── */
  const visibleRows = useMemo(() => {
    const all = sheet?.rows || []
    if (staffF === 'ALL') return all
    return all.filter((r) => r.userId === staffF)
  }, [sheet, staffF])

  const sums = useMemo(() => {
    let n = 0, base = 0, gross = 0, net = 0
    for (const r of visibleRows) {
      n++
      const c = rowComputed(r)
      base += r.profile.baseSalary
      gross += c.gross
      net += c.net
    }
    return { n, base, gross, net }
  }, [visibleRows, edits, sheet])

  /* ─── ناو ماه ─── */
  function navMonth(delta: number) {
    setYm((prev) => {
      let jm = prev.jm + delta
      let jy = prev.jy
      if (jm < 1) { jm = 12; jy-- }
      if (jm > 12) { jm = 1; jy++ }
      return { jy, jm }
    })
  }

  /* ─── ذخیره ─── */
  async function save() {
    if (!sheet || !dirtyCount || busy) return
    const rows = sheet.rows.filter((r) => r.userId && isDirty(r))
      .map((r) => ({ userId: r.userId as string, ...rowInputs(r) }))
    if (!rows.length) return
    setBusy(true)
    const r = await api('/api/hr/payroll', {
      method: 'POST',
      body: { year: ym.jy, month: ym.jm, rows },
    })
    setBusy(false)
    if (!r.ok) return toast.error(r.error || 'ذخیرهٔ فیش‌ها ناموفق بود')
    toast.success(`فیش‌های ${sheet.monthLabel} ذخیره شد ✓ (${faD(r.data?.saved)} نفر)`)
    void load()
  }

  /* ─── فیش حقوقی ─── */
  const slipCtx = (): SlipCtx => {
    const now = new Date()
    const hhmm = faD(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`)
    return { monthLabel: sheet?.monthLabel || '', printedAt: faSlashD(today), printedTime: hhmm }
  }
  function slipFromRow(r: Row): SlipRow {
    return {
      fullName: r.fullName,
      honorific: r.honorific || '',
      jobTitle: r.jobTitle,
      department: r.department || null,
      nationalId: r.nationalId || null,
      profile: { childAllowance: r.profile.childAllowance, children: r.profile.children, seniorityDaily: r.profile.seniorityDaily },
      inputs: rowInputs(r),
      computed: rowComputed(r),
    }
  }
  function seqOfRow(r: Row): string {
    const idx = sheet ? sheet.rows.findIndex((x) => x === r) : -1
    return idx >= 0 ? `${ym.jy}${pad2(ym.jm)}-${faD(pad2(idx + 1))}` : '—'
  }
  const slipHtml = useMemo(() => (slip ? payslipHTML(slipFromRow(slip), slipCtx(), seqOfRow(slip)) : ''), [slip, sheet, edits])

  /* مقیاس پیش‌نمایش فیش — کل صفحهٔ A4 بی‌برش در کادر جا شود
     (با ref-callback — دیالوگ رادیکس در پورتال جدا می‌ماند و effect ممکن است
     پیش از مونت اجرا شود؛ ref-callback دقیقاً هنگام مونت صدا زده می‌شود) */
  const pvRoRef = useRef<ResizeObserver | null>(null)
  const [pvScale, setPvScale] = useState(0.5)
  function fitPreviewTo(el: HTMLDivElement | null) {
    if (pvRoRef.current) { try { pvRoRef.current.disconnect() } catch { /* noop */ } pvRoRef.current = null }
    if (!el) return
    const fit = () => {
      const w = el.clientWidth - 36
      if (w > 60) setPvScale(Math.max(0.2, Math.min(1, w / 794)))
    }
    fit()
    requestAnimationFrame(fit)
    const ro = new ResizeObserver(fit)
    pvRoRef.current = ro
    ro.observe(el)
  }

  function printAll() {
    if (!visibleRows.length) return toast.error('فیشی برای چاپ نیست')
    printHTML(payslipAllHTML(visibleRows.map(slipFromRow), slipCtx(), (i) => `${ym.jy}${pad2(ym.jm)}-${faD(pad2(i + 1))}`), { width: '210mm' })
  }

  /* ─── وضعیت ردیف ─── */
  function statusOf(r: Row): { t: string; cls: string } {
    if (isDirty(r)) return { t: 'در ویرایش', cls: 'border-amber-200 bg-amber-50 text-amber-700' }
    if (r.saved) return { t: 'ثبت‌شده', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
    return { t: 'ثبت‌نشده', cls: 'border-stone-200 bg-stone-100 text-stone-500' }
  }

  /* ═══ رندر ═══ */
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
            <span className="flex items-center gap-1.5"><Icon name="wallet" size={18} /> حقوق و دستمزد</span>
            <span className="hidden text-xs font-normal text-stone-400 md:inline">فیش حقوقی پرسنل — محاسبهٔ زنده، اصلاح درجایی و چاپ رسمی</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">

          {/* ═══ نوار افقی: ناو ماه + فیلتر + جمع‌ها + چاپ ═══ */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-xl border border-stone-200 bg-white p-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="ماه قبل" title="ماه قبل" onClick={() => navMonth(-1)}>
                <I.chevronRight size={16} />
              </Button>
              <Select value={`${ym.jy}-${pad2(ym.jm)}`} onValueChange={(v: string) => { const [y, m] = v.split('-'); if (y && m) setYm({ jy: +y, jm: +m }) }}>
                <SelectTrigger className="h-8 w-32 border-0 shadow-none focus:ring-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JALALI_MONTHS.map((m, i) => <SelectItem key={m} value={`${ym.jy}-${pad2(i + 1)}`}>{m} {faD(ym.jy)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="ماه بعد" title="ماه بعد" onClick={() => navMonth(1)}>
                <I.chevronLeft size={16} />
              </Button>
            </div>

            <Select value={staffF} onValueChange={setStaffF}>
              <SelectTrigger className="h-9 w-44" aria-label="فیلتر پرسنل"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">همهٔ پرسنل ({faD(sums.n)})</SelectItem>
                {(sheet?.rows || []).filter((r) => r.userId).map((r) => (
                  <SelectItem key={r.userId} value={r.userId || ''}>{r.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="hidden h-6 w-px bg-stone-200 md:block" />

            <div className="flex flex-wrap items-center gap-1.5">
              <Chip label="تعداد پرسنل" value={faD(sums.n)} />
              <Chip label="جمع حقوق پایه (ریال)" value={money(sums.base)} />
              <Chip label="جمع کل حقوق و مزایا (ریال)" value={money(sums.gross)} tone="border-emerald-200 bg-emerald-50" />
              <Chip label="خالص پرداختی (ریال)" value={money(sums.net)} tone="border-teal-200 bg-teal-50" />
            </div>

            <div className="mr-auto flex flex-wrap items-center gap-2">
              {canEdit && dirtyCount > 0 && (
                <Button variant="ghost" size="sm" className="h-9 px-2 text-stone-400 hover:text-rose-600"
                  onClick={() => setEdits({})} title="برگرداندن ویرایش‌ها">انصراف</Button>
              )}
              {canEdit && (
                <Button size="sm" className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={!dirtyCount || busy} onClick={() => void save()}>
                  {busy ? <I.loader size={14} className="animate-spin" /> : <I.save size={14} />}
                  ذخیرهٔ فیش‌ها{dirtyCount ? ` (${faD(dirtyCount)})` : ''}
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={printAll} disabled={!visibleRows.length}>
                <I.printer size={14} /> چاپ همهٔ فیش‌ها
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9" aria-label="به‌روزرسانی" title="به‌روزرسانی" onClick={() => void load()}>
                <I.refresh size={15} />
              </Button>
            </div>
          </div>

          {/* ═══ جدول RTL — نام در راست‌ترین ستون ═══ */}
          <div className="overflow-x-auto rounded-xl border border-stone-200">
            <Table className="min-w-[1080px] text-xs">
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead className="min-w-44 text-right">پرسنل</TableHead>
                  <TableHead className="min-w-32 text-center">حقوق پایه</TableHead>
                  <TableHead className="min-w-44 text-center">مزایا (مسکن / خواروبار / اولاد)</TableHead>
                  <TableHead className="min-w-36 text-center">اضافه‌کار</TableHead>
                  <TableHead className="min-w-40 text-center">کسور مرخصی و تعدیل</TableHead>
                  <TableHead className="min-w-36 text-center">جمع پرداختی</TableHead>
                  <TableHead className="text-center">وضعیت</TableHead>
                  <TableHead className="text-center">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-stone-500">
                      <I.loader className="mx-auto mb-2 animate-spin" size={22} /> در حال بارگذاری…
                    </TableCell>
                  </TableRow>
                ) : !sheet || visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-stone-400">ردیفی برای نمایش نیست</TableCell>
                  </TableRow>
                ) : visibleRows.map((r) => {
                  const inp = rowInputs(r)
                  const c = rowComputed(r)
                  const st = statusOf(r)
                  const benefits = r.profile.housingAllowance + r.profile.foodAllowance + c.childTotal + c.seniorityTotal
                  const changed = isDirty(r)
                  return (
                    <TableRow key={(r.userId || r.fullName) + r.fullName} className={cn(changed && 'bg-amber-50/40')}>
                      {/* پرسنل — راست‌ترین ستون */}
                      <TableCell className="align-middle">
                        <div className="text-[12.5px] font-bold leading-5 text-stone-800">{r.fullName}</div>
                        <div className="text-[10px] leading-4 text-stone-400">{r.jobTitle || '—'}</div>
                      </TableCell>
                      {/* حقوق پایه */}
                      <TableCell className="num text-center text-[12px] font-bold text-stone-800">{money(c.base)}</TableCell>
                      {/* مزایا */}
                      <TableCell className="text-center align-middle">
                        <div className="num text-[12px] font-bold text-stone-800">{money(benefits)}</div>
                        <div className="text-[9.5px] leading-4 text-stone-400" title={`مسکن ${money(r.profile.housingAllowance)} · خواروبار ${money(r.profile.foodAllowance)} · حق اولاد ${money(c.childTotal)} (${faD(r.profile.children)} فرزند)${c.seniorityTotal ? ` · سنوات ${money(c.seniorityTotal)}` : ''}`}>
                          مسکن {money(r.profile.housingAllowance)} · خواروبار {money(r.profile.foodAllowance)} · اولاد {money(c.childTotal)}
                          {c.seniorityTotal > 0 && <> · سنوات {money(c.seniorityTotal)}</>}
                        </div>
                      </TableCell>
                      {/* اضافه‌کار */}
                      <TableCell className="text-center align-middle">
                        {canEdit && r.userId ? (
                          <div className="mx-auto w-24">
                            <TimeInput value={`${pad2(Math.floor(inp.overtimeMinutes / 60))}:${pad2(inp.overtimeMinutes % 60)}`}
                              onChange={(v: string) => {
                                const m = v.split(':')
                                const mins = m.length === 2 ? (+m[0] || 0) * 60 + (+m[1] || 0) : 0
                                setField(r, 'overtimeMinutes', Math.max(0, Math.min(1439, mins || 0)))
                              }} />
                          </div>
                        ) : (
                          <span className="num text-[12px] font-bold text-stone-700">{inp.overtimeMinutes ? hmFa(inp.overtimeMinutes) : '—'}</span>
                        )}
                        <div className="num text-[9.5px] leading-4 text-stone-400" title={`نرخ ۱٫۴ برابری ساعت‌ی ${money(c.overtimeRate)} ریال`}>
                          {c.overtimePay ? `× ۱٫۴ = ${money(c.overtimePay)}` : 'بدون اضافه‌کار'}
                        </div>
                      </TableCell>
                      {/* کسور مرخصی + تعدیل */}
                      <TableCell className="text-center align-middle">
                        <div className="flex flex-col items-center gap-1">
                          {canEdit && r.userId ? (
                            <Stepper value={inp.absenceDays} onChange={(v: number) => setField(r, 'absenceDays', v)} min={0} max={31} size="sm" hint="روز غیبت/مرخصی" />
                          ) : (
                            <span className="num text-[12px] font-bold text-stone-700">{faD(inp.absenceDays)} روز</span>
                          )}
                          <div className="num text-[9.5px] leading-4 text-stone-400" title={`(${money(c.base + r.profile.housingAllowance + r.profile.foodAllowance)} ÷ ۳۰) × ${faD(inp.absenceDays)} روز`}>
                            {c.absenceDeduction ? `− ${money(c.absenceDeduction)}` : 'بدون کسر'}
                          </div>
                          {canEdit && r.userId ? (
                            <div className="flex items-center gap-1" title="تعدیل: مثبت = پرداختی اضافه، منفی = کسر (ریال)">
                              <span className="text-[9.5px] text-stone-400">تعدیل ±</span>
                              <Input
                                dir="ltr"
                                className="h-7 w-28 px-1.5 text-center text-[11px]"
                                value={faD(String(inp.adjustment || 0))}
                                onChange={(e: any) => {
                                  const n = parseInt(enNum(String(e.target?.value ?? '')), 10)
                                  setField(r, 'adjustment', Number.isFinite(n) ? Math.max(-1e12, Math.min(1e12, n)) : 0)
                                }} />
                            </div>
                          ) : inp.adjustment ? (
                            <div className="num text-[9.5px] text-stone-500">تعدیل: {money(inp.adjustment)}</div>
                          ) : null}
                        </div>
                      </TableCell>
                      {/* جمع پرداختی */}
                      <TableCell className="text-center align-middle">
                        <div className={cn('num text-[13px] font-black', changed ? 'text-amber-700' : 'text-emerald-700')}>{money(c.net)}</div>
                        <div className="num text-[9.5px] leading-4 text-stone-400" title={`بیمهٔ ۷٪: ${money(c.insurance)} ریال · مالیات: ${money(c.tax)} ریال`}>
                          بیمه {money(c.insurance)} · مالیات {money(c.tax)}
                        </div>
                      </TableCell>
                      {/* وضعیت */}
                      <TableCell className="text-center align-middle">
                        <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold', st.cls)}>
                          {st.t === 'در ویرایش' ? <I.pencil size={11} /> : st.t === 'ثبت‌شده' ? <I.check size={11} /> : <I.info size={11} />} {st.t}
                        </span>
                      </TableCell>
                      {/* عملیات */}
                      <TableCell className="text-center align-middle">
                        <Button size="sm" variant="outline" className="h-7 gap-1 px-2.5 text-[11px]" onClick={() => setSlip(r)}>
                          <I.printer size={13} /> چاپ فیش حقوقی
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <p className="text-[10.5px] leading-5 text-stone-400">
            حقوق پایه و مزایا از پروفایل حقوقی پرسنل می‌آید (در نبود آن: قرارداد کار → ثابت‌های قانونی {sheet ? faD(sheet.statutory.minWage) : ''} ریال).
            {' '}اضافه‌کار و کسور مرخصی از سیستم کنترل تیم وارد می‌شود و اینجا توسط {canEdit ? 'شما' : 'حسابدار/مدیران'} قابل اصلاح است؛ جمع‌ها همان لحظه به‌روز می‌شوند و با «ذخیرهٔ فیش‌ها» قطعی می‌شوند.
          </p>
        </CardContent>
      </Card>

      {/* ═══ دیالوگ پیش‌نمایش و چاپ فیش ═══ */}
      <Dialog open={!!slip} onOpenChange={(o: boolean) => { if (!o) setSlip(null) }}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.receipt size={17} /> فیش حقوقی — {slip?.fullName || ''}</DialogTitle>
            <DialogDescription>
              دوره: {sheet?.monthLabel || ''} · شماره: {slip ? seqOfRow(slip) : '—'} — پیش‌نمایش A4؛ با اسکرولِ کادر کل صفحه را ببینید و با دکمهٔ چاپ، پنجرهٔ چاپ مرورگر باز می‌شود
            </DialogDescription>
          </DialogHeader>
          <div ref={fitPreviewTo} className="h-[68vh] overflow-auto rounded-xl border border-stone-200 bg-stone-100 p-4">
            <div className="mx-auto origin-top" style={{ transform: `scale(${pvScale})`, width: Math.round(794 * pvScale), height: Math.round(1123 * pvScale) }}>
              <div className="w-[794px]">
                {slipHtml && (
                  <iframe title="پیش‌نمایش فیش حقوقی" srcDoc={slipHtml} className="block h-[1123px] w-[794px] rounded-lg border-0 bg-white shadow-lg" />
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlip(null)}>بستن</Button>
            <Button className="gap-1.5" onClick={() => slipHtml && printHTML(slipHtml, { width: '210mm' })}>
              <I.printer size={15} /> چاپ فیش
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={cn('flex items-center gap-2 rounded-xl border px-3 py-1.5', tone || 'border-stone-200 bg-white')}>
      <span className="num text-[15px] font-black leading-none text-stone-800">{value}</span>
      <span className="text-[10.5px] leading-4 text-stone-500">{label}</span>
    </div>
  )
}
