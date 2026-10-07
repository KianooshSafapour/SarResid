'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { LANGS, useLang, type Lang } from '@/lib/i18n'
import { faNum } from '@/lib/jalali'
import {
  useUiPrefs,
  CAL_FONT_LABELS,
  clampFontScale,
  FONT_SCALE_MIN,
  FONT_SCALE_MAX,
  FONT_SCALE_STEP,
  type CalFont,
  type Density,
} from '@/components/app/jalali-widgets'
import { cn } from '@/lib/utils'

/* ═══════════════════ پوسته‌های رنگی (مأموریت 16-D) ═══════════════════
 * چهار پوستهٔ برند (بدون آبی/بنفش) با data-theme روی <html> + localStorage('hz-theme')
 * متغیرهای پالت (شِدِن var(--primary), حلقهٔ تمرکز, سایدبار/پترن گره, کارت‌های هیرو)
 * از تگ <style id="hz-theme-vars"> تزریق می‌شوند — بدون دست‌زدن به globals.css.
 */
export type HzTheme = 'zaytoon' | 'pistachio' | 'saffron' | 'pomegranate'
export const HZ_THEME_KEY = 'hz-theme'
export const HZ_THEMES: { key: HzTheme; label: string; hint: string; primary: string; gold: string }[] = [
  { key: 'zaytoon', label: 'زیتون', hint: 'پیش‌فرض — سبز زیتونی و طلایی', primary: '#0e7a4a', gold: '#c9a227' },
  { key: 'pistachio', label: 'پسته', hint: 'سبز پسته‌ای با طلایی', primary: '#77934a', gold: '#c9a227' },
  { key: 'saffron', label: 'زعفران', hint: 'گرم زعفرانی با طلایی', primary: '#c96f4a', gold: '#8a6d10' },
  { key: 'pomegranate', label: 'انار', hint: 'سرخ اناری با طلایی', primary: '#b3372f', gold: '#c9a227' },
]

/** پوستهٔ ذخیره‌شدهٔ این دستگاه (پیش‌فرض: زیتون) */
export function readStoredTheme(): HzTheme {
  if (typeof window === 'undefined') return 'zaytoon'
  try {
    const v = localStorage.getItem(HZ_THEME_KEY)
    return HZ_THEMES.some((t) => t.key === v) ? (v as HzTheme) : 'zaytoon'
  } catch {
    return 'zaytoon'
  }
}

/** اعمال پوسته روی <html data-theme> — زیتون = پاک‌کردن صفت (پالت پیش‌فرض globals) */
export function applyThemeDom(t: HzTheme) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  if (!t || t === 'zaytoon') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', t)
}

