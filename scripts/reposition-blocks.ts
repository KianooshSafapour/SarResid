/**
 * scripts/reposition-blocks.ts — چیدمان منطقیِ ۴۴ بلوک نقشهٔ فروشگاه روی کانتور واقعی
 * (ذوزنقهٔ ۱۵۳۲×۲۰۱۰ سانتی‌متر با دو چفدورِ در در ساحل جنوبی).
 *
 * مشکل: بلوک‌ها در «نقشهٔ واقعی» فقط به‌صورت مکانیکی از نقشهٔ عریضِ قدیمی
 * (۲۸۴۰×۱۵۴۰) مقیاس شده بودند → لهیده/جاافتاده؛ صندوق‌ها سمت غرب (کنار خروجی)
 * بودند، درها وسط دیوار جنوبی و گوندولاها بی‌نظم.
 *
 * این اسکریپت چیدمان واقع‌گرایانهٔ یک هایپرمارکت را اعمال می‌کند:
 *  - دیوار شمالی: یخچال/فریزر و ویترین سرد + قفسهٔ دیوار شمالیِ بخش چپ
 *  - گوشهٔ شمال‌شرقی و دیوار شرقی: بستنی‌ها (۶ فریزر) + قفسهٔ آجیل و تخمه
 *  - مرکز: شبکهٔ گوندولا با راهرو — دو ردیف افقی (گ۵/گ۶) در شمال و چهار
 *    گوندولای عمودی (گ۱..گ۴) با کلاهک‌های سر شمالی/جنوبی در جنوب‌تر
 *  - جنوب‌شرقی (چفدور ورودی): صندوق‌ها + مسیر پرداخت + قفسه‌های خدماتی
 *  - جنوب‌غربی (سمت خروجی): میز شیرینی و اسباب‌بازی (نزدیک جریان خروج)
 *  - نشانگرهای ورودی/خروجی داخل چفدورهای خودشان
 *
 * قواعد اعتبارسنجی (همه باید پاس شوند وگرنه اسکریپت DB را دست نمی‌زند):
 *  1. هر بلوکِ غیر از ENTRANCE باید «کاملاً داخل» کانتور باشد (آزمون نقطه-در-چندضلعی
 *     برای هر ۴ گوشه).
 *  2. بلوک‌های ENTRANCE باید داخل مستطیل چفدور در خودشان باشند (چفدورها جزء
 *     ساختمان‌اند، نه کف فروش؛ نشانگر در، در جای در).
 *  3. هیچ جفت بلوکی هم‌پوشانی نداشته باشد (بررسی هم‌پوشانی + رانش خودکار
 *     ۱۰سانتی‌متری تا صفر شدن).
 *  4. دهانهٔ درها باز بماند: مستطیل پاکسازیِ هر در (دهانه ± ۱۰۰سانتی به داخل
 *     فروشگاه) نباید هیچ بلوکی به‌جز نشانگر ENTRANCE داشته باشد.
 *
 * Idempotent: در اولین اجرا پشتیبانِ موقعیت‌های فعلی در
 * scripts/data/blocks-backup.json ذخیره می‌شود؛ در اجراهای بعدی، ابتدا همان
 * پشتیبان بازگردانی می‌شود (خط پایه) و بعد چیدمان جدید اعمال می‌شود — یعنی
 * اجرای مکرر همیشه به همان نتیجهٔ نهایی می‌رسد.
 *
 * Run: bunx tsx scripts/reposition-blocks.ts
 */
import { PrismaClient } from '@prisma/client'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const db = new PrismaClient()
const BACKUP = join(__dirname, 'data', 'blocks-backup.json')

type Box = { x: number; y: number; w: number; h: number }
type BlockRow = { id: string; kind: string; label: string | null; x: number; y: number; w: number; h: number }

/* ══════════════ ۱) هندسه ══════════════ */

