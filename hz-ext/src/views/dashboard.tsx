import {
  useState, useEffect, useMemo,
  api, useShell, toast, cn,
  Button, Card, CardContent, Progress, Checkbox,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  formatJalali, formatJalaliLong, jalaliWeekday, parseJalali, toFaDigits, todayJalali,
  fa, Icon, I,
} from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   home/home — میزکار من (بازطراحی مبتنی بر تحقیق R1)
   ۱) کارت-محورِ تکلیف‌محور: «روز من» / «وضعیت فروشگاه» / «تیم و ارتباطات»
   ۲) قاعدهٔ ۵ ثانیه: فوری‌ترین کارت‌ها بالای صفحه (وظیفهٔ عقب‌افتاده →
      مرجوعی در انتظار تأیید → مشکل باز → کم‌موجودی → چک ≤۷ روز)
   ۳) قرمز فقط برای «همین حالا اقدام کن» (≤۱۰٪ کارت‌ها)؛ کهربایی برای ≤۷ روز
   ۴) شخصی‌سازی ساده: نمایش/پنهان + جابه‌جایی با پیکان بالا/پایین
      (بدون درگ‌اند‌دراپ) — ذخیرهٔ هر کاربر در /api/me/prefs
   ۵) شبکهٔ پرشونده: آخرین کارت هر بخش به‌اندازهٔ باقی‌ماندهٔ ردیف کش می‌آید
      تا هیچ ردیف نیمه‌خالی (¾ پر) رها نشود
   ───────────────────────────────────────────────────────────── */

type GroupKey = 'day' | 'store' | 'team'

interface WidgetDef {
  key: string
  title: string
  icon: string
  group: GroupKey
  go: string
  link: string
}

const MANAGERS = ['OWNER', 'GM', 'ADMIN', 'EXEC']
const SUPERS = ['OWNER', 'GM', 'ADMIN']
const SHIFT_LABEL: Record<string, string> = { MORNING: 'شیفت صبح', EVENING: 'شیفت عصر', NIGHT: 'شیفت شب' }

/** ترتیب پیش‌فرض کارت‌ها (بر اساس اولویت فوریت R1) */
const WIDGETS: WidgetDef[] = [
  { key: 'mytasks', title: 'وظایف من', icon: 'clipboard', group: 'day', go: 'tasks/tasks', link: 'وظایف' },
  { key: 'mychecklists', title: 'چک‌لیست‌های امروز', icon: 'check', group: 'day', go: 'tasks/checklists', link: 'چک‌لیست‌ها' },
  { key: 'returnsWait', title: 'مرجوعی‌ها', icon: 'receipt', group: 'day', go: 'returns/approvals', link: 'مرجوعی‌ها' },
  { key: 'problems', title: 'مشکلات باز', icon: 'alertTriangle', group: 'store', go: 'tasks/problems', link: 'مشکلات' },
  { key: 'orders', title: 'سفارش‌های فعال', icon: 'carton', group: 'store', go: 'supply/orders', link: 'سفارش‌ها' },
  { key: 'cheques', title: 'چک‌های نزدیک', icon: 'banknote', group: 'store', go: 'finance/cheques', link: 'چک‌ها' },
  { key: 'lowstock', title: 'کم‌موجودها', icon: 'trendingDown', group: 'store', go: 'supply/products', link: 'کالاها' },
  { key: 'handover', title: 'تحویل شیفت', icon: 'handshake', group: 'team', go: 'tasks/reports', link: 'گزارش‌ها' },
  { key: 'wall', title: 'دیوار خبری', icon: 'send', group: 'team', go: 'tasks/wall', link: 'نوشته‌ها' },
]

const GROUPS: { key: GroupKey; label: string; dot: string; icon: string }[] = [
  { key: 'day', label: 'روز من', dot: 'bg-emerald-500', icon: 'bg-emerald-100 text-emerald-700' },
  { key: 'store', label: 'وضعیت فروشگاه', dot: 'bg-amber-500', icon: 'bg-amber-100 text-amber-700' },
  { key: 'team', label: 'تیم و ارتباطات', dot: 'bg-teal-500', icon: 'bg-teal-50 text-teal-700' },
]

