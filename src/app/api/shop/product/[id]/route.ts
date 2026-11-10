import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { priceOf, discountPct, availableOf, reservedMap, getShopSettings, cleanName, primaryImageMap } from '@/lib/shop'
import { checkServiceToken } from '@/lib/shop-http'

export const dynamic = 'force-dynamic'

/** GET /api/shop/product/[id] — جزئیات کالا + کالاهای مرتبط */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkServiceToken(req))) return fail('توکن سرویس نامعتبر است', 403)
  const { id } = await params
  const p = await db.product.findUnique({
    where: { id },
    select: {
      id: true, name: true, code: true, unit: true, mainGroup: true, subGroup: true, barcodesJson: true,
      sellPrice: true, sellPrice2: true, stock: true, monthlySold: true, imported: true, active: true, status: true,
      shelfLifeDays: true,
    },
  })
  if (!p || !p.active || p.status !== 'فعال') return fail('کالا پیدا نشد', 404)
  const price = priceOf(p)
  if (price <= 0) return fail('کالا پیدا نشد', 404)

  const settings = await getShopSettings()
  const reserved = await reservedMap([p.id])
  const available = availableOf(p.stock, reserved.get(p.id) || 0, settings.shelfFloor)
  const gallery = await db.shopProductMedia.findMany({ where: { productId: p.id }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 6 })
  let imageUrl: string | null = gallery[0]?.url ?? null
  if (!imageUrl) {
    const legacy = await db.productImage.findUnique({ where: { key: p.id } })
    imageUrl = legacy?.url ?? null
  }

  // کالاهای مرتبط — همان زیرگروه (یا گروه اصلی)، موجود اول، پرفروش‌تر
  const relatedRows = await db.product.findMany({
    where: {
      id: { not: p.id }, active: true, status: 'فعال',
      OR: [{ sellPrice: { gt: 0 } }, { sellPrice2: { gt: 0 } }],
      ...(p.subGroup ? { subGroup: p.subGroup } : p.mainGroup ? { mainGroup: p.mainGroup } : {}),
    },
    select: { id: true, name: true, unit: true, sellPrice: true, sellPrice2: true, stock: true, monthlySold: true },
    take: 30,
    orderBy: { monthlySold: 'desc' },
  })
  const relatedReserved = await reservedMap(relatedRows.map((r) => r.id))
  const imgMap = await primaryImageMap(relatedRows.map((r) => r.id))
  const related = relatedRows
    .map((r) => ({
      id: r.id, name: cleanName(r.name), unit: r.unit, price: priceOf(r), printedPrice: r.sellPrice2 || priceOf(r),
      discountPct: discountPct(r), available: availableOf(r.stock, relatedReserved.get(r.id) || 0, settings.shelfFloor),
      image: imgMap.get(r.id) ?? null,
    }))
    .sort((a, b) => (b.available > 0 ? 1 : 0) - (a.available > 0 ? 1 : 0))
    .slice(0, 8)

  return ok({
    id: p.id, name: cleanName(p.name), unit: p.unit, barcode: p.code,
    group: p.mainGroup?.trim() || null, subGroup: p.subGroup?.trim() || null,
    price, printedPrice: p.sellPrice2 || price, discountPct: discountPct(p),
    available, stock: p.stock, image: imageUrl, gallery: gallery.map((g) => ({ url: g.url, caption: g.caption })), imported: p.imported,
    shelfLifeDays: p.shelfLifeDays ?? null, related,
  })
}
