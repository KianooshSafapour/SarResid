/** Domain constants: roles, statuses, Persian labels, RBAC caps */

export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'مالک',
  GM: 'مدیر کل',
  OM: 'مدیر عملیات',
  PM: 'مدیر محصول',
  ACC: 'حسابدار ارشد',
  HC: 'سرصندوقدار',
  CASHIER: 'صندوقدار',
  SK: 'سرپرست انبار',
  MERCH: 'مسئول چیدمان',
  SALES: 'فروشنده',
  IT: 'مدیر فناوری اطلاعات',
  ADMIN: 'مدیر سامانه (root)',
  SOCIAL_MEDIA: 'مسئول شبکه‌های اجتماعی',
}

export const SECONDARY_LABELS: Record<string, string> = {
  RECEIVER: 'تحویل‌گیر مرسوله',
  MERCH: 'چیدمان',
  SALES: 'فروش',
  IT: 'فناوری اطلاعات',
}

/** نقش‌های اجرایی — دسترسی کامل و غیرقابل محدودکردن به همهٔ بخش‌ها (مالک/مدیر کل/مدیر عملیات/مدیر سامانه) */
export const EXEC_ROLES = ['OWNER', 'GM', 'OM', 'ADMIN']
export function isExecRole(role: string): boolean {
  return EXEC_ROLES.includes(role)
}

/** دسترسی‌های عملیاتی ریز (cap) — به نقش‌ها وصل می‌شوند؛ نقش‌های اجرایی همه را دارند */
export const CAPS: Record<string, string> = {
  'users.manage': 'مدیریت کاربران (ایجاد/ویرایش/غیرفعال‌سازی)',
  'roles.manage': 'مدیریت نقش‌ها و دسترسی‌ها',
  'personnel.manage': 'مدیریت پروندهٔ پرسنل',
  'db.reset': 'بازنشانی و مدیریت داده‌ها',
  'db.import': 'ورود داده از اکسل/هلو با تطبیق ستون‌ها',
  'holidays.manage': 'مدیریت تعطیلات رسمی',
  'cheques.limits': 'تعیین سقف هزینه‌کرد پرداخت‌ها',
  'cheques.create': 'ثبت چک/پرداخت مستقل',
  'zonecount.confirm': 'تأیید آمار شمارش زون (نظارت)',
  'crm.manage': 'مدیریت کمپین‌ها و تیئرهای CRM',
  'notif.rules': 'ویرایش جریان اعلان‌ها (workflow)',
  'kb.manage': 'مدیریت دانشنامه',
  'tour.reset': 'بازنشانی تور آموزشی کاربران',
  'activity.view': 'مشاهدهٔ داده‌لاگ کامل (فقط root)',
  'archive.manage': 'مدیریت چرخهٔ حیات اسناد و امانی',
  'sales.claims.verify': 'راستی‌آزمایی پیشنهادهای فروش',
  'urgent.answer': 'پاسخ به پرسش‌های فوری',
  'settings.manage': 'مدیریت تنظیمات سامانه',
  'orders.approve': 'تأیید سفارش‌ها',
  'leaves.approve': 'تأیید مرخصی‌ها',
  'oversight.manage': 'تعیین ناظر برای هر بخش',
  'payroll.view': 'مشاهدهٔ حقوق و دستمزد',
  'payroll.manage': 'ثبت کارکرد، تأیید و پرداخت حقوق',
  'payroll.commission': 'تعیین پورسانت (فقط مالک)',
  'people.manage': 'مدیریت دفتر اشخاص و نمایندگان',
  'manufacturers.manage': 'مدیریت تولیدکنندگان',
  'orders.checkout': 'بازبینی و نهایی‌سازی تحویل سفارش (حسابداری)',
  'planogram.manage': 'مدیریت پلانوگرام و نقشهٔ فروشگاه',
}

/** ORDER_STATUSES با رنگ آبی → رنگ‌های سازمانی (زیتونی/طلایی) — سفارش دریافت‌شده */
export const ORDER_STATUSES: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: 'پیش‌نویس', color: '#6b7280', bg: '#f3f4f6' },
  SUBMITTED: { label: 'در انتظار تأیید', color: '#a16207', bg: '#fef9c3' },
  APPROVED: { label: 'سفارش داده شد', color: '#166534', bg: '#dcfce7' },
  RECEIVING: { label: 'در حال دریافت', color: '#9a3412', bg: '#ffedd5' },
  RECEIVED: { label: 'دریافت شد', color: '#0f766e', bg: '#ccfbf1' },
  VERIFIED: { label: 'تأیید انبار', color: '#6d28d9', bg: '#ede9fe' },
  ACCOUNTED: { label: 'ثبت در حسابداری', color: '#3f6212', bg: '#ecfccb' },
  DONE: { label: 'تکمیل شده', color: '#3f6212', bg: '#ecfccb' },
  CANCELLED: { label: 'لغو شده', color: '#991b1b', bg: '#fee2e2' },
}

