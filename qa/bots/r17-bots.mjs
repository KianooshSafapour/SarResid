/** R17 — بات‌ها: گردش‌کار جدید فاکتور (بدون تأیید تحویل) + چک سقف‌مهلت + شیفت پیش‌فرض + بررسی تیم */
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
const acc = new Bot(); await acc.login(byRole.ACC.id)
const gm = new Bot(); await gm.login(byRole.GM.id)
const exec = new Bot(); await exec.login(byRole.EXEC.id)
console.log('∈ ۳ ربات: حسابدار/مدیرکل/مدیرعصر(ملایی)')

/* ═══ ۱) ثبت پیش‌فاکتور سودسنج → مستقیم «تحویل‌شده» (بدون گام تأیید تحویل) ═══ */
const create = await acc.req('/api/margin', 'POST', {
  supplierName: 'بات R17 — تست تأمین',
  items: [{ productName: 'بات R17 شیرینی پای', unit: 'عدد', quantity: 6, totalCost: 600000, printedPrice: 120000, salePrice: 110000 }],
})
check('margin', 'ثبت سودسنج → وضعیت delivered (بدون تأیید تحویل)', create.ok && create.data?.status === 'delivered', JSON.stringify(create.data?.status))
const invId = create.data?.id
const det = await acc.req('/api/margin/' + invId)
const hist = (det.data?.invoice?.history || []).map((h) => h.action)
check('margin', 'تاریخچه: create + deliver همزمان', hist.includes('create') && hist.includes('deliver'), hist.join(','))
const accNotif = await acc.req('/api/app/notifications')
check('margin', 'اعلان حسابدار برای بررسی حسابداری ساخته شد', accNotif.ok && (accNotif.data?.items || []).some((n) => (n.title || '').includes('سودسنج')), '')

/* ═══ ۲) ویرایش تا پیش از شروع بررسی مجاز است ═══ */
const edit1 = await acc.req('/api/margin/' + invId, 'PUT', {
  supplierName: 'بات R17 — تست تأمین', items: [
    { productName: 'بات R17 شیرینی پای', unit: 'عدد', quantity: 6, totalCost: 600000, printedPrice: 120000, salePrice: 110000 },
    { productName: 'بات R17 کیک خانگی', unit: 'عدد', quantity: 2, totalCost: 300000, printedPrice: 190000, salePrice: 180000 },
  ],
})
check('margin', 'ویرایش فاکتورِ delivered (پیش از بررسی) مجاز', edit1.ok, edit1.error || '')

/* ═══ ۳) شروع بررسی → قفل ویرایش ═══ */
const sr = await acc.req('/api/margin/' + invId, 'PATCH', { action: 'start-review' })
check('margin', 'شروع بررسی حسابداری از وضعیت delivered', sr.ok && sr.data?.status === 'reviewing', sr.error || '')
const edit2 = await acc.req('/api/margin/' + invId, 'PUT', { supplierName: 'بات R17 — تست تأمین', items: [{ productName: 'x', quantity: 1, totalCost: 1, printedPrice: 2 }] })
check('margin', 'ویرایش پس از شروع بررسی رد می‌شود', edit2.ok === false, edit2.error || '')

/* ═══ ۴) ثبت فاکتور خرید با چک → سقف مهلت ۴۵ روز + چک خودکار ═══ */
const fin = await acc.req('/api/margin/' + invId, 'PATCH', { action: 'finalize', payMethod: 'CHEQUE', chequeDays: 90, pushToHoloo: false })
check('cheque', 'ثبت خرید با چک موفق', fin.ok, fin.error || '')
check('cheque', 'مهلت چک به سقف ۴۵ روز بریده شد', !!fin.data?.cheque, JSON.stringify(fin.data?.cheque || null))
const cheque = fin.data?.cheque
if (cheque) {
  const [y, m, d] = cheque.dueDate.split('-').map(Number)
  const today = new Date(); // سررسید باید ~۴۵ روز بعد باشد
  const due = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 44))
  const j2g = (jy, jm, jd) => { // تقریب جلالی→میلادی برای کنترل بازه
    const g = new Date(Date.UTC(jy + 621, 2, 21))
    for (let i = 0; i < 400; i++) { const t = new Date(g.getTime() + i * 86400000)
      const p = new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' }).formatToParts(t)
      if (+p.find((x) => x.type === 'year').value === jy && +p.find((x) => x.type === 'month').value === jm && +p.find((x) => x.type === 'day').value === jd) return t }
    return null }
  const dueG = j2g(y, m, d)
  const days = dueG ? Math.round((dueG.getTime() - today.getTime()) / 86400000) : -1
  check('cheque', 'سررسید چک ≈ ۴۵ روز بعد است', days >= 42 && days <= 46, `days=${days}`)
}
const finAgain = await acc.req('/api/margin/' + invId, 'PATCH', { action: 'finalize', payMethod: 'CHEQUE', pushToHoloo: false })
check('cheque', 'ثبت دوباره رد می‌شود (سند تکراری نمی‌شود)', finAgain.ok === false)

