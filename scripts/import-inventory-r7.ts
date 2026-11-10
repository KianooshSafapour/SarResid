/**
 * scripts/import-inventory-r7.ts — R7-DATA
 * ---------------------------------------------------------------------------
 * Import the REAL Holoo warehouse/accounting snapshot into the Product table:
 *   • upload/inventory.xls        — full catalog (groups, prices, check dates)
 *   • upload/current-inventory.xls — current stock + live buy/sell prices
 *
 * Per catalog row (matched to Product by `code`; missing products are CREATED
 * with sensible defaults — unit mapping: کیلوگرم/عدد/بسته/دستی/گرم kept, else عدد):
 *   mainGroup, subGroup (whitespace-cleaned, Persian as-is), sellPrice, lastBuyPrice
 *   (قیمت خرید current-inventory if present, else آخرین فی خرید), stock (INT round of
 *   current-inventory مقدار; absent → 0), lastCountDate (تاریخ آخرین بررسی → YYYY-MM-DD),
 *   reorderLevel (حداقل when > 0).
 *   ⚠ NEVER touched on existing products: name, unit, barcodesJson, sectionLabel,
 *   sellPrice2, lowStockThreshold, category, supplier links, manualUnit.
 *
 * Smart deactivation analysis (run AFTER import-trades-r7.ts — uses SELL history):
 *   active=false / status='غیر فعال' when stock==0 AND lastCheckDate < 1405-04-01
 *   AND no sales in TradeRecord SELL data (matched by productId OR normalized name).
 *   Products WITH recent sales or stock>0 stay/become active.
 *
 * Idempotent: re-running re-applies the same values (pure upsert, no deletes).
 *
 * Run:  bun scripts/import-inventory-r7.ts
 */
import * as XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const UPLOAD = path.join(__dirname, '..', 'upload')

/* ─────────────── normalization helpers (same as import-trades-r7) ───────── */

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
function normName(s: string): string {
  return fa(s).replace(/^\s*-\s*/, '').replace(/\s+/g, ' ').trim()
}
/** "1405.05.31" / "1405/05/31" → "1405-05-31" */
function dashDate(s: string): string {
  return s.trim().replace(/[./]+/g, '-')
}

const KEEP_UNITS = new Set(['کیلوگرم', 'عدد', 'بسته', 'دستی', 'گرم'])
function mapUnit(u: string | null): string {
  return u && KEEP_UNITS.has(u) ? u : 'عدد'
}

/* ─────────────────────────── sheet readers ──────────────────────────────── */

function readSheet(fileMatch: RegExp): { file: string; rows: unknown[][] } {
  const file = fs.readdirSync(UPLOAD).find((f) => fileMatch.test(fa(f)))
  if (!file) throw new Error(`فایل ${fileMatch} در upload/ پیدا نشد`)
  const wb = XLSX.readFile(path.join(UPLOAD, file))
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })
  return { file, rows }
}

interface CatalogRow {
  code: string
  name: string
  mainGroup: string | null
  subGroup: string | null
  unit: string | null
  sellPrice: number
  sellPrice2: number
  lastBuyPrice: number
  min: number
  max: number
  stockHoloo: number
  lastCheck: string | null
  barcodes: string[]
}

interface CurrentRow {
  qty: number
  buy: number
  sell: number
}

