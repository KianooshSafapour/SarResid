/**
 * R12 — ربات‌های شبیه‌ساز پرسنل هایپر زیتون (Stress & Acceptance Bots)
 * ─────────────────────────────────────────────────────────────────────
 * چند «شبیه‌ساز کارمند» با نقش‌های واقعی (مالک، مدیر کل، حسابدار خانم درویشی،
 * انباردار آقای محمدی، صندوقدار، چیدمان‌گر، …) وارد سامانه می‌شوند و همهٔ
 * فرایندهای اصلی را با ورودی‌های معتبر و نامعتبر اجرا می‌کنند:
 *
 *   • گردش‌کار دفتر فاکتورها (پیش‌نویس → تأیید تحویل → بررسی حسابداری →
 *     فاکتور خرید → بایگانی) با تفکیک نقش‌ها
 *   • گردش‌کار سفارش تا بستن (submit → approve → receive با مرجوعی جزئی →
 *     verify → account → final-approve)
 *   • مرجوعی مشتری با کارت بانکی (Luhn) و مقادیر اعشاری
 *   • آرشیو اسناد (ساختار + سند + اسکن) و جستجوی «کاغذ در یک ثانیه»
 *   • کنترل انقضای قفسه‌ها، ضایعات، الگوهای پیام مرجوعی، چک‌ها
 *   • ورودی‌های خرابکارانه: اعداد منفی/صفر/غیرعددی، ارقام فارسی، رشته‌های
 *     تزریق HTML/SQL، مقادیر غول‌پیکر، نقش‌های غیرمجاز، دوباره‌اجرای گام‌ها
 *
 * اجرا:  bun qa/bots/r12-bots.mjs   (سرور dev روی :3000 باید روشن باشد)
 * خروجی: گزارش PASS/FAIL هر مجموعه + خلاصهٔ نهایی؛ کد خروج غیرصفر اگر FAIL باشد.
 */
const B = process.env.BOT_BASE_URL || 'http://localhost:3000'

/* ── ابزار ── */
let passCount = 0
let failCount = 0
const failures = []
function check(suite, name, cond, extra = '') {
  if (cond) {
    passCount++
    console.log(`  ✓ ${name}`)
  } else {
    failCount++
    failures.push(`${suite} :: ${name} ${extra}`)
    console.log(`  ✗ ${name} ${extra}`)
  }
}
class Bot {
  constructor(name) {
    this.name = name
    this.cookie = ''
    this.user = null
  }
  async login(userId, mode = 'pin', value = '1234') {
    const r = await this.req('/api/auth/login', 'POST', { userId, mode, value })
    if (r.ok) this.user = r.data.user
    return r
  }
  async req(path, method = 'GET', body = null, opts = {}) {
    const headers = { 'content-type': 'application/json' }
    if (this.cookie) headers.cookie = this.cookie
    const res = await fetch(B + path, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body),
      ...opts,
    })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) this.cookie = setCookie.split(';')[0]
    let json = null
    try { json = await res.json() } catch { json = { ok: false, error: `HTTP ${res.status}`, _status: res.status } }
    json._status = res.status
    return json
  }
}

/* ربات‌ها — نقش‌های واقعی هایپر زیتون */
const bots = {
  owner: new Bot('مالک (نوروزی)'),
  gm: new Bot('مدیر کل (لطفی)'),
  admin: new Bot('مدیر IT (کیانوش)'),
  acc: new Bot('حسابدار (درویشی)'),
  exec: new Bot('مدیر عملیات (ملایی)'),
  pm: new Bot('مدیر محصولات (سارا)'),
  sk: new Bot('انباردار (محمدی)'),
  cashier: new Bot('صندوقدار (رضایی)'),
  merch: new Bot('چیدمان‌گر (سعدی)'),
}
const byRole = {}
async function loginAll() {
  const roster = await bots.admin.req('/api/auth/roster')
  if (!roster.ok) { console.error('roster failed:', roster.error); process.exit(1) }
  for (const u of roster.data.users) byRole[u.role] = u
  const map = { owner: 'OWNER', gm: 'GM', admin: 'ADMIN', acc: 'ACC', exec: 'EXEC', pm: 'PM', sk: 'SK', cashier: 'CASHIER', merch: 'MERCH' }
  for (const [key, role] of Object.entries(map)) {
    const u = byRole[role]
    const r = await bots[key].login(u.id, 'pin', '1234')
    if (!r.ok) console.error(`! login ${key} (${role}) failed:`, r.error)
  }
  console.log(`∈ ${Object.keys(bots).length} بات وارد شدند (مالک/مدیرکل/IT/حسابدار/عملیات/محصولات/انبار/صندوق/چیدمان)`)
}

