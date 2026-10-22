import { useState, useEffect, useMemo, api, qs, useShell, toast, cn, Button, Input, Textarea, Card, CardContent, CardHeader, CardTitle, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Checkbox, money, toman, fa, JALALI_MONTHS, WEEKDAY_FA, jalaliWeekday, addJalaliDays, formatJalali, formatJalaliLong, jalaliMonthLength, jalaliToDate, parseJalali, toEnDigits, toFaDigits, todayJalali, Icon, I } from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   finance/cheques — چک و تقویم پرداخت
   ۱) چک‌ها (دفتر چک + گردش وضعیت)
   ۲) محاسبه‌گر زمان چک (نوار تقویم + تعطیلی‌های ردشده)
   ۳) تقویم پرداخت (برنامه‌ها + سررسید چک‌ها + تعطیلات مذهبی/رسمی
      با پنل جزئیات روز در کنار تقویم + افزودن سریع برنامه)
   ───────────────────────────────────────────────────────────── */

const STATUS_LABELS: Record<string, string> = {
  PENDING_OWNER: 'در انتظار امضا',
  SIGNED: 'امضا شده',
  DELIVERED: 'تحویل شده',
  CLEARED: 'پرداخت شده',
  REJECTED: 'رد شده',
  RETURNED: 'برگشتی',
  BOUNCED: 'برگشت خورد',
}
const STATUS_CLASS: Record<string, string> = {
  PENDING_OWNER: 'border-amber-400 bg-amber-50 text-amber-800',
  SIGNED: 'border-teal-400 bg-teal-50 text-teal-800',
  DELIVERED: 'border-orange-400 bg-orange-50 text-orange-800',
  CLEARED: 'border-emerald-400 bg-emerald-50 text-emerald-800',
  REJECTED: 'border-rose-400 bg-rose-50 text-rose-800',
  RETURNED: 'border-rose-400 bg-rose-50 text-rose-800',
  BOUNCED: 'border-rose-500 bg-rose-100 text-rose-900',
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
}
/** گردش وضعیت — مطابق چانک زنده و PATCH موجود */
const TRANSITIONS: Record<string, { from: string[]; to: string; reason?: 'required' | 'optional' }> = {
  sign: { from: ['PENDING_OWNER'], to: 'SIGNED' },
  deliver: { from: ['SIGNED'], to: 'DELIVERED' },
  clear: { from: ['SIGNED', 'DELIVERED'], to: 'CLEARED' },
  reject: { from: ['PENDING_OWNER', 'SIGNED', 'DELIVERED'], to: 'REJECTED', reason: 'required' },
  bounce: { from: ['SIGNED', 'DELIVERED'], to: 'BOUNCED', reason: 'required' },
  return: { from: ['SIGNED', 'DELIVERED'], to: 'RETURNED', reason: 'optional' },
}
const FILTERS = [
  { key: '', label: 'همه وضعیت‌ها' },
  { key: 'PENDING_OWNER', label: 'در انتظار امضا' },
  { key: 'SIGNED', label: 'امضا شده' },
  { key: 'DELIVERED', label: 'تحویل شده' },
  { key: 'CLEARED', label: 'پرداخت شده' },
  { key: 'BOUNCED,REJECTED,RETURNED', label: 'برگشتی / رد شده' },
]
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


