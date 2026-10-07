'use client'
/* ───────────────── زنجیرهٔ تأمین — بخش واحد چرخهٔ سفارش تا تحویل (round-19h) ─────────────────
 * درخواست مالک: «سفارش‌ها، دریافت مرسوله و تایید انبار همه در یک بخش واحد که میزبان همهٔ
 * بخش‌های مختلف زنجیرهٔ تأمین از سفارش تا تحویل باشد.»
 *
 * معماری: این نما یک «پوستهٔ زنجیره» است — سه نمای موجود (OrdersView / ReceivingView /
 * VerifyView) بدون هیچ تغییری داخل سه تب RTL میزبان می‌شوند تا CRUD و منطق هر مرحله
 * عیناً همان قبلی بماند (Single Source of Behavior). هش‌های قدیمی #/orders و #/receiving و
 * #/verify هم از طریق AppShell به همین نما با تبِ ازپیش‌انتخاب‌شده نگاشت می‌شوند —
 * پس همهٔ اعلان‌ها و لینک‌های عمیق موجود (go:'orders/...' و…) بدون شکست کار می‌کنند.
 *
 * نکتهٔ پارامتر: ctx.param در این چرخه یا «new» است (سفارش جدید)، یا شناسهٔ سفارش، یا
 * نام تب (#/supply/receiving). نام تب هرگز به نماهای مرحله نشت نمی‌کند و «new» فقط به
 * مرحلهٔ سفارش پاس می‌شود؛ پارامترِ شناسهٔ سفارش به مرحلهٔ فعال پاس می‌شود تا نمای جزئیات
 * همان‌جا باز شود (رفتار سازگار با سه نمای مستقل قبلی).
 */

import { useMemo, useState } from 'react'
import { ClipboardList, PackageCheck, Warehouse, Truck, ChevronLeft } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import OrdersView from '@/components/views/Orders'
import ReceivingView from '@/components/views/Receiving'
import VerifyView from '@/components/views/Verify'
import type { AppCtx } from '@/components/app/ui-bits'
import { cn } from '@/lib/utils'

type SupplyTab = 'orders' | 'receiving' | 'verify'

const TAB_KEYS: SupplyTab[] = ['orders', 'receiving', 'verify']

const STAGE_TABS: { key: SupplyTab; label: string; icon: React.ReactNode }[] = [
  { key: 'orders', label: 'سفارش‌ها', icon: <ClipboardList size={16} /> },
  { key: 'receiving', label: 'دریافت مرسوله', icon: <PackageCheck size={16} /> },
  { key: 'verify', label: 'تأیید انبار', icon: <Warehouse size={16} /> },
]

