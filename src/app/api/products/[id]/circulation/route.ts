import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/products/[id]/circulation — گردش کالا
 * تصویر کامل خرید/فروش/انبارِ یک کالا برای تصمیم سفارش:
 *  - summary: موجودی، قیمت خرید آخر، قیمت فروش، آمار ماه
 *  - buys:    اقلام سفارش‌های ثبت‌شده (تاریخ، تعداد، قیمت، دریافت)
 *  - margins: کنترل‌های سودسنج (بهای واحد، قیمت چاپی، حاشیه)
 *  - counts:  انبارگردانی‌ها (سیستم در برابر شمارش)
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const { id } = await ctx.params
  const product = await db.product.findUnique({
    where: { id },
    select: {
      id: true, name: true, unit: true, code: true, stock: true,
      lastBuyPrice: true, sellPrice: true, monthlySold: true,
      lowStockThreshold: true, reorderLevel: true, defaultOrderQty: true,
      defaultCartonQty: true, unitsPerCarton: true, leadTimeDays: true,
      lastCountDate: true,
    },
  })
  if (!product) return fail('کالا یافت نشد', 404)

  const [items, marginItems, countItems, linkRows] = await Promise.all([
    db.orderItem.findMany({
      where: { productId: id },
      orderBy: { order: { createdAt: 'desc' } },
      take: 60,
      select: {
        qty: true, cartonQty: true, unitsPerCarton: true, unitBuyPrice: true,
        receivedQty: true, status: true,
        order: {
          select: { code: true, status: true, deliveryDate: true, createdAt: true, receivedAt: true, supplierName: true },
        },
      },
    }),
    db.marginItem.findMany({
      where: { productId: id },
      orderBy: { invoice: { createdAt: 'desc' } },
      take: 40,
      select: {
        quantity: true, totalCost: true, unitCost: true, printedPrice: true,
        invoice: { select: { number: true, createdAt: true, supplierName: true, dateJalali: true } },
      },
    }),
    db.stockCountItem.findMany({
      where: { productId: id },
      orderBy: { count: { createdAt: 'desc' } },
      take: 24,
      select: {
        systemQty: true, countedQty: true, diff: true, note: true,
        count: { select: { date: true, createdAt: true, status: true } },
      },
    }),
    db.supplierProduct.findMany({
      where: { productId: id },
      orderBy: [{ isPrimary: 'desc' }, { unitPrice: 'asc' }],
      select: {
        unitPrice: true, perCarton: true, isPrimary: true, lastBuyPrice: true, updatedAt: true, supplierId: true,
      },
    }),
  ])

  /* نام و تلفن تأمین‌کنندگان — SupplierProduct رابطهٔ مستقیم ندارد */
  const supIds = [...new Set(linkRows.map((l) => l.supplierId))]
  const supRows = supIds.length
    ? await db.supplier.findMany({ where: { id: { in: supIds } }, select: { id: true, name: true, phone: true, status: true } })
    : []
  const supById = new Map(supRows.map((s) => [s.id, s]))
  const links = linkRows.map((l) => ({ ...l, supplier: supById.get(l.supplierId) ?? null }))

  /* آمار خرید */
  const buyPrices = marginItems.map((m) => m.unitCost).filter((v) => v > 0)
  const totalOrdered = items.reduce((s, it) => s + it.qty, 0)
  const totalReceived = items.reduce((s, it) => s + (it.receivedQty ?? 0), 0)

  return ok({
    product,
    summary: {
      stock: product.stock,
      lastBuyPrice: product.lastBuyPrice,
      sellPrice: product.sellPrice,
      monthlySold: product.monthlySold,
      lowStockThreshold: product.lowStockThreshold ?? product.reorderLevel,
      totalOrdered,
      totalReceived,
      buyCount: items.length,
      minBuyPrice: buyPrices.length ? Math.min(...buyPrices) : null,
      maxBuyPrice: buyPrices.length ? Math.max(...buyPrices) : null,
      avgBuyPrice: buyPrices.length ? buyPrices.reduce((s, v) => s + v, 0) / buyPrices.length : null,
    },
    buys: items.map((it) => ({
      orderCode: it.order.code,
      supplierName: it.order.supplierName ?? '',
      orderedAt: it.order.createdAt.toISOString(),
      deliveryDate: it.order.deliveryDate ?? null,
      receivedAt: it.order.receivedAt ? it.order.receivedAt.toISOString() : null,
      qty: it.qty,
      cartonQty: it.cartonQty,
      unitsPerCarton: it.unitsPerCarton,
      unitBuyPrice: it.unitBuyPrice,
      receivedQty: it.receivedQty,
      status: it.order.status,
    })),
    margins: marginItems.map((m) => ({
      invoiceNumber: m.invoice.number,
      supplierName: m.invoice.supplierName ?? '',
      dateJalali: m.invoice.dateJalali,
      createdAt: m.invoice.createdAt.toISOString(),
      quantity: m.quantity,
      totalCost: m.totalCost,
      unitCost: m.unitCost,
      printedPrice: m.printedPrice,
      marginPct: m.unitCost > 0 ? ((m.printedPrice - m.unitCost) / m.unitCost) * 100 : null,
    })),
    counts: countItems.map((c) => ({
      dateJalali: c.count.date,
      systemQty: c.systemQty,
      countedQty: c.countedQty,
      diff: c.diff,
      note: c.note,
    })),
    suppliers: links.map((l) => ({
      supplierId: l.supplier?.id ?? '',
      supplierName: l.supplier?.name ?? '—',
      phone: l.supplier?.phone ?? null,
      status: l.supplier?.status ?? null,
      unitPrice: l.unitPrice,
      perCarton: l.perCarton,
      isPrimary: l.isPrimary,
      updatedAt: l.updatedAt.toISOString(),
    })),
  })
}
