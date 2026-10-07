/**
 * موتور «مشاور پرداخت» — برنامه‌ریزی هوشمند چک برای حفظ اعتبار بازار
 * Smart payment scheduler: 3 ladder options (equal / front-loaded / back-loaded),
 * business-day snapping (مادهٔ ۳۱۵ قانون تجارت) + CredibilityScore (0-100).
 *
 * مبانی:
 *  - مادهٔ ۳۱۵ قانون تجارت: سررسید در روز تعطیل → روز کاری بعد (جابه‌جایی به جلو).
 *  - اصل «کاهش واریانس زمانی تعهدات» در مدیریت خزانه: نردبان مساوی، ریسک نقدشوندگی
 *    هر روز را به‌حداقل می‌رساند (bond-laddering literature).
 *  - اعتبار بازار: پرداخت‌های پس‌رو (back-loaded) و چک‌های پرشمار، نشانهٔ فشار نقدی
 *    تلقی می‌شوند و اعتبار خریدار را نزد تأمین‌کننده کاهش می‌دهند.
 *
 * مبالغ همه‌جا «تومان» است (قرارداد پلتفرم).
 */
import { toJalaliParts, jalaliToIso, addDaysIso, jMonthLength, weekdayName } from './jalali'
import { seasonOf, weekStartIso } from './flex'

// ───────────────────────── Types ─────────────────────────

export type SchedSizeBand = { max?: number; n: number } // max undefined = سقف باز
export type SchedParams = {
  maxDueDays: number // حداکثر پنجرهٔ سررسید (روز)
  sizeBands: SchedSizeBand[] // تعداد چک مجاز بر اساس اندازهٔ مبلغ (تومان)
  maxPerDay: number // حداکثر تعداد چک در یک روز
}

/** پیش‌فرض‌ها — مبلغ‌ها تومان: ≤۵۰م → حداکثر ۲ چک، ≤۲۰۰م → ۳، بیشتر → ۵ */
export const DEFAULT_SCHED_PARAMS: SchedParams = {
  maxDueDays: 45,
  sizeBands: [
    { max: 50_000_000, n: 2 },
    { max: 200_000_000, n: 3 },
    { n: 5 },
  ],
  maxPerDay: 2,
}

export const PAY_PERIODS = ['DAY', 'WEEK', 'MONTH', 'SEASON', 'YEAR'] as const
export type PayPeriod = (typeof PAY_PERIODS)[number]

export const PAY_PERIOD_LABELS: Record<string, string> = {
  DAY: 'روزانه',
  WEEK: 'هفتگی',
  MONTH: 'ماهانه',
  SEASON: 'فصلی',
  YEAR: 'سالانه',
}

export const PAY_METHODS = ['ALL', 'CHEQUE', 'CASH', 'POS', 'TRANSFER', 'OTHER'] as const

export const PAY_METHOD_LABELS: Record<string, string> = {
  ALL: 'همهٔ روش‌ها',
  CHEQUE: 'چک',
  CASH: 'نقدی',
  POS: 'کارت‌خوان',
  TRANSFER: 'کارت به کارت / حواله',
  OTHER: 'سایر',
}

export type PayLimitLite = {
  id?: string
  period: string
  dateKey: string
  method: string
  maxAmount: number
  maxCheques?: number
  note?: string
  /** مصرف قبلی همان دوره (بدون برنامهٔ جدید) — از API سقف‌ها */
  used?: number
}

/** نسخهٔ سبک چک برای محاسبهٔ مصرف سقف‌ها (سمت سرور و کلاینت) */
export type ChequeLite = { dueDate: string; amount: number; status: string }
/** نسخهٔ سبک پرداخت برای محاسبهٔ مصرف سقف‌ها */
export type PaymentLite = { paidAt: string; amount: number; kind: string }

export type SchedCheque = {
  dueDateIso: string
  amount: number
  amountShare: number // سهم از کل (۰..۱)
  shifted: boolean // روی تعطیل/جمعه بود و جابه‌جا شد
  weekday: string
}

export type SchedBreakdown = {
  dailyMax: number // بیشترین بار یک روز (تومان)
  breaches: { daily: number; weekly: number; monthly: number }
  holidayShifts: number
  avgInterval: number // میانگین فاصلهٔ روزها بین چک‌ها
  intervalVariance: number // نرمال‌شدهٔ ۰..۱
  backloadIndex: number // ۰..۱ (۱ = کاملاً پس‌رو)
  chequesBeyond3: boolean
}

