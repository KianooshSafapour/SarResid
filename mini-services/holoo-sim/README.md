# شبیه‌ساز وب‌سرویس هلو (holoo-sim)

سرویس مستقل Bun که **قرارداد وب‌سرویس حسابداری هلو** (سند `webserviceHelp.pdf` — استخراج‌شده در `/tmp/holoo-api.txt`)
را با همان شکل دقیقِ درخواست/پاسخ پیاده می‌کند تا تیم سررسید بدون دسترسی به هلو واقعی، یکپارچه‌سازی کامل را
تست و توسعه دهد. هنگام سوییچ به هلو واقعی **هیچ تغییری در کد لازم نیست** — فقط تنظیمات را عوض کنید (پایین).

## اجرا

```bash
cd mini-services/holoo-sim
bun run dev          # ← اجرای داغ روی پورت 3040
```

- آدرس پایه: `http://127.0.0.1:3040/TncHoloo/api`
- بررسی سلامت: `curl http://127.0.0.1:3040/`

## اعتبارنامه پیش‌فرض (Login)

| پارامتر | مقدار |
|---|---|
| username | `admin` |
| userpass | `YWRtaW4=` (Base64 کلمهٔ `admin` — سند هلو رمز را Base64 می‌خواهد؛ مقدار خام `admin` هم پذیرفته می‌شود) |
| dbname | `Holoo1` |

```bash
curl -X POST http://127.0.0.1:3040/TncHoloo/api/Login \
  -H 'Content-Type: application/json' \
  -d '{"userinfo":{"username":"admin","userpass":"YWRtaW4=","dbname":"Holoo1"}}'
# → {"Login":{"State":"True","Token":"Bearer sim-token-…","ErrorCode":0,"Error":""}}
```

توکن باید در هدر `Authorization` همهٔ متدهای دیگر ارسال شود و **۶۰ دقیقه** اعتبار دارد؛ پس از آن پاسخ
`401 {"Login":{"State":"False","ErrorCode":2,"Error":"توکن نامعتبر"}}` برگردانده می‌شود (مثل کلاینت واقعی،
لاگین مجدد و تکرار درخواست کافی است).

## داده

- `seed.json` — با اسکریپت یک‌بارهٔ `scripts/gen-holoo-seed.ts` از دیتابیس واقعی سررسید تولید می‌شود
  (۴۰۰ کالا + ۴۰ تأمین‌کننده + گروه‌ها/واحدها). بازتولید:
  ```bash
  cd /home/z/my-project && bun run scripts/gen-holoo-seed.ts
  rm mini-services/holoo-sim/data.json   # تا شبیه‌ساز دوباره از seed بالا بیاید
  ```
- `data.json` — حالت زندهٔ سرویس؛ بعد از هر درج/اصلاح ذخیره می‌شود و با ری‌استارت می‌ماند.

## متدهای پیاده‌سازی‌شده (پیشوند `/TncHoloo/api`)

