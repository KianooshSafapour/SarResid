import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, clampInt } from '@/lib/api'
import { getSessionUser, MANAGER_ROLES } from '@/lib/auth'
import { displayName, notify } from '@/lib/notify'
import { assertPageAccess } from '@/lib/access'
import { todayJalaliDash } from '@/lib/jalali'
import { aggregateMonthAttendance, monthOfDashDate, syncPayrollInputs } from '@/lib/hr-attendance'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SHIFTS = ['MORNING', 'EVENING']
const ARRIVALS = ['on_time', 'late', 'absent', 'permitted_leave']
// R7-PERF: پرچم‌های روزانه سه‌سطحی شدند — مناسب / نقص جزئی / نیازمند پیگیری (پژوهش R7 بخش ۶.۱)
const FLAGS = ['ok', 'minor', 'needs_followup']

/** The evening manager receiving morning-problem escalations */
async function eveningManager() {
  const mollaie = await db.user.findFirst({ where: { role: 'EXEC', username: 'mollaie' } })
  if (mollaie) return mollaie
  return db.user.findFirst({ where: { role: 'EXEC', active: true } })
}

/** open (unresolved) morning problems of a date → public shape */
function problemOut(p: {
  id: string
  date: string
  problem: string
  action: string | null
  responsible: string | null
  status: string
  shift: string
  time: string | null
  escalated: boolean
  createdAt: Date
}) {
  const bits = [
    p.responsible ? `مسئول: ${p.responsible}` : '',
    p.time ? `زمان وقوع: ${p.time}` : '',
    p.action ? `اقدام: ${p.action}` : '',
  ].filter(Boolean)
  return {
    id: p.id,
    date: p.date,
    title: p.problem.length > 90 ? `${p.problem.slice(0, 90)}…` : p.problem,
    detail: bits.length ? bits.join(' — ') : null,
    severity: p.status === 'OPEN' ? 'important' : 'warning',
    status: p.status,
    shift: p.shift,
    escalated: p.escalated,
    createdAt: p.createdAt,
  }
}

/**
 * GET /api/staff-checks — managers only (tasks/attendance):
 *  1) ?date=1405-07-27&shift=MORNING|EVENING → {checks, staff, onLeave, unresolvedMorning}
 *     staff = همهٔ کاربران فعال، از جمله خودِ بررسی‌کننده (R5-P2: «همه از جمله من»)
 *     هر نفر shift همان روز را از ShiftAssignment می‌آورد (صبح/عصر — برای فیلتر بررسی تیم)
 *     onLeave = مرخصی‌های تأییدشدهٔ همان روز {userId:{type,hours,days}}
 *  2) ?staff=<userId> → {items} سوابق کنترل یک پرسنل (پرونده پرسنل — تب سوابق)
 *  3) ?summary=1405-07 → {summary} جمع‌بندی ماه برای سیستم حقوق
 */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  const gate = await assertPageAccess(me, 'tasks/attendance')
  if (!gate.ok) return fail(gate.deny, 403)

  const sp = req.nextUrl.searchParams

  // ---- branch 3: month summary (برای سیستم حقوق) ----
  const summaryPeriod = sp.get('summary') || ''
  if (summaryPeriod) {
    const pm = monthOfDashDate(`${summaryPeriod}-01`)
    if (!pm) return fail('دوره را به شکل ۱۴۰۵-۰۷ وارد کنید')
    return ok(await aggregateMonthAttendance(pm.year, pm.month))
  }

  // ---- branch 2: one staff member's history (پرونده پرسنل) ----
  const staffParam = sp.get('staff') || ''
  if (staffParam) {
    const rows = await db.staffCheck.findMany({
      where: { staffId: staffParam },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 40,
    })
    return ok({ items: rows })
  }

  const date = sp.get('date') || todayJalaliDash()
  if (!DATE_RE.test(date)) return fail('تاریخ را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')
  const shift = sp.get('shift') || ''
  if (shift && !SHIFTS.includes(shift)) return fail('شیفت نامعتبر است')

  const [checks, staff, problems, dayLeaves, dayAssignments] = await Promise.all([
    db.staffCheck.findMany({
      where: shift ? { date, shift } : { date },
      orderBy: [{ staffName: 'asc' }],
    }),
    // R5-P2: همهٔ کاربران فعال — خودِ بررسی‌کننده هم بررسی می‌شود (درخواست مالک:
    // «همهٔ پرسنل از جمله من» + «برخی صبح و برخی عصر کار می‌کنند»)
    db.user.findMany({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.problem.findMany({
      where: { date, shift: 'MORNING', status: { not: 'RESOLVED' } },
      orderBy: { createdAt: 'desc' },
    }),
    // مرخصی‌های تأییدشدهٔ پوشش‌دهندهٔ همین روز (R5-C)
    db.leaveRequest.findMany({
      where: { status: 'APPROVED', fromDate: { lte: date }, toDate: { gte: date } },
    }),
    // شیفت تعیین‌شدهٔ هر نفر در همین روز (برنامهٔ شیفت هفتگی) — صبح/عصر
    db.shiftAssignment.findMany({ where: { date } }),
  ])

  // پرسنل عادی اول، مدیران آخر — مرور روزانه راحت‌تر
  const rank = (role: string) => (MANAGER_ROLES.includes(role) ? 1 : 0)
  const sortedStaff = [...staff].sort((a, b) => rank(a.role) - rank(b.role))
  // شیفت همان روز: دادهٔ قدیمی NIGHT → EVENING (شیفت شب وجود ندارد)
  const shiftOfDay = new Map<string, string>()
  for (const a of dayAssignments) {
    shiftOfDay.set(a.userId, a.shift === 'NIGHT' ? 'EVENING' : a.shift)
  }

  const onLeave: Record<string, { type: string; hours: number; days: number }> = {}
  for (const l of dayLeaves) {
    if (l.type === 'HOURLY') {
      // مجموع ساعت‌های مرخصی ساعتی تأییدشدهٔ همان روز
      if (onLeave[l.userId]) onLeave[l.userId].hours += Math.max(0, l.hours || 0)
      else onLeave[l.userId] = { type: l.type, hours: Math.max(0, l.hours || 0), days: 0 }
    } else if (!onLeave[l.userId]) {
      onLeave[l.userId] = { type: l.type, hours: 0, days: Math.max(1, l.days || 1) }
    }
  }

  return ok({
    date,
    shift: shift || null,
    checks,
    staff: sortedStaff.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      honorific: u.honorific,
      role: u.role,
      title: u.title,
      // شیفت تعیین‌شدهٔ همین روز از برنامهٔ شیفت هفتگی (صبح/عصر/تعطیل/مرخصی)
      dayShift: shiftOfDay.get(u.id) || null,
    })),
    onLeave,
    unresolvedMorning: problems.map(problemOut),
  })
}

