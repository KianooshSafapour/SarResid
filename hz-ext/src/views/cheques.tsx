import { useState, useEffect, useMemo, api, qs, useShell, toast, cn, Button, Input, Textarea, Card, CardContent, CardHeader, CardTitle, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Checkbox, money, toman, fa, JALALI_MONTHS, WEEKDAY_FA, jalaliWeekday, addJalaliDays, formatJalali, formatJalaliLong, jalaliMonthLength, jalaliToDate, parseJalali, toEnDigits, toFaDigits, todayJalali, TimeInput, faSlash, JalaliDate, Icon, I } from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   finance/cheques — چک و تقویم پرداخت (R5-G)
   ۱) چک‌ها (دفتر چک + گردش وضعیت + ویرایش کامل مدیران
      + اطلاعات گیرنده/صدور + اتصال به سفارش)
   ۲) محاسبه‌گر زمان چک (نوار تقویم + تعطیلی‌های ردشده)
      + پیشنهاد هوشمند پرداخت (کامل / خرد کردن هوشمند
        با احترام به سقف‌های روزانه/هفتگی)
   ۳) تقویم پرداخت (برنامه‌ها + سررسید چک‌ها + تعطیلات
      + تاریخ هجری/میلادی هر روز + پنل جزئیات روز)
   ۴) تنظیم سقف‌ها و پارامترهای چک (cheque:limits / cheque:split)
   ───────────────────────────────────────────────────────────── */

const STATUS_LABELS: Record<string, string> = {
  PENDING_OWNER: 'در انتظار امضا',
  WRITTEN: 'نوشته‌شده',
  SIGNED: 'امضا شده',
  DELIVERED: 'تحویل شده',
  CLEARED: 'پرداخت شده',
  REJECTED: 'رد شده',
  RETURNED: 'برگشتی',
  BOUNCED: 'برگشت خورد',
  UNCOLLECTED: 'برداشت‌نشده',
}
const STATUS_CLASS: Record<string, string> = {
  PENDING_OWNER: 'border-amber-400 bg-amber-50 text-amber-800',
  WRITTEN: 'border-stone-400 bg-stone-100 text-stone-700',
  SIGNED: 'border-teal-400 bg-teal-50 text-teal-800',
  DELIVERED: 'border-orange-400 bg-orange-50 text-orange-800',
  CLEARED: 'border-emerald-400 bg-emerald-50 text-emerald-800',
  REJECTED: 'border-rose-400 bg-rose-50 text-rose-800',
  RETURNED: 'border-rose-400 bg-rose-50 text-rose-800',
  BOUNCED: 'border-rose-500 bg-rose-100 text-rose-900',
  UNCOLLECTED: 'border-rose-600 bg-rose-100 text-rose-900',
}
const ACTION_LABELS: Record<string, string> = {
  create: 'ثبت چک',
  sign: 'امضای مدیرعامل',
  deliver: 'تحویل به گیرنده',
  clear: 'وصول از بانک',
  reject: 'رد چک',
  bounce: 'برگشت چک',
  return: 'بازگشت چک',
  edit: 'ویرایش',
  status: 'تغییر وضعیت',
  uncollected: 'علامت‌گذاری برداشت‌نشده (خودکار)',
}
/** گردش وضعیت — مطابق PATCH زنده + R5-G: UNCOLLECTED برمی‌گردد به گردش */
const TRANSITIONS: Record<string, { from: string[]; to: string; reason?: 'required' | 'optional' }> = {
  sign: { from: ['PENDING_OWNER'], to: 'SIGNED' },
  deliver: { from: ['SIGNED', 'UNCOLLECTED'], to: 'DELIVERED' },
  clear: { from: ['SIGNED', 'DELIVERED', 'UNCOLLECTED'], to: 'CLEARED' },
  reject: { from: ['PENDING_OWNER', 'SIGNED', 'DELIVERED'], to: 'REJECTED', reason: 'required' },
  bounce: { from: ['SIGNED', 'DELIVERED'], to: 'BOUNCED', reason: 'required' },
  return: { from: ['SIGNED', 'DELIVERED'], to: 'RETURNED', reason: 'optional' },
}
const FILTERS = [
  { key: '', label: 'همه وضعیت‌ها' },
  { key: 'PENDING_OWNER', label: 'در انتظار امضا' },
  { key: 'SIGNED', label: 'امضا شده' },
  { key: 'DELIVERED', label: 'تحویل شده' },
  { key: 'UNCOLLECTED', label: 'برداشت‌نشده' },
  { key: 'CLEARED', label: 'پرداخت شده' },
  { key: 'BOUNCED,REJECTED,RETURNED', label: 'برگشتی / رد شده' },
]
/** وضعیت‌های قابل تنظیم دستی در دیالوگ ویرایش */
const EDITABLE_STATUSES = ['PENDING_OWNER', 'SIGNED', 'DELIVERED', 'CLEARED', 'REJECTED', 'BOUNCED', 'RETURNED', 'UNCOLLECTED', 'WRITTEN']
const KIND_LABEL: Record<string, string> = { CHEQUE: 'چک', POS: 'کارت‌خوان (POS)', CASH: 'نقدی' }
const KIND_DOT: Record<string, string> = { CHEQUE: 'bg-amber-500', POS: 'bg-teal-600', CASH: 'bg-emerald-600' }
const KIND_CLASS: Record<string, string> = {
  CHEQUE: 'border-amber-400 bg-amber-50 text-amber-800',
  POS: 'border-teal-400 bg-teal-50 text-teal-800',
  CASH: 'border-emerald-400 bg-emerald-50 text-emerald-800',
}
const PLAN_STATUS: Record<string, { label: string; cls: string }> = {
  PLANNED: { label: 'برنامه‌ریزی‌شده', cls: 'border-stone-300 bg-stone-100 text-stone-700' },
  CONFIRMED: { label: 'تأییدشده', cls: 'border-teal-400 bg-teal-50 text-teal-800' },
  DONE: { label: 'انجام‌شده', cls: 'border-emerald-400 bg-emerald-50 text-emerald-800' },
}
/** چیپ نوع تعطیلی (kindLabel از /api/holidays) */
const HOL_KIND_CLASS: Record<string, string> = {
  OFFICIAL: 'border-rose-300 bg-rose-50 text-rose-700',
  NATIONAL: 'border-rose-300 bg-rose-50 text-rose-700',
  RELIGIOUS: 'border-rose-400 bg-rose-100 text-rose-800',
  CUSTOM: 'border-stone-300 bg-stone-100 text-stone-600',
  'FRIDAY-EQUIV': 'border-orange-300 bg-orange-50 text-orange-700',
}
const WEEKDAY_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']
/** نام کامل روز → نماد کوتاه (WEEKDAY_FA و WEEKDAY_SHORT هر دو شنبه‌اول‌اند) */
const WD_SHORT: Record<string, string> = {}
;(WEEKDAY_FA as unknown as string[]).forEach((n, i) => { WD_SHORT[n] = WEEKDAY_SHORT[i] || '' })

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))

/** نام روز هفته برای تاریخ شمسی (خط‌تیره‌دار) */
function weekdayOf(dash: string): string {
  const d = parseJalali(dash)
  return d ? (WEEKDAY_FA[(d.getDay() + 1) % 7] ?? '') : ''
}

/** «۲۵ مهر ۱۴۰۵» با ارقام فارسی */
function longFa(dash: string): string {
  const d = parseJalali(dash)
  return d ? toFaDigits(formatJalaliLong(d)) : toFaDigits(dash || '')
}

/** «۱۴۰۵/۰۷/۲۸» — ارقام فارسی با ممیز (هرگز خط‌تیره) */
function faSlash(dash: string | null | undefined): string {
  if (!dash) return ''
  return toFaDigits(String(dash).replace(/-/g, '/'))
}

