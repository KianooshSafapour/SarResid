import {
  useState, useEffect, useMemo, api, useShell, toast, cn,
  Button, Input, Card, CardContent, CardHeader, CardTitle, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Tabs, TabsContent, TabsList, TabsTrigger, Checkbox,
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  fa, toEnDigits, toFaDigits, formatJalali, Icon, I,
} from '../lib/hz'

/* ═══════════════════════════════════════════════════════════════
   system/users — «کاربران و دسترسی» (مدیریت RBAC)
   آمار کلی + جدول کاربران + ویرایش/ایجاد + ماتریس دسترسی سه‌حالته
   (پیش‌فرض نقش / مجاز / مسدود) + توانایی‌ها (SoD)
   ═══════════════════════════════════════════════════════════════ */

type Tri = 'allow' | 'deny'
type TriVal = 'inherit' | Tri

const SUPER_ROLES = ['OWNER', 'GM', 'ADMIN'] // مطابق src/lib/access.ts — نقش‌های غیرقابل‌مسدودسازی

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

/** رنگ نشان نقش (بدون آبی/نیلی — مطابق پالت سامانه) */
const ROLE_BADGE: Record<string, string> = {
  OWNER: 'bg-amber-200 text-amber-900',
  GM: 'bg-emerald-100 text-emerald-800',
  ADMIN: 'bg-violet-100 text-violet-800',
  EXEC: 'bg-amber-100 text-amber-800',
  ACC: 'bg-teal-50 text-teal-800',
  PM: 'bg-rose-100 text-rose-800',
  HC: 'bg-stone-100 text-lime-700',
  CASHIER: 'bg-slate-100 text-slate-700',
  SALES: 'bg-amber-50 text-amber-700',
  SK: 'bg-stone-100 text-stone-600',
  MERCH: 'bg-green-100 text-green-700',
}

const HONORIFICS = ['آقای', 'خانم', 'دکتر', 'مهندس']

/* ── آینهٔ نقش‌های پیش‌فرض (مطابق src/lib/access.ts) ─────────────── */

const SECTION_DEFAULTS: Record<string, string[]> = {
  home: ['*'],
  tasks: ['*'],
  store: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK', 'MERCH', 'SALES'],
  supply: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'PM', 'SK', 'HC'],
  returns: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'HC', 'CASHIER'],
  profit: ['OWNER', 'GM', 'ADMIN', 'ACC'],
  finance: ['OWNER', 'GM', 'ADMIN', 'ACC'],
  hr: ['*'],
  crm: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'SALES', 'HC'],
  reports: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'PM'],
  system: ['OWNER', 'GM', 'ADMIN'],
}

const PAGE_DEFAULTS: Record<string, string[]> = {
  'home/home': ['*'], 'home/guide': ['*'], 'home/account': ['*'],
  'tasks/attendance': ['OWNER', 'GM', 'ADMIN', 'EXEC'],
  'tasks/checklists': ['*'], 'tasks/sops': ['*'], 'tasks/tasks': ['*'],
  'tasks/messages': ['*'], 'tasks/feedback': ['*'], 'tasks/reports': ['*'],
  'tasks/problems': ['*'], 'tasks/wall': ['*'],
  'store/floorplan': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK', 'MERCH'],
  'store/planograms': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'MERCH', 'SK'],
  'store/zones': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'MERCH', 'SK'],
  'store/pricecheck': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM'],
  'store/waste': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK', 'MERCH'],
  'store/reviews': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM'],
  'store/stockcount': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK'],
  'store/liveboard': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK'],
  'supply/orders': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK', 'ACC'],
  'supply/receiving': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'SK', 'PM'],
  'supply/products': ['*'],
  'supply/suppliers': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'PM', 'SK', 'HC'],
  'returns/approvals': ['OWNER', 'GM', 'ADMIN', 'EXEC'],
  'returns/payments': ['OWNER', 'GM', 'ADMIN', 'EXEC'],
  'returns/customers': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'HC'],
  'returns/new': ['*'],
  'returns/history': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'HC', 'CASHIER'],
  'profit/builder': ['OWNER', 'GM', 'ADMIN', 'ACC', 'EXEC', 'PM'],
  'profit/history': ['OWNER', 'GM', 'ADMIN', 'ACC'],
  'profit/stats': ['OWNER', 'GM', 'ADMIN', 'ACC'],
  'finance/cheques': ['OWNER', 'GM', 'ADMIN', 'ACC'],
  'finance/payments': ['OWNER', 'GM', 'ADMIN', 'ACC'],
  'hr/payroll': ['OWNER', 'GM', 'ADMIN'],
  'hr/personnel': ['OWNER', 'GM', 'ADMIN'],
  'hr/shifts': ['OWNER', 'GM', 'ADMIN', 'EXEC'],
  'hr/leaves': ['*'],
  'hr/performance': ['OWNER', 'GM', 'ADMIN', 'EXEC'],
  'crm/customers': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'SALES', 'HC'],
  'crm/campaigns': ['OWNER', 'GM', 'ADMIN'],
  'reports/briefing': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'PM'],
  'reports/overview': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'PM'],
  'reports/exports': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'PM'],
  'system/users': ['OWNER', 'GM', 'ADMIN'],
  'system/settings': ['OWNER', 'GM', 'ADMIN'],
  'system/holoo': ['OWNER', 'GM', 'ADMIN'],
  'system/activity': ['OWNER', 'GM', 'ADMIN'],
}

