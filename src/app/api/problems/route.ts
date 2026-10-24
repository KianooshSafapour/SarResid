import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, safeJson, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { displayName, notify } from '@/lib/notify'
import { todayJalaliDash } from '@/lib/jalali'
import { runDueAlerts } from './_due'

export const dynamic = 'force-dynamic'

/** KV keys — Problem has no smsAlert column (no schema change needed) */
export const problemSmsKey = (id: string) => `problem:smsalert:${id}`
export const problemAlertKey = (id: string, phase: string) => `problem:alert:${id}:${phase}`

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED']
const SHIFTS = ['MORNING', 'EVENING']
const CATEGORIES = ['equipment', 'it', 'supply', 'cleaning', 'product', 'staff', 'customer', 'security', 'other']
const SEVERITIES = ['low', 'normal', 'high', 'urgent']

export const CATEGORY_LABELS: Record<string, string> = {
  equipment: 'تجهیزات و تجهیزات فروشگاهی',
  it: 'فناوری اطلاعات',
  supply: 'انبار و تأمین',
  cleaning: 'نظافت و بهداشت',
  product: 'کالا و کیفیت',
  staff: 'پرسنل',
  customer: 'مشتری',
  security: 'ایمنی و امنیت',
  other: 'سایر',
}

export const SEVERITY_LABELS: Record<string, string> = {
  low: 'کم',
  normal: 'معمولی',
  high: 'زیاد',
  urgent: 'فوری',
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type ProblemRow = {
  id: string
  date: string
  problem: string
  action: string | null
  responsible: string | null
  status: string
  reporterId: string | null
  shift: string
  time: string | null
  source: string
  escalated: boolean
  category: string
  severity: string
  location: string | null
  assigneeId: string | null
  dueDate: string | null
  resolvedAt: Date | null
  createdAt: Date
}

function problemOut(
  p: ProblemRow,
  users: Map<string, { fullName: string; honorific: string; role: string }>,
  smsAlert = false,
) {
  const r = p.reporterId ? users.get(p.reporterId) : undefined
  const a = p.assigneeId ? users.get(p.assigneeId) : undefined
  return {
    id: p.id,
    date: p.date,
    problem: p.problem,
    action: p.action,
    responsible: p.responsible,
    status: p.status,
    reporterId: p.reporterId,
    reporter: r ? { fullName: r.fullName, honorific: r.honorific } : null,
    shift: p.shift,
    time: p.time,
    source: p.source,
    escalated: p.escalated,
    category: p.category,
    categoryLabel: CATEGORY_LABELS[p.category] ?? p.category,
    severity: p.severity,
    severityLabel: SEVERITY_LABELS[p.severity] ?? p.severity,
    location: p.location,
    assigneeId: p.assigneeId,
    assignee: a ? { id: p.assigneeId, fullName: a.fullName, honorific: a.honorific, role: a.role } : null,
    dueDate: p.dueDate,
    smsAlert,
    resolvedAt: p.resolvedAt ? p.resolvedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  }
}

/** Batch-read the per-problem SMS-alert flags (Setting KV). */
async function smsAlertsFor(ids: string[]): Promise<Map<string, boolean>> {
  if (!ids.length) return new Map()
  const rows = await db.setting.findMany({ where: { key: { in: ids.map(problemSmsKey) } } })
  return new Map(rows.map((r) => [r.key.slice('problem:smsalert:'.length), safeJson<boolean>(r.value, false)]))
}

/** GET /api/problems?status=&category=&severity=&shift=&assignee=&from=&to=
 *  → { items, stats:{open,inProgress,resolved,byCategory}, blocks:[floorplan block labels] } */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const sp = req.nextUrl.searchParams
  const status = (sp.get('status') || '').trim().toUpperCase()
  const category = (sp.get('category') || '').trim()
  const severity = (sp.get('severity') || '').trim()
  const shift = (sp.get('shift') || '').trim().toUpperCase()
  const assignee = (sp.get('assignee') || '').trim()
  const from = (sp.get('from') || '').trim()
  const to = (sp.get('to') || '').trim()

  const where: Record<string, unknown> = {}
  if (status && STATUSES.includes(status)) where.status = status
  if (category && CATEGORIES.includes(category)) where.category = category
  if (severity && SEVERITIES.includes(severity)) where.severity = severity
  if (shift && SHIFTS.includes(shift)) where.shift = shift
  if (assignee) where.assigneeId = assignee
  if (DATE_RE.test(from) && DATE_RE.test(to)) where.date = { gte: from, lte: to }
  else if (DATE_RE.test(from)) where.date = { gte: from }
  else if (DATE_RE.test(to)) where.date = { lte: to }

  const [problems, all, plan] = await Promise.all([
    db.problem.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 }),
    db.problem.findMany({ select: { status: true, category: true } }),
    db.floorplan.findFirst({ include: { blocks: true } }),
  ])

  const userIds = problems.flatMap((p) => [p.reporterId ?? '', p.assigneeId ?? ''])
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: [...new Set(userIds.filter(Boolean))] } },
        select: { id: true, fullName: true, honorific: true, role: true },
      })
    : []
  const userMap = new Map(users.map((u) => [u.id, u]))
  const smsMap = await smsAlertsFor(problems.map((p) => p.id))

  const stats = {
    open: all.filter((p) => p.status === 'OPEN').length,
    inProgress: all.filter((p) => p.status === 'IN_PROGRESS').length,
    resolved: all.filter((p) => p.status === 'RESOLVED').length,
    byCategory: Object.fromEntries(
      CATEGORIES.map((c) => [c, all.filter((p) => p.category === c).length] as [string, number]).filter(
        ([, n]) => n > 0,
      ),
    ),
  }

  const blocks = plan
    ? [...new Set(plan.blocks.map((b) => b.label).filter((l): l is string => !!l))]
    : []

  // ارزیابی تنبل هشدارهای مهلت (idempotent — نشانه‌های KV از تکرار جلوگیری
  // می‌کنند): با باز شدن فهرست توسط هر کاربری، اعلان/پیامکی که هنوز ارسال
  // نشده شلیک می‌شود. هرگز پاسخ فهرست را متوقف نمی‌کند.
  let alerts: { checked: number; created: number; smsSent: number } | null = null
  try { alerts = await runDueAlerts() } catch { /* بی‌صدا */ }

  return ok({
    items: problems.map((p) =>
      problemOut(p as unknown as ProblemRow, userMap, smsMap.get(p.id) === true),
    ),
    stats,
    blocks,
    categories: CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABELS[c] })),
    severities: SEVERITIES.map((s) => ({ key: s, label: SEVERITY_LABELS[s] })),
    ...(alerts ? { alerts } : {}),
  })
}

