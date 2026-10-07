'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { METHOD_FA, THEME_IMPL_FA, THEME_SUMMARY_FA, PROBLEMS_FA, ROI_FA, GAPS_FA } from '@/lib/research-fa-overlay'
import { AppCtx, SectionCard, Pill, EmptyState } from '@/components/app/ui-bits'
import { faNum } from '@/lib/jalali'
import { cn } from '@/lib/utils'
import {
  GraduationCap, FlaskConical, AlertTriangle, Lightbulb, BookOpen, ChevronDown, Target,
  Quote, TrendingUp, LibraryBig,
} from 'lucide-react'

/* ───────────────────────── types ───────────────────────── */
type Evidence = { authors?: string; year?: number; title?: string; venue?: string; url?: string; finding?: string }
type Theme = { id: string; titleEn: string; titleFa?: string; keyFindings: string[]; evidence: Evidence[]; platformImplication?: string }
type Method = { id: string; name: string; origin: string; formula: string; what: string; evidence: string[]; implementation: string }
type ResearchEn = {
  themes: Theme[]
  manualSystemProblems: { problem: string; evidence?: string[]; cost?: string }[]
  scientificMethods: Method[]
  gaps: string[]
  roi: { metric: string; manual: string; digitized: string; source: string }[]
}

/** پوسته فارسی عنوان‌ها برای موضوعات پژوهشی */
const THEME_FA: Record<string, string> = {
  shrinkage: 'کسری موجودی و پیشگیری از زیان',
  'food-waste': 'ضایعات مواد غذایی',
  'planogram-shelf-space': 'علم قفسه و پلانوگرام',
  'perishable-ordering': 'سفارش‌دهی کالای فاسدشدنی',
  'inventory-foundations': 'مبانی کلاسیک علم موجودی',
  'demand-forecasting': 'پیش‌بینی تقاضا',
  'inventory-record-accuracy': 'دقت سوابق موجودی',
  'shelf-availability': 'دسترس‌پذیری قفسه (Out-of-Stock)',
  'supply-chain-distortion': 'اثر شلاق چرمی و تحریف اطلاعات',
  'fefo-markdown': 'FEFO و مارک‌داون',
  'workforce-gamification': 'بازی‌سازی و نیروی کار',
  'digital-transformation': 'تحول دیجیتال خرده‌فروشی',
  'data-capture-accuracy': 'دقت ثبت داده (بارکد/RFID)',
  'customer-experience': 'تجربه مشتری و فروش',
  'iranian-research': 'پژوهش‌های ایرانی',
}

const METHOD_ICON: Record<string, string> = {
  eoq: '📦', abc: '🏆', 'safety-stock-rop': '🛡️', newsvendor: '📰', croston: '📈', fefo: '🗓️', 'cycle-counting': '📋', 'bullwhip-information': '🔗',
}

/** مقصد هر روش علمی در سامانه — کارت‌ها قابل کلیک‌اند (عمیق‌لینک به ابزار مرتبط) */
const METHOD_NAV: Record<string, { view: string; param?: string; label: string }> = {
  abc: { view: 'products', param: 'abc:A', label: 'محصولات گروه A' },
  'safety-stock-rop': { view: 'science', param: 'rop', label: 'جدول نقطهٔ سفارش' },
  eoq: { view: 'science', param: 'eoq', label: 'جدول EOQ' },
  newsvendor: { view: 'science', param: 'forecast', label: 'پیش‌بینی تقاضا' },
  croston: { view: 'science', param: 'forecast', label: 'پیش‌بینی تقاضا' },
  fefo: { view: 'science', param: 'waste', label: 'دفتر ضایعات' },
  'cycle-counting': { view: 'science', param: 'count', label: 'شمارش چرخه‌ای' },
  'bullwhip-information': { view: 'science', param: 'rop', label: 'نقطهٔ سفارش' },
}

/** مقصد هر محور پژوهشی — «پاسخ سامانه» قابل کلیک می‌شود */
const THEME_NAV: Record<string, { view: string; param?: string; label: string }> = {
  shrinkage: { view: 'science', param: 'count', label: 'شمارش چرخه‌ای' },
  'food-waste': { view: 'science', param: 'waste', label: 'دفتر ضایعات' },
  'perishable-ordering': { view: 'science', param: 'rop', label: 'نقطهٔ سفارش' },
  'inventory-foundations': { view: 'science', param: 'eoq', label: 'جدول EOQ' },
  'demand-forecasting': { view: 'science', param: 'forecast', label: 'پیش‌بینی تقاضا' },
  'inventory-record-accuracy': { view: 'science', param: 'count', label: 'شمارش چرخه‌ای' },
  'shelf-availability': { view: 'products', param: 'low:1', label: 'کالاهای کم‌موجودی' },
  'fefo-markdown': { view: 'science', param: 'waste', label: 'دفتر ضایعات' },
}

