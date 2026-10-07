import { NextResponse } from 'next/server'
import { logActivity, SESSION_COOKIE, getSessionUser } from '@/lib/api-helpers'

export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (user) await logActivity(user, 'خروج از سامانه', 'auth', user.id)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