/**
 * POST /api/staff-checks
 *  a) bulk upsert: {date, shift, rows:[{staffId, arrival, lateMinutes, hourlyLeaveMinutes,
 *     overtimeMinutes, hadPermission, uniform, hygiene, behavior, workQuality, note?}]} → {saved:n, payrollSynced:n}
 *     (present is derived: arrival!=='absent'; minutes clamped 0..600)   (managers only)
 *     پس از ثبت، ورودی‌های حقوق همان ماه (اضافه‌کار/غیبت) از داده‌های حضور بازتولید می‌شود.
 *  b) escalate: {action:'escalate', date} → one notification per unresolved morning problem
 *     to the evening manager (deduped) → {escalated:n}
 *  c) syncPayroll: {action:'syncPayroll', date} → بازتولید صریح و idempotent ورودی‌های حقوق
 *     همان ماه از داده‌های بررسی تیم + مرخصی‌های تأییدشده (R5-P2 «ثبت در حقوق و دستمزد»)
 *     → {payrollSynced:n, period:'1405-07'}
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  const gate = await assertPageAccess(me, 'tasks/attendance')
  if (!gate.ok) return fail(gate.deny, 403)

  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    date?: string
    shift?: string
    rows?: {
      staffId?: string
      present?: boolean
      arrival?: string
      lateMinutes?: number
      hourlyLeaveMinutes?: number
      overtimeMinutes?: number
      hadPermission?: boolean
      uniform?: string
      hygiene?: string
      behavior?: string
      workQuality?: string
      note?: string
    }[]
  }

  // ---- escalation branch ----
  if (body.action === 'escalate') {
    const date = String(body.date || todayJalaliDash())
    if (!DATE_RE.test(date)) return fail('تاریخ را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')

    // open morning problems of that date WITHOUT an evening-check link
    const open = await db.problem.findMany({
      where: { date, shift: 'MORNING', status: { not: 'RESOLVED' }, escalated: false },
      orderBy: { createdAt: 'asc' },
    })

    const target = await eveningManager()
    if (!target) return fail('مدیر شیفت عصر در سیستم یافت نشد', 404)

    let created = 0
    for (const p of open) {
      // dedupe: an existing morning-problem notification referencing this problem id
      const dup = await db.notification.findFirst({
        where: { kind: 'morning-problem', body: { contains: p.id } },
      })
      if (!dup) {
        await notify({
          userId: target.id,
          kind: 'morning-problem',
          severity: 'important',
          title: 'مشکل حل‌نشده شیفت صبح',
          body: `${p.problem}${p.responsible ? ` (مسئول: ${p.responsible})` : ''} — نیازمند توجه شما در شیفت عصر (ref:${p.id})`,
          go: '#/tasks/attendance',
        })
        created++
      }
      // mark as handed over to the evening shift (even when deduped — the link now exists)
      if (!p.escalated) {
        await db.problem.update({ where: { id: p.id }, data: { escalated: true } })
      }
    }

    if (created > 0) {
      await logActivity({
        userId: me.id,
        userName: displayName(me),
        action: 'staffcheck.escalate',
        actionLabel: 'ارجاع مشکل صبح',
        category: 'tasks',
        detail: `${created} مشکل حل‌نشده شیفت صبح ${date} → ${displayName(target)}`,
      })
    }
    return ok({ escalated: created, target: { id: target.id, name: displayName(target) } })
  }

  // ---- explicit payroll sync branch (R5-P2: «ثبت در حقوق و دستمزد») ----
  if (body.action === 'syncPayroll') {
    const date = String(body.date || todayJalaliDash())
    if (!DATE_RE.test(date)) return fail('تاریخ را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')
    const pm = monthOfDashDate(date)
    if (!pm) return fail('دوره حقوق از این تاریخ قابل استخراج نیست')
    const sync = await syncPayrollInputs(pm.year, pm.month)
    await logActivity({
      userId: me.id,
      userName: displayName(me),
      action: 'staffcheck.syncPayroll',
      actionLabel: 'ارسال به حقوق',
      category: 'hr',
      detail: `بررسی تیم ${date} → ورودی‌های حقوق ${pm.year}-${String(pm.month).padStart(2, '0')} برای ${sync.users} نفر بازتولید شد`,
    })
    return ok({ payrollSynced: sync.users, period: `${pm.year}-${String(pm.month).padStart(2, '0')}` })
  }

  if (body.action) return fail('عملیات نامعتبر است')

  // ---- bulk upsert branch ----
  const date = String(body.date || '')
  if (!DATE_RE.test(date)) return fail('تاریخ را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')
  const shift = String(body.shift || '')
  if (!SHIFTS.includes(shift)) return fail('شیفت را انتخاب کنید (صبح/عصر)')

  const rows = Array.isArray(body.rows) ? body.rows : []
  if (!rows.length) return fail('فهرست پرسنل خالی است')

  const staffIds = [...new Set(rows.map((r) => String(r.staffId || '')))]
  const staff = await db.user.findMany({ where: { id: { in: staffIds } } })
  const staffMap = new Map(staff.map((s) => [s.id, s]))

  let saved = 0
  for (const r of rows) {
    const u = staffMap.get(String(r.staffId || ''))
    if (!u || !u.active) continue
    const arrival = ARRIVALS.includes(String(r.arrival)) ? String(r.arrival) : 'on_time'
    const flag = (v: unknown) => (FLAGS.includes(String(v)) ? String(v) : 'ok')
    const data = {
      present: arrival !== 'absent', // B3: derived from arrival — body `present` ignored
      arrival,
      lateMinutes: clampInt(r.lateMinutes, 0, 600, 0),
      hourlyLeaveMinutes: clampInt(r.hourlyLeaveMinutes, 0, 600, 0),
      overtimeMinutes: clampInt(r.overtimeMinutes, 0, 600, 0),
      hadPermission: !!r.hadPermission,
      uniform: flag(r.uniform),
      hygiene: flag(r.hygiene),
      behavior: flag(r.behavior),
      workQuality: flag(r.workQuality),
      note: r.note ? String(r.note).trim().slice(0, 500) || null : null,
    }
    await db.staffCheck.upsert({
      where: { date_shift_staffId: { date, shift, staffId: u.id } },
      create: {
        date,
        shift,
        checkerId: me.id,
        checkerName: displayName(me),
        staffId: u.id,
        staffName: displayName(u),
        ...data,
      },
      update: { ...data, checkerId: me.id, checkerName: displayName(me) },
    })
    saved++
  }

  if (!saved) return fail('هیچ عضو معتبری برای ثبت یافت نشد')

  // R5-C: جریان به سیستم حقوق — ورودی‌های ماه بازتولید می‌شود (idempotent)
  let payrollSynced = 0
  const pm = monthOfDashDate(date)
  if (pm) {
    try {
      const sync = await syncPayrollInputs(pm.year, pm.month)
      payrollSynced = sync.users
    } catch {
      // همگام‌سازی حقوق هرگز جریان اصلی را نمی‌شکند
    }
  }

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'staffcheck.save',
    actionLabel: 'کنترل شیفت',
    category: 'hr',
    detail: `${date} — ${shift === 'MORNING' ? 'شیفت صبح' : 'شیفت عصر'} — ${saved} نفر`,
  })

  return ok({ saved, payrollSynced })
}
