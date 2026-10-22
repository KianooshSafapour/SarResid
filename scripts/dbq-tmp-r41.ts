import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function main() {
  const fp = await p.floorplan.findFirst({ include: { blocks: true } })
  if (!fp) { console.log('NO FLOORPLAN'); return }
  console.log('plan:', fp.id, 'W×H:', fp.width, 'x', fp.height, 'blocks:', fp.blocks.length)
  console.log('outline:', JSON.stringify(fp.outlineJson)?.slice(0, 400))
  const kinds: Record<string, number> = {}
  for (const b of fp.blocks) kinds[b.kind] = (kinds[b.kind] || 0) + 1
  console.log('kinds:', JSON.stringify(kinds))
  for (const b of fp.blocks.slice(0, 50)) {
    console.log(`${b.label} | ${b.kind} | x=${Math.round(b.x)} y=${Math.round(b.y)} w=${Math.round(b.w)} h=${Math.round(b.h)} | zone=${b.zone} | resp=${(b.meta as any)?.responsible || '-'}`)
  }
}
main().finally(() => p.$disconnect())
