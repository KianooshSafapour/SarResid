import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { addDaysIso, isoDay, todayIso } from '@/lib/jalali'

const MANAGERS = ['GM', 'OM', 'OWNER']
const TARGET_KEY = 'splh_target'
const DEFAULT_TARGET = 500000 // تومان بر ساعت
const MAX_HOURS = 16

/** GET /api/splh?days=30 — daily series, staff hours, totals + target
 *  Sales proxy: sum of non-CANCELLED PreOrder.total per day = «فروش ثبت‌شده در سامانه».
 */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)

  const url = new URL(req.url)
  const days = Math.min(90, Math.max(7, Number(url.searchParams.get('days')) || 30))
  const startIso = addDaysIso(-(days - 1))
  const startDt = new Date(startIso + 'T00:00:00')
  const endDt = new Date(todayIso() + 'T23:59:59.999')
  const canEdit = MANAGERS.includes(me.role)

  const [preorders, labor, targetRow, activeUsers] = await Promise.all([
    db.preOrder.findMany({
      where: { status: { not: 'CANCELLED' }, createdAt: { gte: startDt, lte: endDt } },
      select: { total: true, createdAt: true },
    }),
    db.laborHour.findMany({ where: { forDate: { gte: startIso } } }),
    db.setting.findUnique({ where: { key: TARGET_KEY } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ])
  const target = Math.max(1, Number(targetRow?.value) || DEFAULT_TARGET)

  // ── per-day buckets ──
  const byDay = new Map<string, { hours: number; overtime: number; revenue: number }>()
  for (const p of preorders) {
    const d = isoDay(p.createdAt)
    const rec = byDay.get(d) || { hours: 0, overtime: 0, revenue: 0 }
    rec.revenue += p.total
    byDay.set(d, rec)
  }
  for (const l of labor) {
    const rec = byDay.get(l.forDate) || { hours: 0, overtime: 0, revenue: 0 }
    rec.hours += l.hours
    if (l.kind === 'OVERTIME') rec.overtime += l.hours
    byDay.set(l.forDate, rec)
  }
  const series = [...byDay.entries()]
    .map(([day, r]) => ({
      day,
      hours: r.hours,
      overtime: r.overtime,
      revenue: r.revenue,
      splh: r.hours > 0 ? r.revenue / r.hours : null,
    }))
    .sort((a, b) => a.day.localeCompare(b.day))

  // ── staff aggregation over the window ──
  const byUser = new Map<string, { hours: number; overtime: number; days: Set<string> }>()
  for (const l of labor) {
    const rec = byUser.get(l.userId) || { hours: 0, overtime: 0, days: new Set<string>() }
    rec.hours += l.hours
    if (l.kind === 'OVERTIME') rec.overtime += l.hours
    rec.days.add(l.forDate)
    byUser.set(l.userId, rec)
  }
  const totalHours = series.reduce((s, d) => s + d.hours, 0)
  const totalOvertime = series.reduce((s, d) => s + d.overtime, 0)
  const totalRevenue = series.reduce((s, d) => s + d.revenue, 0)

  const staff = activeUsers
    .map((u) => {
      const rec = byUser.get(u.id)
      if (!rec || rec.hours <= 0) return null
      return {
        userId: u.id,
        userName: u.name,
        hours: rec.hours,
        overtime: rec.overtime,
        avgHoursPerDay: rec.hours / rec.days.size,
        share: totalHours > 0 ? (rec.hours / totalHours) * 100 : 0,
      }
    })
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => b.hours - a.hours)

  const ownRec = byUser.get(me.id)
  const own = {
    userId: me.id,
    userName: me.name,
    hours: ownRec?.hours || 0,
    overtime: ownRec?.overtime || 0,
    avgHoursPerDay: ownRec && ownRec.days.size > 0 ? ownRec.hours / ownRec.days.size : 0,
    share: 0,
  }

  // ── totals / best & worst day ──
  const splhDays = series.filter((d) => d.splh != null && d.hours > 0)
  const bestDay = splhDays.length ? splhDays.reduce((a, b) => ((b.splh || 0) > (a.splh || 0) ? b : a)) : null
  const worstDay = splhDays.length ? splhDays.reduce((a, b) => ((b.splh || 0) < (a.splh || 0) ? b : a)) : null
  const aboveTargetDays = splhDays.filter((d) => (d.splh || 0) > target).length

  const recent = canEdit
    ? [...labor]
        .sort((a, b) => (b.forDate + b.createdAt).localeCompare(a.forDate + a.createdAt))
        .slice(0, 14)
        .map((l) => ({
          id: l.id,
          userId: l.userId,
          userName: l.userName,
          forDate: l.forDate,
          hours: l.hours,
          kind: l.kind,
          note: l.note,
        }))
    : []

  return json({
    series,
    staff: canEdit ? staff : [], // حریم خصوصی: جزئیات فردی فقط برای مدیریت
    me: own,
    team: { hours: totalHours, overtime: totalOvertime, headcount: staff.length },
    recent,
    totals: {
      hours: totalHours,
      overtime: totalOvertime,
      revenue: totalRevenue,
      splh: totalHours > 0 ? totalRevenue / totalHours : null,
      bestDay: bestDay ? { day: bestDay.day, splh: bestDay.splh } : null,
      worstDay: worstDay ? { day: worstDay.day, splh: worstDay.splh } : null,
      target,
      aboveTargetDays,
      activeDays: splhDays.length,
    },
    canEdit,
  })
}

