import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** PATCH /api/sms/templates/[id] {title?, body?, enabled?} */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'system/smscenter')
  if (!gate.ok) return fail(gate.deny, 403)

  const { id } = await ctx.params
  const tpl = await db.smsTemplate.findUnique({ where: { id } })
  if (!tpl) return fail('قالب یافت نشد', 404)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) {
    const title = String(body.title ?? '').trim()
    if (!title) return fail('عنوان قالب را وارد کنید')
    data.title = title
  }
  if (body.body !== undefined) {
    const tplBody = String(body.body ?? '').trim()
    if (!tplBody) return fail('متن قالب را وارد کنید')
    data.body = tplBody
  }
  if (body.enabled !== undefined) data.enabled = body.enabled === true

  if (!Object.keys(data).length) return fail('تغییری برای ذخیره وجود ندارد')

  const updated = await db.smsTemplate.update({ where: { id }, data })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'sms.template.update',
    actionLabel: 'قالب پیامک',
    category: 'settings',
    detail: `به‌روزرسانی قالب «${updated.title}» (${updated.key})`,
    entityId: id,
  })

  return ok({ id: updated.id })
}

/** DELETE /api/sms/templates/[id] */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'system/smscenter')
  if (!gate.ok) return fail(gate.deny, 403)

  const { id } = await ctx.params
  const tpl = await db.smsTemplate.findUnique({ where: { id } })
  if (!tpl) return fail('قالب یافت نشد', 404)

  await db.smsTemplate.delete({ where: { id } })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'sms.template.delete',
    actionLabel: 'قالب پیامک',
    category: 'settings',
    detail: `حذف قالب «${tpl.title}» (${tpl.key})`,
    entityId: id,
  })

  return ok({ id })
}
