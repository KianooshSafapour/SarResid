/**
 * scripts/seed-holidays.ts — تعطیلات رسمی و مذهبی سال‌های ۱۴۰۴ تا ۱۴۰۷
 * ------------------------------------------------------------------
 * Idempotent seed:
 *  • Official SOLAR events (fixed Jalali dates): نوروز، ۱۲ و ۱۳ فروردین،
 *    روز کارگر، ۱۴ و ۱۵ خرداد، ۲۲ بهمن، ۲۹ اسفند
 *  • ISLAMIC LUNAR events for Hijri years 1446–1450 computed with the tabular
 *    arithmetic Islamic calendar (Umm-al-Qura-style; matches Iran's official
 *    calendar within ±1 day) → titles carry the «(تقریبی)» suffix, kind=RELIGIOUS.
 *    Every event Hijri → Gregorian → Jalali 'YYYY-MM-DD' (dash-form in DB;
 *    UI always renders slashes + Persian digits).
 *
 * Idempotency: all non-CUSTOM holidays inside 1404-01-01 … 1407-12-29 are
 * deleted first (user-added CUSTOM rows survive), then the full computed set
 * is re-inserted with deterministic ids (hol-<date>-<n>).
 *
 * Run:  bun run scripts/seed-holidays.ts   (or: bunx tsx scripts/seed-holidays.ts)
 */
import { PrismaClient } from '@prisma/client'
import jalaali from '../src/lib/jalaali-core'

const db = new PrismaClient()

/* ═══════════════════ 1) تبدیل تقویم (بدون وابستگی خارجی) ═══════════════════ */

/** تقویم هجری قمری جدولی (الگوریتم کویت/ام‌القری) — دقیق تا ±۱ روز برای ۱۴۴۶–۱۴۵۰ */
function islamicToJdn(hy: number, hm: number, hd: number): number {
  return hd + Math.ceil(29.5 * (hm - 1)) + (hy - 1) * 354 + Math.floor((3 + 11 * hy) / 30) + 1948439
}

function gregorianToJdn(gy: number, gm: number, gd: number): number {
  const a = Math.floor((14 - gm) / 12)
  const y = gy + 4800 - a
  const m = gm + 12 * a - 3
  return gd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045
}

function jdnToGregorian(jdn: number): { gy: number; gm: number; gd: number } {
  const a = jdn + 32044
  const b = Math.floor((4 * a + 3) / 146097)
  const c = a - Math.floor((b * 146097) / 4)
  const d = Math.floor((4 * c + 3) / 1461)
  const e = c - Math.floor((1461 * d) / 4)
  const m = Math.floor((5 * e + 2) / 153)
  return {
    gy: b * 100 + d - 4800 + Math.floor(m / 10),
    gm: m + 3 - 12 * Math.floor(m / 10),
    gd: e - Math.floor((153 * m + 2) / 5) + 1,
  }
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))

/** هجری قمری → شمسی «YYYY-MM-DD» */
function islamicToJalaliDash(hy: number, hm: number, hd: number): string {
  const jdn = islamicToJdn(hy, hm, hd)
  const j = jalaali.d2j(jdn)
  return `${j.jy}-${pad2(j.jm)}-${pad2(j.jd)}`
}

/** میلادی → شمسی «YYYY-MM-DD» */
function gregorianToJalaliDash(gy: number, gm: number, gd: number): string {
  const j = jalaali.d2j(gregorianToJdn(gy, gm, gd))
  return `${j.jy}-${pad2(j.jm)}-${pad2(j.jd)}`
}

/* ═══════════════════ 2) رویدادها ═══════════════════ */

const JY_FROM = 1404
const JY_TO = 1407
const RANGE_FROM = `${JY_FROM}-01-01`
const RANGE_TO = `${JY_TO}-12-29` // اسفند غیرکبیسه؛ ۱۴۰۷ کبیسه نیست