export const ORDER_FLOW = ['SUBMITTED', 'APPROVED', 'RECEIVING', 'RECEIVED', 'VERIFIED', 'ACCOUNTED', 'DONE']

export const CHEQUE_STATUSES: Record<string, { label: string; color: string; bg: string }> = {
  PENDING_OWNER: { label: 'در انتظار امضای مالک', color: '#a16207', bg: '#fef9c3' },
  SIGNED: { label: 'امضا شد - آماده تحویل', color: '#166534', bg: '#dcfce7' },
  DELIVERED: { label: 'تحویل داده شد', color: '#0f766e', bg: '#ccfbf1' },
  CLEARED: { label: 'پاس شد', color: '#3f6212', bg: '#ecfccb' },
  REJECTED: { label: 'برگشتی', color: '#991b1b', bg: '#fee2e2' },
  RETURNED: { label: 'برگردانده شد', color: '#6b7280', bg: '#f3f4f6' },
}

export const TASK_STATUSES: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'باز', color: '#a16207' },
  IN_PROGRESS: { label: 'در حال انجام', color: '#0f766e' },
  PAUSED: { label: 'متوقف', color: '#9a3412' },
  DONE: { label: 'انجام شد', color: '#166534' },
}

export const PRIORITIES: Record<string, { label: string; color: string }> = {
  LOW: { label: 'کم', color: '#6b7280' },
  NORMAL: { label: 'معمولی', color: '#166534' },
  HIGH: { label: 'مهم', color: '#a16207' },
  URGENT: { label: 'فوری', color: '#991b1b' },
}

/** تیئر مشتری — بر پایهٔ RFM */
export const CUSTOMER_TIERS: Record<string, { label: string; color: string; bg: string; hint: string }> = {
  VIP: { label: 'VIP 💎', color: '#8a6d10', bg: '#fdf6dd', hint: 'بالاترین ارزش خرید — خدمات ویژه و دسترسی زودهنگام' },
  LOYAL: { label: 'مشتری وفادار 🌿', color: '#166534', bg: '#dcfce7', hint: 'خرید منظم — ضریب امتیاز و پیشنهاد ویژه' },
  NEW: { label: 'تازه‌وارد ✨', color: '#0f766e', bg: '#ccfbf1', hint: 'کمتر از ۳۰ روز — خوش‌آمدگویی و سفر دوم' },
  AT_RISK: { label: 'در خطر جدا شدن ⚠️', color: '#a16207', bg: '#fef9c3', hint: 'دیرکرد بیشتر از معمول خودش — پیام بازگشت با غافلگیری' },
  DORMANT: { label: 'غیبت طولانی 😴', color: '#991b1b', bg: '#fee2e2', hint: 'بیش از ۹۰ روز — یک پیام قوی بازگشت' },
  REGULAR: { label: 'معمولی', color: '#6b7280', bg: '#f3f4f6', hint: '' },
}

/** Category → emoji for visual product identification */
export const CATEGORY_EMOJI: Record<string, string> = {
  'لبنیات': '🥛',
  'پروتئینی': '🥩',
  'خواروبار': '🌾',
  'آجیل و خشکبار': '🥜',
  'نوشیدنی': '🥤',
  'بهداشتی': '🧴',
  'عمومی': '📦',
}

/** Which primary roles can access a view (secondary roles may add access).
 *  نقش‌های EXEC (OWNER/GM/OM/ADMIN) همیشه به همه دسترسی دارند — canAccess این را تضمین می‌کند. */
export const VIEW_ACCESS: Record<string, { roles: string[]; secondary?: string[] }> = {
  dashboard: { roles: ['*'] },
  orders: { roles: ['GM', 'PM', 'OM', 'OWNER', 'ACC', 'SK'] },
  receiving: { roles: ['GM', 'OM', 'SK'], secondary: ['RECEIVER'] },
  verify: { roles: ['SK', 'OM', 'GM'] },
  accounting: { roles: ['ACC', 'OM', 'OWNER'] },
  products: { roles: ['GM', 'PM', 'OM', 'ACC', 'SK', 'SALES', 'HC', 'CASHIER', 'MERCH'] },
  providers: { roles: ['GM', 'PM', 'OM', 'ACC'] },
  cheques: { roles: ['GM', 'OWNER', 'ACC'] },
  archive: { roles: ['GM', 'OM', 'ACC', 'OWNER', 'SK'], secondary: ['IT'] },
  zonecount: { roles: ['MERCH', 'SK', 'OM', 'GM', 'PM', 'SALES'], secondary: ['MERCH'] },
  leaves: { roles: ['*'] },
  tasks: { roles: ['*'] },
  sop: { roles: ['*'] },
  wall: { roles: ['*'] },
  messages: { roles: ['*'] },
  notes: { roles: ['*'] },
  feedback: { roles: ['*'] },
  planogram: { roles: ['GM', 'PM', 'OM', 'MERCH', 'SK'], secondary: ['MERCH'] },
  sales: { roles: ['SALES', 'CASHIER', 'HC', 'GM', 'PM', 'OM'], secondary: ['SALES'] },
  perf: { roles: ['*'] },
  admin: { roles: ['OM', 'GM', 'OWNER'] },
  help: { roles: ['*'] },
  notifs: { roles: ['*'] },
  briefing: { roles: ['GM', 'OM', 'OWNER', 'ACC'] },
  reports: { roles: ['GM', 'OM', 'OWNER', 'ACC'] },
  pricecheck: { roles: ['GM', 'OM', 'OWNER', 'ACC', 'PM'] },
  science: { roles: ['GM', 'OM', 'OWNER', 'ACC', 'PM', 'SK'] },
  research: { roles: ['*'] },
  demo: { roles: ['GM', 'OM', 'OWNER', 'PM'] },
  // ── round-14 additions ──
  crm: { roles: ['SALES', 'CASHIER', 'HC', 'MERCH', 'PM', 'ACC', 'SK'] },
  personnel: { roles: ['HC', 'ACC', 'SK'] },
  rbac: { roles: ['IT'] },
  urgent: { roles: ['*'] },
  data: { roles: ['OWNER', 'ACC', 'IT'] },
  kb: { roles: ['*'] },
  // ── round-15 additions ──
  payroll: { roles: ['ACC', 'HC'] },
  people: { roles: ['ACC', 'SK', 'HC'] },
  // ── round-17 additions ──
  shifts: { roles: ['HC', 'ACC', 'SK'] },
}

