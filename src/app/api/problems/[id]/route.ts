import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { displayName, notify } from '@/lib/notify'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED']

/**
 * PATCH /api/problems/[id] — جریان رسیدگی (SPEC-R3 2.4):
 *  {status:'OPEN'|'IN_PROGRESS'|'RESOLVED'}                    — تغییر وضعیت
 *  {action:'resolve', actionTaken}                              — ثبت اقدام + حل نهایی (resolvedAt)
 *  {action:'assign', assigneeId}                                — واگذاری به مسئول (فقط مدیران)
 * مدیران همیشه مجازند؛ مسئول پیگیری (assignee) نیز می‌تواند وضعیت را پیش ببرد.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const { id } = await ctx.params
  const problem = await db.problem.findUnique({ where: { id } })
  if (!problem) return fail('مشکل یافت نشد', 404)

  const body = (await req.json().catch(() => ({}))) as {
    status?: string
    action?: string
    actionTaken?: string
    assigneeId?: string
  }

  const manager = isManager(me)
  const isAssignee = !!problem.assigneeId && problem.assigneeId === me.id
  if (!manager && !isAssignee) {
    return fail('فقط مدیران یا مسئول پیگیری می‌توانند این مشکل را به‌روزرسانی کنند', 403)
  }

  const action = String(body.action || '')

  // ---- assign ----
  if (action === 'assign') {
    if (!manager) return fail('واگذاری مشکل فقط توسط مدیران انجام می‌شود', 403)
    const assigneeId = String(body.assigneeId || '').trim()
    if (!assigneeId) return fail('مسئول پیگیری را انتخاب کنید')
    const assignee = await db.user.findUnique({ where: { id: assigneeId } })
    if (!assignee) return fail('مسئول پیگیری انتخاب‌شده یافت نشد', 404)

    await db.problem.update({ where: { id }, data: { assigneeId } })
    await notify({
      userId: assigneeId,
      kind: 'problem',
      severity: 'important',
      title: 'مشکل به شما واگذار شد',
      body: problem.problem.slice(0, 120),
      go: '#/tasks/problems',
    })
    await logActivity({
      userId: me.id,
      userName: displayName(me),
      action: 'problem_assign',
      actionLabel: 'واگذاری مشکل',
      category: 'problems',
      detail: `${problem.problem.slice(0, 50)} → ${assignee.fullName}`,
      entityId: id,
    })
    return ok({ id, assigneeId })
  }

  // ---- resolve ----
  if (action === 'resolve') {
    const actionTaken = String(body.actionTaken || '').trim()
    if (!actionTaken) return fail('شرح اقدام انجام‌شده الزامی است')
    const now = new Date()
    await db.problem.update({
      where: { id },
      data: { status: 'RESOLVED', action: actionTaken, resolvedAt: now },
    })
    await logActivity({
      userId: me.id,
      userName: displayName(me),
      action: 'problem_resolve',
      actionLabel: 'حل مشکل',
      category: 'problems',
      detail: `${problem.problem.slice(0, 50)} — ${actionTaken.slice(0, 60)}`,
      entityId: id,
    })
    if (problem.reporterId && problem.reporterId !== me.id) {
      await notify({
        userId: problem.reporterId,
        kind: 'problem',
        severity: 'info',
        title: 'مشکل شما حل شد',
        body: `${problem.problem.slice(0, 80)} — اقدام: ${actionTaken.slice(0, 80)}`,
        go: '#/tasks/problems',
      })
    }
    return ok({ id, status: 'RESOLVED', resolvedAt: now.toISOString() })
  }

  // ---- status flow ----
  if (action) return fail('عملیات نامعتبر است')
  const status = String(body.status || '').toUpperCase()
  if (!status || !STATUSES.includes(status)) return fail('وضعیت نامعتبر است')
  if (status === problem.status) return fail('مشکل از قبل در این وضعیت است')

  await db.problem.update({
    where: { id },
    data: {
      status,
      ...(status === 'RESOLVED' && !problem.resolvedAt ? { resolvedAt: new Date() } : {}),
    },
  })

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'problem_update',
    actionLabel: 'به‌روزرسانی مشکل',
    category: 'problems',
    detail: `${problem.problem.slice(0, 50)} → ${status}`,
    entityId: id,
  })

  return ok({ id, status })
}
