/* Seed script for Hyper Zeytoon platform */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jalaali from '../src/lib/jalaali-core'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Hyper Zeytoon...')

  // ---------- Roles ----------
  const roleDefs = [
    { key: 'OWNER', name: 'مالک / مدیرعامل', color: '#8a6d1f', description: 'آقای جواد نوری' },
    { key: 'GENERAL_MANAGER', name: 'مدیر فروشگاه', color: '#5a7d4f', description: 'مدیریت کل فروشگاه' },
    { key: 'OPERATION_MANAGER', name: 'مدیر عملیات', color: '#a35d3f', description: 'مدیریت عملیات و گردش کار' },
    { key: 'IT_ADMIN', name: 'مدیر فناوری اطلاعات', color: '#4f6d7d', description: 'مدیریت پلتفرم' },
    { key: 'PRODUCT_MANAGER', name: 'مدیر محصول', color: '#7d4f6d', description: 'مدیریت انبار و چیدمان' },
    { key: 'ACCOUNTANT', name: 'حسابدار ارشد', color: '#6d6a2f', description: 'حسابداری و هلو' },
    { key: 'INVENTORY_SUPERVISOR', name: 'سرپرست انبار', color: '#2f6d5a', description: 'کنترل موجودی و انبار' },
    { key: 'DELIVERY_RECEIVER', name: 'تحویل‌گیرنده کالا', color: '#7d5a2f', description: 'پذیرش مرسولات صبح' },
    { key: 'HEAD_CASHIER', name: 'سرصندوق‌دار', color: '#5a5a7d', description: 'مدیریت صندوق' },
    { key: 'CASHIER', name: 'صندوق‌دار', color: '#5a5a7d', description: 'صندوق فروش' },
    { key: 'SALESPERSON', name: 'فروشنده', color: '#7d2f4f', description: 'فروش و مشاوره مشتری' },
    { key: 'MERCHANDISER', name: 'چیدمان‌دار', color: '#2f7d4f', description: 'چیدمان قفسه‌ها' },
  ]
  for (const r of roleDefs) {
    await db.role.upsert({ where: { key: r.key }, update: r, create: r })
  }

  // ---------- Users ----------
  const users = [
    { name: 'جواد نوری', roles: ['OWNER'], primaryRole: 'OWNER', color: '#8a6d1f' },
    { name: 'سارا نوری', roles: ['PRODUCT_MANAGER'], primaryRole: 'PRODUCT_MANAGER', color: '#7d4f6d' },
    { name: 'خانم لطفی', roles: ['GENERAL_MANAGER'], primaryRole: 'GENERAL_MANAGER', color: '#5a7d4f' },
    { name: 'کیانوش صفاپور', roles: ['OPERATION_MANAGER', 'IT_ADMIN'], primaryRole: 'OPERATION_MANAGER', color: '#a35d3f' },
    { name: 'خانم درویشی', roles: ['ACCOUNTANT'], primaryRole: 'ACCOUNTANT', color: '#6d6a2f' },
    { name: 'خانم محمدی', roles: ['HEAD_CASHIER'], primaryRole: 'HEAD_CASHIER', color: '#5a5a7d' },
    { name: 'خانم شریفی', roles: ['CASHIER'], primaryRole: 'CASHIER', color: '#6a6a8a' },
    { name: 'خانم عرب‌نژاد', roles: ['CASHIER'], primaryRole: 'CASHIER', color: '#7a7a9a' },
    { name: 'آقای محمدی', roles: ['INVENTORY_SUPERVISOR', 'DELIVERY_RECEIVER'], primaryRole: 'INVENTORY_SUPERVISOR', color: '#2f6d5a' },
    { name: 'خانم ایران‌نژاد', roles: ['DELIVERY_RECEIVER', 'MERCHANDISER', 'SALESPERSON'], primaryRole: 'DELIVERY_RECEIVER', color: '#7d5a2f' },
    { name: 'خانم یادگاری', roles: ['SALESPERSON'], primaryRole: 'SALESPERSON', color: '#7d2f4f' },
    { name: 'خانم سعدی', roles: ['MERCHANDISER', 'SALESPERSON'], primaryRole: 'MERCHANDISER', color: '#3f7d5f' },
    { name: 'خانم غلامحسینی', roles: ['MERCHANDISER'], primaryRole: 'MERCHANDISER', color: '#2f7d4f' },
    { name: 'خانم میرزایی', roles: ['MERCHANDISER'], primaryRole: 'MERCHANDISER', color: '#4f8d5f' },
    { name: 'خانم تقی‌زاده', roles: ['MERCHANDISER'], primaryRole: 'MERCHANDISER', color: '#5f9d6f' },
    { name: 'آقای علیخانی', roles: ['MERCHANDISER'], primaryRole: 'MERCHANDISER', color: '#6fad7f' },
  ]
  const userIds: Record<string, string> = {}
  for (const u of users) {
    const existing = await db.user.findFirst({ where: { name: u.name } })
    const data = { ...u, roles: JSON.stringify(u.roles), pinHash: await bcrypt.hash('1234', 10), active: true }
    if (existing) {
      await db.user.update({ where: { id: existing.id }, data })
      userIds[u.name] = existing.id
    } else {
      const created = await db.user.create({ data })
      userIds[u.name] = created.id
    }
  }

  // ---------- Companies ----------
  const companyDefs = ['کاله', 'پگاه', 'میهن', 'دومینو', 'چی توز', 'صنایت', 'مزمز', 'نیوشا', 'گلها', 'زرین‌فام', 'پروتئین دلبر', 'کشت و صنعت گلبرگ کرمان']
  const companies: Record<string, string> = {}
  for (const c of companyDefs) {
    const existing = await db.company.findFirst({ where: { name: c } })
    if (existing) companies[c] = existing.id
    else {
      const created = await db.company.create({ data: { name: c } })
      companies[c] = created.id
    }
  }

  // ---------- Suppliers ----------
  const supplierDefs = [
    { name: 'پخش سپهر کرمان', phone: '034-32445566', contactName: 'آقای رضایی', type: 'DISTRIBUTOR', paymentType: 'CHEQUE', companies: ['کاله', 'پگاه'] },
    { name: 'نمایندگی میهن کرمان', phone: '034-32112233', contactName: 'خانم احمدی', type: 'BOTH', paymentType: 'CASH_ON_DELIVERY', companies: ['میهن', 'نیوشا'] },
    { name: 'پخش دومینو جنوبشرق', phone: '034-32255441', contactName: 'آقای کریمی', type: 'DISTRIBUTOR', paymentType: 'CHEQUE', companies: ['دومینو', 'مزمز'] },
    { name: 'پروتئین دلبر کرمان', phone: '034-33778899', contactName: 'آقای حسینی', type: 'MANUFACTURER', paymentType: 'CASH_ON_DELIVERY', companies: ['پروتئین دلبر'] },
    { name: 'پخش زرین کرمان', phone: '034-32556677', contactName: 'خانم موسوی', type: 'DISTRIBUTOR', paymentType: 'CHEQUE', companies: ['زرین‌فام', 'گلها', 'صنایت'] },
    { name: 'کشت و صنعت گلبرگ کرمان', phone: '034-34112200', contactName: 'آقای نوری (خویشاوند)', type: 'MANUFACTURER', paymentType: 'CHEQUE', companies: ['کشت و صنعت گلبرگ کرمان'] },
  ]
  const supplierIds: Record<string, string> = {}
  for (const s of supplierDefs) {
    const existing = await db.supplier.findFirst({ where: { name: s.name } })
    const companyIds = s.companies.map((c) => companies[c]).filter(Boolean)
    const data = { name: s.name, phone: s.phone, contactName: s.contactName, type: s.type, paymentType: s.paymentType, companies: { connect: companyIds.map((id) => ({ id })) } }
    if (existing) {
      await db.supplier.update({ where: { id: existing.id }, data })
      supplierIds[s.name] = existing.id
    } else {
      const created = await db.supplier.create({ data })
      supplierIds[s.name] = created.id
    }
  }

  // ---------- Products ----------
  const products = [
    { name: 'شیر پرچرب کاله ۱ لیتری', barcode: '6260111000017', price: 38000, cost: 32000, stock: 48, minStock: 24, unit: 'عدد', category: 'لبنیات', company: 'کاله', isWeight: false },
    { name: 'شیر کم‌چرب کاله ۵۰۰ میلی‌لیتری', barcode: '6260111000024', price: 21000, cost: 18000, stock: 12, minStock: 24, unit: 'عدد', category: 'لبنیات', company: 'کاله', isWeight: false },
    { name: 'شیر شکلات ۲/۵ لیتری کاله', barcode: '6260111000031', price: 95000, cost: 82000, stock: 8, minStock: 10, unit: 'عدد', category: 'لبنیات', company: 'کاله', isWeight: false },
    { name: 'ماست سفید کاله ۹۰۰ گرمی', barcode: '6260111000048', price: 58000, cost: 50000, stock: 20, minStock: 15, unit: 'عدد', category: 'لبنیات', company: 'کاله', isWeight: false },
    { name: 'پنیر لیقوان پگاه ۴۰۰ گرمی', barcode: '6260112000016', price: 145000, cost: 128000, stock: 6, minStock: 12, unit: 'عدد', category: 'لبنیات', company: 'پگاه', isWeight: false },
    { name: 'دوغ پگاه ۱/۵ لیتری', barcode: '6260112000023', price: 32000, cost: 27000, stock: 30, minStock: 20, unit: 'عدد', category: 'لبنیات', company: 'پگاه', isWeight: false },
    { name: 'آبمیوه پرتقال میهن ۱ لیتری', barcode: '6260113000015', price: 85000, cost: 75000, stock: 18, minStock: 12, unit: 'عدد', category: 'نوشیدنی', company: 'میهن', isWeight: false },
    { name: 'نوشابه دومینو ۱/۵ لیتری', barcode: '6260114000014', price: 40000, cost: 34000, stock: 60, minStock: 36, unit: 'عدد', category: 'نوشیدنی', company: 'دومینو', isWeight: false },
    { name: 'آب معدنی دومینو ۱/۵ لیتری', barcode: '6260114000021', price: 12000, cost: 9000, stock: 96, minStock: 48, unit: 'عدد', category: 'نوشیدنی', company: 'دومینو', isWeight: false },
    { name: 'چیپس مزمز نمکی', barcode: '6260115000013', price: 25000, cost: 21000, stock: 40, minStock: 24, unit: 'بسته', category: 'تنقلات', company: 'مزمز', isWeight: false },
    { name: 'پفک مزمز پنیری', barcode: '6260115000020', price: 28000, cost: 23500, stock: 5, minStock: 24, unit: 'بسته', category: 'تنقلات', company: 'مزمز', isWeight: false },
    { name: 'سوسیس کوکتل دلبر ۵۰۰ گرمی', barcode: '6260116000012', price: 135000, cost: 120000, stock: 14, minStock: 10, unit: 'بسته', category: 'پروتئین', company: 'پروتئین دلبر', isWeight: false },
    { name: 'مرغ دلبر (وزنی)', barcode: '6260116000029', price: 320000, cost: 285000, stock: 25, minStock: 15, unit: 'کیلوگرم', category: 'پروتئین', company: 'پروتئین دلبر', isWeight: true },
    { name: 'کالباس گوشت دلبر ۴۰۰ گرمی', barcode: '6260116000036', price: 155000, cost: 138000, stock: 9, minStock: 10, unit: 'عدد', category: 'پروتئین', company: 'پروتئین دلبر', isWeight: false },
    { name: 'برنج گلبرگ هاشمی ۱۰ کیلویی', barcode: '6260117000011', price: 1250000, cost: 1150000, stock: 7, minStock: 6, unit: 'کیسه', category: 'خواروبار', company: 'کشت و صنعت گلبرگ کرمان', isWeight: false },
    { name: 'روغن سرخ‌کردنی گلها ۱/۶ لیتری', barcode: '6260118000010', price: 295000, cost: 268000, stock: 22, minStock: 12, unit: 'عدد', category: 'خواروبار', company: 'گلها', isWeight: false },
    { name: 'رب گوجه‌فرنگی چین چین ۸۰۰ گرمی', barcode: '6260119000019', price: 98000, cost: 87000, stock: 16, minStock: 8, unit: 'عدد', category: 'خواروبار', company: 'صنایت', isWeight: false },
    { name: 'ماکارونی زرین‌فام ۷۰۰ گرمی', barcode: '6260120000018', price: 45000, cost: 39000, stock: 35, minStock: 20, unit: 'بسته', category: 'خواروبار', company: 'زرین‌فام', isWeight: false },
    { name: 'چای نیوشا ممتاز ۵۰۰ گرمی', barcode: '6260121000017', price: 420000, cost: 380000, stock: 11, minStock: 6, unit: 'عدد', category: 'خواروبار', company: 'نیوشا', isWeight: false },
    { name: 'شامپو klar ۴۰۰ میلی‌لیتری', barcode: '6260122000016', price: 185000, cost: 160000, stock: 0, minStock: 6, unit: 'عدد', category: 'بهداشتی', company: 'زرین‌فام', isWeight: false },
  ]
  for (const p of products) {
    const existing = await db.product.findFirst({ where: { name: p.name } })
    const data = {
      name: p.name,
      holooName: p.name,
      barcode: p.barcode,
      barcodes: JSON.stringify([p.barcode]),
      price: p.price,
      cost: p.cost,
      stock: p.stock,
      minStock: p.minStock,
      unit: p.unit,
      category: p.category,
      companyId: companies[p.company] || null,
      isWeight: p.isWeight,
    }
    if (existing) await db.product.update({ where: { id: existing.id }, data })
    else await db.product.create({ data })
  }

  // ---------- Iranian Holidays 1404 (known fixed + major) ----------
  const today = new Date(Date.now() + 3.5 * 3600000)
  const tj = jalaali.toJalaali(today.getFullYear(), today.getMonth() + 1, today.getDate())
  const holidays = [
    { date: '1404/10/04', title: 'ولادت حضرت فاطمه معصومه (س) - روز دختران' },
    { date: '1404/10/13', title: 'تشکیل نهضت سوادآموزی' },
    { date: '1404/10/20', title: 'شهادت حضرت فاطمه (س)' },
    { date: '1404/11/22', title: 'پیروزی انقلاب اسلامی' },
    { date: '1404/12/29', title: 'روز ملی شدن صنعت نفت' },
    { date: '1405/01/01', title: 'نوروز' },
    { date: '1405/01/02', title: 'عید نوروز' },
    { date: '1405/01/03', title: 'عید نوروز' },
    { date: '1405/01/04', title: 'عید نوروز' },
    { date: '1405/01/12', title: 'روز جمهوری اسلامی' },
    { date: '1405/01/13', title: 'روز طبیعت' },
    { date: '1405/02/01', title: 'روز بزرگداشت سعدی' },
    { date: '1405/02/25', title: 'روز بزرگداشت فردوسی' },
    { date: '1405/03/14', title: 'رحلت امام خمینی' },
    { date: '1405/03/15', title: 'قیام ۱۵ خرداد' },
  ]
  for (const h of holidays) {
    await db.holiday.upsert({ where: { date: h.date }, update: h, create: h })
  }

  // ---------- Settings ----------
  const settings = [
    { key: 'store_name', value: 'هایپر زیتون کرمان' },
    { key: 'low_stock_alerts', value: 'true' },
    { key: 'overlook_threshold', value: '1000' },
    { key: 'default_delivery_days', value: '1' },
  ]
  for (const s of settings) {
    await db.setting.upsert({ where: { key: s.key }, update: s, create: s })
  }

  // ---------- Sample SOPs ----------
  const sops = [
    {
      title: 'دریافت مرسولات صبحگاهی',
      content: 'رویه استاندارد دریافت کالا از نمایندگان در شیفت صبح:\n۱. پیش از رسیدن نماینده، سفارشات امروز را در سامانه بررسی کنید.\n۲. نسبت به فاکتور کاغذی، اقلام را شمارش کنید.\n۳. اقلام وزنی (گوشت، سوسیس، برنج) را توزین و کنترل قیمت کنید.\n۴. اقلام معیوب (تاریخ نزدیک، پلمب باز، قیمت اشتباه) را در سامانه «رد» بزنید و در فاکتور قید کنید.\n۵. پس از ثبت، سفارش را «دریافت شده» بزنید تا به سرپرست انبار ارجاع شود.',
      category: 'انبار و دریافت',
      steps: JSON.stringify(['بررسی سفارشات امروز در سامانه', 'شمارش اقلام مطابق فاکتور', 'توزین اقلام وزنی', 'علامت‌گذاری اقلام معیوب', 'ثبت دریافت در سامانه']),
      createdById: userIds['آقای محمدی'],
    },
    {
      title: 'چیدمان قفسه‌های لبنیات',
      content: 'اصول چیدمان لبنیات:\n- محصولات با تاریخ انقضای نزدیک‌تر جلوتر قرار گیرند (FIFO).\n- برندهای پرفروش در ارتفاع دید مشتری (طبقه دوم و سوم).\n- قفسه‌ها هرگز خالی نمانند؛ در صورت کمبود از انبار درخواست بزنید.\n- برچسب قیمت‌ها همیشه به‌روز باشد.',
      category: 'چیدمان',
      steps: JSON.stringify(['کنترل تاریخ انقضا', 'چیدمان FIFO', 'درخواست جبران از انبار', 'به‌روزرسانی برچسب قیمت‌ها']),
      createdById: userIds['خانم لطفی'],
    },
    {
      title: 'پذیرش مشتری و ثبت فروش پیشنهادی',
      content: 'برای ثبت سفارش مشتری در سامانه:\n۱. اطلاعات مشتری (نام و تلفن) را دریافت یا از مشتریان ثابت انتخاب کنید.\n۲. کالاها را با اسکن بارکد یا جستجو اضافه کنید.\n۳. سفارش را برای صندوق ارسال کنید تا پیش از رسیدن مشتری آماده شود.\n۴. اگر کالایی موجود نبود، آن را در «درخواست‌های مشتریان» ثبت کنید.',
      category: 'فروش',
      steps: JSON.stringify(['دریافت اطلاعات مشتری', 'افزودن کالاها', 'ارسال به صندوق', 'ثبت کالاهای ناموجود']),
      createdById: userIds['خانم لطفی'],
    },
  ]
  for (const s of sops) {
    const existing = await db.sOP.findFirst({ where: { title: s.title } })
    if (!existing) await db.sOP.create({ data: s })
  }

  // ---------- Sample tasks ----------
  const taskCount = await db.task.count()
  if (taskCount === 0) {
    await db.task.createMany({
      data: [
        { title: 'بررسی تاریخ انقضای لبنیات یخچال شماره ۲', description: 'اقلام نزدیک به انقضا جدا و برچسب تخفیف بخورد.', assignedTo: userIds['خانم سعدی'], assigneeType: 'USER', createdById: userIds['خانم لطفی'], priority: 'HIGH', dueDate: `${tj.jy}/${String(tj.jm).padStart(2, '0')}/${String(Math.min(tj.jd + 1, 29)).padStart(2, '0')}` },
        { title: 'شمارش موجودی قفسه شوینده‌ها', description: 'کنترل موجودی قفسه با سامانه و اعلام مغایرت.', assignedTo: userIds['آقای علیخانی'], assigneeType: 'USER', createdById: userIds['سارا نوری'], priority: 'MEDIUM', dueDate: `${tj.jy}/${String(tj.jm).padStart(2, '0')}/${String(Math.min(tj.jd + 2, 29)).padStart(2, '0')}` },
        { title: 'نظافت یخچال‌های فروشگاه', description: '', assignedTo: 'MERCHANDISER', assigneeType: 'ROLE', createdById: userIds['خانم لطفی'], priority: 'LOW', dueDate: `${tj.jy}/${String(tj.jm).padStart(2, '0')}/${String(Math.min(tj.jd + 3, 29)).padStart(2, '0')}` },
      ],
    })
  }

  // ---------- Sample wall posts ----------
  const wallCount = await db.wallPost.count()
  if (wallCount === 0) {
    await db.wallPost.createMany({
      data: [
        { authorId: userIds['خانم لطفی'], content: 'از این هفته صندوق شماره ۳ نیز فعال است. لطفاً هماهنگی شیفت‌ها را رعایت کنید. 🌟', pinned: true },
        { authorId: userIds['آقای محمدی'], content: 'یادآوری: اقلام وزنی حتماً قبل از امضای رسید توزین شوند.', pinned: false },
        { authorId: userIds['خانم یادگاری'], content: 'مشتریان امروز درباره ماست یونانی سؤال می‌پرسیدند؛ پیشنهاد می‌کنم سفارش داده شود. 🥛', pinned: false },
      ],
    })
  }

  console.log('✅ Seed complete!')
  console.log(`Users: ${await db.user.count()}, Products: ${await db.product.count()}, Suppliers: ${await db.supplier.count()}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
