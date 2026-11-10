/* Import batch با retry — ادامه از جایی که قطع شد */
import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()
const H = 'http://5.202.62.192:5000/TncHoloo/api'

const loginRes = await fetch(H + '/Login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userinfo: { username: 'webservice', userpass: 'IVFBWjJ3c3gjRQ==', dbname: 'Holoo4' } }),
})
const loginJson = await loginRes.json()
const tok = loginJson.Login.Token
console.log('login:', loginJson.Login.State)

function holoIn(text) {
  if (!text) return ''
  let s = String(text)
  const map = { 'ي': 'ی', 'ك': 'ک', 'ة': 'ه', 'أ': 'ا', 'إ': 'ا', 'ؤ': 'و', 'ئ': 'ی', '\u0640': '', '\u200f': '', '\u200e': '', '\u200d': '' }
  for (const [ar, fa] of Object.entries(map)) s = s.split(ar).join(fa)
  return s.replace(/\s+/g, ' ').trim()
}

async function fetchPage(page, retry = 0) {
  try {
    const res = await fetch(`${H}/Product/${page}/200`, {
      headers: { Authorization: tok },
      signal: AbortSignal.timeout(60000), // 60s
    })
    const raw = await res.json()
    return raw.Product || raw.product || []
  } catch (e) {
    if (retry < 3) {
      console.log(`  page ${page} timeout, retry ${retry + 1}...`)
      await new Promise((r) => setTimeout(r, 2000))
      return fetchPage(page, retry + 1)
    }
    console.log(`  page ${page} FAILED after 3 retries`)
    return []
  }
}

const PAGE_SIZE = 200
let page = 1
let total = 0, created = 0, updated = 0

while (true) {
  const products = await fetchPage(page)
  if (!products.length) {
    console.log(`page ${page}: empty — done`)
    break
  }
  for (const prod of products) {
    const code = (prod.Code || '').trim()
    const erp = (prod.ErpCode || '').trim()
    if (!code && !erp) continue
    total++
    const name = holoIn(prod.Name) || 'کالای بدون نام'
    const sp = parseFloat(prod.SellPrice) || 0
    const sp2 = parseFloat(prod.SellPrice2) || 0
    const mg = holoIn(prod.MainGroupName) || null
    const lb = parseFloat(prod.LastBuyPrice) || parseFloat(prod.BuyPrice) || 0

    const existing = code ? await p.product.findFirst({
      where: { OR: [{ code }, { barcodesJson: { contains: `"${code}"` } }] },
    }) : null

    if (existing) {
      await p.product.update({
        where: { id: existing.id },
        data: { holooErp: erp, sellPrice: sp || existing.sellPrice, sellPrice2: sp2 || existing.sellPrice2, mainGroup: mg || existing.mainGroup },
      }).catch(() => null)
      updated++
    } else if (erp) {
      await p.product.create({
        data: { name, code, unit: 'عدد', sellPrice: sp, sellPrice2: sp2, mainGroup: mg, holooErp: erp, lastBuyPrice: lb, active: sp > 0 || sp2 > 0, barcodesJson: JSON.stringify(code ? [code] : []) },
      }).catch(() => { total--; })
      created++
    }
  }
  console.log(`page ${page}: total=${total} created=${created} updated=${updated}`)
  if (products.length < PAGE_SIZE) break
  page++
  await new Promise((r) => setTimeout(r, 300))
}

console.log(`\n✅ import done: ${total} pulled, ${created} created, ${updated} updated`)
const withErp = await p.product.count({ where: { holooErp: { not: null } } })
console.log(`products with ErpCode: ${withErp}`)
await p.$disconnect()