/** stats band — کمّی‌ترین یافته‌ها (هر کارت لینک مستقیم به ابزار مرتبط دارد) */
const KEY_STATS: { value: string; label: string; fa: string; nav?: { view: string; param?: string; label: string } }[] = [
  { value: '۱٫۳۶–۱٫۴۸٪', label: 'کسری موجودی از فروش (GRTB)', fa: 'هدف سامانه: زیر ۱٪ با شمارش چرخه‌ای', nav: { view: 'science', param: 'count', label: 'شمارش چرخه‌ای' } },
  { value: '۸٫۳٪', label: 'میانگین جهانی نبود کالا روی قفسه', fa: 'Gruen & Corsten 2002 — ۷۲–۹۱٪ علل: فرایند سفارش فروشگاه', nav: { view: 'products', param: 'low:1', label: 'کالاهای کم‌موجودی' } },
  { value: '~۶۰٪', label: 'سوابق موجودی نادرست در هر لحظه', fa: 'ECR/کاردیف ۲۰۰۷ — راه‌حل: شمارش چرخه‌ای', nav: { view: 'science', param: 'count', label: 'شمارش چرخه‌ای' } },
  { value: '۱–۴٪', label: 'خطای ثبت دستی داده', fa: 'در برابر بارکد: ~۱ خطا در ۷۰ میلیون نویسه' },
]

/** Small inline markdown renderer for the Persian dossier (headings, bullets, bold) */
function Dossier({ md }: { md: string }) {
  const blocks = useMemo(() => md.split('\n'), [md])
  return (
    <div className="space-y-1.5 text-sm leading-7">
      {blocks.map((raw, i) => {
        const line = raw.trim()
        if (!line) return null
        if (line === '---') return <hr key={i} className="my-3 border-border/70" />
        if (line.startsWith('### '))
          return (
            <h4 key={i} className="pt-2 text-sm font-black text-[#8a6d10]">
              {inlineBold(line.slice(4))}
            </h4>
          )
        if (line.startsWith('## '))
          return (
            <h3 key={i} className="border-r-4 border-[#0e7a4a] pt-3 pr-2 text-base font-black text-[#0e7a4a]">
              {inlineBold(line.slice(3))}
            </h3>
          )
        if (line.startsWith('# '))
          return (
            <h2 key={i} className="pt-2 text-lg font-black text-foreground">
              {inlineBold(line.slice(2))}
            </h2>
          )
        if (line.startsWith('- '))
          return (
            <div key={i} className="flex gap-2 pr-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9a227]" />
              <p className="text-[13px] leading-6 text-foreground/90">{inlineBold(line.slice(2))}</p>
            </div>
          )
        return <p key={i} className="text-[13px] leading-6 text-foreground/80">{inlineBold(line)}</p>
      })}
    </div>
  )
}
function inlineBold(s: string): React.ReactNode {
  const parts = s.split(/\*\*(.+?)\*\*/g)
  return parts.map((p, i) => (i % 2 === 1 ? <b key={i} className="font-black text-foreground">{p}</b> : <span key={i}>{p.replace(/\*/g, '')}</span>))
}

