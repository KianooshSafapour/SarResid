import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { jalaliToIso, jMonthLength, jMonthStartWeekday } from '@/lib/jalali'
import { buildOfficialDays, holidayYearsToKeep } from '@/lib/iranian-calendar'
import { hasCap } from '@/lib/rbac'
import { setCalibration, isoToHijri } from '@/lib/hijri'

/**
 * همگام‌سازی تقویم با منبع رسمی (time.ir — بازتاب رسمی تقویم کشور):
 *  - mode=official (پیش‌فرض): دریافت سالِ کامل از مجموعهٔ دادهٔ رسمیِ اسکرپ‌شده از time.ir
 *    (github.com/hasan-ahani/shamsi-holidays — هر سال شمسی یک درخواست، نه ۳۶۵ درخواست)
 *    ساختار: [{ date:"1405-10-02" (شمسی), events:[{description, is_holiday}] }]
 *    برچسب قمری داخل [ … ] استخراج و به‌عنوان لنگر کالیبراسیون هجری ثبت می‌شود.
 *  - mode=rebuild: بازسازی آفلاین از موتور داخلی (Umm al-Qura) — پشتیبانِ قطع شبکه.
 * ردیف‌های دستی (manual) مدیر هرگز بازنویسی/حذف نمی‌شوند.
 * پس از دریافت دادهٔ رسمی، اختلاف عدد قمری رسمی با موتور Umm al-Qura به‌صورت
 * «کالیبراسیون» در Setting «hijri.calibration» ذخیره می‌شود (به‌ازای هر ماه هجری ±)
 * تا نمایش هجریِ همهٔ تقویم‌های سامانه با تقویم رسمی ایران هم‌ساز شود.
 */

const DATA_BASE = 'https://raw.githubusercontent.com/hasan-ahani/shamsi-holidays/main/holidays'

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
function toLatinDigits(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, (d) => {
    const fi = FA_DIGITS.indexOf(d)
    if (fi >= 0) return String(fi)
    return String(AR_DIGITS.indexOf(d))
  })
}

const HIJRI_MONTH_NAMES: Record<string, number> = {
  'محرم': 1, 'صفر': 2, 'ربیع الاول': 3, 'ربیع‌الاول': 3, 'ربیع الثانی': 4, 'ربیع‌الثانی': 4,
  'جمادی الاول': 5, 'جمادی‌الاول': 5, 'جمادی الثانیه': 6, 'جمادی‌الثانیه': 6, 'جمادی الثانی': 6, 'جمادی‌الثانی': 6,
  'رجب': 7, 'شعبان': 8, 'رمضان': 9, 'شوال': 10, 'ذی القعده': 11, 'ذی‌القعده': 11,
  'ذی الحجه': 12, 'ذی‌الحجه': 12, 'ذوالقعده': 11, 'ذوالحجه': 12,
}

/** «١٣ رجب» → {hd:13, hm:7} | null */
function parseHijriLabel(label: string): { hd: number; hm: number } | null {
  const latin = toLatinDigits(label).trim()
  const m = latin.match(/(\d{1,2})\s*([^\s\d]+)/)
  if (!m) return null
  const hd = Number(m[1])
  const hm = HIJRI_MONTH_NAMES[m[2].replace(/\u200c/g, '').replace(/\u200e/g, '')]
    ?? HIJRI_MONTH_NAMES[m[2]]
  if (!hd || !hm) return null
  return { hd, hm }
}

type OfficialRow = { date: string; events: { description: string; is_holiday: boolean }[] }

async function fetchOfficialYear(jy: number, errors: string[]): Promise<OfficialRow[] | null> {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(`${DATA_BASE}/${jy}.json`, { signal: controller.signal, cache: 'no-store' })
    clearTimeout(t)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error('قالب داده نامعتبر است')
    return data as OfficialRow[]
  } catch (e: any) {
    errors.push(`سال ${jy}: دریافت از منبع رسمی ناموفق (${e?.message || 'خطا'}) — موتور داخلی جایگزین شد`)
    return null
  }
}