function readCatalog(): { file: string; rows: CatalogRow[]; skippedNoCode: number } {
  const { file, rows } = readSheet(/^inventory\.xls$/)
  const hm = headerMap(rows[0] || [])
  const idx = (k: string): number => {
    const i = hm[k]
    if (i === undefined) throw new Error(`سرستون «${k}» در ${file} یافت نشد`)
    return i
  }
  const iCode = idx('کد کالا')
  const iName = idx('نام کالا')
  const iMain = idx('گروه اصلی')
  const iSub = idx('گروه فرعی')
  const iUnit = idx('واحد کالا')
  const iSell = idx('فی فروش')
  const iSell2 = idx('قیمت فروش 2')
  const iBuy = idx('آخرین فی خرید')
  const iMin = idx('حداقل')
  const iMax = idx('حداکثر')
  const iStock = idx('موجودی')
  const iCheck = idx('تاریخ آخرین بررسی')
  const bcCols: number[] = []
  for (let n = 2; n <= 52; n++) {
    const i = hm[`کد${n}`]
    if (i !== undefined) bcCols.push(i)
  }

  const out: CatalogRow[] = []
  let skippedNoCode = 0
  const seen = new Set<string>()
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || []
    const code = cellStr(row[iCode])
    if (!code) {
      skippedNoCode++
      continue
    }
    if (seen.has(code)) continue // defensive — catalog verified unique
    seen.add(code)
    const barcodes: string[] = []
    for (const c of bcCols) {
      const b = cellStr(row[c])
      if (b && b !== code && !barcodes.includes(b)) barcodes.push(b)
    }
    out.push({
      code,
      name: fa(String(row[iName] ?? '')).trim(),
      mainGroup: cellStr(row[iMain]),
      subGroup: cellStr(row[iSub]),
      unit: cellStr(row[iUnit]),
      sellPrice: toNum(row[iSell]),
      sellPrice2: toNum(row[iSell2]),
      lastBuyPrice: toNum(row[iBuy]),
      min: toNum(row[iMin]),
      max: toNum(row[iMax]),
      stockHoloo: toNum(row[iStock]),
      lastCheck: cellStr(row[iCheck]) ? dashDate(cellStr(row[iCheck])!) : null,
      barcodes,
    })
  }
  return { file, rows: out, skippedNoCode }
}

function readCurrent(): { file: string; map: Map<string, CurrentRow> } {
  const { file, rows } = readSheet(/^current-inventory\.xls$/)
  const hm = headerMap(rows[0] || [])
  const idx = (k: string): number => {
    const i = hm[k]
    if (i === undefined) throw new Error(`سرستون «${k}» در ${file} یافت نشد`)
    return i
  }
  const iCode = idx('کد کالا')
  const iQty = idx('مقدار')
  const iBuy = idx('قیمت خرید')
  const iSell = idx('قیمت فروش')
  const map = new Map<string, CurrentRow>()
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || []
    const code = cellStr(row[iCode])
    if (!code) continue // totals row
    map.set(code, { qty: toNum(row[iQty]), buy: toNum(row[iBuy]), sell: toNum(row[iSell]) })
  }
  return { file, map }
}

/* ─────────────────────────────── main ───────────────────────────────────── */

