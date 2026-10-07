/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  موتور محاسبات حقوق و دستمزد — هایپر زیتون (قانون کار ایران، سال ۱۴۰۴)
 * ─────────────────────────────────────────────────────────────────────────────
 *  موتور «خالص» است: هیچ دسترسی به دیتابیس/شبکه ندارد — ورودی می‌گیرد، خروجی می‌دهد.
 *  همهٔ مبالغ به «ریال» (float). نمایش تومان در UI با تقسیم بر ۱۰ انجام می‌شود
 *  (faMoney خودش تقسیم نمی‌کند — فقط ارقام فارسی + جداکنندهٔ هزارگان است).
 *
 *  مراجع قانونی (JSDoc هر فرمول):
 *   - ماده ۴۱ و ۴۲ قانون کار: حداقل دستمزد و مزایای حکمی (مسکن، بن، تأهل، اولاد، سنوات)
 *   - ماده ۵۹: اضافه‌کاری — ۴۰٪ اضافه بر مزد هر ساعت کار اضافی؛ سقف ۴ ساعت در روز
 *   - ماده ۵۸: شب‌کاری — ۳۵٪ اضافه بر مزد ساعت کار عادی (افزوده به مزد)
 *   - مواد ۶۲ و ۶۳: جمعه‌کاری و کار در تعطیلات رسمی — ۴۰٪ اضافه + روز جایگزین
 *   - قانون تأمین اجتماعی (تبصرهٔ ماده ۳۸): حق مسکن و بن کارگری از حقوق مشمول بیمه سهم کارگر معاف
 *   - ماده ۸۴ قانون مالیات‌های مستقیم: نرخ پلکانی مالیات حقوق (اصلاحی ۱۴۰۴)
 *   - قانون پاداش سالانه (عیدی): حداقل ۲ برابر مزد ماهانه، حداکثر ۳ برابر (۹۰ روز مزد حداقلی)
 */

import { jalaaliMonthLength, toGregorian, isLeapJalaaliYear } from 'jalaali-js'

/* ── ثابت‌های قانونی ۱۴۰۴ (ریال) — همه در سامانه از طریق Settings قابل تغییرند ── */
export const STATUTORY_1404 = {
  /** حداقل دستمزد روزانه (ماده ۴۱) */
  dailyMinWage: 3_463_656,
  /** پایه حقوق ماهانه = ۳۰ × روزانه */
  monthlyMinWage: 103_909_680,
  /** حق مسکن ماهانه */
  housing: 9_000_000,
  /** بن کارگری (خواروبار) ماهانه */
  foodAllowance: 22_000_000,
  /** حق تأهل (به ازای هر زن/شوهر تحت تکفل) */
  maritalAllowance: 5_000_000,
  /** حق اولاد هر فرزند (شرط: ۷۲۰ روز سابقهٔ بیمه — در صورت عدم احراز مقدار ۰ ذخیره می‌شود) */
  childAllowance: 10_390_968,
  /** پایهٔ سنوات روزانه (ماهانه ۲٬۸۲۰٬۰۰۰) */
  seniorityDaily: 94_000,
  /** مخرج مزد ساعتی برای اضافه‌کاری (ماده ۵۹ — رویهٔ رایج) */
  overtimeDivisor: 220,
  /** فرمول سایر سطوح دستمزد: مزد سال قبل × ۱٫۳۲ + ۹٬۳۱۶٬۰۸۰ ریال */
  otherLevelsFormula: { factor: 1.32, addend: 9_316_080 },
  /** مالیات: معافیت ماهانه ۲۴۰ میلیون ریال + پلکانی */
  tax: { exempt: 240_000_000, bands: [{ upTo: 360_000_000, rate: 0.1 }, { upTo: 540_000_000, rate: 0.15 }, { upTo: null, rate: 0.2 }] },
} as const

/**
 * ── ثابت‌های قانونی ۱۴۰۵ (ریال) — round-16 ──
 * منبع: مصوبهٔ شورای عالی کار جلسهٔ ۱۴۰۴/۱۲/۲۴ (ابلاغی وزارت کار — بخشنامهٔ ۱۴۰۵)
 * + قانون بودجهٔ ۱۴۰۵ (سقف معافیت مالیاتی). حداقل دستمزد +۶۰٪، سایر سطوح +۴۵٪ + مبلغ ثابت.
 * راستی‌آزمایی: donya-e-eqtesad، mohaseban.org، kartaban، sarayehesabdar، chargoon (حداقل ۲ منبع مستقل برای هر عدد).
 */
