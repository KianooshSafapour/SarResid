/** R16 — بات‌ها: درخواست‌ها + تحلیل شیفت + دسترسی مدیر کل + دستیار/پایش GM */
const B = process.env.BOT_BASE_URL || 'http://localhost:3000'
let pass = 0, fail = 0
const failures = []
const check = (s, n, c, e = '') => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; failures.push(`${s}::${n} ${e}`); console.log(`  ✗ ${n} ${e}`) } }
class Bot { constructor() { this.cookie = '' }
  async login(id) { return this.req('/api/auth/login', 'POST', { userId: id, mode: 'pin', value: '1234' }) }
  async req(p, m = 'GET', b = null) {
    const r = await fetch(B + p, { method: m, headers: { 'content-type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}) }, body: b ? JSON.stringify(b) : undefined })
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0]
    const j = await r.json().catch(() => ({ ok: false })); j._status = r.status; return j
  } }
const roster = await (await fetch(B + '/api/auth/roster')).json()
const byRole = {}; for (const u of roster.data.users) byRole[u.role] = u
const gm = new Bot(); await gm.login(byRole.GM.id)
const sk = new Bot(); await sk.login(byRole.SK.id)
const acc = new Bot(); await acc.login(byRole.ACC.id)
console.log('∈ ۳ ربات: مدیرکل/انباردار/حسابدار')

/* GM full access */
const mon = await gm.req('/api/system/monitor')
check('gm', 'مدیر کل: پایش سرور', mon.ok, mon.error || '')
const ai = await gm.req('/api/ai/settings')
check('gm', 'مدیر کل: تنظیمات دستیار', ai.ok, mon.error || '')

/* درخواست‌ها */
const c = await sk.req('/api/requests', 'POST', { kind: 'NEW_PRODUCT', title: 'بات R16 — لیمو ترش ژله‌ای برای قفسه ۳', body: 'مشتری‌ها پرسیدند', priority: 'HIGH' })
check('req', 'کارمند درخواست ثبت کرد', c.ok && /^REQ-/.test(c.data?.code || ''), c.error || '')
const accTry = await acc.req('/api/requests', 'PATCH', { id: c.data?.id, action: 'approve' })
check('req', 'حسابدار نمی‌تواند گردش‌کار را جلو ببرد (۴۰۳)', accTry.ok === false && accTry._status === 403)
const seen = await gm.req('/api/requests', 'PATCH', { id: c.data?.id, action: 'seen' })
check('req', 'مدیر کل: دیده‌شد', seen.ok)
const done = await gm.req('/api/requests', 'PATCH', { id: c.data?.id, action: 'done', note: 'خرید شد و در انبار رسید' })
check('req', 'مدیر کل: انجام با توضیح', done.ok && done.data?.status === 'DONE')
const list = await sk.req('/api/requests?mine=1')
const mine = (list.data?.requests || []).find((r) => r.id === c.data?.id)
check('req', 'کارمند ردپای کامل را می‌بیند (create+seen+done)', mine && mine.history?.length >= 3 && mine.status === 'DONE')
const short = await sk.req('/api/requests', 'POST', { kind: 'OTHER', title: 'خ' })
check('req', 'عنوان کوتاه رد می‌شود', short.ok === false)

/* تحلیل شیفت */
const sh = await gm.req('/api/analytics/shifts')
check('shift', 'تحلیل شیفت: امروز/ساعتی/هفتگی', sh.ok && sh.data?.today?.M && Array.isArray(sh.data?.hourly) && sh.data?.week?.length === 7 && 'countPct' in sh.data.compare)

console.log(`\n════ R16: PASS ${pass} · FAIL ${fail}`)
if (fail) { failures.forEach((f) => console.log('  ✗ ' + f)); process.exit(1) }
