import { useState, useEffect, useMemo, api, qs, useShell, toast, cn, Button, Card, CardContent, CardHeader, CardTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, JALALI_MONTHS, addJalaliDays, parseJalali, todayJalali, Icon, I } from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   hr/shifts — برنامهٔ شیفت هفتگی (بازنویسی R5-H)
   یک نوار ابزارِ تک‌ردیفی (ناو هفته + فیلتر ماه/گروه + کپی و ذخیره)
   + شبکهٔ ۷روزهٔ تمام پرسنل با چیپ شیفت و قفل مرخصی تأییدشده.
   دو شیفت: صبح ۷:۳۰–۱۵:۳۰ و عصر ۱۵:۳۰–۲۳:۰۰ — شیفت شب وجود ندارد
   (دادهٔ قدیمی NIGHT هنگام خواندن به «عصر» نگاشت می‌شود).
   ───────────────────────────────────────────────────────────── */

const MANAGER_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC']

const WD = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'] as const
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const faD = (v: string | number): string => String(v).replace(/\d/g, (d) => FA_DIGITS[+d])
const pad2 = (n: number) => String(n).padStart(2, '0')
/** ۱۴۰۵-۰۷-۲۶ → ۱۴۰۵/۰۷/۲۶ (ارقام فارسی) */
const faSlashD = (v: string) => faD(String(v).replace(/-/g, '/'))
const toDash = (v: string) => v.replace(/\//g, '-')

/* ─── قرارداد ماژول جلالی فروزن: parseJalali(s) → Date میلادی (نه JDate) ───
   پس JDate و شاخص روز هفته را محلی/با همان Date محاسبه می‌کنیم (درس R4-cheques). */
/** «1405-07-30» یا «1405/07/30» → {jy, jm, jd} */
function jOf(s: string): { jy: number; jm: number; jd: number } | null {
  const m = /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(String(s || ''))
  if (!m) return null
  const jy = +m[1], jm = +m[2], jd = +m[3]
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null
  return { jy, jm, jd }
}
/** شاخص روز هفته (۰=شنبه … ۶=جمعه) — از میلادیِ همان روز (پل: parseJalali → Date) */
function wdIdx(s: string): number {
  const d = parseJalali(String(s || '').replace(/\//g, '-')) as unknown as Date | null
  return d ? (d.getDay() + 1) % 7 : 0
}

type ShiftVal = '' | 'MORNING' | 'EVENING' | 'LEAVE' | 'OFF'

const CHIP: Record<string, { label: string; cls: string; dot: string }> = {
  MORNING: { label: 'صبح', cls: 'bg-teal-50 text-teal-700 border-teal-200', dot: 'bg-teal-500' },
  EVENING: { label: 'عصر', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  LEAVE: { label: 'مرخصی', cls: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  OFF: { label: 'تعطیل', cls: 'bg-stone-100 text-stone-600 border-stone-200', dot: 'bg-stone-400' },
}

interface DayInfo { dayIdx: number; date: string; label: string }
interface UserInfo { id: string; fullName: string; honorific: string; role: string; title: string }
interface Asg { id: string; userId: string; date: string; dayIdx: number; shift: string }
interface LockedDay { userId: string; date: string; dayIdx: number }
interface HourlyLeave { userId: string; date: string; dayIdx: number; hours: number }
interface WeekData {
  weekStart: string; weekEnd: string; today: string
  days: DayInfo[]
  users: UserInfo[]
  assignments: Asg[]
  lockedDays: LockedDay[]
  hourlyLeaves: HourlyLeave[]
}

/** دادهٔ قدیمی NIGHT → EVENING (سمت کلاینت هم محافظت می‌کنیم) */
function normShift(v: string): ShiftVal {
  const s = v === 'NIGHT' ? 'EVENING' : v
  return (['MORNING', 'EVENING', 'LEAVE', 'OFF'] as const).includes(s as any) ? (s as ShiftVal) : ''
}

export default function ShiftsView() {
  const { user } = useShell() as any
  const isMgr = !!user && MANAGER_ROLES.includes(user.role)

  const [anchor, setAnchor] = useState<string>(() => todayJalali()) // هر تاریخی از هفتهٔ هدف (۱۴۰۵/۰۷/xx)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<WeekData | null>(null)
  const [cells, setCells] = useState<Record<string, ShiftVal>>({})          // ویرایش‌های جاری
  const [serverCells, setServerCells] = useState<Record<string, ShiftVal>>({}) // آخرین وضعیت ذخیره‌شده
  const [open, setOpen] = useState<{ userId: string; dayIdx: number } | null>(null)
  const [groupF, setGroupF] = useState('ALL')
  const [busy, setBusy] = useState(false)

  const todaySlash = todayJalali()
  const weekStart = useMemo(() => addJalaliDays(anchor, -wdIdx(anchor)), [anchor])
  const weekEnd = useMemo(() => addJalaliDays(weekStart, 6), [weekStart])
  const days = useMemo(() => Array.from({ length: 7 }, (_v, i) => addJalaliDays(weekStart, i)), [weekStart])
  const wsJ = useMemo(() => jOf(weekStart) || { jy: 1405, jm: 1, jd: 1 }, [weekStart])
  const isCurrentWeek = useMemo(() => addJalaliDays(todaySlash, -wdIdx(todaySlash)) === weekStart, [todaySlash, weekStart])

  useEffect(() => { void load(weekStart) }, [weekStart])

  async function load(ws: string) {
    setLoading(true)
    setOpen(null)
    const r = await api(`/api/hr/shifts${qs({ week: toDash(ws) })}`)
    setLoading(false)
    if (!r.ok) { toast.error(r.error || 'بارگذاری برنامهٔ شیفت ناموفق بود'); return }
    const d = r.data as WeekData
    setData(d)
    const next: Record<string, ShiftVal> = {}
    for (const a of d.assignments || []) next[`${a.userId}:${a.dayIdx}`] = normShift(a.shift)
    setCells(next)
    setServerCells({ ...next })
  }

  /* ─── ویرایش سلول ─── */
  function setCell(userId: string, dayIdx: number, v: ShiftVal) {
    const k = `${userId}:${dayIdx}`
    setCells((prev) => {
      const next = { ...prev }
      if (v === '') delete next[k]
      else next[k] = v
      return next
    })
  }
  function revert() { setCells({ ...serverCells }); setOpen(null) }

  const locked = useMemo(() => {
    const s = new Set<string>()
    for (const l of data?.lockedDays || []) s.add(`${l.userId}:${l.dayIdx}`)
    return s
  }, [data])
  const hourly = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of data?.hourlyLeaves || []) {
      const k = `${h.userId}:${h.dayIdx}`
      m.set(k, (m.get(k) || 0) + (h.hours || 0))
    }
    return m
  }, [data])

  function cellState(userId: string, dayIdx: number): { v: ShiftVal; locked: boolean; hourlyHours: number } {
    const k = `${userId}:${dayIdx}`
    const hourlyHours = hourly.get(k) || 0
    if (locked.has(k)) return { v: 'LEAVE', locked: true, hourlyHours }
    return { v: cells[k] ?? '', locked: false, hourlyHours }
  }

  /* ─── تفاوت با سرور ─── */
  const dirty = useMemo(() => {
    const out: { userId: string; dayIdx: number; shift: ShiftVal }[] = []
    const keys = new Set([...Object.keys(cells), ...Object.keys(serverCells)])
    for (const k of keys) {
      const v = cells[k] ?? ''
      const sv = serverCells[k] ?? ''
      if (v !== sv && !locked.has(k)) {
        const i = k.lastIndexOf(':')
        out.push({ userId: k.slice(0, i), dayIdx: +k.slice(i + 1), shift: v })
      }
    }
    return out
  }, [cells, serverCells, locked])

  /* ─── گروه‌بندی بر اساس شیفت غالب همین هفته ─── */
  function groupOf(userId: string): 'MORNING' | 'EVENING' | 'NONE' {
    let m = 0, e = 0
    for (let i = 0; i < 7; i++) {
      const v = cells[`${userId}:${i}`]
      if (v === 'MORNING') m++
      else if (v === 'EVENING') e++
    }
    if (m === 0 && e === 0) return 'NONE'
    return m >= e ? 'MORNING' : 'EVENING'
  }
  const groupStats = useMemo(() => {
    const s = { ALL: 0, MORNING: 0, EVENING: 0, NONE: 0 } as Record<string, number>
    for (const u of data?.users || []) s[groupOf(u.id)]++
    s.ALL = (data?.users || []).length
    return s
  }, [data, cells])
  const visibleUsers = useMemo(() => {
    const all = data?.users || []
    if (groupF === 'ALL') return all
    return all.filter((u) => groupOf(u.id) === groupF)
  }, [data, groupF, cells])

  /* ─── شمارش روزانه ─── */
  const dayCounts = useMemo(() => days.map((_d, i) => {
    let m = 0, e = 0, l = 0
    for (const u of data?.users || []) {
      const k = `${u.id}:${i}`
      if (locked.has(k)) { l++; continue }
      const v = cells[k]
      if (v === 'MORNING') m++
      else if (v === 'EVENING') e++
      else if (v === 'LEAVE') l++
    }
    return { m, e, l }
  }), [days, data, cells, locked])

  /* ─── ذخیرهٔ گروهی ─── */
  async function save() {
    if (!dirty.length || !isMgr || busy) return
    setBusy(true)
    const r = await api('/api/hr/shifts', {
      method: 'PUT',
      body: { weekStart: toDash(weekStart), rows: dirty.map((d) => ({ userId: d.userId, dayIdx: d.dayIdx, shift: d.shift })) },
    })
    setBusy(false)
    if (!r.ok) return toast.error(r.error || 'ذخیرهٔ برنامه ناموفق بود')
    const d = r.data || {}
    toast.success(
      `برنامهٔ هفتهٔ ${faSlashD(weekStart)} ذخیره شد ✓ — ${faD(d.saved)} شیفت، ${faD(d.cleared)} پاک‌شده`
      + (d.skipped?.length ? ` — ${faD(d.skipped.length)} روز به‌دلیل مرخصی تأییدشده رد شد` : ''),
    )
    void load(weekStart)
  }

  /* ─── کپی از هفتهٔ قبل ─── */
  async function copyPrev() {
    if (!isMgr || loading) return
    const prev = addJalaliDays(weekStart, -7)
    const r = await api(`/api/hr/shifts${qs({ week: toDash(prev) })}`)
    if (!r.ok) return toast.error(r.error || 'خواندن هفتهٔ قبل ناموفق بود')
    const prevMap = new Map<string, ShiftVal>()
    for (const a of (r.data?.assignments || []) as Asg[]) prevMap.set(`${a.userId}:${a.date}`, normShift(a.shift))
    let copied = 0
    setCells((cur) => {
      const next = { ...cur }
      for (const u of data?.users || []) {
        for (let i = 0; i < 7; i++) {
          const k = `${u.id}:${i}`
          if (locked.has(k)) continue // روز مرخصیِ قفل‌شده دست‌نخورده می‌ماند
          const v = prevMap.get(`${u.id}:${toDash(days[i])}`) ?? ''
          if ((next[k] ?? '') !== v) {
            if (v === '') delete next[k]
            else next[k] = v
            copied++
          }
        }
      }
      return next
    })
    toast.success(`از هفتهٔ ${faSlashD(prev)} کپی شد — بازبینی کنید و «ذخیرهٔ برنامه» را بزنید`)
  }

  /* ─── پرش ماه ─── */
  const monthVal = `${wsJ.jy}-${pad2(wsJ.jm)}`
  function jumpMonth(v: string) {
    const [y, m] = v.split('-')
    if (!y || !m) return
    setAnchor(`${y}/${m}/01`)
  }

  /* ═══ رندر ═══ */
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-base">
            <span className="flex items-center gap-1.5"><Icon name="calendarDays" size={18} /> برنامهٔ شیفت هفتگی</span>
            <span className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-bold">
              <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-teal-700">صبح <span className="num">۷:۳۰ تا ۱۵:۳۰</span></span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">عصر <span className="num">۱۵:۳۰ تا ۲۳:۰۰</span></span>
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700">مرخصی <I.lock size={11} className="text-rose-500" /></span>
              <span className="rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-stone-600">تعطیل</span>
            </span>
            <span className="hidden text-xs font-normal text-stone-400 xl:inline">شیفت‌بندی دو شیفتهٔ فروشگاه — بدون شیفت شب</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">

          {/* ═══ نوار ابزار — فقط یک ردیف افقی ═══ */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-0.5 rounded-xl border border-stone-200 bg-white p-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="هفته قبل" title="هفته قبل"
                onClick={() => setAnchor(addJalaliDays(weekStart, -7))}>
                <I.chevronRight size={16} />
              </Button>
              <span className="num whitespace-nowrap px-1.5 text-[13px] font-black leading-5 text-stone-800">
                {faSlashD(weekStart)} <span className="font-normal text-stone-400">تا</span> {faSlashD(weekEnd)}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="هفته بعد" title="هفته بعد"
                onClick={() => setAnchor(addJalaliDays(weekStart, 7))}>
                <I.chevronLeft size={16} />
              </Button>
            </div>
            {!isCurrentWeek && (
              <Button variant="outline" size="sm" className="h-9" onClick={() => setAnchor(todaySlash)}>این هفته</Button>
            )}

            <span className="hidden h-6 w-px bg-stone-200 md:block" />

            <Select value={monthVal} onValueChange={jumpMonth}>
              <SelectTrigger className="h-9 w-28" aria-label="پرش به ماه"><SelectValue /></SelectTrigger>
              <SelectContent>
                {JALALI_MONTHS.map((m, i) => (
                  <SelectItem key={m} value={`${wsJ.jy}-${pad2(i + 1)}`}>{m} {faD(wsJ.jy)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={groupF} onValueChange={setGroupF}>
              <SelectTrigger className="h-9 w-40" aria-label="فیلتر گروه شیفت"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">همهٔ پرسنل ({faD(groupStats.ALL)})</SelectItem>
                <SelectItem value="MORNING">شیفت غالب: صبح ({faD(groupStats.MORNING)})</SelectItem>
                <SelectItem value="EVENING">شیفت غالب: عصر ({faD(groupStats.EVENING)})</SelectItem>
                <SelectItem value="NONE">بدون شیفت این هفته ({faD(groupStats.NONE)})</SelectItem>
              </SelectContent>
            </Select>

            <div className="mr-auto flex flex-wrap items-center gap-1.5">
              {isMgr && (
                <>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={loading || !data} onClick={() => void copyPrev()}>
                    <I.history size={14} /> کپی از هفتهٔ قبل
                  </Button>
                  {dirty.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-9 px-2 text-stone-400 hover:text-rose-600" onClick={revert} title="برگرداندن تغییرات">انصراف</Button>
                  )}
                  <Button size="sm" className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={!dirty.length || busy} onClick={() => void save()}>
                    {busy ? <I.loader size={14} className="animate-spin" /> : <I.save size={14} />}
                    ذخیرهٔ برنامه{dirty.length ? ` (${faD(dirty.length)})` : ''}
                  </Button>
                </>
              )}
              <Button variant="outline" size="icon" className="h-9 w-9" aria-label="به‌روزرسانی" title="به‌روزرسانی"
                onClick={() => void load(weekStart)}>
                <I.refresh size={15} />
              </Button>
            </div>
          </div>

          {/* ═══ شبکهٔ هفتگی ═══ */}
          <div className="overflow-x-auto rounded-xl border border-stone-200">
            <Table className="min-w-[840px] text-xs">
              <TableHeader>
                <TableRow className="bg-stone-50">
                  <TableHead className="sticky right-0 z-20 min-w-40 border-l border-stone-200 bg-stone-50 text-right">پرسنل</TableHead>
                  {days.map((d, i) => {
                    const j = jOf(d)
                    const isToday = d === todaySlash
                    return (
                      <TableHead key={d} className={cn('min-w-[96px] px-1.5 text-center', isToday && 'bg-emerald-50/70')}>
                        <div className={cn('text-[11px] font-black', isToday ? 'text-emerald-700' : 'text-stone-700')}>{WD[i]}</div>
                        <div className="num text-[10px] font-normal text-stone-400">
                          {j ? faD(j.jd) : faD(d)} {j ? JALALI_MONTHS[j.jm - 1] : ''}{isToday ? ' · امروز' : ''}
                        </div>
                      </TableHead>
                    )
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-stone-500">
                      <I.loader className="mx-auto mb-2 animate-spin" size={22} /> در حال بارگذاری برنامهٔ هفته…
                    </TableCell>
                  </TableRow>
                ) : !data || visibleUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-stone-400">
                      {data ? 'کسی در این گروه نیست — فیلتر را عوض کنید' : 'برنامه‌ای بارگذاری نشد'}
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {visibleUsers.map((u) => (
                      <TableRow key={u.id} className="group">
                        <TableCell className="sticky right-0 z-10 border-l border-stone-200 bg-white align-middle group-hover:bg-stone-50">
                          <div className="text-[12.5px] font-bold leading-5 text-stone-800">{u.fullName}</div>
                          <div className="text-[10px] leading-4 text-stone-400">{u.title || ''}</div>
                        </TableCell>
                        {days.map((d, i) => {
                          const k = `${u.id}:${i}`
                          const st = cellState(u.id, i)
                          const isToday = d === todaySlash
                          const changed = !st.locked && (cells[k] ?? '') !== (serverCells[k] ?? '')
                          const canOpen = isMgr && !st.locked
                          const isOpen = open && open.userId === u.id && open.dayIdx === i
                          const meta = st.v ? CHIP[st.v] : null
                          return (
                            <TableCell key={d} className={cn('p-1.5 text-center align-middle', isToday && 'bg-emerald-50/30')}>
                              <div className="relative">
                                {st.locked ? (
                                  <span title="مرخصی تأییدشده — قابل تغییر نیست"
                                    className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700">
                                    <I.lock size={11} /> مرخصی
                                  </span>
                                ) : st.v ? (
                                  <button type="button"
                                    disabled={!canOpen}
                                    onClick={() => canOpen && setOpen(isOpen ? null : { userId: u.id, dayIdx: i })}
                                    className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold',
                                      meta!.cls, canOpen && 'hover:shadow-sm', !canOpen && 'cursor-default', changed && 'ring-2 ring-amber-300')}>
                                    {meta!.label}
                                  </button>
                                ) : isMgr ? (
                                  <button type="button"
                                    onClick={() => setOpen(isOpen ? null : { userId: u.id, dayIdx: i })}
                                    title="تعیین شیفت"
                                    className="inline-flex h-[26px] w-full max-w-[74px] items-center justify-center rounded-full border border-dashed border-stone-300 text-stone-300 transition-colors hover:border-emerald-400 hover:text-emerald-600">
                                    +
                                  </button>
                                ) : (
                                  <span className="text-stone-200">—</span>
                                )}

                                {st.hourlyHours > 0 && (
                                  <div className="mt-0.5 text-[9px] leading-3 text-rose-500" title="مرخصی ساعتی تأییدشده">
                                    مرخصی ساعتی {faD(st.hourlyHours)}س
                                  </div>
                                )}

                                {/* ─── پاپ‌آور انتخاب شیفت (فقط مدیران) ─── */}
                                {isOpen && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => setOpen(null)} />
                                    <div className="absolute top-full right-0 z-50 mt-1 w-40 rounded-xl border border-stone-200 bg-white p-1.5 shadow-xl" dir="rtl">
                                      <div className="px-2 pb-1 pt-0.5 text-[10px] font-bold text-stone-400">
                                        {WD[i]} {faSlashD(d)}
                                      </div>
                                      {(['MORNING', 'EVENING', 'LEAVE', 'OFF'] as const).map((s) => (
                                        <button key={s} type="button"
                                          onClick={() => { setCell(u.id, i, s); setOpen(null) }}
                                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-right text-xs font-bold text-stone-700 transition-colors hover:bg-stone-100">
                                          <span className={cn('h-2.5 w-2.5 rounded-full', CHIP[s].dot)} /> {CHIP[s].label}
                                        </button>
                                      ))}
                                      {st.v && (
                                        <button type="button"
                                          onClick={() => { setCell(u.id, i, ''); setOpen(null) }}
                                          className="mt-0.5 flex w-full items-center gap-2 rounded-lg border-t border-stone-100 px-2 py-1.5 text-right text-[11px] font-bold text-rose-600 transition-colors hover:bg-rose-50">
                                          <I.trash size={13} /> پاک کردن شیفت
                                        </button>
                                      )}
                                      <div className="mt-1 border-t border-stone-100 px-1.5 pt-1 text-[9px] leading-4 text-stone-400">
                                        مرخصی‌های تأییدشدهٔ سیستمی قفل می‌شوند
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}

                    {/* ─── جمع روزانه ─── */}
                    <TableRow className="bg-stone-50">
                      <TableCell className="sticky right-0 z-10 border-l border-stone-200 bg-stone-50 text-[10.5px] font-bold text-stone-500">
                        جمع روزانه
                      </TableCell>
                      {dayCounts.map((c, i) => (
                        <TableCell key={i} className="px-2 text-center">
                          <span className="num whitespace-nowrap text-[10.5px] leading-5 text-stone-600">
                            <b className="text-teal-700">{faD(c.m)}</b> صبح · <b className="text-amber-700">{faD(c.e)}</b> عصر
                            {c.l > 0 && <> · <b className="text-rose-600">{faD(c.l)}</b> مرخصی</>}
                          </span>
                        </TableCell>
                      ))}
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-[10.5px] leading-5 text-stone-400">
            {isMgr
              ? 'روی هر خانه کلیک کنید و شیفت را انتخاب کنید (صبح / عصر / مرخصی / تعطیل). روزهای مرخصیِ تأییدشده با قفل نمایش داده می‌شوند و تغییرشان فقط از بخش «مرخصی‌ها» ممکن است.'
              : 'این برنامه فقط برای مشاهده است؛ تعیین شیفت توسط مدیران انجام می‌شود.'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
