import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** DELETE /api/payments/[id] — finance roles */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN', 'ACC'].includes(me.role)) {
    return fail('شما مجاز به حذف پرداخت نیستید', 403)
  }

  const { id } = await ctx.params
  const row = await db.payment.findUnique({ where: { id } })
  if (!row) return fail('پرداخت یافت نشد', 404)

  await db.payment.delete({ where: { id } })
  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'payment.delete',
    actionLabel: 'حذف پرداخت',
    category: 'finance',
    detail: `${row.kind} — ${toFaDigits(String(row.amount))} ریال${row.supplierName ? ` — ${row.supplierName}` : ''}`,
    entityId: id,
  })
  return ok({ id })
}
