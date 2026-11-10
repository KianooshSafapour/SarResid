/* تست کامل از طریق UI — همان کاری که کاربر با دکمهٔ «آزمایش اتصال» می‌کند */
const BASE = 'https://sarresid.hyperzeytoon.com'

// ۱) ورود با ADMIN
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient({ datasources: { db: { url: 'file:/opt/sarresid/db/custom.db' } } })
const admin = await p.user.findFirst({ where: { role: 'ADMIN', active: true } })
console.log('Testing as:', admin.fullName)
await p.$disconnect()

const loginRes = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userId: admin.id, mode: 'password', value: '@@HZ6677' }),
})
const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0]
console.log('login:', (await loginRes.json()).ok ? '✓ OK' : '✗ FAIL')

// ۲) آزمایش اتصال (همان دکمهٔ UI)
const testRes = await fetch(BASE + '/api/holoo/test', { headers: { cookie }, signal: AbortSignal.timeout(30000) })
const testJson = await testRes.json()
console.log('\n── آزمایش اتصال (دکمهٔ UI) ──')
console.log('status:', testRes.status)
if (testJson.ok) {
  console.log('✓ اتصال موفق:', JSON.stringify(testJson.data))
} else {
  console.log('✗ خطا:', testJson.error)
}

// ۳) همگام‌سازی کالاها (همان دکمهٔ UI)
const syncRes = await fetch(BASE + '/api/holoo/sync', {
  method: 'POST', headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ what: 'products', mode: 'pull' }),
  signal: AbortSignal.timeout(300000),
})
const syncJson = await syncRes.json()
console.log('\n── همگام‌سازی کالاها ──')
console.log('status:', syncRes.status)
if (syncJson.ok) {
  console.log('✓', JSON.stringify(syncJson.data))
} else {
  console.log('✗ خطا:', syncJson.error)
}
