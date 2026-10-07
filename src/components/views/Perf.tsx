'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faNum, faMoney, formatJalaliDateTime, formatJalaliShort, todayIso, addDaysIso } from '@/lib/jalali'
import { ROLE_LABELS } from '@/lib/constants'
import { SectionCard, StatCard, Pill, EmptyState, Labeled, KeyValue, Avatar, FaPriceInput } from '@/components/app/ui-bits'
import type { AppCtx } from '@/components/app/ui-bits'
import { RankBars, LineChart, BarChart } from '@/components/app/charts'
import { cn } from '@/lib/utils'
import { JalaliDatePicker } from '@/components/app/jalali-widgets'
import { Trophy, Sparkles, Gift, CheckCircle2, ListTodo, Lightbulb, Users, Gauge, Clock, Target, TrendingUp, ShoppingCart, CalendarDays, Trash2, Info, HeartHandshake } from 'lucide-react'

type LBRow = { rank: number; id: string; name: string; role: string; points: number; color: string }
type Award = { id: string; userName?: string; points: number; reason: string; awardedByName: string; createdAt: string }
type Badge = { key: string; label: string; emoji: string; earned: boolean; hint: string }
type GamData = {
  leaderboard: LBRow[]
  awards: Award[]
  recentAwards: Award[]
  stats: { rank: number; points: number; total: number; tasksDone: number; tasksOpen: number; ideasAccepted: number }
  badges: Badge[]
}

export default function PerfView({ ctx }: { ctx: AppCtx }) {
  const [tab, setTab] = useState<'points' | 'splh' | 'extra'>('points')
  const [data, setData] = useState<GamData | null>(null)
  const canAward = ['GM', 'OM', 'PM', 'OWNER', 'HC'].includes(ctx.user!.role)

  const load = async () => {
    try {
      const d = await api<GamData>('/api/gamification')
      setData(d)
    } catch (e: any) {
      toast.error(e.message)
    }
  }
  useEffect(() => {
    api<GamData>('/api/gamification').then((d) => setData(d)).catch((e: any) => toast.error(e.message))
  }, [])

  const tabs = [
    { key: 'points' as const, label: 'امتیازها و قدردانی', icon: <Trophy size={15} /> },
    { key: 'splh' as const, label: 'بهره‌وری نیروی کار (SPLH)', icon: <Gauge size={15} /> },
    { key: 'extra' as const, label: 'فعالیت‌های اضافه 🌟', icon: <Sparkles size={15} /> },
  ]

  return (
    <div className="space-y-4">
      {/* ── tabs ── */}
      <div className="scroll-gold flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-black transition-all',
              tab === t.key
                ? 'border-[#0e7a4a] bg-[#0e7a4a] text-white shadow-lg shadow-[#0e7a4a]/25'
                : 'border-border bg-card text-foreground hover:border-[#c9a227]/60 hover:bg-secondary'
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'points' &&
        (data ? (
          <PointsBody ctx={ctx} data={data} canAward={canAward} onReload={load} />
        ) : (
          <div className="py-16 text-center text-sm text-muted-foreground">در حال بارگذاری امتیازها…</div>
        ))}

      {tab === 'splh' && <SplhSection ctx={ctx} />}

      {tab === 'extra' && <ExtraSection ctx={ctx} />}
    </div>
  )
}

