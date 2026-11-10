import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const fp = await db.floorplan.findFirst({ include: { blocks: true } })
  if (!fp) { console.log('NO FLOORPLAN'); return }
  console.log('name:', fp.name, '| blocks:', fp.blocks.length, '| data keys:', Object.keys((fp as any).data || {}).slice(0,20))
  for (const b of fp.blocks.slice(0, 80)) {
    console.log(` ${b.label || b.text || '?'} | kind=${(b as any).kind || b.type || '?'} | x=${b.x} y=${b.y} w=${b.w} h=${b.h}`)
  }
  const zones = await db.zone.findMany()
  console.log('zones:', zones.map(z => z.name))
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
