/* تغییر کاربر هلو به safapour (که اجازهٔ ثبت دارد) */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
await p.setting.upsert({ where: { key: 'holoo:username' }, create: { key: 'holoo:username', value: 'safapour' }, update: { value: 'safapour' } })
console.log('username → safapour')
await p.$disconnect()
