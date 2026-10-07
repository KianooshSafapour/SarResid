'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from 'sonner'
import {
  J_MONTHS,
  J_WEEKDAYS,
  addDaysIso,
  faNum,
  formatJalaliFull,
  jalaliToIso,
  jMonthLength,
  jMonthStartWeekday,
  toJalaliParts,
  todayIso,
  weekdayName,
} from '@/lib/jalali'
import { formatHijri, isoToHijri, hijriToIso, hijriMonthLength, H_MONTHS, setCalibration } from '@/lib/hijri'
import { api } from '@/lib/client'
import { cn } from '@/lib/utils'

export type HolidayRow = {
  date: string
  title: string
  kind: string // HOLIDAY | OCCASION
  hijriLabel: string
  source: string
  solar: boolean
}

type HolidayMap = Map<string, string>

/** نقشهٔ تاریخ → عنوان (سازگار با همهٔ ویوهای موجود) */
export function useHolidays() {
  const [holidays, setHolidays] = useState<HolidayMap>(new Map())
  useEffect(() => {
    fetch('/api/holidays')
      .then((r) => r.json())
      .then((d) => {
        const m = new Map<string, string>()
        for (const h of d.holidays || []) if (h.kind !== 'OCCASION') m.set(h.date, h.title)
        setHolidays(m)
        if (d.calibration && typeof d.calibration === 'object') setCalibration(d.calibration)
      })
      .catch(() => {})
  }, [])
  return holidays
}

/** دادهٔ کامل: همهٔ تعطیلات + مناسبت‌ها + برچسب هجری */
export function useHolidayData() {
  const [rows, setRows] = useState<HolidayRow[]>([])
  const [hijriToday, setHijriToday] = useState('')
  useEffect(() => {
    fetch('/api/holidays')
      .then((r) => r.json())
      .then((d) => {
        setRows(d.holidays || [])
        setHijriToday(d.hijriToday || '')
        if (d.calibration && typeof d.calibration === 'object') setCalibration(d.calibration)
      })
      .catch(() => {})
  }, [])
  const map = useMemo(() => {
    const m = new Map<string, HolidayRow>()
    for (const h of rows) m.set(h.date, h)
    return m
  }, [rows])
  return { holidays: map, rows, hijriToday }
}

/* ═══════════════════ شخصی‌سازی (useUiPrefs) — round 14 ═══════════════════ */

export type CalSystem = 'jalali' | 'gregorian' | 'hijri'
export type CalFont = 'sm' | 'base' | 'lg' | 'xl'
export type Density = 'compact' | 'cozy'

export type UiPrefs = {
  fontScale?: number
  calFont?: CalFont
  density?: Density
  calSystem?: CalSystem
  showHijri?: boolean
  showGregorian?: boolean
  theme?: 'light' | 'dark' | 'system'
}

/** نقشهٔ calFont → اندازهٔ پایهٔ اعداد تقویم (px) — منبع واحد برای ThemeLangBar و CSS var */
export const CAL_FONT_PX: Record<CalFont, number> = { sm: 11, base: 13, lg: 15, xl: 18 }
export const CAL_FONT_LABELS: { key: CalFont; label: string }[] = [
  { key: 'sm', label: 'کوچک' },
  { key: 'base', label: 'معمولی' },
  { key: 'lg', label: 'بزرگ' },
  { key: 'xl', label: 'خیلی بزرگ' },
]
export const FONT_SCALE_MIN = 0.85
export const FONT_SCALE_MAX = 1.3 // بالاتر از این چیدمان می‌شکند — گیرهٔ امن
export const FONT_SCALE_STEP = 0.05

export function clampFontScale(v: unknown): number {
  const n = typeof v === 'number' && isFinite(v) ? v : 1
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, n))
}

const UI_PREFS_KEY = 'hz-ui-prefs'
const UI_PREFS_DEFAULTS: UiPrefs = {
  fontScale: 1,
  calFont: 'base',
  density: 'cozy',
  calSystem: 'jalali',
  showHijri: true,
  showGregorian: true,
}

