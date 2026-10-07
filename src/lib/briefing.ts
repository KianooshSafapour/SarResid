import { db } from '@/lib/db'
import { faNum, formatJalaliFull } from '@/lib/jalali'

export type BriefingData = {
  generatedAt: string
  todayLabel: string
  holiday: { title: string } | null
  teamSize: number
  priceCheck: { total: number; checkedToday: number; remaining: number; red: number; yellow: number; green: number }
  stats: {
    overdueOrders: number
    todayDeliveries: number
    dueCheques: number
    dueChequesAmount: number
    outOfStock: number
    lowStock: number
    expiring: number
    tasksToday: number
    newIdeas: number
    createdYesterday: number
    createdYesterdayAmount: number
    accountedYesterday: number
  }
  overdueList: { code: string; providerName: string; deliveryDate: string; totalAmount: number }[]
  deliveriesList: { code: string; providerName: string; payMethod: string; itemsCount: number }[]
  chequesList: { number: string; amount: number; recipientName: string; dueDate: string; status: string }[]
  stockList: { name: string; stock: number; reorderLevel: number; category: string; providerName: string }[]
  expiringList: { productName: string; qty: number; expiryDate: string; daysLeft: number }[]
  tasksList: { title: string; assignedToName: string; priority: string }[]
  ideasList: { content: string; authorName: string }[]
  requestsList: { productName: string; count: number }[]
  providersToday: string[]
}

/**
 * صبح‌نامه — printable daily morning briefing payload.
 * Shared by GET /api/briefing (live) and POST /api/briefing/save (archive snapshot).
 */