/** «۱۴۰۵/۰۷/۲۵ · ۱۴:۳۰» برای مهر تاریخچه */
function tsFa(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${toFaDigits(formatJalali(d).replace(/-/g, '/'))} · ${toFaDigits(hh)}:${toFaDigits(mm)}`
}

/* ───────── تاریخ دومیلادی/هجریِ هر روز شمسی (تقویم جدولی، همان seed-holidays) ───────── */
const HIJRI_MONTHS = ['محرم', 'صفر', 'ربیع‌الاول', 'ربیع‌الثانی', 'جمادی‌الاول', 'جمادی‌الثانی', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذی‌القعده', 'ذی‌الحجه']
const GREG_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function gregToJdn(gy: number, gm: number, gd: number): number {
  const a = Math.floor((14 - gm) / 12)
  const y = gy + 4800 - a
  const m = gm + 12 * a - 3
  return gd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045
}

function islamicToJdn(hy: number, hm: number, hd: number): number {
  return hd + Math.ceil(29.5 * (hm - 1)) + (hy - 1) * 354 + Math.floor((3 + 11 * hy) / 30) + 1948439
}

/** شمسی ← هجری قمری جدولی (±۱ روز) */
function jalaliToHijri(dash: string): { hy: number; hm: number; hd: number } | null {
  const g = parseJalali(dash)
  if (!g || isNaN(g.getTime())) return null
  const jdn = gregToJdn(g.getFullYear(), g.getMonth() + 1, g.getDate())
  const hy = Math.floor((30 * (jdn - 1948439) + 10646) / 10631)
  const startOfYear = islamicToJdn(hy, 1, 1)
  const intoYear = jdn - startOfYear // 0..354
  let hm = Math.min(12, Math.floor(intoYear / 29.5) + 1)
  let hd = intoYear - Math.ceil(29.5 * (hm - 1))
  if (hd < 1) { hd = 1 }
  if (hd > 30) { hd = 30 }
  return { hy, hm, hd }
}

/** «۱۴ رمضان ۱۴۴۷ · 12 Nov» — ریزتاریخ دوم برای سلول‌های تقویم */
function secondDateFa(dash: string): string {
  const g = parseJalali(dash)
  if (!g || isNaN(g.getTime())) return ''
  const h = jalaliToHijri(dash)
  const gPart = `${g.getDate()} ${GREG_MONTHS[g.getMonth()]}`
  return h ? `${toFaDigits(h.hd)} ${HIJRI_MONTHS[h.hm - 1]} · ${gPart}` : gPart
}

/** هجری کامل با سال — برای پنل روز */
function secondDateLongFa(dash: string): string {
  const g = parseJalali(dash)
  if (!g || isNaN(g.getTime())) return ''
  const h = jalaliToHijri(dash)
  const gPart = `${g.getDate()} ${GREG_MONTHS[g.getMonth()]} ${g.getFullYear()}`
  return h ? `${toFaDigits(h.hd)} ${HIJRI_MONTHS[h.hm - 1]} ${toFaDigits(h.hy)} · ${gPart}` : gPart
}

/** پیش‌فرض‌های محلی برای دیالوگ تنظیمات (اگر API پاسخ نداد) */
const LOCAL_LIMITS = { day: 0, week: 0, month: 0 }
const LOCAL_SPLIT = { mediumMax: 3, heavyMax: 5, mediumThreshold: 200_000_000, heavyThreshold: 800_000_000, roundTo: 100_000 }



/* ───────── ورودی تاریخ شمسی — تاریخ‌گیر مشترک جلالی (تقویم + ارقام فارسی +
   پیکان‌های ماه RTL درست) با چیپ‌های سریع ───────── */
function JInput({ value, onChange, quick = true }: { value: string; onChange: (v: string) => void; quick?: boolean }) {
  return (
    <JalaliDate
      value={value}
      onChange={onChange}
      quickChips={quick ? [{ label: 'امروز', deltaDays: 0 }, { label: 'فردا', deltaDays: 1 }, { label: 'یک هفته دیگر', deltaDays: 7 }] : undefined}
    />
  )
}

/* ───────── ورودی مبلغ (ریال) — R7: جداکنندهٔ هزارگان خودکار (۱٬۲۵۰٬۰۰۰) ───────── */
function AmountInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = Number(value)
  return (
    <div>
      <div className="relative">
        <Input
          dir="ltr" inputMode="numeric" placeholder="۰" className="num pe-10 text-end font-bold"
          value={value ? fa(n > 0 ? n : value.replace(/\D/g, '')) : ''}
          onChange={(e: any) => onChange(toEnDigits(String(e.target.value)).replace(/[^\d]/g, '').replace(/٬/g, ''))}
        />
        <span className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center text-[10px] font-medium text-stone-400">ریال</span>
      </div>
      {Number.isFinite(n) && n > 0 && (
        <p className="mt-1 text-[11px] text-stone-500">{money(n)} ریال ≈ {toman(n)} تومان</p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn('text-[10px]', STATUS_CLASS[status] || 'border-stone-300 bg-stone-100 text-stone-700')}>
      {STATUS_LABELS[status] || status}
    </Badge>
  )
}

function DueChip({ days, status }: { days: number; status: string }) {
  if (['CLEARED', 'REJECTED', 'RETURNED', 'BOUNCED'].includes(status)) return null
  if (days < 0) return <span className="text-[10px] font-medium text-rose-600">{fa(Math.abs(days))} روز گذشته</span>
  if (days === 0) return <span className="text-[10px] font-bold text-amber-600">امروز سررسید</span>
  if (days <= 7) return <span className="text-[10px] font-medium text-amber-600">{fa(days)} روز مانده</span>
  return <span className="text-[10px] text-stone-500">{fa(days)} روز مانده</span>
}

/* ═════════════════════════ نماهای کوچک ═════════════════════════ */

function StatCard({
  title, value, amount, tone, sub, chips, titleHint,
}: {
  title: string
  value: number
  amount?: number
  tone: 'amber' | 'teal' | 'emerald' | 'rose' | 'stone'
  sub?: string | null
  chips?: Array<{ label: string; value: number; amount?: number; cls?: string }>
  titleHint?: string
}) {
  const tones: Record<string, string> = {
    amber: 'border-amber-300 bg-amber-50 text-amber-900',
    teal: 'border-teal-300 bg-teal-50 text-teal-900',
    emerald: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    rose: 'border-rose-300 bg-rose-50 text-rose-900',
    stone: 'border-stone-300 bg-stone-50 text-stone-700',
  }
  return (
    <div className={cn('rounded-xl border p-3', tones[tone])}>
      <p className="text-[11px] leading-4 opacity-80" title={titleHint}>{title}</p>
      <p className="mt-1 text-lg font-black">{fa(value)} فقره</p>
      {amount ? <p className="text-[11px] opacity-75">{money(amount)} ریال</p> : null}
      {sub ? <p className="mt-1 text-[10px] leading-4 opacity-80">{sub}</p> : null}
      {chips && chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-dashed pt-2" style={{ borderColor: 'rgb(0 0 0 / 0.08)' }}>
          {chips.map((c) => (
            <span key={c.label} title={c.amount ? `${money(c.amount)} ریال` : undefined} className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium',
              c.cls || 'bg-white/70',
            )}>
              {c.label}: <b className="num">{fa(c.value)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═════════════════════════ نمای اصلی ═════════════════════════ */

export default function ChequesView() {
  const { user } = useShell()
  const today = todayJalali()
  const canSign = ['OWNER', 'GM', 'ADMIN'].includes(user?.role || '')
  const canFinance = ['OWNER', 'GM', 'ADMIN', 'ACC'].includes(user?.role || '')

  /* ── دفتر چک ── */
  const [tab, setTab] = useState('list')
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<any[]>([])
  const [allCheques, setAllCheques] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [qEff, setQEff] = useState('')

  /* ── ثبت/ویرایش چک (+ اطلاعات گیرنده/صدور + وضعیت + سفارش) ── */
  const emptyForm = {
    number: '', amount: '', dueDate: '', recipient: '', selfIssued: true, sayadSerial: '', orderCode: '', note: '',
    writtenAt: '',
    receiverName: '', receiverPhone: '', issuedTime: '',
    status: '',
  }
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<any>(emptyForm)
  const [savingForm, setSavingForm] = useState(false)
  const [recentOrders, setRecentOrders] = useState<any[]>([])

  /* ── گردش وضعیت ── */
  const [busyId, setBusyId] = useState('')
  const [reasonDlg, setReasonDlg] = useState<{ row: any; action: string } | null>(null)
  const [reasonText, setReasonText] = useState('')
  const [reasonBusy, setReasonBusy] = useState(false)
  const [histRow, setHistRow] = useState<any>(null)
  /* ── تحویل چک: اطلاعات گیرنده + تاریخ/ساعت تحویل (new-4.txt سطر ۵۶) ── */
  const [deliverDlg, setDeliverDlg] = useState<any>(null)
  const [deliverBusy, setDeliverBusy] = useState(false)
  const [dv, setDv] = useState({ receiverName: '', receiverPhone: '', date: '', time: '' })

  /* ── تنظیمات سقف/خرد کردن (cheque:limits / cheque:split) ── */
  const [setOpen, setSetOpen] = useState(false)
  const [setSaving, setSetSaving] = useState(false)
  const [lim, setLim] = useState<any>({ ...LOCAL_LIMITS })
  const [spl, setSpl] = useState<any>({ ...LOCAL_SPLIT })

  /* ── محاسبه‌گر + پیشنهاد هوشمند ── */
  const [days, setDays] = useState('45')
  const [defDays, setDefDays] = useState<number | null>(null)
  const [from, setFrom] = useState(today)
  const [calc, setCalc] = useState<any>(null)
  const [calcBusy, setCalcBusy] = useState(false)
  const [chosenDate, setChosenDate] = useState('')
  const [calcHols, setCalcHols] = useState<any[]>([]) // تعطیلی‌های بازه شروع → سررسید
  const [calcAmount, setCalcAmount] = useState('') // مبلغ (ریال) برای پیشنهاد هوشمند
  const [calcSupplier, setCalcSupplier] = useState('') // تأمین‌کننده برای برنامه‌های پیشنهادی
  const [smart, setSmart] = useState<any>(null) // خروجی /api/cheque-calc/split
  const [applyingSmart, setApplyingSmart] = useState('')

  /* ── تقویم پرداخت ── */
  const [calY, setCalY] = useState(Number(today.slice(0, 4)))
  const [calM, setCalM] = useState(Number(today.slice(5, 7)))
  const [plans, setPlans] = useState<any[]>([])
  const [holidays, setHolidays] = useState<any[]>([])
  const [calLoading, setCalLoading] = useState(false)
  const [selDay, setSelDay] = useState<string | null>(null)
  /* ── افزودن سریع برنامه پرداخت روی روز انتخابی ── */
  const [qaOpen, setQaOpen] = useState(false)
  const [qa, setQa] = useState({ kind: 'CHEQUE', amount: '', supplierName: '', note: '' })
  const [qaBusy, setQaBusy] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setQEff(q), 400)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => { void loadCheques() }, [status, qEff])
  useEffect(() => { void loadAll(); void loadDefaults(); void loadSettings(); void loadRecentOrders() }, [])
  useEffect(() => { void loadCal() }, [calY, calM])

  async function loadCheques() {
    setLoading(true)
    const r = await api(`/api/cheques${qs({ status: status || undefined, q: qEff || undefined })}`)
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'بارگذاری چک‌ها ناموفق بود'); return }
    setItems(r.data?.items || [])
    setStats(r.data?.stats || null)
  }

  async function loadAll() {
    const r = await api('/api/cheques')
    if (r.ok) setAllCheques(r.data?.items || [])
  }

  async function loadSettings() {
    const r = await api('/api/cheques/settings')
    if (!r.ok) return // تنظیمات در دسترس نیست — پیش‌فرض‌ها می‌مانند
    if (r.data?.limits) setLim({ ...LOCAL_LIMITS, ...r.data.limits })
    if (r.data?.split) setSpl({ ...LOCAL_SPLIT, ...r.data.split })
  }

  /** سفارش‌های اخیر برای اتصال چک ← سفارش (در صورت دسترسی) */
  async function loadRecentOrders() {
    const r = await api('/api/orders?status=open&pageSize=12')
    if (r.ok && Array.isArray(r.data?.items)) setRecentOrders(r.data.items)
  }

  async function loadDefaults() {
    const r = await api('/api/defaults')
    if (!r.ok) return // تنظیمات در دسترس نیست — پیش‌فرض ۴۵ روز می‌ماند
    const d = r.data?.defaults || {}
    const pd = d['defaults:cheque.periodDays'] ?? d['cheque.periodDays']
    if (pd !== undefined && pd !== null && pd !== '') {
      const n = Number(pd)
      if (Number.isFinite(n) && n > 0) { setDays(String(Math.round(n))); setDefDays(Math.round(n)) }
    }
  }

  /* ───────────── ثبت / ویرایش چک ───────────── */

  function openCreate(due?: string) {
    setEditing(null)
    setForm({ ...emptyForm, dueDate: due || today, writtenAt: today })
    setCreateOpen(true)
  }

  function openEdit(row: any) {
    const m = row.meta || {}
    setEditing(row)
    setForm({
      number: row.number || '',
      amount: String(Math.round(row.amount || 0)),
      dueDate: row.dueDate || '',
      recipient: row.recipient || '',
      selfIssued: !!row.selfIssued,
      sayadSerial: row.sayadSerial || '',
      orderCode: row.orderCode || '',
      note: row.note || '',
      writtenAt: row.writtenAt || today,
      receiverName: m.receiverName || '',
      receiverPhone: m.receiverPhone || '',
      issuedTime: m.issuedTime || '',
      status: row.status || '',
    })
    setCreateOpen(true)
  }

  /** وقتی کد سفارش از فهرست انتخاب شد، طرف حساب را خودکار پر کن */
  function onOrderCodeChange(v: string) {
    const code = v.trim()
    setForm((f: any) => {
      const ord = recentOrders.find((o: any) => o.code === code)
      return {
        ...f,
        orderCode: code,
        recipient: ord?.supplierName ? ord.supplierName : f.recipient,
      }
    })
  }

  async function submitForm(e?: any) {
    if (e && e.preventDefault) e.preventDefault()
    if (!form.number.trim()) return toast.error('شماره چک را وارد کنید')
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('مبلغ چک را وارد کنید')
    if (!parseJalali(form.dueDate)) return toast.error('تاریخ سررسید را وارد کنید')
    setSavingForm(true)
    const meta = {
      receiverName: form.receiverName.trim() || undefined,
      receiverPhone: toEnDigits(form.receiverPhone).replace(/[^\d+]/g, '') || undefined,
      issuedAt: form.writtenAt || undefined,
      issuedTime: form.issuedTime || undefined,
      orderCode: form.orderCode.trim() || undefined,
    }
    const body: any = {
      number: form.number.trim(),
      amount,
      dueDate: form.dueDate,
      recipient: form.recipient.trim(),
      selfIssued: !!form.selfIssued,
      sayadSerial: form.sayadSerial.trim(),
      orderCode: form.orderCode.trim(),
      note: form.note.trim(),
      writtenAt: form.writtenAt || today,
      meta,
    }
    if (editing) {
      if (form.status && form.status !== editing.status) body.status = form.status
      body.recipient = form.recipient.trim()
    }
    const r = editing
      ? await api(`/api/cheques/${editing.id}`, { method: 'PATCH', body: { action: 'edit', ...body } })
      : await api('/api/cheques', { method: 'POST', body })
    setSavingForm(false)
    if (!r.ok) return toast.error(r.error || 'ثبت ناموفق بود')
    toast.success(editing ? 'چک ویرایش شد' : 'چک جدید ثبت شد و به مالک ارسال شد (در انتظار تأیید و امضا)')
    setCreateOpen(false)
    void loadCheques(); void loadAll()
  }

  /* ───────────── گردش وضعیت چک ───────────── */

  async function doAction(row: any, action: string, reason?: string) {
    setBusyId(row.id)
    const r = await api(`/api/cheques/${row.id}`, { method: 'PATCH', body: { action, reason } })
    setBusyId('')
    if (!r.ok) return toast.error(r.error || 'عملیات ناموفق بود')
    toast.success(`«${ACTION_LABELS[action] || action}» با موفقیت ثبت شد`)
    void loadCheques(); void loadAll()
  }

  function onAction(row: any, action: string) {
    const t = TRANSITIONS[action]
    if (!t) return
    if (!t.from.includes(row.status)) return
    if (t.reason === 'required') { setReasonDlg({ row, action }); setReasonText(''); return }
    void doAction(row, action)
  }

  /** تحویل چک — با ثبت اطلاعات گیرنده و تاریخ/ساعت تحویل (دیالوگ) */
  function openDeliver(row: any) {
    const m = row.meta || {}
    setDv({
      receiverName: m.receiverName || row.recipient || '',
      receiverPhone: m.receiverPhone ? String(m.receiverPhone) : '',
      date: today,
      time: '',
    })
    setDeliverDlg(row)
  }

  async function submitDeliver() {
    if (!deliverDlg) return
    if (!dv.receiverName.trim()) return toast.error('نام دریافت‌کننده چک را وارد کنید')
    if (dv.receiverPhone && !/^[0-9+]{10,14}$/.test(toEnDigits(dv.receiverPhone))) {
      return toast.error('شمارهٔ موبایل دریافت‌کننده معتبر نیست')
    }
    setDeliverBusy(true)
    const prevMeta = deliverDlg.meta || {}
    const r = await api(`/api/cheques/${deliverDlg.id}`, {
      method: 'PATCH',
      body: {
        action: 'deliver',
        meta: {
          ...prevMeta,
          receiverName: dv.receiverName.trim(),
          receiverPhone: toEnDigits(dv.receiverPhone).replace(/[^\d+]/g, '') || undefined,
          issuedAt: dv.date || undefined,
          issuedTime: dv.time || undefined,
        },
      },
    })
    setDeliverBusy(false)
    if (!r.ok) return toast.error(r.error || 'ثبت تحویل ناموفق بود')
    toast.success('چک تحویل شد و اطلاعات دریافت‌کننده ثبت شد')
    setDeliverDlg(null)
    void loadCheques(); void loadAll()
  }

  async function submitReason() {
    if (!reasonDlg) return
    const txt = reasonText.trim()
    if (txt.length < 3) return toast.error('دلیل را وارد کنید (حداقل ۳ کاراکتر)')
    setReasonBusy(true)
    await doAction(reasonDlg.row, reasonDlg.action, txt)
    setReasonBusy(false)
    setReasonDlg(null)
  }

  async function removeCheque(row: any) {
    if (!window.confirm(`حذف چک شماره ${row.number}؟ (فقط چک‌های در انتظار امضا قابل حذف هستند)`)) return
    setBusyId(row.id)
    const r = await api(`/api/cheques/${row.id}`, { method: 'DELETE' })
    setBusyId('')
    if (!r.ok) return toast.error(r.error || 'حذف ناموفق بود')
    toast.success('چک حذف شد')
    void loadCheques(); void loadAll()
  }

  function actionButtons(row: any) {
    if (!canFinance) return null
    const ok = (a: string) => (TRANSITIONS[a]?.from || []).includes(row.status)
    const sm = 'h-8 px-2.5 text-[11px]'
    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        {ok('sign') && canSign && (
          <Button size="sm" className={sm} disabled={busyId === row.id} onClick={() => onAction(row, 'sign')}>
            <I.pencil size={13} className="ml-1" /> امضا
          </Button>
        )}
        {ok('deliver') && (
          <Button size="sm" variant="outline" className={sm} disabled={busyId === row.id} onClick={() => openDeliver(row)}>تحویل</Button>
        )}
        {ok('clear') && (
          <Button size="sm" className={cn('bg-emerald-700 hover:bg-emerald-800', sm)} disabled={busyId === row.id} onClick={() => onAction(row, 'clear')}>وصول</Button>
        )}
        {ok('bounce') && (
          <Button size="sm" variant="outline" className={cn('border-rose-300 text-rose-700 hover:bg-rose-50', sm)} disabled={busyId === row.id} onClick={() => onAction(row, 'bounce')}>برگشت</Button>
        )}
        {ok('return') && (
          <Button size="sm" variant="outline" className={sm} disabled={busyId === row.id} onClick={() => onAction(row, 'return')}>عودت</Button>
        )}
        {ok('reject') && (
          <Button size="sm" variant="outline" className={cn('border-rose-400 text-rose-700 hover:bg-rose-50', sm)} disabled={busyId === row.id} onClick={() => onAction(row, 'reject')}>رد</Button>
        )}
        {row.status === 'PENDING_OWNER' && (
          <Button size="sm" variant="ghost" className={cn('text-rose-600', sm)} disabled={busyId === row.id} onClick={() => void removeCheque(row)} aria-label="حذف چک">
            <I.trash size={13} />
          </Button>
        )}
        {row.status !== 'PENDING_OWNER' && (
          <Button size="sm" variant="ghost" className={sm} disabled={busyId === row.id} onClick={() => openEdit(row)}>ویرایش</Button>
        )}
        <Button size="sm" variant="ghost" className={cn(sm, 'text-stone-500')} onClick={() => setHistRow(row)} aria-label={`تاریخچه چک ${row.number}`}>
          <I.history size={13} />
        </Button>
      </div>
    )
  }

  /* ───────────── محاسبه‌گر زمان چک + پیشنهاد هوشمند ───────────── */

  async function runCalc() {
    const d = Number(days)
    if (!Number.isFinite(d) || d < 1 || d > 365) return toast.error('دوره چک را بین ۱ تا ۳۶۵ روز وارد کنید')
    if (!parseJalali(from)) return toast.error('تاریخ شروع معتبر نیست')
    setCalcBusy(true)
    setChosenDate('')
    const r = await api(`/api/cheque-calc${qs({ days: Math.round(d), from })}`)
    if (!r.ok) { setCalcBusy(false); toast.error(r.error || 'محاسبه انجام نشد'); return }
    setCalc(r.data)
    setCalcBusy(false)
    // تعطیلی‌های بازه شروع → سررسید (برای نوار تقویم و فهرست تعطیلی‌های ردشده)
    const h = await api(`/api/holidays${qs({ from, to: r.data?.target || from })}`)
    if (h.ok) setCalcHols(h.data?.holidays || [])
    else setCalcHols([])
    // پیشنهاد هوشمند پرداخت — فقط وقتی مبلغ معتبر وارد شده باشد
    const amt = Number(calcAmount)
    if (Number.isFinite(amt) && amt > 0) {
      const s = await api('/api/cheque-calc/split', { method: 'POST', body: { amount: amt, days: Math.round(d), from } })
      if (s.ok) setSmart(s.data)
      else { setSmart(null); toast.error(s.error || 'پیشنهاد هوشمند انجام نشد') }
    } else {
      setSmart(null)
    }
  }

  /** اعمال یک پیشنهاد: ثبت برنامه‌های پرداخت پیش‌ثبت روی تقویم */
  async function applySmart(opt: any) {
    if (!opt || !Array.isArray(opt.cheques) || !opt.cheques.length) return
    const key = `full-${opt.cheques[0]?.date}` || String(opt.n)
    setApplyingSmart(key)
    let done = 0
    for (const c of opt.cheques) {
      const r = await api('/api/payment-plans', {
        method: 'POST',
        body: {
          date: c.date,
          kind: 'CHEQUE',
          amount: c.amount,
          supplierName: calcSupplier.trim() || undefined,
          note: `پیشنهاد هوشمند پرداخت — ${opt.n === 1 ? 'پرداخت کامل' : `${fa(opt.n)} قلمی`}${c.deltaFromTarget ? ` · ${fa(Math.abs(c.deltaFromTarget))} روز ${c.deltaFromTarget < 0 ? 'زودتر' : ''}` : ''}`,
        },
      })
      if (r.ok) done++
    }
    setApplyingSmart('')
    if (done === opt.cheques.length) {
      toast.success(`${fa(done)} برنامه پرداخت پیش‌ثبت روی تقویم ثبت شد — وضعیت هر کدام را بعداً به چک واقعی تبدیل کنید`)
      void loadCal()
    } else {
      toast.error(`فقط ${fa(done)} از ${fa(opt.cheques.length)} برنامه ثبت شد — دوباره تلاش کنید`)
    }
  }

  /* ───────────── ذخیره تنظیمات سقف/خرد کردن ───────────── */

  async function saveSettings() {
    setSetSaving(true)
    const r = await api('/api/cheques/settings', {
      method: 'POST',
      body: {
        limits: {
          day: Number(lim.day) || 0,
          week: Number(lim.week) || 0,
          month: Number(lim.month) || 0,
        },
        split: {
          mediumMax: Number(spl.mediumMax) || 3,
          heavyMax: Number(spl.heavyMax) || 5,
          mediumThreshold: Number(spl.mediumThreshold) || 0,
          heavyThreshold: Number(spl.heavyThreshold) || 0,
          roundTo: Number(spl.roundTo) || 100_000,
        },
      },
    })
    setSetSaving(false)
    if (!r.ok) return toast.error(r.error || 'ذخیره تنظیمات ناموفق بود')
    if (r.data?.limits) setLim({ ...LOCAL_LIMITS, ...r.data.limits })
    if (r.data?.split) setSpl({ ...LOCAL_SPLIT, ...r.data.split })
    toast.success('سقف‌ها و پارامترهای چک ذخیره شد')
    setSetOpen(false)
  }

  /** متن هشدار روز غیرکاری — «این تاریخ جمعه است» / «تعطیل رسمی: …» */
  function offText(c: any): string {
    if (!c?.isOff) return ''
    const parts = String(c.offReason || '').split(' — ').filter(Boolean)
    const isFriday = c.weekday === 'جمعه' || parts.includes('جمعه')
    const holiday = parts.filter((p: string) => p !== 'جمعه').join(' و ')
    const bits: string[] = []
    if (isFriday) bits.push('این تاریخ جمعه است')
    if (holiday) bits.push(`تعطیل رسمی: ${holiday}`)
    if (!bits.length) return 'این تاریخ روز غیرکاری است'
    return bits.join(' — ')
  }

  /** نقشه تعطیلی‌های بازه محاسبه‌گر: تاریخ → [عناوین] */
  const calcHolsByDate = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const h of calcHols) {
      const list = m.get(h.date) || []
      list.push(h)
      m.set(h.date, list)
    }
    return m
  }, [calcHols])

  const calcOff = (dash: string): { off: boolean; why: string } => {
    const wd = weekdayOf(dash)
    const hols = calcHolsByDate.get(dash) || []
    if (hols.length) return { off: true, why: hols.map((h: any) => h.title).join(' و ') }
    if (wd === 'جمعه') return { off: true, why: 'جمعه' }
    return { off: false, why: '' }
  }

  /** نوار تقویم کوچک: ۹ روز قبل تا ۴ روز بعد از تاریخ هدف */
  const stripDays = useMemo(() => {
    if (!calc?.target) return []
    const arr: string[] = []
    for (let i = -9; i <= 4; i++) arr.push(addJalaliDays(calc.target, i))
    return arr
  }, [calc])

  /** تعطیلی‌های ردشده بین تاریخ پیشنهادی و تاریخ هدف (پیمایش رو به عقب) */
  const skippedDays = useMemo(() => {
    if (!calc?.target || !calc.isOff) return []
    const anchor = calc.recommend?.date || calc.suggestions?.[0]?.date || calc.target
    const out: Array<{ date: string; why: string; wd: string }> = []
    for (let back = 1; back <= 30; back++) {
      const d = addJalaliDays(calc.target, -back)
      if (d <= anchor) break
      const { off, why } = calcOff(d)
      if (off) out.push({ date: d, why, wd: weekdayOf(d) })
    }
    return out
  }, [calc, calcHolsByDate])

  /** خلاصه بازه: چند جمعه و چند تعطیلی بین شروع و سررسید */
  const windowSummary = useMemo(() => {
    if (!calc?.target) return null
    let fridays = 0
    const hols: string[] = []
    for (let d = from; d <= calc.target; d = addJalaliDays(d, 1)) {
      if (weekdayOf(d) === 'جمعه') fridays++
      const hs = calcHolsByDate.get(d)
      if (hs) for (const h of hs) hols.push(`${faSlash(d)} — ${h.title}`)
    }
    return { fridays, hols }
  }, [calc, calcHolsByDate, from])

  /* ───────────── تقویم پرداخت ───────────── */

  async function loadCal() {
    setCalLoading(true)
    const fromD = `${calY}-${pad2(calM)}-01`
    const toD = `${calY}-${pad2(calM)}-${pad2(jalaliMonthLength(calY, calM))}`
    const [p, h] = await Promise.all([
      api(`/api/payment-plans${qs({ from: fromD, to: toD })}`),
      api(`/api/holidays${qs({ from: fromD, to: toD })}`),
    ])
    setCalLoading(false)
    if (p.ok) setPlans(p.data?.plans || [])
    else { setPlans([]); toast.error(p.error || 'بارگذاری تقویم پرداخت ناموفق بود') }
    if (h.ok) setHolidays(h.data?.holidays || [])
    else setHolidays([])
  }

  function navMonth(delta: number) {
    let m = calM + delta
    let y = calY
    if (m > 12) { m = 1; y++ }
    if (m < 1) { m = 12; y-- }
    setCalM(m); setCalY(y)
  }

  const monthPrefix = `${calY}-${pad2(calM)}-`
  const cells = useMemo(() => {
    const len = jalaliMonthLength(calY, calM)
    const lead = (jalaliToDate(calY, calM, 1).getDay() + 1) % 7
    const arr: (string | null)[] = Array.from({ length: lead }, () => null)
    for (let d = 1; d <= len; d++) arr.push(`${monthPrefix}${pad2(d)}`)
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [calY, calM, monthPrefix])

  const plansByDate = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const p of plans) {
      const list = m.get(p.date) || []
      list.push(p)
      m.set(p.date, list)
    }
    return m
  }, [plans])

  const chequesByDate = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const c of allCheques) {
      const list = m.get(c.dueDate) || []
      list.push(c)
      m.set(c.dueDate, list)
    }
    return m
  }, [allCheques])

  /** همه رویدادهای تعطیلی هر تاریخ (ممکن است چند رویداد در یک روز باشد) */
  const holidayByDate = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const h of holidays) {
      const list = m.get(h.date) || []
      list.push(h)
      m.set(h.date, list)
    }
    return m
  }, [holidays])

  const selPlans = selDay ? plansByDate.get(selDay) || [] : []
  const selCheques = selDay ? chequesByDate.get(selDay) || [] : []
  const selHols = selDay ? holidayByDate.get(selDay) || [] : []
  const selIsFriday = selDay ? weekdayOf(selDay) === 'جمعه' : false
  const monthPlans = plans.filter((p: any) => String(p.date).startsWith(monthPrefix))
  const monthOutstanding = monthPlans.filter((p: any) => p.status !== 'DONE').reduce((s: number, p: any) => s + (p.amount || 0), 0)

  /** صف امضای مالک — چک‌های ثبت‌شده توسط مدیر کل که منتظر امضا/رد هستند */
  const signQueue = useMemo(
    () => allCheques.filter((c: any) => c.status === 'PENDING_OWNER'),
    [allCheques],
  )

  /* ───────────── افزودن سریع برنامه پرداخت (پنل روز) ───────────── */

  async function submitQuickAdd() {
    if (!selDay) return
    const amount = Number(qa.amount)
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('مبلغ برنامه پرداخت را وارد کنید')
    setQaBusy(true)
    const r = await api('/api/payment-plans', {
      method: 'POST',
      body: { date: selDay, kind: qa.kind, amount, supplierName: qa.supplierName.trim() || undefined, note: qa.note.trim() || undefined },
    })
    setQaBusy(false)
    if (!r.ok) return toast.error(r.error || 'ثبت برنامه پرداخت ناموفق بود')
    toast.success('برنامه پرداخت برای این روز ثبت شد')
    setQa({ kind: 'CHEQUE', amount: '', supplierName: '', note: '' })
    setQaOpen(false)
    void loadCal()
  }

  /* ═════════════════════════ رندر ═════════════════════════ */

  /* ریزمتن سقف‌ها برای نوار ابزار */
  const limitsLine = lim.day || lim.week || lim.month
    ? `سقف‌ها: روزانه ${money(lim.day || 0)} · هفتگی ${money(lim.week || 0)} · ماهانه ${money(lim.month || 0)} ریال`
    : 'سقف پرداخت تعیین نشده است'

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="list" className="gap-1.5 py-2 text-xs sm:text-sm"><I.banknote size={15} /> چک‌ها</TabsTrigger>
          <TabsTrigger value="calc" className="gap-1.5 py-2 text-xs sm:text-sm"><I.timer size={15} /> محاسبه‌گر و پیشنهاد هوشمند</TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5 py-2 text-xs sm:text-sm"><I.calendar size={15} /> تقویم پرداخت</TabsTrigger>
        </TabsList>

        {/* ═══════════ تب ۱: دفتر چک ═══════════ */}
        <TabsContent value="list" className="space-y-4">
          {/* ═══ صف امضای مالک — چک‌های در انتظار امضا با یک کلیک امضا/رد (new-4.txt سطر ۱۹-۲۱) ═══ */}
          {canSign && signQueue.length > 0 && (
            <div className="rounded-xl border border-amber-400 bg-amber-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <I.penLine size={20} className="text-amber-600" />
                <p className="text-sm font-bold text-amber-900">
                  چک‌های در انتظار امضای شما
                  <span className="num mr-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px]">{fa(signQueue.length)} فقره</span>
                </p>
                <p className="text-[11px] text-amber-700">ثبت‌شده توسط مدیر کل — پس از امضا/رد، به مدیر کل اطلاع‌رسانی می‌شود.</p>
              </div>
              <div className="mt-2.5 space-y-1.5">
                {signQueue.map((c: any) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-white/80 px-3 py-2">
                    <span dir="ltr" className="font-mono text-xs font-bold text-stone-700">{c.number}</span>
                    <span className="text-xs text-stone-600">{c.recipient || 'بدون طرف حساب'}</span>
                    <span className="num text-xs font-bold text-stone-800">{money(c.amount)} <span className="text-[10px] font-normal text-stone-500">ریال</span></span>
                    <span className="num text-[11px] text-stone-500">سررسید {faSlash(c.dueDate)}</span>
                    {c.meta?.receiverName && (
                      <span className="text-[11px] text-stone-500">گیرنده: {c.meta.receiverName}{c.meta?.receiverPhone ? ` · ${toFaDigits(c.meta.receiverPhone)}` : ''}</span>
                    )}
                    {c.orderCode && <span className="text-[11px] text-stone-500">سفارش: <span dir="ltr" className="font-mono">{c.orderCode}</span></span>}
                    <span className="mr-auto" />
                    <Button size="sm" className="h-8 gap-1.5" disabled={busyId === c.id} onClick={() => onAction(c, 'sign')}>
                      {busyId === c.id ? <I.loader size={13} className="animate-spin" /> : <I.check size={13} />} امضا
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50" disabled={busyId === c.id} onClick={() => onAction(c, 'reject')}>
                      <I.x size={13} /> رد
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* کارت‌های آماری بالا — new-4.txt سطر ۱۳۵ */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              title="نوشته‌شده (کل دفتر چک)"
              titleHint="همهٔ چک‌های ثبت‌شده در سامانه، در هر وضعیتی"
              value={stats?.written?.count ?? 0}
              amount={stats?.written?.amount}
              tone="stone"
              sub={stats && (stats.bouncedRejected?.count || stats.uncollected?.count)
                ? `برگشتی/ردشده: ${fa(stats.bouncedRejected?.count || 0)}${stats.uncollected?.count ? ` · برداشت‌نشده: ${fa(stats.uncollected?.count || 0)}` : ''}`
                : null}
            />
            <StatCard
              title="در انتظار امضا یا دریافت"
              titleHint="در انتظار تأیید/امضای مالک یا تحویل به گیرنده"
              value={stats?.awaiting?.count ?? 0}
              amount={stats?.awaiting?.amount}
              tone="amber"
              sub={stats?.pendingOwner?.count ? `از جمله ${fa(stats.pendingOwner.count)} فقره در انتظار امضای مالک` : null}
            />
            <StatCard
              title="دریافت/وصول‌شده"
              titleHint="تحویل شده به گیرنده یا وصول شده از بانک"
              value={stats?.received?.count ?? 0}
              amount={stats?.received?.amount}
              tone="emerald"
              sub={stats?.clearedThisMonth?.count ? `وصول از بانک این ماه: ${fa(stats.clearedThisMonth.count)} فقره` : null}
            />
            <StatCard
              title="سررسیدهای پیش‌رو (فعال)"
              titleHint="چک‌های فعال به تفکیک دوره — فقط اگر امروز/فردا/هفته/ماه سررسید دارند"
              value={stats?.due?.week?.count ?? 0}
              amount={stats?.due?.week?.amount}
              tone="teal"
              chips={[
                { label: 'امروز', value: stats?.due?.today?.count ?? 0, amount: stats?.due?.today?.amount, cls: 'bg-amber-100 text-amber-900' },
                { label: 'فردا', value: stats?.due?.tomorrow?.count ?? 0, amount: stats?.due?.tomorrow?.amount, cls: 'bg-white/70' },
                { label: 'این هفته', value: stats?.due?.week?.count ?? 0, amount: stats?.due?.week?.amount, cls: 'bg-white/70' },
                { label: 'این ماه', value: stats?.due?.month?.count ?? 0, amount: stats?.due?.month?.amount, cls: 'bg-white/70' },
              ]}
            />
          </div>

          <Card>
            <CardContent className="flex flex-wrap items-center gap-2 p-4">
              {canFinance && (
                <Button onClick={() => openCreate()} data-tour="new-cheque" className="gap-2">
                  <I.plus size={16} /> چک جدید
                </Button>
              )}
              {['OWNER', 'GM', 'ADMIN'].includes(user?.role || '') && (
                <Button variant="outline" onClick={() => setSetOpen(true)} className="gap-2" title={limitsLine}>
                  <I.settings size={16} /> سقف‌ها و پارامترها
                </Button>
              )}
              <Select value={status || 'all'} onValueChange={(v: string) => setStatus(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-44" aria-label="فیلتر وضعیت">
                  <SelectValue placeholder="همه وضعیت‌ها" />
                </SelectTrigger>
                <SelectContent>
                  {FILTERS.map((f) => (
                    <SelectItem key={f.key || 'all'} value={f.key || 'all'}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative w-full sm:w-64">
                <I.search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <Input value={q} onChange={(e: any) => setQ(e.target.value)} placeholder="جستجو: شماره، گیرنده، سری صیادی…" className="pr-3 pl-8" aria-label="جستجوی چک" />
              </div>
              <p className="w-full text-[10px] leading-4 text-stone-400">{limitsLine}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-sm text-stone-500">
                  <I.loader size={20} className="ml-2 animate-spin" /> در حال بارگذاری چک‌ها…
                </div>
              ) : items.length === 0 ? (
                <div className="py-14 text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100">
                    <I.banknote size={26} className="text-stone-400" />
                  </div>
                  <p className="text-sm font-bold text-stone-700">چکی ثبت نشده است</p>
                  <p className="mt-1 text-xs text-stone-500">با دکمه «چک جدید» اولین چک (دریافتنی یا صادره) را ثبت کنید.</p>
                </div>
              ) : (
                <div className="max-h-[65vh] overflow-auto">
                  <Table className="min-w-[860px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">شماره چک</TableHead>
                        <TableHead className="text-right">مبلغ</TableHead>
                        <TableHead className="text-right">گیرنده</TableHead>
                        <TableHead className="text-right">تاریخ صدور</TableHead>
                        <TableHead className="text-right">سررسید</TableHead>
                        <TableHead className="text-center">وضعیت</TableHead>
                        {canFinance && <TableHead className="text-center">اقدامات</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span dir="ltr" className="font-mono text-xs font-bold">{c.number}</span>
                              {c.selfIssued && <Badge variant="outline" className="border-amber-400 bg-amber-50 px-1 py-0 text-[9px] text-amber-800">چک خودی</Badge>}
                            </div>
                            {c.sayadSerial && (
                              <div className="mt-0.5 text-[10px] text-stone-500">صیادی: <span dir="ltr" className="font-mono">{c.sayadSerial}</span></div>
                            )}
                          </TableCell>
                          <TableCell className="num font-bold">
                            <span title={`${money(c.amount)} ریال ≈ ${toman(c.amount)} تومان`}>{money(c.amount)}</span>
                          </TableCell>
                          <TableCell className="max-w-40">
                            <div className="truncate text-xs">{c.recipient || '—'}</div>
                            {c.orderCode && <div className="mt-0.5 text-[10px] text-stone-500">سفارش: <span dir="ltr" className="font-mono">{c.orderCode}</span></div>}
                            {c.meta?.receiverName && (
                              <div className="mt-0.5 text-[10px] text-stone-500">گیرنده چک: {c.meta.receiverName}{c.meta?.receiverPhone ? ` · ${toFaDigits(c.meta.receiverPhone)}` : ''}</div>
                            )}
                          </TableCell>
                          <TableCell className="num text-xs text-stone-500">
                            {c.writtenAt ? faSlash(c.writtenAt) : '—'}
                            {c.meta?.issuedTime && <div className="text-[10px] text-stone-400">ساعت {toFaDigits(c.meta.issuedTime)}</div>}
                          </TableCell>
                          <TableCell>
                            <div className="num text-xs">{faSlash(c.dueDate)}</div>
                            <div className="text-[10px] text-stone-500">{weekdayOf(c.dueDate)}</div>
                            <DueChip days={c.daysLeft} status={c.status} />
                          </TableCell>
                          <TableCell className="text-center"><StatusBadge status={c.status} /></TableCell>
                          {canFinance && <TableCell>{actionButtons(c)}</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════ تب ۲: محاسبه‌گر زمان چک + پیشنهاد هوشمند ═══════════ */}
        <TabsContent value="calc" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><I.timer size={18} /> محاسبه‌گر زمان چک و پیشنهاد هوشمند</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* R7: همهٔ خانه‌ها هم‌قد — ساختار یکسان برچسب + ورودی + خط راهنما (min-h) و items-start */}
              <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex h-full flex-col">
                  <label className="mb-1 block text-xs text-stone-500">دوره چک (روز)</label>
                  <Input
                    dir="ltr" inputMode="numeric" className="num text-center"
                    value={days ? toFaDigits(days) : ''}
                    onChange={(e: any) => setDays(toEnDigits(String(e.target.value)).replace(/[^\d]/g, ''))}
                  />
                  <p className="mt-1 min-h-4 text-[11px] leading-4 text-stone-400">
                    {defDays ? `پیش‌فرض سامانه: ${fa(defDays)} روز` : 'پیش‌فرض: ۴۵ روز'}
                  </p>
                </div>
                <div className="flex h-full flex-col">
                  <label className="mb-1 block text-xs text-stone-500">تاریخ شروع (شمسی)</label>
                  <JInput value={from} onChange={(v: string) => { setFrom(v); setCalc(null); setChosenDate(''); setCalcHols([]); setSmart(null) }} />
                  <p className="mt-1 min-h-4 text-[11px] leading-4 text-stone-400">مبنا برای محاسبهٔ سررسید</p>
                </div>
                <div className="flex h-full flex-col">
                  <label className="mb-1 block text-xs text-stone-500">مبلغ (ریال) — برای پیشنهاد هوشمند</label>
                  <AmountInput value={calcAmount} onChange={setCalcAmount} />
                  <p className="mt-1 min-h-4 text-[11px] leading-4 text-stone-400">مبنای تقسیم پرداخت</p>
                </div>
                <div className="flex h-full flex-col">
                  <label className="mb-1 block text-xs text-stone-500">تأمین‌کننده / طرف حساب (اختیاری)</label>
                  <Input value={calcSupplier} onChange={(e: any) => setCalcSupplier(e.target.value)} placeholder="مثلاً: شیرین عسل کرمان" maxLength={120} />
                  <p className="mt-1 min-h-4 text-[11px] leading-4 text-stone-400">برای ثبت روی سند پیشنهادی</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void runCalc()} disabled={calcBusy} className="gap-2">
                  {calcBusy ? <I.loader size={16} className="animate-spin" /> : <I.sparkles size={16} />} محاسبه و پیشنهاد
                </Button>
                <p className="text-[11px] leading-5 text-stone-500">
                  با مبلغ، دوره و سقف‌های تعیین‌شده، سامانه هم تاریخ سررسید و هم چگونگی تقسیم پرداخت را پیشنهاد می‌دهد.
                </p>
              </div>

              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                <div className="flex items-start gap-2 text-xs leading-5 text-amber-900">
                  <I.alertTriangle size={16} className="mt-0.5 shrink-0" />
                  <p><b>هرگز دوره چک را طولانی‌تر از توافق با تأمین‌کننده نکنید — تاریخ نزدیک‌تر حفظ اعتبار ماست.</b></p>
                </div>
              </div>

              {calc && (
                <div className="space-y-3">
                  {/* تاریخ هدف */}
                  <button
                    type="button"
                    onClick={() => { if (!calc.isOff) setChosenDate(calc.target) }}
                    className={cn(
                      'w-full rounded-xl border p-4 text-start transition-colors',
                      calc.isOff ? 'border-rose-300 bg-rose-50' : 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100',
                      chosenDate === calc.target && 'ring-2 ring-emerald-500',
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] text-stone-500">تاریخ سررسید محاسبه‌شده ({fa(calc.days)} روز از {faSlash(calc.from)})</p>
                        <p className="mt-1 text-lg font-black text-stone-700">{calc.targetLong || longFa(calc.target)}</p>
                        <p className="mt-0.5 text-xs text-stone-600">روز هفته: {calc.weekday || weekdayOf(calc.target)}</p>
                      </div>
                      {calc.isOff ? (
                        <Badge variant="outline" className="border-rose-400 bg-rose-100 text-rose-800">روز غیرکاری</Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-400 bg-emerald-100 text-emerald-800">روز کاری</Badge>
                      )}
                    </div>
                    {calc.isOff && (
                      <div className="mt-2 flex items-start gap-2 rounded-lg border border-rose-300 bg-white/70 p-2 text-xs text-rose-800">
                        <I.alertTriangle size={14} className="mt-0.5 shrink-0" />
                        <p><b>{offText(calc)}</b> — چک در روز غیرکاری وصول نمی‌شود؛ تاریخ‌های پیشنهادی (زودتر) را انتخاب کنید.</p>
                      </div>
                    )}
                    {!calc.isOff && (
                      <p className="mt-2 text-[11px] text-emerald-700">این تاریخ روز کاری است — برای انتخاب، روی همین کادر کلیک کنید.</p>
                    )}
                  </button>

                  {/* نوار تقویم کوچک — ۹ روز قبل تا ۴ روز بعد از تاریخ هدف */}
                  {stripDays.length > 0 && (
                    <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-stone-600">
                        <I.calendarDays size={14} /> نوار تقویم اطراف سررسید — روزهای قرمز، تعطیل یا جمعه هستند
                      </p>
                      <div className="flex gap-1 overflow-x-auto pb-1">
                        {stripDays.map((d) => {
                          const { off, why } = calcOff(d)
                          const isTarget = calc.target === d
                          const isChosen = chosenDate === d
                          return (
                            <button
                              key={d} type="button"
                              disabled={off}
                              onClick={() => setChosenDate(d)}
                              title={off ? `${weekdayOf(d)} — غیرکاری (${why})` : `${weekdayOf(d)} — روز کاری`}
                              className={cn(
                                'flex min-w-12 flex-col items-center rounded-lg border px-1.5 py-1.5 transition-colors',
                                off
                                  ? 'cursor-not-allowed border-rose-200 bg-rose-50 text-rose-400'
                                  : isChosen
                                    ? 'border-emerald-600 bg-emerald-600 text-white'
                                    : isTarget
                                      ? 'border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-400/40'
                                      : 'border-stone-200 bg-white text-stone-700 hover:border-emerald-400',
                              )}
                            >
                              <span className={cn('num text-sm font-bold', off && !isTarget && 'text-rose-500')}>{toFaDigits(Number(d.slice(8)))}</span>
                              <span className={cn('text-[9px]', off && !isTarget ? 'text-rose-400' : 'opacity-70')}>
                                {WD_SHORT[weekdayOf(d)] || ''}
                              </span>
                              {isTarget && <span className="mt-0.5 text-[8px] font-bold text-amber-700">هدف</span>}
                              {off && isTarget && <span className="mt-0.5 text-[8px] font-bold text-rose-600">غیرکاری</span>}
                              {!isTarget && off && <span className="mt-0.5 h-1 w-1 rounded-full bg-rose-400" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* تعطیلی‌های ردشده تا تاریخ پیشنهادی */}
                  {calc.isOff && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-rose-800">
                        <I.alertTriangle size={14} /> روزهای غیرکاری ردشده تا نزدیک‌ترین روز کاری
                      </p>
                      {skippedDays.length === 0 ? (
                        <p className="text-[11px] text-rose-600">روز غیرکاری دیگری بین تاریخ هدف و تاریخ پیشنهادی نیست.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {skippedDays.map((s) => (
                            <span key={s.date} className="rounded-full border border-rose-200 bg-white px-2 py-1 text-[10px] text-rose-700">
                              <b className="num">{faSlash(s.date)}</b> ({s.wd}) — {s.why}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* خلاصه بازه دوره */}
                  {windowSummary && (
                    <div className="rounded-xl border border-stone-200 bg-white p-3 text-[11px] leading-6 text-stone-600">
                      <p>
                        در بازه {faSlash(calc.from)} تا {faSlash(calc.target)}:
                        <b className="mx-1 text-stone-800">{fa(windowSummary.fridays)} جمعه</b> و
                        <b className="mx-1 text-stone-800">{fa(windowSummary.hols.length)} تعطیلی رسمی/مذهبی</b>
                        وجود دارد.
                      </p>
                      {windowSummary.hols.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {windowSummary.hols.map((t, i) => (
                            <span key={i} className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* چیپ‌های پیشنهاد — فقط روزهای کاریِ زودتر، هرگز دیرتر */}
                  {Array.isArray(calc.suggestions) && calc.suggestions.filter((s: any) => (s.deltaDays ?? -1) <= 0).length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium text-stone-600">تاریخ‌های پیشنهادی — نزدیک‌ترین روزهای کاریِ <b>زودتر</b>:</p>
                      <div className="flex flex-wrap gap-2">
                        {calc.suggestions.filter((s: any) => (s.deltaDays ?? -1) <= 0).map((s: any) => {
                          const delta = Math.abs(Number(s.deltaDays || 0))
                          const selected = chosenDate === s.date
                          return (
                            <button
                              key={s.date} type="button"
                              onClick={() => setChosenDate(s.date)}
                              className={cn(
                                'rounded-xl border px-3 py-2 text-start transition-colors',
                                selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-emerald-400',
                              )}
                            >
                              <span className="block text-sm font-bold">{s.long || longFa(s.date)}</span>
                              <span className={cn('block text-[11px]', selected ? 'text-emerald-50' : 'text-stone-500')}>
                                {s.weekday || weekdayOf(s.date)} · {delta > 0 ? `${fa(delta)} روز زودتر` : 'خودِ تاریخ هدف'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* تاریخ انتخاب‌شده */}
                  {chosenDate && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3">
                      <span className="text-sm text-emerald-800">
                        تاریخ انتخاب‌شده: <b>{longFa(chosenDate)}</b> ({weekdayOf(chosenDate)}) — <span className="num">{faSlash(chosenDate)}</span>
                      </span>
                      <Button onClick={() => openCreate(chosenDate)} className="gap-2">
                        <I.check size={16} /> ثبت چک با این تاریخ
                      </Button>
                    </div>
                  )}

                  {/* ═══ پیشنهاد هوشمند پرداخت — new-4.txt سطر ۱۳۵ ═══ */}
                  {smart && (
                    <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-sm font-bold text-teal-900">
                          <I.sparkles size={16} /> پیشنهاد هوشمند پرداخت
                          <Badge variant="outline" className="border-teal-300 bg-white text-[10px] text-teal-800">{smart.tierLabel} · تا {fa(smart.maxN)} چک</Badge>
                        </p>
                        <p className="text-[11px] text-stone-500">
                          مبلغ {money(smart.amount)} ریال · موعد {faSlash(smart.target?.date)} · رند {money(smart.settings?.split?.roundTo)} ریال
                        </p>
                      </div>
                      {(lim.day || lim.week || lim.month) > 0 && (
                        <p className="text-[11px] text-stone-600">
                          سقف‌ها: روزانه {money(lim.day)} · هفتگی {money(lim.week)} · ماهانه {money(lim.month)} ریال
                        </p>
                      )}

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {/* گزینه پرداخت کامل */}
                        {smart.full && (
                          <button
                            type="button"
                            disabled={applyingSmart !== ''}
                            onClick={() => void applySmart(smart.full)}
                            className={cn(
                              'rounded-xl border p-3 text-start transition-colors disabled:opacity-60',
                              smart.full.ok ? 'border-emerald-300 bg-emerald-50 hover:border-emerald-500' : 'border-amber-300 bg-amber-50',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-bold text-stone-800">پرداخت کامل — یک چک</p>
                              {applyingSmart === `full-${smart.full.cheques[0]?.date}` && <I.loader size={14} className="animate-spin" />}
                            </div>
                            <p className="mt-1 num text-[12px] text-stone-700">
                              {smart.full.cheques[0] ? `${faSlash(smart.full.cheques[0].date)} · ${weekdayOf(smart.full.cheques[0].date)}` : ''} — <b>{money(smart.full.cheques[0]?.amount)}</b> ریال
                            </p>
                            <p className="mt-1 text-[10px] leading-4 text-stone-500">ثبت به‌عنوان برنامه پرداخت روی تقویم</p>
                            {smart.full.warnings?.map((w: string, i: number) => (
                              <p key={i} className="mt-1 text-[10px] leading-4 text-amber-800">⚠ {w}</p>
                            ))}
                          </button>
                        )}
                        {/* گزینه‌های خرد کردن */}
                        {(smart.options || []).map((opt: any) => (
                          <button
                            key={opt.n}
                            type="button"
                            disabled={applyingSmart !== ''}
                            onClick={() => void applySmart(opt)}
                            className={cn(
                              'rounded-xl border p-3 text-start transition-colors disabled:opacity-60',
                              opt.ok ? 'border-teal-300 bg-white hover:border-teal-500' : 'border-rose-300 bg-rose-50',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-bold text-stone-800">{fa(opt.n)} چک — {money(opt.cheques?.[0]?.amount || 0)} تا {money(opt.cheques?.[opt.cheques.length - 1]?.amount || 0)} ریال</p>
                              {applyingSmart === `full-${opt.cheques?.[0]?.date}` && <I.loader size={14} className="animate-spin" />}
                            </div>
                            <div className="mt-1.5 space-y-1">
                              {(opt.cheques || []).map((c: any, i: number) => (
                                <div key={c.date} className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-2 py-1">
                                  <span className="text-[10px] text-stone-500">چک {fa(i + 1)}</span>
                                  <span className="num text-[11px] text-stone-700">{faSlash(c.date)} · {c.weekday || weekdayOf(c.date)}</span>
                                  <span className="num text-[12px] font-bold text-stone-800">{money(c.amount)}</span>
                                </div>
                              ))}
                            </div>
                            <p className="mt-1.5 text-[10px] leading-4 text-stone-500">جمع: {money(opt.sum)} ریال — ثبت {fa(opt.n)} برنامه روی تقویم</p>
                            {(opt.warnings || []).map((w: string, i: number) => (
                              <p key={i} className="mt-1 text-[10px] leading-4 text-rose-700">⚠ {w}</p>
                            ))}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] leading-4 text-stone-400">{smart.note}</p>
                    </div>
                  )}
                </div>
              )}

              {!calc && !calcBusy && (
                <p className="py-6 text-center text-sm text-stone-400">دوره و تاریخ شروع را وارد کنید و «محاسبه» را بزنید.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════ تب ۳: تقویم پرداخت (تقویم + پنل جزئیات روز کنار هم) ═══════════ */}
        <TabsContent value="calendar" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            {/* ─── تقویم ماه ─── */}
            <Card>
              <CardContent className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => navMonth(-1)} aria-label="ماه قبل"><I.chevronRight size={16} /></Button>
                    <button
                      className="text-base font-bold transition-colors hover:text-emerald-800"
                      onClick={() => { setCalY(Number(today.slice(0, 4))); setCalM(Number(today.slice(5, 7))) }}
                    >
                      {JALALI_MONTHS[calM - 1]} {toFaDigits(calY)}
                    </button>
                    <Button variant="outline" size="icon" onClick={() => navMonth(1)} aria-label="ماه بعد"><I.chevronLeft size={16} /></Button>
                    {calLoading && <I.loader size={14} className="animate-spin text-stone-400" />}
                  </div>
                  <div className="text-[11px] text-stone-500">
                    {fa(monthPlans.length)} برنامه در این ماه
                    {monthOutstanding > 0 && <span className="mr-2 font-medium text-amber-700">مانده: {money(monthOutstanding)} ریال</span>}
                  </div>
                </div>

                <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-stone-500">
                  {WEEKDAY_FA.map((w, i) => (
                    <div key={w} className={i === 6 ? 'text-rose-500' : undefined}>{w}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {cells.map((d, i) => {
                    if (!d) return <div key={`blank-${i}`} className="min-h-[88px] rounded-lg bg-stone-50" aria-hidden="true" />
                    const dayPlans = plansByDate.get(d) || []
                    const dayCheques = chequesByDate.get(d) || []
                    const dayHols = holidayByDate.get(d) || []
                    const isFriday = weekdayOf(d) === 'جمعه'
                    const isToday = d === today
                    const isSel = d === selDay
                    const kinds = [...new Set(dayPlans.map((p: any) => p.kind))]
                    const hasAny = dayPlans.length > 0 || dayCheques.length > 0 || dayHols.length > 0
                    return (
                      <button
                        key={d}
                        onClick={() => { setSelDay(d); setQaOpen(false) }}
                        title={[
                          longFa(d),
                          secondDateLongFa(d),
                          dayHols.length ? `تعطیل: ${dayHols.map((h: any) => h.title).join(' و ')}` : '',
                          isFriday ? 'جمعه' : '',
                          dayPlans.length ? `${fa(dayPlans.length)} برنامه پرداخت` : '',
                          dayCheques.length ? `${fa(dayCheques.length)} چک سررسید` : '',
                        ].filter(Boolean).join('\n')}
                        className={cn(
                          'flex min-h-[88px] cursor-pointer flex-col rounded-lg border p-1.5 text-start transition-colors hover:border-emerald-400',
                          isSel ? 'border-emerald-600 ring-2 ring-emerald-500/40'
                            : isToday ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/25'
                            : dayHols.length ? 'border-rose-300 bg-rose-50'
                            : isFriday ? 'border-rose-200 bg-rose-50/50'
                            : hasAny ? 'border-stone-200 bg-white'
                            : 'border-transparent bg-stone-50',
                        )}
                      >
                        <span className={cn('num text-[13px] font-black leading-5', isToday ? 'text-emerald-700' : dayHols.length ? 'text-rose-700' : 'text-stone-700')}>{toFaDigits(Number(d.slice(8)))}</span>
                        {/* ریزتاریخ هجری/میلادی — خوانا (≥۱۰px) */}
                        <span dir="rtl" className="truncate text-[10px] leading-3 text-stone-400">{secondDateFa(d)}</span>
                        {dayHols.length > 0 && <span className="mt-0.5 block truncate text-[10px] leading-4 text-rose-700">{dayHols[0]?.title}{dayHols.length > 1 ? ` +${toFaDigits(dayHols.length - 1)}` : ''}</span>}
                        <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
                          {dayHols.length > 0 && (
                            <span className="h-2 w-2 rounded-full bg-rose-500" title={dayHols.map((h: any) => h.title).join(' و ')} />
                          )}
                          {kinds.slice(0, 4).map((k: string) => (
                            <span key={k} className={cn('h-2 w-2 rounded-full', KIND_DOT[k] || 'bg-stone-400')} title={KIND_LABEL[k] || k} />
                          ))}
                          {dayCheques.length > 0 && (
                            <span className="rounded bg-amber-100 px-1 text-[10px] font-bold leading-4 text-amber-800">{fa(dayCheques.length)} چک</span>
                          )}
                          {dayPlans.length > kinds.length + (dayHols.length ? 1 : 0) && (
                            <span className="text-[10px] text-stone-400">+{fa(dayPlans.length - kinds.length - (dayHols.length ? 1 : 0))}</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-600">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> چک</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-600" /> کارت‌خوان (POS)</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-600" /> نقدی</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> تعطیل رسمی / مذهبی</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-200" /> جمعه</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-100 ring-1 ring-emerald-400" /> امروز</span>
                </div>
              </CardContent>
            </Card>

            {/* ─── پنل جزئیات روز انتخابی (کنار تقویم — نه دیالوگ) ─── */}
            <Card className="h-fit xl:sticky xl:top-2">
              <CardContent className="space-y-3 p-4">
                {!selDay ? (
                  <div className="py-10 text-center">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100">
                      <I.calendarDays size={26} className="text-stone-400" />
                    </div>
                    <p className="text-sm font-bold text-stone-700">روی یک روز کلیک کنید</p>
                    <p className="mt-1 text-xs leading-5 text-stone-500">
                      چک‌های سررسید، برنامه‌های پرداخت و تعطیلی‌های همان روز اینجا نمایش داده می‌شود.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-stone-100 pb-3">
                      <div>
                        <p className="text-sm font-black text-stone-800">{longFa(selDay)}</p>
                        <p className="num mt-0.5 text-[11px] text-stone-500">{faSlash(selDay)} · {weekdayOf(selDay)}</p>
                        <p dir="rtl" className="mt-0.5 text-[11px] text-stone-400">{secondDateLongFa(selDay)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {selIsFriday && <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700">جمعه — روز تعطیل هفتگی</Badge>}
                        {selHols.map((h: any) => (
                          <Badge key={h.id} variant="outline" className={cn('max-w-64 text-right text-[10px]', HOL_KIND_CLASS[h.kind] || HOL_KIND_CLASS.CUSTOM)}>
                            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
                            {h.title} ({h.kindLabel || h.kind})
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {selHols.length > 0 && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[11px] leading-5 text-rose-800">
                        <b>این روز تعطیل است:</b> {selHols.map((h: any) => `${h.title} (${h.kindLabel || h.kind})`).join(' — ')}
                      </div>
                    )}

                    {selPlans.length === 0 && selCheques.length === 0 ? (
                      <p className="py-4 text-center text-xs text-stone-400">برنامه یا چکی برای این روز ثبت نشده است</p>
                    ) : (
                      <div className="max-h-[46vh] space-y-2.5 overflow-y-auto pl-1">
                        {selCheques.length > 0 && (
                          <div className="space-y-2">
                            <p className="flex items-center gap-1.5 text-xs font-bold text-stone-600"><I.banknote size={13} /> چک‌های سررسید ({fa(selCheques.length)})</p>
                            {selCheques.map((c: any) => (
                              <div key={c.id} className="rounded-lg border border-stone-200 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span dir="ltr" className="font-mono text-xs font-bold">{c.number}</span>
                                    <StatusBadge status={c.status} />
                                    {c.selfIssued && <Badge variant="outline" className="border-amber-400 bg-amber-50 px-1 py-0 text-[9px] text-amber-800">چک خودی</Badge>}
                                  </div>
                                  <span className="text-sm font-bold">{money(c.amount)} <span className="text-[10px] font-normal text-stone-500">ریال</span></span>
                                </div>
                                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-stone-600">
                                  {c.recipient && <span>گیرنده: {c.recipient}</span>}
                                  {c.sayadSerial && <span>صیادی: <span dir="ltr" className="font-mono">{c.sayadSerial}</span></span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {selPlans.length > 0 && (
                          <div className="space-y-2">
                            <p className="flex items-center gap-1.5 text-xs font-bold text-stone-600"><I.wallet size={13} /> برنامه‌های پرداخت ({fa(selPlans.length)})</p>
                            {selPlans.map((p: any) => (
                              <div key={p.id} className="rounded-lg border border-stone-200 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <Badge variant="outline" className={KIND_CLASS[p.kind] || ''}>{KIND_LABEL[p.kind] || p.kind}</Badge>
                                    {PLAN_STATUS[p.status] && <Badge variant="outline" className={PLAN_STATUS[p.status].cls}>{PLAN_STATUS[p.status].label}</Badge>}
                                  </div>
                                  <span className="text-sm font-bold">{money(p.amount)} <span className="text-[10px] font-normal text-stone-500">ریال</span></span>
                                </div>
                                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-stone-600">
                                  {p.supplierName && <span>تأمین‌کننده: {p.supplierName}</span>}
                                  {p.orderCode && <span>سفارش: <span dir="ltr" className="font-mono">{p.orderCode}</span></span>}
                                  {p.note && <span>یادداشت: {p.note}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* اقدامات سریع روی این روز */}
                    {canFinance && (
                      <div className="space-y-2 border-t border-stone-100 pt-3">
                        {!qaOpen ? (
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setQaOpen(true); setQa({ kind: 'CHEQUE', amount: '', supplierName: '', note: '' }) }}>
                              <I.plus size={14} /> افزودن برنامه پرداخت
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openCreate(selDay)}>
                              <I.banknote size={14} /> ثبت چک برای این روز
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50/70 p-2.5">
                            <p className="text-[11px] font-bold text-stone-700">برنامه پرداخت جدید — {longFa(selDay)}</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="mb-1 block text-[10px] text-stone-500">نوع</label>
                                <Select value={qa.kind} onValueChange={(v: string) => setQa((f) => ({ ...f, kind: v }))}>
                                  <SelectTrigger className="h-9 text-xs" aria-label="نوع پرداخت"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="CHEQUE">چک</SelectItem>
                                    <SelectItem value="POS">کارت‌خوان (POS)</SelectItem>
                                    <SelectItem value="CASH">نقدی</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <label className="mb-1 block text-[10px] text-stone-500">مبلغ (ریال) *</label>
                                <Input
                                  dir="ltr" inputMode="numeric" className="num h-9 text-end text-xs"
                                  value={qa.amount ? toFaDigits(qa.amount) : ''}
                                  onChange={(e: any) => setQa((f) => ({ ...f, amount: toEnDigits(String(e.target.value)).replace(/[^\d]/g, '') }))}
                                  placeholder="۰"
                                />
                              </div>
                            </div>
                            <Input
                              className="h-9 text-xs" value={qa.supplierName}
                              onChange={(e: any) => setQa((f) => ({ ...f, supplierName: e.target.value }))}
                              placeholder="تأمین‌کننده / طرف حساب (اختیاری)"
                            />
                            <Input
                              className="h-9 text-xs" value={qa.note}
                              onChange={(e: any) => setQa((f) => ({ ...f, note: e.target.value }))}
                              placeholder="یادداشت (اختیاری)"
                            />
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setQaOpen(false)}>انصراف</Button>
                              <Button size="sm" disabled={qaBusy} onClick={() => void submitQuickAdd()} className="gap-1.5">
                                {qaBusy && <I.loader size={13} className="animate-spin" />} ثبت برنامه
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ═══════════ دیالوگ ثبت/ویرایش چک ═══════════ */}
      <Dialog open={createOpen} onOpenChange={(o: boolean) => setCreateOpen(o)}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'ویرایش چک' : 'ثبت چک جدید'}</DialogTitle>
            <DialogDescription>
              {editing ? 'اطلاعات چک اصلاح می‌شود — هر تغییر در تاریخچهٔ چک ثبت می‌گردد.' : 'چک دریافتنی از مشتری یا صادره فروشگاه ثبت می‌شود و به مالک برای تأیید و امضا ارسال می‌شود.'}
              {form.dueDate && ` — سررسید: ${longFa(form.dueDate)}`}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(e: any) => void submitForm(e)}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-stone-600">شماره چک *</label>
                <Input dir="ltr" className="text-center font-mono" value={form.number} onChange={(e: any) => setForm((f) => ({ ...f, number: e.target.value }))} placeholder="125487" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-stone-600">مبلغ (ریال) *</label>
                <AmountInput value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-stone-600">تاریخ سررسید (شمسی) *</label>
              <JInput value={form.dueDate} onChange={(v: string) => setForm((f) => ({ ...f, dueDate: v }))} quick={false} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-stone-600">گیرنده / طرف حساب</label>
              <Input value={form.recipient} onChange={(e: any) => setForm((f) => ({ ...f, recipient: e.target.value }))} placeholder="مثلاً: شیرین عسل کرمان" maxLength={120} />
            </div>
            <div
              className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5"
              onClick={(e: any) => { if ((e.target as any)?.tagName !== 'BUTTON') setForm((f) => ({ ...f, selfIssued: !f.selfIssued })) }}
            >
              <span>
                <span className="block cursor-pointer text-sm">چک صادره (منتشرشده توسط فروشگاه)</span>
                <span className="block text-[11px] text-stone-500">در صورت خاموش بودن، چک به‌عنوان دریافتنی از مشتری ثبت می‌شود</span>
              </span>
              <Checkbox checked={!!form.selfIssued} onCheckedChange={(v: any) => setForm((f) => ({ ...f, selfIssued: !!v }))} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-stone-600">سری صیادی</label>
                <Input dir="ltr" className="text-center font-mono" value={form.sayadSerial} onChange={(e: any) => setForm((f) => ({ ...f, sayadSerial: e.target.value }))} placeholder="اختیاری" maxLength={30} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-stone-600">کد سفارش</label>
                <Input dir="ltr" className="text-center font-mono" value={form.orderCode} onChange={(e: any) => setForm((f) => ({ ...f, orderCode: e.target.value }))} placeholder="اختیاری" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-stone-600">یادداشت</label>
              <Textarea rows={2} value={form.note} onChange={(e: any) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="اختیاری…" />
            </div>

            {/* ═══ اطلاعات گیرنده و صدور (new-4.txt سطر ۵۶: نام/موبایل دریافت‌کننده + تاریخ/ساعت) ═══ */}
            <div className="space-y-2.5 rounded-lg border border-stone-200 bg-stone-50/60 p-3">
              <p className="text-xs font-bold text-stone-700">اطلاعات گیرنده و صدور <span className="font-normal text-stone-400">(اختیاری هنگام ثبت — هنگام «تحویل» نیز پرسیده می‌شود)</span></p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-stone-600">تاریخ صدور (شمسی)</label>
                  <JInput value={form.writtenAt} onChange={(v: string) => setForm((f) => ({ ...f, writtenAt: v }))} quick={false} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-stone-600">ساعت صدور / تحویل</label>
                  <TimeInput value={form.issuedTime} onChange={(v: string) => setForm((f) => ({ ...f, issuedTime: v }))} placeholder="۰۹:۳۰" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-stone-600">نام دریافت‌کننده چک</label>
                  <Input value={form.receiverName} onChange={(e: any) => setForm((f) => ({ ...f, receiverName: e.target.value }))} placeholder="مثلاً: خانم رضایی — حسابدار شیرین عسل" maxLength={80} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-stone-600">موبایل دریافت‌کننده</label>
                  <Input dir="ltr" inputMode="tel" className="num text-center" value={form.receiverPhone ? toFaDigits(form.receiverPhone) : ''} onChange={(e: any) => setForm((f) => ({ ...f, receiverPhone: toEnDigits(String(e.target.value)).replace(/[^\d+]/g, '') }))} placeholder="۰۹۱۲۳۴۵۶۷۸۹" maxLength={14} />
                </div>
              </div>
            </div>

            {/* وضعیت دستی — فقط در ویرایش (گردش کامل توسط دکمه‌های اقدامات انجام می‌شود) */}
            {editing && (
              <div className="space-y-1.5">
                <label className="text-xs text-stone-600">وضعیت (تنظیم دستی — اختیاری)</label>
                <Select value={form.status || editing.status} onValueChange={(v: string) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-9 text-xs" aria-label="وضعیت چک"><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl">
                    {EDITABLE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-stone-400">در صورت تغییر، از این وضعیت به وضعیت انتخابی منتقل می‌شود (در تاریخچه ثبت می‌گردد).</p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>انصراف</Button>
              <Button type="submit" disabled={savingForm} className="gap-2">
                {savingForm ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />}
                {editing ? 'ذخیره تغییرات' : 'ثبت چک'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ═══════════ دیالوگ دلیل (رد / برگشت) ═══════════ */}
      <Dialog open={!!reasonDlg} onOpenChange={(o: boolean) => { if (!o) setReasonDlg(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{reasonDlg ? ACTION_LABELS[reasonDlg.action] : ''} — چک {reasonDlg?.row?.number}</DialogTitle>
            <DialogDescription>دلیل این عملیات را شرح دهید (الزامی).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              rows={3} maxLength={300} value={reasonText}
              onChange={(e: any) => setReasonText(e.target.value)}
              placeholder="مثلاً: عدم موجودی کافی حساب صادرکننده"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReasonDlg(null)}>انصراف</Button>
              <Button variant="destructive" disabled={reasonBusy} onClick={() => void submitReason()} className="gap-2">
                {reasonBusy && <I.loader size={15} className="animate-spin" />} ثبت
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════ دیالوگ تاریخچه چک ═══════════ */}
      <Dialog open={!!histRow} onOpenChange={(o: boolean) => { if (!o) setHistRow(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تاریخچه چک <span dir="ltr" className="font-mono text-sm">{histRow?.number}</span></DialogTitle>
            <DialogDescription>گردش وضعیت چک از لحظه ثبت</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {(histRow?.history || []).length === 0 && <p className="py-6 text-center text-sm text-stone-400">تاریخچه‌ای ثبت نشده است</p>}
            {(histRow?.history || []).map((h: any, i: number) => (
              <div key={i} className="flex gap-2 rounded-lg border p-2 text-xs">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
                <div>
                  <p className="font-medium">{ACTION_LABELS[h.action] || h.action} — <span className="text-stone-500">{h.by}</span></p>
                  <p className="num text-[10px] text-stone-400">{h.at ? tsFa(h.at) : ''}</p>
                  {h.detail && <p className="mt-0.5 leading-5 text-stone-600">{h.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════ دیالوگ تحویل چک — اطلاعات دریافت‌کننده + تاریخ/ساعت (new-4.txt سطر ۵۶) ═══════════ */}
      <Dialog open={!!deliverDlg} onOpenChange={(o: boolean) => { if (!o) setDeliverDlg(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تحویل چک <span dir="ltr" className="font-mono text-sm">{deliverDlg?.number}</span></DialogTitle>
            <DialogDescription>
              {deliverDlg ? `${money(deliverDlg.amount)} ریال — سررسید ${faSlash(deliverDlg.dueDate)} (${weekdayOf(deliverDlg.dueDate)}) — گیرنده: ${deliverDlg.recipient || '—'}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-stone-600">نام دریافت‌کننده *</label>
                <Input value={dv.receiverName} onChange={(e: any) => setDv((f) => ({ ...f, receiverName: e.target.value }))} placeholder="نام کامل دریافت‌کننده چک" maxLength={80} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-stone-600">موبایل دریافت‌کننده</label>
                <Input dir="ltr" inputMode="tel" className="num text-center" value={dv.receiverPhone ? toFaDigits(dv.receiverPhone) : ''} onChange={(e: any) => setDv((f) => ({ ...f, receiverPhone: toEnDigits(String(e.target.value)).replace(/[^\d+]/g, '') }))} placeholder="۰۹۱۲۳۴۵۶۷۸۹" maxLength={14} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-stone-600">تاریخ تحویل (شمسی)</label>
                <JInput value={dv.date} onChange={(v: string) => setDv((f) => ({ ...f, date: v }))} quick={false} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-stone-600">ساعت تحویل</label>
                <TimeInput value={dv.time} onChange={(v: string) => setDv((f) => ({ ...f, time: v }))} placeholder="۱۴:۳۰" />
              </div>
            </div>
            <p className="text-[11px] leading-5 text-stone-500">چک به وضعیت «تحویل شده» می‌رود و اطلاعات دریافت‌کننده و زمان تحویل در تاریخچهٔ چک ثبت می‌شود.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeliverDlg(null)}>انصراف</Button>
              <Button disabled={deliverBusy} onClick={() => void submitDeliver()} className="gap-2">
                {deliverBusy ? <I.loader size={15} className="animate-spin" /> : <I.send size={15} />} ثبت تحویل
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════ دیالوگ تنظیم سقف‌ها و پارامترهای چک (cheque:limits / cheque:split) ═══════════ */}
      <Dialog open={setOpen} onOpenChange={setSetOpen}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.settings size={16} /> سقف‌ها و پارامترهای چک</DialogTitle>
            <DialogDescription>
              سقف پرداخت روزانه/هفتگی/ماهانه و قواعد خرد کردن هوشمند — محاسبه‌گر و تقویم پرداخت از همین مقادیر پیروی می‌کنند.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2.5 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <p className="text-xs font-bold text-stone-700">سقف پرداخت (ریال)</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-500">روزانه</label>
                  <AmountInput value={String(lim.day || '')} onChange={(v) => setLim((f: any) => ({ ...f, day: v }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-500">هفتگی</label>
                  <AmountInput value={String(lim.week || '')} onChange={(v) => setLim((f: any) => ({ ...f, week: v }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-500">ماهانه</label>
                  <AmountInput value={String(lim.month || '')} onChange={(v) => setLim((f: any) => ({ ...f, month: v }))} />
                </div>
              </div>
              <p className="text-[10px] leading-4 text-stone-500">۰ یا خالی = بدون سقف. تجاوز از سقف‌ها در پیشنهاد هوشمند هشدار می‌گیرد.</p>
            </div>
            <div className="space-y-2.5 rounded-lg border border-teal-200 bg-teal-50/40 p-3">
              <p className="text-xs font-bold text-stone-700">خرد کردن هوشمند پرداخت</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-500">حداکثر تعداد چک (مبلغ متوسط)</label>
                  <Input dir="ltr" inputMode="numeric" className="num text-center" value={spl.mediumMax ? toFaDigits(String(spl.mediumMax)) : ''} onChange={(e: any) => setSpl((f: any) => ({ ...f, mediumMax: Number(toEnDigits(String(e.target.value)).replace(/[^\d]/g, '')) || 0 }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-500">حداکثر تعداد چک (مبلغ سنگین)</label>
                  <Input dir="ltr" inputMode="numeric" className="num text-center" value={spl.heavyMax ? toFaDigits(String(spl.heavyMax)) : ''} onChange={(e: any) => setSpl((f: any) => ({ ...f, heavyMax: Number(toEnDigits(String(e.target.value)).replace(/[^\d]/g, '')) || 0 }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-500">آستانهٔ مبلغ متوسط (ریال)</label>
                  <AmountInput value={String(spl.mediumThreshold || '')} onChange={(v) => setSpl((f: any) => ({ ...f, mediumThreshold: v }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-500">آستانهٔ مبلغ سنگین (ریال)</label>
                  <AmountInput value={String(spl.heavyThreshold || '')} onChange={(v) => setSpl((f: any) => ({ ...f, heavyThreshold: v }))} />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-[11px] text-stone-500">رند کردن مبالغ به (ریال)</label>
                  <AmountInput value={String(spl.roundTo || '')} onChange={(v) => setSpl((f: any) => ({ ...f, roundTo: v }))} />
                </div>
              </div>
              <p className="text-[10px] leading-4 text-stone-500">مبالغ بالای آستانه به چند چک خرد می‌شوند (تا سقف تعیین‌شده) و مبالغ به مضرب «رند» گرد می‌شوند.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSetOpen(false)}>انصراف</Button>
              <Button onClick={() => void saveSettings()} disabled={setSaving} className="gap-2">
                {setSaving ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />} ذخیره تنظیمات
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
