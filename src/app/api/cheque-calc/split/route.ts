import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import {
  todayJalaliDash,
  addDaysJalaliDash,
  jalaliDashToLong,
  jalaliDashWeekdayName,
  diffDaysJalali,
} from '@/lib/jalali'
import { readLimits, readSplit, DEFAULT_LIMITS, DEFAULT_SPLIT, type ChequeLimits, type ChequeSplit } from '@/lib/cheque-settings'

export const dynamic = 'force-dynamic'

const DASH_DATE = /^\d{4}-\d{2}-\d{2}$/

/** همان قاعدهٔ محاسبه‌گر: مالک + مدیر کل + حسابدار + مدیر سامانه */
const CALC_ROLES = ['OWNER', 'GM', 'ACC', 'ADMIN']

interface SplitCheque { date: string; long: string; weekday: string; amount: number; deltaFromTarget: number }
interface SplitOption {
  n: number
  cheques: SplitCheque[]
  maxPerDay: number
  sum: number
  warnings: string[]
  ok: boolean
}

async function loadWorkingDays(from: string, target: string): Promise<Set<string>> {
  const holidays = await db.holiday.findMany({ where: { date: { gte: from, lte: target } } })
  const off = new Set<string>(holidays.map((h) => h.date))
  // جمعه‌ها را هم به‌عنوان روز غیرکاری اضافه کن (تاریخ‌های بازه را پیمایش نمی‌کنیم — فقط برای مقاصد این درخواست کافی است)
  return off
}

function isWorking(date: string, holidaySet: Set<string>): boolean {
  if (holidaySet.has(date)) return false
  return jalaliDashWeekdayName(date) !== 'جمعه'
}

