import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canReports } from '@/lib/access'
import { todayJalaliDash, addDaysJalaliDash, formatJalaliDash, parseJalaliDash, JALALI_MONTHS, toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

const SETTLED_CHEQUE = ['CLEARED', 'DONE', 'REJECTED', 'BOUNCED', 'CANCELLED']
const ACTIVE_ORDER = ['SUBMITTED', 'APPROVED', 'RECEIVING', 'RECEIVED']

function monthStart(dash: string): string {
  const { jy, jm } = parseJalaliDash(dash)
  return `${jy}-${String(jm).padStart(2, '0')}-01`
}

function inRange(date: string | null | undefined, from: string, to: string): boolean {
  return !!date && date >= from && date <= to
}

/** GET /api/reports/overview?from=&to= — period performance snapshot */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canReports(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const today = todayJalaliDash()
  const from = validDash(req.nextUrl.searchParams.get('from')) || monthStart(today)
  const to = validDash(req.nextUrl.searchParams.get('to')) || today
  const in7days = addDaysJalaliDash(today, 7)

  const [returns, allReturnItems, cheques, orders, wasteRows, priceChecks, marginInvoices, marginItems, userCount, products, suppliers, customers] =
    await Promise.all([
      db.returnRequest.findMany({ include: { items: true } }),
      db.returnItem.findMany(),
      db.cheque.findMany(),
      db.order.findMany(),
      db.wasteRecord.findMany(),
      db.priceCheck.findMany(),
      db.marginInvoice.findMany({ where: { archived: false } }),
      db.marginItem.findMany(),
      db.user.count(),
      db.product.count(),
      db.supplier.count(),
      db.customer.count(),
    ])

  const returnsInRange = returns.filter((r) => inRange(formatJalaliDash(r.submittedAt ?? r.createdAt), from, to))
  const pendingReturns = returns.filter((r) => r.status === 'pending')

  // margin (سودسنج) invoices within range
  let purchase = 0
  let revenue = 0
  let marginCount = 0
  for (const inv of marginInvoices) {
    const date = inv.dateJalali ?? formatJalaliDash(inv.createdAt)
    if (!inRange(date, from, to)) continue
    marginCount += 1
    for (const it of marginItems.filter((m) => m.invoiceId === inv.id)) {
      purchase += it.totalCost
      revenue += it.printedPrice * it.quantity
    }
  }
  const profit = revenue - purchase

  // cheques due within 7 days (unsettled)
  const dueCheques = cheques.filter((c) => !SETTLED_CHEQUE.includes(c.status) && c.dueDate >= today && c.dueDate <= in7days)
  const ordersActive = orders.filter((o) => ACTIVE_ORDER.includes(o.status)).length
  const wasteValue = wasteRows.filter((w) => inRange(w.date, from, to)).reduce((s, w) => s + w.estValue, 0)
  const priceCheckReds = priceChecks.filter((c) => !c.ok && inRange(c.date, from, to)).length

  // top returned products (by line total)
  const returnIdsInRange = new Set(returnsInRange.map((r) => r.id))
  const prodMap = new Map<string, { name: string; count: number; qty: number; amount: number }>()
  for (const item of allReturnItems) {
    if (!returnIdsInRange.has(item.returnId)) continue
    const cur = prodMap.get(item.name) ?? { name: item.name, count: 0, qty: 0, amount: 0 }
    cur.count += 1
    cur.qty += item.qty
    cur.amount += item.lineTotal
    prodMap.set(item.name, cur)
  }
  const topReturnedProducts = [...prodMap.values()].sort((a, b) => b.amount - a.amount).slice(0, 5)

  // cashier performance — returns processed per cashier
  const cashierMap = new Map<string, { name: string; username: string; count: number; amount: number }>()
  for (const r of returnsInRange) {
    if (!r.cashierId) continue
    const cur = cashierMap.get(r.cashierId)
    if (cur) {
      cur.count += 1
      cur.amount += r.totalAmount
    } else {
      cashierMap.set(r.cashierId, { name: r.cashierId, username: r.cashierId, count: 1, amount: r.totalAmount })
    }
  }
  const cashierUsers = await db.user.findMany({ where: { id: { in: [...cashierMap.keys()] } } })
  const userById = new Map(cashierUsers.map((u) => [u.id, u]))
  const cashierPerformance = [...cashierMap.values()]
    .map((c) => {
      const u = userById.get(c.name)
      return u ? { name: u.fullName, username: u.username, count: c.count, amount: c.amount } : c
    })
    .sort((a, b) => b.count - a.count || b.amount - a.amount)

  // low stock
  const lowStockCount = await db.product.count({ where: { stock: { lte: 5 } } })
  const lowStockPreview = await db.product.findMany({
    where: { stock: { lte: 5 } },
    orderBy: { stock: 'asc' },
    take: 5,
    select: { name: true, stock: true },
  })

  const { jy, jm } = parseJalaliDash(to)

  return ok({
    range: { from, to, today, monthLabel: `${JALALI_MONTHS[jm - 1]} ${toFaDigits(jy)}` },
    pendingReturns: {
      count: pendingReturns.length,
      amount: pendingReturns.reduce((s, r) => s + r.totalAmount, 0),
    },
    returns: {
      count: returnsInRange.length,
      amount: returnsInRange.reduce((s, r) => s + r.totalAmount, 0),
    },
    margin: {
      count: marginCount,
      purchase,
      revenue,
      profit,
      weightedMargin: purchase > 0 ? Math.round((profit / purchase) * 1000) / 10 : 0,
    },
    chequesDue7d: {
      count: dueCheques.length,
      amount: dueCheques.reduce((s, c) => s + c.amount, 0),
    },
    ordersActive,
    wasteValue,
    lowStockCount,
    priceCheckReds,
    topReturnedProducts,
    cashierPerformance,
    lowStockPreview,
    counts: {
      users: userCount,
      products,
      suppliers,
      returns: returns.length,
      customers,
    },
  })
}

function validDash(v: string | null): string | null {
  if (!v) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}
