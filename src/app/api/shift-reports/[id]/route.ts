import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { displayName, notify } from '@/lib/notify'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** GET /api/shift-reports/[id] → single report (data parsed + raw dataJson) */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const { id } = await ctx.params
  const r = await db.shiftReport.findUnique({ where: { id } })
  if (!r) return fail('گزارش یافت نشد', 404)

  const [author, ackBy] = await Promise.all([
    db.user.findUnique({ where: { id: r.userId } }),
    r.acknowledgedById ? db.user.findUnique({ where: { id: r.acknowledgedById } }) : null,
  ])

  return ok({
    report: {
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
      user: author
        ? { fullName: author.fullName, honorific: author.honorific, role: author.role, title: author.title }
        : { fullName: '—', honorific: '', role: '', title: '' },
    },
  })
}

/** PATCH /api/shift-reports/[id] {action:'ack'} — تأیید دریافت گزارش توسط شیفت بعد */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const { id } = await ctx.params
  const r = await db.shiftReport.findUnique({ where: { id } })
  if (!r) return fail('گزارش یافت نشد', 404)

  const body = (await req.json().catch(() => ({}))) as { action?: string }
  if (String(body.action || '') !== 'ack') return fail('عملیات نامعتبر است')

  if (r.acknowledgedAt) return fail('دریافت این گزارش قبلاً تأیید شده است')
  if (r.userId === me.id) return fail('گزارش خودتان را نمی‌توانید تأیید دریافت کنید')

  const now = new Date()
  await db.shiftReport.update({
    where: { id },
    data: { acknowledgedById: me.id, acknowledgedAt: now },
  })

  const myName = displayName(me)
  await notify({
    userId: r.userId,
    kind: 'handover',
    severity: 'info',
    title: 'گزارش تحویل شما دریافت شد',
    body: `${myName} گزارش شیفت ${r.date} را دریافت و تأیید کرد`,
    go: '#/tasks/reports',
  })

  await logActivity({
    userId: me.id,
    userName: myName,
    action: 'shift_report.ack',
    actionLabel: 'تأیید دریافت گزارش شیفت',
    category: 'shift_reports',
    detail: `گزارش ${r.date} (${r.shift === 'EVENING' ? 'عصر' : 'صبح'}) دریافت شد`,
    entityId: id,
  })

  return ok({ id, acknowledged: true, acknowledgedAt: now.toISOString() })
}