/** نزدیک‌ترین روز کاریِ «زودتر یا خودِ» تاریخ داده‌شده (قاعده اعتبار: هرگز دیرتر از موعد) */
function backToWorking(date: string, holidaySet: Set<string>): string {
  let d = date
  for (let back = 0; back <= 40; back++) {
    if (isWorking(d, holidaySet)) return d
    d = addDaysJalaliDash(date, -(back + 1))
  }
  return date
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!CALC_ROLES.includes(user.role)) return fail('دسترسی به پیشنهاد هوشمند چک ندارید', 403)

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return fail('درخواست نامعتبر است')

  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount <= 0) return fail('مبلغ را وارد کنید')
  const days = Math.max(1, Math.min(365, Math.round(Number(body.days) || 45)))
  const fromRaw = String(body.from ?? '').trim().replace(/\//g, '-')
  const from = DASH_DATE.test(fromRaw) ? fromRaw : todayJalaliDash()

  const [limits, split] = await Promise.all([readLimits(), readSplit()])
  const target = addDaysJalaliDash(from, days)
  const holidaySet = await loadWorkingDays(from, target)

  // ── ۱) گزینه پرداخت کامل — بهترین روز کاریِ ≤ موعد ──
  const fullDate = backToWorking(target, holidaySet)
  const fullWarnings: string[] = []
  if (limits.day > 0 && amount > limits.day) fullWarnings.push(`مبلغ از سقف روزانه (${limits.day.toLocaleString('en-US')} ریال) بیشتر است — پرداخت کامل در یک روز ممکن نیست`)
  if (limits.week > 0 && amount > limits.week) fullWarnings.push(`مبلغ از سقف هفتگی (${limits.week.toLocaleString('en-US')} ریال) بیشتر است`)
  const full: SplitOption = {
    n: 1,
    cheques: [{ date: fullDate, long: jalaliDashToLong(fullDate), weekday: jalaliDashWeekdayName(fullDate), amount, deltaFromTarget: diffDaysJalali(fullDate.replace(/-/g, '/'), target.replace(/-/g, '/')) }],
    maxPerDay: amount,
    sum: amount,
    warnings: fullWarnings,
    ok: fullWarnings.length === 0,
  }

  // ── ۲) تعیین طبقه و حداکثر تعداد چک ──
  const tier: 'light' | 'medium' | 'heavy' = amount >= split.heavyThreshold ? 'heavy' : amount >= split.mediumThreshold ? 'medium' : 'light'
  const maxN = tier === 'heavy' ? split.heavyMax : tier === 'medium' ? split.mediumMax : 1
  const tierLabel = tier === 'heavy' ? 'سنگین' : tier === 'medium' ? 'متوسط' : 'سبک'

  // ── ۳) ساخت گزینه‌ها برای n = ۲..maxN ──
  const all: SplitOption[] = []
  for (let n = 2; n <= maxN; n++) {
    // فاصلهٔ معقول: هر چک ≥ ۷ روز از قبلی و اولین ≥ ۷ روز بعد از صدور
    if (days < 7 * n) {
      all.push({ n, cheques: [], maxPerDay: 0, sum: 0, warnings: ['پنجرهٔ زمانی برای این تعداد چک با فاصلهٔ معقول جا نمی‌شود'], ok: false })
      continue
    }
    const warnings: string[] = []
    // تاریخ‌های ایده‌آل: ۷ + (days-۷) × i/n — چک آخر روی موعد
    const ideals: number[] = []
    for (let i = 1; i <= n; i++) ideals.push(Math.round(7 + ((days - 7) * i) / n))
    // نرمال‌سازی: صعودی اکید با فاصلهٔ ≥ ۷
    for (let i = 1; i < n; i++) if (ideals[i] <= ideals[i - 1] + 6) ideals[i] = ideals[i - 1] + 7
    if (ideals[n - 1] > days) ideals[n - 1] = days
    // هر تاریخ → نزدیک‌ترین روز کاری زودتر؛ بدون تداخل
    const dates: string[] = []
    for (let i = 0; i < n; i++) {
      let d = backToWorking(addDaysJalaliDash(from, ideals[i]), holidaySet)
      while (dates.length && d >= dates[dates.length - 1]) d = addDaysJalaliDash(d, -1)
      dates.push(d)
    }
    // مبالغ: سهم پایه رندشده + آخرین چک = باقی‌مانده (جمع دقیقاً برابر مبلغ)
    const base = Math.max(split.roundTo, Math.floor(amount / n / split.roundTo) * split.roundTo)
    const amounts = Array.from({ length: n }, (_, i) => (i === n - 1 ? amount - base * (n - 1) : base))
    if (amounts[n - 1] < split.roundTo) {
      // باقی‌ماندهٔ آخر خیلی کم شد — از چک قبلی یک رند قرض بگیر
      amounts[n - 2] -= split.roundTo
      amounts[n - 1] += split.roundTo
    }
    const cheques: SplitCheque[] = dates.map((d, i) => ({
      date: d,
      long: jalaliDashToLong(d),
      weekday: jalaliDashWeekdayName(d),
      amount: amounts[i],
      deltaFromTarget: diffDaysJalali(d.replace(/-/g, '/'), target.replace(/-/g, '/')),
    }))
    // سقف روزانه
    let maxPerDay = 0
    for (const c of cheques) maxPerDay = Math.max(maxPerDay, c.amount)
    if (limits.day > 0 && maxPerDay > limits.day) warnings.push(`سهم هر چک از سقف روزانه (${limits.day.toLocaleString('en-US')} ریال) بیشتر است`)
    // سقف هفتگی — جمع هر پنجرهٔ ۷روزه از تاریخ شروع
    if (limits.week > 0) {
      const weekSums = new Map<number, number>()
      for (const c of cheques) {
        const wk = Math.floor(Math.max(0, diffDaysJalali(from.replace(/-/g, '/'), c.date.replace(/-/g, '/'))) / 7)
        weekSums.set(wk, (weekSums.get(wk) || 0) + c.amount)
      }
      const worst = Math.max(...weekSums.values())
      if (worst > limits.week) warnings.push(`در یک هفته بیش از سقف هفتگی (${limits.week.toLocaleString('en-US')} ریال) می‌نشیند (اوج: ${Math.round(worst).toLocaleString('en-US')})`)
    }
    all.push({ n, cheques, maxPerDay, sum: cheques.reduce((s, c) => s + c.amount, 0), warnings, ok: warnings.length === 0 })
  }

  // ── ۴) انتخاب بهترین‌ها برای نمایش: کوچک‌ترین n سالم، n=۳، و بیشینه ──
  const candidates: SplitOption[] = []
  const validSorted = all.filter((o) => o.ok).sort((a, b) => a.n - b.n)
  if (validSorted[0]) candidates.push(validSorted[0])
  const three = all.find((o) => o.n === 3 && o.ok)
  if (three && !candidates.some((c) => c.n === 3)) candidates.push(three)
  const maxOpt = all.find((o) => o.n === maxN && o.ok && o.n > 3)
  if (maxOpt && !candidates.some((c) => c.n === maxOpt.n)) candidates.push(maxOpt)
  if (!candidates.length && all.length) {
    // هیچ گزینه‌ای سالم نیست — بهترین تلاش را با هشدار نشان بده
    const best = [...all].sort((a, b) => a.warnings.length - b.warnings.length || a.n - b.n)[0]
    if (best) candidates.push(best)
  }

  return ok({
    from,
    days,
    amount,
    target: { date: target, long: jalaliDashToLong(target), weekday: jalaliDashWeekdayName(target) },
    tier,
    tierLabel,
    maxN,
    full,
    options: candidates,
    settings: { limits: limits ?? DEFAULT_LIMITS, split: split ?? DEFAULT_SPLIT } as { limits: ChequeLimits; split: ChequeSplit },
    note: 'قاعدهٔ اعتبار: هیچ چکی دیرتر از موعد نیست؛ تاریخ‌های غیرکاری به نزدیک‌ترین روز کاریِ زودتر برمی‌گردند. مبالغ به رند تمیز گرد می‌شوند و جمع دقیقاً برابر مبلغ است.',
  })
}