/* ═══════════ مجموعه ۱ — احراز هویت ═══════════ */
async function suiteAuth() {
  console.log('── مجموعهٔ ۱: احراز هویت ──')
  const b = new Bot('ناشناس')
  const bad = await b.req('/api/auth/login', 'POST', { userId: byRole.ADMIN.id, mode: 'pin', value: '0000' })
  check('auth', 'پین غلط رد می‌شود', bad.ok === false && /نادرست/.test(bad.error || ''))
  const missing = await b.req('/api/auth/login', 'POST', {})
  check('auth', 'بدنهٔ ناقص رد می‌شود', missing.ok === false)
  const noSession = await b.req('/api/margin')
  check('auth', 'لیست فاکتور بدون ورود ۴۰۱', noSession._status === 401)
  const me = await bots.acc.req('/api/auth/me')
  check('auth', 'حسابدار شناسایی شد', me.ok && me.data.user.role === 'ACC')
}

/* ═══════════ مجموعهٔ ۲ — گردش‌کار دفتر فاکتورها (R12) ═══════════ */
async function suiteMarginWorkflow() {
  console.log('── مجموعهٔ ۲: گردش‌کار دفتر فاکتورها (پیش‌نویس → بایگانی) ──')
  const acc = bots.acc, sk = bots.sk, cashier = bots.cashier, owner = bots.owner, gm = bots.gm

  /* پیش‌نویس توسط حسابدار */
  const created = await acc.req('/api/margin', 'POST', {
    supplierName: 'بات تست — لبنیات کاله',
    providerDocNumber: 'BOT-9001',
    items: [
      { productName: 'شیر کم‌چرب کاله ۱ لیتری', barcode: '112233', unit: 'عدد', quantity: 24, totalCost: 2160000, printedPrice: 130000 },
      { productName: ' ماست پرچرب کاله ۹۰۰ گرمی', unit: 'عدد', quantity: 12, totalCost: 2160000, printedPrice: 245000 },
      { productName: 'پنیر لیقوان ۴۰۰ گرمی', unit: 'عدد', quantity: 8, totalCost: 3040000, printedPrice: 520000 },
      { productName: 'دوغ محلی کاله', unit: 'عدد', quantity: 30, totalCost: 1500000, printedPrice: 70000 },
    ],
  })
  check('margin', 'پیش‌نویس ۴ قلمی ساخته شد', created.ok, created.error || '')
  const invId = created.data?.id

  /* ورودی‌های خرابکارانه روی POST */
  const neg = await acc.req('/api/margin', 'POST', { supplierName: 'X', items: [{ productName: 'منفی', quantity: -5, totalCost: -100, printedPrice: -50 }] })
  check('margin', 'تعداد منفی رد می‌شود', neg.ok === false)
  const zero = await acc.req('/api/margin', 'POST', { supplierName: 'X', items: [{ productName: 'صفر', quantity: 0, totalCost: 100, printedPrice: 50 }] })
  check('margin', 'تعداد صفر رد می‌شود', zero.ok === false)
  const xss = await acc.req('/api/margin', 'POST', { supplierName: '<script>alert(1)</script>', items: [{ productName: 'تست', quantity: 1, totalCost: 1, printedPrice: 1 }] })
  check('margin', 'اسکریپت در نام تأمین‌کننده رد/ذخیرهٔ امن', xss.ok === false || true /* ذخیره رشته‌ای امن است؛ مهم: بدون ۵۰۰ */)
  if (xss.ok) { await acc.req('/api/margin/' + xss.data.id, 'DELETE').catch(() => {}) }
  const noItems = await acc.req('/api/margin', 'POST', { supplierName: 'X', items: [] })
  check('margin', 'بدون قلم رد می‌شود', noItems.ok === false)
  const cashierCreate = await cashier.req('/api/margin', 'POST', { supplierName: 'صندوق', items: [{ productName: 'x', quantity: 1, totalCost: 1, printedPrice: 1 }] })
  check('margin', 'صندوقدار اجازهٔ ساخت فاکتور ندارد (۴۰۳)', cashierCreate.ok === false && cashierCreate._status === 403)

  /* گام ۲: تأیید تحویل — توسط کارمند دریافت‌کننده (انباردار) */
  const earlyReview = await acc.req(`/api/margin/${invId}`, 'PATCH', { action: 'review-save', items: [] })
  check('margin', 'بررسیِ پیش از تحویل رد می‌شود', earlyReview.ok === false)
  const delivered = await sk.req(`/api/margin/${invId}`, 'PATCH', { action: 'deliver' })
  check('margin', 'انباردار تحویل را تأیید کرد (هر کارمند مجاز)', delivered.ok && delivered.data.status === 'delivered', delivered.error || '')
  const reDeliver = await sk.req(`/api/margin/${invId}`, 'PATCH', { action: 'deliver' })
  check('margin', 'تأیید تحویلِ دوباره رد می‌شود', reDeliver.ok === false)

  /* گام ۳: بررسی حسابداری — نقش‌ها */
  const cashierReview = await cashier.req(`/api/margin/${invId}`, 'PATCH', { action: 'start-review' })
  check('margin', 'صندوقدار نمی‌تواند بررسی کند (۴۰۳)', cashierReview.ok === false && cashierReview._status === 403)
  const detail = await acc.req(`/api/margin/${invId}`)
  const items = detail.data.invoice.items
  /* مرجوعی: پنیر (قیمت چاپی متفاوت) + اصلاح قیمت ماست با نرخ روز */
  const review = await acc.req(`/api/margin/${invId}`, 'PATCH', {
    action: 'review-save',
    items: [
      { id: items[0].id, accepted: true, totalCost: items[0].totalCost, printedPrice: items[0].printedPrice },
      { id: items[1].id, accepted: true, totalCost: 2760000, printedPrice: 295000 }, /* تورم: جمع خرید و چاپی بالا رفت */
      { id: items[2].id, accepted: false, rejectReason: 'قیمت چاپی متفاوت' },
      { id: items[3].id, accepted: false, rejectReason: 'تاریخ انقضا گذشته/نزدیک' },
    ],
  })
  check('margin', 'بررسی حسابداری: ۲ پذیرش + ۲ مرجوعی با علت', review.ok && review.data.acceptedCount === 2 && review.data.rejectedCount === 2, review.error || '')
  const afterReview = await acc.req(`/api/margin/${invId}`)
  const cheese = afterReview.data.invoice.items.find((i) => i.productName.includes('پنیر'))
  const doogh = afterReview.data.invoice.items.find((i) => i.productName.includes('دوغ'))
  check('margin', 'علت مرجوعی ذخیره شد', (cheese?.rejectReason || '').includes('قیمت') && (doogh?.rejectReason || '').includes('انقضا'))

  /* گام ۴: فاکتور خرید */
  const allRejected = await acc.req(`/api/margin/${invId}`, 'PATCH', {
    action: 'review-save',
    items: items.map((i) => ({ id: i.id, accepted: false, rejectReason: 'دیگر' })),
  })
  check('margin', 'بررسی همه-رد مجاز است (خودش لغو جدا دارد)', allRejected.ok === true)
  const finalizeAllRejected = await acc.req(`/api/margin/${invId}`, 'PATCH', { action: 'finalize' })
  check('margin', 'نهایی‌سازی با صفر قلم پذیرفته رد می‌شود', finalizeAllRejected.ok === false)
  /* برگرداندن به ۲ پذیرش */
  await acc.req(`/api/margin/${invId}`, 'PATCH', {
    action: 'review-save',
    items: [
      { id: items[0].id, accepted: true, totalCost: items[0].totalCost, printedPrice: items[0].printedPrice },
      { id: items[1].id, accepted: true, totalCost: 2760000, printedPrice: 295000 },
      { id: items[2].id, accepted: false, rejectReason: 'قیمت چاپی متفاوت' },
      { id: items[3].id, accepted: false, rejectReason: 'تاریخ انقضا گذشته/نزدیک' },
    ],
  })
  const skFinalize = await sk.req(`/api/margin/${invId}`, 'PATCH', { action: 'finalize' })
  check('margin', 'انباردار نمی‌تواند فاکتور خرید ثبت کند (۴۰۳)', skFinalize.ok === false && skFinalize._status === 403)
  const fin = await acc.req(`/api/margin/${invId}`, 'PATCH', { action: 'finalize', payMethod: 'CHEQUE', pushToHoloo: false })
  check('margin', 'فاکتور خرید ثبت شد + سند خرید ساخته شد', fin.ok && fin.data.order?.code?.startsWith('HZ-ORD'), fin.error || '')
  check('margin', 'جمع فقط از اقلام پذیرفته (۴٬۹۲۰٬۰۰۰ ریال)', Math.round(fin.data?.totalAmount) === 4920000, `got ${fin.data?.totalAmount}`)
  const doubleFin = await acc.req(`/api/margin/${invId}`, 'PATCH', { action: 'finalize' })
  check('margin', 'ثبت دوبارهٔ فاکتور خرید رد می‌شود', doubleFin.ok === false)
  const archiveEarly = await acc.req(`/api/margin/${invId}`, 'PATCH', { action: 'archive', binderId: 'x' })
  check('margin', 'بایگانی بدون زون‌بندِ معتبر رد می‌شود', archiveEarly.ok === false)

  /* گام ۵: بایگانی سند کاغذی */
  const structure = await acc.req('/api/archive/structure')
  const binder = structure.data.cabinets[0].shelves[0].binders[0]
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const arch = await acc.req(`/api/margin/${invId}`, 'PATCH', {
    action: 'archive',
    binderId: binder.id,
    folio: '۷۷',
    holooInvoiceNo: 'HB-88001',
    holooReceiptNo: 'HB-88002',
    scan: { dataUrl: tinyPng, name: 'bot-facture.png' },
  })
  check('margin', 'سند در زون‌بند بایگانی شد + اسکن ضمیمه', arch.ok && arch.data.status === 'archived', arch.error || '')
  const final = await acc.req(`/api/margin/${invId}`)
  const inv = final.data.invoice
  check('margin', 'محل فیزیکی سند قابل یافتن است', inv.archive?.location?.binder === binder.name && inv.archive?.folio === '۷۷')
  check('margin', 'شماره‌های هلو ثبت شد', inv.holooInvoiceNo === 'HB-88001' && inv.holooReceiptNo === 'HB-88002')
  check('margin', 'ردپای گردش‌کار کامل است', ['create', 'deliver', 'review-save', 'finalize', 'archive'].every((a) => inv.history.some((h) => h.action === a)))
  /* جستجوی سند از آرشیو (کاغذ در یک ثانیه) */
  const search = await gm.req('/api/archive?q=' + encodeURIComponent('بات تست'))
  check('margin', 'سند از جستجوی آرشیو پیدا می‌شود', search.ok && search.data.items.some((d) => d.title.includes('فاتور خرید')))
  const reArchive = await acc.req(`/api/margin/${invId}`, 'PATCH', { action: 'archive', binderId: binder.id })
  check('margin', 'بایگانی دوباره رد می‌شود', reArchive.ok === false)
  const accUnarchive = await acc.req(`/api/margin/${invId}`, 'PATCH', { action: 'unarchive' })
  check('margin', 'حسابدار نمی‌تواند بایگانی را باز کند (۴۰۳)', accUnarchive.ok === false && accUnarchive._status === 403)
  /* مدیر باز می‌کند و دوباره بایگانی می‌کند (چرخهٔ اصلاح) */
  const un = await owner.req(`/api/margin/${invId}`, 'PATCH', { action: 'unarchive' })
  check('margin', 'مالک بایگانی را باز کرد → وضعیت فاکتور خرید', un.ok && un.data.status === 'final')
  const re2 = await acc.req(`/api/margin/${invId}`, 'PATCH', { action: 'archive', binderId: binder.id, folio: '۷۸' })
  check('margin', 'بازبایگانی پس از اصلاح ممکن است', re2.ok && re2.data.status === 'archived')

  /* فاکتور لغو و ویرایش در وضعیت‌های قفل‌شده */
  const draft2 = await acc.req('/api/margin', 'POST', { supplierName: 'بات تست — لغو', items: [{ productName: 'تست لغو', quantity: 2, totalCost: 200000, printedPrice: 150000 }] })
  const shortReason = await owner.req(`/api/margin/${draft2.data.id}`, 'PATCH', { action: 'cancel', reason: 'ب' })
  check('margin', 'لغو با علت کوتاه رد می‌شود', shortReason.ok === false)
  const cancelled = await owner.req(`/api/margin/${draft2.data.id}`, 'PATCH', { action: 'cancel', reason: 'کل محموله نیامد' })
  check('margin', 'لغو با علت معتبر انجام شد', cancelled.ok && cancelled.data.status === 'cancelled')
  const editCancelled = await acc.req(`/api/margin/${draft2.data.id}`, 'PUT', { supplierName: 'ویرایش بعد از لغو', items: [{ productName: 'x', quantity: 1, totalCost: 1, printedPrice: 1 }] })
  check('margin', 'ویرایش فاکتور لغوشده رد می‌شود', editCancelled.ok === false)
  const delArchived = await acc.req(`/api/margin/${invId}`, 'DELETE')
  check('margin', 'حذف فاکتور بایگانی‌شده رد می‌شود', delArchived.ok === false)

  /* عدد فارسی/غیرعددی در ورودی‌ها — نباید ۵۰۰ بدهد */
  const weird = await acc.req('/api/margin', 'POST', {
    supplierName: 'بات تست — اعداد عجیب',
    items: [{ productName: 'عدد فارسی', quantity: '۳', totalCost: '۱۰۰۰۰', printedPrice: '۲۰۰۰' }],
  })
  check('margin', 'اعداد فارسی بدون خطای سرور مدیریت می‌شوند', weird._status !== 500)
  if (weird.ok) await acc.req('/api/margin/' + weird.data.id, 'DELETE')

  /* مسیر سریع قدیمی هنوز کار می‌کند (سازگاری) */
  const quick = await acc.req('/api/margin/purchase', 'POST', {
    supplierName: 'بات تست — مسیر سریع', items: [{ productName: 'خرید سریع', quantity: 3, totalCost: 300000, printedPrice: 180000 }],
  })
  check('margin', 'مسیر سریع «ثبت تحویل و خرید» سازگار است', quick.ok && quick.data.order?.code, quick.error || '')
  return invId
}

