import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canShifts } from '@/lib/access'
import { todayJalaliDash, addDaysJalaliDash, jalaliWeekdayDash, jalaliDashWeekdayName } from '@/lib/jalali'
import { orderedUsers } from '@/lib/hr-order'

export const dynamic = 'force-dynamic'

/**
 * R5-H — برنامهٔ شیفت هفتگی (بازنویسی).
 *  • شیفت شب در هایپر زیتون وجود ندارد (دو شیفت: صبح ۷:۳۰–۱۵:۳۰ / عصر ۱۵:۳۰–۲۳:۰۰).
 *    مقدار NIGHT فقط دادهٔ قدیمی است و هنگام «خواندن» به EVENING نگاشت می‌شود؛
 *    سطرهای دیتابیس هرگز حذف نمی‌شوند.
 *  • LEAVE = مرخصیِ ثبت‌شده توسط مدیر در خود برنامهٔ هفتگی (دادهٔ برنامه‌ریزی).
 *    مرخصی‌های سیستمی از LeaveRequest می‌آیند: روز پوشیده‌شده با مرخصی تأییدشدهٔ
 *    تمام‌روز، قفل می‌شود و نوشتن شیفت روی آن رد می‌شود (lockedDays/hourlyLeaves).
 */
/* R11: BOTH = شیفت دوگانهٔ صبح+عصر — برای پرسنلی که هر دو شیفت را کار می‌کنند */
const WRITE_SHIFTS = ['MORNING', 'EVENING', 'BOTH', 'LEAVE', 'OFF'] as const
const SHIFT_LABELS: Record<string, string> = { MORNING: 'صبح', EVENING: 'عصر', BOTH: 'صبح و عصر', NIGHT: 'شب', LEAVE: 'مرخصی', OFF: 'تعطیل' }
const NEEDS: Record<string, number> = { MORNING: 2, EVENING: 2 }
/** مرخصی‌های تمام‌روز (قفل‌کنندهٔ سلول) — HOURLY فقط نشانگر ساعتی است */
const FULL_DAY_LEAVES = ['DAILY', 'SICK', 'UNPAID']

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** نگاشت خواندن: دادهٔ قدیمی NIGHT → EVENING (بدون حذف سطر) */
function readShift(s: string): string {
  return s === 'NIGHT' ? 'EVENING' : s
}

/** آیا این روز با مرخصی تأییدشدهٔ تمام‌روز پوشیده شده؟ (سلول قفل می‌شود) */
async function isLeaveLocked(userId: string, date: string): Promise<boolean> {
  const hit = await db.leaveRequest.findFirst({
    where: {
      userId,
      status: 'APPROVED',
      type: { in: FULL_DAY_LEAVES },
      fromDate: { lte: date },
      toDate: { gte: date },
    },
  })
  return !!hit
}

function weekDates(weekParam: string): { weekStart: string; weekEnd: string; dates: string[] } {
  const weekStart = addDaysJalaliDash(weekParam, -jalaliWeekdayDash(weekParam))
  const weekEnd = addDaysJalaliDash(weekStart, 6)
  const dates = Array.from({ length: 7 }, (_v, i) => addDaysJalaliDash(weekStart, i))
  return { weekStart, weekEnd, dates }
}

