/* کالاهای آزمون فروشگاه آنلاین — فقط dev/تست بات؛ در سرور اجرا نمی‌شود.
   الف/ب: ساختنی با ErpCode معتبر شبیه‌ساز (مسیر موفق فاکتور)
   ج: یک کالای واقعیِ بدون-ErpCode ولی با بارکدِ موجود در هلو (مسیر غنی‌سازی بارکد) — فقط «پیدا» می‌شود، دست نمی‌خورد */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
const p = new PrismaClient()

const sim = JSON.parse(readFileSync('mini-services/holoo-sim/data.json', 'utf-8'))
const byCode = (c: string) => sim.products.find((x: { Code?: string }) => x.Code === c)

const SEED = [
  { name: 'آزمون فروشگاه الف', code: 'TEST-SHOP-A', simCode: '6260308300866', price: 800000 },
  { name: 'آزمون فروشگاه ب', code: 'TEST-SHOP-B', simCode: '6260308332805', price: 950000 },
]

async function main() {
  for (const s of SEED) {
    const simProd = byCode(s.simCode)
    if (!simProd) throw new Error(`sim product ${s.simCode} not found`)
    const data = {
      name: s.name, code: s.code, unit: 'عدد',
      sellPrice: s.price, sellPrice2: s.price, stock: 40,
      active: true, status: 'فعال', mainGroup: 'آزمون',
      holooErp: simProd.ErpCode as string,
    }
    const existing = await p.product.findFirst({ where: { name: s.name } })
    if (existing) await p.product.update({ where: { id: existing.id }, data })
    else await p.product.create({ data })
    console.log('seeded:', s.name)
  }

  // کالای ج (غنی‌سازی بارکد): واقعی، بارکدش در هلو هست — هر بار موجودی به ۵۰ برمی‌گردد و ErpCode پاک می‌شود
  const enrich = await p.product.findFirst({ where: { code: '6260308350069' } })
  if (enrich) {
    await p.product.update({ where: { id: enrich.id }, data: { stock: 50, holooErp: null, active: true, status: 'فعال', sellPrice: enrich.sellPrice > 0 ? enrich.sellPrice : 500000, sellPrice2: enrich.sellPrice2 > 0 ? enrich.sellPrice2 : 500000 } })
    console.log('reset enrichment product:', enrich.name, '(stock=50, erp=null)')
  }

  await p.$disconnect()
}
main()
