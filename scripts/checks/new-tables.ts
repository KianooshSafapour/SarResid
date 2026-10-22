import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const [dc, so] = await Promise.all([db.dateCheck.count(), db.smsOutbox.count()])
  console.log('DateCheck rows:', dc, '| SmsOutbox rows:', so, '— TABLES OK')
}
main().catch(e => { console.error('FAIL', e.message); process.exit(1) }).finally(() => db.$disconnect())
