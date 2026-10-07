/**
 * موتور CRM سمت سرور — RFM (Hughes 1994) + تولدها + تطبیق مخاطبان کمپین
 * RFM: R = روز از آخرین بازدید، F = خرید در ۹۰ روز، M = میانگین سبد.
 * نمرهٔ ۱–۵ برای هر بعد؛ سگمنت‌ها: VIP | LOYAL | NEW | AT_RISK | DORMANT | REGULAR.
 * CLV ساده و قابل توضیح برای مالک: میانگین سبد × بازدید سالانه × حاشیهٔ ۲۵٪ × افق ۳ سال.
 */
import { db } from '@/lib/db'
import { safeParse } from '@/lib/api-helpers'
import {
  addDaysIso,
  daysBetween,
  jMonthLength,
  toJalaliParts,
  todayIso,
  weekdayName,
} from '@/lib/jalali'

export const MARGIN_ESTIMATE = 0.25 // حاشیهٔ سود تخمینی خرده‌فروشی مواد غذایی — در UI توضیح داده می‌شود

export type Segment = 'VIP' | 'LOYAL' | 'NEW' | 'AT_RISK' | 'DORMANT' | 'REGULAR'

export type Rfm = {
  rDays: number
  f90: number
  mAvg: number
  rScore: number
  fScore: number
  mScore: number
  segment: Segment
  clv: number
  visits: number
  lastVisit: string // iso | ''
  firstVisit: string // iso | ''
  medianGapDays: number
  visitsPerMonth: number
  visitsPerYear: number
  preferredWeekday: string
  topProducts: { name: string; count: number }[]
}

type VisitAgg = {
  visitDays: Set<string>
  amounts: number[]
  productCounts: Map<string, number>
}

const isoOf = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function scoreR(rDays: number, hasVisit: boolean): number {
  if (!hasVisit) return 1
  if (rDays <= 7) return 5
  if (rDays <= 15) return 4
  if (rDays <= 30) return 3
  if (rDays <= 60) return 2
  return 1
}

function scoreF(f90: number): number {
  if (f90 <= 0) return 1
  if (f90 === 1) return 2
  if (f90 <= 3) return 3
  if (f90 <= 6) return 4
  return 5
}

/** نمرهٔ M: پنج‌کُهم نسبی درون مجموعهٔ مشتریان (کلاسیک RFM) — بدون خرید = ۱.
 *  دیتاست کوچک (<۵ خریدار): نرمال‌سازی rank تا مشتریِ باارزش واقعی حذف نشود. */
function scoreM(mAvg: number, values: number[]): number {
  if (mAvg <= 0) return 1
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  if (n < 5) {
    const rank = sorted.indexOf(mAvg)
    return Math.min(5, Math.max(1, Math.round((rank / Math.max(1, n - 1)) * 4) + 1))
  }
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
  let s = 1
  for (const t of [q(0.2), q(0.4), q(0.6), q(0.8)]) if (mAvg > t) s++
  return Math.min(5, Math.max(1, s))
}

