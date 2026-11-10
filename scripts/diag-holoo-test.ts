/* تست واقعی: ورود به سررسید به‌عنوان ADMIN + فراخوانی /api/holoo/test از طریق پلتفرم */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// ۱) پیدا کردن ADMIN از دیتابیس
const admin = await p.user.findFirst({ where: { role: 'ADMIN', active: true } })
if (!admin) { console.log('NO ADMIN USER'); process.exit(1) }
console.log('admin:', admin.username)

// ۲) ساخت نشست (همان کار /api/auth/login)
import { createHmac } from 'crypto'
const SECRET = process.env.SESSION_SECRET || 'hz-sarresid-secret-6677-local'
const rnd = 'diag' + Date.now()
const payload = `${rnd}.${admin.id}`
const sig = createHmac('sha256', SECRET).update(payload).digest('base64url')
const token = `${payload}.${sig}`

// ۳) فراخوانی /api/holoo/test با کوکی نشست
const base = 'http://127.0.0.1:3000'
try {
  const res = await fetch(base + '/api/holoo/test', {
    headers: { cookie: `hz_session=${token}` },
    signal: AbortSignal.timeout(30000),
  })
  const j = await res.json()
  console.log('/api/holoo/test →', res.status, JSON.stringify(j, null, 2).slice(0, 500))
} catch (e) {
  console.log('/api/holoo/test ERROR:', e.message)
}

// ۴) تنظیمات فعلی هلو در DB
const keys = ['holoo:baseUrl', 'holoo:mockUrl', 'holoo:useMock', 'holoo:enabled', 'holoo:username', 'holoo:userpass', 'holoo:dbname']
const rows = await p.setting.findMany({ where: { key: { in: keys } } })
console.log('\n=== Current holoo settings ===')
for (const r of rows) {
  const v = r.key.includes('pass') ? `${r.value.slice(0, 6)}…(len=${r.value.length})` : r.value
  console.log(`  ${r.key} = ${JSON.stringify(v)}`)
}

await p.$disconnect()
