import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse, type SessionUser } from '@/lib/api-helpers'
import { todayIso, toJalaliParts, jalaliToIso, jMonthLength } from '@/lib/jalali'
import { buildOfficialDays, holidayYearsToKeep } from '@/lib/iranian-calendar'
import { formatHijri } from '@/lib/hijri'
import { emitNotif } from '@/lib/notif-engine'
import { hasCap } from '@/lib/rbac'

/**
 * تعطیلات رسمی ایران — با تبدیل واقعی هجری↔شمسی (Umm al-Qura).
 * دادهٔ پایهٔ دقیق به‌صورت خودکار برای سال‌های [جاری±۱] بارگذاری می‌شود؛
 * ردیف‌های «manual» مدیریت دستی هرگز بازنویسی نمی‌شوند.
 *
 * گارد تغییرات (POST/PATCH/DELETE): cap «holidays.manage» یا نقش اجرایی یا حسابدار (ACC)
 * — روی هر تغییر: logActivity + اعلان «holiday.changed» برای مدیران.
 */

async function canManageHolidays(me: SessionUser | null): Promise<boolean> {
  if (!me) return false
  if (await hasCap(me, 'holidays.manage')) return true // شامل نقش‌های اجرایی و نقش‌های سفارشی
  const keys = [me.role, ...me.secondaryRoles, ...safeParse<string[]>(me.roleIds || '[]', [])]
  return keys.includes('ACC')
}

async function ensureBuiltinHolidays() {
  // پاکسازی ردیف‌های «تقریبی» قدیمیِ seed — موتور دقیق هجری (Umm al-Qura) جایگزین آنها شده است
  try {
    const stale = await db.holiday.count({ where: { source: 'seed', title: { contains: 'تقریبی' } } })
    if (stale > 0) {
      await db.holiday.deleteMany({ where: { source: 'seed', title: { contains: 'تقریبی' } } })
      await logActivity(null, 'پاکسازی تعطیلات تقریبی قدیمی', 'holiday', '', `${stale} ردیف «تقریبی» با تاریخ‌های نادقیق حذف شد (جایگزین: موتور دقیق هجری)`)
    }
  } catch {
    /* پاکسازی هرگز جریان اصلی را نمی‌شکند */
  }
  const years = holidayYearsToKeep()
  for (const jy of years) {
    const start = jalaliToIso(jy, 1, 1)
    const end = jalaliToIso(jy, 12, jMonthLength(jy, 12))
    // ردیف‌های رسمی (official) یا داخلی (builtin) هر دو «بارگذاری‌شده» محسوب می‌شوند —
    // همگام‌سازی رسمی هرگز با بازسازی داخلی بازنویسی نمی‌شود
    const loadedCount = await db.holiday.count({
      where: { date: { gte: start, lte: end }, source: { in: ['builtin', 'official'] } },
    })
    if (loadedCount >= 15) continue // بارگذاری شده
    const days = buildOfficialDays(jy)
    for (const d of days) {
      const existing = await db.holiday.findUnique({ where: { date: d.date } })
      if (existing) {
        if (existing.source === 'builtin' || existing.source === 'seed') {
          await db.holiday.update({
            where: { date: d.date },
            data: { title: d.title, kind: d.kind, hijriLabel: d.hijriLabel, source: 'builtin', solar: d.solar },
          })
        }
        continue // manual و official دست‌نخورده
      }
      await db.holiday.create({
        data: { date: d.date, title: d.title, kind: d.kind, hijriLabel: d.hijriLabel, source: 'builtin', solar: d.solar },
      })
    }
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const force = searchParams.get('rebuild') === '1'
  if (force) await ensureBuiltinHolidays()
  else await ensureBuiltinHolidays().catch(() => {})

  const all = await db.holiday.findMany({ orderBy: { date: 'asc' } })
  const list = from && to ? all.filter((h) => h.date >= from && h.date <= to) : all
  // کالیبراسیون قمری رسمی — کلاینت با setCalibration نمایش هجری را هم‌ساز تقویم رسمی می‌کند
  const calRow = await db.setting.findUnique({ where: { key: 'hijri.calibration' } }).catch(() => null)
  return json({
    holidays: list,
    today: todayIso(),
    hijriToday: formatHijri(todayIso()),
    jalaliYear: toJalaliParts(todayIso()).jy,
    calibration: safeParse<Record<string, number>>(calRow?.value || '{}', {}),
  })
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!(await canManageHolidays(me))) return fail('دسترسی غیرمجاز — مدیریت تعطیلات نیاز به مجوز دارد', 403)
  const meU = me!
  const { date, title, kind, hijriLabel } = await req.json()
  if (!date || !title) return fail('تاریخ و عنوان الزامی است')
  if (!ISO_RE.test(String(date))) return fail('قالب تاریخ نامعتبر است (میلادی yyyy-mm-dd)')
  const exists = await db.holiday.findUnique({ where: { date } })
  if (exists) return fail(`در این تاریخ قبلاً «${exists.title}» ثبت شده است — ابتدا آن را ویرایش یا حذف کنید`, 409)
  const holiday = await db.holiday.create({
    data: {
      date,
      title: String(title).trim(),
      kind: kind === 'OCCASION' ? 'OCCASION' : 'HOLIDAY',
      hijriLabel: typeof hijriLabel === 'string' ? hijriLabel : '',
      source: 'manual',
    },
  })
  await logActivity(meU, 'افزودن تعطیلی رسمی', 'holiday', holiday.id, holiday.title)
  await emitNotif({
    event: 'holiday.changed',
    title: `تعطیلی افزوده شد: ${holiday.title}`,
    detail: `${holiday.title} — ${formatHijri(holiday.date)} (${holiday.date})`,
    go: '#/admin',
    severity: 'important',
    icon: '🗓️',
    actor: { id: meU.id, name: meU.name },
  })
  return json({ holiday }, 201)
}

