import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** سابقهٔ قیمت یک کالا — R5-B req#4
 *  GET /api/margin/history?productId=…&barcode=…&name=…
 *  منابع: MarginItem (فاکتورهای سودسنج) + OrderItem (سفارش‌های خرید تحویل‌شده)
 *  خروجی: ردیف‌ها به‌ترتیب جدیدترین + آخرین بهای هر واحد / آخرین قیمت چاپی
 */

type HistRow = {
  dateJalali: string | null
  createdAt: Date
  source: 'margin' | 'order'
  supplierName: string | null
  quantity: number
  unitCost: number
  printedPrice: number
  salePrice: number
  free100: boolean
}

function pct(unitCost: number, sale: number): number | null {
  if (unitCost <= 0) return null
  return Math.round(((sale - unitCost) / unitCost) * 10000) / 100
}

export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const sp = req.nextUrl.searchParams
  let productId = (sp.get('productId') || '').trim()
  const barcode = (sp.get('barcode') || '').trim()
  const name = (sp.get('name') || '').trim()

  if (!productId && barcode) {
    const p = await db.product.findFirst({
      where: { OR: [{ code: barcode }, { barcodesJson: { contains: `"${barcode}"` } }] },
      select: { id: true },
    })
    productId = p?.id ?? ''
  }
  /* تطبیق با نام کالا — برای اقلامی که با نام (بدون بارکد) وارد می‌شوند */
  if (!productId && name) {
    const exact = await db.product.findFirst({ where: { name }, select: { id: true } })
    productId = exact?.id ?? ''
    if (!productId) {
      const fuzzy = await db.product.findFirst({ where: { name: { contains: name } }, select: { id: true } })
      productId = fuzzy?.id ?? ''
    }
  }
  if (!productId) return fail('شناسه یا بارکد کالا الزامی است')

  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, unit: true, sellPrice: true, lastBuyPrice: true, code: true, barcodesJson: true },
  })
  if (!product) return fail('کالا یافت نشد', 404)

  const [marginItems, orderItems] = await Promise.all([
    db.marginItem.findMany({
      where: { productId },
      orderBy: { invoice: { createdAt: 'desc' } },
      take: 40,
      select: {
        quantity: true,
        totalCost: true,
        unitCost: true,
        printedPrice: true,
        salePrice: true,
        free100: true,
        invoice: { select: { createdAt: true, dateJalali: true, supplierName: true } },
      },
    }),
    db.orderItem.findMany({
      where: { productId, order: { status: { not: 'CANCELLED' } } },
      orderBy: { order: { createdAt: 'desc' } },
      take: 40,
      select: {
        qty: true,
        unitBuyPrice: true,
        printedPrice: true,
        order: { select: { createdAt: true, deliveryDate: true, supplierName: true, receivedAt: true } },
      },
    }),
  ])

  const rows: HistRow[] = []
  for (const m of marginItems) {
    rows.push({
      dateJalali: m.invoice.dateJalali,
      createdAt: m.invoice.createdAt,
      source: 'margin',
      supplierName: m.invoice.supplierName,
      quantity: m.quantity,
      unitCost: m.unitCost > 0 ? m.unitCost : m.totalCost / (m.quantity || 1),
      printedPrice: m.printedPrice,
      salePrice: m.salePrice || m.printedPrice,
      free100: m.free100,
    })
  }
  for (const o of orderItems) {
    rows.push({
      dateJalali: o.order.deliveryDate ?? null,
      createdAt: o.order.receivedAt ?? o.order.createdAt,
      source: 'order',
      supplierName: o.order.supplierName,
      quantity: o.qty,
      unitCost: o.unitBuyPrice,
      printedPrice: o.printedPrice,
      salePrice: o.printedPrice,
      free100: false,
    })
  }

  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const history = rows.slice(0, 30).map((r, i) => ({
    dateJalali: r.dateJalali,
    createdAt: r.createdAt.toISOString(),
    source: r.source,
    supplierName: r.supplierName,
    quantity: r.quantity,
    unitCost: r.unitCost,
    printedPrice: r.printedPrice,
    salePrice: r.salePrice,
    profitPct: pct(r.unitCost, r.salePrice || r.printedPrice),
    free100: r.free100,
    latest: i === 0,
  }))

  /* آخرین بهای هر واحد = جدیدترین ردیف با بهای مثبت (از هر دو منبع) */
  const lastCostRow = rows.find((r) => r.unitCost > 0) ?? null
  const lastUnitCost = lastCostRow ? lastCostRow.unitCost : product.lastBuyPrice > 0 ? product.lastBuyPrice : null

  /* سابقهٔ قیمت چاپی فقط از فاکتورهای سودسنج (همان قرارداد فرم فعلی) */
  const printedRows = marginItems.filter((m) => m.printedPrice > 0)
  const lastPrintedPrice = printedRows.length ? printedRows[0].printedPrice : product.sellPrice > 0 ? product.sellPrice : null
  const printedPrices = printedRows.map((m) => m.printedPrice)
  const avgPrintedPrice = printedPrices.length
    ? printedPrices.reduce((s, v) => s + v, 0) / printedPrices.length
    : lastPrintedPrice
  const printedPriceCount = printedRows.length

  return ok({
    product: {
      id: product.id,
      name: product.name,
      unit: product.unit,
      sellPrice: product.sellPrice,
      lastBuyPrice: product.lastBuyPrice,
      barcode: product.code,
    },
    history,
    lastUnitCost,
    lastPrintedPrice,
    avgPrintedPrice,
    printedPriceCount,
  })
}
