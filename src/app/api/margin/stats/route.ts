import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'
import { toFaDigits } from '@/lib/jalali'
import { invoiceDateKey } from '../route'

export const dynamic = 'force-dynamic'

const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']

const THRESHOLD_RED = 12
const THRESHOLD_YELLOW = 21

/**
 * GET /api/margin/stats?from=&to=
 * Live shape (margin-stats.json). NOTE: distribution/criticalCount compare the
 * STORED item margin (a 0..1 fraction) against the percent thresholds 12/21 —
 * faithfully reproducing the live backend (red = margin < 12 as a raw number).
 */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(me, 'profit/stats')
  if (!gate.ok) return fail(gate.deny, 403)

  const url = new URL(req.url)
  const from = (url.searchParams.get('from') || '').trim().replace(/\//g, '-')
  const to = (url.searchParams.get('to') || '').trim().replace(/\//g, '-')

  const all = await db.marginInvoice.findMany({ include: { items: true } })
  const inRange = all.filter((inv) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) && !/^\d{4}-\d{2}-\d{2}$/.test(to)) return true
    const d = invoiceDateKey(inv)
    if (/^\d{4}-\d{2}-\d{2}$/.test(from) && d < from) return false
    if (/^\d{4}-\d{2}-\d{2}$/.test(to) && d > to) return false
    return true
  })

  const items = inRange.flatMap((inv) => inv.items.map((it) => ({ inv, it })))

  // ---- kpis ----
  const totalPurchase = items.reduce((s, { it }) => s + it.totalCost, 0)
  const totalRevenue = items.reduce((s, { it }) => s + it.printedPrice * it.quantity, 0)
  const totalProfit = totalRevenue - totalPurchase
  const weightedMargin = totalPurchase > 0 ? (totalProfit / totalPurchase) * 100 : null

  // ---- distribution (raw stored margin vs 12/21 — live quirk) ----
  let red = 0
  let yellow = 0
  let green = 0
  for (const { it } of items) {
    const m = it.margin
    if (m < THRESHOLD_RED) red += 1
    else if (m < THRESHOLD_YELLOW) yellow += 1
    else green += 1
  }

  // ---- topProfit (group by product) ----
  const byKey = new Map<string, { key: string; name: string; profit: number; purchase: number; count: number }>()
  for (const { it } of items) {
    const key = it.productId ?? it.productName
    const profit = it.profitPerUnit * it.quantity
    let g = byKey.get(key)
    if (!g) {
      g = { key, name: it.productName, profit: 0, purchase: 0, count: 0 }
      byKey.set(key, g)
    }
    g.profit += profit
    g.purchase += it.totalCost
    g.count += 1
  }
  const topProfit = [...byKey.values()]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10)
    .map((g) => ({
      key: g.key,
      name: g.name,
      profit: g.profit,
      purchase: g.purchase,
      margin: g.purchase > 0 ? (g.profit / g.purchase) * 100 : null,
      count: g.count,
    }))

  // ---- suppliers ----
  const bySupplier = new Map<string, { purchase: number; revenue: number; profit: number; invoices: number }>()
  for (const inv of inRange) {
    const name = inv.supplierName ?? 'بدون تأمین‌کننده'
    let g = bySupplier.get(name)
    if (!g) {
      g = { purchase: 0, revenue: 0, profit: 0, invoices: 0 }
      bySupplier.set(name, g)
    }
    for (const it of inv.items) {
      g.purchase += it.totalCost
      g.revenue += it.printedPrice * it.quantity
    }
    g.profit = g.revenue - g.purchase
    g.invoices += 1
  }
  const suppliers = [...bySupplier.entries()]
    .map(([name, g]) => ({
      name,
      purchase: g.purchase,
      revenue: g.revenue,
      profit: g.profit,
      invoices: g.invoices,
      margin: g.purchase > 0 ? (g.profit / g.purchase) * 100 : null,
    }))
    .sort((a, b) => b.purchase - a.purchase)

  // ---- categories (product.mainGroup) ----
  const productIds = [...new Set(items.map(({ it }) => it.productId ?? '').filter(Boolean))]
  const products = productIds.length ? await db.product.findMany({ where: { id: { in: productIds } } }) : []
  const mainGroupById = new Map(products.map((p) => [p.id, p.mainGroup ?? 'بدون دسته']))
  const byCategory = new Map<string, { profit: number; purchase: number; count: number }>()
  for (const { it } of items) {
    const name = it.productId ? mainGroupById.get(it.productId) ?? 'بدون دسته' : 'بدون دسته'
    let g = byCategory.get(name)
    if (!g) {
      g = { profit: 0, purchase: 0, count: 0 }
      byCategory.set(name, g)
    }
    g.profit += it.profitPerUnit * it.quantity
    g.purchase += it.totalCost
    g.count += 1
  }
  const categories = [...byCategory.entries()]
    .map(([name, g]) => ({
      name,
      profit: g.profit,
      purchase: g.purchase,
      count: g.count,
      margin: g.purchase > 0 ? (g.profit / g.purchase) * 100 : null,
    }))
    .sort((a, b) => b.purchase - a.purchase)

  // ---- trend (by invoice dateJalali) ----
  const byDay = new Map<string, { purchase: number; revenue: number; profit: number; invoices: number }>()
  for (const inv of inRange) {
    const day = invoiceDateKey(inv)
    let g = byDay.get(day)
    if (!g) {
      g = { purchase: 0, revenue: 0, profit: 0, invoices: 0 }
      byDay.set(day, g)
    }
    for (const it of inv.items) {
      g.purchase += it.totalCost
      g.revenue += it.printedPrice * it.quantity
    }
    g.profit = g.revenue - g.purchase
    g.invoices += 1
  }
  const trend = [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, g]) => {
      const [jy, jm, jd] = day.split('-').map(Number)
      return {
        day,
        label: `${toFaDigits(jd)} ${JALALI_MONTHS[jm - 1]}`,
        purchase: g.purchase,
        revenue: g.revenue,
        profit: g.profit,
        invoices: g.invoices,
      }
    })

  return ok({
    range: {
      from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null,
      to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : null,
    },
    kpis: {
      invoiceCount: inRange.length,
      itemCount: items.length,
      totalPurchase,
      totalExpectedRevenue: totalRevenue,
      totalExpectedProfit: totalProfit,
      weightedMargin,
      criticalCount: red,
    },
    distribution: { red, yellow, green },
    topProfit,
    suppliers,
    categories,
    trend,
  })
}
