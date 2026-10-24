/**
 * scripts/import-stakeholders-r7.ts — R7-DATA
 * ---------------------------------------------------------------------------
 * Import the REAL Holoo stakeholder ledger (upload/stakeholders-new.xlsx,
 * sheet «stakeholders-new», 1178 data rows incl. trailing totals row) into Supplier.
 *
 * Upsert by `code`; rows WITHOUT a code (17 — e.g. «بانی چاو» variants) are matched
 * by normalized name (strip leading «|», Arabic ي/ك → Persian ی/ک, collapse spaces)
 * and created when unknown. Suppliers absent from the file are NEVER deleted.
 *
 * Updated fields ONLY (everything else — job, intermediary, note, … — untouched):
 *   name (strip «|», trim) · phone (mobile preferred, else تلفن; keep old when empty)
 *   balance (مانده) · creditLimit (حد اعتبار) · classification (طبقه بندي)
 *   status (فعال → 'فعال'، غير فعال → 'غیر فعال')
 *
 * Newly created suppliers additionally get sensible defaults from the same file:
 *   job (شغل) · intermediary (نام واسطه) · note envelope {note, economicCode,
 *   nationalId, postalCode} — same contract as import-holoo.ts.
 *
 * Idempotent: re-running re-applies the same values (pure upsert).
 *
 * Run:  bun scripts/import-stakeholders-r7.ts
 */
import * as XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const UPLOAD = path.join(__dirname, '..', 'upload')

/* ─────────────── normalization helpers (same family as R7 scripts) ──────── */

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
/** supplier name normalization: strip «|», drop paren/bracket characters (they only
 *  decorate — «بانی چاو (لاین سس و سولیکو)» ≡ «بانی چاو لاین سس و سولیکو»), Persian chars, collapse spaces */