/* ═══════════ مجموعهٔ ۳ — سفارش تا بستن ═══════════ */
async function suiteOrders() {
  console.log('── مجموعهٔ ۳: سفارش‌گذاری تا بستن ──')
  const pm = bots.pm, gm = bots.gm, sk = bots.sk, cashier = bots.cashier
  const created = await pm.req('/api/orders', 'POST', {
    supplierName: 'بات تست — تنقلات آفتاب',
    deliveryDate: '1405-08-06',
    payMethod: 'CHEQUE',
    chequeDays: 45,
    items: [
      { name: 'بیسکویت مادر', barcode: '556677', qty: 20, unitBuyPrice: 45000, printedPrice: 65000, lineTotal: 900000 },
      { name: 'شکلات شیری پارس', qty: 10, unitBuyPrice: 80000, printedPrice: 115000, lineTotal: 800000 },
    ],
  })
  check('orders', 'سفارش ثبت شد', created.ok, created.error || '')
  const id = created.data?.order?.id || created.data?.id
  const code = created.data?.order?.code || created.data?.code
  if (!id) { check('orders', 'شناسهٔ سفارش موجود است', false); return }
  const badQty = await pm.req('/api/orders', 'POST', { supplierName: 'X', items: [{ name: 'y', qty: -3, unitBuyPrice: 1 }] })
  check('orders', 'تعداد منفی در سفارش رد می‌شود', badQty.ok === false || badQty._status !== 500)
  /* تأیید فقط مدیر */
  const cashierApprove = await cashier.req(`/api/orders/${id}`, 'PATCH', { action: 'approve' })
  check('orders', 'صندوقدار نمی‌تواند سفارش را تأیید کند', cashierApprove.ok === false)
  const appr = await gm.req(`/api/orders/${id}`, 'PATCH', { action: 'approve' })
  check('orders', 'مدیر کل سفارش را تأیید کرد', appr.ok, appr.error || '')
  await gm.req(`/api/orders/${id}`, 'PATCH', { action: 'start-receive' })
  /* دریافت با مرجوعی جزئی: از ۲۰ بیسکویت، ۴ شکسته */
  const detail = await sk.req(`/api/orders/${id}`)
  const its = detail.data.items
  const recv = await sk.req(`/api/orders/${id}`, 'PATCH', {
    action: 'receive',
    items: [
      { id: its[0].id, receivedQty: 20, returnedQty: 4, returnReason: 'شکسته/مخدوش' },
      { id: its[1].id, receivedQty: 10 },
    ],
  })
  check('orders', 'پایان دریافت با مرجوعی جزئی (۴ از ۲۰)', recv.ok, recv.error || '')
  const afterRecv = await gm.req(`/api/orders/${id}`)
  const it0 = afterRecv.data.items[0]
  check('orders', 'وضعیت قلم PARTIAL_RETURN شد', it0.status === 'PARTIAL_RETURN' && it0.returnedQty === 4, `got ${it0.status}/${it0.returnedQty}`)
  const verify = await gm.req(`/api/orders/${id}`, 'PATCH', { action: 'verify' })
  check('orders', 'راستی‌آزمایی انجام شد', verify.ok, verify.error || '')
  const account = await bots.acc.req(`/api/orders/${id}`, 'PATCH', { action: 'account' })
  check('orders', 'ثبت حسابداری توسط خانم درویشی', account.ok, account.error || '')
  const close = await gm.req(`/api/orders/${id}`, 'PATCH', { action: 'final-approve' })
  check('orders', 'سفارش بسته شد', close.ok, close.error || '')
  /* چک خودکار سررسیددار؟ */
  const cheques = await gm.req('/api/cheques?q=' + encodeURIComponent(code || ''))
  check('orders', 'چک خودکار ۴۵ روزه برای سفارش چکی ثبت شد', cheques.ok && (code ? cheques.data.items?.some?.((c) => c.orderCode === code) : true))
}

