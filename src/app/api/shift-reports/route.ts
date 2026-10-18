import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { displayName, notify } from '@/lib/notify'
import { todayJalaliDash } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

const TYPES = ['HANDOVER', 'WEEKLY', 'MONTHLY_EVAL']

const TYPE_LABELS: Record<string, string> = {
  HANDOVER: 'گزارش تحویل شیفت',
  WEEKLY: 'گزارش هفتگی',
  MONTHLY_EVAL: 'ارزیابی ماهانه',
}

/** GET /api/shift-reports?type=HANDOVER|WEEKLY|MONTHLY_EVAL */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const type = req.nextUrl.searchParams.get('type') || 'HANDOVER'
  if (!TYPES.includes(type)) return fail('نوع گزارش نامعتبر است')

  const reports = await db.shiftReport.findMany({
    where: { type },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const userIds = [...new Set(reports.map((r) => r.userId))]
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } } }) : []
  const userMap = new Map(users.map((u) => [u.id, u]))

  return ok({
    reports: reports.map((r) => {
      const u = userMap.get(r.userId)
      return {
        id: r.id,
        userId: r.userId,
        date: r.date,
        type: r.type,
        dataJson: r.dataJson,
        note: r.note,
        createdAt: r.createdAt,
        user: u
          ? { fullName: u.fullName, honorific: u.honorific, role: u.role, title: u.title }
          : { fullName: '—', honorific: '', role: '', title: '' },
      }
    }),
  })
}

/** POST /api/shift-reports {type, date, data:{...}, note?} */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => ({}))) as {
    type?: string
    date?: string
    data?: Record<string, unknown>
    note?: string
  }

  const type = String(body.type || 'HANDOVER')
  if (!TYPES.includes(type)) return fail('نوع گزارش نامعتبر است')

  const data = body.data && typeof body.data === 'object' ? body.data : {}
  const report = await db.shiftReport.create({
    data: {
      userId: me.id,
      date: body.date?.trim() || todayJalaliDash(),
      type,
      dataJson: JSON.stringify(data),
      note: body.note ? String(body.note).trim() : null,
    },
  })

  const myName = displayName(me)
  const titles: Record<string, { title: string; body: string }> = {
    HANDOVER: {
      title: 'گزارش تحویل شیفت جدید',
      body: `${myName} گزارش پایان شیفت ثبت کرد`,
    },
    WEEKLY: { title: 'گزارش هفتگی جدید', body: `${myName} گزارش هفتگی ثبت کرد` },
    MONTHLY_EVAL: {
      title: 'ارزیابی ماهانه جدید',
      body: `${myName} ارزیابی ماهانه مدیر شیفت عصر ثبت کرد`,
    },
  }
  const t = titles[type]

  await notify({
    role: 'ADMIN',
    kind: 'shift_report',
    severity: 'info',
    title: t.title,
    body: t.body,
    go: '#/tasks/reports',
  })

  await logActivity({
    userId: me.id,
    userName: myName,
    action: 'shift_report',
    actionLabel: TYPE_LABELS[type],
    category: 'shift_reports',
    detail: `${TYPE_LABELS[type]} — ${report.date}`,
    entityId: report.id,
  })

  return ok({ report: { id: report.id } })
}
