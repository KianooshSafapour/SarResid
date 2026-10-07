'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { cn } from '@/lib/utils'
import type { AppCtx } from '@/components/app/ui-bits'

/**
 * تور آشنایی + حالت آموزشی (Sandbox)
 * علم پشت آن: Guided Discovery Learning — یادگیری فعال با عامل راهنما در محیط امن
 * (Vygotsky's scaffolding؛ آموزش در محیط شبیه‌سازی‌شده بدون ریسک خطای واقعی).
 * در حالت آموزشی همهٔ درخواست‌های نوشتن (non-GET) در لایهٔ api() رهگیری می‌شوند
 * و به سرور نمی‌رسند — کاربر با دادهٔ واقعی می‌چرخد اما چیزی تغییر نمی‌کند.
 */

const SANDBOX_KEY = 'hz-sandbox'

export function isSandbox(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(SANDBOX_KEY) === '1'
}

export function setSandbox(on: boolean) {
  if (typeof window === 'undefined') return
  if (on) sessionStorage.setItem(SANDBOX_KEY, '1')
  else sessionStorage.removeItem(SANDBOX_KEY)
}

function subscribeSandbox(cb: () => void) {
  window.addEventListener('hz-sandbox-change', cb)
  window.addEventListener('popstate', cb)
  return () => {
    window.removeEventListener('hz-sandbox-change', cb)
    window.removeEventListener('popstate', cb)
  }
}

type TourStep = { view: string; param?: string; selector?: string; title: string; body: string }

const STEPS: TourStep[] = [
  { view: 'dashboard', title: 'داشبورد — مرکز فرمان', body: 'همه‌چیز از اینجا شروع می‌شود: کارهای امروز شما، هشدارها، کنترل قیمت، و جست‌وجوی فوری آرشیو اسناد. تور ما ۶ ایستگاه دارد — با «بعدی» پیش بیایید.' },
  { view: 'dashboard', selector: 'header button[title="اعلان‌ها"]', title: 'اعلان‌های زنده', body: 'زنگ بالا-چپ، مرور لحظه‌ای کارهاست: چک‌های سررسیده، سفارش‌های عقب‌افتاده، مغایرت‌های شمارش. می‌توانید موقتاً ساکتش کنید یا اعلان دسکتاپ فعال کنید.' },
  { view: 'orders', title: 'سفارش‌ها — چرخهٔ تأمین', body: 'از ثبت تا تحویل: پیش‌نویس ← تأیید ← دریافت ← تأیید انبار ← حسابداری هلو. هر سفارش تاریخچهٔ کامل و شفاف دارد. دکمهٔ «سفارش جدید» بالای همین صفحه است.' },
  { view: 'products', title: 'کالاها و سفارش هوشمند', body: 'فهرست کالاها با جست‌وجو و بارکد. برای هر کالای کم‌موجودی، «سفارش هوشمند» پیشنهاد مقدار بر اساس فروش اخیر می‌دهد — به مبنای علمی آن هم دسترسی دارید.' },
  { view: 'zonecount', title: 'شمارش روزانهٔ زون (شمارش کور)', body: 'مسئول هر زون روزانه کالاها را می‌شمارد — بدون دیدن عدد سیستم! سامانه فقط ✓ یا ⚠ نشان می‌دهد و مغایرت با هلو را به مدیر اطلاع می‌دهد. شمارش کور یعنی شمارش بی‌طرف.' },
  { view: 'archive', title: 'آرشیو اسناد — پل دیجیتال به فیزیکی', body: 'نام تأمین‌کننده را بزنید: همهٔ فاکتورهایش، مسیر فیزیکی سند (کابینت ← طبقه ← زونکن ← جایگاه) و حتی «کارت کالا» با تاریخچهٔ کامل هر محصول. در داشبورد هم جست‌وجوی فوری دارد.' },
  { view: 'cheques', title: 'چک‌ها — برنامه‌ریز سررسید', body: 'تاریخ نوشتن + سقف مهلت را بدهید؛ سامانه سررسید را حساب می‌کند، تعطیلی‌ها (تعطیلات رسمی و جمعه‌ها) را هشدار می‌دهد و روزهای کاری جایگزین پیشنهاد می‌کند. تقویم قمری هم دقیق است.' },
  { view: 'help', title: 'پایان تور — راهنما همیشه هست', body: 'هر وقت گم شدید، «راهنما و آموزش» و «تور آشنایی» اینجاست. وقتی آماده شدید، از نوار آموزشی پایین صفحه خارج شوید تا سامانه در حالت عادی ذخیره کند. موفق باشید 🌿' },
]

