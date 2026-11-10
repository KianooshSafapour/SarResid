import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const zc = await db.zoneColumn.findMany()
  console.log('zoneColumns:', zc.length, JSON.stringify(zc.map(z => ({ l: z.blockLabel, n: z.name, a: z.active, o: z.order }))))
  const dc = await db.dateCheck.findMany({ orderBy: { createdAt: 'desc' }, take: 5 })
  console.log('dateChecks total-recent:', dc.length, JSON.stringify(dc.map(d => ({ d: d.date, l: d.lineId, bl: d.blockLabel, c: d.checkerName, cols: d.columnsJson }))))
}
main().finally(() => db.$disconnect())
