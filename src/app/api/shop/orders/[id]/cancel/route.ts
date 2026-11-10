import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { historyOf } from '@/lib/shop'
import { requireShopCustomer } from '@/lib/shop-http'

export const dynamic = 'force-dynamic'

/** POST /api/shop/orders/[id]/cancel — لغو توسط مشتری، فقط قبل از شروع جمع‌آوری */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { customer, denied } = await requireShopCustomer(req)
  if (denied) return denied
  const { id } = await params
  const order = await db.shopOrder.findFirst({ where: { id, customerId: customer!.id } })
  if (!order) return fail('سفارش پیدا نشد', 404)
  if (order.status === 'AWAITING_PAYMENT') {
    await db.shopOrder.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'لغو توسط مشتری (پیش از پرداخت)',
        historyJson: historyAppend(order.historyJson, 'customer-cancel', 'پیش از پرداخت') },
    })
    return ok({ status: 'CANCELLED' })
  }
  if (!['COD', 'PAID'].includes(order.status)) {
    return fail(`سفارش در وضعیت «${order.status === 'PICKING' ? 'در حال جمع‌آوری' : order.status}» است — برای لغو با پشتیبانی تماس بگیرید`, 409)
  }
  await db.shopOrder.update({
    where: { id },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'لغو توسط مشتری',
      historyJson: historyAppend(order.historyJson, 'customer-cancel', 'درخواست مشتری') },
  })
  return ok({ status: 'CANCELLED' })
}

function historyAppend(json: string, action: string, detail: string): string {
  const arr = historyOf(json)
  arr.push({ at: new Date().toISOString(), by: 'customer', action, detail })
  return JSON.stringify(arr)
}
