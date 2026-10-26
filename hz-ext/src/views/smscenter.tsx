import {
  useState, useEffect, useMemo, api, toast, cn, useShell,
  Button, Input, Card, CardContent, CardHeader, CardTitle, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Tabs, TabsContent, TabsList, TabsTrigger, Checkbox, Textarea,
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  fa, toEnDigits, toFaDigits, formatJalali, I,
} from '../lib/hz'

/* ═══════════════════════════════════════════════════════════════
   system/smscenter — «مرکز پیامک» (R4-5)
   ۱) پنل‌ها — پیکربندی ۸ سرویس‌دهندهٔ ایرانی + پنل سفارشی،
      حالت شبیه‌سازی/واقعی، پنل پیش‌فرض، آزمایش ارسال
   ۲) ارسال پیام — مخاطب (همه/نقش/شمارهٔ دستی) + قالب سریع
   ۳) قالب‌ها — قالب‌های متنی سناریوها ({name} {amount} {code} {date})
   ۴) گزارش ارسال — صف خروجی با وضعیت، فیلتر و ارسال مجدد
   ═══════════════════════════════════════════════════════════════ */

type Panel = {
  id: string
  name: string
  provider: string
  providerTitle: string
  mode: string
  settings: Record<string, string>
  active: boolean
  isDefault: boolean
  lastTestAt: string | null
  lastTestOk: boolean | null
  note: string
  createdAt: string
}

type Template = {
  id: string
  key: string
  title: string
  body: string
  enabled: boolean
  createdAt: string
}

type OutboxRow = {
  id: string
  to: string
  toName: string
  text: string
  reason: string
  status: string
  provider: string
  messageId: string | null
  error: string | null
  createdAt: string
  sentAt: string | null
}

const ROLES: { key: string; label: string }[] = [
  { key: 'OWNER', label: 'مدیر عامل' },
  { key: 'GM', label: 'مدیر کل' },
  { key: 'ADMIN', label: 'مدیر عملیات و IT' },
  { key: 'EXEC', label: 'مدیر اجرایی' },
  { key: 'ACC', label: 'حسابدار' },
  { key: 'PM', label: 'مدیر محصولات' },
  { key: 'HC', label: 'صندوقدار ارشد' },
  { key: 'SK', label: 'انباردار' },
  { key: 'SALES', label: 'فروشنده' },
  { key: 'CASHIER', label: 'صندوقدار' },
  { key: 'MERCH', label: 'نیروی چیدمان' },
]
const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.key, r.label]))

type FieldDef = { k: string; label: string; ph?: string; area?: boolean; hint?: string }
type ProviderDef = { key: string; title: string; fields: FieldDef[]; help: string }

/** آینهٔ PROVIDER_META در src/lib/sms.ts (فیلدهای اعتبارنامهٔ هر سرویس‌دهنده) */
const PROVIDERS: ProviderDef[] = [
  {
    key: 'melipayamak', title: 'ملی‌پیامک',
    help: 'نام کاربری و رمز پنل ملی‌پیامک + شمارهٔ خط ارسال‌کننده — سرویس rest.payamak-panel.com',
    fields: [
      { k: 'username', label: 'نام کاربری', ph: 'username' },
      { k: 'password', label: 'رمز عبور', ph: '••••••' },
      { k: 'from', label: 'شمارهٔ خط ارسال‌کننده', ph: '5000…' },
    ],
  },
  {
    key: 'farazsms', title: 'فراز اس‌ام‌اس (IPPanel)',
    help: 'کلید API پنل IPPanel/فراز + شمارهٔ خط ارسال‌کننده — api2.ippanel.com',
    fields: [
      { k: 'apiKey', label: 'کلید API', ph: 'کلید پنل…' },
      { k: 'from', label: 'شمارهٔ خط ارسال‌کننده', ph: '+98… یا ۳۰۰۰…' },
    ],
  },
  {
    key: 'payamresan', title: 'پیام‌رسان',
    help: 'نام کاربری و رمز پیام‌رسان + خط ارسال — sms.payam-resan.com',
    fields: [
      { k: 'username', label: 'نام کاربری' },
      { k: 'password', label: 'رمز عبور' },
      { k: 'from', label: 'شمارهٔ خط ارسال‌کننده' },
    ],
  },
  {
    key: 'webone', title: 'وب‌وان',
    help: 'پنل وب‌وان — نشانی پایه + نام کاربری/رمز + خط ارسال (sender)',
    fields: [
      { k: 'baseUrl', label: 'نشانی پایهٔ پنل', ph: 'https://panel.example.ir' },
      { k: 'username', label: 'نام کاربری' },
      { k: 'password', label: 'رمز عبور' },
      { k: 'sender', label: 'شمارهٔ خط ارسال (sender)' },
    ],
  },
  {
    key: 'niksms', title: 'نیک‌پیامک',
    help: 'نام کاربری و رمز نیک‌پیامک + خط ارسال — niksms.com',
    fields: [
      { k: 'username', label: 'نام کاربری' },
      { k: 'password', label: 'رمز عبور' },
      { k: 'from', label: 'شمارهٔ خط ارسال‌کننده' },
    ],
  },
  {
    key: 'payamito', title: 'پیامیتو',
    help: 'کلید API پیامیتو + شمارهٔ خط — api.payamito.com',
    fields: [
      { k: 'apiKey', label: 'کلید API' },
      { k: 'from', label: 'شمارهٔ خط ارسال‌کننده' },
    ],
  },
  {
    key: 'smsir', title: 'پیامک رسا (SMS.ir)',
    help: 'کلید API رسا + شمارهٔ خط خدماتی (lineNumber) — api.sms.ir',
    fields: [
      { k: 'apiKey', label: 'کلید API' },
      { k: 'lineNumber', label: 'شمارهٔ خط خدماتی', ph: '۳۰۰۰…' },
    ],
  },
  {
    key: 'farapayamak', title: 'فراپیامک',
    help: 'نام کاربری/رمز فراپیامک + خط ارسال؛ نشانی پایه اختیاری (پیش‌فرض farapayamak.ir)',
    fields: [
      { k: 'baseUrl', label: 'نشانی پایه (اختیاری)', ph: 'https://farapayamak.ir' },
      { k: 'username', label: 'نام کاربری' },
      { k: 'password', label: 'رمز عبور' },
      { k: 'sender', label: 'شمارهٔ خط ارسال (sender)' },
    ],
  },
  {
    key: 'custom', title: 'پنل سفارشی',
    help: 'آداپتور عمومی — متد GET/POST، الگوی نشانی با جای‌نگرد‌های {to} {from} {text} {username} {password} و هدرهای JSON',
    fields: [
      { k: 'method', label: 'متد درخواست', ph: 'GET یا POST', hint: 'پیش‌فرض POST' },
      { k: 'urlTemplate', label: 'الگوی نشانی (urlTemplate)', area: true, ph: 'https://panel.example.ir/send?to={to}&from={from}&text={text}&user={username}&pass={password}' },
      { k: 'headers', label: 'هدرها (JSON)', area: true, ph: '{"Authorization":"Bearer …"}', hint: 'اختیاری — JSON معتبر' },
      { k: 'from', label: 'شمارهٔ خط (اختیاری)' },
      { k: 'username', label: 'نام کاربری (اختیاری)' },
      { k: 'password', label: 'رمز عبور (اختیاری)' },
    ],
  },
]
const PROVIDER_TITLE: Record<string, string> = Object.fromEntries(PROVIDERS.map((p) => [p.key, p.title]))
const providerDef = (key: string) => PROVIDERS.find((p) => p.key === key)

