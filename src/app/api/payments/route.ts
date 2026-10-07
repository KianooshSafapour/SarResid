import { db } from '@/lib/db'
import { appendHistory, fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { canViewApi, hasCap } from '@/lib/rbac'
import { isExecRole } from '@/lib/constants'
import { jMonthLength, jalaliToIso, toJalaliParts, todayIso } from '@/lib/jalali'

const KINDS = ['CASH', 'POS', 'TRANSFER', 'OTHER']
const KIND_LABELS: Record<string, string> = { CASH: 'نقدی', POS: 'کارت‌خوان', TRANSFER: 'کارت به کارت / حواله', OTHER: 'سایر' }

/* ── round-19f: تعیین روش پرداخت سفارش (نقدی / کارتخوان فروشگاه / چک) + ثبت در دفتر ──
 * Order.payMethod: CASH | POS | CHEQUE — ستون‌ها از قبل در schema هستند (بدون دست‌زدن به schema).
 * نگاشت به kinds مدل Payment: نقدی→CASH، کارتخوان فروشگاه→POS، چک→OTHER (مرجع در note).
 * قفل: به‌محض ثبت اولین Payment برای سفارش، تعیین روش فقط از دست مالک (OWNER) است. */
const ORDER_METHODS = ['CASH', 'POS', 'CHEQUE']
const ORDER_METHOD_LABELS: Record<string, string> = { CASH: 'نقدی', POS: 'کارتخوان فروشگاه', CHEQUE: 'چک' }
const METHOD_TO_KIND: Record<string, string> = { CASH: 'CASH', POS: 'POS', CHEQUE: 'OTHER' }

/** آیا سفارش در دفتر قفل شده؟ (وجود هر Payment با همین orderId) */
async function orderPaymentLocked(orderId: string) {
  return (await db.payment.count({ where: { orderId } })) > 0
}

async function setOrderPayment(me: { id: string; name: string; role: string; secondaryRoles: string[]; roleIds?: string }, body: Record<string, unknown>) {
  const orderId = String(body.orderId || '')
  const payMethod = String(body.payMethod || '')
  if (!orderId) return fail('شناسهٔ سفارش الزامی است')
  if (!ORDER_METHODS.includes(payMethod)) return fail('روش پرداخت باید نقدی، کارتخوان فروشگاه یا چک باشد')
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) return fail('سفارش یافت نشد', 404)
  const locked = await orderPaymentLocked(orderId)
  if (locked && me.role !== 'OWNER') return fail('پرداخت این سفارش در دفتر ثبت و قفل شده — فقط مالک می‌تواند تغییر دهد', 403)
  const paymentRef = String(body.paymentRef ?? '').slice(0, 60)
  if (order.payMethod === payMethod && order.paymentRef === paymentRef) return json({ order, unchanged: true, locked })
  const updated = await db.order.update({
    where: { id: orderId },
    data: {
      payMethod,
      paymentRef,
      history: appendHistory(order.history, {
        userId: me.id,
        userName: me.name,
        action: 'تعیین روش پرداخت',
        detail: `${ORDER_METHOD_LABELS[payMethod]}${paymentRef ? ` — مرجع: ${paymentRef}` : ''}`,
      }),
    },
  })
  await logActivity(me, 'تعیین روش پرداخت سفارش', 'order', orderId, `${ORDER_METHOD_LABELS[payMethod]}${paymentRef ? ` — مرجع: ${paymentRef}` : ''}`)
  return json({ order: updated, locked })
}

