/**
 * HZ-EXT UI kit — shared components for round-3 views.
 * Available via '../lib/hz': JalaliDate, Stepper, TourEngine, printHTML,
 * barcode128, amountWords, numberToPersianWords, minutesToHM.
 * Everything is RTL-first, Persian digits, emerald/teal/amber/rose/stone palette.
 */
import React, {
  useState, useEffect, useMemo, useRef, useCallback,
} from 'hz:react'
import { jsx, jsxs } from 'hz:jsx'
import { useShell } from 'hz:shell'
import { cn } from 'hz:cn'
import { Button } from 'hz:button'
import { Input } from 'hz:input'
import {
  JALALI_MONTHS, WEEKDAY_FA, jalaliMonthLength, parseJalali, toEnDigits,
  toFaDigits, todayJalali, formatJalaliLong,
} from 'hz:jalali'
import { I } from './icons'

export { React }

/* ═══════════════════════ ۱) تاریخ‌گیر جلالی ═══════════════════════ */

function pad2(n: number) { return String(n).padStart(2, '0') }

export interface JalaliDateProps {
  value: string            // '1405-07-27' or ''
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  quickChips?: { label: string; deltaDays: number }[] // e.g. [{label:'فردا', deltaDays:1}]
  /** اگر true باشد ورودی از صفحه‌کلید هم پذیرفته می‌شود (پیش‌فرض) */
  editable?: boolean
}

