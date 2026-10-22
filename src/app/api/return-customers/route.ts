import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, clampInt } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

interface Agg {
  phone: string
  name: string
  count: number
  pendingCount: number
  exchange: number
  transfer: number
  totalAmountSum: number
  firstAt: Date
  lastAt: Date
}

/** aggregate ReturnRequests grouped by customerPhone (any status, live behaviour) */
export async function aggregateReturnCustomers(q: string): Promise<Agg[]> {
  const rows = await db.returnRequest.findMany({
    where: { customerPhone: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: {
      customerPhone: true,
      customerName: true,
      exchangeValue: true,
      transferAmount: true,
      totalAmount: true,
      status: true,
      createdAt: true,
    },
  })
  const map = new Map<string, Agg>()
  for (const r of rows) {
    const phone = r.customerPhone as string
    let a = map.get(phone)
    if (!a) {
      a = {
        phone,
        name: r.customerName ?? '',
        count: 0,
        pendingCount: 0,
        exchange: 0,
        transfer: 0,
        totalAmountSum: 0,
        firstAt: r.createdAt,
        lastAt: r.createdAt,
      }
      map.set(phone, a)
    }
    a.name = r.customerName ?? a.name
    a.count += 1
    if (r.status === 'draft' || r.status === 'pending') a.pendingCount += 1
    a.exchange += r.exchangeValue ?? 0
    a.transfer += r.transferAmount ?? 0
    a.totalAmountSum += r.totalAmount ?? 0
    if (r.createdAt < a.firstAt) a.firstAt = r.createdAt
    if (r.createdAt > a.lastAt) a.lastAt = r.createdAt
  }
  const list = [...map.values()]
  if (!q) return list
  const needle = q.trim()
  return list.filter((a) => a.name.includes(needle) || a.phone.includes(needle))
}

/**
 * GET /api/return-customers?sort=recent|count&page=&limit=
 * → {items:[{phone,count,pendingCount,exchange,transfer,firstAt,lastAt,name}], total,page,pageSize,pages}
 */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(me, 'returns/customers')
  if (!gate.ok) return fail(gate.deny, 403)

  const url = new URL(req.url)
  const sort = url.searchParams.get('sort') === 'count' ? 'count' : 'recent'
  const page = clampInt(url.searchParams.get('page'), 1, 100000, 1)
  const limit = clampInt(url.searchParams.get('limit'), 1, 200, 20)
  const q = (url.searchParams.get('q') || '').trim()

  let list = await aggregateReturnCustomers(q)
  if (sort === 'count') list.sort((a, b) => b.count - a.count || b.lastAt.getTime() - a.lastAt.getTime())
  else list.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())

  const total = list.length
  const items = list.slice((page - 1) * limit, page * limit).map((a) => ({
    phone: a.phone,
    count: a.count,
    pendingCount: a.pendingCount,
    exchange: a.exchange,
    transfer: a.transfer,
    firstAt: a.firstAt.toISOString(),
    lastAt: a.lastAt.toISOString(),
    name: a.name,
  }))

  return ok({
    items,
    total,
    page,
    pageSize: limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  })
}
