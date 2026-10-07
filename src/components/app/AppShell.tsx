'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { toast } from 'sonner'
import { api, setSessionToken, clearSessionToken } from '@/lib/client'
import { canAccess, ROLE_LABELS } from '@/lib/constants'
import { faNum } from '@/lib/jalali'
import { UserAvatar } from '@/components/app/avatar-render'
import { AvatarProfileModal, type AvatarInfo } from '@/components/app/AvatarBuilder'
import LoginView from '@/components/views/Login'
import DashboardView from '@/components/views/Dashboard'
import SupplyChainView from '@/components/views/SupplyChain'
import AccountingView from '@/components/views/Accounting'
import ProductsView from '@/components/views/Products'
import ProvidersView from '@/components/views/Providers'
import ChequesView from '@/components/views/Cheques'
import ArchiveView from '@/components/views/Archive'
import MessagesView from '@/components/views/Messages'
import TasksView from '@/components/views/Tasks'
import SopView from '@/components/views/Sop'
import WallView from '@/components/views/Wall'
import NotesView from '@/components/views/Notes'
import FeedbackView from '@/components/views/Feedback'
import PlanogramView from '@/components/views/Planogram'
import FloorPlanView from '@/components/views/FloorPlan'
import SalesView from '@/components/views/Sales'
import PerfView from '@/components/views/Perf'
import AdminView from '@/components/views/Admin'
import HelpView from '@/components/views/Help'
import NotifsView from '@/components/views/Notifs'
import BriefingView from '@/components/views/Briefing'
import ReportsView from '@/components/views/Reports'
import PriceCheckView from '@/components/views/PriceCheck'
import ScienceView from '@/components/views/Science'
import PayrollView from '@/components/views/Payroll'
import PeopleView from '@/components/views/People'
import ResearchView from '@/components/views/Research'
import DemoStudioView from '@/components/views/DemoStudio'
import ZoneCountView from '@/components/views/ZoneCount'
import LeavesView from '@/components/views/Leaves'
import ShiftsView from '@/components/views/Shifts'
import CrmView from '@/components/views/Crm'
import PersonnelView from '@/components/views/Personnel'
import RbacView from '@/components/views/Rbac'
import DataAdminView from '@/components/views/DataAdmin'
import UrgentView from '@/components/views/Urgent'
import KbView from '@/components/views/Kb'
import SandboxTour, { SandboxTourButton } from '@/components/app/SandboxTour'
import { ThemeLangBar, PopoverScaffold } from '@/components/app/ThemeLangBar'
import { AppCtx } from '@/components/app/ui-bits'
import BarcodeScannerHost from '@/components/app/BarcodeScanner'
import CommandPalette, { pushRecentView } from '@/components/app/CommandPalette'
import SetupWizard from '@/components/app/SetupWizard'
import { NavbarCalendar } from '@/components/app/NavbarCalendar'
import { Logo } from '@/components/app/Logo'
import { MODULE_OF, MODULE_LABELS, moduleActive, type LicenseState } from '@/lib/license'
import { useHolidays } from '@/components/app/jalali-widgets'
import { t as tI18n } from '@/lib/i18n'
import { formatJalaliFull, todayIso } from '@/lib/jalali'
import { useLang } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// lucide icons
import {
  LayoutDashboard, Calculator, ShoppingBasket,
  Truck, Banknote, ListChecks, BookOpen, Newspaper, MessageCircle, NotebookPen,
  HeartHandshake, LayoutGrid, Store, Trophy, ShieldCheck, Info, Bell, Plus, LogOut,
  Menu, X, BellRing, Sunrise, CalendarDays, FileSpreadsheet, BadgePercent, Search,
  FlaskConical, GraduationCap, Presentation, Library, ClipboardCheck, CalendarRange, Map,
  Users, UserCog, KeyRound, DatabaseBackup, Zap, Wallet, Contact,
  CalendarClock,
} from 'lucide-react'

type NavItem = { key: string; label: string; icon: any; badge?: number }
type NavGroup = { title: string; items: NavItem[] }

function snoozeTargetIso(hours: number): string {
  return new Date(Date.now() + hours * 3600000).toISOString()
}

/* ── معماری اطلاعات منو (round-18) — پایهٔ پژوهشی:
 *  • Card Sorting (Spencer/Warfel): خوشه‌ها از مدل ذهنی کاربر داغان‌سازی شد — صفحاتی که
 *    «با هم انجام می‌شوند» کنار هم‌اند (پرسنل + شیفت + مرخصی + حقوق = چرخهٔ نیروی انسانی؛
 *    دفتر اشخاص + تأمین‌کنندگان + CRM = «شبکهٔ اشخاص»: همهٔ آدم‌های کسب‌وکار یک‌جا).
 *  • Miller 7±2: خوشه‌بندی نهایی ۸ قطعه است؛ بزرگ‌ترین گروه قبلی (۱۳ آیتم تیم و ارتباطات)
 *    به ۳ خوشه شکسته شد تا هر قطعه ۳ تا ۷ آیتم داشته باشد.
 *  • Progressive Disclosure (Nielsen): هر خوشه جمع‌شونده است — فقط خوشهٔ فعال باز است؛
 *    جمع‌شده‌ها فقط عنوان‌اند، پس فهرست بلند به ۸ عنوان کوتاه تبدیل می‌شود.
 *  • Hick's Law: کاهش گزینه‌های هم‌زمانِ مرئی → تصمیم‌گیری سریع‌تر.
 *  • Recognition over Recall: آیکن + برچسب ثابت هر آیتم، و سرچ/CommandPalette برای کاربران
 *    خبره (GOMS / Keystroke-Level) حفظ شده است.
 *  • Hub-and-Spoke: صفحات مرتبطِ یک خوشه در آینده می‌توانند هاب مشترک بگیرند
 *    (شبکهٔ اشخاص ← People/Providers/CRM با پیوند دوطرفه). */
