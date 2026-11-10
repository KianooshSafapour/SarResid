# R14 — docs
import io

# ── PLATFORM-GUIDE.md ──
p = 'PLATFORM-GUIDE.md'
s = io.open(p, encoding='utf-8').read()

old_row = "| مالی (شامل سودسنج — R12/R13) | **دفتر فاکتورها** (R13 گردش‌کار ۶گامی:"
new_row = "| مالی (شامل سودسنج — R12/R13/R14) | **دفتر فاکتورها** (R13 گردش‌کار ۶گامی:"
assert old_row in s
s = s.replace(old_row, new_row)
s = s.replace("تأیید نهایی مدیرعامل (خانم لطفی) + انتشار قیمت‌ها (قیمت فروش = sellprice، قیمت چاپی = sellprice2/SellPrice2) در سر رسید و هلو** ← بایگانی سند کاغذی در زون‌بند با شماره‌های هلو و اسکن؛ دیالوگ تمام‌عرض)",
              "تأیید نهایی مدیر کل (خانم لطفی) + انتشار قیمت‌ها (قیمت فروش = sellprice، قیمت چاپی = sellprice2/SellPrice2) در سر رسید و هلو ← بایگانی؛ R14: زون‌بندِ هر شرکت ذخیره می‌شود و با تأیید مدیر کل بایگانی خودکار (برگهٔ خودکارِ بعدی) انجام می‌شود؛ دیالوگ تمام‌عرض)")

# AI API rows
old_api = "| `GET /api/system/monitor` | R13 پایش زندهٔ سرور — CPU/RAM/دیسک/دیتابیس/سرویس‌ها (OWNER/ADMIN) |"
new_api = old_api + "\n| `POST /api/ai/chat` | R14 دستیار هوشمند z.ai/GLM — گفت‌وگو + ابزارهای فقط-خواندنی تحلیل (OWNER/ADMIN) |\n| `GET/PUT/POST /api/ai/settings` | R14 کلید/مدل/آدرس z.ai + تست اتصال (OWNER/ADMIN؛ کلید ماسک) |"
assert old_api in s
s = s.replace(old_api, new_api)

# سامانه row: add دستیار هوشمند — find the system section mention of پایش سرور in section table
if 'دستیار هوشمند' not in s:
    s = s.replace('**آرشیو اسناد و مدارک** (R7؛ R13: سند سفارش اقلام برگشتی و مامور پخش را نشان می‌دهد) | hz-ext |',
                  '**آرشیو اسناد و مدارک** (R7؛ R13: سند سفارش اقلام برگشتی و مامور پخش را نشان می‌دهد) | hz-ext |')
io.open(p, 'w', encoding='utf-8').write(s)
print('guide ok')

