import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { formatJalaliShort } from '@/lib/jalali'

const ACCESS = ['GM', 'OM', 'ACC', 'OWNER', 'PM']

function tone(margin: number) {
  if (margin < 10) return 'red'
  if (margin < 25) return 'yellow'
  return 'green'
}

/** consecutive full-coverage days of printed-price checking, read from daily briefing archive.
 * if today isn't archived-complete yet, the streak counts from yesterday — mid-day never zeroes the flame. */
async function computeStreak(): Promise<number> {
  const snaps = await db.briefingSnapshot.findMany({
    orderBy: { forDate: 'desc' },
    take: 60,
    select: { forDate: true, data: true },
  })
  const completeByDate = new Map<string, boolean>()
  for (const s of snaps) {
    let complete = false
    try {
      const d = JSON.parse(s.data) as { priceCheck?: { remaining?: number } }
      complete = typeof d?.priceCheck?.remaining === 'number' && d.priceCheck.remaining === 0
    } catch {
      complete = false
    }
    completeByDate.set(s.forDate, complete)
  }
  // walk backwards starting from today; if today is not complete yet, start from yesterday
  let streak = 0
  const cursor = new Date()
  for (let i = 0; i < 60; i++) {
    const day = cursor.toISOString().slice(0, 10)
    const dayComplete = completeByDate.get(day)
    if (i === 0 && dayComplete !== true) {
      // today not finished — the flame survives, counting continues from yesterday
    } else if (dayComplete !== true) {
      break
    } else {
      streak++
    }
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/** GET /api/price-check — board of every active product: latest real cost, printed price, margin, verification state */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!ACCESS.includes(me.role)) return fail('دسترسی ندارید', 403)

  const today = new Date().toISOString().slice(0, 10)
  const products = await db.product.findMany({ where: { active: true }, orderBy: { name: 'asc' } })

  // latest buy prices per product from order lines of the last 120 days (non-cancelled)
  const since = new Date()
  since.setDate(since.getDate() - 120)
  const orders = await db.order.findMany({
    where: { createdAt: { gte: since }, NOT: { status: 'CANCELLED' } },
    select: { id: true, createdAt: true },
  })
  const orderIds = orders.map((o) => o.id)
  const orderDate = new Map<string, string>()
  for (const o of orders) orderDate.set(o.id, o.createdAt.toISOString())
  const items = orderIds.length
    ? await db.orderItem.findMany({
        where: { orderId: { in: orderIds }, unitBuyPrice: { gt: 0 } },
        select: { productId: true, unitBuyPrice: true, orderId: true },
      })
    : []
  // chronological — the LAST price a product was bought at is the real current cost
  items.sort((a, b) => (orderDate.get(a.orderId) || '').localeCompare(orderDate.get(b.orderId) || ''))

  // per product: distinct price history (chronological by order line order)
  const priceHist = new Map<string, number[]>()
  for (const it of items) {
    if (!it.productId) continue
    const arr = priceHist.get(it.productId) || []
    if (!arr.includes(it.unitBuyPrice)) arr.push(it.unitBuyPrice)
    priceHist.set(it.productId, arr)
  }

  // cost trend points (dated, deduped consecutive, last 8) for the row sparkline
  const costTrend = new Map<string, { price: number; date: string }[]>()
  for (const it of items) {
    if (!it.productId) continue
    const date = orderDate.get(it.orderId)
    if (!date) continue
    const arr = costTrend.get(it.productId) || []
    const last = arr[arr.length - 1]
    if (!last || last.price !== it.unitBuyPrice) arr.push({ price: it.unitBuyPrice, date })
    costTrend.set(it.productId, arr)
  }

  const rows = products.map((p) => {
    const hist = priceHist.get(p.id) || []
    const cost = hist.length ? hist[hist.length - 1] : p.buyPrice
    const prevCost = hist.length > 1 ? hist[hist.length - 2] : null
    const deltaPct = prevCost && prevCost > 0 ? Math.round(((cost - prevCost) / prevCost) * 1000) / 10 : null
    const margin = cost > 0 && p.sellPrice > 0 ? Math.round(((p.sellPrice - cost) / cost) * 1000) / 10 : null
    const daysSince = p.lastPriceCheck
      ? Math.round((new Date(today + 'T12:00:00').getTime() - new Date(p.lastPriceCheck + 'T12:00:00').getTime()) / 86400000)
      : null
    const trend = costTrend.get(p.id) || []
    const trendPts = trend.slice(-8)
    return {
      id: p.id,
      name: p.name,
      barcodes: JSON.parse(p.barcodes || '[]') as string[],
      category: p.category,
      unit: p.unit,
      stock: p.stock,
      sellPrice: p.sellPrice,
      cost,
      deltaPct,
      margin,
      tone: margin === null ? 'none' : tone(margin),
      lastPriceCheck: p.lastPriceCheck,
      lastCheckedPrice: p.lastCheckedPrice,
      daysSince,
      checkedToday: p.lastPriceCheck === today,
      costHistory: trendPts.length >= 2
        ? trendPts.map((t) => ({ price: t.price, j: formatJalaliShort(t.date) }))
        : [],
    }
  })

  const margins = rows.map((r) => r.margin).filter((m): m is number => m !== null)
  const streak = await computeStreak()
  const summary = {
    total: rows.length,
    checkedToday: rows.filter((r) => r.checkedToday).length,
    remaining: rows.filter((r) => !r.checkedToday).length,
    // tone counts cover ALL rows — a repriced item selling at a loss must stay visible
    red: rows.filter((r) => r.tone === 'red').length,
    yellow: rows.filter((r) => r.tone === 'yellow').length,
    green: rows.filter((r) => r.tone === 'green').length,
    avgMargin: margins.length ? Math.round((margins.reduce((s, m) => s + m, 0) / margins.length) * 10) / 10 : 0,
    streak,
  }

  return json({ rows, summary, today })
}

/** POST /api/price-check — verify printed price(s) or register a new printed price
 * body: { productIds: string[], action: 'verify' | 'reprice', sellPrice?: number } */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!ACCESS.includes(me.role)) return fail('دسترسی ندارید', 403)

  const body = await req.json().catch(() => null)
  const ids: string[] = Array.isArray(body?.productIds) ? body.productIds.filter((x: unknown) => typeof x === 'string') : []
  const action: string = body?.action || 'verify'
  if (!ids.length) return fail('کالایی انتخاب نشده است')
  if (!['verify', 'reprice'].includes(action)) return fail('عملیات نامعتبر است')

  const today = new Date().toISOString().slice(0, 10)
  const results: { id: string; sellPrice: number }[] = []

  for (const id of ids) {
    const p = await db.product.findUnique({ where: { id } })
    if (!p) continue
    const newPrice = action === 'reprice' ? Math.max(0, Number(body?.sellPrice ?? 0)) : p.sellPrice
    if (action === 'reprice' && (!newPrice || newPrice <= 0)) return fail('قیمت جدید نامعتبر است')
    await db.product.update({
      where: { id },
      data: {
        sellPrice: newPrice,
        lastPriceCheck: today,
        lastCheckedPrice: newPrice,
      },
    })
    await logActivity(
      me,
      action === 'reprice' ? 'ثبت قیمت چاپ‌شده جدید' : 'کنترل قیمت چاپ‌شده',
      'product',
      id,
      `${p.name} — قیمت ${Math.round(newPrice).toLocaleString('en-US')} تومان`
    )
    results.push({ id, sellPrice: newPrice })
  }

  const streak = await computeStreak()
  return json({ ok: true, updated: results, streak })
}