export const STATUTORY_1405 = {
  /** حداقل دستمزد روزانه: ۳٬۴۶۳٬۶۵۶ × ۱٫۶ */
  dailyMinWage: 5_541_850,
  /** پایه حقوق ماهانه (۳۰ روزه) = ۵٬۵۴۱٬۸۵۰ × ۳۰ */
  monthlyMinWage: 166_255_500,
  /** مزد ساعتی = روزانه ÷ ۷٫۳۳ */
  hourlyMinWage: 756_050,
  /** حق مسکن — تصویب‌نامهٔ هیئت وزیران ۱۴۰۵/۰۲/۰۶: ۹٬۰۰۰٬۰۰۰ ← ۳۰٬۰۰۰٬۰۰۰ */
  housing: 30_000_000,
  /** بن کارگری (خواروبار) — بدون تغییر نسبت به ۱۴۰۴ */
  foodAllowance: 22_000_000,
  /** حق تأهل — بدون تغییر */
  maritalAllowance: 5_000_000,
  /** حق اولاد هر فرزند = ۳ × دستمزد روزانه (شرط ۷۲۰ روز سابقهٔ بیمه) */
  childAllowance: 16_625_550,
  /** پایهٔ سنوات روزانه — مصوبه: ۱۶۶٬۶۶۷ ریال (ماهانه ≈ ۵٬۰۰۰٬۰۰۰) */
  seniorityDaily: 166_667,
  /** مخرج مزد ساعتی برای اضافه‌کاری (ثابت قانونی — تغییر نمی‌کند) */
  overtimeDivisor: 220,
  /** سایر سطوح: مزد ثابت سال قبل × ۱٫۴۵ + ۵۱۹٬۵۴۹ ریال/روز */
  otherLevelsFormula: { factor: 1.45, addend: 519_549 },
  /** عیدی: کف ۲× پایه = ۶۰ روز؛ سقف ۹۰ × روزانهٔ حداقلی */
  newYearBonusMin: 332_511_000,
  newYearBonusMax: 498_766_500,
  /** مالیات حقوق ۱۴۰۵ (قانون بودجه): معافیت ماهانه ۴۰۰ میلیون + پلکانی ۱۰/۱۵/۲۰/۲۵/۳۰٪ */
  tax: {
    exempt: 400_000_000,
    bands: [
      { upTo: 800_000_000, rate: 0.1 },
      { upTo: 1_000_000_000, rate: 0.15 },
      { upTo: 1_200_000_000, rate: 0.2 },
      { upTo: 1_400_000_000, rate: 0.25 },
      { upTo: null, rate: 0.3 },
    ],
  },
} as const

/** ثابت‌های هر سال — موتور بر اساس سال حقوقی انتخاب می‌کند (پیش‌فرض ۱۴۰۵) */
export type StatutoryTable = typeof STATUTORY_1405
const TABLES: Record<number, StatutoryTable> = {
  1404: STATUTORY_1404 as unknown as StatutoryTable,
  1405: STATUTORY_1405,
}
export function getStatutory(jy: number): StatutoryTable {
  return TABLES[jy] ?? STATUTORY_1405
}

/* ── انواع عمومی ── */

export type SalaryProfileLike = {
  baseSalary: number
  housing: number
  foodAllowance: number
  maritalAllowance: number
  childAllowance: number
  childCount: number
  seniorityBase: number // روزانه
  overtimeDivisor: number
  includeBenefitsInOT: boolean
}

export type AbsenceKind = 'NONE' | 'FULL' | 'HALF'
export type DayKind = 'WORK' | 'OFF' | 'FRIDAY' | 'HOLIDAY' | 'LEAVE'

export type SalaryDayLike = {
  forDate: string // iso yyyy-mm-dd
  otMinutes: number
  holidayOtMinutes: number
  nightMinutes: number
  absence: AbsenceKind
  dayKind: DayKind
  note: string
}

export type AdjustKind = 'REWARD' | 'FINE' | 'COMMISSION' | 'ADVANCE' | 'OTHER'

export type SalaryAdjustLike = {
  kind: AdjustKind
  amount: number
  ownerOnly?: boolean
}