/**
 * POST /api/problems — ثبت مشکل (هر کاربر)
 * { problem, category?, severity?, location?, assigneeId?, dueDate?, time?, shift?, action?, date?,
 *   smsAlert? } — smsAlert (مدیران): هشدار پیامکی به مسئول نزدیک/بعد از مهلت
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const problem = String(body.problem || '').trim()
  if (problem.length < 3) return fail('شرح مشکل الزامی است')

  const category = String(body.category || 'other')
  if (!CATEGORIES.includes(category)) return fail('دسته‌بندی مشکل نامعتبر است')
  const severity = String(body.severity || 'normal')
  if (!SEVERITIES.includes(severity)) return fail('شدت مشکل نامعتبر است')

  const shift = String(body.shift || 'MORNING').toUpperCase()
  if (!SHIFTS.includes(shift)) return fail('شیفت نامعتبر است')

  const location = String(body.location || '').trim() || null
  const dueDate = String(body.dueDate || '').trim() || null
  if (dueDate && !DATE_RE.test(dueDate)) return fail('مهلت رسیدگی را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')

  const incidentDate = String(body.date || '').trim() || todayJalaliDash()
  if (!DATE_RE.test(incidentDate)) return fail('تاریخ وقوع مشکل را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')

  const assigneeId = String(body.assigneeId || '').trim() || null
  if (assigneeId) {
    const assignee = await db.user.findUnique({ where: { id: assigneeId } })
    if (!assignee) return fail('مسئول پیگیری انتخاب‌شده یافت نشد', 404)
  }

  const smsAlert = body.smsAlert === true
  if (smsAlert && !isManager(me)) return fail('تنها مدیران می‌توانند اطلاع‌رسانی پیامکی را فعال کنند', 403)
  if (smsAlert && !assigneeId) return fail('برای اطلاع‌رسانی پیامکی باید مسئول پیگیری مشخص باشد')

  const created = await db.problem.create({
    data: {
      date: incidentDate,
      problem,
      responsible: body.responsible ? String(body.responsible).trim() : null,
      action: body.action ? String(body.action).trim() : null,
      status: 'OPEN',
      reporterId: me.id,
      shift,
      time: body.time ? String(body.time).trim() : null,
      source: isManager(me) ? 'MANAGER' : 'STAFF',
      category,
      severity,
      location,
      assigneeId,
      dueDate,
    },
  })

  if (smsAlert && created.id) {
    await db.setting.upsert({
      where: { key: problemSmsKey(created.id) },
      create: { key: problemSmsKey(created.id), value: 'true' },
      update: { value: 'true' },
    })
  }

  const myName = displayName(me)
  const severityForNotify = severity === 'urgent' ? 'critical' : severity === 'high' ? 'warning' : 'important'

  if (assigneeId) {
    await notify({
      userId: assigneeId,
      kind: 'problem',
      severity: severityForNotify,
      title: 'مشکل جدید به شما واگذار شد',
      body: problem.slice(0, 120),
      go: '#/tasks/problems',
    })
  }
  await notify({
    role: 'ADMIN',
    kind: 'problem',
    severity: severityForNotify,
    title: 'مشکل جدید ثبت شد',
    body: problem.slice(0, 120),
    go: '#/tasks/problems',
  })

  await logActivity({
    userId: me.id,
    userName: myName,
    action: 'problem_report',
    actionLabel: 'ثبت مشکل',
    category: 'problems',
    detail: `${problem.slice(0, 60)} — ${CATEGORY_LABELS[category]} (${SEVERITY_LABELS[severity]})`,
    entityId: created.id,
  })

  return ok({ problem: { id: created.id } })
}

/** PATCH /api/problems {id, status, action?, responsible?} — legacy manager update (old attendance chunk) */
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
      ...(status === 'RESOLVED' && !problem.resolvedAt ? { resolvedAt: new Date() } : {}),
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
  // KV cleanup: alert markers + sms flag (startsWith keeps other problems' keys safe)
  await db.setting.deleteMany({
    where: { OR: [{ key: problemSmsKey(id) }, { key: { startsWith: `problem:alert:${id}:` } }] },
  })
  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'problem_delete',
    actionLabel: 'حذف مشکل',
    category: 'problems',
    detail: problem.problem.slice(0, 60),
    entityId: id,
  })
  return ok({ deleted: id })
}
