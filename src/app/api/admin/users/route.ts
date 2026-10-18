import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, ROLE_LABELS } from '@/lib/auth'
import { canSystem } from '@/lib/access'
import { toEnDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

const VALID_ROLES = Object.keys(ROLE_LABELS)
const USERNAME_RE = /^[a-z0-9_.-]{3,30}$/

export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canSystem(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const users = await db.user.findMany()
  const active = users.filter((u) => u.active)

  return ok({
    items: users.map((u) => ({
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
    })),
    stats: {
      total: users.length,
      active: active.length,
      inactive: users.length - active.length,
      activeAdmins: active.filter((u) => u.role === 'ADMIN').length,
      activeOwners: active.filter((u) => u.role === 'OWNER').length,
    },
  })
}

/** POST /api/admin/users {username,fullName,honorific?,role,title?,phone?,active?,password?,pin?} */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canSystem(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const body = await req.json().catch(() => null)
  const username = String(body?.username ?? '').trim().toLowerCase()
  const fullName = String(body?.fullName ?? '').trim()
  if (!USERNAME_RE.test(username)) return fail('نام کاربری معتبر نیست')
  if (fullName.length < 2) return fail('نام کامل را وارد کنید')
  if (await db.user.findUnique({ where: { username } })) return fail('این نام کاربری قبلاً ثبت شده است')
  if (!VALID_ROLES.includes(body?.role)) return fail('نقش را انتخاب کنید')
  const password = typeof body?.password === 'string' ? body.password : ''
  if (password.length < 4) return fail('گذرواژه باید حداقل ۴ نویسه باشد')

  const pin = body?.pin ? toEnDigits(String(body.pin)).replace(/\D/g, '') : null

  const created = await db.user.create({
    data: {
      username,
      fullName,
      honorific: typeof body?.honorific === 'string' ? body.honorific : '',
      role: body.role,
      title: typeof body?.title === 'string' ? body.title : '',
      phone: phoneOrNull(body?.phone),
      active: body?.active === undefined ? true : !!body.active,
      password,
      pin,
    },
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'user.create',
    actionLabel: 'کاربر',
    category: 'user',
    detail: `${fullName} (${username})`,
    entityId: created.id,
  })

  return ok({ id: created.id })
}

function phoneOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = toEnDigits(v).replace(/\D/g, '')
  return s ? s : null
}
