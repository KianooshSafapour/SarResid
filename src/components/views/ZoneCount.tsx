'use client'

/**
 * شمارش کورِ روزانهٔ زون (Blind Zone Count) + نقشهٔ گرافیکی زون‌ها + نظارت
 * — مرچندایزر / مسئول زون: شمارش فیزیکی بدون دیدن عدد سیستم؛ فقط پرچم ✓/⚠ هر قلم + هشدار کلی مغایرت.
 * — جریان مغایرت: «دوباره بشمارید» → باز هم مغایر → ثبت دلیل برای مدیریت (هیچ عددی دیده نمی‌شود).
 * — نظارت: ادمین تعیین می‌کند چه کسی آمار را تأیید کند (مثلاً حسابدار) — confirm/query با cap.
 * — مدیران (SK/OM/GM/PM/OWNER): تابلوی امروز با اعداد کامل، نقشهٔ فروشگاه، زون‌ها و تخصیص، تاریخچهٔ تیم.
 * جدا از شمارش چرخه‌ای مدیران (Science) — آن ابزار برای اصلاح موجودی است.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { enDigits, faNum, faMoney, formatJalaliDateTime, formatJalaliFull, formatJalaliShort, todayIso } from '@/lib/jalali'
import { EmptyState, KeyValue, Labeled, Pill, SectionCard, StatCard } from '@/components/app/ui-bits'
import type { AppCtx } from '@/components/app/ui-bits'
import ZoneMap from '@/components/app/ZoneMap'
import type { MapStatus } from '@/components/app/ZoneMap'
import FloorPlanCanvas from '@/components/app/FloorPlanCanvas'
import type { CanvasBlock } from '@/components/app/FloorPlanCanvas'
import { CATEGORY_EMOJI, ROLE_LABELS } from '@/lib/constants'
import { Modal } from '@/components/views/Orders'
import { cn } from '@/lib/utils'
import {
  CheckCircle2,
  ClipboardList,
  EyeOff,
  Flame,
  HelpCircle,
  History,
  LayoutDashboard,
  Loader2,
  Map as MapIcon,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react'

const EMERALD = '#0e7a4a'
const GOLD = '#c9a227'
const TERRA = '#c96f4a'
const OLIVE = '#77934a'
const ROSE = '#b3372f'
const MANAGER_ROLES = ['SK', 'OM', 'GM', 'PM', 'OWNER']
const CONFIRM_ROLES = ['OWNER', 'GM', 'OM', 'ADMIN', 'ACC'] // تقریب سمت کلاینت cap zonecount.confirm — سرور دقیق اجرا می‌کند
const ZONE_MANAGE_ROLES = ['OM', 'GM', 'OWNER', 'ADMIN'] // تقریب سمت کلاینت cap oversight.manage

type CountItem = {
  productId: string
  productName: string
  unit: string
  countedQty: number
  /** نسخهٔ کور (مرچندایزر) */
  ok?: boolean
  /** نسخهٔ کامل (مدیران) */
  systemQty?: number
  diff?: number
  within?: boolean
}

type Entry = {
  id: string
  forDate: string
  zone: string
  userName: string
  totalItems: number
  hasMismatch: boolean
  createdAt?: string
  status?: string
  mismatchCount?: number
  tolerance?: number
  /* فیلدهای نظارتی — بدون هیچ عدد سیستمی */
  recheckCount?: number
  mismatchReason?: string
  confirmStatus?: string
  confirmNote?: string
  confirmedByName?: string
  confirmedAt?: string
  items: CountItem[]
}

type ProductLite = { id: string; name: string; unit: string; category: string; stock?: number }

type TeamRow = {
  forDate: string
  zone: string
  userName: string
  status: string
  mismatchCount: number
  totalItems: number
  recheckCount?: number
  mismatchReason?: string
  confirmStatus?: string
}

type ZoneData = {
  zones: string[]
  myZones: string[]
  products: ProductLite[]
  myToday: Entry | null
  myTodayZones: string[]
  teamToday: Entry[]
  history: Entry[]
  teamHistory: TeamRow[]
  stats: { myStreak: number; myTotal: number; myMismatchDays: number; todayItems: number }
  today: string
  canConfirm?: boolean
}

type PostResult = {
  entry: Entry
  hasMismatch: boolean
  needRecheck?: boolean
  needReason?: boolean
  finalMismatch?: boolean
  message: string
}

type ApiZone = {
  id: string
  name: string
  type: string
  criticality: string
  countFrequency: string
  color: string
  minStaff: number
  notes: string
  ownerId: string
  ownerName: string
  backupId: string
  backupName: string
}

type StaffAssignment = { userId: string; userName: string; color: string; role: string; zones: string[] }

type EfficiencyInfo = {
  sales30: number
  staffHours: number
  zoneSLH: number | null
  shareIndex: number | null
  band: 'balanced' | 'overstaffed' | 'underserved' | null
  salesTargetExcluded: boolean
  countCompliance: { lastDate: string; dueDate: string; overdue: boolean; cadenceDays: number }
}

type ZonesData = {
  zones: ApiZone[]
  staffAssignments: StaffAssignment[]
  efficiency?: Record<string, EfficiencyInfo>
  canManage?: boolean
  storeTotals?: { sales30: number; staffHours: number }
}

type UserRow = { id: string; name: string; role: string; active: boolean; color?: string; zones?: unknown }

type TabKey = 'board' | 'map' | 'mine' | 'team' | 'zonesadmin'

const QUICK_REASONS = ['جابه‌جایی کالا', 'شکستگی و آسیب', 'خطای ثبت قبلی', 'کسری موجودی', 'سایر']

const ZONE_TYPE_OPTIONS: Array<{ value: string; label: string; hint?: string }> = [
  { value: 'DECOMPRESSION', label: 'زون تنفس (ورودی)', hint: 'آندرهیل: ۳–۵ متر اول فروش‌ساز نیست' },
  { value: 'PERISHABLE', label: 'فاسدشدنی (سرد)' },
  { value: 'DRY', label: 'خشک' },
  { value: 'POWER_AISLE', label: 'راهروی قدرت' },
  { value: 'CHECKOUT', label: 'صندوق‌ها' },
  { value: 'BACKROOM', label: 'انبار پشتی' },
]

const TYPE_FA: Record<string, string> = Object.fromEntries(ZONE_TYPE_OPTIONS.map((o) => [o.value, o.label]))

const CADENCE_OPTIONS = [
  { value: 'WEEKLY', label: 'هفتگی (A)' },
  { value: 'BIWEEKLY', label: 'دوهفتگی (B)' },
  { value: 'MONTHLY', label: 'ماهانه (C)' },
]

const CRITICALITY_OPTIONS = [
  { value: 'A', label: 'A — پرگردش' },
  { value: 'B', label: 'B — متوسط' },
  { value: 'C', label: 'C — آرام‌گردش' },
]

const PALETTE = ['#0e7a4a', '#c9a227', '#c96f4a', '#77934a', '#b3372f', '#0b2e20']

const BAND_FA: Record<string, { label: string; color: string }> = {
  balanced: { label: 'متعادل', color: OLIVE },
  overstaffed: { label: 'نیروی بیش از فروش', color: GOLD },
  underserved: { label: 'فروش بیش از نیرو', color: ROSE },
}

function parseZones(z: unknown): string[] {
  if (Array.isArray(z)) return z.filter((x): x is string => typeof x === 'string')
  if (typeof z === 'string') {
    try {
      const v = JSON.parse(z || '[]')
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  }
  return []
}

const okFlag = (it: CountItem) => it.ok ?? it.within ?? true

/** عدد اعشاری با ارقام فارسی (۰٫۸۵) */
const faDec = (v: number | null | undefined) => (v === null || v === undefined ? '—' : faNum(String(v).replace('.', '٫')))

const cadenceLabel = (f: string) => CADENCE_OPTIONS.find((c) => c.value === f)?.label || f

/* ───────────── اجزای مشترک ───────────── */

function ZonePicker({ zones, value, onPick }: { zones: string[]; value: string; onPick: (z: string) => void }) {
  if (!zones.length)
    return <EmptyState emoji="🗺️" title="زونی تعریف نشده" hint="زون‌ها از دستهٔ کالاهای فعال ساخته می‌شوند؛ ابتدا از «محصولات» کالا ثبت کنید." />
  return (
    <div className="flex flex-wrap gap-2">
      {zones.map((z) => {
        const active = z === value
        return (
          <button
            key={z}
            type="button"
            onClick={() => onPick(z)}
            className={cn(
              'rounded-xl border px-3.5 py-2 text-sm font-bold transition-all active:scale-95',
              active
                ? 'border-transparent bg-[#0e7a4a] text-white shadow-md'
                : 'border-border bg-card text-foreground hover:border-[#0e7a4a]/40'
            )}
          >
            <span className="ml-1">{CATEGORY_EMOJI[z] || '📦'}</span> {z}
          </button>
        )
      })}
    </div>
  )
}

function StepperRow({ name, unit, value, onChange }: { name: string; unit: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-white/80 p-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-foreground">{name}</div>
        <div className="text-[11px] text-muted-foreground">{unit || 'دانه'}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5" dir="ltr">
        <button
          type="button"
          aria-label={`کم کردن ${name}`}
          onClick={() => onChange(value - 1)}
          className="h-11 w-11 rounded-xl bg-secondary text-2xl font-black leading-none text-[#0e7a4a] transition active:scale-90"
        >
          −
        </button>
        <input
          dir="ltr"
          inputMode="numeric"
          aria-label={`تعداد شمارش ${name}`}
          value={faNum(value)}
          onChange={(e) => {
            const n = enDigits(e.target.value).replace(/\D/g, '')
            onChange(n === '' ? 0 : Number(n))
          }}
          onFocus={(e) => e.currentTarget.select()}
          className="h-11 w-16 rounded-xl border border-input bg-white text-center text-lg font-black tabular-nums outline-none focus:border-[#0e7a4a] focus:ring-2 focus:ring-[#0e7a4a]/20"
        />
        <button
          type="button"
          aria-label={`اضافه کردن ${name}`}
          onClick={() => onChange(value + 1)}
          className="h-11 w-11 rounded-xl bg-[#0e7a4a] text-2xl font-black leading-none text-white transition active:scale-90"
        >
          +
        </button>
      </div>
    </div>
  )
}

function ResultBanner({ result }: { result: { hasMismatch: boolean; message: string; items: CountItem[] } }) {
  const badCount = result.items.filter((it) => !okFlag(it)).length
  return (
    <div
      className={cn(
        'fade-in-up rounded-2xl border-2 p-4',
        result.hasMismatch ? 'border-[#c9a227]/50 bg-[#c9a227]/10' : 'border-[#0e7a4a]/40 bg-[#0e7a4a]/10'
      )}
    >
      <div className="mb-2 flex items-start gap-2">
        <span className="text-2xl">{result.hasMismatch ? '⚠️' : '✅'}</span>
        <p className={cn('text-sm font-bold leading-6', result.hasMismatch ? 'text-[#8a6d10]' : 'text-[#0e7a4a]')}>
          {result.message}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {result.items.map((it) => (
          <span
            key={it.productId}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold',
              okFlag(it) ? 'bg-[#0e7a4a]/15 text-[#0e7a4a]' : 'bg-[#c9a227]/25 text-[#8a6d10]'
            )}
          >
            {okFlag(it) ? '✓' : '⚠'} {it.productName}
          </span>
        ))}
      </div>
      {result.hasMismatch && (
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          {faNum(badCount)} قلم علامت‌دار با موجودی هلو نخواند؛ فقط مدیر انبار/عملیات عدد سیستم را می‌بیند و اصلاح را انجام می‌دهد — به شما هیچ عددی نشان داده نمی‌شود.
        </p>
      )}
    </div>
  )
}

