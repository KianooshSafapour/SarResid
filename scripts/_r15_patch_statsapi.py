# R15 — fix /api/margin/stats: gate key + real percent thresholds + lowMargin list
import io

p = 'src/app/api/margin/stats/route.ts'
s = io.open(p, encoding='utf-8').read()
orig = s

# 1) gate: dead key → real page
s = s.replace("const gate = await assertPageAccess(me, 'profit/stats')", "const gate = await assertPageAccess(me, 'finance/stats')")

# 2) thresholds from settings + true percentages
old_thr = """const THRESHOLD_RED = 12
const THRESHOLD_YELLOW = 21"""
new_thr = """/* R15: آستانه‌ها از تنظیمات سودسنج — و مقایسه بر حسب «درصد» (marginPct×۱۰۰)،
   نه عدد خام ۰..۱ (باگ قدیمی: همهٔ اقلام قرمز دیده می‌شدند) */
import { getMarginThresholds } from '../route'"""
assert old_thr in s
s = s.replace(old_thr, new_thr)

old_dist = """  // ---- distribution (raw stored margin vs 12/21 — live quirk) ----
  let red = 0
  let yellow = 0
  let green = 0
  for (const { it } of items) {
    const m = it.margin
    if (m < THRESHOLD_RED) red += 1
    else if (m < THRESHOLD_YELLOW) yellow += 1
    else green += 1
  }"""
new_dist = """  const thresholds = await getMarginThresholds()
  const THRESHOLD_RED = thresholds.warn ?? 12
  const THRESHOLD_YELLOW = thresholds.criticalHigh ?? 21

  // ---- distribution — درصدِ واقعی حاشیه (اقلام رایگان جدا شمرده می‌شوند) ----
  let red = 0
  let yellow = 0
  let green = 0
  let free = 0
  for (const { it } of items) {
    if (it.free100) {
      free += 1
      continue
    }
    const m = it.marginPct // درصد
    if (m < THRESHOLD_RED) red += 1
    else if (m < THRESHOLD_YELLOW) yellow += 1
    else green += 1
  }

  // ---- R15: فهرست «حاشیه قرمز» به تفکیک کالا + آخرین فاکتور (برای بازبینی در فاکتورنویس) ----
  const lowByProduct = new Map<
    string,
    { productId: string | null; name: string; count: number; minPct: number; lastPct: number; lastInvoice: { id: string; number: number; supplierName: string | null; status: string } | null }
  >()
  for (const { inv, it } of items) {
    if (it.free100 || it.marginPct >= THRESHOLD_RED) continue
    const key = it.productId ?? `name:${it.productName}`
    const cur = lowByProduct.get(key)
    if (!cur) {
      lowByProduct.set(key, {
        productId: it.productId,
        name: it.productName,
        count: 1,
        minPct: it.marginPct,
        lastPct: it.marginPct,
        lastInvoice: { id: inv.id, number: inv.number, supplierName: inv.supplierName, status: inv.status },
      })
    } else {
      cur.count++
      cur.minPct = Math.min(cur.minPct, it.marginPct)
    }
  }
  const lowMargin = [...lowByProduct.values()].sort((a, b) => a.minPct - b.minPct).slice(0, 60)"""
assert old_dist in s
s = s.replace(old_dist, new_dist)

# 3) response: distribution + thresholds + lowMargin
old_resp = """    distribution: { red, yellow, green },
    topProfit,"""
new_resp = """    distribution: { red, yellow, green, free },
    thresholds: { red: THRESHOLD_RED, yellow: THRESHOLD_YELLOW },
    lowMargin,
    topProfit,"""
assert old_resp in s
s = s.replace(old_resp, new_resp)

assert s != orig
io.open(p, 'w', encoding='utf-8').write(s)
print('stats api ok')
