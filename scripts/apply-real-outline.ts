/**
 * Apply the REAL Hyper Zeytoon trapezoid outline to the active floorplan
 * + proportionally rescale existing blocks to the real 1532×2010cm canvas.
 * Idempotent. Run: bunx tsx scripts/apply-real-outline.ts
 */
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const REAL = [
  [0, 0], [1532, 0], [1532, 2010], [1395, 2010], [1395, 1873], [995, 1873],
  [995, 2010], [460, 2010], [460, 1873], [60, 1873], [60, 2010], [0, 1782],
]

async function main() {
  const plan = await db.floorplan.findFirst({ orderBy: { id: 'asc' }, include: { blocks: true } })
  if (!plan) { console.log('no floorplan found'); process.exit(0) }
  const cur = typeof plan.outlineJson === 'string' ? JSON.parse(plan.outlineJson || 'null') : plan.outlineJson
  if (Array.isArray(cur) && JSON.stringify(cur) === JSON.stringify(REAL) && plan.width === 1532 && plan.height === 2010) {
    console.log('already applied — skip'); process.exit(0)
  }
  const sx = 1532 / plan.width, sy = 2010 / plan.height
  for (const b of plan.blocks) {
    await db.floorBlock.update({
      where: { id: b.id },
      data: {
        x: Math.round(b.x * sx), y: Math.round(b.y * sy),
        w: Math.max(40, Math.round(b.w * sx)), h: Math.max(40, Math.round(b.h * sy)),
      },
    })
  }
  await db.floorplan.update({
    where: { id: plan.id },
    data: { width: 1532, height: 2010, outlineJson: JSON.stringify(REAL) },
  })
  console.log(`✓ real outline applied to plan ${plan.id} — ${plan.blocks.length} blocks rescaled (${sx.toFixed(2)}×, ${sy.toFixed(2)}×)`)
  process.exit(0)
}
main()
