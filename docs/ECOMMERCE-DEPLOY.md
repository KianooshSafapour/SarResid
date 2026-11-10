# ECOMMERCE-DEPLOY — Deployment guide for the Hyper Zeytoon online store

> **Status (2026-10-31, R19): DEPLOYED AND LIVE.** https://hyperzeytoon.com + www serve the
> storefront (systemd `storefront-web`, :3100). Cert via **acme.sh** (auto-renews, cron).
> FarazSMS panel verified against api.iranpayamak.com and set as the DEFAULT SMS panel —
> shop OTP sends through it. Admin console: https://sarresid.hyperzeytoon.com/shop-ops
> (Orders / Categories / Products & Images / Customers / Settings — all GUI, no API calls).
> Free-delivery threshold default: 50,000,000 IRR (editable in Settings GUI).



> استقرار R18: ویترین + Commerce API + پنل کارکنان + فاکتور هلو.
> همه‌چیز از قبل ساخته و تست شده است (بات‌ها ۵۵/۵۵ + رگرسیون R17 ۲۰/۲۰).
> این سند را کامل بخوانید؛ فقط مرحلهٔ ۴ به بعد روی سرور اجرا می‌شود.

---

## ۰) چه چیزی ساخته شده (وضعیت فعلی)

| قطعه | کجا | توضیح |
|---|---|---|
| ویترین (PWA فارسی RTL) | `storefront/` | Next.js مستقل، پورت `:3100`، بدون DB و بدون راز |
| Commerce API | `src/app/api/shop/*` | کاتالوگ/OTP/سبد/سفارش/درگاه داخل ساررسید |
| پنل سفارش کارکنان | `/shop-ops` | کد عادی Next (دور از چانک‌های منجمد SPA) |
| مدل‌های داده | `prisma/schema.prisma` | ShopCustomer/Order/CartItem/Basket/… (افزودنی) |
| فاکتور هلو | `src/lib/shop.ts` | روی DELIVERED فاکتور فروش نوع ۱ + مشتری `W{موبایل}` |
| تست | `qa/bots/shop-bots.mjs` | ۵۵ بررسی؛ با شبیه‌ساز :3040 راستی‌آزمایی می‌کند |

## ۱) تصمیم‌های مالک (قبل یا بعد از استقرار — همگی از پنل قابل تغییر)

- **درگاه پرداخت:** پیش‌فرض mock (تست). برای زرین‌پال: تنظیمات → `shop:gateway=zarinpal` + `shop:gatewayMerchant` (+ sandbox تا تست شود). پرداخت در محل از روز اول فعال است.
- **هزینهٔ ارسال:** پیش‌فرض ۶۰٬۰۰۰ ریال داخل رفسنجان؛ ارسال رایگان از ۱٬۵۰۰٬۰۰۰ ریال (`shop:deliveryFee` / `shop:freeDeliveryMin`).
- **بازه‌های تحویل:** ۳ روز آینده، ۹–۱۲ / ۱۴–۱۸ / ۱۸–۲۲، ظرفیت ۶ سفارش در هر بازه، مهلت ۹۰ دقیقه (`shop:slots`).
- **کف قفسه:** ۲ عدد از هر کالا آنلاین فروخته نمی‌شود (`shop:shelfFloor`).
- **اعلان کارکنان:** SK+HC+GM+EXEC (`shop:notifyRoles`).
- تغییر همهٔ این‌ها: `PUT /api/shop-admin/settings` با حساب مدیر (OWNER/GM/ADMIN).

## ۲) پیش‌نیازها (هم‌اکنون برقرار است)

- DNS: `hyperzeytoon.com` و `www` → `195.248.241.14` ✓ (بررسی شد)
- bun 1.4.3 و nginx و certbot روی سرور ✓؛ پورت ۳۱۰۰ آزاد ✓
- RAM ~۴GB — ویترین standalone سبک است؛ در ساعات پیک هم‌زمانی با ساررسید OK.

## ۳) ساخت بسته (روی ویندوز، در ریشهٔ پروژه)

```bash
bash deploy/make-package-r18.sh
# → deploy/sarresid-r18-<timestamp>.tar.gz  (کد + سورس ویترین؛ بدون db/.env/node_modules)
```

## ۴) آپلود و اجرا (روی سرور)

آپلود با pscp (SFTP سرور خراب است):

```bash
pscp -pw "«رمز»" deploy/sarresid-r18-*.tar.gz root@195.248.241.14:/root/
```

