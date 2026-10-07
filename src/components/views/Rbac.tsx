'use client'

/**
 * نقش‌ها و دسترسی‌ها (RBAC) — ساخت نقش سفارشی (مثل «مسئول شبکه‌های اجتماعی»)،
 * تخصیص چند نقش به یک نفر، ویرایش بخش‌های قابل دسترس و دسترسی‌های عملیاتی.
 * نقش‌های اجرایی (مالک/مدیر کل/مدیر عملیات/مدیر سامانه) همیشه به همه‌جا دسترسی دارند.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faNum } from '@/lib/jalali'
import { Avatar, EmptyState, Labeled, Pill, SectionCard, type AppCtx } from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import { CAPS, ROLE_LABELS, SECONDARY_LABELS, VIEW_ACCESS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Info, ChevronDown, Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react'

const EMERALD = '#0e7a4a'
const GOLD = '#c9a227'
const TERRA = '#c96f4a'
const OLIVE = '#77934a'
const ROSE = '#b3372f'
const SWATCHES = [EMERALD, GOLD, TERRA, OLIVE, ROSE, '#334155']
const RBAC_GUARD = ['OM', 'GM', 'OWNER', 'ADMIN', 'IT']

/** گروه محافظت‌شدهٔ مدیران سامانه — همیشه فعال، قابل حذف/محدودسازی نیست (exec bypass) */
const ADMIN_GROUP: { key: string; formal: string; en: string; note: string }[] = [
  { key: 'ADMIN', formal: 'مدیر سامانهٔ کسب‌وکار', en: 'Business System Admin', note: 'مدیریت کسب‌وکار روی سامانه — عضو پیش‌فرض گروه' },
  { key: 'OWNER', formal: 'مالک', en: 'Owner', note: 'مالک کسب‌وکار — به‌هیچ‌وجه قابل محدودکردن نیست' },
  { key: 'GM', formal: 'مدیرکل', en: 'General Manager', note: 'مدیر کل سازمان — عضو پیش‌فرض گروه' },
  { key: 'IT', formal: 'مدیر فناوری اطلاعات', en: 'IT Manager', note: 'مدیریت فنی و زیرساخت سامانه' },
]
const ADMIN_GROUP_KEYS = ADMIN_GROUP.map((g) => g.key)

/** نام رسمی فارسی نقش‌ها + نام آشنای زنجیرهٔ فروشگاه (عنوان اصلی = رسمی، زیرنویس = نام آشنا) */
const ROLE_TITLE: Record<string, { formal: string; alias?: string }> = {
  OWNER: { formal: 'مالک', alias: 'مالک' },
  GM: { formal: 'مدیرکل', alias: 'مدیر کل' },
  OM: { formal: 'مدیر عملیات' },
  PM: { formal: 'مدیر محصول' },
  ACC: { formal: 'کارشناس ارشد حسابداری', alias: 'حسابدار ارشد' },
  HC: { formal: 'کارشناس سرصندوق', alias: 'سرصندوقدار' },
  CASHIER: { formal: 'کارشناس صندوق', alias: 'صندوقدار' },
  SK: { formal: 'انباردار', alias: 'مسئول انبار' },
  MERCH: { formal: 'کارشناس چیدمان', alias: 'چیدمان‌دار' },
  SALES: { formal: 'کارشناس فروش', alias: 'فروشنده' },
  IT: { formal: 'مدیر فناوری اطلاعات', alias: 'IT' },
  ADMIN: { formal: 'مدیر سامانهٔ کسب‌وکار', alias: 'root' },
}