/** انتخابگر تاریخ شمسی با تقویم بازشو — جایگزین ورودی متنی تاریخ */
export function JalaliDate(props: JalaliDateProps) {
  const { value, onChange, placeholder = '۱۴۰۵/۰۷/۲۷', className, disabled, quickChips, editable = true } = props
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<{ jy: number; jm: number }>(() => {
    const p = parseJalali(value || '')
    const t = todayJalali().split('-').map(Number)
    return p && p.jy ? { jy: p.jy, jm: p.jm } : { jy: t[0], jm: t[1] }
  })
  const boxRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (!open) return
    const p = parseJalali(value || '')
    if (p && p.jy) setView({ jy: p.jy, jm: p.jm })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const today = todayJalali()
  const [ty, tm, td] = today.split('-').map(Number)
  const sel = parseJalali(value || '')
  const monthLen = jalaliMonthLength(view.jy, view.jm)
  const firstWeekday = useMemo(() => {
    const d = parseJalali(`${view.jy}-${pad2(view.jm)}-01`)
    return d ? d.getDay() : 0 // getDay: Sat=6 … Fri=5 (js) → convert to fa col
  }, [view])
  // Persian week: شنبه(0) یک‌شنبه(1) … جمعه(6). js getDay: Sun=0…Sat=6
  const firstCol = ((firstWeekday + 1) % 7)

  const cells: (number | null)[] = []
  for (let i = 0; i < firstCol; i++) cells.push(null)
  for (let d = 1; d <= monthLen; d++) cells.push(d)

  function pick(d: number) {
    onChange(`${view.jy}-${pad2(view.jm)}-${pad2(d)}`)
    setOpen(false)
  }
  function shiftMonth(delta: number) {
    let { jy, jm } = view
    jm += delta
    if (jm < 1) { jm = 12; jy-- } else if (jm > 12) { jm = 1; jy++ }
    setView({ jy, jm })
  }

  return (
    <div className="relative" ref={boxRef as any}>
      <div className="relative">
        <I.calendarDays size={15} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-stone-400" />
        <input
          ref={inputRef as any}
          dir="ltr"
          className={cn('hz-jalali-input num h-9 w-full rounded-md border border-input bg-background pr-8 text-center text-sm outline-none transition-colors focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50', className)}
          value={value ? toFaDigits(value).replace(/-/g, '/') : ''}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={!editable}
          onChange={(e: any) => onChange(toEnDigits(String(e.target.value)).replace(/[^\d/\-]/g, '').replace(/\//g, '-'))}
          onFocus={() => !disabled && setOpen(true)}
          onClick={() => !disabled && setOpen(true)}
        />
      </div>
      {open && !disabled && (
        <div className="absolute z-50 mt-1.5 w-72 rounded-xl border border-stone-200 bg-white p-3 shadow-xl" dir="rtl">
          {/* سربرگ ماه — در RTL دکمهٔ «ماه قبل» سمت راست (›) و «ماه بعد» سمت چپ (‹) */}
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="rounded-md p-1.5 text-stone-600 transition-colors hover:bg-stone-100" onClick={() => shiftMonth(-1)} aria-label="ماه قبل" title="ماه قبل">
              <I.chevronRight size={18} />
            </button>
            <div className="text-sm font-bold text-stone-700">{JALALI_MONTHS[view.jm - 1]} {toFaDigits(String(view.jy))}</div>
            <button type="button" className="rounded-md p-1.5 text-stone-600 transition-colors hover:bg-stone-100" onClick={() => shiftMonth(1)} aria-label="ماه بعد" title="ماه بعد">
              <I.chevronLeft size={18} />
            </button>
          </div>
          {/* روزهای هفته */}
          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {WEEKDAY_FA.map((w: string, i: number) => (
              <div key={i} className={cn('py-0.5 text-center text-[11px] font-medium', i === 6 ? 'text-rose-500' : 'text-stone-400')}>{w}</div>
            ))}
          </div>
          {/* روزها */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (d == null) return <div key={`e${i}`} />
              const ds = `${view.jy}-${pad2(view.jm)}-${pad2(d)}`
              const isToday = ds === today
              const isSel = !!sel && sel.jy === view.jy && sel.jm === view.jm && sel.jd === d
              const isFri = i % 7 === 6
              return (
                <button
                  key={d} type="button"
                  onClick={() => pick(d)}
                  className={cn(
                    'h-8 rounded-md text-xs font-medium transition-colors',
                    isSel ? 'bg-emerald-600 text-white shadow-sm'
                      : isToday ? 'border border-emerald-400 text-emerald-800'
                        : isFri ? 'text-rose-500 hover:bg-rose-50' : 'text-stone-600 hover:bg-stone-100',
                  )}
                >
                  {toFaDigits(String(d))}
                </button>
              )
            })}
          </div>
          {/* پابرگ */}
          <div className="mt-2 flex items-center justify-between border-t border-stone-200 pt-2">
            <button type="button" className="rounded-md px-2.5 py-1 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50"
              onClick={() => { onChange(today); setOpen(false) }}>
              امروز
            </button>
            {value && (
              <button type="button" className="rounded-md px-2.5 py-1 text-xs text-stone-500 transition-colors hover:bg-stone-100"
                onClick={() => { onChange(''); setOpen(false) }}>
                پاک کردن
              </button>
            )}
            <span className="text-[11px] text-stone-400">{formatJalaliLong(parseJalali(today as any) as any)}</span>
          </div>
          {!!quickChips?.length && (
            <div className="mt-1.5 flex flex-wrap gap-1 border-t border-stone-200 pt-2">
              {quickChips.map((ch) => {
                const d = parseJalali(today)
                if (!d) return null
                d.setDate(d.getDate() + ch.deltaDays)
                const jy = Number(toFaDigits(String(d.getFullYear())) ? d.getFullYear() : 0) // fallback unused
                void jy
                // build jalali from js date
                const conv = jsDateToJalali(d)
                return (
                  <button key={ch.label} type="button"
                    className="rounded-md border border-stone-200 px-2 py-0.5 text-[10.5px] text-stone-600 transition-colors hover:border-emerald-400 hover:text-emerald-700"
                    onClick={() => { onChange(conv); setOpen(false) }}>
                    {ch.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** تبدیل Date میلادی → رشته جلالی YYYY-MM-DD (بدون وابستگی به ماژول جانبی) */
export function jsDateToJalali(date: Date): string {
  const gy = date.getFullYear(), gm = date.getMonth() + 1, gd = date.getDate()
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  let jy = gy <= 1600 ? 0 : 979
  const gy2 = gy <= 1600 ? gy - 621 : gy - 1600
  const gy3 = gm > 2 ? gy2 + 1 : gy2
  let days = (365 * gy2) + Math.floor((gy3 + 3) / 4) - Math.floor((gy3 + 99) / 100)
    + Math.floor((gy3 + 399) / 400) - 80 + gd + g_d_m[gm - 1]
  jy += 33 * Math.floor(days / 12053); days %= 12053
  jy += 4 * Math.floor(days / 1461); days %= 1461
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365 }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30)
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30)
  return `${jy}-${pad2(jm)}-${pad2(jd)}`
}

/** نمایش تاریخ جلالی با ممیز: '1405-07-28' → '۱۴۰۵/۰۷/۲۸' */
export function faSlash(v: string | null | undefined): string {
  if (!v) return ''
  return toFaDigits(v.replace(/-/g, '/'))
}

/* ═══════════════════════ ۱٫۵) ورودی ساعت با قالب‌بندی خودکار ═══════════════════════ */

export interface TimeInputProps {
  value: string            // '08:30' or ''
  onChange: (v: string) => void
  placeholder?: string     // default '۰۸:۳۰'
  className?: string
  disabled?: boolean
}

/**
 * ورودی ساعت با قالب‌بندی خودکار hh:mm —
 * کاربر رقم می‌زند؛ بعد از دو رقم ساعت، «:» خودکار درج می‌شود.
 * ارقام فارسی/لاتین پذیرفته می‌شود. مقدار همیشه ASCII 'HH:MM' برمی‌گردد.
 */
export function TimeInput(props: TimeInputProps) {
  const { value, onChange, placeholder = '۰۸:۳۰', className, disabled } = props
  const display = value ? toFaDigits(value) : ''
  function handle(raw: string) {
    // فقط ارقام (فارسی/لاتین) را نگه دار
    let d = toEnDigits(raw).replace(/[^\d]/g, '').slice(0, 4)
    let out = d
    if (d.length >= 3) out = d.slice(0, 2) + ':' + d.slice(2)
    else if (d.length === 2) out = d + ':'
    // اعتبارسنجی ساعت/دقیقه
    if (out.length >= 2 && Number(out.slice(0, 2)) > 23) out = '23' + out.slice(2)
    if (out.length === 5 && Number(out.slice(3)) > 59) out = out.slice(0, 3) + '59'
    onChange(out)
  }
  return (
    <input
      type="text"
      inputMode="numeric"
      dir="ltr"
      className={cn('num h-9 w-full rounded-md border border-input bg-background px-2.5 text-center text-sm outline-none transition-colors focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50', className)}
      value={display}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e: any) => handle(String(e.target.value ?? ''))}
      onBlur={(e: any) => {
        // اگر فقط «08:» مانده، پاکش کن
        const v = String(e.target.value ?? '')
        if (toEnDigits(v).replace(':', '').length < 3) onChange('')
      }}
    />
  )
}

/* ═══════════════════════ ۱٫۶) ورودی مبلغ با جداکنندهٔ خودکار هزارگان ═══════════════════════ */

export interface MoneyInputProps {
  value: string | number   // ارقام خام (ممیز ندارد — ریال صحیح)
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  suffix?: string          // برچسب کوچک داخل ورودی (مثل «ریال»)
}

/**
 * ورودی مبلغ ریالی — جداکنندهٔ هزارگان فارسی (٬) همان‌طور که کاربر تایپ می‌کند
 * خودکار درج می‌شود؛ مقدارِ برگشتی همیشه رشتهٔ ارقام خام ASCII است.
 * 1250000 → نمایش «۱٬۲۵۰٬۰۰۰»
 */
export function MoneyInput(props: MoneyInputProps) {
  const { value, onChange, placeholder = '۰', className, disabled, suffix } = props
  const raw = toEnDigits(String(value ?? '')).replace(/[^\d]/g, '')
  const display = raw ? toFaDigits(Number(raw).toLocaleString('en-US')).replace(/,/g, '٬') : ''
  function handle(rawInput: string) {
    onChange(toEnDigits(rawInput).replace(/[^\d]/g, '').replace(/^0+(?=\d)/, ''))
  }
  return (
    <div className="relative w-full">
      <input
        type="text"
        inputMode="numeric"
        dir="ltr"
        className={cn('num h-9 w-full rounded-md border border-input bg-background px-2.5 text-center text-sm font-bold outline-none transition-colors focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50', suffix && 'pe-11', className)}
        value={display}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e: any) => handle(String(e.target.value ?? ''))}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 end-2 flex items-center text-[10px] font-medium text-muted-foreground">{suffix}</span>
      ) : null}
    </div>
  )
}

export interface NumInputProps {
  value: string | number
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  decimals?: number       // حداکثر ارقام اعشار (۰ = فقط صحیح) — برای کیلو/گرم: ۳
  unit?: string           // برچسب کوچک داخل ورودی (مثل «کیلوگرم»)
}

/**
 * ورودی مقدار عددی — برای وزن/حجم اعشار می‌پذیرد (۰٫۷۲) و عدد صحیح را
 * با جداکنندهٔ هزارگان نمایش می‌دهد. مقدار برگشتی رشتهٔ خام ASCII است
 * ('0.72' یا '1250') تا caller خودش parse کند.
 */
export function NumInput(props: NumInputProps) {
  const { value, onChange, placeholder = '۰', className, disabled, decimals = 0, unit } = props
  function fmt(v: string): string {
    if (!v) return ''
    const neg = v.startsWith('-')
    const body = neg ? v.slice(1) : v
    const [ip, dp] = body.split('.')
    let out = ip ? toFaDigits(Number(ip).toLocaleString('en-US')).replace(/,/g, '٬') : '۰'
    if (dp !== undefined) out += '٫' + toFaDigits(dp)
    return (neg ? '−' : '') + out
  }
  function handle(rawInput: string) {
    /* R10: «٫» (جداکنندهٔ اعشار فارسی U+066B) که fmt در نمایش می‌گذارد هم باید به «.»
       تبدیل شود — وگرنه تایپ رقم بعد از ممیز، ممیز را می‌بلعد (۱٫۲ → ۱۲) */
    let v = toEnDigits(String(rawInput ?? '')).replace(/[,،٫]/g, '.').replace(/[^\d.]/g, '')
    const parts = v.split('.')
    if (decimals <= 0) v = parts[0] ?? ''
    else if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('')
    if (v.includes('.')) {
      const [a, b] = v.split('.')
      v = a + '.' + b.slice(0, decimals)
    }
    if (v === '.') v = ''
    onChange(v.replace(/^0+(?=\d)/, ''))
  }
  return (
    <div className="relative w-full">
      <input
        type="text"
        inputMode={decimals > 0 ? 'decimal' : 'numeric'}
        dir="ltr"
        className={cn('num h-9 w-full rounded-md border border-input bg-background px-2.5 text-center text-sm outline-none transition-colors focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50', unit && 'pe-12', className)}
        value={fmt(String(value ?? ''))}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e: any) => handle(String(e.target.value ?? ''))}
      />
      {unit ? (
        <span className="pointer-events-none absolute inset-y-0 end-2 flex items-center text-[10px] font-medium text-muted-foreground">{unit}</span>
      ) : null}
    </div>
  )
}

/* ═══════════════════════ ۲) پله‌شمار (− مقدار +) ═══════════════════════ */

export interface StepperProps {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  size?: 'sm' | 'md'
  disabled?: boolean
  /** متن کوچک زیر مقدار (مثل «کارتن ×۱۲») */
  hint?: string
}

export function Stepper(props: StepperProps) {
  const { value, onChange, min = 0, max = 9999, step = 1, size = 'md', disabled, hint } = props
  const btn = size === 'sm'
    ? 'h-7 w-7 rounded-md text-stone-600 hover:bg-stone-100 disabled:opacity-30'
    : 'h-8 w-8 rounded-md text-stone-600 hover:bg-stone-100 disabled:opacity-30'
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-stone-200 bg-white p-0.5" dir="rtl">
        <button type="button" className={btn} disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, value - step))} aria-label="کم کردن" title="کم کردن">
          <I.minus size={13} />
        </button>
        <span className={cn('num min-w-7 text-center font-bold text-stone-700', size === 'sm' ? 'text-xs' : 'text-sm')}>
          {toFaDigits(String(value))}
        </span>
        <button type="button" className={btn} disabled={disabled || value >= max}
          onClick={() => onChange(Math.min(max, value + step))} aria-label="زیاد کردن" title="زیاد کردن">
          <I.plus size={13} />
        </button>
      </div>
      {hint && <span className="text-[9.5px] text-stone-400">{hint}</span>}
    </div>
  )
}

