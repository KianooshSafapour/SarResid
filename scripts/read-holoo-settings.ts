/* خواندن تنظیمات هلو از دیتابیس سرور (فقط کلیدهای پیکربندی) */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const keys = ['holoo:username', 'holoo:userpass', 'holoo:dbname', 'holoo:useMock', 'holoo:enabled', 'holoo:baseUrl', 'holoo:mockUrl']
const rows = await p.setting.findMany({ where: { key: { in: keys } } })
for (const r of rows) console.log(`${r.key} = ${r.value}`)
await p.$disconnect()
