import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, clampInt, safeJson, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { displayName, notify } from '@/lib/notify'

export const dynamic = 'force-dynamic'

const STATUS_LABELS: Record<string, string> = {
  NEW: 'جدید',
  REVIEWING: 'در حال بررسی',
  ACCEPTED: 'پذیرفته شد',
  REJECTED: 'رد شد',
  IMPLEMENTED: 'پیاده‌سازی شد',
}

/** GET /api/feedback[?kind=] — feedback box + ideas */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const kind = req.nextUrl.searchParams.get('kind') || ''
  const items = await db.feedback.findMany({
    where: kind ? { kind } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const authorIds = [...new Set(items.map((i) => i.authorId).filter((x): x is string => !!x))]
  const authors = authorIds.length
    ? await db.user.findMany({ where: { id: { in: authorIds } } })
    : []
  const authorMap = new Map(authors.map((a) => [a.id, a]))

  const authorsMap: Record<string, string> = {}
  for (const a of authors) authorsMap[a.id] = displayName(a)

  const [total, ideas, anon, implemented, pointsAgg] = await Promise.all([
    db.feedback.count(),
    db.feedback.count({ where: { kind: 'IDEA' } }),
    db.feedback.count({ where: { kind: 'ANON' } }),
    db.feedback.count({ where: { status: 'IMPLEMENTED' } }),
    db.feedback.aggregate({ _sum: { points: true } }),
  ])

  return ok({
    items: items.map((f) => ({
      id: f.id,
      kind: f.kind,
      content: f.content,
      status: f.status,
      statusLabel: STATUS_LABELS[f.status] || f.status,
      response: f.response,
      points: f.points,
      createdAt: f.createdAt,
      author: f.authorId,
      isMine: !!me && f.authorId === me.id,
    })),
    authors: authorsMap,
    stats: {
      total,
      ideas,
      anon,
      implemented,
      pointsAwarded: pointsAgg._sum.points || 0,
    },
    isManager: isManager(me),
  })
}

/** POST /api/feedback {kind: ANON|IDEA, content} */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => ({}))) as { kind?: string; content?: string }
  const kind = body.kind === 'ANON' ? 'ANON' : 'IDEA'
  const content = String(body.content || '').trim()
  if (content.length < 5) return fail('متن حداقل ۵ نویسه باشد')

  const feedback = await db.feedback.create({
    data: { kind, content, authorId: kind === 'IDEA' ? me.id : null },
  })

  await notify({
    role: 'ADMIN',
    kind: 'feedback',
    severity: 'info',
    title: kind === 'ANON' ? 'بازخورد ناشناس جدید' : 'ایده جدید ثبت شد',
    body: content.slice(0, 120),
    go: '#/tasks/feedback',
  })

  await logActivity({
    userId: kind === 'IDEA' ? me.id : null,
    userName: kind === 'IDEA' ? displayName(me) : null,
    action: 'feedback_submit',
    actionLabel: 'ثبت بازخورد',
    category: 'feedback',
    detail: kind === 'ANON' ? 'بازخورد ناشناس' : 'ایده',
    entityId: feedback.id,
  })

  return ok({ feedback: { id: feedback.id } })
}

/**
 * PATCH /api/feedback {id, status, response?, points?} — managers.
 * ACCEPTED/IMPLEMENTED ideas award points to their author (once).
 */
export async function PATCH(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!isManager(me)) return fail('فقط مدیران می‌توانند بازخورد را بررسی کنند', 403)

  const body = (await req.json().catch(() => ({}))) as {
    id?: string
    status?: string
    response?: string
    points?: number
  }
  const id = String(body.id || '')
  const feedback = await db.feedback.findUnique({ where: { id } })
  if (!feedback) return fail('بازخورد یافت نشد', 404)

  const status = String(body.status || feedback.status)
  if (!STATUS_LABELS[status]) return fail('وضعیت نامعتبر است')
  const response = body.response !== undefined ? String(body.response || '').trim() : feedback.response
  const points = clampInt(body.points ?? feedback.points, 0, 100, feedback.points)

  await db.feedback.update({
    where: { id },
    data: { status, response: response || null, points },
  })

  // award points to the idea author — only once (previous points must be 0)
  let awarded = 0
  const awardable =
    (status === 'ACCEPTED' || status === 'IMPLEMENTED') &&
    feedback.kind === 'IDEA' &&
    feedback.authorId &&
    points > 0 &&
    feedback.points === 0

  if (awardable && feedback.authorId) {
    awarded = points
    await db.user.update({
      where: { id: feedback.authorId },
      data: { points: { increment: points } },
    })
    await db.award.create({
      data: {
        userId: feedback.authorId,
        points,
        reason: `ایده پذیرفته‌شده: ${feedback.content.slice(0, 60)}`,
        awardedById: me.id,
        awardedByName: displayName(me),
      },
    })
    await notify({
      userId: feedback.authorId,
      kind: 'award',
      severity: 'info',
      title: 'ایده شما پذیرفته شد 🌟',
      body: `ایده شما پذیرفته شد و ${points} امتیاز گرفت: ${feedback.content.slice(0, 60)}`,
      go: '#/tasks/feedback',
    })
  }

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'feedback_review',
    actionLabel: 'بررسی بازخورد',
    category: 'feedback',
    detail: `${STATUS_LABELS[status]}${awarded > 0 ? ` (+${awarded} امتیاز)` : ''}`,
    entityId: id,
  })

  return ok({ awarded })
}

/** DELETE /api/feedback?id= — managers or own NEW items */
export async function DELETE(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const id = req.nextUrl.searchParams.get('id') || ''
  const feedback = await db.feedback.findUnique({ where: { id } })
  if (!feedback) return fail('بازخورد یافت نشد', 404)

  const mine = feedback.authorId === me.id
  if (!isManager(me) && !(mine && feedback.status === 'NEW')) {
    return fail('اجازه حذف این مورد را ندارید', 403)
  }

  await db.feedback.delete({ where: { id } })
  return ok({ deleted: id })
}
