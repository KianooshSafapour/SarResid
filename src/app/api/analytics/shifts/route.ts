import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * R16 — GET /api/analytics/shifts — تحلیل دو-شیفته و ساعتی.
 * صبح = ۷ تا ۱۴:۵۹ · عصر = ۱۵ تا ۲۲ (ساعت سرور = تهران).
 * منبع: سفارش‌ها، فاکتورهای سودسنج و مرجوعی‌ها (با ساعتِ ثبت).
 * خروجی:
 *   today    — دو شیفت امروز (تعداد/مبلغ هر کدام)
 *   hourly   — ۲۴ ساعت امروز و دیروز (تعداد/مبلغ) برای مقایسهٔ ساعتی
 *   weekly   — ۷ روز اخیر به تفکیک شیفت + همان هفتهٔ قبل (مقایسه)
 *   diff     — تغییر نسبت به هفتهٔ قبل
 */
const SHIFT_MORNING = { label: 'صبح', from: 7, to: 14 } // 7:00–14:59
const SHIFT_AFTERNOON = { label: 'عصر', from: 15, to: 22 }

function shiftOf(d: Date): 'M' | 'A' | null {
  const h = d.getHours()
  if (h >= SHIFT_MORNING.from && h <= SHIFT_MORNING.to) return 'M'
  if (h >= SHIFT_AFTERNOON.from && h <= SHIFT_AFTERNOON.to) return 'A'
  return null
}

interface Bucket {
  count: number
  amount: number
}
const empty = (): Bucket => ({ count: 0, amount: 0 })
function add(b: Bucket, amount: number) {
  b.count++
  b.amount += amount
}

export async function GET(_req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const since = new Date()
  since.setDate(since.getDate() - 14)
  since.setHours(0, 0, 0, 0)

  const [orders, invoices, returns] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: since }, status: { not: 'CANCELLED' } },
      select: { createdAt: true, totalAmount: true },
    }),
    db.marginInvoice.findMany({
      where: { createdAt: { gte: since }, status: { not: 'cancelled' } },
      select: { createdAt: true, items: { select: { totalCost: true } } },
    }),
    db.returnRequest.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, totalAmount: true } }),
  ])

  interface Event { at: Date; amount: number; kind: 'order' | 'invoice' | 'return' }
  const events: Event[] = [
    ...orders.map((o) => ({ at: o.createdAt, amount: o.totalAmount ?? 0, kind: 'order' as const })),
    ...invoices.map((i) => ({ at: i.createdAt, amount: i.items.reduce((s, it) => s + it.totalCost, 0), kind: 'invoice' as const })),
    ...returns.map((r) => ({ at: r.createdAt, amount: r.totalAmount ?? 0, kind: 'return' as const })),
  ]

  const dayKey = (d: Date) => d.toISOString().slice(0, 10)
  const todayKey = dayKey(new Date())
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = dayKey(yesterday)

  /* ── امروز: دو شیفت ── */
  const today = { M: { label: 'شیفت صبح', ...empty() }, A: { label: 'شیفت عصر', ...empty() } }
  for (const e of events) {
    if (dayKey(e.at) !== todayKey) continue
    const s = shiftOf(e.at)
    if (s) add(today[s], Math.round(e.amount))
  }

  /* ── ساعتی: امروز و دیروز ── */
  const hourly: { hour: number; today: Bucket; yesterday: Bucket }[] = []
  const hourBuckets = new Map<number, { t: Bucket; y: Bucket }>()
  for (let h = 0; h < 24; h++) hourBuckets.set(h, { t: empty(), y: empty() })
  for (const e of events) {
    const k = dayKey(e.at)
    const b = hourBuckets.get(e.at.getHours())
    if (!b) continue
    if (k === todayKey) add(b.t, Math.round(e.amount))
    else if (k === yesterdayKey) add(b.y, Math.round(e.amount))
  }
  for (let h = 0; h < 24; h++) {
    const b = hourBuckets.get(h)!
    hourly.push({ hour: h, today: b.t, yesterday: b.y })
  }

  /* ── ۷ روز اخیر به تفکیک شیفت + همان هفتهٔ قبل ── */
  const weekAgg: { date: string; M: Bucket; A: Bucket }[] = []
  const prevAgg: { date: string; M: Bucket; A: Bucket }[] = []
  const weekMap = new Map<string, { M: Bucket; A: Bucket; prevM: Bucket; prevA: Bucket }>()
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const k = dayKey(d)
    weekMap.set(k, { M: empty(), A: empty(), prevM: empty(), prevA: empty() })
  }
  const shiftOfDate = (d: Date) => {
    // همان روز هفتهٔ قبل
    const prev = new Date(d)
    prev.setDate(prev.getDate() - 7)
    return { k: dayKey(d), pk: dayKey(prev) }
  }
  for (const e of events) {
    const s = shiftOf(e.at)
    if (!s) continue
    const k = dayKey(e.at)
    const wk = weekMap.get(k)
    if (wk) add(s === 'M' ? wk.M : wk.A, Math.round(e.amount))
    const prev = new Date(e.at)
    prev.setDate(prev.getDate() - 7)
    const pk = dayKey(prev)
    const wp = weekMap.get(pk)
    if (wp) add(s === 'M' ? wp.prevM : wp.prevA, Math.round(e.amount))
  }
  for (const [k, v] of [...weekMap.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))) {
    weekAgg.push({ date: k, M: v.M, A: v.A })
    prevAgg.push({ date: k, M: v.prevM, A: v.prevA })
  }
  const weekTot = weekAgg.reduce((s, d) => s + d.M.count + d.A.count, 0)
  const weekTotAmt = weekAgg.reduce((s, d) => s + d.M.amount + d.A.amount, 0)
  const prevTot = prevAgg.reduce((s, d) => s + d.M.count + d.A.count, 0)
  const prevTotAmt = prevAgg.reduce((s, d) => s + d.M.amount + d.A.amount, 0)
  const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null)

  return ok({
    today,
    hourly,
    week: weekAgg,
    weekPrev: prevAgg,
    compare: {
      countPct: pct(weekTot, prevTot),
      amountPct: pct(weekTotAmt, prevTotAmt),
      thisWeek: { count: weekTot, amount: weekTotAmt },
      lastWeek: { count: prevTot, amount: prevTotAmt },
    },
  })
}
