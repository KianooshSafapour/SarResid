import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ phone: string }> }

/** GET /api/return-customers/[phone] — {customer:{...}, returns:[...]} */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const { phone: raw } = await ctx.params
  const phone = decodeURIComponent(raw).replace(/\D/g, '')
  if (!phone) return fail('شماره مشتری نامعتبر است', 400)

  const rows = await db.returnRequest.findMany({
    where: { customerPhone: phone },
    orderBy: { createdAt: 'desc' },
    include: { items: { select: { id: true } } },
  })
  if (rows.length === 0) return fail('مشتری یافت نشد', 404)

  const cashierIds = [...new Set(rows.map((r) => r.cashierId ?? '').filter(Boolean))]
  const users = cashierIds.length ? await db.user.findMany({ where: { id: { in: cashierIds } } }) : []
  const nameById = new Map(users.map((u) => [u.id, u.fullName]))

  const count = rows.length
  const pendingCount = rows.filter((r) => r.status === 'draft' || r.status === 'pending').length
  const exchange = rows.reduce((s, r) => s + (r.exchangeValue ?? 0), 0)
  const transfer = rows.reduce((s, r) => s + (r.transferAmount ?? 0), 0)
  const firstAt = rows.reduce((m: Date, r) => (r.createdAt < m ? r.createdAt : m), rows[0].createdAt)
  const lastAt = rows.reduce((m: Date, r) => (r.createdAt > m ? r.createdAt : m), rows[0].createdAt)

  return ok({
    customer: {
      name: rows[0].customerName ?? '',
      phone,
      count,
      pendingCount,
      exchange,
      transfer,
      firstAt: firstAt.toISOString(),
      lastAt: lastAt.toISOString(),
    },
    returns: rows.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      settlementType: r.settlementType,
      createdAt: r.createdAt.toISOString(),
      reason: r.reason,
      totalAmount: r.totalAmount,
      transferAmount: r.transferAmount,
      itemCount: r.items.length,
      cashierName: r.cashierId ? nameById.get(r.cashierId) ?? '—' : '—',
    })),
  })
}
