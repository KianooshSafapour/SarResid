import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const hols = await db.holiday.findMany({ orderBy: { date: 'asc' } })
  console.log('total holidays:', hols.length)
  console.log('religious sample:', hols.filter(h => h.kind === 'RELIGIOUS').slice(0, 8).map(h => `${h.date} ${h.title.slice(0, 25)}`).join(' | '))
  const s = await db.setting.findMany({ where: { key: { startsWith: 'defaults:' } } })
  console.log('defaults:', s.map(x => `${x.key}=${x.value}`).join(', '))
  const sp = await db.supplierProduct.findMany({ take: 5 })
  console.log('supplierProducts:', sp.length, 'sample unitPrices:', sp.map(x => x.unitPrice).join(', '))
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