export type SchedOption = {
  key: 'A' | 'B' | 'C'
  name: string
  desc: string
  cheques: SchedCheque[]
  score: number // 0..100
  rank: number // 1 = بهترین
  best: boolean
  breakdown: SchedBreakdown
}

// ───────────────────────── Period resolution ─────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0')

/** کلید دوره برای یک تاریخ: DAY=iso | WEEK=شنبهٔ آغازین | MONTH=1405-08 | SEASON=1405-S2 | YEAR=1405 */
export function resolvePeriodKey(period: string, isoDate: string): string {
  const { jy, jm } = toJalaliParts(isoDate)
  switch (period) {
    case 'DAY':
      return isoDate.slice(0, 10)
    case 'WEEK':
      return weekStartIso(isoDate)
    case 'MONTH':
      return `${jy}-${pad2(jm)}`
    case 'SEASON':
      return `${jy}-S${seasonOf(jm) + 1}`
    case 'YEAR':
      return String(jy)
    default:
      return ''
  }
}

/** بازهٔ ISO [start,end] برای کلید یک دوره — برای نمایش و محاسبهٔ مصرف */
export function periodRange(period: string, dateKey: string): { start: string; end: string } {
  switch (period) {
    case 'DAY':
      return { start: dateKey, end: dateKey }
    case 'WEEK':
      return { start: dateKey, end: addDaysIso(6, dateKey) }
    case 'MONTH': {
      const [jy, jm] = dateKey.split('-').map(Number)
      return { start: jalaliToIso(jy, jm, 1), end: jalaliToIso(jy, jm, jMonthLength(jy, jm)) }
    }
    case 'SEASON': {
      const [jy, s] = dateKey.split('-S').map(Number)
      const m0 = (s - 1) * 3 + 1
      return { start: jalaliToIso(jy, m0, 1), end: jalaliToIso(jy, m0 + 2, jMonthLength(jy, m0 + 2)) }
    }
    case 'YEAR': {
      const jy = Number(dateKey)
      return { start: jalaliToIso(jy, 1, 1), end: jalaliToIso(jy, 12, jMonthLength(jy, 12)) }
    }
    default:
      return { start: '', end: '' }
  }
}

// ───────────────────────── Usage ─────────────────────────

const ACTIVE_CHEQUE = (status: string) => !['REJECTED', 'RETURNED'].includes(status)

/** مصرف یک سقف در دورهٔ خودش — چک (سررسید) + پرداخت (تاریخ پرداخت) */
export function usageForLimit(
  limit: PayLimitLite,
  cheques: ChequeLite[],
  payments: PaymentLite[],
  todayIso: string,
): { used: number; usedCheques: number; usedPayments: number; range: { start: string; end: string } } {
  const dateKey = limit.dateKey || resolvePeriodKey(limit.period, todayIso)
  const range = periodRange(limit.period, dateKey)
  const inR = (d: string) => !!range.start && d >= range.start && d <= range.end
  let usedCheques = 0
  let usedPayments = 0
  let chequeAmount = 0
  let payAmount = 0
  if (limit.method === 'ALL' || limit.method === 'CHEQUE') {
    for (const c of cheques) {
      if (!ACTIVE_CHEQUE(c.status) || !inR(c.dueDate)) continue
      chequeAmount += Number(c.amount) || 0
      usedCheques++
    }
  }
  if (limit.method === 'ALL' || limit.method !== 'CHEQUE') {
    for (const p of payments) {
      if (!inR(String(p.paidAt).slice(0, 10))) continue
      if (limit.method !== 'ALL' && p.kind !== limit.method) continue
      payAmount += Number(p.amount) || 0
      usedPayments++
    }
  }
  return { used: chequeAmount + payAmount, usedCheques, usedPayments: payAmount, range }
}

// ───────────────────────── Business-day snapping ─────────────────────────

/**
 * روز کاری بانکی = شنبه تا چهارشنبه و غیرتعطیل.
 * پنجشنبه: اگر چهارشنبهٔ قبل کاری است عقب می‌کشد (پرداخت زودتر — به نفع اعتبار)،
 * وگرنه به شنبهٔ بعد می‌پرد. جمعه/تعطیل طبق مادهٔ ۳۱۵ به روز کاری بعد شیفت می‌شود.
 */