/** محاسبهٔ RFM همهٔ مشتریان از CustomerEvent (VISIT/PURCHASE) + PreOrderها — دیتاست کوچک، per-request سبک است */
export async function computeRfmMap(): Promise<Map<string, Rfm>> {
  const today = todayIso()
  const since90 = new Date(addDaysIso(-90) + 'T00:00:00')

  const [customers, events, preorders] = await Promise.all([
    db.customer.findMany({ select: { id: true, tier: true, joinedAt: true, lastVisitAt: true, createdAt: true } }),
    db.customerEvent.findMany({ where: { type: { in: ['VISIT', 'PURCHASE'] } } }),
    db.preOrder.findMany({ where: { status: { not: 'CANCELLED' }, customerId: { not: null } } }),
  ])

  const agg = new Map<string, VisitAgg>()
  const ensure = (id: string) => {
    let a = agg.get(id)
    if (!a) {
      a = { visitDays: new Set(), amounts: [], productCounts: new Map() }
      agg.set(id, a)
    }
    return a
  }

  for (const e of events) {
    if (!e.customerId) continue
    const a = ensure(e.customerId)
    const day = isoOf(e.at)
    if (e.type === 'VISIT' || e.type === 'PURCHASE') a.visitDays.add(day)
    if (e.type === 'PURCHASE') {
      const p = safeParse<{ amount?: number; productNames?: string[] }>(e.payload, {})
      if (p.amount && p.amount > 0) a.amounts.push(p.amount)
      for (const n of p.productNames || []) a.productCounts.set(n, (a.productCounts.get(n) || 0) + 1)
    }
  }

  for (const po of preorders) {
    if (!po.customerId) continue
    const a = ensure(po.customerId)
    a.visitDays.add(isoOf(po.createdAt))
    if (po.total > 0) a.amounts.push(po.total)
    for (const it of safeParse<{ name?: string; qty?: number }[]>(po.items, [])) {
      if (it?.name) a.productCounts.set(it.name, (a.productCounts.get(it.name) || 0) + (it.qty || 1))
    }
  }

  // نمرهٔ M به پنج‌کُهم نسبی نیاز دارد — اول mAvg خام همه را حساب می‌کنیم
  const raw = new Map<string, { a: VisitAgg; mAvg: number; regDay: string }>()
  const mValues: number[] = []
  for (const c of customers) {
    const a = ensure(c.id)
    const mAvg = a.amounts.length ? Math.round(a.amounts.reduce((s, x) => s + x, 0) / a.amounts.length) : 0
    if (mAvg > 0) mValues.push(mAvg)
    raw.set(c.id, { a, mAvg, regDay: isoOf(c.joinedAt || c.createdAt) })
  }

  const result = new Map<string, Rfm>()
  for (const c of customers) {
    const r = raw.get(c.id)!
    const a = r.a
    const visitDays = [...a.visitDays].sort()
    const visits = visitDays.length
    const eventLast = visitDays[visitDays.length - 1] || ''
    const lastVisit = [eventLast, c.lastVisitAt || ''].filter(Boolean).sort().pop() || ''
    const firstVisit = visitDays[0] || r.regDay
    const hasVisit = visits > 0

    const rDays = lastVisit ? Math.max(0, daysBetween(today, lastVisit)) : Math.max(0, daysBetween(today, r.regDay))
    const f90 = visitDays.filter((d) => d >= isoOf(since90)).length
    const mAvg = r.mAvg

    const rScore = scoreR(rDays, hasVisit)
    const fScore = scoreF(f90)
    const mScore = scoreM(mAvg, mValues)

    const gaps: number[] = []
    for (let i = 1; i < visitDays.length; i++) {
      const g = daysBetween(visitDays[i], visitDays[i - 1])
      if (g > 0) gaps.push(g)
    }
    const medianGapDays = median(gaps)

    // سگمنت — ترتیب مهم است: غیبت طولانی → خطر جدا شدن → VIP → تازه‌وارد → وفادار
    let segment: Segment = 'REGULAR'
    if (rDays > 90) segment = 'DORMANT'
    else if (visits >= 2 && medianGapDays >= 7 && rDays > 14 && rDays > 2 * medianGapDays) segment = 'AT_RISK'
    else if (visits >= 1 && mScore === 5 && rDays <= 30) segment = 'VIP'
    else if (rDays <= 30 && !hasVisit) segment = 'NEW'
    else if (daysBetween(today, firstVisit) <= 30 && hasVisit && visits <= 2) segment = 'NEW'
    else if (f90 >= 2 && rDays <= 30) segment = 'LOYAL'

    // CLV ساده: میانگین سبد × بازدید در سال × حاشیه ۲۵٪ × ۳ سال
    const tenureDays = Math.max(1, daysBetween(today, firstVisit))
    const visitsPerYear = tenureDays >= 90 ? (visits * 365) / tenureDays : f90 * 4
    const clv = Math.round(mAvg * visitsPerYear * MARGIN_ESTIMATE * 3)

    const weekdayCounts = new Map<string, number>()
    for (const d of visitDays) {
      const w = weekdayName(d)
      weekdayCounts.set(w, (weekdayCounts.get(w) || 0) + 1)
    }
    const preferredWeekday = [...weekdayCounts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || '—'

    const topProducts = [...a.productCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((x, y) => y.count - x.count)
      .slice(0, 5)

    result.set(c.id, {
      rDays,
      f90,
      mAvg,
      rScore,
      fScore,
      mScore,
      segment,
      clv,
      visits,
      lastVisit,
      firstVisit,
      medianGapDays,
      visitsPerMonth: Math.round((visits / Math.max(1, tenureDays / 30)) * 10) / 10,
      visitsPerYear: Math.round(visitsPerYear * 10) / 10,
      preferredWeekday,
      topProducts,
    })
  }
  return result
}

export type TargetFilter = {
  tiers?: string[]
  minVisits?: number
  inactiveDays?: number
  birthdaysNextDays?: number
}

export type BirthdayHit = {
  id: string
  name: string
  phone: string
  birthday: string
  daysUntil: number
  age: number
  hasGift: boolean
  tier: string
  segment?: Segment
}

/** تولدهای «ماه/روز» جلالی در پنجرهٔ N روز آینده — مقایسه روی سالِ جاری (با مهار روزِ اسفند در سال کبیسه‌ناپذیر) */
export async function upcomingBirthdays(windowDays = 14): Promise<BirthdayHit[]> {
  const today = todayIso()
  const { jy } = toJalaliParts(today)
  const slots = new Map<string, number>() // 'm-d' → daysUntil
  for (let i = 0; i < windowDays; i++) {
    const p = toJalaliParts(addDaysIso(i, today))
    const len = jMonthLength(jy, p.jm)
    slots.set(`${p.jm}-${Math.min(p.jd, len)}`, i)
  }
  const yearStart = `${jy}-01-01`
  const gifts = await db.customerEvent.findMany({ where: { type: 'BIRTHDAY_GIFT', at: { gte: new Date(yearStart + 'T00:00:00') } }, orderBy: { at: 'asc' } })
  const giftBy = new Map<string, boolean>() // آخرین رخداد هدیهٔ این سال برنده است (undo با رخداد جدید)
  for (const g of gifts) {
    const p = safeParse<{ undo?: boolean }>(g.payload, {})
    giftBy.set(g.customerId, !p.undo)
  }

  const customers = await db.customer.findMany()
  const hits: BirthdayHit[] = []
  for (const c of customers) {
    if (!c.birthday || !/^\d{4}-\d{2}-\d{2}$/.test(c.birthday)) continue
    const bm = Number(c.birthday.slice(5, 7))
    let bd = Number(c.birthday.slice(8, 10))
    if (!bm || !bd) continue
    bd = Math.min(bd, jMonthLength(jy, bm)) // ۳۰ اسفند در سال غیرکبیسه → ۲۹ اسفند
    const du = slots.get(`${bm}-${bd}`)
    if (du === undefined) continue
    hits.push({
      id: c.id,
      name: c.name,
      phone: c.phone,
      birthday: c.birthday,
      daysUntil: du,
      age: jy - Number(c.birthday.slice(0, 4)),
      hasGift: giftBy.get(c.id) || false,
      tier: c.tier,
    })
  }
  hits.sort((a, b) => a.daysUntil - b.daysUntil)
  return hits
}

/** تطبیق مخاطبان کمپین با targetFilter — بر پایهٔ RFM محاسبه‌شده */
export function matchTargets(
  filter: TargetFilter,
  customers: { id: string; tier: string; consentMarketing: boolean }[],
  rfm: Map<string, Rfm>,
  birthdays?: BirthdayHit[]
): { ids: string[]; consentCount: number } {
  const bdayIds = new Set<string>()
  if (filter.birthdaysNextDays != null) {
    for (const b of birthdays || []) if (b.daysUntil <= filter.birthdaysNextDays) bdayIds.add(b.id)
  }
  const ids: string[] = []
  for (const c of customers) {
    const r = rfm.get(c.id)
    if (filter.tiers?.length) {
      const seg = r?.segment
      if (!(seg && filter.tiers.includes(seg)) && !filter.tiers.includes(c.tier)) continue
    }
    if (filter.minVisits != null && filter.minVisits > 0 && (r?.visits || 0) < filter.minVisits) continue
    if (filter.inactiveDays != null && filter.inactiveDays > 0 && (r?.rDays || 0) < filter.inactiveDays) continue
    if (filter.birthdaysNextDays != null && !bdayIds.has(c.id)) continue
    ids.push(c.id)
  }
  const consentCount = ids.filter((id) => customers.find((c) => c.id === id)?.consentMarketing).length
  return { ids, consentCount }
}
