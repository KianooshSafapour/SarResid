import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, ROLE_LABELS } from '@/lib/auth'
import { userCan } from '@/lib/access'
import { toEnDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const VALID_ROLES = Object.keys(ROLE_LABELS)

/** GET /api/admin/users/[id] → user detail + permission overrides */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await userCan(me, 'manageUsers'))) return fail('دسترسی به این بخش ندارید', 403)

  const { id } = await ctx.params
  const u = await db.user.findUnique({ where: { id } })
  if (!u) return fail('کاربر یافت نشد', 404)

  const overrides = await db.userPermOverride.findMany({
    where: { userId: id },
    orderBy: { createdAt: 'desc' },
  })

  return ok({
    user: {
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      honorific: u.honorific,
      role: u.role,
      roleLabel: ROLE_LABELS[u.role] ?? u.role,
      title: u.title,
      phone: u.phone,
      avatarJson: u.avatarJson,
      active: u.active,
      points: u.points,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      hasPassword: !!u.password,
      hasPin: !!u.pin,
    },
    overrides: overrides.map((o) => ({ pageKey: o.pageKey, allow: o.allow })),
  })
}

/**
 * PATCH /api/admin/users/[id] — edit user fields
 * { fullName?, honorific?, role?, title?, phone?, active?, password?, pin? }
 * password/pin = reset (password ≥ 4 chars, pin exactly 4 digits, null clears pin).
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await userCan(me, 'manageUsers'))) return fail('دسترسی به این بخش ندارید', 403)

  const { id } = await ctx.params
  const target = await db.user.findUnique({ where: { id } })
  if (!target) return fail('کاربر یافت نشد', 404)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const data: Record<string, unknown> = {}
  const changes: string[] = []

  if (body.fullName !== undefined) {
    const fullName = String(body.fullName ?? '').trim()
    if (fullName.length < 2) return fail('نام کامل را وارد کنید')
    if (fullName !== target.fullName) {
      data.fullName = fullName
      changes.push('نام')
    }
  }
  if (body.honorific !== undefined && String(body.honorific ?? '') !== target.honorific) {
    data.honorific = String(body.honorific ?? '')
    changes.push('عنوان احترامی')
  }
  if (body.role !== undefined && body.role !== target.role) {
    if (!VALID_ROLES.includes(body.role)) return fail('نقش انتخاب‌شده معتبر نیست')
    if (id === me.id) return fail('نقش حساب خودتان را نمی‌توانید تغییر دهید')
    data.role = body.role
    changes.push('نقش')
  }
  if (body.title !== undefined && String(body.title ?? '') !== target.title) {
    data.title = String(body.title ?? '')
    changes.push('عنوان شغلی')
  }
  if (body.phone !== undefined) {
    const phone = phoneOrNull(body.phone)
    if (phone !== target.phone) {
      data.phone = phone
      changes.push('شماره تماس')
    }
  }
  if (body.active !== undefined && !!body.active !== target.active) {
    if (id === me.id && !body.active) return fail('حساب کاربری خودتان را نمی‌توانید غیرفعال کنید')
    data.active = !!body.active
    changes.push(body.active ? 'فعال‌سازی' : 'غیرفعال‌سازی')
  }
  if (body.password !== undefined && body.password !== null && body.password !== '') {
    const password = String(body.password)
    if (password.length < 4) return fail('گذرواژه باید حداقل ۴ نویسه باشد')
    data.password = password
    changes.push('بازنشانی گذرواژه')
  }
  if (body.pin !== undefined) {
    if (body.pin === null || body.pin === '') {
      data.pin = null
      changes.push('حذف رمز چهاررقمی')
    } else {
      const pin = toEnDigits(String(body.pin)).replace(/\D/g, '')
      if (!/^\d{4}$/.test(pin)) return fail('رمز چهاررقمی باید دقیقاً ۴ رقم باشد')
      data.pin = pin
      changes.push('بازنشانی رمز چهاررقمی')
    }
  }

  if (changes.length === 0) return fail('تغییری برای ذخیره وجود ندارد')

  await db.user.update({ where: { id }, data })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'user.update',
    actionLabel: 'ویرایش کاربر',
    category: 'user',
    detail: `${target.fullName} (${target.username}) — ${changes.join('، ')}`,
    entityId: id,
  })

  return ok({ id, updated: changes })
}

function phoneOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = toEnDigits(v).replace(/\D/g, '')
  return s ? s : null
}
