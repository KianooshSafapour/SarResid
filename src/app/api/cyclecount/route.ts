import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'

type CountItem = { productId: string; productName: string; unit: string; systemQty: number; countedQty: number | null; diff: number; buyPrice: number }

/** شمارش چرخه‌ای انبار — مبتنی بر پژوهش IRA (ECR/Cardiff 2007: ~60% سوابق نادرست) */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category') || ''

  const [counts, products] = await Promise.all([
    db.stockCount.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
    db.product.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
  ])
  return json({
    counts: counts.map((c) => ({ ...c, items: safeParse<CountItem[]>(c.items, []) })),
    products: products.map((p) => ({ id: p.id, name: p.name, category: p.category, unit: p.unit, stock: p.stock, buyPrice: p.buyPrice })),
    categories: [...new Set(products.map((p) => p.category))],
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  if (!body.category) return fail('دسته کالا را انتخاب کنید')

  const products = await db.product.findMany({ where: { active: true, category: body.category }, orderBy: { name: 'asc' }, take: 80 })
  if (products.length === 0) return fail('کالایی در این دسته نیست')

  const items: CountItem[] = products.map((p) => ({
    productId: p.id,
    productName: p.name,
    unit: p.unit,
    systemQty: p.stock,
    countedQty: null,
    diff: 0,
    buyPrice: p.buyPrice,
  }))
  const count = await db.stockCount.create({
    data: {
      title: body.title || `شمارش ${body.category}`,
      category: body.category,
      forDate: new Date().toISOString().slice(0, 10),
      items: JSON.stringify(items),
      createdById: me.id,
      createdByName: me.name,
    },
  })
  await logActivity(me, 'ایجاد برگه شمارش', 'stockcount', count.id, count.title)
  return json({ count: { ...count, items } })
}

/** به‌روزرسانی شمارش‌ها یا بستن برگه (با اصلاح موجودی) */
export async function PUT(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  const id = String(body.id || '')
  const count = await db.stockCount.findUnique({ where: { id } })
  if (!count) return fail('برگه یافت نشد', 404)
  if (count.status === 'CLOSED') return fail('این برگه بسته شده است')

  const items = safeParse<CountItem[]>(count.items, [])
  const updates: { productId: string; countedQty: number | null }[] = body.updates || []
  for (const u of updates) {
    const it = items.find((x) => x.productId === u.productId)
    if (it && u.countedQty !== undefined && u.countedQty !== null) {
      it.countedQty = Number(u.countedQty)
      it.diff = it.countedQty - it.systemQty
    }
  }

  const counted = items.filter((x) => x.countedQty !== null)
  const accurate = counted.filter((x) => x.diff === 0).length
  const accuracy = counted.length ? (accurate / counted.length) * 100 : null
  const diffValue = items.reduce((a, x) => a + Math.abs(x.diff) * x.buyPrice, 0)

  if (body.close) {
    // بستن برگه: موجودی سیستمی با شمارش واقعی اصلاح می‌شود
    for (const it of counted) {
      if (it.countedQty !== null && it.diff !== 0) {
        await db.product.update({ where: { id: it.productId }, data: { stock: Math.max(0, Math.round(it.countedQty)) } })
      }
    }
  }

  const updated = await db.stockCount.update({
    where: { id },
    data: {
      items: JSON.stringify(items),
      accuracy: accuracy === null ? null : +accuracy.toFixed(1),
      diffValue,
      ...(body.close ? { status: 'CLOSED', closedAt: new Date() } : {}),
    },
  })
  await logActivity(me, body.close ? 'بستن شمارش و اصلاح موجودی' : 'ثبت شمارش', 'stockcount', id, `${count.title} — دقت ${accuracy?.toFixed(0) ?? '—'}٪`)
  return json({ count: { ...updated, items } })
}

export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return fail('شناسه لازم است')
  const count = await db.stockCount.findUnique({ where: { id } })
  if (!count) return fail('یافت نشد', 404)
  if (count.status === 'CLOSED') return fail('برگه بسته‌شده حذف نمی‌شود')
  await db.stockCount.delete({ where: { id } })
  await logActivity(me, 'حذف برگه شمارش', 'stockcount', id, count.title)
  return json({ ok: true })
}
