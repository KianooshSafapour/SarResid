import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { guardCap } from '@/lib/rbac'

/** گزارش تور آشنایی — TourState فقط برای گزارش مدیریتی است؛
 *  منبع اصلی نمایش تور همان حالت محلی (localStorage/sessionStorage) می‌ماند. */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const guard = await guardCap(me, 'tour.reset')
  if (guard) return fail(guard, 403)

  const [states, users] = await Promise.all([
    db.tourState.findMany({ orderBy: { updatedAt: 'desc' } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
  ])
  const byId = new Map(users.map((u) => [u.id, u]))
  const stateRows = states
    .filter((s) => byId.has(s.userId))
    .map((s) => {
      const u = byId.get(s.userId)!
      return { userId: s.userId, userName: u.name, color: u.color, role: u.role, tourKey: s.tourKey, done: s.done, step: s.step, updatedAt: s.updatedAt }
    })
  const withState = new Set(states.map((s) => s.userId))
  const usersWithoutState = users
    .filter((u) => !withState.has(u.id) && !u.hidden)
    .map((u) => ({ id: u.id, name: u.name, role: u.role, color: u.color }))
  return json({ states: stateRows, usersWithoutState })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json().catch(() => ({}))

  // پایان تور توسط خود کاربر — بدون cap (وضعیت خودش)
  if (body?.action === 'done') {
    const step = Math.max(0, Math.round(Number(body.step) || 0))
    await db.tourState.upsert({
      where: { userId_tourKey: { userId: me.id, tourKey: 'main' } },
      update: { done: true, step },
      create: { userId: me.id, tourKey: 'main', done: true, step },
    })
    return json({ ok: true })
  }

  // بازنشانی تور — فقط مدیر دارای tour.reset
  if (body?.action === 'reset') {
    const guard = await guardCap(me, 'tour.reset')
    if (guard) return fail(guard, 403)
    if (body.all) {
      const n = await db.tourState.deleteMany({})
      await logActivity(me, 'بازنشانی تور آموزشی', 'tour', 'all', 'تور آموزشی برای همه بازنشانی شد')
      return json({ ok: true, deleted: n.count })
    }
    if (body.userId) {
      const u = await db.user.findUnique({ where: { id: String(body.userId) } })
      if (!u) return fail('کاربر یافت نشد', 404)
      const n = await db.tourState.deleteMany({ where: { userId: String(body.userId) } })
      await logActivity(me, 'بازنشانی تور آموزشی', 'tour', String(body.userId), `تور آموزشی برای ${u.name} بازنشانی شد`)
      return json({ ok: true, deleted: n.count })
    }
    return fail('userId یا all الزامی است')
  }

  return fail('عملیات نامعتبر است')
}
