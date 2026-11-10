import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canPaymentPlans, PLAN_STATUSES } from '../route'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const STATUS_LABELS: Record<string, string> = { PLANNED: 'برنامه‌ریزی‌شده', CONFIRMED: 'تأییدشده', DONE: 'انجام‌شده' }

/** PATCH /api/payment-plans/[id] {status} — PLANNED → CONFIRMED → DONE (forward only) */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canPaymentPlans(user.role)) return fail('شما مجاز به تغییر وضعیت برنامه پرداخت نیستید', 403)

  const { id } = await ctx.params
  const row = await db.paymentPlan.findUnique({ where: { id } })
  if (!row) return fail('برنامه پرداخت یافت نشد', 404)

  const body = await req.json().catch(() => null)
  const status = String((body as Record<string, unknown> | null)?.status ?? '').trim().toUpperCase()
  if (!PLAN_STATUSES.includes(status)) return fail('وضعیت نامعتبر است')

  const order = { PLANNED: 0, CONFIRMED: 1, DONE: 2 } as Record<string, number>
  if (order[status] < order[row.status]) {
    return fail('بازگشت به وضعیت قبلی مجاز نیست (برنامه ← تأییدشده ← انجام‌شده)')
  }
  if (status === row.status) return fail('این برنامه پرداخت قبلاً در همین وضعیت است')

  const updated = await db.paymentPlan.update({ where: { id }, data: { status } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'payment-plan.status',
    actionLabel: 'تقویم پرداخت',
    category: 'finance',
    detail: `${updated.supplierName ?? updated.orderCode ?? id} — ${STATUS_LABELS[status]} (${status})`,
    entityId: id,
  })
  return ok({ plan: { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() } })
}

/** DELETE /api/payment-plans/[id] — remove a planned entry (finance roles) */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canPaymentPlans(user.role)) return fail('شما مجاز به حذف برنامه پرداخت نیستید', 403)

  const { id } = await ctx.params
  const row = await db.paymentPlan.findUnique({ where: { id } })
  if (!row) return fail('برنامه پرداخت یافت نشد', 404)

  await db.paymentPlan.delete({ where: { id } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'payment-plan.delete',
    actionLabel: 'تقویم پرداخت',
    category: 'finance',
    detail: `${row.kind} — ${Math.round(row.amount).toLocaleString('en-US')} ریال — ${row.date}`,
    entityId: id,
  })
  return ok({ id })
}
