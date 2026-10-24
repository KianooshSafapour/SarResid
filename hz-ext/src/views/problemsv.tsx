import {
  useState, useEffect, useMemo,
  api, qs, useShell, toast, cn,
  Button, Input, Textarea, Card, CardContent,
  Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Checkbox,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  JalaliDate, TimeInput, faSlash, jsDateToJalali,
  fa,
  toFaDigits, todayJalali, addJalaliDays,
  I,
} from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   tasks/problems — ثبت مشکلات و پیگیری
   ۱) آمار زنده + توزیع دسته‌بندی + فیلترهای وضعیت/دسته/شدت/شیفت/جستجو
   ۲) ثبت مشکل ساختاریافته: تاریخ ثبت (پیش‌فرض امروز)، دسته، شدت، محل،
      مسئول پیگیری، مهلت جلالی، ساعت (TimeInput)، شیفت (دکمه‌ای — بدون
      دراپ‌داون)، اقدام اولیه و کلید اطلاع‌رسانی پیامکی (مدیران)
   ۳) هشدار مهلت: هنگام باز شدن صفحه /api/problems/alerts صدا زده می‌شود
      و برای مشکلات نزدیک/سررسید/گذشتهٔ مهلت، اعلان و (در صورت فعال‌بودن
      کلید پیامک) پیامک به مسئول ارسال می‌شود — یک‌باره و idempotent
   ۴) کارت‌های فشرده در شبکهٔ دوستونه — کارت آخر در تعداد فرد تمام عرض را می‌گیرد
   ───────────────────────────────────────────────────────────── */

const MANAGERS = ['OWNER', 'GM', 'ADMIN', 'EXEC']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const CATEGORIES = [
  { key: 'equipment', label: 'تجهیزات' },
  { key: 'it', label: 'فناوری' },
  { key: 'supply', label: 'تأمین' },
  { key: 'cleaning', label: 'نظافت' },
  { key: 'product', label: 'کالا' },
  { key: 'staff', label: 'پرسنل' },
  { key: 'customer', label: 'مشتری' },
  { key: 'security', label: 'امنیت' },
  { key: 'other', label: 'سایر' },
]
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]))

const SEVERITIES: { key: string; label: string; badge: string; stripe: string; dot: string }[] = [
  { key: 'urgent', label: 'فوری', badge: 'border-rose-400 bg-rose-50 text-rose-800', stripe: 'bg-rose-600', dot: 'bg-rose-600' },
  { key: 'high', label: 'زیاد', badge: 'border-amber-400 bg-amber-50 text-amber-800', stripe: 'bg-amber-500', dot: 'bg-amber-500' },
  { key: 'normal', label: 'معمولی', badge: 'border-stone-300 bg-stone-100 text-stone-600', stripe: 'bg-slate-400', dot: 'bg-slate-400' },
  { key: 'low', label: 'کم', badge: 'border-stone-300 bg-stone-50 text-stone-500', stripe: 'bg-slate-200', dot: 'bg-slate-200' },
]

const STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: 'باز', cls: 'border-rose-300 bg-rose-50 text-rose-800' },
  IN_PROGRESS: { label: 'در حال بررسی', cls: 'border-amber-400 bg-amber-50 text-amber-800' },
  RESOLVED: { label: 'حل‌شده', cls: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))

