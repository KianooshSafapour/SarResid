import { db } from '@/lib/db'
import { fail, getSessionUser, json } from '@/lib/api-helpers'

const CATS = ['order', 'cheque', 'stock', 'task', 'team', 'workflow']

/** GET /api/notif-prefs — current user's notification preferences (auto-create default row) */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  let pref = await db.notifPref.findUnique({ where: { userId: me.id } })
  if (!pref) pref = await db.notifPref.create({ data: { userId: me.id } })
  return json({
    prefs: {
      mutedCats: JSON.parse(pref.mutedCats || '[]') as string[],
      snoozeUntil: pref.snoozeUntil,
    },
  })
}

/** PUT /api/notif-prefs — body: { mutedCats?: string[], snoozeUntil?: string ('' to wake) } */
export async function PUT(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json().catch(() => null)

  let mutedCats: string[] | undefined
  if (body?.mutedCats !== undefined) {
    if (!Array.isArray(body.mutedCats)) return fail('قالب دسته‌های بی‌صدا نامعتبر است')
    mutedCats = body.mutedCats.filter((c: unknown) => typeof c === 'string' && CATS.includes(c))
  }

  let snoozeUntil: string | undefined
  if (body?.snoozeUntil !== undefined) {
    if (typeof body.snoozeUntil !== 'string') return fail('قالب سکوت موقت نامعتبر است')
    snoozeUntil = body.snoozeUntil
  }

  const existing = await db.notifPref.findUnique({ where: { userId: me.id } })
  const data = {
    ...(mutedCats !== undefined ? { mutedCats: JSON.stringify(mutedCats) } : {}),
    ...(snoozeUntil !== undefined ? { snoozeUntil } : {}),
  }
  const pref = existing
    ? await db.notifPref.update({ where: { userId: me.id }, data })
    : await db.notifPref.create({ data: { userId: me.id, ...data } })

  return json({
    prefs: {
      mutedCats: JSON.parse(pref.mutedCats || '[]') as string[],
      snoozeUntil: pref.snoozeUntil,
    },
  })
}
