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

/* ═════════ وزن‌های ترکیب کارنامه — R7-PERF (پژوهش R7 بخش ۶.۳) ═════════
 * ۷ مؤلفه: وظایف ۳۰٪ · چیدمان ۲۰٪ · بازرسی روزانه ۱۵٪ · چک‌لیست ۱۵٪ · حضور ۱۰٪ · شمارش ۵٪ · تشویقی ۵٪
 * وزن‌ها در KV (Setting با کلید 'perf.weights' به شکل JSON) ذخیره می‌شوند تا مالک بدون انتشار نسخهٔ جدید
 * بتواند آن‌ها را تنظیم کند؛ این مقادیر، پیش‌فرض‌ها هستند. کلیدهای غایب از KV با پیش‌فرض پر می‌شوند
 * («گسترش» KV موجود) و مقدار هر مؤلفه به بازهٔ ۰ تا ۱ محدود می‌شود. */
export const DEFAULT_WEIGHTS = {
  task: 0.3,
  section: 0.2,
  dailyCheck: 0.15,
  checklist: 0.15,
  attendance: 0.1,
  zoneCount: 0.05,
  extra: 0.05,
}
export type PerfWeights = typeof DEFAULT_WEIGHTS

const WEIGHTS_KEY = 'perf.weights'

/** خواندن وزن‌های مؤثر از KV — ادغام با پیش‌فرض‌ها (کلید غایب → پیش‌فرض؛ مقدار نامعتبر → پیش‌فرض).
 *  اگر KV هنوز وجود نداشته باشد، در اولین خواندن با پیش‌فرض‌ها ساخته می‌شود تا مالک
 *  بتواند بعداً بدون انتشار نسخهٔ جدید آن را تنظیم کند (الگوی cheque:limits). */
async function readWeights(): Promise<PerfWeights> {
  const row = await db.setting.findUnique({ where: { key: WEIGHTS_KEY } })
  if (!row) {
    await db.setting.upsert({
      where: { key: WEIGHTS_KEY },
      create: { key: WEIGHTS_KEY, value: JSON.stringify(DEFAULT_WEIGHTS) },
      update: {},
    })
    return { ...DEFAULT_WEIGHTS }
  }
  const parsed = safeJson<Record<string, unknown>>(row.value, {})
  const w: PerfWeights = { ...DEFAULT_WEIGHTS }
  for (const k of Object.keys(DEFAULT_WEIGHTS) as (keyof PerfWeights)[]) {
    const n = Number(parsed?.[k])
    if (Number.isFinite(n) && n >= 0 && n <= 1) w[k] = Math.round(n * 1000) / 1000
  }
  return w
}

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
  dailyCheckScore: number
  checklistScore: number
  attendanceScore: number
  zoneCountScore: number
  extraScore: number
  total: number | null // null = هیچ مؤلفه‌ای داده ندارد («بدون دادهٔ کافی»)
  grade: 'A' | 'B' | 'C' | 'D' | ''
  counts: {
    orders: number
    ordersDone: number
    reviews: number
    checklists: number
    checklistsDone: number
    checks: number
    dailyCheckDays: number
    zoneCounts: number
    zoneMismatches: number
  }
}

