import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { cleanName } from '@/lib/shop'

export const dynamic = 'force-dynamic'

/** GET /api/shop-admin/products?q= — جست‌وجوی کالا برای مدیریت تصاویر/دسته */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN', 'PM', 'MERCH'].includes(user.role)) return fail('دسترسی ندارید', 403)

  const q = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 60)
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1') || 1)
  const pageSize = 20

  let rows: { id: string; name: string; code: string | null; mainGroup: string | null; subGroup: string | null; sellPrice: number; sellPrice2: number; stock: number; active: boolean }[] = []
  if (q) {
    const { tokenizeQuery, rankFuzzy } = await import('@/lib/fuzzy')
    const tokens = tokenizeQuery(q)
    rows = await db.product.findMany({
      where: {
        OR: [
          ...tokens.map((t) => ({ name: { contains: t } })),
          { code: q },
          { barcodesJson: { contains: q } },
        ],
      },
      select: { id: true, name: true, code: true, mainGroup: true, subGroup: true, sellPrice: true, sellPrice2: true, stock: true, active: true },
      take: 120,
    })
    rows = q.length > 1 ? rankFuzzy(q, rows).matched.slice(0, 60) : rows.slice(0, 60)
  } else {
    rows = await db.product.findMany({
      select: { id: true, name: true, code: true, mainGroup: true, subGroup: true, sellPrice: true, sellPrice2: true, stock: true, active: true },
      orderBy: { updatedAt: 'desc' },
      take: pageSize,
      skip: (page - 1) * pageSize,
    })
  }

  const ids = rows.map((r) => r.id)
  const media = ids.length ? await db.shopProductMedia.findMany({ where: { productId: { in: ids } }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] }) : []
  const legacy = ids.length ? await db.productImage.findMany({ where: { key: { in: ids } }, select: { key: true, url: true } }) : []
  const legacyMap = new Map(legacy.map((l) => [l.key, l.url]))
  const byProduct = new Map<string, typeof media>()
  for (const m of media) byProduct.set(m.productId, [...(byProduct.get(m.productId) || []), m])

  return ok({
    products: rows.map((r) => ({
      id: r.id,
      name: cleanName(r.name),
      rawName: r.name,
      barcode: r.code,
      group: r.mainGroup?.trim() || null,
      subGroup: r.subGroup?.trim() || null,
      price: r.sellPrice > 0 ? r.sellPrice : r.sellPrice2,
      stock: r.stock,
      active: r.active,
      media: (byProduct.get(r.id) || []).map((m) => ({ id: m.id, url: m.url, isPrimary: m.isPrimary })),
      legacyImage: legacyMap.get(r.id) ?? null,
    })),
    page,
  })
}
