import {
  useState, useEffect, useMemo, api, qs, useShell, toast, cn,
  Button, Input, Textarea, Card, CardContent, CardHeader, CardTitle, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Tabs, TabsContent, TabsList, TabsTrigger,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  fa, toEnDigits, todayJalali, addJalaliDays, formatJalali, I,
} from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   tasks/tasks — «دستور کار و وظایف من»
   Tabs: وظایف من | آرشیو  (+ managers: ارسال دستور کار | همه)
   API: GET/POST /api/task-orders · PATCH /api/task-orders/[id]
   (نکته: API-1 هنوز در حال ساخت است — تا آماده‌شدن، خطا با toast
   و حالت خالی نمایش داده می‌شود)
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
  { key: 'low', label: 'کم', cls: 'bg-stone-100 text-stone-600 border-stone-200' },
  { key: 'normal', label: 'عادی', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { key: 'high', label: 'مهم', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  { key: 'urgent', label: 'فوری', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
] as const

const STATUS_STEPS = [
  { key: 'assigned', label: 'در انتظار شروع' },
  { key: 'in_progress', label: 'در حال انجام' },
  { key: 'done', label: 'انجام‌شده' },
  { key: 'verified', label: 'تأییدشده' },
] as const

const STATUS_FA: Record<string, string> = {
  assigned: 'در انتظار شروع',
  in_progress: 'در حال انجام',
  blocked: 'متوقف (مشکل)',
  done: 'انجام‌شده',
  verified: 'تأییدشده',
  cancelled: 'لغوشده',
}

/** وضعیت پس از هر اکشن — برای به‌روزرسانی خوش‌بینانهٔ فهرست */
const NEXT_STATUS: Record<string, string> = {
  start: 'in_progress', done: 'done', block: 'blocked', verify: 'verified', cancel: 'cancelled',
}

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

/** نرمال‌سازی تاریخ شمسی واردشده → ۱۴۰۵-۰۷-۲۷ */
function normDate(s: string): string {
  const v = toEnDigits(String(s || '')).trim().replace(/\//g, '-')
  const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return v
  return `${m[1]}-${String(+m[2] + 0).padStart(2, '0')}-${String(+m[3] + 0).padStart(2, '0')}`
}

/** نرمال‌سازی ساعت → ۱۸:۳۰ */
function normTime(s: string): string {
  const v = toEnDigits(String(s || '')).trim().replace(/\s+/g, '')
  const m = v.match(/^(\d{1,2}):(\d{1,2})$/)
  if (!m) return v
  return `${String(+m[1]).padStart(2, '0')}:${String(+m[2]).padStart(2, '0')}`
}

/** ISO → تاریخ شمسی خط‌دار */
function jDate(v: any): string {
  try {
    const d = new Date(v)
    return isNaN(d.getTime()) ? '' : formatJalali(d)
  } catch {
    return ''
  }
}

/* ── atoms ───────────────────────────────────────────────── */

function PrioBadge({ v }: { v?: string }) {
  const p = PRIORITIES.find((x) => x.key === (v || 'normal')) ?? PRIORITIES[1]
  return <span className={cn('rounded-md border px-2 py-0.5 text-[11px] font-medium', p.cls)}>{p.label}</span>
}

function CatBadge({ v }: { v?: string }) {
  const c = CATEGORIES.find((x) => x.key === (v || 'general')) ?? CATEGORIES[0]
  return <Badge variant="secondary" className="text-[11px] font-medium">{c.label}</Badge>
}

function StatusBadge({ v }: { v?: string }) {
  const cls =
    v === 'verified' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : v === 'cancelled' ? 'bg-rose-100 text-rose-700 border-rose-200'
    : v === 'blocked' ? 'bg-amber-100 text-amber-700 border-amber-200'
    : v === 'done' ? 'bg-teal-100 text-teal-700 border-teal-200'
    : 'bg-stone-100 text-stone-600 border-stone-200'
  return <span className={cn('rounded-md border px-2 py-0.5 text-[11px] font-medium', cls)}>{STATUS_FA[v || ''] || v}</span>
}

/** نوار وضعیت چهار مرحله‌ای */
function Timeline({ status }: { status: string }) {
  if (status === 'blocked' || status === 'cancelled') {
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium',
        status === 'blocked' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700')}>
        <I.alertTriangle size={12} /> {STATUS_FA[status]}
      </span>
    )
  }
  const cur = STATUS_STEPS.findIndex((s) => s.key === status)
  return (
    <div className="flex flex-wrap items-center gap-1">
      {STATUS_STEPS.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1">
          {i > 0 && <span className={cn('h-0.5 w-3', i <= cur ? 'bg-emerald-400' : 'bg-stone-200')} />}
          <span className={cn('rounded px-1.5 py-0.5 text-[10px]',
            i < cur ? 'bg-emerald-50 text-emerald-600'
            : i === cur ? 'bg-emerald-600 text-white'
            : 'bg-stone-100 text-stone-400')}>
            {s.label}
          </span>
        </span>
      ))}
    </div>
  )
}

