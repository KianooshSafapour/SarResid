import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  const data: Record<string, unknown> = {}
  for (const f of ['name', 'personName', 'phone', 'type', 'notes', 'manufacturerId']) if (body[f] !== undefined) data[f] = String(body[f] || '')
  if (body.companyNames !== undefined) data.companyNames = JSON.stringify((body.companyNames || []).filter(Boolean))
  if (body.active !== undefined) data.active = body.active
  const provider = await db.provider.update({ where: { id }, data })
  await logActivity(me, 'ویرایش تأمین‌کننده', 'provider', id, provider.name)
  return json({ provider: { ...provider, companyNames: JSON.parse(provider.companyNames) } })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me || !['GM', 'OM'].includes(me.role)) return fail('دسترسی غیرمجاز', 403)
  await db.provider.update({ where: { id }, data: { active: false } })
  await logActivity(me, 'حذف تأمین‌کننده', 'provider', id)
  return json({ ok: true })
}
