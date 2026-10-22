import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { displayName, notify } from '@/lib/notify'

export const dynamic = 'force-dynamic'

export const TASK_ORDER_STATUSES = ['assigned', 'in_progress', 'blocked', 'done', 'verified', 'cancelled']
export const TASK_ORDER_CATEGORIES = ['general', 'layout', 'cleanliness', 'dates', 'labels', 'receiving', 'customer', 'other']
export const TASK_ORDER_PRIORITIES = ['low', 'normal', 'high', 'urgent']

/** notification severity mapped from order priority */
export function prioritySeverity(priority: string): string {
  if (priority === 'urgent') return 'critical'
  if (priority === 'high') return 'important'
  return 'info'
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** public projection of a TaskOrder row (used here and by [id]) */
export function orderOut(o: {
  id: string
  title: string
  instructions: string
  requirements: string | null
  createdById: string
  createdByName: string
  assigneeId: string
  assigneeName: string
  category: string
  relatedBlock: string | null
  dueDate: string | null
  dueTime: string | null
  priority: string
  status: string
  progressNote: string | null
  blockedReason: string | null
  doneAt: Date | null
  verifiedById: string | null
  verifiedByName: string | null
  verifiedAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: o.id,
    title: o.title,
    instructions: o.instructions,
    requirements: o.requirements,
    category: o.category,
    relatedBlock: o.relatedBlock,
    dueDate: o.dueDate,
    dueTime: o.dueTime,
    priority: o.priority,
    status: o.status,
    progressNote: o.progressNote,
    blockedReason: o.blockedReason,
    doneAt: o.doneAt,
    verifiedAt: o.verifiedAt,
    verifiedBy: o.verifiedById ? { id: o.verifiedById, name: o.verifiedByName } : null,
    sender: { id: o.createdById, name: o.createdByName },
    assignee: { id: o.assigneeId, name: o.assigneeName },
    assigneeId: o.assigneeId,
    createdById: o.createdById,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  }
}

/**
 * GET /api/task-orders?scope=mine|all&status=&staff=&category=
 * → {orders:[...]}
 * Non-managers see ONLY their own orders (assigneeId == me); scope forced to mine.
 * Managers default to all + filters.
 */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const sp = req.nextUrl.searchParams
  const scope = sp.get('scope') || ''
  const status = sp.get('status') || ''
  const staff = sp.get('staff') || ''
  const category = sp.get('category') || ''

  const where: Record<string, unknown> = {}
  if (isManager(me)) {
    if (scope === 'mine') where.OR = [{ assigneeId: me.id }, { createdById: me.id }]
  } else {
    // personal visibility — staff sees only what was assigned to them
    where.assigneeId = me.id
  }
  if (status && TASK_ORDER_STATUSES.includes(status)) where.status = status
  if (staff) where.assigneeId = staff
  if (category && TASK_ORDER_CATEGORIES.includes(category)) where.category = category

  const orders = await db.taskOrder.findMany({
    where: where as never,
    orderBy: [{ createdAt: 'desc' }],
    take: 500,
  })

  return ok({ orders: orders.map(orderOut) })
}

/**
 * POST /api/task-orders — managers only.
 * {title, instructions, requirements?, assigneeId, category, relatedBlock?, dueDate?, dueTime?, priority}
 * → {order} + bell/realtime notification for the assignee.
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!isManager(me)) return fail('فقط مدیران می‌توانند دستور کار ارسال کنند', 403)

  const body = (await req.json().catch(() => ({}))) as {
    title?: string
    instructions?: string
    requirements?: string
    assigneeId?: string
    category?: string
    relatedBlock?: string
    dueDate?: string
    dueTime?: string
    priority?: string
  }

  const title = String(body.title || '').trim()
  if (title.length < 2) return fail('عنوان دستور کار الزامی است')

  const instructions = String(body.instructions || '').trim()
  if (!instructions) return fail('نحوه انجام را توضیح دهید')

  const assigneeId = String(body.assigneeId || '')
  const assignee = await db.user.findUnique({ where: { id: assigneeId } })
  if (!assignee || !assignee.active) return fail('مسئول انجام دستور کار یافت نشد', 404)

  const category = TASK_ORDER_CATEGORIES.includes(String(body.category)) ? String(body.category) : 'general'
  const priority = TASK_ORDER_PRIORITIES.includes(String(body.priority)) ? String(body.priority) : 'normal'

  const dueDate = body.dueDate ? String(body.dueDate).trim() : null
  if (dueDate && !DATE_RE.test(dueDate)) return fail('تاریخ سررسید را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')
  const dueTime = body.dueTime ? String(body.dueTime).trim() : null
  if (dueTime && !TIME_RE.test(dueTime)) return fail('ساعت سررسید را به شکل ۱۸:۳۰ وارد کنید')

  const requirements = body.requirements ? String(body.requirements).trim() || null : null
  const relatedBlock = body.relatedBlock ? String(body.relatedBlock).trim() || null : null

  const order = await db.taskOrder.create({
    data: {
      title,
      instructions,
      requirements,
      createdById: me.id,
      createdByName: displayName(me),
      assigneeId: assignee.id,
      assigneeName: displayName(assignee),
      category,
      relatedBlock,
      dueDate,
      dueTime,
      priority,
      status: 'assigned',
    },
  })

  // notify the assignee (skip self-assignment)
  if (assignee.id !== me.id) {
    await notify({
      userId: assignee.id,
      kind: 'task',
      severity: prioritySeverity(priority),
      title: 'دستور کار جدید',
      body: `${displayName(me)} دستور کار «${title}» را برای شما ثبت کرد${dueDate ? ` — سررسید ${dueDate}${dueTime ? ` ساعت ${dueTime}` : ''}` : ''}`,
      go: '#/tasks/tasks',
    })
  }

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'taskorder.create',
    actionLabel: 'دستور کار',
    category: 'tasks',
    detail: `${title} → ${displayName(assignee)} (${category}/${priority})`,
    entityId: order.id,
  })

  return ok({ order: orderOut(order) })
}