/** تعطیلات رسمی شمسی — ماه/روز ثابت در تقویم جلالی (kind=NATIONAL) */
const SOLAR_EVENTS: Array<{ m: number; d: number; title: string }> = [
  { m: 1, d: 1, title: 'نوروز — جشن سال نو' },
  { m: 1, d: 2, title: 'عیدنوروز' },
  { m: 1, d: 3, title: 'عیدنوروز' },
  { m: 1, d: 4, title: 'عیدنوروز' },
  { m: 1, d: 12, title: 'روز جمهوری اسلامی' },
  { m: 1, d: 13, title: 'روز طبیعت' },
  { m: 2, d: 11, title: 'روز جهانی کارگر' },
  { m: 3, d: 14, title: 'وفات امام خمینی' },
  { m: 3, d: 15, title: 'قیام خونین ۱۵ خرداد' },
  { m: 11, d: 22, title: 'پیروزی انقلاب اسلامی' },
  { m: 12, d: 29, title: 'روز ملی شدن صنعت نفت ایران' },
]

/** مناسبت‌های مذهبی هجری قمری (kind=RELIGIOUS) — همه «(تقریبی)» به‌دلیل ±۱ روز */
const LUNAR_EVENTS: Array<{ hy: number; hm: number; hd: number; title: string }> = []

const LUNAR_DEFS: Array<{ hm: number; hd: number; title: string }> = [
  { hm: 1, hd: 1, title: 'آغاز سال نو هجری قمری' },
  { hm: 1, hd: 9, title: 'تاسوعای حسینی' },
  { hm: 1, hd: 10, title: 'عاشورای حسینی' },
  { hm: 2, hd: 20, title: 'اربعین حسینی' },
  { hm: 2, hd: 28, title: 'رحلت رسول اکرم و شهادت امام حسن مجتبی' },
  { hm: 3, hd: 8, title: 'شهادت امام حسن عسکری' },
  { hm: 3, hd: 17, title: 'میلاد رسول اکرم و امام جعفر صادق' },
  { hm: 6, hd: 3, title: 'شهادت حضرت فاطمه زهرا' },
  { hm: 7, hd: 13, title: 'ولادت امام علی' },
  { hm: 7, hd: 15, title: 'وفات حضرت فاطمه معصومه' },
  { hm: 7, hd: 27, title: 'مبعث رسول اکرم' },
  { hm: 8, hd: 15, title: 'ولادت حضرت قائم — نیمه شعبان' },
  { hm: 9, hd: 1, title: 'آغاز ماه مبارک رمضان' },
  { hm: 9, hd: 21, title: 'شهادت امام علی' },
  { hm: 10, hd: 1, title: 'عید سعید فطر' },
  { hm: 12, hd: 10, title: 'عید سعید قربان' },
  { hm: 12, hd: 18, title: 'عید سعید غدیر خم' },
]

/* سال‌های هجری لازم برای پوشش ۱۴۰۴–۱۴۰۷ شمسی */
for (let hy = 1446; hy <= 1450; hy++) {
  for (const def of LUNAR_DEFS) {
    LUNAR_EVENTS.push({ hy, hm: def.hm, hd: def.hd, title: `${def.title} (تقریبی)` })
  }
}

/* ═══════════════════ 3) ساخت ردیف‌ها ═══════════════════ */

interface Row { id: string; date: string; title: string; kind: string }

const rows: Row[] = []

// — شمسی —
for (let jy = JY_FROM; jy <= JY_TO; jy++) {
  for (const ev of SOLAR_EVENTS) {
    if (ev.m === 12 && ev.d === 29 && jalaali.jalaaliMonthLength(jy, 12) < 29) continue
    const date = `${jy}-${pad2(ev.m)}-${pad2(ev.d)}`
    rows.push({ id: '', date, title: ev.title, kind: 'NATIONAL' })
  }
}

// — قمری —
for (const ev of LUNAR_EVENTS) {
  const date = islamicToJalaliDash(ev.hy, ev.hm, ev.hd)
  if (date < RANGE_FROM || date > RANGE_TO) continue // فقط داخل بازه پوشش
  rows.push({ id: '', date, title: ev.title, kind: 'RELIGIOUS' })
}

// مرتب‌سازی + شناسه قطعی (id پایدار برای هر اجرا)
rows.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title, 'fa') : a.date < b.date ? -1 : 1))
const perDate = new Map<string, number>()
for (const r of rows) {
  const n = perDate.get(r.date) ?? 0
  perDate.set(r.date, n + 1)
  r.id = `hol-${r.date}-${n}`
}

/* ═══════════════════ 4) اعتبارسنجی تبدیل‌ها ═══════════════════ */

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    console.error(`✗ تبدیل نامعتبر — ${label}: ${String(actual)} ≠ ${String(expected)}`)
    process.exit(1)
  }
}

