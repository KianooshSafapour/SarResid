import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** GET /api/shop-admin/customers — مشتریان فروشگاه آنلاین + آمار سفارش */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN', 'ACC'].includes(user.role)) return fail('دسترسی ندارید', 403)

  const customers = await db.shopCustomer.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  const agg = await db.shopOrder.groupBy({ by: ['customerId'], _count: { _all: true }, _sum: { total: true } })
  const byCustomer = new Map(agg.map((a) => [a.customerId, { count: a._count._all, total: a._sum.total || 0 }]))
  return ok({
    customers: customers.map((c) => ({
      id: c.id,
      phone: c.phone,
      name: c.name,
      isBlocked: c.isBlocked,
      loginCount: c.loginCount,
      lastLoginAt: c.lastLoginAt,
      createdAt: c.createdAt,
      holooErp: c.holooErp,
      orders: byCustomer.get(c.id) || { count: 0, total: 0 },
    })),
  })
}

/** PUT /api/shop-admin/customers {customerId, isBlocked} — مسدود/آزادسازی */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN'].includes(user.role)) return fail('فقط مدیران', 403)
  const body = (await req.json().catch(() => ({}))) as { customerId?: string; isBlocked?: boolean }
  const id = String(body.customerId ?? '')
  const c = await db.shopCustomer.findUnique({ where: { id } })
  if (!c) return fail('مشتری پیدا نشد', 404)
  await db.shopCustomer.update({ where: { id }, data: { isBlocked: body.isBlocked === true } })
  return ok({ isBlocked: body.isBlocked === true })
}