/* ═══════════════════════ ۳) موتور تور تعاملی ═══════════════════════ */

export interface TourStep {
  /** سلکتور CSS هدف (مثل '[data-tour="rail"]') — نبود = تور مرکزی */
  target?: string
  /** قبل از هایلایت به این view برو (مثل 'supply/orders') */
  go?: string
  title: string
  body: string
  mobileHint?: string
}

export interface TourEngineProps {
  open: boolean
  steps: TourStep[]
  onClose: () => void      // رد کردن
  onDone: () => void       // پایان طبیعی
}

export interface TourHandle { destroy(): void }

interface TourBox { top: number; left: number; width: number; height: number; bottom: number; right: number }

function tmk(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

/** پیکان RTL — هم‌ساخت lucide بدون import مستقیم */
function tchevron(dir: 'left' | 'right', size = 13): HTMLElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('xmlns', ns)
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', dir === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6')
  svg.appendChild(path)
  return svg as unknown as HTMLElement
}

function tsetBox(e: HTMLElement, b: Partial<CSSStyleDeclaration>) {
  const s = e.style
  s.top = b.top ?? ''
  s.left = b.left ?? ''
  s.right = b.right ?? ''
  s.bottom = b.bottom ?? ''
  s.width = b.width ?? ''
  s.height = b.height ?? ''
}