const NAV: NavGroup[] = [
  {
    title: 'عملیات روزانه',
    items: [
      { key: 'dashboard', label: 'داشبورد', icon: LayoutDashboard },
      /* round-19h: سفارش‌ها + دریافت مرسوله + تأیید انبار در یک بخش واحد «زنجیرهٔ تأمین» —
         هش‌های قدیمی orders/receiving/verify به همین نما با تبِ ازپیش‌انتخاب‌شده نگاشت می‌شوند */
      { key: 'supply', label: 'زنجیرهٔ تأمین', icon: Truck },
      { key: 'accounting', label: 'حسابداری و هلو', icon: Calculator },
    ],
  },
  {
    title: 'فروشگاه و انبار',
    items: [
      { key: 'products', label: 'کالاها', icon: ShoppingBasket },
      { key: 'zonecount', label: 'شمارش روزانهٔ زون', icon: ClipboardCheck },
      { key: 'planogram', label: 'پلانوگرام قفسه‌ها', icon: LayoutGrid },
      { key: 'floorplan', label: 'نقشهٔ فروشگاه', icon: Map },
      { key: 'sales', label: 'فروش و مشتریان', icon: Store },
    ],
  },
  {
    title: 'نیروی انسانی',
    items: [
      { key: 'personnel', label: 'مدیریت پرسنل', icon: UserCog },
      { key: 'shifts', label: 'شیفت‌ها و برنامهٔ تیم', icon: CalendarClock },
      { key: 'leaves', label: 'مرخصی و برنامهٔ تیم', icon: CalendarRange },
      { key: 'payroll', label: 'حقوق و دستمزد', icon: Wallet },
      { key: 'perf', label: 'عملکرد و امتیازها', icon: Trophy },
    ],
  },
  {
    title: 'شبکهٔ اشخاص',
    items: [
      { key: 'people', label: 'دفتر اشخاص', icon: Contact },
      { key: 'providers', label: 'تأمین‌کنندگان', icon: Truck },
    ],
  },
  {
    /* round-19h: CRM بخش یکتای خودش است — نه تو در تو در خوشهٔ اشخاص؛
       «پورتال مشتریان» همهٔ ماژول‌های تعامل با مشتری را پوشش می‌دهد */
    title: 'پورتال مشتریان',
    items: [
      { key: 'crm', label: 'مشتریان و CRM', icon: Users },
    ],
  },
  {
    title: 'مالی و اسناد',
    items: [
      { key: 'pricecheck', label: 'کنترل قیمت روزانه', icon: BadgePercent },
      { key: 'cheques', label: 'چک‌ها و پرداخت‌ها', icon: Banknote },
      { key: 'archive', label: 'آرشیو اسناد', icon: Library },
      { key: 'reports', label: 'گزارش‌ها و اکسل', icon: FileSpreadsheet },
    ],
  },
  {
    title: 'همکاری تیمی',
    items: [
      { key: 'tasks', label: 'وظایف من', icon: ListChecks },
      { key: 'sop', label: 'روال‌های استاندارد', icon: BookOpen },
      { key: 'wall', label: 'دیجیتال‌وال', icon: Newspaper },
      { key: 'messages', label: 'پیام‌ها', icon: MessageCircle },
      { key: 'urgent', label: 'پرسش‌های فوری', icon: Zap },
      { key: 'notes', label: 'یادداشت‌های من', icon: NotebookPen },
      { key: 'feedback', label: 'بازخورد و ایده‌ها', icon: HeartHandshake },
    ],
  },
  {
    title: 'علم و پژوهش',
    items: [
      { key: 'science', label: 'جعبه‌ابزار علمی', icon: FlaskConical },
      { key: 'research', label: 'مرکز پژوهش', icon: GraduationCap },
      { key: 'demo', label: 'استودیوی دمو', icon: Presentation },
    ],
  },
  {
    title: 'سیستم',
    items: [
      { key: 'notifs', label: 'مرکز اعلان‌ها', icon: BellRing },
      { key: 'briefing', label: 'صبح‌نامه امروز', icon: Sunrise },
      { key: 'kb', label: 'دانشنامه و آموزش', icon: GraduationCap },
      { key: 'admin', label: 'مدیریت سامانه', icon: ShieldCheck },
      { key: 'rbac', label: 'نقش‌ها و دسترسی‌ها', icon: KeyRound },
      { key: 'data', label: 'مدیریت داده‌ها', icon: DatabaseBackup },
      { key: 'help', label: 'راهنما', icon: Info },
    ],
  },
]

const VIEW_TITLES: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.key, i.label]))
)
/* round-19h: عناوین سازگاری — هش‌های قدیمی سه مرحلهٔ زنجیرهٔ تأمین (اعلان‌ها/بوکمارک‌ها)
 * هنوز به viewهای orders/receiving/verify نگاشت می‌شوند؛ عنوان درست بگیرند */
VIEW_TITLES['orders'] = 'زنجیرهٔ تأمین — سفارش‌ها'
VIEW_TITLES['receiving'] = 'زنجیرهٔ تأمین — دریافت مرسوله'
VIEW_TITLES['verify'] = 'زنجیرهٔ تأمین — تأیید انبار'

const GROUP_TITLE_KEYS: Record<string, string> = {
  'عملیات روزانه': 'nav.daily',
  'فروشگاه و انبار': 'nav.store',
  'نیروی انسانی': 'nav.workforce',
  'شبکهٔ اشخاص': 'nav.peoplenet',
  'مالی و اسناد': 'nav.finance',
  'همکاری تیمی': 'nav.collab',
  'علم و پژوهش': 'nav.group.science',
  'سیستم': 'nav.system',
}

/** برچسب ناوبری چندزبانه — در نبود ترجمه، برچسب فارسی اصلی */
function navLabel(key: string, faLabel: string, lang: string): string {
  if (lang === 'fa') return faLabel
  const v = tI18n(`nav.${key}`)
  return v.startsWith('nav.') ? faLabel : v
}
function groupTitle(faTitle: string, lang: string): string {
  if (lang === 'fa') return faTitle
  const v = tI18n(GROUP_TITLE_KEYS[faTitle] || '')
  /* !v → گروه بدون کلید i18n (مثل «پورتال مشتریان» round-19h) به فارسی برمی‌گردد */
  return !v || v.startsWith('nav.') ? faTitle : v
}

