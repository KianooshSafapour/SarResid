/* Sync محصولات از Holoo4 → سپس retry فاکتورها */
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
console.log('login:', (await r.json()).ok ? 'OK' : 'FAIL')

// ۱) Sync محصولات
console.log('\n--- syncing products from Holoo4 ---')
const syncRes = await fetch(BASE + '/api/holoo/sync', {
  method: 'POST', headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ what: 'products', mode: 'pull' }),
  signal: AbortSignal.timeout(600000),
})
const syncJson = await syncRes.json()
console.log('sync:', syncJson.ok ? JSON.stringify(syncJson.data) : syncJson.error)

// ۲) حالا retry worker
console.log('\n--- retry purchase invoices ---')
const retry = await fetch(BASE + '/api/holoo/sync', {
  method: 'POST', headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ what: 'orders', mode: 'push' }),
  signal: AbortSignal.timeout(300000),
})
const retryJson = await retry.json()
console.log('push:', retryJson.ok ? JSON.stringify(retryJson.data).slice(0, 300) : retryJson.error)