const CAP_DEFAULTS: Record<string, string[]> = {
  approveReturns: ['OWNER', 'GM', 'ADMIN', 'EXEC'],
  recordReturnPayment: ['OWNER', 'GM', 'ADMIN', 'EXEC'],
  approveOrders: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC'],
  verifyReceiving: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'SK'],
  managePayroll: ['OWNER', 'GM', 'ADMIN'],
  manageUsers: ['OWNER', 'GM', 'ADMIN'],
  signCheques: ['OWNER', 'GM'],
  managePlanograms: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM'],
  confirmZoneCounts: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM'],
  answerUrgent: ['OWNER', 'GM', 'ADMIN', 'EXEC'],
  manageChecklists: ['OWNER', 'GM', 'ADMIN', 'EXEC'],
}

/* ── نقشهٔ ناوبری سامانه (بخش‌ها + صفحات) ───────────────────────── */

interface PageDef { key: string; label: string }
interface SectionDef { key: string; label: string; icon: string; pages: PageDef[] }

const SECTIONS: SectionDef[] = [
  {
    key: 'home', label: 'خانه', icon: 'layoutGrid',
    pages: [
      { key: 'home/home', label: 'میزکار من' },
      { key: 'home/guide', label: 'راهنما و دانش‌نامه' },
      { key: 'home/account', label: 'حساب و شخصی‌سازی من' },
    ],
  },
  {
    key: 'tasks', label: 'وظایف و هماهنگی', icon: 'clipboard',
    pages: [
      { key: 'tasks/attendance', label: 'بررسی تیم' },
      { key: 'tasks/checklists', label: 'چک‌لیست‌های امروز' },
      { key: 'tasks/sops', label: 'روال‌های استاندارد' },
      { key: 'tasks/tasks', label: 'وظایف من و تیم' },
      { key: 'tasks/messages', label: 'پیام‌ها' },
      { key: 'tasks/feedback', label: 'بازخورد و ایده‌ها' },
      { key: 'tasks/reports', label: 'گزارش شیفت و تحویل' },
      { key: 'tasks/problems', label: 'ثبت مشکلات و پیگیری' },
      { key: 'tasks/wall', label: 'دیوار خبری' },
    ],
  },
  {
    key: 'store', label: 'فروشگاه و چیدمان', icon: 'store',
    pages: [
      { key: 'store/liveboard', label: 'نقشه زنده' },
      { key: 'store/stockcount', label: 'انبارگردانی' },
      { key: 'store/reviews', label: 'ارزیابی چیدمان' },
      { key: 'store/floorplan', label: 'نقشه فروشگاه' },
      { key: 'store/planograms', label: 'پلانوگرام' },
      { key: 'store/zones', label: 'زون‌ها' },
      { key: 'store/pricecheck', label: 'کنترل قیمت' },
      { key: 'store/waste', label: 'ضایعات' },
    ],
  },
  {
    key: 'supply', label: 'انبار و تأمین', icon: 'package',
    pages: [
      { key: 'supply/products', label: 'کالاها' },
      { key: 'supply/suppliers', label: 'تأمین‌کنندگان' },
      { key: 'supply/orders', label: 'سفارش‌ها' },
      { key: 'supply/receiving', label: 'دریافت کالا' },
    ],
  },
  {
    key: 'returns', label: 'مرجوعی', icon: 'receipt',
    pages: [
      { key: 'returns/new', label: 'ثبت مرجوعی' },
      { key: 'returns/history', label: 'تاریخچه' },
      { key: 'returns/approvals', label: 'در انتظار تأیید' },
      { key: 'returns/customers', label: 'دفترچه مشتریان' },
    ],
  },
  {
    key: 'profit', label: 'سود', icon: 'trendingUp',
    pages: [
      { key: 'profit/builder', label: 'فاکتور و محاسبه سود' },
      { key: 'profit/history', label: 'دفتر فاکتورها' },
      { key: 'profit/stats', label: 'آمار' },
    ],
  },
  {
    key: 'finance', label: 'مالی', icon: 'banknote',
    pages: [
      { key: 'finance/cheques', label: 'چک‌ها' },
      { key: 'finance/payments', label: 'پرداخت‌ها' },
    ],
  },
  {
    key: 'hr', label: 'منابع انسانی', icon: 'users',
    pages: [
      { key: 'hr/performance', label: 'کارنامه' },
      { key: 'hr/personnel', label: 'پرونده پرسنل' },
      { key: 'hr/shifts', label: 'شیفت‌ها' },
      { key: 'hr/leaves', label: 'مرخصی‌ها' },
      { key: 'hr/payroll', label: 'حقوق' },
    ],
  },
  {
    key: 'crm', label: 'مشتریان', icon: 'handshake',
    pages: [
      { key: 'crm/customers', label: 'مشتریان' },
      { key: 'crm/campaigns', label: 'کمپین‌ها' },
    ],
  },
  {
    key: 'reports', label: 'گزارش‌ها', icon: 'barChart',
    pages: [
      { key: 'reports/briefing', label: 'صبح‌نامه' },
      { key: 'reports/overview', label: 'نمای کلی' },
      { key: 'reports/exports', label: 'خروجی‌ها' },
    ],
  },
  {
    key: 'system', label: 'سیستم', icon: 'settings',
    pages: [
      { key: 'system/users', label: 'کاربران' },
      { key: 'system/settings', label: 'تنظیمات' },
      { key: 'system/holoo', label: 'اتصال هلو' },
      { key: 'system/activity', label: 'فعالیت‌ها' },
    ],
  },
]

