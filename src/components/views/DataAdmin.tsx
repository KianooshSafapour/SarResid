'use client'

/* ═══════════════════════════════════════════════════════════════════════════
 * مدیریت داده‌ها — وضعیت داده‌ها | بازنشانی و پاک‌سازی | ورود از اکسل با تطبیق ستون‌ها
 * گاردهای سمت سرور: GET /api/admin/db → canViewApi('data') ، عملیات مخرب → cap «db.reset»
 * ورود داده → cap «db.import». هر عملیات مخرب با تسلیح دومرحله‌ای و برای
 * پاک‌سازی‌ها با تأیید تایپیِ عبارت فارسی انجام می‌شود (برگشت‌ناپذیر).
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { api, getSessionToken } from '@/lib/client'
import { faNum, faMoney, formatJalaliDateTime, formatJalaliShort, parseFaNumber, todayIso } from '@/lib/jalali'
import { SectionCard, StatCard, Pill, EmptyState, type AppCtx } from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import { cn } from '@/lib/utils'
import { MODULE_LABELS, TIER_MODULES, type LicenseTier } from '@/lib/license'
import { DatabaseBackup, ShieldAlert, FileSpreadsheet, Save, RefreshCw, CheckCircle2, Circle, FlaskConical, KeyRound, Download, AlarmClock } from 'lucide-react'

type DbStats = {
  counts: {
    products: number; providers: number; customers: number; orders: number; orderItems: number
    cheques: number; payments: number; preorders: number; users: number; personnel: number
    zoneCounts: number; tasks: number; messages: number; activities: number; archiveDocs: number
    customerEvents: number; saleEngagements: number; holidayCount: number
  }
  demoFlag: string
  lastReset: { at: string; by: string }
  dbSizeMB: number
  realDataChecklist: { key: string; label: string; done: boolean }[]
}

type TabKey = 'status' | 'backups' | 'danger' | 'import' | 'sandbox' | 'license'

type FieldDef = { key: string; label: string; required: boolean }
type DryResult = {
  valid: number
  invalid: { row: number; error: string }[]
  willCreate: number
  willUpdate: number
  willSkip: number
  sample: Record<string, unknown>[]
}
type ApplyResult = { ok: boolean; created: number; updated: number; skipped: number; errors: { row: number; error: string }[]; totalInvalid: number }

const ALLOWED_ROLES = ['OWNER', 'GM', 'OM', 'ADMIN', 'IT', 'ACC']

/** برچسب فارسی جدول‌های حذف‌شده در خلاصهٔ نتیجه */
const TABLE_FA: Record<string, string> = {
  product: 'کالا', provider: 'تأمین‌کننده', customer: 'مشتری', customerEvent: 'رخداد مشتری',
  orderItem: 'قلم سفارش', order: 'سفارش', cheque: 'چک', payment: 'پرداخت', preOrder: 'پیش‌فاکتور',
  saleEngagement: 'پیشنهاد فروش', complaint: 'شکایت', extraActivity: 'فعالیت ویژه', notifOutbox: 'اعلان',
  zoneCount: 'شمارش زون', laborHour: 'ساعت کاری', leaveRequest: 'مرخصی', urgentQuestion: 'پرسش فوری',
  archiveDocItem: 'قلم سند', archiveDoc: 'سند آرشیو', archiveCustody: 'امانی', docEvent: 'رخداد سند',
  activityLog: 'لاگ فعالیت', award: 'قدردانی',
}