export function canAccess(view: string, role: string, secondaryRoles: string[]): boolean {
  // executive bypass: OWNER/GM/OM/ADMIN see everything, always (مالک را نمی‌توان محدود کرد)
  if (isExecRole(role)) return true
  const cfg = VIEW_ACCESS[view]
  if (!cfg) return false
  if (cfg.roles.includes('*')) return true
  if (cfg.roles.includes(role)) return true
  if (cfg.secondary && cfg.secondary.some((s) => secondaryRoles.includes(s))) return true
  return false
}

/** نقش‌های از پیش‌ساخته — seed اولیه؛ ادمین می‌تواند نقش دلخواه بسازد */
export const BUILTIN_ROLES: { key: string; name: string; category: string; color: string; caps: string[]; views?: string[] }[] = [
  { key: 'OWNER', name: 'مالک', category: 'مدیریت ارشد', color: '#c9a227', caps: ['*'] },
  { key: 'GM', name: 'مدیر کل', category: 'مدیریت ارشد', color: '#0e7a4a', caps: ['*'] },
  { key: 'OM', name: 'مدیر عملیات', category: 'مدیریت ارشد', color: '#0e7a4a', caps: ['*'] },
  { key: 'ADMIN', name: 'مدیر سامانه (root)', category: 'فناوری', color: '#334155', caps: ['*'] },
  { key: 'PM', name: 'مدیر محصول', category: 'مدیریت', color: '#77934a', caps: ['orders.approve', 'cheques.limits', 'crm.manage', 'kb.manage', 'settings.manage'] },
  { key: 'ACC', name: 'حسابدار ارشد', category: 'مالی', color: '#8a6d10', caps: ['zonecount.confirm', 'cheques.create', 'holidays.manage', 'leaves.approve', 'archive.manage', 'payroll.view', 'payroll.manage', 'people.manage', 'manufacturers.manage', 'orders.checkout'] },
  { key: 'HC', name: 'سرصندوقدار', category: 'فروش', color: '#c96f4a', caps: ['crm.manage', 'leaves.approve', 'payroll.view', 'people.manage'] },
  { key: 'CASHIER', name: 'صندوقدار', category: 'فروش', color: '#c96f4a', caps: [] },
  { key: 'SK', name: 'سرپرست انبار', category: 'انبار', color: '#0e7a4a', caps: ['archive.manage', 'leaves.approve', 'people.manage'] },
  { key: 'MERCH', name: 'مسئول چیدمان', category: 'فروشگاه', color: '#77934a', caps: [] },
  { key: 'SALES', name: 'فروشنده', category: 'فروش', color: '#0e7a4a', caps: [] },
  { key: 'IT', name: 'مدیر فناوری اطلاعات', category: 'فناوری', color: '#334155', caps: ['users.manage', 'roles.manage', 'db.reset', 'db.import', 'holidays.manage', 'notif.rules', 'kb.manage', 'tour.reset', 'activity.view', 'oversight.manage', 'settings.manage'] },
]

/** نمونهٔ نقش سفارشی — اثبات اینکه سیستم نقش دلخواه می‌سازد */
export const SAMPLE_CUSTOM_ROLE = {
  key: 'SOCIAL_MEDIA',
  name: 'مسئول شبکه‌های اجتماعی',
  category: 'بازاریابی',
  color: '#c96f4a',
  description: 'مدیریت پیج اینستاگرام، ثبت تولیدات محتوایی، هماهنگی کمپین‌های CRM',
  caps: ['crm.manage', 'kb.manage'],
}