/* فقط بازنویسی متغیر — سطوح تیرهٔ شب در شاخهٔ html.dark[data-theme] برمی‌گردند */
const HZ_THEME_CSS = `
/* پوسته‌های رنگی هایپر زیتون (16-D) — زیتون/پسته/زعفران/انار؛ additive و امن */
:root[data-theme='pistachio']{--primary:#77934a;--primary-foreground:#f7fdf5;--ring:#c9a227;--secondary:#eef2dd;--secondary-foreground:#33421f;--accent:#f3efcf;--accent-foreground:#665010;--gold:#c9a227;--chart-1:#77934a;--chart-2:#c9a227;--chart-3:#c96f4a;--chart-4:#5c7236;--background:#f5f8ec;--sidebar:#202d13;--sidebar-foreground:#eef2dd;--sidebar-primary:#c9a227;--sidebar-primary-foreground:#202d13;--sidebar-accent:#2e3d1c;--sidebar-accent-foreground:#f0ecd2;--sidebar-border:#415627;--sidebar-ring:#c9a227}
:root[data-theme='pistachio'] .pattern-girih{background-color:#202d13}
:root[data-theme='pistachio'] .hero-emerald{background:linear-gradient(to left,#202d13,#35491f 52%,#77934a);background-size:auto}
html.dark[data-theme='pistachio']{--primary:#a9c881;--primary-foreground:#1d2a0d;--secondary:#27301b;--secondary-foreground:#dbe7c4;--accent:#2c2a16;--accent-foreground:#e2cf87;--ring:#c9a227;--gold:#c9a227;--background:#0d1a14;--card:#12241b;--popover:#14281e;--border:#25402f;--input:#2c4a37}
:root[data-theme='saffron']{--primary:#c96f4a;--primary-foreground:#fff8f2;--ring:#8a6d10;--secondary:#f7ecda;--secondary-foreground:#6b4a12;--accent:#f9edd2;--accent-foreground:#7a5a0e;--gold:#8a6d10;--chart-1:#c96f4a;--chart-2:#8a6d10;--chart-3:#77934a;--chart-4:#b3372f;--background:#fbf4e8;--sidebar:#2b1a0e;--sidebar-foreground:#f3e9d8;--sidebar-primary:#c9a227;--sidebar-primary-foreground:#2b1a0e;--sidebar-accent:#42290f;--sidebar-accent-foreground:#f3ead0;--sidebar-border:#5c3d18;--sidebar-ring:#c9a227}
:root[data-theme='saffron'] .pattern-girih{background-color:#2b1a0e}
:root[data-theme='saffron'] .hero-emerald{background:linear-gradient(to left,#2b1a0e,#4a2c12 52%,#c96f4a);background-size:auto}
html.dark[data-theme='saffron']{--primary:#e2926c;--primary-foreground:#33170a;--secondary:#332614;--secondary-foreground:#f0dfc5;--accent:#2e2410;--accent-foreground:#e6c56d;--ring:#d9a441;--gold:#d9a441;--background:#0d1a14;--card:#12241b;--popover:#14281e;--border:#25402f;--input:#2c4a37}
:root[data-theme='pomegranate']{--primary:#b3372f;--primary-foreground:#fff5f2;--ring:#c9a227;--secondary:#f8e9e4;--secondary-foreground:#5d1f19;--accent:#f5eccf;--accent-foreground:#6b5310;--gold:#c9a227;--chart-1:#b3372f;--chart-2:#c9a227;--chart-3:#77934a;--chart-4:#c96f4a;--background:#fbf3ef;--sidebar:#2c1013;--sidebar-foreground:#f5e4e0;--sidebar-primary:#c9a227;--sidebar-primary-foreground:#2c1013;--sidebar-accent:#47191c;--sidebar-accent-foreground:#f5e3d0;--sidebar-border:#632226;--sidebar-ring:#c9a227}
:root[data-theme='pomegranate'] .pattern-girih{background-color:#2c1013}
:root[data-theme='pomegranate'] .hero-emerald{background:linear-gradient(to left,#2c1013,#4d1a17 52%,#b3372f);background-size:auto}
html.dark[data-theme='pomegranate']{--primary:#dc5f55;--primary-foreground:#330b08;--secondary:#33191a;--secondary-foreground:#f3d3cd;--accent:#2d2313;--accent-foreground:#e2c97f;--ring:#c9a227;--gold:#c9a227;--background:#0d1a14;--card:#12241b;--popover:#14281e;--border:#25402f;--input:#2c4a37}
`

/**
 * چارچوب پاپ‌اور سراسری (پورتال به <body>)
 * چرا پورتال؟ نوار بالای اپ «sticky z-20» است و سایدبار «fixed z-30» — پاپ‌اورِ داخل هدر
 * هرگز بالای سایدبار/کشو نمی‌آید و روکشِ کلیک‌خارج زیر آن‌ها گیر می‌کرد (شکایت مالک:
 * «پنجرهٔ شخصی‌سازی با کلیک بیرون بسته نمی‌شود»).
 *  - روکش z-[56] بالای همه‌محتوای ناوبری (هدر ۲۰ / سایدبار ۳۰ / کشو ۵۰) و زیر تور، اسکنر و فرمان‌یاب
 *  - بسته‌شدن: کلیک بیرون ✓ کلید Escape ✓
 *  - جای‌گذاری هوشمند: لبهٔ درگاه + دوباره‌چینی روی scroll/resize؛ هرگز از صفحه بیرون نمی‌زند
 */
export function PopoverScaffold({
  open,
  onClose,
  anchorRef,
  width,
  panelClassName,
  maxHeightVh = 78,
  children,
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  /** عرض پنل به px — برای بستن داخل درگاه */
  width: number
  /** کلاس‌های تکمیلی پنل (مثل p-1.5 یا p-3) */
  panelClassName?: string
  maxHeightVh?: number
  children: ReactNode
}) {
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const place = () => {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const left = Math.min(Math.max(8, r.left), Math.max(8, vw - width - 8))
      const estH = Math.round((vh * maxHeightVh) / 100)
      const below = r.bottom + 8
      const top = below + estH > vh - 8 ? Math.max(8, r.top - estH - 8) : below
      setPos({ top, left, maxH: Math.max(160, Math.min(estH, vh - top - 8)) })
    }
    // rAF: جای‌گذاری اولیه بعد از paint — setState همگام در اثر نیست
    const raf = requestAnimationFrame(place)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchorRef, width, maxHeightVh])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !pos) return null
  return createPortal(
    <>
      {/* روکش کلیک‌خارج — تمام‌صفحه، بالای ناوبری */}
      <div className="fixed inset-0 z-[56]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="false"
        className={cn('scroll-gold fixed z-[57] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl', panelClassName)}
        style={{ top: pos.top, left: pos.left, width, maxHeight: pos.maxH }}
      >
        {children}
      </div>
    </>,
    document.body
  )
}

