import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'
import { displayName } from '@/lib/notify'
import {
  addDaysJalaliDash,
  formatJalaliDash,
  jalaliMonthLength,
  jalaliToDate,
  jalaliWeekdayDash,
  parseJalaliDash,
  todayJalaliDash,
} from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/** scientific weights — ترکیب وزن‌دار چندشاخصه */
export const WEIGHTS = { task: 0.35, section: 0.25, checklist: 0.15, attendance: 0.1, zoneCount: 0.1, extra: 0.05 }

const round1 = (x: number) => Math.round(x * 10) / 10
const clamp100 = (x: number) => Math.max(0, Math.min(100, x))

export function gradeOf(total: number): 'A' | 'B' | 'C' | 'D' {
  if (total >= 90) return 'A'
  if (total >= 80) return 'B'
  if (total >= 70) return 'C'
  return 'D'
}

/** "1405-07" (MONTHLY) or "1405-W30" (WEEKLY) → jalali day range */
export function periodRange(
  periodType: string,
  period: string,
): { start: string; end: string } | null {
  if (periodType === 'MONTHLY') {
    const m = period.match(/^(\d{4})-(\d{2})$/)
    if (!m) return null
    const jy = +m[1]
    const jm = +m[2]
    if (jm < 1 || jm > 12) return null
    return { start: `${jy}-${m[2]}-01`, end: `${jy}-${m[2]}-${jalaliMonthLength(jy, jm)}` }
  }
  if (periodType === 'WEEKLY') {
    const w = period.match(/^(\d{4})-W(\d{1,2})$/)
    if (!w) return null
    const jy = +w[1]
    const n = +w[2]
    if (n < 1 || n > 53) return null
    // week 1 = the week containing Farvardin 1, weeks start on شنبه
    const newYear = `${jy}-01-01`
    const week1Start = addDaysJalaliDash(newYear, -jalaliWeekdayDash(newYear))
    const start = addDaysJalaliDash(week1Start, (n - 1) * 7)
    return { start, end: addDaysJalaliDash(start, 6) }
  }
  return null
}

interface StoredExtra {
  extraScore: number
  note: string | null
  total: number
  grade: string
  updatedAt: Date
}

interface Component {
  taskScore: number
  sectionScore: number
  checklistScore: number
  attendanceScore: number
  zoneCountScore: number
  extraScore: number
  total: number
  grade: 'A' | 'B' | 'C' | 'D'
  counts: {
    orders: number
    ordersDone: number
    reviews: number
    checklists: number
    checklistsDone: number
    checks: number
    zoneCounts: number
    zoneMismatches: number
  }
}

