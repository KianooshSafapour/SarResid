/** کاتالوگ ثابت رخدادهای اعلان (workflow) — همهٔ بخش‌ها از همین فهرست منتشر می‌کنند.
 *  ادمین در مرکز اعلان‌ها مشخص می‌کند «چه کسی» برای هر رخداد مطلع شود.
 *  سطوح اهمیت و بودجهٔ خستگی: critical = فوری (همان لحظه)، important = تجمیعی، info = روزانه. */

export type NotifSeverity = 'critical' | 'important' | 'info'

export type NotifTargets = { roles: string[]; users?: string[]; fieldRef?: string }

export type NotifEventDef = {
  key: string
  label: string
  icon: string
  severity: NotifSeverity
  defaultTargets: NotifTargets
  description: string
  /** مقصدهای پویایی که برای این رخداد معنا دارند (fieldRef) */
  fieldRefs: string[]
}

/** برچسب فارسی fieldRef — «کاربر مرتبط با رخداد» */
export const FIELD_REF_LABELS: Record<string, string> = {
  submitter: 'درخواست‌دهندهٔ رخداد',
  approver: 'تأییدکننده',
  asker: 'پرسشگر',
  zoneOwner: 'مسئول زون',
  oversight: 'ناظر تعیین‌شده',
}