async function syncOneYear(jy: number, official: OfficialRow[] | null, stats: { added: number; updated: number; removed: number }) {
  const start = jalaliToIso(jy, 1, 1)
  const end = jalaliToIso(jy, 12, jMonthLength(jy, 12))

  // جایگزینی کامل ردیف‌های غیر دستی این سال (official > builtin)؛ manual دست‌نخورده
  const del = await db.holiday.deleteMany({
    where: { date: { gte: start, lte: end }, source: { not: 'manual' } },
  })
  stats.removed += del.count

  if (official && official.length > 0) {
    for (const row of official) {
      const jm = Number(row.date.slice(5, 7))
      const jd = Number(row.date.slice(8, 10))
      if (!jm || !jd || jm < 1 || jm > 12) continue
      let iso: string
      try {
        iso = jalaliToIso(jy, jm, jd)
      } catch {
        continue
      }
      for (const ev of row.events || []) {
        const raw = String(ev.description || '').trim()
        if (!raw) continue
        // استخراج برچسب قمری [ ١٣ رجب ]
        let hijriLabel = ''
        let title = raw
        const bracket = raw.match(/\[\s*([^\]]+)\s*\]\s*$/)
        if (bracket) {
          hijriLabel = toLatinDigits(bracket[1]).replace(/\d/g, (d) => FA_DIGITS[Number(d)])
          title = raw.replace(/\[[^\]]*\]\s*$/, '').trim()
        }
        const existing = await db.holiday.findUnique({ where: { date: iso } })
        if (existing) {
          // چند مناسبت در یک روز — ادغام عنوان، تعطیلی مقدم است
          const kind = ev.is_holiday ? 'HOLIDAY' : 'OCCASION'
          const mergedKind = existing.kind === 'HOLIDAY' || kind === 'HOLIDAY' ? 'HOLIDAY' : 'OCCASION'
          await db.holiday.update({
            where: { date: iso },
            data: { title: `${existing.title} / ${title}`, kind: mergedKind, source: 'official', hijriLabel: existing.hijriLabel || hijriLabel, solar: false },
          })
          stats.updated++
        } else {
          await db.holiday.create({
            data: { date: iso, title, kind: ev.is_holiday ? 'HOLIDAY' : 'OCCASION', hijriLabel, source: 'official', solar: false },
          })
          stats.added++
        }
      }
    }
    return true
  }

  // پشتیبان آفلاین: موتور داخلی
  const days = buildOfficialDays(jy)
  for (const d of days) {
    await db.holiday.create({
      data: { date: d.date, title: d.title, kind: d.kind, hijriLabel: d.hijriLabel, source: 'builtin', solar: d.solar },
    })
    stats.added++
  }
  return false
}

