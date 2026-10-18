import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/products/search
 *  - ?barcode=X → single product {id,name,lastBuyPrice,...} (price-check scan flow)
 *  - ?q=text    → {products:[{id,name,unit,sellPrice,lastBuyPrice,barcode}]} (pickers)
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const sp = req.nextUrl.searchParams
  const barcode = (sp.get('barcode') || '').trim()

  if (barcode) {
    const all = await db.product.findMany({
      where: { OR: [{ code: barcode }, { name: { contains: barcode } }] },
      take: 5,
      select: { id: true, name: true, unit: true, sellPrice: true, lastBuyPrice: true, code: true, barcodesJson: true },
    })
    const match =
      all.find((p) => p.code === barcode) ??
      all.find((p) => safeJson<string[]>(p.barcodesJson, []).includes(barcode)) ??
      null
    if (!match) return fail('کالایی با این بارکد یافت نشد', 404)
    return ok({
      id: match.id,
      name: match.name,
      unit: match.unit,
      sellPrice: match.sellPrice,
      lastBuyPrice: match.lastBuyPrice,
      barcode: match.code,
    })
  }

  const q = (sp.get('q') || '').trim()
  const limit = Math.max(1, Math.min(30, Math.round(Number(sp.get('limit')) || 20)))

  if (!q) return ok({ products: [] })

  const products = await db.product.findMany({
    where: { OR: [{ name: { contains: q } }, { code: q }] },
    orderBy: [{ name: 'asc' }],
    take: limit,
    select: { id: true, name: true, unit: true, sellPrice: true, lastBuyPrice: true, code: true },
  })

  return ok({
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      sellPrice: p.sellPrice,
      lastBuyPrice: p.lastBuyPrice,
      barcode: p.code,
    })),
  })
}
