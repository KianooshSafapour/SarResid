import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const task = await db.task.findUnique({ where: { id } })
  if (!task) return fail('وظیفه یافت نشد', 404)
  const body = await req.json()
  const action = body.action as string

  const data: Record<string, unknown> = {}
  let award = 0

  if (action === 'start') {
    if (task.status !== 'OPEN' && task.status !== 'PAUSED') return fail('وظیفه قابل شروع نیست')
    data.status = 'IN_PROGRESS'
  } else if (action === 'pause') {
    data.status = 'PAUSED'
    data.pauseNote = body.pauseNote || ''
    if (!body.pauseNote) return fail('دلیل توقف را بنویسید تا مدیر مطلع شود')
  } else if (action === 'done') {
    if (task.status === 'DONE') return fail('وظیفه قبلاً انجام شده است')
    data.status = 'DONE'
    data.completedAt = new Date()
    award = task.points || 10
  } else if (action === 'reopen') {
    data.status = 'OPEN'
    data.completedAt = null
  } else if (body.status) {
    data.status = body.status
  }

  const updated = await db.task.update({ where: { id }, data })

  if (award > 0) {
    await db.user.update({ where: { id: task.assignedToId }, data: { points: { increment: award } } })
    await db.award.create({
      data: {
        userId: task.assignedToId,
        userName: task.assignedToName,
        points: award,
        reason: `انجام وظیفه: ${task.title}`,
        awardedById: 'system',
        awardedByName: 'سامانه (خودکار)',
      },
    })
  }
  await logActivity(me, `وظیفه: ${action}`, 'task', id, task.title)
  return json({ task: updated, awarded: award })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me || !['GM', 'OM', 'PM'].includes(me.role)) return fail('دسترسی غیرمجاز', 403)
  await db.task.delete({ where: { id } })
  await logActivity(me, 'حذف وظیفه', 'task', id)
  return json({ ok: true })
}