function DueChip({ o }: { o: any }) {
  const active = ['assigned', 'in_progress', 'blocked'].includes(o.status)
  const past = active && isPastDue(o)
  if (!o.dueDate) return null
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]',
      past ? 'bg-rose-100 text-rose-700 font-bold' : 'bg-stone-100 text-stone-600')}>
      <I.timer size={12} />
      <span dir="ltr">{fa(o.dueDate)}{o.dueTime ? ` ${fa(o.dueTime)}` : ''}</span>
      {past && <span>سررسید گذشته</span>}
    </span>
  )
}

/* ── کارت یک دستور کار ──────────────────────────────────── */

function TaskCard({ o, user, isManager, onStart, onDone, onBlock, onVerify, onCancel }: {
  o: any
  user: any
  isManager: boolean
  onStart: (o: any) => void
  onDone: (o: any) => void
  onBlock: (o: any) => void
  onVerify: (o: any) => void
  onCancel: (o: any) => void
}) {
  const mine = !!user && o.assigneeId === user.id
  const sender = o.sender?.name ?? o.createdByName ?? o.senderName ?? '—'
  const assignee = o.assignee?.name ?? o.assigneeName ?? '—'
  return (
    <Card className="break-inside-avoid">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <PrioBadge v={o.priority} />
          <CatBadge v={o.category} />
          {o.relatedBlock && (
            <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">
              <I.store size={12} /> {o.relatedBlock}
            </span>
          )}
          <DueChip o={o} />
          <span className="text-[11px] text-stone-400">فرستنده: {sender}</span>
        </div>

        <div className="text-sm font-bold leading-6 text-stone-700">{o.title}</div>

        {o.instructions && (
          <div className="rounded-lg bg-stone-50 p-3">
            <div className="mb-1 text-[11px] font-medium text-stone-500">نحوه انجام</div>
            <p className="text-xs leading-5 text-stone-700 whitespace-pre-line">{o.instructions}</p>
          </div>
        )}
        {o.requirements && (
          <div className="rounded-lg border border-dashed border-stone-200 p-3">
            <div className="mb-1 text-[11px] font-medium text-stone-500">ملزومات</div>
            <p className="text-xs leading-5 text-stone-700">{o.requirements}</p>
          </div>
        )}

        {o.status === 'blocked' && o.blockedReason && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="mb-1 flex items-center gap-1 text-[11px] font-bold text-amber-700"><I.alertTriangle size={12} /> مشکل اعلام‌شده</div>
            <p className="text-xs leading-5 text-amber-800">{o.blockedReason}</p>
          </div>
        )}
        {o.progressNote && o.status !== 'assigned' && (
          <div className="text-[11px] text-stone-500"><I.check size={12} className="inline align-middle text-emerald-600" /> یادداشت پیشرفت: {o.progressNote}</div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Timeline status={o.status} />
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-400">
            {o.doneAt && <span>انجام: {fa(jDate(o.doneAt))}</span>}
            {o.verifiedAt && <span>تأیید: {fa(jDate(o.verifiedAt))} {o.verifiedBy?.name ? `(${o.verifiedBy.name})` : o.verifiedByName ? `(${o.verifiedByName})` : ''}</span>}
            {o.createdAt && <span>ثبت: {fa(jDate(o.createdAt))}</span>}
          </div>
        </div>

        {(mine || isManager) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 pt-3">
            {mine && o.status === 'assigned' && (
              <Button size="sm" onClick={() => onStart(o)} className="gap-1"><I.sparkles size={14} /> شروع کار</Button>
            )}
            {mine && o.status === 'in_progress' && (
              <Button size="sm" onClick={() => onDone(o)} className="gap-1"><I.check size={14} /> انجام شد</Button>
            )}
            {mine && (o.status === 'assigned' || o.status === 'in_progress') && (
              <Button size="sm" variant="outline" onClick={() => onBlock(o)} className="gap-1 border-amber-300 text-amber-700 hover:bg-amber-50">
                <I.alertTriangle size={14} /> مشکل دارد
              </Button>
            )}
            {mine && o.status === 'done' && (
              <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] text-teal-700">انجام شد — در انتظار تأیید فرستنده</span>
            )}
            {isManager && o.status === 'done' && (
              <Button size="sm" variant="outline" onClick={() => onVerify(o)} className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                <I.check size={14} /> تأیید
              </Button>
            )}
            {isManager && !['verified', 'cancelled'].includes(o.status) && (
              <Button size="sm" variant="ghost" onClick={() => onCancel(o)} className="gap-1 text-rose-600 hover:bg-rose-50">
                <I.x size={14} /> لغو
              </Button>
            )}
            <span className="text-[11px] text-stone-400">گیرنده: {assignee}</span>
          </div>
        )}
      </CardContent>
    </Card>
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
  const [tab, setTab] = useState('mine')
  const [sending, setSending] = useState(false)
  const [dlg, setDlg] = useState<any>(null)
  const [dlgBusy, setDlgBusy] = useState(false)
  const [staffF, setStaffF] = useState('all')
  const [statusF, setStatusF] = useState('all')
  const [form, setForm] = useState({
    assigneeId: '', title: '', instructions: '', requirements: '',
    category: 'general', relatedBlock: 'none', dueDate: '', dueTime: '', priority: 'normal',
  })

  useEffect(() => { void load(); void loadMeta() }, [])

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
    else toast.error(ro.error || 'خطا در دریافت فهرست پرسنل')
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
    const r = await api(`/api/task-orders/${o.id}`, { method: 'PATCH', body: { action, ...extra } })
    if (!r.ok) { toast.error(r.error || 'عملیات انجام نشد'); return }
    const updated = r.data?.order ?? null
    setOrders((prev) => prev.map((x) => (x.id === o.id ? (updated ?? { ...x, status: NEXT_STATUS[action] ?? x.status, ...extra }) : x)))
    refreshBadges?.()
    toast.success(
      action === 'verify' ? 'دستور کار تأیید شد'
      : action === 'cancel' ? 'دستور کار لغو شد'
      : action === 'done' ? 'انجام کار ثبت شد'
      : action === 'block' ? 'مشکل ثبت شد'
      : action === 'start' ? 'کار شروع شد'
      : 'ثبت شد')
    return true
  }

  /* فرم ارسال دستور کار */
  async function submitTask() {
    if (!form.assigneeId) return toast.error('گیرنده دستور کار را انتخاب کنید')
    if (!form.title.trim()) return toast.error('عنوان دستور کار الزامی است')
    const dd = normDate(form.dueDate)
    if (form.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dd)) return toast.error('تاریخ سررسید را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')
    const tm = normTime(form.dueTime)
    if (form.dueTime && !/^\d{2}:\d{2}$/.test(tm)) return toast.error('ساعت سررسید را به شکل ۱۸:۳۰ وارد کنید')
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
        dueDate: form.dueDate ? dd : null,
        dueTime: form.dueTime ? tm : null,
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
    refreshBadges?.()
    setTab('all')
  }

  /* دیالوگ‌های اکشن */
  async function confirmDlg() {
    if (!dlg) return
    const o: any = dlg.order
    setDlgBusy(true)
    if (dlg.kind === 'done') await patchOrder(o, 'done', { progressNote: dlg.note.trim() || null })
    else if (dlg.kind === 'block') await patchOrder(o, 'block', { blockedReason: dlg.note.trim() })
    else await patchOrder(o, 'cancel')
    setDlgBusy(false)
    setDlg(null)
  }

  /* ── فهرست‌های مشتق ── */
  const myOrders = useMemo(() => orders.filter((o) => o.assigneeId === user?.id), [orders, user])
  const myActive = useMemo(
    () => myOrders
      .filter((o) => ['assigned', 'in_progress', 'blocked'].includes(o.status))
      .sort((a: any, b: any) => String(a.dueDate ?? '9999').localeCompare(String(b.dueDate ?? '9999'))),
    [myOrders],
  )
  const myArchive = useMemo(
    () => myOrders
      .filter((o) => ['done', 'verified', 'cancelled'].includes(o.status))
      .sort((a: any, b: any) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))),
    [myOrders],
  )
  const allRows = useMemo(
    () => orders.filter((o) =>
      (staffF === 'all' || o.assigneeId === staffF) &&
      (statusF === 'all' || o.status === statusF)),
    [orders, staffF, statusF],
  )

  if (loading) {
    return (
      <Card><CardContent className="p-10 text-center text-stone-500">
        <I.loader className="mx-auto mb-3 animate-spin" size={22} />
        در حال دریافت دستور کارها…
      </CardContent></Card>
    )
  }

  const quickChips = [
    { label: 'امروز', d: 0 },
    { label: 'فردا', d: 1 },
    { label: 'هفتهٔ آینده', d: 7 },
  ]

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v: string) => setTab(v)}>
        <TabsList>
          <TabsTrigger value="mine">وظایف من</TabsTrigger>
          <TabsTrigger value="archive">آرشیو</TabsTrigger>
          {isManager && <TabsTrigger value="send">ارسال دستور کار</TabsTrigger>}
          {isManager && <TabsTrigger value="all">همه</TabsTrigger>}
        </TabsList>

        {/* ── وظایف من ── */}
        <TabsContent value="mine" className="mt-4 space-y-4">
          {myActive.length === 0 ? (
            <Card><CardContent className="p-10 text-center">
              <I.clipboard className="mx-auto mb-3 text-stone-400" size={32} />
              <p className="text-sm font-medium text-stone-500">فعلاً دستور کاری برای شما ثبت نشده</p>
              <p className="mt-1 text-xs text-stone-400">هنگام ثبت دستور کار جدید، اعلان دریافت می‌کنید و همین‌جا نمایش داده می‌شود</p>
            </CardContent></Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {myActive.map((o) => (
                <TaskCard key={o.id} o={o} user={user} isManager={isManager}
                  onStart={(x) => void patchOrder(x, 'start')}
                  onDone={(x) => setDlg({ order: x, kind: 'done', note: '' })}
                  onBlock={(x) => setDlg({ order: x, kind: 'block', note: '' })}
                  onVerify={(x) => void patchOrder(x, 'verify')}
                  onCancel={(x) => setDlg({ order: x, kind: 'cancel', note: '' })}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── آرشیو ── */}
        <TabsContent value="archive" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><I.history size={18} /> آرشیو دستور کارهای من</CardTitle>
            </CardHeader>
            <CardContent>
              {myArchive.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-400">آرشیو خالی است — دستور کار انجام‌شده‌ای ندارید</p>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">ثبت</TableHead>
                        <TableHead className="text-right">عنوان</TableHead>
                        <TableHead className="text-right">دسته</TableHead>
                        <TableHead className="text-right">سررسید</TableHead>
                        <TableHead className="text-center">وضعیت</TableHead>
                        <TableHead className="text-right">تأییدکننده</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myArchive.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="text-xs text-stone-500"><span dir="ltr">{fa(jDate(o.createdAt)) || '—'}</span></TableCell>
                          <TableCell className="text-xs font-medium">{o.title}</TableCell>
                          <TableCell className="text-xs"><CatBadge v={o.category} /></TableCell>
                          <TableCell className="text-xs text-stone-500"><span dir="ltr">{o.dueDate ? fa(o.dueDate) : '—'}</span></TableCell>
                          <TableCell className="text-center"><StatusBadge v={o.status} /></TableCell>
                          <TableCell className="text-xs text-stone-500">{o.verifiedBy?.name || o.verifiedByName || (o.status === 'done' ? 'در انتظار تأیید' : '—')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ارسال دستور کار (مدیران) ── */}
        {isManager && (
          <TabsContent value="send" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><I.send size={18} /> ارسال دستور کار جدید</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-stone-600">نحوه انجام</label>
                    <Textarea rows={4} value={form.instructions} onChange={(e: any) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                      placeholder="گام‌به‌گام توضیح دهید؛ این متن برای گیرنده نمایش داده می‌شود" />
                  </div>
                  <div className="space-y-4">
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

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-stone-600">تاریخ سررسید (۱۴۰۵-۰۷-۲۷)</label>
                    <Input dir="ltr" value={form.dueDate} onChange={(e: any) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                      placeholder="1405-07-29" className="font-mono" />
                    <div className="mt-2 flex gap-2">
                      {quickChips.map((ch) => (
                        <button key={ch.label} type="button"
                          onClick={() => setForm((f) => ({ ...f, dueDate: addJalaliDays(todayJalali(), ch.d) }))}
                          className="rounded-md border border-stone-200 px-2 py-0.5 text-[11px] text-stone-600 transition-colors hover:border-emerald-400 hover:text-emerald-800">
                          {ch.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-stone-600">ساعت سررسید (اختیاری — ۱۸:۳۰)</label>
                    <Input dir="ltr" value={form.dueTime} onChange={(e: any) => setForm((f) => ({ ...f, dueTime: e.target.value }))}
                      placeholder="18:30" className="w-32 font-mono" />
                  </div>
                </div>

                <div className="flex justify-end border-t border-stone-200 pt-4">
                  <Button disabled={sending} onClick={() => void submitTask()} className="gap-2">
                    {sending ? <I.loader size={16} className="animate-spin" /> : <I.send size={16} />}
                    ثبت و ارسال دستور کار
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ── همه (مدیران) ── */}
        {isManager && (
          <TabsContent value="all" className="mt-4">
            <Card>
              <CardHeader className="space-y-3 pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><I.users size={18} /> همه دستور کارها</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={staffF} onValueChange={setStaffF}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">همه پرسنل</SelectItem>
                      {roster.map((u) => <SelectItem key={u.id} value={u.id}>{u.honorific} {u.fullName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={statusF} onValueChange={setStatusF}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                      {Object.keys(STATUS_FA).map((k) => <SelectItem key={k} value={k}>{STATUS_FA[k]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1"><I.refresh size={14} /> به‌روزرسانی</Button>
                  <span className="text-xs text-stone-400">{fa(allRows.length)} مورد</span>
                </div>
              </CardHeader>
              <CardContent>
                {allRows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-stone-400">دستور کاری با این فیلترها یافت نشد</p>
                ) : (
                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">عنوان</TableHead>
                          <TableHead className="text-right">گیرنده</TableHead>
                          <TableHead className="text-right">فرستنده</TableHead>
                          <TableHead className="text-center">دسته</TableHead>
                          <TableHead className="text-center">اولویت</TableHead>
                          <TableHead className="text-right">سررسید</TableHead>
                          <TableHead className="text-center">وضعیت</TableHead>
                          <TableHead className="text-center">عملیات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allRows.map((o) => {
                          const past = isPastDue(o) && ['assigned', 'in_progress', 'blocked'].includes(o.status)
                          return (
                            <TableRow key={o.id}>
                              <TableCell className="max-w-56">
                                <div className="text-xs font-medium">{o.title}</div>
                                {o.status === 'blocked' && o.blockedReason && (
                                  <div className="mt-1 text-[11px] leading-4 text-amber-700">مشکل: {o.blockedReason}</div>
                                )}
                              </TableCell>
                              <TableCell className="text-xs">{(o.assignee?.name ?? o.assigneeName) || '—'}</TableCell>
                              <TableCell className="text-xs text-stone-500">{(o.sender?.name ?? o.createdByName) || '—'}</TableCell>
                              <TableCell className="text-center"><CatBadge v={o.category} /></TableCell>
                              <TableCell className="text-center"><PrioBadge v={o.priority} /></TableCell>
                              <TableCell className="text-xs">
                                <span dir="ltr" className={cn('whitespace-nowrap', past ? 'font-bold text-rose-600' : 'text-stone-500')}>
                                  {o.dueDate ? `${fa(o.dueDate)}${o.dueTime ? ` ${fa(o.dueTime)}` : ''}` : '—'}
                                </span>
                                {past && <div className="text-[10px] text-rose-500">سررسید گذشته</div>}
                              </TableCell>
                              <TableCell className="text-center"><StatusBadge v={o.status} /></TableCell>
                              <TableCell>
                                <div className="flex justify-center gap-1">
                                  {o.status === 'done' && (
                                    <Button size="sm" variant="outline" className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                      onClick={() => void patchOrder(o, 'verify')}>
                                      <I.check size={14} /> تأیید
                                    </Button>
                                  )}
                                  {!['verified', 'cancelled'].includes(o.status) && (
                                    <Button size="sm" variant="ghost" className="gap-1 text-rose-600 hover:bg-rose-50"
                                      onClick={() => setDlg({ order: o, kind: 'cancel', note: '' })}>
                                      <I.x size={14} /> لغو
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* دیالوگ انجام/مشکل/لغو */}
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