/** live computation of one user's components for a period (nothing stored except extraScore) */
async function computeUser(
  userId: string,
  range: { start: string; end: string },
  stored: StoredExtra | null,
  weights: PerfWeights,
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

  // ---- attendanceScore (R5-C — قانون مالک):
  //   غیبت −۲۵ · تأخیر بدون اجازهٔ مدیر = غیبت (−۲۵) ·
  //   تأخیر با اجازهٔ مدیر = مرخصی ساعتی (−۵) · مرخصی (−۵) ----
  const checks = await db.staffCheck.findMany({
    where: { staffId: userId, date: { gte: start, lte: end } },
  })
  let penalty = 0
  for (const c of checks) {
    if (c.arrival === 'absent') penalty += 25
    else if (c.arrival === 'late') penalty += c.hadPermission ? 5 : 25
    else if (c.arrival === 'permitted_leave') penalty += 5
  }
  const attendanceScore = checks.length ? clamp100(round1(100 - penalty)) : 0

  // ---- dailyCheckScore (R7-PERF — پژوهش R7 بخش ۶.۲):
  //   فقط رکوردهایی که arrival='on_time' هستند (مرخصی/غیبت از این مؤلفه حذف و در شاخص حضور
  //   جریمه می‌شوند — جلوگیری از جریمهٔ دوگانه). امتیاز هر رکورد = میانگین نگاشت ۴ معیار
  //   (ok=۱ · minor=۰٫۵ · needs_followup=۰)؛ چند رکورد در یک روز (هر دو شیفت) → میانگین همان روز؛
  //   dailyCheckScore = ۱۰۰ × میانگین امتیاز همهٔ روزهای دارای داده ----
  const FLAG_SCORE: Record<string, number> = { ok: 1, minor: 0.5, needs_followup: 0 }
  const onTimeChecks = checks.filter((c) => c.arrival === 'on_time')
  const byDay = new Map<string, number[]>()
  for (const c of onTimeChecks) {
    const flagSum =
      (FLAG_SCORE[c.uniform] ?? 1) +
      (FLAG_SCORE[c.hygiene] ?? 1) +
      (FLAG_SCORE[c.behavior] ?? 1) +
      (FLAG_SCORE[c.workQuality] ?? 1)
    const dayScores = byDay.get(c.date) || []
    dayScores.push(flagSum / 4)
    byDay.set(c.date, dayScores)
  }
  const dayMeans = [...byDay.values()].map((xs) => xs.reduce((a, b) => a + b, 0) / xs.length)
  const dailyCheckDays = dayMeans.length
  const dailyCheckScore = dailyCheckDays
    ? round1((100 * dayMeans.reduce((a, b) => a + b, 0)) / dailyCheckDays)
    : 0

  // ---- zoneCountScore: 100 − 10×mismatches ----
  const zcs = await db.zoneCount.findMany({
    where: { userId, date: { gte: start, lte: end } },
  })
  const zoneMismatches = zcs.reduce((a, z) => a + (z.mismatchCount || 0), 0)
  const zoneCountScore = zcs.length ? clamp100(round1(100 - 10 * zoneMismatches)) : 0

  // ---- extraScore: stored (default 0) ----
  const extraScore = stored ? stored.extraScore : 0

  // ---- ترکیب وزن‌دار با بازتوزیع وزن مؤلفه‌های بدون داده (R7-PERF — پژوهش R7 بخش ۶.۴) ----
  //   مؤلفه‌ای که در این دوره داده ندارد (نه «صفرِ عملکرد ضعیف» بلکه «نبود داده»)، از مخرج وزن
  //   حذف و وزنش به‌نسبت بین مؤلفه‌های دارای داده بازتوزیع می‌شود؛ اگر هیچ مؤلفه‌ای داده نداشت → total=null.
  const parts: { w: number; score: number }[] = []
  if (relevant.length) parts.push({ w: weights.task, score: taskScore })
  if (reviews.length) parts.push({ w: weights.section, score: sectionScore })
  if (dailyCheckDays) parts.push({ w: weights.dailyCheck, score: dailyCheckScore })
  if (states.length) parts.push({ w: weights.checklist, score: checklistScore })
  if (checks.length) parts.push({ w: weights.attendance, score: attendanceScore })
  if (zcs.length) parts.push({ w: weights.zoneCount, score: zoneCountScore })
  if (extraScore !== 0) parts.push({ w: weights.extra, score: extraScore })
  const weightSum = parts.reduce((a, p) => a + p.w, 0)
  const total = weightSum > 0
    ? clamp100(round1(parts.reduce((a, p) => a + p.w * p.score, 0) / weightSum))
    : null

  return {
    taskScore,
    sectionScore,
    dailyCheckScore,
    checklistScore,
    attendanceScore,
    zoneCountScore,
    extraScore,
    total,
    grade: total === null ? '' : gradeOf(total),
    counts: {
      orders: relevant.length,
      ordersDone: doneOnTime.length,
      reviews: reviews.length,
      checklists: states.length,
      checklistsDone: doneStates.length,
      checks: checks.length,
      dailyCheckDays,
      zoneCounts: zcs.length,
      zoneMismatches,
    },
  }
}

