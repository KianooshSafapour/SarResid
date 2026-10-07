'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { cn } from '@/lib/utils'
import {
  J_MONTHS,
  addDaysIso,
  faNum,
  formatJalaliFull,
  formatJalaliShort,
  jalaliToIso,
  jMonthLength,
  jMonthStartWeekday,
  toJalaliParts,
  todayIso,
  weekdayName,
} from '@/lib/jalali'
import { ROLE_LABELS } from '@/lib/constants'
import { SectionCard, Pill, EmptyState, Labeled, KeyValue, Avatar } from '@/components/app/ui-bits'
import type { AppCtx } from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import { JalaliDatePicker, useHolidays, calFontStyle } from '@/components/app/jalali-widgets'
import { Button } from '@/components/ui/button'
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hourglass,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react'

type Leave = {
  id: string
  userId: string
  userName: string
  type: string
  fromDate: string
  toDate: string
  fromHour: string
  toHour: string
  days: number
  reason: string
  status: string
  approverId: string
  approverName: string
  responseNote: string
  replacementId: string
  replacementName: string
  createdAt: string
}

type UserLite = { id: string; name: string; role: string; color: string; active: boolean }

/** 19-c — رکورد روز غیرکاری اداری (date قالب جلالی yyyy-mm-dd) */
type OffdayRow = { id: string; date: string; kind: string; note: string; createdByName: string }

type LeavePolicy = {
  maxPerDayWithoutReplacement: number
  hardCapPerDay: number
  requireReplacementNote: boolean
  minPresentPerShift: number
  blockFridays: boolean
  blockHolidays: boolean
}

type CapacityDay = { out: number; remaining: number; present: number; presentOk: boolean }

type LeavesData = {
  mine: Leave[]
  all: Leave[]
  pending: Leave[]
  users: UserLite[]
  policy: LeavePolicy
  capacity: Record<string, CapacityDay>
  stats: {
    myApprovedDays: number
    myPending: number
    pendingCount: number
    teamOutToday: { userName: string; type: string; toDate: string }[]
  }
}

const TYPE_META: Record<string, { label: string; color: string; emoji: string }> = {
  HOURLY: { label: 'ساعتی', color: '#c96f4a', emoji: '⏰' },
  DAILY: { label: 'روزانه', color: '#0e7a4a', emoji: '📅' },
  SICK: { label: 'استعلاجی', color: '#77934a', emoji: '🩺' },
  UNPAID: { label: 'بدون حقوق', color: '#8a6d10', emoji: '📝' },
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'در انتظار تأیید', color: '#c9a227' },
  APPROVED: { label: 'تأیید شده', color: '#0e7a4a' },
  REJECTED: { label: 'رد شده', color: '#b3372f' },
}

const J_WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

/* ── 19-c — پیوند با حقوق: دقیقهٔ کار روزانهٔ مأخذ کسر (هماهنگ با api/leaves) ── */
const DAILY_WORK_MINUTES = 480
const round2 = (n: number) => Math.round(n * 100) / 100
/** عدد اعشاری با ممیز فارسی: ۰٫۵۲ */
function faDec(n: number): string {
  return faNum(String(round2(n)).replace('.', '٫'))
}
const pad2n = (n: number) => String(n).padStart(2, '0')
/** کلید تاریخ جلالی یک روز iso — قالب ذخیرهٔ Offday.date */
function jalaliDateKey(iso: string): string {
  const p = toJalaliParts(iso)
  return `${p.jy}-${pad2n(p.jm)}-${pad2n(p.jd)}`
}

/* ── 17-E — دقت دقیقه در مرخصی ساعتی: "HH:MM" → دقیقه ── */
/** "HH:MM" → دقیقه از نیمه‌شب؛ نامعتبر → null */
function hmToMin(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim())
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (h > 23 || mm > 59) return null
  return h * 60 + mm
}
/** مدت مرخصی ساعتی به دقیقه — بازهٔ نامعتبر → ۰ */
function hourlyMinutes(from: string, to: string): number {
  const a = hmToMin(from)
  const b = hmToMin(to)
  if (a == null || b == null) return 0
  return Math.max(0, b - a)
}
/** «۱ ساعت و ۴۵ دقیقه» با ارقام فارسی */
function faMinLong(minutes: number): string {
  const m = Math.max(0, Math.round(minutes || 0))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h && r) return `${faNum(h)} ساعت و ${faNum(r)} دقیقه`
  if (h) return `${faNum(h)} ساعت`
  if (r) return `${faNum(r)} دقیقه`
  return '۰ دقیقه'
}
/** «۱:۴۵» فشرده با ارقام فارسی */
function faHm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes || 0))
  return `${faNum(Math.floor(m / 60))}:${faNum(String(m % 60).padStart(2, '0'))}`
}

const INPUT_CLS =
  'w-full rounded-xl border border-input bg-white/90 px-4 py-2.5 text-sm shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

/**
 * 19-c — انتخابگر «ساعت:دقیقه» برای مرخصی ساعتی:
 * دو select جدا (۰۰–۲۳ ساعت، ۰۰–۵۵ دقیقه با گام ۵) با ارقام فارسی — بدون ورودی آزادِ خطاپذیر.
 */
function HmPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const ok = /^(\d{1,2}):(\d{2})$/.test(value || '')
  const h = ok ? value.split(':')[0].padStart(2, '0') : '09'
  const m = ok ? value.split(':')[1] : '00'
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))
  const selCls =
    'w-full rounded-xl border border-input bg-white/90 px-1 py-2.5 text-center text-sm font-bold tabular-nums shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'
  return (
    <div dir="ltr" className="flex items-center gap-1.5">
      <select aria-label={`${label} — ساعت`} value={h} onChange={(e) => onChange(`${e.target.value}:${m}`)} className={selCls}>
        {hours.map((hh) => (
          <option key={hh} value={hh}>{faNum(hh)}</option>
        ))}
      </select>
      <span className="text-sm font-black text-muted-foreground">:</span>
      <select aria-label={`${label} — دقیقه`} value={m} onChange={(e) => onChange(`${h}:${e.target.value}`)} className={selCls}>
        {minutes.map((mm) => (
          <option key={mm} value={mm}>{faNum(mm)}</option>
        ))}
      </select>
    </div>
  )
}