/** مالیات پلکانی — بازه‌ها «مازاد بر معافیت» هستند؛ upTo مطلق (ریال) یا null = تا بی‌نهایت */
export type TaxConfig = {
  exempt: number
  bands: Array<{ upTo: number | null; rate: number }>
}

export type PayrollPolicy = {
  /** ضریب اضافه‌کاری عادی (قانون: ۱٫۴) — ماده ۵۹ */
  otRate: number
  /** ضریب شب‌کاری (قانون: ۰٫۳۵ افزودنی) — ماده ۵۸ */
  nightRate: number
  /** ضریب جمعه/تعطیل‌کاری (قانون: ۱٫۴) — مواد ۶۲/۶۳ */
  holidayOtRate: number
  /** آستانهٔ هشدار اضافه‌کاری روزانه به دقیقه (پیش‌فرض ۴ ساعت = ۲۴۰ دقیقه — مادهٔ ۵۹)؛ فقط هشدار، منع ثبت نیست (17-E) */
  otCapMinutes: number
  /** نرخ سهم بیمهٔ کارگر (پیش‌فرض ۷٪) */
  insuranceRate: number
  /** نرخ سهم بیمهٔ کارفرما (پیش‌فرض ۲۳٪ = ۲۰ بیمه + ۳ بیکاری) — round-16 قابل تنظیم */
  employerRate: number
  /** آیا اضافه‌کاری مشمول بیمه شود؟ (طرح فعلی: خیر — حق مسکن/بن/اضافه‌کاری معاف) */
  insuranceIncludesOT: boolean
  /** سقف جریمهٔ ماهانه به درصدی از جمع حقوق و مزایا (پیش‌فرض ۲۵٪) */
  fineCapPct: number
  /** گردکردن خالص پرداختی به مضرب (۰ = دقیق؛ ۱۰۰۰ = هزار ریال) */
  roundTo: number
}

export const DEFAULT_POLICY: PayrollPolicy = {
  otRate: 1.4,
  nightRate: 0.35,
  holidayOtRate: 1.4,
  otCapMinutes: 240,
  insuranceRate: 0.07,
  employerRate: 0.23,
  insuranceIncludesOT: false,
  fineCapPct: 25,
  roundTo: 0,
}

/** پروفایل پیش‌فرض از روی ثابت‌های قانونی — برای ساخت خودکار SalaryProfile */
export const DEFAULT_PROFILE_1404: Omit<SalaryProfileLike, 'baseSalary'> = {
  housing: STATUTORY_1404.housing,
  foodAllowance: STATUTORY_1404.foodAllowance,
  maritalAllowance: STATUTORY_1404.maritalAllowance,
  childAllowance: STATUTORY_1404.childAllowance,
  childCount: 0,
  seniorityBase: STATUTORY_1404.seniorityDaily,
  overtimeDivisor: STATUTORY_1404.overtimeDivisor,
  includeBenefitsInOT: false,
}

/** پروفایل پیش‌فرض ۱۴۰۵ (round-16 — پیش‌فرض سال حقوقی سامانه) */
export const DEFAULT_PROFILE_1405: Omit<SalaryProfileLike, 'baseSalary'> = {
  housing: STATUTORY_1405.housing,
  foodAllowance: STATUTORY_1405.foodAllowance,
  maritalAllowance: STATUTORY_1405.maritalAllowance,
  childAllowance: STATUTORY_1405.childAllowance,
  childCount: 0,
  seniorityBase: STATUTORY_1405.seniorityDaily,
  overtimeDivisor: STATUTORY_1405.overtimeDivisor,
  includeBenefitsInOT: false,
}

export function defaultProfileFor(jy: number): Omit<SalaryProfileLike, 'baseSalary'> {
  const s = getStatutory(jy)
  return {
    housing: s.housing,
    foodAllowance: s.foodAllowance,
    maritalAllowance: s.maritalAllowance,
    childAllowance: s.childAllowance,
    childCount: 0,
    seniorityBase: s.seniorityDaily,
    overtimeDivisor: s.overtimeDivisor,
    includeBenefitsInOT: false,
  }
}

/* ── ابزارها ── */

/** ارقام فارسی برای متن هشدارها (نمایش) */
function fa(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
}

/** گردکردن به نزدیک‌ترین مضرب (step=0 یا 1 → دقیق) */
export function roundTo(v: number, step: number): number {
  if (!step || step < 1) return Math.round(v)
  return Math.round(v / step) * step
}

