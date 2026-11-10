import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { historyOf, ORDER_STATUS_FA } from '@/lib/shop'
import { requireShopCustomer } from '@/lib/shop-http'

export const dynamic = 'force-dynamic'

/** GET /api/shop/orders/[id] — جزئیات سفارش من + خط زمان وضعیت */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { customer, denied } = await requireShopCustomer(req)
  if (denied) return denied
  const { id } = await params
  const order = await db.shopOrder.findFirst({
    where: { id, customerId: customer!.id },
    include: { items: true },
  })
  if (!order) return fail('سفارش پیدا نشد', 404)
  return ok({
    id: order.id, code: order.code, status: order.status, statusFa: ORDER_STATUS_FA[order.status] || order.status,
    payMethod: order.payMethod, paidAt: order.paidAt,
    total: order.total, itemsTotal: order.itemsTotal, deliveryFee: order.deliveryFee,
    slotDate: order.slotDate, slotFrom: order.slotFrom, slotTo: order.slotTo,
    address: JSON.parse(order.addressJson),
    note: order.note, cancelReason: order.cancelReason,
    createdAt: order.createdAt, deliveredAt: order.deliveredAt, cancelledAt: order.cancelledAt,
    items: order.items.map((i) => ({ id: i.id, productId: i.productId, name: i.name, unit: i.unit, qty: i.qty, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
    history: historyOf(order.historyJson),
  })
}
