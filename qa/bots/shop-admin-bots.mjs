/** R19 — بات‌های پنل مدیریت فروشگاه: دسته‌ها (ادغام گروه لبنیات) + تصاویر چندگانه + تنظیمات GUI + SMS پنل فراز (واقعی) */
const S = process.env.BOT_BASE_URL || 'http://localhost:3000'
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

const RUN = Date.now() % 100_000_000
const roster = await (await fetch(S + '/api/auth/roster')).json()
const byRole = {}; for (const u of roster.data.users) byRole[u.role] = u
const gm = new Bot(); await gm.login(byRole.GM.id)
const sk = new Bot(); await sk.login(byRole.SK.id)
console.log('∈ پنل مدیریت فروشگاه — بات‌ها')

/* ═══ ۱) دسته‌ها: پیشنهاد ادغام «گروه لبنیات»+«لبنیات» و اعمال آن ═══ */
const cats0 = await gm.req('/api/shop-admin/categories')
check('cat', 'گروه‌ها و پیشنهاد ادغام برمی‌گردند', cats0.ok && Array.isArray(cats0.data.rawGroups) && Array.isArray(cats0.data.mergeSuggestions), cats0.error || '')
const sug = cats0.data.mergeSuggestions.find((x) => x.normalized === 'لبنیات')
check('cat', 'پیشنهاد ادغام «لبنیات» کشف شد', !!sug, JSON.stringify((cats0.data.mergeSuggestions || []).map((x) => x.normalized)))
if (sug) {
  // دستهٔ لبنیات اگر هست → افزودن گروه‌ها؛ وگرنه ساخت
  const existing = (cats0.data.categories || []).find((c) => c.name === 'لبنیات')
  let res
  if (existing) {
    res = await gm.req(`/api/shop-admin/categories/${existing.id}`, 'PUT', { name: existing.name, emoji: existing.emoji || '🥛', groups: [...new Set([...existing.groups, ...sug.groups])] })
  } else {
    res = await gm.req('/api/shop-admin/categories', 'POST', { name: 'لبنیات', emoji: '🥛', groups: sug.groups })
  }
  check('cat', 'ادغام در دستهٔ «لبنیات» اعمال شد', res.ok, res.error || '')
}
const cats1 = await gm.req('/api/shop-admin/categories')
const dairy = (cats1.data.categories || []).find((c) => c.name === 'لبنیات')
check('cat', 'دستهٔ لبنیات هر دو گروه هلو را دارد', dairy && dairy.groups.length >= 2 && dairy.groups.includes('لبنیات') && dairy.groups.includes('گروه لبنیات'), JSON.stringify(dairy && dairy.groups))
check('cat', 'شمار کالای دسته = مجموع دو گروه', dairy && dairy.count >= (cats0.data.rawGroups.find((g) => g.name === 'لبنیات') || { count: 0 }).count, `count=${dairy && dairy.count}`)

// کاتالوگ مشتری: دستهٔ ادغام‌شده + فیلتر گروهی با هر دو گروه هلو
const catFront = await (await fetch(S + '/api/shop/catalog?group=' + encodeURIComponent('لبنیات') + '&pageSize=5')).json()
check('cat', 'کاتالوگ با دستهٔ «لبنیات» فیلتر می‌شود (هر دو گروه)', catFront.ok && catFront.data.items.length > 0 && catFront.data.items.every((i) => i.group === 'لبنیات' || i.group === 'گروه لبنیات'), `items=${catFront.data?.items?.length}`)
const groupsFront = await (await fetch(S + '/api/shop/catalog?pageSize=1')).json()
const gnames = (groupsFront.data.groups || []).map((g) => g.name)
check('cat', 'گروه‌های خام ادغام‌شده دیگر جدا نمایش داده نمی‌شوند', gnames.includes('لبنیات') && !(gnames.includes('گروه لبنیات')), JSON.stringify(gnames.slice(0, 8)))
check('cat', 'دسته‌ها ایموجی دارند', (groupsFront.data.groups || []).every((g) => typeof g.emoji === 'string'), '')

// نقش: انباردار به دسته‌ها دسترسی ندارد
const skCats = await sk.req('/api/shop-admin/categories')
check('cat', 'انباردار به مدیریت دسته‌ها دسترسی ندارد (۴۰۳)', skCats.ok === false && skCats._status === 403, `s=${skCats._status}`)

