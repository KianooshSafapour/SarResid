/**
 * R13 — ربات‌های پذیرش/استرس: تأیید مدیرعامل + قیمت هلو + فازی + پایش + تکلیف ردیف + مامور پخش
 * ─────────────────────────────────────────────────────────────────────
 * اجرا:  bun qa/bots/r13-bots.mjs   (سرور dev روی :3000 + holoo-sim روی :3040)
 */
const B = process.env.BOT_BASE_URL || 'http://localhost:3000'

let passCount = 0
let failCount = 0
const failures = []
function check(suite, name, cond, extra = '') {
  if (cond) { passCount++; console.log(`  ✓ ${name}`) }
  else { failCount++; failures.push(`${suite} :: ${name} ${extra}`); console.log(`  ✗ ${name} ${extra}`) }
}
class Bot {
  constructor(name) { this.name = name; this.cookie = ''; this.user = null }
  async login(userId, mode = 'pin', value = '1234') {
    const r = await this.req('/api/auth/login', 'POST', { userId, mode, value })
    if (r.ok) this.user = r.data.user
    return r
  }
  async req(path, method = 'GET', body = null) {
    const headers = { 'content-type': 'application/json' }
    if (this.cookie) headers.cookie = this.cookie
    const res = await fetch(B + path, { method, headers, body: body === null ? undefined : JSON.stringify(body) })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) this.cookie = setCookie.split(';')[0]
    let json = null
    try { json = await res.json() } catch { json = { ok: false, error: `HTTP ${res.status}`, _status: res.status } }
    json._status = res.status
    return json
  }
}

const bots = { owner: new Bot('مالک'), gm: new Bot('مدیرعامل لطفی'), admin: new Bot('مدیر IT'), acc: new Bot('حسابدار درویشی'), sk: new Bot('انباردار محمدی'), cashier: new Bot('صندوقدار') }
const byRole = {}
async function loginAll() {
  const roster = await bots.admin.req('/api/auth/roster')
  if (!roster.ok) { console.error('roster failed:', roster.error); process.exit(1) }
  for (const u of roster.data.users) byRole[u.role] = u
  const map = { owner: 'OWNER', gm: 'GM', admin: 'ADMIN', acc: 'ACC', sk: 'SK', cashier: 'CASHIER' }
  for (const [key, role] of Object.entries(map)) {
    const u = byRole[role]
    const r = await bots[key].login(u.id, 'pin', '1234')
    if (!r.ok) console.error(`! login ${key} failed:`, r.error)
  }
  console.log(`∈ ${Object.keys(bots).length} بات وارد شدند`)
}

