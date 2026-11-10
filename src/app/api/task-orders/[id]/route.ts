import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { displayName, notify } from '@/lib/notify'
import { orderOut, prioritySeverity, TASK_ORDER_CATEGORIES, TASK_ORDER_PRIORITIES } from '../route'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Persian status label used in notifications/logs */
const STATUS_FA: Record<string, string> = {
  assigned: 'ارسال‌شده',
  in_progress: 'در حال انجام',
  blocked: 'مشکل‌دار',
  done: 'انجام‌شده',
  verified: 'تأییدشده',
  cancelled: 'لغو‌شده',
}

/**
 * PATCH /api/task-orders/[id]
 * Action-based flow (role rules):
 *  - assignee staff:  {action:'start'|'done'|'block', progressNote?, blockedReason?}
 *  - sender/manager:   {action:'verify'} → verified (verifiedBy/At)
 *  - manager only:     {action:'cancel'}
 * No action key = free field edit (sender or manager only) — may re-assign.
 * Status flow: assigned → in_progress → done → verified | blocked | cancelled.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const { id } = await ctx.params
  const order = await db.taskOrder.findUnique({ where: { id } })
  if (!order) return fail('دستور کار یافت نشد', 404)

  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    title?: string
    instructions?: string
    requirements?: string
    assigneeId?: string
    category?: string
    relatedBlock?: string
    dueDate?: string
    dueTime?: string
    priority?: string
    progressNote?: string
    blockedReason?: string
  }

  const action = body.action ? String(body.action) : ''
  const isAssignee = order.assigneeId === me.id
  const isSender = order.createdById === me.id
  const manager = isManager(me)
  const sender = await db.user.findUnique({ where: { id: order.createdById } })
  const senderName = order.createdByName
  // notify the "other party": actions by assignee → sender; actions by manager → assignee
  const notifySender = (title: string, bodyText: string, severity = 'info') =>
    sender
      ? notify({ userId: sender.id, kind: 'task', severity, title, body: bodyText, go: '#/tasks/tasks' })
      : Promise.resolve(null)
  const notifyAssignee = (title: string, bodyText: string, severity = 'info') =>
    notify({
      userId: order.assigneeId,
      kind: 'task',
      severity,
      title,
      body: bodyText,
      go: '#/tasks/tasks',
    })

  const log = (act: string, detail: string) =>
    logActivity({
      userId: me.id,
      userName: displayName(me),
      action: act,
      actionLabel: 'دستور کار',
      category: 'tasks',
      detail: `${order.title} — ${detail}`,
      entityId: id,
    })

  if (action === 'start') {
    if (!isAssignee) return fail('فقط مسئول انجام دستور کار می‌تواند آن را شروع کند', 403)
    if (order.status === 'in_progress') return fail('این دستور کار قبلاً شروع شده است')
    if (order.status === 'done' || order.status === 'verified') return fail('دستور کار انجام شده است')
    if (order.status === 'cancelled') return fail('دستور کار لغو شده است')
    if (order.status === 'blocked') {
      // restarting clears the block reason
      const progressNote = body.progressNote ? String(body.progressNote).trim() || null : order.progressNote
      await db.taskOrder.update({
        where: { id },
        data: { status: 'in_progress', progressNote, blockedReason: null },
      })
      await notifySender('شروع مجدد دستور کار', `${order.title} — ${displayName(me)} پس از رفع مشکل، کار را ادامه داد`)
      await log('taskorder.start', 'شروع (پس از مشکل)')
      return ok({ id, status: 'in_progress' })
    }
    const progressNote = body.progressNote ? String(body.progressNote).trim() || null : null
    await db.taskOrder.update({ where: { id }, data: { status: 'in_progress', progressNote } })
    await notifySender('شروع دستور کار', `${order.title} — ${displayName(me)} کار را شروع کرد`)
    await log('taskorder.start', 'شروع')
    return ok({ id, status: 'in_progress' })
  }

  if (action === 'done') {
    if (!isAssignee) return fail('فقط مسئول انجام دستور کار می‌تواند آن را تکمیل کند', 403)
    if (order.status !== 'in_progress') return fail('ابتدا دستور کار را شروع کنید')
    const progressNote = body.progressNote ? String(body.progressNote).trim() || null : order.progressNote
    const updated = await db.taskOrder.update({
      where: { id },
      data: { status: 'done', doneAt: new Date(), progressNote },
    })
    await notifySender('انجام دستور کار', `${order.title} — ${displayName(me)} انجام آن را ثبت کرد. منتظر تأیید شماست.`, 'important')
    await log('taskorder.done', 'انجام شد')
    return ok({ id, status: updated.status, doneAt: updated.doneAt })
  }

  if (action === 'block') {
    if (!isAssignee) return fail('فقط مسئول انجام دستور کار می‌تواند مشکل را ثبت کند', 403)
    if (order.status === 'blocked') return fail('مشکل این دستور کار قبلاً ثبت شده است')
    if (order.status !== 'assigned' && order.status !== 'in_progress') {
      return fail('دستور کار در وضعیت فعلی قابل ثبت مشکل نیست')
    }
    const blockedReason = String(body.blockedReason || '').trim()
    if (blockedReason.length < 3) return fail('دلیل مشکل را بنویسید')
    await db.taskOrder.update({ where: { id }, data: { status: 'blocked', blockedReason } })
    await notifySender('مشکل در دستور کار', `${order.title} — ${displayName(me)}: ${blockedReason}`, 'warning')
    await log('taskorder.block', `مشکل: ${blockedReason}`)
    return ok({ id, status: 'blocked' })
  }

  if (action === 'verify') {
    if (!manager && !isSender) return fail('فقط فرستنده یا مدیران می‌توانند تأیید کنند', 403)
    if (order.status !== 'done') return fail('برای تأیید، دستور کار باید انجام‌شده باشد')
    const updated = await db.taskOrder.update({
      where: { id },
      data: { status: 'verified', verifiedById: me.id, verifiedByName: displayName(me), verifiedAt: new Date() },
    })
    await notifyAssignee('تأیید دستور کار', `${order.title} — ${displayName(me)} انجام آن را تأیید کرد. آفرین!`, 'important')
    await log('taskorder.verify', `تأیید توسط ${displayName(me)}`)
    return ok({ id, status: updated.status, verifiedAt: updated.verifiedAt })
  }

  if (action === 'cancel') {
    if (!manager) return fail('فقط مدیران می‌توانند دستور کار را لغو کنند', 403)
    if (order.status === 'cancelled') return fail('دستور کار قبلاً لغو شده است')
    if (order.status === 'verified') return fail('دستور کار تأیید‌شده قابل لغو نیست')
    const note = body.blockedReason ? String(body.blockedReason).trim() : null
    await db.taskOrder.update({
      where: { id },
      data: { status: 'cancelled', blockedReason: note ?? order.blockedReason },
    })
    await notifyAssignee('لغو دستور کار', `${order.title} — ${displayName(me)} این دستور کار را لغو کرد`, 'warning')
    await log('taskorder.cancel', 'لغو')
    return ok({ id, status: 'cancelled' })
  }

  if (action) return fail('عملیات نامعتبر است')

  // ---- free field edit (sender or manager) ----
  if (!manager && !isSender) return fail('اجازه ویرایش این دستور کار را ندارید', 403)

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) {
    const title = String(body.title || '').trim()
    if (title.length < 2) return fail('عنوان دستور کار الزامی است')
    data.title = title
  }
  if (body.instructions !== undefined) {
    const instructions = String(body.instructions || '').trim()
    if (!instructions) return fail('نحوه انجام را توضیح دهید')
    data.instructions = instructions
  }
  if (body.requirements !== undefined) data.requirements = String(body.requirements || '').trim() || null
  if (body.category !== undefined && TASK_ORDER_CATEGORIES.includes(String(body.category))) {
    data.category = String(body.category)
  }
  if (body.priority !== undefined && TASK_ORDER_PRIORITIES.includes(String(body.priority))) {
    data.priority = String(body.priority)
  }
  if (body.relatedBlock !== undefined) data.relatedBlock = String(body.relatedBlock || '').trim() || null
  if (body.dueDate !== undefined) {
    const dueDate = body.dueDate ? String(body.dueDate).trim() : null
    if (dueDate && !DATE_RE.test(dueDate)) return fail('تاریخ سررسید را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')
    data.dueDate = dueDate
  }
  if (body.dueTime !== undefined) {
    const dueTime = body.dueTime ? String(body.dueTime).trim() : null
    if (dueTime && !TIME_RE.test(dueTime)) return fail('ساعت سررسید را به شکل ۱۸:۳۰ وارد کنید')
    data.dueTime = dueTime
  }

  let reassigned = false
  if (body.assigneeId !== undefined && String(body.assigneeId) !== order.assigneeId) {
    const next = await db.user.findUnique({ where: { id: String(body.assigneeId || '') } })
    if (!next || !next.active) return fail('مسئول جدید یافت نشد', 404)
    data.assigneeId = next.id
    data.assigneeName = displayName(next)
    reassigned = true
    if (next.id === order.createdById) {
      // sender took it over
    }
    if (next.id !== me.id) {
      await notify({
        userId: next.id,
        kind: 'task',
        severity: prioritySeverity(String(data.priority ?? order.priority)),
        title: 'دستور کار برای شما',
        body: `${displayName(me)} دستور کار «${order.title}» را به شما واگذار کرد`,
        go: '#/tasks/tasks',
      })
    }
  }

  if (Object.keys(data).length === 0) return fail('چیزی برای ویرایش ارسال نشده است')

  const updated = await db.taskOrder.update({ where: { id }, data: data as never })
  await log('taskorder.edit', `ویرایش${reassigned ? ` و واگذاری به ${updated.assigneeName}` : ''} (وضعیت: ${STATUS_FA[updated.status] || updated.status})`)
  return ok({ order: orderOut(updated) })
}

/** GET /api/task-orders/[id] — sender, assignee or managers */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const { id } = await ctx.params
  const order = await db.taskOrder.findUnique({ where: { id } })
  if (!order) return fail('دستور کار یافت نشد', 404)
  if (!isManager(me) && order.assigneeId !== me.id && order.createdById !== me.id) {
    return fail('اجازه مشاهده این دستور کار را ندارید', 403)
  }
  return ok({ order: orderOut(order) })
}