async function main() {
  const catalog = readCatalog()
  const current = readCurrent()
  console.log(`[read] catalog ${catalog.file}: ${catalog.rows.length} rows (no-code skipped: ${catalog.skippedNoCode})`)
  console.log(`[read] current ${current.file}: ${current.map.size} rows`)

  // existing products (by code)
  const products = await db.product.findMany({
    select: { id: true, code: true, name: true, active: true, status: true },
  })
  const byCode = new Map<string, { id: string; name: string; active: boolean; status: string }>()
  for (const p of products) if (p.code) byCode.set(p.code, { id: p.id, name: p.name, active: p.active, status: p.status })
  console.log(`[db] products=${products.length} (with code: ${byCode.size})`)

  // SELL history → has-sales sets (productId + normalized name)
  const sellCount = await db.tradeRecord.count({ where: { kind: 'SELL' } })
  if (!sellCount) console.warn('⚠ هشدار: هیچ رکورد فروشی در TradeRecord نیست — ابتدا import-trades-r7.ts را اجرا کنید')
  const sellIds = new Set<string>()
  const sellNames = new Set<string>()
  if (sellCount) {
    const sellRows = await db.tradeRecord.findMany({
      where: { kind: 'SELL' },
      select: { productId: true, productName: true },
    })
    for (const s of sellRows) {
      if (s.productId) sellIds.add(s.productId)
      const n = normName(s.productName)
      if (n) sellNames.add(n)
    }
  }
  console.log(`[sell-history] SELL rows=${sellCount} distinct linked products=${sellIds.size} distinct names=${sellNames.size}`)

  // ── counters ──
  let matched = 0, created = 0
  let updatedFields = 0
  let deactivated = 0, staysDead = 0, reactivated = 0, staysActive = 0, activityUntouched = 0
  let cStock0 = 0, cNoSales = 0, cOldCheck = 0
  const deactivatedSamples: string[] = []
  const reactivatedSamples: string[] = []
  const createdSamples: string[] = []

  for (const row of catalog.rows) {
    const cur = current.map.get(row.code) ?? null
    const stock = cur ? Math.round(cur.qty) : 0
    const sellPrice = cur && cur.sell > 0 ? cur.sell : row.sellPrice
    const lastBuyPrice = cur && cur.buy > 0 ? cur.buy : row.lastBuyPrice
    const reorder = row.min > 0 ? Math.round(row.min) : null
    const lastCountDate = row.lastCheck ?? null

    // has-sales: productId link OR exact normalized-name match against SELL rows
    const matchName = normName(row.name)
    const hasSales = sellNames.has(matchName)
    const oldCheck = lastCountDate ? lastCountDate < '1405-04-01' : true
    const dead = stock === 0 && !hasSales && oldCheck

    const ex = byCode.get(row.code)
    if (ex) {
      matched++
      // name-based sell check ALSO by the DB row's own id (linked trades)
      const hasSalesRow = hasSales || sellIds.has(ex.id)
      const deadRow = stock === 0 && !hasSalesRow && oldCheck
      const data: Record<string, unknown> = {
        mainGroup: row.mainGroup ?? undefined,
        subGroup: row.subGroup ?? undefined,
        sellPrice,
        lastBuyPrice,
        stock,
        lastCountDate: lastCountDate ?? undefined,
        reorderLevel: reorder ?? undefined,
      }
      if (deadRow) {
        data.active = false
        data.status = 'غیر فعال'
        if (ex.active) {
          deactivated++
          if (deactivatedSamples.length < 10) deactivatedSamples.push(`${row.code} ${row.name}`)
        } else staysDead++
      } else if (hasSalesRow || stock > 0) {
        data.active = true
        data.status = 'فعال'
        if (!ex.active) {
          reactivated++
          if (reactivatedSamples.length < 10) reactivatedSamples.push(`${row.code} ${row.name}`)
        } else staysActive++
      } else {
        activityUntouched++
      }
      await db.product.update({ where: { id: ex.id }, data })
      updatedFields++
    } else {
      // create new product with sensible defaults
      created++
      if (createdSamples.length < 10) createdSamples.push(`${row.code} ${row.name}`)
      const active = !dead
      await db.product.create({
        data: {
          name: row.name, // keeps «- » prefix — same convention as the whole DB
          code: row.code,
          unit: mapUnit(row.unit),
          category: row.subGroup ?? row.mainGroup ?? null,
          mainGroup: row.mainGroup ?? null,
          subGroup: row.subGroup ?? null,
          sellPrice,
          sellPrice2: row.sellPrice2,
          lastBuyPrice,
          stock,
          reorderLevel: reorder,
          lastCountDate,
          status: active ? 'فعال' : 'غیر فعال',
          active,
          barcodesJson: JSON.stringify([row.code, ...row.barcodes]),
        },
      })
      if (dead) staysDead++ // created straight into inactive state
    }

    if (stock === 0) cStock0++
    if (!hasSales) cNoSales++
    if (oldCheck) cOldCheck++
  }

  console.log('\n════ import summary ════')
  console.log(`   catalog matched existing: ${matched} | created new: ${created} | field-updates applied: ${updatedFields}`)
  console.log(`   criteria — stock==0: ${cStock0} | no-sales: ${cNoSales} | old-check(<1405-04-01): ${cOldCheck}`)
  console.log(
    `   deactivation — deactivated: ${deactivated} | stays-dead (already inactive): ${staysDead} | reactivated: ${reactivated} | stays-active: ${staysActive} | untouched: ${activityUntouched}`
  )
  if (deactivatedSamples.length) console.log(`   deactivated samples:\n      ${deactivatedSamples.join('\n      ')}`)
  if (reactivatedSamples.length) console.log(`   reactivated samples:\n      ${reactivatedSamples.join('\n      ')}`)
  if (createdSamples.length) console.log(`   created samples:\n      ${createdSamples.join('\n      ')}`)

  // ── verification straight from the DB ──
  const total = await db.product.count()
  const act = await db.product.count({ where: { active: true } })
  const stockGt0 = await db.product.count({ where: { stock: { gt: 0 } } })
  const lcd = await db.product.count({ where: { lastCountDate: { not: null } } })
  const withStockCheck = await db.product.findMany({
    where: { code: { in: ['1703', '9636', '7387'] } },
    select: { code: true, name: true, stock: true, sellPrice: true, lastBuyPrice: true, lastCountDate: true, mainGroup: true, subGroup: true, active: true, reorderLevel: true },
  })
  console.log('\n════ DB verification ════')
  console.log(`   products=${total} active=${act} inactive=${total - act} | stock>0=${stockGt0} | lastCountDate set=${lcd}`)
  console.log('   spot-check:', JSON.stringify(withStockCheck, null, 1))
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
