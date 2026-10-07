/**
 * Round-14 foundation seed — idempotent (upsert), safe on live DB.
 * Adds: root ADMIN account, Role rows (builtin + custom example), Zones,
 * Personnel records for staff, default NotifRules, KB articles, oversight.
 * Run: bun run prisma/seed-14.ts
 */
import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'

const db = new PrismaClient()
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

const BUILTIN_ROLES = [
  { key: 'OWNER', name: 'مالک', category: 'مدیریت ارشد', color: '#c9a227', caps: ['*'], description: 'دسترسی کامل و غیرقابل محدودکردن — همهٔ بخش‌ها' },
  { key: 'GM', name: 'مدیر کل', category: 'مدیریت ارشد', color: '#0e7a4a', caps: ['*'], description: 'دسترسی کامل — همهٔ بخش‌ها' },
  { key: 'OM', name: 'مدیر عملیات', category: 'مدیریت ارشد', color: '#0e7a4a', caps: ['*'], description: 'دسترسی کامل — همهٔ بخش‌ها' },
  { key: 'ADMIN', name: 'مدیر سامانه (root)', category: 'فناوری', color: '#334155', caps: ['*'], description: 'حساب مخفی — ورود با نام کاربری و رمز؛ داده‌لاگ و پشتیبان‌گیری' },
  { key: 'PM', name: 'مدیر محصول', category: 'مدیریت', color: '#77934a', caps: ['orders.approve', 'cheques.limits', 'crm.manage', 'kb.manage', 'settings.manage'], description: 'تأیید سفارش، سقف پرداخت، کمپین‌ها' },
  { key: 'ACC', name: 'حسابدار ارشد', category: 'مالی', color: '#8a6d10', caps: ['zonecount.confirm', 'cheques.create', 'holidays.manage', 'leaves.approve', 'archive.manage'], description: 'نظارت بر آمار شمارش، چک، تعطیلات، آرشیو' },
  { key: 'HC', name: 'سرصندوقدار', category: 'فروش', color: '#c96f4a', caps: ['crm.manage', 'leaves.approve'], description: 'مدیریت صندوق و تیم فروش' },
  { key: 'CASHIER', name: 'صندوقدار', category: 'فروش', color: '#c96f4a', caps: [], description: 'صندوق و پیش‌ثبت فروش' },
  { key: 'SK', name: 'سرپرست انبار', category: 'انبار', color: '#0e7a4a', caps: ['archive.manage', 'leaves.approve'], description: 'انبار، تأیید مرسوله، آرشیو' },
  { key: 'MERCH', name: 'مسئول چیدمان', category: 'فروشگاه', color: '#77934a', caps: [], description: 'چیدمان قفسه و شمارش زون' },
  { key: 'SALES', name: 'فروشنده', category: 'فروش', color: '#0e7a4a', caps: [], description: 'فروش و پیشنهاد به مشتری' },
  { key: 'IT', name: 'مدیر فناوری اطلاعات', category: 'فناوری', color: '#334155', caps: ['users.manage', 'roles.manage', 'db.reset', 'db.import', 'holidays.manage', 'notif.rules', 'kb.manage', 'tour.reset', 'oversight.manage', 'settings.manage'], description: 'پیکربندی سامانه، نقش‌ها، داده‌ها، تعطیلات' },
]

