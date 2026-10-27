/** R15 — ربات‌های پذیرش: دسترسی همه‌کارکنان + آمار سود حسابدار + CRM + ردیف ساختاری + شاخص خدمت */
const B = process.env.BOT_BASE_URL || 'http://localhost:3000'
let pass = 0, fail = 0
const failures = []
const check = (s, n, c, e = '') => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; failures.push(`${s}::${n} ${e}`); console.log(`  ✗ ${n} ${e}`) } }
class Bot {
  constructor() { this.cookie = '' }
  async login(id) { const r = await this.req('/api/auth/login', 'POST', { userId: id, mode: 'pin', value: '1234' }); return r }
  async req(p, m = 'GET', b = null) {
    const r = await fetch(B + p, { method: m, headers: { 'content-type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}) }, body: b ? JSON.stringify(b) : undefined })
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0]
    const j = await r.json().catch(() => ({ ok: false })); j._status = r.status; return j
  }
}
const roster = await (await fetch(B + '/api/auth/roster')).json()
const byRole = {}; for (const u of roster.data.users) byRole[u.role] = u
const acc = new Bot(); await acc.login(byRole.ACC.id)
const sales = new Bot(); await sales.login(byRole.SALES.id)
const admin = new Bot(); await admin.login(byRole.ADMIN.id)
console.log('∈ ۳ ربات: حسابدار/فروشنده/ادمین')

/* ۱ — حسابدار: آمار سود + انبار */
const stats = await acc.req('/api/margin/stats')
check('acc', 'آمار و تحلیل سود برای حسابدار باز است (رفع ۴۰۳ کلید قدیمی)', stats.ok, stats.error || '')
check('acc', 'توزیع درصد واقعی + آستانه‌ها', stats.ok && stats.data.thresholds?.red === 12 && 'lowMargin' in stats.data)
const orders = await acc.req('/api/orders')
check('acc', 'حسابدار سفارش‌ها (انبار) را می‌بیند', orders.ok, orders.error || '')

/* ۲ — فروشنده (عاطفه): صفحات انبارِ باز */
const ordSales = await sales.req('/api/orders')
check('sales', 'فروشنده به سفارش‌ها (گیت *) دسترسی دارد', ordSales.ok, ordSales.error || '')

/* ۳ — CRM: مرجوعی → مشتری + رویداد + دفترچه غنی */
const phone = '091' + String(Date.now()).slice(-8)
const ret = await acc.req('/api/returns', 'POST', {
  customerName: 'بات تست R15 مشتری', customerPhone: phone,
  items: [{ name: 'بات تست شیر', qty: 1, unit: 'عدد', unitPrice: 50000, lineTotal: 50000 }], reason: 'دیگر',
  exchangeValue: 0, transferAmount: 50000,
})
check('crm', 'مرجوعی ثبت شد', ret.ok, ret.error || '')
const nb = await acc.req('/api/return-customers?q=' + encodeURIComponent(phone))
const row = (nb.data?.items || []).find((x) => x.phone === phone)
check('crm', 'دفترچه مشتریان: ردیف با دادهٔ CRM (سطح + رویداد)', !!row && !!row.crm && row.crm.eventCount >= 1, JSON.stringify(row?.crm ?? ''))
const evMatch = row?.crm?.recentEvents?.some((ev) => ev.kind === 'return' && ev.content.includes('مرجوعی'))
check('crm', 'رویداد «مرجوعی» در خط زمانی CRM', !!evMatch)

/* ۴ — ردیف ساختاری انقضا (سمت + طبقه/ستون) */
const secs = await admin.req('/api/lane-checks')
const section = secs.data?.sections?.[0]?.label
if (section) {
  const lane = 'سمت چپ · طبقهٔ ۲ / ستون ۳'
  const post = await admin.req('/api/lane-checks', 'POST', { merchandiserId: byRole.MERCH?.id ?? byRole.SK.id, sectionLabel: section, lane, status: 'ok' })
  check('lane', 'ردیف ساختاری «سمت چپ · طبقهٔ ۲ / ستون ۳» پذیرفته شد', post.ok, post.error || '')
  const badLane = await admin.req('/api/lane-checks', 'POST', { merchandiserId: byRole.SK.id, sectionLabel: section, lane: 'ردیف خیالی', status: 'ok' })
  check('lane', 'ردیف نامعتبر همچنان رد می‌شود', badLane.ok === false)
}

/* ۵ — ارزیابی: شاخص خدمت جدید */
const blocks = await admin.req('/api/section-reviews')
if (blocks.ok) {
  const bl = blocks.data.blocks?.[0]?.label
  const staff = blocks.data.staff?.[0]
  const rv = await admin.req('/api/section-reviews', 'POST', { date: '1405-08-05', blockLabel: bl, staffId: staff?.id, dateScore: 4, layoutScore: 4, cleanScore: 5, labelScore: 4, serveScore: 5, note: 'بات R15' })
  check('review', 'ارزیابی ۵شاخصه (serveScore) ثبت شد', rv.ok, rv.error || '')
} else console.log('  (section-reviews دسترسی/بلوک نیست — صرف‌نظر)')

console.log(`\n════ R15: PASS ${pass} · FAIL ${fail}`)
if (fail) { failures.forEach((f) => console.log('  ✗ ' + f)); process.exit(1) }
