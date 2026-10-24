/**
 * scripts/import-trades-r7.ts — R7-DATA
 * ---------------------------------------------------------------------------
 * Import the store's REAL Holoo accounting exports (buy + sell, تیر..مهر ۱۴۰۵)
 * into `TradeRecord` and link every row to the existing `Product` catalog.
 *
 * Sources (upload/):
 *   خرید  : خريد تيرماه ۱۴۰۵ / خريد مردادماه 1405 / خريد شهريور ۱۴۰۵ / خريد مهرماه ۱۴۰۵
 *   فروش  : فروش تيرماه 1405 / فروش مردادماه 1405 / فروش شهريورماه 1405 / فروش مهرماه 1405
 *   (فایل «خرید مهرماه» ستون‌ها را وارونه دارد — از روی نام سرستون نقشه می‌سازیم،
 *    پس ترتیب فیزیکی ستون‌ها اهمیتی ندارد.)
 *
 * Month mapping (from filename): تیر→1405-04, مرداد→1405-05, شهریور→1405-06, مهر→1405-07.
 *
 * Idempotency: per (kind, month) → deleteMany then chunked createMany (2000/chunk).
 * Unique key in DB: (kind, month, invoiceNo, rowIdx); رديف in Holoo exports is a
 * global running number per file (verified monotonic 1..N, no duplicate keys) —
 * an in-memory Set guards against pathological duplicates anyway.
 *
 * Product linking: ① barcode (كد2) → Product.code / barcodesJson entries,
 * ② else exact normalized name (strip leading «- », Arabic ي/ك → Persian ی/ک,
 * collapse spaces). Unmatched rows keep productId=null (never fail).
 *
 * Run:  bun scripts/import-trades-r7.ts
 */
import * as XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { PrismaClient, Prisma } from '@prisma/client'

const db = new PrismaClient()
const UPLOAD = path.join(__dirname, '..', 'upload')

/* ─────────────── normalization helpers (shared conventions) ─────────────── */

/** Arabic variants → Persian (same convention as convert-holoo-export.py / live DB) */
function fa(s: string): string {
  return s
    .replace(/ي/g, 'ی')
    .replace(/ى/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u0640/g, '')
}

/** Persian/Arabic digits → Latin */
function enDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

/** any cell → number (handles null, numbers, "1,234.5", Persian digits) */
function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = enDigits(String(v)).replace(/[\s,٬]/g, '')
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/** any cell → trimmed string | null (numbers lose their .0, keep digits as-is) */
function cellStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v)) : null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** normalized header name → column index map (order-agnostic, whitespace-collapsed) */
type HMap = Record<string, number>
function headerMap(headerRow: unknown[]): HMap {
  const m: HMap = {}
  headerRow.forEach((h, i) => {
    if (h === null || h === undefined) return
    const key = fa(String(h)).replace(/\s+/g, ' ').trim()
    if (key) m[key] = i
  })
  return m
}

/** product-name normalization for matching (strip «- », Persian chars, collapse spaces) */
function normName(s: string): string {
  return fa(s).replace(/^\s*-\s*/, '').replace(/\s+/g, ' ').trim()
}

/* ─────────────────────── file discovery / month map ─────────────────────── */

const MONTH_KEYS: [RegExp, string][] = [
  [/تیر/, '1405-04'],
  [/مرداد/, '1405-05'],
  [/شهریور/, '1405-06'],
  [/مهر/, '1405-07'],
]

function detectTradeFile(fileName: string): { kind: 'BUY' | 'SELL'; month: string } | null {
  const n = fa(fileName)
  if (!/\.xls$/i.test(n)) return null
  let kind: 'BUY' | 'SELL' | null = null
  if (/^خرید/.test(n)) kind = 'BUY'
  else if (/^فروش/.test(n)) kind = 'SELL'
  if (!kind) return null
  for (const [re, month] of MONTH_KEYS) if (re.test(n)) return { kind, month }
  return null
}