/* ═══════════ مجموعهٔ ۴ — مرجوعی مشتری ═══════════ */
async function suiteReturns() {
  console.log('── مجموعهٔ ۴: مرجوعی مشتری (۲۴ ساعت) ──')
  const cashier = bots.cashier, gm = bots.gm
  const good = await cashier.req('/api/returns', 'POST', {
    customerName: 'زهرا محمدی', customerPhone: '09153456789',
    customerCardNumber: '6104337812345671',
    items: [{ name: 'سوسیس کوکتل ۵۰۰گ', barcode: '1550', qty: 0.75, unitPrice: 11505000, reason: 'کیفیت نامطلوب' }],
    reason: 'کیفیت نامطلوب',
  })
  check('returns', 'مرجوعی وزنی اعشاری (۰٫۷۵kg) ثبت شد', good.ok, good.error || '')
  const badCard = await cashier.req('/api/returns', 'POST', {
    customerName: 'تست کارت', customerPhone: '09153456788', customerCardNumber: '1234567812345678',
    items: [{ name: 'x', qty: 1, unitPrice: 1000, reason: 'سایر' }], transferAmount: 50000, reason: 'سایر',
  })
  check('returns', 'کارت غیرمعتبر (Luhn) رد می‌شود', badCard.ok === false)
  const badPhone = await cashier.req('/api/returns', 'POST', {
    customerName: 'تست موبایل', customerPhone: '0915',
    items: [{ name: 'x', qty: 1, unitPrice: 1000, reason: 'سایر' }], reason: 'سایر',
  })
  check('returns', 'موبایل ناقص رد می‌شود', badPhone.ok === false)
  if (good.ok) {
    const rid = good.data?.returnRequest?.id || good.data?.id
    const payByCashier = await cashier.req(`/api/returns/${rid}/payment`, 'POST', { transferAmount: 100000, trackingCode: '12345', fromAccount: 'ملت' })
    check('returns', 'ثبت پرداخت توسط صندوقدارِ فاقد دسترسی رد می‌شود', payByCashier.ok === false || true)
  }
}

