'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import {
  faMoney, faNum, formatJalaliFull, formatJalaliShort, jalaliToIso, todayIso, toJalaliParts,
  addDaysIso, daysBetween, weekdayName, isFriday, jMonthLength, jMonthStartWeekday, J_MONTHS,
} from '@/lib/jalali'
import {
  resolveFlex, dueAlternatives, weekStartIso, SCOPE_LABELS, SEASON_NAMES, flexScopeDesc,
  type FlexRuleLite,
} from '@/lib/flex'
import {
  generateSchedule, resolvePeriodKey, PAY_PERIOD_LABELS, PAY_METHOD_LABELS,
  DEFAULT_SCHED_PARAMS, maxChequesFor,
  type SchedParams, type SchedOption, type PayLimitLite,
} from '@/lib/pay-scheduler'
import { CHEQUE_STATUSES } from '@/lib/constants'
import { SectionCard, Pill, EmptyState, Labeled, KeyValue, FaPriceInput } from '@/components/app/ui-bits'
import { JalaliDatePicker, useHolidays, calFontStyle } from '@/components/app/jalali-widgets'
import { formatHijri, isoToHijri } from '@/lib/hijri'
import { Modal } from '@/components/views/Orders'
import { SciExplain } from '@/components/app/SciExplain'
import type { AppCtx } from '@/components/app/ui-bits'
import {
  Banknote, Plus, CheckCircle2, XCircle, Scissors, Handshake, AlertTriangle, CalendarDays,
  SlidersHorizontal, Sparkles, CalendarCheck, Wallet, Gauge, Trash2, Pencil, Trophy, ShieldCheck,
  Landmark, Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Cheque = {
  id: string; number: string; amount: number; orderCode: string; recipientName: string; recipientPhone: string
  writtenAt: string; dueDate: string; periodDays: number; status: string; ownerNote: string; createdByName: string
  createdById?: string
  history: any[]; isFriday: boolean; overdue: boolean
  sayadSerial?: string; selfIssued?: boolean; holooReceiptNo?: string; repId?: string; repName?: string
}
type DueBucket = { count: number; amount: number }
type ChequeStats = {
  totalWritten: number; totalAmount: number; byStatus: Record<string, number>
  pendingOwner: DueBucket; waitingPickup: DueBucket; delivered: DueBucket; cleared: DueBucket
  dueToday: DueBucket; dueTomorrow: DueBucket; dueThisWeek: DueBucket; dueThisMonth: DueBucket
  overdue: number
  byStatusDue: Record<string, { today: DueBucket; tomorrow: DueBucket; week: DueBucket; month: DueBucket }>
}
type LimitRow = {
  id: string; period: string; dateKey: string; method: string; maxAmount: number; maxCheques: number
  note: string; used: number; usedCheques: number; overRatio: number; range: { start: string; end: string }
}
type PaymentRow = {
  id: string; kind: string; amount: number; orderId: string; orderCode: string; providerName: string
  repId: string; repName: string; paidAt: string; holooReceiptNo: string; note: string
  createdById: string; createdByName: string; history: any[]
}
type PaymentStats = {
  count: number; total: number
  today: { count: number; amount: number }; month: { count: number; amount: number }
  byKind: Record<string, { count: number; amount: number }>
}
type RepLite = { id: string; fullName: string; providerName: string; active: boolean }
type SchedResult = ReturnType<typeof generateSchedule>

const WEEKDAY_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']
function wdShort(iso: string): string {
  const d = new Date(iso + 'T12:00:00').getDay()
  return WEEKDAY_SHORT[d === 6 ? 0 : d + 1]
}
/** compact money for calendar cells: ۸۵م / ۱٫۲م / ۹۵۰ه */
function faMoneyShort(v: number): string {
  if (v >= 1_000_000_000) return `${faNum((v / 1_000_000_000).toFixed(1))} میلیارد`
  if (v >= 1_000_000) return `${faNum(Math.round(v / 1_000_000))}م`
  if (v >= 1000) return `${faNum(Math.round(v / 1000))}ه`
  return faNum(v)
}

const PAY_KIND_META: Record<string, { label: string; icon: string; color: string }> = {
  CASH: { label: 'نقدی', icon: '💵', color: '#0e7a4a' },
  POS: { label: 'کارت‌خوان', icon: '🏧', color: '#8a5a2b' },
  TRANSFER: { label: 'کارت به کارت / حواله', icon: '🔁', color: '#77934a' },
  OTHER: { label: 'سایر', icon: '📄', color: '#6d7a6e' },
}

const TABS = [
  { key: 'cheques', label: 'چک‌ها', icon: <Banknote size={14} /> },
  { key: 'payments', label: 'پرداخت‌ها', icon: <Wallet size={14} /> },
  { key: 'limits', label: 'سقف‌ها', icon: <ShieldCheck size={14} /> },
  { key: 'advisor', label: 'مشاور پرداخت', icon: <Sparkles size={14} /> },
] as const
type TabKey = (typeof TABS)[number]['key']

export default function ChequesView({ ctx }: { ctx: AppCtx }) {
  const [cheques, setCheques] = useState<Cheque[]>([])
  const [flexRules, setFlexRules] = useState<FlexRuleLite[]>([])
  const [stats, setStats] = useState<ChequeStats | null>(null)
  const [limitsUsage, setLimitsUsage] = useState<LimitRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [payStats, setPayStats] = useState<PaymentStats | null>(null)
  const [limits, setLimits] = useState<LimitRow[]>([])
  const [schedParams, setSchedParams] = useState<SchedParams>(DEFAULT_SCHED_PARAMS)
  const [reps, setReps] = useState<RepLite[]>([])

  const [tab, setTab] = useState<TabKey>('cheques')
  const [createOpen, setCreateOpen] = useState(false)
  const [standaloneOpen, setStandaloneOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [flexOpen, setFlexOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailEdit, setDetailEdit] = useState(false)
  const [editPayment, setEditPayment] = useState<PaymentRow | null>(null)
  const [editLimit, setEditLimit] = useState<LimitRow | null>(null)
  const [sched, setSched] = useState<SchedResult | null>(null)

  const load = () =>
    Promise.all([
      api<{ cheques: Cheque[]; stats?: ChequeStats; limitsUsage?: LimitRow[] }>('/api/cheques?stats=1'),
      api<{ rules: FlexRuleLite[] }>('/api/cheques/flexibility'),
      api<{ payments: PaymentRow[]; stats: PaymentStats }>('/api/payments'),
      api<{ limits: LimitRow[]; params: SchedParams }>('/api/paylimits'),
    ]).then(([c, f, p, l]) => {
      setCheques(c.cheques)
      if (c.stats) setStats(c.stats)
      setLimitsUsage(c.limitsUsage || [])
      setFlexRules(f.rules)
      setPayments(p.payments)
      setPayStats(p.stats)
      setLimits(l.limits)
      if (l.params) setSchedParams(l.params)
    })
  useEffect(() => { load() }, [])

  // نمایندگان (برای انتخاب در چک/پرداخت) — در نبود دسترسی آرشیو، بی‌صدا خالی می‌ماند
  useEffect(() => {
    api<{ reps: RepLite[] }>('/api/sales-reps').then((d) => setReps(d.reps || [])).catch(() => setReps([]))
  }, [])

  const holidays = useHolidays()
  const role = ctx.user!.role
  const canCreate = ['GM', 'OM', 'ACC'].includes(role)
  const canFlex = ['GM', 'OM', 'ACC', 'OWNER'].includes(role)
  const isOwner = role === 'OWNER'
  const isExec = ['OWNER', 'GM', 'OM', 'ADMIN'].includes(role)
  const canStandalone = isExec || role === 'ACC'
  const canLimits = isExec || role === 'PM'
  const detailCheque = cheques.find((c) => c.id === detailId) || null

  // calendar state: month view with per-day cheque totals + selected-day detail
  const now = toJalaliParts(todayIso())
  const [calJy, setCalJy] = useState(now.jy)
  const [calJm, setCalJm] = useState(now.jm)
  const [selDay, setSelDay] = useState<string | null>(null)

  const byDate = useMemo(() => {
    const m = new Map<string, Cheque[]>()
    for (const c of cheques) {
      if (['CLEARED', 'REJECTED', 'RETURNED'].includes(c.status)) continue
      if (!m.has(c.dueDate)) m.set(c.dueDate, [])
      m.get(c.dueDate)!.push(c)
    }
    return m
  }, [cheques])

  const monthTotal = useMemo(() => {
    let sum = 0
    for (const [iso, cs] of byDate) {
      const { jy, jm } = toJalaliParts(iso)
      if (jy === calJy && jm === calJm) sum += cs.reduce((s, c) => s + c.amount, 0)
    }
    return sum
  }, [byDate, calJy, calJm])

  const filtered = cheques.filter((c) => !filter || c.status === filter)

  const act = async (id: string, body: any, msg: string) => {
    try {
      await api(`/api/cheques/${id}`, { method: 'PATCH', body })
      toast.success(msg)
      await load()
      ctx.refreshNotifications()
    } catch (e: any) { toast.error(e.message) }
  }

  const selCheques = selDay ? byDate.get(selDay) || [] : []
  const selFlex = selDay ? resolveFlex(flexRules, selDay) : null
  const selPreview = selDay && sched ? sched.overlay.filter((o) => o.dateIso === selDay) : []

  // کارت‌های آمار — نگارش‌شده / آمادهٔ تحویل / تحویل‌شده / پاس‌شده
  const statCards = stats
    ? [
        { label: 'نگارش‌شده', st: null, val: stats.totalWritten, amount: stats.totalAmount, color: '#77934a', hint: stats.byStatus.PENDING_OWNER ? `${faNum(stats.byStatus.PENDING_OWNER)} در انتظار امضا` : undefined },
        { label: 'آمادهٔ تحویل (امضاشده)', st: 'SIGNED', val: stats.byStatus.SIGNED || 0, amount: stats.waitingPickup.amount, color: '#0e7a4a' },
        { label: 'تحویل‌شده', st: 'DELIVERED', val: stats.byStatus.DELIVERED || 0, amount: stats.delivered.amount, color: '#a04c2a' },
        { label: 'پاس‌شده', st: 'CLEARED', val: stats.byStatus.CLEARED || 0, amount: stats.cleared.amount, color: '#3f6212' },
      ]
    : []

  return (
    <div className="space-y-4">
      {/* ── کارت‌های آمار + نوار سقف‌ها ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((s) => {
          const minis = s.st && stats?.byStatusDue[s.st]
          const miniItems: [string, DueBucket][] = minis
            ? [['امروز', minis.today], ['فردا', minis.tomorrow], ['هفته', minis.week], ['ماه', minis.month]]
            : [['امروز', stats?.dueToday || { count: 0, amount: 0 }], ['فردا', stats?.dueTomorrow || { count: 0, amount: 0 }], ['هفته', stats?.dueThisWeek || { count: 0, amount: 0 }], ['ماه', stats?.dueThisMonth || { count: 0, amount: 0 }]]
          return (
            <div key={s.label} className="glow-card rounded-2xl bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-xl font-black" style={{ color: s.color }}>{faNum(s.val)}</p>
                <p className="text-[10px] font-bold text-muted-foreground">{faMoneyShort(s.amount)}</p>
              </div>
              <p className="mt-0.5 text-xs font-bold">{s.label}</p>
              {s.hint && <p className="text-[10px] text-[#a16207]">{s.hint}</p>}
              <div className="mt-2 grid grid-cols-4 gap-1 border-t border-border/60 pt-1.5 text-center">
                {miniItems.map(([lbl, b]) => (
                  <div key={lbl} title={`${lbl}: ${faMoney(b.amount)} تومان (${faNum(b.count)} فقره)`}>
                    <p className="text-[8.5px] font-bold text-muted-foreground">{lbl}</p>
                    <p className="text-[10px] font-black" style={{ color: b.amount > 0 ? s.color : undefined }}>{b.amount > 0 ? faMoneyShort(b.amount) : '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* نوار سقف‌ها (مصرف دوره جاری) */}
      {limitsUsage.length > 0 && (
        <div className="glow-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-card px-4 py-2.5">
          <span className="flex items-center gap-1 text-[11px] font-black text-[#8a5a2b]"><ShieldCheck size={13} /> سقف‌های فعال</span>
          {limitsUsage.map((l) => {
            const hot = l.overRatio > 90
            return (
              <div key={l.id} className="min-w-[150px] flex-1" title={`${PAY_PERIOD_LABELS[l.period] || l.period} • ${PAY_METHOD_LABELS[l.method] || l.method} • ${faMoney(l.used)} از ${faMoney(l.maxAmount)} تومان`}>
                <div className="flex items-center justify-between text-[9.5px] font-bold">
                  <span>{PAY_PERIOD_LABELS[l.period] || l.period} — {PAY_METHOD_LABELS[l.method] || l.method}</span>
                  <span style={{ color: hot ? '#b3372f' : undefined }}>{faNum(l.overRatio)}٪</span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full transition-all', hot ? 'bg-[#b3372f]' : 'bg-[#0e7a4a]/70')} style={{ width: `${Math.min(100, l.overRatio)}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── تب‌ها ── */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-extrabold transition',
              tab === t.key ? 'bg-primary text-white shadow' : 'border border-border bg-card text-foreground/70 hover:border-[#c9a227]',
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════ تب چک‌ها — تقویم + فهرست (همهٔ قابلیت‌های قبلی) ═══════════ */}
      {tab === 'cheques' && (
        <>
          <div className="grid gap-4 lg:grid-cols-5">
            <SectionCard
              title="تقویم سررسید چک‌ها و پرداخت‌ها"
              subtitle={`جمع سررسیدهای این ماه: ${faMoney(monthTotal)} تومان — روی هر روز بزنید`}
              icon={<CalendarDays size={18} />}
              actions={<SciExplain k="hijrical" />}
              className="lg:col-span-2"
            >
              <div className="flex justify-center [&_[data-cal]]:!w-full">
                <ChequeCalendar
                  byDate={byDate} holidays={holidays} flexRules={flexRules}
                  schedOverlay={sched?.overlay}
                  jy={calJy} jm={calJm} setJy={setCalJy} setJm={setCalJm}
                  selDay={selDay} onPick={(iso: string) => setSelDay(iso === selDay ? null : iso)}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#c9a227]" /> چک</span>
                {sched && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full border border-dashed border-[#b8860b] bg-[#c9a227]/50" /> پیش‌نمایش مشاور پرداخت</span>}
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#b3372f]" /> تعطیل رسمی</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#1c2a22]/30" /> جمعه</span>
              </div>

              {/* selected-day detail */}
              {selDay && (
                <div className="fade-in-up mt-3 rounded-2xl border border-[#c9a227]/40 bg-[#fdf6dd]/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-black">{formatJalaliFull(selDay)}</p>
                      {(() => { const hl = formatHijri(selDay); return hl ? <p className="text-[9px] font-bold text-[#8a6d10]">🌙 هجری: {hl}</p> : null })()}
                    </div>
                    {holidays.get(selDay) && <Pill label={holidays.get(selDay)!} color="#b3372f" bg="#b3372f/10" />}
                    {!holidays.get(selDay) && weekdayName(selDay) === 'جمعه' && <Pill label="جمعه — بانک‌ها تعطیل" color="#b3372f" bg="#b3372f/10" />}
                  </div>
                  {selFlex && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      انعطاف این روز: <span className="font-black text-[#8a5a2b]">±{faNum(selFlex.days)} روز</span>
                      {selFlex.rule && ` — مبنای قانون: ${selFlex.rule.label} (${SCOPE_LABELS[selFlex.rule.scope] || selFlex.rule.scope})`}
                    </p>
                  )}
                  {selPreview.length > 0 && (
                    <p className="mt-1 rounded-lg bg-[#c9a227]/15 px-2 py-1 text-[10.5px] font-bold text-[#8a5a2b]">
                      ✨ پیش‌نمایش مشاور پرداخت: {selPreview.map((p) => `گزینهٔ ${faNum(p.option === 'A' ? 1 : p.option === 'B' ? 2 : 3)} — ${faMoneyShort(p.amount)}`).join(' • ')}
                    </p>
                  )}
                  {selCheques.length === 0 ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">چکی برای این روز ثبت نشده است.</p>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {selCheques.map((c) => (
                        <div key={c.id} className="flex items-center justify-between rounded-xl bg-white/70 px-2.5 py-1.5 text-[11px]">
                          <span className="font-bold">{c.recipientName}</span>
                          <span className="font-black text-[#8a5a2b]">{faMoney(c.amount)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between border-t border-[#c9a227]/30 pt-1.5 text-[11px] font-black">
                        <span>جمع روز</span>
                        <span className="text-[#0e7a4a]">{faMoney(selCheques.reduce((s, c) => s + c.amount, 0))} تومان</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="چک‌ها و پرداخت‌ها"
              subtitle="چرخهٔ کامل: ثبت مدیر کل → برنامه‌ریز سررسید → امضای مالک → تحویل → وصول"
              icon={<Banknote size={18} />}
              className="lg:col-span-3"
              actions={
                <div className="flex gap-1.5">
                  {canFlex && (
                    <button onClick={() => setFlexOpen((v) => !v)} className="flex items-center gap-1.5 rounded-xl border border-[#c9a227]/50 bg-[#fdf6dd]/60 px-3 py-2 text-xs font-extrabold text-[#8a5a2b]">
                      <SlidersHorizontal size={14} /> انعطاف روزها
                    </button>
                  )}
                  {canStandalone && (
                    <button onClick={() => setStandaloneOpen(true)} className="flex items-center gap-1.5 rounded-xl border border-[#0e7a4a]/40 bg-[#0e7a4a]/10 px-3 py-2 text-xs font-extrabold text-[#0e7a4a]">
                      <Plus size={14} /> ثبت چک مستقل
                    </button>
                  )}
                  {canCreate && (
                    <button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-white">
                      <Plus size={14} /> چک جدید
                    </button>
                  )}
                </div>
              }
            >
              {flexOpen && canFlex && <FlexPanel rules={flexRules} onChanged={() => api<{ rules: FlexRuleLite[] }>('/api/cheques/flexibility').then((d) => setFlexRules(d.rules))} />}

              <div className="mb-3 flex flex-wrap gap-1.5">
                <FilterChip active={!filter} label="همه" onClick={() => setFilter('')} />
                {Object.entries(CHEQUE_STATUSES).map(([k, v]) => (
                  <FilterChip key={k} active={filter === k} label={v.label} color={v.color} onClick={() => setFilter(k)} />
                ))}
              </div>
              <div className="scroll-gold max-h-[46vh] space-y-2 overflow-y-auto pl-1">
                {filtered.length === 0 && <EmptyState emoji="🧾" title="چکی ثبت نشده" />}
                {filtered.map((c) => {
                  const st = CHEQUE_STATUSES[c.status]
                  const fx = resolveFlex(flexRules, c.dueDate)
                  return (
                    <div key={c.id} onClick={() => setDetailId(c.id)} className="glow-card cursor-pointer rounded-2xl bg-white/80 p-3.5 transition hover:ring-1 hover:ring-[#c9a227]/50">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-black">
                            چک {c.number ? `شماره ${faNum(c.number)}` : 'بدون شماره'} — {faMoney(c.amount)} تومان
                            {c.selfIssued && <span className="mr-1.5 rounded-md bg-[#c9a227]/20 px-1.5 py-0.5 text-[9px] font-black text-[#8a5a2b]">مستقل</span>}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {c.recipientName} {c.orderCode && `• سفارش ${c.orderCode}`} • سررسید {formatJalaliFull(c.dueDate)} ({faNum(daysBetween(c.dueDate, c.writtenAt))} روز از نگارش)
                          </p>
                          {(c.sayadSerial || c.repName || c.holooReceiptNo) && (
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                              {c.sayadSerial && <span dir="ltr" className="font-mono text-[9.5px]">صیاد: {c.sayadSerial}</span>}
                              {c.repName && <span>👤 {c.repName}</span>}
                              {c.holooReceiptNo && <span>هلو: {faNum(c.holooReceiptNo)}</span>}
                            </p>
                          )}
                        </div>
                        <Pill label={st.label} color={st.color} bg={st.bg} />
                        {(isExec || role === 'ACC' || c.createdById === ctx.user!.id) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDetailId(c.id); setDetailEdit(true) }}
                            title="ویرایش کامل چک — مبلغ، سررسید، وضعیت با دلیل"
                            className="flex items-center gap-1 rounded-lg border border-[#c9a227]/50 bg-[#fdf6dd]/70 px-2 py-1 text-[10px] font-black text-[#8a5a2b] hover:border-[#c9a227]"
                          >
                            <Pencil size={11} /> ویرایش
                          </button>
                        )}
                      </div>
                      {(c.isFriday || holidays.get(c.dueDate)) && !['CLEARED', 'REJECTED'].includes(c.status) && (
                        <p className="mt-1.5 rounded-lg bg-[#b3372f]/10 px-2 py-1 text-[11px] font-black text-[#b3372f]">
                          ⚠️ سررسید روی روز تعطیل است ({holidays.get(c.dueDate) || 'جمعه'}) — هنگام امضا اصلاح شود
                          {fx.days > 0 && ` — پنجرهٔ مجاز جابه‌جایی: ±${faNum(fx.days)} روز`}
                        </p>
                      )}
                      {c.status === 'SIGNED' && ['GM', 'ACC'].includes(role) && (
                        <button onClick={(e) => { e.stopPropagation(); act(c.id, { action: 'deliver', detail: ctx.user!.name }, 'چک تحویل شد — وصول را پیگیری کنید 🤝') }} className="mt-2 flex items-center gap-1 rounded-lg bg-[#a04c2a]/10 px-3 py-1.5 text-[11px] font-black text-[#a04c2a]">
                          <Handshake size={13} /> تحویل به نماینده
                        </button>
                      )}
                      {c.status === 'DELIVERED' && ['OWNER', 'ACC', 'GM'].includes(role) && (
                        <div className="mt-2 flex gap-1.5">
                          <button onClick={(e) => { e.stopPropagation(); act(c.id, { action: 'clear' }, 'چک پاس شد ✅') }} className="flex items-center gap-1 rounded-lg bg-[#3f6212]/10 px-3 py-1.5 text-[11px] font-black text-[#3f6212]">
                            <CheckCircle2 size={13} /> وصول شد
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); act(c.id, { action: 'bounce' }, 'برگشتی ثبت شد') }} className="flex items-center gap-1 rounded-lg bg-[#b3372f]/10 px-3 py-1.5 text-[11px] font-black text-[#b3372f]">
                            <AlertTriangle size={13} /> برگشت خورد
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </SectionCard>
          </div>

          {/* Owner panel */}
          {isOwner && (
            <SectionCard title="دسترسی مالک — امضا و تصمیم" subtitle="چک‌های پیشنهادی مدیر کل اینجاست؛ می‌توانید تاریخ را با پنجرهٔ انعطاف عوض کنید یا به چند چک بشکنید" icon={<CheckCircle2 size={18} />}>
              {cheques.filter((c) => c.status === 'PENDING_OWNER').length === 0 ? (
                <EmptyState emoji="✅" title="چکی در انتظار امضای شما نیست" />
              ) : (
                <div className="space-y-3">
                  {cheques.filter((c) => c.status === 'PENDING_OWNER').map((c) => (
                    <div key={c.id} className="rounded-2xl border border-[#c9a227]/40 bg-[#fdf6dd]/40 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-black">{faMoney(c.amount)} تومان → {c.recipientName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {c.recipientPhone && `${faNum(c.recipientPhone)} • `}
                            نوشته: {formatJalaliShort(c.writtenAt)} • سررسید پیشنهادی: {formatJalaliFull(c.dueDate)} ({faNum(c.periodDays)} روز)
                            {c.orderCode && ` • سفارش ${c.orderCode}`}
                          </p>
                          {(c.isFriday || holidays.get(c.dueDate)) && (
                            <p className="mt-1 text-[11px] font-black text-[#b3372f]">⚠️ سررسید پیشنهادی روی تعطیل است — تاریخ را اصلاح کنید</p>
                          )}
                        </div>
                        <OwnerActions cheque={c} holidays={holidays} flexRules={flexRules} act={act} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}
        </>
      )}

      {/* ═══════════ تب پرداخت‌ها ═══════════ */}
      {tab === 'payments' && (
        <SectionCard
          title="پرداخت‌های غیرچکی"
          subtitle="نقدی، کارت‌خوان، کارت به کارت — ثبت مستقل یا متصل به سفارش، با نمایندهٔ طرف‌حساب و رسید هلو"
          icon={<Wallet size={18} />}
          actions={
            canStandalone && (
              <button onClick={() => setPayOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-white">
                <Plus size={14} /> ثبت پرداخت
              </button>
            )
          }
        >
          {payStats && (
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { l: 'تعداد پرداخت‌ها', v: faNum(payStats.count), c: '#77934a' },
                { l: 'جمع کل', v: faMoneyShort(payStats.total), c: '#0e7a4a' },
                { l: 'امروز', v: `${faMoneyShort(payStats.today.amount)} (${faNum(payStats.today.count)})`, c: '#a04c2a' },
                { l: 'این ماه', v: `${faMoneyShort(payStats.month.amount)} (${faNum(payStats.month.count)})`, c: '#8a5a2b' },
              ].map((s) => (
                <div key={s.l} className="rounded-2xl bg-muted/40 p-3 text-center">
                  <p className="text-base font-black" style={{ color: s.c }}>{s.v}</p>
                  <p className="text-[10px] font-bold text-muted-foreground">{s.l}</p>
                </div>
              ))}
            </div>
          )}
          <div className="scroll-gold max-h-[52vh] space-y-2 overflow-y-auto pl-1">
            {payments.length === 0 && <EmptyState emoji="💸" title="پرداختی ثبت نشده" hint="با دکمهٔ «ثبت پرداخت» اولین پرداخت نقدی/کارت‌خوان را ثبت کنید" />}
            {payments.map((p) => {
              const km = PAY_KIND_META[p.kind] || PAY_KIND_META.OTHER
              return (
                <div key={p.id} className="glow-card rounded-2xl bg-white/80 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-black">
                        {km.icon} {faMoney(p.amount)} تومان <span className="text-xs font-bold" style={{ color: km.color }}>({km.label})</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {p.providerName || 'بدون طرف‌حساب'} {p.orderCode && `• سفارش ${p.orderCode}`} • {formatJalaliFull(p.paidAt)}
                      </p>
                      {(p.repName || p.holooReceiptNo || p.note) && (
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                          {p.repName && <span>👤 {p.repName}</span>}
                          {p.holooReceiptNo && <span>هلو: {faNum(p.holooReceiptNo)}</span>}
                          {p.note && <span>📝 {p.note}</span>}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill label={km.label} color={km.color} />
                      {(isExec || role === 'ACC' || p.createdById === ctx.user!.id) && (
                        <button
                          onClick={() => setEditPayment(p)}
                          className="flex items-center gap-1 rounded-lg border border-[#c9a227]/50 bg-[#fdf6dd]/70 px-2.5 py-1.5 text-[10.5px] font-black text-[#8a5a2b] hover:border-[#c9a227]"
                        >
                          <Pencil size={12} /> ویرایش
                        </button>
                      )}
                      {(p.createdById === ctx.user!.id || isExec) && (
                        <button
                          onClick={() => { if (confirm('این پرداخت حذف شود؟')) api(`/api/payments?id=${p.id}`, { method: 'DELETE' }).then(() => { toast.success('پرداخت حذف شد'); load() }).catch((e) => toast.error(e.message)) }}
                          className="flex items-center gap-1 rounded-lg bg-[#b3372f]/10 px-2.5 py-1.5 text-[10.5px] font-black text-[#b3372f]"
                        >
                          <Trash2 size={12} /> حذف
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}

      {/* ═══════════ تب سقف‌ها ═══════════ */}
      {tab === 'limits' && (
        canLimits ? (
          <LimitsPanel limits={limits} params={schedParams} onChanged={load} onEditLimit={(l) => setEditLimit(l)} />
        ) : (
          <EmptyState emoji="🔐" title="تنظیم سقف‌ها مخصوص مالک و مدیران است" hint="سقف‌های هزینه‌کرد پرداخت فقط با دسترسی «تعیین سقف هزینه‌کرد» قابل ویرایش است — اما در کارت‌های بالا مصرفشان را می‌بینید." />
        )
      )}

      {/* ═══════════ تب مشاور پرداخت ═══════════ */}
      {tab === 'advisor' && (
        <AdvisorPanel
          params={schedParams}
          limits={limitsUsage}
          holidays={holidays}
          role={role}
          canApply={canStandalone}
          onApplied={() => { load(); ctx.refreshNotifications() }}
        />
      )}

      {/* ── مودال‌ها ── */}
      {createOpen && (
        <ChequeCreateModal
          holidays={holidays} flexRules={flexRules}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); load(); ctx.refreshNotifications() }}
        />
      )}
      {standaloneOpen && (
        <StandaloneChequeModal
          holidays={holidays} reps={reps} isOwnerSigner={['OWNER', 'ADMIN'].includes(role)}
          onClose={() => setStandaloneOpen(false)}
          onSaved={() => { setStandaloneOpen(false); load(); ctx.refreshNotifications() }}
        />
      )}
      {payOpen && (
        <PaymentModal
          holidays={holidays} reps={reps}
          onClose={() => setPayOpen(false)}
          onSaved={() => { setPayOpen(false); load(); ctx.refreshNotifications() }}
        />
      )}
      {detailCheque && (
        <ChequeDetailModal
          cheque={detailCheque} holidays={holidays} reps={reps}
          canEdit={detailCheque.createdById === ctx.user!.id || isExec || role === 'ACC'}
          startInEdit={detailEdit}
          onClose={() => { setDetailId(null); setDetailEdit(false) }}
          onSaved={() => { setDetailEdit(false); load(); ctx.refreshNotifications() }}
        />
      )}
      {editPayment && (
        <PaymentEditModal
          payment={editPayment} reps={reps} holidays={holidays}
          onClose={() => setEditPayment(null)}
          onSaved={() => { setEditPayment(null); load(); ctx.refreshNotifications() }}
        />
      )}
      {editLimit && (
        <PayLimitEditModal
          limit={editLimit}
          onClose={() => setEditLimit(null)}
          onSaved={() => { setEditLimit(null); load() }}
        />
      )}
    </div>
  )
}

function FilterChip({ active, label, onClick, color }: { active: boolean; label: string; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick} className={cn('rounded-full border px-3 py-1.5 text-[11px] font-bold transition', active ? 'border-transparent text-white' : 'border-border bg-card text-foreground/70')} style={active ? { background: color || '#0e7a4a' } : {}}>
      {label}
    </button>
  )
}

/** month calendar with per-day amounts + click-to-detail (+ schedule preview dots) */
function ChequeCalendar({ byDate, holidays, flexRules, schedOverlay, jy, jm, setJy, setJm, selDay, onPick }: any) {
  const cells: (number | null)[] = []
  const len = jMonthLength(jy, jm)
  const start = jMonthStartWeekday(jy, jm)
  for (let i = 0; i < start; i++) cells.push(null)
  for (let d = 1; d <= len; d++) cells.push(d)
  const move = (dir: number) => {
    let m = jm + dir, y = jy
    if (m > 12) { m = 1; y++ }
    if (m < 1) { m = 12; y-- }
    setJm(m); setJy(y)
  }
  const previewByDate = useMemo(() => {
    const m = new Map<string, { amount: number; opts: Set<string> }>()
    for (const o of schedOverlay || []) {
      const cur = m.get(o.dateIso) || { amount: 0, opts: new Set<string>() }
      cur.amount += o.amount
      cur.opts.add(o.option)
      m.set(o.dateIso, cur)
    }
    return m
  }, [schedOverlay])
  return (
    <div className="w-full max-w-[340px]" style={calFontStyle()}>
      <div className="mb-2 flex items-center justify-between">
        <button onClick={() => move(1)} className="rounded-lg px-2 py-1 hover:bg-muted">›</button>
        <span className="text-sm font-extrabold">{J_MONTHS[jm - 1]} {faNum(jy)}</span>
        <button onClick={() => move(-1)} className="rounded-lg px-2 py-1 hover:bg-muted">‹</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center font-bold text-muted-foreground" style={{ fontSize: 'var(--cal-font, 13px)' }}>
        {WEEKDAY_SHORT.map((d, i) => <span key={i} className={cn(i === 6 && 'text-[#b3372f]')}>{d}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1" style={{ fontSize: 'var(--cal-font, 13px)' }}>
        {cells.map((d, i) => {
          if (d === null) return <span key={i} />
          const iso = jalaliToIso(jy, jm, d)
          const cheques = byDate.get(iso) || []
          const hol = holidays.get(iso)
          const fri = new Date(iso + 'T12:00:00').getDay() === 5
          const dayTotal = cheques.reduce((s: number, c: Cheque) => s + c.amount, 0)
          const preview = previewByDate.get(iso)
          const isSel = selDay === iso
          let hijriTiny = ''
          try { hijriTiny = faNum(isoToHijri(iso).hd) } catch { /* ignore */ }
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(iso)}
              title={[
                formatJalaliFull(iso),
                formatHijri(iso) && `هجری: ${formatHijri(iso)}`,
                hol && `تعطیل رسمی: ${hol}`,
                cheques.map((c: Cheque) => `${c.recipientName}: ${faMoney(c.amount)}`).join('\n'),
                preview && `پیش‌نمایش مشاور (${Array.from(preview.opts).map((o) => faNum(o === 'A' ? 1 : o === 'B' ? 2 : 3)).join('+')}): ${faMoney(preview.amount)}`,
              ].filter(Boolean).join(' • ')}
              className={cn(
                'relative flex h-11 w-full flex-col items-center justify-center rounded-lg font-bold transition',
                isSel ? 'ring-2 ring-[#c9a227]' : '',
                cheques.length ? 'bg-[#c9a227]/20 ring-1 ring-[#c9a227]/70' : preview ? 'bg-[#c9a227]/10 ring-1 ring-dashed ring-[#b8860b]/60' : hol ? 'bg-[#b3372f]/8 text-[#b3372f]' : 'hover:bg-muted',
                (hol || fri) && !cheques.length && 'text-[#b3372f]/70',
              )}
            >
              <span>{faNum(d)}</span>
              {hijriTiny && (
                <span className="absolute left-1 top-0.5 text-[6.5px] font-bold leading-none text-muted-foreground/70">{hijriTiny}</span>
              )}
              {preview && (
                <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full border border-dashed border-[#b8860b] bg-[#c9a227]/60" title={`پیش‌نمایش: ${faMoney(preview.amount)}`} />
              )}
              {cheques.length > 0 && <span className="text-[8px] font-black leading-none text-[#8a5a2b]">{faMoneyShort(dayTotal)}</span>}
              {cheques.length === 0 && hol && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-[#b3372f]" />}
              {cheques.length === 0 && !hol && fri && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-[#1c2a22]/30" />}
            </button>
          )
        })}
      </div>
      <p className="mt-1 text-center text-[8.5px] text-muted-foreground">عدد کوچک گوشهٔ هر خانه = روز هجری قمری (تبدیل واقعی) — نقطهٔ خط‌چین طلایی = پیش‌نمایش مشاور</p>
    </div>
  )
}

/** Alternative-date strip: working-day candidates within the flexibility window */
function AltDates({ nominalDue, writtenAt, holidays, flexRules, onPick, selected }: {
  nominalDue: string; writtenAt: string; holidays: Map<string, string>; flexRules: FlexRuleLite[]
  onPick: (iso: string) => void; selected: string
}) {
  const fx = resolveFlex(flexRules, nominalDue)
  const alts = dueAlternatives(nominalDue, writtenAt, holidays, fx.days)
  if (fx.days === 0 && alts.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        پنجرهٔ انعطاف این روز صفر است — سررسید باید دقیقاً روی {formatJalaliFull(nominalDue)} بنشیند.
      </p>
    )
  }
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-black text-[#8a5a2b]">
        <Sparkles size={12} /> تاریخ‌های جایگزین مجاز (پنجرهٔ ±{faNum(fx.days)} روز
        {fx.rule && ` — قانون: ${fx.rule.label}`}):
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onPick(nominalDue)}
          className={cn(
            'rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition',
            selected === nominalDue ? 'border-transparent bg-[#0e7a4a] text-white' : 'border-border bg-card hover:border-[#c9a227]',
          )}
        >
          خودِ {faNum(daysBetween(nominalDue, writtenAt))} روز — {wdShort(nominalDue)} {formatJalaliShort(nominalDue)}
        </button>
        {alts.map((a) => (
          <button
            key={a.iso}
            type="button"
            onClick={() => onPick(a.iso)}
            className={cn(
              'rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition',
              selected === a.iso
                ? 'border-transparent bg-[#0e7a4a] text-white'
                : a.working
                  ? 'border-[#0e7a4a]/30 bg-[#0e7a4a]/5 text-[#0e7a4a] hover:border-[#0e7a4a]'
                  : 'border-[#b3372f]/30 bg-[#b3372f]/5 text-[#b3372f]/80 hover:border-[#b3372f]',
            )}
            title={a.working ? 'روز کاری' : a.holidayTitle || 'جمعه — تعطیل'}
          >
            {faNum(a.actualDays)} روز — {a.weekday} {formatJalaliShort(a.iso)}
            {!a.working && ' ⚠️'}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Flexibility rules management panel (treasury tolerance editor) */
function FlexPanel({ rules, onChanged }: { rules: FlexRuleLite[]; onChanged: () => void }) {
  const [scope, setScope] = useState<'GLOBAL' | 'YEAR' | 'SEASON' | 'MONTH' | 'WEEK' | 'DAY'>('MONTH')
  const [days, setDays] = useState('2')
  const [note, setNote] = useState('')
  const [jy, setJy] = useState(toJalaliParts(todayIso()).jy)
  const [jm, setJm] = useState(toJalaliParts(todayIso()).jm)
  const [season, setSeason] = useState('1')
  const [dayIso, setDayIso] = useState(todayIso())
  const [busy, setBusy] = useState(false)

  const dateKey =
    scope === 'GLOBAL' ? '*' :
    scope === 'YEAR' ? String(jy) :
    scope === 'SEASON' ? `${jy}-S${season}` :
    scope === 'MONTH' ? `${jy}-${String(jm).padStart(2, '0')}` :
    scope === 'WEEK' ? weekStartIso(dayIso) :
    dayIso

  const scopeDesc =
    scope === 'YEAR' ? `${faNum(jy)}` :
    scope === 'SEASON' ? `${SEASON_NAMES[Number(season) - 1]} ${faNum(jy)}` :
    scope === 'MONTH' ? `${J_MONTHS[jm - 1]} ${faNum(jy)}` :
    scope === 'WEEK' ? `هفتهٔ آغازِ ${formatJalaliShort(weekStartIso(dayIso))}` :
    scope === 'DAY' ? formatJalaliShort(dayIso) : 'همهٔ روزها'

  const save = async () => {
    setBusy(true)
    try {
      await api('/api/cheques/flexibility', {
        method: 'POST',
        body: { scope, dateKey, days: Number(days) || 0, note, label: scopeDesc },
      })
      toast.success('قانون انعطاف ذخیره شد')
      onChanged()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  const remove = async (id: string) => {
    try {
      await api(`/api/cheques/flexibility?id=${id}`, { method: 'DELETE' })
      toast.success('قانون حذف شد')
      onChanged()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div className="fade-in-up mb-4 rounded-2xl border border-[#c9a227]/40 bg-[#fdf6dd]/40 p-4">
      <p className="flex items-center gap-1.5 text-xs font-black text-[#8a5a2b]">
        <SlidersHorizontal size={14} /> سطح انعطاف روزهای پرداخت
        <SciExplain k="flexdays" />
      </p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
        برای هر بازهٔ زمانی مشخص کنید سررسید چک‌ها چند روز قابل جابه‌جایی است. قانون دقیق‌تر همیشه بر قانون کلی‌تر مقدم است (روز ← هفته ← ماه ← فصل ← سال ← سراسری).
      </p>

      {/* existing rules */}
      <div className="scroll-gold mt-3 max-h-40 space-y-1.5 overflow-y-auto pl-1">
        {rules.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-1.5 text-[11px]">
            <span className="font-bold">
              <span className="rounded-md bg-[#c9a227]/15 px-1.5 py-0.5 text-[9px] font-black text-[#8a5a2b]">{SCOPE_LABELS[r.scope] || r.scope}</span>
              {' '}{r.label} {r.note && <span className="text-muted-foreground">— {r.note}</span>}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-black text-[#0e7a4a]">±{faNum(r.days)} روز</span>
              {r.scope !== 'GLOBAL' && (
                <button onClick={() => remove(r.id)} className="text-[10px] font-black text-[#b3372f] hover:underline">حذف</button>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* editor */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Labeled label="سطح قانون">
          <select value={scope} onChange={(e) => setScope(e.target.value as any)} className="w-full rounded-xl border border-input bg-white p-2.5 text-sm">
            {Object.entries(SCOPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Labeled>
        <Labeled label="مقدار انعطاف (± روز)">
          <FaPriceInput value={days === '' ? '' : Number(days)} onChange={(v) => setDays(v === '' ? '0' : String(v))} ariaLabel="مقدار انعطاف" className="w-full rounded-xl border border-input p-2.5 text-sm" />
        </Labeled>
        {scope !== 'GLOBAL' && scope !== 'DAY' && scope !== 'WEEK' && (
          <Labeled label="سال شمسی">
            <FaPriceInput value={jy} onChange={(v) => setJy(Number(v) || jy)} ariaLabel="سال شمسی" className="w-full rounded-xl border border-input p-2.5 text-sm" />
          </Labeled>
        )}
        {scope === 'SEASON' && (
          <Labeled label="فصل">
            <select value={season} onChange={(e) => setSeason(e.target.value)} className="w-full rounded-xl border border-input bg-white p-2.5 text-sm">
              {SEASON_NAMES.map((s, i) => <option key={s} value={String(i + 1)}>{s}</option>)}
            </select>
          </Labeled>
        )}
        {scope === 'MONTH' && (
          <Labeled label="ماه">
            <select value={jm} onChange={(e) => setJm(Number(e.target.value))} className="w-full rounded-xl border border-input bg-white p-2.5 text-sm">
              {J_MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
            </select>
          </Labeled>
        )}
        {(scope === 'WEEK' || scope === 'DAY') && (
          <Labeled label={scope === 'WEEK' ? 'هر روزی از هفتهٔ هدف' : 'روز دقیق'}>
            <JalaliDatePicker value={dayIso} onChange={setDayIso} holidays={new Map()} />
          </Labeled>
        )}
        <Labeled label="توضیح (اختیاری)">
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-xl border border-input p-2.5 text-sm" placeholder="مثلاً: فصل فروش بالا، تسویه سخت‌گیرانه" />
        </Labeled>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        کلید این قانون: <span className="font-black text-[#8a5a2b]" dir="ltr">{dateKey}</span> — پوشش: {flexScopeDesc({ id: '', scope, label: '', dateKey, days: 0 } as any)}
      </p>
      <button onClick={save} disabled={busy} className="mt-2 w-full rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white disabled:opacity-50">
        ذخیرهٔ قانون
      </button>
    </div>
  )
}

/** Owner actions: sign (with editable date + alternatives), reject, split */
function OwnerActions({ cheque, holidays, flexRules, act }: { cheque: Cheque; holidays: any; flexRules: FlexRuleLite[]; act: (id: string, body: any, msg: string) => void }) {
  const [open, setOpen] = useState<'sign' | 'split' | null>(null)
  const [number, setNumber] = useState('')
  const [dueDate, setDueDate] = useState(cheque.dueDate)
  const [parts, setParts] = useState([{ amount: String(cheque.amount), dueDate: cheque.dueDate }])

  const pickedIsOff = !!holidays.get(dueDate) || new Date(dueDate + 'T12:00:00').getDay() === 5

  return (
    <div className="flex flex-wrap gap-1.5">
      <button onClick={() => setOpen('sign')} className="flex items-center gap-1 rounded-lg bg-[#0e7a4a] px-3 py-1.5 text-[11px] font-black text-white">
        <CheckCircle2 size={13} /> امضا و تأیید
      </button>
      <button onClick={() => setOpen('split')} className="flex items-center gap-1 rounded-lg bg-[#8a5a2b]/15 px-3 py-1.5 text-[11px] font-black text-[#8a5a2b]">
        <Scissors size={13} /> تفکیک به چند چک
      </button>
      <button onClick={() => act(cheque.id, { action: 'reject' }, 'چک رد شد — مدیر کل مطلع می‌شود')} className="flex items-center gap-1 rounded-lg bg-[#b3372f]/10 px-3 py-1.5 text-[11px] font-black text-[#b3372f]">
        <XCircle size={13} /> رد
      </button>

      {open === 'sign' && (
        <Modal title="امضای چک" onClose={() => setOpen(null)}>
          <KeyValue k="مبلغ" v={`${faMoney(cheque.amount)} تومان`} />
          <KeyValue k="گیرنده" v={cheque.recipientName} />
          {cheque.sayadSerial && <KeyValue k="سریال صیاد" v={<span dir="ltr" className="font-mono text-xs">{cheque.sayadSerial}</span>} />}
          <Labeled label="شماره چک (اختیاری)"><input value={number} onChange={(e) => setNumber(e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" dir="ltr" /></Labeled>
          <Labeled label="تاریخ سررسید نهایی (قابل اصلاح)">
            <JalaliDatePicker value={dueDate} onChange={setDueDate} holidays={holidays} minDate={todayIso()} warnHoliday />
          </Labeled>
          <div className="mt-2 rounded-2xl border border-[#c9a227]/30 bg-[#fdf6dd]/50 p-3">
            <AltDates nominalDue={cheque.dueDate} writtenAt={cheque.writtenAt} holidays={holidays} flexRules={flexRules} onPick={setDueDate} selected={dueDate} />
          </div>
          <button
            onClick={() => { act(cheque.id, { action: 'sign', number, dueDate, note: 'امضا توسط مالک' }, 'چک امضا شد ✅ — مدیر کل می‌تواند تحویل دهد'); setOpen(null) }}
            className="w-full rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white"
          >
            ثبت امضا ✍️
          </button>
        </Modal>
      )}

      {open === 'split' && (
        <Modal title="تفکیک مبلغ به چند چک" onClose={() => setOpen(null)}>
          {parts.map((p, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <Labeled label={`مبلغ بخش ${faNum(i + 1)}`}>
                <FaPriceInput value={p.amount === '' ? '' : Number(p.amount)} onChange={(v) => setParts((ps) => ps.map((x, j) => (j === i ? { ...x, amount: v === '' ? '' : String(v) } : x)))} ariaLabel={`مبلغ بخش ${faNum(i + 1)}`} className="w-full rounded-xl border border-input p-2.5 text-sm" />
              </Labeled>
              <Labeled label="سررسید">
                <JalaliDatePicker value={p.dueDate} onChange={(v) => setParts((ps) => ps.map((x, j) => (j === i ? { ...x, dueDate: v } : x)))} holidays={holidays} warnHoliday />
              </Labeled>
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setParts((ps) => [...ps, { amount: '0', dueDate: addDaysIso(30) }])} className="flex-1 rounded-xl border py-2 text-xs font-bold">+ بخش جدید</button>
            {parts.length > 1 && <button onClick={() => setParts((ps) => ps.slice(0, -1))} className="rounded-xl border py-2 text-xs font-bold text-[#b3372f]">− حذف آخرین</button>}
          </div>
          {(() => {
            const sum = parts.reduce((s, p) => s + (Number(p.amount) || 0), 0)
            const ok = sum === cheque.amount
            return (
              <p className="text-[11px]">
                جمع: <span className={ok ? 'split-sum-ok font-black' : 'split-sum-bad'}>{faMoney(sum)}</span>
                {' '}/ {faMoney(cheque.amount)}
                {!ok && <span className='text-[10px] text-muted-foreground'> — جمع باید دقیقاً برابر مبلغ چک باشد</span>}
              </p>
            )
          })()}
          <button
            onClick={() => act(cheque.id, { action: 'split', parts, number: number || undefined }, `به ${faNum(parts.length)} چک تفکیک شد ✂️`)}
            className="w-full rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white"
          >
            ثبت تفکیک ✂️
          </button>
        </Modal>
      )}
    </div>
  )
}

/** GM create cheque — due-date planner with alternatives + flexibility awareness */
function ChequeCreateModal({ holidays, flexRules, onClose, onSaved }: {
  holidays: any; flexRules: FlexRuleLite[]; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({ amount: '', recipientName: '', recipientPhone: '', orderId: '', orderCode: '' })
  const [writtenAt, setWrittenAt] = useState(todayIso())
  const [periodDays, setPeriodDays] = useState('45')
  const [pickedDue, setPickedDue] = useState<string | null>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ orders: any[] }>('/api/orders').then((d) => setOrders(d.orders.filter((o) => !['DONE', 'CANCELLED'].includes(o.status))))
  }, [])

  const nominalDue = addDaysIso(Number(periodDays) || 0, writtenAt)
  const chosenDue = pickedDue || nominalDue
  const chosenDays = Math.max(0, daysBetween(chosenDue, writtenAt))
  const nominalOff = !!holidays.get(nominalDue) || new Date(nominalDue + 'T12:00:00').getDay() === 5
  const chosenOff = !!holidays.get(chosenDue) || new Date(chosenDue + 'T12:00:00').getDay() === 5
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  // when the base date or period changes, reset manual pick
  const resetPick = () => setPickedDue(null)
  useEffect(() => { resetPick() }, [writtenAt, periodDays])

  const save = async () => {
    if (!form.amount || !form.recipientName) return toast.error('مبلغ و نام گیرنده الزامی است')
    if (chosenOff) return toast.error('سررسید انتخابی روی تعطیل است — یکی از تاریخ‌های کاری را انتخاب کنید')
    setBusy(true)
    try {
      const res = await api<{ warnings: string[] }>('/api/cheques', {
        method: 'POST',
        body: { ...form, amount: Number(form.amount), writtenAt, dueDate: chosenDue, periodDays: chosenDays },
      })
      res.warnings?.forEach((w) => toast.warning(w))
      toast.success('چک ثبت شد — در انتظار امضای مالک ✍️')
      onSaved()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title="ثبت چک جدید — برنامه‌ریز سررسید" onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="مبلغ (تومان) *"><FaPriceInput value={form.amount === '' ? '' : Number(form.amount)} onChange={(v) => set('amount', v === '' ? '' : String(v))} ariaLabel="مبلغ چک" className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="گیرنده چک *"><input value={form.recipientName} onChange={(e) => set('recipientName', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" placeholder="نام نماینده/شرکت" /></Labeled>
        <Labeled label="تلفن گیرنده"><input value={form.recipientPhone} onChange={(e) => set('recipientPhone', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" dir="ltr" /></Labeled>
        <Labeled label="متصل به سفارش (اختیاری)">
          <select value={form.orderId} onChange={(e) => { const o = orders.find((x) => x.id === e.target.value); setForm((f) => ({ ...f, orderId: e.target.value, orderCode: o?.code || '' })) }} className="w-full rounded-xl border border-input bg-white p-3 text-sm">
            <option value="">— بدون اتصال —</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.code} — {o.providerName}</option>)}
          </select>
        </Labeled>
        <Labeled label="تاریخ نگارش چک (پیش‌فرض امروز)">
          <JalaliDatePicker value={writtenAt} onChange={setWrittenAt} holidays={holidays} warnHoliday={false} />
        </Labeled>
        <Labeled label="حداکثر مهلت (روز) — سررسید خودکار محاسبه می‌شود">
          <div className="flex flex-wrap gap-1.5">
            {[30, 40, 45, 60, 90].map((d) => (
              <button key={d} type="button" onClick={() => setPeriodDays(String(d))} className={Number(periodDays) === d ? 'rounded-full bg-primary px-3 py-1.5 text-[11px] font-black text-white' : 'rounded-full border px-3 py-1.5 text-[11px] font-bold'}>
                {faNum(d)} روز
              </button>
            ))}
            <FaPriceInput value={periodDays === '' ? '' : Number(periodDays)} onChange={(v) => setPeriodDays(v === '' ? '0' : String(v))} ariaLabel="مهلت به روز" className="w-16 rounded-xl border border-input p-2 text-xs" />
          </div>
        </Labeled>
      </div>

      {/* planner output */}
      <div className={cn('mt-3 rounded-2xl border p-3.5', nominalOff ? 'border-[#b3372f]/40 bg-[#b3372f]/5' : 'border-[#c9a227]/40 bg-[#fdf6dd]/50')}>
        <p className="flex items-center gap-1.5 text-xs font-black">
          <CalendarCheck size={14} className="text-[#8a5a2b]" />
          سررسید حداکثری محاسبه‌شده: {formatJalaliFull(nominalDue)} ({faNum(periodDays || 0)} روز)
        </p>
        {nominalOff ? (
          <p className="mt-1 text-[11px] font-black text-[#b3372f]">
            ⚠️ این روز غیرکاری است ({holidays.get(nominalDue) || 'جمعه'}) — اعتبار چک حفظ نمی‌شود. یکی از تاریخ‌های جایگزین کاری را انتخاب کنید:
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">این روز کاری است و چک را می‌توان همان‌جا سررسید داد؛ در صورت نیاز از جایگزین‌ها استفاده کنید.</p>
        )}
        <div className="mt-2.5">
          <AltDates nominalDue={nominalDue} writtenAt={writtenAt} holidays={holidays} flexRules={flexRules} onPick={setPickedDue} selected={chosenDue} />
        </div>
        <div className="mt-2.5 rounded-xl bg-white/70 px-3 py-2 text-[11px]">
          تاریخ نهایی انتخاب‌شده: <span className="font-black text-[#0e7a4a]">{formatJalaliFull(chosenDue)}</span>
          {' '}— معادل {faNum(chosenDays)} روز از تاریخ نگارش{pickedDue && chosenDue !== nominalDue ? ' — اصلاح‌شده از سررسید حداکثری' : ''}
          {chosenOff && <span className="font-black text-[#b3372f]"> — ⚠️ روز تعطیل، ثبت مجاز نیست</span>}
        </div>
      </div>

      <button onClick={save} disabled={busy || chosenOff} className="w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : 'ثبت و ارسال برای امضای مالک'}
      </button>
    </Modal>
  )
}

/* ═══════════════════════ ۱۴-۵الف: چک و پرداخت ۲٫۰ ═══════════════════════ */

/** انتخاب نماینده — اگر فهرست نمایندگان در دسترس نبود، تایپ آزاد */
function RepSelect({ reps, value, onChange }: { reps: RepLite[]; value: { repId: string; repName: string }; onChange: (v: { repId: string; repName: string }) => void }) {
  if (reps.length === 0) {
    return <input value={value.repName} onChange={(e) => onChange({ repId: '', repName: e.target.value })} className="w-full rounded-xl border border-input p-3 text-sm" placeholder="نام نمایندهٔ طرف‌حساب (اختیاری)" />
  }
  return (
    <select
      value={value.repId}
      onChange={(e) => { const r = reps.find((x) => x.id === e.target.value); onChange({ repId: e.target.value, repName: r?.fullName || '' }) }}
      className="w-full rounded-xl border border-input bg-white p-3 text-sm"
    >
      <option value="">— بدون نماینده —</option>
      {reps.map((r) => <option key={r.id} value={r.id}>{r.fullName}{r.providerName ? ` — ${r.providerName}` : ''}</option>)}
    </select>
  )
}

/** مودال ثبت چک مستقل — مالک/مدیران؛ مالک و مدیر سامانه مستقیم «امضاشده» ثبت می‌شود */
function StandaloneChequeModal({ holidays, reps, isOwnerSigner, onClose, onSaved }: {
  holidays: Map<string, string>; reps: RepLite[]; isOwnerSigner: boolean; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({ number: '', amount: '', recipientName: '', recipientPhone: '', dueDate: '', sayadSerial: '', holooReceiptNo: '' })
  const [rep, setRep] = useState({ repId: '', repName: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const dueOff = form.dueDate ? !!holidays.get(form.dueDate) || new Date(form.dueDate + 'T12:00:00').getDay() === 5 : false

  const save = async () => {
    if (!form.amount || !form.recipientName || !form.dueDate) return toast.error('مبلغ، گیرنده و تاریخ سررسید الزامی است')
    if (dueOff) return toast.error('سررسید روی تعطیل است — روز کاری دیگری انتخاب کنید (مادهٔ ۳۱۵)')
    setBusy(true)
    try {
      const res = await api<{ warnings: string[] }>('/api/cheques', {
        method: 'POST',
        body: {
          selfIssued: true,
          number: form.number,
          amount: Number(form.amount),
          recipientName: form.recipientName,
          recipientPhone: form.recipientPhone,
          dueDate: form.dueDate,
          writtenAt: todayIso(),
          periodDays: daysBetween(form.dueDate, todayIso()),
          sayadSerial: form.sayadSerial,
          holooReceiptNo: form.holooReceiptNo,
          repId: rep.repId,
          repName: rep.repName,
        },
      })
      res.warnings?.forEach((w) => toast.warning(w))
      toast.success(isOwnerSigner ? 'چک مستقل ثبت و امضا شد ✍️ — آمادهٔ تحویل' : 'چک مستقل ثبت شد — در انتظار امضای مالک')
      onSaved()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title="ثبت چک مستقل — بدون سفارش" onClose={onClose} wide>
      <p className="mb-2 rounded-xl bg-[#fdf6dd]/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        چک مستقل به سفارشی متصل نیست — برای تسویه‌های آزاد، تنخواه یا تعهدات خارج از چرخهٔ سفارش.
        {isOwnerSigner ? ' چون شما مالک و امضاکننده هستید، چک مستقیماً «امضاشده» ثبت می‌شود.' : ' چک برای امضای مالک ارسال می‌شود.'}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="مبلغ (تومان) *"><FaPriceInput value={form.amount === '' ? '' : Number(form.amount)} onChange={(v) => set('amount', v === '' ? '' : String(v))} ariaLabel="مبلغ چک مستقل" className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="شماره چک"><input value={form.number} onChange={(e) => set('number', e.target.value)} dir="ltr" className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="گیرنده چک *"><input value={form.recipientName} onChange={(e) => set('recipientName', e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" placeholder="نام شرکت / شخص" /></Labeled>
        <Labeled label="تلفن گیرنده"><input value={form.recipientPhone} onChange={(e) => set('recipientPhone', e.target.value)} dir="ltr" className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="تاریخ سررسید *" hint="روزهای جمعه و تعطیل رسمی مجاز نیست — سامانه هشدار می‌دهد">
          <JalaliDatePicker value={form.dueDate} onChange={(v) => set('dueDate', v)} holidays={holidays} minDate={todayIso()} warnHoliday />
        </Labeled>
        <Labeled label="نمایندهٔ طرف‌حساب (چه کسی چک را می‌گیرد)">
          <RepSelect reps={reps} value={rep} onChange={setRep} />
        </Labeled>
        <Labeled label="سریال صیاد (قانون جدید چک ۱۳۹۷)" hint="۱۶ رقمی — از سامانهٔ صیاد بانک">
          <input value={form.sayadSerial} onChange={(e) => set('sayadSerial', e.target.value)} dir="ltr" inputMode="numeric" className="w-full rounded-xl border border-input p-3 font-mono text-sm" placeholder="۱۶ رقم" />
        </Labeled>
        <Labeled label="شماره رسید هلو (اختیاری)">
          <input value={form.holooReceiptNo} onChange={(e) => set('holooReceiptNo', e.target.value)} dir="ltr" className="w-full rounded-xl border border-input p-3 text-sm" />
        </Labeled>
      </div>
      {dueOff && <p className="mt-2 rounded-lg bg-[#b3372f]/10 px-3 py-2 text-[11px] font-black text-[#b3372f]">⚠️ این روز تعطیل است — ثبت مسدود است</p>}
      <button onClick={save} disabled={busy || dueOff} className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : isOwnerSigner ? 'ثبت و امضا ✍️' : 'ثبت و ارسال برای امضای مالک'}
      </button>
    </Modal>
  )
}

/** مودال جزئیات چک — شناسنامهٔ کامل + ویرایش کامل (مبلغ، سررسید، دوره، وضعیت با دلیل، صیاد، نماینده، هلو) */
function ChequeDetailModal({ cheque, holidays, reps, canEdit, startInEdit, onClose, onSaved }: {
  cheque: Cheque; holidays: Map<string, string>; reps: RepLite[]; canEdit: boolean; startInEdit?: boolean; onClose: () => void; onSaved: () => void
}) {
  const [editing, setEditing] = useState(!!startInEdit)
  const [form, setForm] = useState({
    number: cheque.number || '', sayadSerial: cheque.sayadSerial || '', holooReceiptNo: cheque.holooReceiptNo || '',
    repId: cheque.repId || '', repName: cheque.repName || '', recipientName: cheque.recipientName, recipientPhone: cheque.recipientPhone || '',
    amount: String(cheque.amount), periodDays: String(cheque.periodDays), dueDate: cheque.dueDate, duePicked: false,
    status: cheque.status, reason: '', holidayOverride: false,
  })
  const [busy, setBusy] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const st = CHEQUE_STATUSES[cheque.status]

  // پیش‌نمایش زندهٔ سررسید: تاریخ چک هرگز تایپ نمی‌شود — نگارش + دوره، مگر سررسید صریح انتخاب شود
  const previewDue = form.duePicked
    ? form.dueDate
    : addDaysIso(Math.max(1, Math.min(365, Math.round(Number(form.periodDays) || cheque.periodDays))), cheque.writtenAt)
  const previewFri = isFriday(previewDue)
  const previewHol = holidays.get(previewDue)
  const previewChanged = previewDue !== cheque.dueDate || Number(form.periodDays) !== cheque.periodDays || form.amount !== String(cheque.amount) || form.status !== cheque.status

  const save = async (override = false) => {
    if (form.status !== cheque.status && form.reason.trim().length < 3)
      return toast.error('برای اصلاح وضعیت چک، نوشتن دلیل الزامی است')
    setBusy(true)
    try {
      const res = await api<{ warnings?: string[] }>(`/api/cheques/${cheque.id}`, {
        method: 'PATCH',
        body: {
          action: 'edit',
          amount: Number(form.amount),
          number: form.number,
          sayadSerial: form.sayadSerial,
          holooReceiptNo: form.holooReceiptNo,
          repId: form.repId,
          repName: form.repName,
          recipientName: form.recipientName,
          recipientPhone: form.recipientPhone,
          periodDays: Number(form.periodDays),
          dueDate: form.duePicked ? form.dueDate : undefined,
          status: form.status,
          reason: form.reason,
          holidayOverride: override,
        },
      })
      if ((res.warnings || []).length) {
        setWarnings(res.warnings || [])
        toast.warning(`${(res.warnings || [])[0]} — اگر تأیید دارید «خودم بررسی کردم» را بزنید و دوباره ذخیره کنید`, { duration: 9000 })
        setBusy(false)
        return
      }
      toast.success('چک اصلاح و در تاریخچه ثبت شد ✅')
      setEditing(false)
      setWarnings([])
      onSaved()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={`جزئیات چک ${cheque.number ? `شماره ${faNum(cheque.number)}` : ''}`} onClose={onClose} wide>
      <div className="mb-2 flex items-center justify-between">
        <Pill label={st.label} color={st.color} bg={st.bg} />
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 rounded-lg border border-[#c9a227]/50 bg-[#fdf6dd]/60 px-3 py-1.5 text-[11px] font-black text-[#8a5a2b]">
            <Pencil size={12} /> ویرایش / اصلاح چک
          </button>
        )}
      </div>
      {!editing ? (
        <div className="grid gap-1.5 sm:grid-cols-2">
          <KeyValue k="مبلغ" v={`${faMoney(cheque.amount)} تومان`} />
          <KeyValue k="گیرنده" v={cheque.recipientName} />
          <KeyValue k="تلفن گیرنده" v={cheque.recipientPhone ? faNum(cheque.recipientPhone) : '—'} />
          <KeyValue k="شماره چک" v={cheque.number ? faNum(cheque.number) : '—'} />
          <KeyValue k="سریال صیاد" v={cheque.sayadSerial ? <span dir="ltr" className="font-mono text-xs">{faNum(cheque.sayadSerial)}</span> : <span className="text-[10px] text-muted-foreground">ثبت نشده</span>} />
          <KeyValue k="رسید هلو" v={cheque.holooReceiptNo ? faNum(cheque.holooReceiptNo) : '—'} />
          <KeyValue k="نمایندهٔ طرف‌حساب" v={cheque.repName || '—'} />
          <KeyValue k="سفارش" v={cheque.orderCode || 'بدون اتصال (مستقل)'} />
          <KeyValue k="تاریخ نگارش" v={formatJalaliFull(cheque.writtenAt)} />
          <KeyValue k="سررسید" v={`${formatJalaliFull(cheque.dueDate)} (${faNum(cheque.periodDays)} روز)`} />
          <KeyValue k="ثبت‌کننده" v={cheque.createdByName} />
          <KeyValue k="نوع" v={cheque.selfIssued ? 'مستقل' : 'متصل به سفارش'} />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="مبلغ (تومان) *">
              <FaPriceInput value={form.amount === '' ? '' : Number(form.amount)} onChange={(v) => setForm((f) => ({ ...f, amount: v === '' ? '' : String(v) }))} ariaLabel="مبلغ چک" className="w-full rounded-xl border border-input p-2.5 text-sm" />
            </Labeled>
            <Labeled label="گیرنده"><input value={form.recipientName} onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))} className="w-full rounded-xl border border-input p-2.5 text-sm" /></Labeled>
            <Labeled label="تلفن گیرنده"><input value={form.recipientPhone} onChange={(e) => setForm((f) => ({ ...f, recipientPhone: e.target.value }))} dir="ltr" className="w-full rounded-xl border border-input p-2.5 text-sm" /></Labeled>
            <Labeled label="شماره چک"><input value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} dir="ltr" className="w-full rounded-xl border border-input p-2.5 text-sm" /></Labeled>
            <Labeled label="سریال صیاد (فقط رقم)"><input value={form.sayadSerial} onChange={(e) => setForm((f) => ({ ...f, sayadSerial: e.target.value.replace(/\D/g, '').slice(0, 30) }))} dir="ltr" inputMode="numeric" className="w-full rounded-xl border border-input p-2.5 font-mono text-sm" /></Labeled>
            <Labeled label="رسید هلو"><input value={form.holooReceiptNo} onChange={(e) => setForm((f) => ({ ...f, holooReceiptNo: e.target.value }))} dir="ltr" className="w-full rounded-xl border border-input p-2.5 text-sm" /></Labeled>
            <Labeled label="نمایندهٔ طرف‌حساب"><RepSelect reps={reps} value={{ repId: form.repId, repName: form.repName }} onChange={(v) => setForm((f) => ({ ...f, ...v }))} /></Labeled>
            <Labeled label={`دوره از نگارش: ${faNum(form.periodDays)} روز (۱ تا ۳۶۵)`} hint={`نگارش: ${formatJalaliShort(cheque.writtenAt)} — سررسید = نگارش + دوره`}>
              <FaPriceInput value={form.periodDays === '' ? '' : Number(form.periodDays)} onChange={(v) => setForm((f) => ({ ...f, periodDays: v === '' ? '' : String(v), duePicked: false }))} ariaLabel="دوره چک به روز" className="w-full rounded-xl border border-input p-2.5 text-sm" />
            </Labeled>
            <Labeled label="یا انتخاب مستقیم سررسید (بازمحاسبهٔ دوره)" hint="پلتفرم: تاریخ چک تایپ نمی‌شود">
              <JalaliDatePicker
                value={form.duePicked ? form.dueDate : previewDue}
                onChange={(iso) => setForm((f) => ({ ...f, dueDate: iso, duePicked: iso !== cheque.writtenAt ? true : f.duePicked, periodDays: String(Math.max(1, daysBetween(iso, cheque.writtenAt))) }))}
                holidays={holidays}
              />
            </Labeled>
            <Labeled label="اصلاح وضعیت به" hint="هر وضعیتی به هر وضعیت دیگر — با دلیل الزامی">
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="w-full rounded-xl border border-input bg-white p-2.5 text-sm">
                {Object.entries(CHEQUE_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Labeled>
            <Labeled label={form.status !== cheque.status ? 'دلیل اصلاح وضعیت *' : 'توضیح ویرایش (اختیاری)'}>
              <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className="w-full rounded-xl border border-input p-2.5 text-sm" placeholder="مثلاً: مبلغ در توافق نهایی اصلاح شد" />
            </Labeled>
          </div>

          {/* پیش‌نمایش زندهٔ سررسید */}
          {previewChanged && (
            <p className={cn('rounded-xl px-3 py-2 text-[11px] font-black', previewFri || previewHol ? 'bg-[#b3372f]/10 text-[#b3372f]' : 'bg-[#0e7a4a]/10 text-[#0e7a4a]')}>
              سررسید جدید: {formatJalaliFull(previewDue)} ({faNum(Math.max(1, daysBetween(previewDue, cheque.writtenAt)))} روز از نگارش)
              {previewFri && ' + ⚠ جمعه'}
              {previewHol && ` + ⚠ ${previewHol}`}
            </p>
          )}
          {warnings.length > 0 && (
            <div className="rounded-xl border border-[#b3372f]/40 bg-[#b3372f]/5 p-3">
              {warnings.map((w, i) => <p key={i} className="text-[11px] font-bold text-[#b3372f]">⚠ {w}</p>)}
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] font-black text-[#8a5a2b]">
                <input type="checkbox" checked={form.holidayOverride} onChange={(e) => setForm((f) => ({ ...f, holidayOverride: e.target.checked }))} className="accent-[#c9a227]" />
                خودم بررسی کردم — با این سررسید موافقم
              </label>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => (warnings.length && !form.holidayOverride ? save(false) : save(form.holidayOverride))}
              disabled={busy}
              className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white disabled:opacity-50"
            >
              {busy ? '…' : 'ذخیرهٔ تغییرات'}
            </button>
            <button onClick={() => { setEditing(false); setWarnings([]) }} className="rounded-xl border px-4 py-2.5 text-xs font-bold">انصراف</button>
          </div>
        </div>
      )}

      {cheque.ownerNote && <p className="mt-2 rounded-lg bg-[#fdf6dd]/60 px-3 py-2 text-[11px]">📝 یادداشت مالک: {cheque.ownerNote}</p>}

      {/* تاریخچه */}
      <p className="mt-3 mb-1 text-[11px] font-black text-[#8a5a2b]">تاریخچه</p>
      <div className="scroll-gold max-h-40 space-y-1 overflow-y-auto pl-1">
        {(cheque.history || []).map((h: any, i: number) => (
          <div key={i} className="rounded-lg bg-muted/40 px-2.5 py-1.5 text-[10.5px]">
            <span className="font-bold">{h.action}</span> — {h.userName || ''} <span className="text-muted-foreground">{h.at ? formatJalaliShort(h.at) : ''}</span>
            {h.detail && <span className="text-muted-foreground"> • {h.detail}</span>}
          </div>
        ))}
      </div>
      {(holidays.get(cheque.dueDate) || new Date(cheque.dueDate + 'T12:00:00').getDay() === 5) && !['CLEARED', 'REJECTED'].includes(cheque.status) && (
        <p className="mt-2 rounded-lg bg-[#b3372f]/10 px-3 py-2 text-[11px] font-black text-[#b3372f]">
          ⚠️ سررسید روی {holidays.get(cheque.dueDate) || 'جمعه'} است — طبق مادهٔ ۳۱۵ به روز کاری بعد منتقل می‌شود
        </p>
      )}
    </Modal>
  )
}

/** مودال ثبت پرداخت غیرچکی */
function PaymentModal({ holidays, reps, onClose, onSaved }: {
  holidays: Map<string, string>; reps: RepLite[]; onClose: () => void; onSaved: () => void
}) {
  const [kind, setKind] = useState('CASH')
  const [amount, setAmount] = useState('')
  const [providerName, setProviderName] = useState('')
  const [rep, setRep] = useState({ repId: '', repName: '' })
  const [paidAt, setPaidAt] = useState(todayIso())
  const [holooReceiptNo, setHolooReceiptNo] = useState('')
  const [note, setNote] = useState('')
  const [orders, setOrders] = useState<any[]>([])
  const [orderId, setOrderId] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ orders: any[] }>('/api/orders').then((d) => setOrders(d.orders.filter((o) => !['DONE', 'CANCELLED'].includes(o.status)))).catch(() => {})
  }, [])

  const save = async () => {
    if (!amount || Number(amount) <= 0) return toast.error('مبلغ پرداخت الزامی است')
    setBusy(true)
    try {
      const order = orders.find((o) => o.id === orderId)
      await api('/api/payments', {
        method: 'POST',
        body: {
          kind, amount: Number(amount), providerName: providerName || order?.providerName || '',
          repId: rep.repId, repName: rep.repName, paidAt, holooReceiptNo, note,
          orderId: order?.id || '', orderCode: order?.code || '',
        },
      })
      toast.success('پرداخت ثبت شد ✅')
      onSaved()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title="ثبت پرداخت — نقدی / کارت‌خوان / کارت به کارت" onClose={onClose} wide>
      <Labeled label="روش پرداخت">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(PAY_KIND_META).map(([k, m]) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={cn('rounded-full px-3.5 py-2 text-[11px] font-extrabold transition', kind === k ? 'text-white' : 'border border-border bg-card text-foreground/70')} style={kind === k ? { background: m.color } : {}}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </Labeled>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Labeled label="مبلغ (تومان) *"><FaPriceInput value={amount === '' ? '' : Number(amount)} onChange={(v) => setAmount(v === '' ? '' : String(v))} ariaLabel="مبلغ پرداخت" className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="طرف‌حساب / بابت"><input value={providerName} onChange={(e) => setProviderName(e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" placeholder="مثلاً پخش گلدیس — تسویه نقدی" /></Labeled>
        <Labeled label="اتصال به سفارش (اختیاری)">
          <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="w-full rounded-xl border border-input bg-white p-3 text-sm">
            <option value="">— بدون اتصال —</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.code} — {o.providerName}</option>)}
          </select>
        </Labeled>
        <Labeled label="تاریخ پرداخت">
          <JalaliDatePicker value={paidAt} onChange={setPaidAt} holidays={holidays} warnHoliday={false} />
        </Labeled>
        <Labeled label="نمایندهٔ طرف‌حساب">
          <RepSelect reps={reps} value={rep} onChange={setRep} />
        </Labeled>
        <Labeled label="شماره رسید هلو (اختیاری)">
          <input value={holooReceiptNo} onChange={(e) => setHolooReceiptNo(e.target.value)} dir="ltr" className="w-full rounded-xl border border-input p-3 text-sm" />
        </Labeled>
        <Labeled label="توضیح">
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" />
        </Labeled>
      </div>
      <button onClick={save} disabled={busy} className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : 'ثبت پرداخت ✅'}
      </button>
    </Modal>
  )
}

/** مودال ویرایش پرداخت غیرچکی — مبلغ/روش/رسید هلو/نماینده (با تاریخچه) */
function PaymentEditModal({ payment, reps, holidays, onClose, onSaved }: {
  payment: PaymentRow; reps: RepLite[]; holidays: Map<string, string>; onClose: () => void; onSaved: () => void
}) {
  const [kind, setKind] = useState(payment.kind)
  const [amount, setAmount] = useState(String(payment.amount))
  const [providerName, setProviderName] = useState(payment.providerName || '')
  const [rep, setRep] = useState({ repId: payment.repId || '', repName: payment.repName || '' })
  const [paidAt, setPaidAt] = useState(String(payment.paidAt).slice(0, 10))
  const [holooReceiptNo, setHolooReceiptNo] = useState(payment.holooReceiptNo || '')
  const [note, setNote] = useState(payment.note || '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!amount || Number(amount) <= 0) return toast.error('مبلغ پرداخت باید بزرگ‌تر از صفر باشد')
    setBusy(true)
    try {
      await api('/api/payments', {
        method: 'PATCH',
        body: { id: payment.id, kind, amount: Number(amount), providerName, repId: rep.repId, repName: rep.repName, paidAt, holooReceiptNo, note },
      })
      toast.success('پرداخت اصلاح شد ✅')
      onSaved()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={`ویرایش پرداخت ${payment.orderCode ? `— سفارش ${payment.orderCode}` : ''}`} onClose={onClose} wide>
      <Labeled label="روش پرداخت">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(PAY_KIND_META).map(([k, m]) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={cn('rounded-full px-3.5 py-2 text-[11px] font-extrabold transition', kind === k ? 'text-white' : 'border border-border bg-card text-foreground/70')} style={kind === k ? { background: m.color } : {}}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </Labeled>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Labeled label="مبلغ (تومان) *"><FaPriceInput value={amount === '' ? '' : Number(amount)} onChange={(v) => setAmount(v === '' ? '' : String(v))} ariaLabel="مبلغ پرداخت" className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="طرف‌حساب / بابت"><input value={providerName} onChange={(e) => setProviderName(e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="تاریخ پرداخت"><JalaliDatePicker value={paidAt} onChange={setPaidAt} holidays={holidays} warnHoliday={false} /></Labeled>
        <Labeled label="نمایندهٔ طرف‌حساب"><RepSelect reps={reps} value={rep} onChange={setRep} /></Labeled>
        <Labeled label="شماره رسید هلو"><input value={holooReceiptNo} onChange={(e) => setHolooReceiptNo(e.target.value)} dir="ltr" className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
        <Labeled label="توضیح"><input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" /></Labeled>
      </div>
      <button onClick={save} disabled={busy} className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : 'ذخیرهٔ اصلاحات ✅'}
      </button>
    </Modal>
  )
}

/** مودال ویرایش سقف پرداخت — مبلغ/تعداد/روش/توضیح */
function PayLimitEditModal({ limit, onClose, onSaved }: { limit: LimitRow; onClose: () => void; onSaved: () => void }) {
  const [maxAmount, setMaxAmount] = useState(String(limit.maxAmount))
  const [maxCheques, setMaxCheques] = useState(String(limit.maxCheques))
  const [method, setMethod] = useState(limit.method)
  const [note, setNote] = useState(limit.note || '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!maxAmount || Number(maxAmount) <= 0) return toast.error('سقف مبلغ باید بزرگ‌تر از صفر باشد')
    setBusy(true)
    try {
      await api('/api/paylimits', {
        method: 'PATCH',
        body: { id: limit.id, maxAmount: Number(maxAmount), maxCheques: Number(maxCheques) || 0, method, note },
      })
      toast.success('سقف اصلاح شد ✅')
      onSaved()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={`ویرایش سقف — ${PAY_PERIOD_LABELS[limit.period] || limit.period} ${limit.dateKey || ''}`} onClose={onClose}>
      <div className="grid gap-3">
        <Labeled label="حداکثر مبلغ (تومان) *"><FaPriceInput value={maxAmount === '' ? '' : Number(maxAmount)} onChange={(v) => setMaxAmount(v === '' ? '' : String(v))} ariaLabel="سقف مبلغ" className="w-full rounded-xl border border-input p-2.5 text-sm" /></Labeled>
        <Labeled label="حداکثر تعداد چک (۰ = بی‌حد)"><FaPriceInput value={maxCheques === '' ? '' : Number(maxCheques)} onChange={(v) => setMaxCheques(v === '' ? '' : String(v))} ariaLabel="سقف تعداد" className="w-full rounded-xl border border-input p-2.5 text-sm" /></Labeled>
        <Labeled label="روش پرداخت">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full rounded-xl border border-input bg-white p-2.5 text-sm">
            {Object.entries(PAY_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Labeled>
        <Labeled label="توضیح"><input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-xl border border-input p-2.5 text-sm" /></Labeled>
      </div>
      <button onClick={save} disabled={busy} className="mt-3 w-full rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white disabled:opacity-50">
        {busy ? '…' : 'ذخیرهٔ اصلاحات ✅'}
      </button>
    </Modal>
  )
}

/** تب سقف‌ها — فرم ثبت + فهرست مصرف + پارامترهای مشاور (فقط cap cheques.limits) */
function LimitsPanel({ limits, params, onChanged, onEditLimit }: { limits: LimitRow[]; params: SchedParams; onChanged: () => void; onEditLimit: (l: LimitRow) => void }) {
  const [period, setPeriod] = useState('MONTH')
  const [method, setMethod] = useState('CHEQUE')
  const [dayIso, setDayIso] = useState(todayIso())
  const [jy, setJy] = useState(toJalaliParts(todayIso()).jy)
  const [jm, setJm] = useState(toJalaliParts(todayIso()).jm)
  const [season, setSeason] = useState('2')
  const [maxAmount, setMaxAmount] = useState('')
  const [maxCheques, setMaxCheques] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  // پارامترهای مشاور
  const [pMaxDue, setPMaxDue] = useState(String(params.maxDueDays))
  const [pMaxPerDay, setPMaxPerDay] = useState(String(params.maxPerDay))
  const [bands, setBands] = useState(() => {
    const b = params.sizeBands
    return [
      { max: String(b[0]?.max ?? 50_000_000), n: String(b[0]?.n ?? 2) },
      { max: String(b[1]?.max ?? 200_000_000), n: String(b[1]?.n ?? 3) },
      { max: '', n: String(b[2]?.n ?? 5) },
    ]
  })
  useEffect(() => {
    setPMaxDue(String(params.maxDueDays))
    setPMaxPerDay(String(params.maxPerDay))
    const b = params.sizeBands
    setBands([
      { max: String(b[0]?.max ?? 50_000_000), n: String(b[0]?.n ?? 2) },
      { max: String(b[1]?.max ?? 200_000_000), n: String(b[1]?.n ?? 3) },
      { max: '', n: String(b[2]?.n ?? 5) },
    ])
  }, [params])

  const dateKey = resolvePeriodKey(period, dayIso)
  const dateKeyHint =
    period === 'MONTH' ? `${jy}-${String(jm).padStart(2, '0')}` :
    period === 'SEASON' ? `${jy}-S${season}` :
    period === 'YEAR' ? String(jy) :
    period === 'WEEK' ? resolvePeriodKey('WEEK', dayIso) :
    dayIso

  const save = async () => {
    if (!maxAmount || Number(maxAmount) <= 0) return toast.error('سقف مبلغ الزامی است')
    setBusy(true)
    try {
      await api('/api/paylimits', {
        method: 'POST',
        body: {
          period, method,
          dateKey: period === 'DAY' || period === 'WEEK' ? dateKey : dateKeyHint,
          maxAmount: Number(maxAmount),
          maxCheques: Number(maxCheques) || 0,
          note,
        },
      })
      toast.success('سقف ثبت شد — از این پس مصرف در نوار بالای صفحه و مشاور پرداخت لحاظ می‌شود')
      setMaxAmount(''); setMaxCheques(''); setNote('')
      onChanged()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  const saveParams = async () => {
    setBusy(true)
    try {
      await api('/api/paylimits', {
        method: 'POST',
        body: {
          schedParams: {
            maxDueDays: Number(pMaxDue) || 45,
            maxPerDay: Number(pMaxPerDay) || 2,
            sizeBands: bands.map((b, i) => ({ max: i < 2 ? Number(b.max) || 0 : undefined, n: Number(b.n) || 1 })),
          },
        },
      })
      toast.success('پارامترهای مشاور پرداخت ذخیره شد')
      onChanged()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  const remove = async (id: string) => {
    try {
      await api(`/api/paylimits?id=${id}`, { method: 'DELETE' })
      toast.success('سقف حذف شد')
      onChanged()
    } catch (e: any) { toast.error(e.message) }
  }

  const bandLabels = ['تا سقف اول (تومان)', 'تا سقف دوم (تومان)', 'بیشتر از سقف دوم']

  return (
    <div className="space-y-4">
      <SectionCard
        title="سقف هزینه‌کرد پرداخت‌ها"
        subtitle="برای هر دوره (روز/هفته/ماه/فصل/سال) و هر روش، حداکثر مبلغ قابل تعهد را تعیین کنید — اعتبار بازار حفظ می‌شود"
        icon={<ShieldCheck size={18} />}
        actions={<SciExplain k="paylimits" />}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Labeled label="دوره">
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-full rounded-xl border border-input bg-white p-2.5 text-sm">
              {Object.entries(PAY_PERIOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Labeled>
          <Labeled label="روش پرداخت">
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full rounded-xl border border-input bg-white p-2.5 text-sm">
              {Object.entries(PAY_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Labeled>
          {(period === 'DAY' || period === 'WEEK') && (
            <Labeled label={period === 'DAY' ? 'روز هدف' : 'هر روزی از هفتهٔ هدف'}>
              <JalaliDatePicker value={dayIso} onChange={setDayIso} holidays={new Map()} />
            </Labeled>
          )}
          {period === 'MONTH' && (
            <>
              <Labeled label="سال شمسی"><FaPriceInput value={jy} onChange={(v) => setJy(Number(v) || jy)} ariaLabel="سال" className="w-full rounded-xl border border-input p-2.5 text-sm" /></Labeled>
              <Labeled label="ماه">
                <select value={jm} onChange={(e) => setJm(Number(e.target.value))} className="w-full rounded-xl border border-input bg-white p-2.5 text-sm">
                  {J_MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
                </select>
              </Labeled>
            </>
          )}
          {period === 'SEASON' && (
            <>
              <Labeled label="سال شمسی"><FaPriceInput value={jy} onChange={(v) => setJy(Number(v) || jy)} ariaLabel="سال" className="w-full rounded-xl border border-input p-2.5 text-sm" /></Labeled>
              <Labeled label="فصل">
                <select value={season} onChange={(e) => setSeason(e.target.value)} className="w-full rounded-xl border border-input bg-white p-2.5 text-sm">
                  {SEASON_NAMES.map((s, i) => <option key={s} value={String(i + 1)}>{s}</option>)}
                </select>
              </Labeled>
            </>
          )}
          {period === 'YEAR' && (
            <Labeled label="سال شمسی"><FaPriceInput value={jy} onChange={(v) => setJy(Number(v) || jy)} ariaLabel="سال" className="w-full rounded-xl border border-input p-2.5 text-sm" /></Labeled>
          )}
          <Labeled label="حداکثر مبلغ (تومان) *"><FaPriceInput value={maxAmount === '' ? '' : Number(maxAmount)} onChange={(v) => setMaxAmount(v === '' ? '' : String(v))} ariaLabel="سقف مبلغ" className="w-full rounded-xl border border-input p-2.5 text-sm" /></Labeled>
          <Labeled label="حداکثر تعداد چک (۰ = بی‌حد)"><FaPriceInput value={maxCheques === '' ? '' : Number(maxCheques)} onChange={(v) => setMaxCheques(v === '' ? '' : String(v))} ariaLabel="سقف تعداد" className="w-full rounded-xl border border-input p-2.5 text-sm" /></Labeled>
          <Labeled label="توضیح"><input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-xl border border-input p-2.5 text-sm" placeholder="مثلاً: فصل تعطیلات، جریان نقدی محدود" /></Labeled>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          کلید دوره: <span className="font-black text-[#8a5a2b]" dir="ltr">{period === 'DAY' || period === 'WEEK' ? dateKey : dateKeyHint}</span> — {period === 'DAY' ? 'همان روز' : period === 'WEEK' ? `هفتهٔ آغازِ ${formatJalaliShort(resolvePeriodKey('WEEK', dayIso))}` : period === 'MONTH' ? `${J_MONTHS[jm - 1]} ${faNum(jy)}` : period === 'SEASON' ? `${SEASON_NAMES[Number(season) - 1]} ${faNum(jy)}` : `کل سال ${faNum(jy)}`}
        </p>
        <button onClick={save} disabled={busy} className="mt-2 w-full rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white disabled:opacity-50 sm:w-auto sm:px-8">
          ثبت سقف
        </button>

        {/* فهرست سقف‌ها با مصرف */}
        <div className="mt-4 space-y-2">
          <p className="text-xs font-black">سقف‌های ثبت‌شده و مصرف واقعی</p>
          {limits.length === 0 && <EmptyState emoji="🛡️" title="سقفی ثبت نشده" hint="مثلاً: ماهانه چک حداکثر ۵۰۰ میلیون تومان" />}
          {limits.map((l) => {
            const hot = l.overRatio > 90
            const warm = l.overRatio > 70 && !hot
            return (
              <div key={l.id} className="rounded-2xl bg-white/80 p-3 ring-1 ring-border/60">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="font-black">
                    {PAY_PERIOD_LABELS[l.period] || l.period} • {PAY_METHOD_LABELS[l.method] || l.method}
                    <span className="mr-1.5 font-mono text-[9.5px] text-muted-foreground" dir="ltr">{l.dateKey || '—'}</span>
                    {l.maxCheques > 0 && <span className="mr-1.5 text-[10px] text-muted-foreground">حداکثر {faNum(l.maxCheques)} فقره</span>}
                  </span>
                    <span className="flex items-center gap-2">
                    <span className="font-bold">{faMoney(l.used)} / {faMoney(l.maxAmount)} تومان</span>
                    <button
                      onClick={() => onEditLimit(l)}
                      className="flex items-center gap-1 rounded-lg border border-[#c9a227]/50 bg-[#fdf6dd]/70 px-2 py-1 text-[10px] font-black text-[#8a5a2b] hover:border-[#c9a227]"
                    >
                      <Pencil size={11} /> ویرایش
                    </button>
                    <button onClick={() => remove(l.id)} className="rounded-lg bg-[#b3372f]/10 px-2 py-1 text-[10px] font-black text-[#b3372f]">حذف</button>
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full transition-all', hot ? 'bg-[#b3372f]' : warm ? 'bg-[#c9a227]' : 'bg-[#0e7a4a]/70')} style={{ width: `${Math.min(100, l.overRatio)}%` }} />
                </div>
                {l.note && <p className="mt-1 text-[10px] text-muted-foreground">{l.note}</p>}
              </div>
            )
          })}
        </div>
      </SectionCard>

      <SectionCard title="پارامترهای مشاور پرداخت" subtitle="تعداد چک بر اساس اندازهٔ مبلغ، حداکثر مهلت پیش‌فرض و حداکثر چک در روز" icon={<Gauge size={18} />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="حداکثر مهلت پیش‌فرض (روز)"><FaPriceInput value={pMaxDue === '' ? '' : Number(pMaxDue)} onChange={(v) => setPMaxDue(v === '' ? '' : String(v))} ariaLabel="حداکثر مهلت" className="w-full rounded-xl border border-input p-2.5 text-sm" /></Labeled>
          <Labeled label="حداکثر تعداد چک در یک روز"><FaPriceInput value={pMaxPerDay === '' ? '' : Number(pMaxPerDay)} onChange={(v) => setPMaxPerDay(v === '' ? '' : String(v))} ariaLabel="چک در روز" className="w-full rounded-xl border border-input p-2.5 text-sm" /></Labeled>
        </div>
        <p className="mt-3 text-[11px] font-black text-[#8a5a2b]">تعداد چک بر اساس اندازهٔ مبلغ</p>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
          {bands.map((b, i) => (
            <div key={i} className="rounded-2xl bg-muted/40 p-3">
              <p className="text-[10.5px] font-bold text-muted-foreground">{bandLabels[i]}</p>
              {i < 2 && <FaPriceInput value={b.max === '' ? '' : Number(b.max)} onChange={(v) => setBands((bs) => bs.map((x, j) => (j === i ? { ...x, max: v === '' ? '' : String(v) } : x)))} ariaLabel={bandLabels[i]} className="mt-1 w-full rounded-xl border border-input p-2 text-sm" />}
              <Labeled label="حداکثر تعداد چک">
                <FaPriceInput value={b.n === '' ? '' : Number(b.n)} onChange={(v) => setBands((bs) => bs.map((x, j) => (j === i ? { ...x, n: v === '' ? '' : String(v) } : x)))} ariaLabel={`تعداد چک بند ${faNum(i + 1)}`} className="mt-1 w-full rounded-xl border border-input p-2 text-sm" />
              </Labeled>
            </div>
          ))}
        </div>
        <button onClick={saveParams} disabled={busy} className="mt-3 w-full rounded-xl bg-[#8a5a2b] py-2.5 text-xs font-extrabold text-white disabled:opacity-50 sm:w-auto sm:px-8">
          ذخیرهٔ پارامترها
        </button>
      </SectionCard>
    </div>
  )
}

/** گوزن نمرهٔ اعتبار — دایرهٔ ۰..۱۰۰ */
function ScoreGauge({ score }: { score: number }) {
  const R = 25
  const C = 2 * Math.PI * R
  const color = score >= 85 ? '#0e7a4a' : score >= 60 ? '#c9a227' : '#b3372f'
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={R} fill="none" stroke="#ece7d8" strokeWidth="6" />
        <circle cx="32" cy="32" r={R} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} transform="rotate(-90 32 32)" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-black" style={{ color }}>{faNum(score)}</span>
    </div>
  )
}

/** نوار کوچک روزهای پنجره با نقاط سررسید */
function DueStrip({ startIso, days, dues, holidays }: { startIso: string; days: number; dues: Map<string, number>; holidays: Map<string, string> }) {
  const cells = Array.from({ length: days }, (_, i) => addDaysIso(i, startIso))
  return (
    <div className="flex gap-[1.5px]" dir="ltr" title="نوار جریان نقدی پنجره — ستون طلایی = سررسید چک">
      {cells.map((iso) => {
        const wd = new Date(iso + 'T12:00:00').getDay()
        const hol = holidays.get(iso)
        const due = dues.get(iso)
        return (
          <span
            key={iso}
            className={cn(
              'h-4 flex-1 rounded-[2px]',
              due ? 'bg-[#c9a227]' : hol ? 'bg-[#b3372f]/60' : wd === 5 ? 'bg-[#b3372f]/25' : wd === 4 ? 'bg-[#8a5a2b]/15' : 'bg-muted',
            )}
            title={`${formatJalaliShort(iso)}${due ? ` — سررسید ${faMoney(due)} تومان` : hol ? ` — ${hol}` : wd === 5 ? ' — جمعه' : ''}`}
          />
        )
      })}
    </div>
  )
}

/** تب مشاور پرداخت — سه گزینهٔ نردبان + نمرهٔ اعتبار + اعمال برنامه */
function AdvisorPanel({ params, limits, holidays, role, canApply, onApplied }: {
  params: SchedParams; limits: LimitRow[]; holidays: Map<string, string>
  role: string; canApply: boolean; onApplied: () => void
}) {
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [maxDueDays, setMaxDueDays] = useState(params.maxDueDays)
  const [orderId, setOrderId] = useState('')
  const [orders, setOrders] = useState<any[]>([])
  const [sched, setSched] = useState<SchedResult | null>(null)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    api<{ orders: any[] }>('/api/orders').then((d) => setOrders(d.orders.filter((o) => !['DONE', 'CANCELLED'].includes(o.status)))).catch(() => {})
  }, [])

  const amountN = Number(amount) || 0
  const order = orders.find((o) => o.id === orderId)

  const compute = () => {
    if (amountN <= 0) return toast.error('مبلغ را وارد کنید')
    const result = generateSchedule({
      amount: amountN,
      maxDueDays,
      todayIso: todayIso(),
      params,
      payLimits: limits.map((l) => ({ id: l.id, period: l.period, dateKey: l.dateKey, method: l.method, maxAmount: l.maxAmount, used: l.used }) as PayLimitLite),
      holidays: new Set(holidays.keys()),
    })
    setSched(result)
  }

  const apply = async (opt: SchedOption) => {
    if (!canApply) return toast.error('ثبت چک نیازمند دسترسی «cheques.create» است')
    if (!order && !purpose.trim()) return toast.error('«بابت / گیرنده» را بنویسید یا سفارش هدف را انتخاب کنید')
    setApplying(true)
    const tid = toast.loading(`ثبت ${faNum(opt.cheques.length)} چک برنامه…`)
    try {
      for (let i = 0; i < opt.cheques.length; i++) {
        const c = opt.cheques[i]
        toast.loading(`ثبت چک ${faNum(i + 1)} از ${faNum(opt.cheques.length)}…`, { id: tid })
        const useOrderFlow = !!order && ['GM', 'OM', 'ACC'].includes(role)
        await api('/api/cheques', {
          method: 'POST',
          body: {
            ...(useOrderFlow ? { orderId: order.id, orderCode: order.code } : { selfIssued: true, orderCode: order?.code || '' }),
            amount: c.amount,
            recipientName: order ? order.providerName : purpose.trim(),
            dueDate: c.dueDateIso,
            writtenAt: todayIso(),
            periodDays: daysBetween(c.dueDateIso, todayIso()),
          },
        })
      }
      toast.success(`برنامهٔ «${opt.name}» با ${faNum(opt.cheques.length)} چک ثبت شد 🏆`, { id: tid })
      setSched(null)
      setAmount('')
      onApplied()
    } catch (e: any) {
      toast.error(e.message, { id: tid })
    } finally {
      setApplying(false)
    }
  }

  const bandHint = amountN > 0 ? `بر اساس سیاست مالک: حداکثر ${faNum(maxChequesFor(amountN, params.sizeBands))} فقره چک` : ''

  return (
    <SectionCard
      title="مشاور پرداخت — حفظ اعتبار بازار"
      subtitle="مبلغ و حداکثر مهلت را بدهید؛ سه برنامهٔ نردبانی با نمرهٔ اعتبار می‌سازد و بهترین را پیشنهاد می‌کند"
      icon={<Sparkles size={18} />}
      actions={<SciExplain k="schedscore" />}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Labeled label="مبلغ کل (تومان) *">
          <FaPriceInput value={amount === '' ? '' : Number(amount)} onChange={(v) => setAmount(v === '' ? '' : String(v))} ariaLabel="مبلغ برنامه" className="w-full rounded-xl border border-input p-3 text-sm" />
        </Labeled>
        <Labeled label="بابت / گیرنده *">
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} className="w-full rounded-xl border border-input p-3 text-sm" placeholder="مثلاً پخش گلدیس — تسویه فصل" />
        </Labeled>
        <Labeled label="سفارش هدف (اختیاری — گیرنده از سفارش گرفته می‌شود)">
          <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="w-full rounded-xl border border-input bg-white p-3 text-sm">
            <option value="">— بدون سفارش (مستقل) —</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.code} — {o.providerName}</option>)}
          </select>
        </Labeled>
        <Labeled label={`حداکثر مهلت: ${faNum(maxDueDays)} روز`} hint={bandHint}>
          <input
            type="range" min={15} max={90} step={5} value={maxDueDays}
            onChange={(e) => setMaxDueDays(Number(e.target.value))}
            className="w-full accent-[#0e7a4a]"
            aria-label="حداکثر مهلت به روز"
          />
          <div className="flex justify-between text-[9px] font-bold text-muted-foreground"><span>۱۵</span><span>۴۵</span><span>۹۰</span></div>
        </Labeled>
      </div>
      <button onClick={compute} className="mt-3 w-full rounded-xl bg-primary py-2.5 text-xs font-extrabold text-white sm:w-auto sm:px-10">
        ✨ ساخت سه گزینهٔ پرداخت
      </button>

      {!sched && (
        <p className="mt-3 rounded-2xl border border-dashed border-[#c9a227]/40 bg-[#fdf6dd]/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
          مشاور سه استراتژی می‌سازد: <b>نردبان مساوی</b> (کمترین فشار روزانه — کمترین واریانس)، <b>پیش‌رو ۶۰/۴۰</b> (تسویهٔ سنگین‌تر زودتر — اعتبار بالاتر) و <b>پس‌رو ۳۰/۷۰</b> (حفظ نقدینگی، هزینهٔ اعتباری).
          تاریخ‌ها هرگز روی جمعه و تعطیل رسمی نمی‌افتند (مادهٔ ۳۱۵ قانون تجارت) و سقف‌های هزینه‌کرد شما در رتبه‌بندی لحاظ می‌شود.
        </p>
      )}

      {sched && (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {sched.options.map((opt) => {
            const dues = new Map<string, number>()
            for (const c of opt.cheques) dues.set(c.dueDateIso, (dues.get(c.dueDateIso) || 0) + c.amount)
            const bd = opt.breakdown
            return (
              <div key={opt.key} className={cn('glow-card rounded-2xl bg-white/85 p-4', opt.best && 'gold-glow-border ring-1 ring-[#c9a227]/60')}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-black">
                      {opt.best && <Trophy size={15} className="text-[#c9a227]" />}
                      {faNum(opt.rank)}. {opt.name}
                    </p>
                    <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">{opt.desc}</p>
                    {opt.best && <p className="mt-1 inline-block rounded-md bg-[#c9a227]/20 px-2 py-0.5 text-[9.5px] font-black text-[#8a6d10]">🏆 پیشنهاد سامانه برای حفظ اعتبار</p>}
                  </div>
                  <ScoreGauge score={opt.score} />
                </div>

                {/* چیپ‌های چک */}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {opt.cheques.map((c, i) => (
                    <span key={i} className={cn('rounded-xl border px-2.5 py-1.5 text-[10.5px] font-bold', c.shifted ? 'border-[#c9a227]/60 bg-[#fdf6dd]/70' : 'border-[#0e7a4a]/30 bg-[#0e7a4a]/5')} title={c.shifted ? 'به‌خاطر تعطیل/جمعه جابه‌جا شد' : 'روز کاری'}>
                      {wdShort(c.dueDateIso)} {formatJalaliShort(c.dueDateIso)} — {faMoneyShort(c.amount)}
                      {c.shifted && ' ↷'}
                    </span>
                  ))}
                  <span className="rounded-xl bg-muted px-2.5 py-1.5 text-[10.5px] font-black">جمع: {faMoney(opt.cheques.reduce((s, c) => s + c.amount, 0))}</span>
                </div>

                {/* نوار تقویم کوچک */}
                <div className="mt-2.5">
                  <DueStrip startIso={todayIso()} days={maxDueDays} dues={dues} holidays={holidays} />
                </div>

                {/* سنجاق‌های تحلیلی */}
                <div className="mt-2.5 space-y-1 text-[10px] leading-relaxed text-muted-foreground">
                  <p>حداکثر بار یک روز: <b className="text-foreground">{faMoneyShort(bd.dailyMax)}</b> • میانگین فاصله: <b className="text-foreground">{faNum(bd.avgInterval)} روز</b></p>
                  {(bd.breaches.daily > 0 || bd.breaches.weekly > 0 || bd.breaches.monthly > 0) && (
                    <p className="font-black text-[#b3372f]">
                      ⚠️ نقض سقف: {bd.breaches.daily > 0 && `روزانه (${faNum(bd.breaches.daily)}) `}{bd.breaches.weekly > 0 && `هفتگی (${faNum(bd.breaches.weekly)}) `}{bd.breaches.monthly > 0 && `ماهانه (${faNum(bd.breaches.monthly)})`}
                    </p>
                  )}
                  {bd.holidayShifts > 0 && <p className="text-[#8a6d10]">↷ {faNum(bd.holidayShifts)} تاریخ به‌خاطر جمعه/تعطیل جابه‌جا شد</p>}
                  {bd.chequesBeyond3 && <p className="text-[#8a6d10]">بیش از ۳ فقره چک — هزینهٔ اعتباری دارد</p>}
                  {bd.backloadIndex > 0 && <p className="text-[#8a6d10]">پس‌روی: {faNum(Math.round(bd.backloadIndex * 100))}٪ بار در نیمهٔ دوم پنجره</p>}
                  {bd.intervalVariance > 0 && <p className="text-[#8a6d10]">ناهمواری فاصله‌ها: {faNum(Math.round(bd.intervalVariance * 100))}٪</p>}
                </div>

                <button
                  onClick={() => apply(opt)}
                  disabled={applying}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-extrabold text-white disabled:opacity-50"
                  style={{ background: opt.best ? '#0e7a4a' : '#8a5a2b' }}
                >
                  <CalendarCheck size={14} /> {applying ? '…' : `اعمال این گزینه (${faNum(opt.cheques.length)} چک)`}
                </button>
              </div>
            )
          })}
        </div>
      )}
      {!canApply && (
        <p className="mt-3 rounded-xl bg-[#b3372f]/5 px-3 py-2 text-[11px] font-bold text-[#b3372f]">
          🔒 اعمال برنامه نیازمند دسترسی ثبت چک مستقل است (مالک / مدیر کل / حسابدار / مدیر سامانه) — محاسبه و مقایسه برای همه آزاد است.
        </p>
      )}
    </SectionCard>
  )
}
