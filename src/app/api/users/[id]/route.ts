import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { hasCap } from '@/lib/rbac'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  const body = await req.json()
  const isSelf = me?.id === id
  const isAdmin = me && ['OM', 'GM', 'OWNER'].includes(me.role)
  // تخصیص زون شمارش روزانه: مدیران انبار/عملیات/محصول فقط و فقط همین فیلد را می‌توانند تغییر دهند
  const zonesOnly = body && body.zones !== undefined && Object.keys(body).length === 1
  const isZoneManager = me && ['SK', 'OM', 'GM', 'PM', 'OWNER'].includes(me.role)
  // نقش‌های چندگانه (roleIds): مدیران دسترسی + مدیر فناوری اطلاعات + cap users.manage — فقط و فقط این فیلد
  const roleIdsOnly = body && body.roleIds !== undefined && Object.keys(body).length === 1
  const isAccessManager =
    me && (['OM', 'GM', 'OWNER', 'ADMIN', 'IT'].includes(me.role) || (await hasCap(me, 'users.manage')))
  if (
    !me ||
    (!isAdmin && !isSelf && !(isZoneManager && zonesOnly) && !(isAccessManager && roleIdsOnly))
  )
    return fail('دسترسی غیرمجاز', 403)

  const data: Record<string, unknown> = {}
  if (body.name !== undefined && isAdmin) data.name = body.name
  if (body.pin !== undefined && body.pin) data.pin = String(body.pin)
  if (body.role !== undefined && isAdmin) data.role = body.role
  if (body.secondaryRoles !== undefined && isAdmin) data.secondaryRoles = JSON.stringify(body.secondaryRoles)
  if (body.color !== undefined && isAdmin) data.color = body.color
  if (body.active !== undefined && isAdmin) data.active = body.active
  if (body.points !== undefined && isAdmin) data.points = body.points
  if (body.zones !== undefined && (isAdmin || (isZoneManager && zonesOnly))) data.zones = JSON.stringify(body.zones)
  if (body.roleIds !== undefined && isAccessManager) data.roleIds = JSON.stringify(body.roleIds)

  const user = await db.user.update({ where: { id }, data })
  await logActivity(me, 'ویرایش کاربر', 'user', id, JSON.stringify(Object.keys(data)))
  return json({
    user: {
      ...user,
      password: undefined,
      secondaryRoles: JSON.parse(user.secondaryRoles || '[]'),
      roleIds: safeParse<string[]>(user.roleIds, []),
      zones: safeParse<string[]>(user.zones, []),
      uiPrefs: safeParse(user.uiPrefs, {}),
    },
  })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me || !['OM', 'GM', 'OWNER'].includes(me.role)) return fail('دسترسی غیرمجاز', 403)
  if (me.id === id) return fail('نمی‌توانید خودتان را حذف کنید')
  await db.user.update({ where: { id }, data: { active: false } })
  await logActivity(me, 'غیرفعال‌سازی کاربر', 'user', id)
  return json({ ok: true })
}
