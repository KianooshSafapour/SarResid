import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, ROLE_LABELS } from '@/lib/auth'
import { canSystem } from '@/lib/access'
import { toEnDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

const VALID_ROLES = Object.keys(ROLE_LABELS)
const USERNAME_RE = /^[a-z0-9_.-]{3,30}$/
const SELF_FIELDS = ['honorific', 'title', 'phone', 'pin', 'password', 'avatarJson', 'fullName']

type RouteContext = { params: Promise<{ id: string }> }

/** PATCH /api/admin/users/[id] — managers: all fields; self: own profile fields only */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const session = await getSessionUser()
  if (!session) return fail('ابتدا وارد شوید', 401)

  const { id } = await ctx.params
  const target = await db.user.findUnique({ where: { id } })
  if (!target) return fail('کاربر یافت نشد', 404)

  const isManagerUser = canSystem(session.role)
  const isSelf = session.id === id
  if (!isManagerUser && !isSelf) return fail('دسترسی به این بخش ندارید', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const data: Record<string, unknown> = {}
  const fields = isManagerUser
    ? ['username', 'fullName', 'honorific', 'role', 'title', 'phone', 'active', 'avatarJson']
    : SELF_FIELDS

  for (const f of fields) {
    if (!(f in body)) continue
    switch (f) {
      case 'username': {
        if (!isManagerUser) continue
        const username = String(body.username ?? '').trim().toLowerCase()
        if (!USERNAME_RE.test(username)) return fail('نام کاربری معتبر نیست')
        const taken = await db.user.findUnique({ where: { username } })
        if (taken && taken.id !== id) return fail('این نام کاربری قبلاً ثبت شده است')
        data.username = username
        break
      }
      case 'fullName': {
        const fullName = String(body.fullName ?? '').trim()
        if (fullName.length < 2) return fail('نام کامل را وارد کنید')
        data.fullName = fullName
        break
      }
      case 'role': {
        if (!VALID_ROLES.includes(body.role)) return fail('نقش نامعتبر است')
        data.role = body.role
        break
      }
      case 'phone': {
        const p = typeof body.phone === 'string' ? toEnDigits(body.phone).replace(/\D/g, '') : ''
        data.phone = p ? p : null
        break
      }
      case 'active':
        data.active = !!body.active
        break
      case 'avatarJson':
        data.avatarJson = typeof body.avatarJson === 'string' && body.avatarJson.trim() ? body.avatarJson : null
        break
      default:
        data[f] = typeof body[f] === 'string' ? body[f] : ''
    }
  }

  if ('pin' in body) {
    const pin = body.pin ? toEnDigits(String(body.pin)).replace(/\D/g, '') : ''
    data.pin = pin ? pin : null
  }
  if ('password' in body && typeof body.password === 'string' && body.password.length > 0) {
    if (body.password.length < 4) return fail('گذرواژه باید حداقل ۴ نویسه باشد')
    data.password = body.password
  }

  // protect: never demote/deactivate the last active OWNER/ADMIN
  if (isManagerUser && ('role' in data || 'active' in data)) {
    const nextRole = (data.role as string) ?? target.role
    const nextActive = 'active' in data ? !!data.active : target.active
    if (!nextActive || nextRole !== target.role) {
      if (target.active && (target.role === 'OWNER' || target.role === 'ADMIN')) {
        const activeSameRole = await db.user.count({ where: { role: target.role, active: true } })
        const staysSameRole = nextRole === target.role && nextActive
        if (activeSameRole <= 1 && !staysSameRole) {
          return fail('آخرین مدیر فعال قابل تغییر نیست', 403)
        }
      }
    }
  }

  if (Object.keys(data).length === 0) return ok({ id })

  const updated = await db.user.update({ where: { id }, data })
  await logActivity({
    userId: session.id,
    userName: session.fullName,
    action: 'user.update',
    actionLabel: 'کاربر',
    category: 'user',
    detail: updated.fullName,
    entityId: id,
  })
  return ok({ id: updated.id })
}

/** DELETE /api/admin/users/[id] — soft deactivate (managers, not self, not last OWNER/ADMIN) */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const session = await getSessionUser()
  if (!session) return fail('ابتدا وارد شوید', 401)
  if (!canSystem(session.role)) return fail('دسترسی به این بخش ندارید', 403)

  const { id } = await ctx.params
  if (id === session.id) return fail('حساب خودتان را نمی‌توانید غیرفعال کنید', 403)

  const target = await db.user.findUnique({ where: { id } })
  if (!target) return fail('کاربر یافت نشد', 404)

  if (target.active && (target.role === 'OWNER' || target.role === 'ADMIN')) {
    const activeSameRole = await db.user.count({ where: { role: target.role, active: true } })
    if (activeSameRole <= 1) return fail('آخرین مدیر عامل/مدیر فعال قابل غیرفعال‌سازی نیست', 403)
  }

  await db.user.update({ where: { id }, data: { active: false } })
  await logActivity({
    userId: session.id,
    userName: session.fullName,
    action: 'user.deactivate',
    actionLabel: 'کاربر',
    category: 'user',
    detail: `${target.fullName} غیرفعال شد`,
    entityId: id,
  })
  return ok({ id, active: false })
}