export const NOTIF_EVENTS: NotifEventDef[] = [
  { key: 'leave.requested', label: 'درخواست مرخصی جدید', icon: '📅', severity: 'important', defaultTargets: { roles: ['GM'], fieldRef: 'approver' }, description: 'وقتی همکاری درخواست مرخصی ثبت می‌کند، تصمیم‌گیرنده مطلع می‌شود', fieldRefs: ['submitter', 'approver'] },
  { key: 'leave.decided', label: 'پاسخ به درخواست مرخصی', icon: '✅', severity: 'important', defaultTargets: { roles: [], fieldRef: 'submitter' }, description: 'نتیجهٔ تأیید یا رد به خودِ درخواست‌دهنده اعلام می‌شود', fieldRefs: ['submitter', 'approver'] },
  { key: 'urgent.new', label: 'پرسش فوری جدید', icon: '⚡', severity: 'critical', defaultTargets: { roles: ['OM', 'GM'] }, description: 'پرسش فوری همکار بدون قطع‌کردن کار مدیران، در مرکز اعلان‌ها دیده می‌شود', fieldRefs: ['asker'] },
  { key: 'urgent.answered', label: 'پاسخ پرسش فوری', icon: '💬', severity: 'important', defaultTargets: { roles: [], fieldRef: 'asker' }, description: 'پاسخ مدیر به پرسشگر برمی‌گردد', fieldRefs: ['asker'] },
  { key: 'zonecount.mismatch', label: 'مغایرت شمارش زون', icon: '⚖️', severity: 'important', defaultTargets: { roles: ['SK', 'OM'], fieldRef: 'oversight' }, description: 'شمارش کور با هلو نمی‌خواند — انبار و ناظر تعیین‌شده مطلع می‌شوند', fieldRefs: ['zoneOwner', 'submitter', 'oversight'] },
  { key: 'customer.request.new', label: 'درخواست کالای جدید مشتری', icon: '🛒', severity: 'info', defaultTargets: { roles: ['PM', 'OM'] }, description: 'مشتری کالایی خواسته که در فروشگاه نیست — تصمیم سفارش با مدیریت', fieldRefs: ['submitter'] },
  { key: 'complaint.new', label: 'شکایت مشتری', icon: '📣', severity: 'critical', defaultTargets: { roles: ['OM', 'HC'] }, description: 'حل زیر ۲۴ ساعت — خدمت ترمیمی (service recovery)', fieldRefs: ['submitter'] },
  { key: 'engagement.sampled', label: 'نمونهٔ راستی‌آزمایی پیشنهاد فروش', icon: '🔍', severity: 'info', defaultTargets: { roles: ['OM', 'HC'], fieldRef: 'oversight' }, description: 'نمونه‌گیری تصادفی سیستم (۲۰٪) برای حفظ صداقت تیم فروش', fieldRefs: ['submitter', 'oversight'] },
  { key: 'extra.activity', label: 'فعالیت فراتر از وظیفه', icon: '🌟', severity: 'info', defaultTargets: { roles: ['OM', 'HC'] }, description: 'ثبت کار داوطلبانه — برای قدردانی و امتیازدهی', fieldRefs: ['submitter'] },
  { key: 'db.reset', label: 'بازنشانی یا ورود دادهٔ کلان', icon: '🗄️', severity: 'critical', defaultTargets: { roles: ['GM', 'OM'] }, description: 'شفافیت تغییرات حساس داده — بازنشانی، ورود اکسل، پاک‌سازی', fieldRefs: ['submitter'] },
  { key: 'holiday.changed', label: 'تغییر تعطیلی رسمی', icon: '🗓️', severity: 'important', defaultTargets: { roles: ['GM', 'OM', 'ACC'] }, description: 'چک‌ها و مرخصی‌ها به تعطیلی وابسته‌اند — همه مدیران بدانند', fieldRefs: [] },
  { key: 'order.created', label: 'ثبت سفارش جدید', icon: '📝', severity: 'info', defaultTargets: { roles: ['OM', 'PM'] }, description: 'سفارش تازه ثبت شد و در صف تأیید است', fieldRefs: ['submitter', 'approver'] },
  { key: 'order.approved', label: 'تأیید سفارش', icon: '🚚', severity: 'important', defaultTargets: { roles: ['SK'], fieldRef: 'submitter' }, description: 'سفارش تأیید شد — انبار برای دریافت مرسوله آماده شود', fieldRefs: ['submitter', 'approver'] },
  { key: 'order.delivered-late', label: 'تأخیر در تحویل سفارش', icon: '⏰', severity: 'critical', defaultTargets: { roles: ['OM', 'GM'] }, description: 'موعد تحویل گذشته و مرسوله نرسیده — تماس با تأمین‌کننده', fieldRefs: ['submitter'] },
  { key: 'cheque.signed', label: 'امضای چک', icon: '✍️', severity: 'important', defaultTargets: { roles: ['ACC'] }, description: 'چک امضا شد و آمادهٔ تحویل به نمایندهٔ تأمین‌کننده است', fieldRefs: ['submitter'] },
  { key: 'cheque.due-soon', label: 'سررسید نزدیک چک', icon: '💰', severity: 'critical', defaultTargets: { roles: ['GM', 'ACC', 'OWNER'] }, description: 'موجودی حساب برای پاس‌شدن چک باید آماده شود', fieldRefs: [] },
  { key: 'archive.borrow-overdue', label: 'دیرکرد امانی سند آرشیو', icon: '📕', severity: 'important', defaultTargets: { roles: ['ACC'] }, description: 'سند امانی در مهلت مقرر برنگشته — پیگیری بازگشت', fieldRefs: ['zoneOwner', 'submitter'] },
  { key: 'message.new', label: 'پیام خصوصی جدید', icon: '✉️', severity: 'info', defaultTargets: { roles: [] }, description: 'پیام مستقیم همکار (مکانیزم پیام ساکت است — فقط برای جریان‌های آینده)', fieldRefs: ['submitter'] },
  { key: 'birthday.upcoming', label: 'تولد همکار (۷/۳/۰ روز)', icon: '🎂', severity: 'info', defaultTargets: { roles: ['OWNER', 'GM', 'HC', 'PM'] }, description: 'یادآوری تولد پرسنل — ۷ روز و ۳ روز قبل و روز تولد (روزانه یک‌بار بررسی می‌شود؛ مدیر منابع انسانی می‌تواند مقصدها را تغییر دهد)', fieldRefs: [] },
]

export const NOTIF_EVENT_MAP: Record<string, NotifEventDef> = Object.fromEntries(NOTIF_EVENTS.map((e) => [e.key, e]))

export const SEVERITY_LABELS: Record<NotifSeverity, string> = {
  critical: 'فوری 🚨',
  important: 'مهم ⚠️',
  info: 'اطلاع ℹ️',
}

/** بودجهٔ خستگی — پژوهش: فوری ≤۵ در روز همان لحظه، مهم در ۳ نوبت تجمیعی، اطلاع روزانه */
export const DIGEST_SLOTS = ['09:00', '14:00', '19:00'] as const
export const DIGEST_SLOT_FA: Record<string, string> = { '09:00': 'نوبت صبح ۹:۰۰', '14:00': 'نوبت ظهر ۱۴:۰۰', '19:00': 'نوبت عصر ۱۹:۰۰' }
