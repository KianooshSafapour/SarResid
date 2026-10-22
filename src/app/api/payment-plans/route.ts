import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const DASH_DATE = /^\d{4}-\d{2}-\d{2}$/
export const PLAN_KINDS = ['CHEQUE', 'POS', 'CASH']
export const PLAN_STATUSES = ['PLANNED', 'CONFIRMED', 'DONE']

/** payment calendar is finance territory: managers + ACC */
export function canPaymentPlans(role: string | undefined | null): boolean {
  return !!role && ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC'].includes(role)
}

function serialize(p: {
  id: string
  date: string
  kind: string
  amount: number
  status: string
  orderCode: string | null
  supplierName: string | null
  note: string | null
  createdById: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return { ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() }
}

/** GET /api/payment-plans?from=&to= → {plans, stats} (calendar list) */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canPaymentPlans(user.role)) return fail('دسترسی به تقویم پرداخت ندارید', 403)

  const sp = req.nextUrl.searchParams
  const from = (sp.get('from') || '').trim()
  const to = (sp.get('to') || '').trim()

  const where: Record<string, unknown> = {}
  if (DASH_DATE.test(from)) where.date = { gte: from }
  if (DASH_DATE.test(to)) where.date = typeof where.date === 'object' ? { ...(where.date as object), lte: to } : { lte: to }

  const rows = await db.paymentPlan.findMany({ where, orderBy: [{ date: 'asc' }, { createdAt: 'desc' }] })

  const stats = {
    planned: rows.filter((r) => r.status === 'PLANNED').length,
    confirmed: rows.filter((r) => r.status === 'CONFIRMED').length,
    done: rows.filter((r) => r.status === 'DONE').length,
    totalAmount: rows.reduce((s, r) => s + (r.status === 'DONE' ? 0 : r.amount), 0), // outstanding
  }
  return ok({ plans: rows.map(serialize), stats })
}

/** POST /api/payment-plans {date, kind: CHEQUE|POS|CASH, amount, orderCode?, supplierName?, note?} → {plan} */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canPaymentPlans(user.role)) return fail('شما مجاز به ثبت برنامه پرداخت نیستید', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const date = String((body as Record<string, unknown>).date ?? '').trim().replace(/\//g, '-')
  if (!DASH_DATE.test(date)) return fail('تاریخ پرداخت را به شکل صحیح وارد کنید')

  const kindRaw = String((body as Record<string, unknown>).kind ?? 'CHEQUE').trim().toUpperCase()
  if (!PLAN_KINDS.includes(kindRaw)) return fail('نوع پرداخت نامعتبر است (چک / کارتخوان / نقد)')
  const amount = Number((body as Record<string, unknown>).amount)
  if (!Number.isFinite(amount) || amount <= 0) return fail('مبلغ پرداخت را وارد کنید')

  const orderCode = String((body as Record<string, unknown>).orderCode ?? '').trim() || null
  const supplierName = String((body as Record<string, unknown>).supplierName ?? '').trim() || null
  const note = String((body as Record<string, unknown>).note ?? '').trim() || null

  const created = await db.paymentPlan.create({
    data: { date, kind: kindRaw, amount, status: 'PLANNED', orderCode, supplierName, note, createdById: user.id },
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'payment-plan.create',
    actionLabel: 'تقویم پرداخت',
    category: 'finance',
    detail: `${kindRaw === 'CHEQUE' ? 'چک' : kindRaw === 'POS' ? 'کارتخوان' : 'نقد'} — ${Math.round(amount).toLocaleString('en-US')} ریال — ${date}${supplierName ? ` — ${supplierName}` : ''}`,
    entityId: created.id,
  })
  return ok({ plan: serialize(created) })
}

/** PATCH /api/payment-plans {id, status} — flat alias for the [id] route (same rules) */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canPaymentPlans(user.role)) return fail('شما مجاز به تغییر وضعیت برنامه پرداخت نیستید', 403)

  const body = await req.json().catch(() => null)
  const id = String((body as Record<string, unknown>)?.id ?? '').trim()
  if (!id) return fail('شناسه برنامه پرداخت الزامی است')

  const row = await db.paymentPlan.findUnique({ where: { id } })
  if (!row) return fail('برنامه پرداخت یافت نشد', 404)

  const status = String((body as Record<string, unknown>).status ?? '').trim().toUpperCase()
  if (!PLAN_STATUSES.includes(status)) return fail('وضعیت نامعتبر است')
  const order = { PLANNED: 0, CONFIRMED: 1, DONE: 2 } as Record<string, number>
  if (order[status] < order[row.status]) return fail('بازگشت به وضعیت قبلی مجاز نیست (برنامه ← تأییدشده ← انجام‌شده)')
  if (status === row.status) return fail('این برنامه قبلاً در همین وضعیت است')

  const updated = await db.paymentPlan.update({ where: { id }, data: { status } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'payment-plan.status',
    actionLabel: 'تقویم پرداخت',
    category: 'finance',
    detail: `${updated.supplierName ?? updated.orderCode ?? updated.id} — ${row.status} ← ${status}`,
    entityId: id,
  })
  return ok({ plan: serialize(updated) })
}