const REASON_LABEL: Record<string, string> = {
  LOW_STOCK: 'اتمام موجودی',
  MANUAL: 'دستی',
  TEST: 'آزمایش پنل',
  PAYMENT_SUBMITTED: 'ثبت پرداخت',
  RETURN_PAYMENT: 'پرداخت مرجوعی',
  RETURN_CUSTOMER: 'پیام مرجوعی به مشتری',
  STAFF_BROADCAST: 'اطلاع‌رسانی کارکنان',
  RETRY: 'ارسال مجدد',
  SYSTEM: 'سیستم',
}

/* ── R10-MSG: الگوهای پیام مرجوعی ── */
const RT_REASONS = ['کالای معیوب', 'اشتباه در خرید', 'اختلاف قیمت', 'انقضای کالا', 'عدم رضایت از کیفیت', 'خطای کارت‌خوان', 'سایر']
const RT_WILDCARD = '*'
const RT_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: '{مشتری}', label: 'نام مشتری' },
  { key: '{مبلغ}', label: 'مبلغ (ریال)' },
  { key: '{کد}', label: 'کد پیگیری' },
  { key: '{تاریخ}', label: 'تاریخ شمسی' },
  { key: '{علت}', label: 'علت مرجوعی' },
  { key: '{بانک}', label: 'بانک' },
  { key: '{شماره‌پیگیری}', label: 'شماره پیگیری' },
]

type ReturnTpl = {
  id: string
  reason: string
  title: string
  body: string
  enabled: boolean
}

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  SENT: { label: 'ارسال شد', cls: 'border-emerald-300 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
  FAILED: { label: 'ناموفق', cls: 'border-rose-300 bg-rose-50 text-rose-800', dot: 'bg-rose-500' },
  SKIPPED: { label: 'صرف‌نظر', cls: 'border-amber-300 bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  PENDING: { label: 'در انتظار', cls: 'border-stone-300 bg-stone-100 text-stone-600', dot: 'bg-stone-400' },
}
const statusMeta = (s: string) => STATUS_META[s] || { label: s, cls: 'border-stone-300 bg-stone-100 text-stone-600', dot: 'bg-stone-400' }

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))

