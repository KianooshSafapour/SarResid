'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { daysBetween, faMoney, faNum, formatJalaliFull, formatJalaliShort, todayIso } from '@/lib/jalali'
import { ORDER_STATUSES, PRIORITIES, TASK_STATUSES, canAccess } from '@/lib/constants'
import { SectionCard, Pill, EmptyState } from '@/components/app/ui-bits'
import { BarChart, Donut, LineChart, RankBars } from '@/components/app/charts'
import type { AppCtx } from '@/components/app/ui-bits'
import { cn } from '@/lib/utils'
import {
  DASH_TAB_LABELS,
  getDashWidget,
  packRows,
  resolveDashOrder,
  resolveDashWidgets,
  type DashPrefs,
  type DashSpan,
  type DashTab,
} from '@/lib/dashboard-widgets'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import {
  AlertTriangle,
  Banknote,
  Calculator,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Gauge,
  Hourglass,
  ListChecks,
  MessageCircle,
  Newspaper,
  PackageCheck,
  PieChart,
  ReceiptText,
  RotateCcw,
  Settings,
  ShoppingBasket,
  Sparkles,
  Sun,
  Tag,
  TrendingUp,
  Trophy,
  Truck,
} from 'lucide-react'

type Dash = any
type Tab = 'today' | 'week'

/* ─────────────────────────اعداد و ابزارهای کوچک───────────────────────── */

/** کارت آماری فشردهٔ نوار KPI — مقدار + برچسب؛ جزئیات در tooltip */
function KpiMini({
  label,
  value,
  hint,
  tone = 'emerald',
  icon,
  onClick,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  tone?: 'emerald' | 'gold' | 'terra' | 'rose' | 'olive'
  icon: React.ReactNode
  onClick?: () => void
}) {
  const tones: Record<string, string> = {
    emerald: 'bg-[#0e7a4a]/10 text-[#0e7a4a]',
    gold: 'bg-[#c9a227]/15 text-[#8a6d10]',
    terra: 'bg-[#c96f4a]/15 text-[#a04c2a]',
    rose: 'bg-[#b3372f]/10 text-[#b3372f]',
    olive: 'bg-[#77934a]/15 text-[#5c7236]',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cn(
        'glow-card flex min-h-13 min-w-0 items-center gap-2.5 rounded-xl bg-card p-2.5 text-right transition-all sm:p-3',
        onClick && 'cursor-pointer hover:-translate-y-0.5'
      )}
    >
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tones[tone])}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-lg font-black leading-6 text-foreground">{value}</span>
        <span className="block truncate text-[11px] font-bold text-muted-foreground">{label}</span>
      </span>
    </button>
  )
}

/** کاشی صف اقدام نقش‌محور — فشرده و قابل کلیک */
function QueueTile({
  title,
  count,
  desc,
  tone,
  onClick,
  cta,
  children,
}: {
  title: string
  count: number
  desc: string
  tone: string
  onClick: () => void
  cta: string
  children?: React.ReactNode
}) {
  return (
    <div className="glow-card flex h-full flex-col rounded-2xl bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-black text-foreground">{title}</p>
        <span className="shrink-0 rounded-lg px-2 py-0.5 text-base font-black" style={{ color: tone, background: `${tone}1a` }}>
          {faNum(count)}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{desc}</p>
      {children}
      <button
        onClick={onClick}
        className="mt-2 min-h-11 w-full rounded-lg py-2 text-[11px] font-black transition hover:brightness-95"
        style={{ color: tone, background: `${tone}14` }}
      >
        {cta} ←
      </button>
    </div>
  )
}

/** سگمنت انتخاب حالت داشبورد — «امروز من» / «نگاه هفته» */
function SegTabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string; sub: string; icon: React.ReactNode }[] = [
    { key: 'today', label: 'امروز من', sub: 'کارها و صف‌های شخصی', icon: <Sun size={16} /> },
    { key: 'week', label: 'نگاه هفته', sub: 'تحلیل و روند مدیریتی', icon: <TrendingUp size={16} /> },
  ]
  return (
    <div role="tablist" aria-label="حالت نمایش داشبورد" className="flex justify-center">
      <div className="glow-card inline-flex w-full gap-1 rounded-2xl bg-card p-1.5 sm:w-auto">
        {tabs.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.key)}
              className={cn(
                'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 transition-all sm:flex-none sm:px-5',
                active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary/70'
              )}
            >
              {t.icon}
              <span className="text-xs font-black">{t.label}</span>
              <span className={cn('hidden text-[10px] font-bold md:inline', active ? 'text-primary-foreground/70' : 'text-muted-foreground/80')}>
                · {t.sub}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** دکمهٔ «مشاهدهٔ همه» — به نمای مالکِ فهرست می‌رود */
function ViewAll({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-3 flex min-h-11 w-full items-center justify-center gap-1 rounded-xl bg-secondary py-2 text-xs font-extrabold text-secondary-foreground transition hover:bg-[#dcead4]"
    >
      {label} ←
    </button>
  )
}

/** ردیف فشردهٔ لیست — کل ردیف قابل کلیک (≥۴۴px) */
function Row({ onClick, children, className }: { onClick?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          'flex min-h-11 w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-white/60 px-3 py-2 text-right transition',
          onClick && 'hover:border-[#c9a227]/40 hover:bg-white',
          className
        )}
      >
        {children}
      </button>
    </li>
  )
}