/**
 * موتور تور DOM-محور — overlay در document.body (خارج از درخت React و
 * خارج از هر transform/canvas انیمیشن view) نصب می‌شود؛ پس ناوبری بین
 * بخش‌ها و بارگذاری دیرهنگام viewها را زنده تحمل می‌کند.
 *
 * ویژگی‌ها:
 *  - تاریک‌سازی چهارپارهٔ همیشه‌فعال (کلاس bg-slate-900/62 موجود در CSS فروزن)
 *  - z-index inline 1000 (کلاس z-[200] در CSS فروزن وجود ندارد؛ ۱۰۰۰ از
 *    هدر، دیالوگ‌ها (z-50) و حتی توست‌ها (z-[999]) بالاتر است)
 *  - کلیک بیرون هدف مسدود؛ کلیک روی خودِ هدف از لایه رد می‌شود
 *    (root دارای pointer-events:none و پنل‌های تاریک + کارت auto)
 *  - scrollIntoView هدف + تلاش برای یافتن هدف تا ~۲.۵ ثانیه
 *    (viewها async لود می‌شوند؛ اندازه‌گیری یک‌باره در ۴۵۰ms کافی نیست)
 *  - جای‌گذاری کارت بر اساس اندازهٔ واقعی کارت در فضای آزادِ viewport،
 *    بدون پوشاندن هدف (زیر → بالا → چپ هدف → راست هدف → clamp)
 *  - پیکان‌های RTL: قبلی = راست، بعدی = چپ
 *  - کلیدهای ← → فقط وقتی تمرکز روی input/textarea نیست جلو/عقب می‌برند
 */
