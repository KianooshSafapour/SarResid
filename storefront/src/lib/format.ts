/** قالب‌بندی فارسی — پول (ریال)، ارقام، تاریخ جلالی */
import { toGregorian, toJalaali } from 'jalaali-js'

export function faDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
}

/** ۱۲۵٬۰۰۰ — بدون واحد */
export function faNum(n: number): string {
  return Math.round(n).toLocaleString('fa-IR')
}

/** «۱۲۵٬۰۰۰ ریال» — واحد پول همیشه صریح (خطر ۱۰× ریال/تومان) */
export function faMoney(n: number): string {
  return `${faNum(n)} ریال`
}

export const J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
export const J_WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']

function jalaliPartsOfIso(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/** «۱۴ آبان» از تاریخ جلالی YYYY-MM-DD */
export function faJalaliShort(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return date
  return `${faDigits(+m[3])} ${J_MONTHS[+m[2] - 1] || ''}`
}

/** روز هفته از تاریخ جلالی YYYY-MM-DD */
export function faJalaliWeekday(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return ''
  const g = toGregorian(+m[1], +m[2], +m[3])
  const d = new Date(Date.UTC(g.gy, g.gm - 1, g.gd))
  return J_WEEKDAYS[(d.getUTCDay() + 1) % 7]
}

/** «امروز/فردا/پس‌فردا» نسبت به امروزِ تهران — برای چیپ اسلات‌ها */
export function dayRelativeLabel(date: string, todayJalali: string): string {
  const diff = daysBetweenJalali(todayJalali, date)
  if (diff === 0) return 'امروز'
  if (diff === 1) return 'فردا'
  if (diff === 2) return 'پس‌فردا'
  return faJalaliWeekday(date)
}

export function daysBetweenJalali(a: string, b: string): number {
  const pa = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a)
  const pb = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b)
  if (!pa || !pb) return -1
  const ga = toGregorian(+pa[1], +pa[2], +pa[3])
  const gb = toGregorian(+pb[1], +pb[2], +pb[3])
  const da = Date.UTC(ga.gy, ga.gm - 1, ga.gd)
  const db = Date.UTC(gb.gy, gb.gm - 1, gb.gd)
  return Math.round((db - da) / 86400000)
}

/** امروزِ تقویم تهران به جلالی YYYY-MM-DD */
export function todayJalaliDash(): string {
  const now = new Date(Date.now() + 3.5 * 3600_000) // UTC+3:30
  const j = toJalaali(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
  return `${j.jy}-${String(j.jm).padStart(2, '0')}-${String(j.jd).padStart(2, '0')}`
}

/** «۱۴ آبان ۱۴۰۵، ۱۸:۳۲» از ISO */
export function faDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const p = jalaliPartsOfIso(iso)
  if (!p) return iso
  const t = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }).format(new Date(iso))
  return `${faDigits(p.jd)} ${J_MONTHS[p.jm - 1]} ${faDigits(p.jy)}، ${t}`
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
