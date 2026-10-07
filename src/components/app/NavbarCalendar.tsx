'use client'

/**
 * تقویم نوار بالا (round-16) — دکمهٔ تاریخ در هدر → ویجت تقویم با رویدادهای روز
 * طراحی رنگی: تعطیل سرخ، مناسبت طلایی، چک کهربایی، تحویل زیتونی، تولد گلبهی
 */
import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/lib/client'
import { addDaysIso, faMoney, faNum, formatJalaliFull, todayIso, toJalaliParts, jMonthLength, jalaliToIso, weekdayName } from '@/lib/jalali'
import { cn } from '@/lib/utils'
import { PopoverScaffold } from '@/components/app/ThemeLangBar'
import { useHolidays, JalaliCalendar, calFontStyle, CAL_FONT_CALC } from '@/components/app/jalali-widgets'

type DayEvents = {
  date: string
  jalali: { jm: number; jd: number }
  isHoliday: boolean
  holidays: Array<{ id: string; title: string; kind: string; source: string }>
  cheques: Array<{ id: string; status: string; recipient: string; selfIssued: boolean; chequeNo: string; amount?: number }>
  tasks: Array<{ id: string; title: string; priority: string; status: string; assignedToId: string; assignedToName: string }>
  deliveries: Array<{ id: string; code: string; status: string; provider: string; total?: number }>
  birthdays: Array<{ id: string; name: string; tier: string }>
  summary: { holidays: number; occasions: number; cheques: number; chequesAmount?: number; tasks: number; deliveries: number; deliveriesAmount?: number; birthdays: number }
}

const STATUS_COLOR: Record<string, string> = {
  PENDING_OWNER: '#a16207', SIGNED: '#c9a227', DELIVERED: '#0e7a4a', CLEARED: '#4d7c0f', REJECTED: '#b3372f', RETURNED: '#b3372f',
}