function clockFa(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return toFaDigits(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`)
}

function dateTimeFa(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${faSlash(jsDateToJalali(d))} · ساعت ${clockFa(iso)}`
}

function shiftFa(s: string): string {
  return s === 'EVENING' ? 'عصر' : 'صبح'
}

function sevOf(key: string) {
  return SEVERITIES.find((s) => s.key === key) || SEVERITIES[2]
}

/** فاز مهلت نسبت به امروز: null | near(فردا) | today | past */
function duePhase(due: string | null | undefined, status: string): 'near' | 'today' | 'past' | null {
  if (!due || status === 'RESOLVED' || !DATE_RE.test(due)) return null
  const t = todayJalali()
  if (due < t) return 'past'
  if (due === t) return 'today'
  if (due === addJalaliDays(t, 1)) return 'near'
  return null
}

const DUE_CHIP: Record<string, { label: string; cls: string }> = {
  near: { label: 'فردا مهلت', cls: 'border-amber-300 bg-amber-50 text-amber-800' },
  today: { label: 'امروز مهلت', cls: 'border-rose-300 bg-rose-50 text-rose-800' },
  past: { label: 'مهلت گذشته', cls: 'border-rose-500 bg-rose-100 text-rose-800' },
}

/* ═══════════════ قطعات کوچک ═══════════════ */

function SevBadge({ severity }: { severity: string }) {
  const s = sevOf(severity)
  return <Badge variant="outline" className={cn('text-[10px]', s.badge)}>{s.label}</Badge>
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] || { label: status, cls: 'border-stone-300 bg-stone-100 text-stone-600' }
  return <Badge variant="outline" className={cn('text-[10px]', s.cls)}>{s.label}</Badge>
}

/* ═══════════════ نمای اصلی ═══════════════ */

