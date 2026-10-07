'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faMoney, faNum, formatJalaliShort } from '@/lib/jalali'
import { SectionCard, Pill, EmptyState, Labeled, KeyValue, SearchInput } from '@/components/app/ui-bits'
import { JalaliDatePicker } from '@/components/app/jalali-widgets'
import { Modal } from '@/components/views/Orders'
import { PeopleNetBar } from '@/components/app/PeopleNetBar'
import type { AppCtx } from '@/components/app/ui-bits'
import { Users, Factory, BookOpen, Plus, Pencil, Trash2, Phone, Mail, MapPin, Cake, Building2, Link2, History, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ───────────────── دفتر اشخاص (round-15 · تقسیم‌بندی round-19h) ─────────────────
 * یک مرجع واحد (SSOT) برای همهٔ اشخاصی که در رخدادهای سامانه ظاهر می‌شوند.
 * round-19h — تقسیم‌بندی دوخوشه‌ای به درخواست مالک:
 *   • «اشخاص حقوقی» → تولیدکنندگان (مدیریت همین‌جا) + تأمین‌کنندگان/پخش‌ها (لینک به نمای تأمین‌کنندگان)
 *   • «اشخاص حقیقی» → دفتر اشخاص (نماینده، راننده، بازرس…) + پرسنل فروشگاه (لینک به نمای پرسنل)
 * این نما هاب سازمانی است — CRUD هیچ مدلی تکرار نمی‌شود؛ فقط ورودیِ نماهای مدیریتی موجود.
 */

type Rep = {
  id: string; fullName: string; mobile: string; phone2: string; email: string; address: string
  birthday: string; kind: string; company: string; providerId: string; providerName: string
  jobRole: string; nationalId: string; notes: string; tags: string[]; active: boolean
  providerHistory: { providerName: string; from: string; to?: string }[]
  docCount?: number; lastSeen?: string; totalCollected?: number; eventCount?: number
}
type ProviderLite = { id: string; name: string }
type Manufacturer = {
  id: string; name: string; country: string; website: string; phone: string
  brands: string[]; notes: string; active: boolean
  providerCount: number; productCount: number; providers: { id: string; name: string }[]
}
type ProfileRes = {
  rep: Rep
  events: { id: string; kind: string; at: string; amount: number; note: string; docCode: string; docTitle: string }[]
  docs: { id: string; code: string; title: string; party: string; amount: number; docDate: string }[]
}

/** انواع شخص — با ایموجی برای تشخیص فوری در کارت‌ها */
const KINDS: Record<string, { label: string; emoji: string; color: string; nonProvider?: boolean }> = {
  REP: { label: 'نماینده فروش', emoji: '🧑‍💼', color: '#0e7a4a' },
  DRIVER: { label: 'راننده', emoji: '🚚', color: '#c96f4a' },
  ACCOUNTANT: { label: 'حسابدار', emoji: '🧾', color: '#8a6d10' },
  MANAGER: { label: 'مدیر', emoji: '🕴️', color: '#6d28d9' },
  CONTACT: { label: 'تماس', emoji: '📞', color: '#334155', nonProvider: true },
  INSPECTOR: { label: 'کارشناس بازرسی', emoji: '🔍', color: '#0f766e', nonProvider: true },
  LANDLORD: { label: 'مالک ملک', emoji: '🏠', color: '#a16207', nonProvider: true },
  OTHER: { label: 'سایر', emoji: '👤', color: '#6b7280', nonProvider: true },
}
const KIND_ORDER = ['REP', 'DRIVER', 'ACCOUNTANT', 'MANAGER', 'CONTACT', 'INSPECTOR', 'LANDLORD', 'OTHER']

const EVENT_LABELS: Record<string, string> = {
  DELIVERY: 'تحویل کالا', PAYMENT_POS: 'پرداخت POS', PAYMENT_CHEQUE: 'وصول چک', PAYMENT_CASH: 'پرداخت نقدی',
  PAYMENT_TRANSFER: 'کارت‌به‌کارت', RETURN: 'مرجوعی', REJECT: 'مردود', SHORTAGE: 'کسری',
  HOLOO_INVOICE: 'فاکتور هلو', HOLOO_RECEIPT: 'رسید هلو', NOTE: 'یادداشت',
}

type Tab = 'legal' | 'natural' | 'guide'

const MANAGE_ROLES = ['OWNER', 'GM', 'OM', 'ADMIN', 'ACC']
type RoleLite = { key: string; caps: string[]; active: boolean }

/* round-18-C: دفتر اشخاص + تأمین‌کنندگان با هم طراحی شده‌اند — نوار «شبکهٔ اشخاص» بالای هر دو.
 * round-19h: دو خوشهٔ اشخاص حقوقی / اشخاص حقیقی — هاب سازمانی، بدون تکرار CRUD */
export default function PeopleView({ ctx }: { ctx: AppCtx } & Record<string, unknown>) {
  const user = ctx.user
  const roleKeys = useMemo(
    () => (user ? Array.from(new Set([user.role, ...(user.secondaryRoles || [])])) : []),
    [user],
  )

  const [tab, setTab] = useState<Tab>('natural')
  const [roleMap, setRoleMap] = useState<Record<string, RoleLite>>({})

  const canManage = useMemo(() => {
    if (!user) return false
    if (MANAGE_ROLES.includes(user.role)) return true
    return roleKeys.some((k) => roleMap[k]?.caps?.includes('*') || roleMap[k]?.caps?.includes('people.manage'))
  }, [user, roleKeys, roleMap])

  const canMfg = useMemo(() => {
    if (!user) return false
    if (MANAGE_ROLES.includes(user.role) || user.role === 'ACC') return true
    return roleKeys.some((k) => roleMap[k]?.caps?.includes('*') || roleMap[k]?.caps?.includes('manufacturers.manage'))
  }, [user, roleKeys, roleMap])

  // ── deep-link شبکهٔ اشخاص (round-18-C) ──
  // navigate('people', repId) → خوشهٔ «اشخاص حقیقی» باز می‌شود و پروندهٔ همان شخص
  // خودکار بالا می‌آید (لینک «📇 پرونده در دفتر» از کارت تأمین‌کننده و نتایج PeopleNetBar).
  // الگوی رسمی «تنظیم state در رندر» — سازگار با قاعدهٔ set-state-in-effect.
  const [focusId, setFocusId] = useState('')
  const [lastParam, setLastParam] = useState('')
  if (ctx.param !== lastParam) {
    setLastParam(ctx.param)
    if (ctx.view === 'people' && ctx.param) {
      setFocusId(ctx.param)
      if (tab !== 'natural') setTab('natural')
    } else if (!ctx.param) {
      setFocusId('')
    }
  }

  useEffect(() => {
    api<{ roles: Array<{ key: string; active: boolean; permissions?: { caps?: string[] } }> }>('/api/roles')
      .then((d) => {
        const m: Record<string, RoleLite> = {}
        for (const r of d.roles || []) m[r.key] = { key: r.key, active: r.active, caps: r.permissions?.caps || [] }
        setRoleMap(m)
      })
      .catch(() => { /* fallback to role list above */ })
  }, [])

  return (
    <div className="space-y-4">
      {/* نوار مشترک شبکهٔ اشخاص — دفتر اشخاص + تأمین‌کنندگان + CRM (round-18-C) */}
      <PeopleNetBar active="people" ctx={ctx} />
      <div className="flex flex-wrap gap-2 rounded-2xl border border-[#8a5a2b]/25 bg-[#f7efe2] p-1.5" role="tablist" aria-label="خوشه‌های دفتر اشخاص">
        {([
          ['legal', <Building2 key="i" size={15} />, 'اشخاص حقوقی'],
          ['natural', <Users key="i" size={15} />, 'اشخاص حقیقی'],
          ['guide', <BookOpen key="i" size={15} />, 'راهنما'],
        ] as [Tab, React.ReactNode, string][]).map(([k, icon, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              'flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold transition',
              tab === k ? 'bg-white text-[#0e7a4a] shadow' : 'text-[#8a5a2b] hover:bg-white/60',
            )}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === 'legal' && <LegalCluster ctx={ctx} canMfg={canMfg} />}
      {tab === 'natural' && <NaturalCluster ctx={ctx} canManage={canManage} focusId={focusId} />}
      {tab === 'guide' && <GuideCard />}
    </div>
  )
}

/* ───────────────── کارت ورودی نماهای مدیریتی — هاب بدون تکرار CRUD (round-19h) ───────────────── */
function RegistryEntryCard({
  emoji, title, badges, subtitle, count, countLabel, cta, onClick,
}: {
  emoji: string; title: string; badges: string[]; subtitle: string
  count: number | null; countLabel: string; cta: string; onClick: () => void
}) {
  return (
    <div className="glow-card flex flex-col justify-between gap-3 rounded-2xl bg-white/85 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-black text-[#0b2e20]">
          <span className="text-base">{emoji}</span>
          {title}
          {badges.map((b) => (
            <Pill key={b} label={b} color="#8a5a2b" bg="rgba(201,162,39,0.15)" />
          ))}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{subtitle}</p>
        <p className="mt-1 text-[11px] font-extrabold text-[#0e7a4a]">
          {count === null ? '…' : `${faNum(count)} ${countLabel}`}
        </p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[44px] shrink-0 items-center gap-1.5 self-start rounded-xl bg-[#0e7a4a] px-4 text-xs font-extrabold text-white shadow transition hover:-translate-y-0.5 sm:self-auto"
      >
        {cta}
        <ChevronLeft size={14} />
      </button>
    </div>
  )
}

/* ───────────────── خوشهٔ اشخاص حقوقی — شرکت‌ها و نهادها (round-19h) ─────────────────
 * تولیدکنندگان این‌جا مدیریت می‌شوند؛ تأمین‌کنندگان/پخش‌ها پروندهٔ کاملشان در نمای
 * «تأمین‌کنندگان» است — با شمارش زنده لینک ورودی می‌دهیم، CRUD تکرار نمی‌شود. */
function LegalCluster({ ctx, canMfg }: { ctx: AppCtx; canMfg: boolean }) {
  const [providerCount, setProviderCount] = useState<number | null>(null)
  useEffect(() => {
    api<{ providers: { id: string }[] }>('/api/providers')
      .then((d) => setProviderCount((d.providers || []).length))
      .catch(() => setProviderCount(null))
  }, [])
  return (
    <div className="space-y-4">
      <RegistryEntryCard
        emoji="🚛"
        title="تأمین‌کنندگان و پخش‌ها"
        badges={['پخش', 'نماینده']}
        subtitle="پروندهٔ کامل هر پخش و نمایندگی (کالاها، سفارش‌ها، چک‌ها و امتیاز سلامت تأمین) در نمای تأمین‌کنندگان مدیریت می‌شود"
        count={providerCount}
        countLabel="تأمین‌کننده ثبت‌شده"
        cta="مدیریت تأمین‌کنندگان"
        onClick={() => ctx.navigate('providers')}
      />
      <ManufacturerBoard canManage={canMfg} />
    </div>
  )
}

/* ───────────────── خوشهٔ اشخاص حقیقی — آدم‌ها (round-19h) ─────────────────
 * دفتر اشخاص (نماینده، راننده، حسابدار شرکت، بازرس، مالک ملک…) همین‌جاست؛ پرسنل
 * فروشگاه پرونده‌اش در بخش نیروی انسانی است — لینک ورودی، بدون تکرار CRUD. */
function NaturalCluster({ ctx, canManage, focusId }: { ctx: AppCtx; canManage: boolean; focusId?: string }) {
  const [personnelCount, setPersonnelCount] = useState<number | null>(null)
  useEffect(() => {
    api<{ personnel: unknown[] }>('/api/personnel')
      .then((d) => setPersonnelCount((d.personnel || []).length))
      .catch(() => setPersonnelCount(null))
  }, [])
  return (
    <div className="space-y-4">
      <RegistryEntryCard
        emoji="🧑‍🏭"
        title="پرسنل فروشگاه"
        badges={['کارمند']}
        subtitle="پروندهٔ پرسنل به‌همراه شیفت‌ها، مرخصی و حقوق در بخش «نیروی انسانی» مدیریت می‌شود"
        count={personnelCount}
        countLabel="پرسنل ثبت‌شده"
        cta="مدیریت پرسنل"
        onClick={() => ctx.navigate('personnel')}
      />
      <RepDirectory canManage={canManage} ctx={ctx} focusId={focusId} />
    </div>
  )
}

/* ───────────────── دفتر نمایندگان و اشخاص ───────────────── */

function RepDirectory({ canManage, ctx, focusId }: { canManage: boolean; ctx: AppCtx; focusId?: string }) {
  const [reps, setReps] = useState<Rep[]>([])
  const [providers, setProviders] = useState<ProviderLite[]>([])
  const [q, setQ] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [loading, setLoading] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Rep | null>(null)
  const [profileId, setProfileId] = useState('')
  const [profile, setProfile] = useState<ProfileRes | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('all', '1')
      if (q.trim()) params.set('q', q.trim())
      if (kindFilter) params.set('kind', kindFilter)
      if (providerFilter) params.set('providerId', providerFilter)
      const d = await api<{ reps: Rep[] }>(`/api/sales-reps?${params}`)
      setReps(d.reps || [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [q, kindFilter, providerFilter])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    api<{ providers: ProviderLite[] }>('/api/providers').then((d) => setProviders(d.providers || [])).catch(() => { /* free-text still works */ })
  }, [])

  const openProfile = async (id: string) => {
    setProfile(null)
    setProfileId(id)
    try {
      setProfile(await api<ProfileRes>(`/api/sales-reps/${id}`))
    } catch (e: any) {
      toast.error(e.message)
      setProfileId('')
    }
  }

  // deep-link (round-18-C): با آمدن focusId از ناوبری، پروندهٔ شخص خودکار باز می‌شود.
  // الگوی «تنظیم state در رندر»؛ محدودیت شناخته‌شده: کلیک دوباره روی همان شخص بلافاصله
  // پس از بستن پرونده (بدون تعویض نما) دوباره باز نمی‌شود چون param ناوبری تغییری نمی‌کند.
  const [lastFocus, setLastFocus] = useState('')
  if (focusId && focusId !== lastFocus) {
    setLastFocus(focusId)
    openProfile(focusId)
  }

  const toggleActive = async (r: Rep) => {
    try {
      await api(`/api/sales-reps?id=${r.id}`, { method: 'PATCH', body: { active: !r.active } })
      toast.success(!r.active ? 'شخص فعال شد' : 'شخص غیرفعال شد (تاریخچه محفوظ ماند)')
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  const removeRep = async (r: Rep) => {
    if (!confirm(`حذف «${r.fullName}» از دفتر اشخاص؟ اگر رخداد ثبت‌شده داشته باشد، فقط غیرفعال می‌شود.`)) return
    try {
      const res = await api<{ mode: string; message?: string }>(`/api/sales-reps?id=${r.id}`, { method: 'DELETE' })
      if (res.mode === 'soft') toast.warning(res.message || 'شخص دارای رخداد است — غیرفعال شد', { duration: 7000 })
      else toast.success('شخص حذف شد')
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <>
      <SectionCard
        title="دفتر اشخاص — نمایندگان، راننده‌ها، بازرس‌ها و تماس‌های مهم"
        subtitle="ثبت یک‌بار، همیشه در تاریخچه — هر رخداد سند (تحویل، وصول چک، مرجوعی…) با نام شخص ثبت می‌شود"
        icon={<Users size={18} />}
        actions={canManage && (
          <button onClick={() => { setEditing(null); setFormOpen(true) }} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-white">
            <Plus size={14} /> شخص جدید
          </button>
        )}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="min-w-[180px] flex-1"><SearchInput value={q} onChange={setQ} placeholder="نام، شرکت، موبایل یا سمت…" /></div>
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="rounded-xl border border-input bg-white p-2 text-xs font-bold">
            <option value="">همهٔ انواع</option>
            {KIND_ORDER.map((k) => <option key={k} value={k}>{KINDS[k].emoji} {KINDS[k].label}</option>)}
          </select>
          <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className="max-w-[190px] rounded-xl border border-input bg-white p-2 text-xs font-bold">
            <option value="">همهٔ تأمین‌کنندگان</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="py-6 text-center text-xs font-bold text-muted-foreground">…در حال بارگذاری دفتر اشخاص</p>
        ) : reps.length === 0 ? (
          <EmptyState
            emoji="🧑‍💼"
            title="شخصی یافت نشد"
            hint="نمایندگان طرف‌حساب‌ها و اشخاص مهم (راننده، حسابدار شرکت، بازرس، مالک ملک) را یک‌بار ثبت کنید؛ سپس در اسناد و رخدادها فقط انتخاب می‌کنید"
          />
        ) : (
          <div className="scroll-gold grid max-h-[58vh] gap-2.5 overflow-y-auto pl-1 sm:grid-cols-2 lg:grid-cols-3">
            {reps.map((r) => {
              const meta = KINDS[r.kind] || KINDS.OTHER
              return (
                <div key={r.id} className={cn('glow-card rounded-2xl bg-white/85 p-3.5', !r.active && 'opacity-70')}>
                  <button type="button" onClick={() => openProfile(r.id)} className="w-full text-right">
                    <p className="flex items-center justify-between gap-2 text-sm font-black">
                      <span className="truncate">{meta.emoji} {r.fullName}</span>
                      {!r.active && <Pill label="غیرفعال" color="#6b7280" bg="#6b72801a" />}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Pill label={meta.label} color={meta.color} bg={`${meta.color}1a`} />
                      {r.providerName ? (
                        /* 🚛 لینک متقابل به کارت تأمین‌کننده (شبکهٔ اشخاص — round-18-C)؛
                           با providerId پارامتر ناوبری پر می‌شود تا کارت کالاهای همان تأمین‌کننده باز شود */
                        <span
                          role="button"
                          tabIndex={0}
                          title="رفتن به کارت این تأمین‌کننده در نمای تأمین‌کنندگان"
                          onClick={(e) => { e.stopPropagation(); ctx.navigate('providers', r.providerId || '') }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); ctx.navigate('providers', r.providerId || '') } }}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-[#c9a227]/15 px-2 py-0.5 text-[11px] font-bold text-[#8a5a2b] transition hover:bg-[#c9a227]/30"
                        >
                          🚛 {r.providerName}
                        </span>
                      ) : r.company
                        ? <span className="rounded-full bg-[#334155]/10 px-2 py-0.5 text-[10px] font-bold text-[#334155]">🏢 {r.company}</span>
                        : <span className="text-[10px] text-muted-foreground">بدون شرکت</span>}
                      {r.jobRole && <span className="text-[10px] font-bold text-muted-foreground">{r.jobRole}</span>}
                    </div>
                    {r.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.tags.map((t) => <span key={t} className="rounded-full bg-[#77934a]/15 px-2 py-0.5 text-[9px] font-black text-[#5c7236]">#{t}</span>)}
                      </div>
                    )}
                    <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px]">
                      <span className="rounded-lg bg-muted/60 px-1 py-1.5"><b className="block text-xs">{faNum(r.docCount || 0)}</b>سند</span>
                      <span className="rounded-lg bg-muted/60 px-1 py-1.5"><b className="block text-xs">{faNum(r.eventCount || 0)}</b>رخداد</span>
                      <span className="rounded-lg bg-muted/60 px-1 py-1.5"><b className="block text-xs" style={{ color: '#0e7a4a' }}>{faMoney(r.totalCollected || 0)}</b>وصولی (تومان)</span>
                    </div>
                    <p className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted-foreground">
                      {r.mobile
                        ? <a href={`tel:${r.mobile}`} onClick={(e) => e.stopPropagation()} className="rounded-md bg-[#0e7a4a]/10 px-2 py-1 font-black text-[#0e7a4a]" dir="ltr">📞 {faNum(r.mobile)}</a>
                        : <span>بدون موبایل</span>}
                      <span>آخرین رخداد: {r.lastSeen ? formatJalaliShort(r.lastSeen) : '—'}</span>
                    </p>
                  </button>
                  {canManage && (
                    <div className="mt-2 flex gap-1.5">
                      <button type="button" onClick={() => { setEditing(r); setFormOpen(true) }} className="flex-1 rounded-xl bg-[#c9a227]/15 py-2 text-[11px] font-black text-[#8a5a2b]">
                        ✏️ ویرایش
                      </button>
                      <button type="button" onClick={() => toggleActive(r)} className="flex-1 rounded-xl bg-[#0e7a4a]/10 py-2 text-[11px] font-black text-[#0e7a4a]">
                        {r.active ? '⏸ غیرفعال' : '▶️ فعال'}
                      </button>
                      <button type="button" onClick={() => removeRep(r)} className="rounded-xl bg-[#b3372f]/10 px-2.5 py-2 text-[11px] font-black text-[#b3372f]" title="حذف">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {formOpen && canManage && (
        <PersonFormModal
          rep={editing}
          onClose={() => { setFormOpen(false); setEditing(null) }}
          onSaved={() => { setFormOpen(false); setEditing(null); toast.success(editing ? 'شخص ویرایش شد' : 'شخص ثبت شد'); load() }}
        />
      )}

      {profileId && (
        <PersonProfileModal data={profile} onClose={() => { setProfileId(''); setProfile(null) }} />
      )}
    </>
  )
}

/** مودال ثبت/ویرایش شخص — همهٔ فیلدها (از نمای تأمین‌کنندگان هم با پیش‌پرکردن استفاده می‌شود) */
export function PersonFormModal({ rep, defaults, onClose, onSaved }: { rep: Rep | null; defaults?: Partial<Rep>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(() => ({
    fullName: rep?.fullName || defaults?.fullName || '', mobile: rep?.mobile || defaults?.mobile || '', phone2: rep?.phone2 || defaults?.phone2 || '',
    email: rep?.email || defaults?.email || '', address: rep?.address || defaults?.address || '', birthday: rep?.birthday || defaults?.birthday || '',
    kind: rep?.kind || defaults?.kind || 'REP', company: rep?.company || defaults?.company || '', providerId: rep?.providerId || defaults?.providerId || '',
    jobRole: rep?.jobRole || defaults?.jobRole || '', nationalId: rep?.nationalId || defaults?.nationalId || '', notes: rep?.notes || defaults?.notes || '',
  }))
  const [tags, setTags] = useState<string[]>(rep?.tags || defaults?.tags || [])
  const [tagInput, setTagInput] = useState('')
  const [providers, setProviders] = useState<ProviderLite[]>([])
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }))
  const nonProvider = KINDS[f.kind]?.nonProvider

  useEffect(() => {
    api<{ providers: ProviderLite[] }>('/api/providers')
      .then((d) => setProviders(d.providers || []))
      .catch(() => { /* free-text company still works */ })
  }, [])

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '')
    if (t && !tags.includes(t)) setTags((l) => [...l, t])
    setTagInput('')
  }

  const save = async () => {
    if (!f.fullName.trim()) return toast.error('نام شخص الزامی است')
    setBusy(true)
    try {
      const body = { ...f, tags, company: nonProvider ? f.company : undefined }
      if (rep) await api(`/api/sales-reps?id=${rep.id}`, { method: 'PATCH', body })
      else await api('/api/sales-reps', { method: 'POST', body })
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={rep ? `ویرایش شخص — ${rep.fullName}` : 'ثبت شخص جدید در دفتر'} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="نام و نام خانوادگی *"><input value={f.fullName} onChange={(e) => set('fullName', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
        <Labeled label="نوع شخص">
          <select value={f.kind} onChange={(e) => set('kind', e.target.value)} className="w-full rounded-xl border border-input bg-white px-2.5 py-2 text-[13px]">
            {KIND_ORDER.map((k) => <option key={k} value={k}>{KINDS[k].emoji} {KINDS[k].label}</option>)}
          </select>
        </Labeled>
        <Labeled label="موبایل"><input value={f.mobile} onChange={(e) => set('mobile', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" inputMode="tel" placeholder="0912…" /></Labeled>
        <Labeled label="تلفن دوم"><input value={f.phone2} onChange={(e) => set('phone2', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" /></Labeled>
        <Labeled label="ایمیل"><input value={f.email} onChange={(e) => set('email', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" inputMode="email" /></Labeled>
        <Labeled label="تاریخ تولد" hint="برای تبریک و هدیه — تقویم جلالی"><JalaliDatePicker value={f.birthday} onChange={(v) => set('birthday', v)} holidays={new Map()} compact /></Labeled>
        {nonProvider ? (
          <Labeled label="شرکت / نهاد متبوع" hint="برای این نوع شخص، شرکت آزاد تایپ می‌شود">
            <input value={f.company} onChange={(e) => set('company', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" placeholder="مثلاً: بازرسی استاندارد کرمان" />
          </Labeled>
        ) : (
          <Labeled label="تأمین‌کننده / شرکت" hint="از دفتر تأمین‌کنندگان انتخاب کنید — تغییر شرکت در سابقهٔ شخص ثبت می‌شود">
            <select value={f.providerId} onChange={(e) => set('providerId', e.target.value)} className="w-full rounded-xl border border-input bg-white px-2.5 py-2 text-[13px]">
              <option value="">— بدون شرکت —</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Labeled>
        )}
        <Labeled label="سمت شغلی (متن آزاد)"><input value={f.jobRole} onChange={(e) => set('jobRole', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" placeholder="مثلاً: ویزیتور منطقهٔ شرق" /></Labeled>
        <Labeled label="کد ملی"><input value={f.nationalId} onChange={(e) => set('nationalId', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" inputMode="numeric" /></Labeled>
        <Labeled label="آدرس"><input value={f.address} onChange={(e) => set('address', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
        <Labeled label="برچسب‌ها" hint="Enter بزنید تا اضافه شود — مثلاً: چک‌کش، خوش‌حساب">
          <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" />
        </Labeled>
        <Labeled label="یادداشت"><input value={f.notes} onChange={(e) => set('notes', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <button key={t} type="button" onClick={() => setTags((l) => l.filter((x) => x !== t))} className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold text-secondary-foreground">
              #{t} ×
            </button>
          ))}
        </div>
      )}
      <button onClick={save} disabled={busy} className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : rep ? 'ذخیرهٔ تغییرات' : 'ثبت شخص'}
      </button>
    </Modal>
  )
}

/** پروندهٔ شخص — اطلاعات کامل + سابقهٔ شرکت‌ها (read-only) + رخدادها */
function PersonProfileModal({ data, onClose }: { data: ProfileRes | null; onClose: () => void }) {
  if (!data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50" />
        <div className="glow-card rounded-2xl bg-card p-6 text-center text-xs font-bold text-muted-foreground">…در حال بازکردن پروندهٔ شخص</div>
      </div>
    )
  }
  const { rep, events, docs } = data
  const meta = KINDS[rep.kind] || KINDS.OTHER
  const totalCollected = events.filter((e) => e.kind.startsWith('PAYMENT')).reduce((s, e) => s + (Number(e.amount) || 0), 0)
  // گارد نوعی — tags/providerHistory ممکن است رشتهٔ JSON خام باشند (مقاوم در برابر پاس ناقص API)
  const safeTags: string[] = Array.isArray(rep.tags) ? rep.tags : []
  const safeHistory = Array.isArray(rep.providerHistory) ? rep.providerHistory : []
  return (
    <Modal title={`پروندهٔ شخص — ${rep.fullName}`} onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill label={`${meta.emoji} ${meta.label}`} color={meta.color} bg={`${meta.color}1a`} />
        {rep.providerName && <Pill label={rep.providerName} color="#8a5a2b" bg="#c9a227/15" />}
        {rep.company && <Pill label={`🏢 ${rep.company}`} color="#334155" bg="#3341551a" />}
        {!rep.active && <Pill label="غیرفعال" color="#6b7280" bg="#6b72801a" />}
        {safeTags.map((t) => <span key={t} className="rounded-full bg-[#77934a]/15 px-2 py-0.5 text-[10px] font-black text-[#5c7236]">#{t}</span>)}
      </div>

      <div className="grid gap-2 text-[11px] sm:grid-cols-2">
        <KeyValue k="موبایل" v={rep.mobile ? <span dir="ltr">{faNum(rep.mobile)}</span> : '—'} />
        <KeyValue k="تلفن دوم" v={rep.phone2 ? <span dir="ltr">{faNum(rep.phone2)}</span> : '—'} />
        <KeyValue k="ایمیل" v={rep.email ? <span dir="ltr">{rep.email}</span> : '—'} />
        <KeyValue k="کد ملی" v={rep.nationalId ? <span dir="ltr">{faNum(rep.nationalId)}</span> : '—'} />
        <KeyValue k="تاریخ تولد" v={rep.birthday ? formatJalaliShort(rep.birthday) : '—'} />
        <KeyValue k="سمت شغلی" v={rep.jobRole || '—'} />
        <div className="rounded-lg bg-muted/50 px-3 py-2 sm:col-span-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin size={12} /> آدرس</span>
          <span className="mt-0.5 block text-sm font-bold text-foreground">{rep.address || '—'}</span>
        </div>
        {rep.notes && (
          <div className="rounded-lg bg-muted/50 px-3 py-2 sm:col-span-2">
            <span className="text-xs text-muted-foreground">یادداشت</span>
            <span className="mt-0.5 block text-sm font-bold text-foreground">{rep.notes}</span>
          </div>
        )}
      </div>

      {/* سابقهٔ شرکت‌ها — append-only، هرگز پاک نمی‌شود */}
      <p className="mb-2 mt-4 flex items-center gap-1.5 text-xs font-black text-[#8a5a2b]">
        <History size={13} /> سابقهٔ شرکت‌ها (تاریخچهٔ ماندگار)
      </p>
      {safeHistory.length === 0 && !rep.providerName ? (
        <p className="rounded-xl bg-muted/50 p-3 text-[11px] text-muted-foreground">هنوز سابقهٔ شرکتی ثبت نشده است.</p>
      ) : (
        <div className="space-y-1.5">
          {rep.providerName && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f3f6ec] p-2.5">
              <span className="text-[11px] font-black text-[#0e7a4a]">🏢 {rep.providerName} — شرکت فعلی</span>
              <span className="text-[10px] text-muted-foreground">از {rep.providerHistory.length ? formatJalaliShort(rep.providerHistory[rep.providerHistory.length - 1].to || rep.providerHistory[rep.providerHistory.length - 1].from) : 'ابتدا'} تا امروز</span>
            </div>
          )}
          {[...rep.providerHistory].reverse().map((h, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 p-2.5">
              <span className="text-[11px] font-bold">🏢 {h.providerName}</span>
              <span className="text-[10px] text-muted-foreground">{formatJalaliShort(h.from)} ← {h.to ? formatJalaliShort(h.to) : '—'}</span>
            </div>
          ))}
        </div>
      )}

      {/* آمار + رخدادها */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px]">
        <span className="rounded-xl bg-muted/60 px-2 py-2"><b className="block text-sm">{faNum(rep.docCount || docs.length)}</b>سند مرتبط</span>
        <span className="rounded-xl bg-muted/60 px-2 py-2"><b className="block text-sm">{faNum(events.length)}</b>رخداد ثبت‌شده</span>
        <span className="rounded-xl bg-muted/60 px-2 py-2"><b className="block text-sm" style={{ color: '#0e7a4a' }}>{faMoney(totalCollected)}</b>مجموع وصولی (تومان)</span>
      </div>
      <p className="mb-2 mt-4 flex items-center gap-1.5 text-xs font-black text-[#8a5a2b]"><Phone size={13} /> رخدادهای سند این شخص</p>
      {events.length === 0 ? (
        <p className="rounded-xl bg-muted/50 p-3 text-[11px] text-muted-foreground">هنوز رخدادی برای این شخص ثبت نشده است — با نخستین تحویل/پرداخت/مرجوعی، اینجا پر می‌شود.</p>
      ) : (
        <div className="scroll-gold max-h-64 space-y-1.5 overflow-y-auto pl-1">
          {events.map((e) => (
            <div key={e.id} className="rounded-xl bg-white/85 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-black text-[#0e7a4a]">{EVENT_LABELS[e.kind] || e.kind}{e.amount > 0 && <span className="mr-2">{faMoney(e.amount)} تومان</span>}</p>
                <span className="rounded-md bg-[#8a5a2b]/10 px-2 py-0.5 text-[9px] font-black text-[#8a5a2b]">{formatJalaliShort(e.at)}</span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                {e.docCode && <span className="rounded-md bg-[#c9a227]/15 px-1.5 py-0.5 font-black text-[#8a5a2b]" dir="ltr">{e.docCode}</span>}
                {e.docTitle && <span>{e.docTitle}</span>}
                {e.note && <span>— {e.note}</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

/* ───────────────── تولیدکنندگان ───────────────── */

function ManufacturerBoard({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<Manufacturer[]>([])
  const [providers, setProviders] = useState<ProviderLite[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Manufacturer | null>(null)
  const [assignFor, setAssignFor] = useState<Manufacturer | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [m, p] = await Promise.all([
        api<{ manufacturers: Manufacturer[] }>('/api/manufacturers'),
        api<{ providers: ProviderLite[] }>('/api/providers'),
      ])
      setRows(m.manufacturers || [])
      setProviders(p.providers || [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const removeMfg = async (m: Manufacturer) => {
    if (!confirm(`حذف تولیدکنندهٔ «${m.name}»؟`)) return
    try {
      await api(`/api/manufacturers/${m.id}`, { method: 'DELETE' })
      toast.success('تولیدکننده حذف شد')
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  const filtered = rows.filter((m) => !q.trim() || m.name.includes(q.trim()) || m.brands.some((b) => b.includes(q.trim())))

  return (
    <>
      <SectionCard
        title="تولیدکنندگان — رکورد مادر زنجیرهٔ تأمین"
        subtitle="تولیدکننده را یک‌بار با برندهایش ثبت کنید؛ سپس تأمین‌کنندگان/پخش‌ها را به او وصل کنید تا معلوم شود چه کسی محصولاتش را پشتیبانی می‌کند"
        icon={<Factory size={18} />}
        actions={canManage && (
          <button onClick={() => { setEditing(null); setFormOpen(true) }} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-white">
            <Plus size={14} /> تولیدکنندهٔ جدید
          </button>
        )}
      >
        <div className="mb-3"><SearchInput value={q} onChange={setQ} placeholder="نام تولیدکننده یا برند…" /></div>
        {loading ? (
          <p className="py-6 text-center text-xs font-bold text-muted-foreground">…در حال بارگذاری تولیدکنندگان</p>
        ) : filtered.length === 0 ? (
          <EmptyState emoji="🏭" title="تولیدکننده‌ای ثبت نشده" hint="مثلاً «کاله»، «میهن»، «گلدیس» را با برندهایشان ثبت کنید و پخش‌هایشان را وصل کنید" />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((m) => (
              <div key={m.id} className={cn('glow-card rounded-2xl bg-white/85 p-3.5', !m.active && 'opacity-70')}>
                <div className="flex items-start justify-between gap-2">
                  <button type="button" className="min-w-0 text-right" onClick={() => setAssignFor(m)}>
                    <p className="truncate text-sm font-black">🏭 {m.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{m.country || 'ایران'}{m.phone ? ` • ${faNum(m.phone)}` : ''}</p>
                  </button>
                  {canManage && (
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => { setEditing(m); setFormOpen(true) }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" title="ویرایش"><Pencil size={13} /></button>
                      <button onClick={() => removeMfg(m)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-[#fee2e2] hover:text-[#b3372f]" title="حذف"><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.brands.length === 0
                    ? <span className="text-[10px] text-muted-foreground">برندی ثبت نشده</span>
                    : m.brands.map((b) => <span key={b} className="rounded-full bg-[#c9a227]/15 px-2 py-0.5 text-[10px] font-black text-[#8a5a2b]">{b}</span>)}
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                  <button type="button" onClick={() => setAssignFor(m)} className="flex items-center gap-1 rounded-lg bg-[#0e7a4a]/10 px-2 py-1 font-black text-[#0e7a4a]">
                    <Link2 size={11} /> {faNum(m.providerCount)} تأمین‌کننده
                  </button>
                  <span>{faNum(m.productCount)} قلم کالا (بر پایهٔ برندها)</span>
                </div>
                {m.providers.length > 0 && (
                  <p className="mt-1.5 truncate text-[10px] text-muted-foreground" title={m.providers.map((p) => p.name).join('، ')}>
                    🔗 {m.providers.map((p) => p.name).join('، ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {formOpen && canManage && (
        <ManufacturerFormModal
          mfg={editing}
          onClose={() => { setFormOpen(false); setEditing(null) }}
          onSaved={() => { setFormOpen(false); setEditing(null); toast.success(editing ? 'تولیدکننده ویرایش شد' : 'تولیدکننده ثبت شد'); load() }}
        />
      )}

      {assignFor && canManage && (
        <AssignProvidersModal
          mfg={assignFor}
          providers={providers}
          onClose={() => setAssignFor(null)}
          onSaved={() => { setAssignFor(null); toast.success('اتصال تأمین‌کنندگان به‌روز شد'); load() }}
        />
      )}
    </>
  )
}

function ManufacturerFormModal({ mfg, onClose, onSaved }: { mfg: Manufacturer | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: mfg?.name || '', country: mfg?.country || 'ایران', website: mfg?.website || '', phone: mfg?.phone || '', notes: mfg?.notes || '' })
  const [brands, setBrands] = useState<string[]>(mfg?.brands || [])
  const [brandInput, setBrandInput] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }))

  const addBrand = () => {
    const b = brandInput.trim()
    if (b && !brands.includes(b)) setBrands((l) => [...l, b])
    setBrandInput('')
  }

  const save = async () => {
    if (!f.name.trim()) return toast.error('نام تولیدکننده الزامی است')
    setBusy(true)
    try {
      if (mfg) await api(`/api/manufacturers/${mfg.id}`, { method: 'PATCH', body: { ...f, brands } })
      else await api('/api/manufacturers', { method: 'POST', body: { ...f, brands } })
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={mfg ? `ویرایش تولیدکننده — ${mfg.name}` : 'ثبت تولیدکنندهٔ جدید'} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="نام تولیدکننده *"><input value={f.name} onChange={(e) => set('name', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" placeholder="مثلاً: کارtière پگاه" /></Labeled>
        <Labeled label="کشور"><input value={f.country} onChange={(e) => set('country', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
        <Labeled label="وب‌سایت"><input value={f.website} onChange={(e) => set('website', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" placeholder="example.ir" /></Labeled>
        <Labeled label="تلفن"><input value={f.phone} onChange={(e) => set('phone', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" dir="ltr" /></Labeled>
        <Labeled label="برندها" hint="نام برند + Enter — با برندِ کالاها تطبیق داده می‌شود تا تعداد محصولات شمرده شود">
          <input value={brandInput} onChange={(e) => setBrandInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBrand() } }} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" placeholder="مثلاً: پگاه" />
        </Labeled>
        <Labeled label="یادداشت"><input value={f.notes} onChange={(e) => set('notes', e.target.value)} className="w-full rounded-xl border border-input px-2.5 py-2 text-[13px]" /></Labeled>
      </div>
      {brands.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {brands.map((b) => (
            <button key={b} type="button" onClick={() => setBrands((l) => l.filter((x) => x !== b))} className="rounded-full bg-[#c9a227]/15 px-2.5 py-1 text-[10px] font-black text-[#8a5a2b]">
              {b} ×
            </button>
          ))}
        </div>
      )}
      <button onClick={save} disabled={busy} className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : mfg ? 'ذخیرهٔ تغییرات' : 'ثبت تولیدکننده'}
      </button>
    </Modal>
  )
}

/** اتصال/جداکردن تأمین‌کنندگان به تولیدکننده (multi-select) */
function AssignProvidersModal({ mfg, providers, onClose, onSaved }: { mfg: Manufacturer; providers: ProviderLite[]; onClose: () => void; onSaved: () => void }) {
  const [selected, setSelected] = useState<string[]>(mfg.providers.map((p) => p.id))
  const [busy, setBusy] = useState(false)
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const save = async () => {
    setBusy(true)
    try {
      await api(`/api/manufacturers/${mfg.id}`, { method: 'PATCH', body: { action: 'assign-providers', providerIds: selected } })
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`تأمین‌کنندگان ${mfg.name}`} onClose={onClose} wide>
      <p className="rounded-xl bg-[#fdf6dd] p-3 text-[11px] font-bold text-[#8a5a2b]">
        <Building2 size={13} className="ml-1 inline" />
        هر تأمین‌کننده/پخش را که محصولات این تولیدکننده را پشتیبانی می‌کند، علامت بزنید — تغییرات در یک فراخوان ذخیره می‌شود.
      </p>
      {providers.length === 0 ? (
        <EmptyState emoji="🚛" title="تأمین‌کننده‌ای ثبت نشده" hint="ابتدا از نمای «تأمین‌کنندگان» پخش‌ها را ثبت کنید" />
      ) : (
        <div className="scroll-gold max-h-[42vh] space-y-1.5 overflow-y-auto pl-1">
          {providers.map((p) => {
            const on = selected.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-xl bg-white/85 p-2.5 text-right transition hover:shadow-sm',
                  on && 'ring-2 ring-[#0e7a4a]/60',
                )}
              >
                <span className="text-xs font-black">{p.name}</span>
                <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-black', on ? 'bg-[#0e7a4a] text-white' : 'bg-muted text-muted-foreground')}>
                  {on ? '✓ متصل' : 'غیرمتصل'}
                </span>
              </button>
            )
          })}
        </div>
      )}
      <button onClick={save} disabled={busy} className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : `ذخیره (${faNum(selected.length)} تأمین‌کننده متصل)`}
      </button>
    </Modal>
  )
}

/* ───────────────── راهنما ───────────────── */

function GuideCard() {
  return (
    <SectionCard
      title="راهنمای دفتر اشخاص و تولیدکنندگان"
      subtitle="چرا یک مرجع واحد (SSOT) برای اشخاص و تولیدکنندگان داریم؟"
      icon={<BookOpen size={18} />}
    >
      <div className="grid gap-3 text-[12px] leading-relaxed sm:grid-cols-2">
        <div className="rounded-2xl bg-[#f3f6ec] p-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-black text-[#0e7a4a]"><Users size={15} /> دفتر اشخاص — ثبت یک‌بار، همیشه در تاریخچه</p>
          <p className="text-muted-foreground">
            هر شخص (نماینده، راننده، حسابدار شرکت، کارشناس بازرسی، مالک ملک و…) فقط یک‌بار تعریف می‌شود.
            بعد از آن، در هر سند و رخداد (تحویل، وصول چک، پرداخت POS، مرجوعی و مردودی) فقط «انتخاب» می‌کنید.
            رخدادها به شخص وصل می‌مانند — حتی اگر سال‌ها بگذرد یا او شرکت را عوض کند؛ سابقهٔ شرکت‌های قبلی هم
            به‌صورت ماندگار (append-only) نگه‌داری می‌شود. اشخاصی که رخداد ثبت‌شده دارند حذف سخت نمی‌شوند؛ فقط غیرفعال می‌شوند تا تاریخچه سالم بماند.
          </p>
        </div>
        <div className="rounded-2xl bg-[#fdf6dd] p-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-black text-[#8a5a2b]"><Factory size={15} /> تولیدکنندگان — مادرِ زنجیرهٔ تأمین</p>
          <p className="text-muted-foreground">
            تولیدکننده (مثلاً «کاله» یا «پگاه») رکورد مادر است: برندهایش را ثبت می‌کنید و سپس پخش‌ها/تأمین‌کنندگانی
            که محصولاتش را پشتیبانی می‌کنند را به او وصل می‌کنید. تعداد کالاهای هر تولیدکننده از تطبیق برندها
            با کالاهای سامانه شمرده می‌شود — پس همیشه معلوم است چه شرکتی چه محصولاتی را پشتیبانی می‌کند.
          </p>
        </div>
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-black"><Building2 size={15} /> اشخاص حقوقی در برابر اشخاص حقیقی</p>
          <p className="text-muted-foreground">
            از round-۱۹ دفتر اشخاص دو خوشه دارد: «اشخاص حقوقی» (شرکت‌ها و نهادها: تولیدکنندگان و لینک به تأمین‌کنندگان/پخش‌ها)
            و «اشخاص حقیقی» (آدم‌ها: نمایندگان، راننده‌ها، بازرس‌ها و لینک به پرسنل فروشگاه) — هر گروه، مدیریتِ خودش را یک‌جا دارد.
          </p>
        </div>
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <p className="mb-1.5 text-sm font-black">🚚 نمایندگان هر تأمین‌کننده</p>
          <p className="text-muted-foreground">
            در نمای «تأمین‌کنندگان»، کارت هر پخش بخش «نمایندگان» دارد: فهرست اشخاصی که به همان تأمین‌کننده وصل‌اند
            + دکمهٔ سریع «افزودن نماینده». نمایندهٔ هر تأمین‌کننده فقط یک‌بار تعریف می‌شود و در همهٔ سفارش‌ها و
            اسناد آرشیو همان‌جا انتخاب می‌شود.
          </p>
        </div>
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-black"><Cake size={15} /> اطلاعات تماس و مناسبت‌ها</p>
          <p className="text-muted-foreground">
            موبایل، تلفن دوم، ایمیل، آدرس، کد ملی و تاریخ تولد هر شخص ثبت می‌شود؛ تاریخ تولد برای تبریک و هدیه
            (در تقویم جلالی) استفاده می‌شود و برچسب‌ها (مثل «چک‌کش» یا «خوش‌حساب») فهرست را قابل فیلتر می‌کنند.
          </p>
        </div>
      </div>
    </SectionCard>
  )
}
