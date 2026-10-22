/**
 * import-inventory.ts — ورود آخرین موجودی انبار از فایل XLS (upload/inv-current.xls)
 * -----------------------------------------------------------------------------
 * مالک (req #22 + #27): «فایل‌های XLS آخرین موجودی انبار و فروشگاه را دارند؛
 * دیتابیس را به‌روز کنید و هر دادهٔ قلابی را حذف کنید.»
 *
 * گام‌ها:
 *  1) ورود kianoosh (پین) → کوکی
 *  2) POST /api/admin/snapshot {kind:'PRE_IMPORT'} — پشتیبانِ پیش از تغییر
 *  3) تراکنش: صفر کردن stock همهٔ کالاها → اعمال مقادیر/قیمت‌های XLS (تطبیق با code)
 *     → ساخت کالاهای جدید (44 کد ناموجود در DB) با unit از classify()
 *  4) حذف داده‌های قلابی عملیاتی (سفارش/مرجوعی/چک/پرداخت/سودسنج/انبارگردانی دمو)
 *  5) POST /api/admin/snapshot {kind:'BASELINE'} — وضعیت مرجع برای «بازنشانی»
 *
 * اجرا: bunx tsx scripts/import-inventory.ts  (idempotent-safe: re-run re-applies)
 */
import * as XLSX from 'xlsx'
import { db } from '../src/lib/db'
import { classify } from './apply-default-units'

const BASE = 'http://localhost:3000'
const XLS_PATH = 'upload/inv-current.xls'

let COOKIE = ''
async function login() {
  const roster = await (await fetch(`${BASE}/api/auth/roster`)).json()
  const me = (roster?.data?.users || roster?.users || []).find((u: any) => u.username === 'kianoosh')
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: me.id, mode: 'pin', value: '1234' }),
  })
  const sc = res.headers.get('set-cookie') || ''
  COOKIE = sc.split(';')[0]
  if (!COOKIE) throw new Error('login failed')
}
async function api(path: string, init?: RequestInit) {
  return fetch(`${BASE}${path}`, { ...init, headers: { ...(init?.headers || {}), cookie: COOKIE } })
}

interface Row { code: string; name: string; qty: number; buy: number; sell: number }

function readXls(): Row[] {
  const wb = XLSX.readFile(XLS_PATH)
  const ws = wb.Sheets['inv-current']
  const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false }).slice(1)
  const out: Row[] = []
  for (const r of raw) {
    if (!r || r[1] == null) continue
    const code = String(r[1]).trim()
    if (!code) continue
    out.push({
      code,
      name: String(r[2] ?? '').trim(),
      qty: Number(r[3]) || 0,
      buy: Number(r[6]) || 0,
      sell: Number(r[7]) || 0,
    })
  }
  return out
}

async function main() {
  console.log('== import-inventory: شروع ==')
  await login()
  console.log('✓ ورود kianoosh')

  const rows = readXls()
  console.log(`✓ XLS خوانده شد: ${rows.length} ردیف`)

  // ---- 1) PRE_IMPORT snapshot (فقط اگر نبود — idempotent) ----
  const existing = await db.dataSnapshot.findFirst({ where: { kind: 'PRE_IMPORT' } })
  if (!existing) {
    const pre = await (await api('/api/admin/snapshot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'پیش از ورود موجودی XLS', note: 'وضعیت دیتابیس قبل از import-inventory', kind: 'PRE_IMPORT' }),
    })).json()
    console.log('✓ PRE_IMPORT snapshot:', pre?.data?.id ?? pre)
  } else {
    console.log('• PRE_IMPORT از قبل موجود بود — رد شد:', existing.id)
  }

  // ---- 2) apply to DB ----
  let updated = 0, zeroed = 0, created = 0, fracRoundedDown = 0
  const byCode = new Map(rows.map(r => [r.code, r]))
  const existingProducts = await db.product.findMany({ select: { id: true, code: true, stock: true } })

  await db.$transaction(async (tx) => {
    // صفر کردن موجودی همهٔ کالاها (دادهٔ قلابی seed)
    const zero = await tx.product.updateMany({ where: { stock: { not: 0 } }, data: { stock: 0 } })
    zeroed = zero.count

    for (const p of existingProducts) {
      const r = p.code ? byCode.get(p.code) : undefined
      if (!r) continue
      const stock = Math.round(r.qty)
      if (r.qty > 0 && stock === 0) fracRoundedDown++
      await tx.product.update({
        where: { id: p.id },
        data: { stock, lastBuyPrice: r.buy, sellPrice: r.sell },
      })
      byCode.delete(p.code)
      updated++
    }
    // کالاهای جدید (کدهای XLS که در DB نبود)
    for (const r of byCode.values()) {
      const c = classify(r.name)
      const stock = Math.round(r.qty)
      await tx.product.create({
        data: {
          name: r.name,
          code: r.code,
          unit: c.unit,
          defaultOrderQty: c.defaultOrderQty,
          stock,
          lastBuyPrice: r.buy,
          sellPrice: r.sell,
          active: true,
        },
      })
      created++
    }
  })
  console.log(`✓ DB به‌روز شد: ${updated} کالا به‌روز | ${zeroed} کالا stock صفر شد | ${created} کالای جدید | ${fracRoundedDown} کالای کمتر از نیم واحد → 0`)

  // ---- 3) حذف داده‌های قلابی عملیاتی (سفارش/مرجوعی/چک/پرداخت دمو) ----
  const del = await db.$transaction(async (tx) => {
    const counts: Record<string, number> = {}
    counts.marginItem = await tx.marginItem.deleteMany({})
    counts.marginInvoice = await tx.marginInvoice.deleteMany({})
    counts.orderItem = await tx.orderItem.deleteMany({})
    counts.order = await tx.order.deleteMany({})
    counts.returnPayment = await tx.returnPayment.deleteMany({})
    counts.returnItem = await tx.returnItem.deleteMany({})
    counts.returnRequest = await tx.returnRequest.deleteMany({})
    counts.cheque = await tx.cheque.deleteMany({})
    counts.payment = await tx.payment.deleteMany({})
    counts.stockCountItem = await tx.stockCountItem.deleteMany({})
    counts.stockCount = await tx.stockCount.deleteMany({})
    counts.dateCheck = await tx.dateCheck.deleteMany({})
    return counts
  })
  console.log('✓ دادهٔ قلابی حذف شد:', JSON.stringify(del))

  // ---- 4) آمار نهایی ----
  const prod = await db.product.aggregate({ _max: { stock: true }, _avg: { stock: true }, _count: true })
  const active = await db.product.count({ where: { stock: { gt: 0 } } })
  console.log(`✓ وضعیت نهایی کالاها: ${prod._count} کل | ${active} با موجودی>0 | بیشینه=${prod._max.stock} میانگین=${Math.round(prod._avg.stock)}`)

  // ---- 5) BASELINE snapshot (فقط اگر نبود — idempotent) ----
  const existingBase = await db.dataSnapshot.findFirst({ where: { kind: 'BASELINE' } })
  if (!existingBase) {
    const base = await (await api('/api/admin/snapshot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'دادهٔ واقعی — پس از ورود موجودی XLS', note: 'خط پایهٔ بازنشانی؛ مدیر می‌تواند هر زمان به این وضعیت برگردد', kind: 'BASELINE' }),
    })).json()
    console.log('✓ BASELINE snapshot:', base?.data?.id ?? base)
  } else {
    console.log('• BASELINE از قبل موجود بود — رد شد:', existingBase.id)
  }
  console.log('== import-inventory: پایان (موفق) ==')
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e); process.exit(1) })
