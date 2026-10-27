/**
 * hz-ext/patch-access-all.mjs — R15
 * ---------------------------------------------------------------------------
 * دسترسی برای همهٔ کارکنان + احترام به مجوزهای فردی (RBAC override):
 *
 * ۱) بخش «انبار» (supply) در نقشهٔ دسترسی چانک منجمد نقش‌های SALES/CASHIER/MERCH
 *    را ندارد → عاطفه (فروشنده) حتی با مجوز فردی هم دکمهٔ انبار را نمی‌دید.
 *    نقش‌ها کامل می‌شوند (دریافت/سفارش از R11 برای همه باز است؛ گیت واقعی سمت سرور است).
 *
 * ۲) ناوبری فروزن فقط نقش را می‌پرسد (canAccessWorkspace/canAccessPage با role)
 *    و از pageAllow کاربر (خروجی /api/auth/me برای override های فردی) بی‌خبر است
 *    → هر ۵ محل فیلتر، علاوه بر نقش، pageAllow کاربر را هم می‌پذیرد:
 *      section: workspace اگر pageAllow کلیدِ بخش یا هر صفحهٔ آن را داشته باشد؛
 *      page: اگر pageAllow دقیقاً همان کلید را داشته باشد.
 *
 * Idempotent — روی نسخهٔ pristine اعمال می‌شود.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ORIG = join(__dirname, 'originals', 'f58febe0f4682bee.js')

function main() {
  let src
  try {
    src = readFileSync(ORIG, 'utf8')
  } catch {
    console.error('✗ access-all: original registry chunk not found')
    process.exit(1)
  }
  let changed = 0

  /* ── ۰) R15: صفحهٔ سفارش‌ها هم برای همه ── */
  const ORD_OLD = '"supply/orders":["OWNER","GM","ADMIN","EXEC","PM","SK","ACC"]'
  const ORD_NEW = '"supply/orders":["OWNER","GM","ADMIN","EXEC","ACC","PM","SK","HC","SALES","CASHIER","MERCH"]'
  if (src.includes(ORD_NEW)) {
    console.log('  = access-all: supply/orders roles already full')
  } else if (src.includes(ORD_OLD)) {
    src = src.split(ORD_OLD).join(ORD_NEW)
    changed++
    console.log('  + access-all: supply/orders → همهٔ نقش‌ها')
  } else {
    console.error('✗ access-all: supply/orders anchor not found')
    process.exit(1)
  }

  /* ── ۱) supply: همهٔ نقش‌ها ── */
  const SUPPLY_OLD = 'supply:["OWNER","GM","ADMIN","EXEC","ACC","PM","SK","HC"]'
  const SUPPLY_NEW = 'supply:["OWNER","GM","ADMIN","EXEC","ACC","PM","SK","HC","SALES","CASHIER","MERCH"]'
  if (src.includes(SUPPLY_NEW)) {
    console.log('  = access-all: supply roles already full')
  } else if (src.includes(SUPPLY_OLD)) {
    src = src.split(SUPPLY_OLD).join(SUPPLY_NEW)
    changed++
    console.log('  + access-all: supply → همهٔ نقش‌ها (SALES/CASHIER/MERCH اضافه شد)')
  } else {
    console.error('✗ access-all: supply anchor not found')
    process.exit(1)
  }

  /* ── ۲) فیلترها: pageAllow کاربر ──
     workspace:  (0,i.canAccessWorkspace)(e.role,t.key)
     page:       (0,i.canAccessPage)(e.role,t.key)
     نسخهٔ r/l هم هست (ماژول‌های دیگر). فقط الگوی (0,X.canAccessY)(VAR.role,t.key) را
     با اجازهٔ pageAllow همان VAR گسترش می‌دهیم. */
  const wsRe = /\(0,(\w+)\.canAccessWorkspace\)\((\w+)\.role,(\w+)\.key\)/g
  src = src.replace(wsRe, (m, mod, v, k) => {
    changed++
    return `${m}||(0,${mod}.__hzAllowSection)(${v},${k})`
  })
  const pgRe = /\(0,(\w+)\.canAccessPage\)\((\w+)\.role,(\w+)\.key\)/g
  src = src.replace(pgRe, (m, mod, v, k) => {
    changed++
    return `${m}||(0,${mod}.__hzAllowPage)(${v},${k})`
  })

  /* تعریف کمکی‌ها روی ماژول دسترسی — اولین رخداد canAccessPage export پیدا و درج می‌شود.
     لنگر: e.s({...,"canAccessPage",()=>o,"canAccessWorkspace",()=>n,...}) */
  const anchor = '"canAccessPage",()=>o,"canAccessWorkspace",()=>n'
  if (src.includes('"__hzAllowPage"')) {
    console.log('  = access-all: helpers already present')
  } else if (src.includes(anchor)) {
    /* قالب e.s([...]) آرایه‌ای است: جفت‌های «نام رشته‌ای + گتر» — نه انتساب
       (انتساب متغیر اعلان‌نشده در strict mode کرش می‌کند) */
    const helpers =
      '"__hzAllowSection",()=>((u,w)=>!!(u&&Array.isArray(u.pageAllow)&&u.pageAllow.some(k=>k===w||k.startsWith(w+"/")))),' +
      '"__hzAllowPage",()=>((u,p)=>!!(u&&Array.isArray(u.pageAllow)&&u.pageAllow.includes(p))),'
    src = src.replace(anchor, helpers + anchor)
    changed++
    console.log('  + access-all: __hzAllowSection/__hzAllowPage helpers injected (getter pairs)')
  } else {
    console.error('✗ access-all: access-module export anchor not found')
    process.exit(1)
  }

  if (changed) writeFileSync(ORIG, src)
  console.log(`✓ access-all applied (${changed} change group(s))`)
}

main()
