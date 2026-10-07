/**
 * ═══════════════════════════════════════════════════════════════════
 *  ثبتِ ویجت‌های داشبورد — لایهٔ شخصی‌سازی (Task 19-d)
 * ═══════════════════════════════════════════════════════════════════
 *  منبع واحد حقیقت برای «داشبورد چه بخش‌هایی دارد، به چه ترتیبی،
 *  با چه پهنایی در شبکهٔ ۴ستونه». Dashboard.tsx از این ثبت رندر می‌کند
 *  و گفت‌وگوی «شخصی‌سازی» روی همین ساختار سوییچ/ترتیب می‌دهد.
 *
 *  ذخیره‌سازی: User.uiPrefs (JSON blob) — کلیدِ «dash»:
 *    { "fontScale": 1.1, ..., "dash": { "hidden": ["abc-categories"], "order": ["hero", ...] } }
 *  بقیهٔ کلیدهای uiPrefs (تم، قلم، تقویم و…) دست‌نخورده می‌مانند.
 *
 *  قواعد چیدمان:
 *   • span = پهنای پیش‌فرض ویجت در شبکهٔ lg:grid-cols-4 (۱ تا ۴ ستون).
 *   • packRows تضمین می‌کند هیچ ردیفی نیمه‌خالی نماند — شکاف‌ها با
 *     ارتقای ویجت بعدی یا رشدِ آخرین ویجت ردیف پر می‌شوند.
 *   • roles فقط «مشاوره‌ای» است (برای فیلتر فهرست شخصی‌سازی)؛
 *     کنترل نهایی دسترسی‌ها همان منطق قبلیِ هر ویجت در Dashboard است.
 */

export type DashSpan = 1 | 2 | 3 | 4
export type DashTab = 'always' | 'today' | 'week'

export interface DashWidget {
  id: string
  titleFa: string
  descFa: string
  /** نام آیکون lucide — در Dashboard.tsx به کامپوننت نگاشت می‌شود */
  icon: string
  /** پهنای پیش‌فرض در شبکهٔ ۴ستونه */
  span: DashSpan
  defaultVisible: boolean
  /** نقش‌های مرتبط (مشاوره‌ای — برای فهرست گفت‌وگوی شخصی‌سازی) */
  roles?: string[]
  /** جای ویجت: همیشه‌نما / برگهٔ «امروز من» / برگهٔ «نگاه هفته» */
  tab: DashTab
}

