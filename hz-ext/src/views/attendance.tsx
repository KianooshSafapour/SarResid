import { JALALI_MONTHS, useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn, Button, Input, Textarea, Card, CardContent, CardHeader, CardTitle, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Checkbox, fa, addJalaliDays, formatJalaliLong, minutesToHM, parseJalali, toEnDigits, toFaDigits, todayJalali, Icon, I } from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   tasks/attendance — کنترل شیفت پرسنل
   شیفت صبح: خانم لطفی · شیفت عصر: آقای ملايی
   ۱) حضور و وضعیت پرسنل هر شیفت — حضور از «ورود» استنتاج می‌شود؛
      تأخیر / مرخصی ساعتی / اضافه‌کاری به‌صورت ساعت+دقیق ثبت می‌شوند
   ۲) ارجاع مشکلات حل‌نشده صبح
   ۳) ثبت مشکل و پیگیری اقدام‌ها
   ───────────────────────────────────────────────────────────── */

const ARRIVALS = [
  { key: 'on_time', label: 'به‌وقت' },
  { key: 'late', label: 'تأخیر' },
  { key: 'absent', label: 'غیبت' },
  { key: 'permitted_leave', label: 'مرخصی' },
]
const FOLLOWUPS = [
  { key: 'uniform', label: 'لباس فرم و ظاهر' },
  { key: 'hygiene', label: 'بهداشت فردی' },
  { key: 'behavior', label: 'برخورد با مشتری' },
  { key: 'workQuality', label: 'کیفیت کار' },
]
const FLAG_OPTS = [
  { key: 'ok', label: 'مناسب' },
  { key: 'needs_followup', label: 'نیازمند پیگیری' },
]
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

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))

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

