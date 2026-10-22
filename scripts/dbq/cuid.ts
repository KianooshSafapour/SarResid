import { db } from '@/lib/db'
async function main() {
  const u = await db.user.findUnique({ where: { username: 'mollaie' }, select: { id: true } })
  console.log(u?.id)
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