/** ثبت کامل ویجت‌های داشبورد — ترتیبِ آرایه = ترتیب پیش‌فرض رندر */
export const DASH_WIDGETS: DashWidget[] = [
  /* ── همیشه‌نما ── */
  {
    id: 'hero',
    tab: 'always',
    titleFa: 'خوش‌آمد و سلام امروز',
    descFa: 'بنر خوش‌آمدگویی با تاریخ امروز، امتیاز شما و میان‌بر صبح‌نامه',
    icon: 'Sun',
    span: 4,
    defaultVisible: true,
  },
  {
    id: 'kpi-band',
    tab: 'always',
    titleFa: 'شاخص‌های کلیدی روز',
    descFa: 'نوار ۶ شاخص: سفارش‌های در جریان، مرسوله‌ها، انبار، چک، وظایف و پیام‌ها',
    icon: 'Gauge',
    span: 4,
    defaultVisible: true,
  },
  {
    id: 'queue-pricecheck',
    tab: 'always',
    titleFa: 'کنترل قیمت امروز ⏳',
    descFa: 'صف تأیید قیمت چاپ‌شدهٔ امروز — هشدار حاشیهٔ بحرانی زیر ۱۰٪',
    icon: 'Tag',
    span: 1,
    defaultVisible: true,
    roles: ['GM', 'OM', 'OWNER', 'ACC', 'PM'],
  },
  {
    id: 'queue-helo',
    tab: 'always',
    titleFa: 'در انتظار ثبت در هلو',
    descFa: 'سفارش‌های تأییدشده که حسابدار باید در نرم‌افزار هلو ثبت کند',
    icon: 'Calculator',
    span: 2,
    defaultVisible: true,
    roles: ['ACC', 'OM', 'OWNER'],
  },
  {
    id: 'queue-verify',
    tab: 'always',
    titleFa: 'در انتظار تأیید انبار',
    descFa: 'مرسوله‌های دریافتی که سرپرست انبار باید تأیید کند',
    icon: 'PackageCheck',
    span: 1,
    defaultVisible: true,
    roles: ['SK', 'OM', 'GM'],
  },
  {
    id: 'queue-cashier',
    tab: 'always',
    titleFa: 'صف پیش‌فاکتورهای فروش',
    descFa: 'سفارش‌های ثبت‌شدهٔ فروشندگان — آمادهٔ پردازش صندوق',
    icon: 'ReceiptText',
    span: 1,
    defaultVisible: true,
    roles: ['HC', 'CASHIER', 'GM'],
  },

  /* ── برگهٔ «امروز من» ── */
  {
    id: 'my-tasks',
    tab: 'today',
    titleFa: 'وظایف من',
    descFa: 'فهرست وظایف باز شما با اولویت، وضعیت و سررسید',
    icon: 'ListChecks',
    span: 2,
    defaultVisible: true,
  },
  {
    id: 'today-deliveries',
    tab: 'today',
    titleFa: 'مرسوله‌های امروز',
    descFa: 'سفارش‌هایی که امروز برای دریافت به فروشگاه می‌رسند',
    icon: 'Truck',
    span: 2,
    defaultVisible: true,
  },
  {
    id: 'overdue-orders',
    tab: 'today',
    titleFa: 'سفارش‌های سرآمده ⚠️',
    descFa: 'تحویل‌های با تأخیر که نیاز به پیگیری فوری دارند',
    icon: 'AlertTriangle',
    span: 2,
    defaultVisible: true,
  },
  {
    id: 'pending-cheques',
    tab: 'today',
    titleFa: 'چک‌های در انتظار امضا',
    descFa: 'صف امضای چک‌های خرید با مبلغ و سررسید هر چک',
    icon: 'Banknote',
    span: 2,
    defaultVisible: true,
  },
  {
    id: 'customer-reqs',
    tab: 'today',
    titleFa: 'درخواست‌های فوری مشتریان',
    descFa: '۵ پرتقاضاترین کالایی که مشتری دنبالش بود و نداشتیم',
    icon: 'MessageCircle',
    span: 2,
    defaultVisible: true,
  },
  {
    id: 'digital-wall',
    tab: 'today',
    titleFa: 'دیجیتال‌وال',
    descFa: 'آخرین خبرها و اعلان‌های تیم روی دیوار مشترک',
    icon: 'Newspaper',
    span: 2,
    defaultVisible: true,
  },

  /* ── برگهٔ «نگاه هفته» ── */
  {
    id: 'week-trends',
    tab: 'week',
    titleFa: 'سفارش‌ها و فروش ۱۴ روز اخیر',
    descFa: 'روند تعداد سفارش و مبلغ فروش روزانه در دو هفتهٔ گذشته',
    icon: 'TrendingUp',
    span: 3,
    defaultVisible: true,
  },
  {
    id: 'pipeline-donut',
    tab: 'week',
    titleFa: 'گردش سفارش‌ها',
    descFa: 'دوناتِ وضعیت همهٔ سفارش‌ها در چرخهٔ تأمین',
    icon: 'PieChart',
    span: 1,
    defaultVisible: true,
  },
  {
    id: 'cheque-schedule',
    tab: 'week',
    titleFa: 'سررسید چک‌ها (۸ هفته آینده)',
    descFa: 'برنامهٔ مالی هفتگی — مبلغ چک‌های سررسیدشونده',
    icon: 'Banknote',
    span: 3,
    defaultVisible: true,
  },
  {
    id: 'team-leaderboard',
    tab: 'week',
    titleFa: 'جدول امتیاز تیم 🏆',
    descFa: 'قدردانی مدیران از تلاش همکاران — برترین امتیازها',
    icon: 'Trophy',
    span: 1,
    defaultVisible: true,
  },
  {
    id: 'abc-categories',
    tab: 'week',
    titleFa: 'سهم دسته‌بندی کالا (ABC)',
    descFa: 'تحلیل ABC — سهم هر دسته از ارزش تقاضای سالانه',
    icon: 'PieChart',
    span: 2,
    defaultVisible: true,
  },
  {
    id: 'top-products',
    tab: 'week',
    titleFa: 'پرفروش‌ترین کالاها',
    descFa: 'برترین کالاها بر پایهٔ ارزش تقاضای سالانه — رنگ کلاس A/B/C',
    icon: 'ShoppingBasket',
    span: 2,
    defaultVisible: true,
  },
  {
    id: 'expiring-items',
    tab: 'week',
    titleFa: 'نزدیک به انقضا ⏳',
    descFa: 'اقلامی که تا ۱۴ روز آینده تمام می‌شوند — زودتر بفروشید یا تخفیف بزنید',
    icon: 'Hourglass',
    span: 4,
    defaultVisible: true,
    roles: ['GM', 'OM', 'SK', 'ACC', 'HC'],
  },
  {
    id: 'customer-reqs-full',
    tab: 'week',
    titleFa: 'درخواست‌های مشتریان — فهرست کامل',
    descFa: 'همهٔ درخواست‌های ثبت‌شدهٔ مشتریان — مبنای تصمیم تأمین',
    icon: 'MessageCircle',
    span: 4,
    defaultVisible: true,
  },
]