/** live computation of one user's components for a period (nothing stored except extraScore) */
async function computeUser(
  userId: string,
  range: { start: string; end: string },
  stored: StoredExtra | null,
): Promise<Component> {
  const { start, end } = range
  const s = parseJalaliDash(start)
  const e = parseJalaliDash(end)
  const startG = jalaliToDate(s.jy, s.jm, s.jd)
  const endG = jalaliToDate(e.jy, e.jm, e.jd)
  endG.setDate(endG.getDate() + 1) // exclusive upper bound

  // ---- taskScore: % of assigned orders (blocked/cancelled excluded) done+verified on time ----
  const orders = await db.taskOrder.findMany({
    where: { assigneeId: userId, createdAt: { gte: startG, lt: endG } },
  })
  const relevant = orders.filter((o) => o.status !== 'blocked' && o.status !== 'cancelled')
  const doneOnTime = relevant.filter((o) => {
    if (o.status !== 'done' && o.status !== 'verified') return false
    if (!o.dueDate || !o.doneAt) return true // no deadline → cannot be late
    return formatJalaliDash(o.doneAt) <= o.dueDate
  })
  const taskScore = relevant.length ? round1((doneOnTime.length / relevant.length) * 100) : 0

  // ---- sectionScore: mean of (4-param sum × 5) over the staff's section reviews ----
  const reviews = await db.sectionReview.findMany({
    where: { staffId: userId, date: { gte: start, lte: end } },
  })
  const sectionScore = reviews.length
    ? round1(
        reviews.reduce((a, r) => a + (r.dateScore + r.layoutScore + r.cleanScore + r.labelScore) * 5, 0) /
          reviews.length,
      )
    : 0

  // ---- checklistScore: % of the user's checklist states actually completed ----
  const states = await db.checklistState.findMany({
    where: { userId, day: { gte: start, lte: end } },
  })
  const doneStates = states.filter((s) => s.completedAt !== null)
  const checklistScore = states.length ? round1((doneStates.length / states.length) * 100) : 0

  // ---- attendanceScore: 100 − 25×absent − 10×late(no permission) − 5×permitted ----
  const checks = await db.staffCheck.findMany({
    where: { staffId: userId, date: { gte: start, lte: end } },
  })
  let penalty = 0
  for (const c of checks) {
    if (c.arrival === 'absent') penalty += 25
    else if (c.arrival === 'late') penalty += c.hadPermission ? 5 : 10
    else if (c.arrival === 'permitted_leave') penalty += 5
  }
  const attendanceScore = checks.length ? clamp100(round1(100 - penalty)) : 0

  // ---- zoneCountScore: 100 − 10×mismatches ----
  const zcs = await db.zoneCount.findMany({
    where: { userId, date: { gte: start, lte: end } },
  })
  const zoneMismatches = zcs.reduce((a, z) => a + (z.mismatchCount || 0), 0)
  const zoneCountScore = zcs.length ? clamp100(round1(100 - 10 * zoneMismatches)) : 0

  // ---- extraScore: stored (default 0) ----
  const extraScore = stored ? stored.extraScore : 0

  const total = clamp100(
    round1(
      WEIGHTS.task * taskScore +
        WEIGHTS.section * sectionScore +
        WEIGHTS.checklist * checklistScore +
        WEIGHTS.attendance * attendanceScore +
        WEIGHTS.zoneCount * zoneCountScore +
        WEIGHTS.extra * extraScore,
    ),
  )

  return {
    taskScore,
    sectionScore,
    checklistScore,
    attendanceScore,
    zoneCountScore,
    extraScore,
    total,
    grade: gradeOf(total),
    counts: {
      orders: relevant.length,
      ordersDone: doneOnTime.length,
      reviews: reviews.length,
      checklists: states.length,
      checklistsDone: doneStates.length,
      checks: checks.length,
      zoneCounts: zcs.length,
      zoneMismatches,
    },
  }
}

/**
 * GET /api/performance?staff=&period=1405-07&periodType=MONTHLY — managers only.
 * Live computation (nothing stored): {scores:[...]} for ALL active staff (0 where no data).
 */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  const gate = await assertPageAccess(me, 'hr/performance')
  if (!gate.ok) return fail(gate.deny, 403)

  const sp = req.nextUrl.searchParams
  const staffFilter = sp.get('staff') || ''
  const period = sp.get('period') || todayJalaliDash().slice(0, 7)
  const periodType = sp.get('periodType') || 'MONTHLY'
  if (periodType !== 'MONTHLY' && periodType !== 'WEEKLY') return fail('نوع دوره نامعتبر است')

  const range = periodRange(periodType, period)
  if (!range) {
    return fail('دوره را به شکل ۱۴۰۵-۰۷ (ماهانه) یا ۱۴۰۵-W۳۰ (هفتگی) وارد کنید')
  }

  const users = await db.user.findMany({
    where: { active: true, ...(staffFilter ? { id: staffFilter } : {}) },
    orderBy: { createdAt: 'asc' },
  })
  if (staffFilter && !users.length) return fail('کارمند یافت نشد', 404)

  const storedRows = await db.performanceScore.findMany({ where: { periodType, periodKey: period } })
  const storedMap = new Map(storedRows.map((r) => [r.userId, r]))

  const scores = await Promise.all(
    users.map(async (u) => {
      const stored = storedMap.get(u.id)
      const storedInfo: StoredExtra | null = stored
        ? { extraScore: stored.extraScore, note: stored.note, total: stored.total, grade: stored.grade, updatedAt: stored.updatedAt }
        : null
      const c = await computeUser(u.id, range, storedInfo)
      return {
        userId: u.id,
        userName: displayName(u),
        honorific: u.honorific,
        role: u.role,
        title: u.title,
        taskScore: c.taskScore,
        sectionScore: c.sectionScore,
        checklistScore: c.checklistScore,
        attendanceScore: c.attendanceScore,
        zoneCountScore: c.zoneCountScore,
        extraScore: c.extraScore,
        total: c.total,
        grade: c.grade,
        breakdown: {
          task: c.taskScore,
          section: c.sectionScore,
          checklist: c.checklistScore,
          attendance: c.attendanceScore,
          zoneCount: c.zoneCountScore,
          extra: c.extraScore,
        },
        counts: c.counts,
        stored: stored
          ? { extraScore: stored.extraScore, note: stored.note, total: stored.total, grade: stored.grade, updatedAt: stored.updatedAt }
          : null,
      }
    }),
  )

  return ok({
    period,
    periodType,
    startDate: range.start,
    endDate: range.end,
    weights: WEIGHTS,
    scores,
  })
}

