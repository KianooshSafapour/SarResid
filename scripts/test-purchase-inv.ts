/* تست مستقیم فاکتور خرید type=3 — پاسخ خام */
const H = 'http://5.202.62.192:5000/TncHoloo/api'
const login = await fetch(H + '/Login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userinfo: { username: 'safapour', userpass: 'MzAwNzY2Nzc=', dbname: 'Holoo4' } }),
})
const tok = (await login.json()).Login.Token
console.log('login ✓')

// محصول با ErpCode
const prodRes = await fetch(H + '/Product/1/5', { headers: { Authorization: tok } })
const prods = (await prodRes.json()).Product || []
const target = prods.find((p) => parseFloat(p.SellPrice) > 0)
console.log('product:', target?.Name, '| erp:', target?.ErpCode?.slice(0, 12))

// تأمین‌کننده موجود — GET /Customer
const custRes = await fetch(H + '/Customer/1/5', { headers: { Authorization: tok } })
const custs = (await custRes.json()).Customer || []
console.log('customers found:', custs.length)

// فاکتور خرید type=3 با id یکتا
const uid = String(Date.now())
const invoiceBody = {
  invoiceinfo: [{
    id: uid,
    type: 3,
    customererpcode: custs[0]?.ErpCode || '',
    date: '2026-11-04',
    time: '15:00',
    Cash: parseInt(target.SellPrice),
    cashsarfasl: '10100010001',
    detailinfo: [{ id: uid + '-1', ProductErpCode: target.ErpCode, few: 1, price: parseInt(target.SellPrice) }],
  }],
}
console.log('\nsending type=3 invoice…')
const invRes = await fetch(H + '/Invoice/Invoice', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: tok },
  body: JSON.stringify(invoiceBody),
})
console.log('POST /Invoice/Invoice →', invRes.status)
console.log('RAW:', (await invRes.text()).slice(0, 400))
