# holoo-bridge — پل اتصال هلو آپکس (Holoo Apex Edition)

سرویس مستقل Bun روی پورت **۳۰۲۰ (ثابت)** — واسط بین سامانهٔ هایپر زیتون و نرم‌افزار حسابداری هلو. بدون هیچ وابستگی خارجی (node:http روی ران‌تایم Bun).

## اجرا

```bash
cd mini-services/holoo-bridge
bun run dev     # حالت توسعه (hot-reload)
bun run start   # حالت عادی
```

سرویس را نگه دارید (ترجیحاً با pm2/systemd یا یک تب ترمینال دائمی)؛ اگر پل قطع باشد، همگام‌سازی از سمت سامانه خطای FAILED می‌گیرد و در دفتر زمانی ثبت می‌شود.

## معماری اتصال

```
Admin UI (تب «هلو آپکس و همگام‌سازی»)
        │  fetch /api/admin/holoo
        ▼
Next.js API  (src/app/api/admin/holoo/route.ts)  ← نقش‌سنجی + Snapshot + SyncLedger
        │  fetch bridgeUrl  (پیش‌فرض http://127.0.0.1:3020)
        ▼
holoo-bridge (این سرویس، :3020)
        │  حالت live فقط
        ▼
Holoo Apex web API  (سرور داخلی فروشگاه)
```

- **حالت شبیه‌ساز (پیش‌فرض):** کاتالوگ قطعی (deterministic) با بیش از ۱۲۰ کالای واقعی سوپرمارکت ایران (کاله، رامک، پگاه، روزانه، پانال، گلدیس، سونیا، زمزم، علی‌قائم، کیسان، چین‌چین، تک، نستله، کیت‌کت، اورئو، مارس، پرستو…) در ۸ گروه لبنیات/پروتئینی/خواروبار/نوشیدنی/بهداشتی/شیرینی/وارداتی/آجیل + ۲۸ شرکت پخش. بدون هیچ random در زمان اجرا — خروجی هر بار یکسان است تا تست و بازپخش (replay) قابل اعتماد باشد.
- **حالت مستقیم (live):** متغیر محیطی `HOLOO_UPSTREAM_URL` را روی نشانی وب‌سرویس هلو آپکس بگذارید؛ همان endpointها به مسیرهای آپ‌استریم پروکسی می‌شوند. هر خطای آپ‌استریم به‌صورت `{ ok:false, error }` با کد ۵۰۲ برمی‌گردد.

```bash
HOLOO_UPSTREAM_URL=http://192.168.1.10:8080 HOLOO_TOKEN=my-secret bun run start
```

## Endpoints

| مسیر | شرح |
|---|---|
| `GET /health` | `{ ok, mode: 'simulator'\|'live', upstream, version, uptime, catalogSize, suppliers }` — برای چیپ سلامت در تب ادمین |
| `POST /api/verify` | بدنه `{ token }` → `{ ok }` — تطبیق با `HOLOO_TOKEN` (پیش‌فرض `demo-token`)؛ در حالت live به آپ‌استریم پروکسی می‌شود |
| `GET /api/products?cursor=0&limit=100` | `{ items, nextCursor, total, mode }` — صفحه‌بندی cursor-based؛ هر آیتم: `{ holooCode: 'HZ-1001..', name, unit, category, buyPrice, sellPrice, stock, supplierName, barcode }` (تومان) |
| `GET /api/suppliers` | `{ items, total }` — هر آیتم: `{ code: 'SUP-01..', name, personName, phone, categories: [...] }` |

همهٔ پاسخ‌ها CORS باز (`Access-Control-Allow-Origin: *`) دارند؛ فراخوانی اصلی سمت سرور است و CORS فقط برای اشکال‌زدایی از مرورگر لازم می‌شود.

## مسیرهای فرضی هلو آپکس (حالت live)

مسیرهای واقعی وب‌سرویس Holoo Apex Edition مستند عمومی ندارند؛ این سرویس این مسیرها را **فرض** می‌کند (در صورت تفاوت، فقط همین بخش از index.ts را تغییر دهید):

| پل (این سرویس) | مسیر آپ‌استریم فرض‌شده |
|---|---|
| `GET /api/products?cursor&limit` | `GET {UPSTREAM}/Api/Products?cursor=&limit=` |
| `GET /api/suppliers` | `GET {UPSTREAM}/Api/Suppliers` |
| `POST /api/verify` | `POST {UPSTREAM}/Api/VerifyToken` |

احراز هویت آپ‌استریم: هدر `Authorization: Bearer $HOLOO_TOKEN` + timeout ۱۵ ثانیه برای هر درخواست.

## متغیرهای محیطی

| متغیر | پیش‌فرض | شرح |
|---|---|---|
| `HOLOO_UPSTREAM_URL` | — (خالی = شبیه‌ساز) | نشانی وب‌سرویس هلو آپکس؛ ست شود → حالت live |
| `HOLLOO_UPSTREAM_URL` | — | نام جایگزین (سازگاری) |
| `HOLOO_TOKEN` | `demo-token` | توکن /api/verify و Bearer آپ‌استریم |

پورت با `bun run` ثابت است (۳۰۲۰ در کد) — با کلید پل `holoo_bridge_url` در تنظیمات سامانه باید یکی باشد.
