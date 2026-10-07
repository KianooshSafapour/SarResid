import { db } from '@/lib/db'
import { fail, getSessionUser, json } from '@/lib/api-helpers'
import { isFriday, jalaliToIso, jMonthLength, toJalaliParts, todayIso } from '@/lib/jalali'

/* ─────────────────────────────────────────────────────────────────────────────
 *  19-c — GET /api/leaves/payroll?jy=&jm=
 *  دادهٔ آمادهٔ «مرخصی‌ها» برای ویو حقوق و دستمزد (بخش محاسباتی جراحی‌شده):
 *   - مرخصی‌های تأییدشدهٔ هم‌پوشان با ماه شمسی، گروه‌شده بر اساس personnelId
 *   - DAILY/SICK/UNPAID → تعداد روزهای کاری پوشش‌داده‌شدهٔ این ماه (جمعه/تعطیل/غیرکاری حذف)
 *   - HOURLY → دقیقهٔ مرخصی (fromHour/toHour) و معادل روز = دقیقه ÷ dailyWorkMinutes (۴۸۰)
 *   - روزهای غیرکاری اداری ثبت‌شدهٔ همان ماه (Offday) — برای نمایش، بدون کسر
 *  دسترسی: هر کاربر واردشده (همان سطح شفافیت /api/leaves) — فقط رکوردهای APPROVED.
 * ────────────────────────────────────────────────────────────────────────────*/

/** دقیقهٔ کار روزانهٔ مأخذ کسر (۸ ساعت قانونی در روز) — هماهنگ با api/leaves */
const DAILY_WORK_MINUTES = 480

const pad2 = (n: number) => String(n).padStart(2, '0')
const round2 = (n: number) => Math.round(n * 100) / 100

/** "HH:MM" → دقیقه از نیمه‌شب (۰ برای نامعتبر) */
function hmToMin(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim())
  if (!m) return 0
  const h = Number(m[1])
  const mm = Number(m[2])
  if (h > 23 || mm > 59) return 0
  return h * 60 + mm
}

export type LeavePayrollItem = {
  id: string
  type: string
  fromDate: string
  toDate: string
  fromHour: string
  toHour: string
  minutes: number // HOURLY: دقیقهٔ مرخصی
  days: number // DAILY/SICK/UNPAID: روز کاری پوشش‌داده‌شدهٔ این ماه
  dayEquivalent: number // معادل روز کاری (days + minutes/480)
}

export type LeavePayrollRow = {
  userId: string
  name: string
  items: LeavePayrollItem[]
  hourlyMinutes: number
  days: number
  dayEquivalent: number
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)

  const { searchParams } = new URL(req.url)
  const cur = toJalaliParts(todayIso())
  const jy = Math.round(Number(searchParams.get('jy')) || cur.jy)
  const jm = Math.round(Number(searchParams.get('jm')) || cur.jm)
  if (!(jm >= 1 && jm <= 12) || !(jy >= 1380 && jy <= 1460)) return fail('ماه شمسی نامعتبر است')

  const md = jMonthLength(jy, jm)
  const start = jalaliToIso(jy, jm, 1)
  const end = jalaliToIso(jy, jm, md)
  const daysIso: string[] = []
  for (let i = 1; i <= md; i++) daysIso.push(jalaliToIso(jy, jm, i))

  const [users, leaves, offdays, holidays] = await Promise.all([
    db.user.findMany({ select: { id: true, name: true, personnelId: true, active: true } }),
    db.leaveRequest.findMany({
      where: { status: 'APPROVED', fromDate: { lte: end }, toDate: { gte: start } },
      orderBy: { fromDate: 'asc' },
    }),
    // Offday.date قالب جلالی است — همان بازهٔ ماه شمسی
    db.offday.findMany({
      where: { date: { gte: `${jy}-${pad2(jm)}-01`, lte: `${jy}-${pad2(jm)}-${pad2(md)}` } },
      orderBy: { date: 'asc' },
    }),
    db.holiday.findMany({ where: { date: { gte: start, lte: end }, kind: 'HOLIDAY' }, select: { date: true } }),
  ])

  const holidaySet = new Set(holidays.map((h) => h.date.slice(0, 10)))
  // کلید جلالی → iso برای حذف روزهای غیرکاری از شمارش مرخصی روزانه
  const offdayIsoSet = new Set<string>()
  for (const o of offdays) {
    const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(o.date)
    if (p) offdayIsoSet.add(jalaliToIso(Number(p[1]), Number(p[2]), Number(p[3])))
  }

  const byPersonnel: Record<string, LeavePayrollRow> = {}
  for (const l of leaves) {
    const u = users.find((x) => x.id === l.userId)
    if (!u?.personnelId) continue // مرخصی کاربر بدون پروندهٔ پرسنلی در حقوق معنا ندارد

    let item: LeavePayrollItem
    if (l.type === 'HOURLY') {
      const minutes = Math.max(0, hmToMin(l.toHour) - hmToMin(l.fromHour))
      item = {
        id: l.id,
        type: l.type,
        fromDate: l.fromDate,
        toDate: l.toDate,
        fromHour: l.fromHour,
        toHour: l.toHour,
        minutes,
        days: 0,
        dayEquivalent: round2(minutes / DAILY_WORK_MINUTES),
      }
    } else {
      // روزهای کاریِ این ماه که مرخصی می‌پوشاند — جمعه/تعطیل رسمی/روز غیرکاری اداری پرداخت‌شده‌اند و کسر نمی‌شوند
      let days = 0
      for (const iso of daysIso) {
        if (iso >= l.fromDate.slice(0, 10) && iso <= l.toDate.slice(0, 10) && !isFriday(iso) && !holidaySet.has(iso) && !offdayIsoSet.has(iso)) days++
      }
      item = {
        id: l.id,
        type: l.type,
        fromDate: l.fromDate,
        toDate: l.toDate,
        fromHour: '',
        toHour: '',
        minutes: 0,
        days,
        dayEquivalent: days,
      }
    }

    const row = byPersonnel[u.personnelId] || { userId: u.id, name: u.name, items: [], hourlyMinutes: 0, days: 0, dayEquivalent: 0 }
    row.items.push(item)
    row.hourlyMinutes += item.minutes
    row.days += item.days
    row.dayEquivalent = round2(row.dayEquivalent + item.dayEquivalent)
    byPersonnel[u.personnelId] = row
  }

  return json({
    jy,
    jm,
    monthDays: md,
    dailyWorkMinutes: DAILY_WORK_MINUTES,
    offdays: offdays.map((o) => ({ id: o.id, date: o.date, note: o.note, createdByName: o.createdByName })),
    byPersonnel,
  })
}
