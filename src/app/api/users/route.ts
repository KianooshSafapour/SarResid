import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { hasCap } from '@/lib/rbac'

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  // حساب‌های مخفی (root) فقط برای خودشان قابل مشاهده‌اند — مدیریت سامانه هرگز آن‌ها را نمی‌بیند
  const users = await db.user.findMany({ orderBy: { createdAt: 'asc' } })
  const visible = users.filter((u) => !u.hidden || (me?.id === u.id))
  return json({
    users: visible.map((u) => ({
      ...u,
      password: undefined,
      secondaryRoles: safeParse(u.secondaryRoles, []),
      roleIds: safeParse(u.roleIds, []),
      zones: safeParse(u.zones, []),
      uiPrefs: safeParse(u.uiPrefs, {}),
    })),
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  const allowed = me && (['OM', 'GM', 'OWNER', 'ADMIN'].includes(me.role) || (await hasCap(me, 'users.manage')))
  if (!allowed) return fail('دسترسی غیرمجاز', 403)
  const body = await req.json()
  if (!body.name || !body.role) return fail('نام و نقش الزامی است')
  const exists = await db.user.findUnique({ where: { name: body.name } })
  if (exists) return fail('کاربری با این نام وجود دارد')
  const user = await db.user.create({
    data: {
      name: body.name,
      username: body.username || `user${Date.now()}`,
      pin: body.pin || '1234',
      role: body.role,
      secondaryRoles: JSON.stringify(body.secondaryRoles || []),
      roleIds: JSON.stringify(body.roleIds || []),
      color: body.color || '#0e7a4a',
    },
  })
  await logActivity(me, 'ایجاد کاربر جدید', 'user', user.id, `${body.name} (${body.role})`)
  return json({ user }, 201)
}
