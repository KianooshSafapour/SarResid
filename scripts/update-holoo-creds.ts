/* به‌روزرسانی اعتبارنامهٔ هلو: webservice / IVFBWjJ3c3gjRQ== / Holoo4 */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const vals = {
  'holoo:username': 'webservice',
  'holoo:userpass': 'IVFBWjJ3c3gjRQ==',
  'holoo:dbname': 'Holoo4',
  'holoo:useMock': 'false',
  'holoo:enabled': 'true',
  'holoo:baseUrl': 'http://5.202.62.192:5000/TncHoloo/api',
}
for (const [key, value] of Object.entries(vals)) {
  await p.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
}
console.log('holoo settings → webservice/Holoo4')
// تست لاگین
const H = 'http://5.202.62.192:5000/TncHoloo/api'
const login = await fetch(H + '/Login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userinfo: { username: 'webservice', userpass: 'IVFBWjJ3c3gjRQ==', dbname: 'Holoo4' } }),
})
const j = await login.json()
console.log('login:', j.Login?.State, '| token:', j.Login?.Token?.slice(0, 20))
await p.$disconnect()
