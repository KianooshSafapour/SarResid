import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, clampInt } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { displayName } from '@/lib/notify'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PATCH /api/store/section-columns/[id] — managers only.
 *  {name?, order?, active?} → update  |  {action:'delete'} → delete (ردیف = ZoneColumn)
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!isManager(me)) return fail('فقط مدیران می‌توانند ردیف‌ها را ویرایش کنند', 403)

  const { id } = await ctx.params
  const column = await db.zoneColumn.findUnique({ where: { id } })
  if (!column) return fail('ردیف یافت نشد', 404)

  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    name?: string
    order?: number
    active?: boolean
  }

  // ---- delete branch ----
  if (body.action === 'delete') {
    await db.zoneColumn.delete({ where: { id } })
    await logActivity({
      userId: me.id,
      userName: displayName(me),
      action: 'store.section-column',
      actionLabel: 'ردیف چیدمان',
      category: 'store',
      detail: `حذف ردیف «${column.name}» از بخش ${column.blockLabel}`,
      entityId: id,
    })
    return ok({ deleted: true })
  }
  if (body.action) return fail('عملیات نامعتبر است')

  // ---- update branch ----
  const data: { name?: string; order?: number; active?: boolean } = {}
  if (body.name !== undefined) {
    const name = String(body.name || '').trim().slice(0, 60)
    if (!name) return fail('نام ردیف را وارد کنید')
    if (name !== column.name) {
      const dup = await db.zoneColumn.findUnique({
        where: {
          planId_blockLabel_name: { planId: column.planId, blockLabel: column.blockLabel, name },
        },
      })
      if (dup) return fail('ردیفی با این نام در این بخش قبلاً ثبت شده است')
      data.name = name
    }
  }
  if (body.order !== undefined) data.order = clampInt(body.order, 0, 9999, 0)
  if (body.active !== undefined) data.active = !!body.active

  const updated = await db.zoneColumn.update({ where: { id }, data })
  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'store.section-column',
    actionLabel: 'ردیف چیدمان',
    category: 'store',
    detail: `ویرایش ردیف «${updated.name}» بخش ${updated.blockLabel}${
      data.active === false ? ' (غیرفعال)' : data.active === true ? ' (فعال)' : ''
    }`,
    entityId: id,
  })
  return ok({ column: updated })
}

/** DELETE /api/store/section-columns/[id] — managers only. */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!isManager(me)) return fail('فقط مدیران می‌توانند ردیف‌ها را حذف کنند', 403)

  const { id } = await ctx.params
  const column = await db.zoneColumn.findUnique({ where: { id } })
  if (!column) return fail('ردیف یافت نشد', 404)

  await db.zoneColumn.delete({ where: { id } })
  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'store.section-column',
    actionLabel: 'ردیف چیدمان',
    category: 'store',
    detail: `حذف ردیف «${column.name}» از بخش ${column.blockLabel}`,
    entityId: id,
  })
  return ok({ deleted: true })
}
