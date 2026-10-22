import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, clampInt } from '@/lib/api'
import { getSessionUser, MANAGER_ROLES } from '@/lib/auth'
import { displayName, notify } from '@/lib/notify'
import { assertPageAccess } from '@/lib/access'
import { todayJalaliDash } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SHIFTS = ['MORNING', 'EVENING']
const ARRIVALS = ['on_time', 'late', 'absent', 'permitted_leave']
const FLAGS = ['ok', 'needs_followup']

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
 * GET /api/staff-checks?date=1405-07-27&shift=MORNING|EVENING — managers only.
 * → {checks, staff (active non-manager staff), unresolvedMorning}
 */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  const gate = await assertPageAccess(me, 'tasks/attendance')
  if (!gate.ok) return fail(gate.deny, 403)

  const sp = req.nextUrl.searchParams
  const date = sp.get('date') || todayJalaliDash()
  if (!DATE_RE.test(date)) return fail('تاریخ را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')
  const shift = sp.get('shift') || ''
  if (shift && !SHIFTS.includes(shift)) return fail('شیفت نامعتبر است')

  const [checks, staff, problems] = await Promise.all([
    db.staffCheck.findMany({
      where: shift ? { date, shift } : { date },
      orderBy: [{ staffName: 'asc' }],
    }),
    db.user.findMany({
      where: { active: true, role: { notIn: MANAGER_ROLES } },
      orderBy: { createdAt: 'asc' },
    }),
    db.problem.findMany({
      where: { date, shift: 'MORNING', status: { not: 'RESOLVED' } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return ok({
    date,
    shift: shift || null,
    checks,
    staff: staff.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      honorific: u.honorific,
      role: u.role,
      title: u.title,
    })),
    unresolvedMorning: problems.map(problemOut),
  })
}

/**
 * POST /api/staff-checks
 *  a) bulk upsert: {date, shift, rows:[{staffId, arrival, lateMinutes, hourlyLeaveMinutes,
 *     overtimeMinutes, hadPermission, uniform, hygiene, behavior, workQuality, note?}]} → {saved:n}
 *     (present is derived: arrival!=='absent'; minutes clamped 0..600)   (managers only)
 *  b) escalate: {action:'escalate', date} → one notification per unresolved morning problem
 *     to the evening manager (deduped) → {escalated:n}
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

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'staffcheck.save',
    actionLabel: 'کنترل شیفت',
    category: 'hr',
    detail: `${date} — ${shift === 'MORNING' ? 'شیفت صبح' : 'شیفت عصر'} — ${saved} نفر`,
  })

  return ok({ saved })
}