export default function ResearchView({ ctx }: { ctx: AppCtx }) {
  const [en, setEn] = useState<ResearchEn | null>(null)
  const [fa, setFa] = useState('')
  const [openTheme, setOpenTheme] = useState<string | null>('shrinkage')
  const [dossierOpen, setDossierOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  /** نام فارسی شاخص‌های ROI */
  const METRIC_FA: Record<string, string> = {
    'Data-entry error rate': 'نرخ خطای ثبت داده',
    'Inventory record accuracy': 'دقت سوابق موجودی (IRA)',
    'Out-of-stock rate': 'نرخ نبودِ کالا روی قفسه',
    'Perishable food waste': 'ضایعات خوراک فاسدشدنی',
    'Shrinkage (% of sales)': 'کسری موجودی (٪ فروش)',
    'Scheduling & execution productivity': 'بهره‌وری زمان‌بندی و اجرا',
    'Order processing time': 'زمان پردازش سفارش',
    'Employee engagement & task follow-through': 'تعامل و پیگیری وظایف پرسنل',
  }

  useEffect(() => {
    api<{ fa: string; en: ResearchEn }>('/api/research')
      .then((d) => {
        setEn(d.en)
        setFa(d.fa)
      })
      .catch((e) => toast.error(e.message || 'خطا در دریافت پژوهش‌نامه'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-5">
      {/* hero */}
      <div className="glow-card hero-emerald relative overflow-hidden rounded-2xl p-5 text-white sm:p-7">
        <div className="pointer-events-none absolute -left-8 -top-8 opacity-15">
          <PistachioOrnament />
        </div>
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#c9a227] text-[#0b2e20] shadow-xl">
              <GraduationCap size={26} />
            </span>
            <div>
              <h1 className="text-xl font-black sm:text-2xl">مرکز پژوهش و علم داده</h1>
              <p className="text-xs text-[#e9f0e4]/85">مبنای آکادمیک سامانه — از Harris 1913 تا پژوهش‌های ایرانی؛ هر قابلیت، یک پشتوانه علمی دارد</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {KEY_STATS.map((s) => (
              <div key={s.label} className="rounded-2xl border border-[#c9a227]/25 bg-white/10 p-3 backdrop-blur-sm">
                <p className="text-2xl font-black text-[#f3d573]">{s.value}</p>
                <p className="mt-0.5 text-[11px] font-bold leading-4">{s.label}</p>
                <p className="mt-1 text-[10px] leading-4 text-[#e9f0e4]/75">{s.fa}</p>
                {s.nav && (
                  <button
                    onClick={() => ctx.navigate(s.nav!.view, s.nav!.param)}
                    className="mt-2 rounded-lg bg-[#c9a227]/90 px-2.5 py-1 text-[10px] font-black text-[#0b2e20] transition hover:bg-[#c9a227]"
                  >
                    {s.nav.label} ←
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#c9a227]/30 border-t-[#c9a227]" />
        </div>
      )}

      {!loading && !en && <EmptyState emoji="📚" title="پژوهش‌نامه در دسترس نیست" hint="فایل‌های پژوهش در سرور یافت نشد" />}

      {en && (
        <>
          {/* روش‌های علمی پیاده‌شده */}
          <SectionCard
            title="روش‌های علمی پیاده‌شده در سامانه"
            subtitle="هر ابزار سامانه از ادبیات عملیات آمده، نه از حدس — با فرمول و منبع"
            icon={<FlaskConical size={18} />}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {en.scientificMethods.map((m) => {
                const fa = METHOD_FA[m.id]
                const nav = METHOD_NAV[m.id]
                return (
                  <div key={m.id} className="glow-card group flex flex-col rounded-2xl bg-card p-4 transition-all hover:-translate-y-0.5">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-2xl">{METHOD_ICON[m.id] || '🔬'}</span>
                      <span className="text-sm font-black text-foreground">{fa?.name || m.name}</span>
                    </div>
                    <p className="mb-2 rounded-lg bg-muted/60 px-2 py-1 text-center font-mono text-[10px] font-bold text-[#0e7a4a]" dir="ltr">
                      {m.formula}
                    </p>
                    <p className="text-[11px] leading-5 text-muted-foreground">{fa?.what || m.what}</p>
                    <p className="mt-2 border-t border-dashed border-border pt-2 text-[11px] leading-5">
                      <b className="text-[#8a6d10]">در سامانه: </b>
                      {fa?.implementation || m.implementation}
                    </p>
                    <p className="mt-2 text-[10px] leading-4 text-muted-foreground/80">📚 {fa?.origin || m.origin}</p>
                    {nav && (
                      <button
                        onClick={() => ctx.navigate(nav.view, nav.param)}
                        className="mt-3 w-full rounded-xl border border-[#0e7a4a]/30 bg-[#e9f0e4]/60 py-2 text-[11px] font-black text-[#0e7a4a] transition hover:bg-[#e9f0e4]"
                        title={`رفتن به ${nav.label}`}
                      >
                        {nav.label} ←
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="mt-3 rounded-xl border border-[#c9a227]/30 bg-[#fdf6dd]/60 p-3 text-center text-xs font-bold text-[#8a6d10]">
              <Target size={14} className="mb-1 inline" /> جعبه‌ابزار علمی سامانه همه این مدل‌ها را روی داده واقعی شما اجرا می‌کند →{' '}
              <button onClick={() => ctx.navigate('science')} className="underline decoration-dotted hover:text-[#0e7a4a]">
                باز کردن جعبه‌ابزار علمی
              </button>
            </div>
          </SectionCard>

          {/* مشکلات سیستم دستی */}
          <SectionCard
            title="چرا سیستم دستی/کاغذی هزینه‌ساز است؟"
            subtitle="شواهد پژوهشی از کارایی گردش‌کار دستی در خواروبار"
            icon={<AlertTriangle size={18} />}
          >
            <div className="grid gap-3 md:grid-cols-2">
              {PROBLEMS_FA.map((p, i) => (
                <div key={i} className="rounded-2xl border border-[#b3372f]/25 bg-[#fee2e2]/25 p-4">
                  <p className="text-sm font-black leading-6 text-[#7a1f19]">{p.problem}</p>
                  <p className="mt-2 rounded-lg bg-white/70 px-3 py-1.5 text-xs font-black leading-5 text-[#a04c2a]">📉 {p.cost}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* موضوعات پژوهش */}
          <SectionCard
            title="پانورمای پژوهش — ۱۵ محور علمی"
            subtitle="یافته‌های کلیدی + استنادها + اینکه سامانه چه پاسخی به هر محور دارد"
            icon={<LibraryBig size={18} />}
          >
            <div className="space-y-2">
              {en.themes.map((t) => {
                const open = openTheme === t.id
                return (
                  <div key={t.id} className={cn('overflow-hidden rounded-2xl border transition-all', open ? 'border-[#0e7a4a]/40 bg-[#0e7a4a]/[0.03] shadow-md' : 'border-border/70 bg-card hover:border-[#c9a227]/40')}>
                    <button onClick={() => setOpenTheme(open ? null : t.id)} className="flex w-full items-center justify-between gap-3 p-4 text-right">
                      <span className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-secondary text-primary">
                          <BookOpen size={16} />
                        </span>
                        <span>
                          <span className="block text-sm font-black">{THEME_FA[t.id] || t.titleEn}</span>
                          <span className="block text-[10px] text-muted-foreground" dir="ltr">{t.titleEn}</span>
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Pill label={`${faNum(t.evidence.length)} منبع`} color="#8a6d10" />
                        <ChevronDown size={18} className={cn('text-muted-foreground transition-transform', open && 'rotate-180')} />
                      </span>
                    </button>
                    {open && (
                      <div className="border-t border-border/60 p-4 pt-3">
                        {/* خلاصه فارسی */}
                        <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#c9a227]/30 bg-[#fdf6dd]/60 p-3">
                          <Lightbulb size={16} className="mt-0.5 shrink-0 text-[#8a6d10]" />
                          <p className="text-[13px] font-bold leading-6 text-foreground">{THEME_SUMMARY_FA[t.id] || t.keyFindings[0]}</p>
                        </div>
                        {/* پاسخ سامانه — با لینک مستقیم به ابزار مرتبط */}
                        {THEME_IMPL_FA[t.id] && (
                          <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#0e7a4a]/30 bg-[#0e7a4a]/5 p-3">
                            <Target size={16} className="mt-0.5 shrink-0 text-[#0e7a4a]" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold leading-5 text-[#0e5a38]">پاسخ سامانه: {THEME_IMPL_FA[t.id]}</p>
                              {THEME_NAV[t.id] && (
                                <button
                                  onClick={() => ctx.navigate(THEME_NAV[t.id].view, THEME_NAV[t.id].param)}
                                  className="mt-2 rounded-lg bg-[#0e7a4a] px-3 py-1.5 text-[10px] font-black text-white transition hover:brightness-110"
                                >
                                  {THEME_NAV[t.id].label} ←
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        {/* یافته‌های اصلی */}
                        <details className="rounded-xl border border-border/60 bg-muted/20 p-3">
                          <summary className="cursor-pointer text-[11px] font-black text-muted-foreground transition hover:text-foreground">
                            یافته‌های اصلی (متن پژوهشی)
                          </summary>
                          <div className="mt-2 space-y-2">
                            {t.keyFindings.map((f, i) => (
                              <div key={i} className="flex gap-2">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0e7a4a]" />
                                <p className="text-[13px] leading-6" dir="ltr">{f}</p>
                              </div>
                            ))}
                          </div>
                        </details>
                        {t.evidence.length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            <p className="text-[10px] font-black text-muted-foreground">استنادها:</p>
                            {t.evidence.map((e, i) => (
                              <a
                                key={i}
                                href={e.url || '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-1.5 text-[11px] leading-5 transition hover:bg-secondary"
                              >
                                <Quote size={11} className="mt-1 shrink-0 text-[#c9a227]" />
                                <span dir="ltr">
                                  <b>{e.authors || '—'} {e.year ? `(${e.year})` : ''} — {e.title}</b>
                                  {e.venue && <span className="text-muted-foreground"> — {e.venue}</span>}
                                </span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </SectionCard>

          {/* ROI */}
          {en.roi.length > 0 && (
            <SectionCard title="دست‌یافتنی‌ها در اعداد — دستی در برابر دیجیتال" subtitle="مقایسه شاخص‌ها بر پایه مطالعات ذکرشده" icon={<TrendingUp size={18} />}>
              <div className="scroll-gold overflow-x-auto">
                <table className="w-full min-w-[560px] text-right text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="p-2">شاخص</th>
                      <th className="p-2">سیستم دستی</th>
                      <th className="p-2">با سامانه</th>
                      <th className="p-2">مبنا</th>
                    </tr>
                  </thead>
                  <tbody>
                    {en.roi.map((r, i) => {
                      const fa = ROI_FA[r.metric]
                      return (
                        <tr key={i} className="border-t border-border/60">
                          <td className="p-2 font-black">{METRIC_FA[r.metric] || r.metric}</td>
                          <td className="p-2 text-[#b3372f]">{fa?.manual || r.manual}</td>
                          <td className="p-2 font-black text-[#0e7a4a]">{fa?.digitized || r.digitized}</td>
                          <td className="p-2 text-[10px] text-muted-foreground">{fa?.source || r.source}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* شکاف‌های صنعت */}
          {GAPS_FA.length > 0 && (
            <SectionCard title="شکاف‌های دیجیتال صنعت — چرا اینجا جای ما خالی است" icon={<Lightbulb size={18} />}>
              <div className="grid gap-2 sm:grid-cols-2">
                {GAPS_FA.map((g, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-xl border border-[#c9a227]/30 bg-[#fdf6dd]/50 p-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#c9a227] text-[11px] font-black text-white">{faNum(i + 1)}</span>
                    <p className="text-xs leading-5">{g}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* dossier full text */}
          {fa && (
            <SectionCard
              title="پژوهش‌نامه کامل (فارسی)"
              subtitle="متن کامل دوشمنت پژوهشی — ۲۵ جست‌وجوی کتاب‌شناختی"
              icon={<BookOpen size={18} />}
              actions={
                <button onClick={() => setDossierOpen((v) => !v)} className="flex items-center gap-1.5 rounded-xl bg-secondary px-4 py-2 text-xs font-black text-primary">
                  {dossierOpen ? 'بستن' : 'نمایش کامل'} <ChevronDown size={14} className={cn('transition-transform', dossierOpen && 'rotate-180')} />
                </button>
              }
            >
              {dossierOpen ? (
                <div className="scroll-gold max-h-[70vh] overflow-y-auto pl-2">
                  <Dossier md={fa} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  متن کامل پژوهش‌نامه — روش پژوهش، ۱۵ محور، استنادهای فارسی و انگلیسی، توصیه‌های علمی برای سامانه.
                </p>
              )}
            </SectionCard>
          )}
        </>
      )}
    </div>
  )
}

/** تزئین پسته — عنصر بصری بومی */
function PistachioOrnament() {
  return (
    <svg width="220" height="220" viewBox="0 0 220 220" fill="none">
      <g transform="translate(110 110)">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <path d="M0 -30 C 14 -52, 14 -78, 0 -96 C -14 -78, -14 -52, 0 -30 Z" fill="#c9a227" />
            <path d="M0 -38 C 9 -54, 9 -72, 0 -86 C -9 -72, -9 -54, 0 -38 Z" fill="#77934a" />
          </g>
        ))}
        <circle r="22" fill="#0b2e20" />
        <circle r="12" fill="#c9a227" />
      </g>
    </svg>
  )
}
