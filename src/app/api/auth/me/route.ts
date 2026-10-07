import { db } from '@/lib/db'
import { getSessionUser, makeToken, json } from '@/lib/api-helpers'
import { extraViewsFor } from '@/lib/rbac'

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return json({ user: null })
  const extraViews = await extraViewsFor(user)
  // round-17: آواتار (عکس واقعی + کارتونی) در پاسخ me تا همهٔ ویوها بدون درخواست اضافه در دسترس داشته باشند
  const av = await db.user.findUnique({ where: { id: user.id }, select: { avatarUrl: true, avatarStyle: true } })
  const userWithAvatar = {
    ...user,
    avatarUrl: av?.avatarUrl || '',
    avatarStyle: av?.avatarStyle || '',
  }
  // self-heal: if the client lost its cookie (mobile iframe), give it a fresh
  // token to mirror into localStorage so the header channel keeps working.
  return json({ user: userWithAvatar, extraViews, token: makeToken(user.id) })
}