const CAPS: { key: string; label: string; desc: string }[] = [
  { key: 'approveReturns', label: 'تأیید مرجوعی', desc: 'تأیید درخواست‌های مرجوعی در صف بررسی' },
  { key: 'recordReturnPayment', label: 'ثبت پرداخت مرجوعی', desc: 'ثبت بازگشت وجه مرجوعی به مشتری' },
  { key: 'approveOrders', label: 'تأیید سفارش', desc: 'تأیید نهایی سفارش‌های خرید' },
  { key: 'verifyReceiving', label: 'تأیید دریافت', desc: 'تأیید رسید کالا از تأمین‌کننده' },
  { key: 'managePayroll', label: 'مدیریت حقوق', desc: 'مشاهده و مدیریت حقوق پرسنل' },
  { key: 'manageUsers', label: 'مدیریت کاربران', desc: 'ایجاد و ویرایش کاربران و دسترسی‌ها' },
  { key: 'signCheques', label: 'امضای چک', desc: 'امضای چک‌های پرداخت' },
  { key: 'managePlanograms', label: 'مدیریت پلانوگرام', desc: 'ویرایش چیدمان پلانوگرام قفسه‌ها' },
  { key: 'confirmZoneCounts', label: 'تأیید شمارش زون', desc: 'تأیید شمارش‌های انجام‌شدهٔ زون‌ها' },
  { key: 'answerUrgent', label: 'پاسخ به فوری', desc: 'پاسخ به پیام‌های فوری پرسنل' },
  { key: 'manageChecklists', label: 'مدیریت چک‌لیست', desc: 'ایجاد و ویرایش چک‌لیست‌ها' },
]

const ALL_PAGES: PageDef[] = SECTIONS.flatMap((s) => s.pages)
const ALL_PERM_KEYS: string[] = [
  ...SECTIONS.map((s) => 'section:' + s.key),
  ...ALL_PAGES.map((p) => p.key),
  ...CAPS.map((c) => 'cap:' + c.key),
]

/* ── منطق دسترسی (آینهٔ سمت سرور access.ts) ─────────────────────── */

function roleDefaultPage(pageKey: string, role: string): boolean {
  const pr = PAGE_DEFAULTS[pageKey]
  if (pr) return pr.includes('*') || pr.includes(role)
  const sr = SECTION_DEFAULTS[pageKey.split('/')[0]]
  if (sr) return sr.includes('*') || sr.includes(role)
  return false
}

interface PageState { eff: 'allow' | 'deny'; src: 'super' | 'page' | 'section' | 'role' }

function pageState(pageKey: string, role: string, ov: Record<string, boolean>): PageState {
  if (SUPER_ROLES.includes(role)) return { eff: 'allow', src: 'super' }
  if (ov[pageKey] !== undefined) return { eff: ov[pageKey] ? 'allow' : 'deny', src: 'page' }
  const sk = 'section:' + pageKey.split('/')[0]
  if (ov[sk] !== undefined) return { eff: ov[sk] ? 'allow' : 'deny', src: 'section' }
  return { eff: roleDefaultPage(pageKey, role) ? 'allow' : 'deny', src: 'role' }
}

function capEffective(capKey: string, role: string, ov: Record<string, boolean>): boolean {
  if (SUPER_ROLES.includes(role)) return true
  const v = ov['cap:' + capKey]
  if (v !== undefined) return v
  return (CAP_DEFAULTS[capKey] || []).includes(role)
}

/* ── اجزای کوچک ─────────────────────────────────────────────────── */

function Avatar({ u, size = 9 }: { u: any; size?: number }) {
  let emoji = '', color = ''
  try {
    const a = u?.avatarJson ? JSON.parse(u.avatarJson) : null
    if (a && a.emoji) { emoji = String(a.emoji); color = String(a.color || '') }
  } catch { /* بدشکل — پیش‌فرض */ }
  const dim = size >= 12 ? 'size-12 text-2xl' : 'size-9 text-lg'
  if (!emoji) {
    return (
      <div className={cn('flex shrink-0 items-center justify-center rounded-full bg-stone-100', dim)}>
        <I.user size={size >= 12 ? 20 : 15} className="text-stone-400" />
      </div>
    )
  }
  return (
    <div className={cn('flex shrink-0 items-center justify-center rounded-full', dim)}
      style={{ backgroundColor: color || '#f5f5f4' }}>
      <span>{emoji}</span>
    </div>
  )
}

/** کنترل سه‌حالته: پیش‌فرض نقش / مجاز / مسدود */
function TriState({ value, onChange, disabled }: { value: TriVal; onChange: (v: TriVal) => void; disabled?: boolean }) {
  const items: { v: TriVal; label: string; on: string; hint: string }[] = [
    { v: 'inherit', label: 'پیش‌فرض', on: 'bg-stone-100 text-stone-600', hint: 'پیش‌فرض نقش (حذف دسترسی ویژه)' },
    { v: 'allow', label: 'مجاز', on: 'bg-emerald-600 text-white', hint: 'مجازسازی اجباری' },
    { v: 'deny', label: 'مسدود', on: 'bg-rose-600 text-white', hint: 'مسدودسازی اجباری' },
  ]
  return (
    <div className={cn('flex overflow-hidden rounded-lg border border-stone-200 bg-white', disabled && 'opacity-50')}>
      {items.map((it) => (
        <button key={it.v} type="button" title={it.hint} disabled={disabled}
          onClick={() => onChange(it.v)}
          className={cn(
            'px-2 py-0.5 text-[10px] font-medium transition-colors',
            value === it.v ? it.on : 'text-stone-500 hover:bg-stone-100',
            disabled && 'cursor-not-allowed',
          )}>
          {it.label}
        </button>
      ))}
    </div>
  )
}

function EffChip({ st }: { st: PageState }) {
  if (st.src === 'super') return <span className="text-[9px] text-emerald-600">همیشه مجاز</span>
  if (st.src === 'page') return <span className={cn('text-[9px] font-bold', st.eff === 'allow' ? 'text-emerald-600' : 'text-rose-600')}>{st.eff === 'allow' ? 'اجباری: مجاز' : 'اجباری: مسدود'}</span>
  if (st.src === 'section') return <span className={cn('text-[9px]', st.eff === 'allow' ? 'text-emerald-600' : 'text-rose-600')}>از بخش: {st.eff === 'allow' ? 'مجاز' : 'مسدود'}</span>
  return st.eff === 'allow'
    ? <span className="text-[9px] text-stone-400">پیش‌فرض: مجاز برای این نقش</span>
    : <span className="text-[9px] text-stone-400">پیش‌فرض: مسدود برای این نقش</span>
}

