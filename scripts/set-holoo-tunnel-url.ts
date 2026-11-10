/* تنظیم baseUrl هلو روی تونل + گزارش وضعیت (useMock دست‌نخورده تا رسیدن اعتبار واقعی) */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function main() {
  await p.setting.upsert({
    where: { key: 'holoo:baseUrl' },
    create: { key: 'holoo:baseUrl', value: 'http://127.0.0.1:8081/TncHoloo/api' },
    update: { value: 'http://127.0.0.1:8081/TncHoloo/api' },
  })
  console.log('holoo:baseUrl → http://127.0.0.1:8081/TncHoloo/api (tunnel)')
  await p.$disconnect()
}
main()