/** آزمون نقطه-در-چندضلعی (ray casting) */
function pointInPoly(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/** آیا مستطیل کاملاً داخل چندضلعی است؟ (هر ۴ گوشه + مرکز) */
function boxInPoly(b: Box, poly: [number, number][]): boolean {
  const corners: [number, number][] = [
    [b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h], [b.x + b.w / 2, b.y + b.h / 2],
  ]
  return corners.every(([cx, cy]) => pointInPoly(cx, cy, poly))
}

/** هم‌پوشانی دو مستطیل (با حاشیهٔ ۰) */
function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

const snap10 = (v: number) => Math.round(v / 10) * 10

/** چفدورها (بازشوی در) از روی کانتور: یال‌های افقیِ «داخلی» — همان لبهٔ دهانهٔ در */
function doorRecesses(poly: [number, number][]): { label: 'ورودی' | 'خروجی'; rect: Box; opening: { x1: number; x2: number; y: number } }[] {
  const maxY = Math.max(...poly.map((p) => p[1]))
  const minY = Math.min(...poly.map((p) => p[1]))
  const epsH = (maxY - minY) * 0.01
  const epsIn = (maxY - minY) * 0.03
  const out: { label: 'ورودی' | 'خروجی'; rect: Box; opening: { x1: number; x2: number; y: number } }[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    if (Math.abs(p[1] - q[1]) > epsH) continue // فقط یال افقی
    const y = p[1]
    if (y < minY + epsIn || y > maxY - epsIn) continue // یال «داخلی» = لبهٔ دهانهٔ در، نه لبهٔ بیرونی
    const x1 = Math.min(p[0], q[0])
    const x2 = Math.max(p[0], q[0])
    if (x2 - x1 < 100) continue // دهانهٔ در ≥ ۱ متر
    // مستطیل چفدور = از لبهٔ دهانه تا دیوار بیرونی (سمت maxY)
    const yOuter = maxY
    out.push({ label: 'در', rect: { x: x1, y, w: x2 - x1, h: yOuter - y }, opening: { x1, x2, y } })
  }
  // شرقی = ورودی، غربی = خروجی (هم‌قرارداد کشف درِ viewها)
  out.sort((a, b) => b.rect.x - a.rect.x)
  if (out.length >= 1) out[0].label = 'ورودی'
  if (out.length >= 2) out[out.length - 1].label = 'خروجی'
  return out
}

/* ══════════════ ۲) چیدمان هدف (سانتی‌متر، مضرب ۱۰) ══════════════ */
/* نگاشت برچسب بلوک → هندسهٔ جدید؛ kind/zone/meta دست نخورده می‌ماند. */
const LAYOUT: Record<string, Box> = {
  /* — دیوار شمالی: فسادپذیر + قفسهٔ دیوار شمالیِ بخش چپ — */
  'قفسه دیوار شمالیِ بخش چپ': { x: 20, y: 10, w: 437, h: 196 },
  'ویترین سرد': { x: 480, y: 10, w: 280, h: 180 },
  'یخچال': { x: 780, y: 10, w: 90, h: 180 },
  'یخچال باز': { x: 890, y: 10, w: 290, h: 180 },
  'فریزر محصولات منجمد': { x: 1210, y: 10, w: 140, h: 390 },
  /* — گوشهٔ شمال‌شرقی: فریزرهای بستنی (۳×۲) — */
  'بستنی A': { x: 1200, y: 430, w: 90, h: 240 },
  'بستنی B': { x: 1320, y: 430, w: 90, h: 240 },
  'بستنی C': { x: 1440, y: 430, w: 90, h: 240 },
  'بستنی D': { x: 1200, y: 700, w: 90, h: 240 },
  'بستنی E': { x: 1320, y: 700, w: 90, h: 240 },
  'بستنی F': { x: 1440, y: 700, w: 90, h: 240 },
  /* — دیوار شرقی (زیر بستنی‌ها) — */
  'قفسه آجیل و تخمه': { x: 1490, y: 980, w: 40, h: 720 },
  /* — دیوار غربی — */
  'قفسه دیوار غربی': { x: 10, y: 300, w: 40, h: 740 },
  /* — مرکز، نوار شمالی: دو گوندولای افقی + کلاهک‌های شرقی/غربی — */
  'گوندولا ۵': { x: 140, y: 300, w: 420, h: 270 },
  'گ۵ — سر غربی': { x: 90, y: 310, w: 40, h: 250 },
  'گ۵ — سر شرقی': { x: 570, y: 310, w: 40, h: 250 },
  'گوندولا ۶': { x: 700, y: 300, w: 420, h: 270 },
  'گ۶ — سر غربی': { x: 650, y: 310, w: 40, h: 250 },
  'گ۶ — سر شرقی': { x: 1130, y: 310, w: 40, h: 250 },
  /* — مرکز، شبکهٔ اصلی: چهار گوندولای عمودی + کلاهک‌ها (گوشه‌ها با -۱۰) — */
  'گوندولا ۱': { x: 150, y: 700, w: 92, h: 760 },
  'گ۱ — سر شمالی': { x: 140, y: 610, w: 110, h: 80 },
  'گ۱ — سر جنوبی': { x: 140, y: 1480, w: 110, h: 80 },
  'گوندولا ۲': { x: 350, y: 700, w: 92, h: 760 },
  'گ۲ — سر شمالی': { x: 340, y: 610, w: 110, h: 80 },
  'گ۲ — سر جنوبی': { x: 340, y: 1480, w: 110, h: 80 },
  'گوندولا ۳': { x: 550, y: 700, w: 92, h: 760 },
  'گ۳ — سر شمالی': { x: 540, y: 610, w: 110, h: 80 },
  'گ۳ — سر جنوبی': { x: 540, y: 1480, w: 110, h: 80 },
  'گوندولا ۴': { x: 750, y: 700, w: 92, h: 760 },
  'گ۴ — سر شمالی': { x: 740, y: 610, w: 110, h: 80 },
  'گ۴ — سر جنوبی': { x: 740, y: 1480, w: 110, h: 80 },
  /* — نشانگرهای در، داخل چفدورهای خودشان — */
  'ورودی': { x: 1090, y: 1900, w: 210, h: 80 }, // چفدور شرقی (ورودی)
  'خروجی': { x: 160, y: 1900, w: 210, h: 80 }, // چفدور غربی (خروجی)
  /* — جنوب‌غربی (سمت خروجی): میز شیرینی و اسباب‌بازی — */
  'میز شیرینی و بیسکویت': { x: 150, y: 1570, w: 290, h: 140 },
  'اسباب‌بازی': { x: 470, y: 1570, w: 110, h: 180 },
  /* — جنوب‌شرقی (چفدور ورودی): ناحیهٔ صندوق و خدماتی — */
  'قفسه پشت صندوق': { x: 1000, y: 1140, w: 394, h: 144 },
  'قفسه روبه‌روی صندوق': { x: 1000, y: 1290, w: 394, h: 144 },
  'قفسه کنارِ چپ صندوق': { x: 940, y: 1140, w: 54, h: 300 },
  'قفسه کنارِ راست صندوق': { x: 1410, y: 1140, w: 54, h: 300 },
  'مسیر پرداخت': { x: 1000, y: 1450, w: 400, h: 90 },
  'صندوق ۱': { x: 1000, y: 1550, w: 86, h: 170 },
  'صندوق ۲': { x: 1110, y: 1550, w: 86, h: 170 },
  'صندوق ۳': { x: 1220, y: 1550, w: 86, h: 170 },
  'صندوق ۴': { x: 1330, y: 1550, w: 86, h: 170 },
}

/* ══════════════ ۳) گزارش‌ها ══════════════ */

function overlapPairs(blocks: (BlockRow & Box)[]): [string, string][] {
  const pairs: [string, string][] = []
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (overlaps(blocks[i], blocks[j])) {
        pairs.push([blocks[i].label || blocks[i].id, blocks[j].label || blocks[j].id])
      }
    }
  }
  return pairs
}

