import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, clampInt } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { parseSetting } from '@/lib/sms'
import {
  todayJalaliDash,
  addDaysJalaliDash,
  jalaliDashToLong,
  jalaliDashWeekdayName,
  diffDaysJalali,
} from '@/lib/jalali'

export const dynamic = 'force-dynamic'

const DASH_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Mr. Noroozi sets the period, Darvishi records — OWNER/GM/ACC/ADMIN only */
const CALC_ROLES = ['OWNER', 'GM', 'ACC', 'ADMIN']

/**
 * GET /api/cheque-calc?days=45&from=1405-07-27
 * → {from, days, target, targetLong, weekday, isOff, offReason,
 *    suggestions: [up to 5 NEAREST EARLIER working days — NEVER later],
 *    recommended (first suggestion or null)}
 *
 * Working day = not جمعه (jalaliWeekday 6) AND not in the Holiday table.
 * Credibility rule: a cheque is NEVER post-dated beyond the agreed period —
 * when the target lands on an off day we only suggest EARLIER dates.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!CALC_ROLES.includes(user.role)) return fail('دسترسی به محاسبه‌گر تاریخ چک ندارید', 403)

  const sp = req.nextUrl.searchParams

  // default period from settings (defaults:cheque.periodDays — 45)
  let defaultDays = 45
  const setting = await db.setting.findUnique({ where: { key: 'defaults:cheque.periodDays' } })
  if (setting) {
    const n = Number(parseSetting(setting.value, '45'))
    if (Number.isFinite(n) && n > 0) defaultDays = Math.round(n)
  }

  const daysRaw = (sp.get('days') || '').trim()
  const days = daysRaw === '' ? defaultDays : clampInt(daysRaw, 1, 365, defaultDays)
  const fromRaw = (sp.get('from') || '').trim().replace(/\//g, '-')
  const from = DASH_DATE.test(fromRaw) ? fromRaw : todayJalaliDash()

  const target = addDaysJalaliDash(from, days)
  const weekdayName = jalaliDashWeekdayName(target)
  const isFriday = weekdayName === 'جمعه'

  // holidays on the target date
  const holidays = await db.holiday.findMany({ where: { date: { gte: addDaysJalaliDash(target, -40), lte: target } } })
  const holidayMap = new Map<string, string[]>()
  for (const h of holidays) {
    const list = holidayMap.get(h.date) ?? []
    list.push(h.title)
    holidayMap.set(h.date, list)
  }
  const targetHolidays = holidayMap.get(target) ?? []

  const isOff = isFriday || targetHolidays.length > 0
  const offReason = isOff
    ? [isFriday ? 'جمعه' : null, targetHolidays.length ? targetHolidays.join(' و ') : null].filter(Boolean).join(' — ')
    : null

  // up to 5 NEAREST EARLIER working days (never later than target)
  const suggestions: Array<{ date: string; long: string; weekday: string; deltaDays: number; isOff: boolean }> = []
  if (isOff) {
    for (let back = 1; back <= 30 && suggestions.length < 5; back++) {
      const date = addDaysJalaliDash(target, -back)
      const wd = jalaliDashWeekdayName(date)
      if (wd === 'جمعه') continue
      if (holidayMap.has(date)) continue
      suggestions.push({
        date,
        long: jalaliDashToLong(date),
        weekday: wd,
        deltaDays: -back, // negative = earlier than target (credibility rule)
        isOff: false,
      })
    }
  }

  return ok({
    from,
    days,
    target,
    targetLong: jalaliDashToLong(target),
    weekday: weekdayName,
    isOff,
    offReason,
    suggestions,
    recommended: suggestions[0] ?? null,
    // context for the UI
    today: todayJalaliDash(),
    daysFromToday: diffDaysJalali(target.replace(/-/g, '/'), todayJalaliDash().replace(/-/g, '/')),
    note: 'هرگز دوره را طولانی‌تر از توافق نکنید — تاریخ نزدیک‌تر پیشنهاد می‌شود.',
  })
}