/**
 * 19-c — «جانشین»: جست‌وجوی فازی ساده (includes) روی همکارانِ فعال + انتخاب از فهرست کشویی.
 * فیلد اختیاری — پس از انتخاب به‌صورت چیپ سبز با دکمهٔ حذف نمایش داده می‌شود.
 */
function ReplacementPicker({ users, value, onChange }: {
  users: UserLite[]
  value: { id: string; name: string } | null
  onChange: (v: { id: string; name: string } | null) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const candidates = useMemo(() => {
    const pool = users.filter((u) => u.active)
    const needle = q.trim()
    if (!needle) return pool.slice(0, 8)
    return pool.filter((u) => u.name.includes(needle) || (ROLE_LABELS[u.role] || '').includes(needle)).slice(0, 8)
  }, [users, q])

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-[#0e7a4a]/40 bg-[#0e7a4a]/5 px-3 py-2">
        <span className="flex items-center gap-2 text-xs font-black text-[#0e7a4a]">
          <Avatar name={value.name} color="#0e7a4a" size={24} />
          جانشین: {value.name}
        </span>
        <button type="button" onClick={() => onChange(null)} title="حذف جانشین" className="rounded-lg p-1 text-[#b3372f] transition hover:bg-[#b3372f]/10">
          <X size={14} />
        </button>
      </div>
    )
  }
  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />}
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="جست‌وجوی نام همکار فعال… (اختیاری)"
        className={INPUT_CLS}
      />
      {open && candidates.length > 0 && (
        <div className="scroll-gold absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-border bg-white shadow-lg">
          {candidates.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => { onChange({ id: u.id, name: u.name }); setOpen(false); setQ('') }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-xs font-bold transition hover:bg-secondary"
            >
              <span className="flex items-center gap-2">
                <Avatar name={u.name} color={u.color} size={24} />
                {u.name}
              </span>
              <span className="text-[10px] text-muted-foreground">{ROLE_LABELS[u.role] || 'همکار'}</span>
            </button>
          ))}
        </div>
      )}
      {open && candidates.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-xs text-muted-foreground shadow-lg">
          همکار فعالی با این نام یافت نشد
        </div>
      )}
    </div>
  )
}

