import { useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn, Button, Input, Textarea, Card, CardContent, CardHeader, CardTitle, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, fa, formatJalaliLong, JalaliDate, minutesToHM, parseJalali, toFaDigits, todayJalali, Icon, I } from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   tasks/attendance — بررسی تیم (کنترل شیفت پرسنل)
   فقط دو شیفت: صبح ۷:۳۰ تا ۱۵:۳۰ (خانم لطفی) · عصر ۱۵:۳۰ تا ۲۳:۰۰ (آقای ملایی)
   ۱) حضور و وضعیت پرسنل — همهٔ کاربران فعال، از جمله خودِ مدیر (R5-P2)
      نوع ورود، اجازهٔ مدیر را در خودش دارد (درخواست مالک):
      «مرخصی» = با اجازهٔ مدیر · «غیبت» = بدون اجازه — چک‌باکس مجزا حذف شد.
      مرخصی تأییدشدهٔ همان روز ← ردیف «در مرخصی» (غیرقابل ویرایش)
   ۲) اضافه‌کار / مرخصی ساعتی از همین صفحه به سیستم حقوق جریان می‌یابد
      (ثبت کنترل شیفت + دکمهٔ صریح «ثبت در حقوق و دستمزد» — idempotent)
   ۳) ارجاع مشکلات حل‌نشده صبح  ۴) ثبت مشکل و پیگیری اقدام‌ها
   ───────────────────────────────────────────────────────────── */

/* R7: تأخیر بازگردانده شد — با اجازه و بدون اجازهٔ مدیر، هرکدام با دقیقهٔ تأخیر (مدل DB: arrival='late' + hadPermission + lateMinutes) */
const ARRIVALS = [
  { key: 'on_time', label: 'به‌وقت' },
  { key: 'late_p', label: 'تأخیر (با اجازهٔ مدیر)' },
  { key: 'late_np', label: 'تأخیر بدون اجازه' },
  { key: 'permitted_leave', label: 'مرخصی (با اجازهٔ مدیر)' },
  { key: 'absent', label: 'غیبت (بدون اجازه)' },
]
const ARRIVAL_CLS: Record<string, string> = {
  on_time: '',
  late_p: 'border-amber-300 bg-amber-50 text-amber-800',
  late_np: 'border-orange-400 bg-orange-50 text-orange-800',
  permitted_leave: 'border-teal-300 text-teal-700',
  absent: 'border-rose-300 text-rose-700',
}
const FOLLOWUPS = [
  { key: 'uniform', label: 'لباس فرم و ظاهر' },
  { key: 'hygiene', label: 'بهداشت فردی' },
  { key: 'behavior', label: 'برخورد با مشتری' },
  { key: 'workQuality', label: 'کیفیت کار' },
]
/* R7-PERF: پرچم‌های روزانه سه‌سطحی شدند (پژوهش R7 بخش ۶.۱) — مناسب / نقص جزئی / نیازمند پیگیری.
   نگاشت عددی در کارنامه ماهانه: ok=۱ · minor=۰٫۵ · needs_followup=۰ */
const FLAG_OPTS = [
  { key: 'ok', label: 'مناسب' },
  { key: 'minor', label: 'نقص جزئی' },
  { key: 'needs_followup', label: 'نامناسب — نیازمند پیگیری' },
]
/* رنگ انتخابگر: مناسب = خنثی · نقص جزئی = کهربایی روشن · نیازمند پیگیری = رز پررنگ */
const FLAG_CLS: Record<string, string> = {
  minor: 'border-amber-300 bg-amber-50 text-amber-800',
  needs_followup: 'border-rose-400 bg-rose-50 text-rose-700',
}
const PSTATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: 'باز', cls: 'border-amber-400 bg-amber-50 text-amber-800' },
  IN_PROGRESS: { label: 'در حال انجام', cls: 'border-teal-400 bg-teal-50 text-teal-800' },
  RESOLVED: { label: 'انجام شد', cls: 'border-emerald-400 bg-emerald-50 text-emerald-800' },
}
const SEV_LABEL: Record<string, string> = { critical: 'بحرانی', important: 'مهم', warning: 'هشدار', info: 'اطلاع' }
const SEV_CLASS: Record<string, string> = {
  critical: 'border-rose-400 bg-rose-100 text-rose-800',
  important: 'border-amber-400 bg-amber-50 text-amber-800',
  warning: 'border-amber-300 bg-amber-50 text-amber-700',
  info: 'border-stone-300 bg-stone-100 text-stone-700',
}
const SEVERITIES = [
  { key: 'important', label: 'مهم' },
  { key: 'warning', label: 'هشدار' },
  { key: 'critical', label: 'بحرانی' },
]

const MANAGER_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC']
const ROLE_FA: Record<string, string> = {
  OWNER: 'مالک', GM: 'مدیر کل', ADMIN: 'مدیر', EXEC: 'مدیر اجرایی', ACC: 'حسابدار', PM: 'مدیر محصولات',
  HC: 'صندوقدار ارشد', SK: 'انباردار', SALES: 'فروشنده', CASHIER: 'صندوقدار', MERCH: 'نیروی چیدمان',
}