async function finalizeOrderPayment(me: { id: string; name: string; role: string; secondaryRoles: string[]; roleIds?: string }, body: Record<string, unknown>) {
  const orderId = String(body.orderId || '')
  const payMethod = String(body.payMethod || '')
  if (!orderId) return fail('شناسهٔ سفارش الزامی است')
  if (!ORDER_METHODS.includes(payMethod)) return fail('روش پرداخت باید نقدی، کارتخوان فروشگاه یا چک باشد')
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) return fail('سفارش یافت نشد', 404)
  const locked = await orderPaymentLocked(orderId)
  if (locked && me.role !== 'OWNER') return fail('پرداخت این سفارش قبلاً در دفتر ثبت شده — فقط مالک می‌تواند تغییر دهد', 403)
  const paymentRef = String(body.paymentRef ?? '').slice(0, 60)
  const kind = METHOD_TO_KIND[payMethod]

  // ایدمپوتنت: Payment تکراری با همان orderId+kind دوباره ساخته نمی‌شود
  let payment = await db.payment.findFirst({ where: { orderId, kind }, orderBy: { createdAt: 'desc' } })
  let deduped = !!payment
  if (!payment) {
    const note =
      String(body.note || '').slice(0, 400) ||
      (payMethod === 'CHEQUE'
        ? paymentRef
          ? `چک — شماره/سریال: ${paymentRef}`
          : 'چک'
        : payMethod === 'POS'
          ? paymentRef
            ? `کارتخوان فروشگاه — کارت: ${paymentRef}`
            : 'کارتخوان فروشگاه'
          : paymentRef
            ? `نقدی — سریال صیاد: ${paymentRef}`
            : 'نقدی')
    payment = await db.payment.create({
      data: {
        kind,
        amount: Number(body.amount) > 0 ? Number(body.amount) : order.totalAmount,
        orderId: order.id,
        orderCode: order.code,
        providerName: order.providerName,
        repId: order.createdById,
        repName: order.createdByName,
        paidAt: String(body.paidAt || todayIso()).slice(0, 10),
        holooReceiptNo: String(body.holooReceiptNo || '').slice(0, 60),
        note,
        createdById: me.id,
        createdByName: me.name,
        history: JSON.stringify([
          {
            at: new Date().toISOString(),
            userId: me.id,
            userName: me.name,
            action: 'ثبت در دفتر',
            detail: `${ORDER_METHOD_LABELS[payMethod]} — سفارش ${order.code}${paymentRef ? ` — مرجع: ${paymentRef}` : ''}`,
          },
        ]),
      },
    })
  }

  // همگام‌سازی تعیین روش روی خود سفارش + قفل در تاریخچه
  const updatedOrder =
    order.payMethod === payMethod && order.paymentRef === paymentRef
      ? order
      : await db.order.update({
          where: { id: orderId },
          data: {
            payMethod,
            paymentRef,
            history: appendHistory(order.history, {
              userId: me.id,
              userName: me.name,
              action: 'ثبت در دفتر',
              detail: `${ORDER_METHOD_LABELS[payMethod]}${paymentRef ? ` — مرجع: ${paymentRef}` : ''}${deduped ? ' (بدون ردیف تکراری)' : ''}`,
            }),
          },
        })
  await logActivity(
    me,
    deduped ? 'ثبت در دفتر (بدون تکرار)' : 'ثبت پرداخت سفارش در دفتر',
    'payment',
    payment.id,
    `${KIND_LABELS[kind]} — سفارش ${order.code} — ${order.providerName}`
  )
  return json({ payment: { ...payment, history: JSON.parse(payment.history || '[]') }, order: updatedOrder, locked: true, deduped }, deduped ? 200 : 201)
}

/** ثبت/ویرایش پرداخت: مدیران اجرایی، حسابدار (cap cheques.create) یا مدیران مالی */
async function canManage(me: { role: string; secondaryRoles: string[]; roleIds?: string } | null): Promise<boolean> {
  if (!me) return false
  if (isExecRole(me.role)) return true
  return hasCap(me as never, 'cheques.create')
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'cheques'))) return fail('دسترسی به بخش چک‌ها را ندارید', 403)

  const payments = await db.payment.findMany({ orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }] })

  const today = todayIso()
  // بازهٔ ماه شمسی جاری
  const parts = toJalaliParts(today)
  const monthStart = jalaliToIso(parts.jy, parts.jm, 1)
  const monthEnd = jalaliToIso(parts.jy, parts.jm, jMonthLength(parts.jy, parts.jm))

  const byKind: Record<string, { count: number; amount: number }> = {}
  let total = 0
  let todayAmount = 0
  let todayCount = 0
  let monthAmount = 0
  let monthCount = 0
  for (const p of payments) {
    const day = String(p.paidAt).slice(0, 10)
    total += p.amount
    const k = (byKind[p.kind] ||= { count: 0, amount: 0 })
    k.count++
    k.amount += p.amount
    if (day === today) {
      todayAmount += p.amount
      todayCount++
    }
    if (day >= monthStart && day <= monthEnd) {
      monthAmount += p.amount
      monthCount++
    }
  }

  return json({
    payments: payments.map((p) => ({ ...p, history: JSON.parse(p.history || '[]') })),
    stats: {
      count: payments.length,
      total,
      today: { count: todayCount, amount: todayAmount },
      month: { count: monthCount, amount: monthAmount },
      byKind,
    },
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canManage(me))) return fail('ثبت پرداخت نیاز به دسترسی مالی دارد', 403)
  const body = await req.json().catch(() => ({}))

  const kind = String(body.kind || 'CASH')
  if (!KINDS.includes(kind)) return fail('روش پرداخت نامعتبر است')
  const amount = Number(body.amount)
  if (!amount || amount <= 0) return fail('مبلغ پرداخت الزامی است')
  const paidAt = String(body.paidAt || todayIso()).slice(0, 10)

  const payment = await db.payment.create({
    data: {
      kind,
      amount,
      orderId: String(body.orderId || ''),
      orderCode: String(body.orderCode || ''),
      providerName: String(body.providerName || '').slice(0, 120),
      repId: String(body.repId || ''),
      repName: String(body.repName || '').slice(0, 120),
      paidAt,
      holooReceiptNo: String(body.holooReceiptNo || '').slice(0, 60),
      note: String(body.note || '').slice(0, 400),
      createdById: me.id,
      createdByName: me.name,
      history: JSON.stringify([
        {
          at: new Date().toISOString(),
          userId: me.id,
          userName: me.name,
          action: 'ثبت پرداخت',
          detail: `${KIND_LABELS[kind]} — ${body.orderCode ? `سفارش ${body.orderCode}` : 'مستقل'}`,
        },
      ]),
    },
  })
  await logActivity(me, 'ثبت پرداخت مستقل', 'payment', payment.id, `${KIND_LABELS[kind]} ${payment.providerName || ''}`)
  return json({ payment: { ...payment, history: JSON.parse(payment.history) } }, 201)
}

