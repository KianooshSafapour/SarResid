# ECOMMERCE-HANDOFF — سند تحویل برای ساخت فروشگاه آنلاین هایپر زیتون
> **هدف این سند:** هر گفت‌وگوی جدید با z.ai (GLM) باید از همین‌جا شروع کند و بدون پرس‌وجوی اضافه، فروشگاه آنلاین `hyperzeytoon.com` را روی زیرساخت موجود بسازد. این متن را کامل بخوان و بعد پلن اجرایی بده.

## ۱. وضعیت فعلی (اکتبر ۲۰۲۶ / آبان ۱۴۰۵)

### پلتفرم داخلی «سر رسید» — آماده و در تولید
- آدرس: https://sarresid.hyperzeytoon.com (پلتفرم داخلی) — کد: `github.com/KianooshSafapour/SarResid` (main).
- سرور: **195.248.241.14** (Nuremberg، BitCommand/DCH) — همهٔ خریدها (سرور و دامنه‌ها) از **ParsPack**؛ دامنه‌ها: **hyperzeytoon.com و hyperzeytoon.ir**؛ DNS روی CDN رایگان ParsPack؛ گواهی **Let's Encrypt** برای sarresid.hyperzeytoon.com فعال (تا ۲۰۲۷-۰۱-۱۹، تمدید خودکار). راه‌اندازی دامنه/SSL قبلاً توسط z.ai انجام شده (گفت‌وگوی chat.z.ai/s/c43cecc4).
- استک: Next.js 16 standalone (bun) روی :3000 + سرویس realtime (socket.io :3030) + شبیه‌ساز هلو (:3040) + nginx 80→443. systemd: `sarresid-web`, `sarresid-realtime`, `holoo-sim`.
- دیتابیس: SQLite (Prisma) `/opt/sarresid/db/custom.db` — ۱۴,۹۹۱ کالا، ۲۱۲,۵۷۲ ردیف خرید/فروش واقعی هلو (تیر تا آبان ۱۴۰۵)، پرسنل، تأمین‌کنندگان، آرشیو اسناد.
- احراز هویت داخلی: PIN/رمز (session cookie) — نقش‌ها: OWNER/GM(مدیرکل=خانم لطفی)/ADMIN(کیانوش)/EXEC/ACC(حسابدار درویشی)/PM/SK/HC/CASHIER/SALES/MERCH.

### حسابداری هلو (Holoo Apex) — آمادهٔ اتصال
- سرویس وب REST/JSON هلو روی `http://{هلو-IP}:8080/TncHoloo/api` (پورت پیش‌فرض 8080، ویندوز-سرویس TncHolooWebService).
- ورود: `POST /Login {userinfo:{username, userpass(base64), dbname}}` → توکن Bearer؛ بعد همهٔ فراخوانی‌ها با هدر `Authorization`.
- قرارداد کامل (۵۱ صفحه) استخراج شده: **`qa/holoo-pdf-text.txt`** — و `src/lib/holoo.ts` پیاده‌سازی و با شبیه‌ساز تست شده است.
- نقاط کلیدی: `GET /Product` (کاتالوگ+قیمت‌ها+بارکد Morecodes) · `PUT /api/Product` (اصلاح قیمت: erpcode + sellprice=قیمت فروش نهایی، **sellprice2=قیمت چاپی**) · `POST /Invoice/Invoice` (فاکتور فروش type=1) · `POST /Invoice/Order` (سفارش) · وب‌هوک‌های تغییر کالا/مشتری.
- ⚠ دو نکتهٔ cutover: (۱) مسیرهای نوشتن PDF گاهی `/api/api/...` دوبار می‌گویند — اگر هلو واقعی 404 داد یک `/api` حذف شود؛ (۲) هلو برای افزودن بارکد اندپوینت نوشتاری ندارد (صف HolooSyncLog نوع BARCODE_ADD از قبل وجود دارد).
- تجربهٔ ثبت فاکتور خرید در هلو از پلتفرم: `src/lib/margin-purchase.ts` (pushOrderToHoloo) و انتگراسیون قیمت در `publishPricesToHoloo`.

### دستیار هوشمند
- `/api/ai/chat` (z.ai GLM، حلقهٔ ابزار فقط-خواندنی) + `/api/ai/settings` — کلید z.ai از تنظیماتِ `system/ai` داخل پلتفرم ذخیره می‌شود (OWNR/ADMIN/GM).

## ۲. هدف

**فروشگاه آنلاین سوپرمارکت** روی `https://hyperzeytoon.com` (و .ir) با:
- کاتالوگ زنده از همان دیتابیس سر رسید (موجودی/قیمت واقعی فروشگاه)،
- سفارش آنلاین → گردش‌کار پیک/تحویل در سر رسید + ثبت فاکتور فروش در هلو،
- پرداخت درگاه ایرانی + پرداخت در محل،
- تجربهٔ موبایل-اول فارسی RTL.

## ۳. معماری پیشنهادی (مبتنی بر تحقیق)

