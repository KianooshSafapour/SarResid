import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canShifts } from '@/lib/access'
import { todayJalaliDash, addDaysJalaliDash, jalaliWeekdayDash, jalaliDashWeekdayName } from '@/lib/jalali'
import { orderedUsers } from '@/lib/hr-order'

export const dynamic = 'force-dynamic'

const SHIFTS = ['MORNING', 'EVENING', 'NIGHT', 'OFF'] as const
const SHIFT_LABELS: Record<string, string> = { MORNING: 'صبح', EVENING: 'عصر', NIGHT: 'شب', OFF: 'استراحت' }
const NEEDS: Record<string, number> = { MORNING: 2, EVENING: 2, NIGHT: 1 }

/** GET /api/hr/shifts?week=YYYY-MM-DD → full weekly schedule */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canShifts(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const today = todayJalaliDash()
  const weekParam = req.nextUrl.searchParams.get('week') || today
  const weekStart = addDaysJalaliDash(weekParam, -jalaliWeekdayDash(weekParam))
  const weekEnd = addDaysJalaliDash(weekStart, 6)

  const dates = Array.from({ length: 7 }, (_v, i) => addDaysJalaliDash(weekStart, i))

  const [users, assignments] = await Promise.all([
    orderedUsers(),
    db.shiftAssignment.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
  ])
  const activeUsers = users.filter((u) => u.active)
  const dateIndex = new Map(dates.map((d, i) => [d, i]))

  const coverage = dates.map((date, dayIdx) => {
    const counts: Record<string, number> = { MORNING: 0, EVENING: 0, NIGHT: 0, OFF: 0 }
    for (const a of assignments) {
      if (a.date === date && counts[a.shift] !== undefined) counts[a.shift] += 1
    }
    const issues: string[] = []
    let noCoverage = false
    let belowNeeds = false
    for (const s of ['MORNING', 'EVENING', 'NIGHT'] as const) {
      if (counts[s] === 0) {
        issues.push(`${SHIFT_LABELS[s]}: بدون نیرو`)
        noCoverage = true
      } else if (counts[s] < NEEDS[s]) {
        issues.push(`${SHIFT_LABELS[s]}: کمبود نیرو`)
        belowNeeds = true
      }
    }
    return {
      dayIdx,
      date,
      counts,
      status: noCoverage ? 'critical' : belowNeeds ? 'warning' : 'ok',
      noCoverage,
      issues,
    }
  })

  return ok({
    weekStart,
    weekEnd,
    today,
    days: dates.map((date, dayIdx) => ({ dayIdx, date, label: jalaliDashWeekdayName(date) })),
    users: activeUsers.map((u) => ({ id: u.id, fullName: u.fullName, honorific: u.honorific, role: u.role, title: u.title })),
    assignments: assignments.map((a) => ({
      id: a.id,
      userId: a.userId,
      date: a.date,
      dayIdx: dateIndex.get(a.date) ?? 0,
      shift: a.shift,
      shiftType: a.shift,
      note: null,
    })),
    coverage,
    needs: NEEDS,
  })
}

/** POST /api/hr/shifts {weekStart, dayIdx, userId, shiftType, note?} → upsert one assignment */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canShifts(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const body = await req.json().catch(() => null)
  const weekStart = typeof body?.weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.weekStart) ? body.weekStart : ''
  const userId = typeof body?.userId === 'string' ? body.userId : ''
  const dayIdx = Number(body?.dayIdx)
  const shiftType = String(body?.shiftType || body?.shift || '')

  if (!weekStart) return fail('هفته نامعتبر است')
  if (!userId) return fail('کاربر را انتخاب کنید')
  if (!Number.isInteger(dayIdx) || dayIdx < 0 || dayIdx > 6) return fail('روز هفته نامعتبر است')
  if (!SHIFTS.includes(shiftType as (typeof SHIFTS)[number])) return fail('نوع شیفت نامعتبر است')

  const target = await db.user.findUnique({ where: { id: userId } })
  if (!target) return fail('کاربر یافت نشد', 404)

  const date = addDaysJalaliDash(weekStart, dayIdx)
  const assignment = await db.shiftAssignment.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, shift: shiftType },
    update: { shift: shiftType },
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'shift.set',
    actionLabel: 'شیفت',
    category: 'shift',
    detail: `${target.fullName} — ${date} (${SHIFT_LABELS[shiftType] ?? shiftType})`,
    entityId: assignment.id,
  })

  return ok({
    assignment: {
      id: assignment.id,
      userId: assignment.userId,
      date: assignment.date,
      dayIdx,
      shift: assignment.shift,
      shiftType: assignment.shift,
      note: null,
    },
  })
}

/** DELETE /api/hr/shifts?id= */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canShifts(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const id = req.nextUrl.searchParams.get('id') || ''
  const assignment = await db.shiftAssignment.findUnique({ where: { id } })
  if (!assignment) return fail('شیفت یافت نشد', 404)

  await db.shiftAssignment.delete({ where: { id } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'shift.remove',
    actionLabel: 'شیفت',
    category: 'shift',
    detail: `${assignment.date} (${SHIFT_LABELS[assignment.shift] ?? assignment.shift})`,
    entityId: id,
  })
  return ok({ deleted: true })
}
