import { db } from '@/lib/db'

/**
 * HR attendance → payroll wiring (R5-C)
 * ─────────────────────────────────────
 * بررسی تیم (StaffCheck) + مرخصی‌های تأییدشده (LeaveRequest) → ورودی‌های سیستم حقوق:
 *
 *  ۱) PayrollRecord (userId, year, month — unique):
 *       overtimeMinutes = مجموع دقیقه‌های اضافه‌کار ثبت‌شده در بررسی تیم همان ماه
 *       absenceDays     = تعداد غیبت‌ها + تأخیرهای «بدون اجازه مدیر»
 *                        (قانون مالک: تأخیر بدون اجازه = غیبت)
 *     ⚠ فقط همین دو فیلد ورودی upsert می‌شود؛ adjustment و savedJson
 *        (محاسبات ذخیره‌شدهٔ حسابدار) هرگز لمس نمی‌شوند.
 *
 *  ۲) Setting KV «hr:attendance-summary:YYYY-MM» — تفکیک کامل برای UI حقوق:
 *     { [userId]: {
 *         overtimeMinutes, absenceDays, absentCount,
 *         lateNoPermissionCount, lateNoPermissionMinutes,
 *         lateWithPermissionCount, lateWithPermissionMinutes,
 *         hourlyLeaveMinutes, permittedLeaveCount, checkedDays,
 *         approvedLeaveDays: { DAILY, SICK, UNPAID }, approvedHourlyHours
 *     } }
 *     (بازتولید کامل از داده‌های مبنا — idempotent؛ هر بار ثبت بررسی تیم /
 *      تأیید مرخصی برای ماهِ مربوط صدا زده می‌شود)
 */

export interface AttendanceMonthUserSummary {
  overtimeMinutes: number
  absenceDays: number
  absentCount: number
  lateNoPermissionCount: number
  lateNoPermissionMinutes: number
  lateWithPermissionCount: number
  lateWithPermissionMinutes: number
  hourlyLeaveMinutes: number
  permittedLeaveCount: number
  checkedDays: number
  approvedLeaveDays: { DAILY: number; SICK: number; UNPAID: number }
  approvedHourlyHours: number
}

export interface AttendanceMonthSummary {
  periodKey: string
  generatedAt: string
  users: Record<string, AttendanceMonthUserSummary>
}

export function monthOfDashDate(date: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(String(date || ''))
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (year < 1300 || year > 1500 || month < 1 || month > 12) return null
  return { year, month }
}

export function attendanceSummaryKey(year: number, month: number): string {
  return `hr:attendance-summary:${year}-${String(month).padStart(2, '0')}`
}

/** جمع‌بندی ماه از StaffCheck + مرخصی‌های تأییدشدهٔ همان ماه (بازتولید کامل) */
export async function aggregateMonthAttendance(year: number, month: number): Promise<AttendanceMonthSummary> {
  const mm = String(month).padStart(2, '0')
  const from = `${year}-${mm}-01`
  const to = `${year}-${mm}-31`
  const [checks, leaves] = await Promise.all([
    db.staffCheck.findMany({ where: { date: { gte: from, lte: to } } }),
    db.leaveRequest.findMany({ where: { status: 'APPROVED', fromDate: { lte: to }, toDate: { gte: from } } }),
  ])

  const users: Record<string, AttendanceMonthUserSummary> = {}
  const ensure = (userId: string): AttendanceMonthUserSummary => {
    if (!users[userId]) {
      users[userId] = {
        overtimeMinutes: 0,
        absenceDays: 0,
        absentCount: 0,
        lateNoPermissionCount: 0,
        lateNoPermissionMinutes: 0,
        lateWithPermissionCount: 0,
        lateWithPermissionMinutes: 0,
        hourlyLeaveMinutes: 0,
        permittedLeaveCount: 0,
        checkedDays: 0,
        approvedLeaveDays: { DAILY: 0, SICK: 0, UNPAID: 0 },
        approvedHourlyHours: 0,
      }
    }
    return users[userId]
  }

  for (const c of checks) {
    const s = ensure(c.staffId)
    s.checkedDays += 1
    s.overtimeMinutes += Math.max(0, c.overtimeMinutes || 0)
    s.hourlyLeaveMinutes += Math.max(0, c.hourlyLeaveMinutes || 0)
    if (c.arrival === 'absent') {
      s.absentCount += 1
    } else if (c.arrival === 'late') {
      if (c.hadPermission) {
        s.lateWithPermissionCount += 1
        s.lateWithPermissionMinutes += Math.max(0, c.lateMinutes || 0)
      } else {
        s.lateNoPermissionCount += 1
        s.lateNoPermissionMinutes += Math.max(0, c.lateMinutes || 0)
      }
    } else if (c.arrival === 'permitted_leave') {
      s.permittedLeaveCount += 1
    }
  }

  for (const l of leaves) {
    const s = ensure(l.userId)
    if (l.type === 'HOURLY') {
      // مرخصی ساعتی تأییدشده — فقط اگر در همین ماه شروع شده باشد
      if (l.fromDate >= from && l.fromDate <= to) s.approvedHourlyHours += Math.max(0, l.hours || 0)
    } else if (l.type === 'DAILY' || l.type === 'SICK' || l.type === 'UNPAID') {
      // تعداد روزهای تقویمیِ مشترک بازهٔ مرخصی با ماه
      const start = l.fromDate > from ? l.fromDate : from
      const end = l.toDate < to ? l.toDate : to
      const days = Math.max(0, dayDiff(start, end) + 1)
      s.approvedLeaveDays[l.type] += days
    }
  }

  for (const userId of Object.keys(users)) {
    const s = users[userId]
    // قانون مالک: تأخیر بدون اجازهٔ مدیر = غیبت
    s.absenceDays = s.absentCount + s.lateNoPermissionCount
  }

  return { periodKey: `${year}-${mm}`, generatedAt: new Date().toISOString(), users }
}

