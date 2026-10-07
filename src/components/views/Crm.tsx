'use client'
/** CRM کامل هایپر زیتون — مشتریان (RFM/CLV)، تولدها، کمپین‌ها، پیشنهادها و لایهٔ صداقت، شکایت‌ها.
 *  علم پشت آن: RFM (Hughes 1994)، تولد سه‌لمسی (Experian 481%)، win-back تک‌پیام (Bain)，
 *  service recovery paradox (حل <۲۴ساعت + جبران کوچک)، نمونه‌گیری تصادفی راستی‌آزمایی (AS 2315)،
 *  بدون پاداش نقدی تک‌پیشنهاد (Deci 1999) و جداسازی وظایف (COSO). */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Users, Cake, Megaphone, Handshake, MessageSquareWarning, Plus, X, ShieldCheck,
  Sparkles, Star, Trash2, Phone, PartyPopper, CheckCheck, Pencil, Loader2, HeartHandshake,
} from 'lucide-react'
import { api } from '@/lib/client'
import { faNum, faMoney, formatJalaliDateTime, formatJalaliLong, toJalaliParts, todayIso, addDaysIso } from '@/lib/jalali'
import {
  SectionCard, StatCard, Pill, EmptyState, Avatar, SearchInput, Labeled, KeyValue, FaPriceInput,
  type AppCtx,
} from '@/components/app/ui-bits'
import { Donut, RankBars } from '@/components/app/charts'
import { Modal } from '@/components/views/Orders'
import { JalaliDatePicker, useHolidays } from '@/components/app/jalali-widgets'
import { CUSTOMER_TIERS } from '@/lib/constants'
import { cn } from '@/lib/utils'

/* ───────────────────────────── types ───────────────────────────── */
type Rfm = {
  rDays: number; f90: number; mAvg: number; rScore: number; fScore: number; mScore: number
  segment: string; clv: number; visits: number; lastVisit: string; firstVisit: string
  medianGapDays: number; visitsPerMonth: number; visitsPerYear: number; preferredWeekday: string
  topProducts: { name: string; count: number }[]
}
type Customer = {
  id: string; name: string; phone: string; notes: string; preferences: string; favorite: boolean
  tier: string; birthday: string; anniversary: string; householdSize: number
  childrenAges: string; preferredChannel: string; consentMarketing: boolean; tags: string
  joinedAt: string; points: number; lastVisitAt: string; createdAt: string
}
type BirthdayHit = { id: string; name: string; phone: string; birthday: string; daysUntil: number; age: number; hasGift: boolean; tier: string }
type Campaign = {
  id: string; name: string; kind: string; targetFilter: { tiers?: string[]; minVisits?: number; inactiveDays?: number; birthdaysNextDays?: number }
  message: string; status: string; scheduledFor: string; resultStats: { targets?: number; reached?: number; consentCount?: number }
  createdByName: string; createdAt: string; targetCount: number; consentCount: number
}
type Claim = {
  id: string; customerId: string; customerName: string; staffId: string; staffName: string; kind: string
  productNames: string[]; outcome: string; orderCode: string; claimNote: string; verifySampled: boolean
  verifiedByName: string; verifyNote: string; createdAt: string
}
type Flag = { staffId: string; staffName: string; z: number; rate: number; note: string }
type TeamStats = { claims30d: number; sampled30d: number; verifiedOk30d: number; verifiedBad30d: number; converted30d: number; pendingQueue: number }
type Complaint = {
  id: string; customerId: string; customerName: string; category: string; severity: string; body: string
  status: string; resolutionNote: string; compensationValue: number; openedAt: string; resolvedAt: string | null
}
type TimelineRow = { kind: string; icon: string; at: string; title: string; detail: string; meta?: Record<string, unknown> }
type Profile = {
  customer: Customer & { tags: string[]; childrenAges: number[] }
  rfm: Rfm | null; engagements: Claim[]; complaints: Complaint[]
  preorders: { id: string; code: string; status: string; total: number; createdAt: string; items: { name: string; qty: number; price: number }[] }[]
  timeline: TimelineRow[]
}
type EngResp = { claims: Claim[]; queue: Claim[]; flags: Flag[]; team: TeamStats; isManager: boolean; meId: string }

/* ───────────────────────────── meta ───────────────────────────── */
type TabKey = 'customers' | 'birthdays' | 'campaigns' | 'engagements' | 'complaints'
const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'customers', label: 'مشتریان', icon: <Users size={16} /> },
  { key: 'birthdays', label: 'تولدها و مناسبت‌ها', icon: <Cake size={16} /> },
  { key: 'campaigns', label: 'کمپین‌ها', icon: <Megaphone size={16} /> },
  { key: 'engagements', label: 'پیشنهادها و صداقت', icon: <Handshake size={16} /> },
  { key: 'complaints', label: 'شکایت‌ها', icon: <MessageSquareWarning size={16} /> },
]
const CHANNEL_LABEL: Record<string, string> = { SMS: 'پیامک', WHATSAPP: 'واتساپ', CALL: 'تماس تلفنی', NONE: '—' }
const CLAIM_KIND: Record<string, { label: string; icon: string }> = {
  SUGGESTION: { label: 'پیشنهاد فروش', icon: '💡' },
  HELP: { label: 'همراهی مشتری', icon: '🤝' },
  CHECKOUT_ASSIST: { label: 'کمک در صندوق', icon: '🧺' },
}
const CLAIM_OUTCOME: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'در انتظار', color: '#a16207', bg: '#fef9c3' },
  CONVERTED: { label: 'تبدیل به فروش', color: '#166534', bg: '#dcfce7' },
  CONVERTED_LATE: { label: 'تبدیل خارج از پنجرهٔ ۲ ساعته', color: '#a04c2a', bg: '#ffedd5' },
  VERIFIED_OK: { label: 'تأیید درست ✓', color: '#166534', bg: '#dcfce7' },
  VERIFIED_BAD: { label: 'تأیید نامعتبر ✗', color: '#b3372f', bg: '#fee2e2' },
  REJECTED: { label: 'رد شده', color: '#6b7280', bg: '#f3f4f6' },
}
const CAMPAIGN_KIND: Record<string, { label: string; icon: string; color: string }> = {
  BIRTHDAY: { label: 'تولد', icon: '🎂', color: '#c96f4a' },
  WINBACK: { label: 'بازگشت مشتری', icon: '🌅', color: '#77934a' },
  VIP_EVENT: { label: 'رویداد VIP', icon: '💎', color: '#8a6d10' },
  OFFER: { label: 'پیشنهاد ویژه', icon: '🏷️', color: '#0e7a4a' },
  OTHER: { label: 'سایر', icon: '📌', color: '#6b7280' },
}
const MSG_TEMPLATE: Record<string, string> = {
  BIRTHDAY: 'مشتری عزیز، تولدتان مبارک 🎂 هدیهٔ تولد شما در هایپر زیتون آماده است — این هفته منتظرتان هستیم.',
  WINBACK: 'مشتری عزیز، دلمان برایتان تنگ شده 🌿 یک غافلگیریِ کوچک برای بازگشت شما آماده کرده‌ایم — فقط یک بار پیغام می‌دهیم، قول.',
  VIP_EVENT: 'شما مشتری ویژهٔ ما هستید 💎 پیش از همه به رویداد VIP هایپر زیتون دعوت می‌شوید.',
  OFFER: 'پیشنهاد ویژهٔ این هفته برای شما 🏷️ — فقط تا پایان هفته در هایپر زیتون.',
  OTHER: '',
}
const FILTER_SUGGEST: Record<string, { tiers?: string[]; minVisits?: number; inactiveDays?: number; birthdaysNextDays?: number }> = {
  BIRTHDAY: { birthdaysNextDays: 14 },
  WINBACK: { inactiveDays: 45 },
  VIP_EVENT: { tiers: ['VIP'] },
  OFFER: { tiers: ['LOYAL'] },
  OTHER: {},
}
const COMPLAINT_CAT: Record<string, { label: string; icon: string }> = {
  PRODUCT: { label: 'کالا', icon: '🧀' },
  SERVICE: { label: 'خدمات', icon: '🤝' },
  PRICE: { label: 'قیمت', icon: '🏷️' },
  QUEUE: { label: 'صف و صندوق', icon: '🕒' },
  GENERAL: { label: 'عمومی', icon: '📌' },
}

/* انواع رخداد پروفایل — همه با دکمهٔ ثبت صریح؛ هیچ ورودی خودکار ارسال نمی‌شود */
type EvTypeKey = 'NOTE' | 'COMPLAINT' | 'VISIT' | 'REQUEST' | 'REWARD'
const EVENT_TYPES: { key: EvTypeKey; label: string; icon: string; color: string; placeholder: string }[] = [
  { key: 'NOTE', label: 'یادداشت', icon: '📝', color: '#0e7a4a', placeholder: 'یادداشت دربارهٔ مشتری…' },
  { key: 'COMPLAINT', label: 'شکایت', icon: '💬', color: '#b3372f', placeholder: 'شرح شکایت مشتری را بنویسید…' },
  { key: 'VISIT', label: 'ثبت بازدید', icon: '🚶', color: '#77934a', placeholder: 'مثلاً: بازدید حضوری — مشاورهٔ محصولات ارگانیک' },
  { key: 'REQUEST', label: 'درخواست', icon: '🙋', color: '#c96f4a', placeholder: 'مثلاً: درخواست نان سنگک تازه هر صبح' },
  { key: 'REWARD', label: 'قدردانی', icon: '🎁', color: '#8a6d10', placeholder: 'مثلاً: هدیهٔ قدردانی بابت معرفی به دوستان' },
]

function tagsOf(t: string | string[]): string[] {
  if (Array.isArray(t)) return t
  try {
    const p = JSON.parse(t || '[]')
    return Array.isArray(p) ? p.map(String) : []
  } catch {
    return []
  }
}

function agesOf(t: string | number[]): number[] {
  if (Array.isArray(t)) return t
  try {
    const p = JSON.parse(t || '[]')
    return Array.isArray(p) ? p.map(Number).filter((n) => !isNaN(n)) : []
  } catch {
    return []
  }
}
const COMPLAINT_SEV: Record<string, { label: string; color: string; bg: string }> = {
  LOW: { label: 'کم', color: '#6b7280', bg: '#f3f4f6' },
  NORMAL: { label: 'معمولی', color: '#a16207', bg: '#fef9c3' },
  HIGH: { label: 'جدی', color: '#b3372f', bg: '#fee2e2' },
}
const faDec = (n: number) => faNum(n.toFixed(1)).replace('.', '٫')

