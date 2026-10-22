/**
 * seed-zone-columns.ts — تعریف ستون‌های چیدمان برای بخش‌های کالادار نقشهٔ واقعی
 * --------------------------------------------------------------------------------
 * پیش‌نیاز گردش «کنترل ستون‌ها» (خواستهٔ #26 مالک): هر بخش چند ستون دارد و روزی
 * یک ستون از بخشِ هر شخص چک می‌شود. بدون ZoneColumn هیچ برنامه‌ای ساخته نمی‌شود.
 *
 * قاعدهٔ تعداد ستون هر بلوک: بر اساس عرض واقعی بلوک (cm) و نوع قفسه:
 *   GONDOLA → 每 120cm یک ستون (کمینه ۲)
 *   SHELF/FRIDGE/FREEZER/BAKERY → 每 100cm یک ستون (کمینه ۲)
 *   CUSTOM → 每 140cm (کمینه ۲)   — سقف ۶ ستون
 * نام‌گذاری: «ستون ۱..n» ترتیبی.
 * idempotent: بلوکی که ستون دارد دست نمی‌خورد.
 * اجرا: bunx tsx scripts/seed-zone-columns.ts
 */
import { db } from '../src/lib/db'

/** بخش‌های کالادار — هم‌راستا با isProductBlock در section-columns */
const PRODUCT_KINDS = new Set([
  'GONDOLA', 'SHELF', 'FRIDGE_WALL', 'FRIDGE_ISLAND', 'FREEZER_ICECREAM', 'BAKERY', 'CUSTOM',
])

function colCountFor(kind: string, wCm: number): number {
  const per: Record<string, number> = {
    GONDOLA: 120, SHELF: 100, FRIDGE_WALL: 100, FRIDGE_ISLAND: 100,
    FREEZER_ICECREAM: 100, BAKERY: 100, CUSTOM: 140,
  }
  const step = per[kind] || 120
  return Math.max(2, Math.min(6, Math.ceil(Math.max(wCm, 1) / step)))
}

async function main() {
  const plan = await db.floorplan.findFirst()
  if (!plan) { console.error('هیچ پلانی نیست'); process.exit(1) }
  const blocks = await db.floorBlock.findMany({ where: { planId: plan.id } })
  const existing = await db.zoneColumn.findMany({ where: { planId: plan.id } })
  const hasCols = new Set(existing.map((c) => c.blockLabel))

  let created = 0, skippedHas = 0, skippedKind = 0
  const detail: string[] = []
  for (const b of blocks) {
    if (!b.label) { continue }
    if (!PRODUCT_KINDS.has(String(b.kind || '').toUpperCase())) { if (!hasCols.has(b.label)) skippedKind++; continue }
    if (hasCols.has(b.label)) { skippedHas++; continue }
    const n = colCountFor(String(b.kind || '').toUpperCase(), Number(b.w) || 0)
    await db.zoneColumn.createMany({
      data: Array.from({ length: n }, (_, i) => ({
        planId: plan.id,
        blockLabel: b.label,
        name: `ستون ${'۱۲۳۴۵۶'[i] ?? i + 1}`,
        order: i + 1,
        active: true,
      })),
    })
    created += n
    detail.push(`${b.label} (${b.kind}, عرض ${Math.round(Number(b.w) || 0)}cm) → ${n} ستون`)
  }

  console.log(`بلوک‌ها: ${blocks.length} | ستون ساخته شد: ${created} | از قبل داشت: ${skippedHas} | غیرکالادار: ${skippedKind}`)
  for (const d of detail) console.log('  ·', d)

  const total = await db.zoneColumn.count({ where: { planId: plan.id } })
  const byBlock = await db.zoneColumn.groupBy({ by: ['blockLabel'], where: { planId: plan.id }, _count: true })
  console.log(`\nجمع کل ستون‌ها: ${total} در ${byBlock.length} بخش`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
