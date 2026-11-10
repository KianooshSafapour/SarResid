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

/** GET /api/store/waste — حالت‌های R9 + قرارداد قدیمی
 *  ?groups=1                    → فهرست تأمین‌کنندگان دارای ضایعات + شمارنده‌ها (برای انتخاب‌گر طرف‌حساب)
 *  ?supplierId=<id>&mode=full    → ضایعات یک تأمین‌کننده با همهٔ وضعیت‌ها + آمار (نمای «ضایعاتِ این طرف‌حساب»)
 *  ?supplierId=<id>&status=PENDING → فقط در انتظار (برای پنل انتخاب در سفارش جدید)
 *  از=&تا=&reason= (قدیمی)       → شکل زندهٔ اصلی (دوره/علت) — اقلام حالا status/supplier هم دارند */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'store/waste')
  if (!gate.ok) return fail(gate.deny, 403)

  const sp = req.nextUrl.searchParams
  const today = todayJalaliDash()

  /* ── R9 mode: فهرست طرف‌حساب‌های دارای ضایعات ── */
  if ((sp.get('groups') ?? '') === '1') {
    const rows = await db.wasteRecord.groupBy({
      by: ['supplierId', 'supplierName'],
      _count: { _all: true },
    })
    const pending = await db.wasteRecord.groupBy({
      by: ['supplierId'],
      where: { status: 'PENDING' },
      _count: { _all: true },
    })
    const pendingMap = new Map(pending.map((p) => [p.supplierId ?? '', p._count._all]))
    const groups = rows
      .filter((r) => r.supplierId)
      .map((r) => ({
        supplierId: r.supplierId as string,
        supplierName: r.supplierName ?? '',
        total: r._count._all,
        pending: pendingMap.get(r.supplierId ?? '') ?? 0,
      }))
      .sort((a, b) => b.pending - a.pending || b.total - a.total)
    return ok({ today, groups })
  }

  /* ── R9 mode: ضایعات یک تأمین‌کننده ── */
  const supplierIdQ = (sp.get('supplierId') ?? '').trim()
  if (supplierIdQ) {
    const supplier = await db.supplier.findUnique({
      where: { id: supplierIdQ },
      select: { id: true, name: true, code: true, phone: true, classification: true },
    })
    if (!supplier) return fail('تأمین‌کننده یافت نشد', 404)
    const statusQ = (sp.get('status') ?? '').trim().toUpperCase()
    const where: { supplierId: string; status?: string } = { supplierId: supplierIdQ }
    if (['PENDING', 'SELECTED', 'RETURNED'].includes(statusQ)) where.status = statusQ
    const items = await db.wasteRecord.findMany({
      where,
      orderBy: [{ status: 'asc' }, { date: 'desc' }, { createdAt: 'desc' }],
    })
    const counts = {
      pending: items.filter((i) => i.status === 'PENDING').length,
      selected: items.filter((i) => i.status === 'SELECTED').length,
      returned: items.filter((i) => i.status === 'RETURNED').length,
    }
    const value = {
      pending: items.filter((i) => i.status === 'PENDING').reduce((s, i) => s + i.estValue, 0),
      selected: items.filter((i) => i.status === 'SELECTED').reduce((s, i) => s + i.estValue, 0),
      returned: items.filter((i) => i.status === 'RETURNED').reduce((s, i) => s + i.estValue, 0),
    }
    return ok({
      today,
      supplier,
      items: items.map(wasteItemShape),
      stats: { counts, value },
    })
  }

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
    items: items.map(wasteItemShape),
    summary: {
      totalValue,
      count: items.length,
      monthTotal,
      byReason,
      topProducts,
    },
  })
}

/** R9: شکل مشترک هر رکورد ضایعات (همهٔ حالت‌های GET) */
function wasteItemShape(i: { id: string; date: string; name: string; qty: number; unit: string; reason: string; estValue: number; userName: string | null; note: string | null; supplierId: string | null; supplierName: string | null; productId: string | null; barcode: string | null; status: string; orderId: string | null; orderCode: string | null; selectedAtJalali: string | null; selectedByName: string | null; returnedAtJalali: string | null }) {
  return {
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
    // R9: پیوند طرف‌حساب + وضعیت گردش کار
    supplierId: i.supplierId,
    supplierName: i.supplierName,
    productId: i.productId,
    barcode: i.barcode,
    status: i.status ?? 'PENDING',
    statusLabel:
      i.status === 'SELECTED' ? 'برگشت با سفارش بعدی' : i.status === 'RETURNED' ? 'برگشت به تأمین‌کننده' : 'در انتظار',
    orderId: i.orderId,
    orderCode: i.orderCode,
    selectedAtJalali: i.selectedAtJalali,
    selectedByName: i.selectedByName,
    returnedAtJalali: i.returnedAtJalali,
  }
}

