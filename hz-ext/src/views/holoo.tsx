import {
  useState, useEffect, useMemo,
  api, toast, cn,
  Button, Input, Card, CardContent,
  Badge, Checkbox,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Tabs, TabsContent, TabsList, TabsTrigger,
  jsDateToJalali, toEnDigits, toFaDigits,
  fa, money,
  I,
} from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   system/holoo — اتصال هلو (OWNER/GM/ADMIN)
   ۱) ستون اصلی: تنظیمات اتصال (فعال‌سازی، حالت شبیه‌ساز/واقعی،
      نشانی، اعتبارنامه، نام بانک) + کارت‌های همگام‌سازی
      (کشیدن کالاها / اشخاص، ارسال سفارش و مرجوعی) + لاگ ۵۰ رکورد
   ۲) ستون وضعیت: فعال/غیرفعال، حالت، نشانی هدف، حساب هلو،
      شمار متصل‌ها، آزمایش اتصال، شناسنامهٔ شبیه‌ساز، سینک‌های اخیر
   ───────────────────────────────────────────────────────────── */

const ACTIVE_STATUSES = ['APPROVED', 'RECEIVING', 'RECEIVED', 'VERIFIED', 'ACCOUNTED']

type LastResult = { level: 'ok' | 'warn' | 'err'; title: string; detail?: string }

const KIND_META: Record<string, { label: string; icon: string; cls: string }> = {
  PULL_PRODUCTS: { label: 'دریافت کالاها', icon: 'package', cls: 'border-teal-300 bg-teal-50 text-teal-700' },
  PULL_SUPPLIERS: { label: 'دریافت اشخاص', icon: 'users', cls: 'border-teal-300 bg-teal-50 text-teal-700' },
  PUSH_ORDER: { label: 'ارسال سفارش', icon: 'send', cls: 'border-amber-300 bg-amber-50 text-amber-800' },
  PUSH_ORDERS_BULK: { label: 'ارسال گروهی سفارش‌ها', icon: 'send', cls: 'border-amber-300 bg-amber-50 text-amber-800' },
  PUSH_RETURN: { label: 'ارسال مرجوعی', icon: 'receipt', cls: 'border-rose-300 bg-rose-50 text-rose-700' },
}
function kindMeta(kind: string) {
  return KIND_META[kind] || { label: kind, icon: 'history', cls: 'border-stone-300 bg-stone-100 text-stone-600' }
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))