سپس روی سرور (SSH):

```bash
plink -ssh -pw "«رمز»" root@195.248.241.14
CONFIRM=YES bash /root/deploy-r18.sh /root/sarresid-r18-*.tar.gz
```

اسکریپت به‌ترتیب: پشتیبان DB → کد ساررسید → `prisma db push` (افزودنی) → seed تنظیمات
(`SHOP_DEV_OTP=false` — کد dev ۱۱۱۱۱ روی سرور خاموش است) → بیلد (با رقص چانک‌های منجمد)
→ ری‌استارت → ویترین در `/opt/hyperzeytoon-store` + سرویس `storefront-web` روی `:3100`
→ **توکن سرویس تصادفی** بین ویترین و API → گواهی Let's Encrypt برای ریشهٔ دامنه → vhost nginx → تست نهایی.

**اول staging می‌خواهید؟** بله — سند ECOMMERCE-HANDOFF همان را می‌خواهد؛ در ParsPack یک A-record برای
`staging.hyperzeytoon.com` بزنید به همین IP، بعد:

```bash
CONFIRM=YES STAGING=1 bash /root/deploy-r18.sh /root/sarresid-r18-*.tar.gz
```

(بعد از تأیید روی staging، دوباره بدون STAGING برای دامنهٔ اصلی؛ فاز A idempotent است.)

## ۵) پس از استقرار — چک‌لیست ۱۰ دقیقه‌ای

1. `https://hyperzeytoon.com` → صفحهٔ نخست با دسته‌ها و پرفروش‌ها باز شود.
2. جست‌وجو کنید، کالا بیفزایید، با یک موبایل واقعی OTP بگیرید و سفارش COD ثبت کنید.
3. `https://sarresid.hyperzeytoon.com/shop-ops` → سفارش را ببینید → جمع‌آوری → پیک → تحویل.
4. خروجی اسکریپت «وضعیت اتصال هلو» را ببینید — اگر `holoo:enabled ≠ true` بود، از تنظیمات هلو
   داخل ساررسید فعال کنید (فاکتورهای صف‌شده با دکمهٔ «تلاش دوبارهٔ هلو» ثبت می‌شوند).
5. در هلو واقعی: طرف حساب `W09xxxxxxxxx` + فاکتور فروش را ببینید.
6. `~# systemctl status storefront-web` و `journalctl -u storefront-web -f` سالم باشد.

## ۶) نگهداری

- **پشتیبان:** ویترین stateless است؛ DB ساررسید همان مرجع است (بکاپ موجود کافی است).
- **تمدید گواهی:** certbot خودکار (الگوی 00-acme)؛ فایل‌های vhost تازه هم مسیر challenge را دارند.
- **بستن فروشگاه موقت:** `PUT /api/shop-admin/settings {"shop:open": false}` — ویترنت بنر «بسته» می‌گذارد.
- **لاگ فاکتور هلو:** `HolooSyncLog` با kind=`SHOP_INVOICE`؛ خطای سفارش در `/shop-ops` دیده می‌شود.
- **دادهٔ کالا:** قیمت از `sellPrice` (نهایی) و قیمت چاپی از `sellPrice2` می‌آید — همان قرارداد سودسنج/هلو.
  ۹۷٪ کالاها ErpCode هلو نداشتند؛ در اولین فاکتورِ هر کالا با **بارکد** خودکار وصل می‌شوند (غنی‌سازی تنبل)
  — برای وصل‌کردن دستیِ گروهی، از صفحهٔ هلو ساررسید PULL_PRODUCTS بگیرید.

## ۷) بازگشت (rollback)

```bash
systemctl stop storefront-web && rm /etc/nginx/sites-enabled/hyperzeytoon-store && nginx -s reload
# ساررسید: کد قبلی از بکاپ /root/backups/sarresid.pre-r18.*.tar.gz + DB از custom.db.pre-r18.*
```
(مدل‌های افزودنی مشکل‌ ساز نیستند؛ حتی با کد قدیمی، جداول اضافی بی‌استفاده می‌مانند.)

## ۸) نقشهٔ بعدی (فاز رشد ECOMMERCE-HANDOFF §4)

- Loyalty اتصال به CRM موجود · کمپین پیامکی · توصیه‌گر هوشمند با ابزارهای /api/ai/chat ·
  اتصال realtime موجود (:3030) به‌جای polling ۳۰ثانیه‌ای کاتالوگ.