/* فروشگاه ماژول-سطح: خوانش آنی از localStorage + همگام‌سازی با سرور */
let prefsCache: UiPrefs | null = null
let prefsFetched = false
const prefsListeners = new Set<() => void>()

function readLocalPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY)
    return raw ? { ...UI_PREFS_DEFAULTS, ...JSON.parse(raw) } : { ...UI_PREFS_DEFAULTS }
  } catch {
    return { ...UI_PREFS_DEFAULTS }
  }
}

function getPrefsSnapshot(): UiPrefs {
  if (!prefsCache) prefsCache = readLocalPrefs()
  return prefsCache
}
const getServerPrefs = (): UiPrefs => UI_PREFS_DEFAULTS

/** اعمال آنی تنظیمات روی DOM (html) — قلم ریشه، متغیر قلم تقویم، تراکم */
export function applyPrefsToDom(p: UiPrefs) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  el.style.fontSize = `${16 * clampFontScale(p.fontScale)}px`
  el.style.setProperty('--cal-font', `${CAL_FONT_PX[p.calFont || 'base']}px`)
  el.setAttribute('data-density', p.density === 'compact' ? 'compact' : 'cozy')
}

function commitPrefs(next: UiPrefs) {
  prefsCache = { ...UI_PREFS_DEFAULTS, ...next }
  try {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefsCache))
  } catch {
    /* storage blocked */
  }
  applyPrefsToDom(prefsCache)
  for (const l of prefsListeners) l()
}

function subscribePrefs(cb: () => void) {
  prefsListeners.add(cb)
  return () => {
    prefsListeners.delete(cb)
  }
}

/**
 * تنظیمات شخصی‌سازی کاربر — یک‌بار fetch از /api/me/ui-prefs، کش ماژول-سطح
 * + ذخیرهٔ آنی در localStorage ('hz-ui-prefs') برای رنگ‌آمیزی قبل از fetch.
 * update(patch) → به‌روزرسانی خوش‌بینانه + PUT به سرور.
 */
export function useUiPrefs() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefsSnapshot, getServerPrefs)
  useEffect(() => {
    applyPrefsToDom(getPrefsSnapshot())
    if (prefsFetched) return
    prefsFetched = true
    api<{ uiPrefs: UiPrefs }>('/api/me/ui-prefs')
      .then((d) => {
        if (d?.uiPrefs && typeof d.uiPrefs === 'object') commitPrefs({ ...getPrefsSnapshot(), ...d.uiPrefs })
      })
      .catch(() => {})
  }, [])
  const update = useCallback((patch: Partial<UiPrefs>) => {
    commitPrefs({ ...getPrefsSnapshot(), ...patch })
    api<{ uiPrefs: UiPrefs }>('/api/me/ui-prefs', { method: 'PUT', body: { uiPrefs: patch } }).catch(() =>
      toast.error('ذخیرهٔ شخصی‌سازی ناموفق بود — اتصال را بررسی کنید')
    )
  }, [])
  return { prefs, update }
}

/* ═══════════════════ نام ماه‌های میلادی به فارسی ═══════════════════ */

export const G_MONTHS_FA = [
  'ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن',
  'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر',
]
/** هدر روزهای هفته در نمای میلادی — از یکشنبه (Sun-first)، کاملاً فارسی */
const G_WEEK_LETTERS = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'] // یک‌شنبه دوشنبه سه‌شنبه چهارشنبه پنجشنبه جمعه شنبه
/** JS getDay (0=یکشنبه) → ایندکس هفتهٔ شنبه‌شروع */
const JS_TO_SATFIRST: Record<number, number> = { 6: 0, 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6 }

