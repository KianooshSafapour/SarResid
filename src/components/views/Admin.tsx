'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faNum, formatJalaliDateTime } from '@/lib/jalali'
import { ROLE_LABELS, SECONDARY_LABELS } from '@/lib/constants'
import { SectionCard, Pill, EmptyState, Avatar, SearchInput, Labeled, KeyValue } from '@/components/app/ui-bits'
import type { AppCtx } from '@/components/app/ui-bits'
import { HolidaysAdminCard } from '@/components/app/HolidaysAdminCard'
import { Modal } from '@/components/views/Orders'
import { cn } from '@/lib/utils'
import {
  Users, CalendarDays, ScrollText, Settings, Plus, Pencil, UserX, RefreshCw, Trash2, ShieldCheck, Info, Download,
  Server, Database, Package, Truck, Layers, History, RotateCcw, ChevronDown, ChevronUp, GraduationCap, Palmtree,
} from 'lucide-react'

type User = {
  id: string; name: string; username: string; role: string; secondaryRoles: string[]
  color: string; active: boolean; points: number; pin?: string
}
type Holiday = { id: string; date: string; title: string; source: string }
type LogRow = { id: string; userName: string; action: string; entity: string; detail: string; createdAt: string }

const ROLE_COLORS: Record<string, string> = {
  OWNER: '#b3372f', GM: '#0e7a4a', OM: '#207a63', PM: '#8a6d10', ACC: '#77934a',
  HC: '#a04c2a', CASHIER: '#8a5a2b', SK: '#5c7236', MERCH: '#c96f4a', SALES: '#6d7a6e',
}

const SECONDARY_KEYS = ['RECEIVER', 'MERCH', 'SALES', 'IT']
const COLOR_SWATCHES = ['#0e7a4a', '#c9a227', '#c96f4a', '#77934a', '#b3372f', '#8a5a2b', '#207a63', '#6d7a6e']

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  manual: { label: 'دستی', color: '#6d7a6e' },
  seed: { label: 'پایگاه اولیه', color: '#8a6d10' },
  keybit: { label: 'اینترنت', color: '#207a63' },
}

const ENTITY_LABELS: Record<string, string> = {
  order: 'سفارش', product: 'کالا', task: 'وظیفه', cheque: 'چک', user: 'کاربر',
  message: 'پیام', feedback: 'بازخورد', wall: 'دیوار تیمی', preOrder: 'پیش‌فاکتور',
  customer: 'مشتری', customerRequest: 'درخواست کالا', planogram: 'پلانوگرام',
  holiday: 'تعطیلی', award: 'امتیاز', sop: 'دستورالعمل', note: 'یادداشت', stockCount: 'انبارگردانی',
}
const ENTITY_CHIPS = ['order', 'product', 'task', 'cheque', 'user', 'message', 'feedback', 'wall']

export default function AdminView({ ctx }: { ctx: AppCtx }) {
  const allowed = ['OM', 'GM', 'OWNER', 'ADMIN'].includes(ctx.user!.role)
  const [tab, setTab] = useState('users')

  if (!allowed) {
    return (
      <div className="py-10">
        <EmptyState
          emoji="🔒"
          title="دسترسی محدود"
          hint="این بخش فقط برای مدیران سامانه (مدیر عملیات، مدیر کل و مالک) باز است"
        />
      </div>
    )
  }

  const TABS = [
    { key: 'users', label: 'کاربران و نقش‌ها 👥', icon: <Users size={14} /> },
    { key: 'holidays', label: 'تعطیلات رسمی 📅', icon: <CalendarDays size={14} /> },
    { key: 'activity', label: 'گزارش فعالیت 📜', icon: <ScrollText size={14} /> },
    { key: 'settings', label: 'تنظیمات ⚙️', icon: <Settings size={14} /> },
    { key: 'holoo', label: 'هلو آپکس و همگام‌سازی 🔄', icon: <Server size={14} /> },
  ]

  return (
    <div className="space-y-4">
      <div className="scroll-gold flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold transition',
              tab === t.key
                ? 'bg-primary text-white shadow-md'
                : 'border border-border bg-card text-foreground/70 hover:border-primary/50'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' && <UsersTab meId={ctx.user!.id} />}
      {tab === 'holidays' && (
        <HolidaysAdminCard
          canManage={
            ['GM', 'OM', 'OWNER'].includes(ctx.user!.role) ||
            ctx.user!.role === 'ACC' ||
            (ctx.user!.secondaryRoles || []).includes('ACC')
          }
        />
      )}
      {tab === 'activity' && <ActivityTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'holoo' && <HolooTab />}
    </div>
  )
}