export function snapBusinessDay(iso: string, holidays: Set<string>): { iso: string; shifted: boolean } {
  let d = iso.slice(0, 10)
  let shifts = 0
  const wdOf = (x: string) => new Date(x + 'T12:00:00').getDay()
  const isBiz = (x: string) => {
    const wd = wdOf(x)
    return wd !== 4 && wd !== 5 && !holidays.has(x) // نه پنجشنبه، نه جمعه، نه تعطیل
  }
  for (let guard = 0; guard < 30; guard++) {
    if (isBiz(d)) break
    if (wdOf(d) === 4) {
      const back = addDaysIso(-1, d)
      if (isBiz(back)) {
        d = back
        shifts++
      } else {
        d = addDaysIso(2, d) // پنجشنبه → شنبه
        shifts += 2
      }
      continue
    }
    d = addDaysIso(1, d)
    shifts++
  }
  return { iso: d, shifted: shifts > 0 }
}

// ───────────────────────── Ladders ─────────────────────────

/** تعداد چک پیشنهادی بر اساس اندازهٔ مبلغ (تومان) و بندهای پارامتر */
export function maxChequesFor(amount: number, bands: SchedSizeBand[]): number {
  for (const b of bands) {
    if (b.max == null || amount <= b.max) return Math.max(1, b.n)
  }
  const last = bands[bands.length - 1]
  return Math.max(1, last?.n || 5)
}

function splitAmount(total: number, n: number): number[] {
  const base = Math.floor(total / n)
  const out = Array.from({ length: n }, () => base)
  let rem = total - base * n
  let i = 0
  const step = Math.max(1, Math.round(rem / n) || 1)
  while (rem > 0) {
    const add = Math.min(step, rem)
    out[i % n] += add
    rem -= add
    i++
    if (i > n * 10) break
  }
  return out
}

function windowDates(todayIso: string, w: number, from: number, to: number, n: number): string[] {
  // n تاریخ با فاصلهٔ مساوی در بازهٔ [from..to] از پنجره (کسرهای ۰..۱ از w)
  if (n <= 0) return []
  if (n === 1) return [addDaysIso(Math.round(w * ((from + to) / 2)), todayIso)]
  return Array.from({ length: n }, (_, i) =>
    addDaysIso(Math.round(w * (from + ((to - from) * i) / (n - 1))), todayIso),
  )
}

// ───────────────────────── Score ─────────────────────────

function intervalStats(dues: string[], todayIso: string): { avg: number; variance: number } {
  if (dues.length === 0) return { avg: 0, variance: 0 }
  const sorted = [...dues].sort()
  const gaps: number[] = []
  let prev = todayIso
  for (const d of sorted) {
    gaps.push(Math.max(0, Math.round((new Date(d + 'T12:00:00').getTime() - new Date(prev + 'T12:00:00').getTime()) / 86400000)))
    prev = d
  }
  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length
  if (gaps.length === 1) return { avg, variance: 0 }
  const varr = gaps.reduce((s, g) => s + (g - avg) ** 2, 0) / gaps.length
  // نرمال‌سازی: مجذور ضریب تغییرات، سقف ۱
  const variance = avg > 0 ? Math.min(1, varr / (avg * avg)) : 1
  return { avg, variance }
}

function backloadIndex(cheques: SchedCheque[], todayIso: string, w: number): number {
  if (!cheques.length) return 0
  const mid = addDaysIso(Math.round(w / 2), todayIso)
  const total = cheques.reduce((s, c) => s + c.amount, 0) || 1
  const second = cheques.filter((c) => c.dueDateIso > mid).reduce((s, c) => s + c.amount, 0)
  const share2 = second / total
  return Math.max(0, Math.min(1, (share2 - 0.5) * 2))
}