const isoFromParts = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** «۲ ژانویه ۲۰۲۶» — تاریخ میلادی با اعداد و نام ماه فارسی */
export function formatGregorianFa(iso: string): string {
  try {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
    return `${faNum(d)} ${G_MONTHS_FA[m - 1]} ${faNum(y)}`
  } catch {
    return ''
  }
}

const SYS_CHIPS: { key: CalSystem; label: string }[] = [
  { key: 'jalali', label: 'شمسی' },
  { key: 'gregorian', label: 'میلادی' },
  { key: 'hijri', label: 'قمری' },
]

/**
 * سبک قلم استاندارد متن‌های تقویمی — «سیستمیک»: همهٔ اجزای تقویم (هدر ماه/سال، ردیف روزهای هفته،
 * چیپ‌ها، راهنمای تعطیلی‌ها، متن تاریخِ تاریخ‌گیر و…) با var(--cal-font) مقیاس می‌شوند.
 *  - calFontStyle() → { fontSize: 'var(--cal-font, 13px)' }
 *  - calFontStyle('calc(var(--cal-font, 13px) * 1.25)') → ضریب روی اندازهٔ پایه
 * تقویم‌های سفارشی ویوها (Cheques/Leaves و…) هم می‌توانند همین هلپر را import کنند تا یکدست بمانند.
 */
export function calFontStyle(fontSize?: string): CSSProperties {
  return { fontSize: fontSize || 'var(--cal-font, 13px)' }
}
/** ضریب متداول روی var(--cal-font) — برای خوانایی فراخوانی‌ها */
export const CAL_FONT_CALC = (m: number) => `calc(var(--cal-font, 13px) * ${m})`
/**
 * ضریب روی var(--cal-font) با «کف مطلق خوانایی» (مأموریت 16-D):
 * هیچ متن تقویمی — حتی اعداد فرعی قمری/میلادی — نباید زیر حداقل px مشخص شود،
 * حتی وقتی کاربر قلم تقویم را روی «کوچک» گذاشته است.
 * مثال: CAL_FONT_MIN(0.85, 10) → حداکثرِ ۱۰px و ۸۵٪ قلم تقویم.
 */
export const CAL_FONT_MIN = (m: number, minPx: number) => `max(${minPx}px, calc(var(--cal-font, 13px) * ${m}))`
/** کف‌های خوانایی تقویم (px) — منبع واحد قواعد 16-D */
export const CAL_FONT_FLOORS = {
  secondary: 10, // عدد فرعی قمری/میلادی در خانه‌های روز
  weekday: 11, // سربرگ روزهای هفته
  monthTitle: 14, // عنوان ماه/سال
} as const

/* ═══════════════════ JalaliCalendar — سه‌تقویمی ═══════════════════ */

