import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, clampInt, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { displayName, notify } from '@/lib/notify'

export const dynamic = 'force-dynamic'

/** GET /api/awards — points & awards feed, newest first */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const awards = await db.award.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  const userIds = [...new Set(awards.map((a) => a.userId))]
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } } })
    : []
  const userMap = new Map(users.map((u) => [u.id, u]))

  return ok({
    awards: awards.map((a) => {
      const u = userMap.get(a.userId)
      return {
        id: a.id,
        points: a.points,
        reason: a.reason,
        createdAt: a.createdAt,
        user: u
          ? {
              id: u.id,
              fullName: u.fullName,
              honorific: u.honorific,
              role: u.role,
              avatarJson: u.avatarJson,
            }
          : null,
        awardedByName: a.awardedByName || '',
      }
    }),
  })
}

/** POST /api/awards {userId, points(1-100), reason} — managers only */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!isManager(me)) return fail('فقط مدیران می‌توانند امتیاز اهدا کنند', 403)

  const body = (await req.json().catch(() => ({}))) as {
    userId?: string
    points?: number
    reason?: string
  }
  const userId = String(body.userId || '')
  const points = clampInt(body.points, 1, 100, 5)
  const reason = String(body.reason || '').trim()
  if (!userId) return fail('انتخاب کاربر الزامی است')
  if (reason.length < 3) return fail('دلیل اهدا (حداقل ۳ نویسه) الزامی است')

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return fail('کاربر یافت نشد', 404)

  const awarderName = displayName(me)
  const award = await db.award.create({
    data: {
      userId,
      points,
      reason,
      awardedById: me.id,
      awardedByName: awarderName,
    },
  })
  await db.user.update({ where: { id: userId }, data: { points: { increment: points } } })

  await notify({
    userId,
    kind: 'award',
    severity: 'info',
    title: 'امتیاز جدید 🏆',
    body: `${awarderName} به شما ${points} امتیاز داد: ${reason}`,
    go: '#/home/home',
  })

  await logActivity({
    userId: me.id,
    userName: awarderName,
    action: 'award_points',
    actionLabel: 'اهدای امتیاز',
    category: 'awards',
    detail: `${displayName(user)} +${points} — ${reason}`,
    entityId: award.id,
  })

  return ok({ award: { id: award.id, points, reason } })
}