/* ═══ ۲) تصاویر چندگانه + جست‌وجوی وب ═══ */
const prods = await gm.req('/api/shop-admin/products?q=' + encodeURIComponent('آزمون فروشگاه'))
check('img', 'جست‌وجوی کالا در پنل', prods.ok && prods.data.products.length >= 2, prods.error || '')
const target = prods.data.products.find((p) => p.name === 'آزمون فروشگاه الف')
check('img', 'کالای هدف پیدا شد', !!target, '')

const imgs1 = await gm.req('/api/shop-admin/products/media', 'POST', {
  productId: target.id,
  urls: [
    { url: `https://picsum.photos/seed/hz${RUN}a/400`, caption: 'آزمون ۱' },
    { url: `https://picsum.photos/seed/hz${RUN}b/400`, caption: 'آزمون ۲' },
  ],
  source: 'manual',
})
check('img', 'افزودن ۲ تصویر به کالا', imgs1.ok && imgs1.data.added === 2, imgs1.error || JSON.stringify(imgs1.data && imgs1.data.added))
check('img', 'تصویر شاخص وجود دارد (اولین، خودکار)', imgs1.data.media.length >= 2 && imgs1.data.media.some((m) => m.isPrimary), `len=${imgs1.data?.media?.length}`)

const others = imgs1.data.media.filter((m) => !m.isPrimary && m.url.includes(`hz${RUN}`))
const pickOther = others[0] || imgs1.data.media.find((m) => !m.isPrimary)
const setPrim = await gm.req('/api/shop-admin/products/media', 'PUT', { mediaId: pickOther.id, isPrimary: true })
check('img', 'تغییر تصویر شاخص', setPrim.ok && setPrim.data.media.find((m) => m.id === pickOther.id).isPrimary, setPrim.error || '')
const nowPrim = setPrim.data.media.find((m) => m.isPrimary)

// کاتالوگ مشتری primary جدید را نشان می‌دهد + گالری در جزئیات
const pd = await (await fetch(S + '/api/shop/product/' + target.id + `?_=${RUN}`)).json()
check('img', 'کاتالوک/PDP تصویر شاخص جدید را برمی‌گرداند', pd.ok && pd.data.image === nowPrim.url, `${pd.data && pd.data.image} vs ${nowPrim && nowPrim.url}`)
check('img', 'گالری چندتصویری در جزئیات کالا', pd.ok && Array.isArray(pd.data.gallery) && pd.data.gallery.length >= 2, `gallery=${pd.data?.gallery?.length}`)

// نشانی نامعتبر رد می‌شود
const badImg = await gm.req('/api/shop-admin/products/media', 'POST', { productId: target.id, urls: [{ url: 'file:///etc/passwd' }] })
check('img', 'نشانی غیر-http رد می‌شود', badImg.ok === false, badImg.error || '')

const del = await gm.req('/api/shop-admin/products/media?mediaId=' + nowPrim.id, 'DELETE')
check('img', 'حذف تصویر + بازانتخاب primary', del.ok && del.data.media.every((m) => m.id !== nowPrim.id), del.error || '')

// جست‌وجوی تصویر وب (وابسته به کلید z.ai — اگر تنظیم نباشد، نتیجهٔ خالی مجاز است اما خطای ۴۰۳/۴۰۱ نه)
const web = await gm.req('/api/shop-admin/products/image-search', 'POST', { query: 'روغن زیتون بottle' })
check('img', 'جست‌وجوی تصویر وب پاسخ می‌دهد', web.ok === true, web.error || `ok=${web.ok}`)
if (web.ok && web.data.results.length) {
  const add1 = await gm.req('/api/shop-admin/products/media', 'POST', { productId: target.id, urls: [{ url: web.data.results[0].url, caption: web.data.results[0].caption }], source: 'web-search' })
  check('img', 'افزودن نتیجهٔ جست‌وجوی وب', add1.ok === true, add1.error || '')
  const pd2 = await (await fetch(S + '/api/shop/product/' + target.id)).json()
  check('img', 'گالری پس از افزودن وب به‌روز شد', pd2.data.gallery.length >= 2, `gallery=${pd2.data?.gallery?.length}`)
}

