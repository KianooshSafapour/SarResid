/** SHOP — بات‌های فروشگاه آنلاین: سفر مشتری کامل + گردش‌کار کارکنان + فاکتور هلو (شبیه‌ساز :3040)
 *  پیش‌نیاز: bun scripts/seed-shop-settings.ts و bun scripts/seed-shop-test-products.ts و غنی‌سازی-تست ج
 *  اجرا: node qa/bots/shop-bots.mjs   (ساررسید :3000 + ویترین :3100 + holoo-sim :3040 روشن) */
const S = process.env.BOT_BASE_URL || 'http://localhost:3000'
const F = process.env.FRONT_BASE_URL || 'http://localhost:3100'
const SIM = 'http://127.0.0.1:3040'
let pass = 0, fail = 0
const failures = []
const check = (s, n, c, e = '') => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; failures.push(`${s}::${n} ${e}`); console.log(`  ✗ ${n} ${e}`) } }

class Bot {
  constructor() { this.cookie = '' }
  async login(id) { return this.req('/api/auth/login', 'POST', { userId: id, mode: 'pin', value: '1234' }) }
  async req(p, m = 'GET', b = null) {
    const r = await fetch(S + p, { method: m, headers: { 'content-type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}) }, body: b ? JSON.stringify(b) : undefined })
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0]
    const j = await r.json().catch(() => ({ ok: false })); j._status = r.status; return j
  }
}

class Customer {
  constructor() { this.token = ''; this.cart = 'cart-' + Math.random().toString(36).slice(2, 14) }
  h() { return { 'content-type': 'application/json', 'x-shop-cart': this.cart, ...(this.token ? { 'x-shop-token': this.token } : {}) } }
  async req(p, m = 'GET', b = null) {
    const r = await fetch(S + '/api/shop' + p, { method: m, headers: this.h(), body: b ? JSON.stringify(b) : undefined })
    const sc = r.headers.get('set-cookie')
    if (sc?.includes('hz_shop=')) this.token = sc.split(';')[0].replace('hz_shop=', '')
    const j = await r.json().catch(() => ({ ok: false })); j._status = r.status; return j
  }
}

const simToken = async () => {
  const r = await fetch(SIM + '/TncHoloo/api/Login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userinfo: { username: 'admin', userpass: 'YWRtaW4=', dbname: 'Holoo1' } }) })
  const j = await r.json()
  return j.Login.Token
}
const simGet = async (token, path) => (await fetch(SIM + '/TncHoloo/api' + path, { headers: { Authorization: token } })).json()

// ═══ ۱) پیکربندی و کاتالوگ ═══
console.log('∈ فروشگاه آنلاین — بات‌ها')
const cfg = await (await fetch(S + '/api/shop/config')).json()
check('cat', 'config باز است و هزینهٔ ارسال دارد', cfg.ok && cfg.data.open === true && cfg.data.deliveryFee === 60000, JSON.stringify(cfg.data || {}).slice(0, 80))

const cat = await (await fetch(S + '/api/shop/catalog?q=' + encodeURIComponent('آزمون فروشگاه'))).json()
check('cat', 'جست‌وجوی فازی کالاهای آزمون', cat.ok && cat.data.items.length >= 2, `items=${cat.data?.items?.length}`)
const pa = cat.data.items.find((i) => i.name === 'آزمون فروشگاه الف')
const pb = cat.data.items.find((i) => i.name === 'آزمون فروشگاه ب')
const catBean = await (await fetch(S + '/api/shop/catalog?q=' + encodeURIComponent('کنسرو لوبیا سحر') + '&pageSize=20')).json()
const pbean = (catBean.data?.items || []).find((i) => i.name.includes('کنسرو خوراک لوبیا'))
check('cat', 'قیمت کالای الف درست است', pa && pa.price === 800000 && pa.available > 0, JSON.stringify(pa && { p: pa.price, av: pa.available }))
check('cat', 'کالای غنی‌سازی (لوبیا) در کاتالوگ است', !!pbean && pbean.available > 0, JSON.stringify(pbean && { av: pbean.available, name: pbean.name }))

const r1 = await fetch(S + '/api/shop/catalog?group=' + encodeURIComponent('آزمون'))
const etag = r1.headers.get('etag')
const r2 = await fetch(S + '/api/shop/catalog?group=' + encodeURIComponent('آزمون'), { headers: { 'if-none-match': etag || '' } })
check('cat', 'ETag کاتالوگ — پاسخ ۳۰۴ بدون تغییر', !!etag && r2.status === 304, `etag=${etag}, status=${r2.status}`)

const det = await (await fetch(S + '/api/shop/product/' + pa.id)).json()
check('cat', 'جزئیات کالا: قیمت + مرتبط‌ها', det.ok && det.data.price === 800000 && Array.isArray(det.data.related), det.error || '')

// ═══ ۲) ویترین (SSR + پروکسی) ═══
const homeHtml = await (await fetch(F + '/')).text()
check('front', 'صفحهٔ نخست SSR: برند و ریل پرفروش‌ها', homeHtml.includes('هایپر زیتون') && homeHtml.includes('پرفروش'), `len=${homeHtml.length}`)
const searchHtml = await (await fetch(F + '/search?q=' + encodeURIComponent('آزمون فروشگاه'))).text()
check('front', 'صفحهٔ جست‌وجو SSR: کالای آزمون رندر شده', searchHtml.includes('آزمون فروشگاه الف'), '')
const pdpHtml = await (await fetch(F + '/p/' + pa.id)).text()
check('front', 'صفحهٔ کالا SSR: نام و قیمت', pdpHtml.includes('آزمون فروشگاه الف') && pdpHtml.includes('ریال'), '')
const fcfg = await (await fetch(F + '/api/shop/config')).json()
check('front', 'پروکسی ویترین → config', fcfg.ok === true, JSON.stringify(fcfg).slice(0, 80))

// ═══ ۳) OTP مشتری ═══
const c1 = new Customer()
const RUN = Date.now() % 10_000_000
const PHONE = '0912' + String(RUN).padStart(7, '0')
const otp1 = await c1.req('/auth/otp', 'POST', { phone: PHONE })
check('otp', 'ارسال کد ورود (dev کد برمی‌گرداند)', otp1.ok === true && /^\d{5}$/.test(otp1.data?.devCode || ''), JSON.stringify(otp1).slice(0, 100))
const bad = await c1.req('/auth/verify', 'POST', { phone: PHONE, code: '00000' })
check('otp', 'کد غلط رد می‌شود (۴۰۱)', bad.ok === false && bad._status === 401, `s=${bad._status}`)
const good = await c1.req('/auth/verify', 'POST', { phone: PHONE, code: otp1.data.devCode })
check('otp', 'کد درست → توکن نشست', good.ok === true && !!good.data?.token, JSON.stringify(good).slice(0, 80))
const me = await c1.req('/auth/me')
check('otp', 'me: شماره درست', me.ok && me.data.phone === PHONE, JSON.stringify(me.data || {}))
const setName = await c1.req('/auth/me', 'PATCH', { name: 'بات خریدار' })
check('otp', 'ثبت نام نمایشی', setName.ok === true, setName.error || '')

let limited = null
for (let i = 0; i < 3; i++) limited = await c1.req('/auth/otp', 'POST', { phone: PHONE })
check('otp', 'نرخ‌محوری: بیش از ۳ کد در ساعت رد می‌شود (۴۲۹)', limited.ok === false && limited._status === 429, `s=${limited._status}`)

// ═══ ۴) سبد خرید ═══
let b = await c1.req('/basket', 'POST', { productId: pa.id, qty: 1 })
check('basket', 'افزودن الف ×۱ — هزینهٔ ارسال فعال', b.ok && b.data.itemsTotal === 800000 && b.data.deliveryFee === 60000, JSON.stringify(b.data && { t: b.data.itemsTotal, f: b.data.deliveryFee }))
b = await c1.req('/basket', 'POST', { productId: pb.id, qty: 1 })
check('basket', 'زیر آستانهٔ ارسال رایگان (۵۰م ریال) — هزینهٔ ارسال می‌ماند', b.ok && b.data.itemsTotal === 1750000 && b.data.deliveryFee === 60000, JSON.stringify(b.data && { t: b.data.itemsTotal, f: b.data.deliveryFee }))
const liveStockA = (await (await fetch(S + '/api/shop/product/' + pa.id)).json()).data.stock
const trim = await c1.req('/basket', 'POST', { productId: pa.id, qty: 99 })
const trimmedTo = trim.data?.trimmedTo
check('basket', 'برش صادقانهٔ تعداد به موجودی (shelfFloor=۲ رعایت شد)', trim.ok && trimmedTo >= 1 && trimmedTo <= liveStockA - 2, `trimmedTo=${trimmedTo}, stock=${liveStockA}`)
b = await c1.req('/basket', 'POST', { productId: pa.id, qty: 2 })
const beanQty = Math.min(2, pbean.available)
b = await c1.req('/basket', 'POST', { productId: pbean.id, qty: beanQty })
check('basket', 'سبد ۳ قلمی آماده', b.ok && b.data.count === 2 + 1 + beanQty, `count=${b.data?.count}`)
const itemsTotal = b.data.itemsTotal

// ═══ ۵) آدرس و بازه ═══
const addr = await c1.req('/addresses', 'POST', { receiver: 'بات خریدار', address: 'خیابان آزمون، کوچهٔ بات‌ها، پلاک ۱', label: 'خانه' })
check('addr', 'ایجاد آدرس', addr.ok && !!addr.data?.address?.id, addr.error || '')
const slots = await c1.req('/slots')
check('slot', 'بازهٔ آزاد موجود', slots.ok && slots.data.slots.length > 0, JSON.stringify(slots.data || {}).slice(0, 80))
const slot = slots.data.slots[0]

// ═══ ۶) سفارش COD + گردش‌کار کامل + فاکتور هلو ═══
const ord1 = await c1.req('/orders', 'POST', { addressId: addr.data.address.id, slotDate: slot.date, slotFrom: slot.from, slotTo: slot.to, payMethod: 'COD' })
check('order', 'ثبت سفارش COD', ord1.ok && /^HZ-WEB-\d+/.test(ord1.data.order.code), JSON.stringify(ord1).slice(0, 120))
const code1 = ord1.data?.order?.code
check('order', 'جمع سفارش = اقلام + هزینهٔ ارسال', ord1.data.order.total === itemsTotal + 60000, `${ord1.data?.order?.total} vs ${itemsTotal + 60000}`)
const afterOrder = await c1.req('/basket')
check('order', 'سبد پس از ثبت خالی است', afterOrder.ok && afterOrder.data.count === 0, `count=${afterOrder.data?.count}`)
const myList = await c1.req('/orders')
check('order', 'سفارش در فهرست من', myList.ok && myList.data.orders.some((o) => o.code === code1), '')

// رقابت روی موجودی: سبد دوم نمی‌تواند بیشتر از باقی‌مانده بردارد (کالای پرموجودیِ آزاد، مستقل از اجراهای قبل)
const c2 = new Customer()
const plentiful = (await (await fetch(S + '/api/shop/catalog?avail=1&pageSize=60&sort=popular')).json()).data.items
  .find((x) => x.available >= 10 && x.available <= 90 && ![pa.id, pb.id, pbean?.id].includes(x.id))
if (!plentiful) throw new Error('کالای با موجودی ۱۰..۹۰ برای تست رقابت پیدا نشد')
const first = await c2.req('/basket', 'POST', { productId: plentiful.id, qty: plentiful.available + 3 })
const avail2 = first.data?.trimmedTo
const c3 = new Customer()
const clash = await c3.req('/basket', 'POST', { productId: plentiful.id, qty: 1 })
check('stock', 'رقابت موجودی: رزرو سبد اول، دومی را نمی‌گذارد', first.ok && avail2 === plentiful.available && clash.ok === false && clash._status === 409, `avail2=${avail2}, plentiful.av=${plentiful && plentiful.available}, clash=${clash._status}`)

// کارکنان: انباردار (SK)
const roster = await (await fetch(S + '/api/auth/roster')).json()
const byRole = {}; for (const u of roster.data.users) byRole[u.role] = u
const sk = new Bot(); await sk.login(byRole.SK.id)
const gm = new Bot(); await gm.login(byRole.GM.id)

const lane = await sk.req('/api/shop-admin/orders?status=COD')
const mine = (lane.data?.orders || []).find((o) => o.code === code1)
check('staff', 'پنل کارکنان سفارش را می‌بیند (اقلام و آدرس)', lane.ok && !!mine && mine.items.length === 3, JSON.stringify(lane.error || `found=${!!mine}`))

const stockBefore = (await (await fetch(S + '/api/shop/product/' + pa.id)).json()).data.stock
const sp = await sk.req('/api/shop-admin/orders/' + mine.id, 'POST', { action: 'start-pick' })
check('staff', 'شروع جمع‌آوری', sp.ok && sp.data.status === 'PICKING', sp.error || '')
const pk = await sk.req('/api/shop-admin/orders/' + mine.id, 'POST', { action: 'picked' })
check('staff', 'پایان جمع‌آوری', pk.ok, pk.error || '')
const dv0 = await sk.req('/api/shop-admin/orders/' + mine.id, 'POST', { action: 'start-deliver', delivererName: 'بات پیک رفسنجان', delivererPhone: '09120000099' })
check('staff', 'ارسال با پیک (نام اجباری)', dv0.ok && dv0.data.status === 'DELIVERING', dv0.error || '')
const noCourier = await sk.req('/api/shop-admin/orders/' + mine.id, 'POST', { action: 'start-deliver' })
const dv = await sk.req('/api/shop-admin/orders/' + mine.id, 'POST', { action: 'deliver' })
check('staff', 'تحویل → فاکتور هلو خودکار (INVOICED)', dv.ok && dv.data.status === 'INVOICED' && !!dv.data.invoiceNo, JSON.stringify(dv.data || {}).slice(0, 120))
check('staff', 'بدون نام پیک مجاز نیست', noCourier.ok === false, noCourier.error || '')

const stockAfter = (await (await fetch(S + '/api/shop/product/' + pa.id)).json()).data.stock
check('staff', 'موجودی انبار ساررسید کم شد (۴۰−۲)', stockAfter === stockBefore - 2, `${stockBefore}→${stockAfter}`)

// راستی‌آزمایی در شبیه‌ساز هلو
const st = await simToken()
const inv = await simGet(st, '/Invoice?Code=' + encodeURIComponent(dv.data.invoiceNo) + '&Type=1')
const invRow = (inv.invoice || [])[0]
check('holoo', `فاکتور نوع ۱ در هلو: ${dv.data.invoiceNo}`, !!invRow && invRow.Type === '1' && invRow.CustomerErpCode, JSON.stringify(invRow || {}).slice(0, 140))
const sumShould = 2 * 800000 + 1 * 950000 + beanQty * pbean.price
check('holoo', 'جمع فاکتور = اقلام (بدون هزینهٔ ارسال)', invRow && Number(invRow.SumPrice) === sumShould, `${invRow?.SumPrice} vs ${sumShould}`)
check('holoo', 'تسویهٔ نقدی کامل', invRow && Number(invRow.SumNaghd) === sumShould, `${invRow?.SumNaghd}`)
const wcust = await simGet(st, '/Customer?code=W' + PHONE)
check('holoo', 'طرف حساب W{موبایل} یکتا ساخته شد', (wcust.customer || []).length === 1 && wcust.customer[0].Mobile === PHONE, JSON.stringify((wcust.customer || [])[0] || {}).slice(0, 100))

// ═══ ۷) لغو: مشتری و فروشگاه ═══
const b2 = await c2.req('/basket', 'POST', { productId: pa.id, qty: 1 })
const o2 = await c2.req('/auth/otp', 'POST', { phone: '0912' + String((RUN + 1) % 10_000_000).padStart(7, '0') })
const v2 = await c2.req('/auth/verify', 'POST', { phone: '0912' + String((RUN + 1) % 10_000_000).padStart(7, '0'), code: o2.data?.devCode })
const a2 = await c2.req('/addresses', 'POST', { receiver: 'بات لغو', address: 'خیابان آزمون ۲، پلاک ۲' })
const ord2 = await c2.req('/orders', 'POST', { addressId: a2.data.address.id, slotDate: slot.date, slotFrom: slot.from, slotTo: slot.to, payMethod: 'COD' })
check('cancel', 'سفارش دوم ثبت', ord2.ok, JSON.stringify(ord2).slice(0, 100))
const cc = await c2.req('/orders/' + ord2.data.order.id + '/cancel', 'POST')
check('cancel', 'لغو توسط مشتری (قبل از جمع‌آوری)', cc.ok && cc.data.status === 'CANCELLED', cc.error || '')

const b3 = await c3.req('/basket', 'POST', { productId: pb.id, qty: 1 })
const o3 = await c3.req('/auth/otp', 'POST', { phone: '0912' + String((RUN + 2) % 10_000_000).padStart(7, '0') })
const v3 = await c3.req('/auth/verify', 'POST', { phone: '0912' + String((RUN + 2) % 10_000_000).padStart(7, '0'), code: o3.data?.devCode })
const a3 = await c3.req('/addresses', 'POST', { receiver: 'بات لغو فروشگاه', address: 'خیابان آزمون ۳، پلاک ۳' })
const ord3 = await c3.req('/orders', 'POST', { addressId: a3.data.address.id, slotDate: slot.date, slotFrom: slot.from, slotTo: slot.to, payMethod: 'COD' })
const sc = await gm.req('/api/shop-admin/orders/' + ord3.data.order.id, 'POST', { action: 'cancel', reason: 'بات: تست لغو' })
check('cancel', 'لغو توسط فروشگاه با علت', sc.ok && sc.data.status === 'CANCELLED', sc.error || '')
const afterDeliverCancel = await sk.req('/api/shop-admin/orders/' + mine.id, 'POST', { action: 'cancel' })
check('cancel', 'سفارش فاکتورشده قابل لغو نیست', afterDeliverCancel.ok === false, afterDeliverCancel.error || '')

// ═══ ۸) درگاه mock ═══
const c4 = new Customer()
const o4 = await c4.req('/auth/otp', 'POST', { phone: '0912' + String((RUN + 3) % 10_000_000).padStart(7, '0') })
await c4.req('/auth/verify', 'POST', { phone: '0912' + String((RUN + 3) % 10_000_000).padStart(7, '0'), code: o4.data?.devCode })
await c4.req('/basket', 'POST', { productId: pa.id, qty: 1 })
const a4 = await c4.req('/addresses', 'POST', { receiver: 'بات درگاه', address: 'خیابان آزمون ۴، پلاک ۴' })
const ord4 = await c4.req('/orders', 'POST', { addressId: a4.data.address.id, slotDate: slot.date, slotFrom: slot.from, slotTo: slot.to, payMethod: 'GATEWAY' })
check('pay', 'سفارش درگاهی → payUrl شبیه‌ساز', ord4.ok && ord4.data.order.payUrl?.startsWith('/pay/mock'), JSON.stringify(ord4.data?.order || {}).slice(0, 120))
const ref = new URL('http://x' + ord4.data.order.payUrl).searchParams.get('ref')
const okPay = await c4.req('/payment/callback', 'POST', { ref, ok: true })
check('pay', 'تسویهٔ موفق → PAID', okPay.ok, JSON.stringify(okPay).slice(0, 100))
const od4 = await c4.req('/orders/' + ord4.data.order.id)
check('pay', 'وضعیت سفارش: پرداخت‌شده', od4.ok && od4.data.status === 'PAID', od4.data?.status || '')
const lane4 = await sk.req('/api/shop-admin/orders?status=PAID')
const mo4 = (lane4.data?.orders || []).find((o) => o.code === ord4.data.order.code)
await sk.req('/api/shop-admin/orders/' + mo4.id, 'POST', { action: 'start-pick' })
await sk.req('/api/shop-admin/orders/' + mo4.id, 'POST', { action: 'picked' })
await sk.req('/api/shop-admin/orders/' + mo4.id, 'POST', { action: 'start-deliver', delivererName: 'بات پیک ۲' })
const fd4 = await sk.req('/api/shop-admin/orders/' + mo4.id, 'POST', { action: 'deliver' })
check('pay', 'تحویل سفارش پرداخت‌شده → فاکتور هلو', fd4.ok && fd4.data.status === 'INVOICED', JSON.stringify(fd4.data || {}).slice(0, 100))

// پرداخت ناموفق → لغو
const c5 = new Customer()
const o5 = await c5.req('/auth/otp', 'POST', { phone: '0912' + String((RUN + 4) % 10_000_000).padStart(7, '0') })
await c5.req('/auth/verify', 'POST', { phone: '0912' + String((RUN + 4) % 10_000_000).padStart(7, '0'), code: o5.data?.devCode })
await c5.req('/basket', 'POST', { productId: pb.id, qty: 1 })
const a5 = await c5.req('/addresses', 'POST', { receiver: 'بات پرداخت ناموفق', address: 'خیابان آزمون ۵، پلاک ۵' })
const ord5 = await c5.req('/orders', 'POST', { addressId: a5.data.address.id, slotDate: slot.date, slotFrom: slot.from, slotTo: slot.to, payMethod: 'GATEWAY' })
const ref5 = new URL('http://x' + ord5.data.order.payUrl).searchParams.get('ref')
const badPay = await c5.req('/payment/callback', 'POST', { ref: ref5, ok: false })
const od5 = await c5.req('/orders/' + ord5.data.order.id)
check('pay', 'پرداخت ناموفق → سفارش لغو', badPay.ok === false && od5.data.status === 'CANCELLED', `${badPay._status}/${od5.data?.status}`)

// ═══ ۹) دسترسی‌ها ═══
const anon = await fetch(S + '/api/shop-admin/orders')
check('authz', 'پنل کارکنان بدون نشست ۴۰۱', anon.status === 401, `s=${anon.status}`)
const custAdmin = await fetch(S + '/api/shop-admin/orders', { headers: { 'x-shop-token': c1.token } })
check('authz', 'توکن مشتری به پنل کارکنان نمی‌رسد (۴۰۱)', custAdmin.status === 401, `s=${custAdmin.status}`)
const noLoginOrder = await new Customer().req('/orders', 'POST', { addressId: 'x' })
check('authz', 'ثبت سفارش بدون ورود ۴۰۱', noLoginOrder.ok === false && noLoginOrder._status === 401, `s=${noLoginOrder._status}`)

// ═══ ۱۰) توکن سرویس ویترین ═══
const setTok = await gm.req('/api/shop-admin/settings', 'PUT', { 'shop:apiToken': 'test-svc-token' })
check('svc', 'مدیر توکن سرویس را تنظیم کرد', setTok.ok, setTok.error || '')
const blocked = await fetch(S + '/api/shop/config')
check('svc', 'بدون توکن سرویس ۴۰۳', blocked.status === 403, `s=${blocked.status}`)
const withTok = await fetch(S + '/api/shop/config', { headers: { 'x-shop-service': 'test-svc-token' } })
check('svc', 'با توکن سرویس ۲۰۰', withTok.status === 200, `s=${withTok.status}`)
await gm.req('/api/shop-admin/settings', 'PUT', { 'shop:apiToken': '' })

// ═══ ۱۱) صفحهٔ /shop-ops ═══
const opsAnon = await fetch(S + '/shop-ops')
const opsHtml = await opsAnon.text()
check('ops', 'پنل /shop-ops بدون نشست راهنما نشان می‌دهد', opsAnon.status === 200 && opsHtml.includes('وارد'), '')
const opsSk = await fetch(S + '/shop-ops', { headers: { cookie: sk.cookie } })
const opsHtmlSk = await opsSk.text()
check('ops', 'انباردار پنل را می‌بیند', opsSk.status === 200 && opsHtmlSk.includes('سفارش‌های آنلاین'), '')

console.log(`\n∈ نتیجهٔ فروشگاه آنلاین: ${pass} ✓ / ${fail} ✗`)
if (failures.length) { console.log(failures.join('\n')); process.exit(1) }