/**
 * GET /api/performance?staff=&period=1405-07&periodType=MONTHLY — managers only.
 * Live computation (nothing stored): {scores:[...]} for ALL active staff.
 * R7-PERF: ۷ مؤلفه (بازرسی روزانه جدید) + وزن‌ها از KV 'perf.weights' +
 * بازتوزیع وزن مؤلفه‌های بدون داده؛ total=null یعنی «بدون دادهٔ کافی».
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
  const weights = await readWeights()

  const scores = await Promise.all(
    users.map(async (u) => {
      const stored = storedMap.get(u.id)
      const storedInfo: StoredExtra | null = stored
        ? { extraScore: stored.extraScore, note: stored.note, total: stored.total, grade: stored.grade, updatedAt: stored.updatedAt }
        : null
      const c = await computeUser(u.id, range, storedInfo, weights)
      return {
        userId: u.id,
        userName: displayName(u),
        honorific: u.honorific,
        role: u.role,
        title: u.title,
        taskScore: c.taskScore,
        sectionScore: c.sectionScore,
        dailyCheckScore: c.dailyCheckScore,
        checklistScore: c.checklistScore,
        attendanceScore: c.attendanceScore,
        zoneCountScore: c.zoneCountScore,
        extraScore: c.extraScore,
        total: c.total,
        grade: c.grade,
        breakdown: {
          task: c.taskScore,
          section: c.sectionScore,
          dailyCheck: c.dailyCheckScore,
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
    weights,
    weightsKey: WEIGHTS_KEY,
    scores,
  })
}

/**
 * POST /api/performance — managers only.
 * {userId, periodType, periodKey, extraScore, note} → upsert PerformanceScore
 * (stores extraScore+note + snapshot of all live components incl. dailyCheckScore;
 *  the weighted total stays live-computed on GET — weights snapshot in breakdownJson).
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
  const weights = await readWeights()
  const c = await computeUser(user.id, range, stored, weights)

  // ستون‌های total/grade ستون‌های non-null هستند؛ «بدون دادهٔ کافی» با total=0 + grade='' + total:null داخل breakdownJson ذخیره می‌شود
  const breakdownJson = JSON.stringify({
    weights,
    breakdown: {
      task: c.taskScore,
      section: c.sectionScore,
      dailyCheck: c.dailyCheckScore,
      checklist: c.checklistScore,
      attendance: c.attendanceScore,
      zoneCount: c.zoneCountScore,
      extra: c.extraScore,
    },
    counts: c.counts,
    total: c.total,
    liveAt: new Date().toISOString(),
  })

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
      dailyCheckScore: c.dailyCheckScore,
      checklistScore: c.checklistScore,
      attendanceScore: c.attendanceScore,
      zoneCountScore: c.zoneCountScore,
      extraScore,
      total: c.total ?? 0,
      grade: c.grade || '',
      breakdownJson,
      note,
    },
    update: {
      userName: displayName(user),
      startDate: range.start,
      endDate: range.end,
      taskScore: c.taskScore,
      sectionScore: c.sectionScore,
      dailyCheckScore: c.dailyCheckScore,
      checklistScore: c.checklistScore,
      attendanceScore: c.attendanceScore,
      zoneCountScore: c.zoneCountScore,
      extraScore,
      total: c.total ?? 0,
      grade: c.grade || '',
      breakdownJson,
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
