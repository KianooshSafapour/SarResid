import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const items = await db.feedback.findMany({ orderBy: { createdAt: 'desc' } })
  // regular staff see only their own credited ideas; managers see all
  if (['GM', 'OM', 'OWNER', 'PM'].includes(me.role)) return json({ feedback: items, canManage: true })
  return json({
    feedback: items.filter((f) => f.type === 'IDEA' && f.userId === me.id),
    canManage: false,
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  if (!body.content?.trim()) return fail('متن الزامی است')
  const isIdea = body.type === 'IDEA'
  const fb = await db.feedback.create({
    data: {
      userId: isIdea ? me.id : body.anonymous ? null : me.id,
      authorName: isIdea ? me.name : body.anonymous ? 'ناشناس' : me.name,
      type: isIdea ? 'IDEA' : 'ANON',
      content: body.content.trim(),
    },
  })
  await logActivity(me, isIdea ? 'ثبت ایده' : 'ثبت بازخورد', 'feedback', fb.id)
  return json({ feedback: fb }, 201)
}

export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me || !['GM', 'OM', 'OWNER', 'PM'].includes(me.role))
    return fail('فقط مدیریت می‌تواند بازخورد را بررسی کند', 403)
  const { id, status, response, points } = await req.json()
  const fb = await db.feedback.findUnique({ where: { id } })
  if (!fb) return fail('یافت نشد', 404)
  const data: Record<string, unknown> = {}
  if (status) data.status = status
  if (response !== undefined) data.response = response
  if (points) data.points = Number(points)

  const updated = await db.feedback.update({ where: { id }, data })

  // award points to the idea owner whenever points>0 (creates an Award)
  if (points && fb.userId) {
    await db.user.update({ where: { id: fb.userId }, data: { points: { increment: Number(points) } } })
    await db.award.create({
      data: {
        userId: fb.userId,
        userName: fb.authorName,
        points: Number(points),
        reason: `ایده ارزشمند: ${fb.content.slice(0, 60)}…`,
        awardedById: me.id,
        awardedByName: me.name,
      },
    })
  }
  await logActivity(me, 'بررسی بازخورد/ایده', 'feedback', id, status || '')
  return json({ feedback: updated })
}
