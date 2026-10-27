/**
 * scripts/import-aban-r13.ts — R13-DATA
 * ---------------------------------------------------------------------------
 * درون‌ریزی Snapshot آبان ۱۴۰۵ هلو (۱۴۰۵.۰۸.۰۵):
 *   • «مشخصات کالاهاي انبار 1405.08.05_1033.xls» — کاتالوگ کامل (فی فروش،
 *     قیمت فروش ۲ = قیمت چاپی، آخرین فی خرید، حداقل/حداکثر، تاریخ بررسی)
 *   • «موجودي کل انبار منتهي به 1405.08.05_0835.xls» — موجودی زنده + قیمت خرید/فروش
 *
 * تفاوت با import-inventory-r7.ts:
 *   • تطبیق با فایل‌های نام‌گذاری‌شدهٔ جدید (نه inventory.xls/current-inventory.xls)
 *   • R13: قیمت چاپی (قیمت فروش ۲) روی کالاهای موجود هم به‌روز می‌شود (اگر
 *     در فایل >۰ باشد) — تورم؛ معنای صحیح: sellPrice = قیمت فروش نهایی،
 *     sellPrice2 = قیمت چاپی.
 *   • کاتالوگ جدید ستون‌های بارکد (کد2..کد52) ندارد → بانک بارکد دست‌نخورده.
 *   • فایل جدیدِ ساختارِ «موجودی» ستون «قيمت خريد» میانگین است (قيمت خريد
 *     در واقع lastBuy نیست) — فقط قیمت فروشِ آن برای sellPrice استفاده می‌شود.
 *
 * Idempotent: اجرای دوباره همان مقادیر را دوباره اعمال می‌کند.
 * Run:  bun scripts/import-aban-r13.ts
 */
import * as XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const UPLOAD = path.join(__dirname, '..', 'upload')

function fa(s: string): string {
  return s.replace(/ي/g, 'ی').replace(/ى/g, 'ی').replace(/ك/g, 'ک').replace(/\u0640/g, '')
}
function enDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}
function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = enDigits(String(v)).replace(/[\s,٬]/g, '')
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}
function cellStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v)) : null
  const s = fa(String(v)).trim()
  return s === '' ? null : s
}
function headerMap(headerRow: unknown[]): Record<string, number> {
  const m: Record<string, number> = {}
  headerRow.forEach((h, i) => {
    if (h === null || h === undefined) return
    const key = fa(String(h)).replace(/\s+/g, ' ').trim()
    if (key) m[key] = i
  })
  return m
}
function dashDate(s: string): string {
  return s.trim().replace(/[./]+/g, '-')
}

function readSheet(fileMatch: RegExp): { file: string; rows: unknown[][] } {
  const file = fs.readdirSync(UPLOAD).find((f) => fileMatch.test(fa(f)))
  if (!file) throw new Error(`فایل ${fileMatch} در upload/ پیدا نشد`)
  const wb = XLSX.readFile(path.join(UPLOAD, file))
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })
  return { file, rows }
}

