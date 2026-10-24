import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const ps = await db.personnel.findMany({select:{fullName:true,userId:true,active:true}})
  for (const p of ps) console.log(p.fullName, '|', p.userId, '| active:', p.active)
}
main().then(() => db.$disconnect())
