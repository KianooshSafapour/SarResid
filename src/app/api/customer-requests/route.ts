import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

export async function GET() {
  const items = await db.customerRequest.findMany({ orderBy: { count: 'desc' } })
  return json({ requests: items })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { productName, productId, notes } = await req.json()
  if (!productName?.trim()) return fail('نام کالا را وارد کنید')
  const name = productName.trim().toLowerCase()
  const existing = await db.customerRequest.findFirst({ where: { productName: { equals: productName.trim() } } })
  // fuzzy: match by lowercase contains
  const all = await db.customerRequest.findMany()
  const match = existing || all.find((r) => r.productName.toLowerCase() === name)
  if (match) {
    const updated = await db.customerRequest.update({
      where: { id: match.id },
      data: { count: { increment: 1 }, lastById: me.id, lastByName: me.name, ...(notes ? { notes } : {}) },
    })
    await logActivity(me, 'ثبت درخواست تکراری مشتری', 'customerRequest', updated.id, updated.productName)
    return json({ request: updated, repeated: true })
  }
  const created = await db.customerRequest.create({
    data: { productName: productName.trim(), productId: productId || null, count: 1, lastById: me.id, lastByName: me.name, notes: notes || '' },
  })
  await logActivity(me, 'ثبت درخواست جدید مشتری', 'customerRequest', created.id, created.productName)
  return json({ request: created, repeated: false }, 201)
}

export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me || !['GM', 'PM', 'OM'].includes(me.role)) return fail('دسترسی غیرمجاز', 403)
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return fail('شناسه الزامی است')
  await db.customerRequest.delete({ where: { id } })
  return json({ ok: true })
}
