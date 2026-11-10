import { db } from '@/lib/db'
async function main() {
  const users = await db.user.findMany({ select: { username: true, fullName: true, role: true, active: true, pin: true } })
  for (const u of users) console.log(u.username, '|', u.fullName, '|', u.role, '| active:', u.active, '| pin:', u.pin ? 'SET' : 'NULL')
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
