/**
 * تقویم هجری قمری (Umm al-Qura) — تبدیل دقیق هجری ↔ میلادی ↔ شمسی
 *
 * بستر علمی: تقویم ام‌القورا (جدول‌های نجومی پادشاهی عربستان، دامنه ۱۳۱۸–۱۵۰۰ ه‍.ق)
 * تقویم رسمی ایران (تقویم زمان‌بندی رسمی کشور) در دورهٔ فعلی معمولاً ±۱ روز با ام‌القورا فاصله دارد؛
 * لایهٔ «کالیبراسیون» اختلاف را به‌ازای هر ماه هجری از لنگرهای رسمی (time.ir) یاد می‌گیرد و
 * نمایش همهٔ تاریخ‌های قمری سامانه را با تقویم رسمی ایران هم‌ساز می‌کند.
 * کالیبراسیون: Setting «hijri.calibration» → {"1448-7": 1} — از /api/holidays/sync ساخته می‌شود.
 */
import umalqura from '@umalqura/core'

export const H_MONTHS = [
  'محرم', 'صفر', 'ربیع‌الاول', 'ربیع‌الثانی', 'جمادی‌الاول', 'جمادی‌الثانی',
  'رجب', 'شعبان', 'رمضان', 'شوال', 'ذی‌القعده', 'ذی‌الحجه',
]

export type HijriParts = { hy: number; hm: number; hd: number }

/* ── لایهٔ کالیبراسیون رسمی (module-level — از /api/holidays سمت کلاینت ست می‌شود) ── */
let calibration: Record<string, number> = {}

/** ست‌کردن کالیبراسیون رسمی (کلید «hy-hm» → اختلاف روز ±) */
export function setCalibration(map: Record<string, number>) {
  if (map && typeof map === 'object') {
    calibration = Object.fromEntries(
      Object.entries(map).filter(([, v]) => typeof v === 'number' && Math.abs(v) <= 3)
    )
  }
}

export function getCalibration(): Record<string, number> {
  return calibration
}

/** اعمال کالیبراسیون روی اجزای خام ام‌القورا — مرز ماه امن است (بیرون‌زدگی → خام) */
function calibrate(p: HijriParts): HijriParts {
  const d = calibration[`${p.hy}-${p.hm}`]
  if (!d) return p
  const len = umalqura.$.getDaysInMonth(p.hy, p.hm)
  const hd = p.hd + d
  if (hd < 1 || hd > len) return p // بیرون‌زدگی از ماه — رها (لنگر بعدی می‌گیرد)
  return { ...p, hd }
}

/** تاریخ میلادی (ISO yyyy-mm-dd) → اجزای هجری (با کالیبراسیون رسمی در صورت وجود) */
export function isoToHijri(iso: string): HijriParts {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const r = umalqura.$.gregorianToHijri(new Date(y, (m || 1) - 1, d || 1, 12))
  return calibrate({ hy: r.hy, hm: r.hm, hd: r.hd })
}

/** اجزای هجری → ISO میلادی */
export function hijriToIso(hy: number, hm: number, hd: number): string {
  const r = umalqura.$.hijriToGregorian(hy, hm, hd)
  const mm = String(r.gm + 1).padStart(2, '0')
  const dd = String(r.gd).padStart(2, '0')
  return `${r.gy}-${mm}-${dd}`
}

/** برچسب فارسی هجری: «۱۳ رجب ۱۴۴۷» */
export function formatHijri(iso: string, withYear = true): string {
  try {
    const { hy, hm, hd } = isoToHijri(iso)
    const digits = String(hd).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
    const year = withYear ? ` ${String(hy).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])}` : ''
    return `${digits} ${H_MONTHS[hm - 1]}${year}`
  } catch {
    return ''
  }
}

/** تعداد روزهای ماه هجری */
export function hijriMonthLength(hy: number, hm: number): number {
  return umalqura.$.getDaysInMonth(hy, hm)
}