function clockFa(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return toFaDigits(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`)
}
function whenFa(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${toFaDigits(jsDateToJalali(d))} · ${clockFa(iso)}`
}

function parseStats(raw: string | null): Record<string, any> | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

/** خلاصهٔ فارسی آمار هر رکورد لاگ بر اساس نوع عملیات */
function statsSummary(kind: string, raw: string | null): string {
  const s = parseStats(raw)
  if (!s) return '—'
  if (kind === 'PULL_PRODUCTS' || kind === 'PULL_SUPPLIERS') {
    return `${fa(s.pulled)} خوانده‌شده · ${fa(s.created)} جدید · ${fa(s.updated)} به‌روزرسانی`
  }
  if (kind === 'PUSH_ORDER') {
    if (s.alreadyPushed) return `سفارش ${s.orderCode ?? '—'} قبلاً ارسال شده بود`
    const parts = [`سفارش ${s.orderCode ?? '—'} → فاکتور ${fa(String(s.invoiceNo ?? '—'))}`]
    if (s.items != null) parts.push(`${fa(s.items)} قلم`)
    if (s.productsCreated) parts.push(`${fa(s.productsCreated)} کالای جدید در هلو`)
    if (s.supplierCreated) parts.push('طرف حساب جدید در هلو')
    if (s.skipped) parts.push(`${fa(s.skipped)} قلم نادیده`)
    return parts.join(' · ')
  }
  if (kind === 'PUSH_ORDERS_BULK') {
    return `${fa(s.pushed)} ارسال‌شده · ${fa(s.failed)} ناموفق`
  }
  if (kind === 'PUSH_RETURN') {
    const parts = [`مرجوعی ${s.returnCode ?? '—'} → سند ${fa(String(s.sanadNo || s.invoiceNo || '—'))}`]
    if (s.items != null) parts.push(`${fa(s.items)} قلم`)
    if (s.total != null) parts.push(`${money(s.total)} ریال`)
    return parts.join(' · ')
  }
  const generic = Object.entries(s)
    .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? fa(v) : String(v)}`)
  return generic.join(' · ') || '—'
}

/* ═══════════════ قطعات کوچک ═══════════════ */

function KindBadge({ kind }: { kind: string }) {
  const m = kindMeta(kind)
  const Ico = (I as any)[m.icon] || I.history
  return (
    <Badge variant="outline" className={cn('gap-1 whitespace-nowrap text-[10px]', m.cls)}>
      <Ico size={11} />
      {m.label}
    </Badge>
  )
}

function ResultBox({ r, first }: { r: LastResult; first: boolean }) {
  const cls =
    r.level === 'ok'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : r.level === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-rose-200 bg-rose-50 text-rose-800'
  const Ico = r.level === 'ok' ? I.check : r.level === 'warn' ? I.info : I.alertTriangle
  return (
    <div className={cn('rounded-lg border p-2.5 text-[11px] leading-5', cls, first ? 'mt-3' : 'mt-2')}>
      <div className="flex items-center gap-1.5 font-bold">
        <Ico size={13} className="shrink-0" />
        {r.title}
      </div>
      {r.detail && <div className="mt-0.5 opacity-90">{r.detail}</div>}
    </div>
  )
}

function SyncCard(props: {
  icon: string
  tone: string
  title: string
  badge?: any
  desc: string
  actions: any
  busy: boolean
  busyLabel: string
  results: LastResult[]
  children?: any
}) {
  const Ico = (I as any)[props.icon] || I.refresh
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', props.tone)}>
            <Ico size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-stone-800">{props.title}</h3>
              {props.badge}
            </div>
            <p className="mt-1 text-xs leading-6 text-stone-500">{props.desc}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">{props.actions}</div>
        </div>
        {props.children}
        {props.busy && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
            <I.loader size={14} className="animate-spin text-emerald-600" />
            {props.busyLabel}
          </div>
        )}
        {props.results.map((r, i) => (
          <ResultBox key={i} r={r} first={i === 0 && !props.busy} />
        ))}
      </CardContent>
    </Card>
  )
}

function MiniStat({ icon, label, value, cls }: { icon: string; label: string; value: string; cls: string }) {
  const Ico = (I as any)[icon] || I.circleDot
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-2 text-center">
      <div className="flex items-center justify-center gap-1 text-[10px] leading-4 text-stone-500">
        <Ico size={11} className="shrink-0" />
        {label}
      </div>
      <div className={cn('mt-1 text-sm font-extrabold', cls)}>{value}</div>
    </div>
  )
}

/* ═══════════════ نمای اصلی ═══════════════ */

export default function HolooView() {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('settings')

  const [status, setStatus] = useState<any>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  /* فرم تنظیمات */
  const [form, setForm] = useState({ enabled: false, useMock: true, baseUrl: '', username: '', userpass: '', dbname: '' })
  const [passMask, setPassMask] = useState('')
  const [hasPass, setHasPass] = useState(false)
  const [saving, setSaving] = useState(false)

  /* آزمایش اتصال */
  const [testing, setTesting] = useState(false)
  const [testRes, setTestRes] = useState<{ ok: boolean; latencyMs?: number; currency?: string; error?: string } | null>(null)

  /* همگام‌سازی */
  const [ordersAll, setOrdersAll] = useState<any[]>([])
  const [allOrdersCount, setAllOrdersCount] = useState(0)
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  const [returnsPool, setReturnsPool] = useState<any[]>([])
  const [syncBusy, setSyncBusy] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, LastResult | undefined>>({})
  const [orderPick, setOrderPick] = useState('')
  const [orderCode, setOrderCode] = useState('')
  const [returnPick, setReturnPick] = useState('')

  const activeOrders = useMemo(
    () => ordersAll.filter((o) => ACTIVE_STATUSES.includes(String(o.status))),
    [ordersAll]
  )
  const pendingOrders = Math.max(0, allOrdersCount - Number(status?.orderCount ?? 0))
  const activeUrl = status ? (status.useMock ? status.mockUrl : status.baseUrl) : ''
  const busy = !!syncBusy

  /* ─── بارگذاری ─── */

  async function loadStatus() {
    const r = await api('/api/holoo/status')
    if (r.ok) setStatus(r.data)
    else toast.error(r.error)
    return r.ok
  }

  async function loadSettings() {
    const r = await api('/api/holoo/settings')
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    const d = r.data
    setForm({ enabled: !!d.enabled, useMock: !!d.useMock, baseUrl: d.baseUrl || '', username: d.username || '', userpass: '', dbname: d.dbname || '' })
    setPassMask(d.userpass || '')
    setHasPass(!!d.hasUserpass)
  }

  async function loadLogs() {
    setLogsLoading(true)
    const r = await api('/api/holoo/log')
    setLogsLoading(false)
    if (r.ok) setLogs(r.data.logs || [])
    else toast.error(r.error)
  }

  async function loadLists() {
    /* فهرست‌های کمکی — خطایشان جریان اصلی را نمی‌شکند (ممکن است دسترسی صفحهٔ سفارش‌ها محدود باشد) */
    const [o, rt] = await Promise.all([
      api('/api/orders?status=all&pageSize=100'),
      api('/api/returns?pageSize=20'),
    ])
    if (o.ok) {
      setOrdersAll(o.data.items || [])
      setAllOrdersCount(Number(o.data.counts?.all ?? (o.data.items || []).length))
      setOrdersLoaded(true)
    }
    if (rt.ok) setReturnsPool(rt.data.items || [])
  }

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await Promise.all([loadStatus(), loadSettings()])
      setLoading(false)
      void loadLogs()
      void loadLists()
    })()
  }, [])

  /* ─── تنظیمات ─── */

  async function saveSettings() {
    const baseUrl = form.baseUrl.trim()
    if (!form.useMock && !baseUrl) return toast.error('نشانی وب‌سرویس برای حالت سرور واقعی هلو الزامی است')
    if (!form.useMock && !/^https?:\/\/.+/i.test(baseUrl)) return toast.error('نشانی وب‌سرویس باید با http:// یا https:// شروع شود')
    setSaving(true)
    const body: Record<string, unknown> = {
      enabled: form.enabled,
      useMock: form.useMock,
      baseUrl,
      username: form.username.trim(),
      dbname: form.dbname.trim(),
    }
    if (form.userpass.trim()) body.userpass = form.userpass.trim()
    const r = await api('/api/holoo/settings', { method: 'PUT', body })
    setSaving(false)
    if (!r.ok) return toast.error(r.error)
    const d = r.data
    setForm((f) => ({ ...f, enabled: !!d.enabled, useMock: !!d.useMock, baseUrl: d.baseUrl || '', username: d.username || '', dbname: d.dbname || '', userpass: '' }))
    setPassMask(d.userpass || '')
    setHasPass(!!d.hasUserpass)
    setTestRes(null)
    toast.success('تنظیمات اتصال هلو ذخیره شد')
    void loadStatus()
  }

  /* ─── آزمایش اتصال ─── */

  async function runTest() {
    setTesting(true)
    setTestRes(null)
    const r = await api('/api/holoo/test')
    setTesting(false)
    if (r.ok) {
      setTestRes({ ok: true, latencyMs: r.data.latencyMs, currency: r.data.currency })
      toast.success(`اتصال برقرار است — ${fa(r.data.latencyMs)} میلی‌ثانیه`)
    } else {
      setTestRes({ ok: false, error: r.error })
      toast.error(r.error)
    }
  }

  /* ─── همگام‌سازی ─── */

  function resultFor(key: string, d: any): LastResult {
    if (key === 'products') {
      return {
        level: 'ok',
        title: `همگام‌سازی کالاها انجام شد — ${fa(d.pulled)} کالا`,
        detail: `${fa(d.pulled)} کالا از هلو خوانده شد؛ ${fa(d.created)} کالای جدید ثبت و ${fa(d.updated)} کالا به‌روزرسانی شد.`,
      }
    }
    if (key === 'suppliers') {
      return {
        level: 'ok',
        title: `همگام‌سازی اشخاص انجام شد — ${fa(d.pulled)} شخص`,
        detail: `${fa(d.pulled)} شخص (تأمین‌کننده) از هلو خوانده شد؛ ${fa(d.created)} جدید و ${fa(d.updated)} به‌روزرسانی شد.`,
      }
    }
    if (key === 'orders') {
      const errs = (Array.isArray(d.results) ? d.results : []).filter((x: any) => !x.ok)
      const errLine = errs.length
        ? `ناموفق‌ها: ${errs.slice(0, 3).map((x: any) => `${x.code} — ${x.error || 'خطای نامشخص'}`).join('، ')}${errs.length > 3 ? ' و…' : ''}`
        : 'همهٔ سفارش‌ها با موفقیت در هلو ثبت شد.'
      return {
        level: d.failed > 0 ? (d.pushed > 0 ? 'warn' : 'err') : 'ok',
        title: `${fa(d.pushed)} سفارش به هلو ارسال شد${d.failed ? ` — ${fa(d.failed)} ناموفق` : ''}`,
        detail: errLine,
      }
    }
    if (key === 'order') {
      if (d.alreadyPushed) {
        return {
          level: 'warn',
          title: `سفارش ${d.orderCode} قبلاً ارسال شده است`,
          detail: `این سفارش پیش‌تر با شناسهٔ هلو ${d.holooErp} ثبت شده است.`,
        }
      }
      return {
        level: 'ok',
        title: `سفارش ${d.orderCode} در هلو ثبت شد — فاکتور ${fa(String(d.invoiceNo || '—'))}`,
        detail:
          `${fa(d.items)} قلم ارسال شد` +
          (d.supplierCreated ? ' · طرف حساب تأمین‌کننده در هلو ساخته شد' : '') +
          (d.productsCreated ? ` · ${fa(d.productsCreated)} کالای جدید در هلو ساخته شد` : '') +
          (d.skipped ? ` · ${fa(d.skipped)} قلم نادیده گرفته شد (به هلو متصل نبود)` : '') +
          '.',
      }
    }
    if (key === 'return') {
      return {
        level: 'ok',
        title: `مرجوعی ${d.returnCode} در هلو ثبت شد — سند ${fa(String(d.sanadNo || d.invoiceNo || '—'))}`,
        detail: `فاکتور برگشت از فروش برای «${d.accountName}» ثبت شد — ${fa(d.items)} قلم به ارزش ${money(d.total)} ریال.`,
      }
    }
    return { level: 'ok', title: 'عملیات انجام شد' }
  }

  async function runSync(key: string, body: Record<string, unknown>): Promise<boolean> {
    if (!status?.enabled) {
      toast.error('اتصال هلو غیرفعال است — ابتدا از تب «تنظیمات» فعال کنید')
      return false
    }
    setSyncBusy(key)
    const r = await api('/api/holoo/sync', { method: 'POST', body })
    setSyncBusy(null)
    if (!r.ok) {
      setResults((m) => ({ ...m, [key]: { level: 'err', title: 'همگام‌سازی ناموفق بود', detail: r.error } }))
      toast.error(r.error)
      void loadLogs()
      return false
    }
    const res = resultFor(key, r.data)
    setResults((m) => ({ ...m, [key]: res }))
    if (res.level === 'ok') toast.success(res.title)
    else if (res.level === 'warn') toast.warning(res.title)
    else toast.error(res.title)
    void loadStatus()
    void loadLogs()
    void loadLists()
    return true
  }

  async function pushSingleOrder() {
    let id = orderPick || ''
    const code = toEnDigits(orderCode).trim()
    if (!id && code) {
      const hit = ordersAll.find((o: any) => String(o.code || '').toLowerCase() === code.toLowerCase())
      if (!hit) return toast.error('سفارشی با این کد در ۱۰۰ سفارش اخیر یافت نشد')
      id = hit.id
    }
    if (!id) return toast.error('ابتدا یک سفارش انتخاب کنید یا کد آن را وارد کنید')
    const done = await runSync('order', { what: 'order', mode: 'push', orderId: id })
    if (done) {
      setOrderPick('')
      setOrderCode('')
    }
  }

  /* ═══════════════ رندر ═══════════════ */

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-[76px] animate-pulse rounded-xl border border-stone-200 bg-stone-100" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <div className="h-10 animate-pulse rounded-lg bg-stone-100" />
            <div className="h-96 animate-pulse rounded-xl border border-stone-200 bg-stone-100" />
          </div>
          <div className="space-y-4">
            <div className="h-72 animate-pulse rounded-xl border border-stone-200 bg-stone-100" />
            <div className="h-44 animate-pulse rounded-xl border border-stone-200 bg-stone-100" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* سربرگ */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
          <I.link size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold text-stone-800">اتصال هلو</h1>
          <p className="text-xs leading-5 text-stone-500">
            یکپارچه‌سازی سامانهٔ سررسید با نرم‌افزار حسابداری هلو — کالاها، اشخاص، سفارش‌های خرید و مرجوعی‌ها
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {status?.enabled ? (
            <Badge className="gap-1 border-0 bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">
              <I.check size={11} /> فعال
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 border-stone-300 bg-stone-100 text-[10px] text-stone-500">
              غیرفعال
            </Badge>
          )}
          {status?.useMock ? (
            <Badge variant="outline" className="gap-1 border-teal-300 bg-teal-50 text-[10px] text-teal-700">
              <I.store size={11} /> شبیه‌ساز
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-[10px] text-amber-800">
              <I.zap size={11} /> سرور واقعی
            </Badge>
          )}
          {!status?.configured && (
            <Badge variant="outline" className="border-rose-300 bg-rose-50 text-[10px] text-rose-700">
              تنظیمات ناقص
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        {/* ═══ ستون اصلی ═══ */}
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid h-auto w-full grid-cols-3">
              <TabsTrigger value="settings" className="gap-1.5 py-2 text-xs sm:text-sm">
                <I.settings size={15} /> تنظیمات
              </TabsTrigger>
              <TabsTrigger value="sync" className="gap-1.5 py-2 text-xs sm:text-sm">
                <I.refresh size={15} /> همگام‌سازی
              </TabsTrigger>
              <TabsTrigger value="log" className="gap-1.5 py-2 text-xs sm:text-sm">
                <I.history size={15} /> گزارش‌ها و لاگ
              </TabsTrigger>
            </TabsList>

            {/* ─── تب تنظیمات ─── */}
            <TabsContent value="settings" className="mt-4 space-y-4">
              <Card className="gap-0 py-0">
                <CardContent className="p-4 sm:p-5">
                  <div className="mb-4 flex items-center gap-2 text-sm font-bold text-stone-800">
                    <I.settings size={16} className="text-stone-400" /> تنظیمات اتصال
                  </div>

                  {/* فعال‌سازی */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                      form.enabled ? 'border-emerald-300 bg-emerald-50/60' : 'border-stone-200 bg-stone-50/60'
                    )}
                  >
                    <Checkbox
                      checked={form.enabled}
                      onCheckedChange={(v: any) => setForm((f) => ({ ...f, enabled: v === true }))}
                      onClick={(e: any) => e.stopPropagation()}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-semibold text-stone-800">اتصال هلو فعال باشد</div>
                      <div className="mt-0.5 text-xs leading-5 text-stone-500">
                        پیش از همگام‌سازی و ارسال اسناد به هلو، اتصال باید فعال باشد.
                      </div>
                    </div>
                  </div>

                  {/* حالت اتصال */}
                  <div className="mt-5 space-y-2">
                    <div className="text-xs font-semibold text-stone-700">حالت اتصال</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, useMock: true }))}
                        className={cn(
                          'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors',
                          form.useMock
                            ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                            : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                        )}
                      >
                        <I.store size={15} /> شبیه‌ساز (آزمایشی)
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, useMock: false }))}
                        className={cn(
                          'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors',
                          !form.useMock
                            ? 'border-amber-600 bg-amber-500 text-white shadow-sm'
                            : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                        )}
                      >
                        <I.zap size={15} /> سرور واقعی هلو
                      </button>
                    </div>
                    <p className="text-[11px] leading-5 text-stone-400">
                      {form.useMock
                        ? 'در حالت شبیه‌ساز، درخواست‌ها به شبیه‌ساز محلی هلو (پورت ۳۰۴۰) ارسال می‌شود — مناسب تمرین و آزمایش جریان‌ها.'
                        : 'درخواست‌ها مستقیماً به وب‌سرویس هلو روی سرور شما ارسال می‌شود — پیش از فعال‌سازی، جریان‌ها را روی شبیه‌ساز بیازمایید.'}
                    </p>
                  </div>

                  {/* نشانی وب‌سرویس */}
                  <div className="mt-5 space-y-1.5">
                    <label className="text-xs font-semibold text-stone-700">نشانی وب‌سرویس</label>
                    <Input
                      dir="ltr"
                      className="font-mono text-xs"
                      placeholder="http://IP:8080/TncHoloo/api"
                      value={form.baseUrl}
                      onChange={(e: any) => setForm((f) => ({ ...f, baseUrl: String(e.target.value) }))}
                      disabled={form.useMock}
                    />
                    {form.useMock ? (
                      <p className="flex items-start gap-1 text-[11px] leading-5 text-amber-700">
                        <I.info size={12} className="mt-1 shrink-0" />
                        در حالت شبیه‌ساز این نشانی استفاده نمی‌شود — با انتخاب «سرور واقعی هلو» فعال می‌گردد.
                      </p>
                    ) : (
                      <p className="text-[11px] text-stone-400">
                        نشانی وب‌سرویس هلو روی سرور شما — معمولاً http://IP-سرور:8080/TncHoloo/api
                      </p>
                    )}
                  </div>

                  {/* نام کاربری + نام بانک */}
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-stone-700">نام کاربری</label>
                      <Input
                        dir="ltr"
                        className="font-mono text-xs"
                        placeholder="admin"
                        value={form.username}
                        onChange={(e: any) => setForm((f) => ({ ...f, username: String(e.target.value) }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-stone-700">نام بانک اطلاعاتی</label>
                      <Input
                        dir="ltr"
                        className="font-mono text-xs"
                        placeholder="Holoo1"
                        value={form.dbname}
                        onChange={(e: any) => setForm((f) => ({ ...f, dbname: String(e.target.value) }))}
                      />
                    </div>
                  </div>

                  {/* رمز عبور */}
                  <div className="mt-5 space-y-1.5">
                    <label className="text-xs font-semibold text-stone-700">رمز عبور</label>
                    <Input
                      dir="ltr"
                      type="password"
                      className="font-mono text-xs"
                      placeholder={hasPass ? passMask : '••••••••'}
                      value={form.userpass}
                      onChange={(e: any) => setForm((f) => ({ ...f, userpass: String(e.target.value) }))}
                    />
                    <p className="text-[11px] leading-5 text-stone-400">
                      {hasPass ? (
                        <>
                          رمز ذخیره‌شده: <span dir="ltr" className="font-mono">{passMask}</span> — برای تغییر، رمز جدید را وارد کنید.
                        </>
                      ) : (
                        'هنوز رمزی ذخیره نشده است. '
                      )}
                      رمز به‌صورت Base64 به هلو ارسال می‌شود؛ مقدار خام هم پذیرفته است.
                    </p>
                  </div>

                  <div className="mt-5 flex items-center justify-end gap-2 border-t border-stone-100 pt-4">
                    <Button
                      onClick={saveSettings}
                      disabled={saving}
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                    >
                      {saving ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />}
                      ذخیره تنظیمات
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── تب همگام‌سازی ─── */}
            <TabsContent value="sync" className="mt-4 space-y-4">
              {status && !status.enabled && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-6 text-rose-800">
                  <I.alertTriangle size={15} className="mt-0.5 shrink-0" />
                  <div>
                    اتصال هلو غیرفعال است — برای همگام‌سازی، ابتدا از تب «تنظیمات» گزینهٔ «اتصال هلو فعال باشد» را روشن کنید.
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
                <I.alertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
                <div>
                  پیش از خرید سامانهٔ گران‌قیمت هلو، همهٔ جریان‌ها را روی شبیه‌ساز بیازمایید — با فعال‌سازی حالت واقعی، همان
                  تنظیمات به سرور واقعی وصل می‌شود.
                </div>
              </div>

              {/* ۱) کشیدن کالاها */}
              <SyncCard
                icon="package"
                tone="bg-teal-50 text-teal-700"
                title="کشیدن کالاها از هلو"
                badge={
                  <Badge variant="outline" className="border-teal-200 bg-teal-50 text-[10px] text-teal-700">
                    {fa(status?.productCount ?? 0)} کالای متصل
                  </Badge>
                }
                desc="به‌روزرسانی موجودی، قیمت خرید، تعداد در کارتن و گروه کالا بر اساس کد کالا (= بارکد)؛ کالای جدید به‌صورت خودکار در سامانه ثبت می‌شود."
                busy={syncBusy === 'products'}
                busyLabel="در حال همگام‌سازی کالاها…"
                results={results.products ? [results.products] : []}
                actions={
                  <Button
                    size="sm"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                    disabled={busy || !status?.enabled}
                    onClick={() => runSync('products', { what: 'products', mode: 'pull' })}
                  >
                    <I.refresh size={13} /> شروع همگام‌سازی
                  </Button>
                }
              />

              {/* ۲) کشیدن اشخاص */}
              <SyncCard
                icon="users"
                tone="bg-teal-50 text-teal-700"
                title="کشیدن اشخاص / تأمین‌کنندگان از هلو"
                badge={
                  <Badge variant="outline" className="border-teal-200 bg-teal-50 text-[10px] text-teal-700">
                    {fa(status?.supplierCount ?? 0)} تأمین‌کنندهٔ متصل
                  </Badge>
                }
                desc="اشخاص فروشندهٔ هلو به‌عنوان تأمین‌کننده در سامانه ثبت یا به‌روزرسانی می‌شوند (نام، تلفن و شناسهٔ هلو)."
                busy={syncBusy === 'suppliers'}
                busyLabel="در حال همگام‌سازی اشخاص…"
                results={results.suppliers ? [results.suppliers] : []}
                actions={
                  <Button
                    size="sm"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                    disabled={busy || !status?.enabled}
                    onClick={() => runSync('suppliers', { what: 'suppliers', mode: 'pull' })}
                  >
                    <I.refresh size={13} /> شروع همگام‌سازی
                  </Button>
                }
              />

              {/* ۳) ارسال سفارش‌ها */}
              <SyncCard
                icon="send"
                tone="bg-amber-50 text-amber-700"
                title="ارسال سفارش‌ها به هلو"
                badge={
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-800">
                    {ordersLoaded ? `${fa(pendingOrders)} سفارش در انتظار ارسال` : 'سفارش‌های در انتظار ارسال'}
                  </Badge>
                }
                desc="سفارش خرید به‌صورت سفارش خرید هلو (فاکتور نوع ۳) ثبت می‌شود؛ تأمین‌کننده و کالاهای متصل در صورت نبود، ابتدا در هلو ساخته می‌شوند."
                busy={syncBusy === 'orders' || syncBusy === 'order'}
                busyLabel="در حال ارسال سفارش به هلو…"
                results={[results.orders, results.order].filter(Boolean) as LastResult[]}
                actions={
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50"
                    disabled={busy || !status?.enabled || (ordersLoaded && pendingOrders === 0)}
                    onClick={() => runSync('orders', { what: 'orders', mode: 'push' })}
                  >
                    <I.send size={13} /> ۱۰ سفارش اخیر را بفرست
                  </Button>
                }
              >
                <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50/60 p-3">
                  <div className="mb-2 text-[11px] font-bold text-stone-600">ارسال یک سفارش مشخص</div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Select value={orderPick} onValueChange={setOrderPick}>
                      <SelectTrigger className="h-9 w-full text-xs">
                        <SelectValue placeholder="انتخاب از سفارش‌های فعال" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeOrders.length ? (
                          activeOrders.map((o: any) => (
                            <SelectItem key={o.id} value={o.id} className="text-xs">
                              {o.code} · {o.supplierName || 'بدون تأمین‌کننده'} · {money(o.totalAmount)} ریال
                            </SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-2 text-center text-xs text-stone-400">سفارش فعالی برای ارسال نیست</div>
                        )}
                      </SelectContent>
                    </Select>
                    <Input
                      dir="ltr"
                      className="h-9 font-mono text-xs"
                      placeholder="یا کد سفارش؛ مانند HZ-ORD-005"
                      value={orderCode}
                      onChange={(e: any) => setOrderCode(String(e.target.value))}
                    />
                    <Button
                      size="sm"
                      className="h-9 gap-1.5 bg-amber-500 hover:bg-amber-600"
                      disabled={busy || !status?.enabled || (!orderPick && !orderCode.trim())}
                      onClick={pushSingleOrder}
                    >
                      <I.send size={13} /> ارسال
                    </Button>
                  </div>
                </div>
              </SyncCard>

              {/* ۴) ارسال مرجوعی */}
              <SyncCard
                icon="receipt"
                tone="bg-rose-50 text-rose-700"
                title="ارسال مرجوعی به هلو"
                badge={
                  returnsPool.length ? (
                    <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[10px] text-rose-700">
                      {fa(returnsPool.length)} مرجوعی اخیر
                    </Badge>
                  ) : undefined
                }
                desc="مرجوعی به‌صورت فاکتور برگشت از فروش (نوع ۲) در هلو ثبت می‌شود؛ طرف حساب مشتری در صورت نبود، به‌صورت خودکار ایجاد می‌شود. هر مرجوعی را فقط یک‌بار ارسال کنید — ارسال مجدد، سند تکراری در هلو ثبت می‌کند."
                busy={syncBusy === 'return'}
                busyLabel="در حال ارسال مرجوعی به هلو…"
                results={results.return ? [results.return] : []}
                actions={
                  <Button
                    size="sm"
                    className="gap-1.5 bg-rose-600 hover:bg-rose-700"
                    disabled={busy || !status?.enabled || !returnPick}
                    onClick={async () => {
                      const done = await runSync('return', { what: 'return', mode: 'push', returnId: returnPick })
                      if (done) setReturnPick('')
                    }}
                  >
                    <I.send size={13} /> ارسال به هلو
                  </Button>
                }
              >
                <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50/60 p-3">
                  <div className="mb-2 text-[11px] font-bold text-stone-600">انتخاب مرجوعی</div>
                  <Select value={returnPick} onValueChange={setReturnPick}>
                    <SelectTrigger className="h-9 w-full text-xs">
                      <SelectValue placeholder="انتخاب از ۲۰ مرجوعی اخیر" />
                    </SelectTrigger>
                    <SelectContent>
                      {returnsPool.length ? (
                        returnsPool.map((r: any) => (
                          <SelectItem key={r.id} value={r.id} className="text-xs">
                            {r.code} · {r.customerName || 'مشتری متفرقه'} · {money(r.totalAmount)} ریال
                          </SelectItem>
                        ))
                      ) : (
                        <div className="px-2 py-2 text-center text-xs text-stone-400">مرجوعی برای ارسال نیست</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </SyncCard>
            </TabsContent>

            {/* ─── تب گزارش‌ها و لاگ ─── */}
            <TabsContent value="log" className="mt-4 space-y-4">
              <Card className="gap-0 py-0">
                <CardContent className="p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-stone-800">
                      <I.history size={16} className="text-stone-400" /> گزارش‌های همگام‌سازی
                      <span className="text-xs font-normal text-stone-400">(۵۰ رکورد اخیر)</span>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={loadLogs} disabled={logsLoading}>
                      <I.refresh size={13} className={logsLoading ? 'animate-spin' : ''} /> به‌روزرسانی
                    </Button>
                  </div>

                  {logsLoading && !logs.length ? (
                    <div className="space-y-2">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-10 animate-pulse rounded-lg bg-stone-100" />
                      ))}
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-stone-200 py-12 text-center">
                      <I.history size={28} className="text-stone-300" />
                      <div className="text-sm font-semibold text-stone-500">هنوز همگام‌سازی‌ای انجام نشده</div>
                      <div className="text-xs text-stone-400">پس از اجرای همگام‌سازی، گزارش عملیات اینجا نمایش داده می‌شود.</div>
                    </div>
                  ) : (
                    <div className="max-h-[500px] overflow-auto rounded-lg border border-stone-200">
                      <Table className="min-w-[760px]">
                        <TableHeader className="sticky top-0 z-10 bg-stone-50">
                          <TableRow>
                            <TableHead className="whitespace-nowrap text-right text-[11px]">زمان</TableHead>
                            <TableHead className="whitespace-nowrap text-right text-[11px]">عملیات</TableHead>
                            <TableHead className="whitespace-nowrap text-right text-[11px]">وضعیت</TableHead>
                            <TableHead className="text-right text-[11px]">جزئیات</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {logs.map((l: any) => (
                            <TableRow key={l.id} className="text-xs">
                              <TableCell className="whitespace-nowrap text-stone-500">{whenFa(l.createdAt)}</TableCell>
                              <TableCell>
                                <KindBadge kind={l.kind} />
                              </TableCell>
                              <TableCell>
                                {l.status === 'OK' ? (
                                  <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">
                                    <I.check size={11} /> موفق
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="gap-1 border-rose-200 bg-rose-50 text-[10px] text-rose-700">
                                    <I.x size={11} /> ناموفق
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="max-w-[360px]">
                                {l.status === 'FAIL' && l.error ? (
                                  <div className="truncate text-rose-700" title={l.error}>
                                    {l.error}
                                  </div>
                                ) : (
                                  <div className="truncate text-stone-600" title={statsSummary(l.kind, l.stats)}>
                                    {statsSummary(l.kind, l.stats)}
                                  </div>
                                )}
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
          </Tabs>
        </div>

        {/* ═══ ستون وضعیت ═══ */}
        <aside className="space-y-4">
          {/* وضعیت اتصال */}
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-stone-800">
                  <I.link size={15} className="text-stone-400" /> وضعیت اتصال
                </div>
                {status?.enabled ? (
                  <Badge className="gap-1 border-0 bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">
                    <I.check size={11} /> فعال
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-stone-300 bg-stone-100 text-[10px] text-stone-500">
                    غیرفعال
                  </Badge>
                )}
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-2.5 py-2">
                  <span className="text-stone-500">حالت</span>
                  {status?.useMock ? (
                    <span className="flex items-center gap-1 font-bold text-teal-700">
                      <I.store size={13} /> شبیه‌ساز (آزمایشی)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 font-bold text-amber-700">
                      <I.zap size={13} /> سرور واقعی هلو
                    </span>
                  )}
                </div>

                <div className="rounded-lg bg-stone-50 px-2.5 py-2">
                  <div className="mb-1 text-stone-500">نشانی هدف</div>
                  <div dir="ltr" className="truncate font-mono text-[11px] text-stone-700" title={activeUrl}>
                    {activeUrl || '—'}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-2.5 py-2">
                  <span className="shrink-0 text-stone-500">حساب هلو</span>
                  <span dir="ltr" className="truncate font-mono text-[11px] font-bold text-stone-700">
                    {status?.username || '—'}@{status?.dbname || '—'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <MiniStat icon="package" label="کالاهای متصل" value={fa(status?.productCount ?? 0)} cls="text-teal-700" />
                  <MiniStat icon="users" label="تأمین‌کنندگان متصل" value={fa(status?.supplierCount ?? 0)} cls="text-teal-700" />
                  <MiniStat icon="send" label="سفارش‌های ارسالی" value={fa(status?.orderCount ?? 0)} cls="text-amber-700" />
                </div>
              </div>

              {/* آزمایش اتصال */}
              <div className="mt-4 border-t border-stone-100 pt-3">
                <Button
                  size="sm"
                  className="w-full gap-2 bg-stone-800 hover:bg-stone-900"
                  onClick={runTest}
                  disabled={testing}
                >
                  {testing ? <I.loader size={14} className="animate-spin" /> : <I.zap size={14} />} آزمایش اتصال
                </Button>

                {testRes &&
                  (testRes.ok ? (
                    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-[11px] leading-5 text-emerald-800">
                      <div className="flex items-center gap-1.5 font-bold">
                        <I.check size={13} /> اتصال برقرار است — {fa(testRes.latencyMs ?? 0)} میلی‌ثانیه
                      </div>
                      {testRes.currency && <div className="mt-0.5 opacity-80">واحد پول سامانه: {testRes.currency}</div>}
                    </div>
                  ) : (
                    <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[11px] leading-5 text-rose-800">
                      <div className="flex items-center gap-1.5 font-bold">
                        <I.alertTriangle size={13} /> اتصال برقرار نشد
                      </div>
                      <div className="mt-0.5 opacity-90">{testRes.error}</div>
                      {status?.useMock && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <span>سرویس را اجرا کنید:</span>
                          <code
                            dir="ltr"
                            className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-rose-900 ring-1 ring-rose-200"
                          >
                            cd mini-services/holoo-sim && bun run dev
                          </code>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* شناسنامهٔ شبیه‌ساز — فقط در حالت شبیه‌ساز */}
          {status?.useMock && (
            <Card className="gap-0 border-teal-200 bg-teal-50/40 py-0">
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-teal-800">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-500" />
                  </span>
                  شبیه‌ساز هلو در حال اجراست
                </div>
                <div className="space-y-1.5 rounded-lg bg-white/70 p-2.5 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-stone-500">نام کاربری</span>
                    <span dir="ltr" className="font-mono font-bold text-stone-700">admin</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-stone-500">رمز عبور</span>
                    <span dir="ltr" className="font-mono font-bold text-stone-700">admin</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-stone-500">Base64 رمز</span>
                    <span dir="ltr" className="font-mono font-bold text-stone-700">YWRtaW4=</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-stone-500">نام بانک</span>
                    <span dir="ltr" className="font-mono font-bold text-stone-700">Holoo1</span>
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-teal-900/80">
                  برای اتصال به سامانهٔ واقعی هلو، از تب «تنظیمات» حالت «سرور واقعی هلو» را انتخاب و نشانی سرور را وارد
                  کنید — همهٔ جریان‌ها بدون تغییر کد، روی هلو واقعی اجرا می‌شود.
                </p>
              </CardContent>
            </Card>
          )}

          {/* آخرین همگام‌سازی‌ها */}
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-stone-800">
                <I.history size={15} className="text-stone-400" /> آخرین همگام‌سازی‌ها
              </div>
              {!status || status.lastSyncs?.length === 0 ? (
                <div className="rounded-lg border border-dashed border-stone-200 py-6 text-center text-xs text-stone-400">
                  هنوز همگام‌سازی‌ای انجام نشده
                </div>
              ) : (
                <div className="space-y-1.5">
                  {status.lastSyncs.slice(0, 5).map((s: any) => (
                    <div key={s.id} className="rounded-lg border border-stone-100 bg-stone-50/60 px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <KindBadge kind={s.kind} />
                        <span className="flex shrink-0 items-center gap-1 text-[10px] text-stone-400">
                          {s.status === 'OK' ? (
                            <I.check size={11} className="text-emerald-600" />
                          ) : (
                            <I.x size={11} className="text-rose-600" />
                          )}
                          {whenFa(s.createdAt)}
                        </span>
                      </div>
                      <div
                        className="mt-1 truncate text-[11px] text-stone-500"
                        title={s.status === 'FAIL' && s.error ? s.error : statsSummary(s.kind, s.stats)}
                      >
                        {s.status === 'FAIL' && s.error ? s.error : statsSummary(s.kind, s.stats)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
