/* تست مستقیم فاکتور خرید type=3 — بدون نیاز به قیمت */
const H = 'http://5.202.62.192:5000/TncHoloo/api'
const login = await fetch(H + '/Login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userinfo: { username: 'safapour', userpass: 'MzAwNzY2Nzc=', dbname: 'Holoo4' } }),
})
const tok = (await login.json()).Login.Token
console.log('login ✓')

const prodRes = await fetch(H + '/Product/1/10', { headers: { Authorization: tok } })
const prodRaw = await prodRes.json()
const prods = prodRaw.Product || prodRaw.product || []
console.log('products:', prods.length)
const target = prods[0]
console.log('first product:', target?.Name, '| erp:', target?.ErpCode?.slice(0, 12))

const custRes = await fetch(H + '/Customer/1/3', { headers: { Authorization: tok } })
const custRaw = await custRes.json()
const custs = custRaw.Customer || custRaw.customer || []
console.log('first customer:', custs[0]?.Name, '| erp:', custs[0]?.ErpCode?.slice(0, 12))

const uid = String(Date.now())
const price = 100000 // قیمت تستی — مهم نیست چه باشد
const body = {
  invoiceinfo: [{
    id: uid,
    type: 3,
    customererpcode: custs[0]?.ErpCode || '',
    date: '2026-11-04',
    time: '15:30',
    Cash: price,
    cashsarfasl: '10100010001',
    detailinfo: [{ id: uid + '1', ProductErpCode: target.ErpCode, few: 1, price }],
  }],
}
const invRes = await fetch(H + '/Invoice/Invoice', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: tok },
  body: JSON.stringify(body),
})
console.log('\nPOST /Invoice/Invoice type=3 →', invRes.status)
console.log('RAW:', (await invRes.text()).slice(0, 400))
