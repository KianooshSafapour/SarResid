import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canPlanogram } from '@/lib/access'

export const dynamic = 'force-dynamic'

/**
 * GET /api/store/product-search
 *  - ?categories=1              → {categories:[main group names]}
 *  - ?category=X&sort=price&limit=N → {items:[{id,name,sellPrice,...}]}
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canPlanogram(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const sp = req.nextUrl.searchParams

  if (sp.get('categories') === '1') {
    const groups = await db.product.groupBy({ by: ['mainGroup'], _count: { mainGroup: true }, orderBy: { _count: { mainGroup: 'desc' } } })
    return ok({ categories: groups.map((g) => g.mainGroup).filter((g): g is string => !!g) })
  }

  const category = sp.get('category') || ''
  const limit = Math.max(1, Math.min(120, Math.round(Number(sp.get('limit')) || 24)))
  const sort = sp.get('sort') || ''

  const where = category ? { mainGroup: category } : {}
  const orderBy = sort === 'price' ? { sellPrice: 'desc' as const } : { name: 'asc' as const }

  const items = await db.product.findMany({
    where,
    orderBy,
    take: limit,
    select: { id: true, name: true, unit: true, sellPrice: true, lastBuyPrice: true, code: true },
  })

  return ok({
    items: items.map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      sellPrice: p.sellPrice,
      lastBuyPrice: p.lastBuyPrice,
      barcode: p.code,
    })),
  })
}