/** CredibilityScore = 100 −30 روز −20 هفته −15 ماه −15 پس‌رو −10 چک>۳ −10 تعطیل −5 واریانس */
function credibility(bd: SchedBreakdown): number {
  const raw =
    100 -
    30 * (bd.breaches.daily > 0 ? 1 : 0) -
    20 * (bd.breaches.weekly > 0 ? 1 : 0) -
    15 * (bd.breaches.monthly > 0 ? 1 : 0) -
    15 * bd.backloadIndex -
    10 * (bd.chequesBeyond3 ? 1 : 0) -
    10 * (bd.holidayShifts > 0 ? 1 : 0) -
    5 * bd.intervalVariance
  return Math.max(0, Math.min(100, Math.round(raw)))
}

// ───────────────────────── Generator ─────────────────────────

export type ScheduleInput = {
  amount: number
  maxDueDays?: number
  todayIso: string
  params?: Partial<SchedParams>
  payLimits?: PayLimitLite[]
  /** مجموعهٔ تاریخ‌های تعطیل رسمی (iso) */
  holidays?: Set<string>
}

export type ScheduleResult = {
  options: SchedOption[]
  /** نقشهٔ تقویم: همهٔ تاریخ‌های هر سه گزینه برای نمایش نقاط پیش‌نمایش */
  overlay: { dateIso: string; amount: number; option: 'A' | 'B' | 'C' }[]
  params: SchedParams
  chequeCount: number
}

function capBreachesFor(
  dates: string[],
  amountsByDate: Map<string, number>,
  input: { todayIso: string; params: SchedParams; payLimits: PayLimitLite[] },
) {
  const { params, payLimits } = input
  const usedPerDay = new Map<string, number>()
  for (const d of dates) usedPerDay.set(d, (usedPerDay.get(d) || 0) + (amountsByDate.get(d) || 0))

  // سقف‌های فعال مربوط به چک
  const dayLimits = payLimits.filter((l) => l.period === 'DAY' && (l.method === 'CHEQUE' || l.method === 'ALL'))
  const weekLimits = payLimits.filter((l) => l.period === 'WEEK' && (l.method === 'CHEQUE' || l.method === 'ALL'))
  const monthLimits = payLimits.filter((l) => l.period === 'MONTH' && (l.method === 'CHEQUE' || l.method === 'ALL'))

  let daily = 0
  for (const [d, amt] of usedPerDay) {
    // تعداد چک در روز
    const countOnDay = dates.filter((x) => x === d).length
    if (countOnDay > params.maxPerDay) daily++
    for (const l of dayLimits) {
      const key = l.dateKey || resolvePeriodKey('DAY', input.todayIso)
      if (key === d && (l.used ?? 0) + amt > l.maxAmount) daily++
    }
  }

  const bucket = (limits: PayLimitLite[], period: 'WEEK' | 'MONTH'): number => {
    let breach = 0
    const perKey = new Map<string, number>()
    for (const d of dates) {
      const key = resolvePeriodKey(period, d)
      perKey.set(key, (perKey.get(key) || 0) + (amountsByDate.get(d) || 0))
    }
    for (const [key, amt] of perKey) {
      const l = limits.find((x) => (x.dateKey || resolvePeriodKey(period, input.todayIso)) === key)
      if (!l) continue
      if ((l.used ?? 0) + amt > l.maxAmount) breach++
    }
    return breach
  }

  return {
    daily,
    weekly: bucket(weekLimits, 'WEEK'),
    monthly: bucket(monthLimits, 'MONTH'),
  }
}