/** محدودکردن مبلغ به بازهٔ مجاز — ضد NaN/منفی/بی‌نهایت */
export function clampAmount(v: unknown, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(v)
  if (!isFinite(n) || isNaN(n)) return 0
  return Math.max(0, Math.min(n, max))
}

/** تعداد روزهای یک ماه شمسی */
export function jMonthDays(jy: number, jm: number): number {
  return jalaaliMonthLength(jy, jm)
}

/** آیا سال شمسی کبیسه است؟ (اسفند ۳۰ روز) */
export function jIsLeap(jy: number): boolean {
  try { return isLeapJalaaliYear(jy) } catch { return false }
}

/** روزهای سال شمسی (۳۶۵/۳۶۶) */
export function jYearDays(jy: number): number {
  return jIsLeap(jy) ? 366 : 365
}

/* ── مالیات حقوق (ماده ۸۴ ق.م.م — پلکانی ماهانه) ── */

/**
 * محاسبهٔ مالیات ماهانه حقوق.
 * taxable مازاد بر معافیت به ترتیب بازه‌ها نرخ‌گذاری می‌شود:
 *   معافیت ۲۴۰م؛ مازاد تا ۱٫۵× (۳۶۰م) → ۱۰٪؛ تا ۲٫۲۵× (۵۴۰م) → ۱۵٪؛ بیش از آن → ۲۰٪
 * JSDoc-formula: tax = Σ (سهم هر پله از مازاد) × نرخ پله
 */
export function computeTax(taxable: number, tax: TaxConfig): number {
  const over = Math.max(0, taxable - Math.max(0, tax.exempt))
  if (over <= 0) return 0
  let remaining = over
  let prevCap = 0
  let result = 0
  for (const b of tax.bands) {
    const cap = b.upTo == null ? Infinity : Math.max(0, b.upTo)
    const bandWidth = cap - prevCap
    const portion = bandWidth === Infinity ? remaining : Math.min(remaining, Math.max(0, bandWidth))
    if (portion > 0) {
      result += portion * b.rate
      remaining -= portion
    }
    if (remaining <= 0) break
    prevCap = cap
  }
  if (remaining > 0 && tax.bands.length) {
    // هر مازادِ خارج از بازه‌های تعریف‌شده با آخرین نرخ مالیات می‌شود (دفاعی در برابر پیکربندی ناقص)
    result += remaining * tax.bands[tax.bands.length - 1].rate
  }
  return Math.round(result)
}

/* ── محاسبهٔ ماهانه ── */

export type ComputeMonthInput = {
  profile: SalaryProfileLike
  days: SalaryDayLike[]
  adjusts: SalaryAdjustLike[]
  monthDays: number // روزهای تقویمی ماه شمسی
  tax: TaxConfig
  policy: PayrollPolicy
  /** سال/ماه شمسی برای گزارش (اختیاری) */
  jy?: number
  jm?: number
  /** سال حقوقی برای هشدار حداقل‌دستمزد (پیش‌فرض ۱۴۰۵) */
  statutoryYear?: number
  /** آستانهٔ حداقل دستمزد مادهٔ ۴۱ — اگر مدیریت جدول قانونی را دستی اصلاح کرده باشد (17-E) */
  minMonthlyWage?: number
  /** پرسنل غیرفعال؟ (فقط برای هشدار) */
  personnelActive?: boolean
}

export type MonthComputed = {
  // کارکرد
  workDays: number // روز کارکرد مؤثر (تقویمی منهای غیبت)
  absentFullDays: number
  absentHalfDays: number
  otHours: number
  holidayOtHours: number
  nightHours: number
  otCapViolations: string[] // تاریخ‌های فراتر از سقف ۴ ساعته (ماده ۵۹)
  // اجزای درآمد (ریال)
  baseProrated: number // پایهٔ حقوق کسر غیبت‌شده
  housing: number
  foodAllowance: number
  marital: number
  childTotal: number
  hourlyBase: number // مزد ساعتی مأخذ اضافه‌کاری
  overtimePay: number
  holidayOtPay: number
  nightPay: number
  seniorityAccrual: number // ذخیرهٔ ماهانهٔ سنوات — جزو gross نیست (تسویهٔ سالانه)
  rewards: number
  commissions: number
  fines: number
  advances: number
  other: number
  gross: number // جمع حقوق و مزایا (قبل از کسور)
  // کسور
  insurableBase: number // مشمول بیمه
  insurance: number // سهم کارگر
  tax: number
  otherDeductions: number // جریمه + مساعده
  net: number
  // هشدارهای قانونی برای نمایش در فیش/ادیتور
  warnings: string[]
}

