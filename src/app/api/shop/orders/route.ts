import { NextRequest, NextResponse } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { orderCreate } from '@/lib/shop'
import { requireShopCustomer, ensureBasket } from '@/lib/shop-http'

export const dynamic = 'force-dynamic'

/** GET /api/shop/orders — سفارش‌های من (جدید اول) */
export async function GET(req: NextRequest) {
  const { customer, denied } = await requireShopCustomer(req)
  if (denied) return denied
  const rows = await db.shopOrder.findMany({
    where: { customerId: customer!.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { items: { select: { id: true, productId: true, name: true, qty: true, unit: true, unitPrice: true, lineTotal: true } } },
  })
  return ok({
    orders: rows.map((o) => ({
      id: o.id, code: o.code, status: o.status, payMethod: o.payMethod, total: o.total, itemsTotal: o.itemsTotal,
      deliveryFee: o.deliveryFee, slotDate: o.slotDate, slotFrom: o.slotFrom, slotTo: o.slotTo,
      createdAt: o.createdAt, itemsCount: o.items.length, items: o.items,
    })),
  })
}

/** POST /api/shop/orders — ثبت نهایی سفارش از سبد (آدرس + بازه + پرداخت) */
export async function POST(req: NextRequest) {
  const { customer, denied } = await requireShopCustomer(req)
  if (denied) return denied
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const payMethod = body.payMethod === 'GATEWAY' ? 'GATEWAY' : 'COD'
  const basket = await ensureBasket(req)
  if (basket.isNew) return fail('سبد خرید خالی است', 400)

  const res = await orderCreate(customer!.id, basket.basketId, {
    addressId: String(body.addressId ?? ''),
    slotDate: String(body.slotDate ?? ''),
    slotFrom: String(body.slotFrom ?? ''),
    slotTo: String(body.slotTo ?? ''),
    payMethod,
    note: body.note ? String(body.note) : undefined,
  })
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.error, ...(res.adjusted ? { adjusted: res.adjusted } : {}) },
      { status: res.status || 400 },
    )
  }
  return ok({ order: res.order })
}