function dayDiff(fromDash: string, toDash: string): number {
  const a = fromDash.split('-').map(Number)
  const b = toDash.split('-').map(Number)
  const jd = (p: number[]) => p[0] * 366 + Math.min(6, p[1]) * 31 + Math.max(0, p[1] - 6) * 30 + p[2]
  return jd(b) - jd(a)
}

/**
 * همگام‌سازی ورودی‌های حقوق از داده‌های حضور:
 *  - PayrollRecord.overtimeMinutes / absenceDays (بدون لمس adjustment و savedJson)
 *  - Setting KV با تفکیک کامل (برای پیش‌پرکردن UI حقوق)
 * فقط برای کاربرانی که یا رکورد حقوق دارند یا مقدار غیرصفر دارند رکورد ساخته می‌شود.
 */
export async function syncPayrollInputs(year: number, month: number): Promise<{ users: number }> {
  const summary = await aggregateMonthAttendance(year, month)
  const userIds = Object.keys(summary.users)

  let touched = 0
  for (const userId of userIds) {
    const s = summary.users[userId]
    const hasValue = s.overtimeMinutes > 0 || s.absenceDays > 0
    const existing = await db.payrollRecord.findUnique({
      where: { userId_year_month: { userId, year, month } },
      select: { id: true },
    })
    if (!existing && !hasValue) continue
    await db.payrollRecord.upsert({
      where: { userId_year_month: { userId, year, month } },
      create: {
        userId,
        year,
        month,
        overtimeMinutes: s.overtimeMinutes,
        absenceDays: s.absenceDays,
        adjustment: 0,
        savedJson: '{}',
      },
      // فقط ورودی‌های حاضری — adjustment و savedJson دست‌نخورده
      update: { overtimeMinutes: s.overtimeMinutes, absenceDays: s.absenceDays },
    })
    touched += 1
  }

  await db.setting.upsert({
    where: { key: attendanceSummaryKey(year, month) },
    create: { key: attendanceSummaryKey(year, month), value: JSON.stringify(summary) },
    update: { value: JSON.stringify(summary) },
  })

  return { users: touched }
}

/** همهٔ ماه‌های درگیر یک بازهٔ جلالی (fromDash..toDash) — برای همگام‌سازی پس از تأیید مرخصی */
export function monthsBetween(fromDash: string, toDash: string): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = []
  const a = monthOfDashDate(fromDash)
  const b = monthOfDashDate(toDash)
  if (!a || !b) return out
  let { year, month } = a
  while (year < b.year || (year === b.year && month <= b.month)) {
    out.push({ year, month })
    month += 1
    if (month > 12) { month = 1; year += 1 }
    if (out.length > 24) break // محافظ
  }
  return out
}