/* ═══════════════════════════ Tab 1: کاربران و نقش‌ها ═══════════════════════════ */
function UsersTab({ meId }: { meId: string }) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [editUser, setEditUser] = useState<User | 'NEW' | null>(null)
  const [deactivate, setDeactivate] = useState<User | null>(null)

  const load = async () => {
    try {
      const d = await api<{ users: User[] }>('/api/users')
      setUsers(d.users)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  return (
    <>
      <SectionCard
        title="کاربران و نقش‌ها 👥"
        subtitle="نقش هر همکار، نقش‌های دوم، امتیاز و وضعیت ورود — دموی ورود با پین است"
        icon={<Users size={18} />}
        actions={
          <button
            onClick={() => setEditUser('NEW')}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-white"
          >
            <Plus size={14} /> کاربر جدید
          </button>
        }
      >
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">در حال بارگذاری کاربران…</p>
        ) : (
          <div className="scroll-gold max-h-[62vh] space-y-2 overflow-y-auto pl-1">
            {users.map((u) => (
              <div
                key={u.id}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-white/80 p-3.5',
                  !u.active && 'opacity-55'
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={u.name} color={u.color} size={42} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-black">
                      {u.name}
                      <Pill label={ROLE_LABELS[u.role] || u.role} color={ROLE_COLORS[u.role] || '#6d7a6e'} />
                      {u.secondaryRoles.map((s) => (
                        <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold text-muted-foreground">
                          {SECONDARY_LABELS[s] || s}
                        </span>
                      ))}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {faNum(u.points)} امتیاز • {u.active ? (
                        <span className="font-bold text-[#0e7a4a]">● فعال</span>
                      ) : (
                        <span className="font-bold text-[#b3372f]">● غیرفعال</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setEditUser(u)}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-[11px] font-extrabold text-foreground/70 hover:border-primary/50"
                  >
                    <Pencil size={12} /> ویرایش
                  </button>
                  {u.active && u.id !== meId && (
                    <button
                      onClick={() => setDeactivate(u)}
                      className="flex items-center gap-1 rounded-lg bg-[#b3372f]/10 px-3 py-2 text-[11px] font-extrabold text-[#b3372f] hover:bg-[#b3372f]/20"
                    >
                      <UserX size={12} /> غیرفعال‌سازی
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {editUser && (
        <UserFormModal
          user={editUser === 'NEW' ? null : editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); load() }}
        />
      )}

      {deactivate && (
        <Modal title="غیرفعال‌سازی کاربر" onClose={() => setDeactivate(null)}>
          <p className="text-sm text-foreground/80">
            «{deactivate.name}» کاربر غیرفعال می‌شود و دیگر وارد نمی‌شود.
          </p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                try {
                  await api(`/api/users/${deactivate.id}`, { method: 'DELETE' })
                  toast.success('کاربر غیرفعال شد')
                  setDeactivate(null)
                  await load()
                } catch (e: any) {
                  toast.error(e.message)
                }
              }}
              className="flex-1 rounded-xl bg-[#b3372f] py-2.5 text-xs font-extrabold text-white"
            >
              غیرفعال کن
            </button>
            <button onClick={() => setDeactivate(null)} className="flex-1 rounded-xl border py-2.5 text-xs font-bold">
              انصراف
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

/** create / edit user modal */
function UserFormModal({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: user?.name || '',
    role: user?.role || 'SALES',
    pin: user?.pin || '1234',
    color: user?.color || COLOR_SWATCHES[0],
  })
  const [secondary, setSecondary] = useState<string[]>(user?.secondaryRoles || [])
  const [active, setActive] = useState(user?.active ?? true)
  const [busy, setBusy] = useState(false)

  const toggleSecondary = (k: string) =>
    setSecondary((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))

  const save = async () => {
    if (!form.name.trim()) return toast.error('نام کاربر الزامی است')
    setBusy(true)
    try {
      if (user) {
        await api(`/api/users/${user.id}`, {
          method: 'PATCH',
          body: { name: form.name.trim(), role: form.role, pin: form.pin, color: form.color, secondaryRoles: secondary, active },
        })
        toast.success('اطلاعات کاربر ذخیره شد ✅')
      } else {
        await api('/api/users', {
          method: 'POST',
          body: { name: form.name.trim(), role: form.role, pin: form.pin || '1234', color: form.color, secondaryRoles: secondary },
        })
        toast.success('کاربر جدید ساخته شد ✅ — پین ورودش را به او بگویید')
      }
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={user ? `ویرایش «${user.name}»` : 'کاربر جدید'} onClose={onClose}>
      <Labeled label="نام و نام خانوادگی *">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm"
          placeholder="مثلاً: زهرا محمدی"
        />
      </Labeled>

      <Labeled label="نقش اصلی *">
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          className="w-full rounded-xl border border-input bg-white p-3 text-sm"
        >
          {Object.entries(ROLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </Labeled>

      <Labeled label="نقش‌های دوم (اختیاری)" hint="همکار می‌تواند چند نقش را هم‌زمان داشته باشد">
        <div className="flex flex-wrap gap-1.5">
          {SECONDARY_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => toggleSecondary(k)}
              className={cn(
                'rounded-full border px-3.5 py-2 text-[11px] font-extrabold transition',
                secondary.includes(k)
                  ? 'border-[#77934a] bg-[#77934a] text-white'
                  : 'border-border bg-card text-foreground/70 hover:border-primary/50'
              )}
            >
              {SECONDARY_LABELS[k]}
            </button>
          ))}
        </div>
      </Labeled>

      <div className="grid grid-cols-2 gap-3">
        <Labeled label="پین ورود" hint="پیش‌فرض ۱۲۳۴">
          <input
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
            dir="ltr"
            className="w-full rounded-xl border border-input bg-white/90 p-3 text-center text-sm font-black"
          />
        </Labeled>
        <Labeled label="رنگ آواتار">
          <div className="flex flex-wrap gap-1.5 pt-1">
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm({ ...form, color: c })}
                className={cn('h-8 w-8 rounded-full border-2 transition', form.color === c ? 'scale-110 border-foreground/70' : 'border-transparent')}
                style={{ background: c }}
                title={c}
              />
            ))}
          </div>
        </Labeled>
      </div>

      {user && (
        <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-muted/40 px-3 py-2.5">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[#0e7a4a]" />
          <span className="text-xs font-bold">کاربر فعال است (اجازهٔ ورود دارد)</span>
        </label>
      )}

      <button onClick={save} disabled={busy} className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : user ? 'ذخیره تغییرات' : 'ساخت کاربر'}
      </button>
    </Modal>
  )
}

/* ═══════════════════════════ Tab 2: تعطیلات رسمی — به HolidaysAdminCard منتقل شد (src/components/app/HolidaysAdminCard.tsx) ═══════════════════════════ */

/* ═══════════════════════════ Tab 3: گزارش فعالیت ═══════════════════════════ */
function ActivityTab() {
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [entity, setEntity] = useState('')

  useEffect(() => {
    api<{ logs: LogRow[] }>('/api/activity?take=120')
      .then((d) => setLogs(d.logs))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim()
    return logs.filter(
      (l) =>
        (!entity || l.entity === entity) &&
        (!needle || l.userName.includes(needle) || l.action.includes(needle) || l.detail.includes(needle))
    )
  }, [logs, q, entity])

  return (
    <SectionCard
      title="گزارش فعالیت 📜"
      subtitle="هر اقدام در سامانه با نام و زمان ثبت می‌شود — شفافیت برای حمایت از تیم"
      icon={<ScrollText size={18} />}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="جستجوی نام، اقدام یا جزئیات…" className="min-w-[220px] flex-1" />
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setEntity('')}
            className={cn('rounded-full border px-3.5 py-1.5 text-[11px] font-extrabold', !entity ? 'border-primary bg-primary text-white' : 'border-border bg-card text-foreground/70')}
          >
            همه
          </button>
          {ENTITY_CHIPS.map((e) => (
            <button
              key={e}
              onClick={() => setEntity(entity === e ? '' : e)}
              className={cn('rounded-full border px-3.5 py-1.5 text-[11px] font-extrabold', entity === e ? 'border-primary bg-primary text-white' : 'border-border bg-card text-foreground/70')}
            >
              {ENTITY_LABELS[e]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">در حال بارگذاری گزارش…</p>
      ) : filtered.length === 0 ? (
        <EmptyState emoji="📜" title="فعالیتی یافت نشد" hint="فیلتر یا عبارت جستجو را تغییر دهید" />
      ) : (
        <div className="scroll-gold max-h-[55vh] space-y-1 overflow-y-auto pl-1">
          {filtered.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white/70 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar name={l.userName} color="#5c7236" size={28} />
                <div className="min-w-0">
                  <p className="text-xs">
                    <b className="text-foreground">{l.userName}</b>
                    <span className="text-foreground/80"> — {l.action}</span>
                  </p>
                  {l.detail && <p className="truncate text-[10px] text-muted-foreground">{l.detail}</p>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {l.entity && (
                  <span className="rounded-full bg-[#77934a]/12 px-2.5 py-0.5 text-[10px] font-bold text-[#5c7236]">
                    {ENTITY_LABELS[l.entity] || l.entity}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">{formatJalaliDateTime(l.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

/* ═══════════════════════════ Tab 4: تنظیمات ═══════════════════════════ */

type Health = {
  counts: { users: number; activeUsers: number; orders: number; products: number; cheques: number; tasks: number; activities: number; messages: number; holidays: number }
  lastActivity: { at: string; who: string; what: string } | null
  db: { file: string; sizeBytes: number }
  holidayCoverage: { futureHolidays: number; coveredThrough: string }
  server: { node: string; env: string; uptimeSec: number; platform: string }
}

function faBytes(b: number) {
  if (b <= 0) return '۰'
  if (b < 1024 * 1024) return `${faNum(Math.round(b / 1024))} کیلوبایت`
  return `${faNum((b / 1024 / 1024).toFixed(1))} مگابایت`
}

function SettingsTab() {
  const [health, setHealth] = useState<Health | null>(null)
  useEffect(() => {
    api<Health>('/api/admin/health').then(setHealth).catch(() => {})
  }, [])

  return (
    <div className="space-y-4">
      <DeliveryRulesCard />
      <LeavePolicyCard />
      <SectionCard
        title="اطلاعات فروشگاه 🏪"
        subtitle="مشخصات پایهٔ سامانه — نسخهٔ نمایشی، مقادیر ثابت"
        icon={<Settings size={18} />}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <KeyValue k="نام فروشگاه" v="هایپر زیتون 🫒" />
          <KeyValue k="شهر" v="کرمان" />
          <KeyValue k="نرخ ارزش افزوده" v="۹٪" />
          <KeyValue k="هشدار حاشیه سود" v="کمتر از ۱۰٪" />
          <KeyValue k="حاشیه سود خوب" v="بیش از ۲۵٪" />
          <KeyValue k="واحد پول" v="تومان" />
        </div>
      </SectionCard>

      {/* System health — for the internal-server admin */}
      <SectionCard
        title="سلامت سامانه 🩺"
        subtitle="نمای کلی داده‌ها و سرور — برای نگهداری سرور داخلی"
        icon={<ShieldCheck size={18} />}
      >
        {!health ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
              {[
                { label: 'کاربران', value: `${faNum(health.counts.activeUsers)} / ${faNum(health.counts.users)}`, hint: 'فعال / کل' },
                { label: 'سفارش‌ها', value: faNum(health.counts.orders), hint: 'از ابتدا' },
                { label: 'کالاها', value: faNum(health.counts.products), hint: 'فعال' },
                { label: 'چک‌ها', value: faNum(health.counts.cheques), hint: 'ثبت‌شده' },
                { label: 'وظایف', value: faNum(health.counts.tasks), hint: 'کل' },
                { label: 'رویدادهای ثبت‌شده', value: faNum(health.counts.activities), hint: 'گزارش فعالیت' },
                { label: 'پیام‌ها', value: faNum(health.counts.messages), hint: 'کل پیام‌ها' },
                { label: 'تعطیلات تقویم', value: faNum(health.counts.holidays), hint: `${faNum(health.holidayCoverage.futureHolidays)} تعطیلی پیش‌رو` },
                { label: 'حجم پایگاه‌داده', value: faBytes(health.db.sizeBytes), hint: health.db.file || 'db' },
                { label: 'کارکرد سرور', value: health.server.uptimeSec < 3600 ? `${faNum(Math.floor(health.server.uptimeSec / 60))} دقیقه` : `${faNum(Math.floor(health.server.uptimeSec / 3600))} ساعت`, hint: `Node ${faNum(health.server.node.replace('v', ''))}` },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-border bg-white/70 p-3">
                  <p className="text-[10px] font-bold text-muted-foreground">{c.label}</p>
                  <p className="mt-0.5 text-base font-black text-foreground">{c.value}</p>
                  <p className="text-[9px] text-muted-foreground">{c.hint}</p>
                </div>
              ))}
            </div>
            {health.lastActivity && (
              <p className="mt-3 rounded-xl bg-secondary/60 p-3 text-[11px] font-bold text-[#24402f]">
                🕒 آخرین فعالیت ثبت‌شده: <b>{health.lastActivity.who}</b> — {health.lastActivity.what} ({formatJalaliDateTime(health.lastActivity.at)})
              </p>
            )}
            {/* پشتیبان‌گیری فوری — فایل دیتابیس را همین حالا دانلود کن */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#0e7a4a]/30 bg-[#e9f0e4]/60 p-4">
              <div>
                <p className="text-xs font-black text-[#24402f]">💾 پشتیبان‌گیری فوری</p>
                <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                  کل داده‌ها (سفارش‌ها، چک‌ها، کاربران، لاگ‌ها) در یک فایل — هر شب بعد از بستن فروشگاه یک نسخه بگیرید.
                </p>
              </div>
              <a
                href="/api/admin/backup"
                download
                onClick={() => toast.success('دانلود نسخه پشتیبان آغاز شد 💾')}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#0e7a4a] to-[#12905a] px-5 py-2.5 text-xs font-extrabold text-white shadow-lg"
              >
                <Download size={14} /> دانلود نسخه پشتیبان
              </a>
            </div>
          </>
        )}
      </SectionCard>

      <TourAdminCard />

      <div className="flex items-start gap-2.5 rounded-2xl border border-[#c9a227]/40 bg-[#fdf6dd]/50 p-4">
        <Info size={16} className="mt-0.5 shrink-0 text-[#8a6d10]" />
        <p className="text-xs leading-5 text-foreground/80">
          نرخ ارزش افزوده در محاسبات حسابداری و حاشیه سود کالاها استفاده می‌شود؛ هشدار حاشیه سود در صفحهٔ
          کالاها و تأیید سفارش‌ها نمایش داده می‌شود تا فروش زیان‌ده اتفاق نیفتد.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4">
        <ShieldCheck size={18} className="text-[#0e7a4a]" />
        <p className="text-xs font-bold text-foreground/80">
          نسخهٔ سامانه: ۱.۱ — داده‌ها روی پایگاه‌دادهٔ محلی فروشگاه نگهداری می‌شود؛ هر شب از فایل پایگاه‌داده پشتیبان بگیرید.
        </p>
      </div>
    </div>
  )
}

/* ═══════════════════════════ کارت قواعد دریافت مرسولهٔ سرآمده (تب تنظیمات) ═══════════════════════════ */

function DeliveryRulesCard() {
  const [allow, setAllow] = useState(true)
  const [grace, setGrace] = useState(14)
  const [canEdit, setCanEdit] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ allowPastDue: boolean; graceDays: number; canEdit: boolean }>('/api/admin/delivery-rules')
      .then((d) => {
        setAllow(d.allowPastDue)
        setGrace(d.graceDays)
        setCanEdit(d.canEdit)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const save = async (patch: { allowPastDue?: boolean; graceDays?: number }) => {
    setBusy(true)
    try {
      await api('/api/admin/delivery-rules', { method: 'PUT', body: patch })
      toast.success('قواعد دریافت ذخیره شد')
    } catch (e: any) {
      toast.error(e.message || 'ذخیره ناموفق بود')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard
      title="دریافت مرسوله‌های سرآمده 🚚"
      subtitle="قاعدهٔ قابل‌تنظیم: آیا سفارشی که تاریخش گذشته قابل دریافت است؟"
      icon={<Truck size={18} />}
    >
      {!loaded ? (
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white/70 p-3">
            <div>
              <p className="text-xs font-black">اجازهٔ دریافت سفارش سرآمده</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {allow ? 'فعال — کارمندان می‌توانند با رعایت مهلت بخشش دریافت کنند' : 'غیرفعال — فقط مدیران می‌توانند دریافت کنند'}
              </p>
            </div>
            <button
              disabled={!canEdit || busy}
              onClick={() => {
                const next = !allow
                setAllow(next)
                save({ allowPastDue: next })
              }}
              className={cn(
                'rounded-xl px-5 py-2.5 text-xs font-black transition disabled:opacity-50',
                allow ? 'bg-[#0e7a4a] text-white' : 'bg-[#b3372f] text-white'
              )}
            >
              {allow ? 'فعال ✅' : 'غیرفعال 🚫'}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white/70 p-3">
            <div>
              <p className="text-xs font-black">مهلت بخشش (روز)</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">تأخیر بیش از این تعداد روز، نیازمند تأیید مدیر است</p>
            </div>
            <div className="flex items-center gap-2">
              {[7, 14, 30].map((g) => (
                <button
                  key={g}
                  disabled={!canEdit || busy}
                  onClick={() => {
                    setGrace(g)
                    save({ graceDays: g })
                  }}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50',
                    grace === g ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-secondary'
                  )}
                >
                  {faNum(g)} روز
                </button>
              ))}
              <input
                type="number"
                min={0}
                max={90}
                value={grace}
                disabled={!canEdit || busy}
                onChange={(e) => setGrace(Number(e.target.value))}
                onBlur={() => save({ graceDays: grace })}
                className="w-16 rounded-lg border border-input bg-white px-2 py-1.5 text-center text-xs font-bold"
              />
            </div>
          </div>
          {!canEdit && (
            <p className="text-[10px] text-muted-foreground">فقط مدیران می‌توانند این قاعده را تغییر دهند (نمایش فقط‌خواندنی)</p>
          )}
        </div>
      )}
    </SectionCard>
  )
}

/* ═══════════════════════════ کارت سیاست روزهای مرخصی (تب تنظیمات) ═══════════════════════════ */

type LeavePolicyForm = {
  maxPerDayWithoutReplacement: number
  hardCapPerDay: number
  requireReplacementNote: boolean
  minPresentPerShift: number
  blockFridays: boolean
  blockHolidays: boolean
}

const LEAVE_POLICY_DEFAULT: LeavePolicyForm = {
  maxPerDayWithoutReplacement: 2,
  hardCapPerDay: 4,
  requireReplacementNote: true,
  minPresentPerShift: 5,
  blockFridays: false,
  blockHolidays: true,
}

function LeavePolicyCard() {
  const [form, setForm] = useState<LeavePolicyForm>(LEAVE_POLICY_DEFAULT)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  // نمای Admin فقط در دسترس مدیران اجرایی است؛ گارد نهایی سمت سرور با cap 'settings.manage' اعمال می‌شود
  const canEdit = true

  useEffect(() => {
    api<{ policy: LeavePolicyForm }>('/api/leaves')
      .then((d) => {
        if (d.policy) setForm({ ...LEAVE_POLICY_DEFAULT, ...d.policy })
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const save = async () => {
    setBusy(true)
    try {
      await api('/api/leaves', { method: 'PUT', body: { action: 'policy', ...form } })
      toast.success('سیاست مرخصی ذخیره شد — به همهٔ مدیران اطلاع داده شد')
    } catch (e: any) {
      toast.error(e.message || 'ذخیره ناموفق بود')
    } finally {
      setBusy(false)
    }
  }

  const numRow = (label: string, hint: string, key: keyof LeavePolicyForm, min: number, max: number) => (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white/70 p-3">
      <div>
        <p className="text-xs font-black">{label}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
      </div>
      <input
        type="number"
        min={min}
        max={max}
        value={String(form[key])}
        disabled={!canEdit || busy}
        onChange={(e) => setForm((f) => ({ ...f, [key]: Math.max(min, Math.min(max, Number(e.target.value) || min)) }))}
        className="w-20 rounded-lg border border-input bg-white px-2 py-1.5 text-center text-xs font-bold"
      />
    </div>
  )

  const toggleRow = (label: string, hint: string, key: 'requireReplacementNote' | 'blockFridays' | 'blockHolidays') => (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white/70 p-3">
      <div>
        <p className="text-xs font-black">{label}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
      </div>
      <button
        disabled={!canEdit || busy}
        onClick={() => setForm((f) => ({ ...f, [key]: !f[key] }))}
        className={cn(
          'rounded-xl px-5 py-2.5 text-xs font-black transition disabled:opacity-50',
          form[key] ? 'bg-[#0e7a4a] text-white' : 'bg-[#b3372f] text-white'
        )}
      >
        {form[key] ? 'فعال ✅' : 'غیرفعال 🚫'}
      </button>
    </div>
  )

  return (
    <SectionCard
      title="سیاست روزهای مرخصی 🌴"
      subtitle="سقف مرخصی روزانه بر اساس تعداد حاضرین شیفت — جایگزین، استثنا و روزهای بسته"
      icon={<Palmtree size={18} />}
    >
      {!loaded ? (
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
      ) : (
        <div className="flex flex-col gap-3">
          {numRow('حداکثر مرخصی روزانه بدون جایگزین', 'بیشتر از این تعداد، نام جایگزین الزامی است', 'maxPerDayWithoutReplacement', 0, 50)}
          {numRow('سقف روزانهٔ مطلق (hard cap)', 'رسیدن به این تعداد، تأیید را مسدود می‌کند (مگر استثنای مدیر ارشد)', 'hardCapPerDay', 1, 50)}
          {numRow('حداقل حاضرین شیفت', 'برنامه‌ریز ظرفیت — هشدار حضور پایین‌تر از این عدد', 'minPresentPerShift', 1, 100)}
          {toggleRow('ثبت نام جایگزین همیشه الزامی؟', 'با هر هم‌پوشانی، نام جایگزین از مدیر پرسیده می‌شود', 'requireReplacementNote')}
          {toggleRow('جمعه بسته باشد؟', 'تأیید مرخصی روی جمعه ممنوع (استثنا: مدیر ارشد)', 'blockFridays')}
          {toggleRow('تعطیل رسمی بسته باشد؟', 'تأیید مرخصی روی تعطیل رسمی ممنوع (استثنا: مدیر ارشد)', 'blockHolidays')}
          {canEdit ? (
            <button onClick={save} disabled={busy} className="w-full rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white disabled:opacity-50 sm:w-auto sm:px-10">
              {busy ? '…' : 'ذخیرهٔ سیاست مرخصی'}
            </button>
          ) : (
            <p className="text-[10px] text-muted-foreground">فقط مدیران با دسترسی «مدیریت تنظیمات» می‌توانند این سیاست را تغییر دهند</p>
          )}
        </div>
      )}
    </SectionCard>
  )
}

/* ═══════════════════════════ کارت مدیریت تور آموزشی (تب تنظیمات) ═══════════════════════════ */

type TourStateRow = { userId: string; userName: string; color: string; role: string; tourKey: string; done: boolean; step: number; updatedAt: string }
type TourData = { states: TourStateRow[]; usersWithoutState: { id: string; name: string; role: string; color: string }[] }

function TourAdminCard() {
  const [data, setData] = useState<TourData | null>(null)
  const [denied, setDenied] = useState(false)
  const [armAll, setArmAll] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = () => {
    api<TourData>('/api/tours')
      .then((d) => setData(d))
      .catch((e: any) => { if (String(e.message).includes('دسترسی')) setDenied(true) })
  }
  useEffect(load, [])

  const reset = async (payload: { all?: boolean; userId?: string }) => {
    setBusy(true)
    try {
      await api('/api/tours', { method: 'POST', body: { action: 'reset', ...payload } })
      toast.success(payload.all ? 'تور آموزشی برای همه بازنشانی شد 🎓' : 'تور آموزشی این همکار بازنشانی شد 🎓')
      setArmAll(false)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (denied) return null
  return (
    <SectionCard
      title="تور آموزشی 🎓"
      subtitle="چه کسانی تور آشنایی را دیده‌اند — بازنشانی یعنی دفعهٔ بعدِ ورود، تور دوباره پیشنهاد می‌شود"
      icon={<GraduationCap size={18} />}
      actions={
        <button
          onClick={() => (armAll ? reset({ all: true }) : (setArmAll(true), setTimeout(() => setArmAll(false), 5000)))}
          disabled={busy}
          className={cn(
            'flex min-h-11 items-center gap-1.5 rounded-xl border px-4 py-2.5 text-[11px] font-black transition',
            armAll ? 'border-[#b3372f] bg-[#b3372f] text-white shadow' : 'border-[#b3372f]/40 text-[#b3372f] hover:bg-[#b3372f]/10'
          )}
        >
          <RotateCcw size={14} /> {armAll ? 'مطمئنید؟ دوباره بزنید' : 'بازنشانی برای همه'}
        </button>
      }
    >
      {!data ? (
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border bg-white/70 p-3 text-center">
              <p className="text-base font-black text-[#0e7a4a]">{faNum(data.states.filter((s) => s.done).length)}</p>
              <p className="text-[9px] font-bold text-muted-foreground">تور را تمام کرده‌اند</p>
            </div>
            <div className="rounded-xl border border-border bg-white/70 p-3 text-center">
              <p className="text-base font-black text-[#8a6d10]">{faNum(data.states.filter((s) => !s.done).length)}</p>
              <p className="text-[9px] font-bold text-muted-foreground">نیمه‌کاره</p>
            </div>
            <div className="rounded-xl border border-border bg-white/70 p-3 text-center">
              <p className="text-base font-black text-[#c96f4a]">{faNum(data.usersWithoutState.length)}</p>
              <p className="text-[9px] font-bold text-muted-foreground">هنوز شروع نکرده‌اند</p>
            </div>
          </div>
          {data.states.length === 0 && data.usersWithoutState.length === 0 ? (
            <EmptyState emoji="🎓" title="هنوز رکوردی ثبت نشده" hint="وقتی همکاری تور را تمام کند، این‌جا دیده می‌شود" />
          ) : (
            <div className="scroll-gold max-h-72 space-y-1.5 overflow-y-auto pl-1">
              {data.states.map((s) => (
                <div key={`${s.userId}-${s.tourKey}`} className="flex items-center gap-3 rounded-xl border border-border bg-white/70 p-2.5">
                  <Avatar name={s.userName} color={s.color} size={34} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-xs">{s.userName}</b>
                    <span className="text-[9px] font-bold text-muted-foreground">{formatJalaliDateTime(s.updatedAt)}</span>
                  </span>
                  {s.done ? (
                    <span className="shrink-0 rounded-full bg-[#e9f0e4] px-2.5 py-1 text-[9px] font-black text-[#0e7a4a]">تور را دیده ✓</span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-[#fdf6dd] px-2.5 py-1 text-[9px] font-black text-[#8a6d10]">ایستگاه {faNum(s.step + 1)} از ۸</span>
                  )}
                  <button
                    onClick={() => reset({ userId: s.userId })}
                    disabled={busy}
                    title="بازنشانی تور این همکار"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#b3372f] transition hover:bg-[#b3372f]/10"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

/* ═══════════════════════════ Tab 5: هلو آپکس و همگام‌سازی ═══════════════════════════ */

type BridgeHealth = { ok: boolean; mode: string; upstream: string | null; version: string; uptime: number }
type LedgerRow = {
  id: string; kind: string; source: string; status: string
  stats: { created: number; updated: number; skipped: number; errors: number }
  log: { at: string; line: string }[]
  snapshotCount: number
  startedByName: string; startedAt: string; finishedAt: string | null
}
type HolooData = {
  config: { url: string; tokenSet: boolean; bridgeUrl: string; bridgeHealth: BridgeHealth | null }
  ledger: LedgerRow[]
}

const HOLOO_KINDS: Record<string, { label: string; color: string }> = {
  PRODUCTS: { label: 'کالاها', color: '#0e7a4a' },
  SUPPLIERS: { label: 'تأمین‌کنندگان', color: '#c9a227' },
  FULL: { label: 'کامل', color: '#77934a' },
}
const HOLOO_STATUS: Record<string, { label: string; color: string }> = {
  SUCCESS: { label: 'موفق', color: '#0e7a4a' },
  FAILED: { label: 'ناموفق', color: '#b3372f' },
  RUNNING: { label: 'در حال اجرا', color: '#c9a227' },
  ROLLED_BACK: { label: 'بازگردانی‌شده', color: '#6d7a6e' },
}

function HolooTab() {
  const [data, setData] = useState<HolooData | null>(null)
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [bridgeUrl, setBridgeUrl] = useState('http://127.0.0.1:3020')
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [armRun, setArmRun] = useState<string | null>(null)
  const [armRollback, setArmRollback] = useState<string | null>(null)
  const [armPurge, setArmPurge] = useState<string | null>(null)
  const [openLog, setOpenLog] = useState<string | null>(null)

  const load = async () => {
    try {
      const d = await api<HolooData>('/api/admin/holoo')
      setData(d)
      setUrl(d.config.url || '')
      setBridgeUrl(d.config.bridgeUrl || 'http://127.0.0.1:3020')
    } catch (e: any) {
      toast.error(e.message)
    }
  }
  useEffect(() => { load() }, [])

  const health = data?.config.bridgeHealth || null
  const connected = Boolean(health?.ok)

  const saveConfig = async () => {
    setSaving(true)
    try {
      await api('/api/admin/holoo', { method: 'POST', body: { action: 'config', url, token, bridgeUrl } })
      toast.success('تنظیمات اتصال ذخیره شد و تست اتصال انجام شد')
      setToken('')
      await load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const runSync = async (kind: string, label: string) => {
    if (armRun !== kind) {
      setArmRun(kind)
      toast('برای تأیید اجرا، دکمه را دوباره بزنید')
      return
    }
    setArmRun(null)
    setRunning(true)
    const tid = toast.loading(`همگام‌سازی ${label} در حال اجراست…`)
    try {
      const d = await api<{ run: { status: string; stats: { created: number; updated: number; skipped: number; errors: number }; error: string | null } }>(
        '/api/admin/holoo',
        { method: 'POST', body: { action: 'run', kind } }
      )
      if (d.run.status === 'FAILED') {
        toast.error(`همگام‌سازی ناموفق: ${d.run.error || 'خطای نامشخص'} — ردیف در دفتر زمانی ثبت شد`, { id: tid, duration: 8000 })
      } else {
        toast.success(
          `همگام‌سازی انجام شد — ${faNum(d.run.stats.created)} جدید، ${faNum(d.run.stats.updated)} بروزرسانی، ${faNum(d.run.stats.errors)} خطا`,
          { id: tid, duration: 6000 }
        )
      }
    } catch (e: any) {
      toast.error(e.message, { id: tid })
    } finally {
      setRunning(false)
      await load()
    }
  }

  const rollback = async (row: LedgerRow) => {
    if (armRollback !== row.id) {
      setArmRollback(row.id)
      toast('برای تأیید بازگردانی، دکمه را دوباره بزنید')
      return
    }
    setArmRollback(null)
    try {
      const d = await api<{ restored: number; missing: number }>('/api/admin/holoo', { method: 'POST', body: { action: 'rollback', id: row.id } })
      toast.success(`بازگردانی انجام شد — ${faNum(d.restored)} کالا به وضعیت اسنپ‌شات برگشت`)
      await load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const purge = async (row: LedgerRow) => {
    if (armPurge !== row.id) {
      setArmPurge(row.id)
      toast('برای تأیید حذف، دکمه را دوباره بزنید')
      return
    }
    setArmPurge(null)
    try {
      await api('/api/admin/holoo', { method: 'POST', body: { action: 'purge', id: row.id } })
      toast.success('ردیف ناموفق از دفتر حذف شد')
      await load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      {/* اتصال */}
      <SectionCard
        title="اتصال به هلو آپکس"
        subtitle="نرم‌افزار حسابداری هلو (Apex Edition) — نشانی سرور، توکن دسترسی و پل داخلی"
        icon={<Server size={18} />}
        actions={
          <Pill
            label={connected ? `متصل — ${health?.mode === 'live' ? 'مستقیم' : 'شبیه‌ساز'}` : 'قطع'}
            color={connected ? '#0e7a4a' : '#b3372f'}
          />
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Labeled label="آدرس سرور هلو آپکس">
            <input
              dir="ltr"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.10:8080"
              className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </Labeled>
          <Labeled
            label="توکن"
            hint={data?.config.tokenSet ? 'توکن ثبت شده است — برای تغییر، مقدار جدید وارد کنید' : undefined}
          >
            <input
              dir="ltr"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={data?.config.tokenSet ? '••••••••' : 'توکن وب‌سرویس هلو'}
              className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </Labeled>
          <Labeled label="آدرس پل (holoo-bridge)">
            <input
              dir="ltr"
              value={bridgeUrl}
              onChange={(e) => setBridgeUrl(e.target.value)}
              placeholder="http://127.0.0.1:3020"
              className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </Labeled>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#0e7a4a] to-[#12905a] px-5 py-2.5 text-xs font-extrabold text-white shadow-lg disabled:opacity-60"
          >
            <RefreshCw size={14} className={saving ? 'animate-spin' : ''} />
            {saving ? 'در حال ذخیره…' : 'ذخیره و تست اتصال'}
          </button>
          {health && (
            <span className="text-[11px] font-bold text-muted-foreground">
              نسخهٔ پل {faNum(health.version)} — کارکرد {faNum(health.uptime)} ثانیه
            </span>
          )}
        </div>
        {!connected && (
          <p className="mt-3 rounded-xl bg-[#b3372f]/10 p-3 text-[11px] leading-5 font-bold text-[#b3372f]">
            پل قطع است — سرویس holoo-bridge را اجرا کنید:{' '}
            <code dir="ltr" className="rounded bg-white/70 px-1.5 py-0.5 font-black">cd mini-services/holoo-bridge && bun run dev</code>
          </p>
        )}
      </SectionCard>

      {/* اجرای همگام‌سازی */}
      <SectionCard
        title="اجرای همگام‌سازی"
        subtitle="دریافت خودکار کالاها و تأمین‌کنندگان از هلو — پیش از هر اجرا نقطهٔ بازیابی ثبت می‌شود؛ موجودی فروشگاه دست‌نخورده می‌ماند"
        icon={<Database size={18} />}
      >
        <div className="grid gap-2.5 sm:grid-cols-3">
          {[
            { kind: 'PRODUCTS', label: 'همگام‌سازی کالاها', icon: <Package size={15} />, hint: 'کاتالوگ و قیمت‌ها از هلو' },
            { kind: 'SUPPLIERS', label: 'همگام‌سازی تأمین‌کنندگان', icon: <Truck size={15} />, hint: 'شرکت‌های پخش' },
            { kind: 'FULL', label: 'همگام‌سازی کامل', icon: <Layers size={15} />, hint: 'کالا + تأمین‌کننده' },
          ].map((b) => (
            <button
              key={b.kind}
              disabled={running}
              onClick={() => runSync(b.kind, b.label)}
              className={cn(
                'rounded-2xl border p-4 text-right transition disabled:opacity-60',
                armRun === b.kind ? 'border-[#b3372f] bg-[#b3372f]/10' : 'border-border bg-white/70 hover:border-primary/50'
              )}
            >
              <div className="flex items-center gap-2 text-sm font-black text-foreground">
                {b.icon}
                {armRun === b.kind ? 'مطمئنید؟ دوباره بزنید' : b.label}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {armRun === b.kind ? 'با زدن دوباره، همگام‌سازی شروع می‌شود' : b.hint}
              </p>
            </button>
          ))}
        </div>
        {running && (
          <p className="mt-3 animate-pulse text-xs font-bold text-[#8a6d10]">
            ⏳ همگام‌سازی در جریان است — صفحه را نبندید؛ هر صفحه بلافاصله در دفتر زمانی ذخیره می‌شود
          </p>
        )}
      </SectionCard>

      {/* دفتر زمانی (timeline) */}
      <SectionCard
        title="دفتر زمانی همگام‌سازی"
        subtitle="تاریخچهٔ افزایشی با نقطهٔ بازیابی — مثل کامیت‌های گیت؛ هر ردیف یک نقطهٔ برگشت‌پذیر است"
        icon={<History size={18} />}
      >
        {!data ? (
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        ) : data.ledger.length === 0 ? (
          <EmptyState
            emoji="🗄️"
            title="هنوز همگام‌سازی‌ای ثبت نشده"
            hint="با دکمه‌های بالا اولین همگام‌سازی را اجرا کنید تا اولین نقطهٔ بازیابی ساخته شود"
          />
        ) : (
          <div className="border-r-2 border-dashed border-[#c9a227]/50 pr-5">
            <div className="space-y-3">
              {data.ledger.map((r) => {
                const st = HOLOO_STATUS[r.status] || { label: r.status, color: '#6d7a6e' }
                const kd = HOLOO_KINDS[r.kind] || { label: r.kind, color: '#6d7a6e' }
                const isOpen = openLog === r.id
                return (
                  <div key={r.id} className="relative rounded-2xl border border-border bg-white/70 p-3.5">
                    <span
                      className="absolute -right-[27px] top-5 h-3.5 w-3.5 rounded-full border-2 border-white shadow"
                      style={{ background: st.color }}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <code dir="ltr" className="rounded-lg bg-muted px-2 py-0.5 text-[11px] font-black text-foreground">
                        {r.id.slice(0, 6)}
                      </code>
                      <Pill label={kd.label} color={kd.color} />
                      <Pill label={st.label} color={st.color} />
                      <span className="text-[11px] text-muted-foreground">
                        {r.startedByName} — {formatJalaliDateTime(r.startedAt)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold">
                      <span className="text-[#0e7a4a]">+{faNum(r.stats.created)} جدید</span>
                      <span className="text-[#8a6d10]">~{faNum(r.stats.updated)} بروزرسانی</span>
                      <span className="text-foreground/60">{faNum(r.stats.skipped)} صرف‌نظر</span>
                      <span className={cn(r.stats.errors > 0 ? 'text-[#b3372f]' : 'text-foreground/60')}>
                        {faNum(r.stats.errors)} خطا
                      </span>
                      {r.snapshotCount > 0 && (
                        <span className="text-[#5c7236]">نقطهٔ بازیابی: {faNum(r.snapshotCount)} کالا</span>
                      )}
                    </div>
                    {r.log.length > 0 && (
                      <>
                        <button
                          onClick={() => setOpenLog(isOpen ? null : r.id)}
                          className="mt-2 flex items-center gap-1 text-[11px] font-extrabold text-[#0e7a4a]"
                        >
                          {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          {isOpen ? 'بستن لاگ' : 'نمایش لاگ'}
                        </button>
                        {isOpen && (
                          <div className="scroll-gold mt-2 max-h-44 space-y-1 overflow-y-auto rounded-xl bg-[#0b2e20] p-3 text-[11px] leading-5">
                            {r.log.slice(-8).map((l, i) => (
                              <p key={i} className="text-emerald-50/90">
                                <span className="ml-2 font-bold text-[#c9a227]">{formatJalaliDateTime(l.at)}</span>
                                {l.line}
                              </p>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.status === 'SUCCESS' && r.snapshotCount > 0 && (
                        <button
                          onClick={() => rollback(r)}
                          className={cn(
                            'flex items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-extrabold transition',
                            armRollback === r.id
                              ? 'bg-[#b3372f] text-white shadow'
                              : 'border border-[#b3372f]/40 text-[#b3372f] hover:bg-[#b3372f]/10'
                          )}
                        >
                          <RotateCcw size={12} />
                          {armRollback === r.id ? 'مطمئنید؟ دوباره بزنید' : 'بازگردانی از این نقطه (Rollback)'}
                        </button>
                      )}
                      {r.status === 'FAILED' && (
                        <button
                          onClick={() => purge(r)}
                          className={cn(
                            'flex items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-extrabold transition',
                            armPurge === r.id
                              ? 'bg-[#b3372f] text-white shadow'
                              : 'border border-border text-muted-foreground hover:border-[#b3372f]/50 hover:text-[#b3372f]'
                          )}
                        >
                          <Trash2 size={12} />
                          {armPurge === r.id ? 'مطمئنید؟ دوباره بزنید' : 'حذف ردیف ناموفق'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* تضمین علمی */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-[#c9a227]/40 bg-[#fdf6dd]/50 p-4">
        <Info size={16} className="mt-0.5 shrink-0 text-[#8a6d10]" />
        <p className="text-xs leading-5 text-foreground/80">
          تضمین صحت داده: پیش از هر همگام‌سازی یک اسنپ‌شات کامل از موجودی و قیمت کالاها ثبت می‌شود و دفتر زمانی فقط
          افزودنی (append-only) است؛ بنابراین هر تغییر قابل ردیابی و هر نقطه قابل بازگشت است — در صورت قطع برق، خطای
          شبکه یا دادهٔ معیوب از هلو، با یک کلیک به آخرین نقطهٔ سالم برمی‌گردید.
        </p>
      </div>
    </div>
  )
}
