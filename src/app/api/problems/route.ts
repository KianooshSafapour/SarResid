import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { displayName, notify } from '@/lib/notify'
import { todayJalaliDash } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED']

/** GET /api/problems[?status=] — store problems board, newest first */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const status = req.nextUrl.searchParams.get('status') || ''
  const problems = await db.problem.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const reporterIds = [...new Set(problems.map((p) => p.reporterId).filter((x): x is string => !!x))]
  const reporters = reporterIds.length
    ? await db.user.findMany({ where: { id: { in: reporterIds } } })
    : []
  const reporterMap = new Map(reporters.map((r) => [r.id, r]))

  return ok({
    problems: problems.map((p) => {
      const r = p.reporterId ? reporterMap.get(p.reporterId) : undefined
      return {
        id: p.id,
        date: p.date,
        problem: p.problem,
        action: p.action,
        responsible: p.responsible,
        status: p.status,
        reporterId: p.reporterId,
        createdAt: p.createdAt,
        reporter: r ? { fullName: r.fullName, honorific: r.honorific } : null,
      }
    }),
  })
}

/** POST /api/problems {problem, responsible?} — any user reports a problem */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => ({}))) as {
    problem?: string
    responsible?: string
    date?: string
  }
  const problem = String(body.problem || '').trim()
  if (problem.length < 3) return fail('شرح مشکل الزامی است')

  const created = await db.problem.create({
    data: {
      date: body.date?.trim() || todayJalaliDash(),
      problem,
      responsible: body.responsible ? String(body.responsible).trim() : null,
      status: 'OPEN',
      reporterId: me.id,
    },
  })

  await notify({
    role: 'ADMIN',
    kind: 'problem',
    severity: 'important',
    title: 'مشکل جدید ثبت شد',
    body: problem.slice(0, 120),
    go: '#/tasks/problems',
  })

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'problem_report',
    actionLabel: 'ثبت مشکل',
    category: 'problems',
    detail: problem.slice(0, 80),
    entityId: created.id,
  })

  return ok({ problem: { id: created.id } })
}

/** PATCH /api/problems {id, status, action?, responsible?} — managers */
export async function PATCH(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!isManager(me)) return fail('فقط مدیران می‌توانند مشکل را به‌روزرسانی کنند', 403)

  const body = (await req.json().catch(() => ({}))) as {
    id?: string
    status?: string
    action?: string
    responsible?: string
  }
  const id = String(body.id || '')
  const problem = await db.problem.findUnique({ where: { id } })
  if (!problem) return fail('مشکل یافت نشد', 404)

  const status = String(body.status || problem.status)
  if (!STATUSES.includes(status)) return fail('وضعیت نامعتبر است')

  await db.problem.update({
    where: { id },
    data: {
      status,
      action: body.action !== undefined ? String(body.action || '').trim() || null : problem.action,
      responsible:
        body.responsible !== undefined
          ? String(body.responsible || '').trim() || null
          : problem.responsible,
    },
  })

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'problem_update',
    actionLabel: 'به‌روزرسانی مشکل',
    category: 'problems',
    detail: `${problem.problem.slice(0, 50)} → ${status}`,
    entityId: id,
  })

  return ok({ updated: id })
}

/** DELETE /api/problems?id= — managers only */
export async function DELETE(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!isManager(me)) return fail('فقط مدیران می‌توانند مشکل را حذف کنند', 403)

  const id = req.nextUrl.searchParams.get('id') || ''
  const problem = await db.problem.findUnique({ where: { id } })
  if (!problem) return fail('مشکل یافت نشد', 404)

  await db.problem.delete({ where: { id } })
  return ok({ deleted: id })
}
