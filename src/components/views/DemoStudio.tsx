'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { AppCtx, SectionCard, StatCard, Pill, EmptyState } from '@/components/app/ui-bits'
import { BarChart, LineChart, Donut } from '@/components/app/charts'
import { ORDER_STATUSES, CATEGORY_EMOJI } from '@/lib/constants'
import { faNum, faMoney, formatJalaliShort } from '@/lib/jalali'
import { cn } from '@/lib/utils'
import {
  Presentation, Sparkles, Building2, Play, Trash2, Clock, Users, Wallet, TrendingUp,
  ClipboardList, Banknote, Trash2 as TrashIcon, Map, RotateCcw, ArrowLeft,
} from 'lucide-react'

type DemoProfileKey = 'gourmet_chain' | 'hypermarket' | 'boutique' | 'neighborhood'
type Profiles = Record<DemoProfileKey, { name: string; tag: string; desc: string; icon: string; scale: string }>
type DemoListItem = { id: string; name: string; profile: string; branchCount: number; description: string; createdAt: string; createdByName: string }
type DemoData = {
  profile: string; profileName: string; tag: string; desc: string; icon: string; scale: string
  branches: { name: string; city: string; area: string; sizeM2: number; staff: number; revenue: number; orders: number; margin: number; shrink: number }[]
  staff: { id: string; name: string; role: string; branch: string; color: string }[]
  providers: { id: string; name: string; company: string; type: string; personName: string; phone: string }[]
  productsCount: number
  categories: string[]
  orders: { code: string; branch: string; providerName: string; status: string; date: string; payMethod: string; totalAmount: number; marginPct: number; items: { productName: string; qty: number }[] }[]
  cheques: { number: string; orderCode: string; amount: number; recipientName: string; writtenAt: string; dueDate: string; status: string }[]
  waste: { productName: string; category: string; qty: number; unit: string; reason: string; estValue: number; forDate: string }[]
  salesSeries: { date: string; value: number }[]
  tasks: { title: string; assignedTo: string; status: string; priority: string; points: number }[]
  topProducts: { name: string; sold: number; revenue: number }[]
  kpis: { revenue90: number; ordersCount: number; avgMargin: number; chequeCount: number; chequeValue: number; wasteCount: number; wasteValue: number; shrinkPct: number; staffCount: number }
  roi: { platformFee: number; monthly: { hoursSaved: number; laborValueSaved: number; shrinkSaved: number; wasteSaved: number; stockoutRecovered: number }; monthlyBenefit: number; roiPct: number; paybackDays: number; assumptions: string[] }
  story: { time: string; title: string; detail: string; feature: string }[]
  generatedAt: string
  generatedBy: string
}

const CHEQUE_FA: Record<string, { label: string; color: string }> = {
  PENDING_OWNER: { label: 'در انتظار امضا', color: '#a16207' },
  SIGNED: { label: 'امضا شد', color: '#166534' },
  DELIVERED: { label: 'تحویل شد', color: '#1e40af' },
  CLEARED: { label: 'پاس شد', color: '#3f6212' },
}
const WASTE_FA: Record<string, string> = { EXPIRED: 'انقضا', DAMAGED: 'آسیب', SPOILED: 'فاسد', THEFT: 'سرقت' }
const DEMO_SECTION_TABS = [
  { key: 'overview', label: 'نمای کلی', icon: Map },
  { key: 'orders', label: 'سفارش‌ها', icon: ClipboardList },
  { key: 'cheques', label: 'چک‌ها', icon: Banknote },
  { key: 'people', label: 'تیم و تأمین‌کننده', icon: Users },
  { key: 'story', label: 'یک روز با سامانه', icon: Clock },
  { key: 'roi', label: 'ارزش‌آفرینی (ROI)', icon: TrendingUp },
] as const

