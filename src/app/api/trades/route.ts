import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ok, fail, clampInt } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

/**
 * GET /api/trades — تحلیل تاریخچهٔ خرید/فروش هلو (TradeRecord، تیر..مهر ۱۴۰۵)
 *
 * Modes (first match wins):
 *   ?productId=<id>            → monthly series for ONE product (BUY+SELL merged)
 *                                { productId, product, series: [{month, buyQty, buyAvgPrice, sellQty, sellRevenue}] }
 *   ?summary=1                 → overall totals + top-10 all-time sell products + active months
 *   ?kind=SELL&top=20&month=1405-04
 *                              → top products by revenue in one month
 *                                { kind, month, top: [{productName, productId, qty, revenue, invoiceCount}] }
 *   ?months=6  (default)       → monthly aggregates (sums of lineTotal)
 *                                { months: [{month, buyTotal, sellTotal, buyRows, sellRows, buyQty, sellQty}] }
 *
 * Access: any logged-in user (all authenticated roles).
 */

interface TopRow {
  productId: string | null
  productName: string
  revenue: number
  qty: number
  invoiceCount: number
}

/** raw grouped top-list (needs COUNT(DISTINCT invoiceNo) — not expressible as Prisma groupBy) */
async function topProducts(kind: 'BUY' | 'SELL', month: string | null, limit: number): Promise<TopRow[]> {
  const monthFilter = month ? Prisma.sql`AND month = ${month}` : Prisma.empty
  const rows = await db.$queryRaw<TopRow[]>(Prisma.sql`
    SELECT productId, productName,
           SUM(lineTotal)  AS revenue,
           SUM(qty)         AS qty,
           COUNT(DISTINCT invoiceNo) AS invoiceCount
    FROM TradeRecord
    WHERE kind = ${kind} ${monthFilter}
    GROUP BY productId, productName
    ORDER BY revenue DESC
    LIMIT ${limit}
  `)
  return rows.map((r) => ({
    productId: r.productId ?? null,
    productName: String(r.productName ?? ''),
    revenue: Number(r.revenue) || 0,
    qty: Number(r.qty) || 0,
    invoiceCount: Number(r.invoiceCount) || 0,
  }))
}

function parseKind(raw: string | null): 'BUY' | 'SELL' | null {
  if (!raw) return null
  const k = raw.trim().toUpperCase()
  return k === 'BUY' || k === 'SELL' ? k : null
}