/* ═══ مجموعه ۱ — گردش‌کار کامل با گام تأیید مدیرعامل + انتشار قیمت ═══ */
async function suiteGmWorkflow() {
  console.log('── مجموعهٔ ۱: تأیید مدیرعامل (گام ۵) + انتشار قیمت ──')
  const { acc, sk, gm, cashier } = bots

  /* یک کالای واقعی با productId برای آزمون انتشار قیمت */
  const prodSearch = await acc.req('/api/products/search?q=' + encodeURIComponent('بستنی'))
  const prod = prodSearch.data?.products?.[0] ?? null
  check('gm', 'کالای نمونه برای آزمون قیمت پیدا شد', !!prod, prodSearch.error || '')

  /* قیمت‌های یکتا در هر اجرا — تا «تغییرنکردن پیش از تأیید» قابل آزمایش بماند */
  const salePrice = 200000 + (Date.now() % 97) * 1000
  const printedPrice = salePrice + 20000
  const items = [
    { productName: prod ? prod.name : 'بات تست شیر', productId: prod?.id ?? null, barcode: prod?.barcode ?? null, unit: 'عدد', quantity: 3, totalCost: 900000, printedPrice, salePrice },
    { productName: 'بات تست — ماست پرچرب', unit: 'عدد', quantity: 2, totalCost: 400000, printedPrice: 120000, salePrice: 110000 },
  ]
  const created = await acc.req('/api/margin', 'POST', { supplierName: 'بات تست R13 — لبنیات', providerDocNumber: 'BOT-R13-1', items })
  check('gm', 'پیش‌نویس با قیمت نهایی ساخته شد', created.ok, created.error || '')
  const invId = created.data?.id

  await sk.req(`/api/margin/${invId}`, 'PATCH', { action: 'deliver' })
  const detail = await acc.req(`/api/margin/${invId}`)
  const row = detail.data.invoice.items.find((i) => i.productId)
  const other = detail.data.invoice.items.find((i) => !i.productId)
  const review = await acc.req(`/api/margin/${invId}`, 'PATCH', {
    action: 'review-save',
    items: [
      { id: row.id, accepted: true, printedPrice, salePrice, totalCost: 900000 },
      { id: other.id, accepted: false, rejectReason: 'کیفیت نامطلوب' },
    ],
  })
  check('gm', 'بررسی حسابداری ذخیره شد', review.ok, review.error || '')

  const fin = await acc.req(`/api/margin/${invId}`, 'PATCH', { action: 'finalize', payMethod: 'CASH', pushToHoloo: false })
  check('gm', 'فاکتور خرید ثبت شد', fin.ok && !!fin.data.order?.code, fin.error || '')

  /* قیمت کالا هنوز نباید عوض شده باشد (انتشار در گام مدیرعامل است) */
  const prodBefore = await acc.req(`/api/products/${prod.id}`)
  check('gm', 'پیش از تأیید مدیرعامل، قیمت کالا تغییر نکرده', prodBefore.ok && prodBefore.data.sellPrice !== salePrice, `sellPrice=${prodBefore.data?.sellPrice} انتظار≠${salePrice}`)

  const list = await acc.req('/api/margin?status=final')
  const mine = (list.data?.invoices || []).find((i) => i.id === invId)
  check('gm', 'فهرست: gmPending=true برای فاکتور بدون تأیید', mine && mine.gmPending === true)

  /* بایگانی پیش از تأیید مدیرعامل ممنوع */
  const earlyArchive = await acc.req(`/api/margin/${invId}`, 'PATCH', { action: 'archive', binderId: 'x' })
  check('gm', 'بایگانی پیش از تأیید مدیر کل رد می‌شود', earlyArchive.ok === false && /مدیر کل|مدیرعامل/.test(earlyArchive.error || ''), earlyArchive.error || '')

  /* نقش‌ها: حسابدار و صندوقدار نمی‌توانند تأیید کنند */
  const accTry = await acc.req(`/api/margin/${invId}`, 'PATCH', { action: 'gm-approve' })
  check('gm', 'حسابدار نمی‌تواند تأیید مدیرعامل کند (۴۰۳)', accTry.ok === false && accTry._status === 403)
  const cashierTry = await cashier.req(`/api/margin/${invId}`, 'PATCH', { action: 'gm-approve' })
  check('gm', 'صندوقدار نمی‌تواند تأیید کند (۴۰۳)', cashierTry.ok === false && cashierTry._status === 403)

  /* تأیید مدیرعامل — قیمت‌ها منتشر می‌شوند (sellPrice=210000، sellPrice2=230000) */
  const wrongState = await gm.req(`/api/margin/${invId}`, 'PATCH', { action: 'gm-approve' })
  check('gm', 'مدیرعامل تأیید کرد + قیمت‌ها به‌روز شد', wrongState.ok && wrongState.data?.prices?.updatedLocal >= 1, JSON.stringify(wrongState.data?.prices || wrongState.error))
  const prodAfter = await acc.req(`/api/products/${prod.id}`)
  check('gm', `قیمت فروش = قیمت نهایی سودسنج (${salePrice})`, prodAfter.data?.sellPrice === salePrice, `got ${prodAfter.data?.sellPrice}`)
  check('gm', `قیمت چاپی = قیمت فروش ۲ (${printedPrice})`, prodAfter.data?.sellPrice2 === printedPrice, `got ${prodAfter.data?.sellPrice2}`)

  const again = await gm.req(`/api/margin/${invId}`, 'PATCH', { action: 'gm-approve' })
  check('gm', 'تأیید دوباره رد می‌شود', again.ok === false)

  const detail2 = await acc.req(`/api/margin/${invId}`)
  check('gm', 'ردپای گردش‌کار شامل «تأیید مدیرعامل» است', (detail2.data.invoice.history || []).some((h) => h.action === 'gm-approve'))
  check('gm', 'gmApprovedByName = مدیرعامل', !!detail2.data.invoice.gmApprovedByName)

  /* بایگانی پس از تأیید */
  const structure = await acc.req('/api/archive/structure')
  const binder = structure.data.cabinets[0].shelves[0].binders[0]
  const arch = await acc.req(`/api/margin/${invId}`, 'PATCH', { action: 'archive', binderId: binder.id, folio: 'R13-1', holooInvoiceNo: '99100' })
  check('gm', 'بایگانی پس از تأیید مدیرعامل انجام شد', arch.ok && arch.data.status === 'archived', arch.error || '')
  return { invId, orderId: fin.data.order?.id, archiveDocId: arch.data?.docId, prodId: prod?.id }
}