/* ───────── ورودی تاریخ شمسی (مثل چانک زنده + چیپ‌های سریع) ───────── */
function JInput({ value, onChange, quick = true }: { value: string; onChange: (v: string) => void; quick?: boolean }) {
  const [draft, setDraft] = useState(value)
  const [err, setErr] = useState('')
  useEffect(() => { setDraft(value) }, [value])
  function commit(raw: string) {
    const t = toEnDigits(raw).replace(/\//g, '-').trim()
    if (!t) { onChange(''); setErr(''); return }
    const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (!m) { setErr('قالب تاریخ: ۱۴۰۵/۰۷/۱۵'); return }
    const norm = `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`
    if (parseJalali(norm)) { setErr(''); onChange(norm) } else setErr('تاریخ نامعتبر است')
  }
  return (
    <div>
      <Input
        dir="ltr" value={draft} placeholder="1405/07/15"
        className="text-center font-mono"
        onChange={(e: any) => setDraft(e.target.value)}
        onBlur={(e: any) => commit(e.target.value)}
        onKeyDown={(e: any) => { if (e.key === 'Enter') commit(e.target.value) }}
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {quick && ([['امروز', 0], ['فردا', 1], ['یک هفته دیگر', 7]] as const).map(([label, n]) => (
          <button
            key={label} type="button"
            className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600 transition-colors hover:bg-stone-100"
            onClick={() => { const d = addJalaliDays(todayJalali(), Number(n)); setDraft(d); onChange(d); setErr('') }}
          >
            {label}
          </button>
        ))}
        {err && <span className="text-[11px] text-rose-600">{err}</span>}
      </div>
    </div>
  )
}

/* ───────── ورودی مبلغ (ریال) — نمایش فارسی، ورودی لاتین/فارسی ───────── */
function AmountInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = Number(value)
  return (
    <div>
      <Input
        dir="ltr" inputMode="numeric" placeholder="۰" className="num text-end"
        value={value ? toFaDigits(value) : ''}
        onChange={(e: any) => onChange(toEnDigits(String(e.target.value)).replace(/[^\d]/g, ''))}
      />
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

function StatCard({ title, value, amount, tone }: { title: string; value: number; amount?: number; tone: 'amber' | 'teal' | 'emerald' | 'rose' }) {
  const tones: Record<string, string> = {
    amber: 'border-amber-300 bg-amber-50 text-amber-900',
    teal: 'border-teal-300 bg-teal-50 text-teal-900',
    emerald: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    rose: 'border-rose-300 bg-rose-50 text-rose-900',
  }
  return (
    <div className={cn('rounded-xl border p-3', tones[tone])}>
      <p className="text-[11px] leading-4 opacity-80">{title}</p>
      <p className="mt-1 text-lg font-black">{fa(value)} فقره</p>
      {amount ? <p className="text-[11px] opacity-75">{money(amount)} ریال</p> : null}
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

  /* ── ثبت/ویرایش چک ── */
  const emptyForm = { number: '', amount: '', dueDate: '', recipient: '', selfIssued: true, sayadSerial: '', orderCode: '', note: '' }
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<any>(emptyForm)
  const [savingForm, setSavingForm] = useState(false)

  /* ── گردش وضعیت ── */
  const [busyId, setBusyId] = useState('')
  const [reasonDlg, setReasonDlg] = useState<{ row: any; action: string } | null>(null)
  const [reasonText, setReasonText] = useState('')
  const [reasonBusy, setReasonBusy] = useState(false)
  const [histRow, setHistRow] = useState<any>(null)

  /* ── محاسبه‌گر ── */
  const [days, setDays] = useState('45')
  const [defDays, setDefDays] = useState<number | null>(null)
  const [from, setFrom] = useState(today)
  const [calc, setCalc] = useState<any>(null)
  const [calcBusy, setCalcBusy] = useState(false)
  const [chosenDate, setChosenDate] = useState('')
  const [calcHols, setCalcHols] = useState<any[]>([]) // تعطیلی‌های بازه شروع → سررسید

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
  useEffect(() => { void loadAll(); void loadDefaults() }, [])
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
    setForm({ ...emptyForm, dueDate: due || today })
    setCreateOpen(true)
  }

  function openEdit(row: any) {
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
    })
    setCreateOpen(true)
  }

  async function submitForm(e?: any) {
    if (e && e.preventDefault) e.preventDefault()
    if (!form.number.trim()) return toast.error('شماره چک را وارد کنید')
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('مبلغ چک را وارد کنید')
    if (!parseJalali(form.dueDate)) return toast.error('تاریخ سررسید را وارد کنید')
    setSavingForm(true)
    const body = {
      number: form.number.trim(),
      amount,
      dueDate: form.dueDate,
      recipient: form.recipient.trim(),
      selfIssued: !!form.selfIssued,
      sayadSerial: form.sayadSerial.trim(),
      orderCode: form.orderCode.trim(),
      note: form.note.trim(),
    }
    const r = editing
      ? await api(`/api/cheques/${editing.id}`, { method: 'PATCH', body: { action: 'edit', ...body } })
      : await api('/api/cheques', { method: 'POST', body })
    setSavingForm(false)
    if (!r.ok) return toast.error(r.error || 'ثبت ناموفق بود')
    toast.success(editing ? 'چک ویرایش شد' : 'چک جدید ثبت شد (در انتظار امضای مدیرعامل)')
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
          <Button size="sm" variant="outline" className={sm} disabled={busyId === row.id} onClick={() => onAction(row, 'deliver')}>تحویل</Button>
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
          <Button size="sm" variant="ghost" className={sm} disabled={busyId === row.id} onClick={() => openEdit(row)}>ویرایش</Button>
        )}
        {row.status === 'PENDING_OWNER' && (
          <Button size="sm" variant="ghost" className={cn('text-rose-600', sm)} disabled={busyId === row.id} onClick={() => void removeCheque(row)} aria-label="حذف چک">
            <I.trash size={13} />
          </Button>
        )}
        <Button size="sm" variant="ghost" className={cn(sm, 'text-stone-500')} onClick={() => setHistRow(row)} aria-label={`تاریخچه چک ${row.number}`}>
          <I.history size={13} />
        </Button>
      </div>
    )
  }

  /* ───────────── محاسبه‌گر زمان چک ───────────── */

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

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="list" className="gap-1.5 py-2 text-xs sm:text-sm"><I.banknote size={15} /> چک‌ها</TabsTrigger>
          <TabsTrigger value="calc" className="gap-1.5 py-2 text-xs sm:text-sm"><I.timer size={15} /> محاسبه‌گر زمان چک</TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5 py-2 text-xs sm:text-sm"><I.calendar size={15} /> تقویم پرداخت</TabsTrigger>
        </TabsList>

        {/* ═══════════ تب ۱: دفتر چک ═══════════ */}
        <TabsContent value="list" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard title="در انتظار امضای مدیرعامل" value={stats?.pendingOwner?.count ?? 0} amount={stats?.pendingOwner?.amount} tone="amber" />
            <StatCard title="در گردش (امضا / تحویل)" value={stats?.inTransit?.count ?? 0} amount={stats?.inTransit?.amount} tone="teal" />
            <StatCard title="وصول‌شده این ماه" value={stats?.clearedThisMonth?.count ?? 0} amount={stats?.clearedThisMonth?.amount} tone="emerald" />
            <StatCard title="برگشتی و رد شده" value={stats?.bouncedRejected?.count ?? 0} amount={stats?.bouncedRejected?.amount} tone="rose" />
          </div>

          <Card>
            <CardContent className="flex flex-wrap items-center gap-2 p-4">
              {canFinance && (
                <Button onClick={() => openCreate()} className="gap-2">
                  <I.plus size={16} /> چک جدید
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
                          <TableCell className="max-w-40 truncate text-xs">{c.recipient || '—'}</TableCell>
                          <TableCell className="num text-xs text-stone-500">{c.writtenAt ? faSlash(c.writtenAt) : '—'}</TableCell>
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

        {/* ═══════════ تب ۲: محاسبه‌گر زمان چک ═══════════ */}
        <TabsContent value="calc" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><I.timer size={18} /> محاسبه‌گر زمان چک</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs text-stone-500">دوره چک (روز)</label>
                  <Input
                    dir="ltr" inputMode="numeric" className="num text-center"
                    value={days ? toFaDigits(days) : ''}
                    onChange={(e: any) => setDays(toEnDigits(String(e.target.value)).replace(/[^\d]/g, ''))}
                  />
                  <p className="mt-1 text-[11px] text-stone-400">
                    {defDays ? `پیش‌فرض سامانه: ${fa(defDays)} روز` : 'پیش‌فرض: ۴۵ روز'}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-stone-500">تاریخ شروع (شمسی)</label>
                  <JInput value={from} onChange={(v: string) => { setFrom(v); setCalc(null); setChosenDate(''); setCalcHols([]) }} />
                </div>
                <Button onClick={() => void runCalc()} disabled={calcBusy} className="gap-2">
                  {calcBusy ? <I.loader size={16} className="animate-spin" /> : <I.sparkles size={16} />} محاسبه
                </Button>
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

                <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-stone-500">
                  {WEEKDAY_FA.map((w) => <div key={w}>{w}</div>)}
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {cells.map((d, i) => {
                    if (!d) return <div key={`blank-${i}`} className="min-h-20 rounded-lg bg-stone-50" aria-hidden="true" />
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
                          dayHols.length ? `تعطیل: ${dayHols.map((h: any) => h.title).join(' و ')}` : '',
                          isFriday ? 'جمعه' : '',
                          dayPlans.length ? `${fa(dayPlans.length)} برنامه پرداخت` : '',
                          dayCheques.length ? `${fa(dayCheques.length)} چک سررسید` : '',
                        ].filter(Boolean).join(' — ')}
                        className={cn(
                          'min-h-20 cursor-pointer rounded-lg border p-1.5 text-start transition-colors hover:border-emerald-400',
                          isSel ? 'border-emerald-600 ring-2 ring-emerald-500/40'
                            : isToday ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/25'
                            : dayHols.length ? 'border-rose-300 bg-rose-50'
                            : isFriday ? 'border-rose-200 bg-rose-50/50'
                            : hasAny ? 'border-stone-200 bg-white'
                            : 'border-transparent bg-stone-50',
                        )}
                      >
                        <span className={cn('num text-xs font-bold', isToday ? 'text-emerald-700' : dayHols.length ? 'text-rose-700' : 'text-stone-700')}>{toFaDigits(Number(d.slice(8)))}</span>
                        {dayHols.length > 0 && <span className="mt-0.5 block truncate text-[9px] leading-tight text-rose-700">{dayHols[0]?.title}{dayHols.length > 1 ? ` +${toFaDigits(dayHols.length - 1)}` : ''}</span>}
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {dayHols.length > 0 && (
                            <span className="h-2 w-2 rounded-full bg-rose-500" title={dayHols.map((h: any) => h.title).join(' و ')} />
                          )}
                          {kinds.slice(0, 4).map((k: string) => (
                            <span key={k} className={cn('h-2 w-2 rounded-full', KIND_DOT[k] || 'bg-stone-400')} title={KIND_LABEL[k] || k} />
                          ))}
                          {dayCheques.length > 0 && (
                            <span className="rounded bg-amber-100 px-1 text-[9px] font-bold leading-4 text-amber-800">{fa(dayCheques.length)} چک</span>
                          )}
                          {dayPlans.length > kinds.length + (dayHols.length ? 1 : 0) && (
                            <span className="text-[9px] text-stone-400">+{fa(dayPlans.length - kinds.length - (dayHols.length ? 1 : 0))}</span>
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
              {editing ? 'فقط چک‌های «در انتظار امضا» قابل ویرایش هستند.' : 'چک دریافتنی از مشتری یا صادره فروشگاه ثبت می‌شود.'}
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
    </div>
  )
}