/**
 * میزبان شخصی‌سازی: زبان (۴ زبانه) + تم روشن/شب + پنل «شخصی‌سازی» (⚙️)
 *  - اندازهٔ قلم سامانه (root font-size ۸۵٪ تا ۱۳۰٪)
 *  - قلم تقویم (کوچک/معمولی/بزرگ/خیلی بزرگ → CSS var --cal-font روی همهٔ تقویم‌ها)
 *  - تراکم نمایش (data-density → جمع‌وجور واقعی روی کل اپ)
 *  - نمایش تقویم‌ها (عدد قمری / عدد میلادی در خانه‌های تقویم)
 *  - پوستهٔ رنگی (زیتون/پسته/زعفران/انار → data-theme روی <html> + متغیرهای پالت)
 * موضوع شب «شب زیتون»: سبز عمیق + طلایی — هویت برند حفظ می‌شود.
 * همگام‌سازی جهت: <html dir/lang> و جهت Toaster (sonner) با زبان فعال قفل می‌شوند.
 */
export function ThemeLangBar({ compact = false }: { compact?: boolean }) {
  const { lang, setLang: changeLang, t, dir } = useLang()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const emptySubscribe = useCallback(() => () => {}, [])
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
  const [langOpen, setLangOpen] = useState(false)
  const [prefOpen, setPrefOpen] = useState(false)
  const langBtnRef = useRef<HTMLButtonElement>(null)
  const prefBtnRef = useRef<HTMLButtonElement>(null)
  const { prefs, update } = useUiPrefs()

  /* پوستهٔ رنگی — خوانش localStorage در مقداردهی اولیهٔ state و اعمال «قبل از رنگ‌آمیزی»
   * (idempotent و امن در StrictMode؛ اثرِ تغییر بعدی در useEffect اعمال می‌شود) */
  const [hzTheme, setHzTheme] = useState<HzTheme>(() => {
    const t = readStoredTheme()
    applyThemeDom(t)
    return t
  })
  useEffect(() => {
    applyThemeDom(hzTheme)
  }, [hzTheme])

  /* جهت سند + جهت توست‌ها را با زبان فعال همگام نگه می‌داریم.
   * ThemeLangBar در همهٔ صفحاتِ واردشده سوار است؛ صفحهٔ ورود را اسکریپت themeInit پوشش می‌دهد. */
  useEffect(() => {
    document.documentElement.setAttribute('dir', dir)
    document.documentElement.setAttribute('lang', lang)
    const toaster = document.querySelector('[data-sonner-toaster]')
    if (toaster) toaster.setAttribute('dir', dir)
  }, [dir, lang])

  const isDark = mounted && resolvedTheme === 'dark'
  const scale = clampFontScale(prefs.fontScale)

  const closeAll = useCallback(() => {
    setLangOpen(false)
    setPrefOpen(false)
  }, [])

  /** فقط یک پاپ‌اور باز می‌ماند — بازکردن یکی، دیگری را می‌بندد */
  const toggleLang = () => {
    setPrefOpen(false)
    setLangOpen((v) => !v)
  }
  const togglePrefs = () => {
    setLangOpen(false)
    setPrefOpen((v) => !v)
  }

  const pick = (l: Lang) => {
    changeLang(l)
    closeAll()
    toast.success(l === 'fa' ? 'زبان: فارسی 🇮🇷' : l === 'en' ? 'Language: English 🌐' : l === 'ar' ? 'اللغة: العربية 🌍' : 'Dil: Türkçe 🌐')
  }

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark'
    setTheme(next)
    update({ theme: next })
  }

  const bumpScale = (d: 1 | -1) => {
    const next = Math.round((scale + d * FONT_SCALE_STEP) * 100) / 100
    const clamped = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, next))
    update({ fontScale: clamped })
  }

  const pickTheme = (key: HzTheme) => {
    setHzTheme(key)
    try {
      localStorage.setItem(HZ_THEME_KEY, key)
    } catch {
      /* storage blocked */
    }
    const th = HZ_THEMES.find((t) => t.key === key)
    toast.success(`پوستهٔ رنگی: ${th?.label || 'زیتون'} 🎨`)
  }

  return (
    <div className={cn('flex items-center gap-1.5', compact && 'gap-1')}>
      {/* متغیرهای پوسته‌های رنگی — همیشه حاضر، قبل از اولین رنگ‌آمیزی */}
      <style id="hz-theme-vars" dangerouslySetInnerHTML={{ __html: HZ_THEME_CSS }} />
      {/* تم */}
      <button
        onClick={toggleTheme}
        title={isDark ? 'تم روشن (کرم زیتونی)' : 'تم شب زیتون'}
        aria-label="تغییر تم"
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-card text-sm transition hover:border-[#c9a227]/60"
      >
        {mounted ? (isDark ? '🌞' : '🌙') : '🌗'}
      </button>

      {/* زبان */}
      <button
        ref={langBtnRef}
        onClick={toggleLang}
        title="زبان / Language / اللغة / Dil"
        aria-label="تغییر زبان"
        aria-expanded={langOpen}
        className="flex h-8 items-center gap-1 rounded-xl border border-border bg-card px-2 text-[11px] font-black transition hover:border-[#c9a227]/60"
      >
        🌐 <span className="uppercase">{lang}</span>
      </button>
      <PopoverScaffold open={langOpen} onClose={closeAll} anchorRef={langBtnRef} width={168} panelClassName="p-1.5">
        {LANGS.map((l) => (
          <button
            key={l.code}
            onClick={() => pick(l.code)}
            className={cn(
              'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition hover:bg-secondary',
              lang === l.code && 'bg-[#c9a227]/15 text-[#8a6d10]'
            )}
          >
            <span>{l.flag}</span>
            <span>{l.label}</span>
            {lang === l.code && <span className="ms-auto text-[#0e7a4a]">✓</span>}
          </button>
        ))}
        <p className="border-t border-dashed border-border px-3 pt-1.5 pb-0.5 text-[8.5px] leading-relaxed text-muted-foreground">
          پوسته کامل ترجمه شده؛ متن‌های تخصصی هر بخش به‌تدریج چندزبانه می‌شوند.
        </p>
      </PopoverScaffold>

      {/* شخصی‌سازی */}
      <button
        ref={prefBtnRef}
        onClick={togglePrefs}
        title="شخصی‌سازی — اندازهٔ قلم، تراکم و تقویم‌ها"
        aria-label="شخصی‌سازی"
        aria-expanded={prefOpen}
        className="flex h-8 items-center gap-1 rounded-xl border border-border bg-card px-2 text-[11px] font-black transition hover:border-[#c9a227]/60"
      >
        ⚙️ <span className="hidden sm:inline">شخصی‌سازی</span>
      </button>
      <PopoverScaffold open={prefOpen} onClose={closeAll} anchorRef={prefBtnRef} width={288} panelClassName="p-3" maxHeightVh={78}>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-black text-foreground">
          ⚙️ شخصی‌سازی سامانه
        </h3>

        {/* اندازهٔ قلم سامانه */}
        <div className="mb-2.5 rounded-xl border border-border/70 bg-muted/30 p-2.5">
          <p className="mb-1.5 text-[11px] font-extrabold">اندازهٔ قلم سامانه</p>
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => bumpScale(-1)}
              disabled={scale <= FONT_SCALE_MIN}
              title="کوچک‌تر"
              aria-label="کوچک‌تر کردن قلم"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-lg font-black transition hover:border-primary/60 disabled:opacity-30"
            >
              −
            </button>
            <div className="text-center">
              <span className="block text-base font-black text-[#0e7a4a]">{faNum(Math.round(scale * 100))}٪</span>
              <span className="block text-[8.5px] text-muted-foreground">محدوده: {faNum(85)}٪ تا {faNum(Math.round(FONT_SCALE_MAX * 100))}٪</span>
            </div>
            <button
              onClick={() => bumpScale(1)}
              disabled={scale >= FONT_SCALE_MAX}
              title="بزرگ‌تر"
              aria-label="بزرگ‌تر کردن قلم"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-lg font-black transition hover:border-primary/60 disabled:opacity-30"
            >
              +
            </button>
          </div>
          {scale >= FONT_SCALE_MAX - 0.001 && (
            <p className="mt-1 text-center text-[8.5px] font-bold text-[#8a6d10]">برای سلامت چیدمان، بیشینه ۱۳۰٪ است</p>
          )}
        </div>

        {/* قلم تقویم */}
        <div className="mb-2.5 rounded-xl border border-border/70 bg-muted/30 p-2.5">
          <p className="mb-1.5 text-[11px] font-extrabold">قلم تقویم</p>
          <div className="grid grid-cols-2 gap-1.5">
            {CAL_FONT_LABELS.map((c) => (
              <button
                key={c.key}
                onClick={() => update({ calFont: c.key as CalFont })}
                className={cn(
                  'rounded-xl px-2 py-2.5 text-[11px] font-bold transition',
                  (prefs.calFont || 'base') === c.key
                    ? 'bg-primary text-white shadow-sm'
                    : 'border border-border bg-card text-foreground/70 hover:border-primary/50'
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* تراکم نمایش */}
        <div className="mb-2.5 rounded-xl border border-border/70 bg-muted/30 p-2.5">
          <p className="mb-1.5 text-[11px] font-extrabold">تراکم نمایش</p>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { key: 'cozy', label: 'دلنشین' },
              { key: 'compact', label: 'جمع‌وجور' },
            ] as { key: Density; label: string }[]).map((d) => (
              <button
                key={d.key}
                onClick={() => update({ density: d.key })}
                className={cn(
                  'rounded-xl px-2 py-2.5 text-[11px] font-bold transition',
                  (prefs.density || 'cozy') === d.key
                    ? 'bg-primary text-white shadow-sm'
                    : 'border border-border bg-card text-foreground/70 hover:border-primary/50'
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* پوستهٔ رنگی — مأموریت 16-D */}
        <div className="mb-2.5 rounded-xl border border-border/70 bg-muted/30 p-2.5">
          <p className="mb-1.5 text-[11px] font-extrabold">پوستهٔ رنگی</p>
          <div className="grid grid-cols-2 gap-1.5">
            {HZ_THEMES.map((th) => (
              <button
                key={th.key}
                onClick={() => pickTheme(th.key)}
                title={th.hint}
                aria-pressed={hzTheme === th.key}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-bold transition',
                  hzTheme === th.key
                    ? 'bg-primary text-white shadow-sm'
                    : 'border border-border bg-card text-foreground/70 hover:border-primary/50'
                )}
              >
                <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
                  <span className="h-3.5 w-3.5 rounded-full border border-white/70 shadow-sm" style={{ backgroundColor: th.primary }} />
                  <span className="h-3.5 w-3.5 rounded-full border border-white/70 shadow-sm" style={{ backgroundColor: th.gold }} />
                </span>
                {th.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[9.5px] leading-relaxed text-muted-foreground">
            پوسته روی رنگ‌های اصلی پوستهٔ سامانه اثر می‌گذارد — سایدبار، دکمه‌های اصلی، حلقهٔ تمرکز و کارت‌های خوش‌آمد؛ در تم شب هم تطبیق می‌یابد. رنگ طلایی برند و کارت‌های خاص ثابت می‌مانند.
          </p>
        </div>

        {/* نمایش تقویم‌ها */}
        <div className="mb-2 rounded-xl border border-border/70 bg-muted/30 p-2.5">
          <p className="mb-1.5 text-[11px] font-extrabold">نمایش تقویم‌ها</p>
          {([
            { key: 'showHijri' as const, label: 'عدد قمری 🌙', hint: 'عدد کوچک بالا-چپ هر روز' },
            { key: 'showGregorian' as const, label: 'عدد میلادی 📅', hint: 'عدد کوچک پایین-راست هر روز' },
          ]).map((c) => (
            <label key={c.key} className="flex min-h-[44px] cursor-pointer items-center justify-between gap-2 rounded-xl px-1 py-1.5 hover:bg-secondary/60">
              <span>
                <span className="block text-[11px] font-bold">{c.label}</span>
                <span className="block text-[8.5px] text-muted-foreground">{c.hint}</span>
              </span>
              <input
                type="checkbox"
                checked={prefs[c.key] !== false}
                onChange={(e) => update({ [c.key]: e.target.checked })}
                className="h-5 w-5 shrink-0 accent-[#0e7a4a]"
              />
            </label>
          ))}
          <p className="mt-1 text-[8.5px] leading-relaxed text-muted-foreground">
            برای معاملات بین‌المللی، تاریخ میلادی همیشه در راهنمای هر روز (کادر کوچک با نگه‌داشتن ماوس) دیده می‌شود.
          </p>
        </div>

        <p className="border-t border-dashed border-border pt-1.5 text-[8.5px] leading-relaxed text-muted-foreground">
          تنظیمات روی این دستگاه ذخیره و به حساب شما گره می‌خورد؛ همه‌جا یکسان دیده می‌شود.
        </p>
      </PopoverScaffold>
    </div>
  )
}