# ── worklog.md ──
entry = """
---

## Task ID: R14 — تأیید مدیر کل در سفارش‌ها + رفع باگ سودسنج + بایگانی خودکار + اسکن بارکد + دستیار هوشمند z.ai
**تاریخ: ۱۴۰۵/۰۸/۰۵ (2026-10-27، عصر) — هماهنگ‌کننده: ZCode (جلسهٔ مالک: کیانوش صفاپور)**

Context:
- بازخورد مالک پس از R13: (۱) «پیش‌فاکتور در سودسنج» به سودسنج می‌رود ولی فهرست خالی است — نقد درست: آزمون R13 فقط بارگذاری صفحه را دید نه بارگذاری اقلام؛ (۲) در جریان سفارش، پس از «ثبت در حسابداری» گام تأیید «مدیر کل» (خانم لطفی — GM یعنی مدیر کل، نه مدیرعامل که آقای نوروزی است) نیست؛ (۳) بایگانی باید خودکار شود — زون‌بندِ هر شرکت یک‌بار تعیین و فاکتورهای بعدی خودکار بایگانی شوند؛ (۴) چیدمان «سفارش جدید» عرض صفحه را هدر می‌دهد (کارت طرف حساب/ضایعات تمام‌عرض)؛ (۵) هشدار دریافت زودتر/دیرتر از تاریخ تحویل + توضیح اجباری؛ (۶) اسکن بارکد در فرم دریافت و ثبت بارکد جدید؛ (۷) اسپارک «روند پردازنده» از همان اول صاف رسم شود؛ (۸) انتگراسیون هوش مصنوعی z.ai (GLM) داخل پلتفرم.

Work Log:
- BUGFIX (نقدشده): regex عمق‌لینک فاکتورنویس هنوز پیشوند قدیمی #/profit/builder را می‌گرفت؛ از R12 هش finance/ است → بارها اقلام خالی می‌شد. اصلاح: (?:finance|profit). درس QA: آزمون باید محتوای اقلام را tooize کند نه فقط heading — E2E این بار هر دو قلم + ستون‌ها را assert کرد.
- GM-ORDERS: Order += gmApprovedAt/ById/ByName؛ اکشن جدید gm-approve (GM/OWNER/ADMIN؛ فقط ACCOUNTED؛ idempotent) — فاکتور سودسنجِ متصل (purchaseOrderId) هم‌زمان gm-approve و قیمت‌ها منتشر می‌شود (publishPricesToHoloo)؛ final-approve بدون آن رد («پیش از بستن، تأیید مدیر کل لازم است»)؛ اعلان GM/مالک/ادمین پس از account؛ receiving.tsx گام ۵ دکمهٔ بنفش «تأیید مدیر کل (لطفی) و انتشار قیمت‌ها» + بلوک وضعیت + بستن قفل. اصطلاح «مدیرعامل» در همهٔ رشته‌های R13 به «مدیر کل» اصلاح شد.
- LAYOUT: سفارش جدید — کارت طرف حساب (۵/۱۲) و ضایعاتِ همان (۷/۱۲) کنار هم (xl:grid-cols-12؛ در 1600px کارت تأمین‌کننده 485px به‌جای تمام‌عرض)؛ جدول نتایج/سبد min-w ۱۰۰۰→۹۰۰.
- OFF-SCHEDULE: شروع دریافت وقتی امروز ≠ تاریخ تحویل → دیالوگ هشدار (زودتر/دیرتر + چند روز) + توضیح اجباری ≥۵ حرف؛ سرور رویداد history «off-schedule» + extras.offScheduleNote/Days ثبت می‌کند.
- SCAN: اکشن scan-barcode (فقط RECEIVING/RECEIVED؛ قلم متصل به کالا؛ قالب ۴..۲۰ رقم — نکته: اول toFaDigits گذاشته بودم که همه را پاک می‌کرد؛ toEnDigits) — شناخته→known؛ جدید→افزودن به barcodesJson (≤۶۰) + logActivity + HolooSyncLog BARCODE_ADD (سرویس Apex مطابق PDF اندپوینت نوشتاری Morecodes ندارد — صف/پیگیری). receiving.tsx هر ردیف فرم دریافت کادر «اسکن بارکد…» + چیپ ✓مطابقت/بارکد جدید. (PDF صفحهٔ ۳۲۶: Morecodes فقط خواندنی.)
- AUTO-ARCHIVE: Setting archive.autoBind {id:<supplierId>|name:<نام>→binderId} + resolveAutoBinder + nextFolioOf (max عددی+۱). archive += saveBinder (چک «این زون‌بند را برای این شرکت ذخیره کن» پیش‌فرض ✓)؛ gm-approve += autoArchive (چک «بایگانی خودکار» پیش‌فرض ✓) → اگر نگاشت باشد: سند ARCHIVED با برگهٔ خودکار + status archived + رویداد history؛ GET [id] فاکتور autoArchiveBinder را برمی‌گرداند.
- MONITOR-SPARK: اسپارک CPU از همان نخستین نمونه خط صاف رسم می‌شود (نقطهٔ تکراری).
- AI (z.ai/GLM): lib/ai.ts (Setting ai.apiKey/baseUrl/model؛ پیش‌فرض https://api.z.ai/api/paas/v4 + glm-4.6؛ aiChatRaw سازگار OpenAI با ابزار). POST /api/ai/chat (OWNER/ADMIN؛ حلقهٔ ≤۶ نوبت ابزار) با ابزارهای فقط-خواندنی: get_kpi_overview (شامل raw-SQL کم‌موجود)، get_monthly_sales، get_top_products، get_low_stock، search_products (فازی مشترک lib/fuzzy)، get_price_trend؛ پرامپت سیستمی فارسی با قاعدهٔ «عدد فقط از ابزار». /api/ai/settings (GET ماسک/PUT/POST تست). نمای system/ai «دستیار هوشمند» — چت + پیشنهادهای آماده + نشان ابزارهای استفاده‌شده + دیالوگ تنظیم کلید (فقط سمت سرور). کلید واقعی را مالک وارد می‌کند — تست endpoint بدون کلید ✓ (۴۰۰ واضح).
- BOT-QA (qa/bots/r14-bots.mjs): ۵ ربات، ۲۴ سنجه سبز — سفارش کامل با تاریخ گذشته (off-schedule در history)، اسکن (شناخته/جدید در بانک/نامعتبر/قلم غلط)، ثبت حسابداری، بستن قبل از GM رد، نقش ۴۰۳، GM تأیید + قیمت‌ها، بستن OK؛ بایگانی خودکار (saveBinder → GET autoArchiveBinder → gm-approve autoArchive → سند + برگهٔ بعدی → archived)؛ AI نقش‌ها/بدون کلید. E2E مرورگر: builder?id هر دو قلم + ستون‌ها رندر شد (باگ اصلی)، چیدمان جدید (کارت 485px@1600).
- CLEANUP: reset-test-data-r13 += حذف Setting archive.autoBind (فقط دادهٔ تست می‌تواند داشت)؛ محلی پاک شد.

Stage Summary:
- هر ۸ خواسته عملی شد. گردش‌کار سفارش اکنون mirror فاکتورهاست: ثبت حسابداری → تأیید مدیر کل (لطفی، انتشار قیمت) → بستن. بایگانی با ذخیرهٔ یک‌بارهٔ زون‌بندِ شرکت، در تأیید مدیر کل خودکار می‌شود (برگهٔ خودکار).
- محدودیت صادقانه: افزودن بارکد به خود هلو از سرویس وب Apex ممکن نیست (PDF فاقد اندپوینت) — در بانک سر رسید ثبت و در HolooSyncLog صف می‌شود.
- دستیار هوشمند با کلید z.ai مالک فعال می‌شود (تنظیمات → تست اتصال). ابزارها فقط-خواندنی‌اند؛ اقدام‌نمایی (نوشتن در پلتفرم) گام بعدی است.
- استقرار: deploy-r13.sh (الگوی همان) + بستهٔ r14؛ سپس push گیت‌هاب.
"""
p2 = 'worklog.md'
s2 = io.open(p2, encoding='utf-8').read()
s2 = s2.rstrip('\n') + '\n' + entry
io.open(p2, 'w', encoding='utf-8').write(s2)
print('worklog ok')
