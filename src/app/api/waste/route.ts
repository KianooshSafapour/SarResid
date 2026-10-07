import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

const REASONS: Record<string, string> = {
  EXPIRED: 'انقضا/تاریخ گذشته',
  DAMAGED: 'آسیب‌دیده',
  SPOILED: 'فاسد شده',
  THEFT: 'سرقت/کسری',
  OTHER: 'سایر',
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const days = Number(searchParams.get('days') || 30)

  const [rows, products] = await Promise.all([
    db.wasteLog.findMany({ orderBy: { createdAt: 'desc' }, take: 400 }),
    db.product.findMany({ where: { active: true }, select: { id: true, name: true, category: true, unit: true, buyPrice: true, sellPrice: true, stock: true } }),
  ])

  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const recent = rows.filter((r) => r.forDate >= since)

  const byReason: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  let totalValue = 0
  for (const r of recent) {
    byReason[r.reason] = (byReason[r.reason] || 0) + r.estValue
    byCategory[r.category] = (byCategory[r.category] || 0) + r.estValue
    totalValue += r.estValue
  }

  // هشدار FEFO: کالاهای نزدیک انقضا از تاریخ‌های ثبت‌شده در دریافت مرسوله
  const items = await db.orderItem.findMany({
    where: { expiryDate: { not: '' }, status: { in: ['RECEIVED', 'PENDING'] } },
    select: { productId: true, productName: true, expiryDate: true, qty: true, receivedQty: true },
  })
  const today = new Date().toISOString().slice(0, 10)
  const soon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const expiryAlerts = items
    .filter((i) => i.expiryDate >= today && i.expiryDate <= soon)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
    .slice(0, 50)

  return json({
    reasons: REASONS,
    waste: rows.slice(0, 150),
    stats: { totalValue, count: recent.length, byReason, byCategory, days },
    products: products.map((p) => ({ id: p.id, name: p.name, category: p.category, unit: p.unit, price: p.buyPrice || p.sellPrice })),
    expiryAlerts,
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  if (!body.productName || !body.qty) return fail('نام کالا و مقدار را وارد کنید')
  const row = await db.wasteLog.create({
    data: {
      productId: body.productId || null,
      productName: String(body.productName),
      category: body.category || 'عمومی',
      qty: Number(body.qty) || 0,
      unit: body.unit || 'عدد',
      reason: REASONS[body.reason] ? body.reason : 'OTHER',
      estValue: Number(body.estValue) || 0,
      forDate: body.forDate || new Date().toISOString().slice(0, 10),
      note: body.note || '',
      createdById: me.id,
      createdByName: me.name,
    },
  })
  await logActivity(me, 'ثبت ضایعات', 'waste', row.id, `${row.productName} ×${row.qty} ${row.unit} — ${REASONS[row.reason]}`)
  return json({ waste: row })
}

export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return fail('شناسه لازم است')
  const row = await db.wasteLog.findUnique({ where: { id } })
  if (!row) return fail('یافت نشد', 404)
  await db.wasteLog.delete({ where: { id } })
  await logActivity(me, 'حذف ضایعات', 'waste', id, row.productName)
  return json({ ok: true })
}
