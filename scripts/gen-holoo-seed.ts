/**
 * gen-holoo-seed.ts — one-time seed generator for the Holoo simulator (task B2).
 * Reads real SarResid data (400 products + 40 suppliers) via the shared Prisma
 * client and writes mini-services/holoo-sim/seed.json in Holoo web-service shape.
 *
 * Run: bun run scripts/gen-holoo-seed.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from '@/lib/db'
import { safeJson } from '@/lib/api'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../mini-services/holoo-sim/seed.json')

const PRODUCT_LIMIT = 400
const SUPPLIER_LIMIT = 40

/** base64-ish random ErpCode like the real Holoo ('bBAL…') */
function genErp(prefix: string): string {
  return prefix + Buffer.from(globalThis.crypto.randomUUID().replace(/-/g, ''), 'hex').toString('base64')
}

function pad(n: number, len: number): string {
  return String(n).padStart(len, '0')
}

async function main() {
  const [products, suppliers] = await Promise.all([
    db.product.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      take: PRODUCT_LIMIT,
      select: {
        name: true,
        code: true,
        barcodesJson: true,
        sellPrice: true,
        lastBuyPrice: true,
        stock: true,
        unitsPerCarton: true,
        mainGroup: true,
        subGroup: true,
      },
    }),
    db.supplier.findMany({
      orderBy: { name: 'asc' },
      take: SUPPLIER_LIMIT,
      select: { name: true, phone: true, job: true },
    }),
  ])

  // گروه‌های اصلی/فرعی از داده واقعی کالاها
  const mainSet = new Map<string, string>() // name → ErpCode
  const sideByMain = new Map<string, Set<string>>() // mainName → sideNames
  for (const p of products) {
    const main = (p.mainGroup || 'متفرقه').trim() || 'متفرقه'
    if (!mainSet.has(main)) mainSet.set(main, genErp('bBAH'))
    const side = (p.subGroup || 'عمومی').trim() || 'عمومی'
    if (!sideByMain.has(main)) sideByMain.set(main, new Set())
    sideByMain.get(main)!.add(side)
  }
  if (!mainSet.has('متفرقه')) mainSet.set('متفرقه', genErp('bBAH'))
  if (!sideByMain.has('متفرقه')) sideByMain.set('متفرقه', new Set(['عمومی']))

  const sideSet = new Map<string, { ErpCode: string; MainGroupName: string; MainErpCode: string }>()
  for (const [mainName, sides] of sideByMain) {
    for (const sideName of sides) {
      sideSet.set(`${mainName}::${sideName}`, {
        ErpCode: genErp('bBAH'),
        MainGroupName: mainName,
        MainErpCode: mainSet.get(mainName)!,
      })
    }
  }

  const simProducts = products.map((p, i) => {
    const main = (p.mainGroup || 'متفرقه').trim() || 'متفرقه'
    const side = (p.subGroup || 'عمومی').trim() || 'عمومی'
    const barcodes = safeJson<string[]>(p.barcodesJson, [])
    const code = (p.code || (Array.isArray(barcodes) ? barcodes[0] : '') || `S${pad(i + 1, 8)}`).trim()
    const sell = Math.round(p.sellPrice || 0)
    const buy = Math.round(p.lastBuyPrice || Math.round(sell * 0.72) || 0)
    return {
      Code: code,
      Name: p.name,
      Few: p.stock || 0, // موجودی واقعی سامانه — سینک بازگشتی همان مقدار را می‌نویسد
      BuyPrice: buy,
      SellPrice: sell,
      LastBuyPrice: buy,
      SellPrice2: Math.round(sell * 1.05),
      SellPrice3: Math.round(sell * 1.1),
      CountInKarton: p.unitsPerCarton || 12,
      CountInBasteh: 0,
      MainGroupName: main,
      MainGroupErpCode: mainSet.get(main)!,
      SideGroupName: side,
      SideGroupErpCode: sideSet.get(`${main}::${side}`)?.ErpCode || genErp('bBAH'),
      ErpCode: genErp('bBAL'),
    }
  })

  const simCustomers = suppliers.map((s, i) => ({
    Code: `1${pad(i + 1, 4)}`,
    Name: s.name,
    IsPurchaser: false, // در هلو: طرف حساب ما فقط «فروشنده» است (تأمین‌کننده)
    IsSeller: true,
    Tel: s.phone || '',
    Mobile: /^09\d{9}$/.test(s.phone || '') ? s.phone : '',
    Job: s.job || 'تأمین‌کننده',
    ErpCode: genErp('bBAP'),
  }))

  const seed = {
    generatedAt: new Date().toISOString(),
    products: simProducts,
    customers: simCustomers,
    mainGroups: Array.from(mainSet.entries()).map(([Name, ErpCode]) => ({ Name, ErpCode })),
    sideGroups: Array.from(sideSet.entries()).map(([key, v]) => ({
      Name: key.split('::')[1],
      ErpCode: v.ErpCode,
      MainGroupName: v.MainGroupName,
      MainErpCode: v.MainErpCode,
    })),
    units: ['عدد', 'کارتن', 'کیلوگرم', 'بسته', 'پاکت', 'لیتر', 'متر', 'جین'].map((Name) => ({
      Name,
      ErpCode: genErp('bAV'),
    })),
  }

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(seed, null, 1), 'utf8')
  console.log(
    `seed.json نوشته شد → ${OUT}\nکالاها: ${simProducts.length} · اشخاص: ${simCustomers.length} · گروه اصلی: ${seed.mainGroups.length} · گروه فرعی: ${seed.sideGroups.length} · واحدها: ${seed.units.length}`
  )
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
