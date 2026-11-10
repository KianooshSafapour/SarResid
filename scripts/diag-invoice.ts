/* تشخیص دقیق خطای فاکتور خرید — v2 */
const H = 'http://5.202.62.192:5000/TncHoloo/api'
const loginRes = await fetch(H + '/Login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userinfo: { username: 'webservice', userpass: 'IVFBWjJ3c3gjRQ==', dbname: 'Holoo4' } }),
})
const loginJson = await loginRes.json()
const tok = loginJson.Login.Token
console.log('login:', loginJson.Login.State)

const prodRes = await fetch(H + '/Product/1/3', { headers: { Authorization: tok } })
const prodRaw = await prodRes.json()
const prods = prodRaw.Product || prodRaw.product || []
console.log('product:', prods[0]?.Name, '| erp:', prods[0]?.ErpCode?.slice(0, 12))

const cashRes = await fetch(H + '/Report/GetCash', { headers: { Authorization: tok } })
const cashJson = await cashRes.json()
const cashes = cashJson.report || []
console.log('valid cashes:', cashes.map((c) => c.Code).join(', '))

const uid = String(Date.now())
const price = 100000
const invRes = await fetch(H + '/Invoice/Invoice', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: tok },
  body: JSON.stringify({
    invoiceinfo: [{
      id: uid, type: 3, date: '2026-11-10', time: '16:00',
      Cash: price,
      cashsarfasl: cashes[0]?.Code || '10100010001',
      detailinfo: [{ id: uid + '1', ProductErpCode: prods[0].ErpCode, few: 1, price }],
    }],
  }),
})
console.log('\nPOST /Invoice/Invoice type=3 →', invRes.status)
console.log('RAW:', (await invRes.text()).slice(0, 400))