export async function buildBriefing(): Promise<BriefingData> {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

  const [orders, orderItems, cheques, products, tasks, holidays, feedbacks, customerReqs, users, providers] = await Promise.all([
    db.order.findMany({ orderBy: { createdAt: 'desc' } }),
    db.orderItem.findMany(),
    db.cheque.findMany({ orderBy: { dueDate: 'asc' } }),
    db.product.findMany({ where: { active: true } }),
    db.task.findMany({ orderBy: { createdAt: 'desc' } }),
    db.holiday.findUnique({ where: { date: today } }),
    db.feedback.findMany({ orderBy: { createdAt: 'desc' } }),
    db.customerRequest.findMany({ orderBy: { count: 'desc' } }),
    db.user.findMany({ where: { active: true } }),
    db.provider.findMany(),
  ])
  const providerNameOf = (id: string | null) => (id ? providers.find((p) => p.id === id)?.name || '' : '')

  const overdueOrders = orders.filter((o) => ['APPROVED', 'RECEIVING'].includes(o.status) && o.deliveryDate < today)
  const todayDeliveries = orders.filter((o) => o.deliveryDate === today && !['DONE', 'CANCELLED', 'DRAFT'].includes(o.status))
  const dueCheques = cheques.filter((c) => !['CLEARED', 'REJECTED', 'RETURNED'].includes(c.status) && c.dueDate >= today && c.dueDate <= in7)
  const out0 = products.filter((p) => p.stock === 0)
  const low = products.filter((p) => p.stock > 0 && p.stock <= p.reorderLevel)

  const activeOrderIds = new Set(orders.filter((o) => !['CANCELLED', 'DRAFT'].includes(o.status)).map((o) => o.id))
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const expiring = orderItems
    .filter((oi) => oi.expiryDate && activeOrderIds.has(oi.orderId) && oi.expiryDate <= in14 && oi.status !== 'REJECTED')
    .map((oi) => {
      const days = Math.round((new Date(oi.expiryDate + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86400000)
      return { productName: oi.productName, qty: oi.receivedQty ?? oi.qty, expiryDate: oi.expiryDate, daysLeft: days }
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)

  const tasksToday = tasks.filter((t) => !['DONE', 'CANCELLED'].includes(t.status) && t.dueDate && t.dueDate <= today)
  const newIdeas = feedbacks.filter((f) => f.type === 'IDEA' && f.status === 'NEW')

  /* کنترل قیمت چاپ‌شده — آخرین بهای واقعی از اقلام سفارش‌های فعال */
  const activeCostOrderIds = new Set(orders.filter((o) => !['CANCELLED', 'DRAFT'].includes(o.status)).map((o) => o.id))
  const costHist = new Map<string, number[]>()
  for (const oi of orderItems) {
    if (!activeCostOrderIds.has(oi.orderId) || oi.unitBuyPrice <= 0 || !oi.productId) continue
    const arr = costHist.get(oi.productId) || []
    if (!arr.includes(oi.unitBuyPrice)) arr.push(oi.unitBuyPrice)
    costHist.set(oi.productId, arr)
  }
  const marginTone = (m: number) => (m < 10 ? 'red' : m < 25 ? 'yellow' : 'green')
  const pcRows = products.map((p) => {
    const hist = costHist.get(p.id) || []
    const cost = hist.length ? hist[hist.length - 1] : p.buyPrice
    const margin = cost > 0 && p.sellPrice > 0 ? Math.round(((p.sellPrice - cost) / cost) * 1000) / 10 : null
    return { checkedToday: p.lastPriceCheck === today, tone: margin === null ? 'green' : marginTone(margin) }
  })
  const priceCheck = {
    total: pcRows.length,
    checkedToday: pcRows.filter((r) => r.checkedToday).length,
    remaining: pcRows.filter((r) => !r.checkedToday).length,
    red: pcRows.filter((r) => r.tone === 'red').length,
    yellow: pcRows.filter((r) => r.tone === 'yellow').length,
    green: pcRows.filter((r) => r.tone === 'green').length,
  }

  const createdYesterday = orders.filter((o) => o.createdAt.toISOString().slice(0, 10) === yesterday)
  const accountedYesterday = orders.filter((o) => {
    try {
      const h = JSON.parse(o.history || '[]') as { at: string; action: string }[]
      return h.some((e) => e.at.slice(0, 10) === yesterday && (e.action.includes('هلو') || e.action.includes('تسویه')))
    } catch {
      return false
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    todayLabel: formatJalaliFull(today),
    holiday: holidays ? { title: holidays.title } : null,
    teamSize: users.length,
    priceCheck,
    stats: {
      overdueOrders: overdueOrders.length,
      todayDeliveries: todayDeliveries.length,
      dueCheques: dueCheques.length,
      dueChequesAmount: dueCheques.reduce((s, c) => s + c.amount, 0),
      outOfStock: out0.length,
      lowStock: low.length,
      expiring: expiring.length,
      tasksToday: tasksToday.length,
      newIdeas: newIdeas.length,
      createdYesterday: createdYesterday.length,
      createdYesterdayAmount: createdYesterday.reduce((s, o) => s + o.totalAmount, 0),
      accountedYesterday: accountedYesterday.length,
    },
    overdueList: overdueOrders.slice(0, 8).map((o) => ({ code: o.code, providerName: o.providerName, deliveryDate: o.deliveryDate, totalAmount: o.totalAmount })),
    deliveriesList: todayDeliveries.slice(0, 8).map((o) => ({ code: o.code, providerName: o.providerName, payMethod: o.payMethod, itemsCount: orderItems.filter((i) => i.orderId === o.id).length })),
    chequesList: dueCheques.slice(0, 8).map((c) => ({ number: c.number, amount: c.amount, recipientName: c.recipientName, dueDate: c.dueDate, status: c.status })),
    stockList: [...out0, ...low].slice(0, 12).map((p) => ({ name: p.name, stock: p.stock, reorderLevel: p.reorderLevel, category: p.category, providerName: providerNameOf(p.providerId) })),
    expiringList: expiring.slice(0, 8),
    tasksList: tasksToday.slice(0, 8).map((t) => ({ title: t.title, assignedToName: t.assignedToName, priority: t.priority })),
    ideasList: newIdeas.slice(0, 4).map((f) => ({ content: f.content.slice(0, 90), authorName: f.authorName })),
    requestsList: customerReqs.slice(0, 5).map((r) => ({ productName: r.productName, count: r.count })),
    providersToday: [...new Set(todayDeliveries.map((o) => o.providerName))],
  }
}

/** چکیده کوتاه برای کارت‌های آرشیو */
export function briefingDigest(d: BriefingData) {
  return {
    createdYesterday: d.stats.createdYesterday,
    overdueOrders: d.stats.overdueOrders,
    todayDeliveries: d.stats.todayDeliveries,
    dueCheques: d.stats.dueCheques,
    priceCheckRemaining: d.priceCheck?.remaining ?? 0,
    priceCheckRed: d.priceCheck?.red ?? 0,
  }
}

export const faNums = faNum
