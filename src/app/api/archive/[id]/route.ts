import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { ARCHIVE_ROLES, BINDER_INCLUDE, docOut, sanitizeDocBody } from '@/lib/archive'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** GET /api/archive/[id] — جزئیات کامل سند + دادهٔ سبکِ سفارش/مرجوعی/چک/نمایندهٔ متصل */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!ARCHIVE_ROLES.includes(me.role)) return fail('دسترسی به آرشیو اسناد ندارید', 403)

  const { id } = await ctx.params
  const doc = await db.archiveDocument.findUnique({ where: { id }, include: BINDER_INCLUDE })
  if (!doc) return fail('سند یافت نشد', 404)

  /* ارجاع‌های سبک — بدون تکرار داده؛ فقط خلاصهٔ خوانا برای دیالوگ جزئیات */
  let linkedOrder: Record<string, unknown> | null = null
  if (doc.orderId) {
    const ord = await db.order.findUnique({
      where: { id: doc.orderId },
      include: { items: { select: { name: true, qty: true, unitBuyPrice: true }, take: 60 } },
    })
    if (ord) {
      linkedOrder = {
        id: ord.id,
        code: ord.code,
        status: ord.status,
        supplierName: ord.supplierName,
        deliveryDate: ord.deliveryDate,
        totalAmount: ord.totalAmount,
        payMethod: ord.payMethod,
        items: ord.items.map((it) => ({ name: it.name, qty: it.qty, unitBuyPrice: it.unitBuyPrice })),
      }
    }
  }

  let linkedReturn: Record<string, unknown> | null = null
  if (doc.returnId) {
    const ret = await db.returnRequest.findUnique({
      where: { id: doc.returnId },
      include: { items: { select: { name: true, qty: true, unit: true, unitPrice: true, lineTotal: true }, take: 60 } },
    })
    if (ret) {
      linkedReturn = {
        id: ret.id,
        code: ret.code,
        status: ret.status,
        customerName: ret.customerName,
        customerPhone: ret.customerPhone,
        reason: ret.reason,
        totalAmount: ret.totalAmount,
        exchangeValue: ret.exchangeValue,
        transferAmount: ret.transferAmount,
        createdAt: ret.createdAt.toISOString(),
        items: ret.items,
      }
    }
  }

  let linkedCheque: Record<string, unknown> | null = null
  if (doc.chequeId) {
    const chq = await db.cheque.findUnique({ where: { id: doc.chequeId } })
    if (chq) {
      linkedCheque = {
        id: chq.id,
        number: chq.number,
        amount: chq.amount,
        status: chq.status,
        dueDate: chq.dueDate,
        recipient: chq.recipient,
        selfIssued: chq.selfIssued,
        orderCode: chq.orderCode,
      }
    }
  }

  let rep: Record<string, unknown> | null = null
  if (doc.repId) {
    const r = await db.salesRep.findUnique({ where: { id: doc.repId } })
    if (r) rep = { id: r.id, name: r.name, mobile: r.mobile, company: r.company, title: r.title, active: r.active }
  }

  return ok({ ...docOut(doc), linkedOrder, linkedReturn, linkedCheque, rep })
}

/** PUT /api/archive/[id] — ویرایش کامل/جزئی سند (همان فیلدهای POST) */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!ARCHIVE_ROLES.includes(me.role)) return fail('دسترسی به آرشیو اسناد ندارید', 403)

  const { id } = await ctx.params
  const doc = await db.archiveDocument.findUnique({ where: { id } })
  if (!doc) return fail('سند یافت نشد', 404)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const res = await sanitizeDocBody(body as Record<string, unknown>, { partial: true })
  if (!res.ok) return fail(res.error)
  if (!Object.keys(res.data).length) return fail('فیلدی برای ویرایش ارسال نشده است')

  const updated = await db.archiveDocument.update({
    where: { id },
    data: res.data,
    include: BINDER_INCLUDE,
  })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'archive.doc.update',
    actionLabel: 'ویرایش سند آرشیو',
    category: 'archive',
    detail: `${updated.title} (${updated.kind})`,
    entityId: updated.id,
  })

  return ok(docOut(updated))
}

/** DELETE /api/archive/[id] — حذف سند (با تأیید در رابط کاربری) */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!ARCHIVE_ROLES.includes(me.role)) return fail('دسترسی به آرشیو اسناد ندارید', 403)

  const { id } = await ctx.params
  const doc = await db.archiveDocument.findUnique({ where: { id } })
  if (!doc) return fail('سند یافت نشد', 404)

  await db.archiveDocument.delete({ where: { id } })
  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'archive.doc.delete',
    actionLabel: 'حذف سند آرشیو',
    category: 'archive',
    detail: `${doc.title} (${doc.kind}) — ${doc.supplierName ?? 'بدون تأمین‌کننده'}`,
    entityId: doc.id,
  })

  return ok({ deleted: true })
}
