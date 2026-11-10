import { NextRequest, NextResponse } from 'next/server'
import { ok, fail, clampInt } from '@/lib/api'
import { db } from '@/lib/db'
import { catalogLoad, decorateCatalog, catalogGroups, catalogEtag, getShopSettings, reservedMap, primaryImageMap, priceOf, discountPct, availableOf, cleanName, CatalogSort } from '@/lib/shop'
import { checkServiceToken } from '@/lib/shop-http'

export const dynamic = 'force-dynamic'

const SORTS: CatalogSort[] = ['popular', 'newest', 'cheap', 'expensive', 'discount']

const CATALOG_SELECT_SAFE = {
  id: true, name: true, code: true, unit: true, mainGroup: true, subGroup: true,
  barcodesJson: true, sellPrice: true, sellPrice2: true, stock: true, monthlySold: true, imported: true,
} as const

/** GET /api/shop/catalog — کاتالوگ زندهٔ فروشگاه (q/group/sub/sort/page) با ETag/304 */
export async function GET(req: NextRequest) {
  if (!(await checkServiceToken(req))) return fail('توکن سرویس نامعتبر است', 403)
  const sp = req.nextUrl.searchParams

  const etag = await catalogEtag()
  if (req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag } })

  const sortRaw = (sp.get('sort') || 'popular') as CatalogSort
  const sort = SORTS.includes(sortRaw) ? sortRaw : 'popular'
  const q = (sp.get('q') || '').slice(0, 60)
  const group = (sp.get('group') || '').slice(0, 60)
  const subGroup = (sp.get('sub') || '').slice(0, 60)
  const page = clampInt(sp.get('page'), 1, 500, 1)
  const pageSize = clampInt(sp.get('pageSize'), 1, 60, 24)
  const onlyAvailable = sp.get('avail') === '1'

  const settings = await getShopSettings()
  if (!settings.open && sp.get('preview') !== '1') {
    return fail('فروشگاه فعلاً بسته است', 503)
  }

  // انتخاب با شناسهٔ مستقیم (ریل «بازدیدهای اخیر») — بدون فیلتر/مرتب‌سازی
  const ids = (sp.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20)
  if (ids.length) {
    const rows = await db.product.findMany({
      where: { id: { in: ids }, active: true, status: 'فعال', OR: [{ sellPrice: { gt: 0 } }, { sellPrice2: { gt: 0 } }] },
      select: { ...CATALOG_SELECT_SAFE },
    })
    const reserved = await reservedMap(rows.map((r) => r.id))
    const imgMap = await primaryImageMap(rows.map((r) => r.id))
    const byId = new Map(rows.map((r) => [r.id, r]))
    const items = ids.map((id) => byId.get(id)).filter(Boolean).map((p) => ({
      id: p!.id, name: cleanName(p!.name), unit: p!.unit, group: p!.mainGroup?.trim() || null, subGroup: p!.subGroup?.trim() || null,
      price: priceOf(p!), printedPrice: p!.sellPrice2 || priceOf(p!), discountPct: discountPct(p!),
      stock: p!.stock, available: availableOf(p!.stock, reserved.get(p!.id) || 0, settings.shelfFloor),
      barcode: p!.code, image: imgMap.get(p!.id) ?? null, sold: p!.monthlySold,
    }))
    return NextResponse.json(
      { ok: true, data: { items, total: items.length, page: 1, pageSize: items.length } },
      { headers: { ETag: etag, 'Cache-Control': 'private, max-age=15' } },
    )
  }

  const rows = await catalogLoad()
  const result = await decorateCatalog(rows, {
    q, group, subGroup, sort, page, pageSize, onlyAvailable,
    shelfFloor: settings.shelfFloor, hiddenGroups: settings.hiddenGroups, categories: true,
  })
  const groups = group ? undefined : await catalogGroups()
  return NextResponse.json(
    { ok: true, data: { ...result, ...(groups ? { groups } : {}) } },
    { headers: { ETag: etag, 'Cache-Control': 'private, max-age=30' } },
  )
}