| متد | مسیر | توضیح |
|---|---|---|
| POST | `/Login` | ورود، صدور توکن Bearer |
| GET | `/Customer` · `/Customer/{page}/{size}` | لیست اشخاص (فیلتر: `code`, `code.from`, `code.to`, `purchaser`, `seller`, `vaseteh`, `nationalid`) |
| POST / PUT | `/Customer` | درج / اصلاح طرف حساب (`custinfo`) — کدهای خطای ۷/۸/۹/۱۰/۲۱ |
| GET | `/Product` · `/Product/{page}/{size}` | لیست کالاها (فیلتر: `code`, `name`, `maingrouperpcode`, `sidegrouperpcode`, `getimage`) |
| POST / PUT | `/api/Product` | درج / اصلاح کالا (`productinfo`) — کدهای ۳۷/۳۸/۳۹/۴۰/۴۳ |
| GET | `/MainGroup` · `/SideGroup` · `/Unit` | گروه‌های اصلی/فرعی و واحدها |
| GET | `/Invoice` | لیست فاکتورها (`Code`, `Type`, `Sanadcode`, `customererpcode`, …) |
| POST | `/Invoice/PreInvoice` | پیش‌فاکتور (`invoiceinfo` + `detailinfo`) |
| POST | `/Invoice/Order` | سفارش — `type`: ۱=فروش، ۳=خرید |
| POST | `/Invoice/Invoice` | فاکتور — `type`: ۱=فروش، ۲=برگشت از فروش، ۳=خرید، ۴=برگشت از خرید (+ `Cash/Bank/Nesiyeh/Discount`, `hazineinfo`, `incomeinfo`) |
| POST | `/api/Payment/Havaleh` | سند حواله طرف حساب (`payinfo`) |
| POST | `/api/Payment/ReciveFromCustomer` | سند دریافت از طرف حساب |
| GET | `/Settings` | `{"CurrencyUnit":[{"name":"RepVahedPooli","string":"ریال"}]}` |
| GET | `/Report/GetSarfasl` · `GetCash` · `GetAccound` · `GetMaxFewProduct` · `GetMinFewProduct` · `GetMaxBedCustomer` · `GetMaxBesCustomer` | گزارش‌های مدیریتی (دادهٔ منطقی از وضعیت سرویس) |
| POST | `/webhook/subscribe` | `{subscriptions:[{url,tablename,apikey}]}` — جداول مجاز: `customer`, `product`, `mainGroup`, `sideGroup`, `resInvoice` |
| GET | `/webhook/subscriptions` (و `/webhook/subscribe`) | لیست اشتراک‌ها (دیباگ) |
| GET | `/webhook/stop` · `/webhook/start` | توقف/شروع موقت |
| DELETE | `/webhook/subscribe?table=product` | حذف اشتراک |

### جستجوی نام کالا (`?name=`) — دقیقاً طبق سند هلو

- `?name=چیپ مز` → کالاهایی که نامشان **شامل همهٔ کلمات** است («چیپس مزمز ساده»، «مزه چیپس تنوری مزمز» و…)
- `?name="چیپس"` → فقط تطابق **دقیق** نام
- `?name="کالای1,کالای2"` → نام دقیقاً «کالای1» **یا** شامل «کالای2»

### کدهای خطا

کدهای خطای سند هلو (۱ تا ۴۶) با همان متن‌های فارسی اعمال می‌شوند — مثل:
`38 = نام کالا تکراری میباشد`، `36 = مبلغ تسویه فاکتور با جمع فاکتور برابر نمیباشد`،
`31 = نوع فاکتور معتبر نمی باشد` و… . خطاهای منطقی با HTTP 200 و شکل
`{"Header":"…","ErrorCode":n,"Error":"…"}` برمی‌گردند (مثل سرویس واقعی).

### وب‌هوک

بعد از هر درج/اصلاح کالا یا طرف حساب، برای اشتراک‌های همان جدول یک POST اجرا می‌شود:

```json
{ "Dbname": "Holoo1", "Table": "product", "operation": "CREATE", "changedfields": ["S00000001", "نام کالا"] }
```

ارسال fire-and-forget است و خطاها فقط در کنسول سرویس لاگ می‌شوند.

## تفاوت با هلو واقعی — چطور سوییچ کنیم؟

شبیه‌ساز **همان قرارداد** را دارد؛ برای اتصال به هلو واقعی (نصب‌شده روی ویندوز سرویس `TncHolooWebService`
روی پورت ۸۰۸۰) فقط در سامانه سررسید (بخش تنظیمات → اتصال هلو یا `PUT /api/holoo/settings`) این مقدارها را
عوض کنید:

```json
{ "useMock": false, "baseUrl": "http://<IP-سرور-هلو>:8080/TncHoloo/api", "username": "…", "userpass": "<Base64 رمز>", "dbname": "…" }
```

تفاوت‌های شناخته‌شدهٔ شبیه‌ساز: موجودی/قیمت‌ها از دادهٔ seed است، گزارش‌ها تقریبی‌اند، سریال‌ها همیشه خالی‌اند
و تصویر کالا فقط با `getimage=true` رشتهٔ نمونه برمی‌گرداند.