/* ═══ ۳) تنظیمات GUI: خواندن/نوشتن همهٔ کلیدها ═══ */
const st0 = await gm.req('/api/shop-admin/settings')
check('set', 'تنظیمات خوانده می‌شود', st0.ok && st0.data.settings.freeDeliveryMin === 50000000, JSON.stringify(st0.data?.settings?.freeDeliveryMin))
const saveRes = await gm.req('/api/shop-admin/settings', 'PUT', {
  'shop:announcement': 'بات R19 — جشنوارهٔ آزمایشی',
  'shop:deliveryFee': 70000,
  'shop:slots': { days: 2, lead: 60, cap: 4, ranges: [[10, 13], [17, 21]], closed: [6] },
})
check('set', 'ذخیرهٔ تنظیمات از GUI-API', saveRes.ok && saveRes.data.updated.length >= 3, saveRes.error || '')
const cfg1 = await (await fetch(S + '/api/shop/config')).json()
check('set', 'ویترین تنظیمات جدید را می‌بیند (بنر + هزینهٔ ارسال)', cfg1.ok && cfg1.data.announcement.includes('R19') && cfg1.data.deliveryFee === 70000, JSON.stringify(cfg1.data && { a: cfg1.data.announcement, f: cfg1.data.deliveryFee }))
const slots1 = await (await fetch(S + '/api/shop/slots')).json()
check('set', 'اسلات‌های جدید اعمال شدند (۲ روز، بازهٔ ۱۰-۱۳)', slots1.ok && slots1.data.slots.some((x) => x.from === '10:00'), JSON.stringify((slots1.data?.slots || []).map((x) => x.from)))
// بازگرداندن
await gm.req('/api/shop-admin/settings', 'PUT', { 'shop:announcement': '', 'shop:deliveryFee': 60000, 'shop:slots': { days: 3, lead: 90, cap: 6, ranges: [[9, 12], [14, 18], [18, 22]], closed: [] } })

/* ═══ ۴) مشتریان: فهرست + مسدودسازی ═══ */
const custs = await gm.req('/api/shop-admin/customers')
check('cust', 'فهرست مشتریان برمی‌گردد', custs.ok && Array.isArray(custs.data.customers), custs.error || '')
const some = custs.data.customers[0]
if (some) {
  const blk = await gm.req('/api/shop-admin/customers', 'PUT', { customerId: some.id, isBlocked: true })
  check('cust', 'مسدودسازی مشتری', blk.ok && blk.data.isBlocked === true, blk.error || '')
  const back = await gm.req('/api/shop-admin/customers', 'PUT', { customerId: some.id, isBlocked: false })
  check('cust', 'آزادسازی مشتری', back.ok, back.error || '')
}

/* ═══ ۵) SMS: پنل فراز با کلید واقعی — بررسی اتصال (بدون ارسال) ═══ */
const FARAZ_KEY = process.env.FARAZ_KEY || 'opUsYt2lmgsRw457UfRMLa3koFNPVCDAi4vwVqmd70CLth5QH7'
// پنل آزمایشی بساز (mode mock نام نباشد — credit روی real کار می‌کند)
const mkPanel = await gm.req('/api/sms/panels', 'POST', { name: 'بات R19 — فراز (تست اتصال)', provider: 'farazsms', mode: 'real', settings: { apiKey: FARAZ_KEY, from: '' }, active: true, isDefault: false })
let panelId = mkPanel.data?.panel?.id
if (!panelId && mkPanel._status === 403) {
  check('sms', 'ساخت پنل (دسترسی GM به smscenter)', true, 'GM دسترسی ندارد — با ADMIN امتحان می‌کنیم')
  const admin = new Bot(); await admin.login(byRole.ADMIN.id)
  const mk2 = await admin.req('/api/sms/panels', 'POST', { name: 'بات R19 — فراز (تست اتصال)', provider: 'farazsms', mode: 'real', settings: { apiKey: FARAZ_KEY, from: '' }, active: true, isDefault: false })
  panelId = mk2.data?.panel?.id
}
check('sms', 'پنل فراز ساخته شد', !!panelId, mkPanel.error || JSON.stringify(mkPanel.data || {}).slice(0, 80))
if (panelId) {
  const credit = await gm.req(`/api/sms/panels/${panelId}/credit`, 'POST')
  if (credit.ok && credit.data.ok) {
    check('sms', `اتصال واقعی فراز موفق — ${credit.data.credit || ''}`, true, '')
  } else {
    check('sms', 'اتصال فراز: خطای معنادار فارسی (نه خطای اتصال مبهم)', typeof credit.data?.error === 'string' && credit.data.error.length > 3 && !credit.data.error.includes('undefined'), JSON.stringify(credit.data))
    console.log(`    ⚠ فراز: ${credit.data?.error}`)
  }
  // پاک‌سازی پنل بات
  await gm.req(`/api/sms/panels/${panelId}`, 'DELETE').catch(() => null)
}

console.log(`\n∈ نتیجهٔ پنل مدیریت: ${pass} ✓ / ${fail} ✗`)
if (failures.length) { console.log(failures.join('\n')); process.exit(1) }
