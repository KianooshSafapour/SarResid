import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { computeSettlementType, isoOrNull } from '../route'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** GET /api/returns/[id] — full detail (live bulk-details shape) */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const { id } = await ctx.params
  const r = await db.returnRequest.findUnique({
    where: { id },
    include: { items: true },
  })
  if (!r) return fail('مرجوعی یافت نشد', 404)

  const users = await db.user.findMany({
    where: { id: { in: [r.cashierId ?? '', r.approvedById ?? ''].filter(Boolean) } },
  })
  const byId = new Map(users.map((u) => [u.id, u]))
  const cashier = r.cashierId ? byId.get(r.cashierId) : undefined
  const approver = r.approvedById ? byId.get(r.approvedById) : undefined

  const paymentRow = await db.returnPayment.findFirst({ where: { returnId: r.id } })
  let payment: Record<string, unknown> | null = null
  if (paymentRow) {
    const j = safeJson<Record<string, null | string>>(paymentRow.note, {})
    payment = {
      amount: paymentRow.amount,
      bankName: j.bankName ?? null,
      accountNumber: j.accountNumber ?? null,
      cardNumber: j.cardNumber ?? null,
      referenceNumber: j.referenceNumber ?? null,
      transferredAt: j.transferredAt ?? null,
      recordedBy: j.recordedBy ?? null,
      createdAt: paymentRow.createdAt.toISOString(),
    }
  }

  return ok({
    return: {
      id: r.id,
      code: r.code,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      customerCardNumber: r.customerCardNumber,
      purchaseAt: r.purchaseAt,
      reason: r.reason,
      note: r.note,
      totalAmount: r.totalAmount,
      exchangeValue: r.exchangeValue,
      transferAmount: r.transferAmount,
      transferNote: r.transferNote,
      settlementType: r.settlementType,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      submittedAt: isoOrNull(r.submittedAt),
      approvedAt: isoOrNull(r.approvedAt),
      cashier: cashier ? { id: cashier.id, fullName: cashier.fullName, title: cashier.title } : null,
      approvedBy: approver ? { id: approver.id, fullName: approver.fullName } : null,
      items: r.items.map((it) => ({
        id: it.id,
        name: it.name,
        barcode: it.barcode,
        qty: it.qty,
        unit: it.unit,
        unitPrice: it.unitPrice,
        lineTotal: it.lineTotal,
      })),
      payment,
    },
  })
}

/**
 * PATCH /api/returns/[id] — legacy action switch (task contract).
 * The live frontend uses the dedicated /approve + /payment endpoints instead.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const { id } = await ctx.params
  const r = await db.returnRequest.findUnique({ where: { id } })
  if (!r) return fail('مرجوعی یافت نشد', 404)

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action ?? '')

  if (action === 'submit') {
    if (r.status !== 'draft') return fail('این مرجوعی قبلاً ارسال شده است')
    await db.returnRequest.update({
      where: { id },
      data: { status: 'pending', submittedAt: new Date() },
    })
  } else if (action === 'approve') {
    if (r.status !== 'pending') return fail('فقط مرجوعی در انتظار تأیید قابل تأیید است')
    const waiting = r.transferAmount > 0
    await db.returnRequest.update({
      where: { id },
      data: {
        status: waiting ? 'approved' : 'paid',
        approvedById: me.id,
        approvedAt: new Date(),
      },
    })
  } else if (action === 'settle') {
    if (r.status !== 'approved') return fail('این مرجوعی در وضعیت تأییدشده نیست')
    const exchangeValue = Math.max(0, Math.round(Number(body.exchangeValue ?? r.exchangeValue) || 0))
    const transferAmount = Math.max(0, Math.round(Number(body.transferAmount ?? r.transferAmount) || 0))
    const transferNote = body.transferNote != null ? String(body.transferNote) : r.transferNote
    await db.returnRequest.update({
      where: { id },
      data: {
        status: 'paid',
        exchangeValue,
        transferAmount,
        transferNote,
        settlementType: computeSettlementType(r.totalAmount, exchangeValue, transferAmount),
      },
    })
    if (transferAmount > 0) {
      await db.returnPayment.create({
        data: {
          returnId: id,
          kind: 'TRANSFER',
          amount: transferAmount,
          note: JSON.stringify({
            bankName: null,
            accountNumber: null,
            cardNumber: null,
            referenceNumber: null,
            transferredAt: null,
            recordedBy: me.fullName,
          }),
        },
      })
    }
  } else if (action === 'reject') {
    if (r.status !== 'pending') return fail('فقط مرجوعی در انتظار تأیید قابل رد است')
    await db.returnRequest.update({
      where: { id },
      data: { status: 'draft', note: body.reason ? `${r.note ?? ''}\nرد: ${body.reason}`.trim() : r.note },
    })
  } else {
    return fail('عملیات نامعتبر است')
  }

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: `return.${action}`,
    actionLabel: 'گردش مرجوعی',
    category: 'returns',
    detail: `${r.code} — ${action}`,
    entityId: id,
  })

  const updated = await db.returnRequest.findUnique({ where: { id } })
  return ok({ id, code: r.code, status: updated?.status ?? null })
}
