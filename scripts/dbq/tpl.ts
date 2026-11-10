import { db } from '@/lib/db'
async function main() {
  const tpls = await db.checklistTemplate.findMany({ orderBy: { order: 'asc' }, select: { id: true, title: true, roleKey: true, order: true, phase: true } })
  console.log(JSON.stringify(tpls, null, 1))
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
