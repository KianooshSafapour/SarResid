'use client'

/* ─────────────────────────────────────────────────────────────────────────────
 * شیفت‌ها و برنامهٔ تیم — Task 17-D
 * الف) قالب هفتگی شیفت‌ها (۷ روز ایرانی: شنبه … جمعه) + ویرایشگر شیفت + شروع سریع هایپر زیتون
 * ب) برنامهٔ روزانه: تخصیص پرسنل به شیفت‌ها، شیفت دوم، جمع ساعت روزانه، نوار هفته و ماه
 * مدت شیفت آزاد است (بدون قید ۴ ساعت) — توافق کاری بین کارفرما و کارمند ملاک است.
 * ───────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, Clock, Info, Loader2,
  MoonStar, Pencil, Plus, Search, Trash2, Users, X, Zap,
} from 'lucide-react'
import { api } from '@/lib/client'
import { Modal } from '@/components/views/Orders'
import { EmptyState, Labeled, Pill, SectionCard, type AppCtx } from '@/components/app/ui-bits'
import { JalaliDatePicker, useHolidays } from '@/components/app/jalali-widgets'
import {
  addDaysIso, faNum, formatJalaliShort, isFriday, jalaliToIso, jMonthLength,
  toJalaliParts, todayIso, weekdayName,
} from '@/lib/jalali'
import { cn } from '@/lib/utils'

/* ── انواع ── */
type ShiftRow = {
  id: string; name: string; weekday: number; start: string; end: string
  staffNeed: number; color: string; active: boolean; note: string
}
type AssignmentRow = {
  id: string; date: string; shiftId: string; personnelId: string; personnelName: string
  userId: string; double: boolean; note: string
}
type PersonnelRow = {
  id: string; firstName: string; lastName: string; jobTitle: string; department: string
  active: boolean; userId: string
}
type DraftRow = { personnelId: string; personnelName: string; double: boolean; note: string }

/* ── ثابت‌ها ── */
const IRAN_WEEK: { wd: number; name: string }[] = [
  { wd: 6, name: 'شنبه' }, { wd: 0, name: 'یکشنبه' }, { wd: 1, name: 'دوشنبه' },
  { wd: 2, name: 'سه‌شنبه' }, { wd: 3, name: 'چهارشنبه' }, { wd: 4, name: 'پنجشنبه' }, { wd: 5, name: 'جمعه' },
]
const BRAND_COLORS = ['#0e7a4a', '#77934a', '#c9a227', '#c96f4a', '#b3372f']
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const HOURS_INFO = 'مدت شیفت آزاد است — توافق کاری بین کارفرما و کارمند ملاک است (مادهٔ ۵۹ فقط هشدار می‌دهد، محدود نمی‌کند)'
const PAY_NOTE = 'حق‌السعی بر مبنای قرارداد — شیفت دوم طبق توافق'
const MANAGE_ROLES = ['OWNER', 'GM', 'OM', 'PM', 'ADMIN']
const J_MONTH_FA = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']

/* ── کمک‌تابع‌ها ── */
function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
/** مدت شیفت به دقیقه — پایان ≤ شروع یعنی شیفت به فردا می‌خوابد */
function durationMin(s: { start: string; end: string }): number {
  return ((toMin(s.end) - toMin(s.start)) % 1440 + 1440) % 1440
}
function isOvernight(s: { start: string; end: string }): boolean {
  return toMin(s.end) <= toMin(s.start)
}
/** «۷ ساعت و ۳۰ دقیقه» با ارقام فارسی */
function faDur(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return `${faNum(h)} ساعت و ${faNum(m)} دقیقه`
  if (h) return `${faNum(h)} ساعت`
  return `${faNum(m)} دقیقه`
}
function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim()
}
/** بازهٔ هفتهٔ ایرانی (شنبه…جمعه) شامل تاریخ داده‌شده */
function iranWeekRange(dateIso: string): { from: string; to: string; days: string[] } {
  const jsDay = new Date(dateIso + 'T12:00:00').getDay()
  const satOffset = (jsDay + 1) % 7 // ۰=شنبه … ۶=جمعه
  const from = addDaysIso(-satOffset, dateIso)
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(i, from))
  return { from, to: days[6], days }
}
function jMonthRange(dateIso: string): { jy: number; jm: number; from: string; to: string } {
  const { jy, jm } = toJalaliParts(dateIso)
  return { jy, jm, from: jalaliToIso(jy, jm, 1), to: jalaliToIso(jy, jm, jMonthLength(jy, jm)) }
}
/** خلاصهٔ پوشش یک روز از روی قالب + تخصیص‌های بازه */
function daySummary(dateIso: string, shifts: ShiftRow[], assignments: AssignmentRow[]) {
  const wd = new Date(dateIso + 'T12:00:00').getDay()
  const dayShifts = shifts.filter((s) => s.weekday === wd && s.active)
  const ids = new Set(dayShifts.map((s) => s.id))
  const need = dayShifts.reduce((a, s) => a + s.staffNeed, 0)
  const assigned = assignments.filter((a) => a.date === dateIso && ids.has(a.shiftId)).length
  return { need, assigned, dayShifts }
}
function coverageOf(assigned: number, need: number): { label: string; color: string; bg: string; tone: 'ok' | 'warn' | 'empty' | 'none' } {
  if (need === 0) return { label: 'بدون شیفت', color: '#6d7a6e', bg: '#f1efe6', tone: 'none' }
  if (assigned >= need) return { label: 'کامل ✓', color: '#0e7a4a', bg: '#dcfce7', tone: 'ok' }
  if (assigned === 0) return { label: 'بدون تخصیص', color: '#6d7a6e', bg: '#f1efe6', tone: 'empty' }
  return { label: `کمبود: ${faNum(need - assigned)}`, color: '#c96f4a', bg: '#ffedd5', tone: 'warn' }
}
const emptyRange = { shifts: [] as ShiftRow[], assignments: [] as AssignmentRow[] }