/* ═══ مجموعه ۲ — جست‌وجوی فازی کالا ═══ */
async function suiteFuzzy() {
  console.log('── مجموعهٔ ۲: جست‌وجوی فازی (ترتیب واژه‌ها) ──')
  const { acc } = bots
  /* یک کالای چندواژه‌ای واقعی انتخاب می‌کنیم */
  const seed = await acc.req('/api/products/search?q=' + encodeURIComponent('کاله'))
  const target = (seed.data?.products || []).find((p) => (p.name || '').split(/\s+/).length >= 3) || seed.data?.products?.[0]
  check('fuzzy', 'کالای چندواژه‌ای برای آزمون یافت شد', !!target)
  if (!target) return
  const words = target.name.replace(/^-\s*/, '').split(/\s+/).slice(0, 2)
  const reversed = [...words].reverse().join(' ')
  const direct = words.join(' ')

  const r1 = await acc.req('/api/products/search?q=' + encodeURIComponent(direct))
  const hit1 = (r1.data?.products || []).some((p) => p.id === target.id)
  check('fuzzy', `ترتیب طبیعی «${direct}» می‌بیند`, r1.ok && hit1)
  const r2 = await acc.req('/api/products/search?q=' + encodeURIComponent(reversed))
  const hit2 = (r2.data?.products || []).some((p) => p.id === target.id)
  check('fuzzy', `ترتیب وارونه «${reversed}» هم می‌بیند`, r2.ok && hit2, `results=${r2.data?.products?.length}`)

  /* لیست اصلی کالاها هم فازی است */
  const r3 = await acc.req('/api/products?q=' + encodeURIComponent(reversed) + '&pageSize=50')
  const hit3 = (r3.data?.items || []).some((p) => p.id === target.id)
  check('fuzzy', 'صفحهٔ کالاها (/api/products?q=) هم فازی است', r3.ok && hit3, `total=${r3.data?.total}`)

  /* واژهٔ بی‌ربط → نتیجهٔ خالی، نه خطا */
  const r4 = await acc.req('/api/products/search?q=' + encodeURIComponent('زبلافرقیس'))
  check('fuzzy', 'واژهٔ بی‌ربط → خالی و بدون خطا', r4.ok && (r4.data?.products?.length ?? 0) === 0)

  /* بارکد همچنان دقیق کار می‌کند */
  const bc = await acc.req('/api/products/search?barcode=' + encodeURIComponent(target.barcode || target.code || ''))
  if (target.barcode) check('fuzzy', 'جست‌وجوی بارکد دقیق', bc.ok && bc.data?.id === target.id, bc.error || '')
}

/* ═══ مجموعه ۳ — پایش سرور ═══ */
async function suiteMonitor() {
  console.log('── مجموعهٔ ۳: پایش زندهٔ سرور ──')
  const { admin, gm, cashier } = bots
  const r = await admin.req('/api/system/monitor')
  check('monitor', 'ادمین سنجه‌ها را می‌گیرد', r.ok, r.error || '')
  check('monitor', 'cpu/mem/db/services کامل است', r.ok && r.data?.cpu?.pct != null && r.data?.mem?.total > 0 && Array.isArray(r.data?.services) && r.data?.db?.latencyMs != null)
  check('monitor', 'سرویس sarresid-web زنده است', (r.data?.services || []).some((s) => s.name === 'sarresid-web'))
  const g = await gm.req('/api/system/monitor')
  check('monitor', 'مدیر کل دسترسی دارد (سیاست R16)', g.ok === true)
  const c = await cashier.req('/api/system/monitor')
  check('monitor', 'صندوقدار دسترسی ندارد (۴۰۳)', c.ok === false && c._status === 403)
}

