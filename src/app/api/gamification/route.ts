import { db } from '@/lib/db'
import { fail, getSessionUser, json } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const users = await db.user.findMany({ where: { active: true }, orderBy: { points: 'desc' } })
  const leaderboard = users.map((u, i) => ({ rank: i + 1, id: u.id, name: u.name, role: u.role, points: u.points, color: u.color }))
  const meRow = leaderboard.find((l) => l.id === me.id)
  const awards = await db.award.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  const recentAwards = await db.award.findMany({ orderBy: { createdAt: 'desc' }, take: 10 })
  const allTasks = await db.task.findMany({ where: { assignedToId: me.id } })
  const stats = {
    rank: meRow?.rank || 0,
    points: meRow?.points || 0,
    total: leaderboard.length,
    tasksDone: allTasks.filter((t) => t.status === 'DONE').length,
    tasksOpen: allTasks.filter((t) => t.status !== 'DONE').length,
    ideasAccepted: (await db.feedback.findMany({ where: { userId: me.id, status: { in: ['ACCEPTED', 'IMPLEMENTED'] } } })).length,
  }
  const badges = computeBadges(stats, awards.length)
  return json({ leaderboard, awards, recentAwards, stats, badges })
}

function computeBadges(stats: { tasksDone: number; ideasAccepted: number; points: number }, awardCount: number) {
  const badges: { key: string; label: string; emoji: string; earned: boolean; hint: string }[] = [
    { key: 'starter', label: 'تازه‌کار پرتلاش', emoji: '🌱', earned: stats.tasksDone >= 1, hint: 'اولین وظیفه را انجام دهید' },
    { key: 'task10', label: 'ده‌تایی طلایی', emoji: '🏅', earned: stats.tasksDone >= 10, hint: '۱۰ وظیفه انجام دهید' },
    { key: 'task50', label: 'ستون تیم', emoji: '🏆', earned: stats.tasksDone >= 50, hint: '۵۰ وظیفه انجام دهید' },
    { key: 'idea', label: 'نوآور', emoji: '💡', earned: stats.ideasAccepted >= 1, hint: 'یک ایده پذیرفته‌شده ثبت کنید' },
    { key: 'idea3', label: 'مغز خلاق', emoji: '🧠', earned: stats.ideasAccepted >= 3, hint: 'سه ایده پذیرفته‌شده ثبت کنید' },
    { key: 'appreciated', label: 'قدردانی‌شده', emoji: '🌟', earned: awardCount >= 3, hint: 'سه بار از مدیریت امتیاز بگیرید' },
    { key: 'points300', label: '۳۰۰ امتیازی', emoji: '💎', earned: stats.points >= 300, hint: 'به ۳۰۰ امتیاز برسید' },
    { key: 'points1000', label: 'اسطوره زیتون', emoji: '🫒', earned: stats.points >= 1000, hint: 'به ۱۰۰۰ امتیاز برسید' },
  ]
  return badges
}
