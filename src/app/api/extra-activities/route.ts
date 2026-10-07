import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { emitNotif } from '@/lib/notif-engine'
import { faNum } from '@/lib/jalali'

/** مدیرانِ مجاز برای قدردانی/امتیاز — هماهنگ با کلاینت */
const REVIEWERS = ['GM', 'OM', 'HC', 'OWNER', 'ADMIN']

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const isManager = REVIEWERS.includes(me.role)
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || ''

  const scope = isManager ? {} : { userId: me.id }
  const where: Record<string, unknown> = { ...scope }
  if (status) where.status = status

  const [activities, sum7, pending] = await Promise.all([
    db.extraActivity.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }),
    db.extraActivity.aggregate({
      where: { ...scope, createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
      _sum: { minutes: true },
    }),
    db.extraActivity.count({ where: { ...scope, status: 'PENDING' } }),
  ])

  return json({
    activities,
    canReview: isManager,
    stats: { totalMinutes7d: sum7._sum.minutes || 0, pending },
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { title, description, minutes, forDate } = await req.json().catch(() => ({}))
  const t = String(title || '').trim()
  if (!t) return fail('عنوان فعالیت الزامی است')
  const m = Math.round(Number(minutes))
  if (!m || m < 5 || m > 600) return fail('مدت فعالیت باید بین ۵ تا ۶۰۰ دقیقه باشد')
  const iso = String(forDate || new Date().toISOString().slice(0, 10)).slice(0, 10)

  const activity = await db.extraActivity.create({
    data: {
      userId: me.id,
      userName: me.name,
      title: t,
      description: String(description || '').trim(),
      minutes: m,
      forDate: iso,
    },
  })
  await logActivity(me, 'ثبت فعالیت فراتر از وظیفه', 'extraActivity', activity.id, `${t} (${faNum(m)} دقیقه)`)
  await emitNotif({
    event: 'extra.activity',
    title: 'فعالیت فراتر از وظیفه ثبت شد',
    detail: `${me.name}: ${t} (${faNum(m)} دقیقه)`,
    go: '#/perf',
    icon: '🌟',
  })
  return json({ activity }, 201)
}

export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!REVIEWERS.includes(me.role)) return fail('فقط مدیریت می‌تواند فعالیت‌ها را قدردانی کند', 403)
  const { id, action, rewardPoints } = await req.json().catch(() => ({}))
  if (!id) return fail('شناسه فعالیت الزامی است')
  const act = await db.extraActivity.findUnique({ where: { id } })
  if (!act) return fail('فعالیت یافت نشد', 404)

  // قدردانی ساده — بدون امتیاز، فقط بازشناسی صادقانه
  if (action === 'acknowledge') {
    const updated = await db.extraActivity.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED', reviewedById: me.id, reviewedByName: me.name },
    })
    await logActivity(me, 'قدردانی از فعالیت فراتر از وظیفه', 'extraActivity', id, act.title)
    return json({ activity: updated })
  }

  // قدردانی + امتیاز — رکورد Award (همان الگوی گیمیفیکیشن)
  if (action === 'reward') {
    if (act.status === 'REWARDED') return fail('این فعالیت قبلاً امتیاز گرفته است')
    const p = Math.round(Number(rewardPoints))
    if (!p || p < 1 || p > 100) return fail('امتیاز باید بین ۱ تا ۱۰۰ باشد')
    const user = await db.user.findUnique({ where: { id: act.userId } })
    if (!user) return fail('کاربر یافت نشد', 404)
    await db.user.update({ where: { id: user.id }, data: { points: { increment: p } } })
    const award = await db.award.create({
      data: {
        userId: user.id,
        userName: user.name,
        points: p,
        reason: `فعالیت فراتر از وظیفه: ${act.title}`,
        awardedById: me.id,
        awardedByName: me.name,
      },
    })
    const updated = await db.extraActivity.update({
      where: { id },
      data: { status: 'REWARDED', rewardPoints: p, reviewedById: me.id, reviewedByName: me.name },
    })
    await logActivity(me, `اهدا امتیاز (${faNum(p)}) به ${user.name}`, 'award', award.id, `فعالیت فراتر از وظیفه: ${act.title}`)
    return json({ activity: updated, award })
  }

  return fail('عملیات نامعتبر است')
}