function polygonViolations(blocks: (BlockRow & Box)[], poly: [number, number][]): string[] {
  return blocks.filter((b) => !boxInPoly(b, poly)).map((b) => b.label || b.id)
}

function doorViolations(blocks: (BlockRow & Box)[], doors: ReturnType<typeof doorRecesses>): string[] {
  const bad: string[] = []
  for (const b of blocks) {
    if (b.kind === 'ENTRANCE') continue
    for (const d of doors) {
      // پاکسازی: دهانهٔ در + ۱۰۰سانتی به داخل فروشگاه (بالاتر از خط در)
      const clear: Box = { x: d.opening.x1, y: d.opening.y - 100, w: d.opening.x2 - d.opening.x1, h: 100 }
      if (overlaps(b, clear)) bad.push(`${b.label || b.id} ↔ دهانهٔ ${d.label}`)
    }
  }
  return bad
}

/* ══════════════ ۴) اجرا ══════════════ */

async function main() {
  const plan = await db.floorplan.findFirst({ orderBy: { id: 'asc' }, include: { blocks: true } })
  if (!plan) { console.error('✗ هیچ نقشه‌ای یافت نشد'); process.exit(1) }

  let poly: [number, number][] | null = null
  try {
    const o = plan.outlineJson ? JSON.parse(plan.outlineJson) : null
    if (Array.isArray(o) && o.length >= 4) poly = o.map((p: any) => [Number(p[0]), Number(p[1])])
  } catch { /* outlineJson نامعتبر */ }
  if (!poly) { console.error('✗ کانتور واقعی (outlineJson) روی نقشه ثبت نشده — ابتدا scripts/apply-real-outline.ts را اجرا کنید'); process.exit(1) }
  const doors = doorRecesses(poly)
  console.log(`plan: ${plan.name} (${plan.width}×${plan.height}) — ${plan.blocks.length} بلوک`)
  console.log(`درها: ${doors.map((d) => `${d.label} دهانهٔ ${d.opening.x2 - d.opening.x1}سانتی در y=${d.opening.y}`).join(' · ')}`)

  /* — گزارش وضعیت فعلی (قبل از هر تغییری) — */
  const beforeBlocks = plan.blocks.map((b) => ({ ...b })) as (BlockRow & Box)[]
  const beforeOverlaps = overlapPairs(beforeBlocks)
  const beforePoly = polygonViolations(beforeBlocks.filter((b) => b.kind !== 'ENTRANCE'), poly)
  console.log(`\n— وضعیت فعلی: ${beforeOverlaps.length} هم‌پوشانی، ${beforePoly.length} بیرون‌زدگی از کانتور`)
  if (beforeOverlaps.length) console.log('  جفت‌های هم‌پوشان فعلی:', beforeOverlaps.map(([a, b]) => `${a} × ${b}`).join('، '))

  /* — پشتیبان/بازگردانی (idempotent) — */
  mkdirSync(dirname(BACKUP), { recursive: true })
  let baseline: (BlockRow & Box)[]
  if (existsSync(BACKUP)) {
    const saved = JSON.parse(readFileSync(BACKUP, 'utf8'))
    baseline = saved.blocks
    console.log(`\n↺ پشتیبان موجود است — بازگردانی ${baseline.length} بلوک از ${BACKUP} به‌عنوان خط پایه`)
    for (const b of baseline) {
      await db.floorBlock.update({ where: { id: b.id }, data: { x: b.x, y: b.y, w: b.w, h: b.h } })
    }
  } else {
    baseline = beforeBlocks
    writeFileSync(BACKUP, JSON.stringify({
      planId: plan.id, savedAt: new Date().toISOString(), note: 'پشتیبان موقعیت بلوک‌ها پیش از reposition-blocks',
      blocks: plan.blocks.map((b) => ({ id: b.id, kind: b.kind, label: b.label, x: b.x, y: b.y, w: b.w, h: b.h, rotation: b.rotation })),
    }, null, 2))
    console.log(`\n✓ پشتیبان ${baseline.length} بلوک در ${BACKUP} ذخیره شد`)
  }

  /* — اعمال چیدمان جدید — */
  const missing: string[] = []
  const applied: (BlockRow & Box)[] = []
  for (const b of baseline) {
    const label = b.label || ''
    const box = LAYOUT[label]
    if (!box) { missing.push(label || b.id); applied.push({ ...b }); continue }
    const nb = { x: snap10(box.x), y: snap10(box.y), w: snap10(box.w), h: snap10(box.h) }
    await db.floorBlock.update({ where: { id: b.id }, data: nb })
    applied.push({ ...b, ...nb })
  }
  if (missing.length) {
    console.warn(`⚠ ${missing.length} بلوک در چیدمان تعریف نشد (جایشان دست نخورد): ${missing.join('، ')}`)
  }

  /* — رانش خودکار تا صفر شدن هم‌پوشانی‌ها — */
  let pairs = overlapPairs(applied)
  let nudges = 0
  while (pairs.length && nudges < 200) {
    const [a] = pairs[0]
    const blk = applied.find((p) => (p.label || p.id) === a)
    if (!blk) break
    blk.y = snap10(blk.y + 10) // ۱۰سانتی به سمت جنوب
    nudges++
    pairs = overlapPairs(applied)
  }

  /* — اعتبارسنجی نهایی — */
  const nonEntrance = applied.filter((b) => b.kind !== 'ENTRANCE')
  const polyBad = polygonViolations(nonEntrance, poly)
  const doorBad = doorViolations(applied, doors)
  // نشانگرهای در: باید داخل چفدور خودشان باشند
  const entranceBad: string[] = []
  for (const b of applied.filter((x) => x.kind === 'ENTRANCE')) {
    const recess = doors.find((d) => d.label === b.label)
    const inRect = recess && b.x >= recess.rect.x && b.y >= recess.rect.y
      && b.x + b.w <= recess.rect.x + recess.rect.w && b.y + b.h <= recess.rect.y + recess.rect.h
    if (!inRect) entranceBad.push(b.label || b.id)
  }

  console.log(`\n— اعتبارسنجی چیدمان جدید:`)
  console.log(`  هم‌پوشانی: ${pairs.length} جفت${nudges ? ` (پس از ${nudges} رانش خودکار)` : ''}${pairs.length ? ' → ' + pairs.map(([a, b]) => `${a} × ${b}`).join('، ') : ''}`)
  console.log(`  بیرون‌زدگی از کانتور: ${polyBad.length}${polyBad.length ? ' → ' + polyBad.join('، ') : ''}`)
  console.log(`  مانع دهانهٔ درها: ${doorBad.length}${doorBad.length ? ' → ' + doorBad.join('، ') : ''}`)
  console.log(`  جای نشانگرهای ورودی/خروجی: ${entranceBad.length ? 'نامعتبر → ' + entranceBad.join('، ') : 'داخل چفدور خودشان ✓'}`)

  if (pairs.length || polyBad.length || doorBad.length || entranceBad.length) {
    console.error('\n✗ چیدمان پاس نشد — تغییرات روی DB مانده اما باید اصلاح شود (بازگردانی: پشتیبان + اجرای دوباره)')
    process.exit(1)
  }

  /* — ذخیرهٔ نهایی موقعیت‌ها (پس از رانش‌های احتمالی) — */
  for (const b of applied) {
    const orig = baseline.find((o) => o.id === b.id)!
    if (orig.x !== b.x || orig.y !== b.y || orig.w !== b.w || orig.h !== b.h) {
      await db.floorBlock.update({ where: { id: b.id }, data: { x: b.x, y: b.y, w: b.w, h: b.h } })
    }
  }

  const zones = new Map<string, number>()
  for (const b of applied) zones.set(b.kind, (zones.get(b.kind) || 0) + 1)
  console.log(`\n✓ ${applied.length} بلوک در چیدمان جدید نشست (kind/label/zone/meta دست‌نخورده)`)
  console.log('  خلاصه: ' + [...zones.entries()].map(([k, n]) => `${k}×${n}`).join(' · '))
  process.exit(0)
}

main()