/** نوار چرخه — «چرخهٔ سفارش تا تحویل» با نشانگر نمایشی سه‌مرحله‌ای (سفارش → دریافت → تایید) */
function CycleStrip({ active }: { active: SupplyTab }) {
  const steps: { key: SupplyTab; label: string; emoji: string }[] = [
    { key: 'orders', label: 'سفارش', emoji: '🧾' },
    { key: 'receiving', label: 'دریافت', emoji: '📥' },
    { key: 'verify', label: 'تایید', emoji: '✅' },
  ]
  const activeIdx = steps.findIndex((s) => s.key === active)
  return (
    <div className="fade-in-up flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#c9a227]/30 bg-gradient-to-l from-[#f7efe2] via-[#fdf9ee] to-[#f3f6ec] p-4">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-black text-[#0b2e20]">
          <Truck size={16} className="shrink-0 text-[#8a6d10]" />
          چرخهٔ سفارش تا تحویل
        </p>
        <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
          زنجیرهٔ تأمین در یک بخش — ثبت سفارش به تأمین‌کننده، دریافت مرسوله و تأیید انبار؛ همهٔ مراحل همین‌جاست
        </p>
      </div>
      {/* نشانگر مینی‌چرخه — صرفاً نمایشی؛ مرحلهٔ فعال طلایی، مراحل طی‌شده سبز */}
      <div className="flex flex-wrap items-center gap-1" aria-hidden="true">
        {steps.map((s, i) => (
          <span key={s.key} className="flex items-center gap-1">
            {i > 0 && <ChevronLeft size={14} className="text-[#8a6d10]/70" />}
            <span
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-extrabold transition-colors',
                i === activeIdx
                  ? 'border-[#c9a227] bg-[#c9a227] text-[#0b2e20] shadow-sm'
                  : i < activeIdx
                    ? 'border-[#0e7a4a]/30 bg-[#0e7a4a]/10 text-[#0e7a4a]'
                    : 'border-border bg-white/70 text-muted-foreground'
              )}
            >
              <span>{s.emoji}</span>
              {s.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function SupplyChainView({ ctx, initialTab }: { ctx: AppCtx; initialTab?: string }) {
  // تب آغازین: از AppShell (نگاشت هش‌های قدیمی orders/receiving/verify یا #/supply/<tab>)
  const start: SupplyTab = TAB_KEYS.includes(initialTab as SupplyTab) ? (initialTab as SupplyTab) : 'orders'
  const [tab, setTab] = useState<SupplyTab>(start)

  /* همگام‌سازی تب با هش — دکمهٔ برگشت مرورگر: hash از #/supply/verify به #/supply/receiving
   * برمی‌گردد؛ چون کلید کامپوننت (sc-supply) عوض نمی‌شود، تب را با الگوی رسمی «تنظیم state
   * در رندر» (همان الگوی People.tsx) با پارامتر ناوبری هم‌راستا می‌کنیم. */
  const [lastNav, setLastNav] = useState('')
  const navSig = `${ctx.view}|${ctx.param}`
  if (navSig !== lastNav) {
    setLastNav(navSig)
    if (ctx.view === 'supply' && TAB_KEYS.includes(ctx.param as SupplyTab) && ctx.param !== tab) {
      setTab(ctx.param as SupplyTab)
    }
  }

  /* پارامتر ناوبری — گارِ نشت:
   *  • نام تب (#/supply/receiving) فقط انتخابگر تب است → برای نماهای مرحله خالی می‌شود.
   *  • «new» فقط در مرحلهٔ سفارش معنا دارد → به مراحل دیگر پاس نمی‌شود.
   *  • شناسهٔ سفارش به نمای مرحلهٔ فعال پاس می‌شود (جزئیات همان‌جا باز می‌شود — مثل قبل). */
  const isTabName = TAB_KEYS.includes(ctx.param as SupplyTab)
  const innerParam = isTabName ? '' : ctx.param === 'new' && tab !== 'orders' ? '' : ctx.param
  const childCtx = useMemo<AppCtx>(() => ({ ...ctx, param: innerParam }), [ctx, innerParam])

  /* تعویض تب: آدرس به‌روز می‌شود (#/supply/<tab>) تا لینک عمیق و دکمهٔ برگشت مرورگر درست بمانند.
   * اگر همین تبِ فعلی‌ایم و پارامتری نیست، ناوبری لازم نیست. */
  const onTab = (v: string) => {
    const t = v as SupplyTab
    if (!TAB_KEYS.includes(t)) return
    setTab(t)
    if (ctx.view !== 'supply' || ctx.param !== t) ctx.navigate('supply', t)
  }

  return (
    <div className="space-y-4">
      <CycleStrip active={tab} />

      <Tabs value={tab} onValueChange={onTab}>
        <TabsList
          className="grid h-auto w-full grid-cols-3 gap-1 rounded-2xl border border-[#8a5a2b]/25 bg-[#f7efe2] p-1.5"
          aria-label="مراحل زنجیرهٔ تأمین"
        >
          {STAGE_TABS.map((t) => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className={cn(
                'min-h-[44px] flex-col gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-extrabold sm:flex-row sm:gap-1.5 sm:text-xs',
                tab === t.key ? 'bg-[#0e7a4a] text-white shadow-md data-[state=active]:bg-[#0e7a4a] data-[state=active]:text-white' : 'text-[#5c4a32] hover:bg-white/60 data-[state=active]:bg-transparent'
              )}
            >
              {t.icon}
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* نماهای مرحله عیناً همان کامپوننت‌های قبلی‌اند — فقط میزبانشان عوض شده */}
      {tab === 'orders' && <OrdersView ctx={childCtx} />}
      {tab === 'receiving' && <ReceivingView ctx={childCtx} />}
      {tab === 'verify' && <VerifyView ctx={childCtx} />}
    </div>
  )
}
