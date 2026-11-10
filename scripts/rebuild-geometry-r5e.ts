/**
 * rebuild-geometry-r5e.ts — بازسازی هندسهٔ نقشهٔ فروشگاه بر پایهٔ مشخصات دقیق مالک (R5-E)
 * --------------------------------------------------------------------------------
 * فروشگاه واقعی: ۳۱ خانه طول (راست‌به‌چپ، افقی) × ۱۵ خانه عرض (بالا‌به‌پایین، عمودی)،
 * هر خانه ۸۰×۸۰ سانتی‌متر → بوم ۲۴۸۰×۱۲۰۰ سانتی‌متر (۲۴٫۸م × ۱۲م).
 * گوشهٔ پایین‌چپ پخ‌مورب ۴۵° دارد: برش ۳ خانه طول × ۳ خانه عرض (۲۴۰×۲۴۰ سانتی‌متر).
 * چیدمان بلوک‌ها مطابق نقشهٔ دستی مالک (upload/hyper-zeytoon.PNG — تحلیل VLM چهارسو):
 *   - نوار سرد (ویترین/یخچال/یخچال باز) روی دیوار شمالی، قفسهٔ دیوار شمالیِ چپ
 *   - ۴ گوندولای عمودی مرکزی (۳ راهرو) + ۲ گوندولای افقی کوچک‌تر سمت چپ
 *   - بستنی A..F + فریزر منجمد + قفسهٔ آجیل سمت راست
 *   - خروجی پایین‌چپ (کنار پخ) · صندوق‌ها و قفسه‌های اطرافش پایین‌چپ، نزدیک خروجی
 *   - ورودی پایین‌راست (جریان خرید راست‌به‌چپ) · میز شیرینی و اسباب‌بازی کنار ورودی
 * + تغییر نام ستون‌ها: «ستون ۱..n» → «ردیف ۱..n» (خواستهٔ مالک — ردیف کالا روی قفسه)
 * idempotent: اگر هندسهٔ R5-E قبلاً اعمال شده باشد، فقط تغییرنام‌ها (بی‌ضرر) اجرا می‌شود.
 * اجرا: bunx tsx scripts/rebuild-geometry-r5e.ts
 */
import { db } from '../src/lib/db'

/** خانه = ۸۰×۸۰ سانتی‌متر */
const TILE = 80
/** طول ۳۱ خانه = ۲۴۸۰ سانتی‌متر؛ عرض ۱۵ خانه = ۱۲۰۰ سانتی‌متر */
const PLAN_W = 31 * TILE // 2480
const PLAN_H = 15 * TILE // 1200
/** پخ مورب گوشهٔ پایین‌چپ: ۳ خانه × ۳ خانه */
const CHAMFER = 3 * TILE // 240

/** کانتور ۵‌رأس: از گوشهٔ بالا‌چپ، ساعت‌گرد — پخ از (۲۴۰,۱۲۰۰) تا (۰,۹۶۰) */
const OUTLINE: [number, number][] = [
  [0, 0],
  [PLAN_W, 0],
  [PLAN_W, PLAN_H],
  [CHAMFER, PLAN_H],
  [0, PLAN_H - CHAMFER],
]