/** نشانگر مراحل جریان مغایرت: ۱ ثبت ۲ بازبینی ۳ توضیح */
function MiniStepper({ current }: { current: number }) {
  const steps = ['ثبت', 'بازبینی', 'توضیح']
  return (
    <div className="flex items-center justify-center gap-1 rounded-xl bg-muted/60 px-3 py-2.5">
      {steps.map((s, i) => {
        const n = i + 1
        const active = n === current
        const done = n < current
        return (
          <div key={s} className="flex items-center gap-1.5">
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-black',
                active ? 'bg-[#c9a227] text-white shadow' : done ? 'bg-[#0e7a4a] text-white' : 'border border-border bg-white text-muted-foreground'
              )}
            >
              {faNum(n)}
            </span>
            <span className={cn('text-xs font-bold', active ? 'text-foreground' : 'text-muted-foreground')}>{s}</span>
            {n < 3 && <span className="mx-1 h-px w-4 bg-border" />}
          </div>
        )
      })}
    </div>
  )
}

/** مودال جریان مغایرت — کاملاً کور: هیچ عددی از سیستم نمایش داده نمی‌شود */
function MismatchFlowModal({
  step,
  zone,
  reason,
  setReason,
  busy,
  onRecheck,
  onFinal,
  onClose,
}: {
  step: 2 | 3
  zone: string
  reason: string
  setReason: (v: string) => void
  busy: boolean
  onRecheck: () => void
  onFinal: () => void
  onClose: () => void
}) {
  return (
    <Modal title={`مغایرت شمارش — زون ${zone}`} onClose={onClose}>
      <MiniStepper current={step} />
      {step === 2 ? (
        <>
          <div className="rounded-2xl border-2 border-[#c9a227]/50 bg-[#c9a227]/10 p-4">
            <p className="text-sm font-bold leading-7 text-[#8a6d10]">
              ⚠️ عدد شما با سامانه نمی‌خواند — لطفاً همهٔ اقلام زون را دوباره بشمارید.
            </p>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              هیچ عددی از سیستم نمایش داده نمی‌شود؛ فقط شمارش درست خودتان مهم است. اگر مطمئنید عددتان درست است، دوباره شمرده‌اید را تأیید کنید تا مرحلهٔ توضیح باز شود.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRecheck}
              disabled={busy}
              className="min-h-[44px] flex-1 rounded-xl bg-[#0e7a4a] px-4 py-2.5 text-sm font-black text-white shadow-md transition hover:brightness-110 active:scale-95 disabled:opacity-60"
            >
              {busy ? 'در حال ثبت…' : 'بله، دوباره شمردم ✓'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground transition hover:border-[#c9a227]/50 active:scale-95"
            >
              اصلاح اعداد
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-2xl border-2 border-[#c9a227]/50 bg-[#c9a227]/10 p-4">
            <p className="text-sm font-bold leading-7 text-[#8a6d10]">
              دوباره شمرده شد و باز هم مغایرت است — لطفاً دلیل آن را برای مدیریت بنویسید.
            </p>
          </div>
          <Labeled label="دلیل مغایرت">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="مثلاً: دو کارتن از قفسه جابه‌جا شده بود…"
              className="w-full rounded-xl border border-input bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0e7a4a] focus:ring-2 focus:ring-[#0e7a4a]/20"
            />
          </Labeled>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r === 'سایر' ? '' : r)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[11px] font-bold transition active:scale-95',
                  reason === r ? 'border-transparent bg-[#77934a] text-white' : 'border-border bg-card text-muted-foreground hover:border-[#77934a]/50'
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onFinal}
            disabled={busy || reason.trim().length < 3}
            className="min-h-[44px] w-full rounded-xl bg-[#b3372f] px-4 py-2.5 text-sm font-black text-white shadow-md transition hover:brightness-110 active:scale-95 disabled:opacity-50"
          >
            {busy ? 'در حال ثبت…' : 'ثبت نهایی مغایرت برای مدیریت'}
          </button>
        </>
      )}
      <p className="text-center text-[11px] leading-5 text-muted-foreground">
        عدد سیستم هرگز نشان داده نمی‌شود — این ثبت فقط برای اصلاح موجودی و ثبت دلیل است.
      </p>
    </Modal>
  )
}

/* ───────────── اجزای نظارت (تأیید/سؤال) ───────────── */

function ConfirmPill({ entry, compact }: { entry: Entry; compact?: boolean }) {
  const st = entry.confirmStatus || 'PENDING'
  if (st === 'CONFIRMED')
    return <Pill label={`✅ تأیید شد${entry.confirmedByName ? ` — ${entry.confirmedByName}` : ''}`} color={EMERALD} />
  if (st === 'QUERIED') return <Pill label="❓ سؤال ناظر" color={ROSE} />
  return <Pill label={compact ? '⏳' : '⏳ در انتظار تأیید'} color={GOLD} />
}