/* ── فرم خالی ───────────────────────────────────────────────────── */

interface UserForm {
  username: string; fullName: string; honorific: string; role: string
  title: string; phone: string; password: string; pin: string; active: boolean
}
const emptyForm = (): UserForm => ({
  username: '', fullName: '', honorific: 'آقای', role: '', title: '', phone: '',
  password: '', pin: '', active: true,
})

/* ═════════════════════ نما ═════════════════════ */

export default function UsersView() {
  const { user: me } = useShell()
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState('')
  const [users, setUsers] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [roleF, setRoleF] = useState('all')
  const [activeF, setActiveF] = useState('all')

  /* کاربر جدید */
  const [newOpen, setNewOpen] = useState(false)
  const [nf, setNf] = useState<UserForm>(emptyForm())
  const [creating, setCreating] = useState(false)

  /* ویرایش */
  const [edit, setEdit] = useState<any | null>(null)
  const [ef, setEf] = useState<UserForm>(emptyForm())
  const [eDetail, setEDetail] = useState<any | null>(null)
  const [pinClear, setPinClear] = useState(false)
  const [saving, setSaving] = useState(false)

  /* دسترسی‌ها */
  const [perm, setPerm] = useState<any | null>(null)
  const [permLoading, setPermLoading] = useState(false)
  const [permSaving, setPermSaving] = useState(false)
  const [loadedOv, setLoadedOv] = useState<Record<string, boolean>>({})
  const [draft, setDraft] = useState<Record<string, TriVal>>({})

  useEffect(() => { void load() }, [])

  async function load(silent = false) {
    if (!silent) setLoading(true)
    const r = await api('/api/admin/users')
    if (!silent) setLoading(false)
    if (!r.ok) { setDenied(r.error || 'خطا در دریافت کاربران'); return }
    setUsers(r.data.items || [])
    setStats(r.data.stats || null)
  }

  /* ── فیلترها ── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (roleF !== 'all' && u.role !== roleF) return false
      if (activeF === 'active' && !u.active) return false
      if (activeF === 'inactive' && u.active) return false
      if (q && !String(u.fullName || '').includes(q) && !String(u.username || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [users, search, roleF, activeF])

  const adminCount = useMemo(
    () => users.filter((u) => u.active && SUPER_ROLES.includes(u.role)).length, [users])

  /* ── وضعیت جاری دسترسی‌ها (ذخیره‌شده + تغییرات ثبت‌نشده) ── */
  const curOv = useMemo(() => {
    const m: Record<string, boolean> = { ...loadedOv }
    for (const [k, v] of Object.entries(draft)) {
      if (v === 'inherit') delete m[k]
      else m[k] = v === 'allow'
    }
    return m
  }, [loadedOv, draft])

  const changedCount = useMemo(() => {
    let n = 0
    for (const [k, v] of Object.entries(draft)) {
      const saved = loadedOv[k]
      if (v === 'inherit') { if (saved !== undefined) n++ }
      else if (saved === undefined || saved !== (v === 'allow')) n++
    }
    return n
  }, [draft, loadedOv])

  function setTri(key: string, v: TriVal) {
    setDraft((d) => {
      const nd = { ...d }
      const saved = loadedOv[key]
      const cur: TriVal = saved === undefined ? 'inherit' : saved ? 'allow' : 'deny'
      if (v === cur) delete nd[key] // برگشت به وضعیت ذخیره‌شده → بدون تغییر
      else nd[key] = v
      return nd
    })
  }

  const otherApprovers = useMemo(
    () => users.filter((u) => u.active && u.id !== perm?.id && u.caps?.approveReturns).length,
    [users, perm])

  /* ── کاربر جدید ── */
  async function createUser() {
    const username = nf.username.trim().toLowerCase()
    if (!/^[a-z0-9_.-]{3,30}$/.test(username)) return toast.error('نام کاربری معتبر نیست (۳ تا ۳۰ نویسه لاتین کوچک، رقم، نقطه، خط تیره یا زیرخط)')
    if (nf.fullName.trim().length < 2) return toast.error('نام کامل را وارد کنید')
    if (!nf.role) return toast.error('نقش را انتخاب کنید')
    if (nf.password.length < 4) return toast.error('رمز عبور اولیه باید حداقل ۴ نویسه باشد')
    const pin = nf.pin ? toEnDigits(nf.pin).replace(/\D/g, '') : ''
    if (pin && !/^\d{4}$/.test(pin)) return toast.error('رمز چهاررقمی باید دقیقاً ۴ رقم باشد')
    setCreating(true)
    const r = await api('/api/admin/users', {
      method: 'POST',
      body: {
        username, fullName: nf.fullName.trim(), honorific: nf.honorific, role: nf.role,
        title: nf.title, phone: nf.phone, password: nf.password, pin: pin || '', active: nf.active,
      },
    })
    setCreating(false)
    if (!r.ok) return toast.error(r.error || 'خطا در ایجاد کاربر')
    toast.success(`کاربر «${nf.fullName.trim()}» ایجاد شد`)
    setNewOpen(false)
    setNf(emptyForm())
    void load(true)
  }

  /* ── ویرایش ── */
  async function openEdit(u: any) {
    setEdit(u)
    setEf({
      username: u.username, fullName: u.fullName, honorific: u.honorific || '',
      role: u.role, title: u.title || '', phone: u.phone || '',
      password: '', pin: '', active: !!u.active,
    })
    setPinClear(false)
    setEDetail(null)
    const r = await api(`/api/admin/users/${u.id}`)
    if (r.ok) setEDetail(r.data.user)
  }

  async function saveEdit() {
    if (!edit) return
    const isSelf = me?.id === edit.id
    if (ef.fullName.trim().length < 2) return toast.error('نام کامل را وارد کنید')
    if (ef.password && ef.password.length < 4) return toast.error('رمز عبور باید حداقل ۴ نویسه باشد')
    const pin = ef.pin ? toEnDigits(ef.pin).replace(/\D/g, '') : ''
    if (pin && !/^\d{4}$/.test(pin)) return toast.error('رمز چهاررقمی باید دقیقاً ۴ رقم باشد')

    const body: any = {
      fullName: ef.fullName.trim(), honorific: ef.honorific, role: ef.role,
      title: ef.title, phone: ef.phone, active: ef.active,
    }
    if (isSelf) delete body.role // سرور اجازهٔ تغییر نقش خود را نمی‌دهد
    if (ef.password) body.password = ef.password
    if (pinClear) body.pin = ''
    else if (pin) body.pin = pin

    setSaving(true)
    const r = await api(`/api/admin/users/${edit.id}`, { method: 'PATCH', body })
    setSaving(false)
    if (!r.ok) return toast.error(r.error || 'خطا در ذخیره تغییرات')
    toast.success(`تغییرات «${edit.fullName}» ذخیره شد`)
    setEdit(null)
    void load(true)
  }

  /* ── دسترسی‌ها ── */
  async function openPerms(u: any) {
    setPerm(u)
    setPermLoading(true)
    setDraft({})
    setLoadedOv({})
    const r = await api(`/api/admin/users/${u.id}/permissions`)
    setPermLoading(false)
    if (!r.ok) { toast.error(r.error || 'خطا در دریافت دسترسی‌ها'); setPerm(null); return }
    const m: Record<string, boolean> = {}
    for (const o of r.data.overrides || []) m[o.pageKey] = !!o.allow
    setLoadedOv(m)
  }

  async function savePerms() {
    if (!perm) return
    const upserts: { pageKey: string; allow: boolean }[] = []
    const removals: string[] = []
    for (const [k, v] of Object.entries(draft)) {
      if (v === 'inherit') { if (loadedOv[k] !== undefined) removals.push(k) }
      else {
        const want = v === 'allow'
        if (loadedOv[k] === undefined || loadedOv[k] !== want) upserts.push({ pageKey: k, allow: want })
      }
    }
    if (!upserts.length && !removals.length) return toast.info('تغییری برای ذخیره وجود ندارد')
    setPermSaving(true)
    const r = await api(`/api/admin/users/${perm.id}/permissions`, {
      method: 'PUT', body: { upserts, removals },
    })
    setPermSaving(false)
    if (!r.ok) return toast.error(r.error || 'خطا در ذخیره دسترسی‌ها')
    const m: Record<string, boolean> = {}
    for (const o of r.data.overrides || []) m[o.pageKey] = !!o.allow
    setLoadedOv(m)
    setDraft({})
    toast.success(`دسترسی‌های «${perm.fullName}» ذخیره شد (${fa(r.data.upserted || 0)} تغییر، ${fa(r.data.removed || 0)} حذف)`)
    void load(true)
  }

  /* ═════ رندر ═════ */

  if (loading) {
    return (
      <Card><CardContent className="p-10 text-center text-stone-500">
        <I.loader size={22} className="mx-auto mb-3 animate-spin" />
        در حال دریافت کاربران و دسترسی‌ها…
      </CardContent></Card>
    )
  }

  if (denied) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <I.lock size={30} className="mx-auto mb-3 text-stone-400" />
          <p className="mb-1 text-sm font-bold">{denied}</p>
          <p className="mx-auto mb-4 max-w-md text-xs leading-6 text-stone-500">
            «کاربران و دسترسی» برای نقش‌های ارشد (مالک، مدیر کل، مدیر سیستم) فعال است.
            اگر به تازگی دسترسی «مدیریت کاربران» به شما داده شده، پس از ورود مجدد دوباره تلاش کنید.
          </p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setDenied(''); void load() }}>
            <I.refresh size={14} /> تلاش دوباره
          </Button>
        </CardContent>
      </Card>
    )
  }

  const permRole = perm?.role || ''
  const permSuper = SUPER_ROLES.includes(permRole)
  const sodRisk =
    perm && !permSuper &&
    capEffective('approveReturns', permRole, curOv) &&
    capEffective('recordReturnPayment', permRole, curOv)

  return (
    <div className="space-y-4">

      {/* ═══ ردیف آمار ═══ */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-stone-100"><I.users size={18} className="text-stone-500" /></div>
            <div>
              <div className="text-xl font-extrabold">{fa(stats?.total ?? users.length)}</div>
              <div className="text-[11px] text-stone-500">همه کاربران</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50"><I.userCheck size={18} className="text-emerald-600" /></div>
            <div>
              <div className="text-xl font-extrabold">{fa(stats?.active ?? users.filter((u) => u.active).length)}</div>
              <div className="text-[11px] text-stone-500">کاربران فعال</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-stone-100"><I.user size={18} className="text-stone-400" /></div>
            <div>
              <div className="text-xl font-extrabold">{fa(stats?.inactive ?? users.filter((u) => !u.active).length)}</div>
              <div className="text-[11px] text-stone-500">غیرفعال</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100"><I.shieldCheck size={18} className="text-amber-700" /></div>
            <div>
              <div className="text-xl font-extrabold">{fa(adminCount)}</div>
              <div className="text-[11px] text-stone-500">مدیران ارشد فعال</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══ جدول کاربران ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <I.users size={18} /> کاربران و دسترسی
            <Badge variant="secondary" className="text-[11px]">{fa(filtered.length)} از {fa(users.length)}</Badge>
            <Button size="sm" className="ms-auto gap-1.5"
              onClick={() => { setNf(emptyForm()); setNewOpen(true) }}>
              <I.plus size={15} /> کاربر جدید
            </Button>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <I.search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <Input value={search} onChange={(e: any) => setSearch(e.target.value)}
                placeholder="جستجوی نام یا نام کاربری…" className="w-56 pr-3 pl-8" aria-label="جستجوی کاربر" />
            </div>
            <Select value={roleF} onValueChange={setRoleF}>
              <SelectTrigger className="w-40" aria-label="فیلتر نقش"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه نقش‌ها</SelectItem>
                {ROLES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={activeF} onValueChange={setActiveF}>
              <SelectTrigger className="w-28" aria-label="فیلتر وضعیت"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                <SelectItem value="active">فعال</SelectItem>
                <SelectItem value="inactive">غیرفعال</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400">کاربری با این شرایط یافت نشد</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-stone-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">کاربر</TableHead>
                    <TableHead>نقش</TableHead>
                    <TableHead className="min-w-[120px]">عنوان شغلی</TableHead>
                    <TableHead className="text-center">وضعیت</TableHead>
                    <TableHead className="text-center">آخرین ورود</TableHead>
                    <TableHead className="text-center">دسترسی ویژه</TableHead>
                    <TableHead className="text-center">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => (
                    <TableRow key={u.id} className={cn(!u.active && 'opacity-60')}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar u={u} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold">
                              {u.honorific ? `${u.honorific} ` : ''}{u.fullName}
                            </div>
                            <div dir="ltr" className="truncate text-right font-mono text-[10px] text-stone-400">{u.username}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold', ROLE_BADGE[u.role] || 'bg-stone-100 text-stone-600')}>
                          {u.roleLabel || ROLE_LABEL[u.role] || u.role}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[140px]">
                        <span className="block truncate text-xs text-stone-600">{u.title || '—'}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className={cn('inline-block size-2 rounded-full', u.active ? 'bg-emerald-500' : 'border-2 border-stone-300 bg-white')} />
                          <span className={u.active ? 'text-emerald-700' : 'text-stone-400'}>{u.active ? 'فعال' : 'غیرفعال'}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-xs text-stone-500">
                        {u.lastLoginAt ? toFaDigits(formatJalali(new Date(u.lastLoginAt))) : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        {Number(u.permCount) > 0 ? (
                          <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800">{fa(u.permCount)} مورد</Badge>
                        ) : (
                          <span className="text-[10px] text-stone-400">پیش‌فرض نقش</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => void openEdit(u)}>
                            <I.pencil size={13} /> ویرایش
                          </Button>
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => void openPerms(u)}>
                            <I.shield size={13} /> دسترسی‌ها
                          </Button>
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

      {/* ═══ گفت‌وگوی کاربر جدید ═══ */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.user size={17} /> کاربر جدید</DialogTitle>
            <DialogDescription>
              حساب کاربری تازه — نقش، مشخصات و رمز عبور اولیه را تعیین کنید. دسترسی‌های ویژه را پس از ایجاد از دکمهٔ «دسترسی‌ها» تنظیم کنید.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-600">نام کاربری (لاتین)</label>
              <Input dir="ltr" value={nf.username} onChange={(e: any) => setNf({ ...nf, username: e.target.value })}
                placeholder="مثلاً rezaie2" className="font-mono text-sm" />
              <p className="text-[9px] leading-4 text-stone-400">۳ تا ۳۰ نویسه: حرف کوچک لاتین، رقم، نقطه، خط تیره یا زیرخط</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-600">نام کامل</label>
              <Input value={nf.fullName} onChange={(e: any) => setNf({ ...nf, fullName: e.target.value })}
                placeholder="نام و نام خانوادگی" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-600">عنوان احترامی</label>
              <Select value={nf.honorific || 'none'} onValueChange={(v: string) => setNf({ ...nf, honorific: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HONORIFICS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  <SelectItem value="none">بدون عنوان</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-600">نقش</label>
              <Select value={nf.role} onValueChange={(v: string) => setNf({ ...nf, role: v })}>
                <SelectTrigger><SelectValue placeholder="انتخاب نقش…" /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-600">عنوان شغلی (اختیاری)</label>
              <Input value={nf.title} onChange={(e: any) => setNf({ ...nf, title: e.target.value })}
                placeholder="مثلاً مسئول قفسهٔ لبنیات" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-600">شماره تماس (اختیاری)</label>
              <Input dir="ltr" inputMode="tel" value={nf.phone} onChange={(e: any) => setNf({ ...nf, phone: e.target.value })}
                placeholder="0912…" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-600">رمز عبور اولیه</label>
              <Input dir="ltr" type="password" value={nf.password} onChange={(e: any) => setNf({ ...nf, password: e.target.value })}
                placeholder="حداقل ۴ نویسه" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-600">رمز چهاررقمی (اختیاری)</label>
              <Input dir="ltr" inputMode="numeric" maxLength={4} value={nf.pin}
                onChange={(e: any) => setNf({ ...nf, pin: toEnDigits(e.target.value).replace(/\D/g, '').slice(0, 4) })}
                placeholder="۴ رقم" />
            </div>
            <div className="sm:col-span-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-3 py-2">
                <Checkbox checked={nf.active} onCheckedChange={(v: any) => setNf({ ...nf, active: !!v })} />
                <span className="text-sm">حساب از ابتدا فعال باشد</span>
              </label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewOpen(false)} disabled={creating}>انصراف</Button>
            <Button onClick={() => void createUser()} disabled={creating}>
              {creating ? <I.loader size={15} className="animate-spin" /> : <I.check size={15} />} ایجاد کاربر
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ گفت‌وگوی ویرایش کاربر ═══ */}
      <Dialog open={!!edit} onOpenChange={(o: boolean) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.pencil size={17} /> ویرایش «{edit?.fullName || ''}»</DialogTitle>
            <DialogDescription>
              نام کاربری <span dir="ltr" className="font-mono">{edit?.username}</span> —{' '}
              {eDetail?.hasPassword ? 'رمز عبور: تنظیم‌شده' : 'رمز عبور: ندارد'} ·{' '}
              {eDetail?.hasPin ? 'رمز چهاررقمی: تنظیم‌شده' : 'رمز چهاررقمی: ندارد'}
            </DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-600">نام کامل</label>
                <Input value={ef.fullName} onChange={(e: any) => setEf({ ...ef, fullName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-600">عنوان احترامی</label>
                <Select value={ef.honorific || 'none'} onValueChange={(v: string) => setEf({ ...ef, honorific: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HONORIFICS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    <SelectItem value="none">بدون عنوان</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-600">نقش</label>
                <Select value={ef.role} onValueChange={(v: string) => setEf({ ...ef, role: v })}
                  disabled={me?.id === edit.id}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {me?.id === edit.id && <p className="text-[9px] text-stone-400">نقش حساب خودتان قابل تغییر نیست</p>}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-600">عنوان شغلی</label>
                <Input value={ef.title} onChange={(e: any) => setEf({ ...ef, title: e.target.value })} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-stone-600">شماره تماس</label>
                <Input dir="ltr" inputMode="tel" value={ef.phone} onChange={(e: any) => setEf({ ...ef, phone: e.target.value })}
                  placeholder="0912…" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-600">بازنشانی رمز عبور</label>
                <Input dir="ltr" type="password" value={ef.password} onChange={(e: any) => setEf({ ...ef, password: e.target.value })}
                  placeholder="خالی = بدون تغییر" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-600">بازنشانی رمز چهاررقمی</label>
                <Input dir="ltr" inputMode="numeric" maxLength={4} value={ef.pin}
                  onChange={(e: any) => { setEf({ ...ef, pin: toEnDigits(e.target.value).replace(/\D/g, '').slice(0, 4) }); if (e.target.value) setPinClear(false) }}
                  placeholder="خالی = بدون تغییر" />
                {eDetail?.hasPin && (
                  <button type="button"
                    onClick={() => { setPinClear(!pinClear); if (!pinClear) setEf({ ...ef, pin: '' }) }}
                    className={cn('mt-1 text-[10px] underline', pinClear ? 'text-rose-600' : 'text-stone-400')}>
                    {pinClear ? 'انصراف از حذف رمز چهاررقمی' : 'حذف رمز چهاررقمی این کاربر'}
                  </button>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className={cn('flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2', me?.id === edit.id ? 'opacity-60' : 'cursor-pointer')}>
                  <Checkbox checked={ef.active} disabled={me?.id === edit.id}
                    onCheckedChange={(v: any) => setEf({ ...ef, active: !!v })} />
                  <span className="text-sm">حساب فعال است</span>
                  {me?.id === edit.id && <span className="ms-auto text-[9px] text-stone-400">حساب خودتان را نمی‌توانید غیرفعال کنید</span>}
                </label>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEdit(null)} disabled={saving}>انصراف</Button>
            <Button onClick={() => void saveEdit()} disabled={saving}>
              {saving ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />} ذخیره تغییرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ گفت‌وگوی ماتریس دسترسی ═══ */}
      <Dialog open={!!perm} onOpenChange={(o: boolean) => !o && setPerm(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <I.shield size={18} className="text-amber-600" />
              دسترسی‌های «{perm?.honorific ? perm.honorific + ' ' : ''}{perm?.fullName || ''}»
              <span dir="ltr" className="font-mono text-[11px] font-normal text-stone-400">{perm?.username}</span>
              <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold', ROLE_BADGE[permRole] || 'bg-stone-100 text-stone-600')}>
                {perm?.roleLabel || ROLE_LABEL[permRole] || permRole}
              </span>
            </DialogTitle>
            <DialogDescription>
              دسترسی ویژهٔ فعال: {fa(Object.keys(curOv).length)} مورد — هر تغییر تنها روی این کاربر اعمال می‌شود و بر نقش او مقدم است.
            </DialogDescription>
          </DialogHeader>

          {permLoading ? (
            <div className="py-10 text-center text-stone-500">
              <I.loader size={22} className="mx-auto mb-3 animate-spin" />
              در حال دریافت دسترسی‌ها…
            </div>
          ) : (
            <Tabs defaultValue="pages">
              <TabsList className="w-full">
                <TabsTrigger value="pages" className="gap-1.5 py-2 text-xs sm:text-sm"><I.layoutGrid size={15} /> صفحات و بخش‌ها</TabsTrigger>
                <TabsTrigger value="caps" className="gap-1.5 py-2 text-xs sm:text-sm"><I.keyRound size={15} /> توانایی‌ها</TabsTrigger>
              </TabsList>

              {/* ─── صفحات و بخش‌ها ─── */}
              <TabsContent value="pages" className="mt-3">
                {permSuper ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3">
                      <I.lock size={17} className="mt-0.5 shrink-0 text-amber-700" />
                      <p className="text-xs leading-6 text-amber-900">
                        برای مالک و مدیر سیستم (نقش‌های ارشد)، صفحات قابل مسدودسازی نیستند — همهٔ بخش‌ها همیشه در دسترس این نقش‌ها است.
                      </p>
                    </div>
                    <div className="max-h-[48vh] space-y-2 overflow-y-auto pl-1">
                      {SECTIONS.map((sec) => (
                        <div key={sec.key} className="rounded-xl border border-stone-200">
                          <div className="flex items-center gap-2 rounded-t-xl border-b border-stone-200 bg-stone-50 px-3 py-2">
                            <Icon name={sec.icon as any} size={15} className="text-stone-500" />
                            <span className="text-sm font-bold">{sec.label}</span>
                            <span className="text-[10px] text-stone-400">{fa(sec.pages.length)} صفحه</span>
                            <div className="ms-auto"><TriState value="inherit" onChange={() => {}} disabled /></div>
                          </div>
                          <div className="divide-y">
                            {sec.pages.map((p) => (
                              <div key={p.key} className="flex items-center gap-2 px-3 py-1.5">
                                <span className="text-xs font-medium">{p.label}</span>
                                <span dir="ltr" className="font-mono text-[9px] text-stone-400">{p.key}</span>
                                <span className="ms-auto"><EffChip st={pageState(p.key, permRole, {})} /></span>
                                <TriState value="inherit" onChange={() => {}} disabled />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="max-h-[52vh] space-y-2 overflow-y-auto pl-1">
                    {SECTIONS.map((sec) => {
                      const sk = 'section:' + sec.key
                      const secVal: TriVal = curOv[sk] === undefined ? 'inherit' : curOv[sk] ? 'allow' : 'deny'
                      return (
                        <div key={sec.key} className="rounded-xl border border-stone-200">
                          <div className="flex items-center gap-2 rounded-t-xl border-b border-stone-200 bg-stone-50 px-3 py-2">
                            <Icon name={sec.icon as any} size={15} className="text-stone-500" />
                            <span className="text-sm font-bold">{sec.label}</span>
                            <span className="text-[10px] text-stone-400">{fa(sec.pages.length)} صفحه</span>
                            <span className="ms-auto">
                              <TriState value={secVal} onChange={(v) => setTri(sk, v)} />
                            </span>
                          </div>
                          <div className="divide-y">
                            {sec.pages.map((p) => {
                              const pv: TriVal = curOv[p.key] === undefined ? 'inherit' : curOv[p.key] ? 'allow' : 'deny'
                              const st = pageState(p.key, permRole, curOv)
                              return (
                                <div key={p.key} className="flex items-center gap-2 px-3 py-1.5">
                                  <span className="text-xs font-medium">{p.label}</span>
                                  <span dir="ltr" className="font-mono text-[9px] text-stone-400">{p.key}</span>
                                  <span className="ms-auto"><EffChip st={st} /></span>
                                  <TriState value={pv} onChange={(v) => setTri(p.key, v)} />
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>

              {/* ─── توانایی‌ها ─── */}
              <TabsContent value="caps" className="mt-3">
                {sodRisk && (
                  <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3">
                    <I.alertTriangle size={17} className="mt-0.5 shrink-0 text-amber-700" />
                    <p className="text-xs leading-6 text-amber-900">
                      تداخل تفکیک وظایف (SoD): این کاربر هم «تأیید مرجوعی» و هم «ثبت پرداخت مرجوعی» را در اختیار دارد.
                      بهتر است این دو مسئولیت نزد دو نفر مختلف باشد تا خطا یا تقلب ساده‌تر آشکار شود.
                    </p>
                  </div>
                )}
                {!permSuper && perm && capEffective('approveReturns', permRole, curOv) && otherApprovers === 0 && (
                  <div className="mb-3 flex items-start gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">
                    <I.info size={17} className="mt-0.5 shrink-0 text-stone-500" />
                    <p className="text-xs leading-6 text-stone-600">
                      این کاربر در حال حاضر تنها تأییدکنندهٔ فعال مرجوعی است — برای پشتیبانی، یک تأییدکنندهٔ دیگر هم تعیین کنید.
                    </p>
                  </div>
                )}
                {permSuper && (
                  <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3">
                    <I.lock size={17} className="mt-0.5 shrink-0 text-amber-700" />
                    <p className="text-xs leading-6 text-amber-900">
                      برای نقش‌های ارشد همهٔ توانایی‌ها همیشه فعال است و قابل محدودسازی نیست.
                    </p>
                  </div>
                )}
                <div className="max-h-[48vh] divide-y overflow-y-auto rounded-xl border border-stone-200 pl-1">
                  {CAPS.map((c) => {
                    const ck = 'cap:' + c.key
                    const cv: TriVal = curOv[ck] === undefined ? 'inherit' : curOv[ck] ? 'allow' : 'deny'
                    const defOk = permSuper || (CAP_DEFAULTS[c.key] || []).includes(permRole)
                    const eff = capEffective(c.key, permRole, curOv)
                    return (
                      <div key={c.key} className="flex items-center gap-2 px-3 py-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold">{c.label}</span>
                            <span className={cn('text-[9px]', eff ? 'text-emerald-600' : 'text-stone-400')}>
                              اثربخش: {eff ? 'مجاز' : 'مسدود'}
                            </span>
                          </div>
                          <div className="text-[10px] text-stone-400">
                            {permSuper ? 'پیش‌فرض نقش: همیشه مجاز' : defOk ? 'پیش‌فرض نقش: مجاز' : 'پیش‌فرض نقش: مسدود'} — {c.desc}
                          </div>
                        </div>
                        <div className="ms-auto shrink-0">
                          <TriState value={cv} onChange={(v) => setTri(ck, v)} disabled={permSuper} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter className="gap-2 border-t border-stone-200 pt-3">
            <span className={cn('me-auto text-[11px]', changedCount ? 'font-bold text-amber-700' : 'text-stone-400')}>
              {changedCount ? `${fa(changedCount)} تغییر ذخیره نشده` : 'بدون تغییر'}
            </span>
            <Button variant="outline" onClick={() => setDraft({})} disabled={!changedCount || permSaving}>بازگردانی</Button>
            <Button onClick={() => void savePerms()} disabled={!changedCount || permSaving}>
              {permSaving ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />} ذخیره تغییرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
