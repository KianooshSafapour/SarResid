import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { todayJalaliDash, addDaysJalaliDash } from '@/lib/jalali'
import { ensureRealtime } from '@/lib/notify'

export const dynamic = 'force-dynamic'

/** GET /api/app/badges — sidebar badge counts (polled every 30s) */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  // opportunistic watchdog: the badges poll is the app's heartbeat, so it is
  // the perfect place to revive the realtime mini-service after OOM kills
  void ensureRealtime()

  const today = todayJalaliDash()
  const weekEnd = addDaysJalaliDash(today, 7)

  const [returnsPending, ordersWaiting, chequesDue, tasksOpen, messagesUnread] =
    await Promise.all([
      db.returnRequest.count({ where: { status: { in: ['pending', 'approved'] } } }),
      db.order.count({
        where: { status: { in: ['SUBMITTED', 'APPROVED', 'RECEIVING', 'RECEIVED', 'VERIFIED'] } },
      }),
      db.cheque.count({
        where: {
          dueDate: { gte: today, lte: weekEnd },
          status: { notIn: ['DONE', 'REJECTED', 'CLEARED', 'BOUNCED'] },
        },
      }),
      db.task.count({ where: { assignedToId: me.id, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      db.message.count({ where: { toId: me.id, readAt: null } }),
    ])

  return ok({
    returns_pending: returnsPending,
    orders_waiting: ordersWaiting,
    cheques_due: chequesDue,
    tasks_open: tasksOpen,
    messages_unread: messagesUnread,
  })
}
