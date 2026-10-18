import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const LEAVE_TYPES = ['HOURLY', 'DAILY', 'SICK', 'UNPAID']

/** GET /api/hr/leaves → {manager, items} */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const [leaves, users] = await Promise.all([
    db.leaveRequest.findMany({ orderBy: { createdAt: 'desc' } }),
    db.user.findMany(),
  ])
  const userById = new Map(users.map((u) => [u.id, u]))

  const items = leaves.map((l) => {
    const u = l.userId ? userById.get(l.userId) : undefined
    return {
      id: l.id,
      userId: l.userId,
      userName: u?.fullName ?? l.userId,
      userRole: u?.role ?? null,
      type: l.type,
      fromDate: l.fromDate,
      toDate: l.toDate,
      days: l.days,
      hours: l.hours && l.hours > 0 ? l.hours : null,
      reason: l.reason,
      status: l.status,
      responseNote: l.responseNote,
      approverName: l.approverName,
      createdAt: l.createdAt,
    }
  })

  return ok({ manager: isManager(user), items })
}

/** POST /api/hr/leaves {type, fromDate, toDate?, days?, hours?, reason?} */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const body = await req.json().catch(() => null)
  const type = String(body?.type || '')
  if (!LEAVE_TYPES.includes(type)) return fail('نوع مرخصی نامعتبر است')

  const fromDate = typeof body?.fromDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.fromDate) ? body.fromDate : ''
  if (!fromDate) return fail('تاریخ شروع را وارد کنید')

  let toDate = fromDate
  let days = 1
  let hours = 0

  if (type === 'HOURLY') {
    hours = Number(body?.hours)
    if (!Number.isFinite(hours) || hours <= 0 || hours > 8) return fail('ساعت مرخصی بین ۰٫۲۵ تا ۸ باشد')
    days = 1
  } else {
    toDate = typeof body?.toDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.toDate) ? body.toDate : ''
    if (!toDate) return fail('تاریخ پایان را وارد کنید')
    const d = Number(body?.days)
    days = Number.isFinite(d) && d > 0 ? Math.min(90, Math.round(d)) : 1
  }

  const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : null

  const leave = await db.leaveRequest.create({
    data: { userId: user.id, type, fromDate, toDate, days, hours, reason, status: 'PENDING' },
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'leave.create',
    actionLabel: 'مرخصی',
    category: 'leave',
    detail: `${type === 'HOURLY' ? `${hours} ساعت` : `${days} روز`} از ${fromDate}${reason ? ` — ${reason}` : ''}`,
    entityId: leave.id,
  })

  return ok({ id: leave.id })
}