export function mountTour(steps: TourStep[], handlers: {
  goFn?: (route: string) => void
  onClose: () => void
  onDone: () => void
}): TourHandle {
  let idx = 0
  let rect: TourBox | null = null
  let destroyed = false
  let navToken = 0
  let scrollDone = false
  const timers: ReturnType<typeof setTimeout>[] = []
  const later = (fn: () => void, ms: number) => { const t = setTimeout(() => { if (!destroyed) fn() }, ms); timers.push(t); return t }
  const clearTimers = () => { while (timers.length) clearTimeout(timers.pop()) }

  const root = tmk('div')
  root.setAttribute('dir', 'rtl')
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', 'تور راهنمای سامانه')
  root.style.position = 'fixed'
  root.style.inset = '0'
  root.style.zIndex = '1000'
  /* کلیک روی ناحیهٔ هدف از لایه رد شود؛ بقیهٔ صفحه توسط پنل‌های تاریک مسدود */
  root.style.pointerEvents = 'none'
  document.body.appendChild(root)

  const dims = [tmk('div'), tmk('div'), tmk('div'), tmk('div')]
  dims.forEach((d) => {
    d.className = 'bg-slate-900/62 transition-all duration-300'
    d.style.position = 'absolute'
    d.style.pointerEvents = 'auto'
    root.appendChild(d)
  })
  const ring = tmk('div', 'rounded-xl transition-all duration-300')
  ring.style.position = 'absolute'
  ring.style.pointerEvents = 'none'
  root.appendChild(ring)
  const card = tmk('div', 'absolute rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl')
  card.style.maxHeight = 'calc(100vh - 24px)'
  card.style.overflowY = 'auto'
  card.style.pointerEvents = 'auto'
  root.appendChild(card)

  function buildCard() {
    const step = steps[idx]
    card.textContent = ''
    const head = tmk('div', 'mb-1 flex items-center gap-1.5')
    head.appendChild(tmk('span', 'flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-black text-emerald-700', toFaDigits(String(idx + 1))))
    head.appendChild(tmk('h3', 'text-sm font-black text-stone-700', step.title))
    card.appendChild(head)
    card.appendChild(tmk('p', 'mt-1 text-[13px] leading-6 text-stone-600', step.body))
    if (step.mobileHint) {
      card.appendChild(tmk('p', 'mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-5 text-amber-800', `📱 ${step.mobileHint}`))
    }
    const foot = tmk('div', 'mt-3 flex items-center justify-between gap-2 border-t border-stone-200 pt-3')
    const dots = tmk('div', 'flex items-center gap-1')
    steps.forEach((_, i) => {
      const d = tmk('span', i === idx ? 'h-1.5 w-5 rounded-full bg-emerald-600 transition-all' : 'h-1.5 w-1.5 rounded-full transition-all')
      if (i !== idx) d.style.background = '#d6d3d1' /* stone-300 — در CSS فروزن نیست */
      dots.appendChild(d)
    })
    foot.appendChild(dots)
    const btns = tmk('div', 'flex items-center gap-1.5')
    const dismiss = tmk('button', 'rounded-md px-2.5 py-1.5 text-[11px] font-medium text-stone-400 transition-colors hover:text-rose-600', 'رد کردن')
    dismiss.type = 'button'
    dismiss.style.cursor = 'pointer'
    dismiss.onclick = () => finish(false)
    btns.appendChild(dismiss)
    if (idx > 0) {
      const prev = tmk('button', 'inline-flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1.5 text-[11px] font-medium text-stone-600')
      prev.type = 'button'
      prev.style.cursor = 'pointer'
      prev.appendChild(tchevron('right'))
      prev.appendChild(tmk('span', undefined, 'قبلی'))
      prev.onclick = () => { if (idx > 0) { idx--; show() } }
      btns.appendChild(prev)
    }
    const isLast = idx === steps.length - 1
    const next = tmk('button', 'inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm')
    next.type = 'button'
    next.style.cursor = 'pointer'
    next.appendChild(tmk('span', undefined, isLast ? 'پایان تور' : 'بعدی'))
    if (!isLast) next.appendChild(tchevron('left'))
    next.onclick = () => { if (idx < steps.length - 1) { idx++; show() } else finish(true) }
    btns.appendChild(next)
    foot.appendChild(btns)
    card.appendChild(foot)
    card.appendChild(tmk('div', 'mt-1 text-left text-[10px] text-stone-400', `${toFaDigits(String(idx + 1))} از ${toFaDigits(String(steps.length))}`))
  }

  /** آیا کارت با حلقهٔ هدف تداخل دارد؟ (حاشیهٔ ۸px) */
  function overlapsTarget(l: number, t: number, w: number, h: number): boolean {
    if (!rect) return false
    const m = 8
    return l < rect.right + m && l + w > rect.left - m && t < rect.bottom + m && t + h > rect.top - m
  }

  function layout() {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const PAD = 8
    if (rect) {
      tsetBox(dims[0], { top: '0px', left: '0px', right: '0px', height: `${Math.max(0, rect.top - PAD)}px` })
      tsetBox(dims[1], { top: `${rect.bottom + PAD}px`, left: '0px', right: '0px', bottom: '0px' })
      tsetBox(dims[2], { top: `${Math.max(0, rect.top - PAD)}px`, left: '0px', width: `${Math.max(0, rect.left - PAD)}px`, height: `${rect.height + PAD * 2}px` })
      tsetBox(dims[3], { top: `${Math.max(0, rect.top - PAD)}px`, left: `${rect.right + PAD}px`, right: '0px', height: `${rect.height + PAD * 2}px` })
      ring.style.display = 'block'
      tsetBox(ring, {
        top: `${rect.top - PAD}px`, left: `${rect.left - PAD}px`,
        width: `${rect.width + PAD * 2}px`, height: `${rect.height + PAD * 2}px`,
      })
      ring.style.boxShadow = '0 0 0 2.5px hsl(142 76% 36% / .95), 0 0 0 6px hsl(142 76% 36% / .18)'
    } else {
      /* تور مرکزی: فقط یک پنل تمام‌صفحه، بقیه صفر */
      tsetBox(dims[0], { top: '0px', left: '0px', right: '0px', bottom: '0px' })
      tsetBox(dims[1], { top: '0px', left: '0px', width: '0px', height: '0px' })
      tsetBox(dims[2], { top: '0px', left: '0px', width: '0px', height: '0px' })
      tsetBox(dims[3], { top: '0px', left: '0px', width: '0px', height: '0px' })
      ring.style.display = 'none'
      ring.style.boxShadow = ''
    }

    /* جای کارت — بر اساس اندازهٔ واقعی و در فضای آزاد (بدون پوشاندن هدف) */
    const cardW = Math.min(340, vw - 24)
    const cardH = card.offsetHeight || 200
    let cl: number
    let ct: number
    if (!rect) {
      ct = Math.max(12, Math.round(vh / 2 - cardH / 2))
      cl = Math.round(vw / 2 - cardW / 2)
    } else {
      const m = 12
      const fit = (l: number, t: number) => l >= m && t >= m && l + cardW <= vw - m && t + cardH <= vh - m
      const cands: [number, number][] = []
      /* زیر هدف، وسط‌چین افقی */
      cands.push([Math.round(rect.left + rect.width / 2 - cardW / 2), rect.bottom + m])
      /* بالای هدف، وسط‌چین افقی */
      cands.push([Math.round(rect.left + rect.width / 2 - cardW / 2), rect.top - m - cardH])
      /* چپ هدف (در RTL: سوی پیشروی)، هم‌تراز بالا */
      cands.push([rect.left - m - cardW, Math.max(m, Math.round(rect.top))])
      /* راست هدف، هم‌تراز بالا */
      cands.push([rect.right + m, Math.max(m, Math.round(rect.top))])
      let pick = cands.find(([l, t]) => fit(l, t) && !overlapsTarget(l, t, cardW, cardH))
      if (!pick) pick = cands.find(([l, t]) => fit(l, t))
      if (pick) {
        cl = pick[0]
        ct = pick[1]
      } else {
        /* هیچ جای خالی — زیر هدف با clamp داخل viewport */
        cl = Math.min(Math.max(m, Math.round(rect.left + rect.width / 2 - cardW / 2)), Math.max(m, vw - cardW - m))
        ct = rect.bottom + m + cardH <= vh - m ? rect.bottom + m : Math.max(m, vh - cardH - m)
      }
    }
    card.style.top = `${ct}px`
    card.style.left = `${cl}px`
    card.style.width = `${cardW}px`
  }

  /** آیا عنصر واقعاً رندر شده و جایگاه دارد؟ (offsetParent برای خودِ عناصر fixed
   *  null است؛ getClientRects هر دو حالت را می‌پوشاند) */
  function visible(el: HTMLElement): boolean {
    if (!el.isConnected) return false
    if (el.offsetParent) return true
    try { return el.getClientRects().length > 0 } catch { return false }
  }

  function measure() {
    if (destroyed) return
    const step = steps[idx]
    if (!step || !step.target) { rect = null; layout(); return }
    const t = document.querySelector(step.target) as HTMLElement | null
    if (!t || !visible(t)) { rect = null; layout(); return }
    const r = t.getBoundingClientRect()
    rect = r.width > 0 && r.height > 0
      ? { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right }
      : null
    if (rect && !scrollDone) {
      /* هدف بیرون از دید است؟ — بیاورش وسط دید، بعد دوباره اندازه بگیر */
      const vh = window.innerHeight
      if (rect.top < 0 || rect.bottom > vh || rect.height > vh * 0.8) {
        scrollDone = true
        try { t.scrollIntoView({ block: 'center' }) } catch { /* ignore */ }
        later(measure, 260)
        later(measure, 600)
        return
      }
    }
    layout()
  }

  async function enter() {
    const step = steps[idx]
    const token = ++navToken
    clearTimers()
    scrollDone = false
    rect = null
    layout()
    if (step?.go) {
      try { handlers.goFn && handlers.goFn(step.go) } catch { /* ناوبری ناملوف */ }
      await new Promise((res) => setTimeout(res, 350))
      if (destroyed || token !== navToken) return
    }
    /* هدف را پیدا کن — viewها async لود می‌شوند؛ تا ~۲.۵ ثانیه تلاش کن */
    const step2 = steps[idx]
    if (step2?.target) {
      for (let attempt = 0; attempt < 18; attempt++) {
        if (destroyed || token !== navToken) return
        const t = document.querySelector(step2.target) as HTMLElement | null
        if (t && visible(t)) break
        await new Promise((res) => setTimeout(res, 140))
      }
      if (destroyed || token !== navToken) return
    }
    measure()
    /* جاگذاری دوباره پس از نشست چیدمان (انیمیشن/دادهٔ دیرهنگام) */
    later(measure, 250)
    later(measure, 700)
    later(measure, 1400)
  }

  function show() {
    buildCard()
    layout()
    void enter()
  }

  function finish(done: boolean) {
    if (destroyed) return
    destroy()
    if (done) handlers.onDone()
    else handlers.onClose()
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { finish(false); return }
    /* تایپ در فیلدها: کلیدهای جهت نباید تور را جلو/عقب ببرند */
    const et = e.target as HTMLElement | null
    if (et && (et.tagName === 'INPUT' || et.tagName === 'TEXTAREA' || et.tagName === 'SELECT'
      || et.isContentEditable)) return
    if (e.key === 'ArrowLeft') { if (idx < steps.length - 1) { idx++; show() } else finish(true) }
    else if (e.key === 'ArrowRight') { if (idx > 0) { idx--; show() } }
  }
  let rafPending = false
  function onRe() {
    if (rafPending || destroyed) return
    rafPending = true
    requestAnimationFrame(() => { rafPending = false; measure() })
  }

  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onRe)
  window.addEventListener('scroll', onRe, true)

  function destroy() {
    if (destroyed) return
    destroyed = true
    clearTimers()
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', onRe)
    window.removeEventListener('scroll', onRe, true)
    root.remove()
  }

  show()

  return { destroy }
}

