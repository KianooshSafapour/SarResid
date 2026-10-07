'use client'

/**
 * پروندهٔ پرسنل هایپر زیتون (منابع انسانی)
 * تولدها برای هدیه 🎂، فرزندان برای کمک‌هزینه، مدارک اسکن‌شده روی دیسک.
 * اطلاعات همکاران برای «مراقبت» استفاده می‌شود، نه بازخواست.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faMoney, faNum, formatJalaliDateTime, formatJalaliShort, jalaliToIso, toJalaliParts, todayIso } from '@/lib/jalali'
import {
  Avatar,
  EmptyState,
  KeyValue,
  Labeled,
  Pill,
  SearchInput,
  SectionCard,
  StatCard,
  FaPriceInput,
  type AppCtx,
} from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import { JalaliDatePicker, useHolidays } from '@/components/app/jalali-widgets'
import { cn } from '@/lib/utils'
import { Baby, BadgeCheck, Cake, FileUp, Link2, Pencil, Plus, Trash2, Unlink, UserPlus } from 'lucide-react'

const EMERALD = '#0e7a4a'
const GOLD = '#c9a227'
const TERRA = '#c96f4a'
const OLIVE = '#77934a'
const ROSE = '#b3372f'
const PALETTE = [EMERALD, GOLD, TERRA, OLIVE, '#0f766e', '#8a5a2b']
const MANAGE_ROLES = ['HC', 'ACC', 'OM', 'GM', 'OWNER', 'ADMIN']
const MAX_DOC_MB = 1.5

type Child = { name: string; birthday: string; gender: string }
type Doc = { name: string; kind: string; url: string; size: number; addedAt: string; addedByName: string }
type Emergency = { name: string; phone: string; relation: string }

type Personnel = {
  id: string
  firstName: string
  lastName: string
  nationalId: string
  phone: string
  address: string
  birthday: string
  hireDate: string
  jobTitle: string
  department: string
  bankCard: string
  shaba: string
  baseSalary: number
  childSupport: number
  children: Child[]
  emergencyContact: Emergency
  documents: Doc[]
  notes: string
  userId: string
  active: boolean
}

type LinkedUser = { name: string; color: string; role: string; roleIds: string[] }
type UserRow = { id: string; name: string; role: string; color: string; active: boolean; personnelId: string }
type RoleLite = { key: string; caps: string[]; views: string[]; active: boolean }

/* ── تبدیل تاریخ: birthday/hireDate در پایگاه‌داده جلالی (yyyy-mm-dd) هستند ── */
function jToIso(j: string): string {
  const p = String(j || '').split('-').map(Number)
  if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return ''
  return jalaliToIso(p[0], p[1], p[2])
}
function isoToJ(iso: string): string {
  if (!iso) return ''
  const { jy, jm, jd } = toJalaliParts(iso)
  return `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`
}
function faJDate(j: string): string {
  const iso = jToIso(j)
  return iso ? formatJalaliShort(iso) : '—'
}
function jMonth(j: string): number {
  const m = Number(String(j || '').split('-')[1])
  return m >= 1 && m <= 12 ? m : 0
}

function nameColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

function emptyForm() {
  return {
    firstName: '',
    lastName: '',
    nationalId: '',
    phone: '',
    address: '',
    birthday: '',
    hireDate: isoToJ(todayIso()),
    jobTitle: '',
    department: '',
    bankCard: '',
    shaba: '',
    baseSalary: 0 as number | '',
    childSupport: 0 as number | '',
    children: [] as Child[],
    emergency: { name: '', phone: '', relation: '' },
    notes: '',
    active: true,
  }
}
type FormState = ReturnType<typeof emptyForm>

function toForm(p: Personnel): FormState {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    nationalId: p.nationalId,
    phone: p.phone,
    address: p.address,
    birthday: p.birthday,
    hireDate: p.hireDate,
    jobTitle: p.jobTitle,
    department: p.department,
    bankCard: p.bankCard,
    shaba: p.shaba,
    baseSalary: p.baseSalary || 0,
    childSupport: p.childSupport || 0,
    children: p.children.map((c) => ({ ...c })),
    emergency: { name: p.emergencyContact?.name || '', phone: p.emergencyContact?.phone || '', relation: p.emergencyContact?.relation || '' },
    notes: p.notes,
    active: p.active,
  }
}

