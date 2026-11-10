/* تست واقعی از طریق پلتفرم: login واقعی → /api/holoo/test → /api/holoo/sync */
const BASE = 'http://127.0.0.1:3000'

// ۱) پیدا کردن ADMIN از دیتابیس
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const admin = await p.user.findFirst({ where: { role: 'ADMIN', active: true } })
await p.$disconnect()
if (!admin) { console.log('NO ADMIN'); process.exit(1) }
console.log('admin:', admin.username, '| password set:', !!admin.password)

// ۲) ورود با رمز (همان مسیر UI)
const loginRes = await fetch(BASE + '/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userId: admin.id, mode: 'password', value: '@@HZ6677' }),
})
const loginJson = await loginRes.json()
const setCookie = loginRes.headers.get('set-cookie') || ''
const cookie = setCookie.split(';')[0]
console.log('login:', loginJson.ok ? 'OK' : loginJson.error)
if (!loginJson.ok) process.exit(1)

// ۳) فراخوانی /api/holoo/test
try {
  const res = await fetch(BASE + '/api/holoo/test', {
    headers: { cookie },
    signal: AbortSignal.timeout(30000),
  })
  const j = await res.json()
  console.log('\n/api/holoo/test →', res.status)
  console.log(JSON.stringify(j, null, 2).slice(0, 600))
} catch (e) { console.log('/api/holoo/test ERR:', e.message) }

// ۴) تنظیمات هلو — همان چیزی که پلتفرم می‌بیند
try {
  const res = await fetch(BASE + '/api/holoo/settings', { headers: { cookie } })
  const j = await res.json()
  console.log('\n/api/holoo/settings →', res.status)
  console.log(JSON.stringify(j, null, 2).slice(0, 600))
} catch (e) { console.log('/api/holoo/settings ERR:', e.message) }