/** برچسب فارسی بخش‌ها — از کلیدهای VIEW_ACCESS */
const VIEW_LABELS: Record<string, string> = {
  dashboard: 'داشبورد',
  orders: 'سفارش‌ها',
  receiving: 'دریافت مرسوله',
  verify: 'تأیید انبار',
  accounting: 'حسابداری و هلو',
  products: 'کالاها',
  providers: 'تأمین‌کنندگان',
  cheques: 'چک‌ها',
  archive: 'آرشیو اسناد',
  zonecount: 'شمارش زون',
  leaves: 'مرخصی',
  tasks: 'وظایف',
  sop: 'روال‌ها',
  wall: 'دیجیتال‌وال',
  messages: 'پیام‌ها',
  notes: 'یادداشت',
  feedback: 'بازخورد',
  planogram: 'پلانوگرام',
  sales: 'فروش',
  perf: 'عملکرد',
  admin: 'مدیریت سامانه',
  notifs: 'اعلان‌ها',
  briefing: 'صبح‌نامه',
  reports: 'گزارش‌ها',
  pricecheck: 'کنترل قیمت',
  science: 'جعبه‌ابزار علمی',
  research: 'پژوهش',
  demo: 'استودیوی دمو',
  crm: 'CRM مشتریان',
  personnel: 'مدیریت پرسنل',
  rbac: 'نقش‌ها',
  urgent: 'پرسش‌های فوری',
  data: 'مدیریت داده‌ها',
  kb: 'دانشنامه',
  help: 'راهنما',
}

type RoleRow = {
  id: string
  key: string
  name: string
  category: string
  description: string
  color: string
  builtin: boolean
  active: boolean
  permissions: { views: string[]; caps: string[] }
}

type UserRow = {
  id: string
  name: string
  username: string
  role: string
  secondaryRoles: string[]
  roleIds: string[]
  color: string
  active: boolean
  points: number
}

type Editor = {
  id?: string
  key?: string
  keyInput: string
  name: string
  category: string
  color: string
  description: string
  views: string[]
  caps: string[]
  active: boolean
  builtin: boolean
}

const inputCls = 'w-full rounded-xl border border-input bg-white/90 px-3.5 py-2.5 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20'

function emptyEditor(): Editor {
  return { keyInput: '', name: '', category: '', color: OLIVE, description: '', views: [], caps: [], active: true, builtin: false }
}