/** GET /api/hr/shifts?week=YYYY-MM-DD → برنامهٔ کامل هفته + مرخصی‌های قفل‌کننده */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canShifts(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const today = todayJalaliDash()
  const weekParam = req.nextUrl.searchParams.get('week') || today
  if (!DATE_RE.test(weekParam)) return fail('قالب هفته نامعتبر است (۱۴۰۵-۰۷-۲۶)')
  const { weekStart, weekEnd, dates } = weekDates(weekParam)

  const [users, assignments, weekLeaves] = await Promise.all([
    orderedUsers(),
    db.shiftAssignment.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
    db.leaveRequest.findMany({ where: { status: 'APPROVED', fromDate: { lte: weekEnd }, toDate: { gte: weekStart } } }),
  ])
  const activeUsers = users.filter((u) => u.active)
  const dateIndex = new Map(dates.map((d, i) => [d, i]))

  /* روزهای قفل‌شده با مرخی تأییدشدهٔ تمام‌روز + نشانگرهای مرخصی ساعتی تأییدشده */
  const lockedDays: { userId: string; date: string; dayIdx: number }[] = []
  const hourlyLeaves: { userId: string; date: string; dayIdx: number; hours: number }[] = []
  for (const l of weekLeaves) {
    if (FULL_DAY_LEAVES.includes(l.type)) {
      for (const date of dates) {
        if (l.fromDate <= date && date <= l.toDate) {
          lockedDays.push({ userId: l.userId, date, dayIdx: dateIndex.get(date) ?? 0 })
        }
      }
    } else if (l.type === 'HOURLY') {
      const idx = dateIndex.get(l.fromDate)
      if (idx !== undefined) hourlyLeaves.push({ userId: l.userId, date: l.fromDate, dayIdx: idx, hours: l.hours || 0 })
    }
  }

  /* نگاشت NIGHT→EVENING هنگام خواندن */
  const mapped = assignments.map((a) => ({ ...a, shift: readShift(a.shift) }))

  const coverage = dates.map((date, dayIdx) => {
    const counts: Record<string, number> = { MORNING: 0, EVENING: 0, LEAVE: 0, OFF: 0 }
    for (const a of mapped) {
      if (a.date !== date) continue
      /* R11: شیفت دوگانه در پوششِ هر دو شیفت می‌شمارَد (نیروی صبح و عصر) */
      if (a.shift === 'BOTH') { counts.MORNING += 1; counts.EVENING += 1; continue }
      if (counts[a.shift] !== undefined) counts[a.shift] += 1
    }
    const issues: string[] = []
    let noCoverage = false
    let belowNeeds = false
    for (const s of ['MORNING', 'EVENING'] as const) {
      if (counts[s] === 0) {
        issues.push(`${SHIFT_LABELS[s]}: بدون نیرو`)
        noCoverage = true
      } else if (counts[s] < (NEEDS[s] ?? 0)) {
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
    users: activeUsers.map((u) => ({ id: u.id, fullName: u.fullName, honorific: u.honorific, role: u.role, title: u.title, defaultShift: u.defaultShift ?? null })),
    assignments: mapped.map((a) => ({
      id: a.id,
      userId: a.userId,
      date: a.date,
      dayIdx: dateIndex.get(a.date) ?? 0,
      shift: a.shift,
      shiftType: a.shift,
      note: null,
    })),
    leaves: weekLeaves.map((l) => ({
      id: l.id,
      userId: l.userId,
      type: l.type,
      fromDate: l.fromDate,
      toDate: l.toDate,
      days: l.days,
      hours: l.hours || 0,
    })),
    lockedDays,
    hourlyLeaves,
    coverage,
    needs: NEEDS,
  })
}

/** POST /api/hr/shifts {weekStart, dayIdx, userId, shiftType, note?} → upsert یک شیفت (سازگار با قبل) */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canShifts(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const body = await req.json().catch(() => null)
  const weekStart = typeof body?.weekStart === 'string' && DATE_RE.test(body.weekStart) ? body.weekStart : ''
  const userId = typeof body?.userId === 'string' ? body.userId : ''
  const dayIdx = Number(body?.dayIdx)
  const shiftType = String(body?.shiftType || body?.shift || '')

  if (!weekStart) return fail('هفته نامعتبر است')
  if (!userId) return fail('کاربر را انتخاب کنید')
  if (!Number.isInteger(dayIdx) || dayIdx < 0 || dayIdx > 6) return fail('روز هفته نامعتبر است')
  if (shiftType === 'NIGHT') return fail('شیفت شب در هایپر زیتون وجود ندارد — صبح، عصر، صبح و عصر، مرخصی یا تعطیل انتخاب کنید')
  if (!WRITE_SHIFTS.includes(shiftType as (typeof WRITE_SHIFTS)[number])) return fail('نوع شیفت نامعتبر است')

  const target = await db.user.findUnique({ where: { id: userId } })
  if (!target) return fail('کاربر یافت نشد', 404)

  const date = addDaysJalaliDash(weekStart, dayIdx)
  if (await isLeaveLocked(userId, date)) {
    return fail('این روز مرخصی تأییدشده است و شیفت آن قابل تغییر نیست', 409)
  }

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

/**
 * PUT /api/hr/shifts {weekStart?, rows?:[{userId, dayIdx, shift}], defaults?:[{userId, shift}]}
 *  • rows: ذخیرهٔ گروهی هفته — shift ∈ '' | MORNING | EVENING | BOTH | LEAVE | OFF
 *    (مقدار «''» یعنی پاک‌کردن شیفت آن روز؛ weekStart به شنبهٔ همان هفته تراز می‌شود؛
 *    روزهای مرخصیِ تأییدشدهٔ تمام‌روز رد می‌شوند)
 *  • defaults (R17): تعیین شیفت پیش‌فرض هر پرسنل — 'MORNING'|'EVENING'|'BOTH'|'' (حذف).
 *    هر کدام مستقل کار می‌کند؛ اگر فقط defaults باشد rows لازم نیست.
 */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canShifts(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const body = await req.json().catch(() => null)
  const weekStartParam = typeof body?.weekStart === 'string' && DATE_RE.test(body.weekStart) ? body.weekStart : ''
  const rawRows = Array.isArray(body?.rows) ? body.rows.slice(0, 400) : []
  const rawDefaults = Array.isArray(body?.defaults) ? body.defaults.slice(0, 100) : []
  if (!rawRows.length && !rawDefaults.length) return fail('ردیفی برای ذخیره وجود ندارد')

  /* ── R17: شیفت پیش‌فرض پرسنل ── */
  let defaultsSaved = 0
  const DEFAULT_SHIFTS = ['MORNING', 'EVENING', 'BOTH']
  for (const d of rawDefaults) {
    const userId = typeof d?.userId === 'string' ? d.userId : ''
    const shift = String(d?.shift ?? '')
    if (!userId) continue
    if (shift !== '' && !DEFAULT_SHIFTS.includes(shift)) continue
    const target = await db.user.findUnique({ where: { id: userId } })
    if (!target || !target.active) continue
    await db.user.update({ where: { id: userId }, data: { defaultShift: shift === '' ? null : shift } })
    defaultsSaved++
  }
  if (defaultsSaved > 0 && !rawRows.length) {
    await logActivity({
      userId: user.id,
      userName: user.fullName,
      action: 'shift.defaults',
      actionLabel: 'شیفت',
      category: 'shift',
      detail: `شیفت پیش‌فرض ${defaultsSaved} نفر به‌روزرسانی شد`,
    })
    return ok({ saved: 0, cleared: 0, skipped: [], defaultsSaved })
  }

  if (!weekStartParam) return fail('هفته نامعتبر است')
  const { weekStart, dates } = weekDates(weekStartParam)

  let saved = 0
  let cleared = 0
  const skipped: { userId: string; dayIdx: number; date: string }[] = []
  const detailParts: string[] = []

  for (const r of rawRows) {
    const userId = typeof r?.userId === 'string' ? r.userId : ''
    const dayIdx = Number(r?.dayIdx)
    const shift = String(r?.shift ?? '')
    if (!userId || !Number.isInteger(dayIdx) || dayIdx < 0 || dayIdx > 6) continue
    if (shift !== '' && !WRITE_SHIFTS.includes(shift as (typeof WRITE_SHIFTS)[number])) continue
    const date = dates[dayIdx]
    if (!date) continue

    if (await isLeaveLocked(userId, date)) {
      skipped.push({ userId, dayIdx, date })
      continue
    }

    if (shift === '') {
      try {
        await db.shiftAssignment.delete({ where: { userId_date: { userId, date } } })
        cleared += 1
      } catch {
        /* سطر وجود نداشت — بی‌خیال */
      }
      continue
    }

    const target = await db.user.findUnique({ where: { id: userId } })
    if (!target || !target.active) continue
    await db.shiftAssignment.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, shift },
      update: { shift },
    })
    saved += 1
    if (detailParts.length < 3) detailParts.push(`${target.fullName}: ${SHIFT_LABELS[shift] ?? shift} ${date}`)
  }

  if (saved + cleared > 0) {
    await logActivity({
      userId: user.id,
      userName: user.fullName,
      action: 'shift.batch',
      actionLabel: 'شیفت',
      category: 'shift',
      detail: `هفتهٔ ${weekStart} — ${saved} ذخیره، ${cleared} پاک${skipped.length ? `، ${skipped.length} رد (مرخصی تأییدشده)` : ''}${detailParts.length ? ` — ${detailParts.join(' / ')}` : ''}`,
    })
  }

  return ok({ saved, cleared, skipped, defaultsSaved })
}

/** DELETE /api/hr/shifts?id= */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canShifts(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const id = req.nextUrl.searchParams.get('id') || ''
  const assignment = await db.shiftAssignment.findUnique({ where: { id } })
  if (!assignment) return fail('شیفت یافت نشد', 404)

  if (await isLeaveLocked(assignment.userId, assignment.date)) {
    return fail('این روز مرخصی تأییدشده است و شیفت آن قابل تغییر نیست', 409)
  }

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