export default function LeavesView({ ctx }: { ctx: AppCtx }) {
  const [data, setData] = useState<LeavesData | null>(null)
  const [loading, setLoading] = useState(true)
  const holidays = useHolidays()

  const init = toJalaliParts(todayIso())
  const [jy, setJy] = useState(init.jy)
  const [jm, setJm] = useState(init.jm)
  const [selectedDay, setSelectedDay] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [type, setType] = useState('DAILY')
  const [fromDate, setFromDate] = useState(todayIso())
  const [toDate, setToDate] = useState(todayIso())
  const [fromHour, setFromHour] = useState('09:00')
  const [toHour, setToHour] = useState('13:00')
  const [reason, setReason] = useState('')
  const [replacement, setReplacement] = useState<{ id: string; name: string } | null>(null) // 19-c جانشین
  const [saving, setSaving] = useState(false)

  // 19-c — روزهای غیرکاری اداری (Offday) برای ماه نمایش‌شدهٔ تقویم
  const [offdays, setOffdays] = useState<OffdayRow[]>([])
  const [offdayBusy, setOffdayBusy] = useState(false)

  const [rejectFor, setRejectFor] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [approveFor, setApproveFor] = useState<string | null>(null)
  const [replacementNote, setReplacementNote] = useState('')
  const [overrideNote, setOverrideNote] = useState('')

  const isManager = ['OM', 'GM', 'OWNER'].includes(ctx.user?.role || '')
  const today = todayIso()

  const load = () => {
    api<LeavesData>('/api/leaves?capacity=1')
      .then(setData)
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    load()
  }, [])

  // 19-c — واکشی روزهای غیرکاری ماه نمایش‌شده
  const loadOffdays = (pjy = jy, pjm = jm) => {
    api<{ offdays: OffdayRow[] }>(`/api/offdays?jy=${pjy}&jm=${pjm}`)
      .then((r) => setOffdays(r.offdays || []))
      .catch(() => setOffdays([]))
  }
  useEffect(() => {
    loadOffdays(jy, jm)
  }, [jy, jm])

  /** 19-c — toggle روز غیرکاری (فقط مدیران — دکمه‌های غیرمدیریتی disabled است) */
  const toggleOffday = async (iso: string) => {
    setOffdayBusy(true)
    try {
      const r = await api<{ created: boolean }>('/api/offdays', { method: 'POST', body: { date: jalaliDateKey(iso) } })
      toast.success(r.created ? 'روز غیرکاری ثبت شد (با پرداخت کامل — بدون کسر)' : 'روز غیرکاری لغو شد')
      loadOffdays()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setOffdayBusy(false)
    }
  }

  const usersById = useMemo(() => new Map((data?.users || []).map((u) => [u.id, u])), [data])
  const activeCount = (data?.users || []).filter((u) => u.active).length
  const policy: LeavePolicy | null = data?.policy || null
  const capacity = data?.capacity || {}

  /** 19-c — مجموعهٔ تاریخ‌های غیرکاری اداری (کلید جلالی) + فهرست برای نمایش */
  const offdaySet = useMemo(() => new Set(offdays.map((o) => o.date)), [offdays])

  /* ───── تقویم ماه جلالی ───── */
  const cells = useMemo(() => {
    const len = jMonthLength(jy, jm)
    const arr: ({ iso: string; d: number } | null)[] = Array(jMonthStartWeekday(jy, jm)).fill(null)
    for (let d = 1; d <= len; d++) arr.push({ iso: jalaliToIso(jy, jm, d), d })
    return arr
  }, [jy, jm])

  const approvedByDay = useMemo(() => {
    const map = new Map<string, { userId: string; userName: string; color: string; type: string; toDate: string }[]>()
    for (const l of data?.all || []) {
      if (l.status !== 'APPROVED') continue
      const color = usersById.get(l.userId)?.color || '#0e7a4a'
      let iso = l.fromDate
      let guard = 0
      while (iso <= l.toDate && guard < 120) {
        const arr = map.get(iso) || []
        arr.push({ userId: l.userId, userName: l.userName, color, type: l.type, toDate: l.toDate })
        map.set(iso, arr)
        iso = addDaysIso(1, iso)
        guard++
      }
    }
    return map
  }, [data, usersById])

  const pendingByDay = useMemo(() => {
    const map = new Map<string, { userId: string; userName: string; type: string }[]>()
    for (const l of data?.all || []) {
      if (l.status !== 'PENDING') continue
      let iso = l.fromDate
      let guard = 0
      while (iso <= l.toDate && guard < 120) {
        const arr = map.get(iso) || []
        arr.push({ userId: l.userId, userName: l.userName, type: l.type })
        map.set(iso, arr)
        iso = addDaysIso(1, iso)
        guard++
      }
    }
    return map
  }, [data])

  const moveMonth = (dir: number) => {
    let m = jm + dir
    let y = jy
    if (m > 12) { m = 1; y++ }
    if (m < 1) { m = 12; y-- }
    setJm(m)
    setJy(y)
  }
  const goToday = () => {
    const t = toJalaliParts(todayIso())
    setJy(t.jy)
    setJm(t.jm)
    setSelectedDay(todayIso())
  }

  /* ───── جزئیات روز انتخاب‌شده ───── */
  const dayOut = selectedDay ? approvedByDay.get(selectedDay) || [] : []
  const dayPending = selectedDay ? pendingByDay.get(selectedDay) || [] : []
  const freeCapacity = activeCount - dayOut.length
  const dayHoliday = selectedDay ? holidays.get(selectedDay) : undefined

  /* ───── ثبت درخواست ───── */
  const resetForm = () => {
    setType('DAILY')
    setFromDate(todayIso())
    setToDate(todayIso())
    setFromHour('09:00')
    setToHour('13:00')
    setReason('')
    setReplacement(null)
  }
  const pickType = (t: string) => {
    setType(t)
    if (t === 'HOURLY') setToDate(fromDate)
  }
  const pickFrom = (iso: string) => {
    setFromDate(iso)
    if (type === 'HOURLY') setToDate(iso)
    else if (toDate < iso) setToDate(iso)
  }
  const submit = async () => {
    if (!fromDate) return toast.error('تاریخ شروع الزامی است')
    if (type === 'HOURLY') {
      if (!fromHour || !toHour) return toast.error('ساعت شروع و پایان الزامی است')
      if (fromHour >= toHour) return toast.error('ساعت شروع باید قبل از ساعت پایان باشد')
    } else {
      if (!toDate) return toast.error('تاریخ پایان الزامی است')
      if (fromDate > toDate) return toast.error('تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد')
    }
    setSaving(true)
    try {
      const res = await api<{ leave: Leave; conflict: string | null }>('/api/leaves', {
        method: 'POST',
        body: {
          type,
          fromDate,
          toDate: type === 'HOURLY' ? fromDate : toDate,
          fromHour: type === 'HOURLY' ? fromHour : '',
          toHour: type === 'HOURLY' ? toHour : '',
          reason,
          replacementId: replacement?.id || '',
        },
      })
      toast.success('درخواست مرخصی ثبت شد — در انتظار تأیید مدیر')
      if (res.conflict) toast.warning(res.conflict, { duration: 9000 })
      setAddOpen(false)
      resetForm()
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  /* ───── تأیید / رد / حذف ───── */
  const act = async (l: Leave, action: 'approve' | 'reject', note = '', extra: Record<string, unknown> = {}) => {
    try {
      await api('/api/leaves', { method: 'PUT', body: { id: l.id, action, responseNote: note, ...extra } })
      if (action === 'approve') toast.success('مرخصی تأیید شد — تقویم تیم به‌روز شد')
      else toast.success('درخواست رد شد')
      setRejectFor(null)
      setRejectNote('')
      setApproveFor(null)
      setReplacementNote('')
      setOverrideNote('')
      load()
    } catch (e: any) {
      toast.error(e.message, { duration: 8000 })
    }
  }

  /** تعداد مرخصی تأییدشدهٔ هم‌پوشان روز شروع (برای گیت سیاست قبل از تأیید) */
  const overlapCountFor = (l: Leave) =>
    (data?.all || []).filter((a) => a.status === 'APPROVED' && a.userId !== l.userId && a.fromDate <= l.toDate && a.toDate >= l.fromDate).length

  /** گیت سیاست: اگر سقف پر باشد، فرم یادداشت جایگزین/استثنا باز می‌شود؛ وگرنه تأیید مستقیم */
  const requestApprove = (l: Leave) => {
    if (!policy) return act(l, 'approve')
    const overlap = overlapCountFor(l)
    const hardFull = overlap >= policy.hardCapPerDay
    const needsNote = policy.requireReplacementNote ? overlap > 0 : overlap >= policy.maxPerDayWithoutReplacement
    if (hardFull || needsNote) {
      setApproveFor(l.id)
      setReplacementNote('')
      setOverrideNote('')
      return
    }
    act(l, 'approve')
  }

  const submitApprove = (l: Leave) => {
    const overlap = overlapCountFor(l)
    const isExecUser = ['OWNER', 'GM', 'OM', 'ADMIN'].includes(ctx.user?.role || '')
    const hardFull = overlap >= (policy?.hardCapPerDay ?? 4)
    if (hardFull) {
      if (!isExecUser) return toast.error('سقف روزانه مرخصی پر است — امکان تأیید نیست')
      if (!overrideNote.trim()) return toast.error('سقف روزانه پر است — برای استثنا، یادداشت استثنا (مدیر ارشد) را بنویسید')
      return act(l, 'approve', '', { overrideNote })
    }
    if (replacementNote.trim().length < 2) return toast.error('نام جایگزین را ثبت کنید')
    act(l, 'approve', '', hardFull ? { replacementNote, overrideNote } : { replacementNote })
  }
  const remove = async (l: Leave) => {
    if (!window.confirm('این درخواست مرخصی حذف شود؟')) return
    try {
      await api(`/api/leaves?id=${l.id}`, { method: 'DELETE' })
      toast.success('درخواست حذف شد')
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  /** هم‌پوشانی درخواست در نوبت با مرخصی‌های تأییدشدهٔ دیگران (نشان FCFS برای تأییدکننده) */
  const conflictNamesFor = (l: Leave) =>
    (data?.all || [])
      .filter((a) => a.status === 'APPROVED' && a.userId !== l.userId && a.fromDate <= l.toDate && a.toDate >= l.fromDate)
      .map((a) => a.userName)

  if (loading && !data) {
    return <div className="py-24 text-center text-sm font-bold text-muted-foreground">در حال بارگذاری مدیریت مرخصی…</div>
  }
  if (!data) return null

  const teamOutNames = data.stats.teamOutToday.map((t) => t.userName).slice(0, 3).join('، ')

  return (
    <div className="space-y-5">
      {/* سرصفحه */}
      <div className="fade-in-up">
        <h1 className="text-xl font-black text-foreground sm:text-2xl">مدیریت مرخصی و غیبت</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ثبت درخواست، تقویم شفاف تیم و تأیید نوبتی — اولین ثبت، اولویت دارد و برای همه قابل مشاهده است
        </p>
      </div>

      {/* KPI */}
      <div className={cn('grid grid-cols-2 gap-3', isManager ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
        <StatKpi
          label="مرخصی‌های تأییدشدهٔ من (امسال)"
          value={`${faNum(data.stats.myApprovedDays)} روز`}
          tone="emerald"
          icon={<CalendarCheck size={18} />}
          hint="جمع روزهای تأییدشدهٔ سال جاری"
        />
        <StatKpi
          label="در انتظار تأیید"
          value={faNum(data.stats.myPending)}
          tone="gold"
          icon={<Clock size={18} />}
          hint="درخواست‌های در نوبتِ خودتان"
        />
        <StatKpi
          label="امروز غایب"
          value={faNum(data.stats.teamOutToday.length)}
          tone="terra"
          icon={<Users size={18} />}
          hint={teamOutNames || 'همهٔ همکاران حاضرند'}
        />
        {isManager && (
          <StatKpi
            label="صف تأیید"
            value={faNum(data.stats.pendingCount)}
            tone="rose"
            icon={<Hourglass size={18} />}
            hint="درخواست‌های منتظر تصمیم شما"
          />
        )}
      </div>

      {/* نوار ظرفیت مرخصی امروز — سیاست سقف روزانه */}
      {policy && (
        <div className="fade-in-up rounded-2xl border border-border/70 bg-card p-3">
          {(() => {
            const cap = capacity[today]
            const maxCap = policy.maxPerDayWithoutReplacement
            const outToday = cap ? cap.out : data.stats.teamOutToday.length
            const remaining = Math.max(0, maxCap - outToday)
            const pct = maxCap > 0 ? Math.min(100, Math.round((outToday / maxCap) * 100)) : 0
            const barColor = remaining <= 0 ? '#b3372f' : pct > 60 ? '#c9a227' : '#0e7a4a'
            return (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-[210px] flex-1">
                  <p className="text-xs font-black">
                    ظرفیت مرخصی امروز: <span style={{ color: barColor }}>{faNum(remaining)} نفر</span>
                    <span className="mr-1.5 text-[10px] font-bold text-muted-foreground">
                      ({faNum(outToday)} تأییدشده از سقف {faNum(maxCap)} — حداقل حاضرین شیفت: {faNum(policy.minPresentPerShift)})
                    </span>
                  </p>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                  <Pill label={`بدون جایگزین تا ${faNum(maxCap)} نفر`} color="#0e7a4a" bg="#0e7a4a10" />
                  <Pill label={`سقف روزانه: ${faNum(policy.hardCapPerDay)}`} color="#b3372f" bg="#b3372f10" />
                  {policy.blockHolidays && <Pill label="تعطیل رسمی: بسته" color="#8a6d10" bg="#fdf6dd" />}
                  {policy.blockFridays && <Pill label="جمعه: بسته" color="#8a6d10" bg="#fdf6dd" />}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* تقویم تیم */}
        <SectionCard
          title="تقویم مرخصی تیم"
          subtitle="مرخصی‌های تأییدشدهٔ همهٔ همکاران — برای جزئیات روی هر روز بزنید"
          icon={<CalendarDays size={18} />}
          className="lg:col-span-2"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveMonth(1)} aria-label="ماه بعد">
                <ChevronRight size={16} />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveMonth(-1)} aria-label="ماه قبل">
                <ChevronLeft size={16} />
              </Button>
            </div>
            <div className="text-sm font-black text-foreground">
              {J_MONTHS[jm - 1]} {faNum(jy)}
            </div>
            <button
              onClick={goToday}
              className="rounded-full border border-border px-3 py-1 text-[11px] font-bold text-foreground/80 transition hover:border-[#c9a227] hover:bg-[#c9a227]/10"
            >
              برو به امروز
            </button>
          </div>

          <div className="mb-1.5 grid grid-cols-7 gap-1 text-center font-bold text-muted-foreground sm:gap-1.5" style={calFontStyle('calc(var(--cal-font, 13px) * 0.8)')}>
            {J_WEEKDAYS_SHORT.map((d, i) => (
              <span key={i} className={d === 'ج' ? 'text-[#b3372f]' : ''}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5" style={calFontStyle()}>
            {cells.map((c, i) => {
              if (!c) return <span key={`e${i}`} />
              const iso = c.iso
              const out = approvedByDay.get(iso) || []
              const pend = pendingByDay.get(iso) || []
              const isToday = iso === today
              const isAdminOff = offdaySet.has(jalaliDateKey(iso)) // 19-c — روز غیرکاری اداری (رکورد Offday)
              const isOffday = weekdayName(iso) === 'جمعه' || holidays.has(iso) || isAdminOff
              const hol = holidays.get(iso)
              const sel = selectedDay === iso
              const capDay = capacity[iso]
              const capHint = capDay ? `ظرفیت مرخصی این روز: ${capDay.remaining} نفر (حاضر: ${capDay.present})` : ''
              const tip = [
                formatJalaliFull(iso),
                hol ? `تعطیل رسمی: ${hol}` : '',
                isAdminOff ? 'غیرکاری اداری' : '',
                capHint,
                out.length ? `غایب: ${out.map((o) => o.userName).join('، ')}` : '',
              ]
                .filter(Boolean)
                .join(' • ')
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelectedDay(iso)}
                  title={tip}
                  className={cn(
                    'relative flex h-14 flex-col items-center rounded-xl border text-xs font-bold transition-all sm:h-16',
                    sel
                      ? 'border-[#0e7a4a] bg-[#0e7a4a]/10'
                      : isOffday
                        ? 'border-[#b3372f]/20 bg-[#b3372f]/5 text-[#b3372f]'
                        : 'border-border/60 bg-white/50 hover:bg-secondary',
                    isToday && 'ring-2 ring-[#c9a227]'
                  )}
                >
                  <span className={cn('mt-1', sel && 'text-[#0e7a4a]')} style={{ fontSize: 'var(--cal-font, 13px)' }}>{faNum(c.d)}</span>
                  <span className="absolute bottom-1 flex items-center gap-0.5">
                    {out.slice(0, 3).map((o, j) => (
                      <span key={j} className="h-2 w-2 rounded-full border border-white shadow-sm" style={{ background: o.color }} />
                    ))}
                    {out.length > 3 && <span className="text-[8px] font-black text-muted-foreground">+{faNum(out.length - 3)}</span>}
                    {pend.length > 0 && <span className="h-2 w-2 rounded-full border-[1.5px] border-[#c9a227]" title="در انتظار تأیید" />}
                    {capDay && capDay.remaining <= 0 && <span className="h-2 w-2 rounded-full bg-[#b3372f]/70" title="ظرفیت مرخصی این روز پر است" />}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-bold text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#0e7a4a]" /> تأییدشده (رنگ همکار)</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full border-[1.5px] border-[#c9a227]" /> در انتظار تأیید</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-md ring-2 ring-[#c9a227]" /> امروز</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#b3372f]" /> جمعه / تعطیل رسمی</span>
          </div>

          {/* نوار جزئیات روز */}
          {selectedDay ? (
            <div className="fade-in-up mt-4 rounded-xl border border-border/70 bg-muted/30 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-sm font-black text-foreground">{formatJalaliFull(selectedDay)}</p>
                {selectedDay === today && <Pill label="امروز" color="#c9a227" bg="#c9a22722" />}
                {dayHoliday && <Pill label={dayHoliday} color="#b3372f" bg="#b3372f14" />}
              </div>
              <KeyValue
                k="ظرفیت آزاد این روز"
                v={
                  <span className={freeCapacity <= 0 ? 'text-[#b3372f]' : 'text-[#0e7a4a]'}>
                    {faNum(Math.max(freeCapacity, 0))} نفر از {faNum(activeCount)}
                  </span>
                }
              />
              {dayOut.length > 0 ? (
                <div className="mt-2 space-y-1.5">
                  {dayOut.map((o, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={o.userName} color={o.color} size={28} />
                        <div>
                          <p className="text-xs font-black text-foreground">{o.userName}</p>
                          <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[usersById.get(o.userId)?.role || ''] || 'همکار'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Pill label={`${TYPE_META[o.type]?.emoji || ''} ${TYPE_META[o.type]?.label || o.type}`} color={TYPE_META[o.type]?.color || '#0e7a4a'} />
                        <span className="whitespace-nowrap text-[10px] font-bold text-muted-foreground">
                          {o.toDate !== selectedDay ? `تا ${formatJalaliShort(o.toDate)}` : 'همین روز'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs font-bold text-[#0e7a4a]">در این روز کسی مرخصی تأییدشده ندارد ✓</p>
              )}
              {dayPending.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[10px] font-bold text-[#8a6d10]">درخواست‌های در نوبت برای این روز:</p>
                  {dayPending.map((p, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-[#c9a227]/10 px-3 py-1.5">
                      <span className="text-xs font-bold text-foreground/85">{p.userName}</span>
                      <Pill label="در انتظار تأیید" color="#c9a227" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-center text-xs text-muted-foreground">
              برای دیدن غایبان و ظرفیت آزاد هر روز، روی تقویم بزنید
            </p>
          )}

          {/* 19-c — روزهای غیرکاری (فشرده): جمعه‌ها مشتق از تاریخ (بدون رکورد)، فقط روزهای اداری ثبت می‌شوند */}
          <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-black text-foreground">
                <CalendarOff size={14} className="text-[#8a6d10]" /> روزهای غیرکاری {J_MONTHS[jm - 1]} {faNum(jy)}
                {offdays.length > 0 && <span className="text-[10px] font-bold text-[#b3372f]">({faNum(offdays.length)} روز ثبت‌شده)</span>}
              </p>
              <span className="text-[10px] font-bold text-muted-foreground">
                {isManager ? 'برای ثبت/لغو روز اداری، روی چیپ روز بزنید' : 'تعیین روز غیرکاری با مدیران است'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: jMonthLength(jy, jm) }, (_, i) => i + 1).map((d) => {
                const iso = jalaliToIso(jy, jm, d)
                const fri = weekdayName(iso) === 'جمعه'
                const off = offdaySet.has(jalaliDateKey(iso))
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={!isManager || fri || offdayBusy}
                    onClick={() => toggleOffday(iso)}
                    title={
                      fri
                        ? 'جمعه — روز استراحت هفتگی با پرداخت کامل (مشتق از تاریخ — مادهٔ ۶۲)'
                        : off
                          ? 'روز غیرکاری اداری — کلیک = لغو'
                          : 'کلیک = ثبت روز غیرکاری اداری'
                    }
                    className={cn(
                      'flex h-9 w-9 flex-col items-center justify-center rounded-lg border text-[11px] font-bold leading-none transition',
                      off
                        ? 'border-[#b3372f]/50 bg-[#b3372f]/10 text-[#b3372f]'
                        : fri
                          ? 'cursor-default border-border/50 bg-[#fdf6dd] text-[#8a6d10]'
                          : 'border-border/60 bg-white/70 text-foreground/70 hover:border-[#c9a227] hover:bg-[#c9a227]/10',
                      iso === today && 'ring-2 ring-[#c9a227]',
                      offdayBusy && 'opacity-60'
                    )}
                  >
                    <span>{faNum(d)}</span>
                    {fri && <span className="mt-0.5 text-[7px] font-black">جمعه</span>}
                  </button>
                )
              })}
            </div>
            {offdays.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {offdays.map((o) => {
                  const jd = Number(o.date.split('-')[2]) || 0
                  return (
                    <span
                      key={o.id}
                      title={o.createdByName ? `ثبت: ${o.createdByName}` : undefined}
                      className="rounded-full bg-[#b3372f]/10 px-2.5 py-1 text-[10px] font-bold text-[#b3372f]"
                    >
                      {faNum(jd)} {J_MONTHS[jm - 1]}
                      {o.note ? ` — ${o.note}` : ''}
                    </span>
                  )
                })}
              </div>
            )}
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
              📖 جمعه، روز استراحت هفتگی با پرداخت کامل است (مواد ۶۲ تا ۶۶ قانون کار)؛ روزهای غیرکاری اداری با تصمیم مدیر ثبت و با پرداخت کامل — بدون کسر — لحاظ می‌شوند.
            </p>
          </div>
        </SectionCard>

        {/* درخواست‌های من */}
        <SectionCard
          title="درخواست‌های من"
          subtitle="تاریخچه و وضعیت مرخصی‌های شما"
          actions={
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-[#0e7a4a] px-4 py-2 text-xs font-black text-white shadow-md transition hover:bg-[#0b6a40]"
            >
              <Plus size={15} /> درخواست مرخصی جدید
            </button>
          }
        >
          {data.mine.length === 0 ? (
            <EmptyState
              emoji="🌴"
              title="مرخصی ثبت‌شده‌ای ندارید"
              hint="برای ثبت اولین درخواست، دکمهٔ «درخواست مرخصی جدید» را بزنید"
            />
          ) : (
            <div className="scroll-gold max-h-[420px] space-y-2 overflow-y-auto pl-1">
              {data.mine.map((l) => (
                <div key={l.id} className="rounded-xl border border-border/70 bg-white/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill label={`${TYPE_META[l.type]?.emoji || ''} ${TYPE_META[l.type]?.label || l.type}`} color={TYPE_META[l.type]?.color || '#0e7a4a'} />
                      <Pill label={STATUS_META[l.status]?.label || l.status} color={STATUS_META[l.status]?.color || '#6b7280'} />
                    </div>
                    {l.status === 'PENDING' && (
                      <button
                        onClick={() => remove(l)}
                        title="حذف درخواست"
                        className="rounded-lg p-1.5 text-[#b3372f] transition hover:bg-[#b3372f]/10"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-bold text-foreground">
                    {formatJalaliShort(l.fromDate)}
                    {l.toDate !== l.fromDate ? ` تا ${formatJalaliShort(l.toDate)}` : ''}
                    {l.type === 'HOURLY' && ` • ${faNum(l.fromHour)} تا ${faNum(l.toHour)}`}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {l.type === 'HOURLY'
                      ? `${faMinLong(hourlyMinutes(l.fromHour, l.toHour))} — معادل ${faDec(hourlyMinutes(l.fromHour, l.toHour) / DAILY_WORK_MINUTES)} روز کاری`
                      : `${faNum(l.days)} روز`}
                    {l.reason ? ` • ${l.reason}` : ''}
                  </p>
                  {l.replacementName && (
                    <p className="mt-1 text-[11px] font-bold text-[#77934a]">🤝 جانشین: {l.replacementName}</p>
                  )}
                  {l.status === 'APPROVED' && (
                    <p className="mt-1 text-[11px] font-bold text-[#0e7a4a]">تأییدکننده: {l.approverName}</p>
                  )}
                  {l.status === 'REJECTED' && (
                    <p className="mt-1 text-[11px] font-bold text-[#b3372f]">
                      رد توسط {l.approverName}
                      {l.responseNote ? ` — ${l.responseNote}` : ''}
                    </p>
                  )}
                  {l.status === 'PENDING' && l.responseNote && (
                    <p className="mt-1 text-[11px] font-bold text-[#8a6d10]">یادداشت: {l.responseNote}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* صف تأیید — فقط مدیران */}
      {isManager && (
        <SectionCard
          title="صف تأیید مرخصی"
          subtitle="به ترتیب ثبت — اولین درخواست، اولویت تأیید (FCFS)"
          icon={<Hourglass size={18} />}
        >
          {data.pending.length === 0 ? (
            <EmptyState emoji="✅" title="صف تأیید خالی است" hint="همهٔ درخواست‌های مرخصی بررسی شده‌اند" />
          ) : (
            <div className="scroll-gold max-h-[560px] space-y-2 overflow-y-auto pl-1">
              {data.pending.map((l, idx) => {
                const conflicts = conflictNamesFor(l)
                const overlap = overlapCountFor(l)
                const capDay = capacity[l.fromDate]
                const hardFull = policy ? overlap >= policy.hardCapPerDay : false
                const softFull = policy ? overlap >= policy.maxPerDayWithoutReplacement : false
                return (
                  <div key={l.id} className="rounded-xl border border-border/70 bg-white/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Avatar name={l.userName} color={usersById.get(l.userId)?.color || '#0e7a4a'} size={36} />
                      <div className="min-w-[150px] flex-1">
                        <p className="text-sm font-black text-foreground">
                          {l.userName}
                          <span className="mr-1.5 text-xs font-bold text-muted-foreground">
                            ({ROLE_LABELS[usersById.get(l.userId)?.role || ''] || 'همکار'})
                          </span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">نوبت {faNum(idx + 1)} • ثبت {formatJalaliShort(l.createdAt)}</p>
                      </div>
                      <Pill label={`${TYPE_META[l.type]?.emoji || ''} ${TYPE_META[l.type]?.label || l.type}`} color={TYPE_META[l.type]?.color || '#0e7a4a'} />
                    </div>
                    <p className="mt-2 text-sm font-bold text-foreground/90">
                      {formatJalaliShort(l.fromDate)}
                      {l.toDate !== l.fromDate ? ` تا ${formatJalaliShort(l.toDate)}` : ''}
                      {l.type === 'HOURLY' && ` • ${faNum(l.fromHour)} تا ${faNum(l.toHour)}`}
                      <span className="mr-2 text-xs font-bold text-muted-foreground">
                        ({l.type === 'HOURLY' ? `${faMinLong(hourlyMinutes(l.fromHour, l.toHour))} — معادل ${faDec(hourlyMinutes(l.fromHour, l.toHour) / DAILY_WORK_MINUTES)} روز` : `${faNum(l.days)} روز`})
                      </span>
                    </p>
                    {l.reason && <p className="mt-0.5 text-xs text-muted-foreground">دلیل: {l.reason}</p>}
                    {l.replacementName && <p className="mt-1 text-[11px] font-bold text-[#77934a]">🤝 جانشین: {l.replacementName}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {policy && (
                        <Pill
                          label={`ظرفیت روز شروع: ${faNum(capDay ? capDay.remaining : Math.max(0, policy.maxPerDayWithoutReplacement - overlap))}/${faNum(policy.maxPerDayWithoutReplacement)}`}
                          color={hardFull ? '#b3372f' : softFull ? '#a16207' : '#0e7a4a'}
                          bg={hardFull ? '#b3372f14' : softFull ? '#c9a22714' : '#0e7a4a10'}
                        />
                      )}
                      {conflicts.length > 0 && (
                        <span title={`مرخصی تأییدشدهٔ همپوشان: ${conflicts.join('، ')}`}>
                          <Pill label={`⚠ هم‌پوشانی با تأییدشدهٔ: ${conflicts.slice(0, 3).join('، ')}${conflicts.length > 3 ? ' و…' : ''}`} color="#b3372f" bg="#b3372f14" />
                        </span>
                      )}
                    </div>
                    {approveFor === l.id ? (
                      <div className="mt-2 space-y-2 rounded-xl border border-[#c9a227]/50 bg-[#fdf6dd]/40 p-3">
                        <p className="text-[11px] font-black text-[#8a6d10]">
                          {hardFull
                            ? '🛑 سقف روزانه مرخصی پر است — تأیید فقط با استثنای مدیر ارشد'
                            : `🛡️ سقف مرخصی بدون جایگزین پر شده (${faNum(overlap)} نفر تأییدشده) — نام جایگزین را ثبت کنید`}
                        </p>
                        {!hardFull && (
                          <input
                            value={replacementNote}
                            onChange={(e) => setReplacementNote(e.target.value)}
                            placeholder="نام جایگزین (الزامی) — مثلاً: رضا احمدی"
                            className="w-full rounded-xl border border-input bg-white px-3 py-2 text-xs shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          />
                        )}
                        {hardFull && (
                          <input
                            value={overrideNote}
                            onChange={(e) => setOverrideNote(e.target.value)}
                            placeholder="یادداشت استثنا (فقط مدیر ارشد) — مثلاً: پوشش با پرسنل شیف دوم"
                            className="w-full rounded-xl border border-[#b3372f]/50 bg-white px-3 py-2 text-xs shadow-sm outline-none focus:border-[#b3372f] focus:ring-2 focus:ring-[#b3372f]/20"
                          />
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => submitApprove(l)}
                            className="rounded-xl bg-[#0e7a4a] px-4 py-2 text-xs font-black text-white transition hover:bg-[#0b6a40]"
                          >
                            تأیید با ثبت {hardFull ? 'استثنا' : 'جایگزین'}
                          </button>
                          <button
                            onClick={() => { setApproveFor(null); setReplacementNote(''); setOverrideNote('') }}
                            className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted-foreground transition hover:bg-muted"
                          >
                            انصراف
                          </button>
                        </div>
                      </div>
                    ) : rejectFor === l.id ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <input
                          value={rejectNote}
                          onChange={(e) => setRejectNote(e.target.value)}
                          placeholder="دلیل رد (اختیاری)"
                          className="min-w-[160px] flex-1 rounded-xl border border-input bg-white/90 px-3 py-2 text-xs shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                        <button
                          onClick={() => act(l, 'reject', rejectNote)}
                          className="rounded-xl bg-[#b3372f] px-4 py-2 text-xs font-black text-white transition hover:bg-[#96291f]"
                        >
                          ثبت رد
                        </button>
                        <button
                          onClick={() => { setRejectFor(null); setRejectNote('') }}
                          className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted-foreground transition hover:bg-muted"
                        >
                          انصراف
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => requestApprove(l)}
                          className="flex items-center gap-1 rounded-xl bg-[#0e7a4a] px-4 py-2 text-xs font-black text-white transition hover:bg-[#0b6a40]"
                        >
                          <Check size={14} /> تأیید
                        </button>
                        <button
                          onClick={() => { setRejectFor(l.id); setRejectNote('') }}
                          className="rounded-xl border border-[#b3372f] px-4 py-2 text-xs font-black text-[#b3372f] transition hover:bg-[#b3372f]/10"
                        >
                          رد
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

      {/* مبانی علمی */}
      <SectionCard title="مبانی علمی" icon={<BookOpen size={18} />} subtitle="چرا نوبت‌بندی و تقویم مشترک؟">
        <ul className="space-y-2 text-sm leading-7 text-foreground/85">
          <li>
            قاعدهٔ «اولین ثبت، اولویت» (FCFS) کلاسیک‌ترین سازوکار انصاف در نظریهٔ صف‌ها و عدالت رویه‌ای است؛ پژوهش‌ها نشان می‌دهد
            ادراک بی‌طرفی سامانه زمانی بیشینه می‌شود که نتیجه تنها تابع زمان ثبت باشد، نه جایگاه یا رابطه
            <span className="text-[11px] text-muted-foreground"> (Rafaeli et al., 1997; Su, 2009)</span>.
          </li>
          <li>
            تقویم مشترک مرخصی نیز همان «برنامه‌ریزی روزهای عدم حضور» در ادبیات زمان‌بندی نیروی کار است: رؤیت‌پذیری زودهنگام
            غیبت‌ها امکان پوشش شیفت‌ها و روزهای پیک فروش را بدون تعارض فراهم می‌کند
            <span className="text-[11px] text-muted-foreground"> (Ernst et al., 2004; Van den Bergh et al., 2013)</span>.
          </li>
        </ul>
      </SectionCard>

      {/* مودال درخواست جدید */}
      {addOpen && (
        <Modal title="درخواست مرخصی جدید" onClose={() => setAddOpen(false)}>
          <Labeled label="نوع مرخصی">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TYPE_META).map(([key, meta]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => pickType(key)}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-sm font-bold transition-all',
                    type === key ? 'border-transparent text-white shadow-md' : 'border-border bg-white/80 hover:bg-secondary'
                  )}
                  style={type === key ? { background: meta.color } : undefined}
                >
                  {meta.emoji} {meta.label}
                </button>
              ))}
            </div>
          </Labeled>

          {type === 'HOURLY' ? (
            <>
              <Labeled label="روز مرخصی (ساعتی — فقط همان روز)" hint="کسر حقوق = دقیقهٔ مرخصی ÷ ۴۸۰ (دقیقهٔ کار روزانه) — دقیق و بدون گردکردن">
                <JalaliDatePicker value={fromDate} onChange={pickFrom} holidays={holidays} minDate={addDaysIso(-1)} warnHoliday={false} />
              </Labeled>
              <div className="grid grid-cols-2 gap-2">
                <Labeled label="از ساعت" hint="دقیقه هم انتخاب می‌شود — گام ۵">
                  <HmPicker value={fromHour} onChange={setFromHour} label="از ساعت" />
                </Labeled>
                <Labeled label="تا ساعت" hint="مثلاً ۱۳:۳۵ — گام ۵">
                  <HmPicker value={toHour} onChange={setToHour} label="تا ساعت" />
                </Labeled>
              </div>
          {(() => {
            const mins = hourlyMinutes(fromHour, toHour)
            const valid = hmToMin(fromHour) != null && hmToMin(toHour) != null && fromHour < toHour
            return (
              <p className={cn('rounded-xl px-3 py-2 text-[11px] font-bold', valid && mins > 0 ? 'bg-[#0e7a4a]/10 text-[#0e7a4a]' : 'bg-muted/60 text-muted-foreground')}>
                مدت محاسبه‌شده (زنده): {valid && mins > 0 ? `${faHm(mins)} — ${faMinLong(mins)} — معادل ${faDec(mins / DAILY_WORK_MINUTES)} روز کاری` : '—'}
              </p>
            )
          })()}
            </>
          ) : (
            <>
              <Labeled label="از تاریخ">
                <JalaliDatePicker value={fromDate} onChange={pickFrom} holidays={holidays} minDate={addDaysIso(-1)} warnHoliday={false} />
              </Labeled>
              <Labeled label="تا تاریخ">
                <JalaliDatePicker value={toDate} onChange={setToDate} holidays={holidays} minDate={fromDate} warnHoliday={false} />
              </Labeled>
            </>
          )}

          <Labeled label="جانشین (اختیاری)" hint="جست‌وجوی فازی میان همکارانِ فعال — با تأیید مدیر نهایی می‌شود">
            <ReplacementPicker users={data?.users || []} value={replacement} onChange={setReplacement} />
          </Labeled>

          <Labeled label="دلیل (اختیاری)">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="مثلاً کار اداری بانک"
              className={cn(INPUT_CLS, 'resize-none')}
            />
          </Labeled>

          <p className="rounded-xl bg-[#c9a227]/10 px-3 py-2 text-[11px] font-bold leading-5 text-[#8a6d10]">
            نوبت‌بندی به‌صورت «اولین ثبت، اولویت» است؛ ثبت درخواست به معنای تأیید نیست و تصمیم نهایی با مدیر عملیات است.
          </p>

          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className="w-full rounded-xl bg-[#0e7a4a] py-3 text-sm font-black text-white shadow-md transition hover:bg-[#0b6a40] disabled:opacity-60"
          >
            {saving ? 'در حال ثبت…' : 'ثبت درخواست'}
          </button>
        </Modal>
      )}
    </div>
  )
}

/** KPI tile مشابه StatCard اما با مقدار متنی آزاد */
function StatKpi({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string
  value: string
  hint?: string
  tone: 'emerald' | 'gold' | 'terra' | 'rose'
  icon: ReactNode
}) {
  const tones: Record<string, string> = {
    emerald: 'from-[#0e7a4a]/12 to-transparent text-[#0e7a4a]',
    gold: 'from-[#c9a227]/18 to-transparent text-[#8a6d10]',
    terra: 'from-[#c96f4a]/15 to-transparent text-[#a04c2a]',
    rose: 'from-[#b3372f]/12 to-transparent text-[#b3372f]',
  }
  return (
    <div className="glow-card rounded-2xl bg-card p-4">
      <div className={cn('-m-1 mb-2 flex items-center justify-between rounded-xl bg-gradient-to-l p-2', tones[tone])}>
        <span className="text-xl font-extrabold sm:text-2xl">{value}</span>
        <span className="opacity-80">{icon}</span>
      </div>
      <div className="text-xs font-semibold text-foreground sm:text-sm">{label}</div>
      {hint && <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  )
}
