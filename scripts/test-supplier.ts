/* تست مستقیم ایجاد تأمین‌کننده — نمایش پاسخ خام هلو */
const HOLOO = 'http://5.202.62.192:5000/TncHoloo/api'

const login = await fetch(HOLOO + '/Login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userinfo: { username: 'safapour', userpass: 'MzAwNzY2Nzc=', dbname: 'Holoo4' } }),
})
const tok = (await login.json()).Login.Token
console.log('login ✓')

// ایجاد تأمین‌کننده تستی — پاسخ خام
const res = await fetch(HOLOO + '/Customer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: tok },
  body: JSON.stringify({ custinfo: [{ id: '0', code: 'STEST' + Date.now().toString(36).toUpperCase(), name: 'تست تأمین‌کننده R22', ispurchaser: false, isseller: true, custtype: 0 }] }),
})
const raw = await res.text()
console.log('POST /Customer →', res.status)
console.log('RAW:', raw.slice(0, 400))

// اگر پاسخ Success ندارد، فیلدهای بیشتر را امتحان کن
if (!raw.includes('"Success"')) {
  console.log('\n--- trying with more fields ---')
  const res2 = await fetch(HOLOO + '/Customer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: tok },
    body: JSON.stringify({ custinfo: [{ id: '0', code: 'ST2' + Date.now().toString(36).toUpperCase(), name: 'تست تأمین‌کننده R22b', ispurchaser: false, isseller: true, custtype: 0, isblacklist: false, isvaseteh: false }] }),
  })
  console.log('POST /Customer (v2) →', res2.status)
  console.log('RAW:', (await res2.text()).slice(0, 400))
}