export default function ProblemsView() {
  const { user, refreshBadges } = useShell()
  const isManager = !!user && MANAGERS.includes(String(user.role))

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [blocks, setBlocks] = useState<string[]>([])
  const [roster, setRoster] = useState<any[]>([])
  const [morningUnresolved, setMorningUnresolved] = useState<any[]>([])

  /* فیلترها */
  const [statusF, setStatusF] = useState('all')
  const [categoryF, setCategoryF] = useState('all')
  const [severityF, setSeverityF] = useState('all')
  const [shiftF, setShiftF] = useState('all')
  const [q, setQ] = useState('')

  /* دیالوگ ثبت مشکل */
  const [newOpen, setNewOpen] = useState(false)
  const [newBusy, setNewBusy] = useState(false)
  const [nf, setNf] = useState({
    problem: '', category: 'other', severity: 'normal', location: 'none',
    assigneeId: 'none', date: '', dueDate: '', time: '', shift: 'MORNING', action: '',
    smsAlert: false,
  })

  /* دیالوگ‌های اقدام */
  const [resolveDlg, setResolveDlg] = useState<any>(null)
  const [resolveBusy, setResolveBusy] = useState(false)
  const [actionTaken, setActionTaken] = useState('')
  const [assignDlg, setAssignDlg] = useState<any>(null)
  const [assignBusy, setAssignBusy] = useState(false)
  const [assignTo, setAssignTo] = useState('none')
  const [busyId, setBusyId] = useState('')

  useEffect(() => {
    /* یک‌بار در ابتدا: هشدارهای مهلت + فهرست پرسنل + بنر مشکلات صبح */
    void checkAlerts()
    void loadRoster()
    if (isManager) void loadMorning()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusF, categoryF, severityF, shiftF])

  /* ───────── بارگذاری ───────── */

  async function load() {
    setLoading(true)
    const r = await api(`/api/problems${qs({
      status: statusF === 'all' ? '' : statusF,
      category: categoryF === 'all' ? '' : categoryF,
      severity: severityF === 'all' ? '' : severityF,
      shift: shiftF === 'all' ? '' : shiftF,
    })}`)
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت مشکلات'); return }
    setItems(r.data?.items || [])
    setStats(r.data?.stats || null)
    setBlocks(Array.isArray(r.data?.blocks) ? r.data.blocks : [])
    // هشدارهای مهلت هم در همین فراخوانی ارزیابی می‌شوند (سمت سرور) — اگر
    // اعلانی ساخته شد، شمارندهٔ زنگ به‌روز شود
    if (Number(r.data?.alerts?.created) > 0) refreshBadges?.()
  }

  async function loadRoster() {
    const r = await api('/api/auth/roster')
    if (r.ok) setRoster((r.data?.users || []).filter((u: any) => u.active !== false))
  }

  /** هشدارهای مهلت رسیدگی — بی‌صدا؛ اگر اعلانی ساخته شد شمارندهٔ زنگ به‌روز می‌شود */
  async function checkAlerts() {
    const r = await api('/api/problems/alerts')
    if (r.ok && Number(r.data?.created) > 0) refreshBadges?.()
  }

  /** مشکلات حل‌نشدهٔ شیفت صبح امروز — بنر مدیر شیفت عصر (قرارداد ارجاع) */
  async function loadMorning() {
    const r = await api(`/api/staff-checks${qs({ date: todayJalali(), shift: 'EVENING' })}`)
    if (r.ok) setMorningUnresolved(r.data?.unresolvedMorning || [])
  }

  /* ───────── جستجوی سمت کاربر ───────── */

  const filtered = useMemo(() => {
    const needle = q.trim()
    if (!needle) return items
    return items.filter((p: any) =>
      String(p.problem || '').indexOf(needle) > -1 ||
      String(p.location || '').indexOf(needle) > -1 ||
      String(p.categoryLabel || '').indexOf(needle) > -1)
  }, [items, q])

  const today = todayJalali()

  /* ───────── ثبت مشکل جدید ───────── */

  function openNew() {
    const hour = new Date().getHours()
    setNf({
      problem: '', category: 'other', severity: 'normal', location: 'none',
      assigneeId: 'none', date: todayJalali(), dueDate: '', time: '',
      shift: hour >= 14 ? 'EVENING' : 'MORNING', action: '', smsAlert: false,
    })
    setNewOpen(true)
  }

  async function submitNew() {
    const problem = nf.problem.trim()
    if (problem.length < 3) return toast.error('شرح مشکل را وارد کنید (حداقل ۳ کاراکتر)')
    if (!nf.date || !DATE_RE.test(nf.date)) return toast.error('تاریخ وقوع مشکل را از تقویم انتخاب کنید')
    if (nf.time && !TIME_RE.test(nf.time)) return toast.error('ساعت وقوع را به شکل ۱۸:۳۰ وارد کنید')
    if (nf.dueDate && !DATE_RE.test(nf.dueDate)) return toast.error('مهلت رسیدگی را از تقویم انتخاب کنید')

    const body: any = {
      problem,
      category: nf.category,
      severity: nf.severity,
      shift: nf.shift,
      date: nf.date,
    }
    if (nf.location !== 'none') body.location = nf.location
    if (isManager && nf.assigneeId !== 'none') body.assigneeId = nf.assigneeId
    if (nf.dueDate) body.dueDate = nf.dueDate
    if (nf.time) body.time = nf.time
    if (nf.action.trim()) body.action = nf.action.trim()
    if (isManager && nf.smsAlert && nf.assigneeId !== 'none') body.smsAlert = true

    setNewBusy(true)
    const r = await api('/api/problems', { method: 'POST', body })
    setNewBusy(false)
    if (!r.ok) return toast.error(r.error || 'ثبت مشکل انجام نشد')
    toast.success(
      isManager && nf.assigneeId !== 'none'
        ? 'مشکل ثبت و به مسئول پیگیری اطلاع‌رسانی شد'
        : 'مشکل ثبت شد',
    )
    setNewOpen(false)
    refreshBadges?.()
    void load()
    if (isManager) void loadMorning()
  }

  /* ───────── جریان رسیدگی ───────── */

  const canAct = (p: any) => isManager || (!!p.assigneeId && p.assigneeId === user?.id)

  async function patch(p: any, body: Record<string, any>, okMsg: string) {
    setBusyId(p.id)
    const r = await api(`/api/problems/${p.id}`, { method: 'PATCH', body })
    setBusyId('')
    if (!r.ok) { toast.error(r.error || 'عملیات انجام نشد'); return false }
    toast.success(okMsg)
    refreshBadges?.()
    void load()
    if (isManager) void loadMorning()
    return true
  }

  function openResolve(p: any) {
    setActionTaken('')
    setResolveDlg(p)
  }

  async function submitResolve() {
    if (!resolveDlg) return
    if (!actionTaken.trim()) return toast.error('شرح اقدام انجام‌شده الزامی است')
    const ok = await patch(resolveDlg, { action: 'resolve', actionTaken: actionTaken.trim() }, 'مشکل حل شد')
    if (ok) setResolveDlg(null)
  }

  function openAssign(p: any) {
    setAssignTo(p.assigneeId || 'none')
    setAssignDlg(p)
  }

  async function submitAssign() {
    if (!assignDlg) return
    if (assignTo === 'none') return toast.error('مسئول پیگیری را انتخاب کنید')
    const ok = await patch(assignDlg, { action: 'assign', assigneeId: assignTo }, 'مشکل ارجاع شد و به مسئول اطلاع‌رسانی شد')
    if (ok) setAssignDlg(null)
  }

  /** کلید اطلاع‌رسانی پیامکی (مدیران) */
  async function toggleSms(p: any) {
    setBusyId(p.id)
    const r = await api(`/api/problems/${p.id}`, {
      method: 'PATCH',
      body: { action: 'smsAlert', enabled: !p.smsAlert },
    })
    setBusyId('')
    if (!r.ok) { toast.error(r.error || 'تغییر تنظیم پیامک انجام نشد'); return }
    toast.success(!p.smsAlert ? 'اطلاع‌رسانی پیامکی به مسئول فعال شد' : 'اطلاع‌رسانی پیامکی خاموش شد')
    setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, smsAlert: !p.smsAlert } : x)))
  }

  /* ───────── رندر ───────── */

  const byCategory: Record<string, number> = stats?.byCategory || {}
  const hasFilter = statusF !== 'all' || categoryF !== 'all' || severityF !== 'all' || shiftF !== 'all' || q.trim() !== ''
  const odd = filtered.length % 2 === 1

  return (
    <div className="space-y-4">
      {/* ═══════ بنر مشکلات حل‌نشدهٔ شیفت صبح (مدیر عصر) ═══════ */}
      {isManager && morningUnresolved.length > 0 && (
        <div className="rounded-xl border border-amber-400 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <I.alertTriangle size={22} className="text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-800">
                {fa(morningUnresolved.length)} مشکل حل‌نشدهٔ شیفت صبح — نیازمند توجه شما
              </p>
              <ul className="mt-1 space-y-0.5">
                {morningUnresolved.slice(0, 3).map((p: any) => (
                  <li key={p.id} className="truncate text-xs text-amber-700">• {toFaDigits(p.title)}{p.detail ? ` — ${toFaDigits(p.detail)}` : ''}</li>
                ))}
                {morningUnresolved.length > 3 ? (
                  <li className="text-xs text-amber-700">و {fa(morningUnresolved.length - 3)} مورد دیگر…</li>
                ) : null}
              </ul>
            </div>
            <Button
              variant="outline" size="sm"
              onClick={() => { setStatusF('OPEN'); setShiftF('MORNING'); setCategoryF('all'); setSeverityF('all'); setQ('') }}
            >
              <I.filter size={13} className="ml-1" /> مشاهده در فهرست
            </Button>
          </div>
        </div>
      )}

      {/* ═══════ آمار و فیلترها ═══════ */}
      <Card>
        <CardContent className="space-y-3 p-4">
          {/* ردیف وضعیت‌ها */}
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              ['OPEN', 'باز', stats?.open],
              ['IN_PROGRESS', 'در حال بررسی', stats?.inProgress],
              ['RESOLVED', 'حل‌شده', stats?.resolved],
            ] as const).map(([key, label, n]) => (
              <button
                key={key} type="button"
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  STATUS[key].cls,
                  statusF === key ? 'ring-2 ring-offset-2 ring-emerald-400' : 'opacity-80 hover:opacity-100',
                )}
                onClick={() => setStatusF(statusF === key ? 'all' : key)}
              >
                {label} <span className="num font-black">{fa(Number(n) || 0)}</span>
              </button>
            ))}
            <span className="mr-auto" />
            <Button size="sm" onClick={openNew}><I.plus size={14} className="ml-1" /> ثبت مشکل جدید</Button>
          </div>

          {/* توزیع دسته‌بندی */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-stone-400">دسته‌ها:</span>
            {CATEGORIES.filter((c) => (byCategory[c.key] || 0) > 0).map((c) => (
              <button
                key={c.key} type="button"
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                  categoryF === c.key
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                    : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-emerald-400',
                )}
                onClick={() => setCategoryF(categoryF === c.key ? 'all' : c.key)}
              >
                {c.label} <span className="num font-bold">{fa(byCategory[c.key] || 0)}</span>
              </button>
            ))}
            {CATEGORIES.every((c) => !(byCategory[c.key] > 0)) ? (
              <span className="text-[11px] text-stone-400">هنوز مشکلی ثبت نشده است</span>
            ) : null}
          </div>

          {/* نوار فیلتر */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-36 flex-1">
              <label className="mb-1 block text-[11px] font-medium text-stone-500">جستجو</label>
              <div className="relative">
                <I.search size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-stone-400" />
                <Input className="pr-8 text-sm" placeholder="جستجو در شرح مشکل / محل…" value={q} onChange={(e: any) => setQ(e.target.value)} />
              </div>
            </div>
            <div className="w-32">
              <label className="mb-1 block text-[11px] font-medium text-stone-500">وضعیت</label>
              <Select value={statusF} onValueChange={setStatusF}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="OPEN">باز</SelectItem>
                  <SelectItem value="IN_PROGRESS">در حال بررسی</SelectItem>
                  <SelectItem value="RESOLVED">حل‌شده</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <label className="mb-1 block text-[11px] font-medium text-stone-500">دسته</label>
              <Select value={categoryF} onValueChange={setCategoryF}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  {CATEGORIES.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-28">
              <label className="mb-1 block text-[11px] font-medium text-stone-500">شدت</label>
              <Select value={severityF} onValueChange={setSeverityF}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      <span className="flex items-center gap-1.5"><span className={cn('inline-block h-2 w-2 rounded-full', s.dot)} />{s.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-28">
              <label className="mb-1 block text-[11px] font-medium text-stone-500">شیفت</label>
              <Select value={shiftF} onValueChange={setShiftF}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="MORNING">صبح</SelectItem>
                  <SelectItem value="EVENING">عصر</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9" title="به‌روزرسانی و بررسی هشدارها"
              onClick={() => { void load(); void checkAlerts(); if (isManager) void loadMorning() }}>
              <I.refresh size={14} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ═══════ فهرست مشکلات — دو ستونه؛ کارت آخر در تعداد فرد تمام‌عرض ═══════ */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl border border-stone-200 bg-stone-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-stone-400">
            <I.circleDot size={28} className="mx-auto mb-2 text-stone-400" />
            {hasFilter ? 'مشکلی با این فیلترها یافت نشد' : 'هنوز مشکلی ثبت نشده است — اولین مشکل را ثبت کنید'}
            {hasFilter ? (
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={() => { setStatusF('all'); setCategoryF('all'); setSeverityF('all'); setShiftF('all'); setQ('') }}>
                  <I.x size={13} className="ml-1" /> حذف فیلترها
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {filtered.map((p: any, i: number) => {
            const s = sevOf(p.severity)
            const phase = duePhase(p.dueDate, p.status)
            const dueChip = phase ? DUE_CHIP[phase] : null
            const assignable = isManager && p.status !== 'RESOLVED'
            const last = odd && i === filtered.length - 1
            return (
              <Card key={p.id} className={cn('relative overflow-hidden', last && 'xl:col-span-2')}>
                {/* نوار شدت */}
                <span className={cn('absolute inset-y-0 right-0 w-1.5', s.stripe)} aria-hidden="true" />
                <CardContent className="p-4 pr-5">
                  {/* ردیف بالا: دسته + محل + ارجاع + وضعیت */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">{CATEGORY_LABEL[p.category] || p.categoryLabel || 'سایر'}</Badge>
                    {p.location ? (
                      <span className="flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] text-stone-600">
                        <I.store size={10} /> {p.location}
                      </span>
                    ) : null}
                    {p.escalated ? (
                      <Badge variant="outline" className="border-amber-400 bg-amber-50 text-[10px] text-amber-800">ارجاع به شیفت عصر</Badge>
                    ) : null}
                    {dueChip ? (
                      <Badge variant="outline" className={cn('text-[10px]', dueChip.cls)}>
                        <I.timer size={10} className="ml-1" /> {dueChip.label}
                      </Badge>
                    ) : null}
                    <span className="mr-auto flex items-center gap-1.5">
                      <SevBadge severity={p.severity} />
                      <StatusBadge status={p.status} />
                    </span>
                  </div>

                  {/* شرح مشکل */}
                  <p className="mt-2 whitespace-pre-line break-words text-sm font-bold text-stone-700">{p.problem}</p>
                  {p.status !== 'RESOLVED' && p.action ? (
                    <p className="mt-1 text-xs text-stone-500">اقدام اولیه: {p.action}</p>
                  ) : null}

                  {/* متادیتا */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-500">
                    <span className="num flex items-center gap-1" dir="rtl"><I.calendar size={11} /> {faSlash(p.date)}</span>
                    {p.time ? <span className="num flex items-center gap-1"><I.clock size={11} /> {toFaDigits(p.time)}</span> : null}
                    <span>شیفت {shiftFa(p.shift)}</span>
                    {p.reporter ? (
                      <span className="flex items-center gap-1"><I.user size={11} /> {p.reporter.honorific ? `${p.reporter.honorific} ` : ''}{p.reporter.fullName}</span>
                    ) : null}
                    {p.assignee ? (
                      <span className="flex items-center gap-1 font-medium text-teal-700"><I.userCheck size={11} /> {p.assignee.fullName}</span>
                    ) : null}
                    {p.dueDate ? (
                      <span className={cn('num flex items-center gap-1', phase === 'past' ? 'font-bold text-rose-600' : 'text-stone-500')} dir="rtl">
                        <I.timer size={11} /> مهلت {faSlash(p.dueDate)}
                      </span>
                    ) : null}
                  </div>

                  {/* اطلاع‌رسانی پیامکی */}
                  {(isManager && p.assigneeId && p.status !== 'RESOLVED') ? (
                    <div className="mt-2">
                      <button
                        type="button" disabled={busyId === p.id}
                        onClick={() => void toggleSms(p)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition-colors disabled:opacity-50',
                          p.smsAlert
                            ? 'border-teal-200 bg-teal-50 text-teal-700'
                            : 'border-stone-200 bg-white text-stone-500 hover:bg-stone-100',
                        )}
                        title="یادآوری پیامکی به مسئول نزدیک مهلت و پس از آن"
                      >
                        <I.send size={11} />
                        {p.smsAlert ? 'پیامک یادآوری: روشن' : 'پیامک یادآوری: خاموش'}
                      </button>
                    </div>
                  ) : p.smsAlert ? (
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[10.5px] font-medium text-teal-700">
                        <I.send size={11} /> پیامک یادآوری فعال
                      </span>
                    </div>
                  ) : null}

                  {/* نمایش حل */}
                  {p.status === 'RESOLVED' ? (
                    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-700">
                      <span className="font-bold"><I.check size={11} className="ml-0.5 inline" /> حل شد</span>
                      {p.resolvedAt ? ` — ${dateTimeFa(p.resolvedAt)}` : ''}
                      {p.action ? <span className="mt-0.5 block">اقدام انجام‌شده: {p.action}</span> : null}
                    </div>
                  ) : null}

                  {/* اقدام‌ها */}
                  {canAct(p) && p.status !== 'RESOLVED' ? (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-dashed pt-2.5">
                      {p.status === 'OPEN' ? (
                        <Button size="sm" disabled={busyId === p.id} onClick={() => patch(p, { status: 'IN_PROGRESS' }, 'بررسی مشکل شروع شد')}>
                          {busyId === p.id ? <I.loader size={13} className="ml-1 animate-spin" /> : <I.play size={13} className="ml-1" />} شروع بررسی
                        </Button>
                      ) : null}
                      {p.status === 'IN_PROGRESS' ? (
                        <Button size="sm" disabled={busyId === p.id} onClick={() => openResolve(p)}>
                          <I.check size={13} className="ml-1" /> ثبت اقدام و حل
                        </Button>
                      ) : null}
                      {assignable ? (
                        <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => openAssign(p)}>
                          <I.send size={13} className="ml-1" /> ارجاع به
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ═══════ دیالوگ ثبت مشکل جدید ═══════ */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <I.alertTriangle size={16} className="text-amber-600" /> ثبت مشکل جدید
            </DialogTitle>
            <DialogDescription className="text-xs">
              شرح مشکل را دقیق بنویسید؛ با انتخاب مسئول و مهلت، پیگیری ساختاریافته انجام می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">شرح مشکل *</label>
              <Input
                className="text-sm" placeholder="مثلاً: چراغ راهروی یخچال‌ها سوخته است"
                value={nf.problem} onChange={(e: any) => setNf((f) => ({ ...f, problem: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">دسته‌بندی</label>
                <Select value={nf.category} onValueChange={(v: string) => setNf((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">شدت</label>
                <Select value={nf.severity} onValueChange={(v: string) => setNf((f) => ({ ...f, severity: v }))}>
                  <SelectTrigger className={cn('w-full font-medium', sevOf(nf.severity).badge)}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((sv) => (
                      <SelectItem key={sv.key} value={sv.key}>
                        <span className="flex items-center gap-1.5"><span className={cn('inline-block h-2 w-2 rounded-full', sv.dot)} />{sv.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">محل وقوع</label>
                <Select value={nf.location} onValueChange={(v: string) => setNf((f) => ({ ...f, location: v }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">نامشخص</SelectItem>
                    {blocks.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {isManager ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-600">مسئول پیگیری</label>
                  <Select value={nf.assigneeId} onValueChange={(v: string) => setNf((f) => ({ ...f, assigneeId: v }))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون مسئول (پیگیری آزاد)</SelectItem>
                      {roster.map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>{u.honorific ? `${u.honorific} ` : ''}{u.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">تاریخ وقوع مشکل (پیش‌فرض امروز)</label>
                <JalaliDate value={nf.date} onChange={(v: string) => setNf((f) => ({ ...f, date: v }))} quickChips={[{ label: 'امروز', deltaDays: 0 }, { label: 'دیروز', deltaDays: -1 }]} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">مهلت رسیدگی</label>
                <JalaliDate value={nf.dueDate} onChange={(v: string) => setNf((f) => ({ ...f, dueDate: v }))} quickChips={[{ label: 'امروز', deltaDays: 0 }, { label: 'فردا', deltaDays: 1 }, { label: 'هفتهٔ آینده', deltaDays: 7 }]} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">ساعت وقوع</label>
                <TimeInput value={nf.time} onChange={(v: string) => setNf((f) => ({ ...f, time: v }))} />
              </div>
            </div>

            {/* شیفت — دکمه‌های دوگانهٔ راست‌به‌چپ (به‌جای دراپ‌داون) */}
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">شیفت وقوع</label>
                <div className="grid w-44 grid-cols-2 gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1" dir="rtl">
                  <button
                    type="button"
                    onClick={() => setNf((f) => ({ ...f, shift: 'MORNING' }))}
                    className={cn('rounded-md py-1.5 text-xs font-medium transition-colors',
                      nf.shift === 'MORNING' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500 hover:bg-stone-100')}
                  >
                    صبح
                  </button>
                  <button
                    type="button"
                    onClick={() => setNf((f) => ({ ...f, shift: 'EVENING' }))}
                    className={cn('rounded-md py-1.5 text-xs font-medium transition-colors',
                      nf.shift === 'EVENING' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500 hover:bg-stone-100')}
                  >
                    عصر
                  </button>
                </div>
              </div>
              {isManager && nf.assigneeId !== 'none' ? (
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-stone-600">اطلاع‌رسانی</label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 transition-colors hover:bg-stone-100" dir="rtl">
                    <Checkbox
                      checked={nf.smsAlert}
                      onCheckedChange={(v: any) => setNf((f) => ({ ...f, smsAlert: v === true }))}
                    />
                    <span className="text-xs font-medium text-stone-700">اطلاع‌رسانی پیامکی به مسئول</span>
                  </label>
                  <p className="mt-1 text-[10.5px] text-stone-400">یک روز قبل از مهلت، روز مهلت و پس از آن، یادآوری پیامکی به موبایل مسئول ارسال می‌شود (در صورت داشتن شمارهٔ معتبر).</p>
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">توضیح اقدام اولیه (اختیاری)</label>
              <Textarea
                rows={2} className="text-sm" placeholder="مثلاً: برق راهرو قطع و از تأسیسات درخواست تعویض لامپ شد"
                value={nf.action} onChange={(e: any) => setNf((f) => ({ ...f, action: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>انصراف</Button>
            <Button onClick={submitNew} disabled={newBusy}>
              {newBusy ? <I.loader size={14} className="ml-1 animate-spin" /> : <I.send size={14} className="ml-1" />}
              {newBusy ? 'در حال ثبت…' : 'ثبت مشکل'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ دیالوگ ثبت اقدام و حل ═══════ */}
      <Dialog open={!!resolveDlg} onOpenChange={(o: boolean) => { if (!o) setResolveDlg(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <I.check size={16} className="text-emerald-600" /> ثبت اقدام و حل مشکل
            </DialogTitle>
            <DialogDescription className="text-xs">
              {resolveDlg ? resolveDlg.problem : ''}
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">اقدام انجام‌شده *</label>
            <Textarea
              rows={4} className="text-sm" placeholder="چه کاری انجام شد؟ (مثلاً: لامپ تعویض شد و تست عملکرد گرفته شد)"
              value={actionTaken} onChange={(e: any) => setActionTaken(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDlg(null)}>انصراف</Button>
            <Button onClick={submitResolve} disabled={resolveBusy}>
              {resolveBusy ? <I.loader size={14} className="ml-1 animate-spin" /> : <I.check size={14} className="ml-1" />}
              {resolveBusy ? 'در حال ثبت…' : 'ثبت و حل نهایی'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ دیالوگ ارجاع ═══════ */}
      <Dialog open={!!assignDlg} onOpenChange={(o: boolean) => { if (!o) setAssignDlg(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <I.send size={16} className="text-teal-600" /> ارجاع مشکل
            </DialogTitle>
            <DialogDescription className="text-xs">
              {assignDlg ? assignDlg.problem : ''}
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">مسئول پیگیری *</label>
            <Select value={assignTo} onValueChange={setAssignTo}>
              <SelectTrigger className="w-full"><SelectValue placeholder="انتخاب کارمند" /></SelectTrigger>
              <SelectContent>
                {roster.map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>{u.honorific ? `${u.honorific} ` : ''}{u.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-[11px] text-stone-500">به مسئول انتخاب‌شده اطلاع‌رسانی می‌شود.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDlg(null)}>انصراف</Button>
            <Button onClick={submitAssign} disabled={assignBusy}>
              {assignBusy ? <I.loader size={14} className="ml-1 animate-spin" /> : <I.send size={14} className="ml-1" />}
              {assignBusy ? 'در حال ارجاع…' : 'ارجاع'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
