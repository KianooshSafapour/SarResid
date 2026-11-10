/**
 * R14 — ربات‌های پذیرش: تأیید مدیر کل در سفارش‌ها + خارج از موعد + اسکن بارکد + بایگانی خودکار + AI
 * اجرا:  bun qa/bots/r14-bots.mjs   (سرور dev روی :3000)
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
const bots = { owner: new Bot('مالک'), gm: new Bot('مدیر کل لطفی'), admin: new Bot('مدیر IT'), acc: new Bot('حسابدار'), sk: new Bot('انباردار') }
const byRole = {}
async function loginAll() {
  const roster = await bots.admin.req('/api/auth/roster')
  for (const u of roster.data.users) byRole[u.role] = u
  for (const [key, role] of Object.entries({ owner: 'OWNER', gm: 'GM', admin: 'ADMIN', acc: 'ACC', sk: 'SK' })) {
    await bots[key].login(byRole[role].id, 'pin', '1234')
  }
  console.log('∈ ۵ ربات وارد شدند')
}

/* ═══ مجموعه ۱ — گردش‌کار سفارش با گام تأیید مدیر کل ═══ */
async function suiteOrderGm() {
  console.log('── مجموعهٔ ۱: سفارش ← دریافت (خارج از موعد + اسکن) ← حسابداری ← تأیید مدیر کل ← بستن ──')
  const { owner, acc, gm, sk } = bots
  /* کالای متصل برای قیمت/اسکن */
  const seed = await acc.req('/api/products/search?q=' + encodeURIComponent('شیر'))
  const prod = seed.data?.products?.[0]
  check('ordgm', 'کالای نمونه پیدا شد', !!prod)

  const created = await owner.req('/api/orders', 'POST', {
    supplierName: 'بات تست R14 — پخش тест',
    deliveryDate: '1405-08-03', /* عمداً گذشته — برای آزمون خارج از موعد */
    payMethod: 'CASH',
    items: [{ productId: prod?.id, name: prod?.name || 'بات تست شیر', barcode: prod?.barcode, qty: 5, unitBuyPrice: 100000, printedPrice: 200000 }],
  })
  check('ordgm', 'سفارش با تاریخ تحویل گذشته ساخته شد', created.ok, created.error || '')
  const oid = created.data?.id
  await owner.req(`/api/orders/${oid}`, 'PATCH', { action: 'submit' })
  await owner.req(`/api/orders/${oid}`, 'PATCH', { action: 'approve' })

  /* شروع دریافت بدون توضیحِ خارج از موعد — سرور سخت نمی‌گیرد (تأیید در UI است) اما با توضیح، ردپای off-schedule ثبت می‌شود */
  const st = await sk.req(`/api/orders/${oid}`, 'PATCH', { action: 'start-receive', offScheduleNote: 'تأمین‌کننده دیر آورد و ترخیص امروز انجام شد', offScheduleDays: -2 })
  check('ordgm', 'شروع دریافت با توضیحِ خارج از موعد ثبت شد', st.ok)
  const stDetail = await sk.req(`/api/orders/${oid}`)
  const hasOff = (JSON.parse(stDetail.data.historyJson || '[]')).some((h) => h.action === 'off-schedule' && String(h.detail || '').includes('دیرتر'))
  check('ordgm', 'ردپای «خارج از موعد» در تاریخچه ثبت شد', hasOff)

  /* اسکن بارکد: شناخته‌شده + جدید + نامعتبر */
  const item = stDetail.data.items[0]
  if (prod?.barcode) {
    const known = await sk.req(`/api/orders/${oid}`, 'PATCH', { action: 'scan-barcode', itemId: item.id, barcode: prod.barcode })
    check('scan', 'بارکد شناخته‌شده → known', known.ok && known.data?.known === true, JSON.stringify(known.data || known.error))
  }
  const newCode = String(Date.now()).slice(-12)
  const added = await sk.req(`/api/orders/${oid}`, 'PATCH', { action: 'scan-barcode', itemId: item.id, barcode: newCode })
  check('scan', 'بارکد جدید در بانک بارکد کالا ثبت شد', added.ok && added.data?.added === true, added.error || '')
  const prodAfter = await acc.req(`/api/products/${prod.id}`)
  check('scan', 'بانک بارکد کالا شامل کد جدید است', (prodAfter.data.barcodes || []).some((b) => (typeof b === 'string' ? b : b?.code) === newCode))
  const badScan = await sk.req(`/api/orders/${oid}`, 'PATCH', { action: 'scan-barcode', itemId: item.id, barcode: 'abc' })
  check('scan', 'بارکد نامعتبر رد می‌شود', badScan.ok === false)
  /* وضعیت همچنان RECEIVING است → اسکن مجاز؛ بررسی منفی با قلم غلط:
  const wrongItem = await sk.req(`/api/orders/${oid}`, 'PATCH', { action: 'scan-barcode', itemId: 'nonexistent', barcode: '12345678' })
  check('scan', 'قلم ناموجود رد می‌شود', wrongItem.ok === false)

  /* دریافت کامل → راستی‌آزمایی → حسابداری */
  const rec = await sk.req(`/api/orders/${oid}`, 'PATCH', { action: 'receive', items: [{ id: item.id, receivedQty: 5, returnedQty: 0 }] })
  check('ordgm', 'پایان دریافت', rec.ok, rec.error || '')
  const ver = await acc.req(`/api/orders/${oid}`, 'PATCH', { action: 'verify' })
  check('ordgm', 'راستی‌آزمایی', ver.ok, ver.error || '')
  const accPost = await acc.req(`/api/orders/${oid}`, 'PATCH', { action: 'account', payMethod: 'CASH', pushToHoloo: false })
  check('ordgm', 'ثبت در حسابداری', accPost.ok, accPost.error || '')

  /* بستن پیش از تأیید مدیر کل ممنوع */
  const earlyFinal = await owner.req(`/api/orders/${oid}`, 'PATCH', { action: 'final-approve' })
  check('ordgm', 'بستن پیش از تأیید مدیر کل رد می‌شود', earlyFinal.ok === false && /مدیر کل/.test(earlyFinal.error || ''), earlyFinal.error || '')

  const accT = await acc.req(`/api/orders/${oid}`, 'PATCH', { action: 'gm-approve' })
  check('ordgm', 'حسابدار نمی‌تواند تأیید مدیر کل کند (۴۰۳)', accT.ok === false && accT._status === 403)

  const gmApp = await gm.req(`/api/orders/${oid}`, 'PATCH', { action: 'gm-approve' })
  check('ordgm', 'مدیر کل تأیید کرد (+قیمت فاکتور سودسنج منتشر شد)', gmApp.ok && gmApp.data?.prices?.updatedLocal >= 1, JSON.stringify(gmApp.data?.prices ?? gmApp.error))
  const gmAgain = await gm.req(`/api/orders/${oid}`, 'PATCH', { action: 'gm-approve' })
  check('ordgm', 'تأیید دوباره رد می‌شود', gmAgain.ok === false)

  const fin = await owner.req(`/api/orders/${oid}`, 'PATCH', { action: 'final-approve' })
  check('ordgm', 'بستن سفارش پس از تأیید مدیر کل', fin.ok && fin.data?.status === 'DONE', fin.error || '')
  return { oid }
}