/* ═══════════════════════ ویو اصلی ═══════════════════════ */
export default function ShiftsView({ ctx }: { ctx: AppCtx }) {
  const canManage = MANAGE_ROLES.includes(ctx.user?.role || '')
  const holidays = useHolidays()
  const [tab, setTab] = useState<'daily' | 'template'>('daily')
  const [loading, setLoading] = useState(true)

  const [template, setTemplate] = useState<Record<number, ShiftRow[]>>({})
  const [selDate, setSelDate] = useState(todayIso())
  const [dayData, setDayData] = useState<{ shifts: ShiftRow[]; assignments: AssignmentRow[] }>(emptyRange)
  const [weekStrip, setWeekStrip] = useState<{ shifts: ShiftRow[]; assignments: AssignmentRow[] }>(emptyRange)
  const [monthStrip, setMonthStrip] = useState<{ shifts: ShiftRow[]; assignments: AssignmentRow[] } | null>(null)
  const [personnel, setPersonnel] = useState<PersonnelRow[]>([])

  const [editor, setEditor] = useState<{ open: boolean; shift: ShiftRow | null }>({ open: false, shift: null })
  const [assign, setAssign] = useState<{ open: boolean; shift: ShiftRow | null }>({ open: false, shift: null })

  /* ── بارگذاری داده‌ها ── */
  const loadTemplate = useCallback(() => {
    return api<{ byWeekday: Record<string, ShiftRow[]>; shifts: ShiftRow[] }>('/api/shifts?week=1')
      .then((d) => {
        const map: Record<number, ShiftRow[]> = {}
        for (const s of d.shifts || []) {
          if (!map[s.weekday]) map[s.weekday] = []
          map[s.weekday].push(s)
        }
        setTemplate(map)
      })
      .catch((e: Error) => toast.error(e.message))
  }, [])

  const loadDay = useCallback((date: string) => {
    return api<{ shifts: ShiftRow[]; assignments: AssignmentRow[] }>(`/api/shifts?date=${date}`)
      .then((d) => setDayData({ shifts: d.shifts || [], assignments: d.assignments || [] }))
      .catch((e: Error) => toast.error(e.message))
  }, [])

  const loadWeek = useCallback((date: string) => {
    const r = iranWeekRange(date)
    return api<{ shifts: ShiftRow[]; assignments: AssignmentRow[] }>(`/api/shifts?from=${r.from}&to=${r.to}`)
      .then((d) => setWeekStrip({ shifts: d.shifts || [], assignments: d.assignments || [] }))
      .catch(() => {})
  }, [])

  const loadMonthStrip = useCallback((date: string) => {
    const r = jMonthRange(date)
    return api<{ shifts: ShiftRow[]; assignments: AssignmentRow[] }>(`/api/shifts?from=${r.from}&to=${r.to}`)
      .then((d) => setMonthStrip({ shifts: d.shifts || [], assignments: d.assignments || [] }))
      .catch(() => {})
  }, [])

  const loadPersonnel = useCallback(() => {
    return api<{ personnel: PersonnelRow[] }>('/api/personnel')
      .then((d) => setPersonnel(d.personnel || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    Promise.all([loadTemplate(), loadPersonnel()]).finally(() => setLoading(false))
  }, [loadTemplate, loadPersonnel])

  useEffect(() => {
    loadDay(selDate)
    loadWeek(selDate)
    loadMonthStrip(selDate)
  }, [selDate, loadDay, loadWeek, loadMonthStrip])

  /** بعد از هر تغییر: همهٔ نوارها و روز جاری تازه شوند */
  const refreshAll = useCallback(() => {
    loadTemplate()
    loadDay(selDate)
    loadWeek(selDate)
    loadMonthStrip(selDate)
  }, [loadTemplate, loadDay, loadWeek, loadMonthStrip, selDate])

  const today = todayIso()
  const dayTotals = useMemo(() => {
    const need = dayData.shifts.filter((s) => s.active).reduce((a, s) => a + s.staffNeed, 0)
    const activeIds = new Set(dayData.shifts.filter((s) => s.active).map((s) => s.id))
    const assigned = dayData.assignments.filter((a) => activeIds.has(a.shiftId)).length
    const shortShifts = dayData.shifts.filter((s) => s.active && s.staffNeed > dayData.assignments.filter((a) => a.shiftId === s.id).length).length
    return { need, assigned, shortShifts, shiftCount: dayData.shifts.filter((s) => s.active).length }
  }, [dayData])

  const holidayTitle = holidays.get(selDate)

  return (
    <div className="space-y-4">
      {/* سوییچ تب */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: 'daily', label: 'برنامهٔ روزانه', icon: <CalendarClock size={16} /> },
          { key: 'template', label: 'قالب هفتگی شیفت‌ها', icon: <CalendarPlus size={16} /> },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition-all',
              tab === t.key
                ? 'bg-[#0e7a4a] text-white shadow-md'
                : 'border border-border bg-card text-foreground hover:border-[#0e7a4a]/40'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'daily' && (
        <DailyBoard
          canManage={canManage}
          selDate={selDate}
          setSelDate={setSelDate}
          today={today}
          holidays={holidays}
          holidayTitle={holidayTitle}
          dayData={dayData}
          dayTotals={dayTotals}
          weekStrip={weekStrip}
          monthStrip={monthStrip}
          onOpenAssign={(s) => setAssign({ open: true, shift: s })}
          onUnassign={refreshAll}
          onGoTemplate={() => setTab('template')}
          onPreset={refreshAll}
        />
      )}

      {tab === 'template' && (
        <TemplateTab
          canManage={canManage}
          template={template}
          onEdit={(s) => setEditor({ open: true, shift: s })}
          onNew={() => setEditor({ open: true, shift: null })}
          onChanged={refreshAll}
        />
      )}

      {/* مودال ویرایشگر شیفت */}
      {editor.open && (
        <ShiftEditorModal
          shift={editor.shift}
          onClose={() => setEditor({ open: false, shift: null })}
          onSaved={() => {
            setEditor({ open: false, shift: null })
            refreshAll()
          }}
        />
      )}

      {/* مودال تخصیص نیرو */}
      {assign.open && assign.shift && (
        <AssignModal
          date={selDate}
          shift={assign.shift}
          dayShifts={dayData.shifts}
          dayAssignments={dayData.assignments}
          personnel={personnel}
          onClose={() => setAssign({ open: false, shift: null })}
          onSaved={() => {
            setAssign({ open: false, shift: null })
            refreshAll()
          }}
        />
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> در حال بارگذاری شیفت‌ها…
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════ الف) قالب هفتگی ═══════════════════════ */
function TemplateTab({
  canManage, template, onEdit, onNew, onChanged,
}: {
  canManage: boolean
  template: Record<number, ShiftRow[]>
  onEdit: (s: ShiftRow) => void
  onNew: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const totalCount = Object.values(template).reduce((a, arr) => a + (arr?.length || 0), 0)

  const applyPreset = async () => {
    setBusy(true)
    try {
      const r = await api<{ created: number; skipped: number }>('/api/shifts', { method: 'POST', body: { action: 'preset' } })
      if (r.created > 0) toast.success(`قالب هایپر زیتون اعمال شد — ${faNum(r.created)} شیفت ساخته شد`)
      else toast.info('قالب از قبل برقرار بود — شیفت تکراری ساخته نشد')
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'اعمال قالب ناموفق بود')
    } finally {
      setBusy(false)
    }
  }

  const removeShift = async (s: ShiftRow) => {
    if (confirmDel !== s.id) {
      setConfirmDel(s.id)
      setTimeout(() => setConfirmDel((cur) => (cur === s.id ? null : cur)), 3000)
      return
    }
    setConfirmDel(null)
    try {
      const r = await api<{ soft: boolean; assignments?: number }>(`/api/shifts/${s.id}`, { method: 'DELETE' })
      if (r.soft) toast.success(`شیفت غیرفعال شد — ${faNum(r.assignments || 0)} تخصیص ثبت‌شده دارد و از حذف کامل معاف است`)
      else toast.success('شیفت حذف شد')
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'حذف ناموفق بود')
    }
  }

  return (
    <SectionCard
      title="قالب هفتگی شیفت‌ها"
      subtitle="الگوی ثابت هر روز هفته — برنامهٔ روزانه از روی همین قالب ساخته می‌شود"
      icon={<CalendarClock size={20} />}
      actions={
        canManage && (
          <>
            <button
              onClick={applyPreset}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl bg-[#c9a227] px-3 py-2 text-xs font-black text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              شروع سریع هایپر زیتون
            </button>
            <button
              onClick={onNew}
              className="flex items-center gap-1.5 rounded-xl bg-[#0e7a4a] px-3 py-2 text-xs font-black text-white transition hover:opacity-90"
            >
              <Plus size={14} /> شیفت جدید
            </button>
          </>
        )
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#c9a227]/30 bg-[#c9a227]/8 px-3 py-2.5 text-[11.5px] leading-5 text-[#8a6d10]">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>{HOURS_INFO}</span>
      </div>

      {totalCount === 0 ? (
        <EmptyState
          emoji="🕒"
          title="هنوز شیفتی تعریف نشده است"
          hint="با یک کلیک قالب پیش‌فرض هایپر زیتون را برقرار کنید (شنبه تا پنجشنبه صبح و عصر، جمعه دو شیفت کوتاه) یا شیفت دلخواه بسازید."
        />
      ) : (
        <div className="scroll-gold -mx-2 overflow-x-auto px-2 pb-2">
          <div className="grid min-w-[1080px] grid-cols-7 gap-2">
            {IRAN_WEEK.map((d) => {
              const list = template[d.wd] || []
              return (
                <div key={d.wd} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between rounded-xl bg-[#0e7a4a]/8 px-2.5 py-2">
                    <span className="text-xs font-black text-[#0e7a4a]">{d.name}</span>
                    <span className="text-[10px] font-bold text-muted-foreground">{list.length ? faNum(list.length) + ' شیفت' : '—'}</span>
                  </div>
                  {list.length === 0 && (
                    <div className="rounded-xl border-2 border-dashed border-border/70 px-2 py-6 text-center text-[10px] text-muted-foreground">
                      شیفتی ثبت نشده
                    </div>
                  )}
                  {list.map((s) => {
                    const overnight = isOvernight(s)
                    return (
                      <div
                        key={s.id}
                        className={cn('rounded-xl border border-border bg-card p-2.5 shadow-sm', !s.active && 'opacity-60')}
                        style={{ borderInlineStartWidth: 4, borderInlineStartColor: s.color }}
                      >
                        <div className="mb-1 flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                          <span className="truncate text-xs font-black">{s.name}</span>
                          {!s.active && <span className="ms-auto shrink-0 text-[9px] font-bold text-muted-foreground">غیرفعال</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 text-[10.5px] font-bold text-muted-foreground">
                          <Clock size={11} />
                          <span dir="ltr">{faNum(s.start)} – {faNum(s.end)}</span>
                          {overnight && (
                            <span className="flex items-center gap-0.5 rounded-full bg-[#f3ead0] px-1.5 py-0.5 text-[9px] font-black text-[#8a6d10]">
                              <MoonStar size={9} /> تا فردا
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[10.5px] text-muted-foreground">مدت: {faDur(durationMin(s))}</p>
                        <p className="mt-0.5 text-[10.5px] font-bold text-[#0e7a4a]">نیروی موردنیاز: {faNum(s.staffNeed)}</p>
                        {canManage && (
                          <div className="mt-2 flex items-center gap-1 border-t border-border/60 pt-2">
                            <button
                              onClick={() => onEdit(s)}
                              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black text-[#0e7a4a] transition hover:bg-[#0e7a4a]/10"
                            >
                              <Pencil size={11} /> ویرایش
                            </button>
                            <button
                              onClick={() => removeShift(s)}
                              className={cn(
                                'flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black transition ms-auto',
                                confirmDel === s.id ? 'bg-[#b3372f] text-white' : 'text-[#b3372f] hover:bg-[#b3372f]/10'
                              )}
                            >
                              <Trash2 size={11} /> {confirmDel === s.id ? 'تأیید حذف؟' : 'حذف'}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </SectionCard>
  )
}

/* ═══════════════════════ ب) برنامهٔ روزانه ═══════════════════════ */
function DailyBoard({
  canManage, selDate, setSelDate, today, holidays, holidayTitle, dayData, dayTotals,
  weekStrip, monthStrip, onOpenAssign, onUnassign, onGoTemplate, onPreset,
}: {
  canManage: boolean
  selDate: string
  setSelDate: (d: string) => void
  today: string
  holidays: Map<string, string>
  holidayTitle?: string
  dayData: { shifts: ShiftRow[]; assignments: AssignmentRow[] }
  dayTotals: { need: number; assigned: number; shortShifts: number; shiftCount: number }
  weekStrip: { shifts: ShiftRow[]; assignments: AssignmentRow[] }
  monthStrip: { shifts: ShiftRow[]; assignments: AssignmentRow[] } | null
  onOpenAssign: (s: ShiftRow) => void
  onUnassign: () => void
  onGoTemplate: () => void
  onPreset: () => void
}) {
  const [unassigning, setUnassigning] = useState<string | null>(null)
  const week = useMemo(() => iranWeekRange(selDate), [selDate])
  const monthRange = useMemo(() => jMonthRange(selDate), [selDate])
  const { jy: selJy, jm: selJm } = monthRange

  const unassign = async (a: AssignmentRow) => {
    setUnassigning(a.id)
    try {
      await api(`/api/shifts/${a.shiftId}?assignment=${a.id}`, { method: 'DELETE' })
      toast.success(`${a.personnelName} از شیفت حذف شد`)
      onUnassign()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'حذف تخصیص ناموفق بود')
    } finally {
      setUnassigning(null)
    }
  }

  const presetFromBoard = async () => {
    try {
      const r = await api<{ created: number; skipped: number }>('/api/shifts', { method: 'POST', body: { action: 'preset' } })
      if (r.created > 0) toast.success(`قالب هایپر زیتون اعمال شد — ${faNum(r.created)} شیفت ساخته شد`)
      else toast.info('قالب از قبل برقرار بود')
      onPreset()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'اعمال قالب ناموفق بود')
    }
  }

  const stripSummary = (dateIso: string) => {
    const s = daySummary(dateIso, weekStrip.shifts, weekStrip.assignments)
    return { need: s.need, assigned: s.assigned }
  }
  const monthCell = (dateIso: string) => {
    if (!monthStrip) return { need: 0, assigned: 0 }
    const s = daySummary(dateIso, monthStrip.shifts, monthStrip.assignments)
    return { need: s.need, assigned: s.assigned }
  }

  const activeShifts = dayData.shifts.filter((s) => s.active)

  return (
    <div className="space-y-4">
      {/* ناوبری تاریخ + آمار روز */}
      <SectionCard
        title={`برنامهٔ روزانه — ${weekdayName(selDate)} ${formatJalaliShort(selDate)}`}
        subtitle="پوشش نیروی انسانی روز انتخابی، بر پایهٔ قالب هفتگی"
        icon={<CalendarClock size={20} />}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setSelDate(addDaysIso(-1, selDate))}
              className="rounded-xl border border-border bg-card p-2 transition hover:border-[#0e7a4a]/50"
              title="روز قبل"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setSelDate(today)}
              className={cn(
                'rounded-xl border px-3 py-2 text-xs font-black transition',
                selDate === today ? 'border-[#c9a227] bg-[#c9a227]/15 text-[#8a6d10]' : 'border-border bg-card hover:border-[#c9a227]/50'
              )}
            >
              امروز
            </button>
            <button
              onClick={() => setSelDate(addDaysIso(1, selDate))}
              className="rounded-xl border border-border bg-card p-2 transition hover:border-[#0e7a4a]/50"
              title="روز بعد"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="min-w-[210px]">
              <JalaliDatePicker value={selDate} onChange={setSelDate} holidays={holidays} compact warnHoliday={false} placeholder="انتخاب روز" />
            </div>
          </div>
        }
      >
        {/* نشان جمعه/تعطیل رسمی */}
        {(isFriday(selDate) || holidayTitle) && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {isFriday(selDate) && <Pill label="جمعه — تعطیل هفتگی" color="#c9a227" bg="#f3ead0" />}
            {holidayTitle && <Pill label={`تعطیل رسمی: ${holidayTitle}`} color="#b3372f" bg="#fdecea" />}
            <span className="text-[10.5px] text-muted-foreground">شیفت‌های این روز طبق توافق کاری برقرار است — تعطیلی به معنی حذف شیفت نیست.</span>
          </div>
        )}

        {/* نوار هفته — ۷ ستون کوچک */}
        <div className="mb-4 grid grid-cols-7 gap-1.5">
          {week.days.map((d) => {
            const sum = stripSummary(d)
            const cov = coverageOf(sum.assigned, sum.need)
            const selected = d === selDate
            const { jd } = toJalaliParts(d)
            return (
              <button
                key={d}
                onClick={() => setSelDate(d)}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 transition',
                  selected ? 'border-[#0e7a4a] bg-[#0e7a4a]/10 shadow-sm' : 'border-border bg-card hover:border-[#0e7a4a]/40',
                  d === today && !selected && 'border-[#c9a227]/60'
                )}
              >
                <span className="text-[9.5px] font-bold text-muted-foreground">{IRAN_WEEK.find((w) => w.wd === new Date(d + 'T12:00:00').getDay())?.name}</span>
                <span className={cn('text-sm font-black', selected ? 'text-[#0e7a4a]' : 'text-foreground')}>{faNum(jd)}</span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-black"
                  style={{ color: cov.color, background: cov.bg }}
                >
                  {sum.need === 0 ? '—' : cov.tone === 'ok' ? '✓ کامل' : `${faNum(sum.assigned)}/${faNum(sum.need)}`}
                </span>
              </button>
            )
          })}
        </div>

        {/* آمار روز */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'شیفت‌های امروز', value: faNum(dayTotals.shiftCount), tone: 'text-[#0e7a4a]' },
            { label: 'نیروی موردنیاز', value: faNum(dayTotals.need), tone: 'text-[#8a6d10]' },
            { label: 'تخصیص‌یافته', value: faNum(dayTotals.assigned), tone: 'text-[#5c7236]' },
            { label: 'شیفت با کمبود', value: faNum(dayTotals.shortShifts), tone: dayTotals.shortShifts ? 'text-[#c96f4a]' : 'text-muted-foreground' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card px-3 py-2.5">
              <p className={cn('text-xl font-black', s.tone)}>{s.value}</p>
              <p className="text-[10.5px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* کارت‌های شیفت روز */}
        {activeShifts.length === 0 ? (
          <div className="space-y-3">
            <EmptyState
              emoji="🗓️"
              title="برای این روزِ هفته شیفتی تعریف نشده"
              hint="از قالب هفتگی شیفت برای این روز اضافه کنید یا با یک کلیک قالب پیش‌فرض هایپر زیتون را برقرار کنید."
            />
            {canManage && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={presetFromBoard}
                  className="flex items-center gap-1.5 rounded-xl bg-[#c9a227] px-4 py-2.5 text-xs font-black text-white transition hover:opacity-90"
                >
                  <Zap size={14} /> شروع سریع هایپر زیتون
                </button>
                <button
                  onClick={onGoTemplate}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-black transition hover:border-[#0e7a4a]/40"
                >
                  <CalendarPlus size={14} /> رفتن به قالب هفتگی
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {activeShifts.map((s) => {
              const rows = dayData.assignments.filter((a) => a.shiftId === s.id)
              const cov = coverageOf(rows.length, s.staffNeed)
              const understaffed = cov.tone === 'warn'
              return (
                <div
                  key={s.id}
                  className={cn(
                    'rounded-2xl border bg-card p-4 transition',
                    understaffed ? 'border-[#c9a227]/70 bg-[#fdf6dd]/40' : 'border-border'
                  )}
                  style={{ borderInlineStartWidth: 5, borderInlineStartColor: s.color }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="text-sm font-black">{s.name}</span>
                    <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground" dir="ltr">
                      <Clock size={12} /> {faNum(s.start)} – {faNum(s.end)}
                    </span>
                    {isOvernight(s) && (
                      <Pill label="تا فردا" color="#8a6d10" bg="#f3ead0" className="!text-[9.5px]" />
                    )}
                    <span className="text-[11px] text-muted-foreground">({faDur(durationMin(s))})</span>
                    <Pill label={`نیروی موردنیاز: ${faNum(s.staffNeed)}`} color="#5c7236" bg="#ecfccb" className="!text-[9.5px]" />
                    <Pill label={cov.label} color={cov.color} bg={cov.bg} className="ms-auto !text-[10px]" />
                  </div>

                  {s.note && <p className="mt-1.5 text-[11px] text-muted-foreground">یادداشت: {s.note}</p>}

                  {/* چیپ‌های پرسنل تخصیص‌یافته */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {rows.length === 0 && (
                      <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold text-muted-foreground">بدون تخصیص — روی «تخصیص نیرو» بزنید</span>
                    )}
                    {rows.map((a) => (
                      <span
                        key={a.id}
                        className="flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-bold shadow-sm"
                        title={`${a.personnelName} • ${faDur(durationMin(s))}${a.double ? ' • شیفت دوم' : ''}`}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                        {a.personnelName}
                        {a.double && <span className="rounded-full bg-[#c9a227]/15 px-1.5 text-[9px] font-black text-[#8a6d10]">شیفت دوم ۲×</span>}
                        {canManage && (
                          <button
                            onClick={() => unassign(a)}
                            disabled={unassigning === a.id}
                            className="ms-0.5 rounded-full p-0.5 text-[#b3372f] transition hover:bg-[#b3372f]/10 disabled:opacity-40"
                            title="حذف تخصیص"
                          >
                            {unassigning === a.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                          </button>
                        )}
                      </span>
                    ))}
                    {canManage && (
                      <button
                        onClick={() => onOpenAssign(s)}
                        className="ms-auto flex items-center gap-1.5 rounded-xl bg-[#0e7a4a] px-3 py-2 text-xs font-black text-white transition hover:opacity-90"
                      >
                        <Users size={13} /> تخصیص نیرو
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* راهنمای پوشش */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#0e7a4a]" /> پوشش کامل</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#c9a227]" /> کمبود نیرو (هشدار)</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#6d7a6e]" /> بدون تخصیص</span>
        </div>
      </SectionCard>

      {/* نوار ماه جلالی */}
      <SectionCard
        title={`پوشش ماه ${J_MONTH_FA[selJm - 1]} ${faNum(selJy)}`}
        subtitle="خلاصهٔ پوشش نیرو در ماه جلالی — روی هر روز بزنید تا انتخاب شود"
        icon={<CalendarClock size={20} />}
        actions={
          <button
            onClick={onGoTemplate}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-black transition hover:border-[#0e7a4a]/40"
          >
            <CalendarPlus size={13} /> ویرایش قالب هفتگی
          </button>
        }
      >
        <MonthStrip
          base={selDate}
          monthRange={monthRange}
          monthStrip={monthStrip}
          today={today}
          onPick={setSelDate}
        />
      </SectionCard>
    </div>
  )
}

/** ماه‌نمای کوچک جلالی با وضعیت پوشش هر روز */
function MonthStrip({
  base, monthRange, monthStrip, today, onPick,
}: {
  base: string
  monthRange: { jy: number; jm: number; from: string; to: string }
  monthStrip: { shifts: ShiftRow[]; assignments: AssignmentRow[] } | null
  today: string
  onPick: (d: string) => void
}) {
  const { jy, jm } = monthRange
  const len = jMonthLength(jy, jm)
  const lead = (() => {
    const first = jalaliToIso(jy, jm, 1)
    return (new Date(first + 'T12:00:00').getDay() + 1) % 7 // ۰=شنبه
  })()
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: len }, (_, i) => jalaliToIso(jy, jm, i + 1))]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="min-w-[560px]">
      <div className="mb-1 grid grid-cols-7 gap-1">
        {IRAN_WEEK.map((d) => (
          <div key={d.wd} className="text-center text-[10px] font-black text-muted-foreground">{d.name}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((iso, i) => {
          if (!iso) return <div key={`b${i}`} />
          const sum = monthStrip ? daySummary(iso, monthStrip.shifts, monthStrip.assignments) : { need: 0, assigned: 0 }
          const cov = coverageOf(sum.assigned, sum.need)
          const { jd } = toJalaliParts(iso)
          const selected = iso === base
          return (
            <button
              key={iso}
              onClick={() => onPick(iso)}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-lg border px-0.5 py-1.5 transition',
                selected ? 'border-[#0e7a4a] bg-[#0e7a4a]/10' : 'border-border/70 bg-card hover:border-[#0e7a4a]/40',
                iso === today && !selected && 'border-[#c9a227]/60'
              )}
            >
              <span className="text-[11px] font-black">{faNum(jd)}</span>
              <span
                className="rounded-full px-1 py-0.5 text-[8px] font-black leading-none"
                style={{ color: cov.color, background: cov.bg }}
              >
                {sum.need === 0 ? '—' : cov.tone === 'ok' ? '✓' : `${faNum(sum.assigned)}/${faNum(sum.need)}`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════ مودال ویرایشگر شیفت ═══════════════════════ */
function ShiftEditorModal({
  shift, onClose, onSaved,
}: {
  shift: ShiftRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: shift?.name || '',
    weekday: shift?.weekday ?? 6,
    start: shift?.start || '08:00',
    end: shift?.end || '15:30',
    staffNeed: shift?.staffNeed ?? 1,
    color: shift?.color || '#0e7a4a',
    active: shift ? shift.active : true,
    note: shift?.note || '',
  })
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!form.name.trim()) return toast.error('نام شیفت الزامی است')
    if (!HHMM_RE.test(form.start)) return toast.error('ساعت شروع معتبر نیست — قالب HH:MM')
    if (!HHMM_RE.test(form.end)) return toast.error('ساعت پایان معتبر نیست — قالب HH:MM')
    if (form.staffNeed < 0) return toast.error('تعداد نیروی موردنیاز نمی‌تواند منفی باشد')
    setBusy(true)
    try {
      if (shift) {
        await api(`/api/shifts/${shift.id}`, { method: 'PUT', body: form })
        toast.success('شیفت به‌روزرسانی شد')
      } else {
        await api('/api/shifts', { method: 'POST', body: form })
        toast.success('شیفت جدید ساخته شد')
      }
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ذخیرهٔ شیفت ناموفق بود')
    } finally {
      setBusy(false)
    }
  }

  const overnight = isOvernight(form)

  return (
    <Modal title={shift ? `ویرایش شیفت «${shift.name}»` : 'شیفت جدید'} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="نام شیفت">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="مثلاً صبح، عصر، انبار…"
            className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Labeled>
        <Labeled label="روز هفته">
          <select
            value={String(form.weekday)}
            onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}
            className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            {IRAN_WEEK.map((d) => (
              <option key={d.wd} value={d.wd}>{d.name}</option>
            ))}
          </select>
        </Labeled>
        <Labeled label="ساعت شروع">
          <input
            type="time"
            dir="ltr"
            value={form.start}
            onChange={(e) => setForm({ ...form, start: e.target.value })}
            className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-center text-sm outline-none focus:border-primary"
          />
        </Labeled>
        <Labeled label="ساعت پایان" hint={overnight ? 'پایان ≤ شروع → شیفت به فردا می‌خوابد' : undefined}>
          <input
            type="time"
            dir="ltr"
            value={form.end}
            onChange={(e) => setForm({ ...form, end: e.target.value })}
            className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-center text-sm outline-none focus:border-primary"
          />
        </Labeled>
      </div>

      <div className="rounded-xl bg-muted/60 px-3 py-2 text-[11px] font-bold text-muted-foreground">
        مدت این شیفت: {faDur(durationMin(form))}
        {overnight && ' (شامل ساعات بعد از نیمه‌شب)'}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="نیروی موردنیاز">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, staffNeed: Math.max(0, form.staffNeed - 1) })}
              className="h-10 w-10 rounded-xl border border-input text-lg font-black transition hover:bg-muted"
            >
              −
            </button>
            <span className="w-12 text-center text-lg font-black text-[#0e7a4a]">{faNum(form.staffNeed)}</span>
            <button
              type="button"
              onClick={() => setForm({ ...form, staffNeed: Math.min(99, form.staffNeed + 1) })}
              className="h-10 w-10 rounded-xl border border-input text-lg font-black transition hover:bg-muted"
            >
              +
            </button>
          </div>
        </Labeled>
        <Labeled label="رنگ نشان شیفت">
          <div className="flex items-center gap-2 pt-1">
            {BRAND_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm({ ...form, color: c })}
                className={cn(
                  'h-8 w-8 rounded-full border-2 transition',
                  form.color === c ? 'scale-110 border-foreground shadow-md' : 'border-transparent opacity-80 hover:opacity-100'
                )}
                style={{ background: c }}
                title={c}
              />
            ))}
          </div>
        </Labeled>
      </div>

      <Labeled label="وضعیت">
        <button
          type="button"
          onClick={() => setForm({ ...form, active: !form.active })}
          className={cn(
            'flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-bold transition',
            form.active ? 'border-[#0e7a4a]/40 bg-[#0e7a4a]/8 text-[#0e7a4a]' : 'border-border bg-card text-muted-foreground'
          )}
        >
          <span>{form.active ? 'فعال — در برنامهٔ روزانه ظاهر می‌شود' : 'غیرفعال — فقط در قالب دیده می‌شود'}</span>
          <span className={cn('h-5 w-9 rounded-full p-0.5 transition', form.active ? 'bg-[#0e7a4a]' : 'bg-muted-foreground/40')}>
            <span className={cn('block h-4 w-4 rounded-full bg-white transition-transform', form.active ? '-translate-x-4' : 'translate-x-0')} />
          </span>
        </button>
      </Labeled>

      <Labeled label="یادداشت (اختیاری)">
        <textarea
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          rows={2}
          placeholder="مثلاً: هماهنگی با انبار برای بارگیری صبح"
          className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
      </Labeled>

      <div className="flex items-start gap-2 rounded-xl border border-[#c9a227]/30 bg-[#c9a227]/8 px-3 py-2 text-[10.5px] leading-5 text-[#8a6d10]">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>{HOURS_INFO}</span>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onClose} className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold transition hover:bg-muted">
          انصراف
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="flex items-center gap-2 rounded-xl bg-[#0e7a4a] px-5 py-2.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {shift ? 'ذخیرهٔ تغییرات' : 'ایجاد شیفت'}
        </button>
      </div>
    </Modal>
  )
}

/* ═══════════════════════ مودال تخصیص نیرو ═══════════════════════ */
function AssignModal({
  date, shift, dayShifts, dayAssignments, personnel, onClose, onSaved,
}: {
  date: string
  shift: ShiftRow
  dayShifts: ShiftRow[]
  dayAssignments: AssignmentRow[]
  personnel: PersonnelRow[]
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<DraftRow[]>(
    dayAssignments.filter((a) => a.shiftId === shift.id).map((a) => ({ personnelId: a.personnelId, personnelName: a.personnelName, double: a.double, note: a.note }))
  )
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const activePeople = useMemo(
    () =>
      personnel
        .filter((p) => p.active)
        .sort((a, b) => fullName(a).localeCompare(fullName(b), 'fa')),
    [personnel]
  )
  const filtered = useMemo(() => {
    const needle = q.trim()
    if (!needle) return activePeople
    return activePeople.filter((p) => fullName(p).includes(needle) || p.jobTitle.includes(needle) || p.department.includes(needle))
  }, [activePeople, q])
  const draftIds = useMemo(() => new Set(draft.map((r) => r.personnelId)), [draft])

  const togglePerson = (p: PersonnelRow) => {
    setDraft((cur) => {
      if (cur.some((r) => r.personnelId === p.id)) return cur.filter((r) => r.personnelId !== p.id)
      return [...cur, { personnelId: p.id, personnelName: fullName(p), double: false, note: '' }]
    })
  }

  /** جمع ساعت روزانهٔ هر نفر = مجموع مدت همهٔ شیفت‌های تخصیص‌یافتهٔ همان تاریخ */
  const shiftById = useMemo(() => {
    const m = new Map<string, ShiftRow>()
    for (const s of dayShifts) m.set(s.id, s)
    return m
  }, [dayShifts])

  const dailyMinutes = useCallback(
    (personnelId: string): number => {
      let total = 0
      for (const a of dayAssignments) {
        if (a.personnelId === personnelId && a.shiftId !== shift.id) {
          const s = shiftById.get(a.shiftId)
          if (s && s.active) total += durationMin(s)
        }
      }
      for (const r of draft) {
        if (r.personnelId === personnelId) total += durationMin(shift)
      }
      return total
    },
    [dayAssignments, draft, shift, shiftById]
  )

  const save = async () => {
    setBusy(true)
    try {
      await api('/api/shifts', {
        method: 'POST',
        body: {
          date,
          shiftId: shift.id,
          assign: draft.map((r) => ({ personnelId: r.personnelId, double: r.double, note: r.note })),
        },
      })
      toast.success(`تخصیص‌های «${shift.name}» ذخیره شد — ${faNum(draft.length)} نفر`)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ذخیرهٔ تخصیص‌ها ناموفق بود')
    } finally {
      setBusy(false)
    }
  }

  const cov = coverageOf(draft.length, shift.staffNeed)

  return (
    <Modal title={`تخصیص نیرو — ${shift.name} (${weekdayName(date)} ${formatJalaliShort(date)})`} onClose={onClose} wide>
      {/* خلاصهٔ شیفت */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-[11.5px] font-bold">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: shift.color }} />
        <span dir="ltr">{faNum(shift.start)} – {faNum(shift.end)}</span>
        {isOvernight(shift) && <Pill label="تا فردا" color="#8a6d10" bg="#f3ead0" className="!text-[9.5px]" />}
        <span className="text-muted-foreground">مدت: {faDur(durationMin(shift))}</span>
        <Pill label={`نیروی موردنیاز: ${faNum(shift.staffNeed)}`} color="#5c7236" bg="#ecfccb" className="!text-[9.5px]" />
        <Pill label={`${cov.label} (${faNum(draft.length)}/${faNum(shift.staffNeed)})`} color={cov.color} bg={cov.bg} className="ms-auto !text-[10px]" />
      </div>

      {/* جست‌وجو و انتخاب پرسنل */}
      <div className="relative">
        <Search size={14} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="جست‌وجوی نام یا سمت…"
          className="w-full rounded-xl border border-input bg-white/90 px-3 py-2.5 pe-9 text-sm outline-none focus:border-primary"
        />
      </div>
      <div className="scroll-gold max-h-44 overflow-y-auto rounded-xl border border-border">
        {filtered.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted-foreground">پرسنل فعالی یافت نشد</p>}
        {filtered.map((p) => {
          const picked = draftIds.has(p.id)
          return (
            <button
              key={p.id}
              onClick={() => togglePerson(p)}
              className={cn(
                'flex w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-right text-xs transition last:border-b-0',
                picked ? 'bg-[#0e7a4a]/8' : 'hover:bg-muted/50'
              )}
            >
              <span
                className={cn(
                  'flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border-2 text-[9px] font-black',
                  picked ? 'border-[#0e7a4a] bg-[#0e7a4a] text-white' : 'border-border'
                )}
              >
                {picked ? '✓' : ''}
              </span>
              <span className="font-black">{fullName(p)}</span>
              <span className="text-[10px] text-muted-foreground">{[p.jobTitle, p.department].filter(Boolean).join(' • ')}</span>
            </button>
          )
        })}
      </div>

      {/* ردیف‌های تخصیص */}
      <div className="space-y-2">
        <p className="text-xs font-black text-foreground">نیروهای این شیفت ({faNum(draft.length)} نفر)</p>
        {draft.length === 0 && (
          <p className="rounded-xl border-2 border-dashed border-border/70 px-3 py-3 text-center text-[11px] text-muted-foreground">
            از فهرست بالا انتخاب کنید
          </p>
        )}
        {draft.map((r) => {
          const total = dailyMinutes(r.personnelId)
          const many = draft.filter((x) => x.personnelId === r.personnelId).length + dayAssignments.filter((a) => a.personnelId === r.personnelId && a.shiftId !== shift.id).length
          return (
            <div key={r.personnelId} className="rounded-xl border border-border bg-card px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black">{r.personnelName}</span>
                <button
                  type="button"
                  onClick={() => setDraft((cur) => cur.map((x) => (x.personnelId === r.personnelId ? { ...x, double: !x.double } : x)))}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[10px] font-black transition',
                    r.double ? 'bg-[#c9a227] text-white' : 'border border-[#c9a227]/50 text-[#8a6d10] hover:bg-[#c9a227]/10'
                  )}
                  title="این نفر هم‌زمان در شیفت دیگری همان روز هم است"
                >
                  {r.double ? '✓ شیفت دوم (۲×)' : 'شیفت دوم (۲×)'}
                </button>
                <span className="ms-auto text-[10.5px] font-bold text-[#5c7236]">
                  جمع امروز: {total > 0 ? faDur(total) : faNum(0)}
                  {many > 1 ? ` در ${faNum(many)} شیفت` : ''}
                </span>
                <button
                  onClick={() => setDraft((cur) => cur.filter((x) => x.personnelId !== r.personnelId))}
                  className="rounded-full p-1 text-[#b3372f] transition hover:bg-[#b3372f]/10"
                  title="حذف از شیفت"
                >
                  <X size={13} />
                </button>
              </div>
              <input
                value={r.note}
                onChange={(e) => setDraft((cur) => cur.map((x) => (x.personnelId === r.personnelId ? { ...x, note: e.target.value } : x)))}
                placeholder="یادداشت تخصیص (اختیاری) — مثلاً جایگزین همکار در مرخصی"
                className="mt-2 w-full rounded-lg border border-input bg-white/80 px-2.5 py-1.5 text-[11px] outline-none focus:border-primary"
              />
            </div>
          )
        })}
      </div>

      <p className="rounded-xl bg-[#ecfccb] px-3 py-2 text-[11px] font-bold text-[#3f6212]">💰 {PAY_NOTE}</p>

      <div className="flex items-center justify-end gap-2">
        <button onClick={onClose} className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold transition hover:bg-muted">
          انصراف
        </button>
        <button
          onClick={save}
          disabled={busy || draft.length === 0}
          className="flex items-center gap-2 rounded-xl bg-[#0e7a4a] px-5 py-2.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          ذخیرهٔ تخصیص‌ها
        </button>
      </div>
    </Modal>
  )
}