/* ═══ مجموعه ۴ — تکلیف ردیف‌های انقضا به هر نفر ═══ */
async function suiteLaneAssign() {
  console.log('── مجموعهٔ ۴: تکلیف چند ردیف به هر نفر ──')
  const { admin, cashier } = bots
  const r = await admin.req('/api/lane-checks')
  if (!r.ok) return check('lane', 'فهرست بازرسی در دسترس است', false, r.error || '')
  const persons = r.data?.todayPlan?.persons || []
  const person = persons.find((p) => p.userId && p.sections.length > 0) || null
  if (!person) {
    console.log('  (بدون نفرِ دارای بخش — از این مجموعه صرف‌نظر شد)')
    return
  }
  const laneMap = r.data?.laneMap?.map || {}
  const section = person.sections[0]
  const lanes = laneMap[section] || r.data?.laneMap?.defaults || ['طبقهٔ ۱', 'طبقهٔ ۲']
  const assignBody = { lanes: [{ section, lane: lanes[0] }, { section, lane: lanes[1] }] }
  const put = await admin.req('/api/lane-checks?assign=' + encodeURIComponent(person.userId), 'PUT', assignBody)
  check('lane', 'تکلیف ۲ ردیف ذخیره شد', put.ok, put.error || '')

  const after = await admin.req('/api/lane-checks')
  const mine = (after.data?.assignments || {})[person.userId]
  check('lane', 'نگاشت تکلیف برگشت', Array.isArray(mine) && mine.length === 2)
  const planPerson = (after.data?.todayPlan?.persons || []).find((p) => p.userId === person.userId)
  check('lane', 'برنامهٔ امروز جای تصادفی را تکلیف گرفت', planPerson && planPerson.lanes.some((l) => l.lane === lanes[0] && l.section === section), JSON.stringify(planPerson?.lanes?.slice(0, 2)))

  const badSection = await admin.req('/api/lane-checks?assign=' + encodeURIComponent(person.userId), 'PUT', { lanes: [{ section: 'بخش ناموجود', lane: lanes[0] }] })
  check('lane', 'بخش ناموجود رد می‌شود', badSection.ok === false)
  const badLane = await admin.req('/api/lane-checks?assign=' + encodeURIComponent(person.userId), 'PUT', { lanes: [{ section, lane: 'ردیف خیالی' }] })
  check('lane', 'ردیف تعریف‌نشده رد می‌شود', badLane.ok === false)
  const notMgr = await cashier.req('/api/lane-checks?assign=' + encodeURIComponent(person.userId), 'PUT', assignBody)
  check('lane', 'صندوقدار نمی‌تواند تکلیف بدهد (۴۰۳)', notMgr.ok === false && notMgr._status === 403)

  const clear = await admin.req('/api/lane-checks?assign=' + encodeURIComponent(person.userId), 'PUT', { lanes: [] })
  check('lane', 'پاک‌کردن تکلیف → بازگشت به تصادفی', clear.ok)
}

/* ═══ مجموعه ۵ — آرشیو: مامور پخش اقلام برگشتی ═══ */
async function suiteArchiveRep(ctx) {
  console.log('── مجموعهٔ ۵: سند سفارش در آرشیو + مامور پخش ──')
  const { acc } = bots
  if (!ctx?.orderId) return console.log('  (بدون سفارش — صرف‌نظر شد)')
  const structure = await acc.req('/api/archive/structure')
  const binder = structure.data.cabinets[0].shelves[0].binders[0]
  const doc = await acc.req('/api/archive', 'POST', {
    kind: 'ORDER', title: 'بات تست R13 — سند سفارش', dateJalali: '1405-08-06',
    binderId: binder.id, orderId: ctx.orderId,
  })
  check('archive', 'سند سفارش ثبت شد', doc.ok, doc.error || '')
  const got = await acc.req('/api/archive/' + doc.data?.id)
  const lo = got.data?.linkedOrder
  check('archive', 'سفارش متصل قابل مشاهده است', lo && lo.code, JSON.stringify(lo || {}).slice(0, 120))
  check('archive', 'فیلد مامور پخش و اقلام برگشتی موجود است (خالی — بدون ضایعات)', lo && Array.isArray(lo.wasteReturns) && 'wasteRep' in lo)
}

