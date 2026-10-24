import {
  useState, useEffect, useMemo, api, qs, useShell, toast, cn,
  Button, Input, Textarea, Card, CardContent, CardHeader, CardTitle, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  JalaliDate, TimeInput, faSlash,
  fa, toEnDigits, todayJalali, addJalaliDays, formatJalali, I,
} from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   tasks/tasks — «وظایف من و تیم» (چیدمان دوستونهٔ فشرده)
   ستون راست: وظایف من (ردیف‌های فشردهٔ بازشو) + آرشیو من
   ستون چپ : وظایف تیم (گروه‌بندی بر اساس شخص — مدیران)
              / تاریخچهٔ کامل من (سایر کاربران)
   نوار بالا: چیپ‌های خلاصه + جست‌وجو + وضعیت + شخص + دستور کار جدید (مدیران)
   API: GET/POST /api/task-orders · PATCH /api/task-orders/[id]
   ───────────────────────────────────────────────────────────── */

const MANAGER_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC']

const CATEGORIES = [
  { key: 'general', label: 'عمومی' },
  { key: 'layout', label: 'چیدمان' },
  { key: 'cleanliness', label: 'نظافت' },
  { key: 'dates', label: 'کنترل تاریخ' },
  { key: 'labels', label: 'برچسب‌ها' },
  { key: 'receiving', label: 'دریافت کالا' },
  { key: 'customer', label: 'خدمات مشتری' },
  { key: 'other', label: 'سایر' },
] as const