/** نقش‌های پیش‌فرض هر اقدام سریع — آینهٔ PAGE_DEFAULTS سمت سرور */
const QUICK_ACTIONS: { label: string; icon: string; go: string; roles: string[] }[] = [
  { label: 'ثبت مرجوعی', icon: 'receipt', go: 'returns/new', roles: [...MANAGERS, 'CASHIER', 'HC'] },
  { label: 'سفارش جدید', icon: 'packagePlus', go: 'supply/orders', roles: [...MANAGERS, 'PM', 'SK', 'ACC'] },
  { label: 'کنترل قیمت', icon: 'scan', go: 'store/pricecheck', roles: [...MANAGERS, 'PM'] },
  { label: 'چک جدید', icon: 'banknote', go: 'finance/cheques', roles: ['OWNER', 'GM', 'ADMIN', 'ACC'] },
  { label: 'گزارش شیفت', icon: 'penLine', go: 'tasks/reports', roles: ['*'] },
]

/** آیا صفحه برای این کاربر قابل دسترس است؟ (override کاربر > نقش پیش‌فرض) */
function canSee(user: any, route: string, roles: string[]): boolean {
  if (!user) return false
  const r = String(user.role || '')
  if (SUPERS.includes(r)) return true // نقش‌های بالا هرگز بسته نمی‌شوند
  const allow: string[] = Array.isArray(user.pageAllow) ? user.pageAllow : []
  const deny: string[] = Array.isArray(user.pageDeny) ? user.pageDeny : []
  if (allow.includes(route)) return true
  if (deny.includes(route)) return false
  return roles.includes('*') || roles.includes(r)
}

interface WPref { key: string; visible: boolean; order: number }

const DEFAULT_PREFS: WPref[] = WIDGETS.map((w, i) => ({ key: w.key, visible: true, order: i }))

/** ادغام ترجیحات ذخیره‌شده با پیش‌فرض (کلیدهای ناشناخته حذف، کلیدهای جدید در انتها) */
function mergePrefs(savedRaw: any): WPref[] {
  const saved = Array.isArray(savedRaw) ? savedRaw : []
  const byKey = new Map<string, any>()
  for (const s of saved) if (s && typeof s.key === 'string') byKey.set(s.key, s)
  const known = WIDGETS
    .filter((w) => byKey.has(w.key))
    .map((w) => ({
      key: w.key,
      visible: byKey.get(w.key).visible !== false,
      order: Number(byKey.get(w.key).order) || 0,
    }))
    .sort((a, b) =>
      a.order - b.order ||
      WIDGETS.findIndex((x) => x.key === a.key) - WIDGETS.findIndex((x) => x.key === b.key)
    )
  const knownSet = new Set(known.map((k) => k.key))
  const missing = WIDGETS.filter((w) => !knownSet.has(w.key))
  return [...known, ...missing.map((w, i) => ({ key: w.key, visible: true, order: known.length + i }))]
}

/** «۱۴۰۵-۰۷-۲۸» → «۲۸ مهر ۱۴۰۵» */
function longFa(dash: string): string {
  const d = parseJalali(String(dash || ''))
  return d ? toFaDigits(formatJalaliLong(d)) : toFaDigits(String(dash || '—'))
}

function truncFa(s: any, n = 80): string {
  const t = String(s || '')
  return t.length > n ? `${t.slice(0, n)}…` : t
}

/** آخرین کارت هر بخش چقدر کش بیاید تا ردیف کاملاً پر شود؟ (شبکهٔ داخلی همیشه ۲ ستونه) */
function spanFor(index: number, count: number): string {
  if (index !== count - 1) return ''
  const sm = 2 - ((count - 1) % 2)
  return cn(sm === 2 && 'sm:col-span-2')
}

/* ───────── اجزای کوچک ───────── */

function Chip({ icon, text, tone }: { icon: string; text: string; tone: 'rose' | 'amber' | 'emerald' }) {
  const tones: Record<string, string> = {
    rose: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', tones[tone])}>
      <Icon name={icon as any} className="h-3.5 w-3.5" />
      {text}
    </span>
  )
}

function BigNum({ value, suffix, tone }: { value: string; suffix?: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={cn('num text-xl font-black', tone || 'text-stone-700')}>{value}</span>
      {suffix ? <span className="text-[11px] text-stone-500">{suffix}</span> : null}
    </div>
  )
}

function EmptyOk({ text = 'موردی نیست' }: { text?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-stone-400">
      <I.check className="h-4 w-4 text-emerald-500" />
      {text}
    </div>
  )
}