/** چیدمان تازهٔ ۴۴ بلوک (سانتی‌متر) — برچسب → [x, y, w, h] */
const LAYOUT: Record<string, [number, number, number, number]> = {
  // ── نوار سرد دیوار شمالی ──
  'قفسه دیوار شمالیِ بخش چپ': [10, 10, 560, 200],
  'ویترین سرد': [590, 10, 280, 180],
  'یخچال': [890, 10, 90, 180],
  'یخچال باز': [1000, 10, 370, 180],
  // ── دیوار غربی ──
  'قفسه دیوار غربی': [10, 280, 40, 640],
  // ── دو گوندولای افقی سمت چپ + سرها ──
  'گ۵ — سر غربی': [80, 330, 40, 190],
  'گوندولا ۵': [130, 300, 440, 250],
  'گ۵ — سر شرقی': [600, 330, 40, 190],
  'گ۶ — سر غربی': [80, 610, 40, 190],
  'گوندولا ۶': [130, 580, 440, 250],
  'گ۶ — سر شرقی': [600, 610, 40, 190],
  // ── ۴ گوندولای عمودی مرکزی (۳ راهرو ۱۰۰ سانتی) + سرها ──
  'گ۱ — سر شمالی': [1200, 190, 100, 80],
  'گوندولا ۱': [1200, 280, 100, 640],
  'گ۱ — سر جنوبی': [1200, 940, 100, 80],
  'گ۲ — سر شمالی': [1400, 190, 100, 80],
  'گوندولا ۲': [1400, 280, 100, 640],
  'گ۲ — سر جنوبی': [1400, 940, 100, 80],
  'گ۳ — سر شمالی': [1600, 190, 100, 80],
  'گوندولا ۳': [1600, 280, 100, 640],
  'گ۳ — سر جنوبی': [1600, 940, 100, 80],
  'گ۴ — سر شمالی': [1800, 190, 100, 80],
  'گوندولا ۴': [1800, 280, 100, 640],
  'گ۴ — سر جنوبی': [1800, 940, 100, 80],
  // ── سمت راست: بستنی‌ها + فریزر منجمد + آجیل ──
  'بستنی A': [1980, 280, 90, 240],
  'بستنی B': [2100, 280, 90, 240],
  'بستنی C': [2220, 280, 90, 240],
  'بستنی D': [1980, 560, 90, 240],
  'بستنی E': [2100, 560, 90, 240],
  'بستنی F': [2220, 560, 90, 240],
  'فریزر محصولات منجمد': [2350, 220, 110, 620],
  'قفسه آجیل و تخمه': [2390, 860, 60, 160],
  // ── پایین‌چپ: خروجی + مجموعهٔ صندوق (نزدیک خروجی، مطابق نقشهٔ مالک) ──
  'خروجی': [260, 1090, 180, 100],
  'قفسه کنارِ چپ صندوق': [330, 860, 90, 170],
  'قفسه روبه‌روی صندوق': [450, 860, 430, 70],
  'صندوق ۱': [450, 950, 90, 170],
  'صندوق ۲': [560, 950, 90, 170],
  'صندوق ۳': [670, 950, 90, 170],
  'صندوق ۴': [780, 950, 90, 170],
  'قفسه کنارِ راست صندوق': [890, 950, 90, 170],
  'قفسه پشت صندوق': [450, 1130, 430, 60],
  'مسیر پرداخت': [1050, 860, 130, 330],
  // ── پایین‌راست: میز شیرینی + ورودی + اسباب‌بازی ──
  'میز شیرینی و بیسکویت': [1560, 1050, 290, 130],
  'ورودی': [1960, 1080, 230, 110],
  'اسباب‌بازی': [2240, 1070, 120, 120],
}

/* ───────── اعتبارسنجی هندسی ───────── */

function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function validate() {
  const errors: string[] = []
  const entries = Object.entries(LAYOUT)
  // ۱) هم‌پوشانی زوجی
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [la, [ax, ay, aw, ah]] = entries[i]
      const [lb, [bx, by, bw, bh]] = entries[j]
      if (ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah) {
        errors.push(`هم‌پوشانی: «${la}» و «${lb}»`)
      }
    }
  }
  // ۲) داخل کانتور بودن (مرز بلوک با ۱۰ سانت حاشیه از پخ)
  for (const [label, [x, y, w, h]] of entries) {
    for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h], [x + w / 2, y + h / 2]] as [number, number][]) {
      if (!pointInPolygon(cx, cy, OUTLINE) || cx < 0 || cx > PLAN_W || cy < 0 || cy > PLAN_H) {
        errors.push(`خارج از کانتور: «${label}» گوشه (${cx},${cy})`)
      }
    }
  }
  // ۳) عقب‌نشینی از پخ مورب (حداقل ۵ سانت از خط قطری)
  for (const [label, [x, y, w, h]] of entries) {
    // خط قطری: x = y - 960 → فاصلهٔ افقی از خط در هر نقطهٔ پایین بلوک
    const worst = Math.min(...[y, y + h].flatMap((yy) => [x, x + w].map((xx) => xx - (yy - (PLAN_H - CHAMFER)))))
    if (worst < 5 && y + h > PLAN_H - CHAMFER) errors.push(`خیلی نزدیک به پخ مورب: «${label}» (فاصلهٔ ${Math.round(worst)} سانت)`)
  }
  return errors
}

