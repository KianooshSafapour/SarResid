/* تشخیص دقیق: چرا کلاینت پلتفرم به هلو وصل نمی‌شود وقتی curl مستقیم کار می‌کند */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// ۱) مقدار واقعی تنظیمات هلو در DB
const keys = ['holoo:baseUrl', 'holoo:mockUrl', 'holoo:useMock', 'holoo:enabled', 'holoo:username', 'holoo:userpass', 'holoo:dbname', 'holoo:cashSarfasl']
const rows = await p.setting.findMany({ where: { key: { in: keys } } })
console.log('=== Settings in DB ===')
for (const r of rows) {
  const val = r.key.includes('pass') ? r.value.slice(0, 6) + '…(len=' + r.value.length + ')' : r.value
  console.log(`  ${r.key} = ${JSON.stringify(val)}`)
}

// ۲) شبیه‌سازی getHolooConfig (همان کد پلتفرم)
function rawSetting(v, d = '') {
  if (v === undefined) return d
  try {
    const parsed = JSON.parse(v)
    if (typeof parsed === 'string') return parsed
    if (typeof parsed === 'number' || typeof parsed === 'boolean') return String(parsed)
  } catch { }
  return v
}
const m = new Map(rows.map((r) => [r.key, r.value]))
const username = rawSetting(m.get('holoo:username'))
let userpass = rawSetting(m.get('holoo:userpass'))
const dbname = rawSetting(m.get('holoo:dbname'))
const baseUrl = rawSetting(m.get('holoo:baseUrl'))
const useMock = rawSetting(m.get('holoo:useMock')) === 'true'

console.log('=== getHolooConfig sees ===')
console.log('  baseUrl:', baseUrl)
console.log('  useMock:', useMock)
console.log('  username:', username)
console.log('  dbname:', dbname)
console.log('  userpass (raw):', userpass?.slice(0, 4) + '…')

// ۳) ensureBase64Pass (همان کد پلتفرم)
function ensureBase64Pass(v) {
  const t = (v || '').trim()
  if (!t) return t
  try {
    const round = Buffer.from(Buffer.from(t, 'base64').toString('utf8'), 'utf8').toString('base64')
    if (round === t) return t
  } catch { }
  return Buffer.from(t, 'utf8').toString('base64')
}
const sent = ensureBase64Pass(userpass)
console.log('  after ensureBase64Pass:', sent?.slice(0, 4) + '…', '(same:', sent === userpass + ')')

// ۴) تست لاگین با همان چیزی که پلتفرم می‌فرستد
const target = (useMock ? rawSetting(m.get('holoo:mockUrl')) : baseUrl).replace(/\/+$/, '')
console.log('=== Login attempt ===')
console.log('  URL:', target + '/Login')
try {
  const res = await fetch(target + '/Login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userinfo: { username, userpass: sent, dbname } }),
    signal: AbortSignal.timeout(15000),
  })
  const j = await res.json()
  console.log('  Result:', JSON.stringify(j.Login).slice(0, 200))
} catch (e) {
  console.log('  ERROR:', e.message)
}

await p.$disconnect()
