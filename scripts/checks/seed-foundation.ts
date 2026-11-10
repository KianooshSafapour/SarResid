/**
 * Seed: Iranian holidays (1405-1406) + system defaults + supplier-product links
 * from REAL order/margin history (no dummy data).
 */
import { PrismaClient } from '@prisma/client'
import { dateToJalali } from '../../src/lib/jalali'
const db = new PrismaClient()

/* ── Kuwaiti tabular hijri → Julian Day (±1 day vs observation; managers can edit via UI) ── */
function hijriToJD(y: number, m: number, d: number): number {
  return Math.floor((11 * y + 3) / 30) + 354 * y + 30 * m - Math.floor((m - 1) / 2) + d + 1948440 - 385
}
function jdToGregorian(jd: number): Date {
  // Fliegel-Van Flandern
  const z = Math.floor(jd + 0.5)
  const f = jd + 0.5 - z
  let a = z
  if (z >= 2299161) { const alpha = Math.floor((z - 1867216.25) / 36524.25); a = z + 1 + alpha - Math.floor(alpha / 4) }
  const b = a + 1524, c = Math.floor((b - 122.1) / 365.25), d2 = Math.floor(365.25 * c), e = Math.floor((b - d2) / 30.6001)
  const day = b - d2 - Math.floor(30.6001 * e) + f
  const month = e < 14 ? e - 1 : e - 13
  const year = month > 2 ? c - 4716 : c - 4715
  return new Date(Date.UTC(year, month - 1, Math.floor(day)))
}
const g2jDate = (dt: Date): string => { const j = dateToJalali(dt); return `${j.jy}-${String(j.jm).padStart(2, '0')}-${String(j.jd).padStart(2, '0')}` }

/** hijri (y, m, d) → jalali dash string */
function hijriToJalali(hy: number, hm: number, hd: number): string {
  return g2jDate(jdToGregorian(hijriToJD(hy, hm, hd)))
}

async function main() {
  /* ── 1) Holidays ─────────────────────────────────────────────── */
  const existing = await db.holiday.count()
  if (existing > 0) { console.log(`holidays already seeded (${existing}) — skip`) }
  else {
    const rows: { id: string; date: string; title: string; kind: string }[] = []
    const add = (date: string, title: string, kind: string) => {
      const id = `hol-${date}-${rows.length}`
      rows.push({ id, date, title, kind })
    }
    for (const y of [1405, 1406]) {
      const yy = String(y)
      add(`${yy}-01-01`, 'نوروز — جشن سال نو', 'NATIONAL')
      add(`${yy}-01-02`, 'عیدنوروز', 'NATIONAL')
      add(`${yy}-01-03`, 'عیدنوروز', 'NATIONAL')
      add(`${yy}-01-04`, 'عیدنوروز', 'NATIONAL')
      add(`${yy}-01-12`, 'روز جمهوری اسلامی', 'NATIONAL')
      add(`${yy}-01-13`, 'روز طبیعت', 'NATIONAL')
      add(`${yy}-11-22`, 'پیروززی انقلاب اسلامی', 'NATIONAL')
      add(`${yy}-12-29`, 'روز ملی شدن صنعت نفت ایران', 'NATIONAL')
    }
    // Islamic (tabular; hijri years 1447-1449 cover 1405/01 - 1406/12)
    for (const hy of [1447, 1448, 1449]) {
      const mark = (hm: number, hd: number, title: string) => {
        const j = hijriToJalali(hy, hm, hd)
        if (!j) return
        const [yy, mm] = j.split('-').map(Number)
        if (yy === 1405 || yy === 1406) add(j, `${title} (تقریبی — قابل ویرایش)`, 'RELIGIOUS')
      }
      mark(10, 1, 'عید سعید فطر')
      mark(10, 2, 'عید سعید فطر')
      mark(1, 9, 'تاسوعای حسینی')
      mark(1, 10, 'عاشورای حسینی')
      mark(2, 20, 'اربعین حسینی')
      mark(2, 28, 'رحلت پیامبر اکرم و شهادت امام صادق')
      mark(9, 21, 'شهادت امام علی')
      mark(12, 10, 'عید سعید قربان')
      mark(12, 18, 'عید سعید غدیر خم')
    }
    await db.holiday.createMany({ data: rows })
    console.log(`holidays seeded: ${rows.length} (national + religious-approx)`)
  }

  /* ── 2) Defaults & SMS settings ─────────────────────────────── */
  const settings: [string, string][] = [
    ['defaults:order.qty', '6'],
    ['defaults:order.carton', '1'],
    ['defaults:cheque.periodDays', '45'],
    ['defaults:lowstock.leadBuffer', '2'],
    ['defaults:lowstock.minMonthlySold', '1'],
    ['sms:enabled', 'false'],
    ['sms:provider', ''], // kavenegar | ippanel | ...
    ['sms:apiKey', ''],
    ['sms:sender', ''],
    ['sms:recipients', ''], // comma-separated mobile numbers (default: Mr. Noroozi + marked managers)
    ['sms:lowstockTemplate', 'هایپر زیتون: کالای «{name}» به حد سفارش مجدد رسید (موجودی: {stock}). لطفاً سفارش ثبت شود.'],
  ]
  for (const [k, v] of settings) {
    await db.setting.upsert({ where: { key: k }, create: { key: k, value: v }, update: {} })
  }
  console.log(`settings ensured: ${settings.length} keys`)

  /* ── 3) SupplierProduct links from REAL history ─────────────── */
  const had = await db.supplierProduct.count()
  if (had > 0) { console.log(`supplierProducts already seeded (${had}) — skip`) }
  else {
    // from orders (unit buy price per supplier+product)
    const orders = await db.order.findMany({ include: { items: true } })
    const map = new Map<string, { supplierId: string; supplierName: string; productId: string; productName: string; unitPrice: number; perCarton: number }>()
    for (const o of orders) {
      if (!o.supplierId) continue
      for (const it of o.items) {
        if (!it.productId) continue
        const key = `${o.supplierId}|${it.productId}`
        const prev = map.get(key)
        const unit = it.unitBuyPrice || 0
        if (!prev || unit > prev.unitPrice) {
          map.set(key, { supplierId: o.supplierId, supplierName: o.supplierName || '', productId: it.productId, productName: it.name, unitPrice: unit, perCarton: it.unitsPerCarton || 0 })
        }
      }
    }
    // from margin invoices (last unit cost per supplier+product) — richer
    const margins = await db.marginInvoice.findMany({ where: { status: 'final' }, include: { items: true } })
    for (const inv of margins) {
      if (!inv.supplierId) continue
      for (const it of inv.items) {
        if (!it.productId) continue
        const key = `${inv.supplierId}|${it.productId}`
        const prev = map.get(key)
        const unit = it.unitCost || 0
        if (!prev || unit > prev.unitPrice) {
          map.set(key, { supplierId: inv.supplierId, supplierName: inv.supplierName || '', productId: it.productId, productName: it.productName, unitPrice: unit, perCarton: 0 })
        }
      }
    }
    const rows = [...map.values()].map((r) => ({
      supplierId: r.supplierId,
      productId: r.productId,
      unitPrice: r.unitPrice,
      lastBuyPrice: r.unitPrice,
      perCarton: r.perCarton,
      isPrimary: true,
      note: `از سوابق واقعی سفارش/فاکتور — ${r.supplierName}`,
    }))
    if (rows.length) await db.supplierProduct.createMany({ data: rows })
    console.log(`supplierProducts seeded: ${rows.length} links (real history)`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