/**
 * POST /api/performance — managers only.
 * {userId, periodType, periodKey, extraScore, note} → upsert PerformanceScore
 * (stores extraScore+note; the weighted total stays live-computed on GET).
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  const gate = await assertPageAccess(me, 'hr/performance')
  if (!gate.ok) return fail(gate.deny, 403)

  const body = (await req.json().catch(() => ({}))) as {
    userId?: string
    periodType?: string
    periodKey?: string
    extraScore?: number
    note?: string
  }

  const user = await db.user.findUnique({ where: { id: String(body.userId || '') } })
  if (!user || !user.active) return fail('کارمند یافت نشد', 404)

  const periodType = String(body.periodType || 'MONTHLY')
  if (periodType !== 'MONTHLY' && periodType !== 'WEEKLY') return fail('نوع دوره نامعتبر است')
  const periodKey = String(body.periodKey || '').trim()
  const range = periodRange(periodType, periodKey)
  if (!range) return fail('دوره را به شکل ۱۴۰۵-۰۷ (ماهانه) یا ۱۴۰۵-W۳۰ (هفتگی) وارد کنید')

  const existing = await db.performanceScore.findUnique({
    where: { userId_periodType_periodKey: { userId: user.id, periodType, periodKey } },
  })

  // extraScore: ±100 encouragement/penalty (default 0 on create; kept on update when absent)
  const extraScore =
    body.extraScore !== undefined && Number.isFinite(Number(body.extraScore))
      ? round1(Math.max(-100, Math.min(100, Number(body.extraScore))))
      : existing
        ? existing.extraScore
        : 0
  const note =
    body.note !== undefined
      ? String(body.note).trim().slice(0, 1000) || null
      : existing
        ? existing.note
        : null

  const stored: StoredExtra = { extraScore, note, total: existing?.total ?? 0, grade: existing?.grade ?? '', updatedAt: existing?.updatedAt ?? new Date() }
  const c = await computeUser(user.id, range, stored)

  const score = await db.performanceScore.upsert({
    where: { userId_periodType_periodKey: { userId: user.id, periodType, periodKey } },
    create: {
      userId: user.id,
      userName: displayName(user),
      periodType,
      periodKey,
      startDate: range.start,
      endDate: range.end,
      taskScore: c.taskScore,
      sectionScore: c.sectionScore,
      checklistScore: c.checklistScore,
      attendanceScore: c.attendanceScore,
      zoneCountScore: c.zoneCountScore,
      extraScore,
      total: c.total,
      grade: c.grade,
      breakdownJson: JSON.stringify({
        weights: WEIGHTS,
        breakdown: {
          task: c.taskScore,
          section: c.sectionScore,
          checklist: c.checklistScore,
          attendance: c.attendanceScore,
          zoneCount: c.zoneCountScore,
          extra: c.extraScore,
        },
        counts: c.counts,
        liveAt: new Date().toISOString(),
      }),
      note,
    },
    update: {
      userName: displayName(user),
      startDate: range.start,
      endDate: range.end,
      taskScore: c.taskScore,
      sectionScore: c.sectionScore,
      checklistScore: c.checklistScore,
      attendanceScore: c.attendanceScore,
      zoneCountScore: c.zoneCountScore,
      extraScore,
      total: c.total,
      grade: c.grade,
      breakdownJson: JSON.stringify({
        weights: WEIGHTS,
        breakdown: {
          task: c.taskScore,
          section: c.sectionScore,
          checklist: c.checklistScore,
          attendance: c.attendanceScore,
          zoneCount: c.zoneCountScore,
          extra: c.extraScore,
        },
        counts: c.counts,
        liveAt: new Date().toISOString(),
      }),
      note,
    },
  })

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'performance.extra',
    actionLabel: 'کارنامه عملکرد',
    category: 'hr',
    detail: `${displayName(user)} — ${periodKey} — امتیاز تشویقی ${extraScore}${note ? ` (${note})` : ''}`,
    entityId: score.id,
  })

  return ok({
    score: {
      ...score,
      breakdown: safeJson<Record<string, unknown>>(score.breakdownJson, {}),
    },
  })
}