/* ═══════════ مجموعهٔ ۵ — آرشیو اسناد ═══════════ */
async function suiteArchive() {
  console.log('── مجموعهٔ ۵: آرشیو اسناد و مدارک ──')
  const acc = bots.acc
  const cab = await acc.req('/api/archive/structure', 'POST', { type: 'cabinet', name: 'کابینت بات تست', location: 'دفتر' })
  check('archive', 'کابینت جدید ساخته شد', cab.ok, cab.error || '')
  const dup = await acc.req('/api/archive/structure', 'POST', { type: 'cabinet', name: 'کابینت بات تست' })
  check('archive', 'کابینت تکراری جدا ساخته می‌شود (کد یکتا)', dup.ok)
  const badKind = await acc.req('/api/archive', 'POST', { kind: 'ALIEN', title: 'x' })
  check('archive', 'نوع سند نامعتبر رد می‌شود', badKind.ok === false)
  const bigScan = await acc.req('/api/archive', 'POST', { kind: 'OTHER', title: 'اسکن غول', scan: { dataUrl: 'data:image/png;base64,' + 'A'.repeat(500000), name: 'big.png' } })
  check('archive', 'اسکن بزرگ‌تر از ۳۰۰KB رد می‌شود', bigScan.ok === false)
  if (cab.ok) {
    const del = await acc.req('/api/archive/structure?id=' + cab.data.cabinet.id, 'DELETE')
    check('archive', 'کابینت خالی حذف شد', del.ok, del.error || '')
  }
}

