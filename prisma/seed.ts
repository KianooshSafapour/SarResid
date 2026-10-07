/**
 * Hyper Zeytoon — seed data
 * Run: bun run prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client'
import { toJalaali } from 'jalaali-js'

const db = new PrismaClient()

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (n: number, base = new Date()) => {
  const d = new Date(base)
  d.setDate(d.getDate() + n)
  return d
}
const at = (n: number, h = 9) => {
  const d = addDays(n)
  d.setHours(h, 0, 0, 0)
  return d
}

async function main() {
  console.log('Seeding Hyper Zeytoon…')

  // wipe (order matters)
  await db.activityLog.deleteMany()
  await db.award.deleteMany()
  await db.feedback.deleteMany()
  await db.note.deleteMany()
  await db.message.deleteMany()
  await db.wallPost.deleteMany()
  await db.preOrder.deleteMany()
  await db.briefingSnapshot.deleteMany()
  await db.customer.deleteMany()
  await db.customerRequest.deleteMany()
  await db.refillRequest.deleteMany()
  await db.planogram.deleteMany()
  await db.sOP.deleteMany()
  await db.task.deleteMany()
  await db.cheque.deleteMany()
  await db.orderItem.deleteMany()
  await db.order.deleteMany()
  await db.holiday.deleteMany()
  await db.product.deleteMany()
  await db.provider.deleteMany()
  await db.user.deleteMany()
  await db.setting.deleteMany()

  // ── Users ──────────────────────────────────────────────
  const users = [
    { name: 'جواد نوروزی', role: 'OWNER', color: '#7c5a1e', job: 'مالک' },
    { name: 'مینا لطفی', role: 'GM', color: '#0e7a4a', job: 'مدیر کل' },
    { name: 'کیانوش صفاپور', role: 'OM', color: '#8a5a2b', job: 'مدیر عملیات و فناوری' },
    { name: 'مریم درویشی', role: 'ACC', color: '#5b4a8a', job: 'حسابدار ارشد' },
    { name: 'زهرا محمدی', role: 'HC', color: '#a33d3d', job: 'سرصندوقدار' },
    { name: 'فاطمه شریفی', role: 'CASHIER', color: '#b0663a', job: 'صندوقدار ارشد' },
    { name: 'سارا عرب‌نژاد', role: 'CASHIER', color: '#9c6f1e', job: 'صندوقدار' },
    { name: 'حسن محمدی', role: 'SK', color: '#4e6e2f', job: 'سرپرست انبار' },
    { name: 'هستی ایران‌نژاد', role: 'SALES', color: '#207a63', job: 'مرچندایزر ارشد و تحویل‌گیر', secondary: ['RECEIVER', 'MERCH'] },
    { name: 'نگار یادگاری', role: 'SALES', color: '#8a2f5c', job: 'فروشنده' },
    { name: 'الهام سعدی', role: 'MERCH', color: '#2f6d8a', job: 'چیدمان و فروش', secondary: ['SALES'] },
    { name: 'مینا غلامحسینی', role: 'MERCH', color: '#5c7a1e', job: 'مسئول چیدمان' },
    { name: 'سمیرا میرزایی', role: 'MERCH', color: '#8a5c2f', job: 'مسئول چیدمان' },
    { name: 'نگین تقی‌زاده', role: 'MERCH', color: '#7a2050', job: 'مسئول چیدمان' },
    { name: 'امیرعلی علیخانی', role: 'MERCH', color: '#3a6e5c', job: 'مسئول چیدمان' },
    { name: 'سارا نوروزی', role: 'PM', color: '#946a1f', job: 'مدیر محصول' },
  ]
  const userRows: Record<string, any> = {}
  let i = 0
  for (const u of users) {
    const row = await db.user.create({
      data: {
        name: u.name,
        username: `user${i + 1}`,
        pin: '1234',
        role: u.role,
        secondaryRoles: JSON.stringify(u.secondary ?? []),
        color: u.color,
        points: [340, 520, 610, 280, 190, 210, 150, 300, 480, 260, 230, 170, 140, 160, 120, 400][i] ?? 100,
      },
    })
    userRows[u.name] = row
    i++
  }
  const U = (n: string) => userRows[n]

  // ── Providers ─────────────────────────────────────────
  const providers = [
    { name: 'پخش گلدیس کرمان', person: 'آقای رضایی', phone: '0913-1112233', type: 'DISTRIBUTOR', companies: ['گلدیس'], notes: 'تحویل صبح‌ها قبل ۹' },
    { name: 'کارخانه پگاه کرمان', person: 'آقای محمدی‌فر', phone: '0913-2223344', type: 'DIRECT', companies: ['پگاه'], notes: 'لبنیات تازه - پرداخت نقدی' },
    { name: 'پخش مهرام جنوب', person: 'خانم کاظمی', phone: '0913-3334455', type: 'DISTRIBUTOR', companies: ['مهرام', 'کاله'], notes: '' },
    { name: 'بازرگانی زرین (زر)', person: 'آقای شریفی', phone: '0913-4445566', type: 'DISTRIBUTOR', companies: ['زر ماکارون', 'تاک'], notes: 'بازدید دوشنبه‌ها' },
    { name: 'پخش سن‌ایچ زیتون', person: 'آقای دهقان', phone: '0913-5556677', type: 'VISITOR', companies: ['سن‌ایچ', 'چین‌چین'], notes: 'ویزیتور هفتگی' },
    { name: 'اتحادیه برنج و حبوبات کرمان', person: 'آقای قمصری', phone: '0913-6667788', type: 'DISTRIBUTOR', companies: ['دامن‌برنج', 'سمنان'], notes: '' },
  ]
  const provRows: { id: string; name: string }[] = []
  for (const p of providers) {
    provRows.push(await db.provider.create({
      data: { name: p.name, personName: p.person, phone: p.phone, type: p.type, companyNames: JSON.stringify(p.companies), notes: p.notes },
    }))
  }
  const P = (n: string) => provRows.find(p => p.name === n)!

  // ── Products ──────────────────────────────────────────
  const products = [
    ['شیر پرچرب پگاه ۱ لیتری', '6260100000018', 'پگاه', 'لبنیات', 'عدد', 38000, 49000, 96, 24, P('کارخانه پگاه کرمان').id],
    ['شیر کم‌چرب پگاه ۵۰۰ میلی‌لیتر', '6260100000025', 'پگاه', 'لبنیات', 'عدد', 21000, 27500, 48, 24, P('کارخانه پگاه کرمان').id],
    ['شیرکاکائو ۲/۵ لیتر پگاه ۳٪', '6260100000032', 'پگاه', 'لبنیات', 'عدد', 82000, 105000, 18, 12, P('کارخانه پگاه کرمان').id],
    ['ماست سونیه گلدیس ۹۰۰ گرمی', '6260200000017', 'گلدیس', 'لبنیات', 'عدد', 56000, 72000, 30, 15, P('پخش گلدیس کرمان').id],
    ['ماست موسیر گلدیس ۵۰۰ گرمی', '6260200000024', 'گلدیس', 'لبنیات', 'عدد', 44000, 58000, 22, 12, P('پخش گلدیس کرمان').id],
    ['دوغ کاله ۱.۵ لیتری', '6260300000016', 'کاله', 'لبنیات', 'عدد', 33000, 44000, 40, 20, P('پخش مهرام جنوب').id],
    ['پنیر سفید ایرانی کاله ۴۰۰ گرمی', '6260300000023', 'کاله', 'لبنیات', 'عدد', 62000, 81000, 26, 12, P('پخش مهرام جنوب').id],
    ['کره حیوانی میهن ۱۰۰ گرمی', '6260400000015', 'میهن', 'لبنیات', 'عدد', 45000, 59000, 8, 12, P('پخش مهرام جنوب').id],
    ['سوسیس کوکتل مهرام ۵۰۰ گرمی', '6260500000014', 'مهرام', 'پروتئینی', 'بسته', 96000, 124000, 14, 10, P('پخش مهرام جنوب').id],
    ['کالباس آلمانی مهرام ۷۵۰ گرمی', '6260500000021', 'مهرام', 'پروتئینی', 'بسته', 168000, 215000, 6, 8, P('پخش مهرام جنوب').id],
    ['تخم مرغ بسته ۹ عددی طاها', '6260600000013', 'طاها', 'پروتئینی', 'بسته', 68000, 88000, 35, 20, P('پخش گلدیس کرمان').id],
    ['ماکارونی فرمی زر ۵۰۰ گرمی', '6260700000012', 'زر ماکارون', 'خواروبار', 'بسته', 22000, 30000, 120, 36, P('بازرگانی زرین (زر)').id],
    ['ماکارونی لوله‌ای زر ۷۰۰ گرمی', '6260700000029', 'زر ماکارون', 'خواروبار', 'بسته', 32000, 43000, 88, 24, P('بازرگانی زرین (زر)').id],
    ['رب گوجه فرنگی چین‌چین ۸۰۰ گرمی', '6260800000011', 'چین‌چین', 'خواروبار', 'قوطی', 74000, 96000, 30, 15, P('پخش سن‌ایچ زیتون').id],
    ['روغن سرخ‌کردنی تاک ۱.۶ لیتری', '6260900000010', 'تاک', 'خواروبار', 'بطری', 152000, 189000, 24, 12, P('بازرگانی زرین (زر)').id],
    ['روغن مایع لادن ۱.۸ لیتری', '6260900000027', 'لادن', 'خواروبار', 'بطری', 168000, 208000, 16, 12, P('بازرگانی زرین (زر)').id],
    ['برنج طارم دم‌سیاب اعلا ۵ کیلویی', '6261000000016', 'دامن‌برنج', 'خواروبار', 'کیسه', 720000, 895000, 20, 10, P('اتحادیه برنج و حبوبات کرمان').id],
    ['برنج هاشمی درجه یک ۱۰ کیلویی', '6261000000023', 'دامن‌برنج', 'خواروبار', 'کیسه', 1650000, 1980000, 8, 6, P('اتحادیه برنج و حبوبات کرمان').id],
    ['عدس گوشتی سمنان ۹۰۰ گرمی', '6261100000015', 'سمنان', 'خواروبار', 'بسته', 58000, 76000, 42, 20, P('اتحادیه برنج و حبوبات کرمان').id],
    ['لوبیا چیتی ممتاز ۹۰۰ گرمی', '6261100000022', 'سمنان', 'خواروبار', 'بسته', 64000, 83000, 38, 20, P('اتحادیه برنج و حبوبات کرمان').id],
    ['پسته خام اکبری کرمان ۵۰۰ گرمی', '6261200000014', 'زیتون', 'آجیل و خشکبار', 'بسته', 980000, 1190000, 12, 8, P('پخش سن‌ایچ زیتون').id],
    ['پسته شور ممتاز کرمان ۲۵۰ گرمی', '6261200000021', 'زیتون', 'آجیل و خشکبار', 'بسته', 520000, 635000, 9, 10, P('پخش سن‌ایچ زیتون').id],
    ['خرمای مضافتی بم درجه یک ۶۰۰ گرمی', '6261300000013', 'زیتون', 'آجیل و خشکبار', 'بسته', 145000, 185000, 28, 15, P('پخش سن‌ایچ زیتون').id],
    ['نوشابه سن‌ایچ ۱.۵ لیتری', '6261400000012', 'سن‌ایچ', 'نوشیدنی', 'بطری', 26000, 36000, 72, 36, P('پخش سن‌ایچ زیتون').id],
    ['ماءالشعیر سن‌ایچ لیمویی', '6261400000029', 'سن‌ایچ', 'نوشیدنی', 'بطری', 28000, 38000, 54, 24, P('پخش سن‌ایچ زیتون').id],
    ['آب معدنی کوثر ۱.۵ لیتری', '6261500000011', 'کوثر', 'نوشیدنی', 'بطری', 9000, 14000, 6, 48, P('پخش سن‌ایچ زیتون').id],
    ['چای کیسه‌ای ۱۰۰ عددی گلستان', '6261600000010', 'گلستان', 'نوشیدنی', 'بسته', 118000, 152000, 20, 12, P('پخش مهرام جنوب').id],
    ['شامپوکلر آبشار ۴۰۰ میلی‌لیتر', '6261700000019', 'آبشار', 'بهداشتی', 'عدد', 49000, 65000, 18, 12, P('پخش مهرام جنوب').id],
    ['پودر لباسشویی پرسیل ۲ کیلویی', '6261800000018', 'پرسیل', 'بهداشتی', 'بسته', 195000, 245000, 10, 8, P('پخش مهرام جنوب').id],
    ['دستمال کاغذی خانواده ۳۰۰ برگ', '6261900000017', 'خانواده', 'بهداشتی', 'بسته', 38000, 52000, 44, 24, P('پخش گلدیس کرمان').id],
  ]
  const prodRows: { id: string; name: string; barcodes: string; buyPrice: number }[] = []
  for (const [name, barcode, brand, cat, unit, buy, sell, stock, reorder, providerId] of products) {
    prodRows.push(await db.product.create({
      data: {
        name: name as string,
        barcodes: JSON.stringify([barcode]),
        holooCode: `H${String(barcode).slice(-6)}`,
        brand: brand as string, category: cat as string, unit: unit as string,
        buyPrice: buy as number, sellPrice: sell as number,
        sellPrice2: Math.round((sell as number) * 0.93),
        stock: stock as number, reorderLevel: reorder as number, providerId: providerId as string,
        imageUrl: '',
      },
    }))
  }
  const prod = (name: string) => prodRows.find(p => p.name === name)!

  // ── Holidays 1404 (fixed + major lunar approximations) ─
  const holidays: [string, string][] = [
    ['2025-03-21', 'نوروز - عید نوروز'],
    ['2025-03-22', 'نوروز - عید نوروز'],
    ['2025-03-23', 'نوروز - تعطیل رسمی'],
    ['2025-04-01', 'روز جمهوری اسلامی'],
    ['2025-04-02', 'سیزده بدر - روز طبیعت'],
    ['2025-03-30', 'عید سعید فطر (تقریبی)'],
    ['2025-03-31', 'تعطیل به مناسبت عید فطر (تقریبی)'],
    ['2025-06-04', 'رحلت امام خمینی'],
    ['2025-06-05', 'قیام ۱۵ خرداد'],
    ['2025-06-07', 'عید سعید قربان (تقریبی)'],
    ['2025-06-15', 'عيد سعید غدير خم (تقریبی)'],
    ['2025-07-05', 'تاسوعای حسینی (تقریبی)'],
    ['2025-07-06', 'عاشورای حسینی (تقریبی)'],
    ['2025-08-14', 'اربعین حسینی (تقریبی)'],
    ['2025-08-23', 'رحلت پیامبر و شهادت امام حسن (تقریبی)'],
    ['2025-08-24', 'شهادت امام رضا (تقریبی)'],
    ['2025-09-01', 'سالروز قیام ۱۷ شهریور'],
    ['2025-09-02', 'شهادت امام حسن عسکری (تقریبی)'],
    ['2025-09-25', 'ولادت پیامبر و امام صادق (تقریبی)'],
    ['2025-11-11', 'شهادت حضرت فاطمه (تقریبی)'],
    ['2026-01-14', 'ولادت امام علی و روز پدر (تقریبی)'],
    ['2026-01-28', 'مبعث رسول اکرم (تقریبی)'],
    ['2026-02-11', 'پیروزی انقلاب اسلامی'],
    ['2026-02-17', 'ولادت حضرت قائم و جشن نیمه شعبان (تقریبی)'],
    ['2026-03-11', 'شهادت امام علی (تقریبی)'],
    ['2026-03-20', 'ملی شدن صنعت نفت / عید سعید فطر (تقریبی ۱۴۰۵)'],
    // ── سال ۱۴۰۵ ──
    ['2026-03-21', 'نوروز ۱۴۰۵ - عید نوروز'],
    ['2026-03-22', 'نوروز - عید نوروز'],
    ['2026-03-23', 'نوروز - تعطیل رسمی'],
    ['2026-04-01', 'روز جمهوری اسلامی'],
    ['2026-04-02', 'سیزده بدر - روز طبیعت'],
    ['2026-06-04', 'رحلت امام خمینی'],
    ['2026-06-05', 'قیام ۱۵ خرداد'],
    ['2026-06-26', 'عید سعید قربان (تقریبی ۱۴۰۵)'],
    ['2026-07-04', 'عید سعید غدیّر خم (تقریبی ۱۴۰۵)'],
    ['2026-08-22', 'رحلت پیامبر و شهادت امام حسن (تقریبی ۱۴۰۵)'],
    ['2026-08-23', 'شهادت امام رضا (تقریبی ۱۴۰۵)'],
    ['2026-09-30', 'ولادت پیامبر و امام صادق (تقریبی ۱۴۰۵)'],
    ['2026-11-11', 'شهادت حضرت فاطمه (تقریبی ۱۴۰۵)'],
    ['2027-01-03', 'ولادت امام علی و روز پدر (تقریبی ۱۴۰۵)'],
    ['2027-01-19', 'مبعث رسول اکرم (تقریبی ۱۴۰۵)'],
    ['2027-02-04', 'ولادت حضرت قائم - نیمه شعبان (تقریبی ۱۴۰۵)'],
    ['2027-02-11', 'پیروزی انقلاب اسلامی'],
    ['2027-03-01', 'شهادت امام علی (تقریبی ۱۴۰۵)'],
    ['2027-03-20', 'ملی شدن صنعت نفت'],
  ]
  for (const [date, title] of holidays) {
    await db.holiday.create({ data: { date, title, source: 'seed' } })
  }

  // ── Orders ────────────────────────────────────────────
  async function makeOrder(o: {
    idx: number; providerId: string; providerName: string; status: string; deliveryIn: number;
    creator: string; pay: string; items: [string, number][]; received?: boolean; overdue?: boolean;
    priceMult?: number; daysAgo?: number // historical buys: cheaper prices + real past createdAt (inflation sparkline story)
  }) {
    const creator = U(o.creator)
    const items = o.items.map(([n, q]) => {
      const p = prod(n)
      return { productId: p.id, productName: p.name, barcode: JSON.parse(p.barcodes)[0], qty: q, unitBuyPrice: o.priceMult ? Math.round((p.buyPrice as number) * o.priceMult) : p.buyPrice, status: 'PENDING' }
    })
    const total = items.reduce((s, it) => s + it.qty * it.unitBuyPrice, 0)
    const createdAt = at(-(o.daysAgo ?? 2), 8)
    const order = await db.order.create({
      data: {
        code: `HZ-1404-${String(o.idx).padStart(4, '0')}`,
        providerId: o.providerId, providerName: o.providerName,
        createdById: creator.id, createdByName: creator.name,
        status: o.status, deliveryDate: iso(addDays(o.deliveryIn)), payMethod: o.pay,
        totalAmount: total,
        ...(o.daysAgo ? { createdAt } : {}),
        history: JSON.stringify([
          { at: createdAt.toISOString(), userId: creator.id, userName: creator.name, action: 'ایجاد سفارش', detail: `${o.items.length} قلم کالا` },
          ...(o.status !== 'DRAFT' && o.status !== 'SUBMITTED' ? [{ at: at(-(o.daysAgo ?? 2) + 1, 9).toISOString(), userId: U('مینا لطفی').id, userName: 'مینا لطفی', action: 'تأیید سفارش', detail: 'ارسال به تأمین‌کننده' }] : []),
        ]),
        notes: o.overdue ? 'فالوآپ با تأمین‌کننده لازم است' : '',
      },
    })
    for (const it of items) {
      await db.orderItem.create({
        data: {
          ...it,
          orderId: order.id,
          receivedQty: o.received ? it.qty : null,
          status: o.received ? 'RECEIVED' : 'PENDING',
        },
      })
    }
    return order
  }

  const o1 = await makeOrder({
    idx: 12, providerId: P('کارخانه پگاه کرمان').id, providerName: 'کارخانه پگاه کرمان',
    status: 'RECEIVING', deliveryIn: 0, creator: 'سارا نوروزی', pay: 'CASH',
    items: [['شیر پرچرب پگاه ۱ لیتری', 48], ['شیر کم‌چرب پگاه ۵۰۰ میلی‌لیتر', 24], ['شیرکاکائو ۲/۵ لیتر پگاه ۳٪', 12], ['ماست سونیه گلدیس ۹۰۰ گرمی', 16]],
  })
  const o2 = await makeOrder({
    idx: 13, providerId: P('بازرگانی زرین (زر)').id, providerName: 'بازرگانی زرین (زر)',
    status: 'APPROVED', deliveryIn: -1, creator: 'مینا لطفی', pay: 'CHEQUE',
    items: [['ماکارونی فرمی زر ۵۰۰ گرمی', 60], ['ماکارونی لوله‌ای زر ۷۰۰ گرمی', 40], ['روغن سرخ‌کردنی تاک ۱.۶ لیتری', 12]],
    overdue: true,
  })
  await makeOrder({
    idx: 14, providerId: P('اتحادیه برنج و حبوبات کرمان').id, providerName: 'اتحادیه برنج و حبوبات کرمان',
    status: 'VERIFIED', deliveryIn: -2, creator: 'سارا نوروزی', pay: 'CHEQUE',
    items: [['برنج طارم دم‌سیاب اعلا ۵ کیلویی', 10], ['عدس گوشتی سمنان ۹۰۰ گرمی', 20], ['لوبیا چیتی ممتاز ۹۰۰ گرمی', 15]],
    received: true,
  })
  await makeOrder({
    idx: 15, providerId: P('پخش مهرام جنوب').id, providerName: 'پخش مهرام جنوب',
    status: 'SUBMITTED', deliveryIn: 2, creator: 'سارا نوروزی', pay: 'CASH',
    items: [['سوسیس کوکتل مهرام ۵۰۰ گرمی', 20], ['کالباس آلمانی مهرام ۷۵۰ گرمی', 8], ['دوغ کاله ۱.۵ لیتری', 24], ['کره حیوانی میهن ۱۰۰ گرمی', 12]],
  })
  await makeOrder({
    idx: 16, providerId: P('پخش سن‌ایچ زیتون').id, providerName: 'پخش سن‌ایچ زیتون',
    status: 'ACCOUNTED', deliveryIn: -3, creator: 'مینا لطفی', pay: 'CASH',
    items: [['نوشابه سن‌ایچ ۱.۵ لیتری', 48], ['ماءالشعیر سن‌ایچ لیمویی', 24], ['رب گوجه فرنگی چین‌چین ۸۰۰ گرمی', 12]],
    received: true,
  })
  await makeOrder({
    idx: 17, providerId: P('پخش گلدیس کرمان').id, providerName: 'پخش گلدیس کرمان',
    status: 'DONE', deliveryIn: -4, creator: 'سارا نوروزی', pay: 'CASH',
    items: [['دستمال کاغذی خانواده ۳۰۰ برگ', 24], ['تخم مرغ بسته ۹ عددی طاها', 15]],
    received: true,
  })

  // ── Historical buys (older + cheaper) — feed the price-check cost sparklines ──
  await makeOrder({
    idx: 18, providerId: P('کارخانه پگاه کرمان').id, providerName: 'کارخانه پگاه کرمان',
    status: 'DONE', deliveryIn: -100, creator: 'سارا نوروزی', pay: 'CASH',
    items: [['شیر پرچرب پگاه ۱ لیتری', 48], ['شیر کم‌چرب پگاه ۵۰۰ میلی‌لیتر', 24]],
    received: true, priceMult: 0.78, daysAgo: 100,
  })
  await makeOrder({
    idx: 19, providerId: P('بازرگانی زرین (زر)').id, providerName: 'بازرگانی زرین (زر)',
    status: 'DONE', deliveryIn: -98, creator: 'مینا لطفی', pay: 'CHEQUE',
    items: [['ماکارونی فرمی زر ۵۰۰ گرمی', 60], ['روغن سرخ‌کردنی تاک ۱.۶ لیتری', 12]],
    received: true, priceMult: 0.82, daysAgo: 98,
  })
  await makeOrder({
    idx: 20, providerId: P('کارخانه پگاه کرمان').id, providerName: 'کارخانه پگاه کرمان',
    status: 'DONE', deliveryIn: -65, creator: 'سارا نوروزی', pay: 'CASH',
    items: [['شیر پرچرب پگاه ۱ لیتری', 48], ['شیر کم‌چرب پگاه ۵۰۰ میلی‌لیتر', 24], ['ماست سونیه گلدیس ۹۰۰ گرمی', 16]],
    received: true, priceMult: 0.86, daysAgo: 65,
  })
  await makeOrder({
    idx: 21, providerId: P('اتحادیه برنج و حبوبات کرمان').id, providerName: 'اتحادیه برنج و حبوبات کرمان',
    status: 'DONE', deliveryIn: -63, creator: 'مینا لطفی', pay: 'CHEQUE',
    items: [['برنج طارم دم‌سیاب اعلا ۵ کیلویی', 10]],
    received: true, priceMult: 0.9, daysAgo: 63,
  })
  await makeOrder({
    idx: 22, providerId: P('کارخانه پگاه کرمان').id, providerName: 'کارخانه پگاه کرمان',
    status: 'DONE', deliveryIn: -35, creator: 'سارا نوروزی', pay: 'CASH',
    items: [['شیر پرچرب پگاه ۱ لیتری', 48], ['ماست سونیه گلدیس ۹۰۰ گرمی', 16]],
    received: true, priceMult: 0.93, daysAgo: 35,
  })
  await makeOrder({
    idx: 23, providerId: P('بازرگانی زرین (زر)').id, providerName: 'بازرگانی زرین (زر)',
    status: 'DONE', deliveryIn: -34, creator: 'مینا لطفی', pay: 'CHEQUE',
    items: [['ماکارونی فرمی زر ۵۰۰ گرمی', 60]],
    received: true, priceMult: 0.9, daysAgo: 34,
  })
  await makeOrder({
    idx: 24, providerId: P('پخش سن‌ایچ زیتون').id, providerName: 'پخش سن‌ایچ زیتون',
    status: 'DONE', deliveryIn: -30, creator: 'سارا نوروزی', pay: 'CASH',
    items: [['نوشابه سن‌ایچ ۱.۵ لیتری', 48]],
    received: true, priceMult: 0.85, daysAgo: 30,
  })

  // ── Cheques ───────────────────────────────────────────
  await db.cheque.create({
    data: {
      number: '', amount: 41800000, orderId: o2.id, orderCode: o2.code,
      recipientName: 'آقای شریفی - بازرگانی زرین', recipientPhone: '0913-4445566',
      writtenAt: iso(addDays(-1)), dueDate: iso(addDays(40)), periodDays: 40,
      status: 'PENDING_OWNER', createdById: U('مینا لطفی').id, createdByName: 'مینا لطفی',
      history: JSON.stringify([{ at: at(-1).toISOString(), userName: 'مینا لطفی', action: 'ثبت چک', detail: 'متصل به سفارش ' + o2.code }]),
    },
  })
  await db.cheque.create({
    data: {
      number: '۸۴۵۲۱۰', amount: 23400000,
      recipientName: 'آقای محمدی‌فر - پگاه', recipientPhone: '0913-2223344',
      writtenAt: iso(addDays(-6)), dueDate: iso(addDays(18)), periodDays: 25,
      status: 'SIGNED', ownerNote: 'امضا شد، آماده تحویل',
      createdById: U('مینا لطفی').id, createdByName: 'مینا لطفی',
      history: JSON.stringify([{ at: at(-3).toISOString(), userName: 'جواد نوروزی', action: 'امضای چک', detail: '' }]),
    },
  })
  await db.cheque.create({
    data: {
      number: '۸۴۵۱۹۸', amount: 8900000,
      recipientName: 'آقای رضایی - گلدیس', recipientPhone: '0913-1112233',
      writtenAt: iso(addDays(-40)), dueDate: iso(addDays(-3)), periodDays: 45,
      status: 'DELIVERED',
      createdById: U('مینا لطفی').id, createdByName: 'مینا لطفی',
      history: JSON.stringify([{ at: at(-20).toISOString(), userName: 'مینا لطفی', action: 'تحویل به نماینده', detail: '' }]),
    },
  })

  // ── SOPs ──────────────────────────────────────────────
  await db.sOP.create({
    data: {
      title: 'دریافت صبحگاهی مرسوله تأمین‌کننده', category: 'انبار و دریافت', createdById: U('کیانوش صفاپور').id, updatedBy: 'کیانوش صفاپور',
      steps: JSON.stringify([
        { title: '۱. بررسی مدارک', detail: 'فاکتور سفارش قبلی را از سیستم (سفارش‌ها) باز کنید و با فاکتور کاغذی راننده مطابقت دهید.' },
        { title: '۲. شمارش ظاهری', detail: 'تعداد بسته‌های هر کالا را با تعداد فاکتور مقایسه کنید. هر اختلاف را در برنامه در ستون «دریافتی» ثبت کنید.' },
        { title: '۳. بررسی تاریخ انقضا و برچسب قیمت', detail: 'حداقل دوسوم عمر مجاز کالا باید باقی مانده باشد. کالای با برچسب قیمت اشتباه یا تاریخ کوتاه را علامت «رد» بزنید.' },
        { title: '۴. اسکن بارکد', detail: 'بارکد هر کالا را اسکن یا تایپ کنید تا در سیستم تأیید شود. اگر بارکد جدید است، از دکمه «افزودن بارکد» استفاده کنید.' },
        { title: '۵. ثبت وزنی‌ها', detail: 'برای کالاهای وزنی (گوشت، برنج فله) وزن روی ترازو را درج و قیمت را با نرخ فاکتور کنترل کنید.' },
        { title: '۶. تحویل به انبار', detail: 'پس از ثبت، سفارش خودکار برای سرپرست انبار ارسال می‌شود. نیازی به جابه‌جایی فیزیکی مدارک نیست.' },
      ]),
    },
  })
  await db.sOP.create({
    data: {
      title: 'چیدمان و تراکم قفسه لبنیات', category: 'چیدمان', createdById: U('سارا نوروزی').id, updatedBy: 'سارا نوروزی',
      steps: JSON.stringify([
        { title: '۱. FACE رو به جلو', detail: 'همه بسته‌ها لبه قفسه و برچسب رو به مشتری باشند.' },
        { title: '۲. تازگی (FIFO)', detail: 'موجودی قدیمی‌تر جلو، جدید عقب.' },
        { title: '۳. سردخانه', detail: 'دمای یخچال لبنیات بین ۲ تا ۵ درجه؛ هر ناهار کنترل و در وظایف تیک بزنید.' },
        { title: '۴. کمبود', detail: 'اگر جایی خالی شد از «درخواست جابه‌جایی از انبار» در پلانوگرام استفاده کنید.' },
      ]),
    },
  })

  // ── Tasks ─────────────────────────────────────────────
  const taskDefs = [
    ['شمارش دوره‌ای قفسه نوشیدنی‌ها', 'شمارش و ثبت موجودی ردیف نوشیدنی‌ها', 'مینا غلامحسینی', 'CHECKLIST', 'HIGH', 1],
    ['تمیز کردن یخچال‌های لبنیات', 'گردگیری و ضدعفونی قفسه‌ها - عصر انجام شود', 'امیرعلی علیخانی', 'CLEANING', 'NORMAL', 0],
    ['بررسی تاریخ انقضای سوسیس و کالباس', 'هر قلم بررسی و در صورت نیاز استیکر تخفیف', 'نگین تقی‌زاده', 'TASK', 'URGENT', 1],
    ['چیدمان عرضه پسته نوروزی', 'طبق پلانوگرام جدید بخش آجیل', 'سمیرا میرزایی', 'TASK', 'NORMAL', 2],
    ['گزارش فروش هفتگی به مدیر کل', 'خلاصه فروش و کالاهای پرتقاضا', 'نگار یادگاری', 'TASK', 'NORMAL', 3],
  ]
  for (const [title, desc, assignee, type, prio, due] of taskDefs) {
    const u = U(assignee as string)
    await db.task.create({
      data: {
        title: title as string, description: desc as string, type: type as string, priority: prio as string,
        assignedToId: u.id, assignedToName: u.name,
        createdById: U('کیانوش صفاپور').id, createdByName: 'کیانوش صفاپور',
        dueDate: iso(addDays(due as number)),
        status: (due as number) === 0 ? 'IN_PROGRESS' : 'OPEN',
      },
    })
  }

  // ── Wall ──────────────────────────────────────────────
  await db.wallPost.create({
    data: { authorId: U('کیانوش صفاپور').id, authorName: 'کیانوش صفاپور', title: 'سامانه جدید دریافت مرسوله فعال شد', content: 'از امروز دریافت مرسوله‌ها فقط از طریق تب «دریافت مرسوله» انجام می‌شود. نیازی به آوردن نمونه و فاکتور طبقه دوم نیست؛ حسابدار به‌صورت خودکار خبردار می‌شود. پرسش‌ها را در پیام بپرسید.', pinned: true },
  })
  await db.wallPost.create({
    data: { authorId: U('هستی ایران‌نژاد').id, authorName: 'هستی ایران‌نژاد', title: 'یادآوری انقضای دوغ کاله', content: 'دوغ کاله ۱.۵ لیتری دسته چند روز پیش نزدیک انقضا بود؛ لطفاً هنگام چیدمان حتماً FIFO رعایت شود.', pinned: false },
  })
  await db.wallPost.create({
    data: { authorId: U('زهرا محمدی').id, authorName: 'زهرا محمدی', title: 'قیمت جدید شیر پگاه', content: 'قیمت شیر ۱ لیتری پگاه از فردا ۴۹٬۰۰۰ تومان است، برچسب‌ها عوض شود.', pinned: false },
  })

  // ── Feedback & Ideas ──────────────────────────────────
  await db.feedback.create({ data: { type: 'IDEA', authorName: 'نگار یادگاری', userId: U('نگار یادگاری').id, content: 'پیشنهاد می‌کنم بسته «صبحانه خانواده» (شیر + نان تست + کره) با تخفیف کنار هم بچینیم؛ این هفته سه مشتری دنبال همین بود.', status: 'REVIEWING' } })
  await db.feedback.create({ data: { type: 'ANON', content: 'اگر دکمه‌های ثبت دریافت کمی بزرگ‌تر باشند با دستکش سرد انبار هم راحت‌تر است.', status: 'NEW' } })

  // ── Awards ────────────────────────────────────────────
  await db.award.create({ data: { userId: U('هستی ایران‌نژاد').id, userName: 'هستی ایران‌نژاد', points: 25, reason: 'دقت عالی در دریافت مرسوله پگاه و کشف اختلاف قیمت', awardedById: U('مینا لطفی').id, awardedByName: 'مینا لطفی' } })
  await db.award.create({ data: { userId: U('مینا غلامحسینی').id, userName: 'مینا غلامحسینی', points: 15, reason: 'چیدمان فوق‌العاده بخش پسته عید', awardedById: U('سارا نوروزی').id, awardedByName: 'سارا نوروزی' } })
  await db.award.create({ data: { userId: U('نگار یادگاری').id, userName: 'نگار یادگاری', points: 20, reason: 'پیشنهاد عملیاتی بسته صبحانه', awardedById: U('مینا لطفی').id, awardedByName: 'مینا لطفی' } })

  // ── Customer requests (out of stock) ──────────────────
  await db.customerRequest.create({ data: { productName: 'بستنی سنتی زهرا ۵۰۰ گرمی', count: 3, lastByName: 'نگار یادگاری', lastById: U('نگار یادگاری').id, notes: 'مشتری‌ها دنبال بستنی سنتی بودند' } })
  await db.customerRequest.create({ data: { productName: 'نان لواش بسته‌ای فروزن', count: 1, lastByName: 'الهام سعدی', lastById: U('الهام سعدی').id } })

  // ── Customers & PreOrder ──────────────────────────────
  const c1 = await db.customer.create({ data: { name: 'خانم احمدی', phone: '0913-7778899', preferences: 'لبنیات کم‌چرب، نان تازه', favorite: true, createdById: U('نگار یادگاری').id } })
  const c2 = await db.customer.create({ data: { name: 'آقای بهرامی', phone: '0913-8889900', preferences: 'برنج هاشمی، پسته اکبری', favorite: true, createdById: U('نگار یادگاری').id } })
  const mkItems = (rows: [string, number, number][]) =>
    rows.map(([n, q, pr]) => ({ productId: prod(n).id, name: n, qty: q, price: pr }))
  const preorderRows: { code: string; c: { id: string; name: string }; by: string; items: ReturnType<typeof mkItems>; status: string; note: string }[] = [
    {
      code: 'PO-1404-001', c: c2, by: 'نگار یادگاری', status: 'NEW', note: 'ساعت ۱۷ تحویل بگیرد',
      items: mkItems([
        ['برنج هاشمی درجه یک ۱۰ کیلویی', 1, 1980000],
        ['پسته خام اکبری کرمان ۵۰۰ گرمی', 2, 1190000],
      ]),
    },
    {
      code: 'PO-1404-002', c: c1, by: 'نگار یادگاری', status: 'READY', note: 'برای صبحانه فروشگاه رزرو شد',
      items: mkItems([
        ['شیر پرچرب پگاه ۱ لیتری', 8, 49000],
        ['دوغ کاله ۱.۵ لیتری', 6, 42000],
        ['ماست موسیر گلدیس ۵۰۰ گرمی', 5, 62000],
      ]),
    },
    {
      code: 'PO-1404-003', c: c1, by: 'الهام سعدی', status: 'DONE', note: '',
      items: mkItems([
        ['ماست سونیه گلدیس ۹۰۰ گرمی', 4, 98000],
        ['شیر کم‌چرب پگاه ۵۰۰ میلی‌لیتر', 9, 26000],
      ]),
    },
    {
      code: 'PO-1404-004', c: c2, by: 'نگار یادگاری', status: 'DONE', note: 'مشتری همیشگی — کالا بدون رزرو',
      items: mkItems([
        ['پسته خام اکبری کرمان ۵۰۰ گرمی', 3, 1190000],
        ['شیرکاکائو ۲/۵ لیتر پگاه ۳٪', 7, 185000],
      ]),
    },
  ]
  for (const po of preorderRows) {
    await db.preOrder.create({
      data: {
        code: po.code, customerId: po.c.id, customerName: po.c.name,
        items: JSON.stringify(po.items), total: po.items.reduce((s, x) => s + x.qty * x.price, 0),
        createdById: U(po.by).id, createdByName: po.by, status: po.status, note: po.note,
      },
    })
  }

  // ── Planogram ─────────────────────────────────────────
  const layout = [
    [prod('شیر پرچرب پگاه ۱ لیتری').id, prod('شیر کم‌چرب پگاه ۵۰۰ میلی‌لیتر').id, prod('شیرکاکائو ۲/۵ لیتر پگاه ۳٪').id, prod('دوغ کاله ۱.۵ لیتری').id, null, null],
    [prod('ماست سونیه گلدیس ۹۰۰ گرمی').id, prod('ماست موسیر گلدیس ۵۰۰ گرمی').id, prod('پنیر سفید ایرانی کاله ۴۰۰ گرمی').id, prod('کره حیوانی میهن ۱۰۰ گرمی').id, null, null],
    [prod('دستمال کاغذی خانواده ۳۰۰ برگ').id, null, null, null, null, null],
  ]
  await db.planogram.create({
    data: { name: 'یخچال لبنیات - طبقه ۱', section: 'لبنیات', rows: 3, cols: 6, layout: JSON.stringify(layout), status: 'PUBLISHED', publishedById: U('سارا نوروزی').id },
  })

  // ── Settings ──────────────────────────────────────────
  await db.setting.create({ data: { key: 'storeName', value: 'هایپر زیتون' } })
  await db.setting.create({ data: { key: 'city', value: 'کرمان' } })
  await db.setting.create({ data: { key: 'vatRate', value: '9' } })
  await db.setting.create({ data: { key: 'minMarginPercent', value: '10' } })
  await db.setting.create({ data: { key: 'goodMarginPercent', value: '25' } })

  // ── Activity log ──────────────────────────────────────
  await db.activityLog.create({ data: { userId: U('کیانوش صفاپور').id, userName: 'کیانوش صفاپور', action: 'راه‌اندازی سامانه', entity: 'system', detail: 'seed اولیه' } })

  // ── Briefing archive (2 complete price-check days) — feeds the 🔥 streak on the price board ──
  const jToJalaliLabel = (d: Date) => {
    const months = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
    const wdays = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']
    const p = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    return `${wdays[d.getDay()]} ${p.jd} ${months[p.jm - 1]} ${p.jy}`
  }
  for (const off of [1, 2]) {
    const d = addDays(-off)
    const isoDay = iso(d)
    const data = { todayLabel: jToJalaliLabel(d), priceCheck: { total: 30, checkedToday: 30, remaining: 0, red: 2, yellow: 9, green: 19 } }
    await db.briefingSnapshot.create({
      data: { forDate: isoDay, jalaliLabel: data.todayLabel, data: JSON.stringify(data), createdById: U('مینا لطفی').id, createdByName: 'ذخیره خودکار صبحگاهی' },
    })
  }

  console.log('Seed complete ✔')
  console.log('Login: select a user, PIN = 1234')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