/* ═══ مجموعه ۲ — بایگانی خودکار فاکتور ═══ */
async function suiteAutoArchive() {
  console.log('── مجموعهٔ ۲: بایگانی خودکار (زون‌بندِ شرکت) ──')
  const { acc, gm, sk } = bots
  const structure = await acc.req('/api/archive/structure')
  const binder = structure.data.cabinets[0].shelves[0].binders[0]

  /* فاکتور ۱: با saveBinder بایگانی می‌شود → نگاشت شرکت ذخیره */
  const prod = (await acc.req('/api/products/search?q=' + encodeURIComponent('ماست'))).data?.products?.[0]
  const c1 = await acc.req('/api/margin', 'POST', {
    supplierName: 'بات تست R14 — آرشیو خودکار',
    items: [{ productName: prod?.name || 'بات تست ماست', productId: prod?.id, barcode: prod?.barcode, unit: 'عدد', quantity: 2, totalCost: 200000, printedPrice: 260000, salePrice: 250000 }],
  })
  const inv1 = c1.data?.id
  await sk.req(`/api/margin/${inv1}`, 'PATCH', { action: 'deliver' })
  const det1 = await acc.req(`/api/margin/${inv1}`)
  const it1 = det1.data.invoice.items[0]
  await acc.req(`/api/margin/${inv1}`, 'PATCH', { action: 'review-save', items: [{ id: it1.id, accepted: true, printedPrice: 260000, salePrice: 250000, totalCost: 200000 }] })
  await acc.req(`/api/margin/${inv1}`, 'PATCH', { action: 'finalize', payMethod: 'CASH', pushToHoloo: false })
  await gm.req(`/api/margin/${inv1}`, 'PATCH', { action: 'gm-approve' }) /* بدون autoArchive — نگاشت هنوز نیست */
  const arch1 = await acc.req(`/api/margin/${inv1}`, 'PATCH', { action: 'archive', binderId: binder.id, folio: '9001', saveBinder: true })
  check('autoarch', 'بایگانی دستی + ذخیرهٔ زون‌بندِ شرکت', arch1.ok, arch1.error || '')

  /* فاکتور ۲ همان شرکت: gm-approve با autoArchive → باید خودکار بایگانی شود */
  const c2 = await acc.req('/api/margin', 'POST', {
    supplierName: 'بات تست R14 — آرشیو خودکار',
    items: [{ productName: prod?.name || 'بات تست ماست', productId: prod?.id, barcode: prod?.barcode, unit: 'عدد', quantity: 1, totalCost: 100000, printedPrice: 130000, salePrice: 125000 }],
  })
  const inv2 = c2.data?.id
  await sk.req(`/api/margin/${inv2}`, 'PATCH', { action: 'deliver' })
  const det2 = await acc.req(`/api/margin/${inv2}`)
  const it2 = det2.data.invoice.items[0]
  await acc.req(`/api/margin/${inv2}`, 'PATCH', { action: 'review-save', items: [{ id: it2.id, accepted: true, printedPrice: 130000, salePrice: 125000, totalCost: 100000 }] })
  await acc.req(`/api/margin/${inv2}`, 'PATCH', { action: 'finalize', payMethod: 'CASH', pushToHoloo: false })

  /* پیش از تأیید: GET باید زون‌بندِ خودکار را نشان دهد */
  const det2b = await acc.req(`/api/margin/${inv2}`)
  check('autoarch', 'GET فاکتور زون‌بندِ خودکار شرکت را برمی‌گرداند', !!det2b.data.invoice.autoArchiveBinder?.id && det2b.data.invoice.autoArchiveBinder.id === binder.id, JSON.stringify(det2b.data.invoice.autoArchiveBinder))

  const gmApp = await gm.req(`/api/margin/${inv2}`, 'PATCH', { action: 'gm-approve', autoArchive: true })
  check('autoarch', 'تأیید مدیر کل + بایگانی خودکار انجام شد', gmApp.ok && gmApp.data?.autoArchived?.docId, JSON.stringify(gmApp.data?.autoArchived ?? gmApp.error))
  const folioN = parseInt(gmApp.data?.autoArchived?.folio ?? '0', 10)
  check('autoarch', 'برگهٔ خودکار = عددیِ بعد از برگه‌های موجود', folioN >= 9002, `folio=${gmApp.data?.autoArchived?.folio}`)
  const det2c = await acc.req(`/api/margin/${inv2}`)
  check('autoarch', 'وضعیت فاکتور = بایگانی‌شده', det2c.data.invoice.status === 'archived' && !!det2c.data.invoice.archive?.location)
}