/** تاریخ امروز — دکمه‌ای؛ کلیک → ویجت تقویم با رویدادهای روز (round-16) */
function TopbarDateChip() {
  return <NavbarCalendar />
}

function parseHash(): { view: string; param: string } {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [view, param] = h.split('/')
  return { view: view || 'dashboard', param: param || '' }
}

export default function AppShell() {
  const { lang } = useLang()
  const [user, setUser] = useState<AppCtx['user']>(null)
  const [loading, setLoading] = useState(true)
  const [nav, setNav] = useState({ view: 'dashboard', param: '' })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const bellRef = useRef<HTMLButtonElement>(null)
  const [notifs, setNotifs] = useState<{ id: string; severity: string; icon: string; title: string; detail: string; go: string }[]>([])
  const [snoozedUntil, setSnoozedUntil] = useState('')
  const [socket, setSocket] = useState<Socket | null>(null)
  const [extraViews, setExtraViews] = useState<string[]>([]) // بخش‌هایی که نقش‌های سفارشی باز می‌کنند
  const [msgTick, setMsgTick] = useState(0)
  const socketRef = useRef<Socket | null>(null)
  // round-17: آواتار کاربر (عکس واقعی + آواتار کارتونی) — جدا از AppCtx تا ui-bits دست‌نخورده بماند
  const [avatar, setAvatar] = useState<AvatarInfo>({ url: '', style: '' })
  const [avatarOpen, setAvatarOpen] = useState(false)
  // round-18: حالت باز/جمع خوشه‌های منو — progressive disclosure؛ انتخاب دستی کاربر در localStorage می‌ماند
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('sarresid.nav.groups')
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
    } catch {
      return {}
    }
  })
  // round-16: نصب/سندباکس/لایسنس
  const [setupDone, setSetupDone] = useState<boolean | null>(null) // null = در حال خواندن
  const [sandbox, setSandbox] = useState(false)
  const [businessName, setBusinessName] = useState('هایپر زیتون')
  const [license, setLicense] = useState<LicenseState | null>(null)
  const [deskNotif, setDeskNotif] = useState<boolean>(
    () => typeof window !== 'undefined' && 'Notification' in window && localStorage.getItem('hz-desktop-notifs') === '1'
  )
  const [deskPerm, setDeskPerm] = useState<string>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  ) // 'granted' | 'denied' | 'default' | 'unsupported'

  /* اعلان دسکتاپ — وقتی تب در پس‌زمینه است، اعلان‌های فوری را با Notification API نشان بده.
   * dedupe با نقشه id→count در localStorage؛ وقتی تب دیده می‌شود فقط وضعیت را به‌روز می‌کنیم (تُست خودش خبر می‌دهد). */
  const fireDesktopNotifs = useCallback((list: { id: string; severity: string; icon: string; title: string; detail: string; count?: number }[]) => {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      const enabled = localStorage.getItem('hz-desktop-notifs') === '1'
      const seen: Record<string, number> = JSON.parse(localStorage.getItem('hz-desktop-seen') || '{}')
      const hidden = document.visibilityState === 'hidden'
      for (const n of list) {
        const cur = n.count ?? 1
        const wasSeen = seen[n.id]
        const isNew = wasSeen === undefined || cur > wasSeen
        if (enabled && hidden && isNew && n.severity === 'critical') {
          try {
            const notif = new Notification(`${businessName} • سررسید`, {
              body: `${n.icon} ${n.title}\n${n.detail.slice(0, 110)}`,
              tag: n.id,
            })
            notif.onclick = () => {
              window.focus()
              notif.close()
            }
          } catch {
            /* some engines throw on constructor — ignore */
          }
        }
        seen[n.id] = cur
      }
      // prune keys that no longer exist
      const live = new Set(list.map((n) => n.id))
      for (const k of Object.keys(seen)) if (!live.has(k)) delete seen[k]
      localStorage.setItem('hz-desktop-seen', JSON.stringify(seen))
    } catch {
      /* storage unavailable — silent */
    }
  }, [businessName])

  const toggleDeskNotif = useCallback(async () => {
    if (!('Notification' in window)) return toast.info('مرورگر شما از اعلان دسکتاپ پشتیبانی نمی‌کند')
    if (Notification.permission === 'denied') return toast.error('اجازه اعلان داده نشده — از نوار آدرس مرورگر (🔒) اجازه دهید')
    if (deskNotif) {
      localStorage.setItem('hz-desktop-notifs', '0')
      setDeskNotif(false)
      toast.info('اعلان دسکتاپ خاموش شد — اعلان‌ها فقط داخل سامانه می‌آیند')
      return
    }
    try {
      const perm = await Notification.requestPermission()
      setDeskPerm(perm)
      if (perm === 'granted') {
        localStorage.setItem('hz-desktop-notifs', '1')
        setDeskNotif(true)
        toast.success('اعلان دسکتاپ روشن شد — وقتی سامانه در پس‌زمینه است، فوری‌ها 🚨 روی دسکتاپ می‌آیند')
        try {
          const t = new Notification(`${businessName} • سررسید`, { body: 'اعلان دسکتاپ فعال شد ✅ — این یک پیام آزمایشی است' })
          t.onclick = () => {
            window.focus()
            t.close()
          }
        } catch {
          /* ignore */
        }
      } else {
        toast.info('برای فعال‌سازی، اجازه اعلان را در مرورگر تأیید کنید')
      }
    } catch {
      toast.error('درخواست اجازه اعلان ناموفق بود')
    }
  }, [deskNotif, businessName])

  useEffect(() => {
    api<{ user: AppCtx['user']; extraViews?: string[]; token?: string }>('/api/auth/me')
      .then((d) => {
        if (d.token) setSessionToken(d.token) // self-heal session for cookie-blocked mobile webviews
        setUser(d.user)
        setExtraViews(d.extraViews || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    const applyHash = () => setNav(parseHash())
    const raf = requestAnimationFrame(applyHash)
    window.addEventListener('hashchange', applyHash)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('hashchange', applyHash)
    }
  }, [])

  /* round-17: واکشی آواتار کاربر بعد از لاگین — پس از هر ذخیره در مودال هم به‌روز می‌شود */
  useEffect(() => {
    if (!user) return
    api<{ avatarUrl?: string; avatarStyle?: string }>('/api/me/avatar')
      .then((d) => setAvatar({ url: d.avatarUrl || '', style: d.avatarStyle || '' }))
      .catch(() => {})
  }, [user?.id])

  /* round-16: وضعیت نصب/سندباکس/لایسنس — پیش از لاگین هم لازم است (جادوگر) */
  const refreshSetup = useCallback(() => {
    api<{ done: boolean; sandbox: boolean; business: Record<string, unknown> | null; license: LicenseState | null }>('/api/setup')
      .then((d) => {
        setSetupDone(!!d.done)
        setSandbox(!!d.sandbox)
        if (d.business?.name) setBusinessName(String(d.business.name))
        if (d.license) setLicense(d.license)
      })
      .catch(() => setSetupDone(true)) // خطای شبکه → فرض نصب‌شده تا جادوگر بی‌جهت نمایش داده نشود
  }, [])
  useEffect(() => {
    refreshSetup()
  }, [refreshSetup])

  // websocket for real-time messaging (URL configurable for local server deployments)
  useEffect(() => {
    if (!user || socketRef.current) return
    const sockUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '/?XTransformPort=3003'
    const s = io(sockUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1500,
    })
    socketRef.current = s
    s.on('connect', () => {
      s.emit('hz-join', { userId: user.id, name: user.name })
      setSocket(s)
    })
    s.on('hz-msg', (data: { toId: string; fromName: string; body: string }) => {
      if (data.toId === user.id) {
        toast(`💬 ${data.fromName}: ${data.body.slice(0, 60)}`)
        setMsgTick((t) => t + 1)
      }
    })
    return () => {
      s.disconnect()
      socketRef.current = null
    }
  }, [user?.id])

  const navigate = useCallback((view: string, param = '') => {
    window.location.hash = `#/${view}${param ? '/' + param : ''}`
    setNav({ view, param })
    setSidebarOpen(false)
    setNotifOpen(false)
    pushRecentView(view)
    window.scrollTo({ top: 0 })
  }, [])

  // Ctrl+K / ⌘K opens the command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const refreshNotifications = useCallback(async () => {
    if (!user) return
    try {
      const d = await api<any>('/api/notifications')
      setNotifs(d.notifications || [])
      setSnoozedUntil(d.prefs?.snoozeUntil || '')
      fireDesktopNotifs(d.notifications || [])
    } catch {
      /* silent */
    }
  }, [user, fireDesktopNotifs])

  const bellSnooze = async (hours: number) => {
    try {
      await api('/api/notif-prefs', { method: 'PUT', body: { snoozeUntil: snoozeTargetIso(hours) } })
      toast.success(`سامانه ${faNum(hours)} ساعت ساکت شد — فقط فوری‌ها زنگ می‌خورند 😌`)
      setNotifOpen(false)
      refreshNotifications()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const wakeNotifs = async () => {
    try {
      await api('/api/notif-prefs', { method: 'PUT', body: { snoozeUntil: '' } })
      toast.success('سکوت موقت لغو شد — اعلان‌ها برگشتند 🔔')
      refreshNotifications()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  useEffect(() => {
    if (!user) return
    const tick = () => refreshNotifications()
    const t0 = setTimeout(tick, 0)
    const t = setInterval(tick, 45000)
    return () => {
      clearTimeout(t0)
      clearInterval(t)
    }
  }, [user, refreshNotifications, msgTick])

  const logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }) } catch { /* still clear locally */ }
    clearSessionToken()
    socketRef.current?.disconnect()
    socketRef.current = null
    setSocket(null)
    setAvatar({ url: '', style: '' }) // round-17: پاک‌کردن آواتار جلسهٔ قبلی
    setUser(null)
    navigate('dashboard')
  }

  const ctx: AppCtx = useMemo(
    () => ({ user, navigate, view: nav.view, param: nav.param, refreshNotifications, socket, socketReady: !!socket }),
    [user, navigate, nav, refreshNotifications, socket]
  )

  if (loading) {
    return (
      <div className="pattern-girih flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-14 w-14 animate-spin rounded-full border-4 border-[#c9a227]/30 border-t-[#c9a227]" />
          <p className="text-sm font-bold text-[#e9f0e4]">در حال بارگذاری سامانه…</p>
        </div>
      </div>
    )
  }

  /* round-16: جادوگر نصب — قبل از هر چیز (حتی لاگین) */
  if (setupDone === false) {
    return <SetupWizard onDone={() => refreshSetup()} />
  }

  if (!user)
    return (
      <LoginView
        onLogin={(u, token) => {
          if (token) setSessionToken(token) // header channel for cookie-blocked webviews
          setUser(u)
          api<{ extraViews?: string[] }>('/api/auth/me').then((d) => setExtraViews(d.extraViews || [])).catch(() => {})
          toast.success(`خوش آمدید ${u.name} 🌿`)
        }}
      />
    )

  // role-filtered nav (+ multi-language labels) — نقش‌های سفارشی هم بخش باز می‌کنند
  /* round-16: نشان‌های اعلان روی منوی کنار (سبک نوت‌یز‌ریپ) + قفل لایسنس ماژولار */
  const badgeCounts: Record<string, number> = {}
  for (const n of notifs) {
    let k = (n.go || '').split('/')[0]
    /* round-19h: اعلان‌های قدیمی سه مرحلهٔ زنجیره نشانِ خودشان را روی آیتم «زنجیرهٔ تأمین» می‌گذارند */
    if (k === 'orders' || k === 'receiving' || k === 'verify') k = 'supply'
    if (k) badgeCounts[k] = (badgeCounts[k] || 0) + 1
  }
  const licToday = todayIso()
  const isViewLocked = (viewKey: string): boolean => {
    if (!license) return false
    const mod = MODULE_OF[viewKey]
    if (!mod) return false
    return !moduleActive(license, mod, licToday)
  }
  /* round-19h: «supply» در VIEW_ACCESS کلید جدا ندارد — دسترسی‌اش اجتماعِ سه مرحله است
   * (هرکس سفارش/دریافت/تأیید می‌بیند، زنجیره را می‌بیند؛ تب‌های خارج از نقشش خالی‌اند) */
  const viewAllowed = (key: string): boolean => {
    if (key === 'supply') {
      return (
        canAccess('orders', user.role, user.secondaryRoles || []) ||
        canAccess('receiving', user.role, user.secondaryRoles || []) ||
        canAccess('verify', user.role, user.secondaryRoles || [])
      )
    }
    return canAccess(key, user.role, user.secondaryRoles || [])
  }
  const groups = NAV.map((g) => ({
    title: groupTitle(g.title, lang),
    items: g.items
      .filter((i) => viewAllowed(i.key) || extraViews.includes('*') || extraViews.includes(i.key))
      .map((i) => ({ ...i, label: navLabel(i.key, i.label, lang), locked: isViewLocked(i.key), badge: badgeCounts[i.key] || 0 })),
  })).filter((g) => g.items.length > 0)

  // round-18: خوشهٔ فعال — گروهی که نمای فعلی در آن است (fallback: اولین گروه)
  // round-19h: هش‌های قدیمی سه مرحله به «زنجیرهٔ تأمین» نگاشت می‌شوند تا هایلایت خوشه درست بماند
  const SUPPLY_ALIASES = ['orders', 'receiving', 'verify']
  const activeViewKey = SUPPLY_ALIASES.includes(nav.view) ? 'supply' : nav.view
  const activeGroupTitle = groups.find((g) => g.items.some((i) => i.key === activeViewKey))?.title || groups[0]?.title || ''

  const toggleGroup = (title: string, nextOpen: boolean) => {
    setOpenGroups((prev) => {
      const nextState = { ...prev, [title]: nextOpen }
      try { localStorage.setItem('sarresid.nav.groups', JSON.stringify(nextState)) } catch { /* ignore */ }
      return nextState
    })
  }

  const canQuickOrder = ['GM', 'PM', 'OM'].includes(user.role)

  const currentTitle =
    nav.param && nav.view === 'orders'
      ? navLabel('orders', 'جزئیات سفارش', lang)
      : nav.param && nav.view === 'receiving'
        ? navLabel('receiving', 'دریافت مرسوله', lang)
        : VIEW_TITLES[nav.view]
          ? navLabel(nav.view, VIEW_TITLES[nav.view], lang)
          : navLabel('dashboard', 'داشبورد', lang)

  const renderView = () => {
    switch (nav.view) {
      case 'locked': return <LockedModuleView module={nav.param} onBack={() => navigate('dashboard')} />
      case 'dashboard': return <DashboardView ctx={ctx} />
      /* round-19h: زنجیرهٔ تأمین — بخش واحد سفارش تا تحویل؛
         کلیدهای جدا برای هر مسیر → تبِ درست در هر نگاشت قدیمی/جدید از نو مقداردهی می‌شود */
      case 'supply': {
        const t = ['orders', 'receiving', 'verify'].includes(nav.param) ? nav.param : 'orders'
        return <SupplyChainView key="sc-supply" ctx={ctx} initialTab={t} />
      }
      case 'orders': return <SupplyChainView key="sc-orders" ctx={ctx} initialTab="orders" />
      case 'receiving': return <SupplyChainView key="sc-receiving" ctx={ctx} initialTab="receiving" />
      case 'verify': return <SupplyChainView key="sc-verify" ctx={ctx} initialTab="verify" />
      case 'accounting': return <AccountingView ctx={ctx} />
      case 'products': return <ProductsView ctx={ctx} />
      case 'providers': return <ProvidersView ctx={ctx} />
      case 'cheques': return <ChequesView ctx={ctx} />
      case 'archive': return <ArchiveView ctx={ctx} />
      case 'messages': return <MessagesView ctx={ctx} />
      case 'tasks': return <TasksView ctx={ctx} />
      case 'sop': return <SopView ctx={ctx} />
      case 'wall': return <WallView ctx={ctx} />
      case 'notes': return <NotesView ctx={ctx} />
      case 'feedback': return <FeedbackView ctx={ctx} />
      case 'planogram': return <PlanogramView ctx={ctx} />
      case 'floorplan': return <FloorPlanView ctx={ctx} />
      case 'sales': return <SalesView ctx={ctx} />
      case 'perf': return <PerfView ctx={ctx} />
      case 'admin': return <AdminView ctx={ctx} />
      case 'help': return <HelpView ctx={ctx} />
      case 'notifs': return <NotifsView ctx={ctx} />
      case 'briefing': return <BriefingView ctx={ctx} />
      case 'reports': return <ReportsView ctx={ctx} />
      case 'pricecheck': return <PriceCheckView ctx={ctx} />
      case 'science': return <ScienceView ctx={ctx} param={nav.param} />
      case 'research': return <ResearchView ctx={ctx} />
      case 'demo': return <DemoStudioView ctx={ctx} />
      case 'zonecount': return <ZoneCountView ctx={ctx} />
      case 'leaves': return <LeavesView ctx={ctx} />
      case 'shifts': return <ShiftsView ctx={ctx} />
      case 'crm': return <CrmView ctx={ctx} />
      case 'personnel': return <PersonnelView ctx={ctx} />
      case 'rbac': return <RbacView ctx={ctx} />
      case 'data': return <DataAdminView ctx={ctx} />
      case 'urgent': return <UrgentView ctx={ctx} />
      case 'kb': return <KbView ctx={ctx} />
      case 'payroll': return <PayrollView ctx={ctx} />
      case 'people': return <PeopleView ctx={ctx} />
      default: return <DashboardView ctx={ctx} />
    }
  }

  const sidebar = (
    <div className="pattern-girih flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[#1d5238] px-4 py-4">
        <Logo size={44} />
        <div>
          <p className="brand-shine text-lg font-black leading-6">{sandbox ? 'هایپر نمونه 🧪' : businessName}</p>
          <p className="text-[10px] text-[#93c572]">سررسید — سامانه مدیریت عملیات</p>
        </div>
        <button className="ms-auto text-[#93c572] lg:hidden" onClick={() => setSidebarOpen(false)}>
          <X size={20} />
        </button>
      </div>

      <nav className="scroll-gold flex-1 overflow-y-auto px-3 py-3" aria-label="ناوبری اصلی">
        {groups.map((g, gi) => {
          const isOpen = openGroups[g.title] ?? g.title === activeGroupTitle
          const groupHasActive = g.items.some((i) => i.key === activeViewKey)
          const groupBadges = g.items.reduce((s, i) => s + (i.badge > 0 ? 1 : 0), 0)
          return (
          <div key={g.title} className="mb-2">
            <button
              type="button"
              onClick={() => toggleGroup(g.title, !isOpen)}
              aria-expanded={isOpen}
              className={cn(
                'flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold tracking-wide transition-colors',
                groupHasActive ? 'text-[#c9a227]' : 'text-[#93c572]/70 hover:bg-[#143d2b]/60 hover:text-[#c9e2b8]'
              )}
            >
              <svg
                viewBox="0 0 12 12"
                className={cn('h-2.5 w-2.5 shrink-0 transition-transform duration-200', isOpen ? 'rotate-90' : 'rotate-0 rtl:-scale-x-100')}
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              >
                <path d="M4 2l4 4-4 4" />
              </svg>
              <span className="flex-1 text-start">{g.title}</span>
              {!isOpen && groupBadges > 0 && (
                <span className="h-1.5 w-1.5 rounded-full bg-[#c9a227]" aria-hidden="true" />
              )}
              {!isOpen && groupHasActive && <span className="h-1.5 w-1.5 rounded-full bg-[#c9a227] pulse-dot" aria-hidden="true" />}
              {!isOpen && <span className="text-[9px] font-black text-[#6f9179]">{faNum(g.items.length)}</span>}
            </button>
            {isOpen && g.items.map((i) => {
              const Icon = i.icon
              const active = nav.view === i.key || (i.key === 'supply' && SUPPLY_ALIASES.includes(nav.view))
              return (
                <button
                  key={i.key}
                  onClick={() => navigate(i.locked ? 'locked' : i.key, i.locked ? (MODULE_OF[i.key] || '') : '')}
                  className={cn(
                    'group mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-all',
                    active
                      ? 'bg-gradient-to-l from-[#c9a227]/25 to-[#c9a227]/5 text-[#f3ead0] shadow-[inset_0_0_0_1px_rgba(201,162,39,0.35)]'
                      : i.locked
                        ? 'text-[#6f9179]/60 hover:bg-[#143d2b]/60'
                        : 'text-[#b9cfc0] hover:bg-[#143d2b] hover:text-white'
                  )}
                  title={i.locked ? `ماژول «${MODULE_LABELS[MODULE_OF[i.key]]}» فعال نیست — برای خرید/تمدید با سازنده تماس بگیرید` : undefined}
                >
                  <Icon size={18} className={cn('shrink-0', i.locked ? 'text-[#6f9179]/50' : active ? 'text-[#c9a227]' : 'text-[#6f9179] group-hover:text-[#c9a227]')} />
                  <span className={cn(i.locked && 'opacity-70')}>{i.label}</span>
                  <span className="ms-auto flex items-center gap-1">
                    {i.badge > 0 && !i.locked && (
                      <span className={cn(
                        'flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[9px] font-black',
                        ['urgent', 'messages'].includes(i.key) ? 'bg-[#b3372f] text-white' : 'bg-[#c9a227] text-[#0b2e20]'
                      )}>
                        {faNum(i.badge)}
                      </span>
                    )}
                    {i.locked && (
                      <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#0b2e20]/60 text-[9px]" title="قفل لایسنس">🔒</span>
                    )}
                    {active && !i.badge && <span className="h-1.5 w-1.5 rounded-full bg-[#c9a227] pulse-dot" />}
                  </span>
                </button>
              )
            })}
            {gi < groups.length - 1 && <div className="sidebar-divider mx-2 mt-2" />}
          </div>
          )
        })}
      </nav>

      <div className="border-t border-[#1d5238] p-3">
        <div className="mb-2 flex items-center justify-center gap-1.5 rounded-lg border border-[#c9a227]/25 bg-[#c9a227]/10 px-2 py-1">
          <span className="text-[9px] font-black text-[#c9a227]">سررسید ۰٫۱ آلفا</span>
          <span className="text-[9px] text-[#93c572]">نام‌کد: «π» — آمادهٔ آزمون مدیریت</span>
        </div>
        <div className="mb-2"><SandboxTourButton /></div>
        <div className="flex items-center gap-3 rounded-xl bg-[#143d2b] p-3">
          <button
            onClick={() => setAvatarOpen(true)}
            title="ویرایش تصویر و آواتار"
            aria-label="ویرایش تصویر و آواتار"
            className="shrink-0 rounded-full transition hover:ring-2 hover:ring-[#c9a227]/70"
          >
            <UserAvatar name={user.name} color={user.color} avatarUrl={avatar.url} avatarStyle={avatar.style} size={38} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-white">{user.name}</p>
            <p className="text-[10px] text-[#93c572]">{ROLE_LABELS[user.role]} • {faNum(user.points)} امتیاز</p>
          </div>
          <button onClick={logout} title="خروج" className="rounded-lg p-2 text-[#93c572] transition hover:bg-[#b3372f]/20 hover:text-[#ff8a7a]">
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar — منطقی: در راست‌به‌چپ راست، در چپ‌به‌راست چپ */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <BarcodeScannerHost />
      <SandboxTour ctx={ctx} />
      {paletteOpen && <CommandPalette ctx={ctx} onClose={() => setPaletteOpen(false)} onLogout={logout} />}

      {/* round-17: مودال ویرایش تصویر و آواتار (عکس واقعی + کارتونی) */}
      {avatarOpen && user && (
        <AvatarProfileModal
          name={user.name}
          color={user.color}
          current={avatar}
          onClose={() => setAvatarOpen(false)}
          onChanged={(a) => setAvatar(a)}
        />
      )}

      <div className="flex min-h-screen flex-col lg:ms-64">
        {/* round-16: نوار سندباکس — دادهٔ نمایشی جدای سیستم واقعی */}
        {sandbox && (
          <div className="flex flex-wrap items-center justify-center gap-2 border-b border-[#c9a227]/40 bg-[#fdf6dd] px-4 py-2 text-[11px] font-black text-[#8a6d10]">
            <span>🧪 حالت سندباکس فعال است — همهٔ داده‌ها نمایشی «هایپر نمونه» است و سیستم واقعی شما دست‌نخورده باقی مانده.</span>
            <button
              onClick={async () => {
                try {
                  await api('/api/setup', { method: 'POST', body: { action: 'sandbox-exit' } })
                  toast.success('به سیستم واقعی برگشتید — هیچ اثری از دادهٔ دمو باقی نماند ✅')
                  setSandbox(false)
                  window.location.reload()
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : 'بازگشت ناموفق بود')
                }
              }}
              className="rounded-lg bg-[#0b2e20] px-3 py-1 text-[10px] font-black text-[#f3ead0] transition hover:bg-[#14532d]"
            >
              بازگشت به سیستم واقعی
            </button>
            {['OWNER', 'GM', 'OM', 'ADMIN'].includes(user.role) && (
              <button
                onClick={async () => {
                  try {
                    await api('/api/setup', { method: 'POST', body: { action: 'sandbox-reset' } })
                    toast.success('دادهٔ سندباکس از نو ساخته شد 🔄')
                    window.location.reload()
                  } catch (e: unknown) {
                    toast.error(e instanceof Error ? e.message : 'بازنشانی ناموفق بود')
                  }
                }}
                className="rounded-lg border border-[#c9a227]/50 px-3 py-1 text-[10px] font-black transition hover:bg-[#f5ecd0]"
              >
                بازنشانی دادهٔ دمو
              </button>
            )}
          </div>
        )}
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b border-[#e4dcc4]/80 bg-[#faf7ee]/90 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
            <button className="rounded-xl border border-border bg-card p-2 lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu size={18} />
            </button>
            <h1 className="min-w-0 text-base font-black text-foreground sm:text-lg">{currentTitle}</h1>
            <TopbarDateChip />
            <ThemeLangBar compact />

            {/* فرمان‌یاب */}
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[10px] font-bold text-muted-foreground transition hover:border-[#c9a227]/60 hover:text-[#8a6d10] md:flex"
              title="جست‌وجوی سریع (Ctrl+K)"
            >
              <Search size={14} />
              کجا برویم؟
              <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[9px] font-black">Ctrl K</kbd>
            </button>

            {canQuickOrder && (
              <button
                onClick={() => navigate('orders', 'new')}
                className="hidden items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#0e7a4a] to-[#12905a] px-4 py-2 text-xs font-extrabold text-white shadow-lg shadow-[#0e7a4a]/25 transition hover:shadow-xl hover:shadow-[#0e7a4a]/35 sm:flex"
              >
                <Plus size={15} />
                سفارش جدید
              </button>
            )}

            <div className="ms-auto flex flex-wrap items-center gap-2">
              {/* فرمان‌یاب موبایل */}
              <button
                onClick={() => setPaletteOpen(true)}
                className="rounded-xl border border-border bg-card p-2.5 transition hover:border-[#c9a227]/60 md:hidden"
                title="جست‌وجوی سریع"
                aria-label="جست‌وجوی سریع"
              >
                <Search size={17} className="text-[#8a6d10]" />
              </button>
              {/* notifications */}
              <div className="relative">
                <button
                  ref={bellRef}
                  onClick={() => setNotifOpen((v) => !v)}
                  aria-expanded={notifOpen}
                  className="relative rounded-xl border border-border bg-card p-2.5 transition hover:border-[#c9a227]/60"
                  title="اعلان‌ها"
                >
                  <Bell size={17} className={cn('text-[#8a6d10]', snoozedUntil && 'opacity-45')} />
                  {snoozedUntil && (
                    <span className="bell-muted absolute -start-1 -top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#8a6d10] text-[9px] text-white" title="سکوت موقت فعال">🔕</span>
                  )}
                  {!snoozedUntil && notifs.length > 0 && (
                    <span className="absolute -start-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-[#b3372f] px-1 text-[9px] font-black text-white">
                      {faNum(notifs.length)}
                    </span>
                  )}
                </button>
                <PopoverScaffold open={notifOpen} onClose={() => setNotifOpen(false)} anchorRef={bellRef} width={320} panelClassName="p-2" maxHeightVh={70}>
                    <p className="px-2 py-1.5 text-xs font-black text-muted-foreground">مرور لحظه‌ای کارها — مرتب‌شده بر اساس اهمیت</p>
                    {notifs.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted-foreground">همه‌چیز مرتب است ✅</p>}
                    {notifs.slice(0, 7).map((n, i) => (
                      <button
                        key={n.id}
                        onClick={() => navigate(n.go)}
                        className={cn(
                          'notif-item mb-1 flex w-full items-start gap-3 rounded-xl border p-2.5 transition hover:bg-secondary',
                          n.severity === 'critical' ? 'border-[#b3372f]/30 bg-[#fee2e2]/40' : n.severity === 'warning' ? 'border-[#a16207]/25 bg-[#fef9c3]/40' : 'border-transparent'
                        )}
                      >
                        <span className="text-xl">{n.icon}</span>
                        <span>
                          <span className="block text-xs font-extrabold">{n.title}</span>
                          <span className="block text-[10px] leading-4 text-muted-foreground">{n.detail}</span>
                        </span>
                      </button>
                    ))}
                    {notifs.length > 7 && <p className="px-2 pb-1 pt-0.5 text-center text-[10px] text-muted-foreground">و {faNum(notifs.length - 7)} اعلان دیگر…</p>}
                    {/* اعلان دسکتاپ */}
                    {deskPerm !== 'unsupported' && (
                      <div className="mt-1 flex items-center justify-between gap-2 border-t border-dashed border-[#c9a227]/30 px-1 pt-2">
                        <span className="text-[10px] font-bold text-muted-foreground">🖥️ اعلان دسکتاپ (وقتی تب بسته/پشت است)</span>
                        {deskPerm === 'denied' ? (
                          <span className="rounded-full bg-[#b3372f]/10 px-2 py-0.5 text-[9px] font-bold text-[#b3372f]" title="از نوار آدرس مرورگر اجازه اعلان بدهید">اجازه داده نشد</span>
                        ) : (
                          <button
                            onClick={toggleDeskNotif}
                            role="switch"
                            aria-checked={deskNotif}
                            aria-label="اعلان دسکتاپ"
                            className={cn('desk-switch relative h-5 w-9 shrink-0 rounded-full transition', deskNotif ? 'bg-[#c9a227]' : 'bg-border')}
                            title={deskNotif ? 'روشن — برای خاموش‌کردن بزنید' : 'خاموش — برای روشن‌کردن بزنید'}
                          >
                            <span className={cn('desk-knob absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', deskNotif ? 'end-0.5' : 'start-0.5')} />
                          </button>
                        )}
                      </div>
                    )}
                    {/* سکوت موقت / بیدارکردن */}
                    <div className="mt-1 border-t border-dashed border-[#c9a227]/30 pt-1.5">
                      {snoozedUntil ? (
                        <button
                          onClick={wakeNotifs}
                          className="w-full rounded-xl bg-[#0e7a4a] py-2 text-[11px] font-extrabold text-white shadow transition hover:shadow-lg"
                        >
                          🔕 سکوت فعال — بیدارکردن اعلان‌ها
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 text-[10px] font-bold text-muted-foreground">سکوت:</span>
                          <button onClick={() => bellSnooze(1)} className="flex-1 rounded-xl border border-border bg-card py-1.5 text-[10px] font-extrabold transition hover:border-[#c9a227] hover:bg-[#fdf6dd]">۱ ساعت</button>
                          <button onClick={() => bellSnooze(3)} className="flex-1 rounded-xl border border-border bg-card py-1.5 text-[10px] font-extrabold transition hover:border-[#c9a227] hover:bg-[#fdf6dd]">۳ ساعت</button>
                          <button onClick={() => navigate('notifs')} className="rounded-xl px-1.5 py-1.5 text-[10px] font-black text-[#8a6d10]" title="تنظیمات کامل اعلان‌ها">⋯</button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => navigate('notifs')}
                      className="mt-1.5 w-full rounded-xl border border-[#c9a227]/40 bg-[#fdf6dd]/60 py-2 text-[11px] font-extrabold text-[#8a6d10] transition hover:bg-[#fdf6dd]"
                    >
                      🔔 مشاهده همه در مرکز اعلان‌ها ←
                    </button>
                </PopoverScaffold>
              </div>
              {canQuickOrder && (
                <button
                  onClick={() => navigate('orders', 'new')}
                  className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-extrabold text-white sm:hidden"
                >
                  <Plus size={14} /> سفارش
                </button>
              )}
              <button onClick={() => navigate('perf')} className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 sm:flex">
                <UserAvatar name={user.name} color={user.color} avatarUrl={avatar.url} avatarStyle={avatar.style} size={28} />
                <span className="text-xs font-extrabold">{user.name}</span>
              </button>
            </div>
          </div>
          <div className="shimmer-line h-px w-full" />
        </header>

        <main className="pattern-sand mx-auto w-full max-w-7xl flex-1 p-4 pb-24 sm:p-6 lg:pb-10">{renderView()}</main>

        {/* Sticky footer */}
        <footer className="mt-auto border-t border-[#e4dcc4]/70 bg-[#0b2e20] px-6 py-4 text-center">
          <p className="text-[11px] text-[#93c572]">
            سررسید | SarResid • {sandbox ? 'سندباکس دمو (هایپر نمونه)' : businessName} — نسخه ۰٫۱ آلفا «π»
          </p>
          <p className="mt-1 text-[10px] text-[#93c572]/60">تقویم شمسی و قمری دقیق • پشتیبانی از هلو • دفتر حساب دیجیتالِ فروشگاه شما</p>
        </footer>
      </div>
    </div>
  )
}

/** صفحهٔ قفل ماژول — ماژولِ بدون اشتراک فعال (round-16) */
function LockedModuleView({ module, onBack }: { module: string; onBack: () => void }) {
  const label = MODULE_LABELS[module] || 'ماژول'
  return (
    <div className="fade-in-up mx-auto max-w-md rounded-3xl border border-[#c9a227]/30 bg-[#fffdf6] p-8 text-center shadow-xl">
      <p className="text-5xl">🔒</p>
      <h2 className="mt-3 text-lg font-black text-[#0b2e20]">ماژول «{label}» فعال نیست</h2>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">
        این بخش به‌صورت ماژول افزوده می‌شود و برای مدت‌زمان دلخواه قابل خرید است.
        برای فعال‌سازی یا تمدید با سازندهٔ سامانه (هایپر زیتون) تماس بگیرید یا از پلن بالاتر استفاده کنید.
      </p>
      <div className="mt-4 rounded-2xl bg-[#fdf6dd] p-3 text-[11px] font-bold text-[#8a6d10]">
        💡 در حالت سندباکس همهٔ ماژول‌ها آزادند تا پیش از خرید امتحانشان کنید.
      </div>
      <button onClick={onBack} className="mt-5 rounded-xl bg-[#0e7a4a] px-6 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-[#0e7a4a]/25">
        بازگشت به داشبورد
      </button>
    </div>
  )
}