function ConfirmActions({ entry, onDone }: { entry: Entry; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [queryOpen, setQueryOpen] = useState(false)
  const [note, setNote] = useState('')
  const confirmed = entry.confirmStatus === 'CONFIRMED'

  const act = async (action: 'confirm' | 'query') => {
    setBusy(true)
    try {
      await api('/api/zonecount', { method: 'PATCH', body: { id: entry.id, action, note } })
      toast.success(action === 'confirm' ? 'آمار شمارش تأیید شد ✅' : 'سؤال ناظر برای شمارنده ارسال شد')
      setQueryOpen(false)
      setNote('')
      onDone()
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'خطا در ثبت نظارت')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {!confirmed && (
        <button
          type="button"
          onClick={() => act('confirm')}
          disabled={busy}
          className="flex min-h-[36px] items-center gap-1 rounded-lg bg-[#0e7a4a]/10 px-2.5 py-1.5 text-[11px] font-black text-[#0e7a4a] transition hover:bg-[#0e7a4a]/20 active:scale-95 disabled:opacity-50"
        >
          <CheckCircle2 size={13} /> تأیید
        </button>
      )}
      <button
        type="button"
        onClick={() => setQueryOpen(true)}
        disabled={busy}
        className="flex min-h-[36px] items-center gap-1 rounded-lg bg-[#c9a227]/15 px-2.5 py-1.5 text-[11px] font-black text-[#8a6d10] transition hover:bg-[#c9a227]/25 active:scale-95 disabled:opacity-50"
      >
        <HelpCircle size={13} /> سؤال از شمارنده
      </button>
      {queryOpen && (
        <Modal title={`سؤال ناظر — زون ${entry.zone} (${entry.userName})`} onClose={() => setQueryOpen(false)}>
          <p className="text-xs leading-6 text-muted-foreground">
            یادداشت شما برای شمارنده نمایش داده می‌شود («ناظر سوال دارد: …») و او می‌تواند شمارش را اصلاح و دوباره ثبت کند.
          </p>
          <Labeled label="یادداشت سؤال">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="مثلاً: لطفاً ردیف آخر قفسه را هم بشمارید"
              className="w-full rounded-xl border border-input bg-white px-3 py-2.5 text-sm outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20"
            />
          </Labeled>
          <button
            type="button"
            onClick={() => act('query')}
            disabled={busy}
            className="min-h-[44px] w-full rounded-xl bg-[#c9a227] px-4 py-2.5 text-sm font-black text-white shadow-md transition hover:brightness-110 active:scale-95 disabled:opacity-60"
          >
            {busy ? 'در حال ارسال…' : 'ارسال سؤال به شمارنده'}
          </button>
        </Modal>
      )}
    </div>
  )
}

/* ───────────── شمارش شخصی ───────────── */

function CountPanel({
  zone,
  products,
  qtys,
  touched,
  saving,
  autoSaved,
  onQty,
  onSubmit,
}: {
  zone: string
  products: ProductLite[]
  qtys: Record<string, number>
  touched: Record<string, boolean>
  saving: boolean
  autoSaved: boolean
  onQty: (pid: string, v: number) => void
  onSubmit: () => void
}) {
  const entered = products.filter((p) => touched[p.id]).length
  return (
    <SectionCard
      title={`ثبت شمارش — زون ${zone}`}
      subtitle="شمارش فیزیکی قفسه‌ها را با دکمه‌های ‎−/+‎ یا تایپ عدد وارد کنید"
      icon={<ClipboardList size={18} />}
      actions={
        autoSaved ? (
          <span className="rounded-lg bg-[#0e7a4a]/10 px-2.5 py-1 text-[11px] font-black text-[#0e7a4a]">ذخیرهٔ خودکار ✓</span>
        ) : entered ? (
          <span className="text-[11px] text-muted-foreground">{faNum(entered)} قلم وارد شده</span>
        ) : undefined
      }
    >
      {products.length === 0 ? (
        <EmptyState emoji="📦" title="کالایی در این زون ثبت نشده" hint="زون دیگری را انتخاب کنید یا از «محصولات» کالای جدید اضافه کنید." />
      ) : (
        <div className="max-h-[46vh] space-y-2 overflow-y-auto scroll-gold pl-1">
          {products.map((p) => (
            <StepperRow key={p.id} name={p.name} unit={p.unit} value={qtys[p.id] || 0} onChange={(v) => onQty(p.id, v)} />
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xs text-[11px] leading-5 text-muted-foreground sm:max-w-none">
          عددی که وارد می‌کنید فقط شمارش فیزیکی شماست؛ هیچ عددی از سیستم نمایش داده نمی‌شود تا شمارش شما بی‌طرف بماند.
        </p>
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving || !zone}
          className="shrink-0 rounded-xl bg-[#0e7a4a] px-5 py-3 text-sm font-black text-white shadow-md transition hover:brightness-110 active:scale-95 disabled:opacity-60"
        >
          {saving ? 'در حال ثبت…' : 'ثبت شمارش امروز 🌿'}
        </button>
      </div>
    </SectionCard>
  )
}

function MyHistory({ rows, onDelete }: { rows: Entry[]; onDelete: (id: string) => void }) {
  const today = todayIso()
  if (!rows.length)
    return (
      <EmptyState
        emoji="🧺"
        title="هنوز شمارشی ثبت نکرده‌اید"
        hint="اولین شمارش امروز را ثبت کنید تا زنجیرهٔ روزهای پیوسته شروع شود."
      />
    )
  return (
    <div className="max-h-[46vh] space-y-2 overflow-y-auto scroll-gold pl-1">
      {rows.map((e) => {
        const queried = e.confirmStatus === 'QUERIED'
        return (
          <div
            key={e.id}
            className={cn(
              'rounded-xl border bg-white/70 px-3 py-2',
              queried ? 'border-[#b3372f]/50' : 'border-border/60'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-foreground">
                  {CATEGORY_EMOJI[e.zone] || '📦'} {e.zone}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {formatJalaliShort(e.forDate)} — {faNum(e.totalItems)} قلم
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {e.hasMismatch ? <Pill label="⚠ مغایرت" color={ROSE} /> : <Pill label="✓ مطابق" color={EMERALD} />}
                <ConfirmPill entry={e} />
                {(e.recheckCount || 0) > 0 && (
                  <Pill label={`دوباره‌شماری: ${faNum(e.recheckCount || 0)}`} color={TERRA} />
                )}
                {e.forDate === today && (
                  <button
                    type="button"
                    onClick={() => onDelete(e.id)}
                    title="حذف ثبت امروز"
                    className="rounded-lg p-1 text-muted-foreground hover:bg-[#b3372f]/10 hover:text-[#b3372f]"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            {queried && e.confirmNote && (
              <p className="mt-1.5 rounded-lg bg-[#b3372f]/10 px-2.5 py-1.5 text-[11px] font-bold leading-5 text-[#b3372f]">
                ❓ ناظر سوال دارد: {e.confirmNote}
              </p>
            )}
            {e.hasMismatch && e.mismatchReason && (
              <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">دلیل ثبت‌شدهٔ شما: {e.mismatchReason}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** چرا عدد سیستم را نمی‌بینید؟ — آموزش سوگیری لنگر و شمارش کور */
function BlindWhy() {
  return (
    <div className="fade-in-up rounded-2xl border border-[#77934a]/30 bg-[#77934a]/10 p-4">
      <h3 className="mb-1.5 flex items-center gap-2 text-sm font-black text-[#5c7236]">
        <EyeOff size={16} /> چرا عدد سیستم را نمی‌بینید؟
      </h3>
      <p className="text-xs leading-6 text-foreground/80">
        این صفحه عمداً «شمارش کور» است: وقتی شمارنده عدد موجودی سیستم را ببیند، ناخودآگاه شمارش خودش را به سمت همان عدد
        می‌کشاند — به این پدیده «سوگیری لنگر» می‌گویند. مطالعات شمارش چرخه‌ای نشان می‌دهد شمارشِ مستقل بدون دیدن عدد مرجع،
        خطای انسانی را به‌طور معنادار کم می‌کند و دقت موجودی واقعی بالاتر می‌رود. اگر شمارش شما با موجودی هلو نخواند،
        ابتدا همهٔ اقلام را دوباره می‌شمارید؛ اگر باز هم نخواند، دلیلش را برای مدیریت می‌نویسید — هیچ عددی به شما نشان
        داده نمی‌شود.
      </p>
    </div>
  )
}

/* ───────────── اجزای مدیران ───────────── */

function BoardTab({
  data,
  onDelete,
  onScience,
  canConfirm,
  onConfirmDone,
}: {
  data: ZoneData | null
  onDelete: (id: string) => void
  onScience: () => void
  canConfirm: boolean
  onConfirmDone: () => void
}) {
  const [openZone, setOpenZone] = useState('')
  if (!data) return null
  const byZone: Record<string, Entry[]> = {}
  for (const e of data.teamToday) {
    if (!byZone[e.zone]) byZone[e.zone] = []
    byZone[e.zone].push(e)
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {data.zones.map((z) => {
        const entries = byZone[z] || []
        const mismatches = entries.filter((e) => e.hasMismatch).length
        const active = z === openZone
        return (
          <div
            key={z}
            className={cn(
              'glow-card rounded-2xl border-2 bg-card p-3.5 transition-all',
              active ? 'border-[#0e7a4a]/50 shadow-md' : 'border-border/60'
            )}
          >
            <button
              type="button"
              onClick={() => setOpenZone(active ? '' : z)}
              className="flex w-full items-center justify-between gap-2 text-right"
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{CATEGORY_EMOJI[z] || '📦'}</span>
                <div>
                  <div className="text-sm font-black text-foreground">{z}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {entries.length ? `${faNum(entries.length)} شمارش ثبت‌شده` : 'هنوز ثبت نشده'}
                  </div>
                </div>
              </div>
              {entries.length === 0 ? (
                <Pill label="⏳ مانده" color={GOLD} />
              ) : mismatches > 0 ? (
                <Pill label={`⚠ ${faNum(mismatches)} مغایر`} color={ROSE} />
              ) : (
                <Pill label="✓ مطابق" color={EMERALD} />
              )}
            </button>
            {active && (
              <div className="mt-3 space-y-2 border-t border-dashed border-border pt-3">
                {entries.length === 0 && (
                  <p className="text-xs text-muted-foreground">برای این زون امروز شمارشی ثبت نشده است.</p>
                )}
                {entries.map((e) => (
                  <div key={e.id} className="rounded-xl bg-white/80 p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black text-white"
                          style={{ background: OLIVE }}
                        >
                          {e.userName?.[0] || '؟'}
                        </span>
                        <span className="text-xs font-bold text-foreground">{e.userName}</span>
                        {e.createdAt && <span className="text-[10px] text-muted-foreground">{formatJalaliDateTime(e.createdAt)}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {e.hasMismatch ? (
                          <Pill label={`⚠ ${faNum(e.mismatchCount || 0)} قلم مغایر`} color={ROSE} />
                        ) : (
                          <Pill label="✓ مطابق" color={EMERALD} />
                        )}
                        <Pill label={`${faNum(e.totalItems)} قلم`} color={OLIVE} />
                        <ConfirmPill entry={e} compact />
                        {(e.recheckCount || 0) > 0 && <Pill label={`↻ ${faNum(e.recheckCount || 0)}`} color={TERRA} />}
                        <button
                          type="button"
                          onClick={() => onDelete(e.id)}
                          title="حذف ثبت"
                          className="rounded-lg p-1 text-muted-foreground hover:bg-[#b3372f]/10 hover:text-[#b3372f]"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {e.mismatchReason && (
                      <p className="mt-1.5 rounded-lg bg-[#c9a227]/10 px-2.5 py-1.5 text-[11px] font-bold leading-5 text-[#8a6d10]">
                        دلیل کارمند: {e.mismatchReason}
                      </p>
                    )}
                    {e.confirmStatus === 'QUERIED' && e.confirmNote && (
                      <p className="mt-1.5 rounded-lg bg-[#b3372f]/10 px-2.5 py-1.5 text-[11px] font-bold leading-5 text-[#b3372f]">
                        سؤال ناظر ارسال‌شده: {e.confirmNote}
                      </p>
                    )}
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-[420px] text-right text-xs">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="py-1.5 font-medium">کالا</th>
                            <th className="font-medium">شمارش</th>
                            <th className="font-medium">موجودی هلو</th>
                            <th className="font-medium">اختلاف</th>
                            <th className="font-medium">وضعیت</th>
                          </tr>
                        </thead>
                        <tbody>
                          {e.items.map((it) => {
                            const diff = it.diff ?? it.countedQty - (it.systemQty ?? 0)
                            return (
                              <tr key={it.productId} className="border-t border-border/50">
                                <td className="py-1.5 font-bold text-foreground">{it.productName}</td>
                                <td className="tabular-nums">{faNum(it.countedQty)}</td>
                                <td className="tabular-nums">{faNum(it.systemQty ?? 0)}</td>
                                <td className={cn('font-black tabular-nums', diff === 0 ? 'text-[#0e7a4a]' : 'text-[#b3372f]')}>
                                  {diff > 0 ? `+${faNum(diff)}` : diff === 0 ? faNum(0) : `−${faNum(Math.abs(diff))}`}
                                </td>
                                <td>
                                  {it.within ? <Pill label="داخل تلورانس" color={EMERALD} /> : <Pill label="مغایر" color={ROSE} />}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {canConfirm && (
                      <div className="mt-2 flex justify-end border-t border-dashed border-border pt-2">
                        <ConfirmActions entry={e} onDone={onConfirmDone} />
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#c96f4a]/10 px-3 py-2.5">
                  <p className="text-[11px] font-bold text-[#a04c2a]">
                    برای اصلاح موجودی هلو از جعبه‌ابزار علمی → «شمارش چرخه‌ای» استفاده کنید.
                  </p>
                  <button
                    type="button"
                    onClick={onScience}
                    className="rounded-lg bg-[#c96f4a] px-3 py-1.5 text-[11px] font-black text-white active:scale-95"
                  >
                    رفتن به شمارش چرخه‌ای
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TeamHistory({ rows }: { rows: TeamRow[] }) {
  if (!rows.length)
    return (
      <EmptyState
        emoji="📋"
        title="تاریخچهٔ تیم خالی است"
        hint="به‌محض ثبت شمارش‌های روزانه، ۱۴ روز آخر اینجا نمایش داده می‌شود."
      />
    )
  return (
    <div className="max-h-[46vh] overflow-auto rounded-xl border border-border/60 scroll-gold">
      <table className="w-full min-w-[680px] text-right text-xs">
        <thead className="sticky top-0 bg-card shadow-sm">
          <tr className="text-muted-foreground">
            <th className="p-2.5 font-medium">تاریخ</th>
            <th className="font-medium">زون</th>
            <th className="font-medium">همکار</th>
            <th className="font-medium">وضعیت</th>
            <th className="font-medium">اقلام</th>
            <th className="font-medium">مغایر</th>
            <th className="font-medium">دوباره‌شماری</th>
            <th className="font-medium">تأیید ناظر</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.forDate}-${r.zone}-${r.userName}-${i}`} className="border-t border-border/50">
              <td className="p-2.5 font-bold text-foreground">{formatJalaliShort(r.forDate)}</td>
              <td className="text-foreground">
                {CATEGORY_EMOJI[r.zone] || '📦'} {r.zone}
              </td>
              <td className="text-foreground">{r.userName}</td>
              <td>
                {r.status === 'MISMATCH' ? (
                  <Pill label="⚠ مغایرت" color={ROSE} />
                ) : r.status === 'MATCHED' ? (
                  <Pill label="✓ مطابق" color={EMERALD} />
                ) : (
                  <Pill label="در جریان" color={GOLD} />
                )}
              </td>
              <td className="tabular-nums text-foreground">{faNum(r.totalItems)}</td>
              <td className={cn('font-black tabular-nums', r.mismatchCount > 0 ? 'text-[#b3372f]' : 'text-muted-foreground')}>
                {r.mismatchCount > 0 ? faNum(r.mismatchCount) : '—'}
              </td>
              <td className="tabular-nums text-foreground">{(r.recheckCount || 0) > 0 ? faNum(r.recheckCount || 0) : '—'}</td>
              <td>
                {r.confirmStatus === 'CONFIRMED' ? (
                  <Pill label="تأیید شد" color={EMERALD} />
                ) : r.confirmStatus === 'QUERIED' ? (
                  <Pill label="سؤال ناظر" color={ROSE} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ZoneAssign({ users, zones, onSaved }: { users: UserRow[]; zones: string[]; onSaved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const toggle = async (u: UserRow, z: string) => {
    const current = parseZones(u.zones)
    const next = current.includes(z) ? current.filter((x) => x !== z) : [...current, z]
    setBusy(u.id)
    try {
      await api('/api/zones', { method: 'POST', body: { action: 'assign', userId: u.id, zones: next } })
      toast.success(`زون‌های ${u.name} به‌روزرسانی شد`)
      onSaved()
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'خطا در ذخیرهٔ زون‌ها')
    } finally {
      setBusy(null)
    }
  }
  if (!users.length)
    return <EmptyState emoji="👥" title="کاربر فعالی پیدا نشد" hint="از بخش مدیریت کاربران، همکاران را فعال کنید." />
  return (
    <div className="max-h-[46vh] space-y-2 overflow-y-auto scroll-gold pl-1">
      {users.map((u) => {
        const mine = parseZones(u.zones)
        return (
          <div key={u.id} className="rounded-xl border border-border/60 bg-white/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black text-white"
                  style={{ background: u.color || EMERALD }}
                >
                  {u.name?.[0] || '؟'}
                </span>
                <div>
                  <div className="text-sm font-bold text-foreground">{u.name}</div>
                  <div className="text-[11px] text-muted-foreground">{ROLE_LABELS[u.role] || u.role}</div>
                </div>
              </div>
              <span className="text-[11px] text-muted-foreground">{mine.length ? `${faNum(mine.length)} زون` : 'بدون زون'}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {zones.map((z) => {
                const on = mine.includes(z)
                return (
                  <button
                    key={z}
                    type="button"
                    disabled={busy === u.id}
                    onClick={() => toggle(u, z)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-bold transition active:scale-95 disabled:opacity-50',
                      on ? 'border-transparent bg-[#77934a] text-white' : 'border-border bg-card text-muted-foreground hover:border-[#77934a]/50'
                    )}
                  >
                    {CATEGORY_EMOJI[z] || '📦'} {z}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ───────────── تب «نقشهٔ فروشگاه» ───────────── */

type MapTabZone = ApiZone & { pseudo?: boolean }

/* پلان واقعی فروشگاه از ویرایشگر «پلان فروشگاه» — GET /api/floorplans */
type FloorPlanApi = {
  id: string
  name: string
  floorIndex: number
  width: number
  height: number
  shape?: string
  archived?: boolean
  blocks: Array<{ id: string; kind: string; x: number; y: number; w: number; h: number; rotation: number; label: string; zoneName: string }>
}

type SyncResult = {
  created: number
  updated: number
  zones: Array<{ name: string; type: string; blockCount: number }>
  floors: Array<{ id: string; name: string; blockCount: number }>
}

function MapTab({
  mapZones,
  statuses,
  efficiency,
  teamToday,
  staffAssignments,
  canManageZones,
  selected,
  onSelect,
  onZoneSaved,
  goToFloorplan,
}: {
  mapZones: MapTabZone[]
  statuses: Record<string, MapStatus>
  efficiency: Record<string, EfficiencyInfo>
  teamToday: Entry[]
  staffAssignments: StaffAssignment[]
  canManageZones: boolean
  selected: string
  onSelect: (name: string) => void
  onZoneSaved: () => void
  goToFloorplan: () => void
}) {
  const [busy, setBusy] = useState(false)
  // پلان‌های واقعی — null یعنی در حال بارگذاری
  const [plans, setPlans] = useState<FloorPlanApi[] | null>(null)
  const [plansFailed, setPlansFailed] = useState(false)
  const [planIdx, setPlanIdx] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const sel = mapZones.find((z) => z.name === selected) || null
  const eff = sel ? efficiency[sel.name] : undefined
  const zoneCounts = sel ? teamToday.filter((e) => e.zone === sel.name) : []

  /* بارگذاری پلان واقعی فروشگاه — همان نقشه‌ای که در ویرایشگر پلان طراحی می‌شود */
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await api<{ plans: FloorPlanApi[] }>('/api/floorplans')
        if (!alive) return
        setPlans((r.plans || []).filter((p) => !p.archived))
      } catch {
        if (alive) setPlansFailed(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const plansWithBlocks = useMemo(() => (plans || []).filter((p) => (p.blocks || []).length > 0), [plans])
  const plansExist = (plans || []).length > 0
  const hasPlanMap = plansWithBlocks.length > 0
  const planIdxSafe = Math.min(planIdx, plansWithBlocks.length - 1)
  const activePlan = hasPlanMap ? plansWithBlocks[planIdxSafe] : null

  /* زون‌های حاضر روی طبقهٔ فعال پلان */
  const onPlanZoneNames = useMemo(() => {
    const s = new Set<string>()
    if (activePlan) for (const b of activePlan.blocks) { const zn = (b.zoneName || '').trim(); if (zn) s.add(zn) }
    return s
  }, [activePlan])

  /* زون‌های خارج از نقشه: در «شمارش زون» هستند ولی روی طبقهٔ فعال بلوکی ندارند */
  const offPlanZones = useMemo(() => mapZones.filter((z) => !onPlanZoneNames.has(z.name)), [mapZones, onPlanZoneNames])

  /* زون‌هایی که روی نقشه بلوک دارند ولی هنوز در دیتابیس زون‌ها ثبت نشده‌اند (شبه‌زون) */
  const unregisteredCount = useMemo(() => mapZones.filter((z) => z.pseudo && onPlanZoneNames.has(z.name)).length, [mapZones, onPlanZoneNames])

  const zoneColors = useMemo(() => Object.fromEntries(mapZones.map((z) => [z.name, z.color] as const)), [mapZones])

  const canvasBlocks: CanvasBlock[] = useMemo(
    () =>
      (activePlan?.blocks || []).map((b) => ({
        id: b.id,
        kind: b.kind,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        rotation: b.rotation,
        label: b.label,
        zoneName: (b.zoneName || '').trim(),
      })),
    [activePlan]
  )

  const assign = async (field: 'ownerId' | 'backupId', userId: string) => {
    if (!sel?.id) return
    setBusy(true)
    try {
      await api(`/api/zones?id=${encodeURIComponent(sel.id)}`, { method: 'PATCH', body: { [field]: userId } })
      toast.success(field === 'ownerId' ? 'مالک زون به‌روزرسانی شد' : 'جانشین زون به‌روزرسانی شد')
      onZoneSaved()
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'خطا در تخصیص')
    } finally {
      setBusy(false)
    }
  }

  const registerZone = async () => {
    if (!sel) return
    setBusy(true)
    try {
      await api('/api/zones', {
        method: 'POST',
        body: { name: sel.name, type: sel.type, criticality: sel.criticality, countFrequency: sel.countFrequency, color: sel.color, minStaff: sel.minStaff },
      })
      toast.success('زون در نقشهٔ فروشگاه ثبت شد 🗺️')
      onZoneSaved()
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'خطا در ثبت زون')
    } finally {
      setBusy(false)
    }
  }

  /* همگام‌سازی هوشمند زون‌ها از پلان واقعی — استنتاج نوع از تجهیزات بلوک‌ها */
  const syncZones = async () => {
    setSyncing(true)
    try {
      const r = await api<SyncResult>('/api/zones/sync-from-map', { method: 'POST' })
      toast.success(`همگام‌سازی انجام شد 🗺️ — ${faNum(r?.created || 0)} زون جدید، ${faNum(r?.updated || 0)} به‌روزرسانی نوع`)
      onZoneSaved()
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'خطا در همگام‌سازی زون‌ها')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-3">
      {plans === null && !plansFailed ? (
        /* در حال بارگذاری پلان */
        <div className="flex min-h-[120px] items-center justify-center gap-2 rounded-2xl border border-border/60 bg-card text-sm font-bold text-muted-foreground">
          <Loader2 className="animate-spin" size={18} /> در حال بارگذاری پلان فروشگاه…
        </div>
      ) : hasPlanMap && activePlan ? (
        <>
          {/* تب طبقات — فروشگاه چندطبقه */}
          {plansWithBlocks.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {plansWithBlocks.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlanIdx(i)}
                  className={cn(
                    'min-h-[44px] rounded-xl border px-3.5 py-2 text-xs font-bold transition-all active:scale-95',
                    i === planIdxSafe
                      ? 'border-transparent bg-[#0b2e20] text-white shadow-md'
                      : 'border-border bg-card text-muted-foreground hover:border-[#0e7a4a]/40'
                  )}
                >
                  🏬 {p.name} <span className="opacity-70">({faNum(p.blocks.length)} بلوک)</span>
                </button>
              ))}
            </div>
          )}

          {/* نقشهٔ واقعی طراحی‌شده — روی هر بلوک/زون بزنید */}
          <FloorPlanCanvas
            plan={{ id: activePlan.id, name: activePlan.name, width: activePlan.width, height: activePlan.height, shape: activePlan.shape }}
            blocks={canvasBlocks}
            zoneColors={zoneColors}
            zoneStatus={statuses}
            selectedZone={selected}
            onZoneClick={onSelect}
          />
          <p className="text-[11px] leading-5 text-muted-foreground">
            🏬 این همان <b>پلان طراحی‌شدهٔ فروشگاه</b> است (طبقه: {activePlan.name}) — قاب نرم دور هر زون = محدودهٔ بلوک‌هایش؛
            {' '}✓ مطابق، ⚠ مغایر (چشمک)، ⏳ در جریان. برای ثبت/ویرایش ساختار به ویرایشگر «پلان فروشگاه» بروید.
          </p>

          {/* زون‌های خارج از نقشه — انتخاب برای دیدن جزئیات مثل قبل */}
          {offPlanZones.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-card p-3.5">
              <div className="mb-1 text-xs font-black text-foreground">🧭 زون‌های خارج از نقشه ({faNum(offPlanZones.length)})</div>
              <p className="mb-2.5 text-[11px] leading-5 text-muted-foreground">
                روی طبقهٔ «{activePlan.name}» بلوکی ندارند — انبار طبقهٔ دیگر یا زون دسته‌ای بدون محل ثابت. برای جزئیات و تخصیص انتخاب کنید.
              </p>
              <div className="flex flex-wrap gap-2">
                {offPlanZones.map((z) => {
                  const active = z.name === selected
                  return (
                    <button
                      key={z.name}
                      type="button"
                      onClick={() => onSelect(z.name)}
                      className={cn(
                        'min-h-[44px] rounded-xl border px-3.5 py-2 text-sm font-bold transition-all active:scale-95',
                        active ? 'border-transparent bg-[#0e7a4a] text-white shadow-md' : 'border-border bg-card text-foreground hover:border-[#0e7a4a]/40'
                      )}
                    >
                      <span className="ml-1">{CATEGORY_EMOJI[z.name] || (z.pseudo ? '🏷️' : '📦')}</span> {z.name}
                      {z.pseudo && <span className="mr-1.5 text-[10px] opacity-70">(ثبت نشده)</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* فالبک: نقشهٔ شماتیک خودکار + دعوت به طراحی پلان واقعی */}
          <ZoneMap zones={mapZones} statuses={statuses} efficiency={efficiency} selected={selected} onZoneSelect={onSelect} />
          <div className="fade-in-up rounded-2xl border-2 border-dashed border-[#c9a227]/50 bg-[#c9a227]/5 p-4 text-center">
            <p className="text-xs leading-6 text-[#8a6d10]">
              نقشهٔ بالا چیدمان <b>شماتیک خودکار</b> است، نه پلان واقعی مغازه.
              {plansFailed
                ? ' پلان فروشگاه در دسترس نیست — بعداً دوباره تلاش کنید.'
                : plansExist
                  ? ' پلانی ساخته شده ولی هنوز بلوکی روی آن چیده نشده — تجهیزات را در ویرایشگر پلان بچینید تا شمارش روی نقشهٔ واقعی انجام شود.'
                  : ' هنوز پلانی طراحی نشده — در ویرایشگر «پلان فروشگاه» زمین و تجهیزات را بچینید تا همین‌جا نقشهٔ واقعی مغازه دیده شود.'}
            </p>
            {!plansFailed && (
              <button
                type="button"
                onClick={goToFloorplan}
                className="mt-3 min-h-[44px] rounded-xl bg-[#c9a227] px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:brightness-110 active:scale-95"
              >
                🏗️ رفتن به ویرایشگر پلان فروشگاه
              </button>
            )}
          </div>
        </>
      )}

      {mapZones.length === 0 && (
        <EmptyState emoji="🗺️" title="زونی برای نقشه نیست" hint="ابتدا دستهٔ کالا بسازید یا از تب «زون‌ها و تخصیص» زون جدید ثبت کنید." />
      )}

      {/* کارت مدیر: همگام‌سازی زون‌ها از پلان واقعی (استنتاج هوشمند نوع زون از تجهیزات) */}
      {canManageZones && (
        <div className="fade-in-up flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#0e7a4a]/30 bg-[#0e7a4a]/5 p-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-black text-[#0e7a4a]">🧠 همگام‌سازی زون‌ها از نقشهٔ فروشگاه</div>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              نوع هر زون از تجهیزات بلوک‌هایش استنتاج می‌شود: صندوق ← CHECKOUT، یخچال/میوه/پروتئین/نان ← PERISHABLE (شدت A، شمارش هفتگی)،
              ورود ← زون تنفس، انبار ← BACKROOM، گاندولای میانهٔ فروشگاه ← راهروی قدرت. زون‌های موجود فقط «نوع»شان به‌روز می‌شود؛
              مالک، جانشین، شدت و رنگ دست نمی‌خورد.
            </p>
            {hasPlanMap && unregisteredCount > 0 && (
              <p className="mt-1.5 rounded-lg bg-[#c9a227]/15 px-2.5 py-1.5 text-[11px] font-bold text-[#8a6d10]">
                ⚠️ {faNum(unregisteredCount)} زون در نقشه هست که هنوز در شمارش زون ثبت نشده — با همگام‌سازی ثبت می‌شود.
              </p>
            )}
            {!hasPlanMap && <p className="mt-1.5 text-[11px] font-bold text-[#8a6d10]">ابتدا پلان فروشگاه را با بلوک طراحی کنید تا همگام‌سازی ممکن شود.</p>}
          </div>
          <button
            type="button"
            onClick={syncZones}
            disabled={syncing || !hasPlanMap}
            className="min-h-[44px] shrink-0 rounded-xl bg-[#0e7a4a] px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:brightness-110 active:scale-95 disabled:opacity-50"
          >
            {syncing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="animate-spin" size={16} /> در حال همگام‌سازی…
              </span>
            ) : (
              '⟳ همگام‌سازی زون‌ها'
            )}
          </button>
        </div>
      )}

      {sel && (
        <div className="fade-in-up rounded-2xl border border-[#0e7a4a]/30 bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{CATEGORY_EMOJI[sel.name] || (sel.type === 'DECOMPRESSION' ? '🌿' : '📦')}</span>
              <div>
                <div className="text-sm font-black text-foreground">{sel.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {TYPE_FA[sel.type] || sel.type} — شدت {sel.criticality} — شمارش {cadenceLabel(sel.countFrequency)}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {eff?.salesTargetExcluded && <Pill label="زون تنفس — از هدف فروش مستثنا" color={GOLD} />}
              {eff?.band && <Pill label={BAND_FA[eff.band].label} color={BAND_FA[eff.band].color} />}
              {eff?.countCompliance.overdue && <Pill label="شمارش سررسید گذشته" color={ROSE} />}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <KeyValue k="مالک زون" v={sel.ownerName || 'تعیین نشده'} />
            <KeyValue k="جانشین" v={sel.backupName || 'تعیین نشده'} />
            <KeyValue k="حداقل نیرو" v={faNum(sel.minStaff)} />
            <KeyValue k="فروش ۳۰ روزه (سهم سامانه)" v={eff ? faMoney(eff.sales30) : '—'} />
            <KeyValue k="ساعت‌کار هفتهٔ زون" v={eff ? `${faNum(eff.staffHours)} ساعت` : '—'} />
            <KeyValue k="ZoneSLH (فروش بر ساعت‌کار)" v={eff ? (eff.zoneSLH === null ? '—' : `${faMoney(eff.zoneSLH)} / ساعت`) : '—'} />
            <KeyValue k="شاخص سهم زون" v={eff ? faDec(eff.shareIndex) : '—'} />
            <KeyValue
              k="انطباق شمارش ABC"
              v={
                eff
                  ? eff.countCompliance.lastDate
                    ? `${formatJalaliShort(eff.countCompliance.lastDate)} — سررسید ${formatJalaliShort(eff.countCompliance.dueDate)}`
                    : 'هرگز شمارش نشده'
                  : '—'
              }
            />
          </div>

          {sel.type === 'DECOMPRESSION' && (
            <p className="mt-2 rounded-xl bg-[#c9a227]/10 px-3 py-2 text-[11px] leading-6 text-[#8a6d10]">
              🌿 <b>زون تنفس — فروش‌سنج نیست:</b> طبق اصول آندرهیل، این نوار (۳–۵ متر اول ورود) برای آرام‌سازی مشتری است و
              در اهداف فروش و شاخص بهره‌وری لحاظ نمی‌شود.
            </p>
          )}

          {/* شمارش‌های امروز این زون */}
          <div className="mt-3">
            <div className="mb-1.5 text-xs font-black text-foreground">شمارش‌های امروز</div>
            {zoneCounts.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">امروز برای این زون شمارشی ثبت نشده است.</p>
            ) : (
              <div className="space-y-1.5">
                {zoneCounts.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2">
                    <span className="text-xs font-bold text-foreground">👤 {e.userName}</span>
                    <span className="flex items-center gap-1.5">
                      {e.hasMismatch ? <Pill label={`⚠ ${faNum(e.mismatchCount || 0)} مغایر`} color={ROSE} /> : <Pill label="✓ مطابق" color={EMERALD} />}
                      <Pill label={`${faNum(e.totalItems)} قلم`} color={OLIVE} />
                      <ConfirmPill entry={e} compact />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* تخصیص سریع مالک/جانشین */}
          {canManageZones && (
            <div className="mt-3 border-t border-dashed border-border pt-3">
              {sel.id ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Labeled label="تغییر سریع مالک زون">
                    <select
                      value={sel.ownerId}
                      onChange={(e) => assign('ownerId', e.target.value)}
                      disabled={busy}
                      className="min-h-[44px] w-full rounded-xl border border-input bg-white px-3 py-2 text-sm font-bold outline-none focus:border-[#0e7a4a]"
                    >
                      <option value="">— تعیین نشده —</option>
                      {staffAssignments.map((u) => (
                        <option key={u.userId} value={u.userId}>
                          {u.userName} ({ROLE_LABELS[u.role] || u.role})
                        </option>
                      ))}
                    </select>
                  </Labeled>
                  <Labeled label="تغییر سریع جانشین">
                    <select
                      value={sel.backupId}
                      onChange={(e) => assign('backupId', e.target.value)}
                      disabled={busy}
                      className="min-h-[44px] w-full rounded-xl border border-input bg-white px-3 py-2 text-sm font-bold outline-none focus:border-[#0e7a4a]"
                    >
                      <option value="">— تعیین نشده —</option>
                      {staffAssignments.map((u) => (
                        <option key={u.userId} value={u.userId}>
                          {u.userName} ({ROLE_LABELS[u.role] || u.role})
                        </option>
                      ))}
                    </select>
                  </Labeled>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#c9a227]/10 px-3 py-2.5">
                  <p className="text-[11px] font-bold text-[#8a6d10]">
                    این زون هنوز در نقشهٔ فروشگاه ثبت نشده (فقط دستهٔ کالاست) — برای تخصیص مالک/جانشین و تنظیمات، ثبتش کنید.
                  </p>
                  <button
                    type="button"
                    onClick={registerZone}
                    disabled={busy}
                    className="rounded-lg bg-[#c9a227] px-3 py-2 text-[11px] font-black text-white active:scale-95 disabled:opacity-60"
                  >
                    ثبت این زون در نقشه
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ───────────── تب «زون‌ها و تخصیص» ───────────── */

type ZoneForm = { id: string; name: string; type: string; criticality: string; countFrequency: string; color: string; minStaff: number; notes: string }
const EMPTY_ZONE_FORM: ZoneForm = { id: '', name: '', type: 'DRY', criticality: 'B', countFrequency: 'MONTHLY', color: OLIVE, minStaff: 1, notes: '' }

function ZonesAdminTab({
  zonesData,
  categories,
  users,
  canManageZones,
  onSaved,
}: {
  zonesData: ZonesData | null
  categories: string[]
  users: UserRow[]
  canManageZones: boolean
  onSaved: () => void
}) {
  const [form, setForm] = useState<ZoneForm | null>(null)
  const [busy, setBusy] = useState(false)
  const zoneRows = zonesData?.zones || []
  const zoneNames = [...new Set([...categories, ...zoneRows.map((z) => z.name)])]

  const save = async () => {
    if (!form) return
    if (!form.name.trim()) {
      toast.error('نام زون الزامی است')
      return
    }
    setBusy(true)
    try {
      if (form.id) {
        await api(`/api/zones?id=${encodeURIComponent(form.id)}`, { method: 'PATCH', body: form })
        toast.success('زون به‌روزرسانی شد 🗺️')
      } else {
        await api('/api/zones', { method: 'POST', body: form })
        toast.success('زون جدید ثبت شد 🗺️')
      }
      setForm(null)
      onSaved()
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'خطا در ذخیرهٔ زون')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (z: ApiZone) => {
    if (!window.confirm(`زون «${z.name}» حذف شود؟ (فقط اگر ثبت شمارشی نداشته باشد)`)) return
    try {
      await api(`/api/zones?id=${encodeURIComponent(z.id)}`, { method: 'DELETE' })
      toast.success('زون حذف شد')
      onSaved()
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'خطا در حذف زون')
    }
  }

  return (
    <div className="space-y-4">
      {/* کارت‌های زون */}
      {canManageZones ? (
        <SectionCard
          title="زون‌های فروشگاه"
          subtitle="تعریف زون‌ها: نوع، شدت شمارش (A/B/C)، چرخه، حداقل نیرو، رنگ و مالک/جانشین"
          icon={<MapIcon size={18} />}
          actions={
            <button
              type="button"
              onClick={() => setForm({ ...EMPTY_ZONE_FORM })}
              className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0e7a4a] px-3.5 py-2 text-xs font-black text-white shadow-md transition hover:brightness-110 active:scale-95"
            >
              <Plus size={15} /> زون جدید
            </button>
          }
        >
          {zoneRows.length === 0 ? (
            <EmptyState
              emoji="🗺️"
              title="هنوز زونی ثبت نشده"
              hint="زون‌ها را مطابق چیدمان فروشگاه تعریف کنید — نقشهٔ گرافیکی از همین‌ها ساخته می‌شود."
            />
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {zoneRows.map((z) => {
                const eff = zonesData?.efficiency?.[z.name]
                return (
                  <div key={z.id} className="rounded-2xl border border-border/60 bg-white/70 p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="h-8 w-2 rounded-full" style={{ background: z.color }} />
                        <div>
                          <div className="text-sm font-black text-foreground">
                            {CATEGORY_EMOJI[z.name] || '📦'} {z.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground">{TYPE_FA[z.type] || z.type}</div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setForm({
                              id: z.id,
                              name: z.name,
                              type: z.type,
                              criticality: z.criticality,
                              countFrequency: z.countFrequency,
                              color: z.color,
                              minStaff: z.minStaff,
                              notes: z.notes,
                            })
                          }
                          title="ویرایش زون"
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-[#c9a227]/15 hover:text-[#8a6d10]"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(z)}
                          title="حذف زون"
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-[#b3372f]/10 hover:text-[#b3372f]"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill label={`شدت ${z.criticality}`} color={z.color} />
                      <Pill label={cadenceLabel(z.countFrequency)} color={TERRA} />
                      <Pill label={`حداقل نیرو: ${faNum(z.minStaff)}`} color={OLIVE} />
                      {eff?.band && <Pill label={BAND_FA[eff.band].label} color={BAND_FA[eff.band].color} />}
                      {eff?.countCompliance.overdue && <Pill label="شمارش سررسید گذشته" color={ROSE} />}
                    </div>
                    <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                      <div>👤 مالک: <b className="text-foreground">{z.ownerName || '—'}</b> · جانشین: <b className="text-foreground">{z.backupName || '—'}</b></div>
                      {z.notes && <div className="line-clamp-2">📝 {z.notes}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card px-4 py-3 text-[11px] leading-6 text-muted-foreground">
          ℹ️ تعریف/ویرایش زون‌ها فقط برای مدیر عملیات، مدیر کل، مالک یا دارندگان دسترسی «مدیریت نظارت» است — تخصیص شمارش روزانه در ادامه در دسترس شماست.
        </div>
      )}

      {/* ABC cadence + حداقل نیرو */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#77934a]/30 bg-[#77934a]/10 p-4">
          <h3 className="mb-1.5 text-sm font-black text-[#5c7236]">🧪 چرا شمارش A/B/C؟ (چرخهٔ شمارش چرخه‌ای)</h3>
          <p className="text-xs leading-6 text-foreground/80">
            هزینهٔ شمارش باید به ارزش و نرخ خطای کالا بچسبد: <b>A (هفتگی)</b> برای کالاهای پرگردش و پرتلف مثل لبنیات و
            پروتئین؛ <b>B (دوهفتگی)</b> برای گردش متوسط؛ <b>C (ماهانه)</b> برای آرام‌گردش‌ها — شمردن روزانهٔ آن‌ها هدرِ نیروی
            تیم است. پژوهش‌های شمارش چرخه‌ای نشان می‌دهد همین تقسیم‌بندی، دقت موجودی را پیوسته بالا می‌برد بی‌آنکه تیم
            زیر بار شمارش بخوابد. سررسید هر زون از آخرین شمارش + چرخه محاسبه و در کارت زون با «سررسید گذشته» هشدار داده
            می‌شود.
          </p>
        </div>
        <div className="rounded-2xl border border-[#c96f4a]/30 bg-[#c96f4a]/10 p-4">
          <h3 className="mb-1.5 text-sm font-black text-[#a04c2a]">👥 کف حداقل نیروی هر زون</h3>
          <p className="text-xs leading-6 text-foreground/80">
            حداقل نیرو = <b>ceil(مشتری در ساعت × دقیقه‌خدمت ÷ ۶۰ ÷ ۰٫۸)</b> — ضریب ۰٫۸ سهم کارهای غیرخدمتی است. این کف
            برای برنامه‌ریزی شیفت و هشدار همپوشانی مرخصی استفاده می‌شود: اگر مرخصی‌ها نیروی زون را زیر کف ببرند، سامانه
            هشدار می‌دهد. در نمای بهره‌وری نقشه، شاخص سهم زیر ۰٫۷ یعنی «نیروی بیش از فروش» و بالای ۱٫۳ یعنی «فروش بیش از
            نیرو».
          </p>
        </div>
      </div>

      {/* ماتریس تخصیص کاربر × زون */}
      <SectionCard
        title="تخصیص زون به همکاران"
        subtitle="روی چسب‌ها بزنید تا زون شمارش روزانهٔ هر همکار تعیین شود — همکار فقط زون‌های خودش را می‌شمارد"
        icon={<Users size={18} />}
      >
        <ZoneAssign users={users} zones={zoneNames} onSaved={onSaved} />
      </SectionCard>

      {form && (
        <Modal title={form.id ? `ویرایش زون — ${form.name}` : 'زون جدید'} onClose={() => setForm(null)} wide>
          <Labeled label="نام زون *">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثلاً لبنیات"
              className="w-full rounded-xl border border-input bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-[#0e7a4a]"
            />
          </Labeled>
          <Labeled label="نوع زون" hint={ZONE_TYPE_OPTIONS.find((t) => t.value === form.type)?.hint}>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="min-h-[44px] w-full rounded-xl border border-input bg-white px-3 py-2 text-sm font-bold outline-none focus:border-[#0e7a4a]"
            >
              {ZONE_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Labeled>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="شدت شمارش">
              <div className="flex gap-1.5">
                {CRITICALITY_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm({ ...form, criticality: c.value })}
                    className={cn(
                      'min-h-[40px] flex-1 rounded-xl border px-2 py-1.5 text-[11px] font-black transition active:scale-95',
                      form.criticality === c.value ? 'border-transparent bg-[#0b2e20] text-white' : 'border-border bg-card text-muted-foreground'
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </Labeled>
            <Labeled label="چرخهٔ شمارش">
              <div className="flex gap-1.5">
                {CADENCE_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm({ ...form, countFrequency: c.value })}
                    className={cn(
                      'min-h-[40px] flex-1 rounded-xl border px-2 py-1.5 text-[11px] font-black transition active:scale-95',
                      form.countFrequency === c.value ? 'border-transparent bg-[#0b2e20] text-white' : 'border-border bg-card text-muted-foreground'
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </Labeled>
          </div>
          <Labeled label="حداقل نیرو (کف زون)">
            <input
              type="number"
              min={0}
              max={10}
              value={form.minStaff}
              onChange={(e) => setForm({ ...form, minStaff: Math.min(10, Math.max(0, Number(e.target.value) || 0)) })}
              className="w-28 rounded-xl border border-input bg-white px-3 py-2 text-center text-sm font-black outline-none focus:border-[#0e7a4a]"
            />
          </Labeled>
          <Labeled label="رنگ زون در نقشه">
            <div className="flex gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`رنگ ${c}`}
                  onClick={() => setForm({ ...form, color: c })}
                  className={cn('h-8 w-8 rounded-full border-2 transition active:scale-90', form.color === c ? 'scale-110 border-[#0b2e20]' : 'border-transparent')}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Labeled>
          <Labeled label="یادداشت">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="مثلاً: قفسهٔ سرد ۱ تا ۴ — شمارش قبل از ساعت ۱۰"
              className="w-full rounded-xl border border-input bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0e7a4a]"
            />
          </Labeled>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="min-h-[44px] w-full rounded-xl bg-[#0e7a4a] px-4 py-2.5 text-sm font-black text-white shadow-md transition hover:brightness-110 active:scale-95 disabled:opacity-60"
          >
            {busy ? 'در حال ذخیره…' : form.id ? 'ذخیرهٔ تغییرات' : 'ثبت زون'}
          </button>
        </Modal>
      )}
    </div>
  )
}

/* ───────────── ویو اصلی ───────────── */

export default function ZoneCountView({ ctx }: { ctx: AppCtx }) {
  const user = ctx.user
  const manager =
    !!user && (MANAGER_ROLES.includes(user.role) || (user.secondaryRoles || []).some((r: string) => MANAGER_ROLES.includes(r)))
  // دارندگان cap «zonecount.confirm» — تقریب سمت کلاینت (سرور دقیق با rbac اجرا می‌کند): مثلاً حسابدار
  const confirmHolder =
    !!user && (CONFIRM_ROLES.includes(user.role) || (user.secondaryRoles || []).some((r: string) => CONFIRM_ROLES.includes(r)))
  const oversight = !manager && confirmHolder
  const canConfirm = manager || confirmHolder
  const canManageZones =
    !!user && (ZONE_MANAGE_ROLES.includes(user.role) || (user.secondaryRoles || []).some((r: string) => ZONE_MANAGE_ROLES.includes(r)))

  const [data, setData] = useState<ZoneData | null>(null)
  const [zone, setZone] = useState('')
  const [qtys, setQtys] = useState<Record<string, number>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [autoSaved, setAutoSaved] = useState(false)
  const [result, setResult] = useState<{ hasMismatch: boolean; message: string; items: CountItem[] } | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [tab, setTab] = useState<TabKey>('board')
  const [tolerance, setTolerance] = useState(2)
  const [zonesData, setZonesData] = useState<ZonesData | null>(null)
  const [selectedMapZone, setSelectedMapZone] = useState('')
  // جریان مغایرت (کور): ۲=بازبینی، ۳=دلیل
  const [mmStep, setMmStep] = useState<0 | 2 | 3>(0)
  const [mmReason, setMmReason] = useState('')
  const zoneRef = useRef('')
  const dirtyRef = useRef(false)

  const loadUsers = useCallback(async () => {
    try {
      const u = await api<{ users: UserRow[] }>('/api/users')
      setUsers((u.users || []).filter((x) => x.active))
    } catch {
      /* فقط برای ویرایشگر تخصیص زون است — بی‌صدا */
    }
  }, [])

  const loadZones = useCallback(async () => {
    try {
      const z = await api<ZonesData>('/api/zones')
      setZonesData(z)
    } catch {
      /* نقشه اختیاری است — بی‌صدا */
    }
  }, [])

  const refresh = useCallback(async (z: string, seed = false) => {
    const q = z ? `?zone=${encodeURIComponent(z)}` : ''
    const dd = await api<ZoneData>(`/api/zonecount${q}`)
    if (seed) {
      zoneRef.current = z
      setQtys(dd.myToday ? Object.fromEntries(dd.myToday.items.map((i) => [i.productId, i.countedQty])) : {})
      setTouched(dd.myToday ? Object.fromEntries(dd.myToday.items.map((i) => [i.productId, true])) : {})
      setResult(null)
    }
    setData(dd)
    return dd
  }, [])

  const refreshAll = useCallback(async () => {
    await refresh(zoneRef.current)
    if (manager || confirmHolder) await loadZones()
  }, [refresh, manager, confirmHolder, loadZones])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const role = ctx.user?.role || ''
        const sec = (ctx.user?.secondaryRoles || []) as string[]
        const isMgr = MANAGER_ROLES.includes(role) || sec.some((r) => MANAGER_ROLES.includes(r))
        const d0 = await api<ZoneData>('/api/zonecount')
        if (!alive) return
        setData(d0)
        const first = d0.myZones[0] || ''
        if (first) {
          const dz = await api<ZoneData>(`/api/zonecount?zone=${encodeURIComponent(first)}`)
          if (!alive) return
          zoneRef.current = first
          setZone(first)
          setData(dz)
          setQtys(dz.myToday ? Object.fromEntries(dz.myToday.items.map((i) => [i.productId, i.countedQty])) : {})
          setTouched(dz.myToday ? Object.fromEntries(dz.myToday.items.map((i) => [i.productId, true])) : {})
        }
        if (isMgr) {
          await Promise.all([loadUsers(), loadZones()])
        } else if (role === 'ACC' || sec.includes('ACC')) {
          await loadZones()
        }
      } catch (e: unknown) {
        if (alive) toast.error((e as Error)?.message || 'خطا در بارگذاری شمارش زون')
      }
    })()
    return () => {
      alive = false
    }
  }, [ctx.user, loadUsers, loadZones])

  const changeZone = (z: string) => {
    setZone(z)
    refresh(z, true).catch((e: unknown) => toast.error((e as Error)?.message || 'خطا در بارگذاری زون'))
  }

  const setQty = (pid: string, v: number) => {
    dirtyRef.current = true
    const nv = Math.max(0, Math.round(v) || 0)
    setQtys((prev) => ({ ...prev, [pid]: nv }))
    setTouched((prev) => ({ ...prev, [pid]: true }))
  }

  const buildItems = () =>
    (data?.products || [])
      .filter((p) => touched[p.id])
      .map((p) => ({ productId: p.id, countedQty: qtys[p.id] || 0 }))

  const submit = async (silent: boolean, opts?: { recheck?: boolean; reason?: string }) => {
    if (!zone) {
      if (!silent) toast.error('ابتدا زون را انتخاب کنید')
      return
    }
    const items = buildItems()
    if (!items.length) {
      if (!silent) toast.error('هیچ عددی وارد نشده است — با دکمه‌های ‎−/+‎ شمارش را وارد کنید')
      return
    }
    if (!silent) setSaving(true)
    try {
      const r = await api<PostResult>('/api/zonecount', {
        method: 'POST',
        body: {
          zone,
          items,
          silent,
          ...(manager ? { tolerance } : {}),
          ...(opts?.recheck ? { recheck: true } : {}),
          ...(opts?.reason ? { reason: opts.reason } : {}),
        },
      })
      dirtyRef.current = false
      if (!silent) {
        if (!manager && r.needRecheck) {
          setResult(null)
          setMmStep(2)
          setMmReason('')
        } else if (!manager && r.needReason) {
          setResult(null)
          setMmStep(3)
        } else {
          setMmStep(0)
          setMmReason('')
          setResult({ hasMismatch: r.hasMismatch, message: r.message, items: r.entry?.items || [] })
          toast.success(
            r.finalMismatch
              ? 'مغایرت با دلیل شما ثبت شد و برای مدیریت ارسال شد 🌿'
              : r.hasMismatch
                ? 'ثبت شد — مغایرت به مدیر مربوطه اطلاع داده شد'
                : 'شمارش امروز ثبت شد 🌿'
          )
        }
      } else {
        setAutoSaved(true)
        window.setTimeout(() => setAutoSaved(false), 2500)
      }
      await refresh(zone)
    } catch (e: unknown) {
      if (!silent) toast.error((e as Error)?.message || 'خطا در ثبت شمارش')
    } finally {
      if (!silent) setSaving(false)
    }
  }

  // ذخیرهٔ خودکار بی‌صدا با تأخیر — هر تغییری ۲٫۵ ثانیه پس از آخرین تایپ ذخیره می‌شود
  useEffect(() => {
    if (!zone) return
    const t = window.setTimeout(() => {
      if (dirtyRef.current) void submit(true)
    }, 2500)
    return () => window.clearTimeout(t)
  })

  const removeEntry = async (id: string) => {
    if (!window.confirm('این ثبت شمارش حذف شود؟')) return
    try {
      await api(`/api/zonecount?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      toast.success('ثبت حذف شد')
      await refresh(zoneRef.current)
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'خطا در حذف')
    }
  }

  // دادهٔ نقشه: زون‌های ثبت‌شده + دسته‌های کالایی بدون رکورد زون (شبه‌زون)
  const mapZones: MapTabZone[] = useMemo(() => {
    const catNames = data?.zones || []
    const rows = zonesData?.zones || []
    const byName = new Map(rows.map((z) => [z.name, z]))
    const names = [...new Set([...catNames, ...rows.map((z) => z.name)])]
    return names.map((name) => {
      const zr = byName.get(name)
      return {
        id: zr?.id || '',
        name,
        type: zr?.type || 'DRY',
        criticality: zr?.criticality || 'B',
        countFrequency: zr?.countFrequency || 'MONTHLY',
        color: zr?.color || OLIVE,
        minStaff: zr?.minStaff || 1,
        notes: zr?.notes || '',
        ownerId: zr?.ownerId || '',
        ownerName: zr?.ownerName || '',
        backupId: zr?.backupId || '',
        backupName: zr?.backupName || '',
        pseudo: !zr,
      }
    })
  }, [data, zonesData])

  const mapStatuses: Record<string, MapStatus> = useMemo(() => {
    const out: Record<string, MapStatus> = {}
    const today = data?.teamToday || []
    for (const z of mapZones) {
      const entries = today.filter((e) => e.zone === z.name)
      out[z.name] = { state: entries.some((e) => e.hasMismatch) ? 'mismatch' : entries.length ? 'ok' : 'none' }
    }
    return out
  }, [mapZones, data])

  if (!user) return null

  const d = data
  const countedToday = (d?.myTodayZones?.length || 0) > 0
  const teamToday = d?.teamToday || []
  const countedZones = new Set(teamToday.map((e) => e.zone)).size
  const totalZones = d?.zones.length || 0
  const teamItems = teamToday.reduce((s, e) => s + e.totalItems, 0)
  const mismatchEntries = teamToday.filter((e) => e.hasMismatch).length
  const mismatchItems = teamToday.reduce((s, e) => s + (e.mismatchCount || 0), 0)
  const pendingConfirm = canConfirm ? teamToday.filter((e) => e.hasMismatch && e.confirmStatus !== 'CONFIRMED') : []

  const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: 'board', label: 'تابلوی امروز', icon: <LayoutDashboard size={15} /> },
    { key: 'map', label: 'نقشهٔ فروشگاه', icon: <MapIcon size={15} /> },
    { key: 'mine', label: 'شمارش من', icon: <ClipboardList size={15} /> },
    { key: 'team', label: 'تاریخچهٔ تیم', icon: <History size={15} /> },
    { key: 'zonesadmin', label: 'زون‌ها و تخصیص', icon: <Users size={15} /> },
  ]

  return (
    <div className="space-y-4">
      {/* سربرگ */}
      <div className="fade-in-up rounded-2xl bg-gradient-to-l from-[#0b2e20] via-[#0e4a30] to-[#0e7a4a] p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-2xl">🙈</span>
            <div>
              <h1 className="text-lg font-black">شمارش کورِ روزانهٔ زون</h1>
              <p className="mt-0.5 max-w-lg text-xs leading-5 text-white/75">
                {manager
                  ? 'تابلوی نظارت تیم با اعداد کامل + نقشهٔ گرافیکی فروشگاه + شمارش شخصی کور — جدا از شمارش چرخه‌ای جعبه‌ابزار علمی'
                  : oversight
                    ? 'نظارت بر تأیید شمارش‌های تیم — بدون دیدن عدد سیستم؛ فقط پرچم مغایرت، دوباره‌شماری و دلیل شمارنده'
                    : 'شمارش فیزیکی زون خودتان بدون دیدن عدد سیستم — اگر با موجودی هلو نخواند، دوباره می‌شمارید و در نهایت دلیل ثبت می‌کنید'}
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold">{formatJalaliFull(d?.today || todayIso())}</div>
        </div>
      </div>

      {/* نوار «در انتظار تأیید من» — دارندگان cap نظارت */}
      {canConfirm && pendingConfirm.length > 0 && (
        <div className="fade-in-up flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#c9a227]/50 bg-[#c9a227]/10 px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-black text-[#8a6d10]">
            <ShieldCheck size={16} />
            در انتظار تأیید من: {faNum(pendingConfirm.length)} شمارش مغایر — دلیل شمارنده و دوباره‌شماری را بررسی کنید
          </p>
          {manager && (
            <button
              type="button"
              onClick={() => setTab('board')}
              className="rounded-lg bg-[#c9a227] px-3 py-1.5 text-[11px] font-black text-white active:scale-95"
            >
              رفتن به تابلوی امروز
            </button>
          )}
        </div>
      )}

      {/* صف نظارت برای دارندگان cap غیرمدیر (مثلاً حسابدار) — کاملاً کور */}
      {oversight && pendingConfirm.length > 0 && (
        <SectionCard
          title="در انتظار تأیید من"
          subtitle="شمارش‌های مغایر امروز — دلیل شمارنده + دوباره‌شماری؛ بدون هیچ عدد سیستمی"
          icon={<ShieldCheck size={18} />}
        >
          <div className="space-y-2">
            {pendingConfirm.map((e) => (
              <div key={e.id} className="rounded-xl border border-border/60 bg-white/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{CATEGORY_EMOJI[e.zone] || '📦'}</span>
                    <div>
                      <div className="text-sm font-bold text-foreground">{e.zone}</div>
                      <div className="text-[11px] text-muted-foreground">👤 {e.userName} — {faNum(e.totalItems)} قلم</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill label={`↻ دوباره‌شماری: ${faNum(e.recheckCount || 0)}`} color={TERRA} />
                    <ConfirmPill entry={e} />
                    <ConfirmActions entry={e} onDone={refreshAll} />
                  </div>
                </div>
                {e.mismatchReason ? (
                  <p className="mt-2 rounded-lg bg-[#c9a227]/10 px-2.5 py-1.5 text-[11px] font-bold leading-5 text-[#8a6d10]">
                    دلیل شمارنده: {e.mismatchReason}
                  </p>
                ) : (
                  <p className="mt-2 text-[11px] text-muted-foreground">هنوز دلیلی ثبت نشده (چرخهٔ دوباره‌شماری در جریان است).</p>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {manager ? (
          <>
            <StatCard
              label="زون‌های امروز"
              value={`${faNum(countedZones)} از ${faNum(totalZones)}`}
              hint="ثبت‌شده از کل زون‌ها"
              tone="emerald"
              icon={<span>🗺️</span>}
            />
            <StatCard label="اقلام شمارش‌شدهٔ تیم" value={teamItems} hint="جمع اقلام امروز تیم" tone="olive" icon={<span>🧮</span>} />
            <StatCard
              label="ثبت‌های مغایر امروز"
              value={mismatchEntries}
              hint="ثبت‌هایی که مغایرت دارند"
              tone="rose"
              icon={<span>⚠️</span>}
            />
            <StatCard
              label="در انتظار تأیید"
              value={pendingConfirm.length}
              hint="مغایرت‌هایی که ناظر باید تأیید/سؤال کند"
              tone="gold"
              icon={<ShieldCheck size={18} />}
            />
          </>
        ) : (
          <>
            <StatCard
              label="امروز شمارش کردم؟"
              value={countedToday ? '✅ ثبت شد' : '⏳ مانده'}
              hint={countedToday ? `${faNum(d?.myTodayZones.length || 0)} زون امروز` : 'هنوز شمارش امروزی ثبت نکرده‌اید'}
              tone={countedToday ? 'emerald' : 'gold'}
              icon={<span>🗓️</span>}
            />
            <StatCard
              label="زنجیرهٔ روزهای پیوسته"
              value={`${faNum(d?.stats.myStreak || 0)} روز 🔥`}
              hint="شمارش‌های پیوستهٔ روزانه"
              tone="terra"
              icon={<Flame size={18} />}
            />
            <StatCard label="اقلام امروز" value={d?.stats.todayItems ?? 0} hint="جمع اقلام شمارش‌شدهٔ امروز" tone="olive" icon={<span>🧮</span>} />
            <StatCard
              label={oversight ? 'در انتظار تأیید من' : 'روزهای مغایرت'}
              value={oversight ? pendingConfirm.length : (d?.stats.myMismatchDays ?? 0)}
              hint={oversight ? 'شمارش‌های مغایر امروز تیم' : 'فقط تعداد روزها — بدون جزئیات عددی'}
              tone={oversight ? 'gold' : 'rose'}
              icon={oversight ? <ShieldCheck size={18} /> : <span>⚠️</span>}
            />
          </>
        )}
      </div>

      {manager ? (
        <>
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all active:scale-95',
                  tab === t.key
                    ? 'bg-[#0b2e20] text-white shadow-md'
                    : 'border border-border bg-card text-muted-foreground hover:border-[#0e7a4a]/40'
                )}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {tab === 'board' && (
            <SectionCard
              title="تابلوی شمارش امروز"
              subtitle="روی هر زون بزنید تا جزئیات کامل (اعداد شمارش، موجودی هلو و اختلاف) باز شود"
              icon={<LayoutDashboard size={18} />}
              actions={
                <span className="rounded-lg bg-[#0e7a4a]/10 px-2.5 py-1 text-[11px] font-black text-[#0e7a4a]">
                  تلورانس پیش‌فرض: ٪{faNum(2)}
                </span>
              }
            >
              <BoardTab data={d} onDelete={removeEntry} onScience={() => ctx.navigate('science', 'count')} canConfirm={canConfirm} onConfirmDone={refreshAll} />
            </SectionCard>
          )}

          {tab === 'map' && (
            <SectionCard
              title="نقشهٔ فروشگاه"
              subtitle="پلان واقعی مغازه از ویرایشگر «پلان فروشگاه» + وضعیت شمارش امروز هر زون — روی زون بزنید"
              icon={<MapIcon size={18} />}
            >
              <MapTab
                mapZones={mapZones}
                statuses={mapStatuses}
                efficiency={zonesData?.efficiency || {}}
                teamToday={teamToday}
                staffAssignments={zonesData?.staffAssignments || []}
                canManageZones={canManageZones}
                selected={selectedMapZone}
                onSelect={setSelectedMapZone}
                onZoneSaved={loadZones}
                goToFloorplan={() => ctx.navigate('floorplan')}
              />
            </SectionCard>
          )}

          {tab === 'mine' && (
            <>
              <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/60 bg-card p-4">
                <Labeled label="تلورانس مغایرت مجاز (٪)">
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={tolerance}
                    onChange={(e) => setTolerance(Math.min(20, Math.max(0, Number(e.target.value) || 0)))}
                    className="w-24 rounded-xl border border-input bg-white px-3 py-2 text-center text-sm font-black outline-none focus:border-[#0e7a4a]"
                  />
                </Labeled>
                <p className="max-w-md pb-1 text-[11px] leading-5 text-muted-foreground">
                  اختلاف تا این درصد از موجودی هلو «مطابق» حساب می‌شود؛ این عدد با ثبت شما برای همان روز ذخیره می‌شود.
                </p>
              </div>
              <SectionCard title="زون‌های من" subtitle="برای شمارش شخصی، زون را انتخاب کنید" icon={<span>🗺️</span>}>
                <ZonePicker zones={d?.myZones || []} value={zone} onPick={changeZone} />
              </SectionCard>
              {result && <ResultBanner result={result} />}
              {zone && (
                <CountPanel
                  zone={zone}
                  products={d?.products || []}
                  qtys={qtys}
                  touched={touched}
                  saving={saving}
                  autoSaved={autoSaved}
                  onQty={setQty}
                  onSubmit={() => submit(false)}
                />
              )}
            </>
          )}

          {tab === 'team' && (
            <SectionCard title="تاریخچهٔ ۱۴ روز تیم" subtitle="روزانه × زون × همکار — وضعیت، دوباره‌شماری و تأیید ناظر" icon={<History size={18} />}>
              <TeamHistory rows={d?.teamHistory || []} />
            </SectionCard>
          )}

          {tab === 'zonesadmin' && (
            <ZonesAdminTab
              zonesData={zonesData}
              categories={d?.zones || []}
              users={users}
              canManageZones={canManageZones}
              onSaved={async () => {
                await Promise.all([loadZones(), loadUsers()])
                await refresh(zoneRef.current)
              }}
            />
          )}
        </>
      ) : (
        <>
          <SectionCard title="زون‌های من" subtitle="زون تخصیص‌یافته را انتخاب و شمارش امروز را ثبت کنید" icon={<span>🗺️</span>}>
            <ZonePicker zones={d?.myZones || []} value={zone} onPick={changeZone} />
          </SectionCard>
          {result && <ResultBanner result={result} />}
          {zone ? (
            <CountPanel
              zone={zone}
              products={d?.products || []}
              qtys={qtys}
              touched={touched}
              saving={saving}
              autoSaved={autoSaved}
              onQty={setQty}
              onSubmit={() => submit(false)}
            />
          ) : (
            d && <EmptyState emoji="👆" title="یک زون انتخاب کنید" hint="برای شروع شمارش، روی یکی از زون‌های بالا بزنید." />
          )}
          <SectionCard
            title="تاریخچهٔ شمارش‌های من"
            subtitle="۲۰ ثبت آخر — بدون هیچ عدد سیستمی"
            icon={<History size={18} />}
            actions={
              <span className="rounded-lg bg-[#c9a227]/15 px-2.5 py-1 text-[11px] font-black text-[#8a6d10]">
                🔥 زنجیرهٔ {faNum(d?.stats.myStreak || 0)} روزه
              </span>
            }
          >
            <MyHistory rows={d?.history || []} onDelete={removeEntry} />
          </SectionCard>
          <BlindWhy />
        </>
      )}

      {/* مودال جریان مغایرت — فقط برای شمارندهٔ کور */}
      {mmStep !== 0 && (
        <MismatchFlowModal
          step={mmStep === 2 ? 2 : 3}
          zone={zone}
          reason={mmReason}
          setReason={setMmReason}
          busy={saving}
          onRecheck={() => {
            void submit(false, { recheck: true })
          }}
          onFinal={() => {
            void submit(false, { recheck: true, reason: mmReason })
          }}
          onClose={() => setMmStep(0)}
        />
      )}
    </div>
  )
}
