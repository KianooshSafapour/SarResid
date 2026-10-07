'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { AppCtx, SectionCard, StatCard, Pill, EmptyState, Labeled, FaPriceInput } from '@/components/app/ui-bits'
import { BarChart, LineChart, Donut } from '@/components/app/charts'
import { JalaliDatePicker, useHolidays } from '@/components/app/jalali-widgets'
import { CATEGORY_EMOJI } from '@/lib/constants'
import { faNum, faMoney, todayIso, formatJalaliShort } from '@/lib/jalali'
import { Modal } from '@/components/views/Orders'
import { cn } from '@/lib/utils'
import {
  Sigma, Crosshair, Repeat2, TrendingUp, Trash2, ClipboardCheck, Plus, X, FlaskConical, Sparkles,
} from 'lucide-react'

/* ───────────────────────── types ───────────────────────── */
type AbcRow = { id: string; name: string; category: string; annualValue: number; stock: number; sellPrice: number; rank: number; share: number; cumPct: number; cls: 'A' | 'B' | 'C' }
type RopRow = { id: string; name: string; category: string; stock: number; dailyDemand: number; sdDaily: number; ss: number; rop: number; below: boolean; suggest: number }
type EoqRow = { id: string; name: string; category: string; annualDemand: number; buyPrice: number; eoq: number; ordersPerYear: number; cycleDays: number }
type FcRow = { id: string; name: string; category: string; history: number[]; forecastNext: number; method: string; mae: number; trend: string }
type ScienceData = { abc: { rows: AbcRow[]; summary: { cls: string; count: number; share: number; value: number }[]; total: number } | null; rop: { rows: RopRow[]; serviceLevel: string; leadTime: number; z: number } | null; eoq: { rows: EoqRow[]; orderCost: number; holdingRate: number } | null; forecast: { rows: FcRow[]; alpha: number } | null }

type Waste = { id: string; productName: string; category: string; qty: number; unit: string; reason: string; estValue: number; forDate: string; note: string; createdByName: string }
type WasteData = {
  reasons: Record<string, string>
  waste: Waste[]
  stats: { totalValue: number; count: number; byReason: Record<string, number>; byCategory: Record<string, number>; days: number }
  products: { id: string; name: string; category: string; unit: string; price: number }[]
  expiryAlerts: { productId: string; productName: string; expiryDate: string; qty: number; receivedQty: number | null }[]
}
type CountItem = { productId: string; productName: string; unit: string; systemQty: number; countedQty: number | null; diff: number; buyPrice: number }
type Count = { id: string; title: string; category: string; forDate: string; status: string; items: CountItem[]; accuracy: number | null; diffValue: number; createdByName: string }

const TABS = [
  { key: 'abc', label: 'تحلیل ABC', icon: Sigma },
  { key: 'rop', label: 'نقطه سفارش', icon: Crosshair },
  { key: 'eoq', label: 'EOQ', icon: Repeat2 },
  { key: 'forecast', label: 'پیش‌بینی تقاضا', icon: TrendingUp },
  { key: 'waste', label: 'دفتر ضایعات', icon: Trash2 },
  { key: 'count', label: 'شمارش چرخه‌ای', icon: ClipboardCheck },
] as const

const REASON_COLOR: Record<string, string> = {
  EXPIRED: '#b3372f', DAMAGED: '#c96f4a', SPOILED: '#8a6d10', THEFT: '#6d28d9', OTHER: '#6b7280',
}
const CLS_COLOR: Record<string, string> = { A: '#b3372f', B: '#c9a227', C: '#0e7a4a' }

