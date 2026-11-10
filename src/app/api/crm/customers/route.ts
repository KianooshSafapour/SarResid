import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, clampInt } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { aggregateReturnCustomers } from '../../return-customers/route'

export const dynamic = 'force-dynamic'

export const TIERS = ['VIP', 'LOYAL', 'REGULAR', 'NEW', 'AT_RISK', 'DORMANT'] as const
type Tier = (typeof TIERS)[number]

export interface MergedCustomer {
  id: string | null
  phone: string
  name: string
  returnsCount: number
  totalAmount: number
  firstAt: Date
  lastVisitAt: Date
  smsEnabled: boolean
  birthday: string | null
  note: string | null
  manualTier: string | null
}

/** live auto-tier rule (fitted to the captured tiers.json/customers.json rows) */
export function computeAutoTier(c: { totalAmount: number; firstAt: Date; lastVisitAt: Date }, now = new Date()): Tier {
  if (c.totalAmount >= 50_000_000) return 'VIP'
  if (c.totalAmount >= 20_000_000) return 'LOYAL'
  if (c.totalAmount >= 10_000_000) return 'REGULAR'
  const daysSinceFirst = (now.getTime() - c.firstAt.getTime()) / 86400000
  if (daysSinceFirst <= 30) return 'NEW'
  const daysSinceVisit = (now.getTime() - c.lastVisitAt.getTime()) / 86400000
  if (daysSinceVisit > 120) return 'DORMANT'
  if (daysSinceVisit > 60) return 'AT_RISK'
  return 'REGULAR'
}

export function tierOf(c: MergedCustomer, now = new Date()): { autoTier: Tier; tier: string } {
  const autoTier = computeAutoTier(c, now)
  return { autoTier, tier: c.manualTier ?? autoTier }
}

/** db customers + virtual (id:null) rows for phones that only appear in returns */
export async function mergedCustomers(): Promise<MergedCustomer[]> {
  const [dbs, aggs] = await Promise.all([
    db.customer.findMany(),
    aggregateReturnCustomers(''),
  ])
  const byPhone = new Map(dbs.map((c) => [c.phone, c]))
  const out: MergedCustomer[] = dbs.map((c) => ({
    id: c.id,
    phone: c.phone,
    name: c.name,
    returnsCount: c.returnsCount,
    totalAmount: c.totalAmount,
    firstAt: c.firstAt,
    lastVisitAt: c.lastVisitAt,
    smsEnabled: c.smsEnabled,
    birthday: c.birthday,
    note: c.note,
    manualTier: c.manualTier,
  }))
  for (const a of aggs) {
    if (byPhone.has(a.phone)) continue
    out.push({
      id: null,
      phone: a.phone,
      name: a.name,
      returnsCount: a.count,
      totalAmount: a.totalAmountSum,
      firstAt: a.firstAt,
      lastVisitAt: a.lastAt,
      smsEnabled: true,
      birthday: null,
      note: null,
      manualTier: null,
    })
  }
  return out
}

function normalizeMobile(v: unknown): string {
  return String(v ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/\D/g, '')
}

/**
 * GET /api/crm/customers?sort=recent|count&page=&pageSize=&tier=&q=
 * → {items:[…], total, page, pageSize, pages, tierCounts:{VIP,…}}
 */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const url = new URL(req.url)
  const sort = url.searchParams.get('sort') === 'count' ? 'count' : 'recent'
  const page = clampInt(url.searchParams.get('page'), 1, 100000, 1)
  const pageSize = clampInt(url.searchParams.get('pageSize'), 1, 1000, 24)
  const tier = (url.searchParams.get('tier') || '').trim()
  const q = (url.searchParams.get('q') || '').trim()

  let all = await mergedCustomers()
  if (q) {
    const needle = q.trim()
    all = all.filter((c) => c.name.includes(needle) || c.phone.includes(needle))
  }

  // tier chips always reflect the q-filtered set (independent of the active tier filter)
  const now = new Date()
  const tierCounts: Record<string, number> = {}
  for (const t of TIERS) tierCounts[t] = 0
  for (const c of all) tierCounts[tierOf(c, now).tier] += 1

  if (tier) all = all.filter((c) => tierOf(c, now).tier === tier)

  if (sort === 'count') all.sort((a, b) => b.returnsCount - a.returnsCount || b.lastVisitAt.getTime() - a.lastVisitAt.getTime())
  else all.sort((a, b) => b.lastVisitAt.getTime() - a.lastVisitAt.getTime())

  const total = all.length
  const items = all.slice((page - 1) * pageSize, page * pageSize).map((c) => {
    const { autoTier, tier: t } = tierOf(c, now)
    return {
      id: c.id,
      phone: c.phone,
      name: c.name,
      returnsCount: c.returnsCount,
      totalAmount: c.totalAmount,
      firstAt: c.firstAt.toISOString(),
      lastVisitAt: c.lastVisitAt.toISOString(),
      smsEnabled: c.smsEnabled,
      birthday: c.birthday,
      note: c.note,
      manualTier: c.manualTier,
      autoTier,
      tier: t,
    }
  })

  return ok({
    items,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    tierCounts,
  })
}

/** POST /api/crm/customers — {phone, name, birthday?, note?} */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const body = await req.json().catch(() => null)
  if (!body) return fail('درخواست نامعتبر است')

  const phone = normalizeMobile(body.phone)
  if (!/^09\d{9}$/.test(phone)) return fail('شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد')

  const name = String(body.name ?? '').trim()
  if (name.length < 2) return fail('نام مشتری را کامل وارد کنید')

  const existing = await db.customer.findUnique({ where: { phone } })
  if (existing) return fail('این شماره قبلاً ثبت شده است')

  const birthday = String(body.birthday ?? '').trim() || null
  const note = String(body.note ?? '').trim() || null

  // seed stats from existing returns so the merged view stays consistent
  const mine = await db.returnRequest.findMany({ where: { customerPhone: phone } })
  const firstAt = mine.length ? mine.reduce((m: Date, r) => (r.createdAt < m ? r.createdAt : m), mine[0].createdAt) : new Date()
  const lastVisitAt = mine.length ? mine.reduce((m: Date, r) => (r.createdAt > m ? r.createdAt : m), mine[0].createdAt) : new Date()

  const created = await db.customer.create({
    data: {
      phone,
      name,
      birthday,
      note,
      returnsCount: mine.length,
      totalAmount: mine.reduce((s, r) => s + (r.totalAmount ?? 0), 0),
      firstAt,
      lastVisitAt,
      smsEnabled: true,
    },
  })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'crm.customer.create',
    actionLabel: 'ثبت مشتری',
    category: 'crm',
    detail: `${name} — ${phone}`,
    entityId: created.id,
  })

  return ok({ id: created.id, phone, name })
}
