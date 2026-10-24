import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const checks = await db.staffCheck.findMany({select:{id:true,date:true,shift:true,staffId:true,arrival:true,lateMinutes:true,hadPermission:true,overtimeMinutes:true}})
  const leaves = await db.leaveRequest.findMany({select:{id:true,userId:true,type:true,fromDate:true,toDate:true,status:true}})
  const payroll = await db.payrollRecord.findMany({select:{id:true,userId:true,year:true,month:true,overtimeMinutes:true,absenceDays:true,adjustment:true}})
  const settings = await db.setting.findMany({where:{key:{contains:'attendance'}},select:{key:true}})
  console.log('staffChecks:', JSON.stringify(checks))
  console.log('leaves:', JSON.stringify(leaves))
  console.log('payrollRecords:', JSON.stringify(payroll))
  console.log('attendanceSettings:', JSON.stringify(settings))
}
main().then(() => db.$disconnect())
