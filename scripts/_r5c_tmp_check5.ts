import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const l = await db.leaveRequest.findMany({select:{id:true,type:true,hours:true,days:true,fromDate:true,status:true}})
  console.log(JSON.stringify(l))
}
main().then(() => db.$disconnect())
