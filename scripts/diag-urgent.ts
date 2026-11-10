/* تشخیص فوری: تنظیمات فعلی + تست لاگین از خود سرور */
const BASE = 'http://127.0.0.1:3000'
const HOLOO = 'http://5.202.62.192:5000/TncHoloo/api'

// ۱) تنظیمات هلو در DB
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const rows = await p.setting.findMany({ where: { key: { startsWith: 'holoo:' } } })
console.log('=== Settings ===')
for (const r of rows) {
  const v = r.key.includes('pass') ? `${r.value.slice(0, 6)}…(len=${r.value.length})` : r.value
  console.log(`  ${r.key} = ${JSON.stringify(v)}`)
}
const cfgMap = Object.fromEntries(rows.map(r => [r.key, r.value]))

// ۲) لاگین مستقیم به هلو (بدون middleware)
const username = cfgMap['holoo:username'] || ''
let userpass = cfgMap['holoo:userpass'] || ''
const dbname = cfgMap['holoo:dbname'] || ''

// getHolooConfig → readSetting → JSON.parse اگر ممکن
function rawSetting(v) {
  if (v === undefined) return ''
  try {
    const parsed = JSON.parse(v)
    if (typeof parsed === 'string') return parsed
    if (typeof parsed === 'number' || typeof parsed === 'boolean') return String(parsed)
  } catch {}
  return v
}
const u = rawSetting(username)
const pw_raw = rawSetting(userpass)
const db = rawSetting(dbname)
console.log('\n=== getHolooConfig sees ===')
console.log('  username:', u)
console.log('  dbname:', db)
console.log('  userpass raw len:', pw_raw.length, 'first 4:', pw_raw.slice(0, 4))

// ensureBase64Pass
const { Buffer } = require('buffer')
const t = pw_raw.trim()
let sent = t
try {
  const round = Buffer.from(Buffer.from(t, 'base64').toString('utf8'), 'utf8').toString('base64')
  if (round === t) { sent = t; console.log('  ensureBase64Pass: already base64 (no change)') }
  else { sent = Buffer.from(t, 'utf8').toString('base64'); console.log('  ensureBase64Pass: converted to base64') }
} catch { sent = Buffer.from(t, 'utf8').toString('base64') }
console.log('  sending userpass:', sent.slice(0, 8) + '…')

// ۳) تست لاگین خام
try {
  const res = await fetch(HOLOO + '/Login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userinfo: { username: u, userpass: sent, dbname: db } }),
    signal: AbortSignal.timeout(15000),
  })
  const j = await res.json()
  console.log('\n=== Direct login ===')
  console.log('  State:', j.Login?.State, '| ErrorCode:', j.Login?.ErrorCode)
  if (j.Login?.Token) console.log('  TOKEN OK');
} catch (e) { console.log('\n  LOGIN ERROR:', e.message) }

// ۴) تست از طریق پلتفرم
const admin = await p.user.findFirst({ where: { role: 'ADMIN' } })
await p.$disconnect()
const lr = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userId: admin.id, mode: 'password', value: '@@HZ6677' }),
})
const cookie = (lr.headers.get('set-cookie') || '').split(';')[0]
const tr = await fetch(BASE + '/api/holoo/test', { headers: { cookie }, signal: AbortSignal.timeout(30000) })
const tj = await tr.json()
console.log('\n=== Platform /api/holoo/test ===')
console.log('  status:', tr.status, '| ok:', tj.ok, '| error:', tj.error || 'none')

await p.$disconnect()
