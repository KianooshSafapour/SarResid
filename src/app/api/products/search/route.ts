import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/products/search
 *  - ?barcode=X → single product {id,name,lastBuyPrice,...} (price-check scan flow)
 *  - ?q=text    → {products:[{id,name,unit,sellPrice,lastBuyPrice,barcode}]} (pickers)
 *  - ?q=text&full=1 → rich rows for the ordering quick-search:
 *    stock, thresholds, defaults, carton size, supplier-link prices and
 *    last-order memory (when ordered, how many, when delivered).
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
  const full = sp.get('full') === '1'
  const limit = Math.max(1, Math.min(30, Math.round(Number(sp.get('limit')) || 20)))

  if (!q) return ok({ products: [] })

  /* جست‌وجوی فازی: نام کالا شامل متن باشد (فاصله‌ها را هم برطرف می‌کنیم تا
     «بیژن» و «بیژن صنعت» هم‌جست شوند) یا کد هولو/بانک بارکد دقیقاً بخورد
     (R5-F: barcodesJson هم بررسی می‌شود تا کالای تازه‌ثبت‌شدهٔ «فقط بارکددار»
     بدون کد، در جست‌وجوی سفارش‌گذاری پیدا شود) */
  const products = await db.product.findMany({
    where: { OR: [{ name: { contains: q } }, { code: q }, { barcodesJson: { contains: q } }] },
    orderBy: [{ lastBuyPrice: 'desc' }, { name: 'asc' }],
    take: limit,
    select: {
      id: true, name: true, unit: true, sellPrice: true, sellPrice2: true,
      lastBuyPrice: true, code: true, stock: true, reorderLevel: true,
      defaultOrderQty: true, defaultCartonQty: true, unitsPerCarton: true,
      lowStockThreshold: true, monthlySold: true, leadTimeDays: true,
      category: true, mainGroup: true,
      barcodesJson: true, // R5-P4: ستون «کد/بارکد» سفارش‌گذاری — از select جا افتاده بود
    },
  })

  if (!full) {
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

  /* ── حالت کامل سفارش‌گذاری: سابقهٔ سفارش + قیمت تأمین‌کنندگان ── */
  const ids = products.map((p) => p.id)

  const [linkRows, recentItems, buyRows] = await Promise.all([
    db.supplierProduct.findMany({
      where: { productId: { in: ids } },
      orderBy: [{ isPrimary: 'desc' }, { unitPrice: 'asc' }],
      select: {
        productId: true, supplierId: true, unitPrice: true, perCarton: true,
        isPrimary: true, lastBuyPrice: true,
      },
    }),
    db.orderItem.findMany({
      where: { productId: { in: ids }, order: { status: { not: 'CANCELLED' } } },
      orderBy: { order: { createdAt: 'desc' } },
      take: 400,
      select: {
        productId: true, qty: true, cartonQty: true, unitsPerCarton: true,
        unitBuyPrice: true, receivedQty: true,
        order: {
          select: {
            id: true, code: true, status: true, deliveryDate: true,
            createdAt: true, receivedAt: true, supplierName: true,
          },
        },
      },
    }),
    /* R8: آخرین خرید واقعی از دادهٔ هلو (TradeRecord BUY) — چیپ «خرید هلو» در نتایج جست‌وجو */
    db.tradeRecord.findMany({
      where: { kind: 'BUY', productId: { in: ids } },
      orderBy: { dateJalali: 'desc' },
      take: 600,
      select: { productId: true, dateJalali: true, month: true, qty: true, unitPrice: true },
    }),
  ])

  /* نام تأمین‌کنندگان — SupplierProduct رابطهٔ مستقیم ندارد */
  const supplierIds = [...new Set(linkRows.map((l) => l.supplierId))]
  const supplierRows = supplierIds.length
    ? await db.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true, status: true } })
    : []
  const supMap = new Map(supplierRows.map((s) => [s.id, s]))
  const links = linkRows.map((l) => ({ ...l, supplier: supMap.get(l.supplierId) ?? null }))

  const linksBy = new Map<string, typeof links>()
  for (const l of links) {
    const arr = linksBy.get(l.productId) ?? []
    arr.push(l)
    linksBy.set(l.productId, arr)
  }
  /* آخرین سفارش هر کالا: نخستین ردیف تاریخ‌مرتب‌شده */
  const lastBy = new Map<string | null, (typeof recentItems)[number]>() // productId در OrderItem نال‌پذیر است (پیش‌موجود)
  for (const it of recentItems) {
    if (!lastBy.has(it.productId)) lastBy.set(it.productId, it)
  }
  /* R8: آخرین خرید هلو هر کالا (نخستین ردیف تاریخ‌مرتب‌شده) */
  const lastBuyBy = new Map<string, (typeof buyRows)[number]>()
  for (const b of buyRows) {
    if (b.productId && !lastBuyBy.has(b.productId)) lastBuyBy.set(b.productId, b)
  }

  return ok({
    products: products.map((p) => {
      const lks = linksBy.get(p.id) ?? []
      const last = lastBy.get(p.id) ?? null
      /* R5-F: نخستین بارکد بانک بارکد غیر از کد — ستون «کد/بارکد» جدول سفارش‌گذاری */
      const bank: string[] = safeJson(p.barcodesJson, [])
      const bankBarcode = bank.find((b) => b && b !== p.code) ?? null
      return {
        id: p.id,
        name: p.name,
        unit: p.unit,
        barcode: p.code,
        bankBarcode,
        sellPrice: p.sellPrice,
        lastBuyPrice: p.lastBuyPrice,
        stock: p.stock,
        lowStockThreshold: p.lowStockThreshold ?? p.reorderLevel,
        defaultOrderQty: p.defaultOrderQty,
        defaultCartonQty: p.defaultCartonQty,
        unitsPerCarton: p.unitsPerCarton,
        monthlySold: p.monthlySold,
        leadTimeDays: p.leadTimeDays,
        category: p.category,
        mainGroup: p.mainGroup,
        suppliers: lks.map((l) => ({
          supplierId: l.supplierId,
          supplierName: l.supplier?.name ?? '—',
          unitPrice: l.unitPrice,
          perCarton: l.perCarton,
          isPrimary: l.isPrimary,
          status: l.supplier?.status ?? null,
        })),
        lastOrder: last
          ? {
              orderCode: last.order.code,
              supplierName: last.order.supplierName ?? '',
              orderedAt: last.order.createdAt.toISOString(),
              deliveryDate: last.order.deliveryDate ?? null,
              receivedAt: last.order.receivedAt ? last.order.receivedAt.toISOString() : null,
              qty: last.qty,
              cartonQty: last.cartonQty,
              unitsPerCarton: last.unitsPerCarton,
              unitBuyPrice: last.unitBuyPrice,
              status: last.order.status,
            }
          : null,
        /* R8: آخرین خرید واقعی از فایل هلو (تیر–مهر ۱۴۰۵) — ماه + تعداد */
        lastBuy: (() => {
          const b = lastBuyBy.get(p.id)
          return b
            ? { dateJalali: b.dateJalali, month: b.month, qty: b.qty, unitPrice: b.unitPrice }
            : null
        })(),
      }
    }),
  })
}