/**
 * موتور ماهانه — JSDoc-formulas (همه مبالغ ریال):
 *
 *  روزانه        : monthDays روز تقویمی ماه؛ غیبت کامل → کسر روزمزد = base ÷ monthDays؛ نیم‌روز → نصف آن
 *                  workDays = monthDays − FULL − 0.5×HALF
 *  پایه          : baseProrated = base × (workDays ÷ monthDays)  … ماده ۴۱ (کسر غیبت غیرموجه)
 *  مزد ساعتی     : hourly = OTbase ÷ overtimeDivisor (پیش‌فرض ۲۲۰)
 *                  OTbase = base تنها (پیش‌فرض) یا base + housing + foodAllowance وقتی
 *                  includeBenefitsInOT فعال است (مأخذ اضافه‌کاری — قابل تنظیم)
 *  اضافه‌کاری    : overtimePay = otHours × hourly × otRate(۱٫۴) … ماده ۵۹؛ آستانهٔ ۴ ساعت/روز فقط هشدار است
 *                  (غیرمسدودکننده — مبنای توافق کاری طرفین)
 *  جمعه/تعطیل‌کاری: holidayOtPay = holidayOtHours × hourly × holidayOtRate(۱٫۴) … مواد ۶۲/۶۳
 *                  (+ الزام روز جایگزین — در فیلد یادداشت روز پیگیری می‌شود)
 *  شب‌کاری       : nightPay = nightHours × hourly × nightRate(۰٫۳۵) — افزودنی … ماده ۵۸
 *  سنوات         : seniorityAccrual = seniorityBase(روزانه) × ۳۰ — ذخیرهٔ نمایشی؛ تسویه در عیدی/سنوات سالانه
 *  مزایا         : housing + foodAllowance + marital + childAllowance × childCount
 *  اقلام متغیر   : REWARD/COMMISSION/OTHER به درآمد؛ FINE/ADVANCE جزو otherDeductions (نه کسر از gross)
 *  gross         : baseProrated + housing + food + marital + child + OTها + REWARD + COMMISSION + OTHER
 *  بیمه (۷٪)     : مشمول = baseProrated + marital + child  (مسکن/بن/اضافه‌کاری معاف — تبصرهٔ مادهٔ ۳۸ ق.ت.أ)
 *                  با insuranceIncludesOT=true → + overtimePay + holidayOtPay
 *  مالیات        : computeTax(gross) … ماده ۸۴ ق.م.م
 *  خالص          : net = roundTo(gross − insurance − tax − otherDeductions, policy.roundTo)
 */