const inputCls = 'w-full rounded-xl border border-input bg-white/90 px-3.5 py-2.5 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20'

export default function PersonnelView({ ctx }: { ctx: AppCtx }) {
  const holidays = useHolidays()
  const [rows, setRows] = useState<Personnel[]>([])
  const [linked, setLinked] = useState<Record<string, LinkedUser>>({})
  const [users, setUsers] = useState<UserRow[]>([])
  const [roleMap, setRoleMap] = useState<Record<string, RoleLite>>({})
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [dept, setDept] = useState('')

  const [detailId, setDetailId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState<false | 'new' | Personnel>(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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

  /** اجازهٔ مدیریت: نقش‌های مجاز یا cap «personnel.manage» روی هر نقشِ مؤثر کاربر */
  const canManage = useMemo(() => {
    if (!user) return false
    if (MANAGE_ROLES.includes(user.role)) return true
    return myKeys.some((k) => {
      const r = roleMap[k]
      return !!r && (r.caps.includes('*') || r.caps.includes('personnel.manage'))
    })
  }, [user, myKeys, roleMap])

  const load = useCallback(async () => {
    try {
      const d = await api<{ personnel: Personnel[]; linkedUsers: Record<string, LinkedUser> }>('/api/personnel')
      setRows(d.personnel || [])
      setLinked(d.linkedUsers || {})
      const u = await api<{ users: UserRow[] }>('/api/users')
      setUsers(u.users || [])
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    api<{ roles: Array<{ key: string; active: boolean; permissions: { views: string[]; caps: string[] } }> }>('/api/roles')
      .then((d) => {
        const m: Record<string, RoleLite> = {}
        for (const r of d.roles || []) m[r.key] = { key: r.key, active: r.active, views: r.permissions?.views || [], caps: r.permissions?.caps || [] }
        setRoleMap(m)
      })
      .catch(() => {})
  }, [load])

  const detail = rows.find((r) => r.id === detailId) || null
  const departments = useMemo(() => Array.from(new Set(rows.map((r) => r.department).filter(Boolean))), [rows])

  const thisMonth = useMemo(() => toJalaliParts(todayIso()).jm, [])
  const isBirthdayMonth = useCallback((p: Personnel) => p.active && jMonth(p.birthday) === thisMonth, [thisMonth])

  const filtered = useMemo(() => {
    const q = query.trim()
    return rows.filter((p) => {
      if (dept && p.department !== dept) return false
      if (!q) return true
      return `${p.firstName} ${p.lastName} ${p.phone} ${p.jobTitle}`.includes(q)
    })
  }, [rows, query, dept])

  const kpis = useMemo(
    () => ({
      active: rows.filter((r) => r.active).length,
      total: rows.length,
      birthdays: rows.filter(isBirthdayMonth).length,
      children: rows.reduce((s, r) => s + (r.children?.length || 0), 0),
      docs: rows.reduce((s, r) => s + (r.documents?.length || 0), 0),
    }),
    [rows, isBirthdayMonth]
  )

  /* ── ذخیرهٔ فرم (ایجاد/ویرایش) ── */
  const saveForm = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error('نام و نام خانوادگی الزامی است')
      return
    }
    setSaving(true)
    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      nationalId: form.nationalId.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      birthday: form.birthday,
      hireDate: form.hireDate,
      jobTitle: form.jobTitle.trim(),
      department: form.department.trim(),
      bankCard: form.bankCard.trim(),
      shaba: form.shaba.trim(),
      baseSalary: Number(form.baseSalary) || 0,
      childSupport: Number(form.childSupport) || 0,
      children: form.children,
      emergencyContact: form.emergency,
      notes: form.notes,
      active: form.active,
    }
    try {
      if (formOpen === 'new') {
        await api('/api/personnel', { method: 'POST', body: payload })
        toast.success('پرونده ساخته شد 🌿')
      } else if (formOpen) {
        await api(`/api/personnel/${formOpen.id}`, { method: 'PATCH', body: payload })
        toast.success('پرونده به‌روزرسانی شد')
      }
      setFormOpen(false)
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  /* ── آپلود مدرک (مرورگر → base64 → سرور) ── */
  const uploadDoc = (file: File) => {
    if (!detail) return
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast.error('فقط تصویر یا PDF قابل ثبت است')
      return
    }
    if (file.size > MAX_DOC_MB * 1024 * 1024) {
      toast.error('حجم فایل بیش از سقف مجاز است — حداکثر ۱٫۵ مگابایت')
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        setUploading(true)
        await api(`/api/personnel/${detail.id}`, {
          method: 'POST',
          body: { action: 'add-doc', name: file.name, kind: file.type, dataBase64: String(reader.result) },
        })
        toast.success('مدرک ثبت شد 📎')
        await load()
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setUploading(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    }
    reader.readAsDataURL(file)
  }

  const removeDoc = async (url: string) => {
    if (!detail) return
    try {
      await api(`/api/personnel/${detail.id}`, { method: 'POST', body: { action: 'remove-doc', url } })
      toast.success('مدرک حذف شد')
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const linkUser = async (userId: string) => {
    if (!detail || !userId) return
    try {
      await api(`/api/personnel/${detail.id}`, { method: 'POST', body: { action: 'link-user', userId } })
      toast.success('حساب کاربری متصل شد ✓')
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const unlinkUser = async () => {
    if (!detail) return
    try {
      await api(`/api/personnel/${detail.id}`, { method: 'POST', body: { action: 'unlink-user' } })
      toast.success('اتصال حساب قطع شد')
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const linkedOf = (p: Personnel) => (p.userId ? linked[p.userId] : undefined)
  const availableUsers = (p: Personnel) => users.filter((u) => u.active && u.name && u.id !== p.userId)

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="glow-card h-28 animate-pulse rounded-2xl bg-card" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="glow-card h-24 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* سربرگ */}
      <SectionCard
        title="اشخاص حقیقی — پرسنل هایپر زیتون"
        subtitle="تولدها برای هدیه 🎂، فرزندان برای کمک‌هزینه، مدارک برای آرامش خیال — ما اطلاعات را برای مراقبت استفاده می‌کنیم، نه بازخواست."
        icon={<span className="text-lg">🤝</span>}
        actions={
          canManage ? (
            <button
              type="button"
              onClick={() => {
                setForm(emptyForm())
                setFormOpen('new')
              }}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-primary/90 active:scale-95"
            >
              <Plus size={16} /> پروندهٔ جدید
            </button>
          ) : null
        }
      >
        {!canManage && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#e9b90c]/50 bg-[#fdf6dd] px-3.5 py-2.5 text-xs font-bold text-[#8a6d10]">
            👁️ دسترسی شما فقط مشاهده است — برای ویرایش پرونده‌ها، دسترسی «مدیریت پروندهٔ پرسنل» لازم است.
          </div>
        )}
        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="تعداد پرسنل" value={kpis.active} hint={kpis.active !== kpis.total ? `از ${faNum(kpis.total)} پرونده` : 'همه فعال 🌿'} tone="emerald" icon={<span>👥</span>} />
          <StatCard label="تولدهای این ماه" value={kpis.birthdays} hint={kpis.birthdays ? 'آمادهٔ هدیه باشید 🎁' : 'این ماه تولدی نداریم'} tone="gold" icon={<Cake size={18} />} />
          <StatCard label="فرزندان" value={kpis.children} hint="مبنای کمک‌هزینهٔ خانواده" tone="olive" icon={<Baby size={18} />} />
          <StatCard label="مدارک ثبت‌شده" value={kpis.docs} hint="اسکن تصویری و PDF" tone="terra" icon={<span>📎</span>} />
        </div>
      </SectionCard>

      {/* جست‌وجو و دپارتمان */}
      <div className="flex flex-col gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="جست‌وجوی نام، شماره تماس یا سمت…" className="max-w-md" />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDept('')}
            className={cn(
              'rounded-xl border px-3.5 py-2 text-xs font-bold transition-all active:scale-95',
              !dept ? 'border-transparent bg-[#0b2e20] text-white shadow-md' : 'border-border bg-card text-muted-foreground hover:border-[#0e7a4a]/40'
            )}
          >
            همهٔ بخش‌ها
          </button>
          {departments.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDept(dept === d ? '' : d)}
              className={cn(
                'rounded-xl border px-3.5 py-2 text-xs font-bold transition-all active:scale-95',
                dept === d ? 'border-transparent bg-[#0b2e20] text-white shadow-md' : 'border-border bg-card text-muted-foreground hover:border-[#0e7a4a]/40'
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* کارت‌های پرسنل */}
      {filtered.length === 0 ? (
        <EmptyState emoji="🗂️" title="پرونده‌ای پیدا نشد" hint="جست‌وجو یا فیلتر بخش را تغییر دهید — یا اولین پرونده را بسازید." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const lu = linkedOf(p)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setDetailId(p.id)}
                className={cn(
                  'glow-card rounded-2xl bg-card p-4 text-right transition-all hover:-translate-y-0.5',
                  !p.active && 'opacity-60'
                )}
              >
                <div className="flex items-start gap-3">
                  <Avatar name={p.firstName || p.lastName} color={nameColor(`${p.firstName} ${p.lastName}`)} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-muted-foreground">{p.firstName}</p>
                    <p className="truncate text-base font-black text-foreground">{p.lastName}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {p.jobTitle && <Pill label={p.jobTitle} color={EMERALD} />}
                      {p.department && <Pill label={p.department} color={OLIVE} />}
                      {!p.active && <Pill label="غیرفعال" color={ROSE} />}
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-1 border-t border-dashed border-border pt-2.5 text-xs text-muted-foreground">
                  <p className="flex items-center justify-between gap-2">
                    <span>📱 شماره تماس</span>
                    <span dir="ltr" className="font-bold tabular-nums">{p.phone ? faNum(p.phone) : '—'}</span>
                  </p>
                  <p className="flex items-center justify-between gap-2">
                    <span>📅 تاریخ استخدام</span>
                    <span className="font-bold">{faJDate(p.hireDate)}</span>
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {isBirthdayMonth(p) && (
                    <span className="rounded-full bg-[#c9a227]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#8a6d10]">
                      تولد این ماه 🎂
                    </span>
                  )}
                  {lu && (
                    <span className="rounded-full bg-[#0e7a4a]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#0e7a4a]">
                      متصل به حساب کاربری ✓
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* مودال جزئیات */}
      {detail && (
        <Modal wide title={`پروندهٔ ${detail.firstName} ${detail.lastName}`} onClose={() => setDetailId(null)}>
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/60 p-3">
            <Avatar name={detail.firstName || detail.lastName} color={nameColor(`${detail.firstName} ${detail.lastName}`)} size={46} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">
                {detail.firstName} <span className="text-base">{detail.lastName}</span>
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {detail.jobTitle && <Pill label={detail.jobTitle} color={EMERALD} />}
                {detail.department && <Pill label={detail.department} color={OLIVE} />}
                {isBirthdayMonth(detail) && <Pill label="تولد این ماه 🎂" color="#8a6d10" bg="#fdf6dd" />}
                {!detail.active && <Pill label="غیرفعال" color={ROSE} />}
              </div>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setForm(toForm(detail))
                  setFormOpen(detail)
                }}
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold transition hover:border-primary/60"
              >
                <Pencil size={15} /> ویرایش
              </button>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <KeyValue k="کد ملی" v={detail.nationalId ? faNum(detail.nationalId) : '—'} />
            <KeyValue k="شماره تماس" v={detail.phone ? <span dir="ltr">{faNum(detail.phone)}</span> : '—'} />
            <KeyValue k="تاریخ تولد 🎂" v={faJDate(detail.birthday)} />
            <KeyValue k="تاریخ استخدام" v={faJDate(detail.hireDate)} />
            <KeyValue k="کارت بانکی" v={detail.bankCard ? <span dir="ltr">{faNum(detail.bankCard)}</span> : '—'} />
            <KeyValue k="شماره شبا" v={detail.shaba ? <span dir="ltr" className="text-[11px]">{faNum(detail.shaba)}</span> : '—'} />
            <KeyValue k="حقوق پایه" v={`${faMoney(detail.baseSalary)} تومان`} />
            <KeyValue k="کمک‌هزینهٔ هر فرزند" v={`${faMoney(detail.childSupport)} تومان`} />
          </div>
          {detail.address && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
              <span className="text-muted-foreground">آدرس: </span>
              <span className="font-bold">{detail.address}</span>
            </div>
          )}

          {/* تماس اضطراری */}
          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 text-xs font-black text-foreground">🚑 تماس اضطراری</p>
            {detail.emergencyContact?.name ? (
              <div className="grid gap-2 sm:grid-cols-3">
                <KeyValue k="نام" v={detail.emergencyContact.name} />
                <KeyValue k="نسبت" v={detail.emergencyContact.relation || '—'} />
                <KeyValue k="تلفن" v={<span dir="ltr">{faNum(detail.emergencyContact.phone || '—')}</span>} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">ثبت نشده است</p>
            )}
          </div>

          {/* فرزندان */}
          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 text-xs font-black text-foreground">👧 فرزندان ({faNum(detail.children?.length || 0)})</p>
            {(detail.children?.length || 0) === 0 ? (
              <p className="text-xs text-muted-foreground">ثبت نشده است</p>
            ) : (
              <div className="max-h-44 space-y-1.5 overflow-y-auto scroll-gold pl-1">
                {detail.children.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                    <span className="font-bold">{c.gender === 'پسر' ? '👦' : '👧'} {c.name || '—'}</span>
                    <span className="text-muted-foreground">تولد: {faJDate(c.birthday)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* مدارک */}
          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-black text-foreground">📎 مدارک ({faNum(detail.documents?.length || 0)})</p>
              {canManage && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) uploadDoc(f)
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                    className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#c9a227]/50 bg-[#fdf6dd] px-3 py-2 text-xs font-bold text-[#8a6d10] transition hover:bg-[#c9a227]/20 disabled:opacity-60"
                  >
                    <FileUp size={14} /> {uploading ? 'در حال بارگذاری…' : 'افزودن مدرک'}
                  </button>
                </>
              )}
            </div>
            {(detail.documents?.length || 0) === 0 ? (
              <p className="text-xs text-muted-foreground">هنوز مدرکی ثبت نشده — قرارداد، کارت ملی یا گواهی‌ها را این‌جا اسکن کنید (تصویر یا PDF، تا ۱٫۵ مگابایت).</p>
            ) : (
              <div className="max-h-44 space-y-1.5 overflow-y-auto scroll-gold pl-1">
                {detail.documents.map((d) => (
                  <div key={d.url} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{d.kind === 'application/pdf' ? '📄' : '🖼️'} {d.name}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {faNum(Math.round(d.size / 1024))} کیلوبایت • {d.addedByName} • {formatJalaliDateTime(d.addedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-secondary px-3 py-1.5 text-[11px] font-bold text-primary transition hover:bg-secondary/70"
                      >
                        مشاهده
                      </a>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => removeDoc(d.url)}
                          className="rounded-lg p-2 text-[#b3372f] transition hover:bg-[#b3372f]/10"
                          aria-label="حذف مدرک"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* اتصال حساب کاربری */}
          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 text-xs font-black text-foreground">🔗 حساب کاربری متصل</p>
            {linkedOf(detail) ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <Avatar name={linkedOf(detail)!.name} color={linkedOf(detail)!.color} size={30} />
                  <span className="font-bold">{linkedOf(detail)!.name}</span>
                  <Pill label={linkedOf(detail)!.role} color={EMERALD} />
                  <BadgeCheck size={15} className="text-[#0e7a4a]" />
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={unlinkUser}
                    className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#b3372f]/40 px-3 py-2 text-xs font-bold text-[#b3372f] transition hover:bg-[#b3372f]/10"
                  >
                    <Unlink size={14} /> قطع اتصال
                  </button>
                )}
              </div>
            ) : canManage ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className={cn(inputCls, 'max-w-xs flex-1')}
                  defaultValue=""
                  onChange={(e) => linkUser(e.target.value)}
                  aria-label="انتخاب حساب کاربری برای اتصال"
                >
                  <option value="">انتخاب حساب کاربری…</option>
                  {availableUsers(detail).map((u) => (
                    <option key={u.id} value={u.id} disabled={!!u.personnelId}>
                      {u.name} {u.personnelId ? '(متصل به پروندهٔ دیگر)' : ''}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-muted-foreground">
                  <Link2 size={12} className="inline" /> با اتصال حساب، ورود و امتیازها به همین پرونده گره می‌خورد
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">به حساب کاربری متصل نیست</p>
            )}
          </div>
        </Modal>
      )}

      {/* مودال ایجاد/ویرایش */}
      {formOpen && (
        <Modal wide title={formOpen === 'new' ? 'پروندهٔ پرسنل جدید' : `ویرایش پروندهٔ ${formOpen.firstName} ${formOpen.lastName}`} onClose={() => setFormOpen(false)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="نام *">
              <input className={inputCls} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="مثلاً کیانوش" />
            </Labeled>
            <Labeled label="نام خانوادگی *">
              <input className={inputCls} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="مثلاً صفاپور" />
            </Labeled>
            <Labeled label="کد ملی">
              <input dir="ltr" className={cn(inputCls, 'text-left tabular-nums')} value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value.replace(/[^\d]/g, '').slice(0, 10) })} />
            </Labeled>
            <Labeled label="شماره تماس">
              <input dir="ltr" className={cn(inputCls, 'text-left tabular-nums')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^\d]/g, '').slice(0, 11) })} placeholder="0913…" />
            </Labeled>
            <Labeled label="تاریخ تولد 🎂 — برای هدیهٔ تولد" hint="ماه تولد برای یادآوری هدیه استفاده می‌شود">
              <JalaliDatePicker
                value={jToIso(form.birthday)}
                onChange={(iso) => setForm({ ...form, birthday: isoToJ(iso) })}
                holidays={holidays}
                warnHoliday={false}
                quickChips={false}
                placeholder="انتخاب تاریخ تولد"
              />
            </Labeled>
            <Labeled label="تاریخ استخدام">
              <JalaliDatePicker
                value={jToIso(form.hireDate)}
                onChange={(iso) => setForm({ ...form, hireDate: isoToJ(iso) })}
                holidays={holidays}
                warnHoliday={false}
                quickChips={false}
                placeholder="انتخاب تاریخ استخدام"
              />
            </Labeled>
            <Labeled label="سمت شغلی">
              <input className={inputCls} value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} placeholder="مثلاً فروشنده" />
            </Labeled>
            <Labeled label="بخش / دپارتمان">
              <input className={inputCls} list="pz-depts" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="مثلاً فروش" />
              <datalist id="pz-depts">
                {departments.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </Labeled>
            <Labeled label="شماره کارت بانکی">
              <input dir="ltr" className={cn(inputCls, 'text-left tabular-nums')} value={form.bankCard} onChange={(e) => setForm({ ...form, bankCard: e.target.value })} placeholder="6037-…" />
            </Labeled>
            <Labeled label="شماره شبا" hint="بدون IR هم قابل ثبت است">
              <input dir="ltr" className={cn(inputCls, 'text-left tabular-nums')} value={form.shaba} onChange={(e) => setForm({ ...form, shaba: e.target.value })} placeholder="IR…" />
            </Labeled>
            <Labeled label="حقوق پایه (تومان)">
              <FaPriceInput value={form.baseSalary} onChange={(v) => setForm({ ...form, baseSalary: v })} className={inputCls} />
            </Labeled>
            <Labeled label="کمک‌هزینهٔ هر فرزند (تومان)">
              <FaPriceInput value={form.childSupport} onChange={(v) => setForm({ ...form, childSupport: v })} className={inputCls} />
            </Labeled>
          </div>

          <Labeled label="آدرس">
            <textarea className={cn(inputCls, 'min-h-[60px]')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Labeled>

          {/* تماس اضطراری */}
          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 text-xs font-black">🚑 تماس اضطراری</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Labeled label="نام">
                <input className={inputCls} value={form.emergency.name} onChange={(e) => setForm({ ...form, emergency: { ...form.emergency, name: e.target.value } })} />
              </Labeled>
              <Labeled label="نسبت">
                <input className={inputCls} value={form.emergency.relation} onChange={(e) => setForm({ ...form, emergency: { ...form.emergency, relation: e.target.value } })} placeholder="همسر / پدر…" />
              </Labeled>
              <Labeled label="تلفن">
                <input dir="ltr" className={cn(inputCls, 'text-left tabular-nums')} value={form.emergency.phone} onChange={(e) => setForm({ ...form, emergency: { ...form.emergency, phone: e.target.value.replace(/[^\d]/g, '').slice(0, 11) } })} />
              </Labeled>
            </div>
          </div>

          {/* فرزندان — ویرایشگر پویا */}
          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-black">👧 فرزندان ({faNum(form.children.length)}) — برای محاسبهٔ کمک‌هزینه</p>
              <button
                type="button"
                onClick={() => setForm({ ...form, children: [...form.children, { name: '', birthday: '', gender: 'دختر' }] })}
                className="flex min-h-[36px] items-center gap-1 rounded-lg bg-secondary px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-secondary/70"
              >
                <Plus size={13} /> افزودن فرزند
              </button>
            </div>
            {form.children.length === 0 && <p className="text-xs text-muted-foreground">فرزندی ثبت نشده است.</p>}
            <div className="space-y-2">
              {form.children.map((c, i) => (
                <div key={i} className="grid items-end gap-2 rounded-lg bg-muted/40 p-2 sm:grid-cols-[1fr_auto_auto_auto]">
                  <Labeled label="نام">
                    <input className={inputCls} value={c.name} onChange={(e) => setForm({ ...form, children: form.children.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  </Labeled>
                  <Labeled label="تولد">
                    <JalaliDatePicker
                      value={jToIso(c.birthday)}
                      onChange={(iso) => setForm({ ...form, children: form.children.map((x, j) => (j === i ? { ...x, birthday: isoToJ(iso) } : x)) })}
                      holidays={holidays}
                      warnHoliday={false}
                      quickChips={false}
                      placeholder="تاریخ تولد"
                    />
                  </Labeled>
                  <Labeled label="جنسیت">
                    <select className={inputCls} value={c.gender} onChange={(e) => setForm({ ...form, children: form.children.map((x, j) => (j === i ? { ...x, gender: e.target.value } : x)) })}>
                      <option value="دختر">دختر</option>
                      <option value="پسر">پسر</option>
                    </select>
                  </Labeled>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, children: form.children.filter((_, j) => j !== i) })}
                    className="mb-1 rounded-lg p-2.5 text-[#b3372f] transition hover:bg-[#b3372f]/10"
                    aria-label="حذف فرزند"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <Labeled label="یادداشت (خصوصی — فقط مدیریت)">
            <textarea className={cn(inputCls, 'min-h-[60px]')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Labeled>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-sm font-bold">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 accent-[#0e7a4a]" />
            همکار فعال است
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={saveForm}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-primary/90 active:scale-95 disabled:opacity-60"
            >
              <UserPlus size={16} /> {saving ? 'در حال ذخیره…' : formOpen === 'new' ? 'ساخت پرونده' : 'ذخیرهٔ تغییرات'}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="min-h-[44px] rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted"
            >
              انصراف
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