function normName(s: string): string {
  return fa(s)
    .replace(/^\s*\|+\s*/, '')
    .replace(/[()\[\]«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
function mapStatus(v: string | null): 'فعال' | 'غیر فعال' | null {
  if (!v) return null
  const n = fa(v).replace(/\s+/g, ' ').trim()
  if (n === 'فعال') return 'فعال'
  if (n === 'غیر فعال' || n === 'غير فعال') return 'غیر فعال'
  return null
}

/* ─────────────────────────────── main ───────────────────────────────────── */

async function main() {
  // locate file (exact name, Persian-safe)
  const file = fs.readdirSync(UPLOAD).find((f) => /^stakeholders-new\.xlsx$/.test(f))
  if (!file) throw new Error('فایل stakeholders-new.xlsx در upload/ پیدا نشد')
  const wb = XLSX.readFile(path.join(UPLOAD, file))
  const sheetName = wb.SheetNames.find((s) => /stakeholders-new/.test(fa(s))) ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })

  const hm: Record<string, number> = {}
  ;(rows[0] || []).forEach((h, i) => {
    if (h === null || h === undefined) return
    const key = fa(String(h)).replace(/\s+/g, ' ').trim()
    if (key) hm[key] = i
  })
  const idx = (k: string): number => {
    const i = hm[k]
    if (i === undefined) throw new Error(`سرستون «${k}» در ${file} یافت نشد`)
    return i
  }
  const iName = idx('نام طرف حساب')
  const iCode = idx('کد طرف حساب')
  const iPhone = idx('تلفن')
  const iMobile = idx('تلفن همراه')
  const iBalance = idx('مانده')
  const iCredit = idx('حد اعتبار')
  const iClass = idx('طبقه بندی') // header «طبقه بندي» — fa() → «طبقه بندی»
  const iStatus = idx('وضعیت طرف حساب')
  const iJob = idx('شغل')
  const iInter = idx('نام واسطه')
  const iNote = idx('توضیحات') // «توضيحات» — fa() → «توضیحات»
  const iEco = idx('کد اقتصادی')
  const iNational = idx('کد ملی')
  const iPostal = idx('کد پستی')

  interface Row {
    name: string // stored name — fa + strip «|» + trim (parens kept as in file)
    matchName: string // aggressive form for matching (parens dropped)
    code: string | null
    phone: string | null
    balance: number
    creditLimit: number
    classification: string | null
    status: 'فعال' | 'غیر فعال' | null
    job: string | null
    intermediary: string | null
    note: string | null
    economicCode: string | null
    nationalId: string | null
    postalCode: string | null
  }
  const parsed: Row[] = []
  let skippedTotals = 0
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || []
    const code = cellStr(row[iCode])
    const rawName =
      row[iName] === null || row[iName] === undefined
        ? null
        : fa(String(row[iName])).replace(/^\s*\|+/, '').replace(/\s+/g, ' ').trim()
    if (!code && !rawName) {
      skippedTotals++ // trailing totals row / blank line
      continue
    }
    if (!rawName) {
      skippedTotals++
      continue
    }
    const mobile = cellStr(row[iMobile])
    const phone = cellStr(row[iPhone])
    parsed.push({
      name: rawName,
      matchName: normName(rawName),
      code,
      phone: mobile ?? phone,
      balance: toNum(row[iBalance]),
      creditLimit: toNum(row[iCredit]),
      classification: cellStr(row[iClass]),
      status: mapStatus(cellStr(row[iStatus])),
      job: cellStr(row[iJob]),
      intermediary: cellStr(row[iInter]),
      note: cellStr(row[iNote]),
      economicCode: cellStr(row[iEco]),
      nationalId: cellStr(row[iNational]),
      postalCode: cellStr(row[iPostal]),
    })
  }
  console.log(`[read] ${file} sheet «${sheetName}»: ${rows.length - 1} rows → ${parsed.length} real rows (skipped ${skippedTotals})`)
  const withCode = parsed.filter((p) => p.code).length
  console.log(`   rows with code: ${withCode} | without code (name-matched): ${parsed.length - withCode}`)

  // existing suppliers — by code + by normalized name (for the no-code rows)
  const existing = await db.supplier.findMany({
    select: { id: true, code: true, name: true, phone: true },
  })
  const byCode = new Map<string, { id: string }>()
  const byName = new Map<string, { id: string }>()
  for (const s of existing) {
    if (s.code) {
      const c = s.code.trim()
      if (c && !byCode.has(c)) byCode.set(c, { id: s.id })
    }
    const n = normName(s.name)
    if (n && !byName.has(n)) byName.set(n, { id: s.id })
  }
  console.log(`[db] suppliers=${existing.length} (with code: ${byCode.size}, distinct names: ${byName.size})`)

  let updated = 0, created = 0, updatedByName = 0, createdNoCode = 0
  const createdSamples: string[] = []
  const seenCodes = new Set<string>()
  const seenNames = new Set<string>()

  for (const p of parsed) {
    const hit = p.code ? byCode.get(p.code.trim()) : undefined
    const nameHit = !p.code ? byName.get(p.matchName) : undefined
    if (p.code) {
      if (seenCodes.has(p.code)) continue // defensive — ledger codes unique
      seenCodes.add(p.code)
    } else if (seenNames.has(p.matchName)) continue
    else seenNames.add(p.matchName)

    if (hit || nameHit) {
      const id = (hit ?? nameHit)!.id
      const data: Record<string, unknown> = {
        name: p.name,
        balance: p.balance,
        creditLimit: p.creditLimit,
      }
      if (p.phone) data.phone = p.phone // keep existing phone when file has none
      if (p.classification) data.classification = p.classification
      if (p.status) data.status = p.status
      await db.supplier.update({ where: { id }, data })
      updated++
      if (nameHit && !hit) updatedByName++
    } else {
      // create — sensible defaults from the same file (job/intermediary/note envelope)
      const extras = {
        note: p.note ?? null,
        economicCode: p.economicCode ?? null,
        nationalId: p.nationalId ?? null,
        postalCode: p.postalCode ?? null,
      }
      const hasExtras = extras.note || extras.economicCode || extras.nationalId || extras.postalCode
      await db.supplier.create({
        data: {
          name: p.name,
          code: p.code,
          phone: p.phone,
          job: p.job,
          classification: p.classification,
          intermediary: p.intermediary,
          balance: p.balance,
          creditLimit: p.creditLimit,
          status: p.status ?? 'فعال',
          note: hasExtras ? JSON.stringify(extras) : null,
        },
      })
      created++
      if (!p.code) createdNoCode++
      if (createdSamples.length < 12) createdSamples.push(`${p.code ?? '(بدون کد)'} ${p.name}`)
    }
  }

  console.log('\n════ import summary ════')
  console.log(`   updated: ${updated} (of which matched by name only: ${updatedByName}) | created: ${created} (no-code: ${createdNoCode})`)
  if (createdSamples.length) console.log(`   created samples:\n      ${createdSamples.join('\n      ')}`)

  // ── verification: بانی چاو + totals ──
  const total = await db.supplier.count()
  const banis = await db.supplier.findMany({
    where: { name: { contains: 'چاو' } },
    select: { code: true, name: true, phone: true, balance: true, creditLimit: true, classification: true, status: true },
    orderBy: { name: 'asc' },
  })
  console.log('\n════ DB verification ════')
  console.log(`   suppliers total=${total}`)
  console.log(`   «چاو» suppliers (${banis.length}):`)
  for (const b of banis) {
    console.log(
      `      ${b.code ?? '(بدون کد)'} | ${b.name} | phone=${b.phone ?? '—'} | balance=${b.balance ?? '—'} | credit=${b.creditLimit} | class=${b.classification ?? '—'} | ${b.status}`
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
