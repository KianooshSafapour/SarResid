import {
  useState, useEffect, useMemo,
  api, useShell, toast, cn,
  Button, Card, CardContent, Input, Textarea, Checkbox, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Tabs, TabsList, TabsTrigger, TabsContent,
  formatJalaliLong, toFaDigits, fa,
  TourEngine, mountTour, Icon, I,
  type TourStep, type TourHandle,
} from '../lib/hz'

/* ─────────────────────────────────────────────────────────────
   home/guide — «راهنما و دانش‌نامه»
   ۱) تب مقالات: فهرست /api/kb + جست‌وجوی ۳۰۰ms + چیپ دسته‌ها +
      دیالوگ مقاله + مدیریت (ساخت/ویرایش/حذف) — بازسازی چانک 0a7d8101
   ۲) تب تورهای تعاملی: ۱۱ تور (خوش‌آمدگینی + ۱۰ تور بخش‌محور)
   ─────────────────────────────────────────────────────────────

   نکتهٔ معماری (برای هماهنگی با همکاران):
   TourEngine کتابخانهٔ مشترک داخل درخت React همین view نصب می‌شود؛
   با تغییر هش (رفتن به بخش دیگر) کل view از درخت خارج می‌شود
   (بررسی تجربی شد — div.view-enter و محتوایش بازسازی می‌شوند).
   تور خوش‌آمدگینی چون جایی ناوبری ندارد با خودِ TourEngine اجرا
   می‌شود؛ اما تورهای بخش‌محور که باید به view دیگری «بروند» با
   موتور پایدارِ همین فایل اجرا می‌شوند: overlay در document.body
   ساخته می‌شود، نه در درخت React، پس با ناوبری زنده می‌ماند.
   کلاس‌ها و رفتار (تاریک‌سازی چهارپاره، کلیدها، RTL) عین
   TourEngine است؛ فقط کلاس‌های غایب در CSS فروزن با معادلِ موجود
   جایگزین شده‌اند (text-stone-700، border-stone-200، …).
   ───────────────────────────────────────────────────────────── */

const SUPERS = ['OWNER', 'GM', 'ADMIN']

/** آیا صفحه برای این کاربر قابل دسترس است؟ (override کاربر > نقش پیش‌فرض — آینهٔ PAGE_DEFAULTS) */
function canSee(user: any, route: string, roles: string[]): boolean {
  if (!user) return false
  const r = String(user.role || '')
  if (SUPERS.includes(r)) return true
  const allow: string[] = Array.isArray(user.pageAllow) ? user.pageAllow : []
  const deny: string[] = Array.isArray(user.pageDeny) ? user.pageDeny : []
  if (allow.includes(route)) return true
  if (deny.includes(route)) return false
  return roles.includes('*') || roles.includes(r)
}

/** آخرین کارت هر شبکه چقدر کش بیاید تا ردیف کاملاً پر شود؟ (sm=۲ ستون، xl=۳ ستون) */
function spanFor(index: number, count: number): string {
  if (index !== count - 1) return ''
  const sm = 2 - ((count - 1) % 2)
  const xl = 3 - ((count - 1) % 3)
  return cn(sm === 2 && 'sm:col-span-2', xl === 2 && 'xl:col-span-2', xl === 3 && 'xl:col-span-3')
}

/** ISO → «۲۷ مهر ۱۴۰۵» */
function dateFa(iso: any): string {
  const d = new Date(iso)
  if (!d || isNaN(d.getTime())) return '—'
  return toFaDigits(formatJalaliLong(d))
}

/* ═══════════════════════════════════════════════════════════
   ۱) تعریف تورها
   ═══════════════════════════════════════════════════════════ */

/** تور خوش‌آمدگینی — ۷ مرحله، فقط عناصر پوسته (در همین صفحه اجرا می‌شود) */
export const WELCOME_STEPS: TourStep[] = [
  {
    title: 'به سر رسید خوش آمدید! 🫒',
    body: 'این یک تور ۷ مرحله‌ای کوتاه است تا با سامانه آشنا شوید — حدود یک دقیقه طول می‌کشد. با دکمهٔ «بعدی» جلو بروید یا هر وقت خواستید ردش کنید. 💡 نکته: با کلید Esc هم می‌توانید تور را ببندید.',
  },
  {
    target: '[data-tour="rail"]',
    title: 'بخش‌های اصلی سامانه',
    body: 'این نوار عمودی، بخش‌های کاری شماست: خانه، وظایف، فروشگاه، انبار، مرجوعی، مالی و… هر نقش فقط بخش‌های مرتبط با خودش را می‌بیند. 💡 نکته: نقش شما تعیین می‌کند کدام بخش‌ها را ببینید.',
    mobileHint: 'در موبایل، این نوار داخل منوی همبرگری (☰) بالای صفحه است.',
  },
  {
    target: '[data-tour="sidebar"]',
    title: 'صفحات هر بخش',
    body: 'با کلیک روی هر بخش، صفحات آن در این نوار کناری باز می‌شود؛ مثلاً «چک‌لیست‌های امروز» یا «ثبت مرجوعی جدید». 💡 نکته: صفحهٔ فعلی شما همیشه در همین نوار مشخص است.',
    mobileHint: 'در موبایل، صفحات هر بخش در همان منوی ☰ نمایش داده می‌شوند.',
  },
  {
    target: '[data-tour="bell"]',
    title: 'زنگ اعلان‌ها',
    body: 'هر اتفاق مهم — تأیید مرجوعی، پیام جدید، یادآوری سررسید چک — با اعلان به شما می‌رسد. شمارهٔ قرمز یعنی چند اعلان خوانده‌نشده دارید. 💡 نکته: هر اعلان شما را مستقیم به صفحهٔ مربوط می‌برد.',
  },
  {
    target: '[data-tour="search"]',
    title: 'جست‌وجوی سریع (پالت فرمان)',
    body: 'با کلید ترکیبی Ctrl + K این جعبهٔ جست‌وجو باز می‌شود؛ نام هر صفحه را تایپ کنید و مستقیم به آن بروید. 💡 نکته: برای جابه‌جایی سریع بین بخش‌ها، همان‌جا اسم صفحه را بنویسید.',
    mobileHint: 'در موبایل، دکمهٔ جست‌وجو در نوار بالای صفحه است.',
  },
  {
    target: '[data-tour="user"]',
    title: 'حساب کاربری شما',
    body: 'روی نام و تصویر خودتان کلیک کنید: حالت شب، بازگشت به میزکار و خروج از حساب اینجاست. 💡 نکته: تغییر رمز عبور و شخصی‌سازی میزکار در صفحهٔ «حساب و شخصی‌سازی من» انجام می‌شود.',
  },
  {
    title: 'آماده‌اید! 🎉',
    body: 'همین‌قدر کافی بود! راهنمای کامل هر بخش در همین صفحه («راهنما و دانش‌نامه») موجود است؛ اگر سؤالی داشتید اول سراغ تب «تورهای تعاملی» بروید. 💡 نکته: این تور هر وقت بخواهید با دکمهٔ «شروع دوباره» قابل تکرار است.',
  },
]

