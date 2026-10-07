import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

/** Managers award points to staff — the heart of the "appreciation not surveillance" loop */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me || !['GM', 'OM', 'PM', 'OWNER', 'HC'].includes(me.role))
    return fail('فقط مدیریت می‌تواند امتیاز اهدا کند', 403)
  const { userId, points, reason } = await req.json()
  if (!userId || !points || !reason?.trim()) return fail('کاربر، امتیاز و دلیل الزامی است')
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return fail('کاربر یافت نشد', 404)
  const p = Number(points)
  await db.user.update({ where: { id: userId }, data: { points: { increment: p } } })
  const award = await db.award.create({
    data: {
      userId,
      userName: user.name,
      points: p,
      reason: reason.trim(),
      awardedById: me.id,
      awardedByName: me.name,
    },
  })
  await logActivity(me, `اهدا امتیاز (${p}) به ${user.name}`, 'award', award.id, reason)
  return json({ award }, 201)
}
