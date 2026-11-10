/**
 * F9 smoke test — docHTML in Node (no DOM).
 * Stubs the hz: bridge modules, requires the esbuild bundle, generates all kinds,
 * asserts markers + cross-checks the jalali port against the app's src/lib/jalali.ts.
 */
const path = require('path')
const Module = require('module')
const fs = require('fs')

/* ── stub hz:* modules (the bundle leaves them as require('hz:jsx') etc.) ── */
const STUB = '/tmp/hz-stub.js'
fs.writeFileSync(STUB, `
const noop = () => {}
const ReactLike = { useState: () => [null, noop], useEffect: noop, useMemo: (f) => f(), useRef: () => ({}), useCallback: (f) => f }
module.exports = {
  default: ReactLike,
  ...ReactLike,
  jsx: (t, p) => ({ t, p }), jsxs: (t, p) => ({ t, p }), Fragment: 'frag',
}
`)
const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  if (typeof request === 'string' && request.startsWith('hz:')) return STUB
  return origResolve.call(this, request, ...args)
}

const docs = require('/tmp/docs-test.js')
let pass = 0, fail = 0
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('  ✗ ' + msg) } }
function has(h, s, msg) { ok(h.includes(s), (msg || 'missing') + ' — looking for: ' + JSON.stringify(String(s).slice(0, 70))) }
function toFaStr(n) { return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]) }

