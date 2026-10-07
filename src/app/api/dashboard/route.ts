import { db } from '@/lib/db'
import { fail, getSessionUser, json } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const today = new Date().toISOString().slice(0, 10)

  const orders = await db.order.findMany({ orderBy: { createdAt: 'desc' } })
  const orderItems = await db.orderItem.findMany()
  const cheques = await db.cheque.findMany({ orderBy: { dueDate: 'asc' } })
  const products = await db.product.findMany({ where: { active: true } })
  const tasks = await db.task.findMany({ orderBy: { createdAt: 'desc' } })
  const wall = await db.wallPost.findMany({ orderBy: { createdAt: 'desc' }, take: 5 })
  const activities = await db.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 12 })
  const users = await db.user.findMany({ where: { active: true }, orderBy: { points: 'desc' } })
  const messages = await db.message.findMany({ where: { toId: me.id, readAt: null } })
  const customerReqs = await db.customerRequest.findMany({ orderBy: { count: 'desc' }, take: 5 })
  const preOrders = await db.preOrder.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })

  const byStatus: Record<string, number> = {}
  for (const o of orders) byStatus[o.status] = (byStatus[o.status] || 0) + 1
  const overdueOrders = orders.filter(
    (o) => ['APPROVED', 'RECEIVING'].includes(o.status) && o.deliveryDate < today
  )
  const todayDeliveries = orders.filter((o) => o.deliveryDate === today && !['DONE', 'CANCELLED', 'DRAFT'].includes(o.status))

  // 14-day order activity series
  const series: { day: string; count: number; amount: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const iso = d.toISOString().slice(0, 10)
    const dayOrders = orders.filter((o) => o.createdAt.toISOString().slice(0, 10) === iso)
    series.push({
      day: iso,
      count: dayOrders.length,
      amount: dayOrders.reduce((s, o) => s + o.totalAmount, 0),
    })
  }

  const lowStock = products.filter((p) => p.stock <= p.reorderLevel)
  const outOfStock = products.filter((p) => p.stock === 0)

  // cheque exposure per week (next 8 weeks)
  const chequeSeries: { week: string; amount: number; count: number }[] = []
  for (let w = 0; w < 8; w++) {
    const start = new Date()
    start.setDate(start.getDate() + w * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    const inWeek = cheques.filter((c) => {
      const due = new Date(c.dueDate + 'T12:00:00')
      return due >= start && due < end && !['CLEARED', 'REJECTED', 'RETURNED'].includes(c.status)
    })
    chequeSeries.push({
      week: start.toISOString().slice(0, 10),
      amount: inWeek.reduce((s, c) => s + c.amount, 0),
      count: inWeek.length,
    })
  }

  const myTasks = tasks.filter((t) => t.assignedToId === me.id && t.status !== 'DONE')
  const pendingCheques = cheques.filter((c) => c.status === 'PENDING_OWNER')
  const signedCheques = cheques.filter((c) => c.status === 'SIGNED')
  const toAccount = orders.filter((o) => o.status === 'VERIFIED')
  const toVerify = orders.filter((o) => o.status === 'RECEIVED')
  const toReceive = orders.filter((o) => ['APPROVED', 'RECEIVING'].includes(o.status))
  const cashierQueue = preOrders.filter((p) => ['NEW', 'CASHIER_EDITED'].includes(p.status))

  // expiring items — recorded at receiving, within the next 14 days
  const activeOrderIds = new Set(orders.filter((o) => !['CANCELLED', 'DRAFT'].includes(o.status)).map((o) => o.id))
  const in14 = new Date()
  in14.setDate(in14.getDate() + 14)
  const in14Iso = in14.toISOString().slice(0, 10)
  const todayIso = new Date().toISOString().slice(0, 10)
  const expiring = orderItems
    .filter((oi) => oi.expiryDate && activeOrderIds.has(oi.orderId) && oi.expiryDate <= in14Iso && oi.status !== 'REJECTED')
    .map((oi) => {
      const days = Math.round((new Date(oi.expiryDate + 'T12:00:00').getTime() - new Date(todayIso + 'T12:00:00').getTime()) / 86400000)
      return { id: oi.id, productName: oi.productName, expiryDate: oi.expiryDate, daysLeft: days, qty: oi.receivedQty ?? oi.qty }
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 8)

  // cheques signed long ago but never delivered — follow up with owner
  const staleSigned = cheques.filter((c) => {
    if (c.status !== 'SIGNED') return false
    const days = Math.round((Date.now() - new Date(c.writtenAt + 'T12:00:00').getTime()) / 86400000)
    return days >= 7
  }).length

  // daily printed-price control (allowed roles): remaining to verify + critical-margin count
  const pcAllowed = ['GM', 'OM', 'ACC', 'OWNER', 'PM'].includes(me.role)
  let priceCheckRemaining = 0
  let priceCheckRed = 0
  if (pcAllowed) {
    const validOrderIds = new Set(orders.filter((o) => o.status !== 'CANCELLED').map((o) => o.id))
    const hist = new Map<string, number[]>()
    for (const oi of orderItems) {
      if (!oi.productId || !validOrderIds.has(oi.orderId) || oi.unitBuyPrice <= 0) continue
      const arr = hist.get(oi.productId) || []
      if (!arr.includes(oi.unitBuyPrice)) arr.push(oi.unitBuyPrice)
      hist.set(oi.productId, arr)
    }
    for (const p of products) {
      if (p.lastPriceCheck === today) continue
      priceCheckRemaining++
      const h = hist.get(p.id) || []
      const cost = h.length ? h[h.length - 1] : p.buyPrice
      const margin = cost > 0 && p.sellPrice > 0 ? ((p.sellPrice - cost) / cost) * 100 : null
      if (margin !== null && margin < 10) priceCheckRed++
    }
  }

  return json({
    me,
    kpi: {
      ordersTotal: orders.length,
      byStatus,
      overdueCount: overdueOrders.length,
      todayDeliveries: todayDeliveries.length,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      pendingCheques: pendingCheques.length,
      pendingChequesAmount: pendingCheques.reduce((s, c) => s + c.amount, 0),
      signedCheques: signedCheques.length,
      toAccountCount: toAccount.length,
      toVerifyCount: toVerify.length,
      toReceiveCount: toReceive.length,
      unreadMessages: messages.length,
      cashierQueue: cashierQueue.length,
      myOpenTasks: myTasks.length,
      expiringCount: expiring.length,
      staleSignedCheques: staleSigned,
      priceCheckRemaining,
      priceCheckRed,
    },
    series,
    chequeSeries,
    overdueOrders: overdueOrders.slice(0, 6).map((o) => ({ id: o.id, code: o.code, providerName: o.providerName, deliveryDate: o.deliveryDate, status: o.status })),
    todayDeliveriesList: todayDeliveries.slice(0, 6).map((o) => ({ id: o.id, code: o.code, providerName: o.providerName, status: o.status })),
    lowStockList: lowStock.slice(0, 8).map((p) => ({ id: p.id, name: p.name, stock: p.stock, reorderLevel: p.reorderLevel, category: p.category })),
    leaderboard: users.slice(0, 6).map((u, i) => ({ rank: i + 1, name: u.name, points: u.points, color: u.color })),
    wall,
    activities,
    customerReqs,
    myTasks: myTasks.slice(0, 6),
    toAccount: toAccount.slice(0, 5).map((o) => ({ id: o.id, code: o.code, providerName: o.providerName, totalAmount: o.totalAmount })),
    pendingChequesList: pendingCheques.slice(0, 5).map((c) => ({ id: c.id, amount: c.amount, recipientName: c.recipientName, dueDate: c.dueDate, orderCode: c.orderCode })),
    expiring,
  })
}