const WIDGET_IDS = new Set(DASH_WIDGETS.map((w) => w.id))
const BY_ID = new Map(DASH_WIDGETS.map((w) => [w.id, w]))

export function getDashWidget(id: string): DashWidget | undefined {
  return BY_ID.get(id)
}

/** برچسب گروه‌های برگه در گفت‌وگوی شخصی‌سازی */
export const DASH_TAB_LABELS: Record<DashTab, string> = {
  always: 'همیشه بالای داشبورد',
  today: 'برگهٔ «امروز من»',
  week: 'برگهٔ «نگاه هفته»',
}

/* ─────────────────────ترجیحات خواندن/نوشتن───────────────────── */

export interface DashPrefs {
  /** شناسه‌های ویجت‌های مخفی‌شده توسط کاربر */
  hidden: string[]
  /** ترتیب دلخواه کاربر — ویجت‌های خارج از فهرست به ترتیب ثبت می‌آیند */
  order: string[]
}

/** سقف ایمنی برای هر فهرست */
export const DASH_PREFS_CAP = 50

function toIdArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    const id = String(x)
    // فقط شناسه‌های معتبرِ ثبت — شناسه‌های منسوخ‌شده نادیده گرفته می‌شوند
    if (WIDGET_IDS.has(id) && !out.includes(id)) out.push(id)
    if (out.length >= DASH_PREFS_CAP) break
  }
  return out
}

/** خواندن ترجیحات داشبورد از blob کامل uiPrefs — همیشه نتیجهٔ سالم برمی‌گرداند */
export function readDashPrefs(uiPrefsJson: string | null | undefined): DashPrefs {
  let obj: unknown = null
  try {
    obj = JSON.parse(uiPrefsJson || '{}')
  } catch {
    obj = null
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { hidden: [], order: [] }
  const rec = obj as Record<string, unknown>
  const src = rec.dash && typeof rec.dash === 'object' && !Array.isArray(rec.dash) ? rec.dash : rec
  return { hidden: toIdArray((src as Record<string, unknown>).hidden), order: toIdArray((src as Record<string, unknown>).order) }
}

/**
 * نوشتن ترجیحات داشبورد در blob کامل uiPrefs — کلیدهای دیگر
 * (fontScale، theme، calSystem و…) عیناً حفظ می‌شوند. خروجی: JSON رشته‌ای.
 */
export function writeDashPrefs(uiPrefsJson: string | null | undefined, prefs: DashPrefs): string {
  let obj: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(uiPrefsJson || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) obj = parsed as Record<string, unknown>
  } catch {
    /* blob خراب — از صفر ساخته می‌شود */
  }
  obj.dash = { hidden: toIdArray(prefs.hidden), order: toIdArray(prefs.order) }
  return JSON.stringify(obj)
}

