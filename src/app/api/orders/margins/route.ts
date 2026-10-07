import { db } from '@/lib/db'
import { getSessionUser, json } from '@/lib/api-helpers'
import { canViewApi } from '@/lib/rbac'

/** آخرین حاشیه سود هر کالا از سفارش‌های یک تأمین‌کننده خاص —
 *  «می‌توانیم همان کالا را از منابع مختلف بخریم؛ حاشیهٔ هر منبع را ببین» */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!(await canViewApi(me, 'orders'))) return json({ error: 'ابتدا وارد شوید' }, 401)
  const providerId = new URL(req.url).searchParams.get('providerId')
  if (!providerId) return json({ error: 'providerId الزامی است' }, 400)

  const orders = await db.order.findMany({
    where: { providerId, status: { notIn: ['DRAFT', 'CANCELLED'] } },
    orderBy: { createdAt: 'desc' },
    take: 40,
  })
  if (orders.length === 0) return json({ margins: {}, orderCount: 0 })
  const items = await db.orderItem.findMany({
    where: { orderId: { in: orders.map((o) => o.id) } },
  })
  const orderById = new Map(orders.map((o) => [o.id, o]))
  const map: Record<string, { marginPct: number; buyPrice: number; sellPrice: number; orderCode: string; at: string }> = {}
  const missingSell: string[] = []
  for (const it of items) {
    const o = orderById.get(it.orderId)
    if (!o || map[it.productId]) continue // newest order wins (orders sorted desc)
    const buy = it.unitBuyPrice || 0
    const sell = it.printedPrice || 0
    if (!sell && !missingSell.includes(it.productId)) missingSell.push(it.productId)
    const marginPct = buy > 0 && sell > 0 ? ((sell - buy) / buy) * 100 : -1 // -1 = نامشخص
    map[it.productId] = { marginPct: Math.round(marginPct * 10) / 10, buyPrice: buy, sellPrice: sell, orderCode: o.code, at: o.createdAt.toISOString() }
  }
  // برای اقلام بدون قیمت چاپ‌شده، قیمت فروش فعلی محصول را جایگزین کن
  if (missingSell.length) {
    const prods = await db.product.findMany({ where: { id: { in: missingSell } }, select: { id: true, sellPrice: true } })
    for (const p of prods) {
      const m = map[p.id]
      if (m && m.sellPrice === 0 && p.sellPrice > 0 && m.buyPrice > 0) {
        m.sellPrice = p.sellPrice
        m.marginPct = Math.round(((p.sellPrice - m.buyPrice) / m.buyPrice) * 1000) / 10
      }
    }
  }
  return json({ margins: map, orderCount: orders.length })
}