/** POST — upsert one labor-hour log by (userId, forDate) — managers only */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!MANAGERS.includes(me.role)) return fail('فقط مدیریت مجاز به ثبت ساعت کار است', 403)

  const body = await req.json().catch(() => null)
  if (!body) return fail('دادهٔ ارسالی نامعتبر است')
  const { userId, forDate, kind, note } = body
  if (!userId) return fail('همکار را انتخاب کنید')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(forDate || ''))) return fail('تاریخ نامعتبر است')
  const hours = Number(body.hours)
  if (!isFinite(hours) || hours <= 0 || hours > MAX_HOURS)
    return fail(`ساعت کار باید بیشتر از صفر و حداکثر ${MAX_HOURS} باشد`)
  const k = kind === 'OVERTIME' ? 'OVERTIME' : 'REGULAR'

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user || !user.active) return fail('همکار یافت نشد')

  const log = await db.laborHour.upsert({
    where: { userId_forDate: { userId, forDate } },
    create: { userId, userName: user.name, forDate, hours, kind: k, note: String(note || ''), createdById: me.id },
    update: { hours, kind: k, note: String(note || ''), userName: user.name },
  })
  await logActivity(
    me,
    'ثبت ساعت کار',
    'laborHour',
    log.id,
    `${user.name} — ${forDate} — ${hours} ساعت (${k === 'OVERTIME' ? 'اضافه‌کار' : 'عادی'})`
  )
  return json({ log }, 201)
}

/** PUT — save SPLH target (Setting 'splh_target') — managers only */
export async function PUT(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!MANAGERS.includes(me.role)) return fail('فقط مدیریت مجاز به تنظیم هدف است', 403)

  const body = await req.json().catch(() => null)
  const target = Number(body?.target)
  if (!isFinite(target) || target <= 0 || target > 1000000000)
    return fail('هدف باید عددی مثبت و منطقی باشد (تومان بر ساعت)')

  await db.setting.upsert({
    where: { key: TARGET_KEY },
    create: { key: TARGET_KEY, value: String(target) },
    update: { value: String(target) },
  })
  await logActivity(me, 'تنظیم هدف بهره‌وری', 'setting', TARGET_KEY, `${target} تومان بر ساعت`)
  return json({ target })
}

/** DELETE ?id= — remove one labor-hour log — managers only */
export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!MANAGERS.includes(me.role)) return fail('اجازهٔ حذف ساعت کار را ندارید', 403)

  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return fail('شناسهٔ الزامی است')
  const existing = await db.laborHour.findUnique({ where: { id } })
  if (!existing) return fail('رکورد یافت نشد', 404)

  await db.laborHour.delete({ where: { id } })
  await logActivity(me, 'حذف ساعت کار', 'laborHour', id, `${existing.userName} — ${existing.forDate}`)
  return json({ ok: true })
}