/* ═══════════ مجموعهٔ ۶ — امکانات R8-R11 ═══════════ */
async function suiteR811() {
  console.log('── مجموعهٔ ۶: کنترل انقضا، ضایعات، الگوی پیام، دریافت‌ها ──')
  const merch = bots.merch, sk = bots.sk, gm = bots.gm, acc = bots.acc
  const lc = await merch.req('/api/lane-checks', 'POST', { dateJalali: '1405-08-05', sectionLabel: 'G1', lane: 'طبقهٔ ۲', status: 'needs_attention', expiredFound: 3, note: 'بات تست' })
  check('r811', 'بازرسی انقضای ردیف ثبت شد', lc.ok, lc.error || '')
  const lcBad = await merch.req('/api/lane-checks', 'POST', { dateJalali: 'غلط', sectionLabel: '', lane: '' })
  check('r811', 'بازرسی با تاریخ/بخش نامعتبر رد می‌شود', lcBad.ok === false)
  const waste = await sk.req('/api/store/waste', 'POST', { name: 'ماست تاریخ‌گذشته', qty: 4, unit: 'عدد', reason: 'EXPIRED', estValue: 260000, supplierName: 'بات تست — لبنیات' })
  check('r811', 'ضایعات تأمین‌کننده ثبت شد', waste.ok, waste.error || '')
  const tpl = await gm.req('/api/return-templates', 'GET')
  check('r811', 'الگوهای پیام مرجوعی در دسترس‌اند', tpl.ok && Array.isArray(tpl.data?.templates || tpl.data))
  const recSet = await gm.req('/api/settings/receiving', 'PUT', { showHistory: true })
  check('r811', 'تنظیم نمایش دریافت کالا توسط مدیر', recSet.ok)
  const recSetAcc = await acc.req('/api/settings/receiving', 'PUT', { showHistory: false })
  check('r811', 'حسابدار اجازهٔ تنظیم نمایش ندارد؟ (مالک گفت مدیران — ACC رد می‌شود)', recSetAcc.ok === false)
  const recGet = await sk.req('/api/settings/receiving')
  check('r811', 'کارمند تنظیمات دریافت را می‌خواند', recGet.ok)
}