/** کالیبراسیون هجری: اختلاف عدد قمری رسمی با موتور Umm al-Qura per (hy-hm) */
async function buildHijriCalibration(years: number[]): Promise<Record<string, number>> {
  const start = jalaliToIso(years[0], 1, 1)
  const end = jalaliToIso(years[years.length - 1], 12, jMonthLength(years[years.length - 1], 12))
  const rows = await db.holiday.findMany({ where: { date: { gte: start, lte: end }, source: 'official', hijriLabel: { not: '' } } })
  const acc: Record<string, { sum: number; n: number }> = {}
  for (const r of rows) {
    const parsed = parseHijriLabel(r.hijriLabel)
    if (!parsed) continue
    const raw = isoToHijri(r.date) // umalqura
    if (raw.hm !== parsed.hm) continue // ماه متفاوت — لنگر نامعتبر برای کالیبراسیون
    const delta = parsed.hd - raw.hd
    if (Math.abs(delta) > 3) continue // بیرون از گنج کالیبراسیون (خطای داده)
    const key = `${raw.hy}-${raw.hm}`
    acc[key] = acc[key] || { sum: 0, n: 0 }
    acc[key].sum += delta
    acc[key].n++
  }
  const cal: Record<string, number> = {}
  for (const [k, v] of Object.entries(acc)) {
    const d = Math.round(v.sum / v.n)
    if (d !== 0) cal[k] = d
  }
  return cal
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  const canManage = !!me && ((await hasCap(me, 'holidays.manage')) || [me.role, ...me.secondaryRoles, ...safeParse<string[]>(me.roleIds || '[]', [])].includes('ACC'))
  if (!canManage) return fail('دسترسی غیرمجاز', 403)

  const body = await req.json().catch(() => ({}))
  const mode = String(body.mode || 'official')
  const bodyYear = Number(body.year)
  const years = bodyYear && bodyYear >= 1390 && bodyYear <= 1450 ? [bodyYear] : holidayYearsToKeep()

  const stats = { added: 0, updated: 0, removed: 0 }
  const errors: string[] = []
  const perYear: { year: number; official: boolean }[] = []

  // پاکسازی ردیف‌های «تقریبی» قدیمی seed — با هر منبعی
  try {
    const stale = await db.holiday.count({ where: { source: 'seed' } })
    if (stale > 0) {
      await db.holiday.deleteMany({ where: { source: 'seed' } })
      await logActivity(null, 'پاکسازی تعطیلات تقریبی قدیمی', 'holiday', '', `${stale} ردیف seed حذف شد`)
    }
  } catch { /* ignore */ }

  let officialUsed = 0
  for (const jy of years) {
    const official = mode === 'official' ? await fetchOfficialYear(jy, errors) : null
    const used = await syncOneYear(jy, official, stats)
    perYear.push({ year: jy, official: used })
    if (used) officialUsed++
  }

  // کالیبراسیون هجری از لنگرهای رسمی
  let calibration: Record<string, number> = {}
  if (officialUsed > 0) {
    try {
      calibration = await buildHijriCalibration(years)
      await db.setting.upsert({
        where: { key: 'hijri.calibration' },
        update: { value: JSON.stringify(calibration) },
        create: { key: 'hijri.calibration', value: JSON.stringify(calibration) },
      })
      setCalibration(calibration) // اعمال در همین فرایند
    } catch { /* کالیبراسیون اختیاری است */ }
  }

  await db.setting.upsert({
    where: { key: 'holidays.lastSync' },
    update: { value: JSON.stringify({ at: new Date().toISOString(), mode, officialUsed, by: me?.name || '' }) },
    create: { key: 'holidays.lastSync', value: JSON.stringify({ at: new Date().toISOString(), mode, officialUsed, by: me?.name || '' }) },
  })

  await logActivity(me, 'همگام‌سازی تقویم از منبع رسمی', 'holiday', '', `${years.join('،')} — ${stats.added} افزوده، ${stats.updated} ادغام، ${stats.removed} بازنویسی؛ کالیبراسیون قمری: ${Object.keys(calibration).length} ماه`)
  return json({ ok: true, mode, years, perYear, ...stats, calibration, errors })
}

// GET — وضعیت همگام‌سازی (آخرین زمان، منبع، کالیبراسیون فعلی)
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  const canManage = !!me && ((await hasCap(me, 'holidays.manage')) || [me.role, ...me.secondaryRoles, ...safeParse<string[]>(me.roleIds || '[]', [])].includes('ACC'))
  if (!canManage) return fail('دسترسی غیرمجاز', 403)
  const last = await db.setting.findUnique({ where: { key: 'holidays.lastSync' } })
  const calRow = await db.setting.findUnique({ where: { key: 'hijri.calibration' } })
  const counts = await db.holiday.groupBy({ by: ['source'], _count: true })
  const jy = holidayYearsToKeep()
  // بررسی دسترسی شبکه برای نمایش وضعیت دکمه
  let sourceReachable: boolean | null = null
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(`${DATA_BASE}/${jy[1]}.json`, { method: 'HEAD', signal: controller.signal })
    clearTimeout(t)
    sourceReachable = res.ok
  } catch {
    sourceReachable = false
  }
  return json({
    lastSync: safeParse<{ at: string; mode: string; officialUsed: number; by: string } | null>(last?.value || '{}', null),
    calibration: safeParse<Record<string, number>>(calRow?.value || '{}', {}),
    counts: Object.fromEntries(counts.map((c) => [c.source, c._count])),
    keepYears: jy,
    sourceReachable,
  })
}