function Tile({ def, span, iconCls, meta, onClick, children }: {
  def: WidgetDef
  span?: string
  iconCls: string
  meta?: string
  onClick: () => void
  children: any
}) {
  return (
    <Card
      className={cn('group cursor-pointer gap-0 py-0 transition hover:border-emerald-400 hover:shadow-md', span)}
      role="button"
      tabIndex={0}
      aria-label={def.title}
      onClick={onClick}
      onKeyDown={(e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
    >
      <CardContent className="flex h-full flex-col p-3.5">
        <div className="flex items-center gap-2.5">
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', iconCls)}>
            <Icon name={def.icon as any} className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-stone-700">{def.title}</span>
        </div>
        <div className="mt-2 flex-1">{children}</div>
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <span className="min-w-0 truncate text-[11px] leading-5 text-stone-500">{meta || ''}</span>
          <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-stone-400 transition-colors group-hover:text-primary">
            همه {def.link}
            <I.arrowLeft size={12} />
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

/* ───────── نمای اصلی ───────── */

export default function DashboardView() {
  const { user, go } = useShell()
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState(false)
  const [data, setData] = useState<any>(null)
  const [prefs, setPrefs] = useState<WPref[]>(DEFAULT_PREFS)
  const [pzOpen, setPzOpen] = useState(false)
  const [draft, setDraft] = useState<WPref[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    setLoadErr(false)
    const [home, prefsR] = await Promise.all([
      api('/api/home'),
      api('/api/me/prefs'),
    ])
    // خطای ترجیحات → بی‌صدا پیش‌فرض
    if (prefsR && prefsR.ok && prefsR.data?.prefs?.dash) {
      try { setPrefs(mergePrefs(prefsR.data.prefs.dash.widgets)) } catch { /* پیش‌فرض */ }
    }
    setLoading(false)
    if (!home || !home.ok) {
      setLoadErr(true)
      toast.error(home?.error || 'خطا در دریافت اطلاعات میزکار')
      return
    }
    setData(home.data || null)
  }

  /* ---- مشتقات ---- */
  const isManager = !!user && MANAGERS.includes(String(user.role))
  const today = todayJalali()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'صبح بخیر' : hour < 17 ? 'ظهر بخیر' : hour < 20 ? 'عصر بخیر' : 'شب بخیر'
  const weekday = String((jalaliWeekday as any)(new Date()) || '')
  const dateLong = toFaDigits(String(formatJalaliLong(new Date()) || ''))

  const myShift = useMemo(() => {
    const shifts = (data?.todayShifts || []) as any[]
    return shifts.find((s) => s?.user?.id && s.user.id === user?.id) || null
  }, [data, user])

  const stats = data?.stats || {}
  const tasks = (data?.myTasks || []) as any[]
  const tasksOpen = tasks.length
  const tasksOverdue = tasks.filter((t) => t && t.dueDate && String(t.dueDate) < today).length
  const tasksInProgress = tasks.filter((t) => t && t.status === 'IN_PROGRESS').length

  const clCards = (data?.checklistCards || []) as any[]
  const clTotal = clCards.reduce((s, c) => s + (Number(c.total) || 0), 0)
  const clDone = clCards.reduce((s, c) => s + (Number(c.done) || 0), 0)

  const pendingReturns = Number(stats.pendingReturns) || 0
  const myReturnsToday = Number(stats.myReturnsToday) || 0
  const problemsOpen = Number(data?.problemsOpen) || 0
  const activeOrders = Number(stats.activeOrders) || 0
  const receivingQueue = Number(stats.receivingQueue) || 0
  const chequesDue = Number(stats.chequesDue) || 0
  const lowCount = Number(stats.lowStock) || 0
  const lowTop3 = (data?.lowStockTop3 || []) as any[]
  const handover = data?.handoverLatest || null
  const wallPosts = ((data?.wall || []) as any[]).slice(0, 2)
  const myRank = Number(data?.myRank) || 0

  const actions = QUICK_ACTIONS.filter((a) => canSee(user, a.go, a.roles))

  const orderedDefs = useMemo(() => {
    return prefs
      .slice()
      .sort((a, b) => a.order - b.order)
      .filter((p) => p.visible)
      .map((p) => WIDGETS.find((w) => w.key === p.key))
      .filter(Boolean) as WidgetDef[]
  }, [prefs])

  /* ---- شخصی‌سازی ---- */
  function openPz() {
    setDraft(prefs.map((p) => ({ ...p })))
    setPzOpen(true)
  }
  function moveDraft(key: string, dir: -1 | 1) {
    setDraft((prev) => {
      const arr = prev.map((p) => ({ ...p }))
      const i = arr.findIndex((p) => p.key === key)
      const j = i + dir
      if (i < 0 || j < 0 || j >= arr.length) return prev
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t
      return arr
    })
  }
  function toggleDraft(key: string, visible: boolean) {
    setDraft((prev) => prev.map((p) => (p.key === key ? { ...p, visible } : p)))
  }
  async function savePz() {
    setSaving(true)
    const payload = draft.map((p, i) => ({ key: p.key, visible: p.visible, order: i }))
    const r = await api('/api/me/prefs', { method: 'POST', body: { prefs: { dash: { widgets: payload } } } })
    setSaving(false)
    if (!r || !r.ok) return toast.error(r?.error || 'ذخیره ترجیحات ناموفق بود')
    setPrefs(draft.map((p, i) => ({ ...p, order: i })))
    setPzOpen(false)
    toast.success('چیدمان میزکار شما ذخیره شد')
  }

  /* ---- بدنهٔ هر کارت ---- */
  function renderTile(def: WidgetDef, span: string) {
    const g = GROUPS.find((x) => x.key === def.group)!
    let iconCls = g.icon
    let body: any = null
    let meta = ''

    if (def.key === 'mytasks') {
      if (tasksOverdue > 0) iconCls = 'bg-rose-100 text-rose-700'
      body = tasksOpen === 0
        ? <EmptyOk text="وظیفهٔ بازی ندارید" />
        : (
          <>
            <BigNum value={`${tasksOpen >= 8 ? '+' : ''}${fa(tasksOpen)}`} suffix="وظیفهٔ باز" />
            {tasksOverdue > 0 ? (
              <div className="mt-1.5">
                <Chip icon="alertTriangle" tone="rose" text={`${fa(tasksOverdue)} مورد از سرسید گذشته`} />
              </div>
            ) : null}
          </>
        )
      meta = tasksOverdue > 0 ? 'اولویت اول امروز شما' : tasksInProgress > 0 ? `${fa(tasksInProgress)} مورد در حال انجام` : 'به‌روز'
    }

    else if (def.key === 'mychecklists') {
      body = clTotal === 0
        ? <EmptyOk text="چک‌لیستی برای امروز ثبت نشده" />
        : (
          <>
            <BigNum value={`${fa(clDone)} از ${fa(clTotal)}`} suffix="مورد انجام‌شده" />
            <Progress value={Math.round((clDone / Math.max(1, clTotal)) * 100)} className="mt-2.5 h-2" />
          </>
        )
      meta = clTotal > 0 ? `${fa(clTotal - clDone)} مورد باقی‌مانده` : 'امروز چک‌لیستی ندارید'
    }

    else if (def.key === 'returnsWait') {
      if (isManager && pendingReturns > 0) iconCls = 'bg-rose-100 text-rose-700'
      body = pendingReturns === 0
        ? (myReturnsToday === 0
          ? <EmptyOk />
          : <BigNum value={fa(myReturnsToday)} suffix="مرجوعی امروز من" />)
        : (
          <>
            <BigNum value={fa(pendingReturns)} suffix="در انتظار تأیید"
              tone={isManager ? 'text-rose-600' : 'text-amber-700'} />
            <div className="mt-1.5">
              <button
                type="button"
                onClick={(e: any) => { e.stopPropagation(); go('returns/history') }}
                className="inline-flex items-center gap-1 rounded-full bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
              >
                <I.receipt className="h-3 w-3" />
                مرجوعی امروز من: {fa(myReturnsToday)}
              </button>
            </div>
          </>
        )
      meta = isManager
        ? (pendingReturns > 0 ? 'نیازمند تأیید شما' : 'صف تأیید خالی است')
        : 'مرجوعی‌های ثبت‌شدهٔ امروز شما'
    }

    else if (def.key === 'problems') {
      body = problemsOpen === 0
        ? <EmptyOk />
        : <BigNum value={fa(problemsOpen)} suffix="مشکل باز" tone="text-amber-700" />
      meta = problemsOpen > 0 ? 'باز یا در حال بررسی' : 'مشکلی باز نیست'
    }

    else if (def.key === 'orders') {
      body = activeOrders === 0
        ? <EmptyOk />
        : <BigNum value={fa(activeOrders)} suffix="سفارش فعال" />
      meta = receivingQueue > 0 ? `${fa(receivingQueue)} در حال دریافت` : 'در جریان تأمین'
    }

    else if (def.key === 'cheques') {
      body = chequesDue === 0
        ? <EmptyOk />
        : <BigNum value={fa(chequesDue)} suffix="چک تا ۷ روز آینده" tone="text-amber-700" />
      meta = chequesDue > 0 ? 'سرسید نزدیک — بررسی موجودی' : 'چکی در ۷ روز آینده سرسید نمی‌شود'
    }

    else if (def.key === 'lowstock') {
      if (lowTop3.length > 0 && lowTop3.every((p) => Number(p.stock) <= 0)) iconCls = 'bg-rose-100 text-rose-700'
      body = (lowCount === 0 && lowTop3.length === 0)
        ? <EmptyOk />
        : (
          <>
            <BigNum value={fa(lowCount || lowTop3.length)} suffix="کالا زیر آستانه" tone="text-amber-700" />
            {lowTop3.length > 0 ? (
              <div className="mt-2 space-y-1">
                {lowTop3.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-[12px] leading-5">
                    <span className="min-w-0 flex-1 truncate text-stone-600">{p.name}</span>
                    <span className={cn('num shrink-0 font-bold', Number(p.stock) <= 0 ? 'text-rose-600' : 'text-amber-700')}>
                      {fa(Number(p.stock) || 0)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )
      meta = 'بحرانی‌ترین‌ها بر اساس آستانهٔ هوشمند'
    }

    else if (def.key === 'handover') {
      body = !handover
        ? <EmptyOk text="گزارشی ثبت نشده" />
        : (
          <>
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold',
              handover.acknowledged ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
              {handover.acknowledged ? <I.check className="h-3.5 w-3.5" /> : <I.clock className="h-3.5 w-3.5" />}
              {handover.acknowledged ? 'تحویل تأیید شد' : 'در انتظار تأیید دریافت'}
            </span>
            <div className="mt-2 truncate text-[12px] leading-6 text-stone-600">
              {handover.author?.fullName || '—'} · {SHIFT_LABEL[handover.shift] || 'شیفت'} · {longFa(handover.date)}
            </div>
          </>
        )
      meta = handover ? (handover.acknowledged ? 'دریافت‌شده توسط شیفت بعد' : 'تأیید دریافت انجام نشده') : 'آخرین گزارش تحویل شیفت'
    }

    else if (def.key === 'wall') {
      body = wallPosts.length === 0
        ? <EmptyOk text="پستی ثبت نشده" />
        : (
          <div className="space-y-1.5">
            {wallPosts.map((p) => (
              <div key={p.id} className="rounded-lg bg-stone-50 px-2.5 py-1.5 text-[12px] leading-5 text-stone-600">
                {p.pinned ? <span className="font-bold text-amber-700">سنجاق‌شده · </span> : null}
                {truncFa(p.content, 80)}
              </div>
            ))}
          </div>
        )
      const latestIso = wallPosts.reduce<string>(
        (m, p) => (p?.createdAt && String(p.createdAt) > m ? String(p.createdAt) : m), '')
      meta = latestIso ? `آخرین پست: ${longFa(formatJalali(new Date(latestIso)))}` : 'آخرین‌های دیوار خبری'
    }

    const target = def.key === 'returnsWait' && !isManager ? 'returns/history' : def.go
    return (
      <Tile key={def.key} def={def} span={span} iconCls={iconCls} meta={meta} onClick={() => go(target)}>
        {body}
      </Tile>
    )
  }

  /* ---- اسکلت بارگذاری ---- */
  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <div className="h-24 animate-pulse rounded-xl bg-stone-100" />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-stone-100" />
          ))}
        </div>
      </div>
    )
  }

  /* ---- سربرگ + بخش‌ها: چیدمان فشردهٔ دوستونه (دسکتاپ) ---- */
  const rankSuffix = myRank >= 1 && myRank <= 5 ? ` · رتبهٔ ${fa(myRank)}` : ''

  /* یک بخش گروه — عنوان کوچک + شبکهٔ ۲ ستونهٔ فشرده */
  function renderGroup(g: typeof GROUPS[number]) {
    const defs = orderedDefs.filter((d) => d.group === g.key)
    if (defs.length === 0) return null
    return (
      <section key={g.key} className="space-y-1.5">
        <h3 className="flex items-center gap-1.5 text-xs font-bold text-stone-500">
          <span className={cn('h-1.5 w-1.5 rounded-full', g.dot)} />
          {g.label}
          <span className="text-[10px] font-medium text-stone-400">({fa(defs.length)} کارت)</span>
        </h3>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {defs.map((def, i) => renderTile(def, spanFor(i, defs.length)))}
        </div>
      </section>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      {/* ردیف سربرگ: خلاصهٔ امروز (راست) + اقدامات سریع (چپ) */}
      <div className="flex flex-wrap items-stretch gap-2.5">
        <Card className="min-w-[240px] flex-1 gap-0 py-0">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-start gap-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <I.sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-extrabold text-stone-700">
                  {greeting}، {user?.honorific ? `${user.honorific} ` : ''}{user?.fullName || 'همکار گرامی'}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-stone-500">
                  <I.calendarDays className="h-3.5 w-3.5 text-emerald-600" />
                  {weekday ? `${weekday} ` : ''}{dateLong}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(user?.roleLabel || user?.title) ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10.5px] font-bold text-stone-600">
                      <I.userCheck className="h-3 w-3" />
                      {user.roleLabel || user.title}
                    </span>
                  ) : null}
                  {data ? (
                    myShift ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">
                        <I.clock className="h-3 w-3" />
                        {SHIFT_LABEL[myShift.shiftType || myShift.shift] || 'شیفت امروز'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10.5px] font-bold text-stone-400">
                        <I.clock className="h-3 w-3" />
                        بدون شیفت امروز
                      </span>
                    )
                  ) : null}
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-700">
                    <I.sparkles className="h-3 w-3" />
                    {fa(Number(user?.points) || 0)} امتیاز{rankSuffix}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* اقدامات سریع + شخصی‌سازی */}
        <div className="flex flex-wrap items-start gap-2">
          {actions.map((a) => (
            <Button key={a.go} variant="outline" size="sm" className="gap-1.5" onClick={() => go(a.go)}>
              <Icon name={a.icon as any} size={14} />
              {a.label}
            </Button>
          ))}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={openPz}>
            <I.settings size={14} />
            شخصی‌سازی
          </Button>
        </div>
      </div>

      {/* خطا */}
      {loadErr ? (
        <Card>
          <CardContent className="p-8 text-center">
            <I.alertTriangle className="mx-auto mb-3 text-amber-500" size={22} />
            <p className="text-sm text-stone-500">دریافت اطلاعات میزکار ناموفق بود</p>
            <div className="mt-4">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()}>
                <I.refresh size={14} />
                تلاش دوباره
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ردیف دوم: «روز من» و «وضعیت فروشگاه» کنار هم (دسکتاپ) */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {renderGroup(GROUPS[0])}
            {renderGroup(GROUPS[1])}
          </div>
          {/* «تیم و ارتباطات» — تمام‌عرض، کارت‌های عریض */}
          {renderGroup(GROUPS[2])}
        </>
      )}

      {/* دیالوگ شخصی‌سازی: نمایش/پنهان + جابه‌جایی با پیکان */}
      <Dialog open={pzOpen} onOpenChange={setPzOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>شخصی‌سازی میزکار</DialogTitle>
            <DialogDescription>
              کارت‌ها را نمایش یا پنهان کنید و با پیکان‌های بالا/پایین جابه‌جا کنید — ترتیب همین لیست، ترتیب میزکار شماست.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
            {draft.map((p, idx) => {
              const def = WIDGETS.find((w) => w.key === p.key)
              if (!def) return null
              const g = GROUPS.find((x) => x.key === def.group)!
              return (
                <div key={p.key} className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-2">
                  <Checkbox
                    checked={p.visible}
                    onCheckedChange={(v: any) => toggleDraft(p.key, v === true)}
                    aria-label={`نمایش ${def.title}`}
                  />
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', g.icon)}>
                    <Icon name={def.icon as any} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={cn('truncate text-[13px] font-bold text-stone-700', !p.visible && 'text-stone-400')}>
                      {def.title}
                    </div>
                    <div className="text-[10px] text-stone-500">{g.label}</div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <Button variant="outline" size="icon" className="size-7" disabled={idx === 0}
                      onClick={() => moveDraft(p.key, -1)} aria-label={`جابه‌جایی ${def.title} به بالا`}>
                      <I.chevronUp size={13} />
                    </Button>
                    <Button variant="outline" size="icon" className="size-7" disabled={idx === draft.length - 1}
                      onClick={() => moveDraft(p.key, 1)} aria-label={`جابه‌جایی ${def.title} به پایین`}>
                      <I.chevronDown size={13} />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-[10px] text-stone-400">«خلاصهٔ امروز من» همیشه بالای میزکار نمایش داده می‌شود و قابل پنهان‌سازی نیست.</p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPzOpen(false)}>انصراف</Button>
            <Button onClick={() => void savePz()} disabled={saving}>
              {saving ? 'در حال ذخیره…' : 'ذخیره'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
