import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (id) {
    const sop = await db.sOP.findUnique({ where: { id } })
    if (!sop) return fail('روال یافت نشد', 404)
    return json({ sop: { ...sop, steps: JSON.parse(sop.steps || '[]') } })
  }
  const sops = await db.sOP.findMany({ orderBy: { updatedAt: 'desc' } })
  return json({ sops: sops.map((s) => ({ ...s, steps: JSON.parse(s.steps || '[]') })) })
}

export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me || !['GM', 'OM', 'PM'].includes(me.role)) return fail('دسترسی غیرمجاز', 403)
  const body = await req.json()
  if (!body.id) return fail('شناسه الزامی است')
  const data: Record<string, unknown> = { updatedBy: me.name }
  if (body.title) data.title = body.title
  if (body.category) data.category = body.category
  if (Array.isArray(body.steps)) data.steps = JSON.stringify(body.steps)
  const sop = await db.sOP.update({ where: { id: body.id }, data })
  await logActivity(me, 'ویرایش روال (SOP)', 'sop', body.id, sop.title)
  return json({ sop: { ...sop, steps: JSON.parse(sop.steps) } })
}

export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me || !['GM', 'OM'].includes(me.role)) return fail('دسترسی غیرمجاز', 403)
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return fail('شناسه الزامی است')
  await db.sOP.delete({ where: { id } })
  await logActivity(me, 'حذف روال', 'sop', id)
  return json({ ok: true })
}