const LEAVE_TYPE_FA: Record<string, string> = { DAILY: 'روزانه', SICK: 'استعلاجی', UNPAID: 'بدون حقوق', HOURLY: 'ساعتی' }

/** فقط دو شیفت — بدون شیفت شب */
const SHIFTS = [
  { key: 'MORNING' as const, label: 'شیفت صبح', time: '۷:۳۰ تا ۱۵:۳۰', manager: 'خانم لطفی' },
  { key: 'EVENING' as const, label: 'شیفت عصر', time: '۱۵:۳۰ تا ۲۳:۰۰', manager: 'آقای ملایی' },
]
const shiftMeta = (k: string) => SHIFTS.find((s) => s.key === k) || SHIFTS[0]

/** تفکیک دقیقِ کل به جفت ساعت/دقیقه (مقدار صفر → خالی) */
const splitHm = (total: any): { h: string; m: string } => {
  const t = Math.max(0, Math.round(Number(total) || 0))
  return t ? { h: String(Math.floor(t / 60)), m: String(t % 60) } : { h: '', m: '' }
}
/** ترکیب ساعت/دقیقه به دقیقِ کل */
const joinHm = (h: any, m: any): number => (Number(h) || 0) * 60 + (Number(m) || 0)

function longFa(dash: string): string {
  const d = parseJalali(dash)
  return d ? toFaDigits(formatJalaliLong(d)) : toFaDigits(dash || '')
}

/* ───────── ورودی عددی کوچک (ارقام فارسی) ───────── */
function MiniNum({ value, onChange, disabled, label }: {
  value: string | number
  onChange: (v: string) => void
  disabled?: boolean
  label: string
}) {
  const v = value === null || value === undefined ? '' : String(value)
  return (
    <Input
      dir="ltr" inputMode="numeric" disabled={disabled} placeholder="۰"
      className="num h-8 w-14 px-1 text-center"
      value={v === '' ? '' : toFaDigits(v)}
      onChange={(e: any) => onChange(toEnDigitsSafe(e.target.value))}
      aria-label={label}
    />
  )
}
function toEnDigitsSafe(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\d]/g, '').slice(0, 2)
}

/* ───────── جفت ورودی ساعت:دقیقه — همان چیدمان «۱:۳۵» ───────── */
function HMCell({ name, h, m, onH, onM, disabled }: {
  name: string
  h: string | number
  m: string | number
  onH: (v: string) => void
  onM: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-center gap-1" dir="ltr">
      <MiniNum value={h} onChange={onH} disabled={disabled} label={`ساعت ${name}`} />
      <span className="text-xs font-bold text-stone-400">:</span>
      <MiniNum value={m} onChange={onM} disabled={disabled} label={`دقیقه ${name}`} />
    </div>
  )
}

/* ═════════════════════════ نمای اصلی ═════════════════════════ */