/* ─────────────────────────── امتیازها و قدردانی (محتوای پیشین) ─────────────────────────── */
function PointsBody({ ctx, data, canAward, onReload }: { ctx: AppCtx; data: GamData; canAward: boolean; onReload: () => void }) {
  const load = onReload
  const { stats, badges, leaderboard, awards, recentAwards } = data

  return (
    <div className="space-y-4">
      {/* ── hero ── */}
      <div className="hero-emerald glow-card fade-in-up relative overflow-hidden rounded-2xl p-6 text-white">
        <span className="pointer-events-none absolute -left-4 -top-6 text-[120px] opacity-10">🫒</span>
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-bold opacity-80">
              <Trophy size={14} /> رتبه {faNum(stats.rank)} از {faNum(stats.total)} همکار
            </p>
            <p className="mt-2 text-5xl font-black leading-none">
              {faNum(stats.points)}
              <span className="mr-2 text-base font-bold opacity-80">امتیاز</span>
            </p>
            <p className="mt-3 text-sm font-bold opacity-90">مدیران تلاش شما را می‌بینند و قدردان هستند 🌟</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { icon: <ListTodo size={14} />, label: 'وظایف انجام‌شده', v: stats.tasksDone },
              { icon: <CheckCircle2 size={14} />, label: 'وظایف باز', v: stats.tasksOpen },
              { icon: <Lightbulb size={14} />, label: 'ایده پذیرفته‌شده', v: stats.ideasAccepted },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-white/10 px-3 py-3 backdrop-blur-sm">
                <p className="flex items-center justify-center gap-1 text-lg font-black">{s.icon}{faNum(s.v)}</p>
                <p className="mt-1 text-[9px] font-bold opacity-80">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── badges ── */}
      <SectionCard
        title="نشان‌های من 🎖️"
        subtitle="نشان‌ها با انجام وظیفه، ثبت ایده و کسب امتیاز باز می‌شوند"
        icon={<Sparkles size={18} />}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {badges.map((b) => (
            <div
              key={b.key}
              className={cn(
                'rounded-2xl border p-4 text-center transition',
                b.earned
                  ? 'gold-glow-border border-[#c9a227]/50 bg-gradient-to-b from-[#fdf6dd]/80 to-[#faf3d7]/40 shadow-[0_0_18px_-6px_#c9a22788]'
                  : 'border-border bg-muted/30 opacity-70 grayscale'
              )}
            >
              <span className="text-3xl">{b.emoji}</span>
              <p className="mt-1.5 text-xs font-black text-foreground">{b.label}</p>
              <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{b.earned ? 'کسب شد ✅' : b.hint}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── leaderboard ── */}
        <SectionCard title="جدول قهرمانان تیم 🏆" subtitle="امتیاز همهٔ همکاران فعال" icon={<Users size={18} />}>
          {leaderboard.length === 0 ? (
            <EmptyState emoji="🏆" title="هنوز امتیازی ثبت نشده" />
          ) : (
            <div className="scroll-gold max-h-[44vh] overflow-y-auto pl-1">
              <RankBars
                data={leaderboard.map((l) => ({
                  label: l.id === ctx.user!.id ? `${l.name} (شما)` : l.name,
                  value: l.points,
                  color: l.color || '#0e7a4a',
                }))}
              />
            </div>
          )}
        </SectionCard>

        <div className="space-y-4">
          {/* ── my awards timeline ── */}
          <SectionCard title="قدردانی‌های اخیر من 🌟" subtitle="امتیازهایی که مدیریت به شما اهدا کرده" icon={<Sparkles size={18} />}>
            {awards.length === 0 ? (
              <EmptyState emoji="🌟" title="هنوز قدردانی ثبت نشده" hint="با انجام وظیفه‌ها و ثبت ایده، اولین امتیازتان را بگیرید" />
            ) : (
              <div className="scroll-gold relative max-h-[38vh] space-y-3 overflow-y-auto border-r-2 border-dashed border-[#c9a227]/40 pr-4">
                {awards.map((a) => (
                  <div key={a.id} className="relative">
                    <span className="absolute -right-[23px] top-3 h-3 w-3 rounded-full border-2 border-[#c9a227] bg-[#fdf6dd]" />
                    <div className="glow-card rounded-xl bg-white/80 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-bold text-foreground">{a.reason}</p>
                        <Pill label={`+${faNum(a.points)} امتیاز`} color="#8a6d10" />
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {a.awardedByName} • {formatJalaliDateTime(a.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* ── team recent awards ── */}
          <SectionCard title="قدردانی‌های اخیر تیم 🤝" subtitle="آخرین اهدای امتیاز در کل فروشگاه" icon={<Gift size={18} />}>
            {recentAwards.length === 0 ? (
              <EmptyState emoji="🤝" title="هنوز قدردانی تیمی ثبت نشده" />
            ) : (
              <div className="space-y-1.5">
                {recentAwards.slice(0, 6).map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={a.userName || '؟'} color="#0e7a4a" size={26} />
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold">{a.userName} — {a.reason}</p>
                        <p className="text-[9px] text-muted-foreground">توسط {a.awardedByName} • {formatJalaliDateTime(a.createdAt)}</p>
                      </div>
                    </div>
                    <Pill label={`+${faNum(a.points)}`} color="#0e7a4a" />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* ── award form (managers) ── */}
      {canAward && <AwardSection leaderboard={leaderboard} onDone={load} />}
    </div>
  )
}

/* ─────────────────────────── award points (managers) ─────────────────────────── */
function AwardSection({ leaderboard, onDone }: { leaderboard: LBRow[]; onDone: () => void }) {
  const [targetId, setTargetId] = useState('')
  const [selPoints, setSelPoints] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const effective = Number(custom) > 0 ? Number(custom) : selPoints

  const submit = async () => {
    if (!targetId) return toast.error('همکار را انتخاب کنید')
    if (!effective || effective <= 0) return toast.error('تعداد امتیاز را انتخاب یا وارد کنید')
    if (!reason.trim()) return toast.error('دلیل قدردانی را بنویسید — قلب این بخش همین است')
    setBusy(true)
    try {
      await api('/api/gamification/award', { method: 'POST', body: { userId: targetId, points: effective, reason: reason.trim() } })
      toast.success('امتیاز اهدا شد — همکارتان مطلع می‌شود 🎉')
      setTargetId('')
      setSelPoints(null)
      setCustom('')
      setReason('')
      onDone()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard
      title="اعطای امتیاز به همکار 🎁"
      subtitle="قدردانی لحظه‌ای، انگیزهٔ ماندگار — دلیل را صادقانه و مشخص بنویسید"
      icon={<Gift size={18} />}
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <Labeled label="همکار مورد قدردانی *">
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full rounded-xl border border-input bg-white p-3 text-sm"
            >
              <option value="">— انتخاب کنید —</option>
              {leaderboard.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({ROLE_LABELS[l.role] || l.role}) — {l.points} امتیاز
                </option>
              ))}
            </select>
          </Labeled>

          <Labeled label="تعداد امتیاز *" hint="می‌توانید عدد دلخواه هم وارد کنید">
            <div className="flex flex-wrap items-center gap-1.5">
              {[5, 10, 15, 20, 25, 50].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setSelPoints(p); setCustom('') }}
                  className={cn(
                    'rounded-full px-4 py-2 text-xs font-black transition',
                    effective === p && !custom
                      ? 'bg-primary text-white shadow-md'
                      : 'border border-border bg-card text-foreground/70 hover:border-primary/50'
                  )}
                >
                  {faNum(p)}
                </button>
              ))}
              <input
                type="number" dir="ltr" min={1}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="عدد دلخواه"
                className="w-24 rounded-xl border border-input bg-white p-2.5 text-center text-xs font-black"
              />
            </div>
          </Labeled>
        </div>

        <div className="space-y-3">
          <Labeled label="دلیل قدردانی *">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="مثلاً: در شیفت شلوغ عصر، با حوصله مشتری‌ها را جابه‌جا کرد و نظم قفسه را حفظ کرد"
              className="w-full resize-none rounded-xl border border-input bg-white/90 p-3 text-sm"
            />
          </Labeled>
          <button
            onClick={submit}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#c9a227] py-3.5 text-sm font-extrabold text-white shadow-md transition hover:brightness-105 disabled:opacity-40"
          >
            <Gift size={16} /> {busy ? '…' : 'اهدا امتیاز 🎁'}
          </button>
        </div>
      </div>
    </SectionCard>
  )
}

/* ─────────────────────────── بهره‌وری نیروی کار (SPLH) ───────────────────────────
 * SPLH = Sales Per Labor Hour = فروش ÷ ساعت کار — شاخص استاندارد بهره‌وری نیروی کار در خرده‌فروشی.
 * تا زمان اتصال خروجی صندوق (POS)، مبنای فروش همان پیش‌فاکتورهای غیرلغوشدهٔ سامانه است (شفاف با کاربر).
 */

type SplhSeries = { day: string; hours: number; overtime: number; revenue: number; splh: number | null }
type SplhStaffRow = { userId: string; userName: string; hours: number; overtime: number; avgHoursPerDay: number; share: number }
type SplhRecent = { id: string; userId: string; userName: string; forDate: string; hours: number; kind: string; note: string }
type SplhData = {
  series: SplhSeries[]
  staff: SplhStaffRow[]
  me: SplhStaffRow
  team: { hours: number; overtime: number; headcount: number }
  recent: SplhRecent[]
  totals: {
    hours: number
    overtime: number
    revenue: number
    splh: number | null
    bestDay: { day: string; splh: number } | null
    worstDay: { day: string; splh: number } | null
    target: number
    aboveTargetDays: number
    activeDays: number
  }
  canEdit: boolean
}

const SPLH_BONUS_COEF = 0.005 // ضریب ثابت صندوق پاداش بهره‌وری (۰٫۵٪)
const SPLH_DEFAULT_TARGET = 500000
const fa1 = (n: number) => faNum(Math.round(n * 10) / 10).replace('.', '٫')

function SplhSection({ ctx }: { ctx: AppCtx }) {
  const [data, setData] = useState<SplhData | null>(null)
  const [days, setDays] = useState(30)
  const [users, setUsers] = useState<{ id: string; name: string; role: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [edUserId, setEdUserId] = useState('')
  const [edDate, setEdDate] = useState(todayIso())
  const [edHours, setEdHours] = useState<number | ''>('')
  const [edKind, setEdKind] = useState<'REGULAR' | 'OVERTIME'>('REGULAR')
  const [edNote, setEdNote] = useState('')
  const [targetDraft, setTargetDraft] = useState<number | ''>('')

  const load = useCallback(async (d: number) => {
    try {
      const res = await api<SplhData>(`/api/splh?days=${d}`)
      setData(res)
      setTargetDraft(res.totals.target)
    } catch (e: any) {
      toast.error(e.message)
    }
  }, [])
  useEffect(() => {
    load(days)
  }, [days, load])

  // فهرست همکاران فعال — فقط برای ویرایشگرها
  useEffect(() => {
    if (!data?.canEdit) return
    api<{ users: { id: string; name: string; role: string; active: boolean }[] }>('/api/users')
      .then((r) => setUsers(r.users.filter((u) => u.active)))
      .catch(() => {})
  }, [data?.canEdit])

  const submitHours = async () => {
    if (!edUserId) return toast.error('همکار را انتخاب کنید')
    if (!edDate) return toast.error('تاریخ را انتخاب کنید')
    const h = Number(edHours)
    if (!h || h <= 0 || h > 16) return toast.error('ساعت کار باید بیشتر از صفر و حداکثر ۱۶ باشد')
    setBusy(true)
    try {
      await api('/api/splh', { method: 'POST', body: { userId: edUserId, forDate: edDate, hours: h, kind: edKind, note: edNote.trim() } })
      toast.success('ساعت کار ثبت شد ✅')
      setEdHours('')
      setEdNote('')
      load(days)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const removeLog = async (id: string) => {
    setBusy(true)
    try {
      await api(`/api/splh?id=${id}`, { method: 'DELETE' })
      toast.success('رکورد ساعت کار حذف شد')
      load(days)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const saveTarget = async () => {
    const t = Number(targetDraft)
    if (!t || t <= 0) return toast.error('هدف را وارد کنید (تومان بر ساعت)')
    setBusy(true)
    try {
      await api('/api/splh', { method: 'PUT', body: { target: t } })
      toast.success('هدف بهره‌وری ذخیره شد 🎯')
      load(days)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!data) {
    return <div className="py-16 text-center text-sm text-muted-foreground">در حال بارگذاری بهره‌وری نیروی کار…</div>
  }

  const t = data.totals
  const splhLine = data.series.filter((d) => d.splh != null).map((d) => ({ label: d.day, value: Math.round(d.splh!) }))
  const revBars = data.series.map((d) => ({ label: d.day, value: Math.round(d.revenue) }))
  // صندوق پاداش: Σ روزهای بالای هدف × (SPLH−هدف) × ساعت همان روز × ضریب ۰٫۵٪
  const bonusPool = data.series.reduce(
    (s, d) => (d.splh && d.splh > t.target ? s + (d.splh - t.target) * d.hours * SPLH_BONUS_COEF : s),
    0
  )

  return (
    <div className="space-y-4">
      {/* ── window selector ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-muted-foreground">بازهٔ تحلیل:</p>
        <div className="flex gap-1.5">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-black transition',
                days === d ? 'bg-[#0e7a4a] text-white shadow-md' : 'border border-border bg-card text-foreground/70 hover:border-[#c9a227]/60'
              )}
            >
              {faNum(d)} روز
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="SPLH دوره (تومان/ساعت)"
          value={t.splh != null ? faMoney(t.splh) : '—'}
          hint="فروش ÷ جمع ساعت کار"
          tone="emerald"
          icon={<Gauge size={18} />}
        />
        <StatCard label="جمع ساعت کار" value={`${fa1(t.hours)} ساعت`} hint={`شامل ${fa1(t.overtime)} ساعت اضافه‌کار`} tone="gold" icon={<Clock size={18} />} />
        <StatCard label="فروش ثبت‌شده" value={faMoney(t.revenue)} hint="مجموع پیش‌فاکتورهای غیرلغوشده" tone="olive" icon={<ShoppingCart size={18} />} />
        <StatCard
          label="روزهای بالای هدف"
          value={`${faNum(t.aboveTargetDays)} از ${faNum(t.activeDays)}`}
          hint={`هدف: ${faMoney(t.target)} تومان/ساعت`}
          tone="terra"
          icon={<Target size={18} />}
        />
      </div>

      {/* ── charts ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="روند SPLH روزانه"
          subtitle="فروش هر روز تقسیم بر ساعت کار همان روز"
          icon={<TrendingUp size={18} />}
        >
          {/* هدف به‌صورت نوار خط‌چین طلایی بالای نمودار (LineChart چندسری ندارد) */}
          <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-dashed border-[#c9a227]/60 bg-[#c9a227]/10 px-3 py-1.5 text-[11px] font-bold text-[#8a6d10]">
            <span>— — هدف: {faMoney(t.target)} تومان/ساعت</span>
            <span>
              {faNum(t.aboveTargetDays)} روز بالای هدف از {faNum(t.activeDays)} روز فعال
            </span>
          </div>
          {splhLine.length >= 2 ? (
            <>
              <LineChart data={splhLine} color="#0e7a4a" height={180} formatValue={(v) => `${faMoney(v)} ت/ساعت`} />
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <KeyValue k="بهترین روز" v={t.bestDay ? `${formatJalaliShort(t.bestDay.day)} — ${faMoney(t.bestDay.splh)}` : '—'} />
                <KeyValue k="ضعیف‌ترین روز" v={t.worstDay ? `${formatJalaliShort(t.worstDay.day)} — ${faMoney(t.worstDay.splh)}` : '—'} />
              </div>
            </>
          ) : (
            <EmptyState emoji="📈" title="دادهٔ کافی برای نمودار نیست" hint="پس از ثبت ساعت کار و فروشِ چند روز، روند اینجا نمایش داده می‌شود" />
          )}
        </SectionCard>

        <SectionCard
          title="فروش روزانه"
          subtitle="فروش ثبت‌شده در سامانه (پیش‌فاکتورها) — تا زمان اتصال خروجی POS"
          icon={<ShoppingCart size={18} />}
        >
          {revBars.length > 0 ? (
            <BarChart
              data={revBars}
              color="#77934a"
              height={180}
              formatValue={(v) => `${faMoney(v)} تومان`}
              formatLabel={(l) => faNum(Number(l.slice(8, 10)))}
            />
          ) : (
            <EmptyState emoji="🧾" title="پیش‌فاکتوری در این بازه ثبت نشده" />
          )}
        </SectionCard>
      </div>

      {/* ── staff detail (managers) / own summary (others) ── */}
      {data.canEdit ? (
        <SectionCard title="ساعت کار همکاران" subtitle={`سهم هر همکار از جمع ${fa1(t.hours)} ساعت در بازهٔ انتخابی`} icon={<Users size={18} />}>
          {data.staff.length === 0 ? (
            <EmptyState emoji="⏱️" title="ساعت کاری ثبت نشده" hint="از فرم «ثبت ساعت کار» پایین، روزها و همکاران را وارد کنید" />
          ) : (
            <div className="scroll-gold max-h-[50vh] overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="text-[10px] text-muted-foreground">
                    <th className="pb-2 font-bold">همکار</th>
                    <th className="pb-2 font-bold">ساعت کار</th>
                    <th className="pb-2 font-bold">اضافه‌کار</th>
                    <th className="pb-2 font-bold">میانگین روزانه</th>
                    <th className="pb-2 font-bold">سهم از تیم</th>
                  </tr>
                </thead>
                <tbody>
                  {data.staff.map((s) => (
                    <tr key={s.userId} className="border-t border-border/60">
                      <td className="py-2.5 font-bold text-foreground">
                        {s.userName}
                        {s.userId === ctx.user!.id && <span className="mr-1 text-[10px] text-[#8a6d10]">(شما)</span>}
                      </td>
                      <td className="py-2.5 tabular-nums">{fa1(s.hours)}</td>
                      <td className="py-2.5">
                        {s.overtime > 0 ? <Pill label={`${fa1(s.overtime)} ساعت`} color="#c96f4a" /> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2.5 tabular-nums text-muted-foreground">{fa1(s.avgHoursPerDay)}</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-muted sm:w-28">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, s.share)}%`, background: 'linear-gradient(90deg, #0e7a4a, #0e7a4a88)' }}
                            />
                          </div>
                          <span className="font-extrabold text-[#8a6d10]">{faNum(Math.round(s.share))}٪</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : (
        <SectionCard title="ساعت کاری من" subtitle="خلاصهٔ عملکرد شما + جمع تیم (بدون جزئیات فردی همکاران)" icon={<Clock size={18} />}>
          <div className="grid gap-2 sm:grid-cols-2">
            <KeyValue
              k="ساعت کار من در این بازه"
              v={`${fa1(data.me.hours)} ساعت${data.me.overtime > 0 ? ` (اضافه‌کار ${fa1(data.me.overtime)})` : ''}`}
            />
            <KeyValue k="میانگین روزانه من" v={`${fa1(data.me.avgHoursPerDay)} ساعت`} />
            <KeyValue k="جمع ساعت کار تیم" v={`${fa1(data.team.hours)} ساعت`} />
            <KeyValue k="همکاران دارای ساعت ثبت‌شده" v={faNum(data.team.headcount)} />
          </div>
        </SectionCard>
      )}

      {/* ── manager editor ── */}
      {data.canEdit && (
        <SectionCard
          title="ثبت ساعت کار"
          subtitle="ثبت مجدد برای همان همکار و همان روز، رکورد قبلی را به‌روزرسانی می‌کند"
          icon={<CalendarDays size={18} />}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-3">
              <Labeled label="همکار *">
                <select
                  value={edUserId}
                  onChange={(e) => setEdUserId(e.target.value)}
                  className="w-full rounded-xl border border-input bg-white p-3 text-sm"
                >
                  <option value="">— انتخاب کنید —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({ROLE_LABELS[u.role] || u.role})
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="تاریخ *" hint="میان‌بر: امروز / دیروز">
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    {[
                      { label: 'امروز', v: todayIso() },
                      { label: 'دیروز', v: addDaysIso(-1) },
                    ].map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        onClick={() => setEdDate(c.v)}
                        className={cn(
                          'rounded-full border px-4 py-1.5 text-[11px] font-bold transition',
                          edDate === c.v
                            ? 'border-[#0e7a4a] bg-[#0e7a4a] text-white'
                            : 'border-border bg-card text-foreground/70 hover:border-[#c9a227]/60'
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <JalaliDatePicker value={edDate} onChange={setEdDate} holidays={new Map()} quickChips={false} />
                </div>
              </Labeled>
              <Labeled label="نوع ساعت *">
                <div className="flex gap-1.5">
                  {[
                    { k: 'REGULAR' as const, label: 'عادی ☀️' },
                    { k: 'OVERTIME' as const, label: 'اضافه‌کار 🌙' },
                  ].map((o) => (
                    <button
                      key={o.k}
                      type="button"
                      onClick={() => setEdKind(o.k)}
                      className={cn(
                        'rounded-xl px-4 py-2.5 text-xs font-black transition',
                        edKind === o.k
                          ? 'bg-[#0e7a4a] text-white shadow-md'
                          : 'border border-border bg-card text-foreground/70 hover:border-[#c9a227]/60'
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </Labeled>
            </div>
            <div className="space-y-3">
              <Labeled label="ساعت کار *" hint="بین ۰٫۵ تا ۱۶ — مثلاً ۷٫۵">
                <input
                  type="number"
                  dir="ltr"
                  min={0.5}
                  max={16}
                  step={0.5}
                  value={edHours}
                  onChange={(e) => setEdHours(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="۷٫۵"
                  className="w-full rounded-xl border border-input bg-white p-3 text-center text-sm font-black tabular-nums"
                />
              </Labeled>
              <Labeled label="یادداشت">
                <input
                  value={edNote}
                  onChange={(e) => setEdNote(e.target.value)}
                  placeholder="مثلاً: شیفت عصر جمعه — پیک فروش"
                  className="w-full rounded-xl border border-input bg-white/90 p-3 text-sm"
                />
              </Labeled>
              <button
                onClick={submitHours}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#c9a227] py-3.5 text-sm font-extrabold text-white shadow-md transition hover:brightness-105 disabled:opacity-40"
              >
                <Clock size={16} /> {busy ? '…' : 'ثبت ساعت کار'}
              </button>
            </div>
          </div>

          {/* recent logs */}
          {data.recent.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold text-muted-foreground">۱۴ رکورد اخیر</p>
              <div className="scroll-gold max-h-[38vh] space-y-1.5 overflow-y-auto pl-1">
                {data.recent.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={l.userName} color="#0e7a4a" size={26} />
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold">
                          {l.userName} — {formatJalaliShort(l.forDate)} — {fa1(l.hours)} ساعت
                          {l.kind === 'OVERTIME' && <span className="mr-1 text-[10px] font-black text-[#c96f4a]">(اضافه‌کار)</span>}
                        </p>
                        {l.note && <p className="truncate text-[10px] text-muted-foreground">{l.note}</p>}
                      </div>
                    </div>
                    <button
                      onClick={() => removeLog(l.id)}
                      disabled={busy}
                      title="حذف رکورد"
                      className="rounded-lg p-1.5 text-[#b3372f] transition hover:bg-[#b3372f]/10 disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── target editor (managers) ── */}
      {data.canEdit && (
        <SectionCard title="هدف بهره‌وری" subtitle="مبنای مقایسهٔ روزها و محاسبهٔ صندوق پاداش" icon={<Target size={18} />}>
          <div className="flex flex-wrap items-end gap-3">
            <Labeled label="هدف SPLH (تومان بر ساعت)">
              <FaPriceInput
                value={targetDraft}
                onChange={setTargetDraft}
                ariaLabel="هدف SPLH"
                className="w-44 rounded-xl border border-input bg-white p-2.5"
              />
            </Labeled>
            <button
              onClick={saveTarget}
              disabled={busy}
              className="rounded-xl bg-[#0e7a4a] px-5 py-2.5 text-xs font-extrabold text-white shadow-md transition hover:brightness-110 disabled:opacity-40"
            >
              ذخیره هدف
            </button>
            <p className="text-[11px] text-muted-foreground">پیش‌فرض سامانه: {faMoney(SPLH_DEFAULT_TARGET)} تومان/ساعت</p>
          </div>
        </SectionCard>
      )}

      {/* ── formula & science card ── */}
      <SectionCard
        title="فرمول و مبانی علمی SPLH"
        subtitle="Sales Per Labor Hour — شاخص استاندارد سنجش بهره‌وری نیروی کار در خرده‌فروشی"
        icon={<Info size={18} />}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2 rounded-xl bg-muted/40 p-4">
            <KeyValue k="فرمول" v="SPLH = فروش ÷ ساعت کار" />
            <KeyValue k="مبنای فروش" v="فروش ثبت‌شده در سامانه (پیش‌فاکتورها)" />
            <KeyValue k="مبنای ساعت" v="جمع ساعت عادی + اضافه‌کار ثبت‌شده" />
          </div>
          <div className="space-y-2 rounded-xl border border-[#c9a227]/40 bg-[#fdf6dd]/60 p-4 text-xs leading-6 text-foreground/90">
            <p>
              <b className="text-[#8a6d10]">کاربردها:</b> برنامه‌ریزی شیفت، سنجش اثر چیدمان و کمپین‌ها
            </p>
            <p className="text-[#b3372f]">
              <b>هشدار اخلاقی:</b> شاخص برای بهبود فرآیند است، نه کنترل فردی — به‌عنوان ابزار توانمندسازی تیم استفاده شود
            </p>
            <p className="text-muted-foreground">
              <b>شفافیت داده:</b> تا زمان اتصال خروجی صندوق (POS)، مبنای فروش همان پیش‌فاکتورهای ثبت‌شده در سامانه است.
            </p>
          </div>
        </div>

        {/* bonus pool model */}
        <div className="mt-3 rounded-xl border border-[#0e7a4a]/30 bg-[#0e7a4a]/5 p-4">
          <p className="text-xs font-black text-[#0e7a4a]">صندوق پاداش بهره‌وری — مدل محاسبه</p>
          <p className="mt-2 text-center text-sm font-extrabold leading-7 text-foreground">
            صندوق پاداش بهره‌وری = Σ روزهای بالای هدف × (SPLH − هدف) × ساعت همان روز × ضریب ۰٫۵٪
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              برآورد برای {faNum(t.aboveTargetDays)} روز بالای هدف در {faNum(days)} روز گذشته
            </span>
            <span className="text-lg font-black text-[#8a6d10]">{faMoney(bonusPool)} تومان</span>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

/* ─────────────────────────── فعالیت‌های اضافه (فراتر از وظیفه) ─────────────────────────── */

type ExtraActivity = {
  id: string; userId: string; userName: string; title: string; description: string
  minutes: number; forDate: string; status: string; rewardPoints: number
  reviewedByName: string; createdAt: string
}
type ExtraData = {
  activities: ExtraActivity[]
  canReview: boolean
  stats: { totalMinutes7d: number; pending: number }
}
type ExtraStatusInfo = { label: string; bg: string; color: string }

const EXTRA_STATUS: Record<string, ExtraStatusInfo> = {
  PENDING: { label: 'در انتظار بررسی', bg: '#fdf6dd', color: '#8a6d10' },
  ACKNOWLEDGED: { label: 'قدردانی شد 👏', bg: '#f0f7ee', color: '#5c7236' },
  REWARDED: { label: 'قدردانی شد', bg: '#e9f0e4', color: '#0e7a4a' },
}

function ExtraSection({ ctx }: { ctx: AppCtx }) {
  const [data, setData] = useState<ExtraData | null>(null)
  // فرم ثبت
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [chip, setChip] = useState<number | null>(30)
  const [custom, setCustom] = useState('')
  const [forDate, setForDate] = useState(todayIso())
  const [busy, setBusy] = useState(false)
  // امتیاز مدیر
  const [rewardFor, setRewardFor] = useState<string | null>(null)
  const [rewardPts, setRewardPts] = useState<number>(10)

  const load = useCallback(() => {
    api<ExtraData>('/api/extra-activities')
      .then(setData)
      .catch((e: any) => toast.error(e.message))
  }, [])
  useEffect(() => { load() }, [load])

  const minutes = chip === null ? Number(custom) || 0 : chip

  const submit = async () => {
    if (!title.trim()) return toast.error('عنوان فعالیت را بنویسید')
    if (!minutes || minutes < 5) return toast.error('مدت فعالیت را انتخاب کنید (حداقل ۵ دقیقه)')
    setBusy(true)
    try {
      await api('/api/extra-activities', { method: 'POST', body: { title: title.trim(), description: desc.trim(), minutes, forDate } })
      toast.success('ثبت شد — ممنون از انرژی‌ات 🌟 مدیرت خبردار می‌شود')
      setTitle(''); setDesc(''); setCustom(''); setChip(30)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const act = async (id: string, action: 'acknowledge' | 'reward', points?: number) => {
    setBusy(true)
    try {
      await api('/api/extra-activities', { method: 'PATCH', body: { id, action, rewardPoints: points } })
      toast.success(action === 'acknowledge' ? 'قدردانی ثبت شد 👏' : `امتیاز اهدا شد 🎁 (${faNum(points || 0)} امتیاز)`)
      setRewardFor(null)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const pendingList = data?.activities.filter((a) => a.status === 'PENDING') || []

  return (
    <div className="space-y-4">
      {/* ── stats ── */}
      {data && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="دقیقه‌های ۷ روز اخیر" value={faNum(data.stats.totalMinutes7d)} hint="کار فراتر از وظیفهٔ ثبت‌شده" icon={<Clock size={18} />} tone="emerald" />
          <StatCard label={data.canReview ? 'در انتظار قدردانی' : 'در انتظار بررسی مدیر'} value={faNum(data.stats.pending)} hint={data.canReview ? 'قدردانی اول، امتیاز بعد' : 'به‌زودی بررسی می‌شود'} icon={<Sparkles size={18} />} tone="gold" />
        </div>
      )}

      {/* ── quick log form ── */}
      <SectionCard
        title="ثبت فعالیت فراتر از وظیفه 🌟"
        subtitle="کاری که در لیست وظایف نبود اما انجامش دادی — این‌جا ثبتش کن تا دیده شود"
        icon={<Sparkles size={18} />}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-3">
            <Labeled label="چه کاری انجام دادی؟ *">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثلاً: مرتب‌سازی انبار شیرینی پیش از نوروز"
                className="w-full rounded-xl border border-input bg-white px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </Labeled>
            <Labeled label="توضیح کوتاه (اختیاری)">
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={2}
                placeholder="یک جمله کافی است…"
                className="w-full rounded-xl border border-input bg-white px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </Labeled>
            <Labeled label="تاریخ انجام">
              <JalaliDatePicker value={forDate} onChange={setForDate} holidays={new Map()} quickChips={false} />
            </Labeled>
          </div>
          <div className="space-y-3">
            <Labeled label="چقدر وقت برد؟ *">
              <div className="flex flex-wrap gap-2">
                {[15, 30, 60].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setChip(m); setCustom('') }}
                    className={cn(
                      'min-h-11 rounded-xl border px-5 py-2.5 text-xs font-black transition',
                      chip === m ? 'border-[#0e7a4a] bg-[#0e7a4a] text-white shadow-lg shadow-[#0e7a4a]/20' : 'border-border bg-white text-foreground hover:border-[#c9a227]'
                    )}
                  >
                    {faNum(m)} دقیقه
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setChip(null)}
                  className={cn(
                    'min-h-11 rounded-xl border px-5 py-2.5 text-xs font-black transition',
                    chip === null ? 'border-[#0e7a4a] bg-[#0e7a4a] text-white shadow-lg shadow-[#0e7a4a]/20' : 'border-border bg-white text-foreground hover:border-[#c9a227]'
                  )}
                >
                  دلخواه
                </button>
                {chip === null && (
                  <input
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="دقیقه — مثلاً ۴۵"
                    className="w-28 rounded-xl border border-input bg-white px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                )}
              </div>
            </Labeled>
            <div className="rounded-xl border border-[#77934a]/30 bg-[#f0f7ee] p-3 text-[11px] font-bold leading-6 text-[#5c7236]">
              🌿 این بخش برای «دیدن» کارهای خوب است، نه محاسبهٔ اضافه‌کاری — ثبت صادقانه کافی است؛ مدیر خودش قدردانی می‌کند.
            </div>
            <button
              onClick={submit}
              disabled={busy}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-black text-white shadow-lg shadow-[#0e7a4a]/25 transition hover:bg-[#12905a] disabled:opacity-50"
            >
              <Sparkles size={16} /> ثبت فعالیت
            </button>
          </div>
        </div>
      </SectionCard>

      {/* ── managers: pending review ── */}
      {data?.canReview && pendingList.length > 0 && (
        <SectionCard
          title="در انتظار قدردانی شما"
          subtitle="اول بازشناسی صادقانه، بعد در صورت شایستگی امتیاز — پژوهش‌ها می‌گویند قدردانیِ به‌موقع بیش از پاداش انگیزه می‌سازد"
          icon={<HeartHandshake size={18} />}
        >
          <div className="space-y-2">
            {pendingList.map((a) => (
              <div key={a.id} className="rounded-2xl border border-[#c9a227]/35 bg-[#fdf6dd]/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={a.userName} color="#77934a" size={36} />
                    <div className="min-w-0">
                      <b className="block truncate text-xs">{a.userName} — {a.title}</b>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {faNum(a.minutes)} دقیقه • {formatJalaliShort(a.forDate)}{a.description ? ` • ${a.description}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => act(a.id, 'acknowledge')}
                      disabled={busy}
                      className="flex min-h-11 items-center gap-1.5 rounded-xl border border-[#77934a]/50 bg-white px-4 py-2.5 text-[11px] font-black text-[#5c7236] transition hover:bg-[#f0f7ee]"
                      title="قدردانی بدون امتیاز — پیام بازشناسی"
                    >
                      👏 قدردانی می‌کنم
                    </button>
                    <button
                      onClick={() => { setRewardFor(rewardFor === a.id ? null : a.id); setRewardPts(10) }}
                      className={cn(
                        'flex min-h-11 items-center gap-1.5 rounded-xl border px-4 py-2.5 text-[11px] font-black transition',
                        rewardFor === a.id ? 'border-[#0e7a4a] bg-[#0e7a4a] text-white' : 'border-[#0e7a4a]/40 bg-white text-[#0e7a4a] hover:bg-[#e9f0e4]'
                      )}
                    >
                      🎁 قدردانی + امتیاز
                    </button>
                  </div>
                </div>
                {rewardFor === a.id && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-[#0e7a4a]/25 bg-white p-2.5">
                    <span className="text-[10px] font-black text-muted-foreground">امتیاز:</span>
                    {[10, 20, 50].map((p) => (
                      <button
                        key={p}
                        onClick={() => setRewardPts(p)}
                        className={cn(
                          'min-h-11 rounded-xl border px-4 py-2 text-xs font-black transition',
                          rewardPts === p ? 'border-[#0e7a4a] bg-[#0e7a4a] text-white' : 'border-border bg-white text-foreground hover:border-[#c9a227]'
                        )}
                      >
                        {faNum(p)}
                      </button>
                    ))}
                    <button
                      onClick={() => act(a.id, 'reward', rewardPts)}
                      disabled={busy}
                      className="mr-auto flex min-h-11 items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#0e7a4a] to-[#12905a] px-5 py-2.5 text-xs font-black text-white shadow transition hover:shadow-lg"
                    >
                      اهدا {faNum(rewardPts)} امتیاز 🎁
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── list ── */}
      <SectionCard
        title={data?.canReview ? 'فعالیت‌های ثبت‌شدهٔ تیم' : 'فعالیت‌های ثبت‌شدهٔ من'}
        subtitle="کارهای خوبی که فراتر از شرح وظیفه انجام شده — قدردانی‌شده‌ها با امتیازشان"
        icon={<Sparkles size={18} />}
      >
        {!data || data.activities.length === 0 ? (
          <EmptyState emoji="🌟" title="هنوز فعالیتی ثبت نشده" hint="اولین کار فراتر از وظیفه را ثبت کنید تا دیده شود" />
        ) : (
          <div className="scroll-gold max-h-[50vh] space-y-2 overflow-y-auto pl-1">
            {data.activities.map((a) => {
              const st = EXTRA_STATUS[a.status] || EXTRA_STATUS.PENDING
              return (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-white/70 p-3">
                  <div className="min-w-0">
                    <b className="block text-xs">{data.canReview ? `${a.userName} — ` : ''}{a.title}</b>
                    <span className="text-[10px] font-bold text-muted-foreground">
                      {faNum(a.minutes)} دقیقه • {formatJalaliShort(a.forDate)}
                      {a.reviewedByName ? ` • بررسی: ${a.reviewedByName}` : ''}
                    </span>
                    {a.description && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{a.description}</p>}
                  </div>
                  <span className="shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black" style={{ background: st.bg, color: st.color }}>
                    {st.label}{a.status === 'REWARDED' ? ` +${faNum(a.rewardPoints)} امتیاز 🎁` : ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
