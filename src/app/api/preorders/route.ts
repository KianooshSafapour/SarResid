import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { toJalaliParts } from '@/lib/jalali'

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const scope = searchParams.get('scope') || 'all'
  const preOrders = await db.preOrder.findMany({ orderBy: { createdAt: 'desc' } })
  let list = preOrders
  if (scope === 'cashier') list = list.filter((p) => ['NEW', 'CASHIER_EDITED'].includes(p.status))
  if (scope === 'mine') list = list.filter((p) => p.createdById === me.id)
  const parseHistory = (raw: string) => {
    try {
      const v = JSON.parse(raw || '[]')
      return Array.isArray(v) ? v : []
    } catch {
      return []
    }
  }
  return json({
    preOrders: list.map((p) => ({
      ...p,
      items: JSON.parse(p.items || '[]'),
      history: parseHistory(p.history),
    })),
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  if (!Array.isArray(body.items) || !body.items.length) return fail('حداقل یک کالا اضافه کنید')
  const { jy } = toJalaliParts(new Date())
  const count = await db.preOrder.count()
  const items = body.items.map((it: any) => ({
    productId: it.productId,
    name: it.name,
    qty: Number(it.qty) || 1,
    price: Number(it.price) || 0,
  }))
  const preOrder = await db.preOrder.create({
    data: {
      code: `PO-${jy}-${String(count + 1).padStart(3, '0')}`,
      customerId: body.customerId || null,
      customerName: body.customerName || 'مشتری',
      items: JSON.stringify(items),
      total: items.reduce((s: number, i: any) => s + i.qty * i.price, 0),
      createdById: me.id,
      createdByName: me.name,
      note: body.note || '',
      status: 'NEW',
    },
  })
  await logActivity(me, 'ثبت پیش‌فاکتور فروش', 'preOrder', preOrder.id, `${preOrder.code} → صندوق`)
  return json({ preOrder: { ...preOrder, items: JSON.parse(preOrder.items) } }, 201)
}