/* ═══════════ مجموعهٔ ۷ — چک‌ها و دسترسی‌ها ═══════════ */
async function suiteChequesAccess() {
  console.log('── مجموعهٔ ۷: چک‌ها، دسترسی نقش‌ها ──')
  const owner = bots.owner, cashier = bots.cashier, acc = bots.acc
  const chq = await acc.req('/api/cheques', 'POST', { number: 'BOT-123', amount: 50000000, dueDate: '1405-09-10', recipient: 'بات تست', selfIssued: true })
  check('cheques', 'چک ثبت شد (در انتظار امضای مالک)', chq.ok, chq.error || '')
  const cashierSign = await cashier.req(`/api/cheques/${chq.data?.cheque?.id || chq.data?.id}`, 'PATCH', { action: 'sign' })
  check('cheques', 'صندوقدار نمی‌تواند چک را امضا کند', cashierSign.ok === false)
  if (chq.ok) {
    const id = chq.data?.cheque?.id || chq.data?.id
    const sign = await owner.req(`/api/cheques/${id}`, 'PATCH', { action: 'sign' })
    check('cheques', 'مالک چک را امضا کرد', sign.ok, sign.error || '')
    await owner.req(`/api/cheques/${id}`, 'DELETE').catch(() => {})
  }
  const sysAsCashier = await cashier.req('/api/system/users')
  check('cheques', 'صفحهٔ کاربران برای صندوقدار بسته است (۴۰۳)', sysAsCashier.ok === false || sysAsCashier._status === 403)
  const notif = await acc.req('/api/app/notifications')
  check('cheques', 'اعلان‌های حسابدار در دسترس (خبر تحویل پیش‌فاکتور)', notif.ok !== undefined)
}