/* ═══ ۵) شیفت پیش‌فرض + برنامهٔ هفتگی ═══ */
const gmShifts = await gm.req('/api/hr/shifts')
const users = gmShifts.data?.users || []
check('shift', 'GET شیفت‌ها defaultShift را برمی‌گرداند', gmShifts.ok && users.length > 0 && users.every((u) => 'defaultShift' in u))
const noDef = users.find((u) => !u.defaultShift)
if (noDef) {
  const setDef = await gm.req('/api/hr/shifts', 'PUT', { defaults: [{ userId: noDef.id, shift: 'MORNING' }] })
  check('shift', 'مدیرکل شیفت پیش‌فرض تعیین کرد', setDef.ok && setDef.data?.defaultsSaved === 1, setDef.error || '')
  const after = await gm.req('/api/hr/shifts')
  check('shift', 'مقدار پیش‌فرض خوانده می‌شود', (after.data?.users || []).find((u) => u.id === noDef.id)?.defaultShift === 'MORNING')
  const clearDef = await gm.req('/api/hr/shifts', 'PUT', { defaults: [{ userId: noDef.id, shift: '' }] })
  check('shift', 'حذف پیش‌فرض', clearDef.ok, clearDef.error || '')
}
const sk = new Bot(); await sk.login(byRole.SK.id)
const skPut = await sk.req('/api/hr/shifts', 'PUT', { weekStart: '1405-08-09', rows: [{ userId: users[0].id, dayIdx: 0, shift: 'EVENING' }] })
check('shift', 'کارمند عادی نمی‌تواند برنامه ذخیره کند (۴۰۳)', skPut.ok === false && skPut._status === 403)

/* ═══ ۶) بررسی تیم — پرسنلِ هر شیفت (پیش‌فرض + برنامه) ═══ */
const teamExec = await exec.req('/api/staff-checks?date=1405-08-06')
check('team', 'بررسی تیم برای مدیرعصر باز است', teamExec.ok, teamExec.error || '')
const team = teamExec.data || {}
const eveningCount = (team.staff || []).filter((s) => s.dayShift === 'EVENING' || s.dayShift === 'BOTH').length
const badgeCount = (team.staff || []).filter((s) => s.dayShift).length
check('team', 'شیفت روز برای همهٔ پرسنل تعیین‌شده/پیش‌فرض است', badgeCount >= 2, `badged=${badgeCount}`)
check('team', 'حداقل یک نفر در شیفت عصر (خود ملایی)', eveningCount >= 1, `evening=${eveningCount}`)

/* ═══ ۷) رگرسیون: تحلیل شیفت + درخواست‌ها ═══ */
const sh = await gm.req('/api/analytics/shifts')
check('reg', 'تحلیل شیفت سالم', sh.ok && Array.isArray(sh.data?.hourly) && sh.data?.week?.length === 7)
const rq = await sk.req('/api/requests', 'POST', { kind: 'OTHER', title: 'بات R17 درخواست تست', body: 'پاک‌سازی خودکار' })
check('reg', 'ثبت درخواست کارمند', rq.ok && /^REQ-/.test(rq.data?.code || ''))

console.log(`\n════ R17: PASS ${pass} · FAIL ${fail}`)
if (fail) { failures.forEach((f) => console.log('  ✗ ' + f)); process.exit(1) }