interface TourDef {
  key: string
  title: string
  icon: string
  tone: string
  section: string
  desc: string
  min: number
  go: string
  roles: string[]
  steps: TourStep[]
}

const SIDEBAR_MOBILE_HINT = 'در موبایل، صفحات این بخش را از منوی ☰ بالای صفحه ببینید.'

/** ۱۰ تور بخش‌محور — مرحلهٔ اول به بخش می‌رود و نوار کناری را هایلایت می‌کند،
 *  بقیهٔ مراحل تا جای ممکن به عناصر پایدارِ همان view اشاره می‌کنند
 *  (سرصفحه‌ها، جعبه‌های جست‌وجو، تب‌ها) — نبودِ هدف = کارت مرکزی. */
export const SECTION_TOURS: TourDef[] = [
  {
    key: 'orders',
    title: 'تور سفارش‌گذاری',
    icon: 'carton',
    tone: 'bg-emerald-100 text-emerald-700',
    section: 'انبار و سفارش',
    desc: 'از انتخاب طرف حساب تا ثبت نهایی سفارش خرید: جست‌وجوی سریع کالا، پله‌های عدد و کارتن، مقایسهٔ تأمین‌کننده‌ها و تقویم پرداخت.',
    min: 2,
    go: 'supply/orders',
    roles: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK', 'ACC'],
    steps: [
      {
        go: 'supply/orders',
        target: '[data-tour="sidebar"]',
        title: 'به بخش انبار و سفارش خوش آمدید',
        body: 'این تور ۵ مرحله‌ای، صفحهٔ «سفارش‌گذاری هوشمند» را به شما نشان می‌دهد؛ سفارش خرید از تأمین‌کننده‌ها از همین‌جا ثبت می‌شود. در این نوار کناری، صفحه‌های همین بخش را می‌بینید. 💡 نکته: فعلاً روی «سفارش‌گذاری هوشمند» هستیم.',
        mobileHint: SIDEBAR_MOBILE_HINT,
      },
      {
        /* دکمهٔ کامبوباکس طرف حساب (سفارش‌گذاری R4 — جست‌وجوی زندهٔ تأمین‌کننده) */
        target: '[role="combobox"]',
        title: 'طرف حساب (تأمین‌کننده)',
        body: 'نخستین کارتِ بالای صفحه، انتخاب طرف حساب است؛ با جست‌وجوی نام، کد یا تلفن، تأمین‌کننده را انتخاب کنید تا کل سبد روی همان طرف حساب ثبت شود. انتخابش اختیاری است اما بدهی و اعتبار او را همان‌جا می‌بینید. 💡 نکته: اگر انتخاب نکنید، سفارش بدون طرف حساب ثبت می‌شود.',
        mobileHint: 'در موبایل، انتخاب طرف حساب بالای فهرست اقلام است.',
      },
      {
        target: 'input[placeholder*="نام کالا"]',
        title: 'جست‌وجوی سریع کالا',
        body: 'در همین جعبه که هایلایت شده، نام کالا را تایپ کنید (مثل «شیر» یا «چیپس») تا نتایج در جدول زیرش بیاید. 💡 نکته: با بارکدخوان هم می‌توانید مستقیم اسکن کنید.',
        mobileHint: 'در موبایل، جعبهٔ جست‌وجو بالای فهرست اقلام است.',
      },
      {
        title: 'جدول نتایج و افزودن به سبد',
        body: 'برای هر کالا، موجودی، آخرین سفارش و قیمت واحد را در یک ردیف می‌بینید؛ با پله‌های −/+ «تعداد» و «کارتن» را تعیین کنید و «افزودن به سبد» را بزنید. زیر نام هر کالا، قیمت سایر تأمین‌کننده‌ها هم برای مقایسه می‌آید. 💡 نکته: اگر اندازهٔ کارتن معلوم نباشد، سامانه خودش می‌پرسد.',
      },
      {
        title: 'سبد و ثبت نهایی',
        body: 'در سبد پایین صفحه اقلام را ویرایش کنید، تاریخ تحویل را از تقویم شمسی انتخاب کنید و روش پرداخت را تعیین کنید؛ با «ثبت سفارش»، سفارش و تقویم پرداختش با هم ثبت می‌شوند. 💡 نکته: وضعیت دریافت هر سفارش را تب «سفارش‌ها» دنبال می‌کند.',
      },
    ],
  },
  {
    key: 'returns',
    title: 'تور مرجوعی',
    icon: 'receipt',
    tone: 'bg-rose-50 text-rose-700',
    section: 'مرجوعی',
    desc: 'ثبت مرجوعی مشتری: انتخاب اقلام و علت، تشخیص خودکار بانک از روی شماره کارت، سابقهٔ مشتری و چاپ رسید حرارتی.',
    min: 2,
    go: 'returns/new',
    roles: ['*'],
    steps: [
      {
        go: 'returns/new',
        target: '[data-tour="sidebar"]',
        title: 'به بخش مرجوعی خوش آمدید',
        body: 'صفحهٔ «ثبت مرجوعی جدید» برای پذیرش مرجوعی مشتری است: انتخاب اقلام، علت هر قلم و روش تسویه. در این نوار کناری، صفحه‌های بخش مرجوعی را می‌بینید. 💡 نکته: پیش‌نویس فرم تا پاک کردنش حفظ می‌شود.',
        mobileHint: SIDEBAR_MOBILE_HINT,
      },
      {
        target: 'input[placeholder*="09123456789"]',
        title: 'انتخاب مشتری و اقلام',
        body: 'شمارهٔ تلفن مشتری را در همین کادر وارد کنید؛ اگر سابقه داشته باشد سامانه نشانش می‌دهد. سپس کالاها را با بارکد یا جست‌وجو اضافه کنید و برای هر قلم، علت مرجوعی را انتخاب کنید. 💡 نکته: کنار شمارهٔ مشتریِ دارای سابقه، دکمهٔ «نمایش سابقه» ظاهر می‌شود.',
      },
      {
        target: 'input[placeholder*="6037"]',
        title: 'تشخیص بانک از روی شماره کارت',
        body: 'وقتی شمارهٔ کارت بانکی را تایپ می‌کنید، سامانه از روی ۶ رقم اول (BIN) نام بانک را خودش تشخیص می‌دهد؛ نیازی به انتخاب دستی نیست. 💡 نکته: اگر کالای جایگزین، کل مبلغ را بپوشاند، کارت بانکی لازم نیست و خودش غیرفعال می‌شود.',
      },
      {
        title: 'چاپ رسید حرارتی',
        body: 'بعد از ثبت، دکمهٔ «چاپ رسید حرارتی» رسید ۸۰ میلی‌متری با بارکد رهگیری و حروف‌خوانی مبلغ را برای چاپگر Bixolon می‌فرستد. 💡 نکته: اگر سرویس چاپ در دسترس نباشد، پیش‌نمایش و ذخیرهٔ تصویر جایگزین است.',
      },
      {
        title: 'سابقهٔ مشتری',
        body: 'برای هر مشتری، سابقهٔ کامل مرجوعی‌ها — مبلغ، وضعیت تسویه و اقلام — در یک دیالوگ قابل مشاهده است تا پیش از پذیرش مرجوعی جدید، وضعیت او را بدانید. 💡 نکته: مدیران تأیید نهایی را از «مرجوعی‌ها ← در انتظار تأیید» انجام می‌دهند.',
      },
    ],
  },
  {
    key: 'profit',
    title: 'تور سودسنج',
    icon: 'flaskConical',
    tone: 'bg-teal-50 text-teal-700',
    section: 'سودسنج',
    desc: 'محاسبهٔ سود پیش از خرید: ساخت فاکتور خرید، گیج سودِ زنده، هشدارهای قیمت و ذخیرهٔ فاکتور.',
    min: 2,
    go: 'profit/builder',
    roles: ['OWNER', 'GM', 'ADMIN', 'ACC', 'EXEC', 'PM'],
    steps: [
      {
        go: 'profit/builder',
        target: '[data-tour="sidebar"]',
        title: 'به بخش سودسنج خوش آمدید',
        body: 'این صفحه برای محاسبهٔ سود «قبل از خرید» است: فاکتور خرید را می‌سازید و گیج سود به‌صورت زنده حرکت می‌کند. 💡 نکته: فرم در سمت راست است و گیج سود کنار آن.',
        mobileHint: SIDEBAR_MOBILE_HINT,
      },
      {
        target: 'input[placeholder*="تأمین‌کننده"]',
        title: 'فاکتور خرید',
        body: 'در همین کادر، تأمین‌کننده را انتخاب کنید؛ شمارهٔ فاکتور و تاریخ را وارد کنید و ردیف‌های کالا را با بارکد یا جست‌وجو اضافه کنید؛ برای هر ردیف قیمت کل و قیمت چاپی را وارد کنید. 💡 نکته: با کلید Alt+B مستقیم به فیلد بارکد بروید و با Alt+S ذخیره کنید.',
      },
      {
        title: 'گیج سود و هشدارها',
        body: 'برای هر ردیف، درصد سود زنده محاسبه می‌شود: زیر ۱۲٪ قرمز، زیر ۲۱٪ زرد و از ۲۱٪ به بالا سبز. اگر قیمتی اشتباه به‌نظر برسد — مثل جابه‌جایی رقم‌ها — هشدار می‌گیرید. 💡 نکته: دکمهٔ «هدف ۲۱٪» قیمت پیشنهادی را یک‌جا اصلاح می‌کند.',
      },
      {
        title: 'ذخیره و تاریخچه',
        body: 'فاکتور را ذخیره کنید تا در صفحهٔ «دفتر فاکتورها» همین بخش بماند؛ آمار کلی سود هم در «آمار و تحلیل سود» است. 💡 نکته: برای فاکتور جدید، کلید Alt+N را بزنید.',
      },
    ],
  },
  {
    key: 'finance',
    title: 'تور مالی و چک',
    icon: 'banknote',
    tone: 'bg-amber-100 text-amber-700',
    section: 'مالی',
    desc: 'دفتر چک‌ها، محاسبه‌گر دورهٔ ۴۵ روزه با تقویم تعطیلات و تقویم پرداخت ماهانه.',
    min: 2,
    go: 'finance/cheques',
    roles: ['OWNER', 'GM', 'ADMIN', 'ACC'],
    steps: [
      {
        go: 'finance/cheques',
        target: '[data-tour="sidebar"]',
        title: 'به بخش مالی خوش آمدید',
        body: 'این صفحه دفتر چک‌های شماست: چک‌های دریافتی و پرداختی با وضعیت امضا و سررسید. 💡 نکته: همین صفحه سه تب دارد: چک‌ها، محاسبه‌گر و تقویم.',
        mobileHint: SIDEBAR_MOBILE_HINT,
      },
      {
        target: '[role="tablist"]',
        title: 'لیست چک‌ها',
        body: 'این صفحه سه تب دارد که همین‌جا می‌بینید. در تب «چک‌ها»، همهٔ چک‌ها با مبلغ، سررسید و وضعیت — در انتظار امضا، امضاشده، برگشتی و… — دیده می‌شوند و می‌توانید وضعیت هر چک را جلو ببرید. 💡 نکته: با دکمهٔ «چاپ» نسخهٔ مرتبی برای بایگانی می‌گیرید.',
      },
      {
        target: '[role="tab"]:nth-child(2)',
        title: 'محاسبه‌گر ۴۵ روزه',
        body: 'در تب «محاسبه‌گر تاریخ چک» که هایلایت شده، دورهٔ چک (مثلاً ۴۵ روز) را بدهید؛ سامانه تاریخ سررسید را با احتساب جمعه‌ها و تعطیلات رسمی حساب می‌کند و نزدیک‌ترین روز کاری را پیشنهاد می‌دهد. 💡 نکته: هرگز دوره را طولانی‌تر از توافق نکنید — تاریخ نزدیک‌تر همیشه بهتر است.',
      },
      {
        target: '[role="tab"]:nth-child(3)',
        title: 'تقویم پرداخت',
        body: 'تب «تقویم پرداخت»، چک‌ها و پرداخت‌های برنامه‌ریزی‌شده را روی تقویم شمسی نشان می‌دهد؛ روی هر روز کلیک کنید تا اقلام همان روز را ببینید. 💡 نکته: چک‌های نزدیک با رنگ کهربایی مشخص می‌شوند.',
      },
      {
        title: 'ثبت چک جدید',
        body: 'فرم ثبت چک جدید در همان تب «چک‌ها» است؛ شمارهٔ چک، مبلغ، گیرنده و سررسید را وارد کنید. 💡 نکته: می‌توانید مستقیم از پیشنهادهای محاسبه‌گر، سررسید را انتخاب کنید.',
      },
    ],
  },
  {
    key: 'tasks',
    title: 'تور وظایف و چک‌لیست',
    icon: 'clipboard',
    tone: 'bg-emerald-50 text-emerald-700',
    section: 'وظایف',
    desc: 'دستور کارهای من، ارسال دستور برای تیم، چک‌لیست‌های امروز و بررسی حضور پرسنل.',
    min: 2,
    go: 'tasks/tasks',
    roles: ['*'],
    steps: [
      {
        go: 'tasks/tasks',
        target: '[data-tour="sidebar"]',
        title: 'به بخش وظایف خوش آمدید',
        body: 'صفحهٔ «دستور کار و وظایف من» مرکز کارهای روزانهٔ شماست؛ در این نوار کناری، صفحه‌های همین بخش را می‌بینید. 💡 نکته: دستورهای جدید با اعلان به خودتان می‌رسد.',
        mobileHint: SIDEBAR_MOBILE_HINT,
      },
      {
        target: '[role="tab"]:nth-child(1)',
        title: 'وظایف من',
        body: 'دستور کاری که برایتان فرستاده شده — با اولویت و مهلت — در تب «وظایف من» است؛ با «شروع» آن را آغاز کنید و با «انجام شد» ببندید تا فرستنده تأیید کند. 💡 نکته: مهلت گذشته با رنگ قرمز نشان داده می‌شود.',
      },
      {
        target: '[role="tab"]:nth-child(3)',
        title: 'ارسال دستور (مدیران)',
        body: 'مدیران از تب «ارسال دستور کار» می‌توانند برای همکاران دستور کار با توضیح، دسته، مهلت و اولویت بفرستند و پیشرفتشان را در تب «همه» دنبال کنند. 💡 نکته: دستور به فردِ انتخاب‌شده اعلان می‌رود.',
      },
      {
        title: 'چک‌لیست‌های امروز',
        body: 'چک‌لیست‌های روزانه — باز و بسته کردن در، کنترل تاریخ کالاها و… — در صفحهٔ «چک‌لیست‌های امروز» همین بخش است و تیک‌ها همان‌جا زده می‌شود. 💡 نکته: درصد پیشرفت هر چک‌لیست بالای خودش است.',
      },
      {
        title: 'بررسی تیم',
        body: 'حضور، لباس و بهداشت پرسنل در صفحهٔ «بررسی تیم (حضور، لباز و بهداشت)» ثبت می‌شود؛ تأخیر، مرخصی ساعتی و اضافه‌کاری هم همان‌جا درج می‌شود. 💡 نکته: این نمره‌ها مستقیم در کارنامهٔ عملکرد هر فرد اثر می‌گذارد.',
      },
    ],
  },
  {
    key: 'store',
    title: 'تور فروشگاه و چیدمان',
    icon: 'store',
    tone: 'bg-amber-100 text-amber-700',
    section: 'فروشگاه',
    desc: 'نقشهٔ زندهٔ سالن با هشدار کم‌موجودی، ارزیابی چیدمان قفسه‌ها، انبارگردانی و ویرایش نقشهٔ فروشگاه.',
    min: 2,
    go: 'store/liveboard',
    roles: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK'],
    steps: [
      {
        go: 'store/liveboard',
        target: '[data-tour="sidebar"]',
        title: 'به بخش فروشگاه خوش آمدید',
        body: 'نقشهٔ زندهٔ فروشگاه، جای هر قفسه و یخچال را با وضعیتش نشان می‌دهد؛ رنگ هر بلوک یعنی نوع آن (گوندولا، قفسه، یخچال و…). 💡 نکته: نقطهٔ قرمز چشمک‌زن یعنی کم‌موجودی.',
        mobileHint: SIDEBAR_MOBILE_HINT,
      },
      {
        target: 'div[class*="min-w-[640px]"]',
        title: 'نقشهٔ زنده',
        body: 'این همین نقشهٔ زندهٔ سالن است: جای هر قفسه و یخچال با رنگ نوعش مشخص است. روی هر بلوک کلیک کنید تا آمارش — تعداد کالا، ارزش موجودی و کالاهای پرچمدار — را ببینید. 💡 نکته: نقطهٔ قرمز چشمک‌زن یعنی کم‌موجودی.',
      },
      {
        title: 'ارزیابی چیدمان',
        body: 'در صفحهٔ «ارزیابی چیدمان و عملکرد»، چهار معیار برای هر بلوک ثبت می‌شود: تاریخ و FEFO، نظم چیدمان، نظافت و برچسب قیمت. 💡 نکته: نمره‌ها در کارنامهٔ عملکرد همکاران همان بخش هم دیده می‌شود.',
      },
      {
        title: 'انبارگردانی',
        body: 'برنامهٔ شمارش‌ها، اجرای شمارش و فهرست مغایرت‌ها در صفحهٔ «انبارگردانی و شمارش» است. 💡 نکته: شمارشِ مغایرت‌دار با رنگ قرمز مشخص می‌شود و تاریخ آخرین شمارش هر کالا ثبت می‌ماند.',
      },
      {
        title: 'نقشهٔ فروشگاه',
        body: 'نقشهٔ ویرایش‌شوندهٔ سالن در صفحهٔ «نقشهٔ فروشگاه» است؛ می‌توانید بلوک‌ها را جابه‌جا یا اضافه کنید. 💡 نکته: تغییر نقشه همان لحظه روی همهٔ صفحه‌های فروشگاه اثر می‌گذارد.',
      },
    ],
  },
  {
    key: 'supply',
    title: 'تور انبار و سفارش',
    icon: 'package',
    tone: 'bg-teal-50 text-teal-700',
    section: 'انبار',
    desc: 'کالاها و بانک بارکد، سفارش‌گذاری هوشمند و دریافت کالا — چرخهٔ کامل کالا از انبار تا قفسه.',
    min: 1,
    go: 'supply/products',
    roles: ['*'],
    steps: [
      {
        go: 'supply/products',
        target: '[data-tour="sidebar"]',
        title: 'به بخش انبار خوش آمدید',
        body: 'صفحهٔ «کالاها و بانک بارکد»، بانک اطلاعات کالاهای فروشگاه است؛ در این نوار کناری، صفحه‌های چرخهٔ کالا را می‌بینید. 💡 نکته: جست‌وجو با نام یا بارکد انجام می‌شود.',
        mobileHint: SIDEBAR_MOBILE_HINT,
      },
      {
        /* جعبهٔ جست‌وجوی کالا در «کالاها و بانک بارکد» (نمای R4) */
        target: 'input[aria-label="جستجوی کالا"]',
        title: 'کالاها و بانک بارکد',
        body: 'در همین کادر جست‌وجو کنید (نام کالا یا بارکد)؛ برای هر کالا، بارکدها، قیمت خرید و فروش، موجودی و آستانهٔ کم‌موجودی ثبت می‌شود و کم‌موجودها با رنگ قرمز مشخص‌اند. 💡 نکته: کالاهای واردشده از حسابداری هلو با نشان «وارداتی» مشخص می‌شوند.',
      },
      {
        title: 'سفارش‌گذاری',
        body: 'از صفحهٔ «سفارش‌گذاری هوشمند» سفارش خرید ثبت می‌شود؛ تعداد پیش‌فرض هر کالا از تنظیمات خودش خوانده می‌شود و مقایسهٔ قیمت تأمین‌کننده‌ها پیش از ثبت دیده می‌شود. 💡 نکته: برای جزئیات، «تور سفارش‌گذاری» را ببینید.',
      },
      {
        title: 'دریافت کالا',
        body: 'در صفحهٔ «دریافت کالا» سفارش‌های رسیده را تأیید می‌کنید تا موجودی انبار همان لحظه به‌روز شود. 💡 نکته: اگر کم یا زیاد رسیده باشد، مغایرت را همان‌جا ثبت کنید.',
      },
    ],
  },
  {
    key: 'hr',
    title: 'تور کارکنان',
    icon: 'userCheck',
    tone: 'bg-emerald-100 text-emerald-700',
    section: 'کارکنان',
    desc: 'کارنامهٔ عملکرد با رتبهٔ الف تا د، پروندهٔ پرسنل، برنامهٔ شیفت هفتگی و حقوق و دستمزد.',
    min: 2,
    go: 'hr/performance',
    roles: ['OWNER', 'GM', 'ADMIN', 'EXEC'],
    steps: [
      {
        go: 'hr/performance',
        target: '[data-tour="sidebar"]',
        title: 'به بخش کارکنان خوش آمدید',
        body: 'کارنامهٔ عملکرد، ترکیبی از وظایف، چک‌لیست، حضور و ارزیابی چیدمانِ هر همکار است؛ در این نوار کناری صفحه‌های بخش پرسنل را می‌بینید. 💡 نکته: دوره را می‌توانید ماهانه یا هفتگی انتخاب کنید.',
        mobileHint: SIDEBAR_MOBILE_HINT,
      },
      {
        target: '[role="tablist"]',
        title: 'کارنامهٔ عملکرد',
        body: 'در این تب‌ها بین «کارکنان» و «ارزیابی مدیران» جابه‌جا می‌شوید. هر همکار نمرهٔ ۰ تا ۱۰۰ با رتبهٔ الف/ب/ج/د می‌گیرد؛ تفکیک معیارها با نمودار بالای کارتِ او نمایش داده می‌شود. 💡 نکته: معیار افزایش حقوق و پاداش در پایین همین صفحه توضیح داده شده است.',
      },
      {
        title: 'پروندهٔ پرسنل',
        body: 'اطلاعات، سابقهٔ شیفت و مرخصی هر فرد در صفحهٔ «پرونده پرسنل» است. 💡 نکته: تغییر نقش و دسترسی فقط توسط مدیر سامانه انجام می‌شود.',
      },
      {
        title: 'شیفت‌ها و گزارش تحویل',
        body: 'برنامهٔ شیفت صبح و عصر در صفحهٔ «برنامه شیفت هفتگی» تنظیم می‌شود و تحویل شیفت در «وظایف ← گزارش تحویل شیفت» ثبت می‌شود. 💡 نکته: گزارش تحویل باید توسط شیفت بعدی رسیدگی شود.',
      },
      {
        title: 'حقوق و دستمزد',
        body: 'پرداخت‌ها و حقوق در صفحهٔ «حقوق و دستمزد» دیده می‌شود. 💡 نکته: برای پاداش، از کارنامهٔ عملکرد همان دوره استفاده کنید.',
      },
    ],
  },
  {
    key: 'reports',
    title: 'تور گزارش‌ها',
    icon: 'barChart',
    tone: 'bg-amber-100 text-amber-700',
    section: 'گزارش‌ها',
    desc: 'صبح‌نامهٔ جلسهٔ روزانه، نمای کلی عملکرد و خروجی‌های اکسل.',
    min: 1,
    go: 'reports/briefing',
    roles: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'PM'],
    steps: [
      {
        go: 'reports/briefing',
        target: '[data-tour="sidebar"]',
        title: 'به بخش گزارش‌ها خوش آمدید',
        body: '«صبح‌نامه» خلاصهٔ آمادگی روز برای جلسهٔ مدیران است؛ در این نوار کناری صفحه‌های گزارش را می‌بینید. 💡 نکته: صبح‌نامه هر روز صبح به‌روز می‌شود.',
        mobileHint: SIDEBAR_MOBILE_HINT,
      },
      {
        /* سرصفحهٔ صبح‌نامه (صفحهٔ چانک اصلی — h2 نه h1) */
        target: 'main h2',
        title: 'صبح‌نامه',
        body: 'صبح‌نامه، نکات کلیدی دیروز و برنامهٔ امروز را یک‌جا می‌آورد تا جلسهٔ صبحگاهی کوتاه و دقیق باشد. 💡 نکته: قبل از جلسه، یک بار کامل مرورش کنید.',
      },
      {
        title: 'نمای کلی عملکرد',
        body: 'در صفحهٔ «نمای کلی عملکرد»، نمودارهای فروش، مرجوعی و سود در یک صفحه است. 💡 نکته: بازهٔ زمانی را از بالای صفحه عوض کنید.',
      },
      {
        title: 'خروجی‌ها',
        body: 'صفحهٔ «خروجی‌های اکسل» فایل‌های خروجی آماده را برای بایگانی و حسابداری می‌سازد. 💡 نکته: برای جلسه‌ها، خروجی PDF مرتب‌تر است.',
      },
    ],
  },
  {
    key: 'system',
    title: 'تور سیستم و دسترسی',
    icon: 'shieldCheck',
    tone: 'bg-stone-100 text-stone-600',
    section: 'سیستم',
    desc: 'فقط مدیران: مدیریت کاربران و دسترسی‌های صفحه‌به‌صفحه، تنظیمات فروشگاه، اتصال هلو و فعالیت‌ها.',
    min: 2,
    go: 'system/users',
    roles: ['OWNER', 'GM', 'ADMIN'],
    steps: [
      {
        go: 'system/users',
        target: '[data-tour="sidebar"]',
        title: 'به بخش سیستم خوش آمدید',
        body: 'مدیریت کاربران و دسترسی‌های صفحه‌به‌صفحه از همین بخش انجام می‌شود؛ در این نوار کناری صفحه‌های سیستم را می‌بینید. 💡 نکته: این تور فقط برای مدیران سامانه است.',
        mobileHint: SIDEBAR_MOBILE_HINT,
      },
      {
        target: 'input[placeholder*="جستجوی نام"]',
        title: 'کاربران و دسترسی‌ها',
        body: 'در همین کادر، کاربر را جست‌وجو کنید. برای هر کاربر — جدا از نقش او — می‌توانید دسترسی هر صفحه را «مجاز» یا «مسدود» کنید و توانایی‌ها (مثل تأیید مرجوعی) را روشن یا خاموش کنید. 💡 نکته: تغییرات فوری اعمال می‌شود و مالک و مدیران ارشد قابل مسدودکردن نیستند.',
      },
      {
        title: 'تنظیمات فروشگاه',
        body: 'تنظیمات عمومی سامانه — پیامک، پیش‌فرض‌های سفارش و تعطیلات رسمی — در صفحهٔ «تنظیمات فروشگاه» است. 💡 نکته: تاریخ تعطیلات در محاسبه‌گر چک هم استفاده می‌شود.',
      },
      {
        title: 'اتصال هلو',
        body: 'اتصال به حسابداری هلو در صفحهٔ «اتصال هلو» تنظیم می‌شود؛ اول با حالت آزمایشی (شبیه‌ساز) اتصال را امتحان کنید و بعد کالاها و اشخاص را بکشید. 💡 نکته: سفارش‌ها و مرجوعی‌ها هم می‌توانند به هلو ارسال شوند.',
      },
      {
        title: 'فعالیت‌ها',
        body: 'گزارش همهٔ عملیات — چه کسی، چه زمانی و چه کاری — در صفحهٔ «فعالیت‌ها» ثبت می‌شود. 💡 نکته: برای پیگیری اختلاف‌ها اول این‌جا را ببینید.',
      },
    ],
  },
]