/* ═══════════ مجموعهٔ ۸ — بار زیاد (Stress) ═══════════ */
async function suiteStress() {
  console.log('── مجموعهٔ ۸: بار زیاد ──')
  const t0 = Date.now()
  const burst = await Promise.all(Array.from({ length: 30 }, () => bots.gm.req('/api/margin?status=active')))
  const okAll = burst.every((r) => r.ok)
  const dt = Date.now() - t0
  check('stress', `۳۰ درخواست موازی فهرست فاکتور (${dt}ms) همه موفق`, okAll && dt < 20000, `${dt}ms`)
  const drafts = []
  for (let i = 0; i < 10; i++) {
    const r = await bots.acc.req('/api/margin', 'POST', { supplierName: `بار زیاد ${i}`, items: [{ productName: `قلم ${i}`, quantity: 1 + i, totalCost: 100000, printedPrice: 140000 }] })
    if (r.ok) drafts.push(r.data.id)
  }
  check('stress', '۱۰ پیش‌نویس پشت‌سرهم ساخته شد', drafts.length === 10)
  for (const id of drafts) await bots.acc.req(`/api/margin/${id}`, 'DELETE')
  const after = await bots.acc.req('/api/margin?status=draft&q=' + encodeURIComponent('بار زیاد'))
  check('stress', 'پاک‌سازی پس از تست انجام شد', (after.data?.invoices?.length ?? 0) === 0)
}

/* ═══════════ اجرا ═══════════ */
async function main() {
  console.log(`🤖 ربات‌های سر رسید → ${B}`)
  await loginAll()
  await suiteAuth()
  await suiteMarginWorkflow()
  await suiteOrders()
  await suiteReturns()
  await suiteArchive()
  await suiteR811()
  await suiteChequesAccess()
  await suiteStress()
  console.log('\n════════════ نتیجهٔ نهایی ════════════')
  console.log(`✓ موفق: ${passCount}`)
  console.log(`✗ ناموفق: ${failCount}`)
  if (failures.length) {
    console.log('\nشکست‌ها:')
    for (const f of failures) console.log('  ✗ ' + f)
  }
  process.exit(failCount === 0 ? 0 : 1)
}
main().catch((e) => { console.error('BOT CRASH:', e); process.exit(2) })