/**
 * تور تعاملی — پوشش React روی mountTour (overlay در document.body،
 * خارج از هر transform انیمیشنِ view). رفتار props عین نسخهٔ قبل است.
 */
export function TourEngine(props: TourEngineProps) {
  const { open, steps, onClose, onDone } = props
  const { go } = useShell() as any
  const handleRef = useRef<TourHandle | null>(null)
  const cbRef = useRef({ onClose, onDone, go })
  cbRef.current = { onClose, onDone, go }

  useEffect(() => {
    if (!open) {
      handleRef.current?.destroy()
      handleRef.current = null
      return
    }
    handleRef.current = mountTour(steps, {
      goFn: (r) => cbRef.current.go(r),
      onClose: () => cbRef.current.onClose(),
      onDone: () => cbRef.current.onDone(),
    })
    return () => {
      handleRef.current?.destroy()
      handleRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return null
}

/* ═══════════════════════ ۴) چاپ حرفه‌ای (iframe) ═══════════════════════ */

/**
 * چاپ/ذخیرهٔ PDF یک سند HTML کامل در iframe مخفی.
 * @param html سند کامل (<!DOCTYPE html>…</html>) با فونت وزیرمتن از /fonts
 * @param opts.width عرض @page (پیش‌فرض A4)
 */
export function printHTML(html: string, opts?: { width?: string }) {
  const width = opts?.width || '210mm'
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.right = '-10000px'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc) { frame.remove(); return }
  doc.open()
  doc.write(html.replace('</head>', `<style>@page{size:${width} auto;margin:0}</style></head>`))
  doc.close()
  const doPrint = () => {
    try { frame.contentWindow?.focus(); frame.contentWindow?.print() } catch { /* ignore */ }
    setTimeout(() => frame.remove(), 4000)
  }
  // انتظار برای فونت‌ها
  setTimeout(() => {
    try {
      const f = (frame.contentWindow as any)?.document?.fonts
      if (f?.ready?.then) f.ready.then(() => setTimeout(doPrint, 120))
      else doPrint()
    } catch { doPrint() }
  }, 350)
}

/* ═══════════════════════ ۵) بارکد Code128 ═══════════════════════ */

const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]

/** رسم بارکد Code128-B روی canvas — بازگشت خودِ canvas */
export function barcode128(text: string, opts?: { height?: number; moduleWidth?: number; showText?: boolean }): HTMLCanvasElement | null {
  const height = opts?.height ?? 46
  const mw = opts?.moduleWidth ?? 1.6
  const showText = opts?.showText !== false
  const clean = String(text ?? '').replace(/[^\x20-\x7e]/g, '')
  if (!clean) return null
  const codes: number[] = [104] // Start B
  let sum = 104
  for (let i = 0; i < clean.length; i++) {
    const v = clean.charCodeAt(i) - 32
    if (v < 0 || v > 94) return null
    codes.push(v)
    sum += v * (i + 1)
  }
  codes.push(sum % 103)
  codes.push(106) // stop
  const pattern = codes.map((c) => CODE128_PATTERNS[c]).join('')
  // عرض کل ماژول‌ها
  let total = 0
  for (const ch of pattern) total += Number(ch)
  const textH = showText ? 13 : 0
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(total * mw) + 8
  canvas.height = height + textH
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#18181b'
  let x = 4
  let bar = true
  for (const ch of pattern) {
    const w = Number(ch) * mw
    if (bar) ctx.fillRect(x, 0, w, height)
    x += w
    bar = !bar
  }
  if (showText) {
    ctx.fillStyle = '#18181b'
    ctx.font = '600 11px Vazirmatn, Tahoma, sans-serif'
    ctx.textAlign = 'center'
    ctx.direction = 'ltr'
    ctx.fillText(clean, canvas.width / 2, height + 10)
  }
  return canvas
}

/* ═══════════════════════ ۶) حروف‌خوانی مبالغ ═══════════════════════ */

const YEKAN = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه']
const DAHYEK = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده']
const DAHGAN = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود']
const SADGAN = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد']
const SCALE = ['', 'هزار', 'میلیون', 'میلیارد', 'هزار میلیارد']

function threeDigitToWords(n: number): string {
  const parts: string[] = []
  const s = Math.floor(n / 100)
  const rest = n % 100
  if (s > 0) parts.push(SADGAN[s])
  if (rest >= 10 && rest < 20) parts.push(DAHYEK[rest - 10])
  else {
    const d = Math.floor(rest / 10)
    const y = rest % 10
    if (d > 0) parts.push(DAHGAN[d])
    if (y > 0) parts.push(YEKAN[y])
  }
  return parts.join(' و ')
}

export function numberToPersianWords(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'صفر'
  if (n >= 1e15) return 'عدد بسیار بزرگ'
  const groups: number[] = []
  let x = n
  while (x > 0) { groups.push(x % 1000); x = Math.floor(x / 1000) }
  const parts: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    if (g === 0) continue
    parts.push(`${threeDigitToWords(g)}${SCALE[i] ? ' ' + SCALE[i] : ''}`)
  }
  return parts.join(' و ')
}

/** حروف‌خوانی مبلغ در دو سطر: ریال و تومان */
export function amountWords(amount: number): { rial: string; toman: string } {
  const rial = `${numberToPersianWords(amount)} ریال`
  const tomans = Math.floor(amount / 10)
  const rem = amount % 10
  const toman = rem === 0
    ? `${numberToPersianWords(tomans)} تومان`
    : `${numberToPersianWords(tomans)} تومان و ${numberToPersianWords(rem)} ریال`
  return { rial, toman }
}

/* ═══════════════════════ ۷) کمک‌های زمان ═══════════════════════ */

/** ۹۵ → «۱:۳۵» */
export function minutesToHM(total: number): string {
  const t = Math.max(0, Math.round(total || 0))
  const h = Math.floor(t / 60), m = t % 60
  return toFaDigits(`${h}:${pad2(m)}`)
}
