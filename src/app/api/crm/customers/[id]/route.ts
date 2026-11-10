import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { formatJalaliDash } from '@/lib/jalali'
import { mergedCustomers, tierOf } from '../route'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const RETURN_STATUS_LABELS: Record<string, string> = {
  draft: 'پیش‌نویس',
  pending: 'در انتظار تأیید',
  approved: 'در انتظار پرداخت',
  paid: 'تسویه‌شده',
}
const SETTLE_LABELS: Record<string, string> = {
  full: 'پرداخت کامل به کارت',
  exchange: 'تسویه با کالای جایگزین',
  partial: 'تسویه جزئی (دارای مانده)',
  debt: 'بدهی مشتری',
}

function eventPayloadOf(content: string | null): Record<string, unknown> {
  const parsed = safeJson<unknown>(content, null)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  if (content) return { note: content }
  return {}
}

/** GET /api/crm/customers/[id] — by customer id OR phone.
 * → {customer:{…}, recentReturns:[{code,settlementLabel,statusLabel,dateJalali,totalAmount}], events:[…]} */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const { id: rawKey } = await ctx.params
  const key = decodeURIComponent(rawKey)

  const all = await mergedCustomers()
  const target = all.find((c) => (c.id && c.id === key) || c.phone === key.replace(/\D/g, ''))
  if (!target) return fail('مشتری یافت نشد', 404)

  const rows = await db.returnRequest.findMany({
    where: { customerPhone: target.phone },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  const events = await db.crmEvent.findMany({
    where: { customerId: key },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const now = new Date()
  const { autoTier, tier } = tierOf(target, now)

  return ok({
    customer: {
      id: target.id,
      phone: target.phone,
      name: target.name,
      returnsCount: target.returnsCount,
      totalAmount: target.totalAmount,
      firstAt: target.firstAt.toISOString(),
      lastVisitAt: target.lastVisitAt.toISOString(),
      smsEnabled: target.smsEnabled,
      birthday: target.birthday,
      note: target.note,
      manualTier: target.manualTier,
      autoTier,
      tier,
    },
    recentReturns: rows.map((r) => ({
      code: r.code,
      settlementLabel: SETTLE_LABELS[r.settlementType] ?? r.settlementType,
      statusLabel: RETURN_STATUS_LABELS[r.status] ?? r.status,
      dateJalali: formatJalaliDash(r.createdAt),
      totalAmount: r.totalAmount,
    })),
    events: events.map((e) => {
      const payload = eventPayloadOf(e.content)
      return {
        id: e.id,
        customerId: e.customerId,
        kind: e.kind,
        content: typeof payload.note === 'string' ? payload.note : null,
        payload,
        createdAt: e.createdAt.toISOString(),
      }
    }),
  })
}

/** PATCH /api/crm/customers/[id] — {tier?, note?, smsEnabled?, name?, birthday?} (id or phone key) */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const { id: rawKey } = await ctx.params
  const key = decodeURIComponent(rawKey)
  const phone = key.replace(/\D/g, '')

  let row = await db.customer.findUnique({ where: { id: key } })
  if (!row && phone) row = await db.customer.findUnique({ where: { phone } })
  if (!row && phone && /^09\d{9}$/.test(phone)) {
    // materialise a virtual (id:null) customer so profile fields can persist
    const mine = await db.returnRequest.findMany({ where: { customerPhone: phone } })
    if (mine.length === 0) return fail('مشتری یافت نشد', 404)
    const firstAt = mine.reduce((m: Date, r) => (r.createdAt < m ? r.createdAt : m), mine[0].createdAt)
    const lastVisitAt = mine.reduce((m: Date, r) => (r.createdAt > m ? r.createdAt : m), mine[0].createdAt)
    row = await db.customer.create({
      data: {
        phone,
        name: mine[0].customerName ?? '',
        returnsCount: mine.length,
        totalAmount: mine.reduce((s, r) => s + (r.totalAmount ?? 0), 0),
        firstAt,
        lastVisitAt,
      },
    })
  }
  if (!row) return fail('مشتری یافت نشد', 404)

  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (body?.tier !== undefined) {
    const t = String(body.tier).trim().toUpperCase()
    data.manualTier = !t || t === 'AUTO' ? null : t
  }
  if (body?.note !== undefined) data.note = String(body.note ?? '').trim() || null
  if (body?.smsEnabled !== undefined) data.smsEnabled = !!body.smsEnabled
  if (body?.name !== undefined) {
    const name = String(body.name ?? '').trim()
    if (name.length < 2) return fail('نام مشتری را کامل وارد کنید')
    data.name = name
  }
  if (body?.birthday !== undefined) data.birthday = String(body.birthday ?? '').trim() || null

  await db.customer.update({ where: { id: row.id }, data })
  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'crm.customer.update',
    actionLabel: 'ویرایش مشتری',
    category: 'crm',
    detail: `${row.name} — ${row.phone}`,
    entityId: row.id,
  })

  return ok({ id: row.id, phone: row.phone })
}

/** DELETE /api/crm/customers/[id] */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const { id: rawKey } = await ctx.params
  const key = decodeURIComponent(rawKey)
  const phone = key.replace(/\D/g, '')

  let row = await db.customer.findUnique({ where: { id: key } })
  if (!row && phone) row = await db.customer.findUnique({ where: { phone } })
  if (!row) return fail('مشتری یافت نشد', 404)

  await db.crmEvent.deleteMany({ where: { customerId: row.id } })
  await db.crmEvent.deleteMany({ where: { customerId: row.phone } })
  await db.customer.delete({ where: { id: row.id } })
  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'crm.customer.delete',
    actionLabel: 'حذف مشتری',
    category: 'crm',
    detail: `${row.name} — ${row.phone}`,
    entityId: row.id,
  })
  return ok({ id: row.id })
}
