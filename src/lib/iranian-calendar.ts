/**
 * تقویم رسمی ایران — مجموعهٔ دقیق تعطیلات و مناسبت‌ها
 *
 * ساختار:
 *  ۱) تعطیلات خورشیدی ثابت (نوروز، ۱۲ فروردین، ۱۴–۱۵ خرداد، ۲۲ بهمن، ۲۹ اسفند، روز کارگر…)
 *  ۲) مناسبت‌های قمری با تبدیل واقعی هجری→میلادی (Umm al-Qura) — هرگز «عدد هجری»
 *     به‌عنوان «عدد شمسی» درج نمی‌شود (رفع اشکال ۱۳ رجب ≠ ۱۳ دی)
 *
 * دامنهٔ پوشش: هر سال شمسی که API درخواست کند (پیش‌فرض ۱۴۰۳–۱۴۰۶).
 * همگام‌سازی با منبع رسمی (time.ir / keybit) از مسیر /api/holidays/sync ممکن است؛
 * دادهٔ داخلی همیشه به‌عنوان پایهٔ آفلاین دقیق در دسترس است.
 */
import { isoToHijri, hijriToIso, hijriMonthLength, H_MONTHS } from '@/lib/hijri'
import { jalaliToIso, jMonthLength, toJalaliParts, faNum } from '@/lib/jalali'

export type OccasionKind = 'HOLIDAY' | 'OCCASION'

export type CalDay = {
  date: string // yyyy-mm-dd gregorian iso
  title: string
  kind: OccasionKind
  hijriLabel: string // «۱۳ رجب ۱۴۴۷» برای قمری‌ها
  solar: boolean
}

/** تعطیلات خورشیدی ثابت رسمی ایران */
export const SOLAR_OFFICIAL: { jm: number; jd: number; title: string; kind?: OccasionKind }[] = [
  { jm: 1, jd: 1, title: 'نوروز — جشن سال نو' },
  { jm: 1, jd: 2, title: 'عیدنوروز' },
  { jm: 1, jd: 3, title: 'عیدنوروز' },
  { jm: 1, jd: 4, title: 'عیدنوروز' },
  { jm: 1, jd: 12, title: 'روز جمهوری اسلامی' },
  { jm: 1, jd: 13, title: 'سیزده‌بدر — روز طبیعت' },
  { jm: 2, jd: 11, title: 'روز جهانی کارگر' },
  { jm: 3, jd: 3, title: 'آزادسازی خرمشهر — روز مقاومت و پیروزی', kind: 'OCCASION' },
  { jm: 3, jd: 14, title: 'رحلت امام خمینی' },
  { jm: 3, jd: 15, title: 'قیام ۱۵ خرداد' },
  { jm: 4, jd: 20, title: 'بزرگداشت حافظ — روز زبان و ادب فارسی', kind: 'OCCASION' },
  { jm: 9, jd: 30, title: 'شب یلدا — بلندترین شب سال', kind: 'OCCASION' },
  { jm: 7, jd: 1, title: 'آغاز سال تحصیلی', kind: 'OCCASION' },
  { jm: 11, jd: 22, title: 'پیروزی انقلاب اسلامی' },
  { jm: 12, jd: 29, title: 'ملی شدن صنعت نفت' },
]

/** مناسبت‌های قمری — تاریخ واقعی با تبدیل هجری محاسبه می‌شود */
export const RELIGIOUS_EVENTS: {
  hm: number
  hd?: number
  lastOfSafar?: boolean // شهادت امام رضا — آخر صفر
  title: string
  kind?: OccasionKind
}[] = [
  { hm: 1, hd: 1, title: 'آغاز سال نو قمری', kind: 'OCCASION' },
  { hm: 1, hd: 9, title: 'تاسوعای حسینی' },
  { hm: 1, hd: 10, title: 'عاشورای حسینی' },
  { hm: 2, hd: 20, title: 'اربعین حسینی' },
  { hm: 2, hd: 28, title: 'رحلت پیامبر اکرم و شهادت امام حسن مجتبی' },
  { hm: 2, lastOfSafar: true, title: 'شهادت امام رضا' },
  { hm: 3, hd: 8, title: 'شهادت امام حسن عسکری' },
  { hm: 3, hd: 17, title: 'ولادت پیامبر اکرم و امام جعفر صادق' },
  { hm: 6, hd: 3, title: 'شهادت حضرت فاطمه زهرا' },
  { hm: 7, hd: 13, title: 'ولادت امام علی — روز پدر' },
  { hm: 7, hd: 27, title: 'مبعث رسول اکرم' },
  { hm: 8, hd: 15, title: 'ولادت حضرت قائم — جشن نیمه شعبان' },
  { hm: 9, hd: 1, title: 'آغاز ماه رمضان', kind: 'OCCASION' },
  { hm: 9, hd: 19, title: 'ضربت خوردن امام علی', kind: 'OCCASION' },
  { hm: 9, hd: 21, title: 'شهادت امام علی' },
  { hm: 10, hd: 1, title: 'عید سعید فطر' },
  { hm: 10, hd: 2, title: 'تعطیل به مناسبت عید سعید فطر' },
  { hm: 10, hd: 25, title: 'شهادت امام جعفر صادق' },
  { hm: 12, hd: 10, title: 'عید سعید قربان' },
  { hm: 12, hd: 18, title: 'عید سعید غدیر خم' },
]

