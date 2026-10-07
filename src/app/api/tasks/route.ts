import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const scope = searchParams.get('scope') || 'mine' // mine | all
  const status = searchParams.get('status') || ''

  const tasks = await db.task.findMany({ orderBy: { createdAt: 'desc' } })
  let list = scope === 'all' ? tasks : tasks.filter((t) => t.assignedToId === me.id)
  if (status) list = list.filter((t) => t.status === status)
  const today = new Date().toISOString().slice(0, 10)
  return json({
    tasks: list.map((t) => ({ ...t, dueToday: t.dueDate === today, overdue: t.dueDate && t.dueDate < today && t.status !== 'DONE' })),
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  if (!body.title || !body.assignedToId) return fail('عنوان و مسئول الزامی است')
  const assignee = await db.user.findUnique({ where: { id: body.assignedToId } })
  const task = await db.task.create({
    data: {
      title: body.title,
      description: body.description || '',
      type: body.type || 'TASK',
      priority: body.priority || 'NORMAL',
      assignedToId: body.assignedToId,
      assignedToName: assignee?.name || '',
      createdById: me.id,
      createdByName: me.name,
      dueDate: body.dueDate || '',
      points: Number(body.points) || 10,
      sopId: body.sopId || null,
    },
  })
  await logActivity(me, 'تعریف وظیفه جدید', 'task', task.id, `${body.title} → ${assignee?.name}`)
  return json({ task }, 201)
}
