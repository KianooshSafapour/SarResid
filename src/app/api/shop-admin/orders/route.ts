import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { ORDER_STATUS_FA } from '@/lib/shop'
import { canUseShopOps } from '@/lib/shop-http'

export const dynamic = 'force-dynamic'

/** GET /api/shop-admin/orders?status=&date= — صف سفارش‌های آنلاین برای کارکنان */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canUseShopOps(user.role)) return fail('دسترسی به پنل سفارش آنلاین ندارید', 403)

  const sp = req.nextUrl.searchParams
  const status = (sp.get('status') || '').trim()
  const date = (sp.get('date') || '').trim()
  const rows = await db.shopOrder.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(date ? { slotDate: date } : {}),
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 60,
    include: { items: true, customer: { select: { phone: true, name: true } } },
  })
  const counts = await db.shopOrder.groupBy({ by: ['status'], _count: { _all: true } })
  return ok({
    orders: rows.map((o) => ({
      id: o.id, code: o.code, status: o.status, statusFa: ORDER_STATUS_FA[o.status] || o.status,
      payMethod: o.payMethod, paidAt: o.paidAt,
      total: o.total, itemsTotal: o.itemsTotal, deliveryFee: o.deliveryFee,
      slotDate: o.slotDate, slotFrom: o.slotFrom, slotTo: o.slotTo, note: o.note,
      address: JSON.parse(o.addressJson),
      customer: { phone: o.customer.phone, name: o.customer.name },
      pickerName: o.pickerName, pickedAt: o.pickedAt,
      delivererName: o.delivererName, deliveredAt: o.deliveredAt,
      holooInvoiceNo: o.holooInvoiceNo, holooError: o.holooError,
      createdAt: o.createdAt, cancelledAt: o.cancelledAt, cancelReason: o.cancelReason,
      items: o.items,
    })),
    counts: counts.map((c) => ({ status: c.status, count: c._count._all })),
  })
}
