import { db } from '@/lib/db'
import { getSessionUser, json, fail, logActivity } from '@/lib/api-helpers'
import { hasCap } from '@/lib/rbac'

/** قواعد قابل‌تنظیم دریافت مرسوله‌های سرآمده — admin/manager */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const allow = await db.setting.findUnique({ where: { key: 'delivery.allowPastDue' } })
  const grace = await db.setting.findUnique({ where: { key: 'delivery.graceDays' } })
  return json({
    allowPastDue: allow?.value !== 'false', // default: مجاز
    graceDays: Number(grace?.value ?? '14'),
    canEdit: ['GM', 'OM', 'OWNER', 'ADMIN'].includes(me.role) || (await hasCap(me, 'settings.manage')),
  })
}

export async function PUT(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(['GM', 'OM', 'OWNER', 'ADMIN'].includes(me.role) || (await hasCap(me, 'settings.manage'))))
    return fail('دسترسی غیرمجاز', 403)
  const body = await req.json()
  const data: { key: string; value: string }[] = []
  if (body.allowPastDue !== undefined) data.push({ key: 'delivery.allowPastDue', value: body.allowPastDue ? 'true' : 'false' })
  if (body.graceDays !== undefined) data.push({ key: 'delivery.graceDays', value: String(Math.max(0, Math.min(90, Number(body.graceDays) || 0))) })
  for (const d of data) {
    await db.setting.upsert({ where: { key: d.key }, update: { value: d.value }, create: { key: d.key, value: d.value } })
  }
  await logActivity(me, 'ویرایش قواعد دریافت مرسولهٔ سرآمده', 'setting', 'delivery', JSON.stringify(body).slice(0, 120))
  return json({ ok: true })
}
