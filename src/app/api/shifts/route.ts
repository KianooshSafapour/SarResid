import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { canViewApi, hasCap } from '@/lib/rbac'
import { formatJalaliShort, todayIso, weekdayName } from '@/lib/jalali'

/* ── شیفت‌ها و برنامهٔ تیم — قالب هفتگی (Shift) + تخصیص روزانه (ShiftAssignment) ──
 * weekday بر مبنای JS getDay است: ۰=یکشنبه … ۵=جمعه، ۶=شنبه (هفتهٔ کاری ایرانی از شنبه شروع می‌شود).
 * پایان ≤ شروع یعنی شیفت «خوابیده به فردا» (overnight). */

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const BRAND_COLORS = ['#0e7a4a', '#77934a', '#c9a227', '#c96f4a', '#b3372f']

/** قالب پیش‌فرض «هایپر زیتون» — شنبه تا پنجشنبه دو شیفت، جمعه دو شیفت کوتاه‌تر */
const HYPER_PRESET: { weekday: number; name: string; start: string; end: string; staffNeed: number; color: string }[] = [
  ...[6, 0, 1, 2, 3, 4].flatMap((weekday) => [
    { weekday, name: 'صبح', start: '08:00', end: '15:30', staffNeed: 2, color: '#0e7a4a' },
    { weekday, name: 'عصر', start: '15:30', end: '23:00', staffNeed: 2, color: '#77934a' },
  ]),
  { weekday: 5, name: 'صبح', start: '10:00', end: '14:00', staffNeed: 3, color: '#0e7a4a' },
  { weekday: 5, name: 'عصر', start: '18:00', end: '22:00', staffNeed: 3, color: '#77934a' },
]

/** گارد نوشتن: مدیریت شیفت = OWNER/GM/OM/PM/ADMIN یا cap «personnel.manage» */
async function canManageShifts(me: Awaited<ReturnType<typeof getSessionUser>>): Promise<boolean> {
  if (!me) return false
  if (['OWNER', 'GM', 'OM', 'PM', 'ADMIN'].includes(me.role)) return true
  return hasCap(me, 'personnel.manage')
}

function parseStaffNeed(v: unknown): number {
  const n = Math.round(Number(v))
  if (!isFinite(n) || n < 0) return 1
  return Math.min(n, 99)
}

/** اعتبارسنجی بدنهٔ شیفت — پیام‌های فارسی */
function validateShiftBody(body: Record<string, unknown>): { error?: string; data?: {
  name: string; weekday: number; start: string; end: string; staffNeed: number; color: string; active: boolean; note: string
} } {
  const name = String(body.name || '').trim()
  if (!name) return { error: 'نام شیفت الزامی است' }
  const weekday = Math.round(Number(body.weekday))
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: 'روز هفته معتبر نیست' }
  const start = String(body.start || '').trim()
  const end = String(body.end || '').trim()
  if (!HHMM_RE.test(start)) return { error: 'ساعت شروع باید به قالب HH:MM باشد' }
  if (!HHMM_RE.test(end)) return { error: 'ساعت پایان باید به قالب HH:MM باشد' }
  const staffNeed = parseStaffNeed(body.staffNeed)
  if (staffNeed < 0) return { error: 'تعداد نیروی موردنیاز نمی‌تواند منفی باشد' }
  const color = BRAND_COLORS.includes(String(body.color)) ? String(body.color) : '#0e7a4a'
  return {
    data: {
      name: name.slice(0, 80),
      weekday,
      start,
      end,
      staffNeed,
      color,
      active: body.active !== false,
      note: String(body.note || '').slice(0, 500),
    },
  }
}

function weekdayNameOf(wd: number): string {
  return ({ 6: 'شنبه', 0: 'یکشنبه', 1: 'دوشنبه', 2: 'سه‌شنبه', 3: 'چهارشنبه', 4: 'پنجشنبه', 5: 'جمعه' })[wd] || '—'
}