/** تولید ۳ گزینهٔ نردبان چک + رتبه‌بندی بر اساس CredibilityScore */
export function generateSchedule(input: ScheduleInput): ScheduleResult {
  const params: SchedParams = {
    maxDueDays: Math.max(7, Math.min(180, Math.round(input.params?.maxDueDays ?? input.maxDueDays ?? DEFAULT_SCHED_PARAMS.maxDueDays))),
    sizeBands: input.params?.sizeBands?.length ? input.params.sizeBands : DEFAULT_SCHED_PARAMS.sizeBands,
    maxPerDay: Math.max(1, Math.round(input.params?.maxPerDay ?? DEFAULT_SCHED_PARAMS.maxPerDay)),
  }
  const holidays = input.holidays || new Set<string>()
  const payLimits = input.payLimits || []
  const amount = Math.max(0, Math.round(input.amount))
  const w = params.maxDueDays
  const n = maxChequesFor(amount, params.sizeBands)
  const today = input.todayIso

  const build = (key: 'A' | 'B' | 'C', name: string, desc: string, rawDates: string[], amounts: number[]): SchedOption => {
    const cheques: SchedCheque[] = []
    let shifts = 0
    const total = amount || 1
    for (let i = 0; i < rawDates.length; i++) {
      const snap = snapBusinessDay(rawDates[i], holidays)
      if (snap.shifted) shifts++
      cheques.push({
        dueDateIso: snap.iso,
        amount: amounts[i] || 0,
        amountShare: Math.round(((amounts[i] || 0) / total) * 100) / 100,
        shifted: snap.shifted,
        weekday: weekdayName(snap.iso),
      })
    }
    // ادغام چک‌هایی که بعد از شیفت روی یک روز افتادند؟ نه — چک جدا می‌ماند (واقعیت بانکی)
    const amountsByDate = new Map<string, number>()
    for (const c of cheques) amountsByDate.set(c.dueDateIso, (amountsByDate.get(c.dueDateIso) || 0) + c.amount)
    const breaches = capBreachesFor(cheques.map((c) => c.dueDateIso), amountsByDate, {
      todayIso: today,
      params,
      payLimits,
    })
    const { avg, variance } = intervalStats(cheques.map((c) => c.dueDateIso), today)
    const breakdown: SchedBreakdown = {
      dailyMax: Math.max(0, ...amountsByDate.values()),
      breaches,
      holidayShifts: shifts,
      avgInterval: Math.round(avg * 10) / 10,
      intervalVariance: Math.round(variance * 100) / 100,
      backloadIndex: Math.round(backloadIndex(cheques, today, w) * 100) / 100,
      chequesBeyond3: cheques.length > 3,
    }
    return { key, name, desc, cheques, score: credibility(breakdown), rank: 0, best: false, breakdown }
  }

  const options: SchedOption[] = []

  // A) نردبان مساوی — تاریخ‌های فاصله‌دار تا سقف پنجره
  const eqDates = windowDates(today, w, 1 / n, 1, n) // آخرین چک دقیقاً انتهای پنجره
  options.push(build('A', 'نردبان مساوی', 'چک‌های هم‌مبلغ با فاصلهٔ یکسان — کمترین فشار روزانه', eqDates, splitAmount(amount, n)))

  // B) پیش‌رو ۶۰/۴۰ — سنگین‌تر زودتر (اعتبار بالاتر نزد تأمین‌کننده)
  const nf = Math.ceil(n / 2)
  const nb = n - nf
  const bFront = nb > 0 ? Math.round(amount * 0.6) : amount
  const bDates = [
    ...windowDates(today, w, 0.2, 0.5, nf),
    ...(nb > 0 ? windowDates(today, w, 0.6, 0.9, nb) : []),
  ]
  const bAmounts = [...splitAmount(bFront, nf), ...(nb > 0 ? splitAmount(amount - bFront, nb) : [])]
  options.push(build('B', 'پیش‌رو ۶۰/۴۰', 'بدهی سنگین‌تر زودتر تسویه می‌شود — نشانهٔ قدرت نقدی و اعتبار', bDates, bAmounts))

  // C) پس‌رو ۳۰/۷۰ — نقدینگی حفظ می‌شود اما اعتبار کمتر
  const cFront = nb > 0 ? Math.round(amount * 0.3) : amount
  const cDates = [
    ...windowDates(today, w, 0.25, 0.5, nf),
    ...(nb > 0 ? windowDates(today, w, 0.6, 0.95, nb) : []),
  ]
  const cAmounts = [...splitAmount(cFront, nf), ...(nb > 0 ? splitAmount(amount - cFront, nb) : [])]
  options.push(build('C', 'پس‌رو ۳۰/۷۰', 'تسویهٔ اصلی به انتهای پنجره موکول می‌شود — حفظ نقدینگی، هزینهٔ اعتباری', cDates, cAmounts))

  // رتبه‌بندی
  options.sort((a, b) => b.score - a.score || a.cheques.length - b.cheques.length)
  options.forEach((o, i) => {
    o.rank = i + 1
    o.best = i === 0
  })

  const overlay = options.flatMap((o) =>
    o.cheques.map((c) => ({ dateIso: c.dueDateIso, amount: c.amount, option: o.key })),
  )

  return { options, overlay, params, chequeCount: n }
}