export function JalaliCalendar({
  selected,
  onSelect,
  holidays,
  highlightWeekends = true,
  minDate,
  calSystem,
  fontScale,
  showAllSystems,
}: {
  selected?: string
  onSelect: (iso: string) => void
  holidays: HolidayMap | Map<string, HolidayRow>
  highlightWeekends?: boolean
  minDate?: string
  /** تقویم نمایشی (پیش‌فرض: تنظیمات کاربر → شمسی) */
  calSystem?: CalSystem
  /** ضریب اندازهٔ اعداد روزها (پیش‌فرض: fontScale تنظیمات کاربر) */
  fontScale?: number
  /** true: هر دو عدد کوچک قمری+میلادی | false: هیچ‌کدام | نامشخص: طبق تنظیمات کاربر */
  showAllSystems?: boolean
}) {
  const { prefs } = useUiPrefs()
  const [sysOverride, setSysOverride] = useState<CalSystem | null>(null)
  // الگوی رسمی ری‌اکت: تنظیم state هنگام تغییر prop در حین رندر (بدون اثر جانبی)
  const [prevCalSystem, setPrevCalSystem] = useState(calSystem)
  if (prevCalSystem !== calSystem) {
    setPrevCalSystem(calSystem)
    setSysOverride(null)
  }
  const sys: CalSystem = sysOverride || calSystem || prefs.calSystem || 'jalali'

  const [anchor, setAnchor] = useState(selected || todayIso())

  const showTinyH = showAllSystems ?? prefs.showHijri !== false
  const showTinyG = showAllSystems ?? prefs.showGregorian === true

  // متریک قلم تقویم — var(--cal-font) پایه است، fontScale ضریب روی آن
  // هدف لمس ۴۴px برای خانه‌های روز (دسترس‌پذیری — مأموریت 16-D)
  const basePx = CAL_FONT_PX[prefs.calFont || 'base']
  const fsc = clampFontScale(fontScale ?? prefs.fontScale)
  const cellPx = Math.max(44, Math.round(basePx * fsc * 2.9))

  // ساخت شبکهٔ ماه نمایشی (شمسی/قمری: شنبه‌شروع — میلادی: یک‌شنبه‌شروع)
  const view = useMemo(() => {
    try {
      if (sys === 'gregorian') {
        const [y, m] = anchor.split('-').map(Number)
        const len = new Date(y, m, 0).getDate()
        // میلادی: هفته از یکشنبه (Sun-first) با ترتیب فارسی ی‌د‌س‌چ‌پ‌ج‌ش
        const lead = new Date(isoFromParts(y, m, 1) + 'T12:00:00').getDay() // 0=Sun
        const cells: (string | null)[] = Array(lead).fill(null)
        for (let d = 1; d <= len; d++) cells.push(isoFromParts(y, m, d))
        return { cells, monthLabel: G_MONTHS_FA[m - 1], yearLabel: faNum(y), firstIso: isoFromParts(y, m, 1), lastIso: isoFromParts(y, m, len) }
      }
      if (sys === 'hijri') {
        const h = isoToHijri(anchor)
        const len = hijriMonthLength(h.hy, h.hm)
        const firstIso = hijriToIso(h.hy, h.hm, 1)
        const startOffset = JS_TO_SATFIRST[new Date(firstIso + 'T12:00:00').getDay()]
        const cells: (string | null)[] = Array(startOffset).fill(null)
        for (let d = 1; d <= len; d++) cells.push(hijriToIso(h.hy, h.hm, d))
        return { cells, monthLabel: H_MONTHS[h.hm - 1], yearLabel: faNum(h.hy), firstIso, lastIso: hijriToIso(h.hy, h.hm, len) }
      }
      const { jy, jm } = toJalaliParts(anchor)
      const len = jMonthLength(jy, jm)
      const firstIso = jalaliToIso(jy, jm, 1)
      const startOffset = jMonthStartWeekday(jy, jm)
      const cells: (string | null)[] = Array(startOffset).fill(null)
      for (let d = 1; d <= len; d++) cells.push(jalaliToIso(jy, jm, d))
      return { cells, monthLabel: J_MONTHS[jm - 1], yearLabel: faNum(jy), firstIso, lastIso: jalaliToIso(jy, jm, len) }
    } catch {
      return { cells: [] as (string | null)[], monthLabel: '—', yearLabel: '', firstIso: anchor, lastIso: anchor }
    }
  }, [anchor, sys])

  const move = (dir: number) => {
    try {
      if (sys === 'gregorian') {
        const [y, m] = anchor.split('-').map(Number)
        let nm = m + dir
        let ny = y
        if (nm > 12) { nm = 1; ny++ }
        if (nm < 1) { nm = 12; ny-- }
        setAnchor(isoFromParts(ny, nm, 1))
      } else if (sys === 'hijri') {
        const h = isoToHijri(anchor)
        let nm = h.hm + dir
        let ny = h.hy
        if (nm > 12) { nm = 1; ny++ }
        if (nm < 1) { nm = 12; ny-- }
        setAnchor(hijriToIso(ny, nm, 1))
      } else {
        const { jy, jm } = toJalaliParts(anchor)
        let nm = jm + dir
        let ny = jy
        if (nm > 12) { nm = 1; ny++ }
        if (nm < 1) { nm = 12; ny-- }
        setAnchor(jalaliToIso(ny, nm, 1))
      }
    } catch {
      toast.warning('این ماه خارج از محدودهٔ جدول تقویم قمری است (۱۳۱۸–۱۵۰۰ ه‍.ق)')
    }
  }

  const getHoliday = (iso: string): HolidayRow | undefined => {
    const v = (holidays as Map<string, HolidayRow>).get(iso)
    if (!v) return undefined
    return typeof v === 'string' ? { date: iso, title: v as unknown as string, kind: 'HOLIDAY', hijriLabel: '', source: '', solar: false } : v
  }

  // چیپ نگاشت ماه نمایشی به نظام‌های دیگر
  const spanChip = useMemo(() => {
    if (!view.firstIso || !view.lastIso) return ''
    const spanOf = (s: CalSystem) => {
      const nameOf = (iso: string) => {
        if (s === 'gregorian') {
          const [y, m] = iso.split('-').map(Number)
          return `${G_MONTHS_FA[m - 1]} ${faNum(y)}`
        }
        if (s === 'hijri') {
          const h = isoToHijri(iso)
          return `${H_MONTHS[h.hm - 1]} ${faNum(h.hy)}`
        }
        const { jy, jm } = toJalaliParts(iso)
        return `${J_MONTHS[jm - 1]} ${faNum(jy)}`
      }
      const a = nameOf(view.firstIso)
      const b = nameOf(view.lastIso)
      return a === b ? a : `${a} ← ${b}`
    }
    const items: string[] = []
    if (sys === 'hijri') items.push(`🌿 شمسی: ${spanOf('jalali')}`)
    else items.push(`🌙 قمری: ${spanOf('hijri')}`)
    if (showTinyG && sys !== 'gregorian') items.push(`📅 میلادی: ${spanOf('gregorian')}`)
    return items.join(' • ')
  }, [view, sys, showTinyG])

  const weekLetters = sys === 'gregorian' ? G_WEEK_LETTERS : J_WEEKDAYS.map((d) => d.slice(0, 1))
  const fridayIdx = sys === 'gregorian' ? 5 : 6

  const dayNumOf = (iso: string): string => {
    try {
      if (sys === 'gregorian') return faNum(Number(iso.slice(8, 10)))
      if (sys === 'hijri') return faNum(isoToHijri(iso).hd)
      return faNum(toJalaliParts(iso).jd)
    } catch {
      return ''
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-xl" style={{ width: cellPx * 7 + 48 }}>
      <div className="mb-2 flex items-center justify-between">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(1)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6" /></svg>
        </Button>
        <div className="flex items-center gap-1 font-extrabold" style={calFontStyle(CAL_FONT_MIN(1.25, CAL_FONT_FLOORS.monthTitle))}>
          <span>{view.monthLabel}</span>
          <span className="text-[#8a6d10]">{view.yearLabel}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(-1)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
        </Button>
      </div>

      {/* سوییچ نظام تقویم — شمسی | میلادی | قمری */}
      <div className="mb-1.5 flex items-center justify-center gap-1">
        {SYS_CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setSysOverride(c.key)}
            style={calFontStyle(CAL_FONT_MIN(0.9, CAL_FONT_FLOORS.secondary))}
            className={cn(
              'rounded-full px-2.5 py-1 font-black transition',
              sys === c.key ? 'bg-primary text-white shadow-sm' : 'border border-border bg-secondary text-foreground/60 hover:border-primary/50'
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {spanChip && (
        <p className="mb-1.5 rounded-lg bg-[#c9a227]/10 px-2 py-1 text-center font-bold text-[#8a6d10]" style={calFontStyle(CAL_FONT_MIN(0.8, CAL_FONT_FLOORS.secondary))} title="نگاشت ماه نمایشی به تقویم‌های دیگر (تبدیل واقعی)">
          {spanChip}
        </p>
      )}

      <div className="mb-1 grid grid-cols-7 gap-1 text-center font-bold text-muted-foreground" style={calFontStyle(CAL_FONT_MIN(0.95, CAL_FONT_FLOORS.weekday))}>
        {weekLetters.map((d, i) => (
          <span key={i} className={cn(i === fridayIdx && 'text-[#b3372f]')}>{d}</span>
        ))}
      </div>

      <div
        className="grid grid-cols-7 gap-1"
        style={{ fontSize: `max(${CAL_FONT_FLOORS.secondary}px, calc(var(--cal-font, 13px) * ${fsc} * 1.05))` }}
      >
        {view.cells.map((iso, i) => {
          if (!iso) return <span key={i} />
          const isToday = iso === todayIso()
          const isSel = iso === selected
          const hol = getHoliday(iso)
          const isHoliday = hol && hol.kind !== 'OCCASION'
          const isOccasion = hol && hol.kind === 'OCCASION'
          const isFriday = weekdayName(iso) === 'جمعه'
          const isPast = minDate && iso < minDate
          let hijriTiny = ''
          let fullTitle = ''
          try {
            const h = isoToHijri(iso)
            hijriTiny = faNum(h.hd)
            fullTitle = formatHijri(iso)
          } catch { /* ignore */ }
          const gregTiny = faNum(Number(iso.slice(8, 10)))
          const tip = [
            `${weekdayName(iso)} ${formatJalaliFull(iso)}`,
            fullTitle && `هجری: ${fullTitle}`,
            `میلادی: ${iso}`,
            hol && `${isHoliday ? 'تعطیل رسمی' : 'مناسبت'}: ${hol.title}${hol.hijriLabel ? ` (${hol.hijriLabel})` : ''}`,
          ].filter(Boolean).join(' • ')
          return (
            <button
              key={i}
              type="button"
              disabled={!!isPast}
              onClick={() => onSelect(iso)}
              title={tip}
              style={{ width: cellPx, height: cellPx }}
              className={cn(
                'relative flex items-center justify-center rounded-lg font-bold transition-all',
                isSel
                  ? 'bg-primary text-white shadow-md'
                  : isToday
                    ? 'bg-accent text-accent-foreground ring-1 ring-[#c9a227]'
                    : isHoliday
                      ? 'bg-[#b3372f]/8 text-[#b3372f] hover:bg-[#b3372f]/15'
                      : 'hover:bg-secondary text-foreground/85',
                (isFriday || hol) && !isSel && !isHoliday && 'text-[#b3372f]',
                isOccasion && !isSel && 'bg-[#c9a227]/8',
                isPast && 'opacity-25'
              )}
            >
              {dayNumOf(iso)}
              {hijriTiny && showTinyH && sys !== 'hijri' && !isSel && (
                <span className="absolute left-0.5 top-0.5 font-bold leading-none text-muted-foreground/80" style={calFontStyle(CAL_FONT_MIN(0.85, CAL_FONT_FLOORS.secondary))}>{hijriTiny}</span>
              )}
              {showTinyG && sys !== 'gregorian' && !isSel && (
                <span className="absolute bottom-0.5 right-0.5 font-bold leading-none text-muted-foreground/70" style={calFontStyle(CAL_FONT_MIN(0.85, CAL_FONT_FLOORS.secondary))}>{gregTiny}</span>
              )}
              {isHoliday && !isSel && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-[#b3372f]" />}
              {isOccasion && !isSel && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-[#c9a227]" />}
            </button>
          )
        })}
      </div>

      <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-muted-foreground" style={calFontStyle(CAL_FONT_MIN(0.8, CAL_FONT_FLOORS.secondary))}>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#b3372f]" /> تعطیل رسمی</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#c9a227]" /> مناسبت</span>
        {showTinyH && sys !== 'hijri' && <span>بالا-چپ: روز قمری</span>}
        {showTinyG && sys !== 'gregorian' && <span>پایین-راست: روز میلادی</span>}
      </p>
    </div>
  )
}

export function JalaliDatePicker({
  value,
  onChange,
  placeholder = 'انتخاب تاریخ',
  holidays,
  minDate,
  quickChips = true,
  warnHoliday = true,
  compact = false,
}: {
  value: string
  onChange: (iso: string) => void
  placeholder?: string
  holidays: HolidayMap | Map<string, HolidayRow>
  minDate?: string
  quickChips?: boolean
  warnHoliday?: boolean
  /** حالت فشرده برای فرم‌ها/مودال‌ها: یک خط، بدون زیرنویس قمری/میلادی (در راهنمای روز کافی است) */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const hol = value ? (holidays as Map<string, HolidayRow>).get(value) : undefined
  const holidayTitle = typeof hol === 'string' ? (hol as unknown as string) : hol?.title
  const isOccasionOnly = !!hol && typeof hol !== 'string' && hol.kind === 'OCCASION'
  const isFri = value ? weekdayName(value) === 'جمعه' : false
  const hijriLabel = value ? formatHijri(value) : ''
  const gregLabel = value ? formatGregorianFa(value) : ''

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center justify-between rounded-xl border border-input bg-white/90 text-sm shadow-sm outline-none transition hover:border-primary/60 focus:border-primary focus:ring-2 focus:ring-primary/20',
              compact ? 'gap-1.5 px-2.5 py-1.5 text-[12px]' : 'gap-2 px-4 py-2.5',
              !value && 'text-muted-foreground'
            )}
          >
            <span className={compact ? 'truncate text-right' : 'text-right'}>
              <span className="block font-bold" style={calFontStyle(CAL_FONT_MIN(1.2, 12))}>{value ? formatJalaliFull(value) : placeholder}</span>
              {!compact && hijriLabel && <span className="mt-0.5 block font-bold text-[#8a6d10]" style={calFontStyle(CAL_FONT_MIN(0.85, CAL_FONT_FLOORS.secondary))}>🌙 هجری: {hijriLabel}</span>}
              {!compact && gregLabel && <span className="mt-0.5 block font-bold text-muted-foreground" style={calFontStyle(CAL_FONT_MIN(0.85, CAL_FONT_FLOORS.secondary))}>📅 میلادی: {gregLabel}</span>}
            </span>
            <svg width={compact ? 13 : 16} height={compact ? 13 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted-foreground">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto border-0 bg-transparent p-0" align="start">
          <JalaliCalendar
            selected={value}
            holidays={holidays}
            minDate={minDate}
            onSelect={(iso) => {
              onChange(iso)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>

      {quickChips && !compact && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            { label: 'امروز', v: todayIso() },
            { label: 'فردا', v: addDaysIso(1) },
            { label: 'پس‌فردا', v: addDaysIso(2) },
            { label: 'هفته بعد', v: addDaysIso(7) },
          ].map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => onChange(c.v)}
              style={calFontStyle(CAL_FONT_MIN(0.9, CAL_FONT_FLOORS.secondary))}
              className={cn(
                'rounded-full border px-3 py-1 font-bold transition',
                value === c.v ? 'border-primary bg-primary text-white' : 'border-border bg-card hover:border-primary/60 hover:bg-secondary'
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {warnHoliday && value && (isFri || (holidayTitle && !isOccasionOnly)) && (
        <div
          className="mt-2 flex items-start gap-2 rounded-xl border border-[#e9b90c]/50 bg-[#fdf6dd] font-bold text-[#8a6d10]"
          style={calFontStyle(compact ? CAL_FONT_MIN(0.8, CAL_FONT_FLOORS.secondary) : CAL_FONT_MIN(0.85, 10.5))}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          <span>«{holidayTitle || 'جمعه'}» — این روز تعطیل است! اگر سررسید پرداخت است، یک روز قبل‌تر انتخاب کنید.</span>
        </div>
      )}
    </div>
  )
}
