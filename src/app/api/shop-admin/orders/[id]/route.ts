import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { orderStaffAction, historyOf, ORDER_STATUS_FA, StaffAction } from '@/lib/shop'
import { canUseShopOps } from '@/lib/shop-http'

export const dynamic = 'force-dynamic'

const ACTIONS: StaffAction[] = ['start-pick', 'picked', 'start-deliver', 'deliver', 'cancel', 'retry-holoo']

/** POST /api/shop-admin/orders/[id] {action, delivererName?, delivererPhone?, reason?} — گردش‌کار کارکنان */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canUseShopOps(user.role)) return fail('دسترسی ندارید', 403)

  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const action = String(body.action ?? '') as StaffAction
  if (!ACTIONS.includes(action)) return fail('عملیات ناشناخته')

  const res = await orderStaffAction(
    { id: user.id, fullName: user.fullName, honorific: user.honorific, role: user.role },
    id, action,
    {
      delivererName: body.delivererName ? String(body.delivererName) : undefined,
      delivererPhone: body.delivererPhone ? String(body.delivererPhone) : undefined,
      reason: body.reason ? String(body.reason) : undefined,
    },
  )
  if (!res.ok) return fail(res.error || 'عملیات ناموفق', 400)

  const order = await db.shopOrder.findUnique({ where: { id } })
  return ok({
    status: res.status, statusFa: ORDER_STATUS_FA[res.status || ''] || res.status,
    invoiceNo: res.invoiceNo, holooError: order?.holooError ?? null,
    history: order ? historyOf(order.historyJson) : [],
  })
}
