/**
 * hz-ext/patch-returns-to-crm.mjs — R15
 * ---------------------------------------------------------------------------
 * بازسازمان‌دهی منو (بر پایهٔ الگوی رایج ERPs خرده‌فروشی: حوزهٔ «فروش و مشتریان»):
 * بخش مستقل «مرجوعی» حذف و صفحاتش زیر بخش CRM (که «مشتریان» نام داشت و حالا
 * «فروش و مشتریان» می‌شود) می‌روند. کلید صفحات باید با کلید بخش شروع شود، پس:
 *   returns/new       → crm/new        «ثبت مرجوعی جدید»
 *   returns/history   → crm/history    «تاریخچه مرجوعی‌ها»
 *   returns/approvals → crm/approvals  «در انتظار تأیید و پرداخت»
 *   returns/payments  → crm/payments   (نقشهٔ دسترسی؛ در ناوبری مستقل نبود)
 *   returns/customers → crm/notebook   «دفترچه مشتریان» (مشتریان CRM خودش crm/customers است)
 * بازهدایش #/returns/* → #/crm/* در shell.html انجام می‌شود (لینک‌های فروزن را هم می‌گیرد).
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
    console.error('✗ returns-to-crm: original registry chunk not found')
    process.exit(1)
  }
  if (src.includes('title:"فروش و مشتریان"')) {
    console.log('  = returns-to-crm: already applied')
    return
  }

  /* ۱) حذف شیء بخش مرجوعی — از {key:"returns" تا }{key:"finance" (مرز بعدی) */
  const wsStart = src.indexOf('{key:"returns",title:"مرجوعی"')
  if (wsStart < 0) {
    console.error('✗ returns-to-crm: returns workspace not found')
    process.exit(1)
  }
  const nextWs = src.indexOf(',{key:"finance"', wsStart)
  if (nextWs < 0) {
    console.error('✗ returns-to-crm: next workspace boundary not found')
    process.exit(1)
  }
  // شیء returns خودش با },{key:"finance" تمام می‌شود — بازهٔ [wsStart-1 (کاما)， nextWs) را برمی‌داریم
  const cutStart = Math.max(0, wsStart - 1) // کامای پیش از شیء
  src = src.slice(0, cutStart) + src.slice(nextWs)
  console.log('  + returns-to-crm: بخش «مرجوعی» حذف شد')

  /* ۲) بخش CRM → «فروش و مشتریان» + صفحات مرجوعی */
  const crmOld = '{key:"crm",title:"مشتریان",shortTitle:"مشتریان",icon:c.HeartHandshake,color:"#be185d",defaultPage:"customers",pages:[{key:"crm/customers",title:"مشتریان و طیف‌بندی",icon:c.HeartHandshake},{key:"crm/campaigns",title:"کمپین‌ها و مناسبتی",icon:c.HeartHandshake}]}'
  const crmNew = '{key:"crm",title:"فروش و مشتریان",shortTitle:"مشتریان",icon:c.HeartHandshake,color:"#be185d",defaultPage:"new",pages:[{key:"crm/new",title:"ثبت مرجوعی جدید",icon:o.Undo2},{key:"crm/history",title:"تاریخچه مرجوعی‌ها",icon:o.Undo2},{key:"crm/approvals",title:"در انتظار تأیید و پرداخت",icon:o.Undo2,badge:"returns_pending"},{key:"crm/notebook",title:"دفترچه مشتریان",icon:o.Undo2},{key:"crm/customers",title:"مشتریان و طیف‌بندی",icon:c.HeartHandshake},{key:"crm/campaigns",title:"کمپین‌ها و مناسبتی",icon:c.HeartHandshake}]}'
  if (!src.includes(crmOld)) {
    console.error('✗ returns-to-crm: crm workspace anchor not found')
    process.exit(1)
  }
  src = src.replace(crmOld, crmNew)
  console.log('  + returns-to-crm: بخش CRM → «فروش و مشتریان» با ۶ صفحه')

  /* ۳) نقشهٔ H نماها: returns/* → crm/* */
  const renames = [
    ['returns/new', 'crm/new'],
    ['returns/history', 'crm/history'],
    ['returns/approvals', 'crm/approvals'],
    ['returns/payments', 'crm/payments'],
    ['returns/customers', 'crm/notebook'],
  ]
  let hCount = 0
  for (const [from, to] of renames) {
    const esc = from.replace(/\//g, '\\/')
    const re = new RegExp(`"${esc}":\\(0,I\\.default\\)`, 'g')
    src = src.replace(re, () => {
      hCount++
      return `"${to}":(0,I.default)`
    })
  }
  console.log(`  + returns-to-crm: ${hCount} ورودی H-map تغییر نام یافت`)

  /* ۴) نقشهٔ دسترسی: کلیدهای صفحه + بخش */
  let aCount = 0
  for (const [from, to] of renames) {
    const esc = from.replace(/\//g, '\\/')
    const re = new RegExp(`"${esc}":\\[`, 'g')
    src = src.replace(re, () => {
      aCount++
      return `"${to}":[`
    })
  }
  // بخش returns حذف؛ crm گسترده می‌شود (گیت واقعی صفحه‌به‌صفحه سمت سرور است)
  const accOld = 'returns:["OWNER","GM","ADMIN","EXEC","ACC","HC","CASHIER"]'
  if (src.includes(accOld)) {
    src = src.replace(accOld + ',', '')
    aCount++
  }
  const crmAccOld = 'crm:["OWNER","GM","ADMIN","EXEC","SALES","HC"]'
  const crmAccNew = 'crm:["OWNER","GM","ADMIN","EXEC","ACC","SALES","HC","CASHIER","PM","SK","MERCH"]'
  if (src.includes(crmAccOld)) {
    src = src.replace(crmAccOld, crmAccNew)
    aCount++
  }
  console.log(`  + returns-to-crm: ${aCount} ورودی نقشهٔ دسترسی`)

  writeFileSync(ORIG, src)
  console.log('✓ returns-to-crm applied')
}

main()
