import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const payroll = await db.payrollRecord.findMany({where:{year:1405,month:7},select:{userId:true,overtimeMinutes:true,absenceDays:true,adjustment:true,savedJson:true}})
  const kv = await db.setting.findUnique({where:{key:'hr:attendance-summary:1405-07'}})
  console.log('payroll 1405-07:', JSON.stringify(payroll.map(p=>({u:p.userId.slice(-6),ot:p.overtimeMinutes,ab:p.absenceDays,adj:p.adjustment,saved:p.savedJson.slice(0,30)}))))
  console.log('KV exists:', !!kv, kv ? kv.value.length + ' chars' : '')
}
main().then(() => db.$disconnect())