const NOTIF_RULES = [
  { key: 'leave.requested', name: 'درخواست مرخصی جدید → مدیریت', event: 'leave.requested', severity: 'important', icon: '📅', targets: { roles: ['GM'], fieldRef: 'approver' }, note: 'به‌صورت پیش‌فرض مدیر کل مطلع می‌شود؛ ادمین می‌تواند مخاطب را عوض کند' },
  { key: 'leave.decided', name: 'پاسخ مرخصی → درخواست‌کننده', event: 'leave.decided', severity: 'important', icon: '✅', targets: { roles: [], fieldRef: 'submitter' }, note: 'پاسخ نهایی به خود کاربر اعلام می‌شود' },
  { key: 'urgent.new', name: 'پرسش فوری جدید → مدیریت عملیات', event: 'urgent.new', severity: 'critical', icon: '⚡', targets: { roles: ['OM', 'GM'] }, note: 'بدون وقفه در کار مدیر — در مرکز اعلان‌ها دیده می‌شود' },
  { key: 'urgent.answered', name: 'پاسخ پرسش فوری → پرسشگر', event: 'urgent.answered', severity: 'important', icon: '💬', targets: { roles: [], fieldRef: 'asker' }, note: '' },
  { key: 'zonecount.mismatch', name: 'مغایرت شمارش زون → انبار و مدیریت', event: 'zonecount.mismatch', severity: 'important', icon: '⚖️', targets: { roles: ['SK', 'OM'], fieldRef: 'oversight' }, note: 'ناظرِ تعیین‌شده (مثلاً حسابدار) هم مطلع می‌شود' },
  { key: 'customer.request.new', name: 'درخواست کالای جدید مشتری → مدیر محصول', event: 'customer.request.new', severity: 'info', icon: '🛒', targets: { roles: ['PM', 'OM'] }, note: 'تصمیم سفارش با مدیریت' },
  { key: 'complaint.new', name: 'شکایت مشتری → مدیریت', event: 'complaint.new', severity: 'critical', icon: '📣', targets: { roles: ['OM', 'HC'] }, note: 'حل زیر ۲۴ ساعت — service recovery' },
  { key: 'engagement.sampled', name: 'نمونهٔ راستی‌آزمایی پیشنهاد فروش → ناظر', event: 'engagement.sampled', severity: 'info', icon: '🔍', targets: { roles: ['OM', 'HC'], fieldRef: 'oversight' }, note: 'نمونه‌گیری تصادفی سیستم (۲۰٪)' },
  { key: 'extra.activity', name: 'فعالیت ثبت‌شدهٔ فراتر از وظیفه → مدیریت', event: 'extra.activity', severity: 'info', icon: '🌟', targets: { roles: ['OM', 'HC'] }, note: 'برای قدردانی و امتیاز' },
  { key: 'db.reset', name: 'بازنشانی/ورود داده → اطلاع به مدیران', event: 'db.reset', severity: 'critical', icon: '🗄️', targets: { roles: ['GM', 'OM'] }, note: 'شفافیت تغییرات کلان داده' },
  { key: 'holiday.changed', name: 'تغییر تعطیلی رسمی → همه مدیران', event: 'holiday.changed', severity: 'important', icon: '🗓️', targets: { roles: ['GM', 'OM', 'ACC'] }, note: 'چک‌ها و مرخصی‌ها به تعطیلی وابسته‌اند' },
]

