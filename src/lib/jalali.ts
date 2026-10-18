import jalaali from '@/lib/jalaali-core'

export interface JDate {
  jy: number
  jm: number
  jd: number
}

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد',
  'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر',
  'دی', 'بهمن', 'اسفند',
]

export const JALALI_WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']
export const JALALI_WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

/** Convert JS Date to Jalali {jy, jm, jd} in Asia/Tehran timezone */
export function dateToJalali(d: Date = new Date()): JDate {
  // shift to Tehran time (+3:30)
  const tehran = new Date(d.getTime() + (3.5 * 60 + 0) * 60000)
  const { jy, jm, jd } = jalaali.toJalaali(tehran.getFullYear(), tehran.getMonth() + 1, tehran.getDate())
  return { jy, jm, jd }
}

export function jalaliToDate(jy: number, jm: number, jd: number): Date {
  const g = jalaali.toGregorian(jy, jm, jd)
  return new Date(g.gy, g.gm - 1, g.gd, 12, 0, 0) // noon to avoid TZ edge cases
}

/** Format Date → "1404/08/15" (Tehran) */
export function formatJalali(d?: Date | string | null): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  const { jy, jm, jd } = dateToJalali(date)
  return `${jy}/${pad2(jm)}/${pad2(jd)}`
}

/** Format Date → "1404/08/15 - 14:30" (Tehran) */
export function formatJalaliDateTime(d?: Date | string | null): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  const tehran = new Date(date.getTime() + 3.5 * 3600000)
  const hh = pad2(tehran.getHours())
  const mm = pad2(tehran.getMinutes())
  return `${formatJalali(date)} - ${hh}:${mm}`
}

/** Today in Tehran as "1404/08/15" */
export function todayJalali(): string {
  return formatJalali(new Date())
}

export function nowTehranTime(): string {
  const tehran = new Date(Date.now() + 3.5 * 3600000)
  return `${pad2(tehran.getHours())}:${pad2(tehran.getMinutes())}`
}

/** Parse "1404/08/15" → JDate */
export function parseJalali(s: string): JDate | null {
  const m = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  if (!m) return null
  return { jy: +m[1], jm: +m[2], jd: +m[3] }
}

/** Add days to a Jalali date string → Jalali date string */
export function addDaysJalali(s: string, days: number): string {
  const j = parseJalali(s)
  if (!j) return s
  const d = jalaliToDate(j.jy, j.jm, j.jd)
  d.setDate(d.getDate() + days)
  return formatJalali(d)
}

/** Difference in days between two Jalali date strings (a - b) */
export function diffDaysJalali(a: string, b: string): number {
  const ja = parseJalali(a)
  const jb = parseJalali(b)
  if (!ja || !jb) return 0
  const da = jalaliToDate(ja.jy, ja.jm, ja.jd)
  const db = jalaliToDate(jb.jy, jb.jm, jb.jd)
  return Math.round((da.getTime() - db.getTime()) / 86400000)
}

/** Day of week (0=شنبه ... 6=جمعه) for Jalali date string */
export function jalaliWeekday(s: string): number {
  const j = parseJalali(s)
  if (!j) return 0
  const d = jalaliToDate(j.jy, j.jm, j.jd)
  // JS: 0=Sunday..6=Saturday → Persian week starts Saturday
  return (d.getDay() + 1) % 7
}

/** Persian weekday name for a jalali date */
export function jalaliWeekdayName(s: string): string {
  return JALALI_WEEKDAYS[jalaliWeekday(s)] || ''
}

/** Is this Jalali date a Thursday(5)/Friday(6) weekend? */
export function isWeekendJalali(s: string): boolean {
  const wd = jalaliWeekday(s)
  return wd === 5 || wd === 6
}

/** Number of days in a Jalali month */
export function jalaliMonthLength(jy: number, jm: number): number {
  return jalaali.jalaaliMonthLength(jy, jm)
}

/** Convert numbers in a string to Persian digits */
const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
export function toFaDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[+d])
}

export function toEnDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

/** Format money with thousand separators + Persian digits */
export function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '۰'
  return toFaDigits(Math.round(n).toLocaleString('en-US'))
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Profit margin % between sell price and cost */
export function profitMargin(sell: number, cost: number): number {
  if (!cost || cost <= 0) return 0
  return ((sell - cost) / cost) * 100
}

/** Margin color class: <10% red, <25% yellow, else green */
export function marginColorClass(margin: number): string {
  if (margin < 10) return 'text-red-600 bg-red-50'
  if (margin < 25) return 'text-amber-600 bg-amber-50'
  return 'text-emerald-700 bg-emerald-50'
}

// ===== SarResid live-contract formats (1405-07-25 style) =====

/** Format Date → "1405-07-25" (Tehran, dash-separated) */
export function formatJalaliDash(d?: Date | string | null): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  const { jy, jm, jd } = dateToJalali(date)
  return `${jy}-${pad2(jm)}-${pad2(jd)}`
}

/** Today in "1405-07-25" format */
export function todayJalaliDash(): string {
  return formatJalaliDash(new Date())
}

/** "1405-07-25" → {jy, jm, jd} */
export function parseJalaliDash(s: string): JDate {
  const [jy, jm, jd] = s.split('-').map(Number)
  return { jy, jm, jd }
}

/** Jalali dash date + n days → dash date */
export function addDaysJalaliDash(s: string, days: number): string {
  const { jy, jm, jd } = parseJalaliDash(s)
  const g = jalaliToDate(jy, jm, jd)
  g.setDate(g.getDate() + days)
  return formatJalaliDash(g)
}

/** day-of-week index for Jalali dash date (0=شنبه) */
export function jalaliWeekdayDash(s: string): number {
  const { jy, jm, jd } = parseJalaliDash(s)
  return jalaliWeekday(`${jy}/${pad2(jm)}/${pad2(jd)}`)
}

/** "1405-07-25" → "۲۵ مهر ۱۴۰۵" */
export function jalaliDashToLong(s: string): string {
  const { jy, jm, jd } = parseJalaliDash(s)
  return `${toFaDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${toFaDigits(jy)}`
}

/** weekday name for Jalali dash date */
export function jalaliDashWeekdayName(s: string): string {
  return JALALI_WEEKDAYS[jalaliWeekdayDash(s)]
}
