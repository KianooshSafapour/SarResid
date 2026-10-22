import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { displayName, notify } from '@/lib/notify'
import { todayJalaliDash, addDaysJalaliDash, jalaliToDate, parseJalaliDash } from '@/lib/jalali'
import { getLowStockSettings, computeThreshold, analyzableWhere } from '@/lib/lowstock'

export const dynamic = 'force-dynamic'

const TYPES = ['HANDOVER', 'WEEKLY', 'MONTHLY_EVAL']
const SHIFTS = ['MORNING', 'EVENING']

const TYPE_LABELS: Record<string, string> = {
  HANDOVER: 'گزارش تحویل شیفت',
  WEEKLY: 'گزارش هفتگی',
  MONTHLY_EVAL: 'ارزیابی ماهانه',
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** [start, end) UTC range covering one Jalali day (Tehran, UTC+3:30) — same rule as /api/home */
function jalaliDayRange(day: string): [Date, Date] {
  const { jy, jm, jd } = parseJalaliDash(day)
  const noon = jalaliToDate(jy, jm, jd)
  const start = new Date(noon.getTime() - 15.5 * 3600000)
  return [start, new Date(start.getTime() + 24 * 3600000)]
}

type ReportRow = {
  id: string
  userId: string
  date: string
  type: string
  shift: string
  dataJson: string
  note: string | null
  acknowledgedById: string | null
  acknowledgedAt: Date | null
  createdAt: Date
}

interface UserLite {
  fullName: string
  honorific: string
  role: string
  title: string
}

async function userLiteMap(ids: string[]): Promise<Map<string, UserLite>> {
  const clean = [...new Set(ids.filter(Boolean))]
  if (!clean.length) return new Map()
  const users = await db.user.findMany({ where: { id: { in: clean } } })
  return new Map(
    users.map((u) => [u.id, { fullName: u.fullName, honorific: u.honorific, role: u.role, title: u.title }]),
  )
}

/** full handover serialization — data parsed + raw dataJson kept for legacy renders */
function reportOut(r: ReportRow, users: Map<string, UserLite>) {
  const u = users.get(r.userId)
  const ackBy = r.acknowledgedById ? users.get(r.acknowledgedById) : undefined
  return {
    id: r.id,
    userId: r.userId,
    date: r.date,
    shift: r.shift,
    type: r.type,
    data: safeJson<Record<string, unknown>>(r.dataJson, {}),
    dataJson: r.dataJson,
    note: r.note,
    acknowledged: !!r.acknowledgedAt,
    acknowledgedById: r.acknowledgedById,
    acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
    acknowledgedBy: ackBy ? ackBy.fullName : null,
    createdAt: r.createdAt.toISOString(),
    user: u ?? { fullName: '—', honorific: '', role: '', title: '' },
  }
}

interface HandoverMetrics {
  returnsToday: number
  returnsPending: number
  lowStockCount: number
  ordersWaiting: number
  chequesThisWeek: number
  tasksOpen: number
  tasksOverdue: number
  problemsOpen: number
  morningChecksFlagged: number
}

/** live handover metrics for a Jalali date (SPEC-R3 2.3) */
async function computeMetrics(date: string): Promise<HandoverMetrics> {
  const [dayStart, dayEnd] = jalaliDayRange(date)
  const weekEnd = addDaysJalaliDash(date, 7)

  const settings = await getLowStockSettings()
  const [todayReturns, returnsPending, lowCandidates, ordersWaiting, chequesThisWeek, tasksOpen, tasksOverdue, problemsOpen, morningFlags] =
    await Promise.all([
      db.returnRequest.findMany({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
        select: { id: true },
      }),
      db.returnRequest.count({ where: { status: { in: ['draft', 'pending'] } } }),
      db.product.findMany({
        where: analyzableWhere(settings),
        select: { stock: true, lowStockThreshold: true, reorderLevel: true, monthlySold: true, leadTimeDays: true },
      }),
      db.order.count({ where: { status: 'SUBMITTED' } }),
      db.cheque.count({
        where: {
          dueDate: { gte: date, lte: weekEnd },
          status: { notIn: ['DONE', 'REJECTED', 'CLEARED', 'BOUNCED'] },
        },
      }),
      db.taskOrder.count({ where: { status: { in: ['assigned', 'in_progress', 'blocked'] } } }),
      db.taskOrder.count({
        where: { status: { in: ['assigned', 'in_progress', 'blocked'] }, dueDate: { lt: date } },
      }),
      db.problem.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      db.staffCheck.count({
        where: {
          date,
          shift: 'MORNING',
          OR: [
            { uniform: 'needs_followup' },
            { hygiene: 'needs_followup' },
            { behavior: 'needs_followup' },
            { workQuality: 'needs_followup' },
          ],
        },
      }),
    ])

  const returnsToday = todayReturns.length
    ? await db.returnItem.count({ where: { returnId: { in: todayReturns.map((r) => r.id) } } })
    : 0
  const lowStockCount = lowCandidates.filter((p) => {
    const t = computeThreshold(p, settings)
    return t !== null && p.stock <= t
  }).length

  return {
    returnsToday,
    returnsPending,
    lowStockCount,
    ordersWaiting,
    chequesThisWeek,
    tasksOpen,
    tasksOverdue,
    problemsOpen,
    morningChecksFlagged: morningFlags,
  }
}

/**
 * GET /api/shift-reports — three modes:
 *  1) ?date=1405-07-28&shift=EVENING → { report, previous, metrics, history:[last 20] }
 *  2) ?list=1&from=&to= → { items:[...] }
 *  3) ?type=HANDOVER (legacy) → { reports:[...] } — old chunk shape, kept until F8 lands
 */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const sp = req.nextUrl.searchParams

  // ---- mode 2: list ----
  if (sp.get('list') === '1') {
    const from = sp.get('from') || ''
    const to = sp.get('to') || ''
    const type = sp.get('type') || ''
    const where: Record<string, unknown> = {}
    if (DATE_RE.test(from) && DATE_RE.test(to)) where.date = { gte: from, lte: to }
    else if (DATE_RE.test(from)) where.date = { gte: from }
    else if (DATE_RE.test(to)) where.date = { lte: to }
    if (type && TYPES.includes(type)) where.type = type

    const rows = (await db.shiftReport.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    })) as unknown as ReportRow[]

    const users = await userLiteMap(rows.flatMap((r) => [r.userId, r.acknowledgedById ?? '']))
    return ok({ items: rows.map((r) => reportOut(r, users)) })
  }

  const dateParam = sp.get('date') || ''

  // ---- mode 1: today/shift board ----
  if (DATE_RE.test(dateParam)) {
    const date = dateParam
    const shift = (sp.get('shift') || 'MORNING').toUpperCase()
    if (!SHIFTS.includes(shift)) return fail('شیفت نامعتبر است')

    const [report, metrics, historyRows] = await Promise.all([
      db.shiftReport.findFirst({
        where: { date, shift, type: 'HANDOVER' },
        orderBy: { createdAt: 'desc' },
      }),
      computeMetrics(date),
      db.shiftReport.findMany({
        where: { type: 'HANDOVER' },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 20,
      }),
    ])

    const dayEnd = jalaliDayRange(date)[1]
    const previous = await db.shiftReport.findFirst({
      where: {
        type: 'HANDOVER',
        ...(report
          ? { createdAt: { lt: report.createdAt }, id: { not: report.id } }
          : { createdAt: { lt: dayEnd } }),
      },
      orderBy: { createdAt: 'desc' },
    })

    const rows = [report, previous, ...historyRows].filter((r): r is NonNullable<typeof r> => !!r)
    const users = await userLiteMap(rows.flatMap((r) => [r.userId, r.acknowledgedById ?? '']))

    return ok({
      date,
      shift,
      report: report ? reportOut(report as unknown as ReportRow, users) : null,
      previous: previous ? reportOut(previous as unknown as ReportRow, users) : null,
      metrics,
      history: historyRows.map((r) => reportOut(r as unknown as ReportRow, users)),
    })
  }

  // ---- mode 3: legacy list (original chunk tasks/reports) ----
  const type = sp.get('type') || 'HANDOVER'
  if (!TYPES.includes(type)) return fail('نوع گزارش نامعتبر است')

  const reports = (await db.shiftReport.findMany({
    where: { type },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })) as unknown as ReportRow[]

  const users = await userLiteMap(reports.flatMap((r) => [r.userId, r.acknowledgedById ?? '']))
  return ok({ reports: reports.map((r) => reportOut(r, users)) })
}