export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  // ── round-19f: اکشن‌های تعیین روش پرداخت سفارش (حسابدار/مدیر) ──
  if (body.action === 'set-order-payment') {
    if (!(await canManage(me))) return fail('تعیین روش پرداخت نیاز به دسترسی مالی دارد', 403)
    return setOrderPayment(me, body)
  }
  if (body.action === 'finalize-order-payment') {
    if (!(await canManage(me))) return fail('ثبت در دفتر نیاز به دسترسی مالی دارد', 403)
    return finalizeOrderPayment(me, body)
  }

  if (!(await canManage(me))) return fail('ویرایش پرداخت نیاز به دسترسی مالی دارد', 403)
  const id = String(body.id || '')
  if (!id) return fail('شناسهٔ پرداخت الزامی است')
  const payment = await db.payment.findUnique({ where: { id } })
  if (!payment) return fail('پرداخت یافت نشد', 404)

  const data: Record<string, unknown> = {}
  const changes: string[] = []
  const fields: [string, (v: unknown) => unknown][] = [
    ['kind', (v) => (KINDS.includes(String(v)) ? String(v) : payment.kind)],
    ['amount', (v) => (Number(v) > 0 ? Number(v) : payment.amount)],
    ['providerName', (v) => String(v ?? '').slice(0, 120)],
    ['repId', (v) => String(v ?? '')],
    ['repName', (v) => String(v ?? '').slice(0, 120)],
    ['paidAt', (v) => String(v ?? payment.paidAt).slice(0, 10)],
    ['holooReceiptNo', (v) => String(v ?? '').slice(0, 60)],
    ['note', (v) => String(v ?? '').slice(0, 400)],
    ['orderCode', (v) => String(v ?? '')],
    ['orderId', (v) => String(v ?? '')],
  ]
  for (const [key, norm] of fields) {
    if (body[key] === undefined) continue
    const next = norm(body[key])
    if (next !== (payment as unknown as Record<string, unknown>)[key]) {
      data[key] = next
      changes.push(`${key}: ${String((payment as unknown as Record<string, unknown>)[key] ?? '')} ← ${String(next)}`)
    }
  }
  if (!Object.keys(data).length) return json({ payment: { ...payment, history: JSON.parse(payment.history || '[]') }, unchanged: true })

  const updated = await db.payment.update({
    where: { id },
    data: { ...data, history: appendHistory(payment.history, { userId: me.id, userName: me.name, action: 'ویرایش پرداخت', detail: changes.join(' | ').slice(0, 300) }) },
  })
  await logActivity(me, 'ویرایش پرداخت', 'payment', id, changes.join(' | ').slice(0, 120))
  return json({ payment: { ...updated, history: JSON.parse(updated.history || '[]') } })
}

export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return fail('شناسهٔ پرداخت الزامی است')
  const payment = await db.payment.findUnique({ where: { id } })
  if (!payment) return fail('پرداخت یافت نشد', 404)
  // فقط ثبت‌کنندهٔ همان رکورد یا مدیران اجرایی
  if (payment.createdById !== me.id && !isExecRole(me.role)) return fail('فقط ثبت‌کننده یا مدیران اجرایی می‌توانند حذف کنند', 403)
  await db.payment.delete({ where: { id } })
  await logActivity(me, 'حذف پرداخت', 'payment', id, `${payment.kind} ${payment.providerName || ''}`)
  return json({ ok: true })
}