// ۱ محرم ۱۴۴۷ = ۲۷ ژوئن ۲۰۲۵ (تقویم رسمی ایران) — ۲۷ ژوئن ۲۰۲۵ = ۱۴۰۴/۰۴/۰۶
assertEq(jdnToGregorian(islamicToJdn(1447, 1, 1)).gy, 2025, '1 Muharram 1447 year')
assertEq(jdnToGregorian(islamicToJdn(1447, 1, 1)).gm, 6, '1 Muharram 1447 month')
assertEq(jdnToGregorian(islamicToJdn(1447, 1, 1)).gd, 27, '1 Muharram 1447 day')
// ۱ شوال ۱۴۴۷ (عید فطر) = ۲۰ مارس ۲۰۲۶ = ۱۴۰۴/۱۲/۲۹
assertEq(islamicToJalaliDash(1447, 10, 1), '1404-12-29', 'Eid al-Fitr 1447 → Jalali')
// ۱ فروردین ۱۴۰۵ = ۲۱ مارس ۲۰۲۶
assertEq(gregorianToJalaliDash(2026, 3, 21), '1405-01-01', 'Nowruz 1405')
// عاشورای ۱۴۴۷ = ۶ ژوئیه ۲۰۲۵ (رسمی ایران)
assertEq(jdnToGregorian(islamicToJdn(1447, 1, 10)).gd, 6, 'Ashura 1447 day')

/* ═══════════════════ 5) اجرا ═══════════════════ */

async function main() {
  const before = await db.holiday.findMany({ where: { date: { gte: RANGE_FROM, lte: RANGE_TO } } })
  const beforeCustom = before.filter((h) => h.kind === 'CUSTOM').length
  console.log(`تعطیلات موجود در بازه ${RANGE_FROM}…${RANGE_TO}: ${before.length} ردیف (${beforeCustom} اختصاصی کاربر — حفظ می‌شود)`)

  // idempotent: حذف ردیف‌های غیر CUSTOM در بازه پوشش
  const del = await db.holiday.deleteMany({
    where: { date: { gte: RANGE_FROM, lte: RANGE_TO }, NOT: { kind: 'CUSTOM' } },
  })
  console.log(`حذف ردیف‌های قبلی غیراختصاصی: ${del.count}`)

  await db.holiday.createMany({ data: rows })
  console.log(`درج ردیف‌های جدید: ${rows.length}`)

  /* ── گزارش شمارش بر اساس نوع ── */
  const all = await db.holiday.findMany({ orderBy: { date: 'asc' } })
  const byKind: Record<string, number> = {}
  for (const h of all) byKind[h.kind] = (byKind[h.kind] ?? 0) + 1
  console.log('\n— شمارش کل تعطیلات پس از seed —')
  for (const [k, v] of Object.entries(byKind)) console.log(`  ${k}: ${v}`)
  console.log(`  جمع: ${all.length}`)

  /* ── جدول راستی‌آزمایی: رویدادهای دی ۱۴۰۵ ── */
  const dey = all.filter((h) => h.date >= '1405-10-01' && h.date <= '1405-10-30')
  console.log('\n— رویدادهای ماه دی ۱۴۰۵ (۲۲ دسامبر ۲۰۲۶ تا ۲۰ ژانویه ۲۰۲۷) —')
  if (dey.length === 0) {
    console.error('✗ هیچ رویدادی برای دی ۱۴۰۵ محاسبه نشد!')
    process.exit(1)
  }
  for (const h of dey) console.log(`  ${h.date.replace(/-/g, '/')} | ${h.title} | ${h.kind}`)

  /* ── نمونه‌های کنترلی دیگر ── */
  const sample = await db.holiday.findMany({
    where: { OR: [{ date: '1405-04-04' }, { date: '1405-04-05' }, { date: '1404-06-01' }] },
    orderBy: { date: 'asc' },
  })
  console.log('\n— نمونه کنترلی (تاسوعا/عاشورای ۱۴۴۷ و عید قربان ۱۴۴۶) —')
  for (const h of sample) console.log(`  ${h.date.replace(/-/g, '/')} | ${h.title}`)

  console.log('\n✔ seed-holidays کامل شد.')
}

main()
  .catch((e) => {
    console.error('✗ خطا:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
