import { db } from '@/lib/db'
import { ok, fail, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { todayJalaliDash, addDaysJalaliDash, jalaliToDate, parseJalaliDash } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/** [start, end) UTC range covering one Jalali day (Tehran, UTC+3:30). */
function jalaliDayRange(day: string): [Date, Date] {
  const { jy, jm, jd } = parseJalaliDash(day)
  const noon = jalaliToDate(jy, jm, jd) // 12:00 local (UTC) of that day
  const start = new Date(noon.getTime() - 15.5 * 3600000) // 00:00 Tehran
  return [start, new Date(start.getTime() + 24 * 3600000)]
}

/** GET /api/home — میزکار من dashboard payload */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const today = todayJalaliDash()
  const weekEnd = addDaysJalaliDash(today, 7)
  const [dayStart, dayEnd] = jalaliDayRange(today)

  const [
    templates,
    states,
    myTasks,
    wallPosts,
    pendingReturns,
    awaitingPayment,
    myReturnsToday,
    marginInvoices,
    chequesDue,
    activeOrders,
    receivingQueue,
    lowStock,
    zonesTotal,
    zonesDoneToday,
    shiftAssignments,
    topUsers,
  ] = await Promise.all([
    db.checklistTemplate.findMany({
      where: { active: true, OR: [{ roleKey: null }, { roleKey: me.role }] },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    }),
    db.checklistState.findMany({ where: { day: today } }),
    db.task.findMany({
      where: { assignedToId: me.id, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    db.wallPost.findMany({ orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], take: 5 }),
    db.returnRequest.count({ where: { status: { in: ['pending', 'approved'] } } }),
    db.returnRequest.count({ where: { status: 'approved' } }),
    db.returnRequest.count({
      where: { cashierId: me.id, createdAt: { gte: dayStart, lt: dayEnd } },
    }),
    db.marginInvoice.count({ where: { archived: false } }),
    db.cheque.count({
      where: {
        dueDate: { gte: today, lte: weekEnd },
        status: { notIn: ['DONE', 'REJECTED', 'CLEARED', 'BOUNCED'] },
      },
    }),
    db.order.count({
      where: { status: { in: ['SUBMITTED', 'APPROVED', 'RECEIVING', 'RECEIVED', 'VERIFIED'] } },
    }),
    db.order.count({ where: { status: 'RECEIVING' } }),
    db.product.count({ where: { active: true, stock: { lte: 5 } } }),
    db.zone.count(),
    db.zoneCount.count({ where: { date: today, status: 'done' } }),
    db.shiftAssignment.findMany({ where: { date: today } }),
    db.user.findMany({
      where: { active: true },
      orderBy: [{ points: 'desc' }, { createdAt: 'asc' }],
      take: 5,
      select: {
        id: true,
        fullName: true,
        honorific: true,
        points: true,
        role: true,
        createdAt: true,
      },
    }),
  ])

  // task priorities live in the Setting KV (Task model has no priority column)
  const prioRows = myTasks.length
    ? await db.setting.findMany({
        where: { key: { in: myTasks.map((t) => `task:priority:${t.id}`) } },
      })
    : []
  const prioMap = new Map(prioRows.map((r) => [r.key, safeJson<string>(r.value, 'MED')]))

  // ---- checklist cards (merge templates with today's state) ----
  const checklistCards = templates.map((t) => {
    const items = safeJson<{ text: string; hint?: string }[]>(t.itemsJson, [])
    const state = states.find((s) => s.templateId === t.id)
    const stateItems = state ? safeJson<{ done?: boolean }[]>(state.itemsJson, []) : []
    const done = stateItems.filter((i) => !!i.done).length
    return {
      id: t.id,
      title: t.title,
      phase: t.phase === '' ? null : t.phase,
      frequency: t.frequency,
      total: items.length,
      done,
      completed: !!state?.completedAt,
      points: t.points,
    }
  })

  // ---- today's shifts with user info ----
  const shiftUserIds = shiftAssignments.map((s) => s.userId)
  const shiftUsers = shiftUserIds.length
    ? await db.user.findMany({ where: { id: { in: shiftUserIds } } })
    : []
  const userMap = new Map(shiftUsers.map((u) => [u.id, u]))
  const todayShifts = shiftAssignments
    .filter((s) => ['MORNING', 'EVENING', 'NIGHT'].includes(s.shift))
    .map((s) => {
      const u = userMap.get(s.userId)
      return {
        id: s.id,
        shiftType: s.shift,
        shift: s.shift,
        user: u
          ? { id: u.id, fullName: u.fullName, honorific: u.honorific, role: u.role }
          : { id: s.userId, fullName: '—', honorific: '', role: '' },
      }
    })

  // ---- leaderboard + my rank (1..5 when inside top 5, else 0) ----
  const leaderboard = topUsers.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    honorific: u.honorific,
    points: u.points,
    role: u.role,
  }))
  const myRankIdx = leaderboard.findIndex((u) => u.id === me.id)
  const myRank = myRankIdx >= 0 ? myRankIdx + 1 : 0

  return ok({
    today,
    checklistCards,
    myTasks: myTasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.detail,
      priority: prioMap.get(`task:priority:${t.id}`) || 'MED',
      points: t.points,
      dueDate: t.dueDate,
      status: t.status,
    })),
    wall: wallPosts.map((p) => ({
      id: p.id,
      content: p.content,
      pinned: p.pinned,
      authorId: p.authorId,
      likesJson: p.likesJson,
      createdAt: p.createdAt,
    })),
    stats: {
      pendingReturns,
      awaitingPayment,
      myReturnsToday,
      marginInvoices,
      chequesDue,
      activeOrders,
      receivingQueue,
      lowStock,
      zoneCountStatus: { done: zonesDoneToday, total: zonesTotal },
    },
    todayShifts,
    leaderboard,
    myRank,
  })
}