/** کلید لاتین برای نقش سفارشی — از نام اگر لاتین داشت، وگرنه خالی (کاربر باید وارد کند) */
function latinKey(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function Chip({ label, checked, color, onClick, disabled }: { label: React.ReactNode; checked: boolean; color: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-xl border px-3 py-2 text-xs font-bold transition-all active:scale-95 disabled:opacity-50',
        checked ? 'border-transparent text-white shadow-md' : 'border-border bg-card text-muted-foreground hover:border-[#0e7a4a]/40'
      )}
      style={checked ? { background: color } : undefined}
    >
      {checked && <CheckIcon />} {label}
    </button>
  )
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" className="inline align-[-1px]">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export default function RbacView({ ctx }: { ctx: AppCtx }) {
  const [tab, setTab] = useState<'roles' | 'users'>('roles')
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [saving, setSaving] = useState(false)
  const [armDelete, setArmDelete] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [manageId, setManageId] = useState<string | null>(null)
  const [manageForm, setManageForm] = useState({ role: '', secondaryRoles: [] as string[], pin: '', color: EMERALD, active: true })

  const user = ctx.user
  const rawRoleIds = (user as unknown as { roleIds?: string | string[] } | null)?.roleIds
  const myRoleIds: string[] = Array.isArray(rawRoleIds)
    ? rawRoleIds
    : typeof rawRoleIds === 'string'
      ? (() => {
          try {
            return JSON.parse(rawRoleIds || '[]')
          } catch {
            return []
          }
        })()
      : []
  const myKeys = useMemo(
    () => Array.from(new Set([...(user ? [user.role] : []), ...(user?.secondaryRoles || []), ...myRoleIds])),
    [user, myRoleIds]
  )
  const allowed = useMemo(() => myKeys.some((k) => RBAC_GUARD.includes(k)), [myKeys])

  const load = useCallback(async () => {
    try {
      const [r, u] = await Promise.all([
        api<{ roles: RoleRow[] }>('/api/roles'),
        api<{ users: UserRow[] }>('/api/users'),
      ])
      setRoles(r.roles || [])
      setUsers(u.users || [])
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const roleByKey = useMemo(() => new Map(roles.map((r) => [r.key, r])), [roles])
  const categories = useMemo(() => Array.from(new Set(roles.map((r) => r.category).filter(Boolean))), [roles])
  const grouped = useMemo(() => {
    const m = new Map<string, RoleRow[]>()
    for (const r of roles) {
      const cat = r.category || 'عمومی'
      if (!m.has(cat)) m.set(cat, [])
      m.get(cat)!.push(r)
    }
    return Array.from(m.entries())
  }, [roles])

  const managed = manageId ? users.find((u) => u.id === manageId) || null : null

  /** شمار اعضای هر نقش: نقش اصلی + نقش‌های ثانویه + نقش‌های چندگانه (roleIds) */
  const countMembers = (key: string) =>
    users.filter((u) => u.role === key || (u.secondaryRoles || []).includes(key) || (u.roleIds || []).includes(key)).length
  const adminMemberCount = users.filter(
    (u) => ADMIN_GROUP_KEYS.some((k) => u.role === k || (u.secondaryRoles || []).includes(k) || (u.roleIds || []).includes(k)),
  ).length

  /* ── ذخیرهٔ نقش (ایجاد/ویرایش) ── */
  const saveRole = async () => {
    if (!editor) return
    if (!editor.name.trim()) {
      toast.error('نام نقش الزامی است')
      return
    }
    setSaving(true)
    const payload = {
      name: editor.name.trim(),
      category: editor.category.trim() || 'سفارشی',
      color: editor.color,
      description: editor.description.trim(),
      views: editor.views,
      caps: editor.caps,
    }
    try {
      if (editor.id) {
        await api('/api/roles', { method: 'PATCH', body: { id: editor.id, ...payload, active: editor.active } })
        toast.success('نقش به‌روزرسانی شد ✓')
      } else {
        // کلید لاتین لازم است (نام فارسی به‌تنهایی کلید نمی‌شود) — از فیلد اختصاصی یا حروف لاتینِ نام
        const key = latinKey(editor.keyInput) || latinKey(editor.name)
        if (!key) {
          toast.error('یک کلید لاتین کوتاه برای نقش بنویسید — مثلاً SOCIAL_MEDIA')
          setSaving(false)
          return
        }
        await api('/api/roles', { method: 'POST', body: { ...payload, key } })
        toast.success(`نقش جدید ساخته شد 🌿 (custom_${key})`)
      }
      setEditor(null)
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const deleteRole = async (r: { id: string; name: string }) => {
    try {
      await api(`/api/roles?id=${r.id}`, { method: 'DELETE' })
      toast.success('نقش حذف شد')
      setEditor(null)
      setArmDelete(false)
      await load()
    } catch (e) {
      toast.error((e as Error).message)
      setArmDelete(false)
    }
  }

  /* ── تخصیص/برداشتن نقش از کاربر (فوری) ── */
  const toggleUserRole = async (u: UserRow, roleKey: string, assign: boolean) => {
    try {
      await api('/api/roles', { method: 'PUT', body: { userId: u.id, roleKey, assign } })
      toast.success(assign ? 'نقش تخصیص یافت ✓' : 'نقش برداشته شد')
      await load()
      setManageForm((f) => ({ ...f }))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /* ── ذخیرهٔ فرم کاربر (نقش اصلی/ثانویه/PIN/رنگ/فعال) ── */
  const saveUser = async () => {
    if (!managed) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        role: manageForm.role,
        secondaryRoles: manageForm.secondaryRoles,
        color: manageForm.color,
        active: manageForm.active,
      }
      if (manageForm.pin) body.pin = manageForm.pin.replace(/\D/g, '')
      await api(`/api/users/${managed.id}`, { method: 'PATCH', body })
      toast.success('کاربر به‌روزرسانی شد ✓')
      setManageId(null)
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!allowed) {
    return (
      <div className="space-y-4">
        <SectionCard title="گروه‌های کاربری و نقش‌ها" icon={<Lock size={18} />}>
          <EmptyState emoji="🔒" title="دسترسی محدود" hint="مدیریت نقش‌ها فقط برای مدیر عملیات، مدیر کل، مالک و مدیر فناوری اطلاعات باز است. با مدیریت سامانه هماهنگ کنید." />
        </SectionCard>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="glow-card h-28 animate-pulse rounded-2xl bg-card" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glow-card h-36 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* سربرگ */}
      <SectionCard
        title="گروه‌های کاربری و نقش‌ها"
        subtitle="گروه مدیران سامانه همیشه بالای ساختار است؛ نقش بسازید، به همکاران تخصیص دهید — یک نفر می‌تواند چند نقش داشته باشد و دسترسی‌ها جمع می‌شوند."
        icon={<ShieldCheck size={20} />}
        actions={
          <button
            type="button"
            onClick={() => {
              setArmDelete(false)
              setEditor(emptyEditor())
            }}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-primary/90 active:scale-95"
          >
            <Plus size={16} /> نقش جدید
          </button>
        }
      >
        <div className="flex items-start gap-2 rounded-xl border border-[#e9b90c]/50 bg-[#fdf6dd] px-3.5 py-3 text-xs font-bold leading-relaxed text-[#8a6d10]">
          <Info size={15} className="mt-0.5 shrink-0" />
          گروه «مدیران سامانه» (مالک، مدیرکل، مدیر فناوری اطلاعات، مدیر سامانهٔ کسب‌وکار و حساب مدیر ارشد سامانه) همیشه فعال است و قابل حذف یا محدودکردن نیست.
        </div>
      </SectionCard>

      {/* تب‌ها */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'roles' as const, label: 'گروه‌ها و نقش‌ها', icon: <ShieldCheck size={15} /> },
          { key: 'users' as const, label: 'کاربران', icon: <Users size={15} /> },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-all active:scale-95',
              tab === t.key ? 'bg-[#0b2e20] text-white shadow-md' : 'border border-border bg-card text-muted-foreground hover:border-[#0e7a4a]/40'
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── تب گروه‌ها و نقش‌ها ── */}
      {tab === 'roles' && (
        <div className="space-y-5">
          {/* گروه محافظت‌شدهٔ مدیران سامانه — همیشه بالای فهرست؛ قابل حذف، غیرفعال‌سازی یا محدودسازی نیست */}
          <div className="overflow-hidden rounded-2xl border-2 border-[#c9a227]/60 bg-gradient-to-l from-[#0b2e20] to-[#11563a] shadow-md">
            <button type="button" onClick={() => setAdminOpen((v) => !v)} className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-right" aria-expanded={adminOpen}>
              <span className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c9a227]/20 text-[#e9c64a]">
                  <ShieldCheck size={20} />
                </span>
                <span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-black text-white">مدیران سامانه (Administrators)</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#b3372f]/25 px-2 py-0.5 text-[9px] font-black text-[#ffd9d6] ring-1 ring-[#b3372f]/50">
                      <Lock size={10} /> قفل‌شده — همیشه فعال
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[10px] text-[#93c572]">
                    گروه اجرایی محافظت‌شده — {faNum(adminMemberCount)} عضو در فهرست کاربران (+ حساب مدیر ارشد سامانه که همیشه عضو است)
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-1 text-[10px] font-black text-[#e9c64a]">
                {adminOpen ? 'بستن جزئیات' : 'اعضا و توضیح'}
                <ChevronDown size={14} className={cn('transition-transform', adminOpen && 'rotate-180')} />
              </span>
            </button>
            {adminOpen && (
              <div className="fade-in-up border-t border-[#c9a227]/30 bg-white/95 px-4 py-3">
                <p className="rounded-xl bg-[#fdf6dd] p-2.5 text-[11px] font-bold leading-relaxed text-[#8a6d10]">
                  🔐 این گروه <b>قابل حذف، غیرفعال‌سازی یا محدودکردن نیست</b> — نقش‌های عضو به‌صورت سیستمی از همهٔ محدودیت‌های دسترسی عبور می‌کنند (exec bypass) و مالک را نمی‌توان محدود کرد.
                </p>
                <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                  <li className="flex items-center justify-between gap-2 rounded-xl border border-[#0b2e20]/30 bg-[#0b2e20]/5 px-2.5 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-black text-foreground">مدیر ارشد سامانه</span>
                      <span dir="ltr" className="block text-right text-[9px] font-bold text-muted-foreground">root administrator — حساب «admin»</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-[#0b2e20] px-2 py-0.5 text-[9px] font-black text-[#e9c64a]">همیشه عضو</span>
                  </li>
                  {ADMIN_GROUP.map((g) => (
                    <li key={g.key} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-white px-2.5 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-black text-foreground">
                          {g.formal}
                          {ROLE_TITLE[g.key]?.alias ? <span className="font-bold text-muted-foreground"> ({ROLE_TITLE[g.key].alias})</span> : null}
                        </span>
                        <span dir="ltr" className="block text-right text-[9px] font-bold text-muted-foreground">{g.en} — {g.key}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#0e7a4a]/10 px-2 py-0.5 text-[10px] font-black text-[#0e7a4a]" title={g.note}>
                        <Users size={10} /> {faNum(countMembers(g.key))} نفر
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  حساب مدیر ارشد سامانه (root) از فهرست کاربران پنهان است تا امنیت سامانه حفظ شود، اما عضویتش در این گروه همیشگی و برداشت‌ناپذیر است.
                </p>
              </div>
            )}
          </div>

          {grouped.map(([cat, list]) => (
            <div key={cat}>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#c9a227]" />
                <h3 className="text-sm font-black text-foreground">{cat}</h3>
                <span className="text-[11px] text-muted-foreground">({faNum(list.length)} نقش)</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setArmDelete(false)
                      setEditor({
                        id: r.id,
                        key: r.key,
                        keyInput: r.key,
                        name: r.name,
                        category: r.category,
                        color: r.color,
                        description: r.description,
                        views: r.permissions?.views || [],
                        caps: r.permissions?.caps || [],
                        active: r.active,
                        builtin: r.builtin,
                      })
                    }}
                    className="glow-card rounded-2xl bg-card p-4 text-right transition-all hover:-translate-y-0.5"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white/60" style={{ background: r.color }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-black text-foreground">
                            {ROLE_TITLE[r.key]?.formal || r.name}
                            {ROLE_TITLE[r.key]?.alias ? <span className="text-[10px] font-bold text-muted-foreground"> ({ROLE_TITLE[r.key].alias})</span> : null}
                          </p>
                          <Pill label={r.builtin ? 'سیستمی' : 'سفارشی'} color={r.builtin ? '#556057' : GOLD} />
                          {!r.active && <Pill label="غیرفعال" color={ROSE} />}
                        </div>
                        <p dir="ltr" className="mt-0.5 text-right font-mono text-[10px] text-muted-foreground">{r.key}</p>
                      </div>
                    </div>
                    {r.description && <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{r.description}</p>}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="flex items-center gap-1 rounded-full bg-[#0e7a4a]/10 px-2 py-0.5 text-[10px] font-black text-[#0e7a4a]" title="شمار همکارانی که این نقش را دارند (اصلی، ثانویه یا چندگانه)">
                        <Users size={10} /> {faNum(countMembers(r.key))} نفر
                      </span>
                      {r.permissions?.caps?.slice(0, 3).map((c) => (
                        <span key={c} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-primary">
                          {CAPS[c] || c}
                        </span>
                      ))}
                      {(r.permissions?.caps?.length || 0) > 3 && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-primary">
                          +{faNum((r.permissions?.caps?.length || 0) - 3)}
                        </span>
                      )}
                      <span className="ms-auto text-[10px] font-bold text-muted-foreground">
                        {r.permissions?.views?.includes('*') ? 'همهٔ بخش‌ها' : `${faNum(r.permissions?.views?.length || 0)} بخش`}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── تب کاربران ── */}
      {tab === 'users' && (
        <div className="space-y-3">
          <div className="glow-card overflow-hidden rounded-2xl bg-card">
            <div className="max-h-[560px] divide-y divide-border overflow-y-auto scroll-gold">
              {users.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-3 p-3.5">
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', u.active ? 'bg-[#0e7a4a]' : 'bg-[#b3372f]')} title={u.active ? 'فعال' : 'غیرفعال'} />
                  <Avatar name={u.name} color={u.color} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-foreground">{u.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Pill label={ROLE_LABELS[u.role] || u.role} color={roleByKey.get(u.role)?.color || EMERALD} />
                      {(u.roleIds || []).map((k) => {
                        const r = roleByKey.get(k)
                        return r ? (
                          <Pill key={k} label={r.name} color={r.color} />
                        ) : (
                          <Pill key={k} label={k} color="#6d7a6e" />
                        )
                      })}
                      {(u.secondaryRoles || []).map((s) => (
                        <Pill key={s} label={SECONDARY_LABELS[s] || s} color={TERRA} />
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setManageForm({ role: u.role, secondaryRoles: u.secondaryRoles || [], pin: '', color: u.color, active: u.active })
                      setManageId(u.id)
                    }}
                    className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold transition hover:border-primary/60 active:scale-95"
                  >
                    <Pencil size={15} /> مدیریت
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* کارت توضیح — چرا چند نقش؟ */}
          <div className="rounded-2xl border border-[#c9a227]/40 bg-[#fdf6dd]/60 p-4">
            <p className="text-xs font-black text-[#0e7a4a]">🎓 چرا یک نفر می‌تواند چند نقش داشته باشد؟</p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              در هایپر زیتون طبیعی است که یک همکار هم «فروشنده» باشد و هم «مسئول شبکه‌های اجتماعی». به‌جای ساختن حساب دوم و دو هویت جدا،
              همهٔ نقش‌های فرد را به یک حساب وصل می‌کنیم: دسترسی‌ها جمع می‌شوند، سابقه و امتیازها یکپارچه می‌ماند و اگر روزی نقشی برداشته شود،
              فقط همان دسترسی بسته می‌شود — نه هویت همکار.
            </p>
            <p className="mt-2 border-t border-dashed border-[#c9a227]/40 pt-2 text-[9px] font-bold text-[#8a6d10]">
              📚 اصل حداقل دسترسی + تفکیک هویت از مجوز (Identity vs. Entitlement)
            </p>
          </div>
        </div>
      )}

      {/* ── مودال ویرایشگر نقش ── */}
      {editor && (
        <Modal wide title={editor.id ? `ویرایش نقش: ${editor.name}` : 'نقش جدید'} onClose={() => setEditor(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="نام نقش *">
              <input className={inputCls} value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="مثلاً مسئول شبکه‌های اجتماعی" />
            </Labeled>
            {editor.id ? (
              <Labeled label="کلید نقش (غیرقابل تغییر)">
                <div dir="ltr" className="rounded-xl bg-muted/60 px-3.5 py-2.5 text-left font-mono text-xs text-muted-foreground">{editor.key}</div>
              </Labeled>
            ) : (
              <Labeled label="کلید نقش (لاتین) *" hint="حروف انگلیسی/عدد/خط‌تیره — در سامانه به شکل custom_… ثبت می‌شود">
                <input
                  dir="ltr"
                  className={cn(inputCls, 'text-left font-mono')}
                  value={editor.keyInput}
                  onChange={(e) => setEditor({ ...editor, keyInput: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })}
                  placeholder="SOCIAL_MEDIA"
                />
              </Labeled>
            )}
            <Labeled label="دسته/گروه" hint="می‌توانید گروه تازه بسازید — از فهرست پایین هم می‌توانید انتخاب کنید">
              <input className={inputCls} list="rb-cats" value={editor.category} onChange={(e) => setEditor({ ...editor, category: e.target.value })} placeholder="مثلاً بازاریابی" />
              <datalist id="rb-cats">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Labeled>
          </div>

          <Labeled label="رنگ نقش">
            <div className="flex flex-wrap gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEditor({ ...editor, color: c })}
                  className={cn('h-9 w-9 rounded-full border-2 transition', editor.color === c ? 'scale-110 border-foreground/70' : 'border-transparent')}
                  style={{ background: c }}
                  aria-label={`رنگ ${c}`}
                />
              ))}
            </div>
          </Labeled>

          <Labeled label="توضیح">
            <textarea className={cn(inputCls, 'min-h-[56px]')} value={editor.description} onChange={(e) => setEditor({ ...editor, description: e.target.value })} placeholder="این نقش چه مسئولیتی دارد؟" />
          </Labeled>

          {/* بخش‌های قابل دسترس */}
          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black">🧭 بخش‌های قابل دسترس</p>
              <Chip
                label="همهٔ بخش‌ها (*)"
                checked={editor.views.includes('*')}
                color={EMERALD}
                onClick={() => setEditor({ ...editor, views: editor.views.includes('*') ? [] : ['*'] })}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(VIEW_ACCESS).map((v) => (
                <Chip
                  key={v}
                  label={VIEW_LABELS[v] || v}
                  checked={editor.views.includes('*') || editor.views.includes(v)}
                  color={EMERALD}
                  disabled={editor.views.includes('*')}
                  onClick={() =>
                    setEditor({
                      ...editor,
                      views: editor.views.includes(v) ? editor.views.filter((x) => x !== v) : [...editor.views, v],
                    })
                  }
                />
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {editor.views.includes('*')
                ? 'این نقش به همهٔ بخش‌ها دسترسی دارد.'
                : `${faNum(editor.views.length)} بخش انتخاب شده — داشبورد برای همه باز است.`}
            </p>
          </div>

          {/* دسترسی‌های عملیاتی */}
          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 text-xs font-black">🔧 دسترسی‌های عملیاتی</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(CAPS).map((c) => (
                <Chip
                  key={c}
                  label={CAPS[c]}
                  checked={editor.caps.includes(c)}
                  color={TERRA}
                  onClick={() => setEditor({ ...editor, caps: editor.caps.includes(c) ? editor.caps.filter((x) => x !== c) : [...editor.caps, c] })}
                />
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">{faNum(editor.caps.length)} دسترسی عملیاتی انتخاب شده.</p>
          </div>

          {editor.id && (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-sm font-bold">
              <input type="checkbox" checked={editor.active} onChange={(e) => setEditor({ ...editor, active: e.target.checked })} className="h-4 w-4 accent-[#0e7a4a]" />
              نقش فعال است (غیرفعال = هیچ‌کس با این نقش وارد نمی‌شود)
            </label>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={saveRole}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-primary/90 active:scale-95 disabled:opacity-60"
            >
              <ShieldCheck size={16} /> {saving ? 'در حال ذخیره…' : editor.id ? 'ذخیرهٔ تغییرات' : 'ساخت نقش'}
            </button>
            {editor.id && !editor.builtin && (
              <button
                type="button"
                onClick={() => (armDelete && editor.id ? deleteRole({ id: editor.id, name: editor.name }) : setArmDelete(true))}
                className={cn(
                  'flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition',
                  armDelete ? 'bg-[#b3372f] text-white shadow-md' : 'border border-[#b3372f]/40 text-[#b3372f] hover:bg-[#b3372f]/10'
                )}
              >
                <Trash2 size={15} /> {armDelete ? 'مطمئنید؟ حذف قطعی' : 'حذف نقش'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditor(null)}
              className="min-h-[44px] rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted"
            >
              انصراف
            </button>
          </div>
          {editor.id && editor.builtin && (
            <p className="text-[10px] text-muted-foreground">نقش‌های سیستمی حذف نمی‌شوند — در صورت نیاز غیرفعالشان کنید.</p>
          )}
        </Modal>
      )}

      {/* ── مودال مدیریت کاربر ── */}
      {managed && (
        <Modal wide title={`مدیریت کاربر: ${managed.name}`} onClose={() => setManageId(null)}>
          <div className="flex items-center gap-3 rounded-xl bg-secondary/60 p-3">
            <Avatar name={managed.name} color={manageForm.color} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">{managed.name}</p>
              <p dir="ltr" className="text-right text-[10px] text-muted-foreground">@{managed.username}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(managed.roleIds || []).map((k) => {
                const r = roleByKey.get(k)
                return r ? <Pill key={k} label={r.name} color={r.color} /> : null
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="نقش اصلی">
              <select className={inputCls} value={manageForm.role} onChange={(e) => setManageForm({ ...manageForm, role: e.target.value })}>
                {Object.keys(ROLE_LABELS).map((k) => (
                  <option key={k} value={k}>
                    {ROLE_LABELS[k]}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="بازنشانی PIN (۴ تا ۶ رقم)" hint="خالی = بدون تغییر">
              <input
                dir="ltr"
                className={cn(inputCls, 'text-left tabular-nums')}
                value={manageForm.pin}
                onChange={(e) => setManageForm({ ...manageForm, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                placeholder="••••"
              />
            </Labeled>
          </div>

          <Labeled label="نقش‌های ثانویه (مجوزهای کاری موقت)">
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(SECONDARY_LABELS).map((s) => (
                <Chip
                  key={s}
                  label={SECONDARY_LABELS[s]}
                  checked={manageForm.secondaryRoles.includes(s)}
                  color={TERRA}
                  onClick={() =>
                    setManageForm({
                      ...manageForm,
                      secondaryRoles: manageForm.secondaryRoles.includes(s)
                        ? manageForm.secondaryRoles.filter((x) => x !== s)
                        : [...manageForm.secondaryRoles, s],
                    })
                  }
                />
              ))}
            </div>
          </Labeled>

          {/* نقش‌های چندگانه — تخصیص فوری */}
          <div className="rounded-xl border border-border p-3">
            <p className="mb-1 text-xs font-black">🎭 نقش‌های چندگانه — با هر کلیک فوری اعمال می‌شود</p>
            <p className="mb-2 text-[10px] text-muted-foreground">نقش اصلی کاربر در این فهرست نیست؛ برای تغییرش از «نقش اصلی» بالا استفاده کنید.</p>
            <div className="flex flex-wrap gap-1.5">
              {roles
                .filter((r) => r.key !== manageForm.role)
                .map((r) => {
                  const has = (managed.roleIds || []).includes(r.key)
                  return (
                    <Chip
                      key={r.key}
                      label={
                        <>
                          {r.name}
                          {r.builtin && <span className="mr-1 text-[9px] opacity-70">(سیستمی)</span>}
                        </>
                      }
                      checked={has}
                      color={r.color}
                      onClick={() => toggleUserRole(managed, r.key, !has)}
                    />
                  )
                })}
            </div>
          </div>

          <Labeled label="رنگ کاربر">
            <div className="flex flex-wrap gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setManageForm({ ...manageForm, color: c })}
                  className={cn('h-9 w-9 rounded-full border-2 transition', manageForm.color === c ? 'scale-110 border-foreground/70' : 'border-transparent')}
                  style={{ background: c }}
                  aria-label={`رنگ ${c}`}
                />
              ))}
            </div>
          </Labeled>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-sm font-bold">
            <input type="checkbox" checked={manageForm.active} onChange={(e) => setManageForm({ ...manageForm, active: e.target.checked })} className="h-4 w-4 accent-[#0e7a4a]" />
            حساب کاربری فعال است
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={saveUser}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-primary/90 active:scale-95 disabled:opacity-60"
            >
              <ShieldCheck size={16} /> {saving ? 'در حال ذخیره…' : 'ذخیرهٔ تغییرات کاربر'}
            </button>
            <button
              type="button"
              onClick={() => setManageId(null)}
              className="min-h-[44px] rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted"
            >
              بستن
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