export default function ScienceView({ ctx, param }: { ctx: AppCtx; param?: string }) {
  const valid = param && TABS.some((t) => t.key === param) ? (param as (typeof TABS)[number]['key']) : 'abc'
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>(valid)
  const [consumedParam, setConsumedParam] = useState(param)
  // اگر با پارامتر تازه به این نما آمد (مثل science/count از شمارش زون)، تب هدف باز شود
  if (param !== consumedParam) {
    setConsumedParam(param)
    if (param && TABS.some((t) => t.key === param)) setTab(param as (typeof TABS)[number]['key'])
  }
  const holidays = useHolidays()

  /* science computations */
  const [sl, setSl] = useState('95')
  const [lead, setLead] = useState(3)
  const [alpha, setAlpha] = useState(0.3)
  const [data, setData] = useState<ScienceData | null>(null)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')

  const loadScience = useCallback(async () => {
    setBusy(true)
    try {
      const d = await api<ScienceData>(`/api/science?sl=${sl}&lead=${lead}&alpha=${alpha}`)
      setData(d)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }, [sl, lead, alpha])

  useEffect(() => {
    if (['abc', 'rop', 'eoq', 'forecast'].includes(tab)) loadScience()
  }, [tab, loadScience])

  /* waste */
  const [wasteData, setWasteData] = useState<WasteData | null>(null)
  const loadWaste = useCallback(async () => {
    try {
      setWasteData(await api<WasteData>('/api/waste?days=30'))
    } catch (e: any) {
      toast.error(e.message)
    }
  }, [])
  useEffect(() => {
    if (tab === 'waste') loadWaste()
  }, [tab, loadWaste])

  const [wOpen, setWOpen] = useState(false)
  const [wForm, setWForm] = useState({ productId: '', productName: '', category: 'عمومی', qty: 1 as number | '', unit: 'عدد', reason: 'EXPIRED', estValue: '' as number | '', forDate: todayIso(), note: '' })

  /* cycle count */
  const [countData, setCountData] = useState<{ counts: Count[]; products: { id: string; name: string; category: string; unit: string; stock: number; buyPrice: number }[]; categories: string[] } | null>(null)
  const loadCounts = useCallback(async () => {
    try {
      setCountData(await api('/api/cyclecount'))
    } catch (e: any) {
      toast.error(e.message)
    }
  }, [])
  useEffect(() => {
    if (tab === 'count') loadCounts()
  }, [tab, loadCounts])

  const [openCount, setOpenCount] = useState<Count | null>(null)
  const [countForm, setCountForm] = useState({ title: '', category: '' })

  const filtered = <T extends { name: string }>(rows: T[]) =>
    q.trim() ? rows.filter((r) => r.name.includes(q.trim())) : rows

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="glow-card hero-emerald relative overflow-hidden rounded-2xl p-5 text-white sm:p-6">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-black sm:text-2xl">
              <FlaskConical size={22} className="text-[#c9a227]" /> جعبه‌ابزار علمی موجودی
            </h1>
            <p className="mt-1 text-xs text-[#e9f0e4]/85">
              مدل‌های ABC، نقطه سفارش، EOQ، پیش‌بینی، ضایعات و شمارش چرخه‌ای — همه مستند به ادبیات علمی (هریس ۱۹۱۳، پارتو، کراستون ۱۹۷۲)
            </p>
          </div>
          <button
            onClick={() => ctx.navigate('research')}
            className="flex items-center gap-1.5 rounded-xl bg-[#c9a227] px-4 py-2 text-xs font-black text-[#0b2e20] shadow-lg transition hover:brightness-110"
          >
            <Sparkles size={14} /> پژوهش‌نامه علمی
          </button>
        </div>
      </div>

      {/* tabs */}
      <div className="scroll-gold flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
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
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════ ABC ═══════════ */}
      {tab === 'abc' && (
        <div className="space-y-4 fade-in-up">
          {busy && !data && <LoadingBlock />}
          {data?.abc && (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {data.abc.summary.map((s) => (
                  <button
                    key={s.cls}
                    onClick={() => ctx.navigate('products', `abc:${s.cls}`)}
                    title={`مشاهدهٔ کالاهای کلاس ${s.cls} در بخش کالاها`}
                    className="glow-card rounded-2xl bg-card p-4 text-right transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl font-black text-white" style={{ background: CLS_COLOR[s.cls] }}>
                        {s.cls}
                      </span>
                      <span className="text-2xl font-black text-foreground">{faNum(Math.round(s.share))}٪</span>
                    </div>
                    <p className="mt-2 text-xs font-bold text-muted-foreground">
                      {faNum(s.count)} قلم • ارزش سالانه {faMoney(s.value)}
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${s.share}%`, background: CLS_COLOR[s.cls] }} />
                    </div>
                    <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-[#0e7a4a]">
                      مشاهدهٔ کالاهای گروه {s.cls} ←
                    </span>
                  </button>
                ))}
                <StatCard label="ارزش مصرف سالانه (تخمینی)" value={`${faMoney(data.abc.total)}`} hint="بر پایه فروش ۹۰ روز اخیر" tone="gold" />
              </div>

              <SectionCard
                title="اصول پارتو در عمل"
                subtitle="گروه A را دائم کنترل کن (شمارش چرخه‌ای ماهانه)؛ گروه C را ساده و فصلی مدیریت کن — Gupta 2011"
                icon={<Sigma size={18} />}
              >
                <div className="mb-4 grid gap-4 md:grid-cols-2">
                  <LineChart
                    data={data.abc.rows.slice(0, 40).map((r) => ({ label: String(r.rank), value: +r.cumPct.toFixed(1) }))}
                    height={150}
                    color="#c9a227"
                    formatValue={(v) => `${faNum(v)}٪ تجمعی`}
                  />
                  <Donut
                    data={data.abc.summary.map((s) => ({ label: `گروه ${s.cls}`, value: Math.round(s.share) }))}
                    centerLabel="سهم از ارزش"
                    centerValue={`${faNum(Math.round(data.abc.total > 0 ? data.abc.summary[0].share : 0))}٪ گروه A`}
                  />
                </div>
                {/* کلاس‌ها قابل کلیک‌اند — عمیق‌لینک به فهرست کالاهای همان کلاس */}
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 p-2.5">
                  <span className="text-[10px] font-black text-muted-foreground">روی هر گروه بزنید تا کالاهای همان کلاس در بخش «کالاها» باز شود:</span>
                  {(['A', 'B', 'C'] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => ctx.navigate('products', `abc:${k}`)}
                      className="rounded-full border-2 px-3 py-1.5 text-[10px] font-black transition hover:brightness-105"
                      style={{ borderColor: CLS_COLOR[k], color: CLS_COLOR[k] }}
                    >
                      کالاهای گروه {k} ←
                    </button>
                  ))}
                </div>
                <div className="scroll-gold max-h-96 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="sticky top-0 bg-card shadow-[0_1px_0_0_#e5e1d3]">
                      <tr className="text-muted-foreground">
                        <th className="p-2">رتبه</th>
                        <th className="p-2">کالا</th>
                        <th className="p-2">دسته</th>
                        <th className="p-2">سهم</th>
                        <th className="p-2">تجمعی</th>
                        <th className="p-2">گروه</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered(data.abc.rows).map((r) => (
                        <tr key={r.id} className="border-t border-border/60 hover:bg-secondary/50">
                          <td className="p-2 font-bold">{faNum(r.rank)}</td>
                          <td className="max-w-52 truncate p-2 font-bold">{r.name}</td>
                          <td className="p-2 text-muted-foreground">{CATEGORY_EMOJI[r.category] || '📦'} {r.category}</td>
                          <td className="p-2">{faNum(r.share.toFixed(1))}٪</td>
                          <td className="p-2">{faNum(r.cumPct.toFixed(1))}٪</td>
                          <td className="p-2">
                            <Pill label={`گروه ${r.cls}`} color="#fff" bg={CLS_COLOR[r.cls]} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </>
          )}
        </div>
      )}

      {/* ═══════════ ROP ═══════════ */}
      {tab === 'rop' && (
        <div className="space-y-4 fade-in-up">
          <SectionCard
            title="نقطه سفارش مجدد و ذخیره احتیاطی"
            subtitle="ROP = تقاضای روزانه × زمان تأمین + z×σ×√L — Gonçalves et al. 2020"
            icon={<Crosshair size={18} />}
            actions={
              <>
                <select value={sl} onChange={(e) => setSl(e.target.value)} className="rounded-xl border border-input bg-white px-3 py-2 text-xs font-bold">
                  <option value="90">سطح خدمت ۹۰٪</option>
                  <option value="95">سطح خدمت ۹۵٪</option>
                  <option value="98">سطح خدمت ۹۸٪</option>
                  <option value="99">سطح خدمت ۹۹٪</option>
                </select>
                <select value={lead} onChange={(e) => setLead(Number(e.target.value))} className="rounded-xl border border-input bg-white px-3 py-2 text-xs font-bold">
                  {[1, 2, 3, 5, 7].map((d) => (
                    <option key={d} value={d}>{faNum(d)} روز زمان تأمین</option>
                  ))}
                </select>
              </>
            }
          >
            {busy && !data && <LoadingBlock />}
            {data?.rop && (
              <>
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="کالاهای زیر نقطه سفارش" value={data.rop.rows.filter((r) => r.below).length} tone="rose" hint="نیاز به سفارش فوری" />
                  <StatCard label="کل کالاهای دارای تقاضا" value={data.rop.rows.length} tone="emerald" />
                  <StatCard label="سطح خدمت انتخابی" value={`${faNum(sl)}٪`} tone="gold" hint={`z = ${faNum(data.rop.z)}`} />
                  <StatCard label="زمان تأمین" value={`${faNum(lead)} روز`} tone="olive" />
                </div>
                <div className="scroll-gold max-h-96 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="sticky top-0 bg-card shadow-[0_1px_0_0_#e5e1d3]">
                      <tr className="text-muted-foreground">
                        <th className="p-2">کالا</th>
                        <th className="p-2">موجودی</th>
                        <th className="p-2">تقاضا/روز</th>
                        <th className="p-2">ذخیره احتیاطی</th>
                        <th className="p-2">نقطه سفارش</th>
                        <th className="p-2">وضعیت</th>
                        <th className="p-2">سفارش پیشنهادی</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered(data.rop.rows).slice(0, 120).map((r) => (
                        <tr key={r.id} className={cn('border-t border-border/60', r.below && 'bg-[#fee2e2]/40')}>
                          <td className="max-w-52 truncate p-2 font-bold">{r.name}</td>
                          <td className="p-2">{faNum(r.stock)}</td>
                          <td className="p-2">{faNum(r.dailyDemand)}</td>
                          <td className="p-2">{faNum(r.ss)}</td>
                          <td className="p-2 font-black">{faNum(r.rop)}</td>
                          <td className="p-2">
                            {r.below ? <Pill label="زیر نقطه سفارش!" color="#b3372f" /> : <Pill label="پایدار" color="#0e7a4a" />}
                          </td>
                          <td className="p-2 font-bold text-[#8a6d10]">{r.suggest > 0 ? `${faNum(r.suggest)} عدد` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </SectionCard>
        </div>
      )}

      {/* ═══════════ EOQ ═══════════ */}
      {tab === 'eoq' && (
        <div className="fade-in-up">
          <SectionCard
            title="مقدار اقتصادی سفارش (EOQ)"
            subtitle="EOQ = √(2DS/H) — فورد هریس، ۱۹۱۳؛ نرخ نگهداری بالا در تورم ایران پیش‌فرض ۴۰٪ است"
            icon={<Repeat2 size={18} />}
          >
            {busy && !data && <LoadingBlock />}
            {data?.eoq && (
              <div className="scroll-gold max-h-96 overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="sticky top-0 bg-card shadow-[0_1px_0_0_#e5e1d3]">
                    <tr className="text-muted-foreground">
                      <th className="p-2">کالا</th>
                      <th className="p-2">تقاضای سالانه</th>
                      <th className="p-2">EOQ</th>
                      <th className="p-2">سفارش در سال</th>
                      <th className="p-2">چرخه (روز)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered(data.eoq.rows).slice(0, 120).map((r) => (
                      <tr key={r.id} className="border-t border-border/60 hover:bg-secondary/50">
                        <td className="max-w-52 truncate p-2 font-bold">{r.name}</td>
                        <td className="p-2">{faNum(r.annualDemand)}</td>
                        <td className="p-2 font-black text-[#0e7a4a]">{faNum(r.eoq)}</td>
                        <td className="p-2">{faNum(r.ordersPerYear)} بار</td>
                        <td className="p-2">{faNum(r.cycleDays)} روز</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* ═══════════ FORECAST ═══════════ */}
      {tab === 'forecast' && (
        <div className="fade-in-up">
          <SectionCard
            title="پیش‌بینی تقاضای هفته بعد"
            subtitle="هموارسازی نمایی (α) + کراستون برای تقاضای متناوب — Croston 1972"
            icon={<TrendingUp size={18} />}
            actions={
              <select value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} className="rounded-xl border border-input bg-white px-3 py-2 text-xs font-bold">
                <option value={0.1}>α = ۰٫۱ (محافظه‌کار)</option>
                <option value={0.3}>α = ۰٫۳ (متعادل)</option>
                <option value={0.5}>α = ۰٫۵ (پرخاشگر)</option>
              </select>
            }
          >
            {busy && !data && <LoadingBlock />}
            {data?.forecast && (
              <div className="space-y-3">
                {filtered(data.forecast.rows).slice(0, 24).map((r) => (
                  <div key={r.id} className="glow-card rounded-2xl bg-card p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-black">{r.name}</span>
                      <span className="flex items-center gap-2">
                        <Pill label={r.method} color="#0e7a4a" />
                        <Pill label={`روند ${r.trend}`} color={r.trend === 'صعودی' ? '#0e7a4a' : r.trend === 'نزولی' ? '#b3372f' : '#6b7280'} />
                        <span className="rounded-xl bg-[#c9a227]/15 px-3 py-1 text-xs font-black text-[#8a6d10]">
                          هفته بعد: {faNum(r.forecastNext)} عدد
                        </span>
                      </span>
                    </div>
                    <BarChart data={r.history.map((v, i) => ({ label: `هفته ${faNum(i + 1)}`, value: v }))} height={70} color="#77934a" />
                  </div>
                ))}
                {data.forecast.rows.length === 0 && <EmptyState emoji="📉" title="هنوز داده فروش کافی نیست" hint="پس از ثبت پیش‌فاکتورهای فروش، پیش‌بینی خودکار محاسبه می‌شود" />}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* ═══════════ WASTE ═══════════ */}
      {tab === 'waste' && wasteData && (
        <div className="space-y-4 fade-in-up">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="ارزش ضایعات ۳۰ روز" value={faMoney(wasteData.stats.totalValue)} tone="rose" hint="هدف: زیر ۱٫۵٪ فروش — GRTB" />
            <StatCard label="تعداد موارد" value={wasteData.stats.count} tone="stone" />
            <StatCard label="هشدار انقضا (۱۴ روز آینده)" value={wasteData.expiryAlerts.length} tone="gold" hint="اولویت FEFO" />
            <div className="glow-card flex flex-col items-center justify-center rounded-2xl bg-card p-3">
              <button
                onClick={() => {
                  const p = wasteData.products[0]
                  setWForm((f) => ({
                    ...f,
                    productId: p?.id || '',
                    productName: p?.name || '',
                    category: p?.category || 'عمومی',
                    unit: p?.unit || 'عدد',
                    estValue: p ? p.price : '',
                    qty: 1,
                  }))
                  setWOpen(true)
                }}
                className="flex items-center gap-2 rounded-xl bg-[#b3372f] px-5 py-3 text-sm font-black text-white shadow-lg shadow-[#b3372f]/30 transition hover:brightness-110"
              >
                <Plus size={16} /> ثبت ضایعات
              </button>
            </div>
          </div>

          {wasteData.expiryAlerts.length > 0 && (
            <SectionCard title="هشدار FEFO — اول انقضا، اول خارج" subtitle="First-Expired-First-Out تا ۳۵٪ ضایعات را کم می‌کند (RELEX)" icon={<Trash2 size={18} />}>
              <div className="scroll-gold flex max-h-44 gap-2 overflow-x-auto pb-1">
                {wasteData.expiryAlerts.map((a, i) => (
                  <div key={i} className="min-w-44 rounded-xl border border-[#c9a227]/40 bg-[#fdf6dd]/70 p-3">
                    <p className="truncate text-xs font-black">{a.productName}</p>
                    <p className="mt-1 text-[10px] font-bold text-[#a04c2a]">انقضا: {formatJalaliShort(a.expiryDate)}</p>
                    <p className="text-[10px] text-muted-foreground">موجودی: {faNum(a.receivedQty ?? a.qty)}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard title="به تفکیک دلیل" icon={<Trash2 size={18} />} className="lg:col-span-2">
              <div className="grid gap-4 md:grid-cols-2">
                <BarChart
                  data={Object.entries(wasteData.stats.byReason).map(([k, v]) => ({ label: wasteData.reasons[k] || k, value: v }))}
                  color="#b3372f"
                  formatValue={(v) => faMoney(v)}
                />
                <Donut
                  data={Object.entries(wasteData.stats.byCategory).slice(0, 6).map(([k, v]) => ({ label: k, value: Math.round(v) }))}
                />
                {/* دسته‌ها قابل کلیک‌اند — فهرست کالاهای همان دسته */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-black text-muted-foreground">کالاهای پرضایعات هر دسته:</span>
                  {Object.entries(wasteData.stats.byCategory).slice(0, 4).map(([k]) => (
                    <button
                      key={k}
                      onClick={() => ctx.navigate('products', `cat:${k}`)}
                      className="rounded-full border border-[#c96f4a]/40 bg-white px-3 py-1 text-[10px] font-black text-[#a04c2a] transition hover:bg-[#fdf6dd]"
                      title={`مشاهدهٔ کالاهای دستهٔ ${k}`}
                    >
                      {CATEGORY_EMOJI[k] || '📦'} {k} ←
                    </button>
                  ))}
                </div>
              </div>
            </SectionCard>
            <SectionCard title="آخرین ثبت‌ها" icon={<Plus size={18} />}>
              <div className="scroll-gold max-h-72 space-y-2 overflow-y-auto">
                {wasteData.waste.slice(0, 30).map((w) => (
                  <div key={w.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/30 p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">{w.productName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {faNum(w.qty)} {w.unit} • {formatJalaliShort(w.forDate)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Pill label={wasteData.reasons[w.reason] || w.reason} color={REASON_COLOR[w.reason]} />
                      <button
                        onClick={async () => {
                          try {
                            await api(`/api/waste?id=${w.id}`, { method: 'DELETE' })
                            toast.success('ثبت ضایعات حذف شد')
                            loadWaste()
                          } catch (e: any) {
                            toast.error(e.message)
                          }
                        }}
                        className="text-[10px] font-bold text-[#b3372f] hover:underline"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                ))}
                {wasteData.waste.length === 0 && <EmptyState emoji="🧹" title="ضایعاتی ثبت نشده" hint="نگهداری تمیزِ داده ضایعات، شاخص کسری موجودی را واقعی نگه می‌دارد" />}
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* ═══════════ CYCLE COUNT ═══════════ */}
      {tab === 'count' && countData && (
        <div className="space-y-4 fade-in-up">
          <SectionCard
            title="شمارش چرخه‌ای انبار"
            subtitle="بر اساس پژوهش ECR/کاردیف: ~۶۰٪ سوابق موجودی در هر لحظه نادرست است — شمارش دسته A هفتگی، B ماهانه، C فصلی"
            icon={<ClipboardCheck size={18} />}
            actions={
              <div className="flex items-end gap-2">
                <div className="w-44">
                  <select value={countForm.category} onChange={(e) => setCountForm((f) => ({ ...f, category: e.target.value }))} className="w-full rounded-xl border border-input bg-white px-3 py-2 text-xs font-bold">
                    <option value="">انتخاب دسته…</option>
                    {countData.categories.map((c) => (
                      <option key={c} value={c}>{CATEGORY_EMOJI[c] || '📦'} {c}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={async () => {
                    if (!countForm.category) return toast.error('دسته را انتخاب کنید')
                    try {
                      const d = await api<{ count: Count }>('/api/cyclecount', { method: 'POST', body: { category: countForm.category } })
                      setOpenCount(d.count)
                      loadCounts()
                      toast.success('برگه شمارش ساخته شد')
                    } catch (e: any) {
                      toast.error(e.message)
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-[#0e7a4a] px-4 py-2.5 text-xs font-black text-white shadow-lg transition hover:brightness-110"
                >
                  <Plus size={14} /> برگه جدید
                </button>
              </div>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {countData.counts.map((c) => {
                const counted = c.items.filter((i) => i.countedQty !== null).length
                return (
                  <div key={c.id} className="glow-card rounded-2xl bg-card p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-black">{c.title}</span>
                      <Pill label={c.status === 'OPEN' ? 'باز' : `بسته — دقت ${faNum(c.accuracy ?? 0)}٪`} color={c.status === 'OPEN' ? '#c9a227' : '#0e7a4a'} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {c.category} • {formatJalaliShort(c.forDate)} • {faNum(counted)}/{faNum(c.items.length)} شمرده‌شده
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-[#0e7a4a]" style={{ width: `${(counted / Math.max(1, c.items.length)) * 100}%` }} />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => setOpenCount(c)} className="flex-1 rounded-xl bg-secondary px-3 py-2 text-xs font-black text-primary hover:brightness-95">
                        {c.status === 'OPEN' ? 'ادامه شمارش' : 'مشاهده'}
                      </button>
                      {c.status === 'OPEN' && (
                        <button
                          onClick={async () => {
                            try {
                              await api(`/api/cyclecount?id=${c.id}`, { method: 'DELETE' })
                              toast.success('برگه حذف شد')
                              loadCounts()
                            } catch (e: any) {
                              toast.error(e.message)
                            }
                          }}
                          className="rounded-xl bg-[#fee2e2] px-3 py-2 text-xs font-black text-[#b3372f]"
                        >
                          حذف
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              {countData.counts.length === 0 && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <EmptyState emoji="📋" title="برگه شمارشی وجود ندارد" hint="از یک دسته شروع کنید؛ شمارش چرخه‌ای جایگزین تعطیلی سالانه انبار می‌شود" />
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── count modal ── */}
      {openCount && (
        <CountModal
          count={openCount}
          onClose={() => setOpenCount(null)}
          onChanged={() => {
            loadCounts()
          }}
        />
      )}

      {/* ── waste modal ── */}
      {wOpen && wasteData && (
        <Modal title="ثبت ضایعات جدید" onClose={() => setWOpen(false)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Labeled label="کالا">
                <select
                  value={wForm.productId}
                  onChange={(e) => {
                    const p = wasteData.products.find((x) => x.id === e.target.value)
                    setWForm((f) => ({ ...f, productId: e.target.value, productName: p?.name || '', category: p?.category || 'عمومی', unit: p?.unit || 'عدد', estValue: p ? (f.qty || 0) * p.price : f.estValue }))
                  }}
                  className="w-full rounded-xl border border-input bg-white px-3 py-2.5 text-sm font-bold"
                >
                  <option value="">انتخاب کالا…</option>
                  {wasteData.products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Labeled>
            </div>
            <Labeled label="مقدار">
              <FaPriceInput value={wForm.qty} onChange={(v) => {
                const p = wasteData.products.find((x) => x.id === wForm.productId)
                setWForm((f) => ({ ...f, qty: v || 0, estValue: p && v ? v * p.price : f.estValue }))
              }} className="rounded-xl border border-input bg-white px-3 py-2.5" />
            </Labeled>
            <Labeled label="دلیل">
              <select value={wForm.reason} onChange={(e) => setWForm((f) => ({ ...f, reason: e.target.value }))} className="w-full rounded-xl border border-input bg-white px-3 py-2.5 text-sm font-bold">
                {Object.entries(wasteData.reasons).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Labeled>
            <Labeled label="ارزش برآوردی (تومان)">
              <FaPriceInput value={wForm.estValue} onChange={(v) => setWForm((f) => ({ ...f, estValue: v }))} className="rounded-xl border border-input bg-white px-3 py-2.5" />
            </Labeled>
            <Labeled label="تاریخ">
              <JalaliDatePicker value={wForm.forDate} onChange={(v) => setWForm((f) => ({ ...f, forDate: v }))} holidays={holidays} />
            </Labeled>
            <div className="sm:col-span-2">
              <Labeled label="یادداشت">
                <input value={wForm.note} onChange={(e) => setWForm((f) => ({ ...f, note: e.target.value }))} className="w-full rounded-xl border border-input bg-white px-3 py-2.5 text-sm" placeholder="مثلاً: بسته‌بندی آسیب‌دیده در حمل" />
              </Labeled>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setWOpen(false)} className="rounded-xl bg-muted px-4 py-2.5 text-sm font-bold">انصراف</button>
            <button
              onClick={async () => {
                if (!wForm.productId || !wForm.qty) return toast.error('کالا و مقدار را وارد کنید')
                try {
                  await api('/api/waste', { method: 'POST', body: wForm })
                  toast.success('ضایعات ثبت شد 🧹')
                  setWOpen(false)
                  loadWaste()
                } catch (e: any) {
                  toast.error(e.message)
                }
              }}
              className="rounded-xl bg-[#0e7a4a] px-5 py-2.5 text-sm font-black text-white shadow-lg"
            >
              ثبت
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#c9a227]/30 border-t-[#c9a227]" />
    </div>
  )
}

/** برگه شمارش: ورود تعداد شمارش‌شده + بستن با اصلاح خودکار موجودی */
function CountModal({ count, onClose, onChanged }: { count: Count; onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<CountItem[]>(count.items)
  const [saving, setSaving] = useState(false)
  const counted = items.filter((i) => i.countedQty !== null).length
  const diffs = items.filter((i) => i.countedQty !== null && i.diff !== 0)
  const acc = counted ? Math.round(((counted - diffs.length) / counted) * 100) : null

  const setQty = (productId: string, v: number | '') => {
    setItems((arr) =>
      arr.map((it) => (it.productId === productId ? { ...it, countedQty: v === '' ? null : v, diff: v === '' ? 0 : (v as number) - it.systemQty } : it))
    )
  }

  const save = async (close: boolean) => {
    setSaving(true)
    try {
      await api('/api/cyclecount', {
        method: 'PUT',
        body: {
          id: count.id,
          close,
          updates: items.filter((i) => i.countedQty !== null).map((i) => ({ productId: i.productId, countedQty: i.countedQty })),
        },
      })
      toast.success(close ? 'برگه بسته شد و موجودی‌ها اصلاح شد ✅' : 'شمارش ذخیره شد')
      onChanged()
      if (close) onClose()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`برگه شمارش — ${count.title}`} onClose={onClose}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <Pill label={`${faNum(counted)}/${faNum(items.length)} شمرده‌شده`} color="#0e7a4a" />
        {acc !== null && <Pill label={`دقت: ${faNum(acc)}٪`} color={acc >= 95 ? '#0e7a4a' : acc >= 80 ? '#c9a227' : '#b3372f'} />}
        {diffs.length > 0 && <Pill label={`${faNum(diffs.length)} مغایرت`} color="#b3372f" />}
        <span className="text-muted-foreground">کالای مغایرت را با مقدار واقعی پر کنید؛ در بستن برگه، موجودی اصلاح می‌شود</span>
      </div>
      <div className="scroll-gold max-h-[55vh] space-y-2 overflow-y-auto pl-1">
        {items.map((it) => (
          <div key={it.productId} className={cn('flex items-center gap-2 rounded-xl border p-2.5', it.diff !== 0 && it.countedQty !== null ? 'border-[#b3372f]/40 bg-[#fee2e2]/30' : 'border-border/70 bg-muted/20')}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">{it.productName}</p>
              <p className="text-[10px] text-muted-foreground">سیستم: {faNum(it.systemQty)} {it.unit}</p>
            </div>
            {it.countedQty !== null && it.diff !== 0 && (
              <Pill label={`${it.diff > 0 ? '+' : ''}${faNum(it.diff)}`} color={it.diff > 0 ? '#8a6d10' : '#b3372f'} />
            )}
            <FaPriceInput value={it.countedQty ?? ''} onChange={(v) => setQty(it.productId, v)} className="w-24 rounded-xl border border-input bg-white px-2 py-2" ariaLabel={`شمارش ${it.productName}`} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button onClick={onClose} className="rounded-xl bg-muted px-4 py-2.5 text-sm font-bold">بستن پنجره</button>
        <button onClick={() => save(false)} disabled={saving} className="rounded-xl bg-secondary px-5 py-2.5 text-sm font-black text-primary shadow">ذخیره شمارش</button>
        <button onClick={() => save(true)} disabled={saving || counted === 0} className="rounded-xl bg-[#0e7a4a] px-5 py-2.5 text-sm font-black text-white shadow-lg disabled:opacity-50">
          بستن برگه + اصلاح موجودی
        </button>
      </div>
    </Modal>
  )
}