async function main() {
  /* ── jalali cross-check against the app's real implementation ──
     (app parseJalali expects SLASH format; app dateToJalali shifts to Tehran) */
  const { execSync } = require('child_process')
  execSync('bunx esbuild src/lib/jalali.ts --bundle --format=cjs --outfile=/tmp/app-jalali.js', { cwd: '/home/z/my-project', stdio: 'pipe' })
  const app = require('/tmp/app-jalali.js')
  const slash = (s) => s.replace(/-/g, '/')
  /* algorithm equivalence sweep incl. leap-year edges — my port renders dates
     that must exactly match the app's jalaliToDate/weekday for each sample */
  const samples = ['1405-07-27', '1405-07-25', '1404-01-01', '1403-12-29', '1403-12-30', '1406-06-15', '1400-01-01', '1399-11-22', '1398-10-11', '1407-03-20']
  for (const s of samples) {
    const j = app.parseJalali(slash(s))
    if (!j) { ok(false, 'app parseJalali failed on ' + s); continue }
    const longApp = toFaStr(`${j.jd} ${app.JALALI_MONTHS[j.jm - 1]} ${j.jy}`)
    const wd = app.jalaliWeekdayName(slash(s))
    const h = docs.docHTML('cheque', { number: '123', dueDate: s, amount: 1000 })
    ok(h.includes(wd), `weekday(${s}) = ${wd} rendered in cheque doc`)
    ok(h.includes(longApp), `long date of ${s} = «${longApp}» rendered in cheque doc`)
  }
  /* app sanity: fixed anchors */
  ok(app.jalaliWeekdayName('1405/07/27') === 'دوشنبه', 'app sanity: 1405-07-27 is دوشنبه')
  ok(app.jalaliWeekdayName('1405/07/25') === 'شنبه', 'app sanity: 1405-07-25 is شنبه')
  /* today: letterhead renders now() — compare with app (Tehran) only informatively */
  const appJ = app.dateToJalali(new Date())
  const appLongFa = toFaStr(`${appJ.jd} ${app.JALALI_MONTHS[appJ.jm - 1]} ${appJ.jy}`)
  const html0 = docs.docHTML('order', { code: 'X' })
  if (!html0.includes(appLongFa)) console.log(`  ℹ today differs from Tehran-shifted app value (${appLongFa}) — sandbox TZ is ${Intl.DateTimeFormat().resolvedOptions().timeZone}; production browsers run in Iran TZ`)

  /* ── common markers on every doc ── */
  const common = (h, name) => {
    has(h, '<!DOCTYPE html>', name + ': doctype')
    has(h, 'dir="rtl"', name + ': rtl')
    has(h, 'lang="fa"', name + ': fa')
    has(h, 'هایپر زیتون', name + ': brand')
    has(h, 'فروشگاه زنجیره‌ای — رفسنجان', name + ': sub-brand')
    has(h, '/fonts/Vazirmatn-Regular.woff2', name + ': font face')
    has(h, 'سامانهٔ سررسید (SarResid)', name + ': footer')
    has(h, '@page{margin:12mm}', name + ': page margin')
    has(h, '@media print', name + ': print css')
    has(h, '.no-print{display:none}', name + ': no-print rule')
    ok(!h.includes('undefined'), name + ': no stray undefined')
    ok(!h.includes('NaN'), name + ': no NaN')
  }

  /* 1. return A4 */
  const ret = docs.docHTML('return', {
    code: 'HZ-050723-0001',
    customerName: 'زهرا <محمودی>', customerPhone: '09131234567', customerCardNumber: '6219861012345678',
    purchaseAt: '1405-07-20', settleType: 'partial', status: 'pending',
    cashierName: 'کیانوش لطفی',
    items: [
      { name: 'روغن سرخ‌کردنی ۱.۳۵ لیتری', barcode: '6260100123456', qty: 2, unit: 'عدد', unitPrice: 148000, lineTotal: 296000 },
      { name: 'پنیر لیقوان ۴۰۰ گرمی', barcode: '20001234', qty: 1, unit: 'بسته', unitPrice: 92000, lineTotal: 92000 },
    ],
    totalAmount: 388000, exchangeValue: 150000, transferAmount: 238000,
    reason: 'نزدیک به تاریخ انقضا', transferNote: 'واریز به کارت بانکی مشتری',
  })
  common(ret, 'return')
  has(ret, 'رسید مرجوعی کالا', 'return: title')
  has(ret, 'HZ-050723-0001', 'return: code')
  has(ret, '****-****', 'return: card mask stars')
  has(ret, '۶۲۱۹-****-****-۵۶۷۸', 'return: masked card digits')
  has(ret, 'زهرا &lt;محمودی&gt;', 'return: html-escaped name')
  has(ret, '۲۹۶,۰۰۰', 'return: line total money')
  has(ret, '۳۸۸,۰۰۰', 'return: items total')
  has(ret, '۲۳۸,۰۰۰', 'return: transfer money')
  has(ret, 'دویست و سی و هشت هزار ریال', 'return: transfer words (ریال)')
  has(ret, 'بیست و سه هزار و هشتصد تومان', 'return: transfer words (تومان)')
  has(ret, 'تسویه جزئی', 'return: settle label')
  has(ret, 'در انتظار تأیید', 'return: status label')
  has(ret, 'امضای مشتری', 'return: customer signature')
  has(ret, 'سر رسید', 'return: watermark text')
  has(ret, '<table', 'return: table')
  has(ret, 'کد پیگیری مرجوعی', 'return: tracking label')
  has(ret, 'محل مهر و امضای فروشگاه', 'return: stamp box')

  /* 2. return-thermal */
  const th = docs.docHTML('return-thermal', {
    code: 'HZ-050723-0002', customerName: 'علی رضایی', settleType: 'exchange', status: 'approved',
    items: [{ name: 'شیر پرچرب ۱ لیتری', qty: 3, unitPrice: 48000, lineTotal: 144000 }],
    totalAmount: 144000, exchangeValue: 144000, transferAmount: 0, cashierName: 'مولایی',
  })
  common(th, 'return-thermal')
  has(th, 'width:80mm', 'thermal: 80mm sheet')
  has(th, 'رسید مرجوعی کالا', 'thermal: title')
  has(th, '۱۴۴,۰۰۰', 'thermal: total')
  has(th, 'تسویه با کالای جایگزین', 'thermal: settle label')
  has(th, 'صندوکار', 'thermal: cashier label')
  has(th, 'مولایی', 'thermal: cashier name')
  ok(!th.includes('class="wm"'), 'thermal: no watermark')

  /* 3. order */
  const ord = docs.docHTML('order', {
    code: 'HZ-ORD-014', supplierName: 'بیژن صنعت (پخش روز)', supplierPhone: '02112345678', supplierBalance: 150000,
    deliveryDate: '1405-08-05', payMethod: 'CHEQUE', status: 'APPROVED', authorName: 'کیانوش لطفی',
    items: [
      { name: 'تن ماهی ۱۸۰ گرمی', barcode: '6260098765432', qty: 24, cartonQty: 2, unitsPerCarton: 12, unitBuyPrice: 310000, lineTotal: 24 * 310000 },
      { name: 'رب گوجه ۸۰۰ گرمی', barcode: '6260011122233', qty: 6, cartonQty: 0, unitsPerCarton: 0, unitBuyPrice: 88000, lineTotal: 6 * 88000 },
    ],
    totalAmount: 24 * 310000 + 6 * 88000, note: 'تحویل با بارکدخوان انبار',
  })
  common(ord, 'order')
  has(ord, 'سفارش خرید کالا', 'order: title')
  has(ord, 'HZ-ORD-014', 'order: code')
  has(ord, 'بیژن صنعت', 'order: supplier')
  has(ord, 'بدهی به تأمین‌کننده', 'order: balance chip')
  has(ord, '۱۵۰,۰۰۰', 'order: balance value')
  has(ord, 'چک', 'order: pay method label')
  has(ord, 'تأییدشده (آمادهٔ دریافت)', 'order: status')
  has(ord, 'مهر و امضای تأمین‌کننده', 'order: supplier signature')
  has(ord, toFaStr('7,968,000'), 'order: total money')
  has(ord, 'هفت میلیون و نهصد و شصت و هشت هزار ریال', 'order: total words')

  /* 4. cheque */
  const chq = docs.docHTML('cheque', {
    number: '880245', sayadSerial: 'SA-998877', bankName: 'بانک ملی', amount: 450000000,
    dueDate: '1405-08-12', recipient: 'پخش برادران صفری', orderCode: 'HZ-ORD-014',
    status: 'PENDING_OWNER', isOff: true, offReason: 'جمعه', authorName: 'دارویشی',
  })
  common(chq, 'cheque')
  has(chq, 'اطلاع‌نامهٔ چک', 'cheque: title')
  has(chq, '۴۵۰,۰۰۰,۰۰۰', 'cheque: amount money')
  has(chq, 'چهارصد و پنجاه میلیون ریال', 'cheque: amount words')
  has(chq, 'چهل و پنج میلیون تومان', 'cheque: toman words')
  has(chq, 'هشدار تعطیلی', 'cheque: holiday warning')
  has(chq, 'پیش از سررسید', 'cheque: provision note')
  has(chq, 'در انتظار امضا', 'cheque: status')
  has(chq, 'سریال ساید', 'cheque: sayad label')

  /* 5. handover */
  const hov = docs.docHTML('handover', {
    date: '1405-07-27', shift: 'EVENING', authorName: 'کیانوش لطفی', handoverTo: 'علی مولایی',
    cashCounted: 4825000, cashExpected: 4800000, posTotal: 12750000, cardTotal: 980000, chequesCollected: 4500000,
    pendingDeliveries: ['بیژن صنعت — تن ماهی', 'رب گوجه — پخش روز'],
    priceChangeNotes: ['روغن: +۸,۰۰۰ ریال'],
    staffNotes: [{ staffName: 'رضا کاظمی', note: 'مرخصی ساعتی ساعت ۱۶ تا ۱۷' }],
    problemsCarried: [{ title: 'یخچال شماره ۳ خنک نمی‌کند', severity: 'urgent', status: 'IN_PROGRESS' }],
    tasksForNext: [{ text: 'شمارش قفسه آجیل', assigneeName: 'مولایی' }],
    notes: 'صندوق نقد سالم؛ درب ورودی میلهٔ کوچک دارد.',
    metrics: { returnsToday: 3, returnsPending: 1, lowStockCount: 7, ordersWaiting: 4, chequesThisWeek: 2, tasksOpen: 12, tasksOverdue: 2, problemsOpen: 5, morningChecksFlagged: 1 },
  })
  common(hov, 'handover')
  has(hov, 'گزارش تحویل شیفت', 'handover: title')
  has(hov, 'شیفت عصر', 'handover: shift label')
  has(hov, '۴,۸۲۵,۰۰۰', 'handover: cash counted')
  has(hov, '۲۵,۰۰۰', 'handover: diff money')
  has(hov, 'مرجوعی‌های امروز', 'handover: metric label')
  has(hov, 'یخچال شماره ۳', 'handover: problem row')
  has(hov, 'فوری', 'handover: severity label')
  has(hov, 'در حال بررسی', 'handover: problem status')
  has(hov, 'هنوز توسط تحویل‌گیرنده تأیید نشده', 'handover: unacked warning')

  /* 6. performance */
  const perf = docs.docHTML('performance', {
    staffName: 'رضا کاظمی', honorific: 'جناب آقا', roleLabel: 'کارشناس چیدمان', period: 'مهر ۱۴۰۵', periodType: 'MONTHLY',
    total: 87.4, grade: 'B',
    criteria: [
      { key: 'task', score: 92 }, { key: 'section', score: 85 }, { key: 'checklist', score: 78 },
      { key: 'attendance', score: 95 }, { key: 'zoneCount', score: 80 }, { key: 'extra', score: 70 },
    ],
    managerNote: 'روند رو به بهبود؛ نظم چیدمان مثال‌زدنی است.',
    authorName: 'علی مولایی',
  })
  common(perf, 'performance')
  has(perf, 'کارنامهٔ عملکرد', 'performance: title')
  has(perf, '۸۷٫۴', 'performance: composite decimal')
  has(perf, 'رتبه: ب', 'performance: grade chip')
  has(perf, 'انجام دستور کار', 'performance: default criteria label')
  has(perf, '۳۵٪', 'performance: weight pct')
  has(perf, '۳۲٫۲', 'performance: weighted share 0.35×92')
  has(perf, 'جمع وزن‌ها', 'performance: weights row')
  has(perf, 'پیشنهاد پاداش', 'performance: research legend')
  has(perf, 'دیدگاه مدیر', 'performance: manager note')

  /* 7. problems */
  const prb = docs.docHTML('problems', {
    from: '1405-07-01', to: '1405-07-28', shift: 'EVENING', category: 'cleaning',
    items: [
      { title: 'نشتی آب در بخش صدفی', category: 'cleaning', severity: 'high', location: 'قفسه آجیل و تخمه', status: 'OPEN', assigneeName: 'رضا کاظمی', dueDate: '1405-06-01' },
      { title: 'لامپ سوخته راهرو', category: 'equipment', severity: 'low', location: 'انبار', status: 'RESOLVED', assigneeName: 'مولایی' },
    ],
    stats: { open: 1, inProgress: 0, resolved: 1, byCategory: { cleaning: 1, equipment: 1 } },
    authorName: 'مولایی',
  })
  common(prb, 'problems')
  has(prb, 'فهرست مشکلات', 'problems: title')
  has(prb, 'باز: ۱', 'problems: open chip')
  has(prb, 'نشتی آب', 'problems: item title')
  has(prb, 'قفسه آجیل و تخمه', 'problems: location')
  has(prb, toFaStr('1405-06-01'), 'problems: due date shown')

  /* 8. stockcount */
  const sc = docs.docHTML('stockcount', {
    date: '1405-07-27', scheduledFor: '1405-07-25', blockLabel: 'گوندولا ۱ — روی شرقی', zoneName: 'خشک',
    staffName: 'رضا کاظمی', status: 'MISMATCH', itemsCounted: 3, mismatches: 1,
    items: [
      { name: 'چای احمد ۵۰۰ گرمی', barcode: '626000111', systemQty: 18, countedQty: 18, diff: 0 },
      { name: 'شکر قند ۹۰۰ گرمی', barcode: '626000222', systemQty: 25, countedQty: 23, diff: -2 },
      { name: 'برنج طارم ۵ کیلویی', systemQty: 10, countedQty: 12, diff: 2 },
    ],
    note: 'شکر در انبار میانی جا مانده بود.',
  })
  common(sc, 'stockcount')
  has(sc, 'گزارش انبارگردانی', 'stockcount: title')
  has(sc, 'گوندولا ۱ — روی شرقی', 'stockcount: block label')
  has(sc, '−۲', 'stockcount: negative diff')
  has(sc, '+۲', 'stockcount: positive diff')
  has(sc, 'دارای مغایرت', 'stockcount: status')
  has(sc, 'درصد تطابق', 'stockcount: match pct label')
  has(sc, '۶۷٪', 'stockcount: 2/3 match pct')

  /* partial-data docs: no throw, em-dash, no leaks */
  for (const k of ['return', 'order', 'cheque', 'handover', 'performance', 'problems', 'stockcount', 'return-thermal']) {
    let h = null, err = null
    try { h = docs.docHTML(k, {}) } catch (e) { err = e }
    ok(!err, k + ': empty data no throw' + (err ? ' — ' + err.message : ''))
    if (h) { ok(h.includes('—'), k + ': shows em-dash for missing'); ok(!h.includes('undefined'), k + ': no undefined leak'); ok(!h.includes('NaN'), k + ': no NaN leak') }
  }
  /* unknown kind throws Persian error */
  let threw = null
  try { docs.docHTML('nope', {}) } catch (e) { threw = e }
  ok(threw && /نوع سند/.test(threw.message), 'unknown kind → Persian error')

  /* exports sanity */
  ok(typeof docs.printDoc === 'function', 'printDoc exported')
  ok(typeof docs.DocPreview === 'function', 'DocPreview exported')
  ok(typeof docs.returnDocHTML === 'function' && typeof docs.stockcountDocHTML === 'function', 'builders exported')
  ok(typeof docs.DOC_TITLES === 'object' && docs.DOC_TITLES.return === 'رسید مرجوعی کالا', 'DOC_TITLES exported')

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
