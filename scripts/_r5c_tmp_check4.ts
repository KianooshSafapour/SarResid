import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const ps = await db.personnel.findMany({select:{fullName:true,userId:true,jobTitle:true,department:true,phone:true,nationalId:true,hireDate:true}})
  const us = await db.user.findMany({select:{id:true,fullName:true,username:true,title:true,phone:true}})
  const uById = new Map(us.map(u=>[u.id,u]))
  const uByName = new Map(us.map(u=>[u.fullName,u]))
  console.log('=== personnel rows vs linked user vs name-matched user ===')
  for (const p of ps) {
    const linked = uById.get(p.userId)
    const byName = uByName.get(p.fullName)
    const ok = linked && byName && linked.id === byName.id
    console.log(
      (ok?'OK  ':'BAD '),
      p.fullName.padEnd(22),
      '| linked:', (linked?linked.fullName:'—').padEnd(22),
      '| byName:', (byName?byName.username:'NO MATCH'),
      '| jobTitle:', p.jobTitle, '| dept:', p.department, '| phone:', p.phone
    )
  }
  console.log('users without personnel row:')
  const puids = new Set(ps.map(p=>p.userId))
  const pnames = new Set(ps.map(p=>p.fullName))
  for (const u of us) if (!puids.has(u.id) && !pnames.has(u.fullName)) console.log(' -', u.username, u.fullName)
}
main().then(() => db.$disconnect())
