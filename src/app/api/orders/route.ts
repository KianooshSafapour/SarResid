import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { toJalaliParts } from '@/lib/jalali'
import { correctionState, isPendingApproval } from './lifecycle'

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || ''
  const overdue = searchParams.get('overdue') === '1'

  const orders = await db.order.findMany({ orderBy: { createdAt: 'desc' } })
  const items = await db.orderItem.findMany()
  const today = new Date().toISOString().slice(0, 10)

  let list = orders
  if (status) list = list.filter((o) => o.status === status)
  if (overdue)
    list = list.filter(
      (o) => ['APPROVED', 'RECEIVING'].includes(o.status) && o.deliveryDate < today
    )

  return json({
    orders: list.map((o) => ({
      ...o,
      history: JSON.parse(o.history || '[]'),
      itemsCount: items.filter((i) => i.orderId === o.id).length,
      itemsTotalQty: items.filter((i) => i.orderId === o.id).reduce((s, i) => s + i.qty, 0),
      isOverdue: ['APPROVED', 'RECEIVING'].includes(o.status) && o.deliveryDate < today,
      // round-19e: گیت تأیید نهایی مدیر + وضعیت پنجرهٔ اصلاح
      pendingApproval: isPendingApproval(o.status),
      correction: correctionState(o),
    })),
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  const { providerId, providerName, items, deliveryDate, payMethod, notes } = body
  if (!providerId || !Array.isArray(items) || items.length === 0)
    return fail('تأمین‌کننده و اقلام سفارش الزامی است')
  if (!deliveryDate) return fail('تاریخ تحویل را انتخاب کنید')

  const now = new Date()
  const { jy } = toJalaliParts(now)
  const count = await db.order.count()
  const code = `HZ-${jy}-${String(count + 1).padStart(4, '0')}`
  const total = items.reduce((s: number, it: any) => s + (Number(it.qty) || 0) * (Number(it.unitBuyPrice) || 0), 0)

  const order = await db.order.create({
    data: {
      code,
      providerId,
      providerName,
      createdById: me.id,
      createdByName: me.name,
      status: body.status || 'SUBMITTED',
      deliveryDate,
      payMethod: payMethod || 'CASH',
      notes: notes || '',
      totalAmount: total,
      history: JSON.stringify([
        {
          at: now.toISOString(),
          userId: me.id,
          userName: me.name,
          action: body.status === 'APPROVED' ? 'ایجاد و تأیید سفارش' : 'ایجاد سفارش',
          detail: `${items.length} قلم کالا`,
        },
      ]),
    },
  })
  for (const it of items) {
    const p = await db.product.findUnique({ where: { id: it.productId } })
    await db.orderItem.create({
      data: {
        orderId: order.id,
        productId: it.productId,
        productName: p?.name || it.productName || '',
        barcode: p ? JSON.parse(p.barcodes || '[]')[0] || '' : '',
        qty: Number(it.qty) || 1,
        unitBuyPrice: Number(it.unitBuyPrice) || 0,
        vat: 9,
      },
    })
  }
  await logActivity(me, 'ثبت سفارش جدید', 'order', order.id, `${code} - ${providerName}`)
  return json({ order }, 201)
}