/** ترجیحات پیش‌فرض (مهمان / کاربر بدون تنظیم) */
export function defaultDashPrefs(): DashPrefs {
  return {
    hidden: DASH_WIDGETS.filter((w) => !w.defaultVisible).map((w) => w.id),
    order: DASH_WIDGETS.map((w) => w.id),
  }
}

/** ترتیب کاملِ نهایی: اولویت با انتخاب کاربر، باقی ویجت‌ها به ترتیب ثبت */
export function resolveDashOrder(prefs: DashPrefs): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of prefs.order) {
    if (WIDGET_IDS.has(id) && !seen.has(id)) {
      out.push(id)
      seen.add(id)
    }
  }
  for (const w of DASH_WIDGETS) if (!seen.has(w.id)) out.push(w.id)
  return out
}

/** ویجت‌های نمایانِ نهایی (ترتیب‌شده، بدون مخفی‌ها) */
export function resolveDashWidgets(prefs: DashPrefs): DashWidget[] {
  const hidden = new Set(prefs.hidden)
  return resolveDashOrder(prefs)
    .map((id) => BY_ID.get(id))
    .filter((w): w is DashWidget => !!w && !hidden.has(w.id))
}

/* ─────────────────────چیدمانِ ردیف‌های پُر───────────────────── */

export interface PackedItem<T> {
  item: T
  /** پهنای نهایی پس از پرکردن شکاف‌ها (۱ تا ۴) */
  colSpan: DashSpan
}

/**
 * بسته‌بندی ویجت‌ها در ردیف‌های ۴ستونهٔ «کاملاً پُر» — قاعدهٔ طلایی ضدِ ردیفِ نیمه‌خالی:
 *  ۱. هر ویجت به‌ترتیب در ردیف جاری جا می‌شود؛
 *  ۲. اگر جا نشد، اولین ویجتِ بعدی که در شکاف جا می‌شود «ارتقا» می‌یابد؛
 *  ۳. اگر هیچ‌کس شکاف را پر نکرد، آخرین ویجت ردیف رشد می‌کند تا ردیف دقیقاً ۴ ستون شود.
 * ورودی جهاد نمی‌شود؛ خروجی کپی‌های امن است.
 */
export function packRows<T extends { span: number }>(items: T[]): PackedItem<T>[] {
  const clamp = (n: number): DashSpan => (Math.min(4, Math.max(1, Math.round(n) || 1)) as DashSpan)
  const queue = items.map((item) => ({ item, span: clamp(item.span) }))
  const out: PackedItem<T>[] = []
  let row: PackedItem<T>[] = []
  let used = 0

  const flush = () => {
    if (row.length === 0) return
    let gap = 4 - used
    // توزیع شکاف روی ردیف (از آخر به اول) — هیچ ردیف نیمه‌خالی باقی نمی‌ماند
    while (gap > 0) {
      let grew = false
      for (let i = row.length - 1; i >= 0 && gap > 0; i--) {
        if (row[i].colSpan < 4) {
          row[i] = { ...row[i], colSpan: (row[i].colSpan + 1) as DashSpan }
          gap--
          grew = true
        }
      }
      if (!grew) break // دفاعی — با جمع < ۴ و span ≤ ۴ رخ نمی‌دهد
    }
    out.push(...row)
    row = []
    used = 0
  }

  while (queue.length > 0) {
    const idx = queue.findIndex((w) => w.span <= 4 - used)
    if (idx === -1) {
      flush()
      continue
    }
    const picked = queue.splice(idx, 1)[0]
    row.push({ item: picked.item, colSpan: picked.span })
    used += picked.span
    if (used === 4) flush()
  }
  flush()
  return out
}
