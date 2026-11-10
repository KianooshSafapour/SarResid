/* تست فاکتور خرید با فروشنده */
const H = 'http://5.202.62.192:5000/TncHoloo/api'
const loginRes = await fetch(H + '/Login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userinfo: { username: 'webservice', userpass: 'IVFBWjJ3c3gjRQ==', dbname: 'Holoo4' } }),
})
const loginJson = await loginRes.json()
const tok = loginJson.Login.Token
console.log('login:', loginJson.Login.State)

// ۱) فروشنده بساز
const uid = String(Date.now())
const custRes = await fetch(H + '/Customer', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: tok },
  body: JSON.stringify({ custinfo: [{ id: uid, name: 'Test Seller R23', ispurchaser: false, isseller: true, custtype: 0 }] }),
})
const custJson = await custRes.json()
const sellerErp = custJson.Success?.ErpCode
console.log('seller:', custJson.Success?.Code, '| erp:', sellerErp?.slice(0, 12))

// ۲) محصول
const prodRes = await fetch(H + '/Product/1/3', { headers: { Authorization: tok } })
const prodRaw = await prodRes.json()
const prods = prodRaw.Product || prodRaw.product || []
console.log('product:', prods[0]?.Name)

// ۳) فاکتور خرید type=3 با فروشنده
const uid2 = String(Date.now() + 1)
const price = 100000
const invRes = await fetch(H + '/Invoice/Invoice', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: tok },
  body: JSON.stringify({
    invoiceinfo: [{
      id: uid2, type: 3, customererpcode: sellerErp,
      date: '2026-11-10', time: '16:30',
      Cash: price, cashsarfasl: '10100010001',
      detailinfo: [{ id: uid2 + '1', ProductErpCode: prods[0].ErpCode, few: 1, price }],
    }],
  }),
})
console.log('\ninvoice type=3 →', invRes.status)
console.log('RAW:', (await invRes.text()).slice(0, 400))
