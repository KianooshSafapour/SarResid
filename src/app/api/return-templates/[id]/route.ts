import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** PATCH /api/return-templates/[id] {reason?, title?, body?, enabled?} — فقط مدیران */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('فقط مدیران می‌توانند الگو را ویرایش کنند', 403)

  const { id } = await ctx.params
  const tpl = await db.returnMsgTemplate.findUnique({ where: { id } })
  if (!tpl) return fail('الگو یافت نشد', 404)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const data: Record<string, unknown> = {}

  if (body.reason !== undefined) {
    const reason = String(body.reason ?? '').trim()
    if (!reason) return fail('علت مرجوعی را انتخاب کنید')
    if (reason.length > 80) return fail('علت مرجوعی بیش از حد طولانی است (حداکثر ۸۰ نویسه)')
    if (reason !== tpl.reason) {
      const dup = await db.returnMsgTemplate.findUnique({ where: { reason } })
      if (dup) return fail(`برای «${reason}» قبلاً الگو ثبت شده است`, 409)
    }
    data.reason = reason
  }
  if (body.title !== undefined) {
    const title = String(body.title ?? '').trim()
    if (!title) return fail('عنوان الگو را وارد کنید')
    if (title.length > 120) return fail('عنوان بیش از حد طولانی است (حداکثر ۱۲۰ نویسه)')
    data.title = title
  }
  if (body.body !== undefined) {
    const tplBody = String(body.body ?? '').trim()
    if (!tplBody) return fail('متن الگو را وارد کنید')
    if (tplBody.length > 700) return fail('متن الگو بیش از حد طولانی است (حداکثر ۷۰۰ نویسه)')
    data.body = tplBody
  }
  if (body.enabled !== undefined) data.enabled = body.enabled === true

  if (!Object.keys(data).length) return fail('تغییری برای ذخیره وجود ندارد')

  const updated = await db.returnMsgTemplate.update({ where: { id }, data })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'returnmsg.template.update',
    actionLabel: 'الگوی پیام مرجوعی',
    category: 'settings',
    detail: `به‌روزرسانی الگوی «${updated.title}» (علت: ${updated.reason})`,
    entityId: id,
  })

  return ok({ id: updated.id })
}

/** DELETE /api/return-templates/[id] — فقط مدیران */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('فقط مدیران می‌توانند الگو را حذف کنند', 403)

  const { id } = await ctx.params
  const tpl = await db.returnMsgTemplate.findUnique({ where: { id } })
  if (!tpl) return fail('الگو یافت نشد', 404)

  await db.returnMsgTemplate.delete({ where: { id } })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'returnmsg.template.delete',
    actionLabel: 'الگوی پیام مرجوعی',
    category: 'settings',
    detail: `حذف الگوی «${tpl.title}» (علت: ${tpl.reason})`,
    entityId: id,
  })

  return ok({ id })
}