/* ─────────────────────────── product link maps ──────────────────────────── */

async function buildProductMaps() {
  // active-first ordering → first-wins prefers live products on name collisions
  const products = await db.product.findMany({
    select: { id: true, code: true, name: true, barcodesJson: true, active: true },
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
  })
  const byBarcode = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const p of products) {
    if (p.code && !byBarcode.has(p.code)) byBarcode.set(p.code, p.id)
    let arr: string[] = []
    try {
      arr = JSON.parse(p.barcodesJson || '[]') as string[]
    } catch {
      arr = []
    }
    for (const b of arr) if (b && !byBarcode.has(b)) byBarcode.set(b, p.id)
    const n = normName(p.name)
    if (n && !byName.has(n)) byName.set(n, p.id)
  }
  console.log(
    `[link-maps] products=${products.length} barcodeKeys=${byBarcode.size} nameKeys=${byName.size}`
  )
  return { byBarcode, byName }
}

/* ─────────────────────────── one file import ────────────────────────────── */

interface FileSummary {
  file: string
  kind: 'BUY' | 'SELL'
  month: string
  sheetRows: number
  dataRows: number
  imported: number
  dupKeySkipped: number
  noNameSkipped: number
  linkedBarcode: number
  linkedName: number
  unlinked: number
  dateMin: string
  dateMax: string
}

async function importOneFile(
  file: string,
  kind: 'BUY' | 'SELL',
  month: string,
  maps: { byBarcode: Map<string, string>; byName: Map<string, string> }
): Promise<FileSummary> {
  const wb = XLSX.readFile(path.join(UPLOAD, file))
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })
  if (!rows.length) throw new Error(`فایل «${file}» خالی است`)
  const hm = headerMap(rows[0] as unknown[])
  const need = (key: string): number => {
    const i = hm[key]
    if (i === undefined) throw new Error(`سرستون «${key}» در ${file} یافت نشد`)
    return i
  }
  // NOTE: keys must be in Persian-normalized form (fa() + collapsed spaces) — headerMap normalizes the same way
  const iRow = need('ردیف')
  const iInv = need('شماره فاکتور')
  const iDate = need('تاریخ فاکتور')
  const iName = need('نام کالا')
  const iQty = need('مقدار')
  const iPrice = need('فی')
  const iLine = need('جمع هر سطر')
  const iDisc = need('تخفیف ریالی هر سطر')
  const iAfter = need('جمع هر سطر با احتساب تخفیف')
  const iNote = need('توضیحات سطری فاکتور')
  const iBc = need('کد2')

  const summary: FileSummary = {
    file, kind, month,
    sheetRows: rows.length - 1,
    dataRows: 0, imported: 0, dupKeySkipped: 0, noNameSkipped: 0,
    linkedBarcode: 0, linkedName: 0, unlinked: 0,
    dateMin: '', dateMax: '',
  }
  const seen = new Set<string>()
  const out: Prisma.TradeRecordCreateManyInput[] = []

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || []
    const rawIdx = row[iRow]
    const rawInv = row[iInv]
    // trailing totals row / blank lines have no رديف or شماره فاكتور
    if (rawIdx === null || rawIdx === undefined || rawInv === null || rawInv === undefined) continue
    const invoiceNo = cellStr(rawInv)
    if (!invoiceNo) continue
    const productName = fa(String(row[iName] ?? '')).trim()
    if (!productName) {
      summary.noNameSkipped++
      continue
    }
    const rowIdx = Math.round(toNum(rawIdx))
    const key = `${invoiceNo}|${rowIdx}`
    if (seen.has(key)) {
      summary.dupKeySkipped++
      continue
    }
    seen.add(key)
    summary.dataRows++

    const dateJalali = String(row[iDate] ?? '').trim()
    if (dateJalali) {
      if (!summary.dateMin || dateJalali < summary.dateMin) summary.dateMin = dateJalali
      if (!summary.dateMax || dateJalali > summary.dateMax) summary.dateMax = dateJalali
    }

    const barcode = cellStr(row[iBc])
    let productId: string | null = null
    if (barcode) {
      const hit = maps.byBarcode.get(barcode)
      if (hit) {
        productId = hit
        summary.linkedBarcode++
      }
    }
    if (!productId) {
      const hit = maps.byName.get(normName(productName))
      if (hit) {
        productId = hit
        summary.linkedName++
      } else {
        summary.unlinked++
      }
    }

    const note = row[iNote] === null || row[iNote] === undefined ? null : fa(String(row[iNote])).trim() || null
    out.push({
      kind,
      month,
      dateJalali,
      invoiceNo,
      rowIdx,
      productName,
      productId,
      barcode,
      qty: toNum(row[iQty]),
      unitPrice: toNum(row[iPrice]),
      lineTotal: toNum(row[iLine]),
      discount: toNum(row[iDisc]),
      totalAfter: toNum(row[iAfter]),
      note,
    })
  }

  // idempotent replace per (kind, month)
  const del = await db.tradeRecord.deleteMany({ where: { kind, month } })
  const CHUNK = 2000
  for (let i = 0; i < out.length; i += CHUNK) {
    await db.tradeRecord.createMany({ data: out.slice(i, i + CHUNK) })
  }
  summary.imported = out.length
  console.log(
    `[${kind} ${month}] ${file} (sheet «${sheetName}»): sheetRows=${summary.sheetRows} dataRows=${summary.dataRows} → imported=${summary.imported} (deleted ${del.count} old) | linked: barcode=${summary.linkedBarcode} name=${summary.linkedName} unlinked=${summary.unlinked} | dupKeySkip=${summary.dupKeySkipped} noNameSkip=${summary.noNameSkipped} | dates ${summary.dateMin}..${summary.dateMax}`
  )
  return summary
}