export function NavbarCalendar() {
  const [open, setOpen] = useState(false)
  const [anchorIso, setAnchorIso] = useState(todayIso())
  const [selIso, setSelIso] = useState(todayIso())
  const [events, setEvents] = useState<DayEvents | null>(null)
  const [loading, setLoading] = useState(false)
  const btnRef = useRef<HTMLDivElement>(null)
  const holidays = useHolidays()
  const today = todayIso()

  useEffect(() => {
    if (!open) return
    let alive = true
    // setLoading در تیک بعدی — سازگار با قانون react-hooks (بدون setState سنکرون در اثر)
    const t0 = setTimeout(() => {
      if (!alive) return
      setLoading(true)
      api<DayEvents>(`/api/calendar-events?date=${selIso}`)
        .then((d) => alive && setEvents(d))
        .catch(() => alive && setEvents(null))
        .finally(() => alive && setLoading(false))
    }, 0)
    return () => {
      alive = false
      clearTimeout(t0)
    }
  }, [open, selIso])

  const { jy, jm } = toJalaliParts(anchorIso)
  void jy
  void jm
  void jMonthLength
  void jalaliToIso
  const selHoliday = holidays.get(selIso)
  const isSelHoliday = !!selHoliday && events?.holidays.some((h) => h.kind === 'HOLIDAY')

  const chip = (() => {
    const dayNum = new Date().getDay()
    const isWeekend = [4, 5].includes(dayNum)
    const holidayName = holidays.get(today)
    if (holidayName) return 'border-[#b3372f]/30 bg-[#fee2e2]/50'
    if (isWeekend) return 'border-[#c9a227]/40 bg-[#fdf6dd]/60'
    return 'border-border bg-card'
  })()
  const todayHoliday = holidays.get(today)

  return (
    <div ref={btnRef} className="relative hidden md:block">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2 rounded-xl border px-3 py-1.5 transition hover:border-[#c9a227]/70 hover:shadow-sm',
          chip
        )}
        title="تقویم و رویدادهای روز"
      >
        <CalendarDays size={15} className={todayHoliday ? 'text-[#b3372f]' : 'text-[#0e7a4a]'} />
        <span className="text-[11px] font-extrabold text-foreground" style={calFontStyle(CAL_FONT_CALC(1.05))}>{formatJalaliFull(today)}</span>
        {todayHoliday && <span className="rounded-lg bg-[#b3372f] px-2 py-0.5 text-[10px] font-black text-white">تعطیل — {todayHoliday}</span>}
        <ChevronDownRot open={open} />
      </button>

      <PopoverScaffold open={open} onClose={() => setOpen(false)} anchorRef={btnRef} width={430} maxHeightVh={82}>
        <div dir="rtl">
          {/* سربرگ با سیستم رنگی */}
          <div className={cn('mb-2 rounded-2xl border p-3', isSelHoliday ? 'border-[#b3372f]/30 bg-gradient-to-l from-[#fee2e2]/70 to-[#fdf2f2]/40' : 'border-[#c9a227]/30 bg-gradient-to-l from-[#fdf6dd]/80 to-[#fffdf6]')}>
            <p className="text-sm font-black text-[#0b2e20]" style={calFontStyle(CAL_FONT_CALC(1.1))}>{formatJalaliFull(selIso)}</p>
            <p className="text-[10px] font-bold text-muted-foreground">{weekdayName(selIso)} • {isSelHoliday ? 'تعطیل رسمی' : 'روز کاری'}</p>
            {events && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {events.summary.holidays > 0 && <Chip color="#b3372f" label={`تعطیلی ×${faNum(events.summary.holidays)}`} />}
                {events.summary.occasions > 0 && <Chip color="#c9a227" label={`مناسبت ×${faNum(events.summary.occasions)}`} />}
                {events.summary.cheques > 0 && <Chip color="#a16207" label={`چک ×${faNum(events.summary.cheques)}${events.summary.chequesAmount ? ` — ${faMoney(events.summary.chequesAmount / 10)}` : ''}`} />}
                {events.summary.deliveries > 0 && <Chip color="#0e7a4a" label={`تحویل ×${faNum(events.summary.deliveries)}`} />}
                {events.summary.tasks > 0 && <Chip color="#77934a" label={`وظیفه ×${faNum(events.summary.tasks)}`} />}
                {events.summary.birthdays > 0 && <Chip color="#c96f4a" label={`تولد ×${faNum(events.summary.birthdays)}`} />}
                {Object.values(events.summary).every((v) => !v) && <span className="text-[10px] font-bold text-muted-foreground">رویدادی ثبت نشده — روز آرامی است 🌿</span>}
              </div>
            )}
          </div>

          {/* ناوبری ماه */}
          <div className="mb-1 flex items-center justify-between px-1">
            <button onClick={() => setAnchorIso(addDaysIso(-30, anchorIso))} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-muted-foreground transition hover:bg-secondary" aria-label="ماه قبل">
              <ChevronRight size={14} /> ماه قبل
            </button>
            <button onClick={() => { setAnchorIso(today); setSelIso(today) }} className="rounded-lg bg-[#fdf6dd] px-3 py-1 text-[11px] font-extrabold text-[#8a6d10] transition hover:bg-[#f5ecd0]">
              امروز
            </button>
            <button onClick={() => setAnchorIso(addDaysIso(30, anchorIso))} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-muted-foreground transition hover:bg-secondary" aria-label="ماه بعد">
              ماه بعد <ChevronLeft size={14} />
            </button>
          </div>

          <JalaliCalendar
            selected={selIso}
            onSelect={(iso) => setSelIso(iso)}
            holidays={holidays}
          />

          {/* جزئیات روز انتخابی */}
          <div className="mt-2 max-h-52 space-y-1.5 overflow-y-auto scroll-gold pe-1">
            {loading && <p className="py-3 text-center text-[11px] font-bold text-muted-foreground">در حال خواندن رویدادها…</p>}
            {!loading && events?.holidays.map((h) => (
              <Row key={h.id} icon={h.kind === 'HOLIDAY' ? '🚫' : '🌟'} color={h.kind === 'HOLIDAY' ? '#b3372f' : '#c9a227'} title={h.title} sub={h.kind === 'HOLIDAY' ? 'تعطیل رسمی' : 'مناسبت'} />
            ))}
            {!loading && events?.cheques.map((c) => (
              <Row key={c.id} icon="🧾" color={STATUS_COLOR[c.status] || '#a16207'} title={`چک ${c.selfIssued ? 'صادره' : c.recipient}`} sub={`${c.chequeNo ? `شمارهٔ ${faNum(c.chequeNo)} — ` : ''}${c.amount != null ? faMoney(c.amount / 10) + ' تومان' : 'سررسید چک'}`} />
            ))}
            {!loading && events?.deliveries.map((d) => (
              <Row key={d.id} icon="🚚" color="#0e7a4a" title={`تحویل سفارش ${faNum(d.code)}`} sub={`${d.provider}${d.total != null ? ` — ${faMoney(d.total / 10)} تومان` : ''}`} />
            ))}
            {!loading && events?.tasks.map((t) => (
              <Row key={t.id} icon="✅" color="#77934a" title={t.title} sub={`وظیفهٔ ${t.assignedToName || 'تیم'}`} />
            ))}
            {!loading && events?.birthdays.map((b) => (
              <Row key={b.id} icon="🎂" color="#c96f4a" title={`تولد ${b.name}`} sub={b.tier === 'VIP' ? 'مشتری VIP' : 'مشتری'} />
            ))}
          </div>
        </div>
      </PopoverScaffold>
    </div>
  )
}

function ChevronDownRot({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className={cn('text-muted-foreground transition-transform', open && 'rotate-180')}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function Chip({ color, label }: { color: string; label: string }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-black text-white" style={{ backgroundColor: color }}>
      {label}
    </span>
  )
}

function Row({ icon, color, title, sub }: { icon: string; color: string; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-white px-2.5 py-2">
      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-base leading-none">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-extrabold text-foreground">{title}</span>
        <span className="block text-[10px] text-muted-foreground">{sub}</span>
      </span>
    </div>
  )
}