const KB_ARTICLES = [
  { slug: 'quick-start', title: 'شروع سریع — اولین روز کاری در سامانه', category: 'شروع', sortOrder: 1, tags: ['مقدماتی'], body: '## ورود\nروی آواتار خود بزنید و PIN (پیش‌فرض ۱۲۳۴) را وارد کنید.\n\n## داشبورد\nکارت‌ها همه کلیک‌پذیرند — روی هر آمار بزنید تا جزئیاتش باز شود.\n\n## فرمان‌یاب\nبا Ctrl+K هر بخشی را در یک ثانیه پیدا کنید.\n\n## حالت آموزشی\nاز نوار کنار «🎓 تور آموزشی» را بزنید؛ در حالت آموزشی هیچ داده‌ای تغییر نمی‌کند.' },
  { slug: 'order-pipeline', title: 'چرخهٔ سفارش از ثبت تا حسابداری', category: 'عملیات', sortOrder: 2, tags: ['سفارش', 'هلو'], body: '1. **ثبت سفارش** — از تأمین‌کننده انتخاب کنید؛ سامانه آخرین حاشیه سود همان کالا از همان تأمین‌کننده را نشان می‌دهد.\n2. **تأیید** — مدیر سفارش را تأیید می‌کند.\n3. **دریافت مرسوله** — اسکن بارکد، تعداد واقعی، قیمت چاپ‌شده و تاریخ انقضا.\n4. **تأیید انبار** — انباردار صحت را تأیید و موجودی به‌روز می‌شود.\n5. **حسابداری** — شماره فاکتور هلو ثبت و خروجی اکسل گرفته می‌شود.\n\nفاکتور و رسید هلو به سند آرشیو همان سفارش چسبانده می‌شود تا جست‌وجو در یک ثانیه ممکن باشد.' },
  { slug: 'archive-guide', title: 'آرشیو اسناد — منطق حرفه‌ای بایگانی', category: 'مالی', sortOrder: 3, tags: ['آرشیو', 'ISO 15489'], body: 'سامانه بر پایهٔ استاندارد ISO 15489 و اصول ARMA ساخته شده:\n- **کد دائمی سند**: هر سند یک کد یکتا می‌گیرد که هرگز تغییر نمی‌کند.\n- **مسیر فیزیکی**: کابینت › طبقهٔ › زونکن › جایگاه.\n- **امانی**: هنگام بردن سند، «راهنمای بیرون‌بر» جایگزین می‌شود و مهلت بازگشت ثبت می‌گردد.\n- **نگهداری ۱۰ ساله**: بر پایهٔ مادهٔ ۱۳ قانون تجارت؛ دفع فقط با دو تأیید (جداسازی وظایف).\n- **رخدادهای سند**: تحویل، پرداخت (POS/چک)، مرجوعی، ثبت هلو — همه با نام نمایندهٔ طرف حساب.' },
  { slug: 'zone-count', title: 'شمارش روزانهٔ زون — چرا عدد سیستم را نمی‌بینید؟', category: 'انبار', sortOrder: 4, tags: ['شمارش', 'زون'], body: 'روش شمارش کور (Blind Count) از سوگیریِ لنگر (anchoring bias) جلوگیری می‌کند: وقتی عدد سیستم را ببینید، ناخودآگاه همان را ثبت می‌کنید و خطا پنهان می‌ماند.\n\nاگر عدد شما با هلو نخواند:\n1. سامانه می‌گوید «دوباره بشمار».\n2. اگر باز هم متفاوت بود، دلیلش را بنویسید (شکستگی، جابه‌جایی، خطای ثبت...).\n3. ناظر (مثلاً حسابدار) آمار را تأیید می‌کند و مدیر اصلاح موجودی را می‌بیند.' },
  { slug: 'cheques-guide', title: 'چک و پرداخت — اعتبار بازار ما', category: 'مالی', sortOrder: 5, tags: ['چک', 'اعتبار'], body: 'از قانون جدید چک (۱۳۹۷) هر چک در **سامانه صیاد** ثبت است و سابقهٔ برگشتی برای همه قابل رؤیت است. پس:\n- سقف روزانه/هفتگی/ماهانه پرداخت را رعایت کنید (سامانه پیشنهاد می‌دهد).\n- چک روی جمعه و تعطیلات نیفتد — مادهٔ ۳۱۵ قانون تجارت به روز کاری بعد می‌رود.\n- برای سفارش‌های متوسط ۲–۳ چک و برای خیلی سنگین تا ۵ چک منطقی است.\n- «ماشین‌حساب اعتبار» سه گزینهٔ زمان‌بندی با امتیاز اعتبار پیشنهاد می‌دهد.' },
  { slug: 'crm-guide', title: 'CRM — مشتری ما یک آدم است، نه یک فیش', category: 'فروش', sortOrder: 6, tags: ['CRM', 'VIP'], body: '- **تیئرها**: VIP، وفادار، تازه‌وارد، در خطر، غایب — خودکار از الگوی خرید (RFM).\n- **تولد**: هدیهٔ تولد بهترین لحظهٔ عاطفه است (پژوهش Experian: ۴۸۱٪ بازتری).\n- **پیشنهادها**: فروشنده پیشنهادش را ثبت می‌کند؛ سیستم به‌صورت تصادفی ۲۰٪ را راستی‌آزمایی می‌کند تا صداقت حفظ شود.\n- **شکایت**: حل زیر ۲۴ ساعت + جبران کوچک = مشتری وفادارتر از قبل (service recovery paradox).' },
  { slug: 'keyboard-shortcuts', title: 'میان‌برها و نکات سرعت', category: 'شروع', sortOrder: 7, tags: ['میان‌بر'], body: '- `Ctrl+K` فرمان‌یاب\n- اسکنر بارکد در دریافت و ماشین‌حساب قیمت\n- چاپ: برگهٔ سفارش، لیبل قفسه، صبح‌نامه، برگهٔ کنترل قیمت\n- «نمایش بیشتر» در فهرست‌های بلند' },
  { slug: 'roles-guide', title: 'نقش‌ها و دسترسی‌ها — سیستم چندنقشی', category: 'مدیریت', sortOrder: 8, tags: ['RBAC'], body: 'هر همکار می‌تواند **چند نقش** هم‌زمان داشته باشد (مثلاً فروشنده + مسئول شبکه‌های اجتماعی). مدیر سامانه نقش تازه با دسترسی دلخواه می‌سازد:\n1. مدیریت سامانه ← نقش‌ها و دسترسی‌ها\n2. «نقش جدید» — نام، دسته، رنگ\n3. تیک بخش‌ها (views) و دسترسی‌های عملیاتی (caps)\n4. از تب کاربران، نقش را به افراد بدهید.\n\nمالک، مدیر کل، مدیر عملیات و مدیر سامانه همیشه به همهٔ بخش‌ها دسترسی دارند و محدود نمی‌شوند.' },
  { slug: 'holiday-calendar', title: 'سه تقویم هم‌زمان: شمسی، قمری، میلادی', category: 'عمومی', sortOrder: 9, tags: ['تقویم'], body: 'سامانه سه تقویم را هم‌زمان نشان می‌دهد: **شمسی** (پیش‌فرض)، **قمری** (برای مناسبت‌ها و تعطیلات دینی) و **میلادی** (شرکای بین‌المللی).\n- روزهای تعطیل رسمی از منابع رسمی به‌روز می‌شوند و ادمین می‌تواند اصلاح کند.\n- در تقویم چک‌ها، هر روز عدد قمری کوچک هم دارد.\n- اندازهٔ قلم تقویم از «شخصی‌سازی» در نوار بالا قابل بزرگ‌کردن است.' },
  { slug: 'sandbox-tour', title: 'حالت آموزشی و تور راهنما', category: 'شروع', sortOrder: 10, tags: ['آموزش'], body: 'تور آموزشی ۸ ایستگاه دارد. اگر مدیر تور شما را بازنشانی کند، دوباره نمایش داده می‌شود. هر زمان هم می‌توانید از نوار کناری «🎓» تور را از نو ببینید.\n\nحالت آموزشی (سندباکس) تمام نوشتن‌ها را شبیه‌سازی می‌کند — برای تمرین امن با دادهٔ واقعی.' },
]

