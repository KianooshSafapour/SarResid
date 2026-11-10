import { db } from '@/lib/db'
async function main() {
  const r = await db.returnRequest.findFirst({ select: { customerName: true, customerPhone: true } })
  console.log(JSON.stringify(r))
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