async function main() {
  /* ── ۱) کاتالوگ مشخصات کالاها (۱۴۰۵.۰۸.۰۵) ── */
  /* الگو باید «فارسی‌شده» باشد — fa() نام فایل را نرمال می‌کند (ي→ی) */
  const cat = readSheet(/^مشخصات کالاهای انبار/)
  const hm = headerMap(cat.rows[0] || [])
  const idx = (k: string): number => {
    const i = hm[k]
    if (i === undefined) throw new Error(`سرستون «${k}» در ${cat.file} یافت نشد`)
    return i
  }
  const iCode = idx('کد کالا')
  const iName = idx('نام کالا')
  const iMain = idx('گروه اصلی')
  const iSub = idx('گروه فرعی')
  const iSell = idx('فی فروش')
  const iSell2 = idx('قیمت فروش 2')
  const iBuy = idx('آخرین فی خرید')
  const iMin = idx('حداقل')
  const iStock = idx('موجودی')
  const iCheck = idx('تاریخ آخرین بررسی')

  /* ── ۲) موجودی کل انبار (زنده، ۱۴۰۵.۰۸.۰۵) ── */
  const cur = readSheet(/^موجودی کل انبار/)
  const hm2 = headerMap(cur.rows[0] || [])
  const idx2 = (k: string): number => {
    const i = hm2[k]
    if (i === undefined) throw new Error(`سرستون «${k}» در ${cur.file} یافت نشد`)
    return i
  }
  const cCode = idx2('کد کالا')
  const cQty = idx2('مقدار')
  const cSell = idx2('قیمت فروش')
  const currentBy = new Map<string, { qty: number; sell: number }>()
  for (let r = 1; r < cur.rows.length; r++) {
    const row = cur.rows[r] || []
    const code = cellStr(row[cCode])
    if (!code) continue
    currentBy.set(code, { qty: toNum(row[cQty]), sell: toNum(row[cSell]) })
  }
  console.log(`[read] catalog ${cat.file}: ${cat.rows.length - 1} rows | current ${cur.file}: ${currentBy.size} rows`)

  /* ── ۳) اعمال روی Product ── */
  const products = await db.product.findMany({ select: { id: true, code: true, active: true } })
  const byCode = new Map(products.map((p) => [p.code ?? '', p]))
  console.log(`[db] products=${products.length} (with code: ${byCode.size})`)

  let matched = 0
  let created = 0
  let missing = 0
  let price2Updated = 0
  const createdSamples: string[] = []
  const seen = new Set<string>()
  for (let r = 1; r < cat.rows.length; r++) {
    const row = cat.rows[r] || []
    const code = cellStr(row[iCode])
    if (!code || seen.has(code)) continue
    seen.add(code)
    const curRow = currentBy.get(code) ?? null
    const stock = curRow ? Math.round(curRow.qty) : Math.round(toNum(row[iStock]))
    const sellPrice = curRow && curRow.sell > 0 ? curRow.sell : toNum(row[iSell])
    const sellPrice2 = toNum(row[iSell2]) // قیمت چاپی
    const lastBuyPrice = toNum(row[iBuy])
    const reorder = toNum(row[iMin]) > 0 ? Math.round(toNum(row[iMin])) : null
    const lastCheck = cellStr(row[iCheck]) ? dashDate(cellStr(row[iCheck])!) : null
    const name = fa(String(row[iName] ?? '')).trim()
    const mainGroup = cellStr(row[iMain])
    const subGroup = cellStr(row[iSub])

    const ex = byCode.get(code)
    if (ex) {
      matched++
      const before = await db.product.findUnique({ where: { id: ex.id }, select: { sellPrice2: true } })
      await db.product.update({
        where: { id: ex.id },
        data: {
          ...(mainGroup ? { mainGroup } : {}),
          ...(subGroup ? { subGroup } : {}),
          ...(sellPrice > 0 ? { sellPrice } : {}),
          /* R13: قیمت چاپی — فقط مقدار معتبر فایل، وگرنه مقدار دستی حفظ می‌شود */
          ...(sellPrice2 > 0 ? { sellPrice2 } : {}),
          ...(lastBuyPrice > 0 ? { lastBuyPrice } : {}),
          stock,
          ...(lastCheck ? { lastCountDate: lastCheck } : {}),
          ...(reorder ? { reorderLevel: reorder } : {}),
        },
      })
      if (sellPrice2 > 0 && before && before.sellPrice2 !== sellPrice2) price2Updated++
    } else {
      /* کالای جدیدِ کاتالوگ — با پیش‌فرض‌های امن ثبت می‌شود */
      if (!name) {
        missing++
        continue
      }
      created++
      if (createdSamples.length < 8) createdSamples.push(`${code} ${name}`)
      await db.product.create({
        data: {
          name,
          code,
          unit: 'عدد',
          ...(mainGroup ? { mainGroup } : {}),
          ...(subGroup ? { category: subGroup } : {}),
          ...(sellPrice > 0 ? { sellPrice } : {}),
          ...(sellPrice2 > 0 ? { sellPrice2 } : {}),
          ...(lastBuyPrice > 0 ? { lastBuyPrice } : {}),
          stock,
          ...(lastCheck ? { lastCountDate: lastCheck } : {}),
          ...(reorder ? { reorderLevel: reorder } : {}),
          status: stock > 0 ? 'فعال' : 'غیر فعال',
          active: stock > 0,
          barcodesJson: JSON.stringify([code]),
        },
      })
    }
  }
  console.log(`\n════ summary ════`)
  console.log(`   matched=${matched} created=${created} (no-name skip=${missing}) | sellPrice2 changed=${price2Updated}`)
  if (createdSamples.length) console.log(`   created samples:\n      ${createdSamples.join('\n      ')}`)

  /* ── ۴) راستی‌آزمایی از DB ── */
  const total = await db.product.count()
  const withP2 = await db.product.count({ where: { sellPrice2: { gt: 0 } } })
  const spot = await db.product.findMany({
    where: { code: { in: ['1703', '9636'] } },
    select: { code: true, name: true, stock: true, sellPrice: true, sellPrice2: true, lastBuyPrice: true, lastCountDate: true },
  })
  console.log(`\n════ DB verification ════`)
  console.log(`   products=${total} sellPrice2>0=${withP2}`)
  console.log('   spot:', JSON.stringify(spot, null, 1))
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