export default function SandboxTour({ ctx }: { ctx: AppCtx }) {
  const [tour, setTour] = useState<number | null>(null)
  const [spot, setSpot] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const sandbox = useSyncExternalStore(
    subscribeSandbox,
    () => isSandbox(),
    () => false
  )
  const navRef = useRef(ctx.navigate)
  useEffect(() => {
    navRef.current = ctx.navigate
  }, [ctx.navigate])

  const startTour = useCallback(() => {
    setSandbox(true)
    window.dispatchEvent(new Event('hz-sandbox-change'))
    setTour(0)
    navRef.current(STEPS[0].view, STEPS[0].param || '')
    toast.info('🎓 حالت آموزشی فعال شد — هیچ تغییری ذخیره نمی‌شود')
  }, [])

  useEffect(() => {
    const onStart = () => startTour()
    window.addEventListener('hz-start-tour', onStart)
    // alias برای بازپخش برنامه‌ای (مثلاً از دانشنامه) — همان رفتار
    const onOpen = () => startTour()
    window.addEventListener('hz-open-tour', onOpen)
    return () => {
      window.removeEventListener('hz-start-tour', onStart)
      window.removeEventListener('hz-open-tour', onOpen)
    }
  }, [startTour])

  // spotlight positioning after navigation/render
  useEffect(() => {
    if (tour === null) return
    const step = STEPS[tour]
    const t1 = setTimeout(() => {
      const el = step.selector ? document.querySelector(step.selector) : null
      if (el) {
        const r = el.getBoundingClientRect()
        setSpot({ x: r.x, y: r.y, w: r.width, h: r.height })
      } else {
        setSpot(null)
      }
    }, 650)
    return () => clearTimeout(t1)
  }, [tour, ctx.view])

  const exitSandbox = useCallback(() => {
    setSandbox(false)
    window.dispatchEvent(new Event('hz-sandbox-change'))
    setTour(null)
    toast.success('حالت آموزشی پایان یافت — از این پس تغییرات واقعی ذخیره می‌شود')
  }, [])

  const requestUpgrade = useCallback(async () => {
    try {
      await api('/api/feedback', {
        method: 'POST',
        body: { type: 'IDEA', content: `🎓 درخواست ارتقای دسترسی: کاربر پس از تور آشنایی درخواست دسترسی بیشتر دارد.` },
      })
      toast.success('درخواست شما برای مدیریت ارسال شد ✅')
    } catch {
      toast.error('ارسال درخواست ناموفق بود')
    }
  }, [])

  const go = (dir: 1 | -1) => {
    const next = (tour as number) + dir
    if (next < 0 || next >= STEPS.length) {
      setTour(null)
      toast.success('تور تمام شد — سامانه در حالت آموزشی می‌ماند تا خودتان خارج شوید')
      // گزارش تکمیل تور برای مدیر (fire-and-forget — نمایش تور همچنان محلی است)
      api('/api/tours', { method: 'POST', body: { action: 'done', step: STEPS.length } }).catch(() => {})
      return
    }
    const s = STEPS[next]
    setTour(next)
    if (s.view !== ctx.view) navRef.current(s.view, s.param || '')
  }

  return (
    <>
      {/* sandbox banner */}
      {sandbox && (
        <div className="fixed inset-x-0 bottom-0 z-[60] border-t-2 border-[#c9a227] bg-[#0b2e20]/95 px-4 py-2.5 backdrop-blur" dir="rtl">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[11px] font-extrabold text-[#f3ead0]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#c9a227] text-xs">🎓</span>
              حالت آموزشی فعال است — با دادهٔ واقعی می‌چرخید اما هیچ تغییری ذخیره نمی‌شود
            </p>
            <div className="flex items-center gap-2">
              <button onClick={startTour} className="rounded-xl border border-[#c9a227]/50 px-3 py-1.5 text-[10px] font-black text-[#c9a227] transition hover:bg-[#c9a227]/15">
                ▶ اجرای تور آشنایی
              </button>
              <button onClick={requestUpgrade} className="rounded-xl border border-[#93c572]/40 px-3 py-1.5 text-[10px] font-black text-[#93c572] transition hover:bg-[#93c572]/10">
                📨 درخواست دسترسی بیشتر
              </button>
              <button onClick={exitSandbox} className="rounded-xl bg-[#0e7a4a] px-3 py-1.5 text-[10px] font-black text-white transition hover:shadow-lg">
                پایان حالت آموزشی
              </button>
            </div>
          </div>
        </div>
      )}

      {/* guided tour overlay */}
      {tour !== null && (
        <div className="fixed inset-0 z-[70]" dir="rtl">
          <div
            className="absolute inset-0 bg-black/55 transition-all duration-300"
            style={spot ? { clipPath: `circle(${Math.max(spot.w, spot.h) / 2 + 18}px at ${spot.x + spot.w / 2}px ${spot.y + spot.h / 2}px)` } : undefined}
            onClick={() => go(1)}
          />
          <div className="absolute inset-x-4 bottom-24 mx-auto max-w-lg rounded-3xl border border-[#c9a227]/50 bg-[#fdf6dd] p-5 shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-24 sm:w-[420px]">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-black text-[#0e7a4a]">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#c9a227]/20 text-base">🫒</span>
                {STEPS[tour].title}
              </p>
              <span className="rounded-full bg-[#c9a227]/15 px-2 py-0.5 text-[10px] font-black text-[#8a6d10]">
                ایستگاه {(tour + 1).toLocaleString('fa-IR')} از {STEPS.length.toLocaleString('fa-IR')}
              </span>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-foreground/80">{STEPS[tour].body}</p>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <span key={i} className={cn('h-1.5 rounded-full transition-all', i === tour ? 'w-5 bg-[#0e7a4a]' : 'w-1.5 bg-[#0e7a4a]/25')} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setTour(null)} className="rounded-xl px-3 py-2 text-[11px] font-bold text-muted-foreground transition hover:bg-black/5">
                  بستن
                </button>
                {tour > 0 && (
                  <button onClick={() => go(-1)} className="rounded-xl border border-[#8a5a2b]/30 px-4 py-2 text-[11px] font-black text-[#8a5a2b] transition hover:bg-black/5">
                    قبلی
                  </button>
                )}
                <button onClick={() => go(1)} className="rounded-xl bg-[#0e7a4a] px-5 py-2 text-[11px] font-black text-white shadow transition hover:shadow-lg">
                  {tour === STEPS.length - 1 ? 'پایان تور 🌿' : 'بعدی ←'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** فقط دکمهٔ ورود — در پاصفحهٔ نوار کنار سوار می‌شود */
export function SandboxTourButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event('hz-start-tour'))}
      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#c9a227]/30 bg-[#c9a227]/10 px-2 py-1.5 text-[10px] font-extrabold text-[#c9a227] transition hover:bg-[#c9a227]/20"
      title="یادگیری امن: تور آشنایی با دادهٔ واقعی، بدون ذخیرهٔ تغییرات"
    >
      🎓 تور آشنایی و حالت آموزشی
    </button>
  )
}
