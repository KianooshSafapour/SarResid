/* Import محصولات از Holoo4 در دسته‌های کوچک — بدون timeout */
import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()
const H = 'http://5.202.62.192:5000/TncHoloo/api'

// ۱) login
const loginRes = await fetch(H + '/Login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userinfo: { username: 'webservice', userpass: 'IVFBWjJ3c3gjRQ==', dbname: 'Holoo4' } }),
})
const loginJson = await loginRes.json()
const tok = loginJson.Login.Token
console.log('login:', loginJson.Login.State)

// ۲) pull همهٔ صفحات — batch-by-batch
const PAGE_SIZE = 200
let page = 1
let totalPulled = 0
let totalCreated = 0
let totalUpdated = 0
let totalSkipped = 0

// نرمال‌سازی متن هلو (عربی → فارسی)
function holoIn(text) {
  if (!text) return ''
  let s = String(text)
  const map = { 'ي': 'ی', 'ك': 'ک', 'ة': 'ه', 'أ': 'ا', 'إ': 'ا', 'ؤ': 'و', 'ئ': 'ی', '\u0640': '', '\u200f': '', '\u200e': '', '\u200d': '' }
  for (const [ar, fa] of Object.entries(map)) s = s.split(ar).join(fa)
  return s.replace(/\s+/g, ' ').trim()
}

while (true) {
  const res = await fetch(`${H}/Product/${page}/${PAGE_SIZE}`, {
    headers: { Authorization: tok },
    signal: AbortSignal.timeout(30000),
  })
  const raw = await res.json()
  const products = raw.Product || raw.product || []
  if (!products.length) break

  for (const prod of products) {
    const code = (prod.Code || '').trim()
    const erp = (prod.ErpCode || '').trim()
    if (!code && !erp) { totalSkipped++; continue }
    totalPulled++

    const name = holoIn(prod.Name) || 'کالای بدون نام'
    const sellPrice = parseFloat(prod.SellPrice) || 0
    const sellPrice2 = parseFloat(prod.SellPrice2) || 0
    const stock = Math.round(parseFloat(prod.Few) || 0)
    const mainGroup = holoIn(prod.MainGroupName) || null
    const lastBuy = parseFloat(prod.LastBuyPrice) || parseFloat(prod.BuyPrice) || 0

    // find-or-create by code (barcode)
    const existing = code ? await p.product.findFirst({
      where: { OR: [{ code }, { barcodesJson: { contains: `"${code}"` } }] },
    }) : null

    if (existing) {
      await p.product.update({
        where: { id: existing.id },
        data: {
          holooErp: erp,
          name: name || existing.name,
          sellPrice: sellPrice || existing.sellPrice,
          sellPrice2: sellPrice2 || existing.sellPrice2,
          mainGroup: mainGroup || existing.mainGroup,
          lastBuyPrice: lastBuy || existing.lastBuyPrice,
        },
      }).catch(() => null)
      totalUpdated++
    } else if (erp) {
      await p.product.create({
        data: {
          name, code, unit: 'عدد',
          sellPrice, sellPrice2, stock,
          mainGroup, holooErp: erp,
          lastBuyPrice: lastBuy,
          active: sellPrice > 0 || sellPrice2 > 0,
          barcodesJson: JSON.stringify(code ? [code] : []),
        },
      }).catch(() => { totalSkipped++; totalPulled-- })
      totalCreated++
    }
  }

  console.log(`page ${page}: pulled=${totalPulled} created=${totalCreated} updated=${totalUpdated} skipped=${totalSkipped}`)
  
  if (products.length < PAGE_SIZE) break
  page++
  
  // یک وقفهٔ کوتاه بین صفحات (جلوگیری از rate-limit)
  await new Promise((r) => setTimeout(r, 200))
}

console.log(`\n✅ done: ${totalPulled} pulled, ${totalCreated} created, ${totalUpdated} updated, ${totalSkipped} skipped`)

// تأیید
const withErp = await p.product.count({ where: { holooErp: { not: null } } })
console.log(`products with holooErp: ${withErp}`)
await p.$disconnect()
