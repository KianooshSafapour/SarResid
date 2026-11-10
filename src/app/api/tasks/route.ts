import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, safeJson, clampInt, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { displayName, notify } from '@/lib/notify'

export const dynamic = 'force-dynamic'

const STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE']
const PRIORITIES = ['LOW', 'MED', 'HIGH']

/** Task model has no priority column — stored in the Setting KV */
const prioSetting = (id: string) => `task:priority:${id}`

async function savePriority(id: string, priority: string) {
  await db.setting.upsert({
    where: { key: prioSetting(id) },
    create: { key: prioSetting(id), value: JSON.stringify(priority) },
    update: { value: JSON.stringify(priority) },
  })
}

async function prioritiesFor(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const rows = await db.setting.findMany({ where: { key: { in: ids.map(prioSetting) } } })
  return new Map(rows.map((r) => [r.key.slice('task:priority:'.length), safeJson<string>(r.value, 'MED')]))
}

/** GET /api/tasks[?mine=1] → {tasks} */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const mine = req.nextUrl.searchParams.get('mine') === '1'

  const tasks = await db.task.findMany({
    where: mine ? { OR: [{ assignedToId: me.id }, { createdById: me.id }] } : undefined,
    orderBy: [{ createdAt: 'desc' }],
    take: 300,
  })

  const assigneeIds = [...new Set(tasks.map((t) => t.assignedToId).filter((x): x is string => !!x))]
  const assignees = assigneeIds.length
    ? await db.user.findMany({ where: { id: { in: assigneeIds } } })
    : []
  const assigneeMap = new Map(assignees.map((a) => [a.id, a]))
  const prioMap = await prioritiesFor(tasks.map((t) => t.id))

  return ok({
    tasks: tasks.map((t) => {
      const a = t.assignedToId ? assigneeMap.get(t.assignedToId) : undefined
      return {
        id: t.id,
        title: t.title,
        description: t.detail,
        priority: prioMap.get(t.id) || 'MED',
        points: t.points,
        dueDate: t.dueDate,
        status: t.status,
        completedAt: t.completedAt,
        assignee: a
          ? { id: a.id, fullName: a.fullName, honorific: a.honorific, role: a.role }
          : null,
        assigneeName: t.assignedToName || null,
        createdByName: t.createdByName || null,
      }
    }),
  })
}

/**
 * POST /api/tasks — live frontend body:
 * {title, description?, assigneeId, priority(LOW|MED|HIGH), points, dueDate?}
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => ({}))) as {
    title?: string
    description?: string
    detail?: string
    assigneeId?: string
    assignedToId?: string
    priority?: string
    points?: number
    dueDate?: string
  }

  const title = String(body.title || '').trim()
  if (title.length < 2) return fail('عنوان الزامی است')

  const assigneeId = String(body.assigneeId ?? body.assignedToId ?? '') || me.id
  const assignee = await db.user.findUnique({ where: { id: assigneeId } })
  if (!assignee) return fail('مسئول وظیفه یافت نشد', 404)

  const priority = PRIORITIES.includes(String(body.priority)) ? String(body.priority) : 'MED'
  const points = clampInt(body.points, 0, 100, 0)
  const detail =
    body.description !== undefined
      ? String(body.description || '').trim() || null
      : body.detail
        ? String(body.detail).trim()
        : null

  const task = await db.task.create({
    data: {
      title,
      detail,
      assignedToId: assignee.id,
      assignedToName: displayName(assignee),
      createdById: me.id,
      createdByName: displayName(me),
      dueDate: body.dueDate ? String(body.dueDate) : null,
      status: 'OPEN',
      points,
    },
  })
  await savePriority(task.id, priority)

  if (assignee.id !== me.id) {
    await notify({
      userId: assignee.id,
      kind: 'task',
      severity: 'info',
      title: 'وظیفه جدید',
      body: `${displayName(me)} وظیفه‌ای برای شما ثبت کرد: ${title}`,
      go: '#/tasks/tasks',
    })
  }

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'task_create',
    actionLabel: 'ثبت وظیفه',
    category: 'tasks',
    detail: `${title} → ${displayName(assignee)}`,
    entityId: task.id,
  })

  return ok({ task: { id: task.id } })
}

/** PATCH /api/tasks {id, status} — status cycle OPEN → IN_PROGRESS → DONE */
export async function PATCH(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => ({}))) as {
    id?: string
    status?: string
    title?: string
    description?: string
    priority?: string
    dueDate?: string
  }
  const id = String(body.id || '')
  const task = await db.task.findUnique({ where: { id } })
  if (!task) return fail('وظیفه یافت نشد', 404)

  const canEdit =
    isManager(me) || task.assignedToId === me.id || task.createdById === me.id
  if (!canEdit) return fail('اجازه تغییر این وظیفه را ندارید', 403)

  // status-only flow from the live UI
  if (body.status) {
    const status = String(body.status)
    if (!STATUSES.includes(status)) return fail('وضعیت نامعتبر است')

    const becomingDone = status === 'DONE' && task.status !== 'DONE'
    const completedAt = status === 'DONE' ? (task.completedAt ?? new Date()) : null

    await db.task.update({ where: { id }, data: { status, completedAt } })

    // completing your own task awards its points (once)
    if (becomingDone && task.assignedToId === me.id && task.points > 0) {
      await db.user.update({ where: { id: me.id }, data: { points: { increment: task.points } } })
      await logActivity({
        userId: me.id,
        userName: displayName(me),
        action: 'task_complete',
        actionLabel: 'انجام وظیفه',
        category: 'tasks',
        detail: `${task.title} (+${task.points} امتیاز)`,
        entityId: id,
      })
    } else {
      await logActivity({
        userId: me.id,
        userName: displayName(me),
        action: 'task_status',
        actionLabel: 'تغییر وضعیت وظیفه',
        category: 'tasks',
        detail: `${task.title} → ${status}`,
        entityId: id,
      })
    }

    return ok({ id, status })
  }

  // generic field update (title/description/priority/dueDate)
  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = String(body.title).trim()
  if (body.description !== undefined) data.detail = String(body.description || '').trim() || null
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? String(body.dueDate) : null
  if (Object.keys(data).length > 0) await db.task.update({ where: { id }, data })
  if (body.priority && PRIORITIES.includes(body.priority)) await savePriority(id, body.priority)

  return ok({ id })
}

/** DELETE /api/tasks?id= — own tasks or managers */
export async function DELETE(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const id = req.nextUrl.searchParams.get('id') || ''
  const task = await db.task.findUnique({ where: { id } })
  if (!task) return fail('وظیفه یافت نشد', 404)

  if (!isManager(me) && task.assignedToId !== me.id && task.createdById !== me.id) {
    return fail('اجازه حذف این وظیفه را ندارید', 403)
  }

  await db.task.delete({ where: { id } })
  await db.setting.deleteMany({ where: { key: prioSetting(id) } })
  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'task_delete',
    actionLabel: 'حذف وظیفه',
    category: 'tasks',
    detail: task.title,
    entityId: id,
  })
  return ok({ deleted: id })
}