/** ۱۴۰۵/۰۷/۲۸ · ۱۴:۳۰ — ارقام فارسی با جداکنندهٔ ممیز */
function whenFa(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${toFaDigits(formatJalali(d))} · ${toFaDigits(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`)}`
}

/** نرمال‌سازی شمارهٔ موبایل به ۰۹xxxxxxxxx ( null = نامعتبر ) */
function normMobile(input: string): string | null {
  let s = toEnDigits(String(input ?? '')).replace(/[\s\-()._]/g, '')
  if (s.startsWith('+98')) s = '0' + s.slice(3)
  else if (s.startsWith('0098')) s = '0' + s.slice(4)
  else if (s.length === 12 && s.startsWith('98')) s = '0' + s.slice(2)
  else if (s.length === 10 && s.startsWith('9')) s = '0' + s
  return /^09\d{9}$/.test(s) ? s : null
}

/* ── قطعه‌های کوچک ─────────────────────────────────────────── */

function StatusChip({ status }: { status: string }) {
  const m = statusMeta(status)
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold', m.cls)}>
      <span className={cn('size-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  )
}

function ModeToggle({ mode, onChange, disabled }: { mode: string; onChange: (m: string) => void; disabled?: boolean }) {
  const isMock = mode !== 'real'
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-stone-300 bg-stone-50 p-0.5" dir="rtl">
      <button type="button" disabled={disabled}
        className={cn('rounded-md px-2 py-1 text-[11px] font-bold transition-colors', isMock ? 'bg-amber-500 text-white' : 'text-stone-500 hover:text-stone-700')}
        onClick={() => onChange('mock')}>شبیه‌سازی</button>
      <button type="button" disabled={disabled}
        className={cn('rounded-md px-2 py-1 text-[11px] font-bold transition-colors', !isMock ? 'bg-emerald-600 text-white' : 'text-stone-500 hover:text-stone-700')}
        onClick={() => onChange('real')}>واقعی</button>
    </div>
  )
}

/* ═══════════════════════ نمای اصلی ═══════════════════════ */

export default function SmsCenterView() {
  /* ── R10-MSG: کاربر جاری برای گیتِ مدیران (پوستهٔ زنده؛ در نبودش /api/auth/me) ── */
  const { user: shellUser } = useShell()
  const [meUser, setMeUser] = useState<any>(null)
  const user = shellUser || meUser
  const isMgr = ['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(String(user?.role ?? ''))

  /* ── داده‌ها ── */
  const [panels, setPanels] = useState<Panel[]>([])
  const [stats, setStats] = useState<Record<string, number>>({})
  const [templates, setTemplates] = useState<Template[]>([])
  const [outbox, setOutbox] = useState<OutboxRow[]>([])
  const [loading, setLoading] = useState(true)
  const [cfgDenied, setCfgDenied] = useState(false) // 403 → زبانه‌های تنظیمات پنهان

  /* ── دیالوگ پنل ── */
  const [addOpen, setAddOpen] = useState(false)
  const [addProvider, setAddProvider] = useState('melipayamak')
  const [addName, setAddName] = useState('')
  const [addMode, setAddMode] = useState('mock')
  const [addDefault, setAddDefault] = useState(false)
  const [addSettings, setAddSettings] = useState<Record<string, string>>({})
  const [editPanel, setEditPanel] = useState<Panel | null>(null)
  const [editSettings, setEditSettings] = useState<Record<string, string>>({})
  const [testPanel, setTestPanel] = useState<Panel | null>(null)
  const [testTo, setTestTo] = useState('')
  const [delPanel, setDelPanel] = useState<Panel | null>(null)
  const [busy, setBusy] = useState(false)

  /* ── ارسال پیام ── */
  const [audience, setAudience] = useState('MANUAL')
  const [manualText, setManualText] = useState('')
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendRows, setSendRows] = useState<OutboxRow[]>([])

  /* ── قالب‌ها ── */
  const [tplOpen, setTplOpen] = useState(false)
  const [tplKey, setTplKey] = useState('')
  const [tplTitle, setTplTitle] = useState('')
  const [tplBody, setTplBody] = useState('')

  /* ── گزارش ── */
  const [statusF, setStatusF] = useState('all')

  /* ── R10-MSG: الگوهای پیام مرجوعی ── */
  const [rtList, setRtList] = useState<ReturnTpl[]>([])
  const [rtOpen, setRtOpen] = useState(false)
  const [rtEdit, setRtEdit] = useState<ReturnTpl | null>(null)
  const [rtReason, setRtReason] = useState(RT_REASONS[0])
  const [rtTitle, setRtTitle] = useState('')
  const [rtBody, setRtBody] = useState('')
  const [rtBusy, setRtBusy] = useState(false)
  const [rtDel, setRtDel] = useState<ReturnTpl | null>(null)

  /* ═══ بارگذاری ═══ */
  async function loadPanels(silent = false) {
    const r = await api('/api/sms/panels')
    if (!r.ok) {
      if (!silent) {
        setCfgDenied(true)
        toast.error(r.error || 'دسترسی به تنظیمات پنل پیامک ندارید')
      }
      return
    }
    setCfgDenied(false)
    setPanels(r.data.panels || [])
    setStats(r.data.stats || {})
  }

  async function loadTemplates() {
    const r = await api('/api/sms/templates')
    if (r.ok) setTemplates(r.data.items || [])
  }

  async function loadOutbox() {
    const q = statusF !== 'all' ? `?status=${statusF}` : ''
    const r = await api(`/api/sms/outbox${q}`)
    if (r.ok) setOutbox(r.data.items || [])
  }

  /* ── R10-MSG: الگوهای پیام مرجوعی ── */
  async function loadRtpls() {
    const r = await api('/api/return-templates')
    if (r.ok) setRtList(r.data.items || [])
  }

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await Promise.all([loadPanels(), loadTemplates(), loadOutbox(), loadRtpls()])
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    if (!shellUser) {
      void api('/api/auth/me').then((r: any) => { if (r.ok) setMeUser(r.data?.user ?? null) })
    }
  }, [])

  useEffect(() => { void loadOutbox() }, [statusF])

  /* ═══ عملیات پنل ═══ */
  async function patchPanel(p: Panel, body: Record<string, unknown>) {
    const r = await api(`/api/sms/panels/${p.id}`, { method: 'PATCH', body })
    if (!r.ok) return toast.error(r.error || 'ذخیره نشد')
    toast.success('ذخیره شد')
    void loadPanels(true)
  }

  async function createPanel() {
    const def = providerDef(addProvider)
    if (!addName.trim()) return toast.error('نام پنل را وارد کنید')
    setBusy(true)
    const r = await api('/api/sms/panels', {
      method: 'POST',
      body: {
        name: addName.trim(),
        provider: addProvider,
        mode: addMode,
        settings: addSettings,
        isDefault: addDefault,
        active: addDefault ? true : false,
        note: def ? `پنل ${def.title}` : '',
      },
    })
    setBusy(false)
    if (!r.ok) return toast.error(r.error || 'ایجاد پنل ناموفق بود')
    toast.success(`پنل «${addName.trim()}» ساخته شد`)
    setAddOpen(false); setAddName(''); setAddSettings({}); setAddDefault(false); setAddMode('mock')
    void loadPanels(true)
  }

  async function saveEditPanel() {
    if (!editPanel) return
    if (!editPanel.name.trim()) return toast.error('نام پنل را وارد کنید')
    setBusy(true)
    const r = await api(`/api/sms/panels/${editPanel.id}`, {
      method: 'PATCH',
      body: {
        name: editPanel.name.trim(),
        mode: editPanel.mode,
        note: editPanel.note,
        settings: editSettings,
      },
    })
    setBusy(false)
    if (!r.ok) return toast.error(r.error || 'ذخیره نشد')
    toast.success('تنظیمات پنل ذخیره شد')
    setEditPanel(null)
    void loadPanels(true)
  }

  async function runTest() {
    if (!testPanel) return
    if (!normMobile(testTo)) return toast.error('شمارهٔ موبایل نامعتبر است (۰۹xxxxxxxxx)')
    setBusy(true)
    const r = await api(`/api/sms/panels/${testPanel.id}/test`, { method: 'POST', body: { to: testTo } })
    setBusy(false)
    if (!r.ok) return toast.error(r.error || 'آزمایش ناموفق بود')
    if (r.data.ok) toast.success(`پیام آزمایشی ${testPanel.mode === 'real' ? 'ارسال شد' : 'شبیه‌سازی شد'} ✓`)
    else toast.error(r.data.error || 'ارسال آزمایشی ناموفق بود')
    setTestPanel(null); setTestTo('')
    void loadPanels(true)
    void loadOutbox()
  }

  async function deletePanel() {
    if (!delPanel) return
    setBusy(true)
    const r = await api(`/api/sms/panels/${delPanel.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!r.ok) return toast.error(r.error || 'حذف ناموفق بود')
    toast.success(`پنل «${delPanel.name}» حذف شد`)
    setDelPanel(null)
    void loadPanels(true)
  }

  /* ═══ ارسال پیام ═══ */
  const manualEntries = useMemo(
    () => manualText.split(/[,،؛\n;]+/).map((s) => s.trim()).filter(Boolean).map((raw) => ({ raw, norm: normMobile(raw) })),
    [manualText],
  )
  const validManual = manualEntries.filter((e) => e.norm)
  const invalidManual = manualEntries.filter((e) => !e.norm)
  const defaultPanel = panels.find((p) => p.isDefault && p.active) || null

  async function doSend() {
    const text = msgText.trim()
    if (!text) return toast.error('متن پیامک را وارد کنید')
    if (audience === 'MANUAL') {
      if (!manualEntries.length) return toast.error('حداقل یک شماره وارد کنید')
      if (!validManual.length) return toast.error('همهٔ شماره‌ها نامعتبرند')
    }
    setSending(true)
    const body: Record<string, unknown> = { text }
    if (audience === 'MANUAL') {
      body.to = manualEntries.map((e) => e.raw)
      body.reason = 'MANUAL'
    } else {
      body.audience = audience
      body.reason = 'STAFF_BROADCAST'
    }
    const r = await api('/api/sms/send', { method: 'POST', body })
    setSending(false)
    if (!r.ok) return toast.error(r.error || 'ارسال ناموفق بود')
    const { rows = [], sent = 0, failed = 0, skipped = 0 } = r.data
    setSendRows(rows)
    toast.success(`نتیجه: ${fa(sent)} ارسال‌شده، ${fa(failed)} ناموفق، ${fa(skipped)} صرف‌نظر`)
    void loadOutbox()
    void loadPanels(true)
  }

  async function retryRow(row: OutboxRow) {
    const r = await api('/api/sms/send', { method: 'POST', body: { text: row.text, to: [row.to], reason: 'RETRY' } })
    if (!r.ok) return toast.error(r.error || 'ارسال مجدد ناموفق بود')
    toast.success(r.data.sent > 0 ? 'دوباره ارسال شد ✓' : 'ارسال مجدد ناموفق بود')
    void loadOutbox()
  }

  /* ═══ قالب‌ها ═══ */
  async function createTemplate() {
    if (!/^[A-Za-z][A-Za-z0-9_]{1,39}$/.test(tplKey.trim())) return toast.error('کلید قالب نامعتبر است (انگلیسی، عدد و _)')
    if (!tplTitle.trim() || !tplBody.trim()) return toast.error('عنوان و متن قالب را کامل کنید')
    const r = await api('/api/sms/templates', {
      method: 'POST',
      body: { key: tplKey.trim().toUpperCase(), title: tplTitle.trim(), body: tplBody.trim() },
    })
    if (!r.ok) return toast.error(r.error || 'ایجاد قالب ناموفق بود')
    toast.success('قالب ساخته شد')
    setTplOpen(false); setTplKey(''); setTplTitle(''); setTplBody('')
    void loadTemplates()
  }

  /* ═══ R10-MSG: الگوهای پیام مرجوعی ═══ */
  function openRtNew() {
    setRtEdit(null)
    const left = RT_REASONS.filter((x) => !rtList.some((t) => t.reason === x))
    setRtReason(left[0] ?? RT_WILDCARD)
    setRtTitle(''); setRtBody('')
    setRtOpen(true)
  }

  function openRtEdit(t: ReturnTpl) {
    setRtEdit(t)
    setRtReason(t.reason)
    setRtTitle(t.title)
    setRtBody(t.body)
    setRtOpen(true)
  }

  async function saveRt() {
    if (!rtTitle.trim() || !rtBody.trim()) return toast.error('عنوان و متن الگو را کامل کنید')
    if (rtBody.trim().length > 700) return toast.error('متن الگو بیش از ۷۰۰ نویسه است')
    setRtBusy(true)
    const r = rtEdit
      ? await api(`/api/return-templates/${rtEdit.id}`, {
          method: 'PATCH',
          body: { reason: rtReason, title: rtTitle.trim(), body: rtBody.trim() },
        })
      : await api('/api/return-templates', {
          method: 'POST',
          body: { reason: rtReason, title: rtTitle.trim(), body: rtBody.trim() },
        })
    setRtBusy(false)
    if (!r.ok) return toast.error(r.error || 'ذخیره الگو ناموفق بود')
    toast.success(rtEdit ? 'الگو ذخیره شد' : 'الگو ساخته شد')
    setRtOpen(false)
    void loadRtpls()
  }

  async function toggleRt(t: ReturnTpl, v: boolean) {
    const r = await api(`/api/return-templates/${t.id}`, { method: 'PATCH', body: { enabled: v } })
    if (!r.ok) return toast.error(r.error || 'تغییر وضعیت ناموفق بود')
    toast.success(v ? 'الگو فعال شد' : 'الگو غیرفعال شد')
    void loadRtpls()
  }

  async function removeRt() {
    if (!rtDel) return
    setRtBusy(true)
    const r = await api(`/api/return-templates/${rtDel.id}`, { method: 'DELETE' })
    setRtBusy(false)
    if (!r.ok) return toast.error(r.error || 'حذف ناموفق بود')
    toast.success('الگو حذف شد')
    setRtDel(null)
    void loadRtpls()
  }

  /* ═══════════════════════ رندر ═══════════════════════ */

  const addDef = providerDef(addProvider)
  const editDef = editPanel ? providerDef(editPanel.provider) : null
  const sentCount = stats.SENT || 0
  const failedCount = stats.FAILED || 0
  const skippedCount = stats.SKIPPED || 0

  if (loading) {
    return (
      <Card><CardContent className="flex items-center justify-center gap-3 p-16 text-stone-500">
        <I.loader size={18} className="animate-spin" /> در حال بارگذاری مرکز پیامک…
      </CardContent></Card>
    )
  }

  return (
    <div className="space-y-4">

      {/* ═══ سربرگ + آمار ═══ */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50"><I.send size={18} className="text-teal-700" /></div>
            <div className="min-w-0">
              <div className="truncate text-sm font-extrabold">{defaultPanel ? defaultPanel.name : 'بدون پنل پیش‌فرض'}</div>
              <div className="text-[11px] text-stone-500">{defaultPanel ? `${PROVIDER_TITLE[defaultPanel.provider] || ''} • ${defaultPanel.mode === 'real' ? 'واقعی' : 'شبیه‌سازی'}` : 'یک پنل را پیش‌فرض کنید'}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50"><I.check size={18} className="text-emerald-600" /></div>
            <div>
              <div className="text-xl font-extrabold">{fa(sentCount)}</div>
              <div className="text-[11px] text-stone-500">پیامک ارسال‌شده</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-50"><I.x size={18} className="text-rose-600" /></div>
            <div>
              <div className="text-xl font-extrabold">{fa(failedCount)}</div>
              <div className="text-[11px] text-stone-500">ارسال ناموفق</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100"><I.alertTriangle size={18} className="text-amber-700" /></div>
            <div>
              <div className="text-xl font-extrabold">{fa(skippedCount)}</div>
              <div className="text-[11px] text-stone-500">صرف‌نظر (بدون پنل)</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={cfgDenied ? 'send' : 'panels'}>

        <TabsList className="flex-wrap h-auto">
          {!cfgDenied && <TabsTrigger value="panels" className="gap-1.5"><I.settings size={15} /> پنل‌ها</TabsTrigger>}
          <TabsTrigger value="send" className="gap-1.5"><I.send size={15} /> ارسال پیام</TabsTrigger>
          {!cfgDenied && <TabsTrigger value="templates" className="gap-1.5"><I.clipboard size={15} /> قالب‌ها</TabsTrigger>}
          {isMgr && <TabsTrigger value="rtpls" className="gap-1.5"><I.receipt size={15} /> الگوهای پیام مرجوعی</TabsTrigger>}
          {!cfgDenied && <TabsTrigger value="outbox" className="gap-1.5"><I.history size={15} /> گزارش ارسال</TabsTrigger>}
        </TabsList>

        {/* ═══════════ زبانهٔ پنل‌ها ═══════════ */}
        {!cfgDenied && (
        <TabsContent value="panels" className="space-y-3">

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <I.settings size={18} /> پنل‌های پیامک
                <Badge variant="secondary" className="text-[11px]">{fa(panels.length)} پنل</Badge>
                <Badge variant="secondary" className="text-[11px]">{fa(panels.filter((p) => p.active).length)} فعال</Badge>
                <Button size="sm" className="ms-auto gap-1.5" onClick={() => { setAddProvider('melipayamak'); setAddSettings({}); setAddOpen(true) }}>
                  <I.plus size={15} /> افزودن پنل
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[11px] leading-6 text-stone-500">
              پنل پیش‌فرض (★) برای سناریوهای خودکار (ثبت پرداخت، پرداخت مرجوعی، هشدار موجودی) استفاده می‌شود.
              حالت «شبیه‌سازی» ارسال را بدون اعتبارنامهٔ واقعی ثبت می‌کند (کد MOCK).
            </CardContent>
          </Card>

          {panels.length === 0 && (
            <Card><CardContent className="p-10 text-center text-sm text-stone-500">
              <I.send size={26} className="mx-auto mb-3 text-stone-300" />
              هنوز پنلی ثبت نشده — با «افزودن پنل» یکی از ۸ سرویس‌دهندهٔ ایرانی یا پنل سفارشی را پیکربندی کنید.
            </CardContent></Card>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {panels.map((p) => (
              <Card key={p.id} className={cn(!p.active && 'opacity-70')}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" title={p.isDefault ? 'پنل پیش‌فرض — برای برداشتن کلیک کنید' : 'تبدیل به پنل پیش‌فرض'}
                      className={cn('transition-transform hover:scale-110', p.isDefault ? 'text-amber-500' : 'text-stone-300')}
                      onClick={() => patchPanel(p, { isDefault: !p.isDefault })}>
                      <I.sparkles size={17} />
                    </button>
                    <span className="text-sm font-extrabold">{p.name}</span>
                    <Badge className="border-stone-300 bg-stone-100 text-[10px] text-stone-700">{PROVIDER_TITLE[p.provider] || p.provider}</Badge>
                    <ModeToggle mode={p.mode} onChange={(m) => patchPanel(p, { mode: m })} />
                    <label className="ms-auto flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-stone-600">
                      <Checkbox checked={p.active} onCheckedChange={(v: boolean) => patchPanel(p, { active: v === true })} />
                      فعال
                    </label>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
                    {p.isDefault && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-bold text-amber-800">پیش‌فرض ارسال</span>}
                    {p.lastTestAt ? (
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold',
                        p.lastTestOk ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-rose-300 bg-rose-50 text-rose-800')}>
                        {p.lastTestOk ? <I.check size={12} /> : <I.x size={12} />}
                        آخرین آزمایش {whenFa(p.lastTestAt)}
                      </span>
                    ) : (
                      <span className="text-stone-400">آزمایشی انجام نشده</span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => { setTestPanel(p); setTestTo('') }}>
                      <I.zap size={14} /> آزمایش ارسال
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5"
                      onClick={() => { setEditPanel(p); setEditSettings({ ...(p.settings || {}) }) }}>
                      <I.pencil size={14} /> ویرایش
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 text-rose-600 hover:text-rose-700"
                      onClick={() => setDelPanel(p)}>
                      <I.trash size={14} /> حذف
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        )}

        {/* ═══════════ زبانهٔ ارسال پیام ═══════════ */}
        <TabsContent value="send" className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><I.send size={18} /> ارسال پیامک</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* مخاطب */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-stone-600">مخاطبان</label>
                    <Select value={audience} onValueChange={setAudience}>
                      <SelectTrigger aria-label="مخاطبان"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MANUAL">شمارهٔ دستی</SelectItem>
                        <SelectItem value="ALL">همهٔ کاربران (دارای شماره)</SelectItem>
                        {ROLES.map((r) => (
                          <SelectItem key={r.key} value={`ROLE:${r.key}`}>نقش: {r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {templates.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-stone-600">قالب سریع</label>
                      <Select onValueChange={(v: string) => {
                        const t = templates.find((x) => x.id === v)
                        if (t) { setMsgText(t.body); toast.info(`قالب «${t.title}» بارگذاری شد`) }
                      }}>
                        <SelectTrigger aria-label="قالب سریع"><SelectValue placeholder="انتخاب قالب…" /></SelectTrigger>
                        <SelectContent>
                          {templates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.title} ({t.key})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* شماره‌های دستی */}
                {audience === 'MANUAL' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-stone-600">
                      شماره‌های گیرنده <span className="font-normal text-stone-400">(با ویرگول یا خط جدید جدا کنید)</span>
                    </label>
                    <Textarea rows={3} dir="ltr" className="text-left font-mono text-xs"
                      placeholder={'09121234567, ۰۹۳۵… \n0936…'}
                      value={manualText} onChange={(e: any) => setManualText(e.target.value)} />
                    {manualEntries.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="text-stone-500">{fa(validManual.length)} شمارهٔ معتبر</span>
                        {invalidManual.map((e, i) => (
                          <span key={i} className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 font-bold text-rose-700" dir="ltr">
                            {e.raw} — نامعتبر
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* متن پیام */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-stone-600">متن پیامک</label>
                    <span className={cn('text-[11px] font-bold', msgText.length > 600 ? 'text-rose-600' : 'text-stone-400')}>
                      {fa(msgText.length)} نویسه
                    </span>
                  </div>
                  <Textarea rows={4} value={msgText} onChange={(e: any) => setMsgText(e.target.value)}
                    placeholder="متن پیام… (قابل استفاده: {name} {amount} {code} {date})" />
                  <p className="text-[11px] leading-5 text-stone-400">
                    جای‌نگرد‌ها در ارسال گروهی با نام/مبلغ/کد/تاریخ گیرنده جایگزین نمی‌شوند — برای متن‌های شخصی‌سازی‌شده از قالب‌های سناریو استفاده کنید.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button className="gap-1.5" disabled={sending} onClick={doSend}>
                    {sending ? <I.loader size={15} className="animate-spin" /> : <I.send size={15} />}
                    {sending ? 'در حال ارسال…' : 'ارسال پیامک'}
                  </Button>
                  {audience !== 'MANUAL' && !defaultPanel && (
                    <span className="text-[11px] font-bold text-amber-700">پنل پیش‌فرض فعالی نیست — ارسال‌ها «صرف‌نظر» ثبت می‌شوند</span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* نتیجهٔ ارسال */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm"><I.check size={16} /> نتیجهٔ آخرین ارسال</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sendRows.length === 0 ? (
                  <p className="py-6 text-center text-xs text-stone-400">هنوز ارسالی از این نشست انجام نشده</p>
                ) : sendRows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold" dir="ltr">{toFaDigits(r.to)}</div>
                      <div className="truncate text-[11px] text-stone-500">{r.toName || '—'}</div>
                    </div>
                    <StatusChip status={r.status} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════ زبانهٔ قالب‌ها ═══════════ */}
        {!cfgDenied && (
        <TabsContent value="templates" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <I.clipboard size={18} /> قالب‌های پیامک
                <Badge variant="secondary" className="text-[11px]">{fa(templates.length)} قالب</Badge>
                <Button size="sm" className="ms-auto gap-1.5" onClick={() => setTplOpen(true)}>
                  <I.plus size={15} /> قالب جدید
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[11px] leading-6 text-stone-500">
              قالب‌ها متن پیامک خودکار سناریوها را می‌سازند؛ با جای‌نگرد‌های {'{name}'} {'{amount}'} {'{code}'} {'{date}'} {'{by}'} {'{method}'} {'{stock}'} {'{text}'}.
              غیرفعال کردن قالب، پیامک خودکار آن سناریو را متوقف می‌کند.
            </CardContent>
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            {templates.map((t) => (
              <TemplateCard key={t.id} tpl={t} onSaved={() => { void loadTemplates(); void loadPanels(true) }} />
            ))}
            {templates.length === 0 && (
              <Card className="lg:col-span-2"><CardContent className="p-10 text-center text-sm text-stone-500">
                قالبی ثبت نشده — قالب‌های پیش‌فرض با اسکریپت seed-sms-defaults ساخته می‌شوند.
              </CardContent></Card>
            )}
          </div>
        </TabsContent>
        )}

        {/* ═══════════ زبانهٔ گزارش ارسال ═══════════ */}
        {/* R10-MSG: tab of return-message templates */}
        {isMgr && (
        <TabsContent value="rtpls" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <I.receipt size={18} /> الگوهای پیام مرجوعی
                <Badge variant="secondary" className="text-[11px]">{fa(rtList.length)} الگو</Badge>
                <Badge variant="secondary" className="text-[11px]">{fa(rtList.filter((t) => t.enabled).length)} فعال</Badge>
                <Button size="sm" className="ms-auto gap-1.5" onClick={openRtNew}>
                  <I.plus size={15} /> الگوی جدید
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[11px] leading-6 text-stone-500">
              در مودال «ثبت پرداخت» صفحهٔ در انتظار تایید و پرداخت، پیام مشتری بر اساس الگوی همان علتِ مرجوعی پیش‌نمایش و ارسال می‌شود؛ اگر علت، الگوی فعال نداشته باشد الگوی «*» استفاده می‌شود.
            </CardContent>
          </Card>

          {rtList.length === 0 ? (
            <Card><CardContent className="p-10 text-center text-sm text-stone-500">
              <I.receipt size={26} className="mx-auto mb-3 text-stone-300" />
              هنوز الگویی ثبت نشده — با «الگوی جدید» برای هر علت مرجوعی یک پیام آماده بسازید.
            </CardContent></Card>
          ) : (
          <Card>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">علت مرجوعی</TableHead>
                      <TableHead className="text-right">عنوان</TableHead>
                      <TableHead className="text-right">متن پیام</TableHead>
                      <TableHead className="text-right">وضعیت</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rtList.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <Badge className={cn('border text-[10px]', t.reason === RT_WILDCARD ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-stone-300 bg-stone-100 text-stone-700')}>
                            {t.reason === RT_WILDCARD ? '★ پیش‌فرض (همهٔ علل)' : t.reason}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-bold">{t.title}</TableCell>
                        <TableCell className="max-w-md">
                          <div className="truncate text-xs leading-6 text-stone-600" title={t.body}>{t.body}</div>
                        </TableCell>
                        <TableCell>
                          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-stone-600">
                            <Checkbox checked={t.enabled} onCheckedChange={(v: boolean) => toggleRt(t, v === true)} />
                            فعال
                          </label>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="outline" className="gap-1 px-2 text-[11px]" onClick={() => openRtEdit(t)}>
                              <I.pencil size={13} /> ویرایش
                            </Button>
                            <Button size="sm" variant="ghost" className="gap-1 px-2 text-[11px] text-rose-600" onClick={() => setRtDel(t)}>
                              <I.trash size={13} /> حذف
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          )}
        </TabsContent>
        )}

        {!cfgDenied && (
        <TabsContent value="outbox" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <I.history size={18} /> گزارش ارسال
                <Badge variant="secondary" className="text-[11px]">{fa(outbox.length)} رکورد</Badge>
                <div className="ms-auto flex items-center gap-2">
                  <Select value={statusF} onValueChange={setStatusF}>
                    <SelectTrigger className="w-40" aria-label="فیلتر وضعیت"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">همهٔ وضعیت‌ها</SelectItem>
                      <SelectItem value="SENT">ارسال‌شده</SelectItem>
                      <SelectItem value="FAILED">ناموفق</SelectItem>
                      <SelectItem value="SKIPPED">صرف‌نظر</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { void loadOutbox(); void loadPanels(true) }}>
                    <I.refresh size={14} /> به‌روزرسانی
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {outbox.length === 0 ? (
                <p className="py-10 text-center text-sm text-stone-400">رکوردی یافت نشد</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">زمان</TableHead>
                        <TableHead className="text-right">گیرنده</TableHead>
                        <TableHead className="text-right">پنل</TableHead>
                        <TableHead className="text-right">نوع</TableHead>
                        <TableHead className="text-right">متن</TableHead>
                        <TableHead className="text-right">وضعیت</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outbox.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap text-[11px] text-stone-500">{whenFa(r.createdAt)}</TableCell>
                          <TableCell>
                            <div className="text-xs font-bold" dir="ltr">{toFaDigits(r.to)}</div>
                            {r.toName && <div className="text-[11px] text-stone-500">{r.toName}</div>}
                          </TableCell>
                          <TableCell>
                            {r.provider
                              ? <Badge className="border-stone-300 bg-stone-100 text-[10px] text-stone-700">{PROVIDER_TITLE[r.provider] || r.provider}</Badge>
                              : <span className="text-[11px] text-stone-400">—</span>}
                          </TableCell>
                          <TableCell className="text-[11px] text-stone-500">{REASON_LABEL[r.reason] || r.reason}</TableCell>
                          <TableCell className="max-w-56">
                            <div className="truncate text-xs" title={r.text}>{r.text}</div>
                            {r.error && <div className="truncate text-[11px] text-rose-600" title={r.error}>{r.error}</div>}
                          </TableCell>
                          <TableCell><StatusChip status={r.status} /></TableCell>
                          <TableCell>
                            {r.status === 'FAILED' && (
                              <Button size="sm" variant="ghost" className="gap-1 px-2 text-[11px]" onClick={() => retryRow(r)}>
                                <I.refresh size={13} /> ارسال مجدد
                              </Button>
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
        )}
      </Tabs>

      {/* ═══ دیالوگ افزودن پنل ═══ */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.plus size={17} /> افزودن پنل پیامک</DialogTitle>
            <DialogDescription>سرویس‌دهنده را انتخاب و اطلاعات پنل را وارد کنید.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-600">سرویس‌دهنده</label>
                <Select value={addProvider} onValueChange={(v: string) => { setAddProvider(v); setAddSettings({}) }}>
                  <SelectTrigger aria-label="سرویس‌دهنده"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.key} value={p.key}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-600">نام پنل</label>
                <Input value={addName} onChange={(e: any) => setAddName(e.target.value)} placeholder="مثلاً: خط اصلی هایپر زیتون" />
              </div>
            </div>
            {addDef && (
              <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] leading-5 text-stone-600">
                <I.info size={13} className="ms-1 inline align-[-2px]" /> {addDef.help}
              </p>
            )}
            {addDef && (
              <div className="grid gap-3 sm:grid-cols-2">
                {addDef.fields.map((f) => (
                  <div key={f.k} className={cn('space-y-1.5', (f.area || f.k === 'urlTemplate' || f.k === 'headers') && 'sm:col-span-2')}>
                    <label className="text-xs font-bold text-stone-600">{f.label}</label>
                    {f.area || f.k === 'urlTemplate' || f.k === 'headers' ? (
                      <Textarea rows={2} dir="ltr" className="font-mono text-xs" placeholder={f.ph}
                        value={addSettings[f.k] ?? ''} onChange={(e: any) => setAddSettings({ ...addSettings, [f.k]: e.target.value })} />
                    ) : (
                      <Input dir={f.k === 'from' || f.k === 'lineNumber' || f.k === 'sender' ? 'ltr' : undefined}
                        placeholder={f.ph}
                        value={addSettings[f.k] ?? ''} onChange={(e: any) => setAddSettings({ ...addSettings, [f.k]: e.target.value })} />
                    )}
                    {f.hint && <p className="text-[10px] text-stone-400">{f.hint}</p>}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs font-bold">حالت ارسال</div>
              <ModeToggle mode={addMode} onChange={setAddMode} />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-stone-700">
              <Checkbox checked={addDefault} onCheckedChange={(v: boolean) => setAddDefault(v === true)} />
              تنظیم به‌عنوان پنل پیش‌فرض (برای سناریوهای خودکار)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>انصراف</Button>
            <Button disabled={busy} onClick={createPanel}>{busy ? 'در حال ذخیره…' : 'ایجاد پنل'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ دیالوگ ویرایش پنل ═══ */}
      <Dialog open={!!editPanel} onOpenChange={(o: boolean) => !o && setEditPanel(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.pencil size={17} /> ویرایش پنل {editPanel ? `«${editPanel.name}»` : ''}</DialogTitle>
            <DialogDescription>اطلاعات اعتبارنامه و تنظیمات پنل را اصلاح کنید.</DialogDescription>
          </DialogHeader>
          {editPanel && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-600">نام پنل</label>
                  <Input value={editPanel.name} onChange={(e: any) => setEditPanel({ ...editPanel, name: e.target.value })} />
                </div>
                <div className="flex items-end">
                  <div className="flex w-full items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                    <span className="text-xs font-bold">حالت ارسال</span>
                    <ModeToggle mode={editPanel.mode} onChange={(m: string) => setEditPanel({ ...editPanel, mode: m })} />
                  </div>
                </div>
              </div>
              {editDef && (
                <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] leading-5 text-stone-600">
                  <I.info size={13} className="ms-1 inline align-[-2px]" /> {editDef.help}
                </p>
              )}
              {editDef && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {editDef.fields.map((f) => (
                    <div key={f.k} className={cn('space-y-1.5', (f.area || f.k === 'urlTemplate' || f.k === 'headers') && 'sm:col-span-2')}>
                      <label className="text-xs font-bold text-stone-600">{f.label}</label>
                      {f.area || f.k === 'urlTemplate' || f.k === 'headers' ? (
                        <Textarea rows={2} dir="ltr" className="font-mono text-xs" placeholder={f.ph}
                          value={editSettings[f.k] ?? ''} onChange={(e: any) => setEditSettings({ ...editSettings, [f.k]: e.target.value })} />
                      ) : (
                        <Input dir={f.k === 'from' || f.k === 'lineNumber' || f.k === 'sender' ? 'ltr' : undefined}
                          placeholder={f.ph}
                          value={editSettings[f.k] ?? ''} onChange={(e: any) => setEditSettings({ ...editSettings, [f.k]: e.target.value })} />
                      )}
                      {f.hint && <p className="text-[10px] text-stone-400">{f.hint}</p>}
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-600">یادداشت</label>
                <Input value={editPanel.note} onChange={(e: any) => setEditPanel({ ...editPanel, note: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPanel(null)}>انصراف</Button>
            <Button disabled={busy} onClick={saveEditPanel}>{busy ? 'در حال ذخیره…' : 'ذخیره تغییرات'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ دیالوگ آزمایش پنل ═══ */}
      <Dialog open={!!testPanel} onOpenChange={(o: boolean) => !o && setTestPanel(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.zap size={17} /> آزمایش پنل {testPanel ? `«${testPanel.name}»` : ''}</DialogTitle>
            <DialogDescription>
              پیام «پیام آزمایشی مرکز پیامک هایپر زیتون» به شمارهٔ واردشده ارسال می‌شود
              {testPanel?.mode !== 'real' ? ' (حالت شبیه‌سازی — بدون ارسال واقعی)' : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-600">شمارهٔ موبایل آزمایشی</label>
            <Input dir="ltr" className="text-left font-mono" placeholder="09121234567" value={testTo} onChange={(e: any) => setTestTo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestPanel(null)}>انصراف</Button>
            <Button disabled={busy} className="gap-1.5" onClick={runTest}>
              {busy ? <I.loader size={15} className="animate-spin" /> : <I.send size={15} />}
              ارسال آزمایشی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ دیالوگ حذف پنل ═══ */}
      <Dialog open={!!delPanel} onOpenChange={(o: boolean) => !o && setDelPanel(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700"><I.trash size={17} /> حذف پنل</DialogTitle>
            <DialogDescription>
              آیا از حذف پنل «{delPanel?.name}» مطمئن هستید؟ سابقهٔ پیامک‌های ارسالی در گزارش باقی می‌ماند.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelPanel(null)}>انصراف</Button>
            <Button variant="destructive" disabled={busy} onClick={deletePanel}>{busy ? 'در حال حذف…' : 'حذف کن'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ دیالوگ قالب جدید ═══ */}
      <Dialog open={tplOpen} onOpenChange={setTplOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.plus size={17} /> قالب پیامک جدید</DialogTitle>
            <DialogDescription>کلید یکتا (انگلیسی)، عنوان و متن قالب را وارد کنید.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-600">کلید (یکتا)</label>
                <Input dir="ltr" className="font-mono text-xs" placeholder="ORDER_READY" value={tplKey} onChange={(e: any) => setTplKey(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-600">عنوان</label>
                <Input placeholder="عنوان فارسی" value={tplTitle} onChange={(e: any) => setTplTitle(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-600">متن قالب</label>
              <Textarea rows={3} placeholder="متن با جای‌نگرد {name} {amount} {code} {date}" value={tplBody} onChange={(e: any) => setTplBody(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTplOpen(false)}>انصراف</Button>
            <Button onClick={createTemplate}>ایجاد قالب</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ R10-MSG: دیالوگ الگوی پیام مرجوعی ═══ */}
      <Dialog open={rtOpen} onOpenChange={setRtOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.receipt size={17} /> {rtEdit ? 'ویرایش الگوی پیام مرجوعی' : 'الگوی پیام مرجوعی جدید'}</DialogTitle>
            <DialogDescription>پیام آمادهٔ مشتری برای این علتِ مرجوعی — جای‌نگردها با کلیک اضافه می‌شوند و هنگام پرداخت با مقادیر واقعی جایگزین می‌شوند.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-600">علت مرجوعی</label>
                <Select value={rtReason} onValueChange={setRtReason}>
                  <SelectTrigger aria-label="علت مرجوعی"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={RT_WILDCARD}>★ پیش‌فرض (همهٔ علل)</SelectItem>
                    {RT_REASONS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-600">عنوان الگو</label>
                <Input placeholder="مثلاً: تأیید مرجوعی — کالای معیوب" value={rtTitle} onChange={(e: any) => setRtTitle(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-600">متن پیام (حداکثر ۷۰۰ نویسه — {fa(rtBody.length)})</label>
              <Textarea rows={5} placeholder="متن پیام به مشتری…" value={rtBody} onChange={(e: any) => setRtBody(e.target.value)} />
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-bold text-stone-500">جای‌نگردها:</span>
                {RT_PLACEHOLDERS.map((p) => (
                  <button key={p.key} type="button" title={p.label}
                    className="rounded-full border border-stone-300 bg-stone-50 px-2 py-0.5 font-mono text-[11px] text-stone-700 hover:bg-stone-100"
                    onClick={() => setRtBody((prev) => `${prev} ${p.key}`.trim())}>
                    {p.key}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRtOpen(false)}>انصراف</Button>
            <Button disabled={rtBusy} onClick={saveRt} className="gap-1.5">
              {rtBusy ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />}
              {rtEdit ? 'ذخیره تغییرات' : 'ایجاد الگو'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ R10-MSG: دیالوگ حذف الگوی پیام مرجوعی ═══ */}
      <Dialog open={!!rtDel} onOpenChange={(o: boolean) => !o && setRtDel(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700"><I.trash size={17} /> حذف الگوی پیام مرجوعی</DialogTitle>
            <DialogDescription>
              آیا از حذف الگوی «{rtDel?.title}» ({rtDel?.reason === RT_WILDCARD ? 'پیش‌فرض' : rtDel?.reason}) مطمئن هستید؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRtDel(null)}>انصراف</Button>
            <Button variant="destructive" disabled={rtBusy} onClick={removeRt}>{rtBusy ? 'در حال حذف…' : 'حذف کن'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ═══ کارت قالب (ویرایش درجا) ═══ */

function TemplateCard({ tpl, onSaved }: { tpl: Template; onSaved: () => void }) {
  const [title, setTitle] = useState(tpl.title)
  const [body, setBody] = useState(tpl.body)
  const [enabled, setEnabled] = useState(tpl.enabled)
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const dirty = title !== tpl.title || body !== tpl.body || enabled !== tpl.enabled

  async function save() {
    if (!title.trim() || !body.trim()) return toast.error('عنوان و متن قالب را کامل کنید')
    setBusy(true)
    const r = await api(`/api/sms/templates/${tpl.id}`, {
      method: 'PATCH',
      body: { title: title.trim(), body: body.trim(), enabled },
    })
    setBusy(false)
    if (!r.ok) return toast.error(r.error || 'ذخیره نشد')
    toast.success('قالب ذخیره شد')
    onSaved()
  }

  async function toggleEnabled(v: boolean) {
    setEnabled(v)
    setBusy(true)
    const r = await api(`/api/sms/templates/${tpl.id}`, { method: 'PATCH', body: { enabled: v } })
    setBusy(false)
    if (!r.ok) { setEnabled(!v); return toast.error(r.error || 'تغییر وضعیت ناموفق بود') }
    toast.success(v ? 'قالب فعال شد' : 'قالب غیرفعال شد')
    onSaved()
  }

  async function remove() {
    setBusy(true)
    const r = await api(`/api/sms/templates/${tpl.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!r.ok) return toast.error(r.error || 'حذف ناموفق بود')
    toast.success('قالب حذف شد')
    setConfirmDel(false)
    onSaved()
  }

  return (
    <Card>
      <CardContent className="space-y-2.5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-mono text-[10px]" dir="ltr">{tpl.key}</Badge>
          <Input className="h-8 flex-1 text-xs" value={title} onChange={(e: any) => setTitle(e.target.value)} />
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-stone-600">
            <Checkbox checked={enabled} onCheckedChange={(v: boolean) => toggleEnabled(v === true)} />
            فعال
          </label>
        </div>
        <Textarea rows={3} className="text-xs leading-6" value={body} onChange={(e: any) => setBody(e.target.value)} />
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!dirty || busy} onClick={save} className="gap-1.5">
            {busy ? <I.loader size={14} className="animate-spin" /> : <I.save size={14} />} ذخیره
          </Button>
          {confirmDel ? (
            <>
              <Button size="sm" variant="destructive" disabled={busy} onClick={remove}>تأیید حذف</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>انصراف</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="gap-1 text-rose-600" onClick={() => setConfirmDel(true)}>
              <I.trash size={14} /> حذف
            </Button>
          )}
          {!enabled && <span className="text-[11px] font-bold text-amber-700">سناریوی این قالب پیامک نمی‌فرستد</span>}
        </div>
      </CardContent>
    </Card>
  )
}
