import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions, ROLE_LABELS } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const userId = body?.userId
  const mode = body?.mode // 'pin' | 'password'
  const value = body?.value

  if (!userId || !mode || !value) return fail('اطلاعات ورود ناقص است')

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user || !user.active) return fail('کاربر یافت نشد یا غیرفعال است', 404)

  if (mode === 'pin') {
    if (!user.pin || user.pin !== String(value)) return fail('رمز چهاررقمی نادرست است')
  } else if (mode === 'password') {
    if (!user.password || user.password !== String(value)) return fail('رمز عبور نادرست است')
  } else {
    return fail('اطلاعات ورود ناقص است')
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await logActivity({
    userId: user.id,
    userName: `${user.honorific} ${user.fullName}`.trim(),
    action: 'login',
    actionLabel: 'ورود',
    category: 'auth',
    detail: mode === 'pin' ? 'ورود با رمز چهاررقمی' : 'ورود با رمز عبور',
  })

  const token = createSessionToken(user.id)
  const res = ok({
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      honorific: user.honorific,
      role: user.role,
      title: user.title,
      avatarJson: user.avatarJson,
      points: user.points,
    },
  })
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions)
  return res
}
