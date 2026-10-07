/**
 * بذر دادهٔ سندباکس دمو — «هایپر نمونه» (round-16)
 * ⚠️ همهٔ نام‌ها و داده‌ها «قراردادی/نمونه» هستند و هیچ ارتباطی با پرسنل واقعی
 * هایپر زیتون ندارند — الزام مالک: نام پرسنل واقعی هرگز در حالت دمو استفاده نمی‌شود.
 * اجرا: DATABASE_URL=file:./db/sandbox-template.db bun run prisma/seed-sandbox.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const DEMO_STAFF = [
  { name: 'آرش نمونه‌راد', role: 'OWNER', color: '#0e7a4a' },
  { name: 'مریم آزمون‌فر', role: 'GM', color: '#c9a227' },
  { name: 'کاوه نمایش‌خواه', role: 'OM', color: '#77934a' },
  { name: 'نگار حساب‌نویس', role: 'ACC', color: '#2e6f6a' },
  { name: 'بهنام صندوق‌دوست', role: 'HC', color: '#8a6d10' },
  { name: 'زهرا فروش‌مهر', role: 'CASHIER', color: '#c96f4a' },
  { name: 'امید انبارگردان', role: 'SK', color: '#6b5b3e' },
  { name: 'ترانه چیدمان‌نژاد', role: 'MERCH', color: '#0e7a4a' },
  { name: 'شایان سفارش‌یار', role: 'PM', color: '#b3372f' },
  { name: 'پریسا قفسه‌بان', role: 'MERCH', color: '#77934a' },
]

type P = { name: string; barcode: string; cat: string; emoji: string; buy: number; sell: number; stock: number; reorder: number; unit: string; img: string }
const IMG = (c: string) => `/demo-img/${c}.png`
const PRODUCTS: P[] = [
  { name: 'شیر کم‌چرب پگاه ۱ لیتری', barcode: '6001001', cat: 'لبنیات', emoji: '🥛', buy: 320000, sell: 380000, stock: 48, reorder: 12, unit: 'عدد', img: IMG('dairy') },
  { name: 'ماست موسیر ۴۰۰ گرمی', barcode: '6001002', cat: 'لبنیات', emoji: '🥛', buy: 180000, sell: 225000, stock: 30, reorder: 10, unit: 'عدد', img: IMG('dairy') },
  { name: 'پنیر سفید ایرانی ۵۰۰ گرمی', barcode: '6001003', cat: 'لبنیات', emoji: '🧀', buy: 420000, sell: 520000, stock: 8, reorder: 12, unit: 'عدد', img: IMG('dairy') },
  { name: 'نان سنگک تازه', barcode: '6001004', cat: 'نان‌وایی', emoji: '🥖', buy: 25000, sell: 40000, stock: 60, reorder: 20, unit: 'عدد', img: IMG('bakery') },
  { name: 'کروسان شکلاتی', barcode: '6001005', cat: 'نان‌وایی', emoji: '🥐', buy: 90000, sell: 130000, stock: 22, reorder: 8, unit: 'عدد', img: IMG('bakery') },
  { name: 'سیب قرمز دماوند', barcode: '6001006', cat: 'میوه و سبزی', emoji: '🍎', buy: 85000, sell: 120000, stock: 90, reorder: 25, unit: 'کیلو', img: IMG('produce') },
  { name: 'خیار گلخانه‌ای', barcode: '6001007', cat: 'میوه و سبزی', emoji: '🥒', buy: 60000, sell: 95000, stock: 55, reorder: 20, unit: 'کیلو', img: IMG('produce') },
  { name: 'گوجه‌فرنگی بوته‌ای', barcode: '6001008', cat: 'میوه و سبزی', emoji: '🍅', buy: 45000, sell: 75000, stock: 70, reorder: 25, unit: 'کیلو', img: IMG('produce') },
  { name: 'سینه مرغ تازه بسته‌بندی', barcode: '6001009', cat: 'پروتئین', emoji: '🍗', buy: 480000, sell: 590000, stock: 15, reorder: 10, unit: 'کیلو', img: IMG('meat') },
  { name: 'ماهی قزل‌آلای منجمد', barcode: '6001010', cat: 'پروتئین', emoji: '🐟', buy: 850000, sell: 1050000, stock: 6, reorder: 8, unit: 'کیلو', img: IMG('meat') },
  { name: 'آب‌میوه پرتقال ۱٫۵ لیتری', barcode: '6001011', cat: 'نوشیدنی', emoji: '🧃', buy: 210000, sell: 265000, stock: 40, reorder: 12, unit: 'عدد', img: IMG('beverages') },
  { name: 'نوشابه خانواده زیتونی', barcode: '6001012', cat: 'نوشیدنی', emoji: '🥤', buy: 95000, sell: 130000, stock: 84, reorder: 24, unit: 'عدد', img: IMG('beverages') },
  { name: 'دمنوش گیاهی ۲۰ بسته', barcode: '6001013', cat: 'نوشیدنی', emoji: '🍵', buy: 165000, sell: 210000, stock: 18, reorder: 6, unit: 'بسته', img: IMG('beverages') },
  { name: 'چیپس سیب‌زمینی نمکی', barcode: '6001014', cat: 'تنقلات', emoji: '🍟', buy: 55000, sell: 80000, stock: 66, reorder: 20, unit: 'بسته', img: IMG('snacks') },
  { name: 'بیسکویت ساقه طلایی', barcode: '6001015', cat: 'تنقلات', emoji: '🍪', buy: 38000, sell: 55000, stock: 52, reorder: 16, unit: 'بسته', img: IMG('snacks') },
  { name: 'مایع ظرفشویی لیمویی ۳٫۵ لیتر', barcode: '6001016', cat: 'شویندگان', emoji: '🧴', buy: 290000, sell: 375000, stock: 20, reorder: 8, unit: 'عدد', img: IMG('cleaning') },
  { name: 'دستمال کاغذی ۳۰۰ برگ', barcode: '6001017', cat: 'شویندگان', emoji: '🧻', buy: 85000, sell: 120000, stock: 44, reorder: 15, unit: 'بسته', img: IMG('cleaning') },
  { name: 'بستنی وانیلی خانواده', barcode: '6001018', cat: 'منجمد', emoji: '🍨', buy: 340000, sell: 430000, stock: 12, reorder: 10, unit: 'عدد', img: IMG('frozen') },
  { name: 'مخلوط سبزیجات منجمد', barcode: '6001019', cat: 'منجمد', emoji: '🥦', buy: 190000, sell: 250000, stock: 14, reorder: 6, unit: 'بسته', img: IMG('frozen') },
  { name: 'شامپو تخصصی موی خشک', barcode: '6001020', cat: 'بهداشتی', emoji: '🧼', buy: 380000, sell: 480000, stock: 25, reorder: 8, unit: 'عدد', img: IMG('personalcare') },
  { name: 'خمیردندان نعنایی', barcode: '6001021', cat: 'بهداشتی', emoji: '🪥', buy: 145000, sell: 190000, stock: 32, reorder: 10, unit: 'عدد', img: IMG('personalcare') },
  { name: 'برنج ایرانی هاشمی ۱۰ کیلویی', barcode: '6001022', cat: 'خواروبار', emoji: '🍚', buy: 6800000, sell: 7950000, stock: 16, reorder: 6, unit: 'کیسه', img: IMG('grocery') },
  { name: 'روغن سرخ‌کردنی ۱٫۶ لیتری', barcode: '6001023', cat: 'خواروبار', emoji: '🫒', buy: 720000, sell: 890000, stock: 26, reorder: 10, unit: 'عدد', img: IMG('grocery') },
  { name: 'ماکارونی فرمی ۵۰۰ گرمی', barcode: '6001024', cat: 'خواروبار', emoji: '🍝', buy: 95000, sell: 135000, stock: 48, reorder: 18, unit: 'بسته', img: IMG('grocery') },
]

const PROVIDERS = ['شرکت پخش نمونه‌غذا', 'بازرگانی نمایش‌تجارت', 'توزیع سپهر نمونه', 'پخش سراسری دمویار', 'تولیدی نمونه‌صنعت']

async function main() {
  console.log('— بذر سندباکس «هایپر نمونه» —')

  // کاربران دمو
  for (const s of DEMO_STAFF) {
    await db.user.upsert({
      where: { name: s.name },
      update: {},
      create: {
        name: s.name,
        username: `sb-${s.name.slice(0, 4)}${Math.floor(Math.random() * 1e5)}`,
        pin: '1234',
        role: s.role,
        color: s.color,
        active: true,
        points: Math.floor(Math.random() * 180),
      },
    })
  }

  for (const s of DEMO_STAFF) {
    await db.personnel.upsert({
      where: { nationalId: `SB-${s.role}-${DEMO_STAFF.indexOf(s)}` },
      update: {},
      create: {
        firstName: s.name.split(' ')[0],
        lastName: s.name.split(' ').slice(1).join(' '),
        nationalId: `SB-${s.role}-${DEMO_STAFF.indexOf(s)}`,
        jobTitle: ({ OWNER: 'مدیرعامل', GM: 'مدیرکل', OM: 'مدیر عملیات', ACC: 'حسابدار', HC: 'سرصندوقدار', CASHIER: 'صندوقدار', SK: 'انباردار', MERCH: 'چیدمان‌دار', PM: 'مدیر خرید' } as Record<string, string>)[s.role] || 'کارمند',
        baseSalary: 0,
        hireDate: '1403-01-15',
        active: true,
      },
    }).catch(() => {})
  }

  const users = await db.user.findMany()

  // تأمین‌کنندگان دمو
  const providerIds: string[] = []
  for (let i = 0; i < PROVIDERS.length; i++) {
    const name = PROVIDERS[i]
    const existing = await db.provider.findFirst({ where: { name } })
    const p = existing || await db.provider.create({
      data: { name, personName: 'نمایندهٔ نمونه', phone: '۰۳۱-۱۲۳۴۵۶۷', type: 'DISTRIBUTOR', active: true },
    }).catch(async () => await db.provider.findFirst({ where: { name } })!)
    if (p) providerIds.push(p.id)
  }

  // کالاهای دمو با تصاویر حرفه‌ای
  for (const p of PRODUCTS) {
    const existing = await db.product.findFirst({ where: { name: p.name } })
    if (existing) continue
    await db.product.create({
      data: {
        name: p.name,
        barcodes: JSON.stringify([p.barcode]),
        holooCode: `SB${p.barcode.slice(-5)}`,
        category: p.cat,
        buyPrice: p.buy,
        sellPrice: p.sell,
        stock: p.stock,
        reorderLevel: p.reorder,
        unit: p.unit,
        imageUrl: p.img,
        providerId: providerIds[p.barcode.charCodeAt(7) % providerIds.length] || providerIds[0],
        active: true,
      },
    })
  }

  // سفارش‌های نمونه در مراحل مختلف
  const pm = users.find((u) => u.role === 'PM') || users[0]
  const products = await db.product.findMany({ take: 8 })
  const stages: Array<{ status: string; day: number }> = [
    { status: 'DRAFT', day: 0 },
    { status: 'SUBMITTED', day: 1 },
    { status: 'APPROVED', day: 2 },
    { status: 'RECEIVED', day: 3 },
    { status: 'VERIFIED', day: 5 },
  ]
  for (let i = 0; i < stages.length && i < providerIds.length; i++) {
    const st = stages[i]
    const prov = providerIds[i]
    const provName = PROVIDERS[i]
    const items = products.slice(i * 2, i * 2 + 2).map((pr, k) => ({
      productId: pr.id, name: pr.name, qty: 12 + k * 6, price: pr.buyPrice, receivedQty: 0, expiryDate: '', printedPrice: 0,
    }))
    const total = items.reduce((s, it) => s + it.qty * it.price, 0)
    await db.order.create({
      data: {
        code: `SB-1405-${String(i + 1).padStart(4, '0')}`,
        status: st.status,
        providerId: prov,
        providerName: provName,
        createdById: pm.id,
        createdByName: pm.name,
        deliveryDate: new Date(Date.now() + st.day * 86400000).toISOString().slice(0, 10),
        items: JSON.stringify(items),
        totalAmount: total,
        notes: 'سفارش نمایشی سندباکس — هایپر نمونه',
      },
    }).catch(() => {})
  }

  // چک‌های نمونه
  const owner = users.find((u) => u.role === 'OWNER')!
  for (let i = 0; i < 3; i++) {
    await db.cheque.create({
      data: {
        number: `SB-${140500 + i}`,
        amount: 40_000_000_0 * (i + 1),
        recipientName: PROVIDERS[i % PROVIDERS.length],
        writtenAt: new Date().toISOString().slice(0, 10),
        dueDate: new Date(Date.now() + (i + 2) * 5 * 86400000).toISOString().slice(0, 10),
        periodDays: 30 + i * 15,
        status: i === 0 ? 'SIGNED' : 'PENDING_OWNER',
        selfIssued: i === 2,
        createdById: owner.id,
        createdByName: owner.name,
      },
    }).catch(() => {})
  }

  // وظایف و دیوار تیمی
  const gm = users.find((u) => u.role === 'GM')!
  const merch = users.find((u) => u.role === 'MERCH')!
  await db.task.create({ data: { title: 'چیدمان ویترین لبنیات طبقهٔ نمونه', description: 'دموی سندباکس: قفسه‌ها را طبق پلانوگرام نمونه بچینید', type: 'TASK', priority: 'NORMAL', assignedToId: merch.id, assignedToName: merch.name, createdById: gm.id, createdByName: gm.name, dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), points: 15 } }).catch(() => {})
  await db.task.create({ data: { title: 'شمارش زون نوشیدنی‌های سرد', description: 'شمارش نمایشی', type: 'CHECKLIST', priority: 'HIGH', assignedToId: merch.id, assignedToName: merch.name, createdById: gm.id, createdByName: gm.name, dueDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), points: 10 } }).catch(() => {})
  await db.wallPost.create({ data: { title: 'به هایپر نمونه خوش آمدید 🧪', content: 'این دیوار تیمیِ نسخهٔ دمو است. داده‌های واقعی شما در سیستم اصلی کاملاً جدا نگه داشته می‌شوند.', authorId: gm.id, authorName: gm.name } }).catch(() => {})

  // زون‌های نمونه
  for (const [name, minStaff, criticality] of [['لبنیات', 1, 'B'], ['میوه و سبزی', 2, 'B'], ['نوشیدنی‌های سرد', 1, 'C'], ['صندوق‌ها', 3, 'A']] as const) {
    await db.zone.upsert({ where: { name }, update: {}, create: { name, minStaff, criticality, countFrequency: criticality === 'A' ? 'WEEKLY' : 'MONTHLY' } }).catch(() => {})
  }

  // تعطیلات رسمی ۱۴۰۵ (نمونهٔ دستی — همگام‌سازی رسمی در سیستم واقعی انجام می‌شود)
  const H = [
    ['1405-01-01', 'نوروز — جشن سال نو'], ['1405-01-02', 'عیدنوروز'], ['1405-01-12', 'روز جمهوری اسلامی'],
    ['1405-01-13', 'روز طبیعت'], ['1405-03-14', 'رحلت امام خمینی'], ['1405-03-15', 'قیام ۱۵ خرداد'],
    ['1405-11-22', 'پیروزی انقلاب اسلامی'], ['1405-12-29', 'ملی شدن صنعت نفت'],
  ] as const
  for (const [date, title] of H) {
    await db.holiday.upsert({ where: { date }, update: {}, create: { date, title, kind: 'HOLIDAY', source: 'manual' } }).catch(() => {})
  }

  // لایسنس نمایشی سندباکس: سازمانی (gating در سندباکس از rbac رد می‌شود)
  await db.setting.upsert({
    where: { key: 'setup.done' },
    update: { value: '1' },
    create: { key: 'setup.done', value: '1' },
  })
  await db.setting.upsert({
    where: { key: 'setup.profile' },
    update: { value: JSON.stringify({ name: 'هایپر نمونه', city: 'شهر نمونه', kind: 'سوپرمارکت دمو', phone: '', founder: false, completedAt: new Date().toISOString() }) },
    create: { key: 'setup.profile', value: JSON.stringify({ name: 'هایپر نمونه', city: 'شهر نمونه', kind: 'سوپرمارکت دمو', phone: '', founder: false, completedAt: new Date().toISOString() }) },
  })
  await db.setting.upsert({
    where: { key: 'license.state' },
    update: { value: JSON.stringify({ tier: 'ENTERPRISE', founder: false, modules: {}, updatedAt: new Date().toISOString() }) },
    create: { key: 'license.state', value: JSON.stringify({ tier: 'ENTERPRISE', founder: false, modules: {}, updatedAt: new Date().toISOString() }) },
  })
  await db.setting.upsert({
    where: { key: 'payroll.year' },
    update: { value: '1405' },
    create: { key: 'payroll.year', value: '1405' },
  })

  const counts = {
    users: await db.user.count(),
    products: await db.product.count(),
    providers: await db.provider.count(),
    orders: await db.order.count(),
    cheques: await db.cheque.count(),
    holidays: await db.holiday.count(),
  }
  console.log('OK', JSON.stringify(counts))
}

main().finally(() => db.$disconnect())
