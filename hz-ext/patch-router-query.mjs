/**
 * hz-ext/patch-router-query.mjs — R13
 * ---------------------------------------------------------------------------
 * ریشهٔ باگ ناوبری «پیش‌فاکتور در سودسنج» / «ویرایش در فاکتورنویس»:
 * تابع مسیریابِ چانک منجمد (B در f58febe0f4682bee.js) هش را این‌طور می‌شکافت:
 *
 *   window.location.hash.replace(/^#\/?/,"").split("/")
 *
 * پس برای «#/finance/builder?id=x» قطعهٔ دوم «builder?id=x» می‌شد و یافتنِ
 * صفحه در pages شکست می‌خورد → fallback به defaultPage بخش مالی یعنی
 * «چک‌ها و تقویم سررسید». (پیش از R12 تصادفی کار می‌کرد چون defaultPage
 * بخش سود «builder» بود.)
 *
 * اصلاح: حذف رشتهٔ پرس‌وجو پیش از شکستن:
 *
 *   window.location.hash.replace(/^#\/?/,"").split("?")[0].split("/")
 *
 * Idempotent — روی نسخهٔ pristine اعمال می‌شود و هر بیلد دوباره پخته می‌شود.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ORIG = join(__dirname, 'originals', 'f58febe0f4682bee.js')

const BAD = 'window.location.hash.replace(/^#\\/?/,"").split("/")'
const FIX = 'window.location.hash.replace(/^#\\/?/,"").split("?")[0].split("/")'

function main() {
  let src
  try {
    src = readFileSync(ORIG, 'utf8')
  } catch {
    console.error('✗ router-query: original registry chunk not found')
    process.exit(1)
  }

  if (src.includes(FIX)) {
    console.log('  = router-query: already applied (idempotent skip)')
    return
  }
  const count = src.split(BAD).length - 1
  if (count === 0) {
    console.error('✗ router-query: anchor not found — frozen chunk changed? inspect manually')
    process.exit(1)
  }
  if (count > 1) {
    console.error(`✗ router-query: anchor found ${count}× — expected exactly 1; refusing to patch blindly`)
    process.exit(1)
  }
  src = src.replace(BAD, FIX)
  writeFileSync(ORIG, src)
  console.log('  + router-query: hash router now strips ?query before page lookup')
}

main()
