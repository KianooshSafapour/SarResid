import { db } from '@/lib/db'
import { ok, safeJson } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { todayJalaliDash, addDaysJalaliDash, jalaliDashWeekdayName, formatJalaliDash, parseJalaliDash, JALALI_MONTHS } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/** Cheque statuses considered settled (no longer actionable) */
const SETTLED_CHEQUE = ['CLEARED', 'DONE', 'REJECTED', 'BOUNCED', 'CANCELLED']
const ACTIVE_ORDER = ['SUBMITTED', 'APPROVED', 'RECEIVING', 'RECEIVED']
const NOT_YET_RECEIVED = ['SUBMITTED', 'APPROVED', 'RECEIVING']

/** GET /api/reports/briefing — managers only; others get {denied:true} */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return ok({ denied: true })
  if (!isManager(user)) return ok({ denied: true })

  const today = todayJalaliDash()
  const yesterday = addDaysJalaliDash(today, -1)
  const in7days = addDaysJalaliDash(today, 7)

  const [handoverRow, templates, yesterdayStates, problems, cheques, orders, returns, payments, wasteRows, priceChecks, users, lowStockProducts, shiftAssignments, returnRows] =
    await Promise.all([
      db.shiftReport.findFirst({ where: { type: 'HANDOVER' }, orderBy: { createdAt: 'desc' } }),
      db.checklistTemplate.findMany({ where: { active: true, frequency: 'DAILY' } }),
      db.checklistState.findMany({ where: { day: yesterday } }),
      db.problem.findMany({ where: { status: { not: 'RESOLVED' } }, orderBy: { createdAt: 'desc' } }),
      db.cheque.findMany(),
      db.order.findMany({ where: { status: { in: ACTIVE_ORDER } } }),
      db.returnRequest.findMany(),
      db.payment.findMany(),
      db.wasteRecord.findMany({ where: { date: yesterday } }),
      db.priceCheck.findMany({ where: { date: yesterday } }),
      db.user.findMany(),
      db.product.findMany({ where: { stock: { lte: 5 } }, orderBy: { stock: 'asc' }, take: 6, select: { name: true, stock: true, unit: true } }),
      db.shiftAssignment.findMany({ where: { date: today } }),
      db.returnRequest.findMany({ select: { id: true, createdAt: true, totalAmount: true, status: true } }),
    ])

  const userById = new Map(users.map((u) => [u.id, u]))

  // ---- handover report
  let handover: { date: string; by: string; fields: Record<string, string>; note: string | null } | null = null
  if (handoverRow) {
    const raw = safeJson<Record<string, unknown>>(handoverRow.dataJson, {})
    const fields: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string' && v.trim()) fields[k] = v.trim()
    }
    const by = userById.get(handoverRow.userId)
    handover = {
      date: handoverRow.date,
      by: by ? `${by.honorific ? by.honorific + ' ' : ''}${by.fullName}`.trim() : handoverRow.userId,
      fields,
      note: handoverRow.note,
    }
  }

  // ---- today's checklists
  const todayStates = await db.checklistState.findMany({ where: { day: today } })
  const stateByTemplate = new Map(todayStates.map((s) => [s.templateId, s]))
  const checklistProgress = templates.map((t) => {
    const state = stateByTemplate.get(t.id)
    const items = safeJson<Array<{ done?: boolean }>>(state?.itemsJson ?? t.itemsJson, [])
    const done = items.filter((i) => i?.done).length
    const total = items.length
    const assignee = state?.userId ? (userById.get(state.userId)?.fullName ?? null) : null
    return {
      title: t.title,
      phase: t.phase,
      total,
      done,
      completed: !!state?.completedAt,
      assignee,
    }
  })
  const checklistYesterdayCompleted = yesterdayStates.filter((s) => s.completedAt).length

  // ---- cheques
  const unsettled = cheques.filter((c) => !SETTLED_CHEQUE.includes(c.status))
  const overdue = unsettled.filter((c) => c.dueDate < today)
  const due = unsettled.filter((c) => c.dueDate >= today && c.dueDate <= in7days)

  // ---- orders
  const awaitingApproval = orders.filter((o) => o.status === 'SUBMITTED')
  const overdueOrders = orders.filter((o) => NOT_YET_RECEIVED.includes(o.status) && o.deliveryDate && o.deliveryDate < today)
  const inTransit = orders.filter((o) => o.status === 'APPROVED' || (o.status === 'RECEIVING' && (!o.deliveryDate || o.deliveryDate >= today)))

  // ---- returns
  const pendingReturns = returns.filter((r) => r.status === 'pending')
  const awaitingPayment = returns.filter((r) => r.status === 'approved')
  const pendingAmount = pendingReturns.reduce((s, r) => s + r.totalAmount, 0)

  // ---- yesterday activity
  const yesterdayReturns = returnRows.filter((r) => formatJalaliDash(r.createdAt) === yesterday)
  const yesterdayPayments = payments.filter((p) => formatJalaliDash(p.createdAt) === yesterday)
  const yesterdayWasteValue = wasteRows.reduce((s, w) => s + w.estValue, 0)
  const priceCheckReds = priceChecks.filter((c) => !c.ok).length

  const lowStockCount = await db.product.count({ where: { stock: { lte: 5 } } })

  return ok({
    today,
    todayLong: (() => {
      const { jd, jm, jy } = parseJalaliDash(today)
      return `${jd} ${JALALI_MONTHS[jm - 1]} ${jy}`
    })(),
    weekday: jalaliDashWeekdayName(today),
    handover,
    checklistProgress,
    checklistYesterdayCompleted,
    problems: problems.map((p) => ({
      date: p.date,
      problem: p.problem,
      action: p.action,
      responsible: p.responsible,
      status: p.status,
      reporter: p.reporterId ? (userById.get(p.reporterId)?.fullName ?? null) : null,
    })),
    cheques: {
      overdue: overdue.map((c) => ({ id: c.id, number: c.number, amount: c.amount, recipient: c.recipient, dueDate: c.dueDate, status: c.status })),
      due: due.map((c) => ({ id: c.id, number: c.number, amount: c.amount, recipient: c.recipient, dueDate: c.dueDate, status: c.status })),
      overdueAmount: overdue.reduce((s, c) => s + c.amount, 0),
      dueAmount: due.reduce((s, c) => s + c.amount, 0),
    },
    orders: {
      awaitingApproval: awaitingApproval.map((o) => ({ id: o.id, supplier: o.supplierName, deliveryDate: o.deliveryDate, status: o.status })),
      overdue: overdueOrders.map((o) => ({ id: o.id, supplier: o.supplierName, deliveryDate: o.deliveryDate, status: o.status })),
      inTransit: inTransit.map((o) => ({ id: o.id, supplier: o.supplierName, deliveryDate: o.deliveryDate, status: o.status })),
    },
    returns: {
      pending: pendingReturns.length,
      awaitingPayment: awaitingPayment.length,
      amount: pendingAmount,
    },
    lowStock: {
      count: lowStockCount,
      sample: lowStockProducts,
    },
    todayShifts: shiftAssignments
      .filter((a) => a.shift !== 'OFF')
      .map((a) => ({
        id: a.id,
        userId: a.userId,
        name: userById.get(a.userId)?.fullName ?? a.userId,
        shiftType: a.shift,
        shift: a.shift,
      })),
    yesterday: {
      returns: {
        count: yesterdayReturns.length,
        amount: yesterdayReturns.reduce((s, r) => s + r.totalAmount, 0),
      },
      payments: {
        count: yesterdayPayments.length,
        amount: yesterdayPayments.reduce((s, p) => s + p.amount, 0),
      },
      waste: {
        count: wasteRows.length,
        value: yesterdayWasteValue,
      },
      priceCheckReds,
    },
  })
}