/* ─────────────────────────────── main ───────────────────────────────────── */

async function main() {
  const files = fs.readdirSync(UPLOAD)
  const targets: { file: string; kind: 'BUY' | 'SELL'; month: string }[] = []
  for (const f of files) {
    const hit = detectTradeFile(f)
    if (hit) targets.push({ file: f, ...hit })
  }
  targets.sort((a, b) => a.kind.localeCompare(b.kind) || a.month.localeCompare(b.month))
  if (!targets.length) throw new Error('هیچ فایل خرید/فروشی در upload/ پیدا نشد')
  console.log(`[discovered] ${targets.length} trade files:`)
  for (const t of targets) console.log(`   ${t.kind}  ${t.month}  ← ${JSON.stringify(t.file)}`)

  const maps = await buildProductMaps()
  const all: FileSummary[] = []
  for (const t of targets) {
    all.push(await importOneFile(t.file, t.kind, t.month, maps))
  }

  // ── verification straight from the DB ──
  const byGroup = await db.tradeRecord.groupBy({
    by: ['kind', 'month'],
    _count: { _all: true },
    _sum: { lineTotal: true, qty: true },
    orderBy: [{ kind: 'asc' }, { month: 'asc' }],
  })
  console.log('\n════ DB verification (kind/month) ════')
  let totalRows = 0
  for (const g of byGroup) {
    totalRows += g._count._all
    console.log(
      `   ${g.kind} ${g.month}: rows=${g._count._all} lineTotal=${Math.round(g._sum.lineTotal ?? 0).toLocaleString('en-US')} qty=${Math.round((g._sum.qty ?? 0) * 1000) / 1000}`
    )
  }
  const linked = await db.tradeRecord.count({ where: { productId: { not: null } } })
  console.log(`   TOTAL rows=${totalRows} | linked productId=${linked} unlinked=${totalRows - linked}`)

  console.log(
    `\n[done] files=${all.length} totalImported=${all.reduce((s, x) => s + x.imported, 0)} linked=${all.reduce((s, x) => s + x.linkedBarcode + x.linkedName, 0)} unlinked=${all.reduce((s, x) => s + x.unlinked, 0)}`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
