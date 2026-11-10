/* تنظیم صندوق فروش هلو روی سرور */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
await p.setting.upsert({ where: { key: 'holoo:cashSarfasl' }, create: { key: 'holoo:cashSarfasl', value: '10100010001' }, update: { value: '10100010001' } })
console.log('cashSarfasl = 10100010001')
await p.$disconnect()
