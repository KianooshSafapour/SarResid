/* تست همگام‌سازی هلو از طریق پلتفرم — همان مسیری که UI استفاده می‌کند */
const BASE = 'http://127.0.0.1:3000'

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const admin = await p.user.findFirst({ where: { role: 'ADMIN', active: true } })
await p.$disconnect()

const loginRes = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userId: admin.id, mode: 'password', value: '@@HZ6677' }),
})
const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0]
console.log('login:', (await loginRes.json()).ok ? 'OK' : 'FAIL')

// همگام‌سازی محصولات
try {
  const res = await fetch(BASE + '/api/holoo/sync', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ type: 'PULL_PRODUCTS' }),
    signal: AbortSignal.timeout(60000),
  })
  const j = await res.json()
  console.log('\n/api/holoo/sync PULL_PRODUCTS →', res.status)
  console.log(JSON.stringify(j, null, 2).slice(0, 500))
} catch (e) { console.log('sync ERR:', e.message) }
