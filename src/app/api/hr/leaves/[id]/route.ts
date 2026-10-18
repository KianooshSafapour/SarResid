import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** PATCH /api/hr/leaves/[id] {action:'approve'|'reject', responseNote?} — managers only */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('فقط مدیران می‌توانند مرخصی را بررسی کنند', 403)

  const { id } = await ctx.params
  const leave = await db.leaveRequest.findUnique({ where: { id } })
  if (!leave) return fail('درخواست یافت نشد', 404)

  const body = await req.json().catch(() => null)
  const action = String(body?.action || '')
  if (action !== 'approve' && action !== 'reject') return fail('عملیات نامعتبر است')

  const responseNote = typeof body?.responseNote === 'string' && body.responseNote.trim() ? body.responseNote.trim() : null
  if (action === 'reject' && (!responseNote || responseNote.length < 3)) {
    return fail('برای رد درخواست، ذکر دلیل الزامی است')
  }

  const status = action === 'approve' ? 'APPROVED' : 'REJECTED'
  const updated = await db.leaveRequest.update({
    where: { id },
    data: { status, responseNote, approverId: user.id, approverName: user.fullName },
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: action === 'approve' ? 'leave.approve' : 'leave.reject',
    actionLabel: 'مرخصی',
    category: 'leave',
    detail: `${responseNote ?? ''}`,
    entityId: id,
  })

  return ok({ id: updated.id, status: updated.status })
}

/** DELETE /api/hr/leaves/[id] — own pending request or managers */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const { id } = await ctx.params
  const leave = await db.leaveRequest.findUnique({ where: { id } })
  if (!leave) return fail('درخواست یافت نشد', 404)

  if (!isManager(user) && leave.userId !== user.id) return fail('اجازه حذف این درخواست را ندارید', 403)
  if (!isManager(user) && leave.status !== 'PENDING') return fail('فقط درخواست در انتظار قابل حذف است')

  await db.leaveRequest.delete({ where: { id } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'leave.delete',
    actionLabel: 'مرخصی',
    category: 'leave',
    detail: `${leave.type} از ${leave.fromDate}`,
    entityId: id,
  })
  return ok({ deleted: true })
}