function validMonth(raw: string | null): boolean {
  return !!raw && /^\d{4}-\d{2}$/.test(raw)
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const sp0 = req.nextUrl.searchParams

  /* ── R9 mode: آخرین خریدِ هر کالا (برای ردیف‌های جست‌وجوی کالا در سفارش جدید) ──
     ?lastBuys=1&ids=<id,id,...>  (حداکثر ۴۰ شناسه)
     خروجی: { lastBuys: [{ productId, lastBuyDate, lastBuyDateLabel, lastBuyQty, lastBuyPrice, buyMonths, lastSellDate }] } */
  if ((sp0.get('lastBuys') ?? '') === '1') {
    const ids = (sp0.get('ids') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 40)
    if (!ids.length) return fail('شناسهٔ کالاها را بفرستید')
    const rows = await db.tradeRecord.findMany({
      where: { productId: { in: ids }, kind: 'BUY' },
      orderBy: [{ dateJalali: 'desc' }, { createdAt: 'desc' }],
    })
    const sellRows = await db.tradeRecord.findMany({
      where: { productId: { in: ids }, kind: 'SELL' },
      orderBy: [{ dateJalali: 'desc' }, { createdAt: 'desc' }],
      select: { productId: true, dateJalali: true },
    })
    const byProduct = new Map<string, typeof rows>()
    for (const r of rows) {
      const cur = byProduct.get(r.productId ?? '') ?? []
      cur.push(r)
      byProduct.set(r.productId ?? '', cur)
    }
    const lastSellBy = new Map<string, string | null>()
    for (const s of sellRows) lastSellBy.set(s.productId ?? '', s.dateJalali)
    const MONTH_FA: Record<string, string> = {
      '1405-04': 'تیر ۱۴۰۵',
      '1405-05': 'مرداد ۱۴۰۵',
      '1405-06': 'شهریور ۱۴۰۵',
      '1405-07': 'مهر ۱۴۰۵',
    }
    const lastBuys = ids.map((pid) => {
      const list = byProduct.get(pid) ?? []
      const last = list[0] ?? null
      const months = [...new Set(list.map((r) => r.month))].sort()
      /* dateJalali در این جدول نقطه‌ای است (1405.07.30) — برچسب خوانا بساز */
      const dotted = last?.dateJalali ?? ''
      const parts = dotted.split('.')
      const label = parts.length === 3 ? `${parts[0]}.${parts[1]}.${parts[2]}` : dotted
      return {
        productId: pid,
        lastBuyDate: last?.dateJalali ?? null,
        lastBuyDateLabel: last ? label : null,
        lastBuyMonthLabel: last ? (MONTH_FA[last.month] ?? last.month) : null,
        lastBuyQty: last?.qty ?? 0,
        lastBuyPrice: last?.unitPrice ?? 0,
        buyCount: list.length,
        buyMonths: months.length,
        lastSellDate: lastSellBy.get(pid) ?? null,
      }
    })
    return ok({ lastBuys })
  }


  const sp = req.nextUrl.searchParams

  /* ── mode 1: per-product monthly series ── */
  const productId = (sp.get('productId') ?? '').trim()
  if (productId) {
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, code: true, unit: true },
    })
    const [buys, sells] = await Promise.all([
      db.tradeRecord.groupBy({
        by: ['month'],
        where: { kind: 'BUY', productId },
        _sum: { qty: true },
        _avg: { unitPrice: true },
      }),
      db.tradeRecord.groupBy({
        by: ['month'],
        where: { kind: 'SELL', productId },
        _sum: { qty: true, lineTotal: true },
      }),
    ])
    const months = [...new Set([...buys.map((b) => b.month), ...sells.map((s) => s.month)])].sort()
    const buyByMonth = new Map(buys.map((b) => [b.month, b]))
    const sellByMonth = new Map(sells.map((s) => [s.month, s]))
    const series = months.map((month) => {
      const b = buyByMonth.get(month)
      const s = sellByMonth.get(month)
      return {
        month,
        buyQty: b?._sum.qty ?? 0,
        buyAvgPrice: Math.round((b?._avg.unitPrice ?? 0) * 100) / 100,
        sellQty: s?._sum.qty ?? 0,
        sellRevenue: s?._sum.lineTotal ?? 0,
      }
    })
    return ok({ productId, product, series })
  }

  /* ── mode 2: overall summary ── */
  if ((sp.get('summary') ?? '').trim() === '1') {
    const [agg, activeMonths, topAll] = await Promise.all([
      db.tradeRecord.groupBy({
        by: ['kind'],
        _count: { _all: true },
        _sum: { lineTotal: true, qty: true },
      }),
      db.tradeRecord.groupBy({ by: ['month'], _count: { _all: true } }),
      topProducts('SELL', null, 10),
    ])
    const buy = agg.find((a) => a.kind === 'BUY')
    const sell = agg.find((a) => a.kind === 'SELL')
    return ok({
      totalBuy: buy?._sum.lineTotal ?? 0,
      totalSell: sell?._sum.lineTotal ?? 0,
      buyRows: buy?._count._all ?? 0,
      sellRows: sell?._count._all ?? 0,
      buyQty: buy?._sum.qty ?? 0,
      sellQty: sell?._sum.qty ?? 0,
      activeMonths: activeMonths.map((m) => m.month).sort(),
      topProducts: topAll,
    })
  }

  /* ── mode 3: top products of one month ── */
  const topRaw = (sp.get('top') ?? '').trim()
  if (topRaw) {
    const kind = parseKind(sp.get('kind')) ?? 'SELL'
    const limit = clampInt(sp.get('top'), 1, 100, 20)
    let month = (sp.get('month') ?? '').trim()
    if (month && !validMonth(month)) return fail('قالب ماه باید YYYY-MM باشد (مثال: 1405-04)', 400)
    if (!month) {
      const latest = await db.tradeRecord.findFirst({
        where: { kind },
        select: { month: true },
        orderBy: [{ month: 'desc' }],
      })
      month = latest?.month ?? ''
    }
    const top = month ? await topProducts(kind, month, limit) : []
    return ok({ kind, month, top })
  }

  /* ── mode 4 (default): monthly aggregates ── */
  // NB: clampInt(null) → Number(null)=0 → would clamp to min 1; default via `?? 6` first
  const monthsCount = clampInt(sp.get('months') ?? 6, 1, 24, 6)
  const allMonths = await db.tradeRecord.groupBy({ by: ['month'] })
  const selected = allMonths
    .map((m) => m.month)
    .sort()
    .reverse()
    .slice(0, monthsCount)
    .sort()
  const [buys, sells] = await Promise.all([
    db.tradeRecord.groupBy({
      by: ['month'],
      where: { kind: 'BUY', month: { in: selected } },
      _count: { _all: true },
      _sum: { lineTotal: true, qty: true },
    }),
    db.tradeRecord.groupBy({
      by: ['month'],
      where: { kind: 'SELL', month: { in: selected } },
      _count: { _all: true },
      _sum: { lineTotal: true, qty: true },
    }),
  ])
  const buyByMonth = new Map(buys.map((b) => [b.month, b]))
  const sellByMonth = new Map(sells.map((s) => [s.month, s]))
  const months = selected.map((month) => {
    const b = buyByMonth.get(month)
    const s = sellByMonth.get(month)
    return {
      month,
      buyTotal: b?._sum.lineTotal ?? 0,
      sellTotal: s?._sum.lineTotal ?? 0,
      buyRows: b?._count._all ?? 0,
      sellRows: s?._count._all ?? 0,
      buyQty: b?._sum.qty ?? 0,
      sellQty: s?._sum.qty ?? 0,
    }
  })
  return ok({ months })
}
