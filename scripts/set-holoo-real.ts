/* تنظیم اتصال هلو روی سرور → وب‌سرویس واقعی (IP ثابت، safapour، Holoo4=تست) */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function main() {
  const vals: Record<string, string> = {
    'holoo:baseUrl': 'http://5.202.62.192:5000/TncHoloo/api',
    'holoo:username': 'safapour',
    'holoo:userpass': 'MzAwNzY2Nzc=', // base64(30076677)
    'holoo:dbname': 'Holoo4', // دیتابیس تست — سوییچ به Holoo2 از پنل هلو در سررسید
    'holoo:useMock': 'false',
    'holoo:enabled': 'true',
  }
  for (const [key, value] of Object.entries(vals)) {
    await p.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  }
  console.log('holoo settings → REAL service (5.202.62.192:5000, safapour, Holoo4)')
  await p.$disconnect()
}
main()