/** GET /api/shifts
 *  ?week=1            → قالب هفتگی گروه‌بندی‌شده { byWeekday: {6:[…],0:[…]} }
 *  ?date=ISO          → شیفت‌های آن روز هفته + تخصیص‌های همان تاریخ
 *  ?month=YYYY-MM     → تخصیص‌های یک ماه میلادی + همهٔ شیفت‌های قالب
 *  ?from=ISO&to=ISO   → بازهٔ دلخواه (نوار هفته/ماه جلالی) */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const viewOk = await canViewApi(me, 'shifts')
  const manageOk = await canManageShifts(me)
  if (!viewOk && !manageOk) return fail('دسترسی غیرمجاز', 403)

  const { searchParams } = new URL(req.url)
  const week = searchParams.get('week')
  const date = (searchParams.get('date') || '').slice(0, 10)
  const month = searchParams.get('month') || ''
  const from = (searchParams.get('from') || '').slice(0, 10)
  const to = (searchParams.get('to') || '').slice(0, 10)

  if (week) {
    const shifts = await db.shift.findMany({ orderBy: [{ weekday: 'asc' }, { start: 'asc' }] })
    const byWeekday: Record<string, typeof shifts> = {}
    for (const s of shifts) {
      const key = String(s.weekday)
      if (!byWeekday[key]) byWeekday[key] = []
      byWeekday[key].push(s)
    }
    return json({ byWeekday, shifts })
  }

  if (ISO_RE.test(date)) {
    const weekday = new Date(date + 'T12:00:00').getDay()
    const [shifts, assignments] = await Promise.all([
      db.shift.findMany({ where: { weekday }, orderBy: { start: 'asc' } }),
      db.shiftAssignment.findMany({ where: { date }, orderBy: { createdAt: 'asc' } }),
    ])
    return json({ date, weekday, shifts, assignments })
  }

  // بازهٔ ماه میلادی یا بازهٔ دلخواه — برای نوار هفته / نوار ماه
  let f = from
  let t = to
  if (/^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number)
    f = `${month}-01`
    t = new Date(y, m, 0).toISOString().slice(0, 10)
  }
  if (ISO_RE.test(f) && ISO_RE.test(t) && f <= t) {
    const [shifts, assignments] = await Promise.all([
      db.shift.findMany({ orderBy: { start: 'asc' } }),
      db.shiftAssignment.findMany({ where: { date: { gte: f, lte: t } }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
    ])
    return json({ from: f, to: t, shifts, assignments })
  }

  // پیش‌فرض: قالب هفتگی + برنامهٔ امروز
  const today = todayIso()
  const weekday = new Date(today + 'T12:00:00').getDay()
  const [shifts, assignments] = await Promise.all([
    db.shift.findMany({ orderBy: [{ weekday: 'asc' }, { start: 'asc' }] }),
    db.shiftAssignment.findMany({ where: { date: today }, orderBy: { createdAt: 'asc' } }),
  ])
  const byWeekday: Record<string, typeof shifts> = {}
  for (const s of shifts) {
    const key = String(s.weekday)
    if (!byWeekday[key]) byWeekday[key] = []
    byWeekday[key].push(s)
  }
  return json({ byWeekday, shifts, date: today, weekday, todayShifts: shifts.filter((s) => s.weekday === weekday), assignments })
}

/** POST /api/shifts
 *  action:'preset'                          → اعمال قالب پیش‌فرض هایپر زیتون (idempotent)
 *  {date, shiftId, personnelId(s)|assign[]} → upsert تخصیص (تراکنش برای انتساب گروهی)
 *  پیش‌فرض                                   → ایجاد شیفت در قالب هفتگی */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  /* ── شروع سریع: قالب پیش‌فرض هایپر زیتون (idempotent — همان روز+نام دوباره ساخته نمی‌شود) ── */
  if (body.action === 'preset') {
    if (!(await canManageShifts(me))) return fail('دسترسی غیرمجاز', 403)
    let created = 0
    let skipped = 0
    for (const p of HYPER_PRESET) {
      const exists = await db.shift.findFirst({ where: { weekday: p.weekday, name: p.name }, select: { id: true } })
      if (exists) {
        skipped++
        continue
      }
      await db.shift.create({ data: { ...p, note: 'قالب پیش‌فرض هایپر زیتون' } })
      created++
    }
    await logActivity(me, 'اعمال قالب پیش‌فرض شیفت‌ها', 'shift', 'preset', `هایپر زیتون — ${created} شیفت ساخته شد، ${skipped} مورد از قبل بود`)
    return json({ created, skipped })
  }

  /* ── تخصیص پرسنل به شیفت در تاریخ مشخص — upsert با احترام به قید یکتا (date+shiftId+personnelId) ── */
  const date = String(body.date || '').slice(0, 10)
  const shiftId = String(body.shiftId || '')
  if (date && shiftId) {
    if (!(await canManageShifts(me))) return fail('دسترسی غیرمجاز', 403)
    if (!ISO_RE.test(date)) return fail('تاریخ معتبر نیست')
    const shift = await db.shift.findUnique({ where: { id: shiftId } })
    if (!shift) return fail('شیفت یافت نشد', 404)

    // حالت کامل (sync): آرایهٔ assign — مواردی که از لیست حذف شده‌اند برداشته می‌شوند
    const fullSync = Array.isArray(body.assign)
    const rawRows: { personnelId: string; double: boolean; note: string }[] = fullSync
      ? (body.assign as Record<string, unknown>[]).map((r) => ({
          personnelId: String(r?.personnelId || ''),
          double: r?.double === true,
          note: String(r?.note || '').slice(0, 300),
        }))
      : (Array.isArray(body.personnelIds) ? body.personnelIds : [body.personnelId])
          .filter((x): x is string => typeof x === 'string' && !!x)
          .map((personnelId) => ({ personnelId, double: body.double === true, note: String(body.note || '').slice(0, 300) }))

    // حذف ردیف‌های خالی و تکراری‌ها
    const seen = new Set<string>()
    const rows = rawRows.filter((r) => {
      if (!r.personnelId || seen.has(r.personnelId)) return false
      seen.add(r.personnelId)
      return true
    })
    if (!rows.length) return fail('حداقل یک نفر برای تخصیص انتخاب کنید')

    const people = await db.personnel.findMany({ where: { id: { in: rows.map((r) => r.personnelId) } } })
    const byId = new Map(people.map((p) => [p.id, p]))
    for (const r of rows) {
      const p = byId.get(r.personnelId)
      if (!p) return fail('پرسنل انتخاب‌شده یافت نشد — فهرست را به‌روزرسانی کنید')
      if (!p.active) return fail(`${p.firstName} ${p.lastName} غیرفعال است و نمی‌تواند شیفت بگیرد`)
    }

    await db.$transaction(async (tx) => {
      for (const r of rows) {
        const p = byId.get(r.personnelId)!
        await tx.shiftAssignment.upsert({
          where: { date_shiftId_personnelId: { date, shiftId, personnelId: r.personnelId } },
          update: { double: r.double, note: r.note, personnelName: `${p.firstName} ${p.lastName}`.trim(), userId: p.userId || '' },
          create: {
            date,
            shiftId,
            personnelId: r.personnelId,
            personnelName: `${p.firstName} ${p.lastName}`.trim(),
            userId: p.userId || '',
            double: r.double,
            note: r.note,
            createdById: me.id,
            createdByName: me.name,
          },
        })
      }
      if (fullSync) {
        await tx.shiftAssignment.deleteMany({ where: { date, shiftId, personnelId: { notIn: rows.map((r) => r.personnelId) } } })
      }
    })

    await logActivity(
      me,
      'تخصیص نیرو به شیفت',
      'shift-assignment',
      shiftId,
      `${shift.name} • ${weekdayNameOf(shift.weekday)} ${formatJalaliShort(date)} • ${rows.length} نفر${rows.some((r) => r.double) ? ' (شامل شیفت دوم)' : ''}`
    )
    const assignments = await db.shiftAssignment.findMany({ where: { date, shiftId }, orderBy: { createdAt: 'asc' } })
    return json({ assignments, ok: true }, 201)
  }

  /* ── ایجاد شیفت در قالب هفتگی ── */
  if (!(await canManageShifts(me))) return fail('دسترسی غیرمجاز', 403)
  const v = validateShiftBody(body)
  if (v.error || !v.data) return fail(v.error || 'دادهٔ نامعتبر است')
  const shift = await db.shift.create({ data: v.data })
  await logActivity(me, 'ایجاد شیفت', 'shift', shift.id, `${shift.name} • ${weekdayNameOf(shift.weekday)} • ${shift.start} تا ${shift.end}`)
  return json({ shift }, 201)
}