/* ═══ مجموعهٔ ۳ — دستیار هوشمند (z.ai) ═══ */
async function suiteAi() {
  console.log('── مجموعهٔ ۳: دستیار هوشمند — نقش‌ها و کلید ──')
  const { admin, acc } = bots
  const st = await admin.req('/api/ai/settings')
  check('ai', 'GET تنظیمات برای ادمین', st.ok && typeof st.data.configured === 'boolean')
  const noAcc = await acc.req('/api/ai/settings')
  check('ai', 'حسابدار دسترسی ندارد (۴۰۳)', noAcc.ok === false && noAcc._status === 403)
  /* بدون کلید واقعی، chat باید خطای واضح بدهد (نه 500) */
  if (!st.data.configured) {
    const chat = await admin.req('/api/ai/chat', 'POST', { messages: [{ role: 'user', content: 'سلام' }] })
    check('ai', 'chat بدون کلید → پیام واضح (۴۰۰)', chat.ok === false && /کلید/.test(chat.error || ''), chat.error || '')
  } else {
    console.log('  (کلید z.ai تنظیم است — تست گفت‌وگو دستی/E2E)')
  }
}

async function main() {
  console.log('══════════ ربات‌های R14 — سر رسید ══════════')
  await loginAll()
  await suiteOrderGm()
  await suiteAutoArchive()
  await suiteAi()
  console.log(`\n════ خلاصه ════\n  PASS: ${passCount}  FAIL: ${failCount}`)
  if (failures.length) {
    for (const f of failures) console.log('    ✗ ' + f)
    process.exit(1)
  }
}
main().catch((e) => { console.error('BOT CRASH:', e); process.exit(2) })