export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!(await canManageHolidays(me))) return fail('دسترسی غیرمجاز — مدیریت تعطیلات نیاز به مجوز دارد', 403)
  const meU = me!
  const body = await req.json().catch(() => null)
  const { id, date, title, kind } = (body || {}) as { id?: string; date?: string; title?: string; kind?: string }
  if (!id) return fail('شناسهٔ تعطیلی الزامی است')
  const existing = await db.holiday.findUnique({ where: { id } })
  if (!existing) return fail('تعطیلی موردنظر یافت نشد', 404)

  const data: { title?: string; date?: string; kind?: string } = {}
  if (title !== undefined) {
    const t = String(title).trim()
    if (!t) return fail('عنوان نمی‌تواند خالی باشد')
    data.title = t
  }
  if (kind !== undefined) {
    if (kind !== 'HOLIDAY' && kind !== 'OCCASION') return fail('نوع فقط «تعطیل رسمی» یا «مناسبت» است')
    data.kind = kind
  }
  if (date !== undefined) {
    const d = String(date)
    if (!ISO_RE.test(d)) return fail('قالب تاریخ نامعتبر است (میلادی yyyy-mm-dd)')
    if (d !== existing.date) {
      const clash = await db.holiday.findUnique({ where: { date: d } })
      if (clash) return fail(`در تاریخ جدید قبلاً «${clash.title}» ثبت شده است — ابتدا آن را ویرایش یا حذف کنید`, 409)
      data.date = d
    }
  }
  if (Object.keys(data).length === 0) return fail('تغییری ارسال نشد')

  const holiday = await db.holiday.update({ where: { id }, data })
  const changes = [
    data.title !== undefined && `عنوان: «${existing.title}» ← «${data.title}»`,
    data.date !== undefined && `تاریخ: ${existing.date} ← ${data.date}`,
    data.kind !== undefined && `نوع: ${existing.kind} ← ${data.kind}`,
  ].filter(Boolean).join(' | ')
  await logActivity(meU, 'ویرایش تعطیلی رسمی', 'holiday', id, `${holiday.title} — ${changes}`)
  await emitNotif({
    event: 'holiday.changed',
    title: `تعطیلی به‌روزرسانی شد: ${holiday.title}`,
    detail: `${changes} — ${formatHijri(holiday.date)} (${holiday.date})`,
    go: '#/admin',
    severity: 'important',
    icon: '🗓️',
    actor: { id: meU.id, name: meU.name },
  })
  return json({ holiday })
}

export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!(await canManageHolidays(me))) return fail('دسترسی غیرمجاز — مدیریت تعطیلات نیاز به مجوز دارد', 403)
  const meU = me!
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return fail('شناسه الزامی است')
  const existing = await db.holiday.findUnique({ where: { id } })
  const holiday = await db.holiday.delete({ where: { id } }).catch(() => null)
  if (!holiday) return fail('تعطیلی موردنظر یافت نشد', 404)
  await logActivity(meU, 'حذف تعطیلی', 'holiday', id, holiday.title)
  await emitNotif({
    event: 'holiday.changed',
    title: `تعطیلی حذف شد: ${holiday.title}`,
    detail: `${existing?.title || holiday.title} از تاریخ ${holiday.date} حذف شد`,
    go: '#/admin',
    severity: 'important',
    icon: '🗓️',
    actor: { id: meU.id, name: meU.name },
  })
  return json({ ok: true })
}
