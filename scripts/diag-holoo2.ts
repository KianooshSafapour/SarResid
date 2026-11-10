/* تشخیص مرحله دوم: بعد از لاگین موفق، GET /Settings چطور پاسخ می‌دهد */
const H = 'http://5.202.62.192:5000/TncHoloo/api'
const login = await fetch(H + '/Login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userinfo: { username: 'HzWebservice', userpass: 'MzAwNzY2Nzc=', dbname: 'Holoo4' } }),
})
const j = await login.json()
console.log('login:', j.Login.State)
const tok = j.Login.Token

// Settings
try {
  const r = await fetch(H + '/Settings', { headers: { Authorization: tok }, signal: AbortSignal.timeout(10000) })
  console.log('GET /Settings →', r.status, (await r.text()).slice(0, 300))
} catch (e) { console.log('Settings ERROR:', e.message) }

// Customer (getCustomers در shop.ts)
try {
  const r = await fetch(H + '/Customer?code=W09124445566', { headers: { Authorization: tok }, signal: AbortSignal.timeout(10000) })
  console.log('GET /Customer?code →', r.status, (await r.text()).slice(0, 200))
} catch (e) { console.log('Customer ERROR:', e.message) }