/** چیپ فاصلهٔ زمانی تا سررسید — دیرکرد قرمز، امروز/فردا طلایی */
function DueChip({ days }: { days: number }) {
  if (days < 0) return <Pill label={`${faNum(Math.abs(days))} روز دیرکرد`} color="#b3372f" />
  if (days === 0) return <Pill label="امروز" color="#8a6d10" />
  if (days === 1) return <Pill label="فردا" color="#a16207" />
  return <Pill label={`${faNum(days)} روز مانده`} color={days <= 5 ? '#77934a' : '#6d7a6e'} />
}

/* ─────────────────────────لایهٔ ویجت‌ها (شخصی‌سازی)───────────────────────── */

/** نگاشت نام آیکونِ ثبت → کامپوننت lucide (درخت‌کوبی‌شده — فقط همین‌ها ایمپورت می‌شوند) */
const WIDGET_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Sun,
  Gauge,
  Tag,
  Calculator,
  PackageCheck,
  ReceiptText,
  ListChecks,
  Truck,
  AlertTriangle,
  Banknote,
  MessageCircle,
  Newspaper,
  TrendingUp,
  PieChart,
  Trophy,
  ShoppingBasket,
  Hourglass,
  Sparkles,
}

function WidgetGlyph({ name, size = 15 }: { name: string; size?: number }) {
  const Cmp = WIDGET_ICONS[name]
  return Cmp ? <Cmp size={size} /> : <Sparkles size={size} />
}

/**
 * کلاس ستون هر ویجت در شبکهٔ واکنش‌گرا:
 *  موبایل ۱ ستونه → همه تمام‌عرض | تبلت ۲ ستونه → پهنای ≥۲ تمام‌عرض (flow-dense شکاف‌ها را پر می‌کند)
 *  دسکتاپ ۴ ستونه → همان colSpan محاسبه‌شدهٔ packRows (تضمین ردیفِ پُر)
 */
function spanCls(s: DashSpan): string {
  if (s === 4) return 'col-span-full'
  if (s === 3) return 'sm:col-span-2 lg:col-span-3'
  if (s === 2) return 'sm:col-span-2'
  return 'lg:col-span-1'
}

/* ─────────────────────────نمای اصلی داشبورد───────────────────────── */