تحقیق (EDA + headless): فروشگاه آنلاین خرده‌فروش باید **headless** باشد — ویتrin جода (storefront) جدا از موتور تجاری، همگام‌سازی موجودی **رویدادمحور** با idempotency، و CQRS برای خواندنِ سریع کاتالوگ. منابع: [Event-Driven Architecture in Retail: Real-Time Inventory Sync (2025)](https://www.researchgate.net/publication/394001365_Event-Driven_Architecture_in_Retail_Real-Time_Inventory_Synchronization_for_Omnichannel_Retail) · [OrderPilots — idempotency/DLQ](https://orderpilots.com/event-driven-inventory-synchronization) · [Gravitee — EDA patterns](https://www.gravitee.io/blog/event-driven-architecture-patterns) · [Netguru — Headless Ecommerce](https://www.netguru.com/blog/headless-ecommerce) · [Hygraph guide](https://hygraph.com/blog/headless-commerce).

### طرح سه‌لایه (همان سرور، همان repo یا repo جدا — تو تصمیم بگیر و بشخص پیشنهاد بده)
```
[hyperzeytoon.com  Storefront]   ← Next.js جدید (فارسی RTL، موبایل-اول، PWA)
        ↕ REST (داخلی)
[SarResid Commerce API]  ← لایهٔ جدید در همین پروژه: /api/shop/*
        ↕ Prisma (همان DB)            ↕ Holoo lib (همان holoo.ts)
[سر رسید + هلو]                [فاکتور فروش هلو type=1]
```
- **Storefront**: اپ Next.js مستقل (پورت 3100 یا داکر/nginx جدا) — بدون دسترسی مستقیم به DB؛ فقط از `/api/shop/*`.
- **Commerce API در سر رسید** (سریع‌ترین راه): مدل‌های جدید `ShopCustomer`, `ShopOrder`, `ShopCartItem`, `WebhookOut`; نقش‌بندی: مشتری با OTP پیامکی (SmsOutbox از قبل هست).
- **همگام‌سازی موجودی**: رویدادمحور — هر تغییر موجودی/قیمت در سر رسید → صف `ShopSyncEvent` → Storefront با ETag/poll سریع یا socket.io موجود (realtime :3030). برای شروع polling ۳۰ث + event در ادامه کافی است (بدون Kafka — مقیاس ما نیازی ندارد؛ idempotency-key بگذار).
- **موجودی آنلاین**: `available = stock − رزرو سبد (TTL 15m) − آستانهٔ قفسه` — هرگز موجودی منفی نفروش.

## ۴. نقشهٔ راه پیشنهادی (فازها)

1. **فاز ۰ — آماده‌سازی (۱ روز):** زیردامنهٔ staging + SSL (همان الگوی ParsPack/letsencrypt که برای sarresid کار کرد)؛ مدل‌های shop در Prisma؛ `/api/shop/catalog` (فقط کالاهای فعال با عکس/قیمت/بارکد، صفحه‌بندی+جست‌وجوی فازی `src/lib/fuzzy.ts` — از قبل مشترک است).
2. **فاز ۱ — ویترین (۱ هفته):** صفحهٔ اصلی دسته‌ها (از mainGroup)، صفحهٔ کالا، جست‌وجو، سبد مهمان→OTP→حساب؛ PWA نصب‌شدنی؛ بهینهٔ 1366×768 و موبایل.
3. **فاز ۲ — سفارش و پرداخت (۱ هفته):** آدرس/زمان تحویل، درگاه (زرین‌پال/IDPay/پارس‌پک‌پرداخت — تصمیم با مالک)، پرداخت در محل؛ سفارش → `ShopOrder` → گردش‌کار سر رسید (تب جدید در سفارش‌ها: آنلاین) → اعلان پیک/انبار.
4. **فاز ۳ — هلو (۱ هفته):** هر سفارش آنلاینِ تحویل‌شده → `createInvoice` نوع ۱ (فروش) با مشتری هلو (`createCustomer` از قبل پیاده) + رسید پرداخت (`createPaymentReceive` — از قبل پیاده، احتیاط cashsarfasl).
5. **فاز ۴ — رشد:** باشگاه مشتری (CRM موجود: Customer/CrmEvent/tier — از قبل وصل به مرجوعی)، کمپین پیامکی، پیشنهاد هوشمند با همان /api/ai/chat.

## ۵. نکته‌های عملیاتی

- **سرور**: ۲ هسته/۸GB — Storefront سبک نگه دار (SSR/cache). nginx: `server_name hyperzeytoon.com *.hyperzeytoon.com` + certbot برای ریشهٔ دامنه.
- **عکس کالا**: از قبل `ProductImage` + `image-search` در پلتفرم هست — کاتالوگ آنلاین همان‌جا.
- **پول**: همهٔ مبالغ در DB «ریال» است؛ درگاه‌ها ریالی — سازگار.
- **امنیت**: کلیدها در Setting سر رسید؛ Storefront هیچ secret نداشته باشد؛ rate-limit روی OTP.
- **تست**: الگوی `qa/bots/*.mjs` (بات‌های نقش‌محور) برای shop هم بساز؛ شبیه‌ساز هلو برای E2E.

## ۶. اولین پیام پیشنهادی برای چت جدید z.ai
«سند `docs/ECOMMERCE-HANDOFF.md` در github.com/KianooshSafapour/SarResid را خوانده‌ام. فاز ۰ و ۱ طبق بخش ۴ اجرا کن: ابتدا زیرساخت staging و مدل‌ها و /api/shop/catalog، بعد ویترین RTL موبایل-اول روی hyperzeytoon.com. سرور 195.248.241.14 (root، رمز را من می‌دهم). قبل از استقرار، پلن دقیق بده.»