const PRIORITIES = [
  { key: 'low', label: 'کم', cls: 'bg-stone-100 text-stone-600 border-stone-200', stripe: 'border-stone-300 border-e bg-stone-50' },
  { key: 'normal', label: 'عادی', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', stripe: 'bg-emerald-400' },
  { key: 'high', label: 'مهم', cls: 'bg-amber-100 text-amber-700 border-amber-200', stripe: 'bg-amber-400' },
  { key: 'urgent', label: 'فوری', cls: 'bg-rose-100 text-rose-700 border-rose-200', stripe: 'bg-rose-500' },
] as const

const STATUS_FA: Record<string, string> = {
  assigned: 'در انتظار شروع',
  in_progress: 'در حال انجام',
  blocked: 'متوقف (مشکل)',
  done: 'انجام‌شده',
  verified: 'تأیید‌شده',
  cancelled: 'لغو‌شده',
}

const STATUS_CLS: Record<string, string> = {
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-600 border-rose-200',
  blocked: 'bg-amber-50 text-amber-700 border-amber-200',
  done: 'bg-teal-50 text-teal-700 border-teal-200',
  assigned: 'bg-stone-100 text-stone-600 border-stone-200',
  in_progress: 'bg-sky-50 text-sky-700 border-sky-200',
}

/** وضعیت پس از هر اکشن — برای به‌روزرسانی خوش‌بینانهٔ فهرست */
const NEXT_STATUS: Record<string, string> = {
  start: 'in_progress', done: 'done', block: 'blocked', verify: 'verified', cancel: 'cancelled',
}

const ACTIVE = ['assigned', 'in_progress', 'blocked']
const CLOSED = ['done', 'verified', 'cancelled']

/* ── helpers ─────────────────────────────────────────────── */

/** ساعت تهران به شکل HH:MM */
function nowHM(): string {
  const d = new Date(Date.now() + 3.5 * 3600000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** آیا سررسید گذشته؟ (مقایسهٔ تاریخ و ساعت با امروز تهران) */
function isPastDue(o: any): boolean {
  if (!o?.dueDate) return false
  const due = toEnDigits(String(o.dueDate)).trim().replace(/\//g, '-')
  const t = todayJalali()
  if (due < t) return true
  if (due > t) return false
  if (o.dueTime) {
    const tm = toEnDigits(String(o.dueTime)).trim()
    return /^\d{1,2}:\d{2}$/.test(tm) ? tm < nowHM() : false
  }
  return false
}

/** ISO → تاریخ شمسی با ممیز ۱۴۰۵/۰۷/۲۸ */
function jDate(v: any): string {
  try {
    const d = new Date(v)
    return isNaN(d.getTime()) ? '' : faSlash(formatJalali(d))
  } catch {
    return ''
  }
}

function prioOf(key?: string) {
  return PRIORITIES.find((x) => x.key === (key || 'normal')) ?? PRIORITIES[1]
}

function catOf(key?: string) {
  return CATEGORIES.find((x) => x.key === (key || 'general')) ?? CATEGORIES[0]
}

/* ── atoms ───────────────────────────────────────────────── */

function PrioBadge({ v }: { v?: string }) {
  const p = prioOf(v)
  return <span className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-medium', p.cls)}>{p.label}</span>
}

function StatusBadge({ v }: { v?: string }) {
  return <span className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-medium', STATUS_CLS[v || ''] || STATUS_CLS.assigned)}>{STATUS_FA[v || ''] || v}</span>
}

function DueChip({ o }: { o: any }) {
  if (!o.dueDate) return null
  const past = ACTIVE.includes(o.status) && isPastDue(o)
  return (
    <span className={cn('num inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px]', past ? 'bg-rose-100 font-bold text-rose-700' : 'bg-stone-100 text-stone-600')} dir="rtl">
      <I.timer size={11} /> {faSlash(o.dueDate)}{o.dueTime ? ` · ${fa(o.dueTime)}` : ''}
      {past ? ' (گذشته)' : ''}
    </span>
  )
}

/* ── ردیف فشردهٔ بازشوی یک دستور کار ─────────────────────── */

function OrderRow({ o, user, isManager, mine, onAction }: {
  o: any
  user: any
  isManager: boolean
  mine: boolean
  onAction: (o: any, action: string, extra?: Record<string, any>) => void
}) {
  const [open, setOpen] = useState(false)
  const p = prioOf(o.priority)
  const isAssignee = !!user && o.assigneeId === user.id
  const isSender = !!user && o.createdById === user.id
  const sender = o.sender?.name ?? o.createdByName ?? '—'
  const assignee = o.assignee?.name ?? o.assigneeName ?? '—'
  const canVerify = (isManager || isSender) && o.status === 'done'
  const canCancel = isManager && !['verified', 'cancelled'].includes(o.status)
  const hasActions = (isAssignee && ACTIVE.includes(o.status)) || canVerify || canCancel

  return (
    <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white">
      <span className={cn('absolute inset-y-0 right-0 w-1', p.stripe)} aria-hidden="true" />
      <div className="p-2.5 pr-3.5">
        {/* خط ۱: نشان‌ها + سررسید */}
        <div className="flex flex-wrap items-center gap-1.5">
          <PrioBadge v={o.priority} />
          <StatusBadge v={o.status} />
          <DueChip o={o} />
          {o.relatedBlock ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">
              <I.store size={10} /> {o.relatedBlock}
            </span>
          ) : null}
          <span className="mr-auto" />
          <button
            type="button" onClick={() => setOpen((v) => !v)} aria-label={open ? 'بستن جزئیات' : 'نمایش جزئیات'}
            className="rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100"
          >
            <I.chevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
          </button>
        </div>
        {/* خط ۲: عنوان + ارجاع‌ها */}
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 block w-full text-right">
          <span className="text-[13px] font-bold leading-5 text-stone-700">{o.title}</span>
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] text-stone-400">
          <span>فرستنده: {sender}</span>
          {!mine ? <span>گیرنده: {assignee}</span> : null}
          <span>{catOf(o.category).label}</span>
          <span className="num" dir="rtl">{jDate(o.createdAt)}</span>
        </div>

        {/* جزئیات بازشو */}
        {open ? (
          <div className="mt-2 space-y-2 rounded-lg bg-stone-50 p-2.5">
            {o.instructions ? (
              <div>
                <div className="mb-0.5 text-[10px] font-medium text-stone-500">نحوه انجام</div>
                <p className="text-[11px] leading-5 text-stone-700 whitespace-pre-line">{o.instructions}</p>
              </div>
            ) : null}
            {o.requirements ? (
              <div>
                <div className="mb-0.5 text-[10px] font-medium text-stone-500">ملزومات</div>
                <p className="text-[11px] leading-5 text-stone-700">{o.requirements}</p>
              </div>
            ) : null}
            {o.status === 'blocked' && o.blockedReason ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                <div className="mb-0.5 flex items-center gap-1 text-[10px] font-bold text-amber-700"><I.alertTriangle size={11} /> مشکل اعلام‌شده</div>
                <p className="text-[11px] leading-5 text-amber-800">{o.blockedReason}</p>
              </div>
            ) : null}
            {o.progressNote && o.status !== 'assigned' ? (
              <div className="text-[10.5px] text-stone-500"><I.check size={11} className="inline align-middle text-emerald-600" /> یادداشت پیشرفت: {o.progressNote}</div>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-stone-400">
              {o.doneAt ? <span className="num" dir="rtl">انجام: {jDate(o.doneAt)}</span> : null}
              {o.verifiedAt ? <span className="num" dir="rtl">تأیید: {jDate(o.verifiedAt)}{(o.verifiedBy?.name || o.verifiedByName) ? ` (${o.verifiedBy?.name || o.verifiedByName})` : ''}</span> : null}
            </div>
          </div>
        ) : null}

        {/* اقدام‌ها */}
        {hasActions ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-dashed border-stone-200 pt-2">
            {isAssignee && o.status === 'assigned' ? (
              <Button size="sm" className="h-7 gap-1 px-2.5 text-[11px]" onClick={() => onAction(o, 'start')}><I.sparkles size={12} /> شروع کار</Button>
            ) : null}
            {isAssignee && o.status === 'in_progress' ? (
              <Button size="sm" className="h-7 gap-1 px-2.5 text-[11px]" onClick={() => onAction(o, 'done')}><I.check size={12} /> انجام شد</Button>
            ) : null}
            {isAssignee && o.status === 'blocked' ? (
              <Button size="sm" className="h-7 gap-1 px-2.5 text-[11px]" onClick={() => onAction(o, 'start')}><I.play size={12} /> ادامه کار</Button>
            ) : null}
            {isAssignee && (o.status === 'assigned' || o.status === 'in_progress') ? (
              <Button size="sm" variant="outline" className="h-7 gap-1 border-amber-300 px-2.5 text-[11px] text-amber-700 hover:bg-amber-50" onClick={() => onAction(o, 'block')}><I.alertTriangle size={12} /> مشکل دارد</Button>
            ) : null}
            {isAssignee && o.status === 'done' ? (
              <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] text-teal-700">انجام شد — در انتظار تأیید فرستنده</span>
            ) : null}
            {canVerify ? (
              <Button size="sm" variant="outline" className="h-7 gap-1 border-emerald-300 px-2.5 text-[11px] text-emerald-700 hover:bg-emerald-50" onClick={() => onAction(o, 'verify')}><I.check size={12} /> تأیید</Button>
            ) : null}
            {canCancel ? (
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2.5 text-[11px] text-rose-600 hover:bg-rose-50" onClick={() => onAction(o, 'cancel')}><I.x size={12} /> لغو</Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ── جدول آرشیو فشرده ───────────────────────────────────── */

function ArchiveTable({ rows, maxH }: { rows: any[]; maxH?: string }) {
  return (
    <div className={cn('overflow-y-auto', maxH || 'max-h-72')}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="h-8 text-right text-[10px]">عنوان</TableHead>
            <TableHead className="h-8 text-right text-[10px]">سررسید</TableHead>
            <TableHead className="h-8 text-center text-[10px]">وضعیت</TableHead>
            <TableHead className="h-8 text-right text-[10px]">تأییدکننده</TableHead>
            <TableHead className="h-8 text-right text-[10px]">ثبت</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="py-1.5 text-[11px] font-medium">{o.title}</TableCell>
              <TableCell className="py-1.5 text-[10px] text-stone-500"><span className="num" dir="rtl">{o.dueDate ? `${faSlash(o.dueDate)}${o.dueTime ? ` · ${fa(o.dueTime)}` : ''}` : '—'}</span></TableCell>
              <TableCell className="py-1.5 text-center"><StatusBadge v={o.status} /></TableCell>
              <TableCell className="py-1.5 text-[10px] text-stone-500">{o.verifiedBy?.name || o.verifiedByName || (o.status === 'done' ? 'در انتظار تأیید' : '—')}</TableCell>
              <TableCell className="py-1.5 text-[10px] text-stone-500"><span className="num" dir="rtl">{jDate(o.createdAt) || '—'}</span></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/* ── نمای اصلی ──────────────────────────────────────────── */

export default function TasksView() {
  const { user, refreshBadges } = useShell()
  const isManager = !!user && MANAGER_ROLES.includes(String(user.role))

  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<any[]>([])
  const [roster, setRoster] = useState<any[]>([])
  const [blocks, setBlocks] = useState<any[]>([])

  /* فیلترهای بالا */
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('all')
  const [staffF, setStaffF] = useState('all')
  const [archOpen, setArchOpen] = useState(false)

  /* دیالوگ دستور کار جدید */
  const [newOpen, setNewOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState({
    assigneeId: '', title: '', instructions: '', requirements: '',
    category: 'general', relatedBlock: 'none', dueDate: '', dueTime: '', priority: 'normal',
  })

  /* دیالوگ‌های اکشن */
  const [dlg, setDlg] = useState<any>(null)
  const [dlgBusy, setDlgBusy] = useState(false)

  useEffect(() => { void load(); void loadMeta() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    const r = await api('/api/task-orders' + qs({ scope: isManager ? 'all' : 'mine' }))
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت دستور کارها'); return }
    setOrders(r.data?.orders ?? [])
  }

  /** فهرست گیرندگان از roster عمومی + خطوط از section-reviews (سقوط به floorplans) */
  async function loadMeta() {
    if (!isManager) return
    const ro = await api('/api/auth/roster')
    if (ro.ok) setRoster(ro.data?.users ?? [])
    let bl: any[] = []
    const sr = await api('/api/section-reviews')
    if (sr.ok) bl = sr.data?.blocks ?? []
    if (!bl.length) {
      const fp = await api('/api/store/floorplans')
      if (fp.ok) bl = (fp.data?.plans?.[0]?.blocks ?? []).map((b: any) => ({ label: b.label, zone: b.zoneName ?? b.zone, kind: b.kind }))
    }
    setBlocks(bl)
  }

  async function patchOrder(o: any, action: string, extra?: Record<string, any>) {
    if (action === 'done') { setDlg({ order: o, kind: 'done', note: '' }); return }
    if (action === 'block') { setDlg({ order: o, kind: 'block', note: '' }); return }
    if (action === 'cancel') { setDlg({ order: o, kind: 'cancel', note: '' }); return }
    const r = await api(`/api/task-orders/${o.id}`, { method: 'PATCH', body: { action } })
    if (!r.ok) { toast.error(r.error || 'عملیات انجام نشد'); return }
    const updated = r.data?.order ?? null
    setOrders((prev) => prev.map((x) => (x.id === o.id ? (updated ?? { ...x, status: NEXT_STATUS[action] ?? x.status }) : x)))
    refreshBadges?.()
    toast.success(action === 'verify' ? 'دستور کار تأیید شد' : action === 'start' ? 'کار شروع شد' : 'ثبت شد')
  }

  /* دیالوگ انجام/مشکل/لغو */
  async function confirmDlg() {
    if (!dlg) return
    const o: any = dlg.order
    setDlgBusy(true)
    if (dlg.kind === 'done') await runDialogAction('done', o, { progressNote: dlg.note.trim() || null })
    else if (dlg.kind === 'block') await runDialogAction('block', o, { blockedReason: dlg.note.trim() })
    else await runDialogAction('cancel', o)
    setDlgBusy(false)
    setDlg(null)
  }

  /** اجرای واقعی اکشن‌های دیالوگی */
  async function runDialogAction(kind: string, o: any, extra?: Record<string, any>) {
    const r = await api(`/api/task-orders/${o.id}`, { method: 'PATCH', body: { action: kind, ...extra } })
    if (!r.ok) { toast.error(r.error || 'عملیات انجام نشد'); return }
    const updated = r.data?.order ?? null
    setOrders((prev) => prev.map((x) => (x.id === o.id ? (updated ?? { ...x, status: NEXT_STATUS[kind] ?? x.status, ...extra }) : x)))
    refreshBadges?.()
    toast.success(
      kind === 'verify' ? 'دستور کار تأیید شد'
      : kind === 'cancel' ? 'دستور کار لغو شد'
      : kind === 'done' ? 'انجام کار ثبت شد'
      : kind === 'block' ? 'مشکل ثبت شد'
      : 'کار شروع شد')
  }

  /* فرم ارسال دستور کار */
  async function submitTask() {
    if (!form.assigneeId) return toast.error('گیرنده دستور کار را انتخاب کنید')
    if (!form.title.trim()) return toast.error('عنوان دستور کار الزامی است')
    if (!form.instructions.trim()) return toast.error('نحوه انجام را توضیح دهید')
    if (form.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)) return toast.error('تاریخ سررسید را از تقویم انتخاب کنید')
    if (form.dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.dueTime)) return toast.error('ساعت سررسید را به شکل ۱۸:۳۰ وارد کنید')
    setSending(true)
    const r = await api('/api/task-orders', {
      method: 'POST',
      body: {
        title: form.title.trim(),
        instructions: form.instructions.trim(),
        requirements: form.requirements.trim() || null,
        assigneeId: form.assigneeId,
        category: form.category,
        relatedBlock: form.relatedBlock === 'none' ? null : form.relatedBlock,
        dueDate: form.dueDate || null,
        dueTime: form.dueTime || null,
        priority: form.priority,
      },
    })
    setSending(false)
    if (!r.ok) return toast.error(r.error || 'ثبت دستور کار انجام نشد')
    toast.success('دستور کار ثبت و به گیرنده اطلاع‌رسانی شد')
    const created = r.data?.order ?? null
    if (created && created.id) setOrders((prev) => [created, ...prev])
    else void load()
    setForm((f) => ({ ...f, title: '', instructions: '', requirements: '', dueDate: '', dueTime: '', relatedBlock: 'none' }))
    setNewOpen(false)
    refreshBadges?.()
  }

  /* ── فهرست‌های مشتق ── */
  const needle = q.trim()

  const myOrders = useMemo(() => orders.filter((o) => o.assigneeId === user?.id), [orders, user])
  const myActive = useMemo(
    () => myOrders
      .filter((o) => ACTIVE.includes(o.status))
      .filter((o) => !needle || String(o.title).indexOf(needle) > -1)
      .sort((a: any, b: any) => String(a.dueDate ?? '9999').localeCompare(String(b.dueDate ?? '9999'))),
    [myOrders, needle],
  )
  const myArchive = useMemo(
    () => myOrders
      .filter((o) => CLOSED.includes(o.status))
      .sort((a: any, b: any) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))),
    [myOrders],
  )

  /** فهرست تیم (مدیران) با فیلترهای جست‌وجو/وضعیت/شخص */
  const teamRows = useMemo(
    () => orders.filter((o) =>
      isManager &&
      (staffF === 'all' || o.assigneeId === staffF) &&
      (statusF === 'all' || o.status === statusF) &&
      (!needle || String(o.title).indexOf(needle) > -1)),
    [orders, isManager, staffF, statusF, needle],
  )

  /** گروه‌بندی تیم بر اساس گیرنده — فعال‌ها اول */
  const teamGroups = useMemo(() => {
    if (!isManager) return []
    const byId = new Map<string, any[]>()
    for (const o of teamRows) {
      const key = o.assigneeId || '—'
      if (!byId.has(key)) byId.set(key, [])
      byId.get(key)!.push(o)
    }
    const groups = [...byId.entries()].map(([id, rows]) => {
      const name = rows[0]?.assignee?.name ?? rows[0]?.assigneeName ?? '—'
      const active = rows.filter((o) => ACTIVE.includes(o.status)).length
      return { id, name, rows, active }
    })
    groups.sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name, 'fa'))
    return groups
  }, [teamRows, isManager])

  /* چیپ‌های خلاصه */
  const myTodayDue = myActive.filter((o) => o.dueDate === todayJalali()).length
  const teamActive = orders.filter((o) => ACTIVE.includes(o.status)).length
  const teamAwaitVerify = orders.filter((o) => o.status === 'done').length

  if (loading) {
    return (
      <Card><CardContent className="p-10 text-center text-stone-500">
        <I.loader className="mx-auto mb-3 animate-spin" size={22} />
        در حال دریافت دستور کارها…
      </CardContent></Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* ═══════ نوار بالا: خلاصه + فیلترها + دستور کار جدید ═══════ */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-800">
              فعال من <span className="num font-black">{fa(myActive.length)}</span>
            </span>
            {myTodayDue > 0 ? (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] text-rose-800">
                سررسید امروز <span className="num font-black">{fa(myTodayDue)}</span>
              </span>
            ) : null}
            <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] text-stone-600">
              آرشیو من <span className="num font-black">{fa(myArchive.length)}</span>
            </span>
            {isManager ? (
              <>
                <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] text-teal-800">
                  فعال تیم <span className="num font-black">{fa(teamActive)}</span>
                </span>
                {teamAwaitVerify > 0 ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-800">
                    در انتظار تأیید <span className="num font-black">{fa(teamAwaitVerify)}</span>
                  </span>
                ) : null}
              </>
            ) : null}
            <span className="mr-auto" />
            {isManager ? (
              <Button size="sm" onClick={() => setNewOpen(true)}><I.plus size={14} className="ml-1" /> دستور کار جدید</Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-36 flex-1">
              <label className="mb-1 block text-[11px] font-medium text-stone-500">جست‌وجو</label>
              <div className="relative">
                <I.search size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-stone-400" />
                <Input className="pr-8 text-sm" placeholder="جست‌وجو در عنوان دستور کار…" value={q} onChange={(e: any) => setQ(e.target.value)} />
              </div>
            </div>
            <div className="w-40">
              <label className="mb-1 block text-[11px] font-medium text-stone-500">وضعیت</label>
              <Select value={statusF} onValueChange={setStatusF}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                  {Object.keys(STATUS_FA).map((k) => <SelectItem key={k} value={k}>{STATUS_FA[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {isManager ? (
              <div className="w-44">
                <label className="mb-1 block text-[11px] font-medium text-stone-500">شخص</label>
                <Select value={staffF} onValueChange={setStaffF}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه پرسنل</SelectItem>
                    {roster.map((u) => <SelectItem key={u.id} value={u.id}>{u.honorific} {u.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Button variant="outline" size="icon" className="h-9 w-9" title="به‌روزرسانی" onClick={() => void load()}>
              <I.refresh size={14} />
            </Button>
          </div>
          {isManager ? (
            <p className="text-[10.5px] text-stone-400">فیلتر وضعیت و شخص فقط ستون «وظایف تیم» را محدود می‌کند؛ «وظایف من» همیشه فعال‌های شما را نشان می‌دهد.</p>
          ) : null}
        </CardContent>
      </Card>

      {/* ═══════ چیدمان دوستونه ═══════ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        {/* ── ستون راست: وظایف من ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <I.clipboard size={16} className="text-emerald-700" /> وظایف من
                <span className="num rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{fa(myActive.length)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {myActive.length === 0 ? (
                <div className="py-6 text-center">
                  <I.clipboard className="mx-auto mb-2 text-stone-400" size={26} />
                  <p className="text-xs font-medium text-stone-500">فعلاً دستور کاری برای شما ثبت نشده</p>
                  <p className="mt-0.5 text-[10.5px] text-stone-400">هنگام ثبت دستور کار جدید، اعلان دریافت می‌کنید</p>
                </div>
              ) : (
                myActive.map((o) => (
                  <OrderRow key={o.id} o={o} user={user} isManager={isManager} mine
                    onAction={(ord, action) => void patchOrder(ord, action)} />
                ))
              )}
            </CardContent>
          </Card>

          {/* آرشیو من — پیش‌فرض جمع */}
          {myArchive.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <button type="button" className="flex w-full items-center gap-2 text-right" onClick={() => setArchOpen((v) => !v)}>
                  <I.history size={15} className="text-stone-500" />
                  <span className="text-sm font-bold text-stone-700">آرشیو من</span>
                  <span className="num rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">{fa(myArchive.length)}</span>
                  <I.chevronDown size={15} className={cn('mr-auto text-stone-400 transition-transform', archOpen && 'rotate-180')} />
                </button>
              </CardHeader>
              {archOpen ? (
                <CardContent className="pt-0">
                  <ArchiveTable rows={myArchive} />
                </CardContent>
              ) : null}
            </Card>
          ) : null}
        </div>

        {/* ── ستون چپ: وظایف تیم (مدیران) / تاریخچهٔ من (سایرین) ── */}
        {isManager ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <I.users size={16} className="text-teal-700" /> وظایف تیم
                <span className="text-[10.5px] font-normal text-stone-400">{fa(teamRows.length)} مورد · {fa(teamGroups.length)} نفر</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {teamGroups.length === 0 ? (
                <p className="py-8 text-center text-xs text-stone-400">دستور کاری با این فیلترها یافت نشد</p>
              ) : (
                teamGroups.map((g) => (
                  <div key={g.id}>
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 border-b border-stone-200 pb-1.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-50 text-[10px] font-bold text-teal-700">
                        {(g.name || '؟').trim().slice(-1)}
                      </span>
                      <span className="text-xs font-bold text-stone-700">{g.name}</span>
                      {g.active > 0 ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9.5px] font-medium text-emerald-700">{fa(g.active)} فعال</span>
                      ) : null}
                      <span className="text-[9.5px] text-stone-400">{fa(g.rows.length)} دستور</span>
                    </div>
                    <div className="space-y-1.5">
                      {g.rows.slice(0, 8).map((o) => (
                        <OrderRow key={o.id} o={o} user={user} isManager={isManager} mine={o.assigneeId === user?.id}
                          onAction={(ord, action) => void patchOrder(ord, action)} />
                      ))}
                      {g.rows.length > 8 ? (
                        <p className="pr-2 text-[10px] text-stone-400">و {fa(g.rows.length - 8)} مورد دیگر…</p>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <I.history size={16} className="text-stone-500" /> تاریخچه دستور کارهای من
                <span className="num rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">{fa(myArchive.length)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {myArchive.length === 0 ? (
                <p className="py-8 text-center text-xs text-stone-400">آرشیو خالی است — دستور کار انجام‌شده‌ای ندارید</p>
              ) : (
                <ArchiveTable rows={myArchive} maxH="max-h-[28rem]" />
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ═══════ دیالوگ دستور کار جدید (مدیران) ═══════ */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <I.send size={16} className="text-emerald-700" /> ارسال دستور کار جدید
            </DialogTitle>
            <DialogDescription className="text-xs">دستور کار برای همکار انتخابی ثبت و اعلان می‌شود.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">گیرنده (اجباری)</label>
                <Select value={form.assigneeId || undefined} onValueChange={(v: string) => setForm((f) => ({ ...f, assigneeId: v }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="انتخاب همکار…" /></SelectTrigger>
                  <SelectContent>
                    {roster.filter((u) => u.id !== user?.id).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.honorific} {u.fullName} — {u.title || u.role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">دسته</label>
                <Select value={form.category} onValueChange={(v: string) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">اولویت</label>
                <Select value={form.priority} onValueChange={(v: string) => setForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">عنوان دستور کار (اجباری)</label>
              <Input value={form.title} onChange={(e: any) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="مثلاً: چیدمان مجدد گوندولای ۳ و کنترل تاریخ" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">نحوه انجام</label>
                <Textarea rows={4} value={form.instructions} onChange={(e: any) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                  placeholder="گام‌به‌گام توضیح دهید؛ این متن برای گیرنده نمایش داده می‌شود" />
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-600">ملزومات</label>
                  <Input value={form.requirements} onChange={(e: any) => setForm((f) => ({ ...f, requirements: e.target.value }))}
                    placeholder="مثلاً: برچسب‌چسبان، سه جعبه برچسب قیمت" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-600">خط مرتبط در فروشگاه</label>
                  {blocks.length ? (
                    <Select value={form.relatedBlock} onValueChange={(v: string) => setForm((f) => ({ ...f, relatedBlock: v }))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">بدون خط مرتبط</SelectItem>
                        {blocks.map((b) => (
                          <SelectItem key={b.label} value={b.label}>{b.label}{b.zone ? ` · ${b.zone}` : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="rounded-lg border border-dashed border-stone-200 p-2 text-xs text-stone-400">خطی از نقشه فروشگاه در دسترس نیست</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">تاریخ سررسید</label>
                <JalaliDate value={form.dueDate} onChange={(v: string) => setForm((f) => ({ ...f, dueDate: v }))}
                  quickChips={[{ label: 'امروز', deltaDays: 0 }, { label: 'فردا', deltaDays: 1 }, { label: 'هفتهٔ آینده', deltaDays: 7 }]} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">ساعت سررسید (اختیاری)</label>
                <TimeInput value={form.dueTime} onChange={(v: string) => setForm((f) => ({ ...f, dueTime: v }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>انصراف</Button>
            <Button onClick={submitTask} disabled={sending}>
              {sending ? <I.loader size={14} className="ml-1 animate-spin" /> : <I.send size={14} className="ml-1" />}
              {sending ? 'در حال ثبت…' : 'ثبت و ارسال دستور کار'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ دیالوگ انجام/مشکل/لغو ═══════ */}
      <Dialog open={!!dlg} onOpenChange={(v: boolean) => { if (!v) setDlg(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dlg?.kind === 'done' ? 'اعلام انجام کار' : dlg?.kind === 'block' ? 'اعلام مشکل' : 'لغو دستور کار'}
            </DialogTitle>
            <DialogDescription>
              {dlg?.kind === 'cancel'
                ? `دستور «${dlg?.order?.title}» قطعی لغو شود؟ این عمل بازگشت‌پذیر نیست.`
                : `دستور کار «${dlg?.order?.title}»`}
            </DialogDescription>
          </DialogHeader>

          {dlg?.kind === 'done' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">یادداشت پیشرفت (اختیاری)</label>
              <Textarea rows={3} value={dlg.note ?? ''} onChange={(e: any) => setDlg({ ...dlg, note: e.target.value })}
                placeholder="مثلاً: چیدمان انجام شد؛ برچسب‌ها فردا می‌رسد" />
            </div>
          )}
          {dlg?.kind === 'block' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">شرح مشکل (الزامی)</label>
              <Textarea rows={3} value={dlg.note ?? ''} onChange={(e: any) => setDlg({ ...dlg, note: e.target.value })}
                placeholder="مانع انجام کار را دقیق توضیح دهید…" />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>انصراف</Button>
            <Button disabled={dlgBusy} onClick={() => void confirmDlg()} className="gap-1">
              {dlgBusy ? <I.loader size={14} className="animate-spin" /> : <I.check size={14} />}
              {dlg?.kind === 'block' ? 'ثبت مشکل' : dlg?.kind === 'done' ? 'ثبت انجام' : 'بله، لغو کن'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
