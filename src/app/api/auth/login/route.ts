import { db } from '@/lib/db'
import { fail, json, logActivity, makeToken, SESSION_COOKIE, safeParse } from '@/lib/api-helpers'
import { NextResponse } from 'next/server'
import { createHash } from 'crypto'

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  // ── حالت مدیر سامانه (root): نام کاربری + رمز عبور — حساب مخفی در فهرست آواتارها نیست
  if (body.username && body.password) {
    const username = String(body.username).trim().toLowerCase()
    const user = await db.user.findUnique({ where: { username } })
    if (!user || !user.active || !user.hidden) return fail('نام کاربری یا رمز عبور نادرست است', 401)
    if (!user.password || user.password !== sha256(String(body.password))) {
      await logActivity({ id: user.id, name: user.name }, 'تلاش ورود ناموفق مدیر سامانه', 'auth', user.id)
      return fail('نام کاربری یا رمز عبور نادرست است', 401)
    }
    const token = makeToken(user.id)
    await logActivity(user, 'ورود مدیر سامانه (root)', 'auth', user.id)
    const res = NextResponse.json({
      token,
      user: {
        id: user.id, name: user.name, username: user.username, role: user.role,
        secondaryRoles: safeParse(user.secondaryRoles, []), roleIds: user.roleIds || '[]',
        color: user.color, points: user.points, hidden: true,
      },
    })
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
    return res
  }

  // ── حالت عادی: آواتار + PIN (حساب‌های مخفی هرگز از این مسیر وارد نمی‌شوند)
  const { userId, pin } = body
  if (!userId || !pin) return fail('کاربر و رمز را انتخاب کنید')
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user || !user.active) return fail('کاربر یافت نشد', 404)
  if (user.hidden) return fail('این حساب فقط با نام کاربری و رمز عبور وارد می‌شود', 403)
  if (user.pin !== String(pin).trim()) return fail('رمز ورود نادرست است', 401)
  const token = makeToken(user.id)
  await logActivity(user, 'ورود به سامانه', 'auth', user.id)
  const res = NextResponse.json({
    // token is also returned in the body: mobile WebViews / iframes may block the cookie,
    // client mirrors it into localStorage and sends X-Session-Token on every call.
    token,
    user: {
      id: user.id, name: user.name, username: user.username, role: user.role,
      secondaryRoles: safeParse(user.secondaryRoles, []), roleIds: user.roleIds || '[]',
      color: user.color, points: user.points,
    },
  })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