/* ───────────────────────────── small pieces ───────────────────────────── */
function RfmBars({ r }: { r: Rfm }) {
  const rows = [
    { k: 'R', v: r.rScore, color: '#0e7a4a', tip: `تازگی — ${faNum(r.rDays)} روز از آخرین فعالیت · نمرهٔ ${faNum(r.rScore)} از ۵` },
    { k: 'F', v: r.fScore, color: '#c9a227', tip: `تواتر — ${faNum(r.f90)} خرید در ۹۰ روز · نمرهٔ ${faNum(r.fScore)} از ۵` },
    { k: 'M', v: r.mScore, color: '#c96f4a', tip: `ارزش — میانگین سبد ${faMoney(r.mAvg)} تومان · نمرهٔ ${faNum(r.mScore)} از ۵` },
  ]
  return (
    <div className="flex flex-col gap-1" dir="ltr">
      {rows.map((row) => (
        <div key={row.k} className="flex items-center gap-1.5" title={row.tip}>
          <span className="w-3 text-[9px] font-black text-muted-foreground">{row.k}</span>
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full transition-all" style={{ width: `${(row.v / 5) * 100}%`, background: row.color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function OutcomeBadge({ o }: { o: string }) {
  const m = CLAIM_OUTCOME[o] || CLAIM_OUTCOME.PENDING
  return <Pill label={m.label} color={m.color} bg={m.bg} />
}

function tagList(c: Pick<Customer, 'tags'>): string[] {
  try {
    const p = JSON.parse(c.tags || '[]')
    return Array.isArray(p) ? p.map(String) : []
  } catch {
    return []
  }
}

/* ───────────────────────────── main view ───────────────────────────── */
export default function CrmView({ ctx }: { ctx: AppCtx }) {
  const [tab, setTab] = useState<TabKey>(ctx.param === 'verify' ? 'engagements' : ctx.param === 'complaints' ? 'complaints' : 'customers')
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [stats, setStats] = useState<Record<string, Rfm>>({})
  const [birthdays, setBirthdays] = useState<BirthdayHit[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [openOld, setOpenOld] = useState(0)
  const [eng, setEng] = useState<EngResp | null>(null)
  const [tierChip, setTierChip] = useState('')
  const [q, setQ] = useState('')

  // profile modal
  const [profileId, setProfileId] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [evType, setEvType] = useState<EvTypeKey>('NOTE')
  const [evText, setEvText] = useState('')
  const [evSub, setEvSub] = useState('PRODUCT') // زیرشاخهٔ شکایت — انتخاب آن ارسال نمی‌کند
  const [evBusy, setEvBusy] = useState(false)
  const [tagInput, setTagInput] = useState('')

  // edit customer modal
  const [editOpen, setEditOpen] = useState(false)
  const [editBusy, setEditBusy] = useState(false)
  const [editTagInput, setEditTagInput] = useState('')
  const [ec, setEc] = useState<null | {
    name: string; phone: string; tier: string; birthday: string; anniversary: string
    preferredChannel: string; tags: string[]; householdSize: number | ''; childrenAges: string
    consentMarketing: boolean; notes: string; preferences: string
  }>(null)

  // new customer
  const [showNew, setShowNew] = useState(false)
  const holidays = useHolidays()
  const [nc, setNc] = useState({ name: '', phone: '', birthday: '', anniversary: '', householdSize: 0 as number | '', childrenAges: '', preferredChannel: 'SMS', consentMarketing: true, tags: '', notes: '', preferences: '' })

  // claim form
  const [claimCustomerId, setClaimCustomerId] = useState('')
  const [claimKind, setClaimKind] = useState('SUGGESTION')
  const [claimProducts, setClaimProducts] = useState<string[]>([])
  const [claimProductInput, setClaimProductInput] = useState('')
  const [claimNote, setClaimNote] = useState('')
  const [verifyNotes, setVerifyNotes] = useState<Record<string, string>>({})

  // campaign wizard
  const [showWiz, setShowWiz] = useState(false)
  const [wizKind, setWizKind] = useState('BIRTHDAY')
  const [wizName, setWizName] = useState('')
  const [wizMessage, setWizMessage] = useState(MSG_TEMPLATE.BIRTHDAY)
  const [wizTiers, setWizTiers] = useState<string[]>([])
  const [wizMinVisits, setWizMinVisits] = useState<number | ''>('')
  const [wizInactive, setWizInactive] = useState<number | ''>('')
  const [wizBdays, setWizBdays] = useState<number | ''>(14)
  const [wizScheduled, setWizScheduled] = useState('')
  const [armedRun, setArmedRun] = useState('')

  // complaint resolve
  const [resolveC, setResolveC] = useState<Complaint | null>(null)
  const [resolveNote, setResolveNote] = useState('')
  const [resolveComp, setResolveComp] = useState<number | ''>('')

  const isManager = eng?.isManager || false
  const meId = ctx.user?.id || ''
  const today = todayIso()
  const { jm: curJm } = toJalaliParts(today)

  /* deep link پشتیبان: hash شامل crm?tab=... */
  useEffect(() => {
    if (ctx.param) return
    const m = window.location.hash.match(/crm\?tab=(\w+)/)
    if (m && TABS.some((t) => t.key === m[1])) setTab(m[1] as TabKey)
  }, [ctx.param])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cust, camps, comps, engResp] = await Promise.all([
        api<{ customers: Customer[]; stats?: Record<string, Rfm>; birthdays?: BirthdayHit[] }>('/api/customers?stats=1&birthdays=1&days=30'),
        api<{ campaigns: Campaign[] }>('/api/campaigns'),
        api<{ complaints: Complaint[]; openOlderThan12h: number }>('/api/complaints'),
        api<EngResp>('/api/engagements'),
      ])
      setCustomers(cust.customers || [])
      setStats(cust.stats || {})
      setBirthdays(cust.birthdays || [])
      setCampaigns(camps.campaigns || [])
      setComplaints(comps.complaints || [])
      setOpenOld(comps.openOlderThan12h || 0)
      setEng(engResp)
    } catch (e) {
      toast.error((e as Error).message || 'خطا در بارگذاری CRM')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const openProfile = async (id: string) => {
    setProfileId(id)
    setProfile(null)
    setEvText('')
    setTagInput('')
    try {
      setProfile(await api<Profile>(`/api/customers/${id}`))
    } catch (e) {
      toast.error((e as Error).message)
      setProfileId('')
    }
  }

  /* ── ویرایش مشتری (تیئر دستی = tierOverride تا تغییر بعدی) ── */
  const startEditFromProfile = () => {
    const c = profile?.customer
    if (!c) return
    setEc({
      name: c.name,
      phone: c.phone,
      tier: c.tier || 'REGULAR',
      birthday: c.birthday,
      anniversary: c.anniversary,
      preferredChannel: c.preferredChannel || 'NONE',
      tags: tagsOf(c.tags),
      householdSize: c.householdSize || '',
      childrenAges: agesOf(c.childrenAges).join('، '),
      consentMarketing: c.consentMarketing,
      notes: c.notes,
      preferences: c.preferences,
    })
    setEditTagInput('')
    setEditOpen(true)
  }

  const startEditFromCard = (c: Customer) => {
    setEc({
      name: c.name,
      phone: c.phone,
      tier: c.tier || 'REGULAR',
      birthday: c.birthday,
      anniversary: c.anniversary,
      preferredChannel: c.preferredChannel || 'NONE',
      tags: tagList(c),
      householdSize: c.householdSize || '',
      childrenAges: agesOf(c.childrenAges).join('، '),
      consentMarketing: c.consentMarketing,
      notes: c.notes,
      preferences: c.preferences,
    })
    setEditTagInput('')
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!ec || !profileId || editBusy) return
    if (!ec.name.trim()) {
      toast.error('نام مشتری الزامی است')
      return
    }
    setEditBusy(true)
    try {
      await api(`/api/customers/${profileId}`, {
        method: 'PATCH',
        body: { ...ec, householdSize: ec.householdSize === '' ? 0 : ec.householdSize },
      })
      toast.success('پروندهٔ مشتری به‌روزرسانی شد')
      setEditOpen(false)
      await load()
      await openProfile(profileId)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setEditBusy(false)
    }
  }

  /* ── stats strip ── */
  const vipCount = useMemo(() => Object.values(stats).filter((r) => r.segment === 'VIP').length, [stats])
  const atRiskCount = useMemo(() => Object.values(stats).filter((r) => r.segment === 'AT_RISK').length, [stats])
  const openComplaints = useMemo(() => complaints.filter((c) => c.status !== 'RESOLVED').length, [complaints])
  const birthdaysThisMonth = useMemo(() => customers.filter((c) => c.birthday && Number(c.birthday.slice(5, 7)) === curJm).length, [customers, curJm])

  const segDonut = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of Object.values(stats)) counts[r.segment] = (counts[r.segment] || 0) + 1
    return Object.entries(CUSTOMER_TIERS)
      .filter(([k]) => counts[k])
      .map(([k, m]) => ({ label: m.label.replace(/[^\u0600-\u06FF ]/g, '').trim() || k, value: counts[k] }))
  }, [stats])

  const filteredCustomers = useMemo(() => {
    let list = customers
    if (tierChip) list = list.filter((c) => stats[c.id]?.segment === tierChip || c.tier === tierChip)
    const query = q.trim().toLowerCase()
    if (query) {
      list = list.filter((c) => `${c.name} ${c.phone} ${c.notes} ${tagList(c).join(' ')}`.toLowerCase().includes(query))
    }
    return list
  }, [customers, stats, tierChip, q])

  const jump = (t: TabKey, tier = '') => {
    setTab(t)
    if (tier !== '') setTierChip(tier)
  }

  /* ── mutations ── */
  const patchCustomer = async (id: string, data: Record<string, unknown>, okMsg: string) => {
    try {
      await api('/api/customers', { method: 'PATCH', body: { id, ...data } })
      toast.success(okMsg)
      await load()
      if (profileId) await openProfile(profileId)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const addEvent = async (customerId: string, type: string, text: string, extra: Record<string, unknown> = {}) => {
    try {
      await api(`/api/customers/${customerId}`, { method: 'POST', body: { type, text, ...extra } })
      toast.success('رخداد ثبت شد')
      await load()
      if (profileId) await openProfile(profileId)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const toggleGift = async (b: BirthdayHit) => {
    await addEvent(b.id, 'BIRTHDAY_GIFT', b.hasGift ? 'لغو ثبت هدیهٔ تولد' : 'هدیهٔ تولد ثبت شد — تحویل در فروشگاه', { undo: b.hasGift })
  }

  const createBirthdayCampaign = async () => {
    try {
      await api('/api/campaigns', {
        method: 'POST',
        body: {
          name: `کمپین تولد — پنجرهٔ ۱۴ روز (${formatJalaliLong(today)})`,
          kind: 'BIRTHDAY',
          targetFilter: { birthdaysNextDays: 14 },
          message: MSG_TEMPLATE.BIRTHDAY,
          scheduledFor: today,
        },
      })
      toast.success('کمپین تولد ساخته شد — از تب کمپین‌ها اجرایش کنید')
      jump('campaigns')
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const runCampaign = async (c: Campaign) => {
    if (armedRun !== c.id) {
      setArmedRun(c.id)
      toast.info('دکمه مسلح شد — برای اجرای واقعی دوباره بزنید')
      return
    }
    setArmedRun('')
    try {
      const res = await api<{ campaign: Campaign; eventsCreated: number }>('/api/campaigns', { method: 'PATCH', body: { id: c.id, action: 'run' } })
      toast.success(`کمپین اجرا شد — ${faNum(res.campaign.resultStats.targets || 0)} مخاطب، ${faNum(res.campaign.resultStats.reached || 0)} پیام با رضایت`)
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const deleteCampaign = async (c: Campaign) => {
    try {
      await api(`/api/campaigns?id=${c.id}`, { method: 'DELETE' })
      toast.success('کمپین حذف شد')
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const submitClaim = async () => {
    if (!claimProducts.length && !claimNote.trim()) {
      toast.error('نام کالا یا توضیح پیشنهاد را بنویسید')
      return
    }
    try {
      const res = await api<{ sampled: boolean }>('/api/engagements', {
        method: 'POST',
        body: { customerId: claimCustomerId || undefined, kind: claimKind, productNames: claimProducts, claimNote },
      })
      toast.success(res.sampled ? 'ثبت شد 🔍 — این ادعا امروز به نمونهٔ راستی‌آزمایی خورد' : 'تعامل ثبت شد — آفرین')
      setClaimProducts([])
      setClaimProductInput('')
      setClaimNote('')
      setClaimCustomerId('')
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const verifyClaim = async (c: Claim, outcome: 'VERIFIED_OK' | 'VERIFIED_BAD') => {
    try {
      await api('/api/engagements', { method: 'PATCH', body: { id: c.id, action: 'verify', outcome, verifyNote: verifyNotes[c.id] || '' } })
      toast.success(outcome === 'VERIFIED_OK' ? 'تأیید درست ثبت شد' : 'تأیید نامعتبر ثبت شد — گفت‌وگوی لازم است')
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const convertClaim = async (c: Claim) => {
    const code = window.prompt('کد پیش‌فاکتور (مثلاً PO-1404-004):')
    if (!code) return
    try {
      const res = await api<{ late: boolean }>('/api/engagements', { method: 'PATCH', body: { id: c.id, action: 'convert', orderCode: code.trim() } })
      toast.success(res.late ? 'ثبت شد — اما خارج از پنجرهٔ ۲ ساعته پرچم خورد (تأیید مدیر)' : 'تبدیل به فروش ثبت شد')
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const createFollowupTask = async (f: Flag) => {
    try {
      await api('/api/tasks', {
        method: 'POST',
        body: {
          title: `پیگیری پرچم صداقت — ${f.staffName}`,
          description: `${f.note}\n\nنرخ ۳۰ روزه: ${faNum(f.rate)} ادعا · z=${faDec(f.z)}. این وظیفه گفت‌وگوی coaching است، نه تنبیه خودکار.`,
          type: 'TASK',
          priority: 'HIGH',
          assignedToId: meId,
          dueDate: addDaysIso(3),
          points: 15,
        },
      })
      toast.success('وظیفهٔ پیگیری ساخته شد (تب وظایف)')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const submitComplaint = async (customerId: string, customerName: string, category: string, severity: string, body: string) => {
    try {
      const res = await api<{ duplicate?: boolean }>('/api/complaints', { method: 'POST', body: { customerId, customerName, category, severity, body } })
      toast.success(res?.duplicate ? 'این شکایت لحظاتی پیش ثبت شده بود — رکورد تکراری ساخته نشد' : 'شکایت ثبت شد — مدیر مطلع می‌شود (SLA ۲۴ ساعت)')
      await load()
      if (profileId) await openProfile(profileId)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /* ثبت رخداد پروفایل — همیشه صریح: فقط با دکمهٔ ثبت یا Ctrl+Enter.
   * شکایت → /api/complaints با زیرشاخهٔ انتخابی (دقیقاً یک رکورد)؛ بقیه → رخداد CustomerEvent. */
  const submitEvent = async () => {
    if (!profileCust || evBusy) return
    const text = evText.trim()
    if (!text) {
      toast.error('متن رخداد را بنویسید')
      return
    }
    setEvBusy(true)
    try {
      if (evType === 'COMPLAINT') {
        await submitComplaint(profileCust.id, profileCust.name, evSub, 'NORMAL', text)
      } else {
        await api(`/api/customers/${profileCust.id}`, { method: 'POST', body: { type: evType, text } })
        toast.success('رخداد ثبت شد')
        await load()
        await openProfile(profileCust.id)
      }
      setEvText('')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setEvBusy(false)
    }
  }

  const resolveComplaint = async () => {
    if (!resolveC) return
    try {
      await api('/api/complaints', {
        method: 'PATCH',
        body: { id: resolveC.id, status: 'RESOLVED', resolutionNote: resolveNote, compensationValue: resolveComp === '' ? 0 : resolveComp },
      })
      toast.success('شکایت حل شد — paradox جبران: حالا وفادارتر از قبل است')
      setResolveC(null)
      setResolveNote('')
      setResolveComp('')
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const submitNewCustomer = async () => {
    if (!nc.name.trim()) {
      toast.error('نام مشتری الزامی است')
      return
    }
    try {
      await api('/api/customers', {
        method: 'POST',
        body: {
          ...nc,
          householdSize: nc.householdSize === '' ? 0 : nc.householdSize,
        },
      })
      toast.success('پروندهٔ مشتری ساخته شد')
      setShowNew(false)
      setNc({ name: '', phone: '', birthday: '', anniversary: '', householdSize: 0, childrenAges: '', preferredChannel: 'SMS', consentMarketing: true, tags: '', notes: '', preferences: '' })
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const submitCampaign = async () => {
    const filter: Record<string, unknown> = {}
    if (wizKind === 'BIRTHDAY' && wizBdays !== '') filter.birthdaysNextDays = wizBdays
    if (wizTiers.length) filter.tiers = wizTiers
    if (wizMinVisits !== '') filter.minVisits = wizMinVisits
    if (wizInactive !== '') filter.inactiveDays = wizInactive
    if (!Object.keys(filter).length) {
      toast.error('حداقل یک شرط مخاطب لازم است')
      return
    }
    try {
      await api('/api/campaigns', {
        method: 'POST',
        body: { name: wizName.trim() || `کمپین ${CAMPAIGN_KIND[wizKind].label}`, kind: wizKind, targetFilter: filter, message: wizMessage, scheduledFor: wizScheduled },
      })
      toast.success('کمپین ساخته شد')
      setShowWiz(false)
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const pickKind = (k: string) => {
    setWizKind(k)
    setWizMessage(MSG_TEMPLATE[k] || '')
    const sug = FILTER_SUGGEST[k] || {}
    setWizTiers(sug.tiers || [])
    setWizMinVisits(sug.minVisits ?? '')
    setWizInactive(sug.inactiveDays ?? '')
    setWizBdays(sug.birthdaysNextDays ?? '')
    setWizName(`کمپین ${CAMPAIGN_KIND[k].label} — ${formatJalaliLong(today)}`)
  }

  /* پیش‌نمایش مخاطبان ویزارد — همان منطق سرور، سمت کلاینت برای پیش‌نمایش زنده */
  const wizPreview = useMemo(() => {
    const ids: string[] = []
    const bdayIds = wizBdays !== '' ? new Set(birthdays.filter((b) => b.daysUntil <= Number(wizBdays)).map((b) => b.id)) : null
    for (const c of customers) {
      const r = stats[c.id]
      if (wizTiers.length && !(r && wizTiers.includes(r.segment)) && !wizTiers.includes(c.tier)) continue
      if (wizMinVisits !== '' && (r?.visits || 0) < Number(wizMinVisits)) continue
      if (wizInactive !== '' && (r?.rDays || 0) < Number(wizInactive)) continue
      if (bdayIds && !bdayIds.has(c.id)) continue
      ids.push(c.id)
    }
    return { ids, consent: ids.filter((id) => customers.find((c) => c.id === id)?.consentMarketing).length, names: ids.slice(0, 4).map((id) => customers.find((c) => c.id === id)?.name || '') }
  }, [customers, stats, birthdays, wizTiers, wizMinVisits, wizInactive, wizBdays])

  /* ───────────────────────────── render ───────────────────────────── */
  if (loading && !customers.length) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/60" />
        ))}
      </div>
    )
  }

  const profileCust = profile?.customer
  // تیئر مؤثر: ستون tier دستی (غیر REGULAR) مقدم بر سگمنت محاسبه‌شدهٔ RFM است
  const effTier = profileCust
    ? CUSTOMER_TIERS[(profileCust.tier && profileCust.tier !== 'REGULAR' ? profileCust.tier : profile?.rfm?.segment) || 'REGULAR'] || CUSTOMER_TIERS.REGULAR
    : CUSTOMER_TIERS.REGULAR

  return (
    <div className="space-y-5">
      {/* ── سربرگ پورتال مشتریان (round-19h) — CRM بخش یکتای خودش؛ پیل‌های سریع از دادهٔ همین نما ── */}
      <div className="fade-in-up flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#c9a227]/30 bg-gradient-to-l from-[#f7efe2] via-[#fdf9ee] to-[#f3f6ec] p-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-black text-[#0b2e20]">
            <HeartHandshake size={16} className="shrink-0 text-[#8a6d10]" />
            پورتال مشتریان (CRM)
          </p>
          <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
            همهٔ تعامل با مشتری یک‌جا — پرونده و سگمنت‌بندی RFM، تولدها، کمپین‌ها، پیشنهادها و شکایت‌ها
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => jump('customers')}
            title="رفتن به فهرست مشتریان"
            className="min-h-[36px] rounded-full border border-[#0e7a4a]/30 bg-[#0e7a4a]/10 px-3 text-[11px] font-extrabold text-[#0e7a4a] transition hover:bg-[#0e7a4a]/20"
          >
            🛒 {faNum(customers.length)} مشتری
          </button>
          <button
            onClick={() => jump('customers', 'VIP')}
            title="رفتن به مشتریان VIP"
            className="min-h-[36px] rounded-full border border-[#c9a227] bg-[#c9a227] px-3 text-[11px] font-extrabold text-[#0b2e20] shadow-sm transition hover:brightness-105"
          >
            💎 {faNum(vipCount)} VIP
          </button>
          <button
            onClick={() => jump('birthdays')}
            title="رفتن به تولدها و مناسبت‌ها"
            className="min-h-[36px] rounded-full border border-[#c96f4a]/30 bg-[#c96f4a]/10 px-3 text-[11px] font-extrabold text-[#a04c2a] transition hover:bg-[#c96f4a]/20"
          >
            🎂 {faNum(birthdaysThisMonth)} تولد این ماه
          </button>
        </div>
      </div>

      {/* ── نوار آمار ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="کل مشتریان" value={faNum(customers.length)} tone="emerald" icon={<Users size={20} />} onClick={() => jump('customers')} hint="پرونده‌های فعال" />
        <StatCard label="مشتریان VIP" value={faNum(vipCount)} tone="gold" icon={<Sparkles size={20} />} onClick={() => jump('customers', 'VIP')} hint="ارزش خرید بالا + فعال" />
        <StatCard label="در خطر جدا شدن" value={faNum(atRiskCount)} tone="rose" icon={<MessageSquareWarning size={20} />} onClick={() => jump('customers', 'AT_RISK')} hint="دیرکرد بیشتر از معمول خودش" />
        <StatCard label="شکایت‌های باز" value={faNum(openComplaints)} tone="terra" icon={<MessageSquareWarning size={20} />} onClick={() => jump('complaints')} hint={`${faNum(openOld)} مورد بیشتر از ۱۲ ساعت`} />
        <StatCard label="تولد این ماه" value={faNum(birthdaysThisMonth)} tone="olive" icon={<Cake size={20} />} onClick={() => jump('birthdays')} hint="پنجرهٔ عاطفی طلایی" />
      </div>

      {/* ── تب‌ها ── */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex min-h-[44px] items-center gap-2 rounded-xl border px-4 text-sm font-bold transition',
              tab === t.key ? 'border-transparent bg-[#0e7a4a] text-white shadow-lg shadow-[#0e7a4a]/25' : 'border-border bg-card text-foreground/70 hover:bg-secondary'
            )}
          >
            {t.icon}
            {t.label}
            {t.key === 'complaints' && openOld > 0 && <span className="rounded-full bg-[#b3372f] px-1.5 text-[10px] font-black text-white">{faNum(openOld)}</span>}
            {t.key === 'engagements' && (eng?.team.pendingQueue || 0) > 0 && isManager && <span className="rounded-full bg-[#c9a227] px-1.5 text-[10px] font-black text-white">{faNum(eng!.team.pendingQueue)}</span>}
          </button>
        ))}
      </div>

      {/* ═══════════ تب مشتریان ═══════════ */}
      {tab === 'customers' && (
        <SectionCard
          title="مشتریان — سگمنت‌بندی RFM"
          subtitle="R: روز از آخرین خرید · F: خرید ۹۰ روز · M: میانگین سبد (Hughes 1994) — CLV = سبد × بازدید سالانه × ۲۵٪ × ۳ سال"
          actions={
            <button onClick={() => setShowNew(true)} className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0e7a4a] px-4 text-sm font-black text-white shadow-lg shadow-[#0e7a4a]/25 transition hover:-translate-y-0.5">
              <Plus size={16} /> مشتری جدید
            </button>
          }
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={setQ} placeholder="نام، تلفن، تگ…" className="w-full sm:w-64" />
            <button
              onClick={() => setTierChip('')}
              className={cn('min-h-[36px] rounded-full border px-3 text-xs font-bold transition', !tierChip ? 'border-transparent bg-[#0e7a4a] text-white' : 'border-border bg-card text-foreground/70')}
            >
              همه
            </button>
            {Object.entries(CUSTOMER_TIERS).map(([k, m]) => (
              <button
                key={k}
                onClick={() => setTierChip(tierChip === k ? '' : k)}
                title={m.hint}
                className={cn('min-h-[36px] rounded-full border px-3 text-xs font-bold transition', tierChip === k ? 'border-transparent text-white' : 'border-border')}
                style={tierChip === k ? { background: m.color } : { color: m.color, background: m.bg }}
              >
                {m.label}
              </button>
            ))}
            {segDonut.length > 1 && (
              <div className="mr-auto hidden sm:block">
                <Donut data={segDonut} size={92} thickness={16} centerLabel="ترکیب سگمنت" centerValue={faNum(customers.length)} />
              </div>
            )}
          </div>

          {filteredCustomers.length === 0 ? (
            <EmptyState title="مشتری‌ای پیدا نشد" hint="با دکمهٔ «مشتری جدید» اولین پرونده را بسازید" />
          ) : (
            <div className="scroll-gold grid max-h-[560px] gap-3 overflow-y-auto pl-1 md:grid-cols-2 xl:grid-cols-3">
              {filteredCustomers.map((c) => {
                const r = stats[c.id]
                const tier = CUSTOMER_TIERS[(c.tier && c.tier !== 'REGULAR' ? c.tier : r?.segment) || 'REGULAR'] || CUSTOMER_TIERS.REGULAR
                const bMonth = c.birthday ? Number(c.birthday.slice(5, 7)) : 0
                const tags = tagList(c)
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openProfile(c.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') openProfile(c.id) }}
                    className="glow-card group relative cursor-pointer rounded-2xl border border-border/60 bg-white/80 p-4 text-right transition hover:-translate-y-0.5 hover:border-[#0e7a4a]/40"
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); startEditFromCard(c) }}
                      title="ویرایش مشتری"
                      className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-white/90 text-muted-foreground opacity-0 transition hover:border-[#0e7a4a]/50 hover:text-[#0e7a4a] focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Pencil size={13} />
                    </button>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={c.name} color={tier.color} size={42} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-black text-foreground">{c.name}</span>
                            {c.favorite && <Star size={12} className="shrink-0 fill-[#c9a227] text-[#c9a227]" />}
                          </div>
                          {c.phone && (
                            <a
                              href={`tel:${c.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-[#0e7a4a]"
                              dir="ltr"
                            >
                              <Phone size={10} /> {faNum(c.phone)}
                            </a>
                          )}
                        </div>
                      </div>
                      <Pill label={tier.label} color={tier.color} bg={tier.bg} />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {bMonth === curJm && <span className="rounded-full bg-[#c96f4a]/15 px-2 py-0.5 text-[10px] font-bold text-[#a04c2a]">🎂 تولد این ماه</span>}
                      <span className="rounded-full bg-[#c9a227]/12 px-2 py-0.5 text-[10px] font-bold text-[#8a6d10]">CLV: {faMoney(r?.clv || 0)}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">امتیاز: {faNum(c.points)}</span>
                      {r && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{faNum(r.visits)} بازدید</span>}
                      {tags.slice(0, 3).map((t) => (
                        <span key={t} className="rounded-full bg-[#77934a]/12 px-2 py-0.5 text-[10px] font-bold text-[#5c7236]">{t}</span>
                      ))}
                    </div>

                    <div className="mt-3 flex items-end justify-between gap-2">
                      <div className="text-[10px] leading-4 text-muted-foreground">
                        {r ? (
                          <>
                            آخرین فعالیت: {r.lastVisit ? `${faNum(r.rDays)} روز پیش` : 'بدون خرید'}
                            <br />
                            ۹۰ روز: {faNum(r.f90)} خرید · سبد: {faMoney(r.mAvg)}
                          </>
                        ) : (
                          '—'
                        )}
                      </div>
                      {r && <RfmBars r={r} />}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      )}

      {/* ═══════════ تب تولدها ═══════════ */}
      {tab === 'birthdays' && (
        <SectionCard
          title="تولدها و مناسبت‌ها — پنجرهٔ ۳۰ روز جلالی آینده"
          subtitle="سه لمس: هفتهٔ قبل، روز تولد، هفتهٔ بعد — Experian: نرخ تراکنش در ماه تولد ۴۸۱٪ بالاتر است"
          actions={
            <button onClick={createBirthdayCampaign} className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[#c96f4a] px-4 text-sm font-black text-white shadow-lg shadow-[#c96f4a]/25 transition hover:-translate-y-0.5">
              <PartyPopper size={16} /> کمپین تولد یک‌کلیکی (۱۴ روز)
            </button>
          }
        >
          {birthdays.length === 0 ? (
            <EmptyState emoji="🎂" title="در ۳۰ روز آینده تولدی نیست" hint="تاریخ تولد مشتریان را در پروفایل‌ها تکمیل کنید — این پنجرهٔ عاطفی طلایی است" />
          ) : (
            <div className="scroll-gold max-h-[520px] space-y-2 overflow-y-auto pl-1">
              {birthdays.map((b) => {
                const tier = CUSTOMER_TIERS[b.tier] || CUSTOMER_TIERS.REGULAR
                return (
                  <div key={b.id} className="glow-card flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/80 p-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#c96f4a]/12 text-xl">🎂</span>
                      <div className="min-w-0">
                        <button onClick={() => openProfile(b.id)} className="block truncate text-sm font-black text-foreground hover:text-[#0e7a4a]">
                          {b.name}
                        </button>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {b.phone && (
                            <a href={`tel:${b.phone}`} dir="ltr" className="flex items-center gap-1 font-bold hover:text-[#0e7a4a]">
                              <Phone size={10} /> {faNum(b.phone)}
                            </a>
                          )}
                          <span>{formatJalaliLong(b.birthday)}</span>
                          <span>· {faNum(b.age)} ساله</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill label={tier.label} color={tier.color} bg={tier.bg} />
                      {b.daysUntil === 0 ? (
                        <span className="rounded-full bg-[#b3372f] px-2.5 py-1 text-[11px] font-black text-white">🎉 امروز!</span>
                      ) : (
                        <span className="rounded-full bg-[#c9a227]/15 px-2.5 py-1 text-[11px] font-black text-[#8a6d10]">{faNum(b.daysUntil)} روز دیگر</span>
                      )}
                      {b.hasGift ? (
                        <button onClick={() => toggleGift(b)} title="برای لغو بزنید" className="flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#0e7a4a]/12 px-3 text-xs font-black text-[#0e7a4a]">
                          <CheckCheck size={14} /> هدیه ثبت شد
                        </button>
                      ) : (
                        <button onClick={() => toggleGift(b)} className="min-h-[36px] rounded-xl border border-[#0e7a4a]/40 px-3 text-xs font-black text-[#0e7a4a] transition hover:bg-[#0e7a4a]/10">
                          🎁 ثبت هدیه
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <p className="mt-4 rounded-xl bg-muted/50 p-3 text-[11px] leading-5 text-muted-foreground">
            🎁 ثبت هدیه یک رخداد <b>BIRTHDAY_GIFT</b> در پروندهٔ مشتری می‌نویسد (قابل لغو). علم پشت آن: تولد اوج لحظهٔ عاطفی سال مشتری است؛ پیام سه‌مرحله‌ای (T−۷، روز، T+۷) کل پنجرهٔ احساسی را پوشش می‌دهد و نرخ پاسخ را چند برابر می‌کند.
          </p>
        </SectionCard>
      )}

      {/* ═══════════ تب کمپین‌ها ═══════════ */}
      {tab === 'campaigns' && (
        <SectionCard
          title="کمپین‌های بازاریابی"
          subtitle="تولد سه‌لمسی · بازگشت تک‌پیامی · رویداد VIP — «رسیده» فقط برای مشتریان با رضایت بازاریابی شمرده می‌شود"
          actions={
            <button onClick={() => { pickKind('BIRTHDAY'); setShowWiz(true) }} className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0e7a4a] px-4 text-sm font-black text-white shadow-lg shadow-[#0e7a4a]/25 transition hover:-translate-y-0.5">
              <Plus size={16} /> کمپین جدید
            </button>
          }
        >
          {campaigns.length === 0 ? (
            <EmptyState emoji="📣" title="هنوز کمپینی ساخته نشده" hint="از «کمپین جدید» شروع کنید یا در تب تولدها یک‌کلیکی بسازید" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {campaigns.map((c) => {
                const k = CAMPAIGN_KIND[c.kind] || CAMPAIGN_KIND.OTHER
                const statusMeta = c.status === 'DONE' ? { label: 'اجرا شد', color: '#166534', bg: '#dcfce7' } : c.status === 'SCHEDULED' ? { label: 'زمان‌بندی‌شده', color: '#a16207', bg: '#fef9c3' } : { label: 'پیش‌نویس', color: '#6b7280', bg: '#f3f4f6' }
                return (
                  <div key={c.id} className="glow-card rounded-2xl bg-white/80 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl" style={{ background: `${k.color}1a` }}>{k.icon}</span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black">{c.name}</div>
                          <div className="text-[11px] text-muted-foreground">{k.label} · ساخت: {c.createdByName}</div>
                        </div>
                      </div>
                      <Pill label={statusMeta.label} color={statusMeta.color} bg={statusMeta.bg} />
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">مخاطبان زنده: {faNum(c.targetCount)}</span>
                      <span className="rounded-full bg-[#77934a]/12 px-2 py-0.5 text-[#5c7236]">رضایت پیام: {faNum(c.consentCount)}</span>
                      {c.scheduledFor && <span className="rounded-full bg-[#c9a227]/15 px-2 py-0.5 text-[#8a6d10]">زمان: {formatJalaliLong(c.scheduledFor)}</span>}
                      {c.targetFilter.tiers?.map((t) => <Pill key={t} label={CUSTOMER_TIERS[t]?.label || t} color={CUSTOMER_TIERS[t]?.color || '#6b7280'} />)}
                      {c.targetFilter.inactiveDays ? <span className="rounded-full bg-[#b3372f]/10 px-2 py-0.5 text-[#b3372f]">غیرفعال ≥ {faNum(c.targetFilter.inactiveDays)} روز</span> : null}
                      {c.targetFilter.minVisits ? <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">≥ {faNum(c.targetFilter.minVisits)} خرید</span> : null}
                    </div>
                    {c.message && <p className="mt-2 line-clamp-2 rounded-xl bg-muted/40 p-2 text-[11px] leading-5 text-muted-foreground">{c.message}</p>}
                    {c.status === 'DONE' && (
                      <div className="mt-2 rounded-xl bg-[#0e7a4a]/8 p-2.5 text-[11px] font-bold text-[#0e7a4a]">
                        نتیجه: {faNum(c.resultStats.targets || 0)} مخاطب هدف · {faNum(c.resultStats.reached || 0)} رسیده (با رضایت)
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      {c.status !== 'DONE' && (
                        <button
                          onClick={() => runCampaign(c)}
                          className={cn('min-h-[40px] flex-1 rounded-xl px-3 text-xs font-black transition', armedRun === c.id ? 'bg-[#b3372f] text-white' : 'bg-[#0e7a4a] text-white hover:-translate-y-0.5')}
                        >
                          {armedRun === c.id ? '⚠ مسلح — برای اجرا دوباره بزنید' : '🚀 اجرای کمپین'}
                        </button>
                      )}
                      {c.status !== 'DONE' && (
                        <button onClick={() => deleteCampaign(c)} title="حذف پیش‌نویس" className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-rose-50 hover:text-[#b3372f]">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-4 grid gap-2 rounded-xl bg-muted/50 p-3 text-[11px] leading-5 text-muted-foreground sm:grid-cols-2">
            <p>🎂 <b>چرا تولد سه لمس دارد؟</b> پژوهش Experian نشان می‌دهد نرخ تراکنش در ماه تولد ۴۸۱٪ بالاتر است؛ لمس هفتهٔ قبل انتظار می‌سازد، روزِ تولد اوج عاطفه است و T+۷ پنجره را می‌بندد.</p>
            <p>🌅 <b>چرا بازگشت فقط یک پیام؟</b> مشتریِ جدا‌شده با یک پیام قوی و غافلگیرکننده برمی‌گردد؛ پیام‌های پی‌درپی اثر معکوس دارد. Bain &amp; Company: ۵٪ بهبود نگهداشت تا ۲۵–۹۵٪ سود بیشتر.</p>
          </div>
        </SectionCard>
      )}

      {/* ═══════════ تب پیشنهادها و صداقت ═══════════ */}
      {tab === 'engagements' && eng && (
        <div className="space-y-5">
          <SectionCard title="پیشنهاد من" subtitle="هر تعامل واقعی با مشتری را ثبت کنید — صداقت شما با نمونه‌گیری تصادفی سیستم دیده می‌شود، نه با پاداش نقدی تک‌پیشنهاد">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Labeled label="مشتری (اختیاری)">
                  <select value={claimCustomerId} onChange={(e) => setClaimCustomerId(e.target.value)} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary">
                    <option value="">— بدون پرونده —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
                    ))}
                  </select>
                </Labeled>
                <Labeled label="نوع تعامل">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(CLAIM_KIND).map(([k, m]) => (
                      <button
                        key={k}
                        onClick={() => setClaimKind(k)}
                        className={cn('min-h-[40px] rounded-xl border px-3 text-xs font-bold transition', claimKind === k ? 'border-transparent bg-[#0e7a4a] text-white' : 'border-border bg-card')}
                      >
                        {m.icon} {m.label}
                      </button>
                    ))}
                  </div>
                </Labeled>
              </div>
              <Labeled label="کالاهای پیشنهادی" hint="هر کالا را جدا اضافه کنید">
                <div className="flex gap-2">
                  <input
                    value={claimProductInput}
                    onChange={(e) => setClaimProductInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && claimProductInput.trim()) {
                        e.preventDefault()
                        setClaimProducts([...claimProducts, claimProductInput.trim()])
                        setClaimProductInput('')
                      }
                    }}
                    placeholder="مثلاً: پنیر لیقوان" className="flex-1 rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => {
                      if (claimProductInput.trim()) {
                        setClaimProducts([...claimProducts, claimProductInput.trim()])
                        setClaimProductInput('')
                      }
                    }}
                    className="min-h-[44px] rounded-xl bg-secondary px-4 text-sm font-black text-[#0e7a4a]"
                  >
                    افزودن
                  </button>
                </div>
                {claimProducts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {claimProducts.map((p, i) => (
                      <span key={i} className="flex items-center gap-1 rounded-full bg-[#77934a]/15 px-2.5 py-1 text-[11px] font-bold text-[#5c7236]">
                        {p}
                        <button onClick={() => setClaimProducts(claimProducts.filter((_, j) => j !== i))}><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </Labeled>
              <Labeled label="توضیح (اختیاری)">
                <textarea value={claimNote} onChange={(e) => setClaimNote(e.target.value)} rows={2} placeholder="واکنش مشتری، موقعیت…" className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary" />
              </Labeled>
              <button onClick={submitClaim} className="min-h-[44px] w-full rounded-xl bg-[#0e7a4a] text-sm font-black text-white shadow-lg shadow-[#0e7a4a]/25 transition hover:-translate-y-0.5">
                ثبت تعامل
              </button>
            </div>
          </SectionCard>

          <SectionCard title="تعامل‌های من" subtitle="نتیجهٔ هر ادعا بعد از راستی‌آزمایی یا تبدیل مشخص می‌شود">
            {eng.claims.filter((c) => c.staffId === meId).length === 0 ? (
              <EmptyState emoji="💡" title="هنوز تعاملی ثبت نکرده‌اید" hint="اولین پیشنهاد واقعی‌تان را بالا ثبت کنید" />
            ) : (
              <div className="scroll-gold max-h-72 space-y-2 overflow-y-auto pl-1">
                {eng.claims.filter((c) => c.staffId === meId).map((c) => (
                  <div key={c.id} className="rounded-2xl border border-border/60 bg-white/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span>{CLAIM_KIND[c.kind]?.icon}</span>
                        <span className="font-black">{c.customerName || 'بدون پرونده'}</span>
                        <span className="text-muted-foreground">{formatJalaliDateTime(c.createdAt)}</span>
                      </div>
                      <OutcomeBadge o={c.outcome} />
                    </div>
                    {c.productNames.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{c.productNames.map((p, i) => <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{p}</span>)}</div>}
                    {c.orderCode && <div className="mt-1 text-[11px] font-bold text-[#8a6d10]">پیش‌فاکتور: {c.orderCode}</div>}
                    {c.verifyNote && <div className="mt-1 text-[11px] text-muted-foreground">بررسی {c.verifiedByName}: {c.verifyNote}</div>}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {isManager && (
            <>
              <SectionCard
                title={`صف راستی‌آزمایی (${faNum(eng.queue.filter((c) => c.verifySampled).length)} نمونه)`}
                subtitle="نمونه‌های تصادفی امروز اول می‌آیند — تأییدکننده هرگز نمی‌تواند خودِ ثبت‌کننده باشد (جداسازی وظایف COSO)"
                icon={<ShieldCheck size={18} />}
              >
                {eng.queue.length === 0 ? (
                  <EmptyState emoji="✅" title="صف خالی است" hint="ادعاهای در انتظار راستی‌آزمایی نمونه‌خورده نداریم" />
                ) : (
                  <div className="scroll-gold max-h-96 space-y-2 overflow-y-auto pl-1">
                    {eng.queue.map((c) => (
                      <div key={c.id} className={cn('rounded-2xl border p-3', c.verifySampled ? 'border-[#c9a227]/50 bg-[#fdf6dd]/60' : 'border-border/60 bg-white/70')}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {c.verifySampled ? <Pill label="نمونهٔ سیستم 🔍" color="#8a6d10" bg="#fdf6dd" /> : <Pill label="در انتظار" color="#6b7280" bg="#f3f4f6" />}
                            <span className="font-black">{c.staffName}</span>
                            <span className="text-muted-foreground">← {c.customerName || 'بدون پرونده'}</span>
                            <span className="text-muted-foreground">{formatJalaliDateTime(c.createdAt)}</span>
                          </div>
                          <OutcomeBadge o={c.outcome} />
                        </div>
                        {c.productNames.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{c.productNames.map((p, i) => <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{p}</span>)}</div>}
                        {c.claimNote && <div className="mt-1 text-[11px] text-muted-foreground">{c.claimNote}</div>}
                        {c.staffId === meId ? (
                          <div className="mt-2 rounded-xl bg-muted/60 p-2 text-[11px] font-bold text-muted-foreground">🔒 ثبت خودِ شماست — طبق جداسازی وظایف، همکار دیگری تأیید می‌کند</div>
                        ) : (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <input
                              value={verifyNotes[c.id] || ''}
                              onChange={(e) => setVerifyNotes({ ...verifyNotes, [c.id]: e.target.value })}
                              placeholder="یادداشت بررسی (اختیاری)"
                              className="min-h-[40px] flex-1 rounded-xl border border-input bg-white/90 px-3 text-xs outline-none focus:border-primary"
                            />
                            <button onClick={() => verifyClaim(c, 'VERIFIED_OK')} className="min-h-[40px] rounded-xl bg-[#0e7a4a] px-3 text-xs font-black text-white">تأیید درست</button>
                            <button onClick={() => verifyClaim(c, 'VERIFIED_BAD')} className="min-h-[40px] rounded-xl bg-[#b3372f] px-3 text-xs font-black text-white">تأیید نامعتبر</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="پرچم‌های آماری — z-score نسبت به همتایان" subtitle="پرچم = وظیفهٔ گفت‌وگوی مدیر، هرگز تنبیه خودکار. فقط کسانی با ≥۵ ادعا در مقایسه هستند">
                {eng.flags.length === 0 ? (
                  <div className="rounded-xl bg-[#0e7a4a]/8 p-3 text-xs font-bold text-[#0e7a4a]">هیچ پرچمی فعال نیست — نرخ ثبت تیم در محدودهٔ طبیعی است 🌿</div>
                ) : (
                  <div className="space-y-2">
                    {eng.flags.map((f) => (
                      <div key={f.staffId} className="rounded-2xl border border-[#b3372f]/30 bg-[#b3372f]/5 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs">
                            <span className="font-black text-[#b3372f]">{f.staffName}</span>
                            <span className="mr-2 text-muted-foreground">نرخ ۳۰ روزه: {faNum(f.rate)} ادعا · z = {faDec(f.z)}</span>
                          </div>
                          <button onClick={() => createFollowupTask(f)} className="min-h-[40px] rounded-xl border border-[#b3372f]/50 px-3 text-xs font-black text-[#b3372f] hover:bg-[#b3372f]/10">
                            ایجاد وظیفهٔ پیگیری
                          </button>
                        </div>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{f.note}</p>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="پیشرفت تیم — فقط سطح تیم" subtitle="عمداً جدول رتبه‌بندی فردی نداریم: مقایسهٔ فردی، انگیزهٔ درونی را می‌کُشد (Deci 1999)">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    { l: 'ادعای ۳۰ روز', v: eng.team.claims30d, c: '#0e7a4a' },
                    { l: 'نمونهٔ سیستم', v: eng.team.sampled30d, c: '#8a6d10' },
                    { l: 'تأیید درست', v: eng.team.verifiedOk30d, c: '#166534' },
                    { l: 'نامعتبر', v: eng.team.verifiedBad30d, c: '#b3372f' },
                    { l: 'تبدیل به فروش', v: eng.team.converted30d, c: '#c96f4a' },
                  ].map((s) => (
                    <div key={s.l} className="rounded-2xl bg-white/70 p-3 text-center">
                      <div className="text-xl font-black" style={{ color: s.c }}>{faNum(s.v)}</div>
                      <div className="mt-1 text-[10px] font-bold text-muted-foreground">{s.l}</div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </>
          )}

          <div className="rounded-2xl bg-muted/50 p-4 text-[11px] leading-5 text-muted-foreground">
            <p className="mb-1 font-black text-foreground/70">🔍 پروتکل صداقت — چطور کار می‌کند؟</p>
            <p>• هر روز سیستم با seed قطعی (تاریخ + شناسهٔ شما) حدود <b>۲۰٪</b> ادعاها را نمونه می‌گیرد — قابل حدس نیست، پس انگیزهٔ ثبتِ واقعی از «شانسِ لو رفتن» می‌آید (AS 2315: audit sampling).</p>
            <p>• نرخ ثبت هر نفر با همتایان مقایسه می‌شود؛ انحراف بیش از <b>۲٫۵ انحراف معیار</b> یا بالاتر از صدک ۹۵ فقط پرچم می‌زند و وظیفهٔ گفت‌وگو می‌سازد.</p>
            <p>• <b>پاداش نقدی تک‌پیشنهاد نداریم</b> — فراتحلیل ۱۲۸ پژوهش (Deci و همکاران ۱۹۹۹): پاداش‌های نقدیِ مورد انتظار، انگیزهٔ درونی را تضعیف می‌کنند. قدردانی غافلگیرکننده جایگزین است.</p>
            <p>• تأیید هر نمونه توسط <b>شخصی غیر از ثبت‌کننده</b> انجام می‌شود (COSO — جداسازی وظایف).</p>
          </div>
        </div>
      )}

      {/* ═══════════ تب شکایت‌ها ═══════════ */}
      {tab === 'complaints' && (
        <SectionCard
          title={`شکایت‌ها ${openOld > 0 ? `— ${faNum(openOld)} مورد نیازمند اقدام` : ''}`}
          subtitle="service recovery paradox: حل زیر ۲۴ ساعت + جبران کوچک = مشتری وفادارتر از قبل. بازِ بیش از ۱۲ ساعت به مدیریت اعلان critical می‌زند"
        >
          {complaints.length === 0 ? (
            <EmptyState emoji="💬" title="شکایتی ثبت نشده" hint="از پروفایل مشتری یا دکمهٔ پایین ثبت کنید" />
          ) : (
            <div className="scroll-gold max-h-[560px] space-y-2.5 overflow-y-auto pl-1">
              {complaints.map((c) => {
                const hoursOpen = (Date.now() - new Date(c.openedAt).getTime()) / 3600000
                const sla =
                  c.status === 'RESOLVED'
                    ? { label: `حل شد ${c.resolvedAt ? `— ${formatJalaliDateTime(c.resolvedAt)}` : ''}`, color: '#166534', bg: '#dcfce7' }
                    : c.status === 'RESOLVING'
                      ? { label: 'در حال رسیدگی', color: '#a04c2a', bg: '#ffedd5' }
                      : hoursOpen > 12
                        ? { label: `نیاز به اقدام — ${faNum(Math.floor(hoursOpen))} ساعت افتاده`, color: '#b3372f', bg: '#fee2e2' }
                        : { label: `در مهلت ۲۴ ساعته — ${faNum(Math.max(1, Math.floor(24 - hoursOpen)))} ساعت مانده`, color: '#a16207', bg: '#fef9c3' }
                const cat = COMPLAINT_CAT[c.category] || COMPLAINT_CAT.GENERAL
                const sev = COMPLAINT_SEV[c.severity] || COMPLAINT_SEV.NORMAL
                return (
                  <div key={c.id} className={cn('glow-card rounded-2xl bg-white/85 p-4', c.status === 'OPEN' && hoursOpen > 12 && 'ring-2 ring-[#b3372f]/30')}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: sev.bg }}>{cat.icon}</span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {c.customerId ? (
                              <button onClick={() => openProfile(c.customerId)} className="text-sm font-black hover:text-[#0e7a4a]">{c.customerName || 'مشتری'}</button>
                            ) : (
                              <span className="text-sm font-black">{c.customerName || 'مشتری'}</span>
                            )}
                            <Pill label={cat.label} color="#6b7280" bg="#f3f4f6" />
                            <Pill label={sev.label} color={sev.color} bg={sev.bg} />
                          </div>
                          <div className="text-[11px] text-muted-foreground">ثبت: {formatJalaliDateTime(c.openedAt)}</div>
                        </div>
                      </div>
                      <Pill label={sla.label} color={sla.color} bg={sla.bg} />
                    </div>
                    <p className="mt-2 rounded-xl bg-muted/40 p-2.5 text-xs leading-5 text-foreground/80">{c.body}</p>
                    {c.resolutionNote && <p className="mt-2 text-[11px] font-bold text-[#0e7a4a]">حل: {c.resolutionNote}{c.compensationValue > 0 ? ` · جبران: ${faMoney(c.compensationValue)} تومان` : ''}</p>}
                    {c.status !== 'RESOLVED' && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {c.status === 'OPEN' && (
                          <button
                            onClick={async () => {
                              try {
                                await api('/api/complaints', { method: 'PATCH', body: { id: c.id, status: 'RESOLVING' } })
                                toast.success('وضعیت: در حال رسیدگی')
                                await load()
                              } catch (e) { toast.error((e as Error).message) }
                            }}
                            className="min-h-[40px] rounded-xl border border-[#c96f4a]/50 px-3 text-xs font-black text-[#a04c2a] hover:bg-[#c96f4a]/10"
                          >
                            شروع رسیدگی
                          </button>
                        )}
                        <button
                          onClick={() => { setResolveC(c); setResolveNote(''); setResolveComp('') }}
                          className="min-h-[40px] rounded-xl bg-[#0e7a4a] px-3 text-xs font-black text-white"
                        >
                          حل و ثبت جبران
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      )}

      {/* ═══════════ پروفایل مشتری ═══════════ */}
      {profileId && (
        <Modal title={profileCust ? `پروفایل — ${profileCust.name}` : 'پروفایل مشتری'} onClose={() => setProfileId('')} wide>
          {!profile || !profileCust ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">در حال بارگذاری پروفایل…</div>
          ) : (
            <div className="space-y-4">
              {/* سربرگ — تیئر دستی (غیر REGULAR) بر سگمنت RFM مقدم است */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={profileCust.name} color={effTier.color} size={48} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-black">{profileCust.name}</span>
                      <Pill label={effTier.label} color={effTier.color} bg={effTier.bg} />
                      {profile.rfm && <Pill label={`CLV: ${faMoney(profile.rfm.clv)} تومان`} color="#8a6d10" bg="#fdf6dd" />}
                      <button
                        onClick={startEditFromProfile}
                        className="flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#c9a227]/15 px-3 text-[11px] font-black text-[#8a6d10] transition hover:bg-[#c9a227]/25"
                      >
                        <Pencil size={12} /> ویرایش مشتری
                      </button>
                    </div>
                    {profile.rfm && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        R/F/M: {faNum(profile.rfm.rScore)}/{faNum(profile.rfm.fScore)}/{faNum(profile.rfm.mScore)} · {faNum(profile.rfm.visits)} بازدید · سگمنت RFM محاسبه‌شده: {(CUSTOMER_TIERS[profile.rfm.segment] || CUSTOMER_TIERS.REGULAR).label}{profileCust.tier && profileCust.tier !== 'REGULAR' ? ' (تیئر دستی فعال است)' : ''}
                      </div>
                    )}
                  </div>
                </div>
                {profile.rfm && <RfmBars r={profile.rfm} />}
              </div>

              {/* فیلدها */}
              <div className="grid gap-2 sm:grid-cols-2">
                <KeyValue k="تلفن" v={profileCust.phone ? <a href={`tel:${profileCust.phone}`} dir="ltr" className="hover:text-[#0e7a4a]">{faNum(profileCust.phone)}</a> : '—'} />
                <KeyValue k="کانال ترجیحی" v={CHANNEL_LABEL[profileCust.preferredChannel] || '—'} />
                <KeyValue k="تولد" v={profileCust.birthday ? formatJalaliLong(profileCust.birthday) : '—'} />
                <KeyValue k="سالگرد" v={profileCust.anniversary ? formatJalaliLong(profileCust.anniversary) : '—'} />
                <KeyValue k="عضویت از" v={profileCust.joinedAt ? formatJalaliLong(profileCust.joinedAt) : formatJalaliLong(profileCust.createdAt)} />
                <KeyValue k="امتیاز" v={faNum(profileCust.points)} />
                <KeyValue k="تعداد خانوار" v={profileCust.householdSize ? `${faNum(profileCust.householdSize)} نفر` : '—'} />
                <KeyValue k="سن فرزندان" v={profileCust.childrenAges.length ? profileCust.childrenAges.map((a) => faNum(a)).join('، ') : '—'} />
                <KeyValue
                  k="رضایت بازاریابی"
                  v={
                    <button
                      onClick={() => patchCustomer(profileCust.id, { consentMarketing: !profileCust.consentMarketing }, profileCust.consentMarketing ? 'رضایت بازاریابی برداشته شد' : 'رضایت بازاریابی ثبت شد')}
                      className={cn('min-h-[32px] rounded-full px-3 text-[11px] font-black', profileCust.consentMarketing ? 'bg-[#0e7a4a] text-white' : 'bg-muted text-muted-foreground')}
                    >
                      {profileCust.consentMarketing ? 'دارد ✓ (کمپین‌ها مجاز)' : 'ندارد — بزنید برای ثبت'}
                    </button>
                  }
                />
                <KeyValue k="آخرین فعالیت" v={profile.rfm?.lastVisit ? formatJalaliLong(profile.rfm.lastVisit) : '—'} />
              </div>

              {/* تگ‌ها */}
              <div>
                <div className="mb-1.5 text-xs font-bold text-foreground/80">تگ‌ها (ترجیحات، محدودیت‌ها…)</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {profileCust.tags.map((t) => (
                    <span key={t} className="flex items-center gap-1 rounded-full bg-[#77934a]/15 px-2.5 py-1 text-[11px] font-bold text-[#5c7236]">
                      {t}
                      <button onClick={() => patchCustomer(profileCust.id, { tags: profileCust.tags.filter((x) => x !== t) }, 'تگ حذف شد')}><X size={12} /></button>
                    </span>
                  ))}
                  <div className="flex gap-1.5">
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && tagInput.trim()) {
                          e.preventDefault()
                          patchCustomer(profileCust.id, { tags: [...profileCust.tags, tagInput.trim()] }, 'تگ اضافه شد')
                          setTagInput('')
                        }
                      }}
                      placeholder="تگ جدید…"
                      className="min-h-[36px] w-32 rounded-xl border border-input bg-white/90 px-2.5 text-[11px] outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => {
                        if (tagInput.trim()) {
                          patchCustomer(profileCust.id, { tags: [...profileCust.tags, tagInput.trim()] }, 'تگ اضافه شد')
                          setTagInput('')
                        }
                      }}
                      className="min-h-[36px] rounded-xl bg-secondary px-3 text-[11px] font-black text-[#0e7a4a]"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* الگوی خرید */}
              {profile.rfm && (
                <div className="grid gap-3 rounded-2xl bg-muted/40 p-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-xs font-black text-foreground/80">الگوی خرید</div>
                    <KeyValue k="میانگین سبد" v={`${faMoney(profile.rfm.mAvg)} تومان`} />
                    <KeyValue k="بازدید در ماه" v={faNum(profile.rfm.visitsPerMonth)} />
                    <KeyValue k="روز هفتهٔ ترجیحی" v={profile.rfm.preferredWeekday} />
                    <KeyValue k="فاصلهٔ معمول بازدید" v={profile.rfm.medianGapDays ? `${faNum(profile.rfm.medianGapDays)} روز` : '—'} />
                    <KeyValue k="CLV (افق ۳ سال، حاشیه ۲۵٪)" v={`${faMoney(profile.rfm.clv)} تومان`} />
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-black text-foreground/80">پرخارج‌ترین کالاهای او</div>
                    {profile.rfm.topProducts.length ? (
                      <RankBars data={profile.rfm.topProducts.map((p) => ({ label: p.name, value: p.count, color: '#77934a' }))} formatValue={(v) => `${faNum(v)}×`} />
                    ) : (
                      <div className="text-[11px] text-muted-foreground">هنوز خریدی ثبت نشده</div>
                    )}
                  </div>
                </div>
              )}

              {/* ثبت رخداد — هیچ ورودی خودکار ارسال نمی‌شود؛ همیشه دکمهٔ ثبت (یا Ctrl+Enter) */}
              <div className="rounded-2xl border border-border/60 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {EVENT_TYPES.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setEvType(t.key)}
                      className={cn('min-h-[36px] rounded-xl px-3 text-xs font-bold transition', evType === t.key ? 'text-white' : 'bg-muted hover:bg-secondary')}
                      style={evType === t.key ? { background: t.color } : {}}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
                {evType === 'COMPLAINT' && (
                  <div className="mb-2">
                    <div className="mb-1 text-[11px] font-bold text-foreground/70">زیرشاخهٔ شکایت <span className="font-normal text-muted-foreground">(انتخابش جدا است — ثبت فقط با دکمهٔ زیر)</span></div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(COMPLAINT_CAT).map(([k, m]) => (
                        <button
                          key={k}
                          onClick={() => setEvSub(k)}
                          className={cn('min-h-[34px] rounded-xl border px-3 text-[11px] font-bold transition', evSub === k ? 'border-transparent bg-[#b3372f] text-white' : 'border-border bg-card text-foreground/70 hover:bg-secondary')}
                        >
                          {m.icon} {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <textarea
                  value={evText}
                  onChange={(e) => setEvText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      submitEvent()
                    }
                  }}
                  rows={evType === 'COMPLAINT' ? 3 : 2}
                  placeholder={EVENT_TYPES.find((t) => t.key === evType)?.placeholder || 'متن…'}
                  className="w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground">ثبت سریع: Ctrl+Enter · ارسال فقط با دکمهٔ ثبت انجام می‌شود</span>
                  <button
                    onClick={submitEvent}
                    disabled={!evText.trim() || evBusy}
                    className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0e7a4a] px-5 text-sm font-black text-white shadow-lg shadow-[#0e7a4a]/25 transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {evBusy && <Loader2 size={16} className="animate-spin" />}
                    {evType === 'COMPLAINT' ? 'ثبت شکایت' : 'ثبت رخداد'}
                  </button>
                </div>
              </div>

              {/* تایم‌لاین */}
              <div>
                <div className="mb-2 text-xs font-black text-foreground/80">تایم‌لاین مشتری — رخدادها، خریدها، تعامل‌ها و شکایت‌ها</div>
                {profile.timeline.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground">هنوز رخدادی ثبت نشده</div>
                ) : (
                  <div className="scroll-gold max-h-72 space-y-1.5 overflow-y-auto pl-1">
                    {profile.timeline.map((t, i) => (
                      <div key={i} className="flex items-start gap-2.5 rounded-xl bg-white/70 p-2.5">
                        <span className="text-base">{t.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="text-xs font-black">{t.title}</span>
                            <span className="text-[10px] text-muted-foreground">{formatJalaliDateTime(t.at)}</span>
                          </div>
                          {t.detail && <div className="text-[11px] leading-4 text-muted-foreground">{t.detail}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ═══════════ ویرایش مشتری ═══════════ */}
      {editOpen && ec && (
        <Modal title={profileCust && profileId ? `ویرایش مشتری — ${profileCust.name}` : 'ویرایش مشتری'} onClose={() => setEditOpen(false)} wide>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="نام و نام خانوادگی *">
                <input value={ec.name} onChange={(e) => setEc({ ...ec, name: e.target.value })} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary" />
              </Labeled>
              <Labeled label="تلفن همراه" hint="فقط رقم و +">
                <input value={ec.phone} onChange={(e) => setEc({ ...ec, phone: e.target.value })} dir="ltr" placeholder="0913…" className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary" />
              </Labeled>
              <Labeled label="تیئر مشتری" hint={ec.tier === 'REGULAR' ? 'خودکار — سگمنت از RFM محاسبه می‌شود' : CUSTOMER_TIERS[ec.tier]?.hint}>
                <select value={ec.tier} onChange={(e) => setEc({ ...ec, tier: e.target.value })} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary">
                  <option value="REGULAR">
                    خودکار (RFM){profile?.rfm?.segment && profile.rfm.segment !== 'REGULAR' ? ` — محاسبه‌شده: ${CUSTOMER_TIERS[profile.rfm.segment]?.label || profile.rfm.segment}` : ''}
                  </option>
                  {Object.entries(CUSTOMER_TIERS)
                    .filter(([k]) => k !== 'REGULAR')
                    .map(([k, m]) => (
                      <option key={k} value={k}>{m.label} — {m.hint}</option>
                    ))}
                </select>
              </Labeled>
              <Labeled label="کانال ترجیحی ارتباط">
                <select value={ec.preferredChannel} onChange={(e) => setEc({ ...ec, preferredChannel: e.target.value })} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary">
                  {Object.entries(CHANNEL_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="تولد 🎂" hint="پنجرهٔ عاطفی — Experian ۴۸۱٪">
                <JalaliDatePicker compact value={ec.birthday} onChange={(iso) => setEc({ ...ec, birthday: iso })} holidays={holidays} placeholder="تاریخ تولد" />
              </Labeled>
              <Labeled label="سالگرد">
                <JalaliDatePicker compact value={ec.anniversary} onChange={(iso) => setEc({ ...ec, anniversary: iso })} holidays={holidays} placeholder="تاریخ سالگرد" />
              </Labeled>
              <Labeled label="تعداد خانوار (نفر)">
                <FaPriceInput value={ec.householdSize === '' ? '' : ec.householdSize} onChange={(v) => setEc({ ...ec, householdSize: v === '' ? '' : v })} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm" placeholder="۰" />
              </Labeled>
              <Labeled label="سن فرزندان" hint="با ویرگول جدا کنید — مثلاً ۴، ۹">
                <input value={ec.childrenAges} onChange={(e) => setEc({ ...ec, childrenAges: e.target.value })} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary" />
              </Labeled>
            </div>

            <Labeled label="تگ‌ها" hint="ترجیحات، محدودیت‌های غذایی… — Enter یا دکمهٔ افزودن">
              <div className="space-y-2">
                {ec.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {ec.tags.map((t) => (
                      <span key={t} className="flex items-center gap-1 rounded-full bg-[#77934a]/15 px-2.5 py-1 text-[11px] font-bold text-[#5c7236]">
                        {t}
                        <button onClick={() => setEc({ ...ec, tags: ec.tags.filter((x) => x !== t) })} title="حذف تگ"><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    value={editTagInput}
                    onChange={(e) => setEditTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editTagInput.trim()) {
                        e.preventDefault()
                        setEc({ ...ec, tags: [...new Set([...ec.tags, editTagInput.trim()])] })
                        setEditTagInput('')
                      }
                    }}
                    placeholder="تگ جدید…"
                    className="min-h-[44px] flex-1 rounded-xl border border-input bg-white/90 px-3 text-sm shadow-sm outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => {
                      if (editTagInput.trim()) {
                        setEc({ ...ec, tags: [...new Set([...ec.tags, editTagInput.trim()])] })
                        setEditTagInput('')
                      }
                    }}
                    className="min-h-[44px] rounded-xl bg-secondary px-4 text-sm font-black text-[#0e7a4a]"
                  >
                    افزودن
                  </button>
                </div>
              </div>
            </Labeled>

            <Labeled label="یادداشت">
              <textarea value={ec.notes} onChange={(e) => setEc({ ...ec, notes: e.target.value })} rows={2} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary" />
            </Labeled>
            <Labeled label="ترجیحات خرید">
              <input value={ec.preferences} onChange={(e) => setEc({ ...ec, preferences: e.target.value })} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary" />
            </Labeled>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-muted/50 p-3">
              <input type="checkbox" checked={ec.consentMarketing} onChange={(e) => setEc({ ...ec, consentMarketing: e.target.checked })} className="h-5 w-5 accent-[#0e7a4a]" />
              <span className="text-xs font-bold">رضایت دریافت پیام‌های بازاریابی دارد (بدون رضایت، در آمار «رسیده» کمپین نمی‌آید)</span>
            </label>
            <div className="rounded-xl bg-[#c9a227]/10 p-2.5 text-[11px] leading-5 text-[#8a6d10]">
              🛠️ هر تغییر در تایم‌لاین مشتری با رخداد «ویرایش پرونده» و خلاصهٔ فیلدها ثبت می‌شود. تیئر دستی تا تغییر بعدی بر سگمنت RFM مقدم است؛ گزینهٔ «خودکار» برمی‌گرداند به محاسبهٔ RFM.
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveEdit}
                disabled={editBusy || !ec.name.trim()}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#0e7a4a] text-sm font-black text-white shadow-lg shadow-[#0e7a4a]/25 transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {editBusy && <Loader2 size={16} className="animate-spin" />}
                ذخیرهٔ تغییرات
              </button>
              <button onClick={() => setEditOpen(false)} className="min-h-[44px] rounded-xl border border-border px-5 text-sm font-bold">انصراف</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ═══════════ مشتری جدید ═══════════ */}
      {showNew && (
        <Modal title="مشتری جدید" onClose={() => setShowNew(false)} wide>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="نام و نام خانوادگی *">
                <input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary" />
              </Labeled>
              <Labeled label="تلفن همراه">
                <input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} dir="ltr" placeholder="0913…" className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary" />
              </Labeled>
              <Labeled label="تولد 🎂" hint="پنجرهٔ عاطفی — Experian ۴۸۱٪">
                <JalaliDatePicker value={nc.birthday} onChange={(iso) => setNc({ ...nc, birthday: iso })} holidays={holidays} placeholder="تاریخ تولد" />
              </Labeled>
              <Labeled label="سالگرد">
                <JalaliDatePicker value={nc.anniversary} onChange={(iso) => setNc({ ...nc, anniversary: iso })} holidays={holidays} placeholder="تاریخ سالگرد" />
              </Labeled>
              <Labeled label="تعداد خانوار (نفر)">
                <FaPriceInput value={nc.householdSize === 0 ? '' : nc.householdSize} onChange={(v) => setNc({ ...nc, householdSize: v === '' ? 0 : v })} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm" placeholder="۰" />
              </Labeled>
              <Labeled label="سن فرزندان" hint="با ویرگول جدا کنید — مثلاً ۴، ۹">
                <input value={nc.childrenAges} onChange={(e) => setNc({ ...nc, childrenAges: e.target.value })} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary" />
              </Labeled>
              <Labeled label="کانال ترجیحی ارتباط">
                <select value={nc.preferredChannel} onChange={(e) => setNc({ ...nc, preferredChannel: e.target.value })} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary">
                  {Object.entries(CHANNEL_LABEL).filter(([k]) => k !== 'NONE').map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                  <option value="NONE">—</option>
                </select>
              </Labeled>
              <Labeled label="تگ‌ها" hint="با ویرگول — مثلاً بدون لاکتوز، برنج‌شناس">
                <input value={nc.tags} onChange={(e) => setNc({ ...nc, tags: e.target.value })} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary" />
              </Labeled>
            </div>
            <Labeled label="یادداشت">
              <textarea value={nc.notes} onChange={(e) => setNc({ ...nc, notes: e.target.value })} rows={2} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary" />
            </Labeled>
            <Labeled label="ترجیحات خرید">
              <input value={nc.preferences} onChange={(e) => setNc({ ...nc, preferences: e.target.value })} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary" />
            </Labeled>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-muted/50 p-3">
              <input type="checkbox" checked={nc.consentMarketing} onChange={(e) => setNc({ ...nc, consentMarketing: e.target.checked })} className="h-5 w-5 accent-[#0e7a4a]" />
              <span className="text-xs font-bold">رضایت دریافت پیام‌های بازاریابی را دارد (بدون رضایت، در آمار «رسیده» کمپین نمی‌آید)</span>
            </label>
            <div className="flex gap-2">
              <button onClick={submitNewCustomer} className="min-h-[44px] flex-1 rounded-xl bg-[#0e7a4a] text-sm font-black text-white shadow-lg shadow-[#0e7a4a]/25">ایجاد پرونده</button>
              <button onClick={() => setShowNew(false)} className="min-h-[44px] rounded-xl border border-border px-5 text-sm font-bold">انصراف</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ═══════════ ویزارد کمپین ═══════════ */}
      {showWiz && (
        <Modal title="کمپین جدید" onClose={() => setShowWiz(false)} wide>
          <div className="space-y-3">
            <Labeled label="۱. نوع کمپین">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(CAMPAIGN_KIND).map(([k, m]) => (
                  <button key={k} onClick={() => pickKind(k)} className={cn('min-h-[40px] rounded-xl border px-3 text-xs font-bold transition', wizKind === k ? 'border-transparent text-white' : 'border-border bg-card')} style={wizKind === k ? { background: m.color } : {}}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </Labeled>
            <Labeled label="۲. مخاطبان" hint="پیشنهاد خودکار بر اساس نوع — قابل تغییر">
              <div className="space-y-2 rounded-2xl bg-muted/40 p-3">
                {wizKind === 'BIRTHDAY' && (
                  <div className="flex items-center gap-2 text-xs font-bold">
                    تولدهای
                    <input type="number" min={1} max={60} value={wizBdays === '' ? '' : wizBdays} onChange={(e) => setWizBdays(e.target.value === '' ? '' : Number(e.target.value))} className="w-16 rounded-lg border border-input bg-white px-2 py-1.5 text-center text-xs" dir="ltr" />
                    روز آینده
                  </div>
                )}
                {wizKind !== 'BIRTHDAY' && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                    تیئرها:
                    {Object.keys(CUSTOMER_TIERS).map((t) => (
                      <button
                        key={t}
                        onClick={() => setWizTiers(wizTiers.includes(t) ? wizTiers.filter((x) => x !== t) : [...wizTiers, t])}
                        className={cn('min-h-[32px] rounded-full border px-2.5 text-[11px]', wizTiers.includes(t) ? 'border-transparent text-white' : 'border-border')}
                        style={wizTiers.includes(t) ? { background: CUSTOMER_TIERS[t].color } : { color: CUSTOMER_TIERS[t].color }}
                      >
                        {CUSTOMER_TIERS[t].label}
                      </button>
                    ))}
                  </div>
                )}
                {wizKind !== 'BIRTHDAY' && (
                  <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                    <span className="flex items-center gap-1.5">
                      حداقل خرید:
                      <input type="number" min={0} value={wizMinVisits === '' ? '' : wizMinVisits} onChange={(e) => setWizMinVisits(e.target.value === '' ? '' : Number(e.target.value))} className="w-14 rounded-lg border border-input bg-white px-2 py-1.5 text-center text-xs" dir="ltr" />
                    </span>
                    <span className="flex items-center gap-1.5">
                      غیرفعال ≥
                      <input type="number" min={0} value={wizInactive === '' ? '' : wizInactive} onChange={(e) => setWizInactive(e.target.value === '' ? '' : Number(e.target.value))} className="w-14 rounded-lg border border-input bg-white px-2 py-1.5 text-center text-xs" dir="ltr" />
                      روز
                    </span>
                  </div>
                )}
                <div className="rounded-xl bg-[#c9a227]/12 p-2.5 text-[11px] font-bold text-[#8a6d10]">
                  پیش‌نمایش: {faNum(wizPreview.ids.length)} مخاطب · {faNum(wizPreview.consent)} با رضایت پیام{wizPreview.names.length ? ` — مثل: ${wizPreview.names.join('، ')}` : ''}
                </div>
              </div>
            </Labeled>
            <Labeled label="۳. نام کمپین">
              <input value={wizName} onChange={(e) => setWizName(e.target.value)} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary" />
            </Labeled>
            <Labeled label="۴. پیام" hint="متن پیشنهادی بر اساس نوع کمپین — قابل ویرایش">
              <textarea value={wizMessage} onChange={(e) => setWizMessage(e.target.value)} rows={3} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary" />
            </Labeled>
            <Labeled label="۵. زمان‌بندی (اختیاری)" hint="بدون تاریخ = پیش‌نویس؛ اجرا دستی از کارت کمپین">
              <JalaliDatePicker value={wizScheduled} onChange={setWizScheduled} holidays={holidays} placeholder="انتخاب تاریخ" minDate={today} />
            </Labeled>
            <div className="flex gap-2">
              <button onClick={submitCampaign} className="min-h-[44px] flex-1 rounded-xl bg-[#0e7a4a] text-sm font-black text-white shadow-lg shadow-[#0e7a4a]/25">ساخت کمپین</button>
              <button onClick={() => setShowWiz(false)} className="min-h-[44px] rounded-xl border border-border px-5 text-sm font-bold">انصراف</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ═══════════ حل شکایت ═══════════ */}
      {resolveC && (
        <Modal title={`حل شکایت — ${resolveC.customerName || 'مشتری'}`} onClose={() => setResolveC(null)}>
          <div className="space-y-3">
            <p className="rounded-xl bg-muted/50 p-3 text-xs leading-5">{resolveC.body}</p>
            <Labeled label="یادداشت حل" hint="چه کردید که مشتری راضی برود؟">
              <textarea value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} rows={3} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-primary" />
            </Labeled>
            <Labeled label="ارزش جبران (تومان)" hint="جبران کوچک — هدیه، تخفیف، قرعه">
              <FaPriceInput value={resolveComp} onChange={setResolveComp} className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm" placeholder="۰" />
            </Labeled>
            <div className="rounded-xl bg-[#77934a]/10 p-3 text-[11px] leading-5 text-[#5c7236]">
              🌿 <b>service recovery paradox:</b> شکایتی که سریع (زیر ۲۴ ساعت) با کمی جبران حل شود، وفاداری مشتری را حتی بالاتر از حالت بدون مشکل می‌برد — شکایت یعنی هنوز به ما فرصت می‌دهد.
            </div>
            <button onClick={resolveComplaint} className="min-h-[44px] w-full rounded-xl bg-[#0e7a4a] text-sm font-black text-white shadow-lg shadow-[#0e7a4a]/25">ثبت حل شکایت</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