/* ───────── اجرا ───────── */

async function main() {
  const errs = validate()
  if (errs.length) {
    console.error('✗ هندسهٔ نامعتبر — اعمال نشد:')
    for (const e of errs) console.error('  ·', e)
    process.exit(1)
  }
  console.log(`✓ اعتبارسنجی: ${Object.keys(LAYOUT).length} بلوک، بدون هم‌پوشانی، همه داخل کانتور ۳۱×۱۵ خانه`)

  const plan = await db.floorplan.findFirst({ include: { blocks: true } })
  if (!plan) { console.error('هیچ پلانی نیست'); process.exit(1) }

  // ── ۱) هندسهٔ بوم + کانتور + جابه‌جایی بلوک‌ها (فقط اگر هنوز R5-E نشده) ──
  const alreadyApplied = plan.width === PLAN_W && plan.height === PLAN_H
  if (alreadyApplied) {
    console.log('· هندسهٔ R5-E از قبل اعمال شده — فقط نام‌ها بررسی می‌شوند')
  } else {
    const missing = plan.blocks.filter((b) => b.label && !LAYOUT[b.label])
    if (missing.length) {
      console.error('✗ بلوک بدون مختصات در چیدمان تازه:', missing.map((b) => b.label).join('، '))
      process.exit(1)
    }
    await db.$transaction([
      db.floorplan.update({
        where: { id: plan.id },
        data: { width: PLAN_W, height: PLAN_H, outlineJson: JSON.stringify(OUTLINE), name: 'طبقه همکف — هایپر زیتون (نقشه واقعی ۳۱×۱۵)' },
      }),
      ...plan.blocks
        .filter((b) => b.label && LAYOUT[b.label])
        .map((b) => {
          const [x, y, w, h] = LAYOUT[b.label!]
          return db.floorBlock.update({ where: { id: b.id }, data: { x, y, w, h, rotation: 0 } })
        }),
    ])
    console.log(`✓ بوم ${PLAN_W}×${PLAN_H} سانت (۳۱×۱۵ خانهٔ ۸۰ سانتی) + کانتور ۵رأس با پخ مورب پایین‌چپ اعمال شد`)
    console.log(`✓ ${plan.blocks.length} بلوک مطابق نقشهٔ دستی مالک جابه‌جا شدند`)
  }

  // ── ۲) تغییر نام ستون → ردیف (ZoneColumn + DateCheck.columnsJson) ──
  const cols = await db.zoneColumn.findMany({ where: { planId: plan.id } })
  let renamed = 0
  for (const c of cols) {
    if (c.name.includes('ستون')) {
      const nn = c.name.replace(/ستون/g, 'ردیف')
      await db.zoneColumn.update({ where: { id: c.id }, data: { name: nn } })
      renamed++
    }
  }
  const checks = await db.dateCheck.findMany({ where: { columnsJson: { not: null } } })
  let checksFixed = 0
  for (const ch of checks) {
    try {
      const arr = JSON.parse(ch.columnsJson || '[]') as { name?: string }[]
      if (Array.isArray(arr) && arr.some((c) => String(c?.name || '').includes('ستون'))) {
        await db.dateCheck.update({
          where: { id: ch.id },
          data: { columnsJson: JSON.stringify(arr.map((c) => ({ ...c, name: String(c?.name || '').replace(/ستون/g, 'ردیف') }))) },
        })
        checksFixed++
      }
    } catch { /* columnsJson نامعتبر — دست‌نخورده */ }
  }
  console.log(`✓ نام ردیف‌ها: ${renamed} ردیف تغییرنام یافت · ${checksFixed} رکورد کنترل تاریخ اصلاح شد`)

  // ── گزارش ──
  const total = await db.zoneColumn.count({ where: { planId: plan.id } })
  const sample = await db.zoneColumn.findMany({ where: { planId: plan.id }, take: 3, orderBy: { order: 'asc' } })
  console.log(`\nجمع ردیف‌ها: ${total} — نمونه: ${sample.map((c) => `${c.blockLabel}/${c.name}`).join(' · ')}`)
  console.log(`کانتور: ${JSON.stringify(OUTLINE)}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
