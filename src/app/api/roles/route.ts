import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { guardCap, hasCap, invalidateRoleCache } from '@/lib/rbac'

/** GET — نقش‌ها برای همهٔ واردشده‌ها (برای گیت‌های UI و نمایش چندنقشی) */
export async function GET(req: Request) {
  const roles = await db.role.findMany({ orderBy: [{ builtin: 'desc' }, { category: 'asc' }, { name: 'asc' }] })
  return json({ roles: roles.map((r) => ({ ...r, permissions: safeParse(r.permissions, { views: [], caps: [] }) })) })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  const g = await guardCap(me, 'roles.manage')
  if (g) return fail(g, 403)
  const body = await req.json()
  if (!body.name) return fail('نام نقش الزامی است')
  const baseKey = String(body.key || body.name)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!baseKey) return fail('کلید نقش نامعتبر است')
  const key = body.builtin ? baseKey : `custom_${baseKey}`
  const exists = await db.role.findUnique({ where: { key } })
  if (exists) return fail('نقشی با این کلید وجود دارد')
  const role = await db.role.create({
    data: {
      key,
      name: body.name,
      category: body.category || 'سفارشی',
      color: body.color || '#77934a',
      description: body.description || '',
      builtin: false,
      permissions: JSON.stringify({ views: body.views || [], caps: body.caps || [] }),
    },
  })
  invalidateRoleCache()
  await logActivity(me, 'ایجاد نقش جدید', 'role', role.id, `${role.name} (${role.key})`)
  return json({ role: { ...role, permissions: safeParse(role.permissions, { views: [], caps: [] }) } }, 201)
}

export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  const g = await guardCap(me, 'roles.manage')
  if (g) return fail(g, 403)
  const body = await req.json()
  if (!body.id) return fail('شناسه نقش الزامی است')
  const role = await db.role.findUnique({ where: { id: body.id } })
  if (!role) return fail('نقش یافت نشد', 404)
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = body.name
  if (body.category !== undefined) data.category = body.category
  if (body.color !== undefined) data.color = body.color
  if (body.description !== undefined) data.description = body.description
  if (body.active !== undefined) data.active = body.active
  if (body.views !== undefined || body.caps !== undefined) {
    const prev = safeParse<{ views: string[]; caps: string[] }>(role.permissions, { views: [], caps: [] })
    data.permissions = JSON.stringify({ views: body.views ?? prev.views, caps: body.caps ?? prev.caps })
  }
  const updated = await db.role.update({ where: { id: role.id }, data })
  invalidateRoleCache()
  await logActivity(me, 'ویرایش نقش', 'role', role.id, role.name)
  return json({ role: { ...updated, permissions: safeParse(updated.permissions, { views: [], caps: [] }) } })
}

export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  const g = await guardCap(me, 'roles.manage')
  if (g) return fail(g, 403)
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return fail('شناسه نقش الزامی است')
  const role = await db.role.findUnique({ where: { id } })
  if (!role) return fail('نقش یافت نشد', 404)
  if (role.builtin) return fail('نقش‌های سیستمی حذف نمی‌شوند — فقط غیرفعال کنید', 400)
  const users = await db.user.findMany({ where: { roleIds: { contains: role.key } } })
  if (users.length) return fail(`این نقش به ${users.length} کاربر تخصیص یافته — ابتدا از کاربران بردارید`, 400)
  await db.role.delete({ where: { id } })
  invalidateRoleCache()
  await logActivity(me, 'حذف نقش', 'role', id, role.name)
  return json({ ok: true })
}

/** تخصیص/برداشتن نقش از کاربر — PUT /api/roles {userId, roleKey, assign:true|false} */
export async function PUT(req: Request) {
  const me = await getSessionUser(req)
  if (!(me && (['OM', 'GM', 'OWNER', 'ADMIN'].includes(me.role) || (await hasCap(me, 'users.manage'))))) {
    return fail('دسترسی غیرمجاز', 403)
  }
  const body = await req.json()
  if (!body.userId || !body.roleKey) return fail('کاربر و نقش الزامی است')
  const role = await db.role.findUnique({ where: { key: body.roleKey } })
  if (!role || !role.active) return fail('نقش یافت نشد', 404)
  const user = await db.user.findUnique({ where: { id: body.userId } })
  if (!user) return fail('کاربر یافت نشد', 404)
  const cur = safeParse<string[]>(user.roleIds, [])
  const next = body.assign
    ? Array.from(new Set([...cur, role.key]))
    : cur.filter((k) => k !== role.key)
  const updated = await db.user.update({ where: { id: user.id }, data: { roleIds: JSON.stringify(next) } })
  invalidateRoleCache()
  await logActivity(me, body.assign ? 'تخصیص نقش به کاربر' : 'برداشتن نقش از کاربر', 'user', user.id, `${role.name} → ${user.name}`)
  return json({ user: { ...updated, password: undefined, roleIds: next } })
}
