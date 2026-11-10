import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { catalogLoad, decorateCatalog, catalogGroups, catalogEtag, getShopSettings, cleanName, primaryImageMap } from '@/lib/shop'
import { checkServiceToken, shopCustomerOf } from '@/lib/shop-http'

export const dynamic = 'force-dynamic'

/** GET /api/shop/home — داده‌های صفحهٔ اول: بنر، دسته‌ها، پرفروش‌ها، تخفیف‌ها + «خرید مجدد» اگر لاگین است */
export async function GET(req: NextRequest) {
  if (!(await checkServiceToken(req))) return fail('توکن سرویس نامعتبر است', 403)
  const settings = await getShopSettings()
  const etag = await catalogEtag()
  const rows = await catalogLoad()

  const [bestsellers, deals] = await Promise.all([
    decorateCatalog(rows, { sort: 'popular', pageSize: 12, page: 1, onlyAvailable: true, shelfFloor: settings.shelfFloor, hiddenGroups: settings.hiddenGroups, categories: true }),
    decorateCatalog(rows, { sort: 'discount', pageSize: 10, page: 1, onlyAvailable: true, shelfFloor: settings.shelfFloor, hiddenGroups: settings.hiddenGroups, categories: true }),
  ])
  const groups = await catalogGroups()

  // «خرید مجدد سفارش قبلی» — آخرین سفارشِ مشتری لاگین‌شده
  let reorder: { id: string; name: string; qty: number; price: number; image: string | null; unit: string }[] | null = null
  const customer = await shopCustomerOf(req)
  if (customer) {
    const last = await db.shopOrder.findFirst({
      where: { customerId: customer.id, status: { in: ['DELIVERED', 'INVOICED', 'COD', 'PAID', 'PICKING', 'DELIVERING'] } },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    })
    if (last?.items?.length) {
      const imgMap = await primaryImageMap(last.items.map((i) => i.productId))
      reorder = last.items.slice(0, 12).map((i) => ({ id: i.productId, name: cleanName(i.name), qty: i.qty, price: i.unitPrice, unit: i.unit, image: imgMap.get(i.productId) ?? null }))
    }
  }

  const dealsItems = deals.items.filter((d) => d.discountPct >= 5).slice(0, 8)

  return ok({
    open: settings.open,
    storeName: settings.storeName,
    announcement: settings.announcement,
    hotline: settings.hotline,
    freeDeliveryMin: settings.freeDeliveryMin,
    deliveryFee: settings.deliveryFee,
    groups: groups.slice(0, 10),
    bestsellers: bestsellers.items,
    deals: dealsItems,
    reorder,
    etag,
  })
}
