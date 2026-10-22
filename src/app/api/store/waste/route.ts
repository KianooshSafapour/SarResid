import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'
import { todayJalaliDash, parseJalaliDash } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/** Live WASTE reason labels (chunk 9866703a38254dff.js) */
const REASON_LABELS: Record<string, string> = {
  EXPIRED: 'منقضی',
  DAMAGED: 'آسیب‌دیده',
  SPOILED: 'فاسد',
  THEFT: 'سرقت',
  OTHER: 'سایر',
}
const VALID_REASONS = Object.keys(REASON_LABELS)

function monthStart(dash: string): string {
  const { jy, jm } = parseJalaliDash(dash)
  return `${jy}-${String(jm).padStart(2, '0')}-01`
}

/** GET /api/store/waste?from=&to=&reason= → {range,items,summary} */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'store/waste')
  if (!gate.ok) return fail(gate.deny, 403)

  const today = todayJalaliDash()
  const from = validDash(req.nextUrl.searchParams.get('from')) || monthStart(today)
  const to = validDash(req.nextUrl.searchParams.get('to')) || today
  const reason = req.nextUrl.searchParams.get('reason') || ''

  const where: { date: { gte: string; lte: string }; reason?: string } = { date: { gte: from, lte: to } }
  if (reason && VALID_REASONS.includes(reason)) where.reason = reason

  const [items, monthItems] = await Promise.all([
    db.wasteRecord.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
    db.wasteRecord.findMany({ where: { date: { gte: monthStart(today), lte: today } } }),
  ])

  const totalValue = items.reduce((s, i) => s + i.estValue, 0)
  const monthTotal = monthItems.reduce((s, i) => s + i.estValue, 0)

  // group by reason
  const reasonMap = new Map<string, { reason: string; value: number; count: number }>()
  for (const i of items) {
    const cur = reasonMap.get(i.reason) ?? { reason: i.reason, value: 0, count: 0 }
    cur.value += i.estValue
    cur.count += 1
    reasonMap.set(i.reason, cur)
  }
  const byReason = [...reasonMap.values()]
    .sort((a, b) => b.value - a.value)
    .map((r) => ({ ...r, label: REASON_LABELS[r.reason] ?? r.reason }))

  // group by product
  const prodMap = new Map<string, { name: string; qty: number; value: number }>()
  for (const i of items) {
    const cur = prodMap.get(i.name) ?? { name: i.name, qty: 0, value: 0 }
    cur.qty += i.qty
    cur.value += i.estValue
    prodMap.set(i.name, cur)
  }
  const topProducts = [...prodMap.values()].sort((a, b) => b.value - a.value).slice(0, 5)

  return ok({
    range: { from, to },
    items: items.map((i) => ({
      id: i.id,
      date: i.date,
      name: i.name,
      qty: i.qty,
      unit: i.unit,
      reason: i.reason,
      reasonLabel: REASON_LABELS[i.reason] ?? i.reason,
      estValue: i.estValue,
      userName: i.userName,
      note: i.note,
    })),
    summary: {
      totalValue,
      count: items.length,
      monthTotal,
      byReason,
      topProducts,
    },
  })
}

/** POST /api/store/waste {productId?,name,qty,reason,estValue?,note?} */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'store/waste')
  if (!gate.ok) return fail(gate.deny, 403)

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return fail('نام کالا را وارد کنید یا از فهرست انتخاب کنید')

  const qty = Number(body?.qty)
  if (!Number.isFinite(qty) || qty <= 0) return fail('تعداد را وارد کنید')

  const reason = VALID_REASONS.includes(body?.reason) ? body.reason : 'OTHER'
  const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim() : null
  const productId = typeof body?.productId === 'string' && body.productId ? body.productId : null

  // estValue: explicit → use; else estimate from the linked product's last buy price
  let estValue = Number(body?.estValue)
  if (!Number.isFinite(estValue) || estValue < 0) {
    estValue = 0
    if (productId) {
      const p = await db.product.findUnique({ where: { id: productId }, select: { lastBuyPrice: true, sellPrice: true } })
      if (p) estValue = Math.round(qty * (p.lastBuyPrice || p.sellPrice || 0))
    }
  }

  const unit = productId ? ((await db.product.findUnique({ where: { id: productId }, select: { unit: true } }))?.unit ?? 'عدد') : 'عدد'

  const rec = await db.wasteRecord.create({
    data: {
      date: todayJalaliDash(),
      name,
      qty: Math.round(qty * 1000) / 1000,
      unit,
      reason,
      estValue,
      userId: user.id,
      userName: user.fullName,
      note,
    },
  })

  // linked product → decrement stock automatically (live behavior)
  if (productId) {
    await db.product.update({ where: { id: productId }, data: { stock: { decrement: Math.round(qty) } } }).catch(() => null)
  }

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'waste.create',
    actionLabel: 'ضایعات',
    category: 'waste',
    detail: `${name} — ${qty} ${unit} (${REASON_LABELS[reason]})`,
    entityId: rec.id,
  })

  return ok({ id: rec.id, waste: rec })
}

/** DELETE /api/store/waste?id= (body may carry a deletion reason) — managers or own records */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'store/waste')
  if (!gate.ok) return fail(gate.deny, 403)

  const id = req.nextUrl.searchParams.get('id') || ''
  const rec = await db.wasteRecord.findUnique({ where: { id } })
  if (!rec) return fail('رکورد یافت نشد', 404)
  if (!isManager(user) && rec.userId !== user.id) return fail('اجازه حذف این رکورد را ندارید', 403)

  const body = await req.json().catch(() => null)
  const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : null

  await db.wasteRecord.delete({ where: { id } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'waste.delete',
    actionLabel: 'ضایعات',
    category: 'waste',
    detail: `${rec.name}${reason ? ` — دلیل حذف: ${reason}` : ''}`,
    entityId: id,
  })
  return ok({ deleted: true })
}

function validDash(v: string | null): string | null {
  if (!v) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}
