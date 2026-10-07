/**
 * Jalali (Persian) calendar utilities — based on jalaali-js
 */
import { toJalaali, toGregorian, jalaaliMonthLength } from 'jalaali-js'

export const J_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]
export const J_WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']
// JS getDay(): 0=Sun..6=Sat  → Persian week starts Saturday
const JS_DAY_TO_JWEEK: Record<number, number> = { 6: 0, 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6 }

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** Convert latin digits in a string to Persian digits */
export function faNum(v: string | number): string {
  return String(v).replace(/\d/g, (d) => FA_DIGITS[Number(d)])
}

/** Normalize Persian (۰-۹) and Arabic (٠-٩) digits to Latin — safe for inputs/API payloads */
export function enDigits(s: string): string {
  return String(s)
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
}

/** Parse any digit-style string ('۱۲٬۵۰۰', '12,500', ' ۱۲۵۰۰ ') → number; 0 when invalid */
export function parseFaNumber(s: string | number | null | undefined): number {
  if (typeof s === 'number') return isNaN(s) ? 0 : s
  const cleaned = enDigits(String(s ?? '')).replace(/[^\d.-]/g, '')
  const n = Number(cleaned)
  return isNaN(n) ? 0 : n
}

/** Format a number with thousand separators + Persian digits */
export function faMoney(v: number | null | undefined): string {
  if (v == null || isNaN(v as number)) return faNum(0)
  return faNum(Math.round(v).toLocaleString('en-US'))
}

/** yyyy-mm-dd (gregorian ISO date part) */
export function isoDay(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function todayIso(): string {
  return isoDay(new Date())
}

export function addDaysIso(days: number, base?: string): string {
  const d = base ? new Date(base + 'T12:00:00') : new Date()
  d.setDate(d.getDate() + days)
  return isoDay(d)
}

export function toJalaliParts(dateLike: string | Date): { jy: number; jm: number; jd: number } {
  let d: Date
  if (typeof dateLike === 'string') {
    d = dateLike.includes('T') ? new Date(dateLike) : new Date(dateLike + 'T12:00:00')
  } else {
    d = dateLike
  }
  if (!d || isNaN(d.getTime())) d = new Date()
  return toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

export function jalaliToIso(jy: number, jm: number, jd: number): string {
  const g = toGregorian(jy, jm, jd)
  return isoDay(new Date(g.gy, g.gm - 1, g.gd))
}

export function isFriday(dateIso: string): boolean {
  return new Date(dateIso + 'T12:00:00').getDay() === 5
}

export function weekdayName(dateIso: string): string {
  return J_WEEKDAYS[JS_DAY_TO_JWEEK[new Date(dateIso + 'T12:00:00').getDay()]]
}

/** ۱۴۰۴/۰۳/۱۲ */
export function formatJalaliShort(dateLike: string | Date | null | undefined): string {
  if (!dateLike) return '—'
  const { jy, jm, jd } = toJalaliParts(String(dateLike).slice(0, 10))
  return faNum(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`)
}

/** ۱۲ خرداد ۱۴۰۴ */
export function formatJalaliLong(dateLike: string | Date | null | undefined): string {
  if (!dateLike) return '—'
  const { jy, jm, jd } = toJalaliParts(String(dateLike).slice(0, 10))
  return `${faNum(jd)} ${J_MONTHS[jm - 1]} ${faNum(jy)}`
}

/** پنجشنبه ۱۲ خرداد ۱۴۰۴ */
export function formatJalaliFull(dateLike: string | Date | null | undefined): string {
  if (!dateLike) return '—'
  const d = String(dateLike).slice(0, 10)
  return `${weekdayName(d)} ${formatJalaliLong(d)}`
}

/** ۱۴۰۴/۰۳/۱۲ - ۰۹:۳۰ */
export function formatJalaliDateTime(dateLike: string | Date | null | undefined): string {
  if (!dateLike) return '—'
  const d = typeof dateLike === 'string' ? new Date(dateLike) : dateLike
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${formatJalaliShort(d)} - ${faNum(`${hh}:${mm}`)}`
}

/** days between two ISO days (a - b) */
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a + 'T12:00:00').getTime() - new Date(b + 'T12:00:00').getTime()) / 86400000)
}

/** number of days in a jalali month */
export function jMonthLength(jy: number, jm: number): number {
  return jalaaliMonthLength(jy, jm)
}

/** first weekday (0=شنبه) of a jalali month */
export function jMonthStartWeekday(jy: number, jm: number): number {
  const iso = jalaliToIso(jy, jm, 1)
  return JS_DAY_TO_JWEEK[new Date(iso + 'T12:00:00').getDay()]
}