/* ═══════════════════════════════════════════════════════════
   ۲) اجرای تور پایدار — موتور مشترک mountTour (lib/ui) که
   overlay را در document.body می‌سازد؛ با ناوبری بین بخش‌ها و
   unmount/remount شدن این view زنده می‌ماند. تاریک‌سازی چهارپاره،
   RTL، scrollIntoView و جای‌گذاری کارت همه در همان موتور است.
   ═══════════════════════════════════════════════════════════ */

/** تورِ در حال اجرا — سطح ماژول تا با unmount/remount شدن این view گم نشود */
let ACTIVE_TOUR: TourHandle | null = null

/* ═══════════════════════════════════════════════════════════
   ۳) نمای اصلی
   ═══════════════════════════════════════════════════════════ */

interface FormState {
  open: boolean
  editing: any
  title: string
  category: string
  summary: string
  body: string
  imageUrl: string
  pinned: boolean
  saving: boolean
}

const EMPTY_FORM: FormState = {
  open: false, editing: null, title: '', category: '', summary: '', body: '', imageUrl: '', pinned: false, saving: false,
}

export default function GuideView() {
  const { user, go } = useShell()
  const [tab, setTab] = useState('articles')

  /* ---- دانش‌نامه ---- */
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState(false)
  const [arts, setArts] = useState<any[]>([])
  const [cats, setCats] = useState<string[]>([])
  const [canManage, setCanManage] = useState(false)
  const [q, setQ] = useState('')
  const [qDeb, setQDeb] = useState('')
  const [cat, setCat] = useState('')
  const [badImgs, setBadImgs] = useState<Record<string, boolean>>({})

  /* ---- دیالوگ مقاله ---- */
  const [viewId, setViewId] = useState<string | null>(null)
  const [viewArt, setViewArt] = useState<any>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [badViewImg, setBadViewImg] = useState(false)

  /* ---- فرم مدیر ---- */
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [badFormImg, setBadFormImg] = useState(false)

  /* ---- تور خوش‌آمدگینی (TourEngine) ---- */
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const [welcomeBusy, setWelcomeBusy] = useState(false)

  useEffect(() => { void load() }, [])

  /* جست‌وجو با ۳۰۰ms تأخیر */
  useEffect(() => {
    const t = setTimeout(() => setQDeb(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  async function load() {
    setLoading(true)
    setLoadErr(false)
    const r = await api('/api/kb')
    setLoading(false)
    if (!r || !r.ok) {
      setLoadErr(true)
      toast.error((r && r.error) || 'خطا در دریافت مقالات راهنما')
      return
    }
    setArts(Array.isArray(r.data?.articles) ? r.data.articles : [])
    setCats(Array.isArray(r.data?.categories) ? r.data.categories : [])
    setCanManage(r.data?.canManage === true)
  }

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const a of arts) m[a.category] = (m[a.category] || 0) + 1
    return m
  }, [arts])

  const filtered = useMemo(() => {
    return arts.filter((a) => {
      if (cat && a.category !== cat) return false
      if (qDeb) {
        const hay = `${a.title || ''}\n${a.summary || ''}\n${a.category || ''}`
        if (!hay.includes(qDeb)) return false
      }
      return true
    })
  }, [arts, cat, qDeb])

  /* ---- مشاهدهٔ مقاله ---- */
  async function openView(a: any) {
    setViewId(a.id)
    setViewArt(null)
    setViewLoading(true)
    setBadViewImg(false)
    const r = await api(`/api/kb?id=${encodeURIComponent(a.id)}`)
    setViewLoading(false)
    if (!r || !r.ok) { toast.error((r && r.error) || 'مقاله یافت نشد'); setViewId(null); return }
    setViewArt(r.data?.article || null)
  }

  function closeView() { setViewId(null); setViewArt(null) }

  /* ---- فرم مدیر ---- */
  function openForm(a?: any) {
    setBadFormImg(false)
    setForm({
      open: true,
      editing: a || null,
      title: a?.title || '',
      category: a?.category || '',
      summary: a?.summary || '',
      body: a?.body || '',
      imageUrl: a?.imageUrl || '',
      pinned: a?.pinned === true,
      saving: false,
    })
  }

  async function saveForm() {
    if (form.title.trim().length < 2) { toast.error('عنوان مقاله الزامی است'); return }
    setForm((f) => ({ ...f, saving: true }))
    const payload = {
      id: form.editing?.id,
      title: form.title.trim(),
      category: form.category.trim(),
      summary: form.summary.trim(),
      body: form.body.trim(),
      imageUrl: form.imageUrl.trim(),
      pinned: form.pinned,
    }
    const r = form.editing
      ? await api('/api/kb', { method: 'PATCH', body: payload })
      : await api('/api/kb', { method: 'POST', body: payload })
    setForm((f) => ({ ...f, saving: false }))
    if (!r || !r.ok) { toast.error((r && r.error) || 'خطا در ذخیرهٔ مقاله'); return }
    toast.success(form.editing ? 'مقاله به‌روزرسانی شد' : 'مقالهٔ جدید ثبت شد')
    setForm((f) => ({ ...f, open: false }))
    void load()
  }

  async function delArticle(a: any) {
    if (!window.confirm(`مقاله «${a.title}» حذف شود؟`)) return
    const r = await api(`/api/kb?id=${encodeURIComponent(a.id)}`, { method: 'DELETE' })
    if (!r || !r.ok) { toast.error((r && r.error) || 'خطا در حذف مقاله'); return }
    toast.success('مقاله حذف شد')
    closeView()
    void load()
  }

  /* ---- تورها ---- */
  async function startWelcome() {
    if (welcomeBusy) return
    setWelcomeBusy(true)
    const r = await api('/api/me/tour', { method: 'POST', body: { reset: true } })
    setWelcomeBusy(false)
    if (!r || !r.ok) toast.error((r && r.error) || 'بازنشانی تور ناموفق بود')
    setWelcomeOpen(true)
  }

  function finishWelcome(done: boolean) {
    setWelcomeOpen(false)
    void api('/api/me/tour', { method: 'POST', body: {} }) // ثبت انجام‌شدن
    if (done) toast.success('تور خوش‌آمدگینی تمام شد')
  }

  function startSectionTour(def: TourDef) {
    if (ACTIVE_TOUR) { ACTIVE_TOUR.destroy(); ACTIVE_TOUR = null }
    ACTIVE_TOUR = mountTour(def.steps, {
      goFn: go,
      onDone: () => { ACTIVE_TOUR = null },
      onClose: () => { ACTIVE_TOUR = null },
    })
  }

  const visibleTours = useMemo(
    () => SECTION_TOURS.filter((d) => canSee(user, d.go, d.roles)),
    [user],
  )

  const chip = (active: boolean) => cn(
    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
    active
      ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
      : 'border-stone-200 bg-white text-stone-600 hover:border-emerald-400 hover:text-emerald-800',
  )

  /* ═════════ تب ۱: مقالات ═════════ */
  function renderArticles() {
    if (loading) {
      return (
        <div className="space-y-4">
          <div className="h-36 animate-pulse rounded-xl bg-stone-100" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-56 animate-pulse rounded-xl bg-stone-100" />
            ))}
          </div>
        </div>
      )
    }
    return (
      <>
        {/* سربرگ + جست‌وجو + چیپ‌ها */}
        <Card className="gap-0 py-0">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <I.bookOpen size={24} />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-extrabold text-stone-700">راهنما و دانش‌نامه</h1>
                <p className="mt-1 text-sm leading-6 text-stone-500">
                  پاسخ پرسش‌های همیشگی درباره کار با سامانه — از ثبت مرجوعی تا چک‌های سررسید.
                  {canManage && ' مدیران می‌توانند مقالهٔ جدید بسازند یا ویرایش کنند.'}
                </p>
              </div>
              {canManage && (
                <Button className="h-11 shrink-0 gap-1.5" onClick={() => openForm()}>
                  <I.plus size={16} /> مقالهٔ جدید
                </Button>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="relative w-full md:w-72">
                <I.search size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <Input
                  value={q}
                  onChange={(e: any) => setQ(e.target.value)}
                  placeholder="جست‌وجو در راهنما…"
                  className="h-11 ps-9"
                  aria-label="جست‌وجو در مقالات راهنما"
                />
              </div>
            </div>
            {cats.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-dashed pt-4">
                <button type="button" className={chip(cat === '')} onClick={() => setCat('')}>
                  همه ({fa(arts.length)})
                </button>
                {cats.map((c) => (
                  <button key={c} type="button" className={chip(cat === c)} onClick={() => setCat(cat === c ? '' : c)}>
                    {c} ({fa(counts[c] || 0)})
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* خطا */}
        {loadErr ? (
          <Card>
            <CardContent className="p-10 text-center">
              <I.alertTriangle className="mx-auto mb-3 text-amber-500" size={22} />
              <p className="text-sm text-stone-500">دریافت مقالات راهنما ناموفق بود</p>
              <div className="mt-4">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()}>
                  <I.refresh size={14} /> تلاش دوباره
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          /* خالی */
          <Card>
            <CardContent className="p-10 text-center">
              <I.search className="mx-auto mb-3 text-stone-300" size={24} />
              <p className="font-bold text-stone-600">مقاله‌ای یافت نشد</p>
              <p className="mt-1 text-xs text-stone-400">
                {qDeb || cat ? 'عبارت دیگری را جست‌وجو کنید یا فیلتر را بردارید' : 'به‌زودی مقالات راهنما اضافه می‌شود'}
              </p>
              {(qDeb || cat) && (
                <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => { setQ(''); setCat('') }}>
                  <I.x size={14} /> حذف فیلترها
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          /* شبکهٔ مقاله‌ها */
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((a) => (
              <ArticleCard
                key={a.id}
                a={a}
                bad={!!badImgs[a.id]}
                onImgError={() => setBadImgs((m) => ({ ...m, [a.id]: true }))}
                onOpen={() => void openView(a)}
              />
            ))}
          </div>
        )}
      </>
    )
  }

  /* ═════════ تب ۲: تورهای تعاملی ═════════ */
  function renderTours() {
    return (
      <>
        {/* کارت تور خوش‌آمدگینی */}
        <Card className="gap-0 border-emerald-200 bg-emerald-50 py-0">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <I.sparkles size={24} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-extrabold text-emerald-800">تور خوش‌آمدگینی</h2>
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
                    {fa(WELCOME_STEPS.length)} مرحله · حدود {fa(1)} دقیقه
                  </Badge>
                  {user?.tourDone === false && (
                    <span className="text-[11px] text-emerald-700">(هنوز کامل نشده)</span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-6 text-emerald-700">
                  آشنایی با نوار بخش‌ها، نوار کناری، زنگ اعلان‌ها، جست‌وجوی سریع و حساب کاربری. دفعهٔ اول ورود خودکار نمایش داده می‌شود؛ هر وقت بخواهید از این‌جا دوباره ببینید.
                </p>
              </div>
              <Button className="h-11 shrink-0 gap-1.5" onClick={() => void startWelcome()} disabled={welcomeBusy}>
                <I.play size={16} /> شروع دوباره
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* شبکهٔ تورهای بخشی */}
        {visibleTours.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <I.play className="mx-auto mb-3 text-stone-300" size={24} />
              <p className="font-bold text-stone-600">توری برای نمایش ندارید</p>
              <p className="mt-1 text-xs text-stone-400">بخش‌های در دسترس شما تور جداگانه‌ای ندارند.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleTours.map((d, i) => (
              <Card key={d.key} className={cn('flex flex-col gap-0 py-0 transition hover:border-emerald-400 hover:shadow-md', spanFor(i, visibleTours.length))}>
                <CardContent className="flex h-full flex-col p-4">
                  <div className="flex items-center gap-3">
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', d.tone)}>
                      <Icon name={d.icon as any} size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-stone-700">{d.title}</div>
                      <div className="mt-0.5 text-[11px] text-stone-500">
                        {fa(d.steps.length)} مرحله · حدود {fa(d.min)} دقیقه
                      </div>
                    </div>
                  </div>
                  <p className="mt-2.5 text-xs leading-5 text-stone-500">{d.desc}</p>
                  <div className="mt-3 flex-1" />
                  <div className="flex items-center justify-between gap-2 border-t border-dashed pt-3">
                    <span className="truncate text-[11px] text-stone-400">بخش: {d.section}</span>
                    <Button size="sm" className="shrink-0 gap-1.5" onClick={() => startSectionTour(d)}>
                      <I.play size={14} /> شروع تور
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <p className="text-center text-[11px] leading-5 text-stone-400">
          در هر تور، با دکمهٔ «بعدی» جلو بروید — کلید‌های ← → هم کار می‌کنند و Esc تور را می‌بندد.
        </p>
      </>
    )
  }

  /* ═════════ بدنه ═════════ */
  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v: string) => setTab(v)}>
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger value="articles" className="gap-1.5 py-2 text-xs sm:text-sm">
            <I.bookOpen size={15} /> مقالات
          </TabsTrigger>
          <TabsTrigger value="tours" className="gap-1.5 py-2 text-xs sm:text-sm">
            <I.play size={15} /> تورهای تعاملی
          </TabsTrigger>
        </TabsList>

        {/* ── تب مقالات ── */}
        <TabsContent value="articles" className="mt-4 space-y-4">
          {/* راهنمای تورها */}
          <Card className="gap-0 border-emerald-200 bg-emerald-50 py-0">
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <I.zap size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-emerald-800">برای آشنایی با هر بخش، سراغ تورهای تعاملی بروید</div>
                <div className="mt-0.5 text-xs leading-5 text-emerald-700">
                  هر بخش سامانه یک تور کوتاه دارد که همان‌جا شما را قدم‌به‌قدم راهنمایی می‌کند.
                </div>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTab('tours')}>
                <I.play size={14} /> دیدن تورها
              </Button>
            </CardContent>
          </Card>
          {renderArticles()}
        </TabsContent>

        {/* ── تب تورها ── */}
        <TabsContent value="tours" className="mt-4 space-y-4">
          {renderTours()}
        </TabsContent>
      </Tabs>

      {/* ═══════ دیالوگ مشاهدهٔ مقاله ═══════ */}
      <Dialog open={!!viewId} onOpenChange={(o: boolean) => { if (!o) closeView() }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {viewLoading && !viewArt ? (
            <div className="space-y-3 py-2">
              <div className="h-6 w-2/3 animate-pulse rounded-md bg-stone-100" />
              <div className="h-4 w-1/3 animate-pulse rounded-md bg-stone-100" />
              <div className="h-40 animate-pulse rounded-lg bg-stone-100" />
              <div className="h-4 w-full animate-pulse rounded-md bg-stone-100" />
              <div className="h-4 w-2/3 animate-pulse rounded-md bg-stone-100" />
            </div>
          ) : viewArt ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-right leading-7">{viewArt.title}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge variant="secondary">{viewArt.category}</Badge>
                  {viewArt.pinned && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">📌 سنجاق‌شده</span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <I.eye size={12} /> {fa(viewArt.views)} بازدید
                  </span>
                  <span>· {dateFa(viewArt.updatedAt)}</span>
                </DialogDescription>
              </DialogHeader>
              {viewArt.imageUrl && !badViewImg && (
                <img
                  src={viewArt.imageUrl}
                  alt=""
                  loading="lazy"
                  className="max-h-56 w-full rounded-lg border object-cover"
                  onError={() => setBadViewImg(true)}
                />
              )}
              <div className="whitespace-pre-wrap break-words py-1 text-sm leading-7 text-stone-600">
                {viewArt.body || '—'}
              </div>
              {canManage && (
                <DialogFooter className="gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openForm(viewArt)}>
                    <I.pencil size={14} /> ویرایش
                  </Button>
                  <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => void delArticle(viewArt)}>
                    <I.trash size={14} /> حذف
                  </Button>
                </DialogFooter>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ═══════ دیالوگ ساخت/ویرایش مقاله (مدیران) ═══════ */}
      <Dialog open={form.open} onOpenChange={(o: boolean) => { if (!o) setForm((f) => ({ ...f, open: false })) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-right">{form.editing ? 'ویرایش مقاله' : 'مقالهٔ جدید'}</DialogTitle>
            <DialogDescription>
              {form.editing ? 'محتوای مقاله را اصلاح کنید.' : 'مقالهٔ جدید برای دانش‌نامهٔ فروشگاه بنویسید.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-600">عنوان *</label>
              <Input
                value={form.title}
                onChange={(e: any) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="مثلاً: نحوهٔ ثبت مرجوعی"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-stone-600">دسته</label>
                <Input
                  value={form.category}
                  onChange={(e: any) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="عمومی"
                  list="kb-cats"
                />
                <datalist id="kb-cats">
                  {cats.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="flex items-end">
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 p-3 text-xs font-bold text-stone-600">
                  <Checkbox
                    checked={form.pinned}
                    onCheckedChange={(v: any) => setForm((f) => ({ ...f, pinned: v === true }))}
                  />
                  سنجاق در ابتدای فهرست
                </label>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-600">خلاصه</label>
              <Textarea
                rows={2}
                value={form.summary}
                onChange={(e: any) => setForm((f) => ({ ...f, summary: e.target.value }))}
                placeholder="یک تا دو جمله که در فهرست مقالات نمایش داده می‌شود"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-600">متن کامل مقاله</label>
              <Textarea
                rows={8}
                value={form.body}
                onChange={(e: any) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="متن کامل… خط تیرهٔ ابتدای هر خط، فهرست‌وار نمایش داده می‌شود."
                className="leading-7"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-600">نشانی تصویر (اختیاری)</label>
              <Input
                dir="ltr"
                value={form.imageUrl}
                onChange={(e: any) => { setBadFormImg(false); setForm((f) => ({ ...f, imageUrl: e.target.value })) }}
                placeholder="https://…"
              />
              {form.imageUrl.trim() && !badFormImg && (
                <img
                  src={form.imageUrl.trim()}
                  alt=""
                  className="mt-2 h-24 w-full rounded-lg border bg-stone-50 object-contain"
                  onError={() => setBadFormImg(true)}
                />
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setForm((f) => ({ ...f, open: false }))}>انصراف</Button>
            <Button disabled={form.saving} onClick={() => void saveForm()}>
              {form.saving ? 'در حال ذخیره…' : 'ذخیره'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تور خوش‌آمدگینی — TourEngine کتابخانهٔ مشترک (بدون ناوبری) */}
      <TourEngine
        open={welcomeOpen}
        steps={WELCOME_STEPS}
        onClose={() => finishWelcome(false)}
        onDone={() => finishWelcome(true)}
      />
    </div>
  )
}

/* ═════════ کارت مقاله ═════════ */
function ArticleCard({ a, bad, onImgError, onOpen }: {
  a: any
  bad: boolean
  onImgError: () => void
  onOpen: () => void
}) {
  const imgOk = !!a.imageUrl && !bad
  return (
    <Card
      className="group cursor-pointer gap-0 overflow-hidden py-0 transition hover:border-emerald-400 hover:shadow-md"
      role="button"
      tabIndex={0}
      aria-label={a.title}
      onClick={onOpen}
      onKeyDown={(e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
    >
      <CardContent className="p-0">
        {imgOk && (
          <div className="relative aspect-video w-full overflow-hidden bg-stone-100">
            <img
              src={a.imageUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
              onError={onImgError}
            />
          </div>
        )}
        <div className="p-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[10.5px]">{a.category}</Badge>
            {a.pinned && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">📌 سنجاق‌شده</span>
            )}
          </div>
          <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-6 text-stone-700 transition-colors group-hover:text-primary">
            {a.title}
          </h3>
          <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-stone-500">{a.summary || '—'}</p>
          <div className="mt-3 flex items-center gap-2 border-t border-dashed pt-2.5 text-[11px] text-stone-400">
            <span className="inline-flex items-center gap-1">
              <I.eye size={12} /> {fa(a.views)} بازدید
            </span>
            <span className="mr-auto">{dateFa(a.updatedAt)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
