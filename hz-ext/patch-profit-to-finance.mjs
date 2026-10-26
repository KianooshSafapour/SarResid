/**
 * hz-ext/patch-profit-to-finance.mjs — R12: انتقال «سودسنج» به بخش «مالی».
 *
 * مالک خواستند سودسنج و زیرصفحه‌هایش بخشی از امکانات حسابداری‌اند و باید زیر
 * «مالی» باشند، نه یک بخش جدا در نوار کنار. این وصله روی ORIGINAL بکرِ رجیستری
 * (f58febe0f4682bee.js) اعمال می‌شود و build.mjs هر بار بعد از آن ادامه می‌دهد:
 *
 *   ۱) شیء بخش profit از WORKSPACES حذف می‌شود (۱۱ بخش → ۱۰ بخش).
 *   ۲) سه صفحه با کلیدهای جدید به بخش finance اضافه می‌شوند:
 *        finance/builder  «سودسنج پیشرفته»      (سپس build.mjs با نمای hz-ext ما جایگزین می‌کند)
 *        finance/invoices «دفتر فاکتورها»        (نمای hz-ext گردش‌کار R12)
 *        finance/stats    «آمار و تحلیل سود»     (نمای فروزن قبلی profit/stats، فقط کلیدش عوض می‌شود)
 *   ۳) ورودی‌های نقشهٔ H (lazy) با همان قالب فروزن rename می‌شوند تا build.mjs
 *      در مسیر «جایگزینی کلید موجود» برود و بی‌خیال درج nav نشود.
 *   ۴) نقشهٔ دسترسی (module 200150): کلیدهای صفحه/بخش profit → معادل finance
 *      (حذف بخش profit، چون دیگر بخشی وجود ندارد).
 *
 * لینک‌های قدیمی #/profit/... توسط شیم بازهدایش در shell.html به مسیر جدید
 * هدایت می‌شوند (builder→finance/builder، history→finance/invoices، stats→finance/stats).
 *
 * Idempotent — اگر دوباره اجرا شود چیزی نمی‌شکند.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ORIG = join(__dirname, 'originals', 'f58febe0f4682bee.js')

/* کلیدهای صفحه: قدیمی → جدید */
const KEY_MAP = [
  ['profit/builder', 'finance/builder'],
  ['profit/history', 'finance/invoices'],
  ['profit/stats', 'finance/stats'],
]

const PROFIT_WS_START = '{key:"profit",title:"سود و قیمت‌گذاری"'
const FINANCE_WS_START = ',{key:"finance",title:"مالی و چک"'
const FINANCE_PAGES_TAIL = '{key:"finance/payments",title:"پرداخت‌های نقدی و کارتی",icon:a.Wallet}'
const FINANCE_PAGES_ADD =
  ',{key:"finance/builder",title:"سودسنج پیشرفته",icon:a.Wallet}' +
  ',{key:"finance/invoices",title:"دفتر فاکتورها",icon:a.Wallet}' +
  ',{key:"finance/stats",title:"آمار و تحلیل سود",icon:a.Wallet}'
const SECTION_ACCESS_ENTRY = 'profit:["OWNER","GM","ADMIN","ACC"],'

function main() {
  let src
  try {
    src = readFileSync(ORIG, 'utf8')
  } catch {
    console.error('✗ profit-to-finance: original registry chunk not found')
    process.exit(1)
  }
  let changed = 0

  /* idempotency: اگر بخش finance صفحات سودسنج را دارد، تمام شده‌ایم */
  if (src.includes('"finance/invoices"') && !src.includes(PROFIT_WS_START)) {
    console.log('  = profit-to-finance: already applied')
    return
  }

  /* ۱) حذف شیء بخش profit */
  const wsStart = src.indexOf(PROFIT_WS_START)
  if (wsStart < 0) {
    console.error('✗ profit-to-finance: profit workspace anchor not found — registry format changed?')
    process.exit(1)
  }
  const finAnchor = src.indexOf(FINANCE_WS_START, wsStart)
  if (finAnchor < 0) {
    console.error('✗ profit-to-finance: finance workspace anchor not found')
    process.exit(1)
  }
  src = src.slice(0, wsStart) + src.slice(finAnchor + 1) // «,{key:"finance" → «{key:"finance"
  console.log('  + profit-to-finance: profit workspace removed (11 → 10 sections)')
  changed++

  /* ۲) افزودن سه صفحه به بخش finance */
  const payIdx = src.indexOf(FINANCE_PAGES_TAIL)
  if (payIdx < 0) {
    console.error('✗ profit-to-finance: finance payments page anchor not found')
    process.exit(1)
  }
  const insertAt = payIdx + FINANCE_PAGES_TAIL.length
  src = src.slice(0, insertAt) + FINANCE_PAGES_ADD + src.slice(insertAt)
  console.log('  + profit-to-finance: finance pages + builder/invoices/stats')
  changed++

  /* ۳) rename ورودی‌های نقشهٔ H (قالب lazy دقیقاً مثل فروزن) */
  for (const [oldK, newK] of KEY_MAP) {
    const oldEntry = `"${oldK}":(0,I.default)`
    if (src.includes(oldEntry)) {
      src = src.replace(oldEntry, `"${newK}":(0,I.default)`)
      console.log(`  + profit-to-finance: H map ${oldK} → ${newK}`)
      changed++
    } else if (src.includes(`"${newK}":(0,I.default)`)) {
      console.log(`  = profit-to-finance: H map ${newK} already present`)
    } else {
      console.error(`✗ profit-to-finance: H map entry for ${oldK} not found`)
      process.exit(1)
    }
  }

  /* ۴) نقشهٔ دسترسی صفحات: فقط الگوهای «"profit/x":[…roles]» */
  for (const [oldK, newK] of KEY_MAP) {
    const accOld = `"${oldK}":["`
    const i = src.indexOf(accOld)
    if (i >= 0) {
      src = src.slice(0, i) + `"${newK}":["` + src.slice(i + accOld.length)
      console.log(`  + profit-to-finance: access ${oldK} → ${newK}`)
      changed++
    }
  }
  /* حذف دسترسی بخشِ منتفی profit */
  if (src.includes(SECTION_ACCESS_ENTRY)) {
    src = src.replace(SECTION_ACCESS_ENTRY, '')
    console.log('  + profit-to-finance: section access "profit" removed')
    changed++
  }

  writeFileSync(ORIG, src)
  console.log(`✓ profit-to-finance applied (${changed} change(s))`)
}

main()
