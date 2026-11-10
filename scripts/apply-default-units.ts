/**
 * R4-8 — apply-default-units.ts
 * موتور قاعدهٔ واحد شمارش پیش‌فرض کالا (الزام مالک #۱۱) — پژوهش کامل:
 *   research/product-units-research.md
 *
 * قواعد (نخستین تطبیق برنده؛ فقط ردیف‌های manualUnit=false لمس می‌شوند):
 *   R1 «فله» توکن مستقل در نام ......................... کیلوگرم
 *   R2 «@» بدون اندازه/بسته‌بندی در نام ................ کیلوگرم
 *   R3 «وزنی» توکن مستقل (نه «سوزنی») ................. کیلوگرم
 *   R4 برند فلهٔ آجیل «زیتون پرایم» بدون اندازه ....... کیلوگرم
 *   R5 خط «مخصوص فروشگاه» بدون اندازه (زعفرانِ مثقال مستثنا) کیلوگرم
 *   R6 تخم‌مرغ واقعی: سینی ≥۱۵ یا بدون تعداد، بدون «بسته بندی» ... دستی
 *   پیش‌فرض ............................................. عدد
 *
 * defaultOrderQty بر حسب واحد: عدد→۶ (بدون تغییر) · کیلوگرم→۵ · دستی→۴ · بسته→۴ · گرم→۲
 *
 * Idempotent: فقط ردیفی UPDATE می‌شود که (unit,defaultOrderQty) محاسبه‌شده با جاری فرق دارد؛
 * اجرای دوم = صفر تغییر. اجرا: `bunx tsx scripts/apply-default-units.ts`
 */
import { db } from '@/lib/db'

/* ── مجموعهٔ مجاز واحدها (research §۳) — «شش‌تایی» عمداً حذف شد ── */
export const ALLOWED_UNITS = ['عدد', 'کیلوگرم', 'گرم', 'بسته', 'دستی'] as const
export type Unit = (typeof ALLOWED_UNITS)[number]

const ORDER_QTY_BY_UNIT: Record<string, number> = { عدد: 6, کیلوگرم: 5, دستی: 4, بسته: 4, گرم: 2 }

/* ── شواهد اندازهٔ بسته در نام (رقمی یا عدد-حرفی) ── */
const SIZE_RE =
  /(\d+[.,/]?\d*)\s*(گرم|میلی|میل(?!ی)|لیتر|کیلو|کیلوگرم|سی\s?سی|سی‌سی|عددی|تایی|کارتن|گالن)|(^|\s)(یک|نیم|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده)(\s|-)?(کیلو|کیلوگرم|گرم|لیتر)/
/* ── واژه‌های بسته‌بندی (هرکدام یعنی قلم بسته‌ای است) ── */
const PACK_RE = /(بسته\s?بندی|بسته|ساشه|قوطی|شیشه|جعبه|پاکت|دوبیس|وکیوم|بطری|سلفون|کارتن|مثقال|ساک)/
/* ── نشانهٔ فلهٔ صریح (توکن مستقل؛ «سوفله» کنار می‌ماند) ── */
const FLEHE_RE = /(^|[\s\-–(_])فله(?=[\s\-–)@]|$)/
const WAZNI_RE = /(^|\s)وزنی(?=\s|$)/
/* ── اقلام کاذبِ تخم‌مرغی (پد بهداشتی/شامپو/شکلات/اسباب‌بازی…) ── */
const EGG_FAKE_RE = /(پد|شامپو|دراژه|شانسی|سفیده|پودر|جا |جعبه|سس |مایونز|بانکی|عروسک|فله)/

export interface RuleOutcome {
  unit: Unit
  rule: 'R1-فله' | 'R2-@' | 'R3-وزنی' | 'R4-زیتون‌پرایم' | 'R5-مخصوص‌فروشگاه' | 'R6-تخم‌مرغ' | 'DEFAULT-عدد'
}