export function computeMonth(input: ComputeMonthInput): MonthComputed {
  const { profile, monthDays, tax, policy } = input
  const P = policy
  const warnings: string[] = []

  const md = Math.max(1, Math.floor(monthDays))
  const dayRate = (profile.baseSalary || 0) / md

  let absentFull = 0
  let absentHalf = 0
  let otMin = 0
  let holidayOtMin = 0
  let nightMin = 0
  const otCapViolations: string[] = []
  for (const d of input.days || []) {
    const ot = clampAmount(d.otMinutes, 10000)
    const hot = clampAmount(d.holidayOtMinutes, 10000)
    const nm = clampAmount(d.nightMinutes, 10000)
    otMin += ot
    holidayOtMin += hot
    nightMin += nm
    if (d.absence === 'FULL') absentFull += 1
    else if (d.absence === 'HALF') absentHalf += 0.5
    if (ot + hot > P.otCapMinutes) otCapViolations.push(d.forDate)
  }

  const workDays = Math.max(0, md - absentFull - absentHalf)
  const baseProrated = Math.round((profile.baseSalary || 0) * (workDays / md))

  // مأخذ مزد ساعتی — ماده ۵۹
  const otBase = (profile.includeBenefitsInOT ? (profile.baseSalary || 0) + (profile.housing || 0) + (profile.foodAllowance || 0) : profile.baseSalary || 0)
  const divisor = profile.overtimeDivisor > 0 ? profile.overtimeDivisor : getStatutory(input.statutoryYear || 1405).overtimeDivisor
  const hourlyBase = otBase / divisor

  const otHours = otMin / 60
  const holidayOtHours = holidayOtMin / 60
  const nightHours = nightMin / 60

  const overtimePay = Math.round(otHours * hourlyBase * P.otRate)
  const holidayOtPay = Math.round(holidayOtHours * hourlyBase * P.holidayOtRate)
  const nightPay = Math.round(nightHours * hourlyBase * P.nightRate)

  const childTotal = (profile.childAllowance || 0) * Math.max(0, profile.childCount || 0)
  const seniorityAccrual = Math.round((profile.seniorityBase || 0) * 30)

  // اقلام متغیر
  let rewards = 0, commissions = 0, fines = 0, advances = 0, other = 0
  for (const a of input.adjusts || []) {
    const amt = clampAmount(a.amount)
    if (!amt) continue
    if (a.kind === 'REWARD') rewards += amt
    else if (a.kind === 'COMMISSION') commissions += amt
    else if (a.kind === 'FINE') fines += amt
    else if (a.kind === 'ADVANCE') advances += amt
    else other += amt // OTHER = سایر مزایای متغیر (به درآمد اضافه می‌شود)
  }

  const gross = baseProrated + (profile.housing || 0) + (profile.foodAllowance || 0) +
    (profile.maritalAllowance || 0) + childTotal + overtimePay + holidayOtPay + nightPay +
    rewards + commissions + other

  // بیمهٔ تأمین اجتماعی — سهم کارگر
  let insurableBase = baseProrated + (profile.maritalAllowance || 0) + childTotal
  if (P.insuranceIncludesOT) insurableBase += overtimePay + holidayOtPay
  const insurance = Math.round(insurableBase * P.insuranceRate)

  const taxAmount = computeTax(Math.max(0, gross), tax)
  const otherDeductions = fines + advances
  const net = roundTo(gross - insurance - taxAmount - otherDeductions, P.roundTo)

  // هشدارهای قانونی — همه هشدارهای اضافه‌کاری «غیرمسدودکننده»اند (مادهٔ ۵۹: توافق طرفین ملاک است)
  if (otCapViolations.length) {
    const capLabel = P.otCapMinutes % 60 === 0
      ? `${fa(Math.floor(P.otCapMinutes / 60))} ساعت`
      : `${fa(Math.round(P.otCapMinutes))} دقیقه`
    warnings.push(`اضافه‌کاری بیش از آستانهٔ هشدار روزانه (${capLabel} — مادهٔ ۵۹) در ${fa(otCapViolations.length)} روز — مبنای توافق کاری طرفین پذیرفته شد`)
  }
  if (fines > 0 && P.fineCapPct > 0 && gross > 0 && fines > gross * (P.fineCapPct / 100)) {
    warnings.push(`جمع جریمه از سقف ${P.fineCapPct}٪ حقوق و مزایا فراتر رفته است`)
  }
  const statutory = getStatutory(input.statutoryYear || 1405)
  const minMonthly = input.minMonthlyWage && input.minMonthlyWage > 0 ? input.minMonthlyWage : statutory.monthlyMinWage
  if (profile.baseSalary > 0 && profile.baseSalary < minMonthly) {
    warnings.push(`حقوق پایه کمتر از حداقل دستمزد ${input.statutoryYear || 1405} (${Math.round(minMonthly).toLocaleString('en-US')} ریال) است — مادهٔ ۴۱`)
  }
  if (holidayOtMin > 0) {
    warnings.push('جمعه‌کاری/تعطیل‌کاری مستلزم روز جایگزین است (مواد ۶۲ و ۶۳) — در یادداشت روز پیگیری شود')
  }
  if (input.personnelActive === false) {
    warnings.push('این پرسنل غیرفعال است — پیش از پرداخت وضعیت را بررسی کنید')
  }

  return {
    workDays, absentFullDays: absentFull, absentHalfDays: absentHalf,
    otHours, holidayOtHours, nightHours, otCapViolations,
    baseProrated, housing: profile.housing || 0, foodAllowance: profile.foodAllowance || 0,
    marital: profile.maritalAllowance || 0, childTotal,
    hourlyBase, overtimePay, holidayOtPay, nightPay, seniorityAccrual,
    rewards, commissions, fines, advances, other, gross,
    insurableBase, insurance, tax: taxAmount, otherDeductions, net,
    warnings,
  }
}

