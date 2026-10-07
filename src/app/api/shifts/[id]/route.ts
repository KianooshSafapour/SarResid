import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { hasCap } from '@/lib/rbac'

/* ── ویرایش/حذف شیفت + حذف تخصیص ──
 * PUT/PATCH /api/shifts/[id]           → ویرایش شیفت قالب
 * DELETE /api/shifts/[id]?assignment=… → حذف یک تخصیص
 * DELETE /api/shifts/[id]              → حذف شیفت؛ اگر در برنامه‌ای استفاده شده → غیرفعال (نرم) */

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const BRAND_COLORS = ['#0e7a4a', '#77934a', '#c9a227', '#c96f4a', '#b3372f']

function weekdayNameOf(wd: number): string {
  return ({ 6: 'شنبه', 0: 'یکشنبه', 1: 'دوشنبه', 2: 'سه‌شنبه', 3: 'چهارشنبه', 4: 'پنجشنبه', 5: 'جمعه' })[wd] || '—'
}

async function canManageShifts(me: Awaited<ReturnType<typeof getSessionUser>>): Promise<boolean> {
  if (!me) return false
  if (['OWNER', 'GM', 'OM', 'PM', 'ADMIN'].includes(me.role)) return true
  return hasCap(me, 'personnel.manage')
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return updateShift(req, params)
}
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return updateShift(req, params)
}

async function updateShift(req: Request, params: Promise<{ id: string }>) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canManageShifts(me))) return fail('دسترسی غیرمجاز', 403)
  const { id } = await params
  const shift = await db.shift.findUnique({ where: { id } })
  if (!shift) return fail('شیفت یافت نشد', 404)

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const data: Partial<{ name: string; weekday: number; start: string; end: string; staffNeed: number; color: string; active: boolean; note: string }> = {}

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return fail('نام شیفت الزامی است')
    data.name = name.slice(0, 80)
  }
  if (body.weekday !== undefined) {
    const weekday = Math.round(Number(body.weekday))
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return fail('روز هفته معتبر نیست')
    data.weekday = weekday
  }
  if (body.start !== undefined) {
    const start = String(body.start).trim()
    if (!HHMM_RE.test(start)) return fail('ساعت شروع باید به قالب HH:MM باشد')
    data.start = start
  }
  if (body.end !== undefined) {
    const end = String(body.end).trim()
    if (!HHMM_RE.test(end)) return fail('ساعت پایان باید به قالب HH:MM باشد')
    data.end = end
  }
  if (body.staffNeed !== undefined) {
    const n = Math.round(Number(body.staffNeed))
    if (!isFinite(n) || n < 0) return fail('تعداد نیروی موردنیاز نمی‌تواند منفی باشد')
    data.staffNeed = Math.min(n, 99)
  }
  if (body.color !== undefined) {
    data.color = String(BRAND_COLORS as string[]).includes(String(body.color)) ? String(body.color) : '#0e7a4a'
  }
  if (body.active !== undefined) data.active = body.active === true
  if (body.note !== undefined) data.note = String(body.note).slice(0, 500)

  const updated = await db.shift.update({ where: { id }, data })
  await logActivity(me, 'ویرایش شیفت', 'shift', id, `${updated.name} • ${weekdayNameOf(updated.weekday)} • ${updated.start} تا ${updated.end}`)
  return json({ shift: updated })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canManageShifts(me))) return fail('دسترسی غیرمجاز', 403)
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const assignmentId = searchParams.get('assignment')

  /* ── حذف تخصیص یک نفر از یک شیفت ── */
  if (assignmentId) {
    const a = await db.shiftAssignment.findUnique({ where: { id: assignmentId } })
    if (!a) return fail('تخصیص یافت نشد', 404)
    const shift = await db.shift.findUnique({ where: { id: a.shiftId }, select: { name: true } })
    await db.shiftAssignment.delete({ where: { id: assignmentId } })
    await logActivity(me, 'حذف تخصیص شیفت', 'shift-assignment', assignmentId, `${a.personnelName} • ${shift?.name || a.shiftId} • ${a.date}`)
    return json({ ok: true })
  }

  /* ── حذف شیفت — با برنامهٔ ثبت‌شده: غیرفعال‌سازی نرم؛ بدون برنامه: حذف کامل ── */
  const shift = await db.shift.findUnique({ where: { id } })
  if (!shift) return fail('شیفت یافت نشد', 404)
  const used = await db.shiftAssignment.count({ where: { shiftId: id } })
  if (used > 0) {
    await db.shift.update({ where: { id }, data: { active: false } })
    await logActivity(me, 'غیرفعال‌سازی شیفت', 'shift', id, `${shift.name} — ${used} تخصیص ثبت‌شده دارد و از حذف کامل معاف شد`)
    return json({ ok: true, soft: true, assignments: used })
  }
  await db.shift.delete({ where: { id } })
  await logActivity(me, 'حذف شیفت', 'shift', id, `${shift.name} • ${shift.start} تا ${shift.end}`)
  return json({ ok: true, soft: false })
}