export default function DataAdminView({ ctx }: { ctx: AppCtx }) {
  const [tab, setTab] = useState<TabKey>('status')
  const [rebootMsg, setRebootMsg] = useState<string | null>(null)
  const canLicense = !!ctx.user && (ctx.user.role === 'OWNER' || ctx.user.role === 'ADMIN')

  // گارد سمت کلاینت — سرور هم مستقلاً گارد می‌گذارد
  if (!ctx.user || !ALLOWED_ROLES.includes(ctx.user.role)) {
    return (
      <div className="space-y-6">
        <SectionCard title="مدیریت داده‌ها" subtitle="بازنشانی، پاک‌سازی و ورود دادهٔ واقعی">
          <EmptyState emoji="🔒" title="دسترسی محدود — فقط مالک، مدیران و IT" hint="این بخش داده‌های کل سامانه را اداره می‌کند و برای نقش‌های عملیاتی باز نیست." />
        </SectionCard>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* روکش بازگشت — پس از بازیابی/پاک‌سازی کامل، سرور عمداً ری‌استارت می‌شود (نگهبان بیرونی بالا می‌آورد) */}
      {rebootMsg && <RecoveryOverlay message={rebootMsg} />}

      {/* سربرگ + نوار تب‌ها */}
      <div className="glow-card gold-glow-border arch-top rounded-2xl bg-card p-4 sm:p-5 fade-in-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary"><DatabaseBackup size={22} /></span>
            <div>
              <h1 className="text-lg font-black text-foreground">مدیریت داده‌ها</h1>
              <p className="text-xs text-muted-foreground">وضعیت دیتابیس، پشتیبان‌گیری و بازیابی، سندباکس دمو، لایسنس ماژول‌ها، پاک‌سازی و ورود دادهٔ واقعی از اکسل</p>
            </div>
          </div>
          <nav className="flex flex-wrap gap-1.5 rounded-2xl bg-muted/60 p-1.5">
            {([
              ['status', '📊 وضعیت داده‌ها'],
              ['backups', '💾 پشتیبان‌گیری و بازیابی'],
              ['danger', '🧨 بازنشانی و پاک‌سازی'],
              ['import', '📥 ورود از اکسل (تطبیق ستون‌ها)'],
              ['sandbox', '🧪 سندباکس دمو'],
              ...(canLicense ? [['license', '🔑 لایسنس و ماژول‌ها'] as [TabKey, string]] : []),
            ] as [TabKey, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'rounded-xl px-3.5 py-2 text-xs font-extrabold transition-all',
                  tab === key ? 'bg-primary text-white shadow-md' : 'text-foreground/70 hover:bg-background'
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {tab === 'status' && <StatusTab onGoto={setTab} />}
      {tab === 'backups' && <BackupTab ctx={ctx} onReboot={setRebootMsg} />}
      {tab === 'danger' && <DangerTab />}
      {tab === 'import' && <ImportWizard onDone={() => { /* آمار در تب وضعیت با ورود دوباره تازه می‌شود */ }} />}
      {tab === 'sandbox' && <SandboxTab />}
      {tab === 'license' && canLicense && <LicenseTab />}
    </div>
  )
}

/* ═════════════════════════════ تب ۱ — وضعیت داده‌ها ═════════════════════════════ */

function StatusTab({ onGoto }: { onGoto: (t: TabKey) => void }) {
  const [stats, setStats] = useState<DbStats | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<DbStats>('/api/admin/db').then(setStats).catch((e) => toast.error(e.message))
  }, [])
  useEffect(load, [load])

  const isReal = stats?.demoFlag === 'real'

  const setMode = async (mode: 'demo' | 'real') => {
    setBusy(true)
    try {
      await api('/api/admin/db', { method: 'POST', body: { action: 'set-mode', mode } })
      toast.success(mode === 'real' ? 'سامانه به حالت «دادهٔ واقعی» رفت 🌿' : 'سامانه به حالت «دادهٔ نمایشی» برگشت 🟡')
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const c = stats?.counts
  const tiles: { label: string; value: number; tone: 'emerald' | 'gold' | 'terra' | 'rose' | 'olive' | 'stone'; icon: string; hint?: string }[] = c ? [
    { label: 'کالاها', value: c.products, tone: 'emerald', icon: '📦' },
    { label: 'تأمین‌کنندگان', value: c.providers, tone: 'olive', icon: '🚚' },
    { label: 'مشتریان', value: c.customers, tone: 'gold', icon: '🧑‍🤝‍🧑' },
    { label: 'سفارش‌ها', value: c.orders, tone: 'emerald', icon: '🧾' },
    { label: 'اقلام سفارش', value: c.orderItems, tone: 'stone', icon: '📄' },
    { label: 'چک‌ها', value: c.cheques, tone: 'gold', icon: '💰' },
    { label: 'پرداخت‌ها', value: c.payments, tone: 'terra', icon: '💳' },
    { label: 'پیش‌فاکتورهای فروش', value: c.preorders, tone: 'emerald', icon: '🛒' },
    { label: 'کاربران', value: c.users, tone: 'stone', icon: '👥' },
    { label: 'پروندهٔ پرسنل', value: c.personnel, tone: 'olive', icon: '🗂️' },
    { label: 'شمارش‌های زون', value: c.zoneCounts, tone: 'emerald', icon: '⚖️' },
    { label: 'وظایف', value: c.tasks, tone: 'gold', icon: '✅' },
    { label: 'پیام‌ها', value: c.messages, tone: 'stone', icon: '✉️' },
    { label: 'لاگ فعالیت‌ها', value: c.activities, tone: 'terra', icon: '📜' },
    { label: 'اسناد آرشیو', value: c.archiveDocs, tone: 'olive', icon: '🗄️' },
    { label: 'رخدادهای مشتری', value: c.customerEvents, tone: 'gold', icon: '💞' },
    { label: 'پیشنهادهای فروش', value: c.saleEngagements, tone: 'emerald', icon: '🤝' },
    { label: 'تعطیلات رسمی', value: c.holidayCount, tone: 'rose', icon: '🗓️' },
  ] : []

  return (
    <div className="space-y-5">
      {/* حالت داده + حجم + آخرین بازنشانی */}
      <SectionCard
        title="حالت دادهٔ سامانه"
        subtitle="این نشان تعیین می‌کند سامانه در فاز تمرین است یا بهره‌برداری واقعی"
        icon={<span className="text-lg">{isReal ? '🌿' : '🟡'}</span>}
        actions={
          <ArmedButton
            tone="gold"
            label={isReal ? 'بازگشت به حالت نمایشی' : 'انتقال به دادهٔ واقعی'}
            onClick={() => setMode(isReal ? 'demo' : 'real')}
            disabled={busy}
          />
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <p className="mb-2 text-[11px] font-bold text-muted-foreground">وضعیت فعلی</p>
            {isReal
              ? <Pill label="دادهٔ واقعی 🌿" color="#0e7a4a" bg="#dcfce7" className="px-3 py-1 text-xs" />
              : <Pill label="دادهٔ نمایشی 🟡" color="#8a6d10" bg="#fdf6dd" className="px-3 py-1 text-xs" />}
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              {isReal
                ? 'دادهٔ واقعی فروشگاه — عملیات با احتیاط و پس از پشتیبان‌گیری.'
                : 'دادهٔ دمو برای آموزش و تمرین — تا ورود دادهٔ واقعی.'}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <p className="mb-2 text-[11px] font-bold text-muted-foreground">حجم دیتابیس روی دیسک</p>
            <p className="text-2xl font-black text-[#8a6d10]">{stats ? `${faNum(stats.dbSizeMB)} مگابایت` : '…'}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">فایل SQLite — پشتیبان‌گیری از «مدیریت سامانه»</p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <p className="mb-2 text-[11px] font-bold text-muted-foreground">آخرین بازنشانی دادهٔ نمایشی</p>
            <p className="text-sm font-black text-foreground">
              {stats?.lastReset?.at ? formatJalaliDateTime(stats.lastReset.at) : 'تاکنون بازنشانی نشده'}
            </p>
            {stats?.lastReset?.by && <p className="mt-1 text-[11px] text-muted-foreground">توسط: {stats.lastReset.by}</p>}
          </div>
        </div>
      </SectionCard>

      {/* آمار همهٔ جدول‌ها */}
      <SectionCard
        title="آمار جدول‌ها"
        subtitle="تعداد رکوردهای هر بخش — با ورود و پاک‌سازی، همین‌جا تازه می‌شود"
        icon={<RefreshCw size={18} />}
        actions={
          <button onClick={load} className="rounded-xl border border-border bg-white/60 px-3 py-2 text-xs font-extrabold hover:bg-muted">
            <RefreshCw size={14} className="inline" /> به‌روزرسانی
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {tiles.map((t) => (
            <StatCard key={t.label} label={t.label} value={faNum(t.value)} tone={t.tone} icon={<span className="text-base">{t.icon}</span>} />
          ))}
          {!stats && <p className="col-span-full py-6 text-center text-xs text-muted-foreground">در حال خواندن آمار…</p>}
        </div>
      </SectionCard>

      {/* چک‌لیست دادهٔ واقعی */}
      <SectionCard title="چک‌لیست گذار به دادهٔ واقعی" subtitle="راهنمای گام‌به‌گام برای جایگزینی دادهٔ دمو با دادهٔ واقعی فروشگاه" icon={<CheckCircle2 size={18} />}>
        <div className="space-y-2">
          {stats?.realDataChecklist?.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                {item.done ? <CheckCircle2 size={18} className="text-[#0e7a4a]" /> : <Circle size={18} className="text-muted-foreground" />}
                {item.label}
              </span>
              {item.done
                ? <Pill label="انجام شد ✓" color="#0e7a4a" bg="#dcfce7" />
                : <Pill label="در انتظار" color="#a16207" bg="#fef9c3" />}
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-[#c9a227]/40 bg-[#fdf6dd]/60 p-4">
          <p className="text-xs font-black text-[#8a6d10]">🌿 برای ورود دادهٔ واقعی فروشگاه:</p>
          <ol className="mt-2 list-inside list-decimal space-y-1.5 text-xs leading-6 text-foreground/80">
            <li>سقف دمو را پاک کنید — از تب «🧨 بازنشانی و پاک‌سازی» → «بازنشانی دادهٔ نمایشی».</li>
            <li>از تب «📥 ورود از اکسل» محصولات واقعی را با تطبیق ستون‌ها وارد کنید (سپس تأمین‌کنندگان و مشتریان).</li>
            <li>حالت را به «دادهٔ واقعی 🌿» ببرید تا همه یاد بگیرند سامانه در فاز بهره‌برداری است.</li>
          </ol>
          <button
            onClick={() => onGoto('import')}
            className="mt-3 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-white hover:opacity-90"
          >
            شروع ورود داده از اکسل
          </button>
        </div>
      </SectionCard>
    </div>
  )
}

/* ═════════════════════════════ تب ۲ — پشتیبان‌گیری و بازیابی (round-19i) ═════════════════════════════ */

type BackupFile = { file: string; sizeMB: number; mtimeISO: string }
type RestorePointMeta = { file: string; label: string; at: string; byName: string }

/** عبارت تأیید پاک‌سازی کامل — باید دقیقاً با سرور یکی باشد (بدون trim) */
const WIPE_PHRASE = 'بازگشت به نصب اولیه'

/** برچسب نوع فایل پشتیبان برای نمایش */
function backupKind(file: string): { label: string; fg: string; bg: string } {
  if (file.startsWith('sarresid-backup-pre-restore-')) return { label: 'پیش از بازیابی', fg: '#b3372f', bg: '#fee2e2' }
  if (file.startsWith('sarresid-backup-pre-wipe-')) return { label: 'پیش از پاک‌سازی', fg: '#b3372f', bg: '#fee2e2' }
  if (file.startsWith('restorepoint-')) return { label: 'نقطهٔ بازیابی', fg: '#0e7a4a', bg: '#dcfce7' }
  return { label: 'پشتیبان دستی', fg: '#8a6d10', bg: '#fdf6dd' }
}

function BackupTab({ ctx, onReboot }: { ctx: AppCtx; onReboot: (message: string) => void }) {
  const isOwner = ctx.user?.role === 'OWNER'
  const [backups, setBackups] = useState<BackupFile[] | null>(null)
  const [rps, setRps] = useState<RestorePointMeta[]>([])
  const [busy, setBusy] = useState(false)
  const [rpOpen, setRpOpen] = useState(false)
  const [rpLabel, setRpLabel] = useState('')
  const [restoreTarget, setRestoreTarget] = useState<BackupFile | null>(null)
  const [wipeTyped, setWipeTyped] = useState('')

  const load = useCallback(() => {
    api<{ backups: BackupFile[]; restorePoints: RestorePointMeta[] }>('/api/admin/db?list=backups')
      .then((d) => { setBackups(d.backups || []); setRps(d.restorePoints || []) })
      .catch((e) => toast.error(e.message))
  }, [])
  useEffect(load, [load])

  const makeBackup = async () => {
    setBusy(true)
    try {
      const res = await api<{ ok: boolean; file: string; sizeMB: number }>('/api/admin/db', { method: 'POST', body: { action: 'backup' } })
      toast.success(`پشتیبان تهیه شد — ${res.file} (${faNum(res.sizeMB)} مگابایت)`)
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const makeRestorePoint = async () => {
    if (!rpLabel.trim()) { toast.error('برچسب نقطهٔ بازیابی را بنویسید'); return }
    setBusy(true)
    try {
      const res = await api<{ ok: boolean; file: string; sizeMB: number; label: string }>('/api/admin/db', { method: 'POST', body: { action: 'restore-point', label: rpLabel.trim() } })
      toast.success(`نقطهٔ بازیابی «${res.label}» ساخته شد — ${faNum(res.sizeMB)} مگابایت`)
      setRpOpen(false)
      setRpLabel('')
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** دانلود با نشست دوکاناله (کوکی + هدر توکن) — پیوند ساده در WebViewها توکن ندارد */
  const downloadBackup = async (file: string) => {
    try {
      const headers: Record<string, string> = {}
      const t = getSessionToken()
      if (t) headers['X-Session-Token'] = t
      const res = await fetch(`/api/admin/db?download=${encodeURIComponent(file)}`, { headers, cache: 'no-store' })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || 'دانلود ناموفق بود')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('دانلود پشتیبان شروع شد')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /** بازیابی — پس از پاسخ سرور، روکش بازگشت نمایش داده می‌شود و سرور عمداً ری‌استارت می‌شود */
  const doRestore = async (file: string) => {
    setBusy(true)
    try {
      const res = await api<{ ok: boolean; reboot: boolean; message: string }>('/api/admin/db', { method: 'POST', body: { action: 'restore', file } })
      onReboot(res.message)
    } catch (e) {
      toast.error((e as Error).message)
      setBusy(false)
    }
  }

  const doFactoryWipe = async () => {
    setBusy(true)
    try {
      const res = await api<{ ok: boolean; reboot: boolean; message: string }>('/api/admin/db', { method: 'POST', body: { action: 'factory-wipe', confirm: wipeTyped } })
      onReboot(res.message)
    } catch (e) {
      toast.error((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* جعبهٔ اطلاع — پشتیبان خودکار نگهبان */}
      <div className="flex items-start gap-3 rounded-2xl border border-[#c9a227]/40 bg-[#fdf6dd]/60 p-4 fade-in-up">
        <AlarmClock size={22} className="mt-0.5 shrink-0 text-[#8a6d10]" />
        <div>
          <p className="text-sm font-black text-[#8a6d10]">⏱ پشتیبان خودکار نگهبان سامانه همیشه فعال است</p>
          <p className="mt-1 text-xs leading-6 text-foreground/75">
            نگهبان بیرونی سامانه هر ۱۰ دقیقه یک اسنپ‌شات سازگار (VACUUM INTO) از دیتابیس می‌گیرد و در
            <span dir="ltr" className="mx-1 font-mono font-bold">db/backups/auto</span>
            و آینهٔ بیرونیِ پروژه
            <span dir="ltr" className="mx-1 font-mono font-bold">~/sarresid-backups</span>
            (۱۲ نسخهٔ اخیر) نگه می‌دارد. پشتیبان‌های دستیِ همین بخش جدا از آن‌ها ذخیره می‌شوند.
          </p>
        </div>
      </div>

      {/* کارت اصلی — پشتیبان‌ها و نقاط بازیابی */}
      <SectionCard
        title="پشتیبان‌گیری و بازیابی"
        subtitle="پشتیبان دستی بگیرید، نقطهٔ بازیابی بسازید و در صورت نیاز دیتابیس را به گذشته برگردانید"
        icon={<DatabaseBackup size={19} className="text-[#8a6d10]" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={makeBackup}
              disabled={busy}
              className="rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              💾 تهیهٔ پشتیبان
            </button>
            <button
              onClick={() => { setRpOpen(true); setRpLabel('') }}
              disabled={busy}
              className="rounded-xl border border-[#0e7a4a]/40 bg-white px-4 py-2.5 text-xs font-extrabold text-[#0e7a4a] transition-colors hover:bg-[#f0f7ee] disabled:opacity-40"
            >
              📍 ایجاد نقطهٔ بازیابی
            </button>
          </div>
        }
      >
        {!backups && <p className="py-6 text-center text-xs text-muted-foreground">در حال خواندن فهرست پشتیبان‌ها…</p>}
        {backups && backups.length === 0 && (
          <EmptyState
            emoji="💾"
            title="هنوز پشتیبان دستی گرفته نشده"
            hint="با دکمهٔ «تهیهٔ پشتیبان» یک نسخهٔ کامل از دیتابیس در db/backups ذخیره می‌شود — پیش از هر عملیات مخرب این کار را بکنید."
          />
        )}
        {backups && backups.length > 0 && (
          <div className="scroll-gold max-h-96 overflow-y-auto rounded-xl border border-border">
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-secondary">
                <tr>
                  <th className="p-3 font-black text-foreground">فایل</th>
                  <th className="p-3 font-black text-foreground">نوع</th>
                  <th className="hidden p-3 font-black text-foreground sm:table-cell">حجم</th>
                  <th className="hidden p-3 font-black text-foreground md:table-cell">تاریخ</th>
                  <th className="p-3 font-black text-foreground">اقدام</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => {
                  const kind = backupKind(b.file)
                  const rp = rps.find((r) => r.file === b.file)
                  return (
                    <tr key={b.file} className="border-t border-border/50 odd:bg-muted/20">
                      <td className="max-w-56 p-3 sm:max-w-72">
                        <p className="truncate font-mono text-[11px] font-bold" dir="ltr" title={b.file}>{b.file}</p>
                        {rp && <p className="mt-0.5 text-[10px] text-muted-foreground">برچسب: {rp.label} · توسط {rp.byName}</p>}
                      </td>
                      <td className="p-3">
                        <Pill label={kind.label} color={kind.fg} bg={kind.bg} className="px-2 py-0.5 text-[10px]" />
                      </td>
                      <td className="hidden p-3 font-bold text-foreground/80 sm:table-cell">{faNum(b.sizeMB)} مگابایت</td>
                      <td className="hidden p-3 text-muted-foreground md:table-cell">{formatJalaliDateTime(b.mtimeISO)}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            onClick={() => downloadBackup(b.file)}
                            className="rounded-lg border border-border bg-white/70 px-2.5 py-1.5 text-[11px] font-extrabold text-foreground/80 hover:bg-muted"
                            title="دانلود فایل پشتیبان"
                          >
                            <Download size={13} className="inline" /> دانلود
                          </button>
                          {isOwner ? (
                            <ArmedButton
                              label="♻️ بازیابی"
                              armedLabel="بازیابی دیتابیس؟"
                              onClick={() => setRestoreTarget(b)}
                              disabled={busy}
                              className="px-2.5 py-1.5 text-[11px]"
                            />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">بازیابی فقط برای مالک</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 rounded-xl bg-muted/40 px-4 py-3 text-[11px] leading-5 text-muted-foreground">
          ℹ️ از پشتیبان‌های دستی، ۱۰ نسخهٔ جدیدتر نگه‌داری می‌شود؛ نقاط بازیابی نام‌دار جدا از این چرخش و تا ۱۰ نقطه حفظ می‌شوند.
          دانلود نسخه‌ها و نگهداری در محل امن بیرونی (دیسک دیگر یا فضای ابری) به‌عنوان رویهٔ هفتگی توصیه می‌شود.
        </p>
      </SectionCard>

      {/* منطقهٔ خطر — پاک‌سازی کامل و بازگشت به نصب اولیه */}
      <div className="rounded-2xl border-2 border-[#b3372f]/50 bg-[#b3372f]/5 p-4 fade-in-up sm:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#b3372f]/10 text-xl">🚀</span>
          <div>
            <h3 className="text-sm font-black text-[#b3372f]">پاک‌سازی کامل و بازگشت به نصب اولیه 🚀</h3>
            <p className="text-[11px] text-muted-foreground">فقط مالک سامانه — برگشت‌ناپذیر</p>
          </div>
          {!isOwner && <Pill label="فقط مالک" color="#b3372f" bg="#fee2e2" className="mr-auto px-2.5 py-1 text-[10px]" />}
        </div>
        <p className="text-xs leading-6 text-foreground/80">
          همهٔ داده‌ها — کاربران، کالاها، تأمین‌کنندگان، مشتریان، سفارش‌ها، چک‌ها، لاگ‌ها و تنظیمات — برای همیشه خالی می‌شود و
          سامانه پس از راه‌اندازی مجدد، مستقیم به <span className="font-black">ویزارد نصب اولیه</span> برمی‌گردد (مثل روز اول).
          پیش از اجرا یک پشتیبان امنیتی «پیش از پاک‌سازی» گرفته می‌شود و پس از پاسخ، سرور به‌صورت عمدی ری‌استارت می‌شود.
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-[11px] leading-6 text-[#b3372f]/90">
          <li>اگر فقط دادهٔ دمو را می‌خواهید عوض کنید، از تب «🧨 بازنشانی و پاک‌سازی» ← «بازنشانی دادهٔ نمایشی» استفاده کنید — این کار برای تحویل تازهٔ کامل است.</li>
          <li>پس از اجرا، صفحه با روکش «در حال بازگشت…» تا بازگشت سرور (حداکثر ۲ دقیقه) همراهی‌تان می‌کند.</li>
        </ul>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="mb-1.5 text-[11px] font-bold text-muted-foreground">برای تأیید، عبارت زیر را دقیقاً تایپ کنید:</p>
            <p className="select-none rounded-xl border border-[#b3372f]/40 bg-white px-3 py-2 text-center text-sm font-black text-[#b3372f]">
              {WIPE_PHRASE}
            </p>
            <input
              value={wipeTyped}
              onChange={(e) => setWipeTyped(e.target.value)}
              disabled={!isOwner || busy}
              placeholder="عبارت تأیید را اینجا بنویسید…"
              className="mt-2 w-full rounded-xl border border-input bg-white/90 px-4 py-3 text-sm font-bold outline-none focus:border-[#b3372f] focus:ring-2 focus:ring-[#b3372f]/20 disabled:opacity-50"
            />
          </div>
          <button
            onClick={doFactoryWipe}
            disabled={!isOwner || busy || wipeTyped !== WIPE_PHRASE}
            className="rounded-xl bg-[#b3372f] px-5 py-3 text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'در حال اجرا…' : 'پاک‌سازی کامل و ری‌استارت'}
          </button>
        </div>
      </div>

      {/* مودال ایجاد نقطهٔ بازیابی */}
      {rpOpen && (
        <Modal title="ایجاد نقطهٔ بازیابی" onClose={() => { setRpOpen(false); setRpLabel('') }}>
          <p className="rounded-xl bg-[#fdf6dd] p-3 text-xs font-bold leading-6 text-[#8a6d10]">
            نقطهٔ بازیابی یک اسنپ‌شات کامل و نام‌دار از دیتابیس است که جدا از چرخش پشتیبان‌های دستی نگه‌داری می‌شود (تا ۱۰ نقطهٔ آخر).
            برای لحظه‌های مهم بسازید: پیش از تعویض دفتر، پیش از ورود انبوه داده، پایان سال مالی.
          </p>
          <label htmlFor="rp-label" className="mt-3 block text-xs font-black text-foreground">برچسب نقطهٔ بازیابی</label>
          <input
            id="rp-label"
            value={rpLabel}
            onChange={(e) => setRpLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') makeRestorePoint() }}
            placeholder="مثلاً: پیش از تعویض دفتر سالانه ۱۴۰۵"
            maxLength={60}
            className="mt-1.5 w-full rounded-xl border border-input bg-white/90 px-4 py-3 text-sm font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={makeRestorePoint}
            disabled={busy || !rpLabel.trim()}
            className="mt-3 w-full rounded-xl bg-[#0e7a4a] py-3 text-sm font-extrabold text-white transition-opacity disabled:opacity-40"
          >
            {busy ? 'در حال ساخت…' : 'ساخت نقطهٔ بازیابی'}
          </button>
        </Modal>
      )}

      {/* مودال تأیید بازیابی — با قول پشتیبان امنیتی */}
      {restoreTarget && (
        <Modal title="بازیابی دیتابیس از پشتیبان" onClose={() => setRestoreTarget(null)}>
          <p className="rounded-xl bg-[#b3372f]/10 p-3 text-xs font-bold leading-6 text-[#b3372f]">
            فایل انتخابی جایگزین کل دیتابیس فعلی می‌شود؛ هر چیزی که بعد از زمان این پشتیبان ثبت شده باشد از بین می‌رود.
          </p>
          <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs">
            <p className="font-mono font-bold" dir="ltr">{restoreTarget.file}</p>
            <p className="mt-1 text-muted-foreground">{formatJalaliDateTime(restoreTarget.mtimeISO)} — {faNum(restoreTarget.sizeMB)} مگابایت</p>
          </div>
          <p className="rounded-xl border border-[#0e7a4a]/30 bg-[#dcfce7]/60 p-3 text-xs font-bold leading-6 text-[#0e7a4a]">
            🛡️ قولِ امنیت: پیش از بازیابی یک پشتیبان امنیتی از وضعیت فعلی گرفته می‌شود (sarresid-backup-pre-restore-…)
            و در همین فهرست می‌ماند — اگر پشیمان شدید، بلافاصله می‌توانید به آن برگردید. سپس سامانه به‌صورت خودکار
            راه‌اندازی مجدد می‌شود و نگهبان سامانه تا حداکثر ۲ دقیقه آن را بالا می‌آورد.
          </p>
          <ArmedButton
            label="بازیابی و راه‌اندازی مجدد"
            armedLabel="مطمئنید؟ دوباره بزنید"
            onClick={() => doRestore(restoreTarget.file)}
            disabled={busy}
            className="w-full"
          />
        </Modal>
      )}
    </div>
  )
}

/* ═══════════════════ روکش بازگشت — پس از بازیابی/پاک‌سازی (ری‌استارت عمدی سرور) ═══════════════════ */

/** روکش تمام‌صفحهٔ «در حال بازگشت…» — سرور پس از بازیابی/پاک‌سازی عمداً خاموش می‌شود تا فایل
 *  دیتابیس تعویض‌شده تمیز باز شود؛ نگهبان بیرونی (docs/RESILIENCE.md) تا ~۲ دقیقه آن را بالا می‌آورد.
 *  این صفحه هر ۱۵ ثانیه خودکار تازه‌سازی می‌شود (تا ۳ دقیقه) و بعد راهنمای دستی نشان می‌دهد. */
function RecoveryOverlay({ message }: { message: string }) {
  const [elapsed, setElapsed] = useState(0)
  const [stopped, setStopped] = useState(false)
  useEffect(() => {
    const tick = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    const rel = window.setInterval(() => window.location.reload(), 15000)
    const stop = window.setTimeout(() => { setStopped(true); window.clearInterval(rel) }, 180000)
    return () => { window.clearInterval(tick); window.clearInterval(rel); window.clearTimeout(stop) }
  }, [])
  return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center gap-4 bg-background/95 p-6 text-center backdrop-blur-sm" role="alert" aria-live="assertive">
      <span className="h-16 w-16 animate-spin rounded-full border-4 border-[#c9a227]/30 border-t-[#c9a227]" aria-hidden />
      <h2 className="text-xl font-black text-foreground">در حال بازگشت…</h2>
      <p className="max-w-md text-sm font-bold leading-7 text-foreground/80">{message}</p>
      <div className="max-w-md rounded-2xl border border-[#c9a227]/40 bg-[#fdf6dd]/70 p-4 text-xs leading-6 text-foreground/75">
        سرور در حال راه‌اندازی مجدد است؛ نگهبان سامانه تا حداکثر ۲ دقیقه آن را دوباره بالا می‌آورد و این صفحه
        هر ۱۵ ثانیه خودکار تازه‌سازی می‌شود (تا ۳ دقیقه). پیش از این عملیات پشتیبان امنیتی گرفته شده — داده‌ها محفوظ‌اند.
      </div>
      <p className="text-xs font-bold text-muted-foreground">
        {stopped
          ? 'تازه‌سازی خودکار متوقف شد — اگر سامانه بالا نیامده، چند لحظه بعد صفحه را دستی نوسازی کنید.'
          : `${faNum(elapsed)} ثانیه از فرایند بازگشت می‌گذرد…`}
      </p>
      {stopped && (
        <button onClick={() => window.location.reload()} className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-white hover:opacity-90">
          تلاش دوباره
        </button>
      )}
    </div>
  )
}

/* ═════════════════════════════ تب ۳ — بازنشانی و پاک‌سازی ═════════════════════════════ */

type DangerCard = {
  action: string
  title: string
  icon: string
  desc: string
  phrase: string | null // null = فقط تسلیح دومرحله‌ای؛ متن = تأیید تایپی هم لازم است
  tone: 'rose' | 'gold'
}

const DANGER_CARDS: DangerCard[] = [
  {
    action: 'reset-demo', title: 'بازنشانی دادهٔ نمایشی', icon: '🗄️', tone: 'rose', phrase: null,
    desc: 'همهٔ داده‌های عملیاتی دمو پاک می‌شود: سفارش‌ها و اقلام، چک‌ها، پرداخت‌ها، پیش‌فاکتورهای فروش، رخدادهای مشتری، پیشنهادهای فروش، شکایت‌ها، اعلان‌ها، شمارش‌های زون، ساعت‌کاری، مرخصی‌ها، پرسش‌های فوری، اسناد آرشیو، لاگ فعالیت‌ها و قدردانی‌ها. کاربران، کالاها، تأمین‌کنندگان، مشتریان، تعطیلات، نقش‌ها، زون‌ها و پرسنل حفظ می‌شوند.',
  },
  {
    action: 'purge-products', title: 'حذف کامل محصولات', icon: '📦', tone: 'rose', phrase: 'حذف محصولات',
    desc: 'همهٔ کالاها برای همیشه حذف می‌شوند. اگر سفارشی به کالاها وصل باشد سامانه اجازه نمی‌دهد — ابتدا «بازنشانی دادهٔ نمایشی» را اجرا کنید.',
  },
  {
    action: 'purge-providers', title: 'حذف کامل تأمین‌کنندگان', icon: '🚚', tone: 'rose', phrase: 'حذف تأمین‌کنندگان',
    desc: 'همهٔ تأمین‌کنندگان حذف می‌شوند؛ کدهای طرف‌حساب در اسناد قبلی فقط به‌صورت نام باقی می‌مانند.',
  },
  {
    action: 'purge-customers', title: 'حذف کامل مشتریان', icon: '🧑‍🤝‍🧑', tone: 'rose', phrase: 'حذف مشتریان',
    desc: 'همهٔ مشتریان و رخدادهای CRM آن‌ها (بازدید، خرید، تولد، کمپین‌ها) برای همیشه حذف می‌شود.',
  },
]

function DangerTab() {
  const [armed, setArmed] = useState<string | null>(null)
  const [purge, setPurge] = useState<DangerCard | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(null), 6000)
    return () => clearTimeout(t)
  }, [armed])

  const runAction = async (action: string, confirm?: string) => {
    setBusy(true)
    try {
      const res = await api<{ ok: boolean; summary?: { deleted: Record<string, number> } }>('/api/admin/db', {
        method: 'POST',
        body: { action, confirm },
      })
      const del = res.summary?.deleted || {}
      const keys = Object.keys(del)
      if (keys.length) {
        toast.success(`انجام شد — ${keys.map((k) => `${faNum(del[k])} «${TABLE_FA[k] || k}»`).join('، ')} حذف شد`)
      } else {
        toast.info('انجام شد — موردی برای حذف وجود نداشت')
      }
      setPurge(null)
      setTyped('')
      setArmed(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* هشدار برگشت‌ناپذیری */}
      <div className="flex items-start gap-3 rounded-2xl border border-[#b3372f]/40 bg-[#b3372f]/8 p-4 fade-in-up">
        <ShieldAlert size={22} className="mt-0.5 shrink-0 text-[#b3372f]" />
        <div>
          <p className="text-sm font-black text-[#b3372f]">منطقهٔ خطر — این عملیات‌ها برگشت‌ناپذیرند</p>
          <p className="mt-1 text-xs leading-6 text-foreground/75">
            پیش از هر اقدام، از «مدیریت سامانه» نسخهٔ پشتیبان دیتابیس را بگیرید. هر عملیات با دو بار زدن دکمه تسلیح می‌شود و
            پاک‌سازی‌های کامل به تایپِ عبارت فارسی دقیق نیاز دارند. همهٔ اقدامات در لاگ فعالیت ثبت و به مدیریت اعلان می‌شود.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {DANGER_CARDS.map((d) => (
          <div key={d.action} className="glow-card gold-glow-border rounded-2xl bg-card p-4 sm:p-5 fade-in-up">
            <div className="mb-2 flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#b3372f]/10 text-lg">{d.icon}</span>
              <h3 className="text-sm font-black text-foreground">{d.title}</h3>
            </div>
            <p className="mb-4 text-xs leading-6 text-muted-foreground">{d.desc}</p>
            <ArmedButton
              label={d.phrase ? 'حذف کامل…' : 'بازنشانی کن'}
              onClick={() => {
                if (d.phrase) {
                  setPurge(d)
                  setTyped('')
                } else {
                  runAction(d.action)
                }
              }}
              disabled={busy}
              className="w-full sm:w-auto"
            />
          </div>
        ))}

        {/* نگهداری سبک — اعلان‌های قدیمی */}
        <div className="glow-card rounded-2xl bg-card p-4 sm:p-5 fade-in-up lg:col-span-2">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c9a227]/15 text-lg">🧹</span>
            <h3 className="text-sm font-black text-foreground">پاک‌سازی اعلان‌های قدیمی دمو</h3>
          </div>
          <p className="mb-4 text-xs leading-6 text-muted-foreground">
            اعلان‌های مرکز اعلان‌ها که بیش از ۷ روز از ثبتشان گذشته باشد پاک می‌شود — برای سبک‌ماندن صندوق ورودی تیم. عملیات امن است و دادهٔ عملیاتی را دست نمی‌زند.
          </p>
          <ArmedButton tone="gold" label="پاک‌سازی اعلان‌های بالای ۷ روز" onClick={() => runAction('purge-demo-notifs')} disabled={busy} />
        </div>
      </div>

      {/* مودال تأیید تایپی */}
      {purge && (
        <Modal title={`تأیید نهایی — ${purge.title}`} onClose={() => { setPurge(null); setTyped('') }}>
          <p className="rounded-xl bg-[#b3372f]/10 p-3 text-xs font-bold leading-6 text-[#b3372f]">
            این عملیات برگشت‌ناپذیر است و رکوردها بدون امکان بازیابی حذف می‌شوند. اگر مطمئن نیستید، ابتدا پشتیبان بگیرید.
          </p>
          <p className="text-xs text-muted-foreground">برای تأیید، عبارت زیر را دقیقاً تایپ کنید:</p>
          <p className="select-none rounded-xl border border-[#c9a227]/50 bg-[#fdf6dd] px-3 py-2.5 text-center text-base font-black text-[#8a6d10]">
            {purge.phrase}
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="عبارت تأیید را اینجا بنویسید…"
            className="w-full rounded-xl border border-input bg-white/90 px-4 py-3 text-sm font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <button
            disabled={typed.trim() !== purge.phrase || busy}
            onClick={() => runAction(purge.action, purge.phrase || undefined)}
            className="w-full rounded-xl bg-[#b3372f] py-3 text-sm font-extrabold text-white transition-opacity disabled:opacity-40"
          >
            {busy ? 'در حال اجرا…' : 'حذف برای همیشه'}
          </button>
        </Modal>
      )}
    </div>
  )
}

/* ═════════════════════════════ تب ۳ — ورود از اکسل با تطبیق ستون‌ها ═════════════════════════════ */

const KINDS: { key: 'products' | 'providers' | 'customers'; label: string; icon: string; hint: string }[] = [
  { key: 'products', label: 'کالاها', icon: '📦', hint: 'نام، بارکد، کد هلو، قیمت‌ها، موجودی، تأمین‌کننده' },
  { key: 'providers', label: 'تأمین‌کنندگان', icon: '🚚', hint: 'نام، رابط، تلفن، نوع، شرکت‌های نمایندگی' },
  { key: 'customers', label: 'مشتریان', icon: '🧑‍🤝‍🧑', hint: 'نام، تلفن، تولد شمسی، تیئر، برچسب‌ها' },
]

/** ستون‌های قیمتی — قبل از ارسال، ارقام فارسی/جداکننده‌ها به عدد تبدیل می‌شود */
const NUMERIC_FIELDS = new Set(['buyPrice', 'sellPrice', 'sellPrice2', 'stock', 'reorderLevel'])

/** جدول حدس هوشمند ستون‌ها — تطبیق دقیق و سپس جزئی (فارسی + انگلیسی) */
const GUESS: Record<string, Record<string, string[]>> = {
  products: {
    name: ['نام کالا', 'شرح کالا', 'نام کالای موجود', 'نام', 'کالا', 'شرح', 'عنوان', 'name', 'product', 'product name', 'item'],
    barcodes: ['بارکد', 'بارکد کالا', 'کد بارکد', 'بارکد محصول', 'barcode', 'barcodes'],
    holooCode: ['کد هلو', 'کد کالا در هلو', 'کد کالا', 'کد', 'holoocode', 'holoo code', 'holoocode', 'code'],
    unit: ['واحد', 'واحد شمارش', 'واحد کالا', 'unit'],
    brand: ['برند', 'برند کالا', 'مارک', 'brand'],
    category: ['دسته', 'دسته‌بندی', 'گروه کالا', 'گروه', 'category'],
    buyPrice: ['قیمت خرید', 'بهای خرید', 'قیمت خرید کالا', 'خرید', 'buyprice', 'buy price', 'cost'],
    sellPrice: ['قیمت فروش', 'قیمت فروش کالا', 'فروش', 'قیمت', 'sellprice', 'sell price', 'price'],
    sellPrice2: ['قیمت فروش ۲', 'قیمت فروش دوم', 'فروش ۲', 'قیمت ویژه', 'sellprice2', 'sell price 2'],
    stock: ['موجودی', 'موجودی انبار', 'تعداد', 'شمار', 'stock', 'qty'],
    reorderLevel: ['نقطه سفارش', 'نقطهٔ سفارش', 'حد سفارش', 'سطح سفارش', 'reorder'],
    providerName: ['تأمین‌کننده', 'تامین کننده', 'تأمین', 'پخش', 'فروشنده', 'provider', 'supplier'],
  },
  providers: {
    name: ['نام تأمین‌کننده', 'تامین کننده', 'نام', 'شرکت', 'provider', 'supplier', 'name'],
    personName: ['نام رابط', 'رابط', 'نام فرد', 'نام شخص', 'مسئول', 'contact', 'person'],
    phone: ['تلفن', 'موبایل', 'شماره تماس', 'همراه', 'شماره', 'phone', 'mobile', 'tel'],
    type: ['نوع', 'type'],
    companyNames: ['شرکت‌ها', 'برندها', 'شرکت های نمایندگی', 'نمایندگی', 'companies', 'company'],
  },
  customers: {
    name: ['نام مشتری', 'نام و نام خانوادگی', 'نام', 'مشتری', 'customer', 'name'],
    phone: ['تلفن', 'موبایل', 'شماره تماس', 'همراه', 'شماره', 'phone', 'mobile', 'tel'],
    birthday: ['تاریخ تولد', 'تولد', 'birthday'],
    tier: ['تیئر', 'تییر', 'سطح مشتری', 'tier'],
    tags: ['برچسب', 'تگ', 'برچسب‌ها', 'تگ‌ها', 'tags', 'tag'],
  },
}

const MAP_KEY = (kind: string) => `hz-import-map-${kind}`

const normHeader = (s: string) => s.toLowerCase().replace(/\u200c/g, '').replace(/\s+/g, ' ').trim()

function autoGuess(headers: string[], kind: string): Record<string, number> {
  const aliases = GUESS[kind] || {}
  const map: Record<string, number> = {}
  const claimed = new Set<number>()
  // گذر ۱ — تطبیق دقیق
  for (const key of Object.keys(aliases)) {
    for (const a of aliases[key]) {
      const i = headers.findIndex((h, idx) => !claimed.has(idx) && normHeader(h) === normHeader(a))
      if (i >= 0) { map[key] = i; claimed.add(i); break }
    }
  }
  // گذر ۲ — تطبیق جزئی (شامل‌مشتق دوطرفه با حداقل طول)
  for (const key of Object.keys(aliases)) {
    if (map[key] !== undefined) continue
    for (const a of aliases[key]) {
      const needle = normHeader(a)
      if (needle.length < 3) continue
      const i = headers.findIndex((h, idx) => {
        if (claimed.has(idx)) return false
        const n = normHeader(h)
        return n.length >= 3 && (n.includes(needle) || needle.includes(n))
      })
      if (i >= 0) { map[key] = i; claimed.add(i); break }
    }
  }
  return map
}

function ImportWizard({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<'products' | 'providers' | 'customers'>('products')
  const [fields, setFields] = useState<FieldDef[]>([])
  const [matrix, setMatrix] = useState<string[][]>([])
  const [fileName, setFileName] = useState('')
  const [headerRow, setHeaderRow] = useState(true)
  const [strategy, setStrategy] = useState<'skip' | 'merge'>('merge')
  const [mapping, setMapping] = useState<Record<string, number>>({})
  const [dry, setDry] = useState<DryResult | null>(null)
  const [applied, setApplied] = useState<ApplyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // فیلدهای پلتفرم از سرور — مرجع رسمی تطبیق
  useEffect(() => {
    api<{ kind: string; mappingHint: FieldDef[] }>(`/api/import?kind=${kind}`)
      .then((d) => setFields(d.mappingHint))
      .catch((e) => toast.error(e.message))
  }, [kind])

  const headers = useMemo(() => {
    if (!matrix.length) return []
    if (headerRow) return matrix[0].map((h, i) => (String(h).trim() || `ستون ${faNum(i + 1)}`))
    return matrix[0].map((_, i) => `ستون ${faNum(i + 1)}`)
  }, [matrix, headerRow])

  const dataRows = useMemo(() => {
    const base = headerRow ? matrix.slice(1) : matrix
    return base.filter((r) => r.some((cell) => String(cell).trim() !== ''))
  }, [matrix, headerRow])

  // حدس هوشمند + بازیابی پیش‌تنظیم ذخیره‌شده برای همین نوع داده
  useEffect(() => {
    if (!headers.length || !fields.length) return
    const guessed = autoGuess(headers, kind)
    try {
      const saved = JSON.parse(localStorage.getItem(MAP_KEY(kind)) || 'null') as Record<string, number> | null
      if (saved && typeof saved === 'object') {
        for (const [k, v] of Object.entries(saved)) {
          if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < headers.length) guessed[k] = v
        }
      }
    } catch { /* پیش‌تنظیم خراب — نادیده */ }
    setMapping(guessed)
    setDry(null)
    setApplied(null)
  }, [headers, kind, fields])

  const requiredMissing = fields.filter((f) => f.required && (mapping[f.key] === undefined || mapping[f.key] < 0))

  /** ساخت ردیف‌های تختِ {فیلد پلتفرم: مقدار} — فقط ستون‌های تطبیق‌شده، تبدیل ارقام فارسی */
  const buildRows = (): Record<string, unknown>[] => {
    const out: Record<string, unknown>[] = []
    for (const r of dataRows) {
      const obj: Record<string, unknown> = {}
      for (const f of fields) {
        const col = mapping[f.key]
        if (col === undefined || col < 0 || col >= r.length) continue
        const raw = String(r[col] ?? '').trim()
        if (raw === '') continue
        obj[f.key] = NUMERIC_FIELDS.has(f.key) ? parseFaNumber(raw) : raw
      }
      if (Object.keys(obj).length) out.push(obj)
    }
    return out
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
      const rows = raw.map((r) => (Array.isArray(r) ? r.map((cell) => (cell == null ? '' : String(cell).trim())) : []))
      if (!rows.length) {
        toast.error('برگهٔ اکسل خالی است')
        return
      }
      setMatrix(rows)
      setFileName(file.name)
      setDry(null)
      setApplied(null)
      toast.success(`فایل خوانده شد — ${faNum(rows.length)} سطر، ${faNum(rows[0].length)} ستون`)
    } catch (e) {
      toast.error('خواندن فایل ناموفق بود: ' + (e as Error).message)
    }
  }

  const savePreset = () => {
    try {
      localStorage.setItem(MAP_KEY(kind), JSON.stringify(mapping))
      toast.success(`تطبیق ستون‌ها برای «${KINDS.find((k) => k.key === kind)?.label}» ذخیره شد — دفعهٔ بعد خودکار بازیابی می‌شود (در همین مرورگر)`)
    } catch {
      toast.error('ذخیرهٔ تطبیق در مرورگر ممکن نشد')
    }
  }

  const doDry = async () => {
    setBusy(true)
    try {
      const res = await api<DryResult>('/api/import', { method: 'POST', body: { kind, rows: buildRows(), mode: 'dry-run', strategy } })
      setDry(res)
      setApplied(null)
      if (res.valid === 0) toast.error('هیچ سطر معتبری پیدا نشد — تطبیق ستون‌ها را بررسی کنید')
      else toast.info(`بررسی شد — ${faNum(res.valid)} سطر معتبر، ${faNum(res.invalid.length)} سطر خطادار، ${faNum(res.willCreate)} ایجاد، ${faNum(res.willUpdate)} بروزرسانی`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const doApply = async () => {
    setBusy(true)
    try {
      const res = await api<ApplyResult>('/api/import', { method: 'POST', body: { kind, rows: buildRows(), mode: 'apply', strategy } })
      setApplied(res)
      setDry(null)
      toast.success(`ورود داده انجام شد — ${faNum(res.created)} جدید، ${faNum(res.updated)} بروزرسانی، ${faNum(res.skipped)} ردشدن${res.totalInvalid ? `، ${faNum(res.totalInvalid)} سطر خطادار` : ''}`)
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const stepTitle = (n: number, title: string, hint?: string) => (
    <div className="mb-3 flex items-start gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#c9a227] text-xs font-black text-white">{faNum(n)}</span>
      <div>
        <h3 className="text-sm font-black text-foreground">{title}</h3>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* گام ۱ — نوع داده */}
      <SectionCard title="۱. نوع دادهٔ ورودی را انتخاب کنید" icon={<span className="text-lg">🗂️</span>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {KINDS.map((k) => (
            <button
              key={k.key}
              onClick={() => { setKind(k.key); setMatrix([]); setFileName(''); setDry(null); setApplied(null) }}
              className={cn(
                'rounded-2xl border-2 p-4 text-right transition-all',
                kind === k.key
                  ? 'border-[#0e7a4a] bg-[#0e7a4a]/8 shadow-md'
                  : 'border-border bg-card hover:border-[#c9a227]/60'
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{k.icon}</span>
                <span className="text-sm font-black text-foreground">{k.label}</span>
                {kind === k.key && <Pill label="انتخاب‌شده" color="#0e7a4a" bg="#dcfce7" className="mr-auto" />}
              </div>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{k.hint}</p>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* گام ۲ — فایل + پیش‌نمایش خام */}
      <SectionCard title="۲. فایل اکسل را بدهید" subtitle="xlsx / xls / csv — خواندن فایل در همین مرورگر انجام می‌شود؛ فایل جایی آپلود نمی‌شود" icon={<FileSpreadsheet size={18} />}>
        <div
          className="rounded-2xl border-2 border-dashed border-[#c9a227]/50 bg-[#fdf6dd]/40 p-6 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]) }}
        >
          <FileSpreadsheet size={34} className="mx-auto mb-2 text-[#8a6d10]" />
          <p className="text-sm font-black">{fileName ? `فایل: ${fileName}` : 'فایل را اینجا رها کنید یا انتخاب کنید'}</p>
          <p className="mx-auto mt-1 max-w-md text-[11px] leading-5 text-muted-foreground">
            {matrix.length
              ? `${faNum(matrix.length)} سطر و ${faNum(headers.length)} ستون شناسایی شد`
              : 'سطر اول می‌تواند نام ستون‌ها باشد — در گزینهٔ پایین مشخص می‌کنید'}
          </p>
          <button onClick={() => fileRef.current?.click()} className="mt-3 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-white hover:opacity-90">
            📁 انتخاب فایل
          </button>
          <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" hidden onChange={(e) => onFile(e.target.files?.[0] || undefined)} />
        </div>

        {matrix.length > 0 && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl bg-muted/40 px-4 py-2.5">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold">
                <input type="checkbox" checked={headerRow} onChange={(e) => { setHeaderRow(e.target.checked); setDry(null); setApplied(null) }} className="h-4 w-4 accent-[#0e7a4a]" />
                ردیف اول، نام ستون‌ها است
              </label>
              <span className="text-[11px] text-muted-foreground">ردیف داده: {faNum(dataRows.length)}</span>
            </div>
            <div className="scroll-gold mt-3 max-h-64 overflow-auto rounded-xl border border-border">
              <table className="w-full text-right text-[11px]">
                <thead className="sticky top-0 bg-secondary">
                  <tr>
                    <th className="p-2 text-muted-foreground">#</th>
                    {headers.map((h, i) => (
                      <th key={i} className="whitespace-nowrap p-2 font-black text-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.slice(0, 8).map((r, ri) => (
                    <tr key={ri} className="border-t border-border/50 odd:bg-muted/20">
                      <td className="p-2 text-muted-foreground">{faNum(ri + 1)}</td>
                      {headers.map((_, ci) => (
                        <td key={ci} className="max-w-36 truncate p-2">{r[ci] || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">۸ سطر اول — برای دیدن همهٔ ستون‌ها جدول را اسکرول کنید</p>
          </>
        )}
      </SectionCard>

      {/* گام ۳ — تطبیق ستون‌ها */}
      {matrix.length > 0 && fields.length > 0 && (
        <SectionCard
          title="۳. ستون‌های فایل را به فیلدهای سامانه تطبیق دهید"
          subtitle="حدس اولیه خودکار زده شده — هر مورد را در صورت نیاز عوض کنید؛ ستون‌های ستاره‌دار الزامی‌اند"
          icon={<span className="text-lg">🔗</span>}
          actions={
            <button onClick={savePreset} className="rounded-xl border border-[#c9a227]/50 bg-[#fdf6dd] px-3 py-2 text-xs font-extrabold text-[#8a6d10] hover:bg-[#fdf6dd]/80">
              <Save size={14} className="inline" /> ذخیرهٔ این تطبیق برای همیشه
            </button>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.key} className="block rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                <span className="mb-1.5 flex items-center gap-1 text-xs font-black text-foreground">
                  {f.label}
                  {f.required && <span className="text-[#b3372f]">*</span>}
                </span>
                <select
                  value={mapping[f.key] === undefined || mapping[f.key] < 0 ? '' : String(mapping[f.key])}
                  onChange={(e) => {
                    const v = e.target.value === '' ? -1 : Number(e.target.value)
                    setMapping((m) => ({ ...m, [f.key]: v }))
                    setDry(null)
                    setApplied(null)
                  }}
                  className={cn(
                    'w-full rounded-lg border bg-white/90 px-3 py-2 text-xs font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
                    mapping[f.key] !== undefined && mapping[f.key] >= 0 ? 'border-[#0e7a4a]/40' : 'border-input'
                  )}
                >
                  <option value="">— تطبیق نشده —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>{`${h} · ستون ${faNum(i + 1)}`}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {/* گام ۴ — گزینه‌ها */}
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl bg-muted/40 px-4 py-3">
            <span className="text-xs font-black text-foreground">رفتار با رکوردهای موجود:</span>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-bold">
              <input type="radio" checked={strategy === 'skip'} onChange={() => { setStrategy('skip'); setDry(null); setApplied(null) }} className="h-4 w-4 accent-[#0e7a4a]" />
              رد کردن موجودها (فقط جدیدها ساخته می‌شوند)
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-bold">
              <input type="radio" checked={strategy === 'merge'} onChange={() => { setStrategy('merge'); setDry(null); setApplied(null) }} className="h-4 w-4 accent-[#0e7a4a]" />
              ترکیب با موجودها (فیلدهای پر به‌روز می‌شوند)
            </label>
          </div>

          {requiredMissing.length > 0 && (
            <p className="mt-3 rounded-xl bg-[#fef9c3] p-3 text-xs font-bold text-[#a16207]">
              ⚠️ فیلد الزامی «{requiredMissing[0].label}» هنوز به ستونی تطبیق داده نشده — دکمهٔ اجرا تا آن موقع غیرفعال است.
            </p>
          )}

          {/* گام ۵ و ۶ — پیش‌نمایش و اجرا */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button
              onClick={doDry}
              disabled={busy || dataRows.length === 0 || requiredMissing.length > 0}
              className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              🔍 پیش‌نمایش و بررسی
            </button>
            <ArmedButton
              label="اجرای ورود داده"
              armedLabel="مطمئنید؟ دوباره بزنید"
              onClick={doApply}
              disabled={busy || !dry || dry.valid === 0 || requiredMissing.length > 0}
            />
            {!dry && <span className="text-[11px] text-muted-foreground">برای فعال‌شدن اجرا، ابتدا «پیش‌نمایش و بررسی» را بزنید</span>}
          </div>

          {/* نتیجهٔ بررسی */}
          {dry && (
            <div className="mt-4 space-y-3 rounded-2xl border border-[#c9a227]/40 bg-[#fdf6dd]/40 p-4 fade-in-up">
              <p className="text-xs font-black text-[#8a6d10]">نتیجهٔ بررسی — هیچ داده‌ای هنوز ذخیره نشده است</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <MiniStat label="معتبر" value={dry.valid} tone="text-[#0e7a4a]" />
                <MiniStat label="ایجاد می‌شوند" value={dry.willCreate} tone="text-[#0e7a4a]" />
                <MiniStat label="بروز می‌شوند" value={dry.willUpdate} tone="text-[#8a6d10]" />
                <MiniStat label="رد می‌شوند" value={dry.willSkip} tone="text-[#556057]" />
                <MiniStat label="خطادار" value={dry.invalid.length} tone="text-[#b3372f]" />
              </div>

              {dry.invalid.length > 0 && (
                <div className="scroll-gold max-h-40 overflow-y-auto rounded-xl border border-[#b3372f]/30 bg-white/70">
                  <table className="w-full text-right text-[11px]">
                    <thead className="sticky top-0 bg-[#b3372f]/10">
                      <tr><th className="p-2">سطر</th><th className="p-2">خطا</th></tr>
                    </thead>
                    <tbody>
                      {dry.invalid.slice(0, 50).map((it, i) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="p-2 font-black">{faNum(it.row)}</td>
                          <td className="p-2 text-[#b3372f]">{it.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {dry.sample.length > 0 && (
                <>
                  <p className="pt-1 text-[11px] font-bold text-muted-foreground">نمونهٔ ۱۰ سطر اول پس از تطبیق:</p>
                  <div className="scroll-gold max-h-56 overflow-auto rounded-xl border border-border bg-white/70">
                    <table className="w-full text-right text-[11px]">
                      <thead className="sticky top-0 bg-secondary">
                        <tr>
                          <th className="p-2">نام</th>
                          {kind === 'products' && <><th className="p-2">بارکد</th><th className="p-2">کد هلو</th><th className="p-2">خرید</th><th className="p-2">فروش</th><th className="p-2">موجودی</th><th className="p-2">تأمین‌کننده</th></>}
                          {kind === 'providers' && <><th className="p-2">رابط</th><th className="p-2">تلفن</th><th className="p-2">نوع</th><th className="p-2">شرکت‌ها</th></>}
                          {kind === 'customers' && <><th className="p-2">تلفن</th><th className="p-2">تولد</th><th className="p-2">تیئر</th><th className="p-2">برچسب‌ها</th></>}
                          <th className="p-2">نتیجه</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dry.sample.map((s, i) => (
                          <tr key={i} className="border-t border-border/50">
                            <td className="max-w-40 truncate p-2 font-bold">{String(s.name || '—')}</td>
                            {kind === 'products' && <>
                              <td className="p-2 font-mono" dir="ltr">{String(s.barcode || '—')}</td>
                              <td className="p-2 font-mono" dir="ltr">{String(s.holooCode || '—')}</td>
                              <td className="p-2">{s.buyPrice != null ? faMoney(Number(s.buyPrice)) : '—'}</td>
                              <td className="p-2">{s.sellPrice != null ? faMoney(Number(s.sellPrice)) : '—'}</td>
                              <td className="p-2">{s.stock != null ? faNum(Number(s.stock)) : '—'}</td>
                              <td className="max-w-28 truncate p-2">{String(s.providerName || '—')}</td>
                            </>}
                            {kind === 'providers' && <>
                              <td className="p-2">{String(s.personName || '—')}</td>
                              <td className="p-2" dir="ltr">{String(s.phone || '—')}</td>
                              <td className="p-2">{String(s.type || '—')}</td>
                              <td className="max-w-28 truncate p-2">{String(s.companyNames || '—')}</td>
                            </>}
                            {kind === 'customers' && <>
                              <td className="p-2" dir="ltr">{String(s.phone || '—')}</td>
                              <td className="p-2">{String(s.birthday || '—')}</td>
                              <td className="p-2">{String(s.tier || '—')}</td>
                              <td className="max-w-28 truncate p-2">{String(s.tags || '—')}</td>
                            </>}
                            <td className="p-2">
                              <Pill
                                label={String(s.result || '—')}
                                color={String(s.result).includes('ایجاد') ? '#0e7a4a' : String(s.result).includes('بروزرسانی') ? '#8a6d10' : '#6b7280'}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* نتیجهٔ اجرا */}
          {applied && (
            <div className="mt-4 rounded-2xl border border-[#0e7a4a]/40 bg-[#0e7a4a]/8 p-4 fade-in-up">
              <p className="text-sm font-black text-[#0e7a4a]">🎉 ورود داده کامل شد</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniStat label="ایجاد شد" value={applied.created} tone="text-[#0e7a4a]" />
                <MiniStat label="بروزرسانی شد" value={applied.updated} tone="text-[#8a6d10]" />
                <MiniStat label="رد شد" value={applied.skipped} tone="text-[#556057]" />
                <MiniStat label="خطا" value={applied.totalInvalid} tone="text-[#b3372f]" />
              </div>
              {applied.errors.length > 0 && (
                <div className="scroll-gold mt-3 max-h-36 overflow-y-auto rounded-xl bg-white/70 p-3 text-[11px]">
                  {applied.errors.map((e, i) => (
                    <p key={i}>• سطر {faNum(e.row)}: {e.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </SectionCard>
      )}

      <p className="px-2 text-center text-[11px] leading-5 text-muted-foreground">
        💡 نکته: تطبیق ستون‌ها به‌ازای هر نوع داده در همین مرورگر ذخیره می‌شود («ذخیرهٔ این تطبیق برای همیشه») و دفعهٔ بعد خودکار بازیابی می‌گردد.
        سقف هر بار اجرا ۵٬۰۰۰ سطر است؛ فایل‌های بزرگ را بخش‌بخش وارد کنید.
      </p>
    </div>
  )
}

/* ═════════════════════════════ تب ۴ — سندباکس دمو (round-16) ═════════════════════════════ */

type SetupStatus = {
  done: boolean
  sandbox: boolean
  business: { name?: string; city?: string; kind?: string } | null
  license: { tier?: string; founder?: boolean; modules?: Record<string, { until: string; trial?: boolean }>; updatedAt?: string } | null
}

function SandboxTab() {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<SetupStatus>('/api/setup').then(setStatus).catch((e) => toast.error(e.message))
  }, [])
  useEffect(load, [load])

  const run = async (action: 'sandbox-enter' | 'sandbox-exit' | 'sandbox-reset', successMsg: string) => {
    setBusy(true)
    try {
      await api('/api/setup', { method: 'POST', body: { action } })
      toast.success(successMsg)
      window.location.reload()
    } catch (e) {
      toast.error((e as Error).message)
      setBusy(false)
    }
  }

  const isSandbox = !!status?.sandbox

  return (
    <div className="space-y-5">
      <SectionCard
        title="سندباکس دمو — محیط تمرین کاملاً جداشده"
        subtitle="دادهٔ نمایشی «هایپر نمونه» در یک دیتابیس مستقل است؛ سیستم واقعی شما هرگز دست نمی‌خورد"
        icon={<FlaskConical size={19} className="text-[#8a6d10]" />}
        actions={
          isSandbox ? (
            <Pill label="سندباکس فعال 🧪" color="#8a6d10" bg="#fdf6dd" className="px-3 py-1.5 text-xs" />
          ) : (
            <Pill label="سیستم واقعی 🌿" color="#0e7a4a" bg="#dcfce7" className="px-3 py-1.5 text-xs" />
          )
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <p className="mb-2 text-[11px] font-bold text-muted-foreground">وضعیت فعلی</p>
            {isSandbox
              ? <Pill label="در حال نمایش دادهٔ دمو" color="#8a6d10" bg="#fdf6dd" className="px-3 py-1 text-xs" />
              : <Pill label="دادهٔ واقعی فروشگاه" color="#0e7a4a" bg="#dcfce7" className="px-3 py-1 text-xs" />}
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              {isSandbox
                ? 'تا وقتی از سندباکس خارج نشوید، همهٔ صفحه‌ها دادهٔ نمایشی نشان می‌دهند.'
                : 'همهٔ اتصال‌ها به دیتابیس واقعی فروشگاه برقرار است.'}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <p className="mb-2 text-[11px] font-bold text-muted-foreground">کسب‌وکار فعال در همین لحظه</p>
            <p className="text-sm font-black text-foreground">
              {isSandbox ? 'هایپر نمونه 🧪' : status?.business?.name || '—'}
            </p>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              {isSandbox
                ? 'با کارکنان داستانی (آرش نمونه‌راد و همکاران دمو) — کاملاً تخیلی و برای تمرین.'
                : 'نام ثبت‌شده در نصب سامانه.'}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <p className="mb-2 text-[11px] font-bold text-muted-foreground">جدایی داده‌ها</p>
            <p className="text-xs leading-6 text-foreground/80">
              سندباکس یک فایل دیتابیس <span className="font-black">مستقل</span> است که از قالب آماده ساخته می‌شود؛ سفارش‌ها،
              چک‌ها و مشتریان دمو هیچ ربطی به دادهٔ واقعی ندارند و با خروج، بدون هیچ اثری حذف می‌شوند.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {!isSandbox && (
            <ArmedButton
              tone="gold"
              label="ورود به سندباکس دمو 🧪"
              armedLabel="مطمئنید؟ دوباره بزنید"
              onClick={() => run('sandbox-enter', 'ورود به سندباکس دمو — در حال بارگذاری محیط نمایشی…')}
              disabled={busy}
            />
          )}
          {isSandbox && (
            <>
              <button
                onClick={() => run('sandbox-exit', 'به سیستم واقعی برگشتید — هیچ اثری از دادهٔ دمو باقی نماند ✅')}
                disabled={busy}
                className="rounded-xl bg-[#0e7a4a] px-4 py-2.5 text-xs font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                بازگشت به سیستم واقعی 🌿
              </button>
              <ArmedButton
                label="بازنشانی دادهٔ دمو 🔄"
                armedLabel="دادهٔ دمو از نو ساخته شود؟"
                onClick={() => run('sandbox-reset', 'دادهٔ سندباکس از قالب اولیه از نو ساخته شد')}
                disabled={busy}
              />
            </>
          )}
          <span className="text-[11px] text-muted-foreground">
            {isSandbox
              ? 'خروج = قطع کامل اتصال به دادهٔ نمایشی و بازگشت به دادهٔ واقعی.'
              : 'ورود = تعویض موقت دیتابیس به محیط نمایشی؛ خروجی از سیستم واقعی گرفته نمی‌شود و نیازی به پشتیبان‌گیری نیست.'}
          </span>
        </div>
      </SectionCard>

      <div className="rounded-2xl border border-[#c9a227]/40 bg-[#fdf6dd]/60 p-4">
        <p className="text-xs font-black text-[#8a6d10]">🌿 سندباکس برای چه کاری است؟</p>
        <ul className="mt-2 list-inside list-disc space-y-1.5 text-xs leading-6 text-foreground/80">
          <li>آموزش همکاران تازه‌وارد بدون ترس از خرابکاری در دادهٔ واقعی — هر خطایی مجاز است.</li>
          <li>آزمایش جریان‌های کامل (سفارش، دریافت، تأیید انبار، حسابداری) پیش از بهره‌برداری.</li>
          <li>دادهٔ دمو ۱۰۰٪ جدا است: «هایپر نمونه» با کالاها، تأمین‌کنندگان و پرسنل داستانی ساخته می‌شود.</li>
          <li>با «بازنشانی دادهٔ دمو» سندباکس به حالت اولیهٔ تمیز برمی‌گردد — هر چند بار که بخواهید.</li>
        </ul>
      </div>
    </div>
  )
}

/* ═════════════════════════════ تب ۵ — لایسنس و ماژول‌ها (round-16 — فقط OWNER/ADMIN) ═════════════════════════════ */

const TIER_FA: Record<string, string> = { BASE: 'پایه', PRO: 'حرفه‌ای', ENTERPRISE: 'سازمانی' }

function LicenseTab() {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<SetupStatus>('/api/setup').then(setStatus).catch((e) => toast.error(e.message))
  }, [])
  useEffect(load, [load])

  const lic = status?.license
  const tier = (lic?.tier || 'ENTERPRISE') as LicenseTier
  const founder = !!lic?.founder
  const modules = lic?.modules || {}
  const today = todayIso()

  const editLicense = async (patch: { tier?: LicenseTier; founder?: boolean; moduleMonths?: Record<string, number>; revoke?: string[] }, successMsg: string) => {
    setBusy(true)
    try {
      await api('/api/setup', { method: 'POST', body: { action: 'license', license: patch } })
      toast.success(successMsg)
      load() // بارگذاری دوبارهٔ وضعیت لایسنس پس از موفقیت
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* وضعیت کلی لایسنس */}
      <SectionCard
        title="لایسنس و ماژول‌ها"
        subtitle="پلن اشتراک، حالت بنیان‌گذار و ماژول‌های افزودنی — فقط مالک و مدیر سامانه"
        icon={<KeyRound size={19} className="text-[#8a6d10]" />}
        actions={
          <div className="flex items-center gap-1.5">
            {founder && <Pill label="استقرار بنیان‌گذار 🗝️" color="#8a6d10" bg="#fdf6dd" className="px-3 py-1 text-xs" />}
            <Pill label={`پلن ${TIER_FA[tier] || tier}`} color="#0e7a4a" bg="#dcfce7" className="px-3 py-1 text-xs" />
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <p className="mb-2 text-[11px] font-bold text-muted-foreground">پلن فعلی</p>
            <p className="text-sm font-black text-foreground">پلن {TIER_FA[tier] || tier}</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              {tier === 'BASE' && 'هستهٔ عملیات روزانه — بدون ماژول تخصصی.'}
              {tier === 'PRO' && 'پایه + حسابداری، چک‌ها و CRM مشتریان.'}
              {tier === 'ENTERPRISE' && 'همهٔ ماژول‌ها بدون محدودیت.'}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <p className="mb-2 text-[11px] font-bold text-muted-foreground">حالت بنیان‌گذار</p>
            {founder
              ? <Pill label="فعال — همهٔ ماژول‌ها همیشه باز" color="#8a6d10" bg="#fdf6dd" className="px-3 py-1 text-xs" />
              : <Pill label="غیرفعال — پلن و خریدها حاکم‌اند" color="#556057" bg="#f1efe6" className="px-3 py-1 text-xs" />}
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              {founder ? 'فقط برای استقرار اختصاصی سازندهٔ سامانه.' : 'با فعال‌سازی، همهٔ ماژول‌ها بدون تاریخ انقضا باز می‌شوند.'}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <p className="mb-2 text-[11px] font-bold text-muted-foreground">آخرین به‌روزرسانی لایسنس</p>
            <p className="text-sm font-black text-foreground">
              {lic?.updatedAt ? formatJalaliDateTime(lic.updatedAt) : '—'}
            </p>
          </div>
        </div>

        {/* تعویض پلن */}
        <div className="mt-4 rounded-2xl border border-border bg-muted/20 p-4">
          <p className="mb-2 text-xs font-black text-foreground">تعویض پلن اشتراک</p>
          <div className="flex flex-wrap gap-2">
            {(['BASE', 'PRO', 'ENTERPRISE'] as LicenseTier[]).map((t) => (
              <button
                key={t}
                onClick={() => editLicense({ tier: t }, `پلن به «${TIER_FA[t]}» تغییر کرد`)}
                disabled={busy || tier === t}
                className={cn(
                  'rounded-xl px-4 py-2.5 text-xs font-extrabold transition-all disabled:opacity-50',
                  tier === t
                    ? 'bg-[#0e7a4a] text-white shadow-md'
                    : 'border border-[#0e7a4a]/40 bg-white text-[#0e7a4a] hover:bg-[#f0f7ee]'
                )}
              >
                {tier === t ? `✓ پلن ${TIER_FA[t]}` : `پلن ${TIER_FA[t]}`}
              </button>
            ))}
          </div>
        </div>

        {/* کلید بنیان‌گذار */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#c9a227]/40 bg-[#fdf6dd]/50 p-4">
          <div>
            <p className="text-xs font-black text-[#8a6d10]">🗝️ حالت بنیان‌گذار (بدون محدودیت ماژول)</p>
            <p className="mt-1 text-[11px] leading-5 text-foreground/75">
              {founder ? 'هم‌اکنون فعال است — با غیرفعال‌سازی، پلن و تاریخ خرید ماژول‌ها حاکم می‌شود.' : 'غیرفعال است — فعال‌سازی همهٔ قفل‌های ماژول را برمی‌دارد.'}
            </p>
          </div>
          <ArmedButton
            tone="gold"
            label={founder ? 'غیرفعال‌سازی حالت بنیان‌گذار' : 'فعال‌سازی حالت بنیان‌گذار'}
            armedLabel="مطمئنید؟ دوباره بزنید"
            onClick={() => editLicense({ founder: !founder }, founder ? 'حالت بنیان‌گذار غیرفعال شد' : 'حالت بنیان‌گذار فعال شد — همهٔ ماژول‌ها باز است')}
            disabled={busy}
          />
        </div>
      </SectionCard>

      {/* فهرست ماژول‌ها */}
      <SectionCard
        title="ماژول‌های تخصصی"
        subtitle="هر ماژول را می‌توانید جداگانه برای ۱۲ ماه خرید یا تمدید کنید؛ ماژول‌های داخل پلن خودکار فعال‌اند"
        icon={<span className="text-lg">🧩</span>}
      >
        {founder ? (
          <div className="rounded-2xl border border-[#c9a227]/40 bg-[#fdf6dd]/50 p-5 text-center">
            <p className="text-sm font-black text-[#8a6d10]">🗝️ استقرار بنیان‌گذار فعال است</p>
            <p className="mt-1 text-xs leading-6 text-foreground/75">
              همهٔ {faNum(Object.keys(MODULE_LABELS).length)} ماژول بدون محدودیت زمانی فعال‌اند؛ خرید و تمدید در این حالت لازم نیست.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {Object.entries(MODULE_LABELS).map(([mod, label]) => {
              const inTier = TIER_MODULES[tier]?.includes(mod) || false
              const entry = modules[mod]
              const expired = !!entry && entry.until < today
              return (
                <div key={mod} className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-black text-foreground">{label}</p>
                    {inTier ? (
                      <Pill label={`جزو پلن ${TIER_FA[tier]} ✓`} color="#0e7a4a" bg="#dcfce7" className="px-3 py-1 text-[11px]" />
                    ) : entry && !expired ? (
                      <Pill label={entry.trial ? 'دورهٔ آزمایشی' : `فعال تا ${formatJalaliShort(entry.until)}`} color="#0e7a4a" bg="#dcfce7" className="px-3 py-1 text-[11px]" />
                    ) : expired ? (
                      <Pill label={`منقضی شده (${formatJalaliShort(entry.until)})`} color="#b3372f" bg="#fee2e2" className="px-3 py-1 text-[11px]" />
                    ) : (
                      <Pill label="غیرفعال — قابل خرید" color="#8a6d10" bg="#fdf6dd" className="px-3 py-1 text-[11px]" />
                    )}
                  </div>
                  {!inTier && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => editLicense({ moduleMonths: { [mod]: 12 } }, `${label} — لایسنس ۱۲ ماهه ${entry ? 'تمدید' : 'خرید'} شد`)}
                        disabled={busy}
                        className="rounded-xl bg-[#0e7a4a] px-4 py-2.5 text-xs font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        {entry ? 'تمدید ۱۲ ماه' : 'خرید ۱۲ ماه'}
                      </button>
                      {entry && (
                        <ArmedButton
                          label="لغو اشتراک"
                          armedLabel="لغو قطعی؟ دوباره بزنید"
                          onClick={() => editLicense({ revoke: [mod] }, `لایسنس «${label}» لغو شد`)}
                          disabled={busy}
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p className="mt-4 rounded-xl bg-muted/40 px-4 py-3 text-[11px] leading-5 text-muted-foreground">
          💡 ماژول‌های خریداری‌شده با تاریخ شمسی نمایش داده می‌شوند. پس از هر خرید/تمدید/لغو، وضعیت ماژول‌ها بلافاصله در دسترس همهٔ کاربران
          به‌روز می‌شود و بخش قفل‌شده در منو با نشان 🔒 مشخص می‌گردد.
        </p>
      </SectionCard>
    </div>
  )
}

/* ═════════════════════════════ اجزای مشترک ═════════════════════════════ */

/** دکمهٔ تسلیح‌شونده — کلیک اول قرمز می‌شود («مطمئنید؟ دوباره بزنید») و کلیک دوم اجرا می‌کند */
function ArmedButton({
  label,
  armedLabel = 'مطمئنید؟ دوباره بزنید',
  onClick,
  disabled,
  className,
  tone = 'rose',
}: {
  label: string
  armedLabel?: string
  onClick: () => void
  disabled?: boolean
  className?: string
  tone?: 'rose' | 'gold'
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 5000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false)
          onClick()
        } else {
          setArmed(true)
        }
      }}
      className={cn(
        'rounded-xl px-4 py-2.5 text-xs font-extrabold transition-all disabled:opacity-40',
        armed
          ? 'animate-pulse bg-[#b3372f] text-white shadow-lg ring-2 ring-[#b3372f]/40'
          : tone === 'rose'
            ? 'border border-[#b3372f]/40 bg-[#b3372f]/10 text-[#b3372f] hover:bg-[#b3372f]/20'
            : 'border border-[#c9a227]/50 bg-[#c9a227]/10 text-[#8a6d10] hover:bg-[#c9a227]/20',
        className
      )}
    >
      {armed ? armedLabel : label}
    </button>
  )
}

/** آمار کوچک خلاصهٔ نتیجه */
function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-white/70 px-3 py-2 text-center">
      <p className={cn('text-lg font-black', tone)}>{faNum(value)}</p>
      <p className="text-[10px] font-bold text-muted-foreground">{label}</p>
    </div>
  )
}