/* ═══ مجموعه ۶ — دادهٔ آبان: تاریخچه قیمت ═══ */
async function suiteAbanPrices() {
  console.log('── مجموعهٔ ۶: دادهٔ آبان (تیر تا آبان) و روند قیمت ──')
  const { acc } = bots
  const seed = await acc.req('/api/trades?summary=1')
  check('aban', 'ماه‌های فعال شامل آبان (1405-08) است', (seed.data?.activeMonths || []).includes('1405-08'), JSON.stringify(seed.data?.activeMonths))
  const top = await acc.req('/api/trades?kind=SELL&top=5&month=1405-08')
  const pid = top.data?.top?.find((t) => t.productId)?.productId
  check('aban', 'کالای پرفروش آبانِ متصل پیدا شد', !!pid)
  if (!pid) return
  const tr = await acc.req('/api/trades?productId=' + pid)
  const series = tr.data?.series || []
  const aban = series.find((s) => s.month === '1405-08')
  check('aban', 'سری ماهانه شامل آبان است', !!aban)
  check('aban', 'sellAvgPrice (فی فروش واقعی) در سری هست', series.some((s) => typeof s.sellAvgPrice === 'number' && s.sellAvgPrice > 0), JSON.stringify(series.slice(-2)))
}

/* ═══ مجموعه ۷ — هلو: PUT قیمت روی شبیه‌ساز ═══ */
async function suiteHolooPricePush() {
  console.log('── مجموعهٔ ۷: انتشار قیمت در هلو (شبیه‌ساز Apex) ──')
  const { gm, acc, admin } = bots
  /* وضعیت هلو فقط برای مدیران است — با ادمین می‌پرسیم */
  const status = await admin.req('/api/holoo/status')
  if (!status.ok || !status.data?.configured) return console.log('  (اتصال هلو فعال نیست — صرف‌نظر شد)')
  /* یک کالای دارای holooErp پیدا کن — چند صفحهٔ اول را با ادمین می‌گردیم */
  let withErp = null
  outer: for (let page = 1; page <= 6; page++) {
    const list = await admin.req(`/api/products?pageSize=100&page=${page}`)
    for (const p of list.data?.items || []) {
      const d = await admin.req(`/api/products/${p.id}`)
      if (d.data?.holooErp) { withErp = d.data; break outer }
    }
  }
  if (!withErp) return console.log('  (کالای متصل هلو نیست — صرف‌نظر شد؛ آزمون قیمت محلی در مجموعهٔ ۱ انجام شد)')
  const created = await acc.req('/api/margin', 'POST', {
    supplierName: 'بات تست R13 — هلو', providerDocNumber: 'BOT-R13-2',
    items: [{ productName: withErp.name, productId: withErp.id, barcode: withErp.code, unit: 'عدد', quantity: 1, totalCost: 100000, printedPrice: 300000, salePrice: 280000 }],
  })
  const invId = created.data?.id
  await bots.sk.req(`/api/margin/${invId}`, 'PATCH', { action: 'deliver' })
  await acc.req(`/api/margin/${invId}`, 'PATCH', { action: 'finalize', payMethod: 'CASH', pushToHoloo: false })
  const appr = await gm.req(`/api/margin/${invId}`, 'PATCH', { action: 'gm-approve' })
  check('holoo', 'تأیید + انتشار در هلو انجام شد', appr.ok, appr.error || '')
  check('holoo', 'حداقل یک قلم در هلو PUT شد یا دلیلش گزارش شد', appr.ok && (appr.data?.prices?.pushedHoloo >= 1 || !!appr.data?.prices?.reason), JSON.stringify(appr.data?.prices || ''))
  /* پاک‌سازی: لغو/حذف فاکتور تست (پیش از بایگانی) */
  await bots.owner.req(`/api/margin/${invId}`, 'DELETE').catch(() => {})
}

async function main() {
  console.log('══════════ ربات‌های R13 — سر رسید ══════════')
  await loginAll()
  const ctx = await suiteGmWorkflow()
  await suiteFuzzy()
  await suiteMonitor()
  await suiteLaneAssign()
  await suiteArchiveRep(ctx)
  await suiteAbanPrices()
  await suiteHolooPricePush()

  console.log('\n══════════ خلاصهٔ R13 ══════════')
  console.log(`  PASS: ${passCount}  FAIL: ${failCount}`)
  if (failures.length) {
    console.log('  شکست‌ها:')
    for (const f of failures) console.log('    ✗ ' + f)
    process.exit(1)
  }
}
main().catch((e) => { console.error('BOT CRASH:', e); process.exit(2) })