/** موتور قاعده — خالص و قابل تست */
export function classify(nameRaw: string): RuleOutcome {
  const n = String(nameRaw || '')
  if (FLEHE_RE.test(n)) return { unit: 'کیلوگرم', rule: 'R1-فله' }
  if (n.includes('@') && !SIZE_RE.test(n) && !PACK_RE.test(n)) return { unit: 'کیلوگرم', rule: 'R2-@' }
  if (WAZNI_RE.test(n)) return { unit: 'کیلوگرم', rule: 'R3-وزنی' }
  if (n.includes('زیتون پرایم') && !SIZE_RE.test(n) && !PACK_RE.test(n)) return { unit: 'کیلوگرم', rule: 'R4-زیتون‌پرایم' }
  if (n.includes('مخصوص فروشگاه') && !SIZE_RE.test(n) && !PACK_RE.test(n)) return { unit: 'کیلوگرم', rule: 'R5-مخصوص‌فروشگاه' }
  if (n.includes('تخم مرغ') && !EGG_FAKE_RE.test(n) && !/بسته\s?بندی/.test(n)) {
    const m = n.match(/(\d+)\s*عددی/)
    if (!m || parseInt(m[1], 10) >= 15) return { unit: 'دستی', rule: 'R6-تخم‌مرغ' }
  }
  return { unit: 'عدد', rule: 'DEFAULT-عدد' }
}

async function main() {
  const t0 = Date.now()
  const rows = await db.product.findMany({
    select: { id: true, name: true, unit: true, defaultOrderQty: true, manualUnit: true },
  })
  console.log(`products fetched: ${rows.length}`)

  const before = await db.product.groupBy({ by: ['unit'], _count: { _all: true } })
  console.log('== قبل (unit COUNT) ==')
  for (const r of before) console.log(`   ${String(r._count._all).padStart(6)}  ${r.unit}`)

  type Plan = { ids: string[]; unit: string; qty: number }
  const plans: Plan[] = []
  const planKey = (u: string, q: number) => u + '\u0000' + q
  const planMap = new Map<string, Plan>()
  let skippedManual = 0
  let unchanged = 0
  const ruleTally: Record<string, number> = {}

  for (const p of rows) {
    const out = classify(p.name)
    ruleTally[out.rule] = (ruleTally[out.rule] ?? 0) + 1
    if (p.manualUnit) { skippedManual++; continue } // حفاظت: واحد دستی مدیر
    const qty = ORDER_QTY_BY_UNIT[out.unit] ?? 6
    if (p.unit === out.unit && (p.defaultOrderQty ?? qty) === qty) { unchanged++; continue } // idempotent
    const k = planKey(out.unit, qty)
    let plan = planMap.get(k)
    if (!plan) { plan = { ids: [], unit: out.unit, qty }; planMap.set(k, plan); plans.push(plan) }
    plan.ids.push(p.id)
  }

  console.log('\n== قاعده‌ها (روی کل بانک) ==')
  for (const [k, v] of Object.entries(ruleTally).sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(6)}  ${k}`)
  console.log(`   ردیف با manualUnit=true (دست‌نخورده): ${skippedManual} · بدون تغییر: ${unchanged}`)

  /* به‌روزرسانی دسته‌ای (چانک ۵۰۰تایی) — فقط ردیف‌های تغییرنیاز */
  let updated = 0
  const CHUNK = 500
  for (const plan of plans) {
    for (let i = 0; i < plan.ids.length; i += CHUNK) {
      const ids = plan.ids.slice(i, i + CHUNK)
      await db.product.updateMany({
        where: { id: { in: ids }, manualUnit: false },
        data: { unit: plan.unit, defaultOrderQty: plan.qty },
      })
      updated += ids.length
    }
  }
  console.log(`\n→ ردیف‌های به‌روزشده: ${updated} (در ${((Date.now() - t0) / 1000).toFixed(1)}s)`)

  const after = await db.product.groupBy({ by: ['unit'], _count: { _all: true } })
  console.log('\n== بعد (SELECT unit, COUNT(*) GROUP BY unit) ==')
  for (const r of after.sort((a: any, b: any) => b._count._all - a._count._all)) console.log(`   ${String(r._count._all).padStart(6)}  ${r.unit}`)

  const manual = await db.product.count({ where: { manualUnit: true } })
  console.log(`\nmanualUnit=true: ${manual}`)
  console.log(updated === 0 ? 'IDEMPOTENT ✓ (هیچ تغییری لازم نبود)' : `تغییرات اعمال شد — اجرای دوباره باید «۰ ردیف» بدهد`)
}

// فقط وقتی مستقیماً اجرا شود main اجرا شود — نه وقتی import می‌شود (مثل import-inventory.ts)
if (process.argv[1]?.endsWith('apply-default-units.ts')) {
  main()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1) })
}