/**
 * POST /api/shift-reports {date, shift, data:{...}, note?} — ثبت گزارش تحویل شیفت
 * (legacy {type, date, data} still accepted: WEEKLY / MONTHLY_EVAL notepad reports)
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => ({}))) as {
    type?: string
    date?: string
    shift?: string
    data?: Record<string, unknown>
    note?: string
  }

  const type = String(body.type || 'HANDOVER')
  if (!TYPES.includes(type)) return fail('نوع گزارش نامعتبر است')

  const date = String(body.date || todayJalaliDash()).trim()
  if (!DATE_RE.test(date)) return fail('تاریخ را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')

  const shift = String(body.shift || 'MORNING').toUpperCase()
  if (!SHIFTS.includes(shift)) return fail('شیفت نامعتبر است')

  const data = body.data && typeof body.data === 'object' ? body.data : {}

  // server-computed cash difference + live metrics snapshot (handover only)
  let payload: Record<string, unknown> = { ...data }
  if (type === 'HANDOVER') {
    const cashCounted = Number(data.cashCounted)
    const cashExpected = Number(data.cashExpected)
    const metrics = await computeMetrics(date)
    payload = {
      ...data,
      ...(Number.isFinite(cashCounted) && Number.isFinite(cashExpected)
        ? { cashDiff: Math.round((cashCounted - cashExpected) * 100) / 100 }
        : {}),
      metrics,
    }
  }

  const report = await db.shiftReport.create({
    data: {
      userId: me.id,
      date,
      type,
      shift,
      dataJson: JSON.stringify(payload),
      note: body.note ? String(body.note).trim() : null,
    },
  })

  const myName = displayName(me)
  const handoverTo = typeof data.handoverTo === 'string' ? data.handoverTo : ''

  // notify the receiving manager (and keep the manager bell informed as before)
  if (handoverTo) {
    await notify({
      userId: handoverTo,
      kind: 'handover',
      severity: 'important',
      title: 'گزارش تحویل شیفت برای شما ثبت شد',
      body: `${myName} گزارش پایان شیفت ${date} را ثبت کرد — آن را بررسی و دریافت کنید`,
      go: '#/tasks/reports',
    })
  }
  if (type === 'HANDOVER') {
    await notify({
      role: 'ADMIN',
      kind: 'shift_report',
      severity: 'info',
      title: 'گزارش تحویل شیفت جدید',
      body: `${myName} گزارش پایان شیفت ثبت کرد`,
      go: '#/tasks/reports',
    })
  } else {
    await notify({
      role: 'ADMIN',
      kind: 'shift_report',
      severity: 'info',
      title: type === 'WEEKLY' ? 'گزارش هفتگی جدید' : 'ارزیابی ماهانه جدید',
      body: `${myName} ${type === 'WEEKLY' ? 'گزارش هفتگی' : 'ارزیابی ماهانه مدیر شیفت عصر'} ثبت کرد`,
      go: '#/tasks/reports',
    })
  }

  await logActivity({
    userId: me.id,
    userName: myName,
    action: 'shift_report',
    actionLabel: TYPE_LABELS[type],
    category: 'shift_reports',
    detail: `${TYPE_LABELS[type]} — ${date} (${shift === 'EVENING' ? 'عصر' : 'صبح'})`,
    entityId: report.id,
  })

  return ok({ report: { id: report.id, date: report.date, shift: report.shift, type: report.type } })
}
