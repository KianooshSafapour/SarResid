/* تست sync با پارامتر صحیح (what) + تست endpoint فاکتور */
const BASE = 'http://127.0.0.1:3000'
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const admin = await p.user.findFirst({ where: { role: 'ADMIN' } })
await p.$disconnect()

const r = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userId: admin.id, mode: 'password', value: '@@HZ6677' }),
})
const cookie = (r.headers.get('set-cookie') || '').split(';')[0]

// همگام‌سازی محصولات
const res = await fetch(BASE + '/api/holoo/sync', {
  method: 'POST', headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ what: 'products', mode: 'pull' }),
  signal: AbortSignal.timeout(180000),
})
const j = await res.json()
console.log('sync products →', res.status)
console.log(JSON.stringify(j, null, 2).slice(0, 500))