const KIND_PRIORITY: Record<OccasionKind, number> = { HOLIDAY: 2, OCCASION: 1 }

function faLabel(hy: number, hm: number, hd: number): string {
  return `${faNum(hd)} ${H_MONTHS[hm - 1]} ${faNum(hy)}`
}

/**
 * همهٔ تعطیلات/مناسبت‌های یک سال شمسی را بساز.
 * پنجرهٔ سال شمسی از ۱ فروردین تا پایان اسفند؛ همهٔ سال‌های هجری همپوشان پیمایش می‌شوند،
 * بنابراین اگر یک مناسبت قمری دو بار در یک سال شمسی بیفتد، هر دو رخداد ثبت می‌شود.
 */
export function buildOfficialDays(jy: number): CalDay[] {
  const isoStart = jalaliToIso(jy, 1, 1)
  const isoEnd = jalaliToIso(jy, 12, jMonthLength(jy, 12))
  const hy1 = isoToHijri(isoStart).hy
  const hy2 = isoToHijri(isoEnd).hy

  const out: CalDay[] = []

  // ── خورشیدی ثابت ──
  for (const s of SOLAR_OFFICIAL) {
    out.push({
      date: jalaliToIso(jy, s.jm, s.jd),
      title: s.title,
      kind: s.kind || 'HOLIDAY',
      hijriLabel: '',
      solar: true,
    })
  }

  // ── قمری با تبدیل واقعی ──
  for (let hy = hy1; hy <= hy2; hy++) {
    for (const e of RELIGIOUS_EVENTS) {
      let hd = e.hd || 1
      if (e.lastOfSafar) hd = hijriMonthLength(hy, 2) // آخر صفر (۲۹ یا ۳۰)
      let iso: string
      try {
        iso = hijriToIso(hy, e.hm, hd)
      } catch {
        continue
      }
      if (iso < isoStart || iso > isoEnd) continue
      out.push({
        date: iso,
        title: e.title,
        kind: e.kind || 'HOLIDAY',
        hijriLabel: faLabel(hy, e.hm, hd),
        solar: false,
      })
    }
  }

  // حذف تکراری‌های یک روز: تعطیل بر مناسبت مقدم است؛ برچسب‌های هجری ادغام می‌شوند
  const byDate = new Map<string, CalDay>()
  for (const d of out) {
    const prev = byDate.get(d.date)
    if (!prev) {
      byDate.set(d.date, d)
      continue
    }
    if (KIND_PRIORITY[d.kind] > KIND_PRIORITY[prev.kind]) {
      byDate.set(d.date, { ...d, hijriLabel: d.hijriLabel || prev.hijriLabel })
    } else if (KIND_PRIORITY[d.kind] === KIND_PRIORITY[prev.kind] && prev.title !== d.title) {
      // هم‌روز شدن دو مناسبت (مثل عید فطر و ملی شدن صنعت نفت) — هر دو برچسب حفظ شود
      byDate.set(d.date, {
        ...prev,
        title: `${prev.title} / ${d.title}`,
        hijriLabel: prev.hijriLabel || d.hijriLabel,
        solar: prev.solar || d.solar,
      })
    } else if (prev.kind === d.kind && !prev.hijriLabel && d.hijriLabel) {
      byDate.set(d.date, { ...prev, hijriLabel: d.hijriLabel })
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** امروز شمسی چه سال‌هایی باید همیشه آماده باشند (قبلی، جاری، بعدی) */
export function holidayYearsToKeep(todayIsoStr?: string): number[] {
  const jy = toJalaliParts(todayIsoStr || new Date().toISOString().slice(0, 10)).jy
  return [jy - 1, jy, jy + 1]
}