/** POST /api/store/waste {productId?,name,qty,reason,estValue?,note?, supplierId?} */
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

  // R9: طرف‌حساب (تأمین‌کننده) — ضایعات به نام او ثبت می‌شود تا با سفارش بعدی برگردد
  let supplierId: string | null = typeof body?.supplierId === 'string' && body.supplierId ? body.supplierId : null
  let supplierName: string | null = null
  if (supplierId) {
    const sup = await db.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true } })
    if (!sup) return fail('تأمین‌کننده یافت نشد')
    supplierName = sup.name
  }

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
      // R9: پیوند طرف‌حساب — وضعیت آغازین PENDING (در انتظار برگشت با سفارش بعدی)
      ...(supplierId ? { supplierId, supplierName: supplierName ?? '', status: 'PENDING' } : {}),
      ...(productId ? { productId, barcode: (await db.product.findUnique({ where: { id: productId }, select: { code: true } }))?.code ?? null } : {}),
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
    detail: `${name} — ${qty} ${unit} (${REASON_LABELS[reason]})${supplierName ? ` · طرف‌حساب: ${supplierName}` : ''}`,
    entityId: rec.id,
  })

  return ok({ id: rec.id, waste: wasteItemShape(rec as any) })
}

/** PATCH /api/store/waste — R9 گردش کار ضایعاتِ طرف‌حساب
 *  {id, action:'mark-returned'}        → وضعیت RETURNED (برگشت فیزیکی بدون سفارش — ثبت دستی مدیر)
 *  {id, action:'revert'}               → SELECTED → PENDING (لغو انتخاب برای سفارش)
 *  {id, action:'edit', qty?, reason?, note?, estValue?} → ویرایش رکورد (فقط PENDING) */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'store/waste')
  if (!gate.ok) return fail(gate.deny, 403)

  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const action = typeof body?.action === 'string' ? body.action : ''
  const rec = await db.wasteRecord.findUnique({ where: { id } })
  if (!rec) return fail('رکورد یافت نشد', 404)

  if (action === 'mark-returned') {
    if (!isManager(user)) return fail('علامت‌گذاری «برگشت» فقط با دسترسی مدیران ممکن است', 403)
    if (rec.status === 'RETURNED') return fail('این قلم از قبل برگشت خورده است')
    await db.wasteRecord.update({
      where: { id },
      data: { status: 'RETURNED', returnedAtJalali: todayJalaliDash() },
    })
    await logActivity({
      userId: user.id,
      userName: user.fullName,
      action: 'waste.returned',
      actionLabel: 'ضایعات',
      category: 'waste',
      detail: `برگشت به تأمین‌کننده: ${rec.name}${rec.supplierName ? ` — ${rec.supplierName}` : ''}`,
      entityId: id,
    })
    return ok({ id, status: 'RETURNED' })
  }

  if (action === 'revert') {
    if (!isManager(user) && rec.userId !== user.id) return fail('اجازه تغییر این رکورد را ندارید', 403)
    if (rec.status !== 'SELECTED') return fail('فقط اقلام «برگشت با سفارش بعدی» قابل بازگشت به انتظار هستند')
    await db.wasteRecord.update({ where: { id }, data: { status: 'PENDING', orderId: null, orderCode: null, selectedAtJalali: null, selectedByName: null } })
    await logActivity({
      userId: user.id,
      userName: user.fullName,
      action: 'waste.revert',
      actionLabel: 'ضایعات',
      category: 'waste',
      detail: `بازگشت به انتظار: ${rec.name}`,
      entityId: id,
    })
    return ok({ id, status: 'PENDING' })
  }

  if (action === 'edit') {
    if (!isManager(user) && rec.userId !== user.id) return fail('اجازه ویرایش این رکورد را ندارید', 403)
    if (rec.status !== 'PENDING') return fail('فقط اقلام در انتظار قابل ویرایش هستند')
    const patch: { qty?: number; reason?: string; note?: string | null; estValue?: number } = {}
    if (body?.qty !== undefined) {
      const q = Math.round(Number(body.qty) * 1000) / 1000
      if (!Number.isFinite(q) || q <= 0) return fail('تعداد نامعتبر است')
      patch.qty = q
    }
    if (body?.reason !== undefined && VALID_REASONS.includes(body.reason)) patch.reason = body.reason
    if (body?.note !== undefined) patch.note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null
    if (body?.estValue !== undefined) {
      const v = Number(body.estValue)
      if (!Number.isFinite(v) || v < 0) return fail('ارزش تخمینی نامعتبر است')
      patch.estValue = v
    }
    if (Object.keys(patch).length === 0) return fail('چیزی برای ویرایش نفرستاده شد')
    await db.wasteRecord.update({ where: { id }, data: patch })
    await logActivity({
      userId: user.id,
      userName: user.fullName,
      action: 'waste.edit',
      actionLabel: 'ضایعات',
      category: 'waste',
      detail: `ویرایش: ${rec.name}`,
      entityId: id,
    })
    return ok({ id, edited: true })
  }

  return fail('عملیات ناشناخته است')
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
