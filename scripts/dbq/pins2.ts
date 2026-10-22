import { db } from '@/lib/db'
async function main() {
  const u = await db.user.findUnique({ where: { username: 'alikhani' }, select: { pin: true } })
  console.log('alikhani pin:', u?.pin)
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
