/**
 * assign-section-responsibles.ts — تعیین مسؤول هر بخش برای برنامهٔ کنترل ستون‌ها
 * -----------------------------------------------------------------------------
 * خواستهٔ #26: «هر بخش چند ستون دارد و روزی یک ستون از بخشِ هر شخص چک می‌شود» —
 * برای گروه‌بندی «به تفکیک مسؤول»، هر بخش باید مسؤول داشته باشد.
 * توزیع نوبتی (round-robin) پرسنل فروشگاهِ حاضر در شیفت‌ها (چیدمان + فروشنده)
 * روی بخش‌های ستون‌دار. ذخیره به‌صورت رشتهٔ نام در metaJson.responsible
 * (قرارداد خوانده‌شده توسط floorplan-stats و liveboard).
 * idempotent: بلوکی که مسؤول دارد دست نمی‌خورد.
 * اجرا: bunx tsx scripts/assign-section-responsibles.ts
 */
import { db } from '../src/lib/db'

const STAFF = [
  'خانم فاطمه تقی‌زاده', // نیروی چیدمان
  'خانم فائزه سعدی', // نیروی چیدمان
  'آقای مهدی علیخانی', // نیروی چیدمان
  'خانم فاطمه میرزایی', // نیروی چیدمان
  'خانم عاطفه ایران‌نژاد', // فروشنده
  'خانم مهلا یادگاری', // فروشنده
]

async function main() {
  const plan = await db.floorplan.findFirst()
  if (!plan) { console.error('پلانی نیست'); process.exit(1) }
  const blocks = await db.floorBlock.findMany({ where: { planId: plan.id } })
  const cols = await db.zoneColumn.findMany({ where: { planId: plan.id }, select: { blockLabel: true } })
  const withCols = new Set(cols.map((c) => c.blockLabel))

  let assigned = 0, skipped = 0
  let cursor = 0
  const detail: string[] = []
  for (const b of blocks) {
    if (!b.label || !withCols.has(b.label)) continue
    let meta: Record<string, unknown> = {}
    try { meta = JSON.parse(b.metaJson || '{}') } catch { meta = {} }
    if (typeof meta.responsible === 'string' && meta.responsible.trim()) { skipped++; continue }
    meta.responsible = STAFF[cursor % STAFF.length]
    cursor++
    await db.floorBlock.update({ where: { id: b.id }, data: { metaJson: JSON.stringify(meta) } })
    assigned++
    detail.push(`${b.label} → ${meta.responsible}`)
  }
  console.log(`مسؤول تازه: ${assigned} | از قبل داشت: ${skipped} | بدون ستون (دست‌نخورده): نادیده`)
  for (const d of detail) console.log('  ·', d)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