async function main() {
  console.log('Round-14 foundation seed…')

  // 1) root ADMIN
  const admin = await db.user.upsert({
    where: { username: 'admin' },
    update: { hidden: true, role: 'ADMIN', active: true, password: sha('Zeytoon@1404') },
    create: {
      name: 'مدیر سامانه',
      username: 'admin',
      pin: sha('no-pin-auth'),
      role: 'ADMIN',
      hidden: true,
      password: sha('Zeytoon@1404'),
      color: '#334155',
      secondaryRoles: '[]',
      roleIds: '["ADMIN"]',
    },
  })
  console.log('✓ root admin ready (admin / Zeytoon@1404)', admin.id)

  // 2) Roles
  for (const r of BUILTIN_ROLES) {
    await db.role.upsert({
      where: { key: r.key },
      update: { name: r.name, category: r.category, color: r.color, builtin: true, active: true, description: r.description, permissions: JSON.stringify({ views: [], caps: r.caps }) },
      create: { key: r.key, name: r.name, category: r.category, color: r.color, builtin: true, active: true, description: r.description, permissions: JSON.stringify({ views: [], caps: r.caps }) },
    })
  }
  await db.role.upsert({
    where: { key: 'SOCIAL_MEDIA' },
    update: { active: true },
    create: {
      key: 'SOCIAL_MEDIA', name: 'مسئول شبکه‌های اجتماعی', category: 'بازاریابی', color: '#c96f4a', builtin: false,
      description: 'مدیریت پیج، تولید محتوا، هماهنگی کمپین‌های CRM',
      permissions: JSON.stringify({ views: ['crm', 'wall', 'kb', 'feedback'], caps: ['crm.manage', 'kb.manage'] }),
    },
  })
  console.log('✓ roles seeded (13)')

  // 3) give نگار یادگاری the custom role as a live multi-role example
  const negar = await db.user.findUnique({ where: { name: 'نگار یادگاری' } })
  if (negar) {
    const cur = JSON.parse(negar.roleIds || '[]') as string[]
    if (!cur.includes('SOCIAL_MEDIA')) await db.user.update({ where: { id: negar.id }, data: { roleIds: JSON.stringify([...cur, 'SOCIAL_MEDIA']) } })
    console.log('✓ نگار یادگاری = SALES + SOCIAL_MEDIA (multi-role demo)')
  }

  // 4) Zones (Underhill typing + ABC cadence) with owners from MERCH staff
  const users = await db.user.findMany({ where: { active: true, hidden: false } })
  const byName = (n: string) => users.find((u) => u.name === n)
  const zones = [
    { name: 'لبنیات', type: 'PERISHABLE', criticality: 'A', countFrequency: 'WEEKLY', color: '#0e7a4a', owner: 'الهام سعدی', backup: 'مینا غلامحسینی' },
    { name: 'پروتئینی', type: 'PERISHABLE', criticality: 'A', countFrequency: 'WEEKLY', color: '#c96f4a', owner: 'مینا غلامحسینی', backup: 'سمیرا میرزایی' },
    { name: 'خواروبار', type: 'DRY', criticality: 'B', countFrequency: 'BIWEEKLY', color: '#77934a', owner: 'سمیرا میرزایی', backup: 'نگین تقی‌زاده' },
    { name: 'نوشیدنی', type: 'POWER_AISLE', criticality: 'B', countFrequency: 'BIWEEKLY', color: '#c9a227', owner: 'نگین تقی‌زاده', backup: 'امیرعلی علیخانی' },
    { name: 'آجیل و خشکبار', type: 'DRY', criticality: 'B', countFrequency: 'BIWEEKLY', color: '#8a6d10', owner: 'امیرعلی علیخانی', backup: 'الهام سعدی' },
    { name: 'بهداشتی', type: 'DRY', criticality: 'C', countFrequency: 'MONTHLY', color: '#0f766e', owner: 'نگار یادگاری', backup: 'مینا غلامحسینی' },
  ]
  for (const z of zones) {
    const o = byName(z.owner)
    const b = byName(z.backup)
    await db.zone.upsert({
      where: { name: z.name },
      update: { type: z.type, criticality: z.criticality, countFrequency: z.countFrequency, color: z.color, ownerId: o?.id || '', ownerName: z.owner, backupId: b?.id || '', backupName: z.backup, minStaff: 1 },
      create: { name: z.name, type: z.type, criticality: z.criticality, countFrequency: z.countFrequency, color: z.color, ownerId: o?.id || '', ownerName: z.owner, backupId: b?.id || '', backupName: z.backup, minStaff: 1 },
    })
  }
  console.log('✓ zones seeded (6)')

  // 5) Personnel records for every active user without one
  const jobTitles: Record<string, string> = {
    OWNER: 'مالک', GM: 'مدیر کل', OM: 'مدیر عملیات و فناوری اطلاعات', PM: 'مدیر محصول', ACC: 'حسابدار ارشد',
    HC: 'سرصندوقدار', CASHIER: 'صندوقدار', SK: 'سرپرست انبار', MERCH: 'مسئول چیدمان', SALES: 'فروشنده', ADMIN: 'مدیر سامانه',
  }
  const dept: Record<string, string> = { OWNER: 'مدیریت', GM: 'مدیریت', OM: 'مدیریت', PM: 'بازاریابی', ACC: 'مالی', HC: 'فروش', CASHIER: 'فروش', SK: 'انبار', MERCH: 'فروشگاه', SALES: 'فروش', ADMIN: 'فناوری' }
  const families = ['نوروزی', 'لطفی', 'صفاپور', 'درویشی', 'محمدی', 'شریفی', 'عرب‌نژاد', 'ایران‌نژاد', 'یادگاری', 'سعدی', 'غلامحسینی', 'میرزایی', 'تقی‌زاده', 'علیخانی']
  let pcount = 0
  for (const u of users) {
    if (!u.personnelId) {
      const firstName = u.name.split(' ')[0]
      const p = await db.personnel.create({
        data: {
          firstName,
          lastName: u.name.split(' ').slice(1).join(' ') || families[pcount % families.length],
          phone: u.phone || `0913${String(2000000 + pcount * 137173).slice(0, 7)}`,
          jobTitle: jobTitles[u.role] || 'همکار',
          department: dept[u.role] || 'فروشگاه',
          hireDate: `140${1 + (pcount % 4)}-0${1 + (pcount % 9)}-1${pcount % 9}`,
          birthday: `137${pcount % 10}-0${1 + (pcount % 9)}-1${pcount % 8}`,
          bankCard: `6037-991${pcount}-3456-7890`,
          shaba: `IR${String(12000000000000000000000000 + pcount * 977).slice(0, 24)}`,
          baseSalary: [12000000, 15000000, 18000000, 22000000, 32000000][pcount % 5],
          childSupport: 0,
          children: pcount % 3 === 0 ? JSON.stringify([{ name: `سارا ${u.name.split(' ')[0]}`, birthday: '1400-03-15', gender: 'دختر' }]) : '[]',
          emergencyContact: JSON.stringify({ name: families[pcount % families.length], phone: `0912${String(3000000 + pcount * 91919).slice(0, 7)}`, relation: 'خانواده' }),
          notes: '',
          userId: u.id,
        },
      })
      await db.user.update({ where: { id: u.id }, data: { personnelId: p.id } })
      pcount++
    }
  }
  console.log(`✓ personnel records created: ${pcount}`)

  // 6) NotifRules
  for (const r of NOTIF_RULES) {
    await db.notifRule.upsert({
      where: { key: r.key },
      update: {},
      create: { key: r.key, name: r.name, event: r.event, severity: r.severity, icon: r.icon, targets: JSON.stringify(r.targets), note: r.note, enabled: true },
    })
  }
  console.log(`✓ notif rules seeded (${NOTIF_RULES.length})`)

  // 7) KB articles
  for (const a of KB_ARTICLES) {
    await db.kbArticle.upsert({ where: { slug: a.slug }, update: { title: a.title, body: a.body, category: a.category, tags: JSON.stringify(a.tags), sortOrder: a.sortOrder }, create: { slug: a.slug, title: a.title, category: a.category, body: a.body, tags: JSON.stringify(a.tags), sortOrder: a.sortOrder } })
  }
  console.log(`✓ KB articles seeded (${KB_ARTICLES.length})`)

  // 8) Oversight — accountant oversees zone counts
  const acc = byName('مریم درویشی')
  await db.oversight.upsert({
    where: { domain: 'zonecount' },
    update: acc ? { userIds: JSON.stringify([acc.id]) } : {},
    create: { domain: 'zonecount', userIds: JSON.stringify(acc ? [acc.id] : []), note: 'حسابدار ارشد آمار شمارش پرسنل را تأیید می‌کند' },
  })
  console.log('✓ oversight: zonecount → حسابدار ارشد')

  console.log('Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