export default function DashboardView({ ctx }: { ctx: AppCtx }) {
  const [data, setData] = useState<Dash | null>(null)
  const [abc, setAbc] = useState<{ rows: { name: string; category: string; annualValue: number; cls: string }[] } | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<Tab>('today')

  // ── لایهٔ شخصی‌سازی (Task 19-d) — ترجیحات هر کاربر در User.uiPrefs.dash ──
  const [prefs, setPrefs] = useState<DashPrefs>({ hidden: [], order: [] })
  const [prefOpen, setPrefOpen] = useState(false)
  const [draft, setDraft] = useState<DashPrefs>({ hidden: [], order: [] })
  const [saving, setSaving] = useState(false)

  const load = () =>
    api<Dash>('/api/dashboard')
      .then(setData)
      .catch((e) => setErr(e.message))

  useEffect(() => {
    load()
    api<any>('/api/science?tool=abc')
      .then((d) => setAbc(d.abc))
      .catch(() => {
        /* تحلیل ABC غیرحیاتی است — در صورت خطا فقط پنهان می‌شود */
      })
    api<{ dash?: DashPrefs }>('/api/me/dashboard')
      .then((d) => setPrefs({ hidden: d?.dash?.hidden || [], order: d?.dash?.order || [] }))
      .catch(() => {
        /* مهمان یا خطا — چیدمان پیش‌فرض */
      })
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [])

  if (err) return <EmptyState emoji="⚠️" title="خطا در بارگذاری داشبورد" hint={err} />
  if (!data) {
    return (
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="glow-card h-20 animate-pulse rounded-2xl bg-card/60" />
        ))}
      </div>
    )
  }

  const k = data.kpi
  const role = ctx.user!.role
  const isManager = ['GM', 'OM', 'OWNER', 'PM'].includes(role)
  const canScience = canAccess('science', role, ctx.user!.secondaryRoles)
  const todayV = todayIso()

  const pipelineData = ['SUBMITTED', 'APPROVED', 'RECEIVING', 'RECEIVED', 'VERIFIED', 'ACCOUNTED', 'DONE'].map((s) => ({
    label: ORDER_STATUSES[s].label,
    value: k.byStatus[s] || 0,
  }))

  // ── سری‌های ۱۴روزه: دو خط کوچک کنار هم (تعداد سفارش + مبلغ فروش) ──
  const dayLabel = (iso: string) => formatJalaliShort(iso).slice(5)
  const seriesOrders = (data.series || []).map((s: any) => ({ label: dayLabel(s.day), value: s.count, extra: `${faNum(s.count)} سفارش در این روز` }))
  const seriesSales = (data.series || []).map((s: any) => ({ label: dayLabel(s.day), value: s.amount, extra: `${faMoney(s.amount)} تومان` }))
  const compactToman = (v: number) => (v >= 1e6 ? `${faNum(Math.round(v / 1e6))} م` : faMoney(v))

  // ── تحلیل ABC: سهم دسته‌ها + پرفروش‌ترین کالاها (ارزش تقاضای سالانه) ──
  const abcRows = abc?.rows || []
  const catAgg: Record<string, number> = {}
  for (const r of abcRows) catAgg[r.category] = (catAgg[r.category] || 0) + (r.annualValue || 0)
  const catDonut = Object.entries(catAgg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value: Math.round(value / 1e6) }))
  const topProducts = abcRows.slice(0, 6).map((r) => ({
    label: r.name,
    value: Math.round((r.annualValue || 0) / 1e6),
    color: r.cls === 'A' ? '#0e7a4a' : r.cls === 'B' ? '#c9a227' : '#c96f4a',
  }))

  /* ── بدنهٔ هر ویجت — همهٔ منطق داده همان قبلی است، فقط قالب‌بندیِ شبکه عوض شده ── */
  const body: Record<string, () => React.ReactNode> = {
    hero: () => (
      <section className="hero-emerald gold-glow-border relative h-full overflow-hidden rounded-2xl p-4 sm:p-5">
        <svg className="hero-ornament tl" width="150" height="84" viewBox="0 0 150 84" fill="none" stroke="#c9a227" strokeWidth="1.4">
          <path d="M6 62 C28 60 42 44 48 24 C54 44 66 58 88 62 M48 24 C50 36 56 50 68 58" />
          <circle cx="48" cy="21" r="3.5" fill="#c9a227" stroke="none" />
          <ellipse cx="26" cy="58" rx="6" ry="3" transform="rotate(-18 26 58)" opacity="0.8" />
          <ellipse cx="72" cy="56" rx="6" ry="3" transform="rotate(14 72 56)" opacity="0.8" />
          <path d="M100 70 C116 66 126 54 132 40 C136 54 144 62 148 64" opacity="0.6" />
          <circle cx="132" cy="36" r="2.5" fill="#93c572" stroke="none" />
        </svg>
        <svg className="hero-ornament br" width="150" height="84" viewBox="0 0 150 84" fill="none" stroke="#c9a227" strokeWidth="1.4">
          <path d="M6 62 C28 60 42 44 48 24 C54 44 66 58 88 62 M48 24 C50 36 56 50 68 58" />
          <circle cx="48" cy="21" r="3.5" fill="#c9a227" stroke="none" />
          <ellipse cx="26" cy="58" rx="6" ry="3" transform="rotate(-18 26 58)" opacity="0.8" />
          <ellipse cx="72" cy="56" rx="6" ry="3" transform="rotate(14 72 56)" opacity="0.8" />
          <path d="M100 70 C116 66 126 54 132 40 C136 54 144 62 148 64" opacity="0.6" />
          <circle cx="132" cy="36" r="2.5" fill="#93c572" stroke="none" />
        </svg>
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-[#93c572]">{new Intl.DateTimeFormat('fa-IR', { dateStyle: 'full' }).format(new Date())}</p>
            <h2 className="mt-0.5 text-lg font-black text-white sm:text-xl">
              سلام {ctx.user!.name.split(' ')[0]} عزیز 👋
            </h2>
            <p className="mt-1 max-w-lg text-[11px] leading-5 text-[#cfe3d4]">
              {k.myOpenTasks > 0
                ? `${faNum(k.myOpenTasks)} وظیفه باز دارید و ${faNum(k.todayDeliveries)} مرسوله امروز به فروشگاه می‌رسد. با هم پیش می‌رویم! 🌿`
                : 'امروز وظیفه‌ای بر عهده شما نیست — وقت خوبی برای ایده‌های تازه است ✨'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isManager && (
              <button
                onClick={() => ctx.navigate('briefing')}
                className="flex items-center gap-2 rounded-xl border border-[#c9a227]/50 bg-[#c9a227]/15 px-3 py-2 text-right backdrop-blur transition hover:bg-[#c9a227]/25"
              >
                <span className="text-xl">🌅</span>
                <span>
                  <span className="block text-[11px] font-black text-white">صبح‌نامه امروز</span>
                  <span className="block text-[9px] text-[#93c572]">گزارش چاپی جلسه صبح</span>
                </span>
              </button>
            )}
            <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 backdrop-blur">
              <Sparkles className="text-[#c9a227]" size={18} />
              <div>
                <p className="text-[11px] font-black leading-4 text-white">{faNum(ctx.user!.points)}</p>
                <p className="block text-[9px] text-[#93c572]">امتیاز شما — آفرین!</p>
              </div>
            </div>
          </div>
        </div>
        <div className="shimmer-line absolute bottom-0 right-0 h-1 w-full" />
      </section>
    ),

    'kpi-band': () => (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <KpiMini label="سفارش‌های در جریان" value={faNum(k.ordersTotal - (k.byStatus['DONE'] || 0) - (k.byStatus['CANCELLED'] || 0))} hint="در چرخهٔ تأمین از تأیید تا ثبت نهایی" tone="emerald" icon={<ClipboardList size={16} />} onClick={() => ctx.navigate('orders')} />
        {k.overdueCount > 0 ? (
          <KpiMini label="سفارش سرآمده ⚠️" value={faNum(k.overdueCount)} hint="تحویل با تأخیر — فالوآپ" tone="rose" icon={<Truck size={16} />} onClick={() => ctx.navigate('orders')} />
        ) : (
          <KpiMini label="مرسوله‌های امروز" value={faNum(k.todayDeliveries)} hint="برای دریافت امروز" tone="olive" icon={<Truck size={16} />} onClick={() => ctx.navigate('receiving')} />
        )}
        <KpiMini label="کالاهای رو به اتمام" value={faNum(k.lowStockCount)} hint={`${faNum(k.outOfStockCount)} قلم ناموجود`} tone={k.lowStockCount > 0 ? 'gold' : 'emerald'} icon={<ShoppingBasket size={16} />} onClick={() => ctx.navigate('products')} />
        <KpiMini label="چک‌های نزدیک" value={faNum(k.pendingCheques)} hint={`${faMoney(k.pendingChequesAmount)} تومان — ${faNum(k.signedCheques)} چک آماده تحویل`} tone="terra" icon={<Banknote size={16} />} onClick={() => ctx.navigate('cheques')} />
        <KpiMini label="وظایف باز من" value={faNum(k.myOpenTasks)} hint="وظایف باز امروز شما" tone="emerald" icon={<ListChecks size={16} />} onClick={() => ctx.navigate('tasks')} />
        <KpiMini label="پیام ناخوانده" value={faNum(k.unreadMessages)} hint="پیام‌های ناخواندهٔ صندوق پیام" tone={k.unreadMessages > 0 ? 'rose' : 'emerald'} icon={<MessageCircle size={16} />} onClick={() => ctx.navigate('messages')} />
      </div>
    ),

    'queue-pricecheck': () => (
      <QueueTile
        title="کنترل قیمت امروز ⏳"
        count={k.priceCheckRemaining}
        desc={k.priceCheckRed > 0 ? `${faNum(k.priceCheckRed)} کالا حاشیه بحرانی زیر ۱۰٪ دارد` : 'قیمت چاپ‌شده هنوز امروز تأیید نشده'}
        tone={k.priceCheckRed > 0 ? '#b3372f' : '#a16207'}
        onClick={() => ctx.navigate('pricecheck')}
        cta="بازکردن تابلوی کنترل قیمت"
      />
    ),

    'queue-helo': () => (
      <div className="glow-card flex h-full flex-col rounded-2xl bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-black text-foreground">در انتظار ثبت در هلو</p>
          <span className="shrink-0 rounded-lg bg-[#c9a227]/10 px-2 py-0.5 text-base font-black text-[#8a6d10]">{faNum(k.toAccountCount)}</span>
        </div>
        <div className="mt-1.5 min-h-0 flex-1 space-y-1">
          {data.toAccount.map((o: any) => (
            <button key={o.id} onClick={() => ctx.navigate('accounting', o.id)} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-white/70 px-2 py-1.5 text-right transition hover:bg-white">
              <span className="min-w-0 truncate text-[11px] font-bold">
                <span dir="ltr" className="font-mono text-[10px] text-[#8a5a2b]">{o.code}</span> · {o.providerName}
              </span>
              <span className="shrink-0 text-[10px] font-black text-[#8a6d10]">{faMoney(o.totalAmount)}</span>
            </button>
          ))}
        </div>
        <button onClick={() => ctx.navigate('accounting')} className="mt-2 min-h-11 w-full rounded-lg bg-[#c9a227]/15 py-2 text-[11px] font-black text-[#8a6d10] transition hover:bg-[#c9a227]/25">
          بازکردن حسابداری ←
        </button>
      </div>
    ),

    'queue-verify': () => (
      <QueueTile
        title="در انتظار تأیید انبار"
        count={k.toVerifyCount}
        desc="مرسوله‌های دریافتی که سرپرست انبار باید تأیید کند"
        tone="#77934a"
        onClick={() => ctx.navigate('verify')}
        cta="بازکردن تأیید انبار"
      />
    ),

    'queue-cashier': () => (
      <QueueTile
        title="صف پیش‌فاکتورهای فروش"
        count={k.cashierQueue}
        desc="فروشندگان برای مشتریان سفارش ثبت کرده‌اند — آمادهٔ پردازش صندوق"
        tone="#c9a227"
        onClick={() => ctx.navigate('sales')}
        cta="بازکردن بخش فروش"
      />
    ),

    'my-tasks': () => (
      <SectionCard
        title="وظایف من"
        subtitle={k.myOpenTasks > 0 ? `${faNum(k.myOpenTasks)} وظیفهٔ باز در انتظار شماست` : 'امروز فاقد وظیفهٔ باز'}
        icon={<ListChecks size={18} />}
        className="h-full sm:p-4"
      >
        {data.myTasks.length === 0 ? (
          <EmptyState emoji="🌤️" title="فعلاً وظیفه‌ای ندارید" hint="وقت خوبی برای یادگیری بخش راهنماست" />
        ) : (
          <ul className="space-y-2">
            {data.myTasks.map((t: any) => {
              const due = t.dueDate ? daysBetween(String(t.dueDate).slice(0, 10), todayV) : null
              return (
                <Row key={t.id} onClick={() => ctx.navigate('tasks')}>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold">{t.title}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Pill label={TASK_STATUSES[t.status]?.label || t.status} color={TASK_STATUSES[t.status]?.color || '#6d7a6e'} />
                    <Pill label={PRIORITIES[t.priority]?.label || t.priority} color={PRIORITIES[t.priority]?.color || '#6d7a6e'} />
                  </span>
                  {due !== null && (
                    <span className={cn('w-full shrink-0 text-[10px] font-black sm:w-auto', due < 0 ? 'text-[#b3372f]' : due === 0 ? 'text-[#8a6d10]' : 'text-muted-foreground')}>
                      🗓 {formatJalaliFull(String(t.dueDate).slice(0, 10))}
                      {due < 0 ? ' — دیرکرد!' : due === 0 ? ' — امروز!' : ''}
                    </span>
                  )}
                </Row>
              )
            })}
          </ul>
        )}
        <ViewAll label="مشاهدهٔ همهٔ وظایف" onClick={() => ctx.navigate('tasks')} />
      </SectionCard>
    ),

    'today-deliveries': () => (
      <SectionCard
        title="مرسوله‌های امروز"
        subtitle={k.todayDeliveries > 0 ? `${faNum(k.todayDeliveries)} مرسوله برای دریافت` : 'امروز مرسوله‌ای در راه نیست'}
        icon={<Truck size={18} />}
        className="h-full sm:p-4"
      >
        {data.todayDeliveriesList.length === 0 ? (
          <EmptyState emoji="📦" title="مرسوله‌ای برای امروز ثبت نشده" />
        ) : (
          <ul className="space-y-2">
            {data.todayDeliveriesList.map((o: any) => (
              <Row key={o.id} onClick={() => ctx.navigate('receiving', o.id)}>
                <span className="min-w-0 truncate text-xs font-bold">
                  <span dir="ltr" className="font-mono text-[10px] text-[#8a5a2b]">{o.code}</span> · {o.providerName}
                </span>
                <Pill label={ORDER_STATUSES[o.status]?.label || o.status} color={ORDER_STATUSES[o.status]?.color || '#6d7a6e'} />
              </Row>
            ))}
          </ul>
        )}
        <ViewAll label="بازکردن دریافت" onClick={() => ctx.navigate('receiving')} />
      </SectionCard>
    ),

    'overdue-orders': () => (
      <SectionCard title="سفارش‌های سرآمده ⚠️" subtitle="تحویل با تأخیر — پیگیری کنید" icon={<AlertTriangle size={18} />} className="h-full border-[#b3372f]/40 sm:p-4">
        <ul className="space-y-2">
          {data.overdueOrders.map((o: any) => {
            const late = daysBetween(todayV, String(o.deliveryDate).slice(0, 10))
            return (
              <Row key={o.id} onClick={() => ctx.navigate('orders', o.id)} className="bg-[#fee2e2]/40">
                <span className="min-w-0 truncate text-xs font-bold">
                  <span dir="ltr" className="font-mono text-[10px] text-[#8a5a2b]">{o.code}</span> · {o.providerName}
                </span>
                <DueChip days={-late} />
              </Row>
            )
          })}
        </ul>
        <ViewAll label="مشاهدهٔ همه در سفارش‌ها" onClick={() => ctx.navigate('orders')} />
      </SectionCard>
    ),

    'pending-cheques': () => (
      <SectionCard
        title="چک‌های در انتظار امضا"
        subtitle={k.pendingCheques > 0 ? `${faNum(k.pendingCheques)} چک — ${faMoney(k.pendingChequesAmount)} تومان` : 'صف امضا خالی است'}
        icon={<Banknote size={18} />}
        className="h-full sm:p-4"
      >
        {data.pendingChequesList.length === 0 ? (
          <EmptyState emoji="🧾" title="چکی در صف امضا نیست" hint="چک‌های جدید پس از ثبت سفارش اینجا ظاهر می‌شوند" />
        ) : (
          <ul className="space-y-2">
            {data.pendingChequesList.map((c: any) => {
              const due = daysBetween(String(c.dueDate).slice(0, 10), todayV)
              return (
                <Row key={c.id} onClick={() => ctx.navigate('cheques')}>
                  <span className="min-w-0 truncate text-xs font-bold">
                    {c.recipientName}
                    {c.orderCode ? <span className="mr-1 text-[10px] font-bold text-muted-foreground"> · <span dir="ltr" className="font-mono">{c.orderCode}</span></span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground">{formatJalaliShort(c.dueDate)}</span>
                    <DueChip days={due} />
                    <span className="text-xs font-black text-[#8a6d10]">{faMoney(c.amount)}</span>
                  </span>
                </Row>
              )
            })}
          </ul>
        )}
        <ViewAll label="مشاهدهٔ همهٔ چک‌ها" onClick={() => ctx.navigate('cheques')} />
      </SectionCard>
    ),

    'customer-reqs': () => (
      <SectionCard
        title="درخواست‌های فوری مشتریان"
        subtitle="پرتقاضاترین کالاهایی که مشتری دنبالش بود و نداشتیم"
        icon={<MessageCircle size={18} />}
        className="h-full sm:p-4"
      >
        {data.customerReqs.length === 0 ? (
          <EmptyState emoji="🛒" title="درخواستی ثبت نشده" />
        ) : (
          <ul className="space-y-2">
            {data.customerReqs.slice(0, 5).map((r: any) => (
              <Row key={r.id} onClick={() => ctx.navigate('sales')}>
                <span className="min-w-0 truncate text-xs font-bold">
                  {r.productName}
                  {r.notes ? <span className="mr-1 hidden text-[10px] font-bold text-muted-foreground sm:inline"> — {r.notes}</span> : null}
                </span>
                <span className="shrink-0 rounded-full bg-[#b3372f]/10 px-2 py-0.5 text-[11px] font-black text-[#b3372f]">{faNum(r.count)} بار</span>
              </Row>
            ))}
          </ul>
        )}
        <ViewAll label="مشاهدهٔ همه در بخش فروش" onClick={() => ctx.navigate('sales')} />
      </SectionCard>
    ),

    'digital-wall': () => (
      <SectionCard title="دیجیتال‌وال" subtitle="آخرین خبرهای تیم" icon={<Newspaper size={18} />} className="h-full sm:p-4">
        {data.wall.length === 0 ? (
          <EmptyState emoji="📰" title="دیوار ساکت است" hint="اولین خبر را شما بنویسید!" />
        ) : (
          <ul className="scroll-gold max-h-96 space-y-2 overflow-y-auto pl-1">
            {data.wall.map((w: any) => (
              <li key={w.id} className="rounded-xl border border-border/60 bg-white/60 p-2.5">
                <p className="text-xs font-extrabold">{w.pinned ? '📌 ' : ''}{w.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{w.content}</p>
                <p className="mt-1 text-[10px] font-bold text-primary">{w.authorName}</p>
              </li>
            ))}
          </ul>
        )}
        <ViewAll label="مشاهدهٔ همهٔ دیوار" onClick={() => ctx.navigate('wall')} />
      </SectionCard>
    ),

    'week-trends': () => (
      <SectionCard title="سفارش‌ها و فروش ۱۴ روز اخیر" subtitle="تعداد سفارش و مبلغ فروش هر روز — روند دو هفته" icon={<TrendingUp size={18} />} className="h-full sm:p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-black text-[#0e7a4a]">تعداد سفارش روزانه</p>
            <LineChart data={seriesOrders} color="#0e7a4a" height={130} formatValue={(v) => `${faNum(v)} سفارش`} formatLabel={(l) => l} />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-black text-[#8a6d10]">مبلغ فروش روزانه (تومان)</p>
            <LineChart data={seriesSales} color="#c9a227" height={130} formatValue={compactToman} formatLabel={(l) => l} />
          </div>
        </div>
      </SectionCard>
    ),

    'pipeline-donut': () => (
      <SectionCard title="گردش سفارش‌ها" subtitle="وضعیت همهٔ سفارش‌ها در یک نگاه" icon={<PieChart size={18} />} className="h-full sm:p-4">
        <Donut data={pipelineData} centerLabel="کل سفارش‌ها" centerValue={faNum(k.ordersTotal)} size={150} />
      </SectionCard>
    ),

    'cheque-schedule': () => (
      <SectionCard title="سررسید چک‌ها (۸ هفته آینده)" subtitle="برنامهٔ مالی هفتگی — مبلغ تومان" icon={<Banknote size={18} />} className="h-full sm:p-4">
        <BarChart
          data={data.chequeSeries.map((s: any) => ({ label: formatJalaliShort(s.week).slice(5), value: s.amount }))}
          color="#c9a227"
          height={150}
          formatValue={(v) => `${faMoney(v)} تومان`}
        />
      </SectionCard>
    ),

    'team-leaderboard': () => (
      <SectionCard
        title="جدول امتیاز تیم 🏆"
        subtitle="قدردانی مدیران از تلاش همکاران"
        icon={<Trophy size={18} />}
        className="h-full sm:p-4"
        actions={
          <button onClick={() => ctx.navigate('perf')} className="min-h-11 rounded-xl bg-secondary px-3 py-2 text-[11px] font-extrabold text-secondary-foreground transition hover:bg-[#dcead4]">
            جدول کامل ←
          </button>
        }
      >
        <RankBars data={data.leaderboard.map((l: any) => ({ label: l.name, value: l.points, color: l.color }))} formatValue={(v) => faNum(v)} />
      </SectionCard>
    ),

    'abc-categories': () => (
      <SectionCard
        title="سهم دسته‌بندی کالا از تقاضا"
        subtitle="تحلیل ABC — ارزش تقاضای سالانه (میلیون تومان)"
        icon={<PieChart size={18} />}
        className="h-full sm:p-4"
      >
        <Donut data={catDonut} centerLabel="دسته‌ها" size={150} />
      </SectionCard>
    ),

    'top-products': () => (
      <SectionCard
        title="پرفروش‌ترین کالاها"
        subtitle="برترین‌ها بر پایهٔ ارزش تقاضای سالانه (میلیون تومان) — رنگ بر پایهٔ کلاس A/B/C"
        icon={<ShoppingBasket size={18} />}
        className="h-full sm:p-4"
      >
        <RankBars data={topProducts} formatValue={(v) => `${faNum(v)} م`} />
      </SectionCard>
    ),

    'expiring-items': () => (
      <SectionCard
        title="نزدیک به انقضا ⏳"
        subtitle="اقلام ثبت‌شده در دریافت که تا ۱۴ روز آینده تمام می‌شوند — جلوتر از قفسه بفروشید یا تخفیف بزنید"
        icon={<AlertTriangle size={18} />}
        className="h-full border-[#c96f4a]/40 sm:p-4"
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {data.expiring.map((e: any) => (
            <div key={e.id} className={`rounded-xl border p-2.5 ${e.daysLeft <= 3 ? 'border-[#b3372f]/40 bg-[#fee2e2]/50' : e.daysLeft <= 7 ? 'border-[#a16207]/40 bg-[#fef9c3]/50' : 'border-border bg-white/70'}`}>
              <p className="line-clamp-2 text-xs font-extrabold">{e.productName}</p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{faNum(e.qty)} قلم</span>
                <span className={`text-[11px] font-black ${e.daysLeft <= 3 ? 'text-[#b3372f]' : e.daysLeft <= 7 ? 'text-[#a16207]' : 'text-[#0e7a4a]'}`}>
                  {e.daysLeft < 0 ? 'منقضی شده!' : `${faNum(e.daysLeft)} روز مانده`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    ),

    'customer-reqs-full': () => (
      <SectionCard
        title="درخواست‌های مشتریان — فهرست کامل"
        subtitle="کالاهایی که مشتری دنبالش بود و نداشتیم — مبنای تصمیم تأمین"
        icon={<MessageCircle size={18} />}
        className="h-full sm:p-4"
      >
        {data.customerReqs.length === 0 ? (
          <EmptyState emoji="🛒" title="درخواستی ثبت نشده" hint="فروشندگان از بخش فروش درخواست ثبت می‌کنند" />
        ) : (
          <ul className="space-y-2">
            {data.customerReqs.map((r: any) => (
              <Row key={r.id} onClick={() => ctx.navigate('sales')}>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold">{r.productName}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {r.notes ? `${r.notes} · ` : ''}
                    {r.lastByName ? `آخرین: ${r.lastByName}` : '—'}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-[#b3372f]/10 px-2 py-0.5 text-[11px] font-black text-[#b3372f]">{faNum(r.count)} بار</span>
              </Row>
            ))}
          </ul>
        )}
        <ViewAll label="مدیریت درخواست‌ها در بخش فروش" onClick={() => ctx.navigate('sales')} />
      </SectionCard>
    ),
  }

  /** آیا ویجت با نقش و دادهٔ فعلی قابل رندر است؟ (منطق دسترسی/دادهٔ قبلی، دست‌نخورده) */
  const renderable = (id: string): boolean => {
    switch (id) {
      case 'queue-pricecheck':
        return canAccess('pricecheck', role, ctx.user!.secondaryRoles) && k.priceCheckRemaining > 0
      case 'queue-helo':
        return ['ACC', 'OM', 'OWNER'].includes(role) && k.toAccountCount > 0
      case 'queue-verify':
        return ['SK', 'OM', 'GM'].includes(role) && k.toVerifyCount > 0
      case 'queue-cashier':
        return k.cashierQueue > 0 && ['HC', 'CASHIER', 'GM'].includes(role)
      case 'overdue-orders':
        return k.overdueCount > 0
      case 'abc-categories':
        return canScience && catDonut.length > 0
      case 'top-products':
        return canScience && topProducts.length > 0
      case 'expiring-items':
        return ['GM', 'OM', 'SK', 'ACC', 'HC'].includes(role) && data.expiring?.length > 0
      default:
        return !!body[id]
    }
  }

  const visibleWidgets = resolveDashWidgets(prefs)
  const itemsFor = (t: DashTab) => visibleWidgets.filter((w) => w.tab === t && renderable(w.id))

  /* ── گفت‌وگوی شخصی‌سازی ── */
  const openPrefs = () => {
    // پیش‌نویس با «ترتیب کامل» (انتخاب کاربر + باقی به ترتیب ثبت) — پیکان‌ها روی همه کار می‌کنند
    setDraft({ hidden: [...prefs.hidden], order: resolveDashOrder(prefs) })
    setPrefOpen(true)
  }

  /** شبکهٔ ویجت‌ها با ردیف‌های همیشه پُر (packRows) — هیچ ربع خالیِ ۱/۴ وجود ندارد */
  const renderGrid = (t: DashTab, label: string) => {
    const items = itemsFor(t)
    if (items.length === 0) {
      return (
        <div className="glow-card rounded-2xl bg-card p-6 text-center" aria-label={label}>
          <p className="text-sm font-black text-foreground">همهٔ بخش‌های این برگه مخفی شده‌اند 🫥</p>
          <p className="mt-1 text-xs text-muted-foreground">از «شخصی‌سازی» برگردانید یا به برگهٔ دیگر بروید</p>
          <Button
            variant="outline"
            className="mt-3 min-h-11 gap-1.5 rounded-xl border-[#c9a227]/50 bg-[#c9a227]/10 text-xs font-black text-[#8a6d10] hover:bg-[#c9a227]/20"
            onClick={() => openPrefs()}
          >
            <Settings size={15} />
            شخصی‌سازی داشبورد
          </Button>
        </div>
      )
    }
    return (
      <div
        role="tabpanel"
        aria-label={label}
        className="fade-in-up grid grid-flow-dense grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {packRows(items).map(({ item, colSpan }) => (
          <div key={item.id} className={spanCls(colSpan)}>
            {body[item.id]()}
          </div>
        ))}
      </div>
    )
  }

  const toggleWidget = (id: string, show: boolean) =>
    setDraft((d) => ({
      ...d,
      hidden: show ? d.hidden.filter((h) => h !== id) : d.hidden.includes(id) ? d.hidden : [...d.hidden, id],
    }))

  /** جابه‌جایی ترتیب درون گروه خود ویجت — مرز برگه‌ها رد نمی‌شود */
  const moveWidget = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const order = [...d.order]
      const grp = getDashWidget(id)?.tab
      if (!grp) return d
      const grpIdx = order.map((w, i) => (getDashWidget(w)?.tab === grp ? i : -1)).filter((i) => i >= 0)
      const pos = grpIdx.indexOf(order.indexOf(id))
      const swapWith = grpIdx[pos + dir]
      if (pos < 0 || swapWith === undefined) return d
      ;[order[grpIdx[pos]], order[swapWith]] = [order[swapWith], order[grpIdx[pos]]]
      return { ...d, order }
    })

  const savePrefs = async () => {
    setSaving(true)
    const prev = prefs
    setPrefs({ hidden: [...draft.hidden], order: [...draft.order] }) // به‌روزرسانی خوش‌بینانه
    setPrefOpen(false)
    try {
      const d = await api<{ dash?: DashPrefs }>('/api/me/dashboard', {
        method: 'PUT',
        body: { hidden: draft.hidden, order: draft.order },
      })
      if (d?.dash) setPrefs({ hidden: d.dash.hidden || [], order: d.dash.order || [] })
      toast.success('چیدمان داشبورد شما ذخیره شد 🌿')
    } catch (e: any) {
      setPrefs(prev)
      toast.error(e?.message || 'ذخیرهٔ چیدمان ناموفق بود')
    } finally {
      setSaving(false)
    }
  }

  const draftWidgets = draft.order.map((id) => getDashWidget(id)).filter((w): w is NonNullable<typeof w> => !!w)
  const tabWidgets = (t: DashTab) => draftWidgets.filter((w) => w.tab === t)

  return (
    <div className="space-y-4">
      {/* ── بخش همیشه‌نما — شبکهٔ ردیف‌پُر ── */}
      {renderGrid('always', 'بخش‌های همیشه‌نمای داشبورد')}

      {/* ── سگمنت «امروز من» / «نگاه هفته» + دکمهٔ شخصی‌سازی ── */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SegTabs tab={tab} onChange={setTab} />
        </div>
        <Button
          onClick={() => openPrefs()}
          variant="outline"
          aria-label="شخصی‌سازی داشبورد"
          className="min-h-11 shrink-0 gap-1.5 rounded-xl border-[#c9a227]/50 bg-[#c9a227]/10 px-3 text-xs font-black text-[#8a6d10] shadow-none hover:bg-[#c9a227]/20"
        >
          <Settings size={15} />
          شخصی‌سازی
        </Button>
      </div>

      {/* ═══════════════ برگهٔ فعال — شبکهٔ ویجت‌های شخصی‌سازی‌شده ═══════════════ */}
      {tab === 'today' && renderGrid('today', 'امروز من')}
      {tab === 'week' && renderGrid('week', 'نگاه هفته')}

      {/* ═══════════════ گفت‌وگوی شخصی‌سازی داشبورد ═══════════════ */}
      <Dialog open={prefOpen} onOpenChange={setPrefOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c9a227]/15 text-[#8a6d10]">
                <Settings size={16} />
              </span>
              شخصی‌سازی داشبورد
            </DialogTitle>
            <DialogDescription className="text-right">
              بخش‌های دلخواه را نشان دهید یا پنهان کنید و ترتیب‌شان را بچینید — تنظیمات فقط برای حساب شما ذخیره می‌شود.
            </DialogDescription>
          </DialogHeader>

          <div className="scroll-gold max-h-[55vh] space-y-4 overflow-y-auto pl-1">
            {(['always', 'today', 'week'] as DashTab[]).map((grp) => {
              const list = tabWidgets(grp)
              if (list.length === 0) return null
              return (
                <div key={grp}>
                  <p className="mb-1.5 text-[11px] font-black text-muted-foreground">{DASH_TAB_LABELS[grp]}</p>
                  <ul className="space-y-1.5">
                    {list.map((w) => {
                      const visible = !draft.hidden.includes(w.id)
                      const grpPos = list.indexOf(w)
                      return (
                        <li
                          key={w.id}
                          className={cn(
                            'flex items-center gap-2 rounded-xl border border-border/60 bg-white/60 p-2 transition',
                            !visible && 'opacity-55'
                          )}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0e7a4a]/10 text-[#0e7a4a]">
                            <WidgetGlyph name={w.icon} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-black text-foreground">{w.titleFa}</span>
                            <span className="block truncate text-[10px] leading-4 text-muted-foreground">{w.descFa}</span>
                          </span>
                          <span
                            title={`پهنای پیش‌فرض: ${faNum(w.span)} از ۴ ستون`}
                            className="hidden shrink-0 rounded-lg bg-secondary px-1.5 py-0.5 text-[10px] font-black text-secondary-foreground sm:block"
                          >
                            عرض {faNum(w.span)}
                          </span>
                          <span className="flex shrink-0 flex-col">
                            <button
                              type="button"
                              aria-label={`بالاتر: ${w.titleFa}`}
                              disabled={grpPos === 0}
                              onClick={() => moveWidget(w.id, -1)}
                              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-25"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              type="button"
                              aria-label={`پایین‌تر: ${w.titleFa}`}
                              disabled={grpPos === list.length - 1}
                              onClick={() => moveWidget(w.id, 1)}
                              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-25"
                            >
                              <ChevronDown size={14} />
                            </button>
                          </span>
                          <Switch checked={visible} onCheckedChange={(v) => toggleWidget(w.id, v)} aria-label={`نمایش ${w.titleFa}`} />
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>

          <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-border/60 pt-3 sm:justify-between">
            <Button
              variant="ghost"
              onClick={() => setDraft({ hidden: [], order: [] })}
              className="min-h-11 gap-1.5 rounded-xl text-xs font-black text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <RotateCcw size={14} />
              بازنشانی به پیش‌فرض
            </Button>
            <Button
              onClick={() => savePrefs()}
              disabled={saving}
              className="min-h-11 min-w-28 gap-1.5 rounded-xl bg-[#0e7a4a] text-xs font-black text-white hover:bg-[#0b6138]"
            >
              {saving ? 'در حال ذخیره…' : 'ذخیرهٔ چیدمان'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