export default function AttendanceView() {
  const { user, go } = useShell() as any
  /* انتخاب شیفت فقط برای نوروزی (مالک)، لطفی (مدیر کل) و کیانوش (مدیر) —
     مدیر شیفت عصر (ملایی) همیشه روی شیفت عصر ثابت است */
  const canSwitchShift = !!user && ['OWNER', 'GM', 'ADMIN'].includes(user.role)

  const [shift, setShift] = useState<'MORNING' | 'EVENING'>(canSwitchShift ? 'MORNING' : 'EVENING')
  const [date, setDate] = useState(todayJalali())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [staff, setStaff] = useState<any[]>([])
  const [rows, setRows] = useState<Record<string, any>>({})
  const [onLeave, setOnLeave] = useState<Record<string, { type: string; hours: number; days: number }>>({})
  const [unresolved, setUnresolved] = useState<any[]>([])
  /* فیلتر شیفت روز (برنامهٔ شیفت هفتگی) + جمع‌بندی ماه برای سیستم حقوق */
  const [dayShiftF, setDayShiftF] = useState<'ALL' | 'MORNING' | 'EVENING'>('ALL')
  const [monthSum, setMonthSum] = useState<any>(null)
  const [payBusy, setPayBusy] = useState(false)

  /* مشکلات */
  const [problems, setProblems] = useState<any[]>([])
  const [probForm, setProbForm] = useState({ title: '', detail: '', severity: 'important', time: '' })
  const [probBusy, setProbBusy] = useState(false)
  const [actionDrafts, setActionDrafts] = useState<Record<string, string>>({})
  const [probBusyId, setProbBusyId] = useState('')

  const escalatedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    void load(date, shift, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { void loadProblems() }, [date])
  useEffect(() => { void loadMonthSummary() }, [date])

  /* ───────── بارگذاری کنترل شیفت (+ ارجاع مشکلات صبح در شیفت عصر) ───────── */

  async function load(d: string, s: 'MORNING' | 'EVENING', tryEscalate = false) {
    if (!parseJalali(d)) return
    setLoading(true)
    // در شیفت عصر، مشکلات حل‌نشده صبح به مدیر عصر ارجاع می‌شود (یک‌بار در هر تاریخ)
    if (tryEscalate && s === 'EVENING' && !escalatedRef.current.has(d)) {
      escalatedRef.current.add(d)
      const esc = await api('/api/staff-checks', { method: 'POST', body: { action: 'escalate', date: d } })
      if (esc.ok && esc.data?.escalated > 0) {
        toast.info(`${fa(esc.data.escalated)} مشکل حل‌نشده شیفت صبح به مدیر شیفت عصر ارجاع شد`)
      }
    }
    const r = await api(`/api/staff-checks${qs({ date: d, shift: s })}`)
    setLoading(false)
    if (!r.ok) {
      toast.error(r.error || 'خطا در دریافت اطلاعات شیفت')
      setStaff([]); setRows({}); setOnLeave({}); setUnresolved([]); return
    }
    const st = r.data?.staff || []
    const checks = r.data?.checks || []
    const leaves: Record<string, { type: string; hours: number; days: number }> = r.data?.onLeave || {}
    setStaff(st)
    setOnLeave(leaves)
    setUnresolved(r.data?.unresolvedMorning || [])
    const map: Record<string, any> = {}
    for (const member of st) {
      const c = checks.find((x: any) => x.staffId === member.id)
      const lv = leaves[member.id]
      /* R7: تأخیر با/بدون اجازه به مدل اصلی خودش برمی‌گردد — arrival='late' + hadPermission.
         دادهٔ قدیمی R5-P2 (تأخیرِ فروریخته به مرخصی/غیبت) دست‌نخورده می‌ماند. */
      const rawArrival = c ? c.arrival : (lv && lv.type !== 'HOURLY' ? 'permitted_leave' : 'on_time')
      const hadPermission = c ? !!c.hadPermission : false
      const arrKey = rawArrival === 'late'
        ? (hadPermission ? 'late_p' : 'late_np')
        : (['on_time', 'permitted_leave', 'absent'].includes(rawArrival) ? rawArrival : 'on_time')
      const lateMin = c ? Math.max(0, c.lateMinutes || 0) : 0
      let hlMin = c ? Math.max(0, c.hourlyLeaveMinutes || 0) : (lv?.type === 'HOURLY' ? (lv.hours || 0) * 60 : 0)
      const overtime = splitHm(c?.overtimeMinutes)
      map[member.id] = {
        staffId: member.id,
        arrival: arrKey,
        ltH: splitHm(lateMin).h, ltM: splitHm(lateMin).m,
        hlH: splitHm(hlMin).h, hlM: splitHm(hlMin).m,
        otH: overtime.h, otM: overtime.m,
        uniform: c ? c.uniform : 'ok',
        hygiene: c ? c.hygiene : 'ok',
        behavior: c ? c.behavior : 'ok',
        workQuality: c ? c.workQuality : 'ok',
        note: c?.note || '',
      }
    }
    setRows(map)
  }

  /* جمع‌بندی ماه برای سیستم حقوق (?summary=1405-07) — پاسخ خودِ جمع‌بندی است */
  async function loadMonthSummary() {
    const pm = /^\d{4}-\d{2}/.exec(date)
    if (!pm) { setMonthSum(null); return }
    const r = await api(`/api/staff-checks${qs({ summary: pm[0] })}`)
    setMonthSum(r.ok ? (r.data || null) : null)
  }

  /* ثبت صریح در حقوق و دستمزد (idempotent) */
  async function syncPayroll() {
    if (payBusy) return
    setPayBusy(true)
    const r = await api('/api/staff-checks', { method: 'POST', body: { action: 'syncPayroll', date } })
    setPayBusy(false)
    if (!r.ok) return toast.error(r.error || 'ارسال به حقوق ناموفق بود')
    toast.success(`ورودی‌های حقوق دورهٔ ${toFaDigits(String(r.data?.period || '').replace('-', '/'))} برای ${fa(r.data?.payrollSynced || 0)} نفر به‌روزرسانی شد ✓`)
    void loadMonthSummary()
  }

  function switchShift(s: 'MORNING' | 'EVENING') {
    if (s === shift) return
    setShift(s)
    void load(date, s, true)
  }

  function changeDate(v: string) {
    if (!v) return
    setDate(v)
    void load(v, shift, true)
  }

  function upd(staffId: string, patch: Record<string, any>) {
    setRows((prev) => ({ ...prev, [staffId]: { ...(prev[staffId] || {}), ...patch } }))
  }

  /* ───────── ثبت کنترل شیفت ───────── */

  async function saveChecks() {
    if (!staff.length) return toast.error('پرسنلی برای ثبت وجود ندارد')
    setSaving(true)
    const payload = staff.map((s: any) => {
      const r = rows[s.id] || {}
      const lv = onLeave[s.id]
      const forcedLeave = !!lv && lv.type !== 'HOURLY'
      /* R7: تأخیر با/بدون اجازه — کلید مرکب UI به مدل DB برمی‌گردد:
         late_p/late_np → arrival='late' + hadPermission + lateMinutes */
      const arrKey = forcedLeave
        ? 'permitted_leave'
        : (['on_time', 'late_p', 'late_np', 'permitted_leave', 'absent'].includes(r.arrival) ? r.arrival : 'on_time')
      const arrival = (arrKey === 'late_p' || arrKey === 'late_np') ? 'late' : arrKey
      const hadPermission = arrKey === 'late_p' || arrKey === 'permitted_leave'
      const o: any = {
        staffId: s.id,
        arrival,
        lateMinutes: arrival === 'late' ? joinHm(r.ltH, r.ltM) : 0,
        hourlyLeaveMinutes: arrival === 'absent' ? 0 : joinHm(r.hlH, r.hlM),
        overtimeMinutes: joinHm(r.otH, r.otM),
        hadPermission,
        uniform: r.uniform || 'ok',
        hygiene: r.hygiene || 'ok',
        behavior: r.behavior || 'ok',
        workQuality: r.workQuality || 'ok',
      }
      const note = String(r.note || '').trim()
      if (note) o.note = note
      return o
    })
    const r = await api('/api/staff-checks', { method: 'POST', body: { date, shift, rows: payload } })
    setSaving(false)
    if (!r.ok) return toast.error(r.error || 'ثبت نشد')
    const synced = Number(r.data?.payrollSynced || 0)
    toast.success(synced > 0
      ? `ثبت شد — اضافه‌کار و غیبت این ماه برای ${fa(synced)} نفر به سیستم حقوق منتقل شد`
      : 'ثبت شد')
    void load(date, shift)
    void loadMonthSummary()
  }

  /* ───────── مشکلات ───────── */

  async function loadProblems() {
    const r = await api('/api/problems')
    if (!r.ok) { setProblems([]); return }
    setProblems((r.data?.problems || []).filter((p: any) => p.date === date))
  }

  async function submitProblem(e?: any) {
    if (e && e.preventDefault) e.preventDefault()
    if (probForm.title.trim().length < 3) return toast.error('عنوان مشکل را وارد کنید (حداقل ۳ کاراکتر)')
    setProbBusy(true)
    // قرارداد فعلی /api/problems فیلد «problem» می‌گیرد؛ فیلدهای ساختاریافته هم ارسال می‌شوند
    const body: any = {
      problem: probForm.detail.trim()
        ? `${probForm.title.trim()} — ${probForm.detail.trim()}`
        : probForm.title.trim(),
      title: probForm.title.trim(),
      detail: probForm.detail.trim(),
      severity: probForm.severity,
      shift,
      date,
    }
    if (probForm.time) body.time = probForm.time
    const r = await api('/api/problems', { method: 'POST', body })
    setProbBusy(false)
    if (!r.ok) return toast.error(r.error || 'ثبت مشکل ناموفق بود')
    toast.success('مشکل ثبت شد')
    setProbForm({ title: '', detail: '', severity: 'important', time: '' })
    void loadProblems()
    if (shift === 'EVENING') void load(date, shift) // بنر موارد حل‌نشده به‌روز شود
  }

  async function patchProblem(id: string, patch: Record<string, any>) {
    setProbBusyId(id)
    const r = await api('/api/problems', { method: 'PATCH', body: { id, ...patch } })
    setProbBusyId('')
    if (!r.ok) return toast.error(r.error || 'به‌روزرسانی ناموفق بود')
    toast.success('به‌روزرسانی شد')
    void loadProblems()
    if (shift === 'EVENING') void load(date, shift)
  }

  const problemsOfShift = useMemo(
    () => problems.filter((p) => !p.shift || p.shift === shift),
    [problems, shift],
  )
  const followupCount = useMemo(
    () => Object.values(rows).filter((r: any) =>
      [r.uniform, r.hygiene, r.behavior, r.workQuality].includes('needs_followup') || r.arrival === 'absent',
    ).length,
    [rows],
  )
  /* گروه‌بندی شیفت روز (برنامهٔ شیفت هفتگی) — R11: نیروهای «صبح و عصر» (BOTH)
     در هر دو شیفت می‌شمارَند و در هر دو فیلتر دیده می‌شوند */
  const dayShiftCounts = useMemo(() => {
    const c = { MORNING: 0, EVENING: 0 }
    for (const s of staff) {
      if (s.dayShift === 'MORNING' || s.dayShift === 'BOTH') c.MORNING++
      if (s.dayShift === 'EVENING' || s.dayShift === 'BOTH') c.EVENING++
    }
    return c
  }, [staff])
  const visibleStaff = useMemo(() => {
    if (dayShiftF === 'ALL') {
      // نیروهای شیفتِ در حال بررسی اول، بعد بقیه — گروه‌بندی مرئی
      return [...staff].sort((a: any, b: any) => {
        const ra = a.dayShift === shift || a.dayShift === 'BOTH' ? 0 : 1
        const rb = b.dayShift === shift || b.dayShift === 'BOTH' ? 0 : 1
        return ra - rb
      })
    }
    return staff.filter((s: any) => s.dayShift === dayShiftF || s.dayShift === 'BOTH')
  }, [staff, dayShiftF, shift])
  /* جمع‌بندی ماه برای سیستم حقوق */
  const monthTotals = useMemo(() => {
    const users = (monthSum?.users || {}) as Record<string, any>
    let ot = 0, abs = 0, hl = 0, lvDays = 0, hlHours = 0, n = 0
    for (const u of Object.values(users)) {
      if ((u.overtimeMinutes || 0) > 0 || (u.absenceDays || 0) > 0 || (u.hourlyLeaveMinutes || 0) > 0
        || (u.approvedHourlyHours || 0) > 0) n++
      ot += u.overtimeMinutes || 0
      abs += u.absenceDays || 0
      hl += u.hourlyLeaveMinutes || 0
      hlHours += u.approvedHourlyHours || 0
      lvDays += (u.approvedLeaveDays?.DAILY || 0) + (u.approvedLeaveDays?.SICK || 0) + (u.approvedLeaveDays?.UNPAID || 0)
    }
    return { ot, abs, hl, hlHours, lvDays, n }
  }, [monthSum])
  const sm = shiftMeta(shift)

  /* ═════════════════════════ رندر ═════════════════════════ */

  return (
    <div className="space-y-4">
      {/* سربرگ: شیفت + تاریخ + میان‌برها */}
      <Card data-tour="page">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          {canSwitchShift ? (
            <div>
              <label className="mb-1 block text-xs text-stone-500">شیفت</label>
              <div className="flex overflow-hidden rounded-lg border border-stone-300">
                {SHIFTS.map((s, idx) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => switchShift(s.key)}
                    className={cn(
                      'px-3 py-2 text-xs font-medium transition-colors sm:text-sm',
                      idx > 0 && 'border-r border-stone-300',
                      shift === s.key ? 'bg-emerald-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-50',
                    )}
                  >
                    {s.label} {s.time}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
              <div className="text-xs font-bold text-teal-800">شیفت عصر {sm.time} (ثابت)</div>
              <div className="text-[11px] text-teal-600">مدیر شیفت عصر — {sm.manager}</div>
            </div>
          )}
          <div className="min-w-40">
            <label className="mb-1 block text-xs text-stone-500">تاریخ (شمسی)</label>
            <div className="w-44"><JalaliDate value={date} onChange={changeDate} /></div>
          </div>
          <div className="text-xs text-stone-500">
            <p className="font-medium text-stone-700">{longFa(date)}</p>
            <p className="mt-0.5">{sm.label} {sm.time} · {fa(staff.length)} نفر قابل بررسی</p>
          </div>
          <div className="flex-1" />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => go('store/reviews')} className="gap-2">
              <I.store size={15} /> بررسی چیدمان خطوط
            </Button>
            <Button variant="outline" size="sm" onClick={() => go('store/stockcount')} className="gap-2">
              <I.clipboard size={15} /> انبارگردانی
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* بنر موارد حل‌نشده شیفت صبح — فقط برای شیفت عصر */}
      {shift === 'EVENING' && unresolved.length > 0 && (
        <Card className="border-rose-300 bg-rose-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 font-bold text-rose-800">
              <I.alertTriangle size={18} className="shrink-0" />
              <span>⚠ موارد حل‌نشده شیفت صبح — نیازمند توجه شما در شیفت عصر</span>
              <Badge variant="outline" className="border-rose-400 bg-rose-100 text-rose-800">{fa(unresolved.length)} مورد</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {unresolved.map((p: any) => (
                <div key={p.id} className="rounded-lg border border-rose-200 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {p.severity && (
                      <Badge variant="outline" className={SEV_CLASS[p.severity] || SEV_CLASS.info}>{SEV_LABEL[p.severity] || p.severity}</Badge>
                    )}
                    <span className="text-sm font-medium text-stone-700">{p.title || p.problem || ''}</span>
                  </div>
                  {p.detail && <p className="mt-1 text-xs leading-5 text-stone-600">{p.detail}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* جریان به سیستم حقوق: جمع‌بندی ماه + ثبت صریح (R5-P2) */}
      <Card className="border-teal-200 bg-teal-50/40">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <span className="flex items-center gap-1.5 text-xs font-bold text-teal-800">
            <I.banknote size={15} /> جریان به سیستم حقوق — دورهٔ {toFaDigits(String(date).slice(0, 7).replace('-', '/'))}
          </span>
          <span className="hidden h-6 w-px bg-teal-200 sm:block" />
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
            <span className="rounded-full border border-teal-200 bg-white px-2.5 py-1 text-teal-800">اضافه‌کار ماه: <span className="num">{minutesToHM(monthTotals.ot)}</span></span>
            <span className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-rose-700">غیبت ماه: <span className="num">{fa(monthTotals.abs)}</span> روز</span>
            <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-amber-700">مرخصی ساعتی: <span className="num">{minutesToHM(monthTotals.hl)}</span></span>
            <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-emerald-700">مرخصی تأییدشده: <span className="num">{fa(monthTotals.lvDays)}</span> روز{monthTotals.hlHours > 0 && <> + <span className="num">{fa(monthTotals.hlHours)}</span> ساعت</>}</span>
            <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-stone-500">{fa(monthTotals.n)} نفر دارای مقدار</span>
          </div>
          <div className="mr-auto flex items-center gap-2">
            {canSwitchShift && (
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => go('hr/payroll')}>
                <I.wallet size={13} /> نمایش حقوق و دستمزد
              </Button>
            )}
            <Button size="sm" className="h-8 gap-1.5 bg-teal-700 hover:bg-teal-800" disabled={payBusy} onClick={() => void syncPayroll()}>
              {payBusy ? <I.loader size={13} className="animate-spin" /> : <I.send size={13} />} ثبت در حقوق و دستمزد
            </Button>
          </div>
          <p className="w-full text-[10px] leading-4 text-teal-700/80">
            اضافه‌کار، غیبت و مرخصی‌های همین ماه از داده‌های بررسی تیم و مرخصی‌های تأییدشده بازتولید می‌شود (ارسال مکرر فقط مقادیر را به‌روز می‌کند — بدون ثبت تکراری) و در فیش حقوقی همان دوره محاسبه می‌گردد.
          </p>
        </CardContent>
      </Card>

      {/* جدول کنترل پرسنل */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <I.users size={18} /> حضور و وضعیت پرسنل — {sm.label} {sm.time}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {/* فیلتر شیفت روز — از برنامهٔ شیفت هفتگی */}
              <div className="flex overflow-hidden rounded-lg border border-stone-300">
                {([
                  ['ALL', `همهٔ پرسنل (${fa(staff.length)})`],
                  ['MORNING', `شیفت صبح (${fa(dayShiftCounts.MORNING)})`],
                  ['EVENING', `شیفت عصر (${fa(dayShiftCounts.EVENING)})`],
                ] as const).map(([key, label], idx) => (
                  <button
                    key={key} type="button"
                    onClick={() => setDayShiftF(key as any)}
                    className={cn(
                      'px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                      idx > 0 && 'border-r border-stone-300',
                      dayShiftF === key ? 'bg-teal-700 text-white' : 'bg-white text-stone-600 hover:bg-stone-50',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {followupCount > 0 && (
                <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800">
                  {fa(followupCount)} مورد نیازمند پیگیری
                </Badge>
              )}
              <Button onClick={() => void saveChecks()} disabled={saving || !staff.length} className="gap-2">
                {saving ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />} ثبت کنترل شیفت
              </Button>
            </div>
          </div>
          <p className="pt-1.5 text-[11px] leading-5 text-stone-400">
            نوع ورود، اجازهٔ مدیر را در خود دارد: «مرخصی» یعنی با اجازهٔ مدیر و «غیبت» یعنی بدون اجازه. اضافه‌کار و غیبت به‌طور خودکار در ورودی‌های حقوق همان ماه اعمال می‌گردد؛ همهٔ پرسنل فعال — از جمله خودتان — بررسی می‌شوند.
            معیارهای چهارگانه سه سطح دارند: «مناسب» = مطابق استاندارد · «نقص جزئی» = انحراف کوچک قابل‌جبران در همان شیفت (تذکر شفاهی) · «نامناسب» = نیازمند پیگیری همان روز. نقص جزئی فقط در آمار ماهانه دیده می‌شود و در «موارد نیازمند پیگیری» شمرده نمی‌شود.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-stone-500">
              <I.loader size={20} className="ml-2 animate-spin" /> در حال دریافت اطلاعات شیفت…
            </div>
          ) : staff.length === 0 ? (
            <div className="py-14 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100">
                <I.users size={26} className="text-stone-400" />
              </div>
              <p className="text-sm font-bold text-stone-700">پرسنلی برای بررسی ثبت نشده است</p>
              <p className="mt-1 text-xs text-stone-500">فهرست کاربران از مدیریت کاربران تکمیل می‌شود.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">پرسنل</TableHead>
                    <TableHead className="text-center">ورود (تأخیر با/بدون اجازه)</TableHead>
                    <TableHead className="text-center">مدت تأخیر</TableHead>
                    <TableHead className="text-center">مرخصی ساعتی (ساعت:دقیق)</TableHead>
                    <TableHead className="text-center">اضافه‌کاری</TableHead>
                    <TableHead className="text-center" title="سه سطح: مناسب / نقص جزئی / نامناسب — نیازمند پیگیری">لباس فرم و ظاهر</TableHead>
                    <TableHead className="text-center" title="سه سطح: مناسب / نقص جزئی / نامناسب — نیازمند پیگیری">بهداشت فردی</TableHead>
                    <TableHead className="text-center" title="سه سطح: مناسب / نقص جزئی / نامناسب — نیازمند پیگیری">برخورد با مشتری</TableHead>
                    <TableHead className="text-center" title="سه سطح: مناسب / نقص جزئی / نامناسب — نیازمند پیگیری">کیفیت کار</TableHead>
                    <TableHead className="text-right">یادداشت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleStaff.map((s: any) => {
                    const r = rows[s.id] || {}
                    const lv = onLeave[s.id]
                    const onDayLeave = !!lv && lv.type !== 'HOURLY'
                    const hasHourlyLeave = !!lv && lv.type === 'HOURLY'
                    const isMgr = MANAGER_ROLES.includes(s.role)
                    const isMe = user?.id === s.id
                    const flagCls = (v: string) => cn('h-8 text-[11px]', FLAG_CLS[v] || '')
                    const hlMin = joinHm(r.hlH, r.hlM)
                    const otMin = joinHm(r.otH, r.otM)
                    const ltMin = joinHm(r.ltH, r.ltM)
                    const timeParts = [
                      ltMin > 0 ? `تأخیر ${minutesToHM(ltMin)}${r.arrival === 'late_p' ? ' (با اجازه)' : ' (بدون اجازه)'}` : '',
                      hlMin > 0 ? `مرخصی ساعتی ${minutesToHM(hlMin)}` : '',
                      otMin > 0 ? `اضافه‌کاری ${minutesToHM(otMin)}` : '',
                    ].filter(Boolean)
                    return (
                      <TableRow key={s.id} className={cn((r.arrival === 'absent' || onDayLeave) && 'opacity-70')}>
                        <TableCell>
                          <div className="whitespace-nowrap text-sm font-medium">
                            {s.honorific ? `${s.honorific} ` : ''}{s.fullName}
                            {isMe && <Badge variant="secondary" className="mr-1.5 bg-emerald-50 text-emerald-700">خودم</Badge>}
                            {isMgr && <Badge variant="secondary" className="mr-1.5 bg-amber-50 text-amber-700">{ROLE_FA[s.role] || s.role}</Badge>}
                            {/* R11: شیفتِ همان روز از برنامهٔ شیفت هفتگی — «صبح و عصر» برای نیروهای دوگانه */}
                            {s.dayShift === 'MORNING' && <Badge variant="outline" className="mr-1.5 border-teal-200 bg-teal-50 text-teal-700">صبح</Badge>}
                            {s.dayShift === 'EVENING' && <Badge variant="outline" className="mr-1.5 border-amber-200 bg-amber-50 text-amber-700">عصر</Badge>}
                            {s.dayShift === 'BOTH' && <Badge variant="outline" className="mr-1.5 border-teal-300 bg-gradient-to-l from-teal-50 to-amber-50 text-teal-800">صبح و عصر</Badge>}
                          </div>
                          <div className="whitespace-nowrap text-[11px] text-stone-500">{s.title || ''}</div>
                          {onDayLeave && (
                            <Badge variant="outline" className="mt-1 border-teal-300 bg-teal-50 text-teal-700">
                              در مرخصی {LEAVE_TYPE_FA[lv.type] || ''} {lv.days ? `(${fa(lv.days)} روزه)` : ''}
                            </Badge>
                          )}
                          {hasHourlyLeave && (
                            <Badge variant="outline" className="mt-1 border-teal-300 bg-teal-50 text-teal-700">
                              مرخصی ساعتی تأییدشده: {fa(lv.hours)} ساعت
                            </Badge>
                          )}
                          {timeParts.length > 0 && (
                            <div className="whitespace-nowrap text-[10px] text-stone-400">{timeParts.join(' · ')}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {onDayLeave ? (
                            <Badge variant="outline" className="border-teal-300 bg-teal-50 text-teal-700">در مرخصی</Badge>
                          ) : (
                            <Select
                              dir="rtl"
                              value={r.arrival || 'on_time'}
                              onValueChange={(v: string) => upd(s.id, { arrival: v })}
                            >
                              <SelectTrigger className={cn('w-44 text-[11px]', ARRIVAL_CLS[r.arrival || 'on_time'])}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ARRIVALS.map((a) => (
                                  <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        {/* R7: مدت تأخیر — فقط با نوع ورود «تأخیر» فعال */}
                        <TableCell className="text-center">
                          <HMCell
                            name={`مدت تأخیر ${s.fullName}`}
                            h={r.ltH ?? ''} m={r.ltM ?? ''}
                            onH={(v) => upd(s.id, { ltH: v })}
                            onM={(v) => upd(s.id, { ltM: v })}
                            disabled={onDayLeave || (r.arrival !== 'late_p' && r.arrival !== 'late_np')}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <HMCell
                            name={`مرخصی ساعتی ${s.fullName}`}
                            h={r.hlH ?? ''} m={r.hlM ?? ''}
                            onH={(v) => upd(s.id, { hlH: v })}
                            onM={(v) => upd(s.id, { hlM: v })}
                            disabled={onDayLeave || r.arrival === 'absent'}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <HMCell
                            name={`اضافه‌کاری ${s.fullName}`}
                            h={r.otH ?? ''} m={r.otM ?? ''}
                            onH={(v) => upd(s.id, { otH: v })}
                            onM={(v) => upd(s.id, { otM: v })}
                            disabled={onDayLeave}
                          />
                        </TableCell>
                        {FOLLOWUPS.map((f) => (
                          <TableCell key={f.key} className="text-center">
                            <Select
                              dir="rtl"
                              value={r[f.key] || 'ok'}
                              onValueChange={(v: string) => upd(s.id, { [f.key]: v })}
                              disabled={onDayLeave}
                            >
                              <SelectTrigger className={flagCls(r[f.key])}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {FLAG_OPTS.map((o) => (
                                  <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        ))}
                        <TableCell>
                          <Input
                            className="w-40 text-xs"
                            value={r.note || ''}
                            onChange={(e: any) => upd(s.id, { note: e.target.value })}
                            placeholder="یادداشت…"
                            disabled={onDayLeave}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* مشکلات و گزارش شیفت */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><I.alertTriangle size={18} /> مشکلات و گزارش شیفت</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid grid-cols-1 gap-3 lg:grid-cols-4" onSubmit={(e: any) => void submitProblem(e)}>
            <div>
              <label className="mb-1 block text-xs text-stone-500">عنوان مشکل *</label>
              <Input
                value={probForm.title}
                onChange={(e: any) => setProbForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="مثلاً: یخچال شماره ۲ خنک نمی‌کند"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">شدت</label>
              <Select dir="rtl" value={probForm.severity} onValueChange={(v: string) => setProbForm((f) => ({ ...f, severity: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500">زمان وقوع</label>
              <Input
                type="time" dir="ltr"
                value={probForm.time}
                onChange={(e: any) => setProbForm((f) => ({ ...f, time: e.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={probBusy} className="gap-2">
                {probBusy ? <I.loader size={15} className="animate-spin" /> : <I.send size={15} />} ثبت مشکل
              </Button>
            </div>
            <div className="lg:col-span-4">
              <Textarea
                rows={2}
                value={probForm.detail}
                onChange={(e: any) => setProbForm((f) => ({ ...f, detail: e.target.value }))}
                placeholder="شرح کامل مشکل، محل و شرایط وقوع…"
              />
            </div>
          </form>

          <div className="space-y-2">
            <p className="text-xs font-bold text-stone-600">مشکلات ثبت‌شده {longFa(date)}</p>
            {problemsOfShift.length === 0 ? (
              <p className="py-6 text-center text-sm text-stone-400">مشکلی برای این روز ثبت نشده است</p>
            ) : (
              problemsOfShift.map((p: any) => {
                const title = p.title || p.problem || ''
                const detail = p.detail || ''
                const st = PSTATUS[p.status]
                const draft = actionDrafts[p.id] ?? ''
                return (
                  <div key={p.id} className="rounded-xl border border-stone-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {st && <Badge variant="outline" className={st.cls}>{st.label}</Badge>}
                      {p.severity && <Badge variant="outline" className={SEV_CLASS[p.severity] || SEV_CLASS.info}>{SEV_LABEL[p.severity] || p.severity}</Badge>}
                      {p.shift && <Badge variant="secondary">{p.shift === 'MORNING' ? 'شیفت صبح' : 'شیفت عصر'}</Badge>}
                      {p.time && (
                        <span className="flex items-center gap-1 text-[11px] text-stone-500"><I.clock size={12} />{toFaDigits(p.time)}</span>
                      )}
                      <span className="text-sm font-bold text-stone-700">{title}</span>
                      {p.reporter?.fullName && (
                        <span className="text-[11px] text-stone-400">— {p.reporter.honorific || ''} {p.reporter.fullName}</span>
                      )}
                    </div>
                    {detail && <p className="mt-1 text-xs leading-5 text-stone-600">{detail}</p>}
                    {p.action && (
                      <p className="mt-1.5 flex items-start gap-1 text-xs text-emerald-700">
                        <I.check size={13} className="mt-0.5 shrink-0" /> اقدام انجام‌شده: {p.action}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Input
                        className="h-8 w-56 text-xs"
                        value={draft}
                        onChange={(e: any) => setActionDrafts((m) => ({ ...m, [p.id]: e.target.value }))}
                        placeholder="اقدام انجام‌شده…"
                      />
                      <Button
                        size="sm" variant="outline" disabled={probBusyId === p.id || draft.trim().length < 2}
                        onClick={() => void patchProblem(p.id, { action: draft.trim() })}
                      >
                        ثبت اقدام
                      </Button>
                      {p.status === 'OPEN' && (
                        <Button
                          size="sm" disabled={probBusyId === p.id}
                          onClick={() => void patchProblem(p.id, { status: 'IN_PROGRESS' })}
                          className="gap-1.5"
                        >
                          <I.timer size={13} /> شروع اقدام
                        </Button>
                      )}
                      {p.status === 'IN_PROGRESS' && (
                        <Button
                          size="sm" disabled={probBusyId === p.id}
                          className="gap-1.5 bg-emerald-700 hover:bg-emerald-800"
                          onClick={() => void patchProblem(p.id, { status: 'RESOLVED' })}
                        >
                          <I.check size={13} /> انجام شد
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
