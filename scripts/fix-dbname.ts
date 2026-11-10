/* فیکس فوری: dbname با رقم فارسی → ASCII */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
await p.setting.update({ where: { key: 'holoo:dbname' }, data: { value: 'Holoo4' } })
const chk = await p.setting.findUnique({ where: { key: 'holoo:dbname' } })
console.log('dbname =', JSON.stringify(chk?.value))
await p.$disconnect()
