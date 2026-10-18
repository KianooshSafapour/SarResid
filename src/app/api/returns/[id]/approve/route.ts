import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** live capability: approveReturns = OWNER/GM/ADMIN/EXEC */
function canApproveReturns(role: string): boolean {
  return ['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(role)
}

/**
 * POST /api/returns/[id]/approve — manager approves a pending return.
 * If it has a card-transfer part it becomes `approved` (awaiting payment),
 * otherwise it is fully settled (`paid`) in the same step.
 * Response: {awaitingPayment, id, code, status, …}
 */
export async function POST(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!canApproveReturns(me.role)) return fail('شما مجاز به تأیید مرجوعی نیستید', 403)

  const { id } = await ctx.params
  const r = await db.returnRequest.findUnique({ where: { id } })
  if (!r) return fail('مرجوعی یافت نشد', 404)
  if (r.status !== 'pending' && r.status !== 'draft') {
    return fail('این مرجوعی در وضعیت تأیید نیست')
  }

  const awaitingPayment = r.transferAmount > 0
  const now = new Date()
  const updated = await db.returnRequest.update({
    where: { id },
    data: {
      status: awaitingPayment ? 'approved' : 'paid',
      approvedById: me.id,
      approvedAt: now,
    },
  })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'return.approve',
    actionLabel: 'تأیید مرجوعی',
    category: 'returns',
    detail: `${r.code} — ${awaitingPayment ? 'در انتظار پرداخت به کارت' : 'تسویه نهایی'}`,
    entityId: id,
  })

  if (awaitingPayment) {
    await db.notification.create({
      data: {
        role: 'EXEC',
        kind: 'return',
        severity: 'warning',
        title: 'مرجوعی تأیید شد — در انتظار پرداخت',
        body: `${r.code} — پرداختنی به کارت: ${toFaDigits(String(r.transferAmount))} ریال`,
        go: '#/returns/approvals',
      },
    })
  }

  return ok({
    id: updated.id,
    code: updated.code,
    status: updated.status,
    awaitingPayment,
    approvedAt: updated.approvedAt ? updated.approvedAt.toISOString() : null,
  })
}