/* ───────── ورودی تاریخ شمسی ───────── */
function JInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  const [err, setErr] = useState('')
  useEffect(() => { setDraft(value) }, [value])
  function commit(raw: string) {
    const t = toEnDigits(raw).replace(/\//g, '-').trim()
    if (!t) { setErr(''); return }
    const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (!m) { setErr('قالب تاریخ: ۱۴۰۵-۰۷-۱۵'); return }
    const norm = `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`
    if (parseJalali(norm)) { setErr(''); onChange(norm) } else setErr('تاریخ نامعتبر است')
  }
  return (
    <div>
      <Input
        dir="ltr" value={draft} placeholder="1405-07-15"
        className="text-center font-mono"
        onChange={(e: any) => setDraft(e.target.value)}
        onBlur={(e: any) => commit(e.target.value)}
        onKeyDown={(e: any) => { if (e.key === 'Enter') commit(e.target.value) }}
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {([['امروز', 0], ['دیروز', -1]] as const).map(([label, n]) => (
          <button
            key={label} type="button"
            className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600 transition-colors hover:bg-stone-100"
            onClick={() => { const d = addJalaliDays(todayJalali(), Number(n)); setDraft(d); onChange(d); setErr('') }}
          >
            {label}
          </button>
        ))}
        {err && <span className="text-[11px] text-rose-600">{err}</span>}
      </div>
    </div>
  )
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
      onChange={(e: any) => onChange(toEnDigits(e.target.value).replace(/[^\d]/g, '').slice(0, 2))}
      aria-label={label}
    />
  )
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
  const { user, go } = useShell()
  const isEveningManager = user?.role === 'EXEC' || user?.username === 'mollaie'

  const [shift, setShift] = useState<'MORNING' | 'EVENING'>(isEveningManager ? 'EVENING' : 'MORNING')
  const [date, setDate] = useState(todayJalali())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [staff, setStaff] = useState<any[]>([])
  const [rows, setRows] = useState<Record<string, any>>({})
  const [unresolved, setUnresolved] = useState<any[]>([])

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
      setStaff([]); setRows({}); setUnresolved([]); return
    }
    const st = r.data?.staff || []
    const checks = r.data?.checks || []
    setStaff(st)
    setUnresolved(r.data?.unresolvedMorning || [])
    const map: Record<string, any> = {}
    for (const member of st) {
      const c = checks.find((x: any) => x.staffId === member.id)
      const late = splitHm(c?.lateMinutes)
      const hleave = splitHm(c?.hourlyLeaveMinutes)
      const overtime = splitHm(c?.overtimeMinutes)
      map[member.id] = {
        staffId: member.id,
        arrival: c ? c.arrival : 'on_time', // حضور از «ورود» استنتاج می‌شود (غایب ← غایب)
        lateH: late.h, lateM: late.m,
        hlH: hleave.h, hlM: hleave.m,
        otH: overtime.h, otM: overtime.m,
        hadPermission: c ? !!c.hadPermission : false,
        uniform: c ? c.uniform : 'ok',
        hygiene: c ? c.hygiene : 'ok',
        behavior: c ? c.behavior : 'ok',
        workQuality: c ? c.workQuality : 'ok',
        note: c?.note || '',
      }
    }
    setRows(map)
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
      const o: any = {
        staffId: s.id,
        arrival: r.arrival || 'on_time',
        lateMinutes: joinHm(r.lateH, r.lateM),
        hourlyLeaveMinutes: joinHm(r.hlH, r.hlM),
        overtimeMinutes: joinHm(r.otH, r.otM),
        hadPermission: !!r.hadPermission,
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
    toast.success('ثبت شد')
    void load(date, shift)
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
      [r.uniform, r.hygiene, r.behavior, r.workQuality].includes('needs_followup') || r.arrival === 'late' || r.arrival === 'absent',
    ).length,
    [rows],
  )

  /* ═════════════════════════ رندر ═════════════════════════ */

  return (
    <div className="space-y-4">
      {/* سربرگ: شیفت + تاریخ + میان‌برها */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label className="mb-1 block text-xs text-stone-500">شیفت</label>
            <div className="flex overflow-hidden rounded-lg border border-stone-300">
              <button
                type="button"
                onClick={() => switchShift('MORNING')}
                className={cn(
                  'px-3 py-2 text-xs font-medium transition-colors sm:text-sm',
                  shift === 'MORNING' ? 'bg-emerald-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-50',
                )}
              >
                شیفت صبح (خانم لطفی)
              </button>
              <button
                type="button"
                onClick={() => switchShift('EVENING')}
                className={cn(
                  'border-r border-stone-300 px-3 py-2 text-xs font-medium transition-colors sm:text-sm',
                  shift === 'EVENING' ? 'bg-emerald-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-50',
                )}
              >
                شیفت عصر (آقای ملايی)
              </button>
            </div>
          </div>
          <div className="min-w-40">
            <label className="mb-1 block text-xs text-stone-500">تاریخ (شمسی)</label>
            <JInput value={date} onChange={changeDate} />
          </div>
          <div className="text-xs text-stone-500">
            <p className="font-medium text-stone-700">{longFa(date)}</p>
            <p className="mt-0.5">{shift === 'MORNING' ? 'کنترل شیفت صبح' : 'کنترل شیفت عصر'} · {fa(staff.length)} نفر پرسنل</p>
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

      {/* جدول کنترل پرسنل */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <I.users size={18} /> حضور و وضعیت پرسنل — {shift === 'MORNING' ? 'شیفت صبح' : 'شیفت عصر'}
            </CardTitle>
            <div className="flex items-center gap-2">
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
              <p className="text-sm font-bold text-stone-700">پرسنلی برای این شیفت ثبت نشده است</p>
              <p className="mt-1 text-xs text-stone-500">فهرست پرسنل فعال از مدیریت کاربران تکمیل می‌شود.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1200px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">پرسنل</TableHead>
                    <TableHead className="text-center">ورود</TableHead>
                    <TableHead className="text-center">تأخیر (ساعت:دقیق)</TableHead>
                    <TableHead className="text-center">مرخصی ساعتی</TableHead>
                    <TableHead className="text-center">اضافه‌کاری</TableHead>
                    <TableHead className="text-center">اجازه مدیر</TableHead>
                    <TableHead className="text-center">لباس فرم و ظاهر</TableHead>
                    <TableHead className="text-center">بهداشت فردی</TableHead>
                    <TableHead className="text-center">برخورد با مشتری</TableHead>
                    <TableHead className="text-center">کیفیت کار</TableHead>
                    <TableHead className="text-right">یادداشت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((s: any) => {
                    const r = rows[s.id] || {}
                    const flagCls = (v: string) => cn(
                      'h-8 text-[11px]',
                      v === 'needs_followup' && 'border-amber-400 text-amber-800',
                    )
                    const lateMin = joinHm(r.lateH, r.lateM)
                    const hlMin = joinHm(r.hlH, r.hlM)
                    const otMin = joinHm(r.otH, r.otM)
                    const timeParts = [
                      lateMin > 0 ? `تأخیر ${minutesToHM(lateMin)}` : '',
                      hlMin > 0 ? `مرخصی ${minutesToHM(hlMin)}` : '',
                      otMin > 0 ? `اضافه‌کاری ${minutesToHM(otMin)}` : '',
                    ].filter(Boolean)
                    return (
                      <TableRow key={s.id} className={cn(r.arrival === 'absent' && 'opacity-60')}>
                        <TableCell>
                          <div className="whitespace-nowrap text-sm font-medium">{s.honorific ? `${s.honorific} ` : ''}{s.fullName}</div>
                          <div className="whitespace-nowrap text-[11px] text-stone-500">{s.title || ''}</div>
                          {timeParts.length > 0 && (
                            <div className="whitespace-nowrap text-[10px] text-stone-400">{timeParts.join(' · ')}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Select
                            value={r.arrival || 'on_time'}
                            onValueChange={(v: string) => upd(s.id, { arrival: v })}
                          >
                            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ARRIVALS.map((a) => (
                                <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center">
                          <HMCell
                            name={`تأخیر ${s.fullName}`}
                            h={r.lateH ?? ''} m={r.lateM ?? ''}
                            onH={(v) => upd(s.id, { lateH: v })}
                            onM={(v) => upd(s.id, { lateM: v })}
                            disabled={r.arrival !== 'late'}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <HMCell
                            name={`مرخصی ساعتی ${s.fullName}`}
                            h={r.hlH ?? ''} m={r.hlM ?? ''}
                            onH={(v) => upd(s.id, { hlH: v })}
                            onM={(v) => upd(s.id, { hlM: v })}
                            disabled={r.arrival !== 'permitted_leave' && hlMin === 0}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <HMCell
                            name={`اضافه‌کاری ${s.fullName}`}
                            h={r.otH ?? ''} m={r.otM ?? ''}
                            onH={(v) => upd(s.id, { otH: v })}
                            onM={(v) => upd(s.id, { otM: v })}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={!!r.hadPermission}
                            onCheckedChange={(v: any) => upd(s.id, { hadPermission: !!v })}
                            aria-label={`اجازه تأخیر ${s.fullName}`}
                          />
                        </TableCell>
                        {FOLLOWUPS.map((f) => (
                          <TableCell key={f.key} className="text-center">
                            <Select
                              value={r[f.key] || 'ok'}
                              onValueChange={(v: string) => upd(s.id, { [f.key]: v })}
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
              <Select value={probForm.severity} onValueChange={(v: string) => setProbForm((f) => ({ ...f, severity: v }))}>
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
