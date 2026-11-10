/* تست زندهٔ اتصال هلو از کد پلتفرم روی سرور: لاگین واقعی + محصول + فاکتور-idempotency */
const H = 'http://5.202.62.192:5000/TncHoloo/api'
const login = await fetch(H + '/Login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userinfo: { username: 'safapour', userpass: 'MzAwNzY2Nzc=', dbname: 'Holoo4' } }),
})
const j = await login.json()
console.log('platform holoo login:', j.Login.State)

const pr = await fetch(H + '/Product/1/1', { headers: { Authorization: j.Login.Token } })
const pj = await pr.json()
console.log('product:', pj.product?.[0]?.Name)