export default function DemoStudioView({ ctx }: { ctx: AppCtx }) {
  const [profiles, setProfiles] = useState<Profiles | null>(null)
  const [demos, setDemos] = useState<DemoListItem[]>([])
  const [generating, setGenerating] = useState<string | null>(null)
  const [active, setActive] = useState<DemoData | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tab, setTab] = useState<(typeof DEMO_SECTION_TABS)[number]['key']>('overview')

  const loadList = useCallback(async () => {
    try {
      const d = await api<{ demos: DemoListItem[]; profiles: Profiles }>('/api/demo')
      setDemos(d.demos)
      setProfiles(d.profiles)
    } catch (e: any) {
      toast.error(e.message)
    }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  const generate = async (profile: DemoProfileKey) => {
    setGenerating(profile)
    try {
      const d = await api<{ demo: any; data: DemoData }>('/api/demo', { method: 'POST', body: { profile } })
      setActive(d.data)
      setActiveId(d.demo.id)
      setTab('overview')
      toast.success(`دموی «${d.data.profileName}» ساخته شد 🎬`)
      loadList()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setGenerating(null)
    }
  }

  const openDemo = async (id: string) => {
    try {
      const d = await api<{ demo: { data: DemoData } }>(`/api/demo?id=${id}`)
      setActive(d.demo.data)
      setActiveId(id)
      setTab('overview')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  /* ── explorer ── */
  if (active) {
    const k = active.kpis
    return (
      <div className="space-y-5">
        {/* demo banner */}
        <div className="glow-card relative overflow-hidden rounded-2xl p-5 text-white sm:p-6" style={{ background: 'linear-gradient(to left, #4a2b0b, #7a5a10 52%, #4a2b0b)' }}>
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-3xl backdrop-blur">{active.icon}</span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-black sm:text-2xl">{active.profileName}</h1>
                  <span className="rounded-full bg-[#b3372f] px-3 py-1 text-[10px] font-black shadow-lg">حالت نمایشی — داده شبیه‌سازی‌شده</span>
                </div>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-[#fdf6dd]/90">{active.desc}</p>
                <p className="mt-1 text-[11px] font-bold text-[#f3d573]">{active.scale}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setActive(null); setActiveId(null) }} className="flex items-center gap-1.5 rounded-xl bg-white/15 px-4 py-2.5 text-xs font-black backdrop-blur transition hover:bg-white/25">
                <ArrowLeft size={14} /> بازگشت به استودیو
              </button>
              {activeId && (
                <button
                  onClick={async () => {
                    try {
                      await api(`/api/demo?id=${activeId}`, { method: 'DELETE' })
                      setActive(null)
                      setActiveId(null)
                      loadList()
                      toast.success('دمو حذف شد')
                    } catch (e: any) {
                      toast.error(e.message)
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-[#b3372f] px-4 py-2.5 text-xs font-black shadow-lg"
                >
                  <Trash2 size={14} /> حذف دمو
                </button>
              )}
            </div>
          </div>
        </div>

        {/* section tabs */}
        <div className="scroll-gold flex gap-2 overflow-x-auto pb-1">
          {DEMO_SECTION_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-black transition-all',
                tab === t.key ? 'border-[#c9a227] bg-[#c9a227] text-[#0b2e20] shadow-lg' : 'border-border bg-card hover:border-[#c9a227]/60'
              )}
            >
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {/* overview */}
        {tab === 'overview' && (
          <div className="space-y-4 fade-in-up">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="فروش ۹۰ روز اخیر" value={`${faMoney(k.revenue90)} ت`} tone="emerald" icon={<Wallet size={18} />} />
              <StatCard label="سفارش‌های تأمین" value={faNum(k.ordersCount)} tone="gold" icon={<ClipboardList size={18} />} />
              <StatCard label="حاشیه سود میانگین" value={`${faNum(k.avgMargin)}٪`} tone="olive" icon={<TrendingUp size={18} />} />
              <StatCard label="پرسنل شبیه‌سازی‌شده" value={faNum(k.staffCount)} tone="stone" icon={<Users size={18} />} />
              <StatCard label="چک‌های در جریان" value={`${faNum(k.chequeCount)} فقره`} tone="terra" hint={`${faMoney(k.chequeValue)} تومان`} icon={<Banknote size={18} />} />
              <StatCard label="ضایعات ثبت‌شده" value={faNum(k.wasteCount)} tone="rose" hint={`${faMoney(k.wasteValue)} تومان`} icon={<TrashIcon size={18} />} />
              <StatCard label="نرخ کسری (Shrinkage)" value={`${faNum(k.shrinkPct)}٪`} tone="rose" hint="هدف علمی: زیر ۱٫۳۶٪ (GRTB)" />
              <StatCard label="تنوع کالا" value={faNum(active.productsCount)} tone="emerald" hint={`${faNum(active.categories.length)} دسته کالایی`} />
            </div>

            <SectionCard title="روند فروش روزانه — ۹۰ روز" subtitle="تولیدشده با فاکتورهای تورم، پیک پنجشنبه/جمعه و نوسان فصلی" icon={<TrendingUp size={18} />}>
              <LineChart
                data={active.salesSeries.filter((_, i) => i % 2 === 0).map((s) => ({ label: formatJalaliShort(s.date), value: Math.round(s.value / 1e6) }))}
                height={170}
                color="#0e7a4a"
                formatValue={(v) => `${faNum(v)} میلیون تومان`}
              />
            </SectionCard>

            <SectionCard title="مقایسه شعب" icon={<Building2 size={18} />}>
              <div className="scroll-gold overflow-x-auto">
                <table className="w-full min-w-[640px] text-right text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="p-2">شعبه</th>
                      <th className="p-2">شهر</th>
                      <th className="p-2">متراژ</th>
                      <th className="p-2">پرسنل</th>
                      <th className="p-2">فروش ۹۰ روز</th>
                      <th className="p-2">سفارش‌ها</th>
                      <th className="p-2">حاشیه</th>
                      <th className="p-2">کسری</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.branches.map((b) => (
                      <tr key={b.name} className="border-t border-border/60">
                        <td className="p-2 font-black">{b.name}</td>
                        <td className="p-2">{b.city} — {b.area}</td>
                        <td className="p-2">{faNum(b.sizeM2)} م²</td>
                        <td className="p-2">{faNum(b.staff)} نفر</td>
                        <td className="p-2 font-bold text-[#0e7a4a]">{faMoney(b.revenue)}</td>
                        <td className="p-2">{faNum(b.orders)}</td>
                        <td className="p-2">{faNum(b.margin)}٪</td>
                        <td className="p-2">
                          <Pill label={`${faNum(b.shrink)}٪`} color={b.shrink > 1.4 ? '#b3372f' : '#0e7a4a'} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="پرفروش‌ترین کالاها" icon={<TrendingUp size={18} />}>
                <BarChart
                  data={active.topProducts.slice(0, 8).map((p) => ({ label: p.name.slice(0, 18), value: Math.round(p.revenue / 1e6) }))}
                  height={180}
                  color="#c9a227"
                  formatValue={(v) => `${faNum(v)} م.ت`}
                />
              </SectionCard>
              <SectionCard title="توزیع فروش بین دسته‌ها" icon={<DonutMini />}>
                <Donut data={categoryShare(active)} centerLabel="دسته" />
              </SectionCard>
            </div>
          </div>
        )}

        {/* orders */}
        {tab === 'orders' && (
          <SectionCard title="سفارش‌های شبیه‌سازی‌شده" subtitle="چرخه کامل: ثبت → تأیید → دریافت → تأیید انبار → حسابداری — همان گردش‌کار سامانه" icon={<ClipboardList size={18} />}>
            <div className="scroll-gold max-h-[60vh] overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead className="sticky top-0 bg-card shadow-[0_1px_0_0_#e5e1d3]">
                  <tr className="text-muted-foreground">
                    <th className="p-2">کد</th>
                    <th className="p-2">شعبه</th>
                    <th className="p-2">تأمین‌کننده</th>
                    <th className="p-2">تاریخ</th>
                    <th className="p-2">اقلام</th>
                    <th className="p-2">مبلغ</th>
                    <th className="p-2">حاشیه</th>
                    <th className="p-2">پرداخت</th>
                    <th className="p-2">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {[...active.orders].reverse().slice(0, 80).map((o) => {
                    const st = ORDER_STATUSES[o.status] || ORDER_STATUSES.SUBMITTED
                    return (
                      <tr key={o.code} className="border-t border-border/60 hover:bg-secondary/40">
                        <td className="p-2 font-mono font-bold" dir="ltr">{o.code}</td>
                        <td className="p-2">{o.branch}</td>
                        <td className="max-w-36 truncate p-2">{o.providerName}</td>
                        <td className="p-2">{formatJalaliShort(o.date)}</td>
                        <td className="p-2">{faNum(o.items.length)} قلم</td>
                        <td className="p-2 font-bold">{faMoney(o.totalAmount)}</td>
                        <td className="p-2">
                          <Pill label={`${faNum(o.marginPct)}٪`} color={o.marginPct >= 25 ? '#0e7a4a' : o.marginPct >= 10 ? '#c9a227' : '#b3372f'} />
                        </td>
                        <td className="p-2">{o.payMethod === 'CHEQUE' ? 'چک' : 'نقد'}</td>
                        <td className="p-2">
                          <Pill label={st.label} color={st.color} bg={st.bg} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {/* cheques */}
        {tab === 'cheques' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard title="چک‌های شبیه‌سازی‌شده" className="lg:col-span-2" icon={<Banknote size={18} />}>
              <div className="scroll-gold max-h-[55vh] space-y-2 overflow-y-auto">
                {[...active.cheques].reverse().slice(0, 60).map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/20 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black">{c.recipientName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        شماره {faNum(c.number)} • بابت سفارش {c.orderCode} • سررسید {formatJalaliShort(c.dueDate)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs font-black text-[#8a6d10]">{faMoney(c.amount)}</span>
                      <Pill label={CHEQUE_FA[c.status]?.label || c.status} color={CHEQUE_FA[c.status]?.color || '#6b7280'} />
                    </div>
                  </div>
                ))}
                {active.cheques.length === 0 && <EmptyState emoji="🏦" title="چکی ثبت نشده" />}
              </div>
            </SectionCard>
            <SectionCard title="نگهبان تعطیلات" icon={<Clock size={18} />}>
              <p className="text-xs leading-6 text-muted-foreground">
                در این دمو، سررسید چک‌ها اگر روی تعطیلات رسمی بیفتد خودکار به آخرین روز کاری قبل منتقل می‌شود — همان نگهبانی که در سامانه اصلی فعال است.
                تقویم جلالی سامانه، تعطیلات رسمی ایران را از منبع keybit می‌خواند.
              </p>
              <div className="mt-3 rounded-xl border border-[#c9a227]/30 bg-[#fdf6dd]/60 p-3 text-[11px] font-bold leading-5 text-[#8a6d10]">
                💡 {faNum(active.cheques.filter((c) => c.status === 'CLEARED').length)} فقره در این دمو پاس شده؛ بقیه در چرخه امضا→تحویل→پاس هستند.
              </div>
            </SectionCard>
          </div>
        )}

        {/* people */}
        {tab === 'people' && (
          <div className="space-y-4 fade-in-up">
            <SectionCard title="پرسنل شبیه‌سازی‌شده" subtitle="نقش‌ها دقیقاً مطابق نقش‌های سامانه (RBAC)" icon={<Users size={18} />}>
              <div className="scroll-gold grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {active.staff.slice(0, 30).map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/20 p-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-black text-white" style={{ background: s.color }}>
                      {s.name[0]}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground">{s.role} • {s.branch}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="تأمین‌کنندگان" icon={<Building2 size={18} />}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {active.providers.map((p) => (
                  <div key={p.id} className="rounded-xl border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs font-black">{p.name}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">برندها: {p.company}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <Pill label={p.type === 'DISTRIBUTOR' ? 'بازرگان' : p.type === 'VISITOR' ? 'ویزیتور' : 'مستقیم'} color="#0e7a4a" />
                      <span className="text-[10px] font-bold" dir="ltr">{faNum(p.phone)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="وظایف نمونه تیم" icon={<ClipboardList size={18} />}>
              <div className="space-y-2">
                {active.tasks.map((t, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 p-3">
                    <div>
                      <p className="text-xs font-black">{t.title}</p>
                      <p className="text-[10px] text-muted-foreground">{t.assignedTo} • {faNum(t.points)} امتیاز</p>
                    </div>
                    <div className="flex gap-1.5">
                      <Pill label={t.status === 'OPEN' ? 'باز' : t.status === 'IN_PROGRESS' ? 'در حال انجام' : 'انجام شد'} color={t.status === 'OPEN' ? '#a16207' : t.status === 'IN_PROGRESS' ? '#1e40af' : '#166534'} />
                      <Pill label={t.priority === 'URGENT' ? 'فوری' : t.priority === 'HIGH' ? 'مهم' : 'معمولی'} color={t.priority === 'URGENT' ? '#b3372f' : t.priority === 'HIGH' ? '#a16207' : '#6b7280'} />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        )}

        {/* story */}
        {tab === 'story' && (
          <SectionCard title="یک روز با سامانه در این شرکت" subtitle="گردش‌کار واقعی از صبح تا عصر — هر مرحله یک قابلیت سامانه" icon={<Clock size={18} />}>
            <div className="relative space-y-3 pr-4 before:absolute before:right-[9px] before:top-2 before:h-[calc(100%-16px)] before:w-0.5 before:bg-gradient-to-b before:from-[#c9a227] before:to-[#0e7a4a]">
              {active.story.map((s, i) => (
                <div key={i} className="relative rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <span className="absolute -right-[22px] top-4 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#c9a227] shadow" />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-[#0b2e20] px-2.5 py-1 font-mono text-[10px] font-black text-[#f3d573]">{s.time}</span>
                      <span className="text-sm font-black">{s.title}</span>
                    </div>
                    <Pill label={s.feature} color="#0e7a4a" />
                  </div>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">{s.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* roi */}
        {tab === 'roi' && (
          <div className="space-y-4 fade-in-up">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="بازگشت سرمایه ماهانه" value={`${faNum(active.roi.roiPct)}٪`} tone="emerald" hint="درآمد خالص نسبت به هزینه سامانه" />
              <StatCard label="بازگشت هزینه" value={`${faNum(active.roi.paybackDays)} روز`} tone="gold" hint="از روز اول بهره‌برداری" />
              <StatCard label="ساعت آزادشده در ماه" value={faNum(Math.round(active.roi.monthly.hoursSaved))} tone="olive" hint="معادل یک نیروی تمام‌وقت" />
              <StatCard label="هزینه ماهانه سامانه" value={`${faMoney(active.roi.platformFee)} ت`} tone="stone" />
            </div>
            <SectionCard title="مدل ارزش‌آفرینی ماهانه" subtitle="همه اعداد از پژوهش‌نامه علمی سامانه استخراج شده‌اند" icon={<TrendingUp size={18} />}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="صرفه‌جویی نیروی انسانی" value={`${faMoney(active.roi.monthly.laborValueSaved)} ت`} tone="emerald" />
                <StatCard label="کاهش کسری موجودی" value={`${faMoney(active.roi.monthly.shrinkSaved)} ت`} tone="gold" />
                <StatCard label="کاهش ضایعات (FEFO)" value={`${faMoney(active.roi.monthly.wasteSaved)} ت`} tone="terra" />
                <StatCard label="بازیابی فروش کمبود قفسه" value={`${faMoney(active.roi.monthly.stockoutRecovered)} ت`} tone="olive" />
              </div>
              <div className="mt-4 rounded-2xl bg-gradient-to-l from-[#0e7a4a]/10 to-transparent p-4 text-center">
                <p className="text-xs font-bold text-muted-foreground">سود خالص ماهانه پس از هزینه سامانه</p>
                <p className="mt-1 text-2xl font-black text-[#0e7a4a]">{faMoney(active.roi.monthlyBenefit - active.roi.platformFee)} تومان</p>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-[11px] font-black text-muted-foreground">فرض‌های علمی مدل:</p>
                {active.roi.assumptions.map((a, i) => (
                  <div key={i} className="flex gap-2 text-[11px] leading-5 text-foreground/85">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9a227]" />
                    {a}
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        )}
      </div>
    )
  }

  /* ── studio home ── */
  return (
    <div className="space-y-5">
      <div className="glow-card hero-emerald relative overflow-hidden rounded-2xl p-5 text-white sm:p-7">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#c9a227] text-[#0b2e20] shadow-xl">
              <Presentation size={26} />
            </span>
            <div>
              <h1 className="text-xl font-black sm:text-2xl">استودیوی دمو — شرکت‌های نمایشی</h1>
              <p className="text-xs text-[#e9f0e4]/85">
                یک شرکت واقعیِ فرضی با ۹۰ روز داده بسازید: شعب، پرسنل، تأمین‌کننده، سفارش، چک و فروش — برای معرفی سامانه به مشتریان و آزمون ایده‌ها
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* profiles */}
      <SectionCard title="یک پروفایل کسب‌وکار را انتخاب کنید" subtitle="داده‌ها با الگوی کسب‌وکارهای واقعی ایرانی تولید می‌شود — بدون آلودگی داده اصلی" icon={<Sparkles size={18} />}>
        {profiles && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(profiles) as DemoProfileKey[]).map((key) => {
              const p = profiles[key]
              return (
                <div key={key} className="glow-card flex flex-col rounded-2xl bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-xl">
                  <span className="mb-2 text-4xl">{p.icon}</span>
                  <span className="text-sm font-black">{p.name}</span>
                  <Pill label={p.tag} color="#8a6d10" className="mt-2 self-start" />
                  <p className="mt-2 flex-1 text-[11px] leading-5 text-muted-foreground">{p.desc}</p>
                  <p className="mt-2 text-[10px] font-bold text-[#0e7a4a]">{p.scale}</p>
                  <button
                    onClick={() => generate(key)}
                    disabled={generating !== null}
                    className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-[#0e7a4a] px-4 py-2.5 text-xs font-black text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
                  >
                    {generating === key ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> در حال تولید…
                      </>
                    ) : (
                      <>
                        <Play size={14} /> تولید دمو
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* saved demos */}
      <SectionCard title="دموهای ساخته‌شده" subtitle="آخرین ۸ دمو نگه داشته می‌شود" icon={<RotateCcw size={18} />}>
        {demos.length === 0 ? (
          <EmptyState emoji="🎬" title="هنوز دمویی نساخته‌اید" hint="یکی از پروفایل‌های بالا را تولید کنید تا نمای واقعی سامانه برای آن شرکت را ببینید" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {demos.map((d) => (
              <div key={d.id} className="glow-card rounded-2xl bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black">{d.name}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{faNum(d.branchCount)} شعبه • ساخت {d.createdByName}</p>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await api(`/api/demo?id=${d.id}`, { method: 'DELETE' })
                        toast.success('دمو حذف شد')
                        loadList()
                      } catch (e: any) {
                        toast.error(e.message)
                      }
                    }}
                    className="rounded-lg p-1.5 text-[#b3372f] hover:bg-[#fee2e2]"
                    aria-label="حذف دمو"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">{d.description}</p>
                <button onClick={() => openDemo(d.id)} className="mt-3 w-full rounded-xl bg-secondary px-4 py-2.5 text-xs font-black text-primary transition hover:brightness-95">
                  باز کردن دمو
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* how it helps */}
      <SectionCard title="این دمو برای چیست؟" icon={<Presentation size={18} />}>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { t: 'معرفی به مشتریان', d: 'به مدیر فروشگاه‌های دیگر نشان دهید سامانه چطور در یک شرکت هم‌اندازه خودشان کار می‌کند — با اعداد و شکل‌های خودشان، نه اسکرین‌شات.' },
            { t: 'آزمون ایده بدون ریسک', d: 'قبل از تغییر فرایند واقعی، همین داده شبیه‌سازی‌شده را با ابزارهای علمی سامانه بسنجید: ABC، نقطه سفارش، FEFO.' },
            { t: 'جمع‌آوری بازخورد', d: 'تیم‌های آزمایشی روی دمو تمرین می‌کنند، بازخورد می‌دهند و وقتی آماده شدند به محیط اصلی می‌روند.' },
          ].map((x, i) => (
            <div key={i} className="rounded-2xl border border-[#c9a227]/30 bg-[#fdf6dd]/40 p-4">
              <p className="text-sm font-black text-[#8a6d10]">{x.t}</p>
              <p className="mt-1.5 text-[11px] leading-5 text-foreground/80">{x.d}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

function categoryShare(d: DemoData): { label: string; value: number }[] {
  // از پرفروش‌ها استفاده کن (سهم ارزش فروش)
  return d.topProducts.slice(0, 6).map((p) => ({ label: p.name.slice(0, 22), value: Math.round(p.revenue / 1e6) }))
}

function DonutMini() {
  return <span className="inline-block h-4 w-4 rounded-full border-[3px] border-[#0e7a4a] border-l-[#c9a227]" />
}
