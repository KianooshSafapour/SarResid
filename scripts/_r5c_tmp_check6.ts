import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const l = await db.leaveRequest.findUnique({where:{id:'cmvjblcbd004jm4w9xc61io23'},select:{hours:true}})
  console.log('stored hours:', l?.hours)
}
main().then(() => db.$disconnect())