/* ── تسویهٔ سالانه: عیدی + سنوات ── */

export type ComputeYearlyInput = {
  profile: SalaryProfileLike
  serviceFromIso: string // میلادی yyyy-mm-dd (از Personnel.hireDate شمسی تبدیل‌شده)
  jy: number // سال شمسی تسویه
  todayIso: string // برای سال جاری → محاسبه تا امروز
  /** حداقل مزد ماهانه برای سقف عیدی (پیش‌فرض ۱۴۰۵) */
  minMonthlyWage?: number
}

export type YearlyComputed = {
  jy: number
  yearDays: number
  serviceDays: number
  ratio: number // نسبت خدمت در سال (۱ = تمام سال)
  serviceFrom: string | null // شروع احتساب (iso)
  serviceTo: string // پایان احتساب (iso)
  eydiRaw: number // عیدی قبل از سقف (متناسب‌شده)
  eydiCap: number // سقف قانونی سالانه (۳ × ماه حداقلی)
  eydi: number // عیدی نهایی (کف ۲× اعمال شده؛ متناسب با روزهای خدمت)
  seniority: number // سنوات سالانه = پایهٔ روزانه × روزهای خدمت
  total: number
  partial: boolean // خدمت کمتر از تمام سال
}

function isoOfJalali(jy: number, jm: number, jd: number): string {
  const g = toGregorian(jy, jm, jd)
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000)
}

/**
 * تسویهٔ سالانهٔ عیدی و سنوات — قانون حق پاداش سالانه (مصوب ۱۳۷۰ و اصلاحات):
 *   عیدی = ۲ × مزد ماهانه (کف) — سقف ۳ × مزد ماهانهٔ حداقلی (= ۹۰ × دستمزد روزانهٔ حداقلی)
 *   خدمت کمتر از یک سال → متناسب با روزهای خدمت (ratio = serviceDays ÷ yearDays)
 *   سنوات = پایهٔ روزانهٔ سنوات × روزهای خدمت (بدون سقف — مادهٔ ۴۲)
 * JSDoc-formula: eydiRaw = min(2×base, cap) × ratio ; seniority = seniorityBase × serviceDays
 */
export function computeYearly(input: ComputeYearlyInput): YearlyComputed {
  const jy = Math.floor(input.jy)
  const yearDays = jYearDays(jy)
  const yStart = isoOfJalali(jy, 1, 1)
  const yEnd = isoOfJalali(jy + 1, 1, 1) // exclusive
  const today = input.todayIso

  const from = input.serviceFromIso > yStart ? input.serviceFromIso : yStart
  let to = yEnd
  let partial = true
  if (input.serviceFromIso <= yStart) {
    // تمام‌سال یا شروع قبل از سال تسویه
    if (today >= yEnd) {
      to = yEnd
      partial = false
    } else {
      to = today // سال جاری — تا امروز
      partial = true
    }
  } else if (input.serviceFromIso >= yEnd) {
    // در این سال خدمت نداشته
    return {
      jy, yearDays, serviceDays: 0, ratio: 0, serviceFrom: null, serviceTo: yEnd,
      eydiRaw: 0, eydiCap: 0, eydi: 0, seniority: 0, total: 0, partial: false,
    }
  } else {
    to = today < yEnd ? today : yEnd
    partial = today < yEnd
  }

  const serviceDays = Math.max(0, dayDiff(to, from))
  const ratio = Math.min(1, serviceDays / yearDays)

  const minMonthly = input.minMonthlyWage ?? STATUTORY_1405.monthlyMinWage
  const eydiCap = 3 * minMonthly
  const base = input.profile.baseSalary || 0
  const fullEydi = Math.min(2 * base, eydiCap) // کف ۲× (حداقل قانونی)، سقف ۳× حداقلی
  const eydiRaw = Math.round(fullEydi * ratio)
  const seniority = Math.round((input.profile.seniorityBase || 0) * serviceDays)

  return {
    jy, yearDays, serviceDays, ratio, serviceFrom: from, serviceTo: to,
    eydiRaw, eydiCap, eydi: eydiRaw, seniority, total: eydiRaw + seniority, partial,
  }
}
