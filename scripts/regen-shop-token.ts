/* بازتولید توکن سرویس ویترین روی سرور — بعد از هر deploy که سرویس ری‌استارت می‌شود */
import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
const p = new PrismaClient()

const token = randomBytes(24).toString('hex')
await p.setting.upsert({ where: { key: 'shop:apiToken' }, create: { key: 'shop:apiToken', value: token }, update: { value: token } })

// به‌روزرساری .env ویترین
const envPath = '/opt/hyperzeytoon-store/.env'
try {
  const cur = readFileSync(envPath, 'utf-8')
  const next = cur.replace(/SHOP_SERVICE_TOKEN=.*/, `SHOP_SERVICE_TOKEN=${token}`)
  writeFileSync(envPath, next)
  console.log('token updated in Setting + storefront .env')
} catch {
  writeFileSync(envPath, `SHOP_API_BASE=http://127.0.0.1:3000\nSHOP_SERVICE_TOKEN=${token}\n`)
  console.log('token created in Setting + new .env')
}

// کپی به standalone
try {
  const { copyFileSync } = await import('fs')
  copyFileSync(envPath, '/opt/hyperzeytoon-store/.next/standalone/.env')
  console.log('copied to standalone')
} catch { }

await p.$disconnect()
