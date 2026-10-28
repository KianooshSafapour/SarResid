# ECOMMERCE-HANDOFF — Build the Hyper Zeytoon Online Store

> **Purpose of this document:** Any NEW z.ai (GLM) conversation that is tasked with building the
> online store must start here. Read this file end-to-end before writing any code, then produce a
> concrete execution plan and only then implement. Everything below is verified fact about the
> running production system as of **October 2026 / Aban 1405** — do not re-derive it, do not
> contradict it, and ask the owner only for things explicitly marked *owner decision*.

---

## 1. Current state (what already exists and runs in production)

### 1.1 Internal platform "SarResid" (سر رسید)

- **URL:** https://sarresid.hyperzeytoon.com — internal supermarket management platform
  (buying/margin control, orders & receiving, warehouse, HR/shifts/attendance, cheques,
  archive, CRM, analytics, AI assistant).
- **Source:** `github.com/KianooshSafapour/SarResid` (branch `main`). SQLite DB
  (`db/custom.db`, ~106 MB) is **untracked in git** (>100 MB GitHub limit) — the live DB on
  the server and `/root/backups` are the data authority. Never commit it.
- **Server:** `195.248.241.14` (Nuremberg, BitCommand/DCH). Root credentials are provided by
  the owner in chat — never stored in the repo.
- **Domains:** `hyperzeytoon.com` and `hyperzeytoon.ir`, purchased from **ParsPack**, DNS on
  ParsPack's free CDN. Let's Encrypt certificate for `sarresid.hyperzeytoon.com` is active
  (auto-renews, next due 2027-01-19). The original domain/SSL setup was done by z.ai
  (chat.z.ai/s/c43cecc4-026a-4bda-8b10-428c2c165f2) — follow the same pattern for the root
  domain when the storefront goes live.
- **Stack on the server:**
  - Next.js 16 **standalone** build run with **bun**, port `:3000` — systemd unit `sarresid-web`.
  - Realtime service (socket.io) on `:3030` with an HTTP emit API on `:3031` guarded by
    `REALTIME_SECRET` — systemd unit `sarresid-realtime`.
  - Holoo API simulator on `:3040` — systemd unit **`holoo-sim`** (the unit name is exactly
    `holoo-sim`, NOT `sarresid-holoo-sim`).
  - nginx terminates 80→443 and proxies to :3000.
- **Database (Prisma + SQLite):** 14,991 products with real prices/barcodes/groups,
  212,572 real Holoo purchase/sale trade rows (Tir–Aban 1405), 18 staff users, ~1,180
  suppliers, document archive, HR records. Schema lives in `prisma/schema.prisma`.
- **Auth:** internal PIN (4-digit) or password login → HTTP-only session cookie
  (`POST /api/auth/login {userId, mode:'pin'|'password', value}`). Roles:
  `OWNER` (Javad Norouzi Behjat), `GM` (general manager Mrs. Lotfi — full access),
  `ADMIN` (Kianoosh Safapour), `EXEC` (evening-shift manager Mr. Mollaie), `ACC`
  (accountant Mrs. Darvishi), `PM`, `SK` (warehouse), `HC`, `CASHIER`, `SALES`, `MERCH`.
  Fine-grained page RBAC via `pageAllow` (`src/lib/access.ts`). All internal PINs are `1234`
  in dev; the ADMIN password is `@@HZ6677`.

### 1.2 Holoo accounting (Apex) — the ERP that must receive online sales

- Holoo runs on-premise at the store; its web service is REST/JSON at
  `http://{HOOLO-IP}:8080/TncHoloo/api` (default port 8080, Windows service
  `TncHolooWebService`).
- **Login:** `POST /Login` with `{userinfo: {username, userpass: <base64>, dbname}}` →
  returns a Bearer token; send it as the `Authorization` header on every subsequent call.
- **The full 51-page integration PDF is already extracted to text** at
  `qa/holoo-pdf-text.txt`, and a working client already exists: **`src/lib/holoo.ts`**
  (tested against the simulator).
- Endpoints that matter for the store:
  - `GET /Product` — catalog + prices + barcodes (`Morecodes`).
  - `PUT /api/Product` with `{productinfo: [{erpcode, sellprice, sellprice2}]}` —
    price update. **Semantics (owner-verified):** `sellprice` = final (discounted) sale
    price, `sellprice2` = printed price ("قیمت چاپی", maps to SarResid
    `Product.sellPrice2`). This exact mapping is implemented in
    `src/lib/margin-purchase.ts → publishPricesToHoloo()`.
  - `POST /Invoice/Invoice` — sales invoice (`type = 1`).
  - `POST /Invoice/Order` — order.
  - Customer + payment-receive helpers (`createCustomer`, `createPaymentReceive`) are
    already implemented in `src/lib/holoo.ts`. For payment receives, take care with the
    cash ledger code (`cashsarfasl`) — read the PDF text before using it.
- **Two cutover caveats (known):**
  1. The PDF's write paths sometimes duplicate the `/api` segment (`/api/api/...`). If the
     real Holoo returns 404 on a write, drop one `/api` segment and retry.
  2. Holoo exposes **no write API for barcodes** (`Morecodes`) — barcode additions stay
     SarResid-side; a `HolooSyncLog` queue with type `BARCODE_ADD` already exists.
- Prior art for pushing documents to Holoo from the platform:
  `src/lib/margin-purchase.ts → pushOrderToHoloo()` (purchase invoice) — reuse its
  patterns (cookie-forwarding to internal API, pending queue, retry).

### 1.3 AI assistant (already live)

- `/api/ai/chat` (z.ai GLM with a read-only tool loop: KPIs, monthly sales, top products,
  low stock, product search, price trend) and `/api/ai/settings`. The z.ai API key is stored
  by the owner in the platform's `system/ai` settings page (OWNER/ADMIN/GM only) — keys are
  never hardcoded.

### 1.4 What you must NOT break (critical constraints)

- The internal SPA frontend is served from **frozen production chunks**
  (`public/_next/static/chunks/`, plus the `hz-ext/` pipeline that compiles views into one
  content-hashed chunk). **Do not touch `hz-ext/`, the frozen chunks, or the patch scripts
  for storefront work.** Commerce work happens in normal Next.js route handlers
  (`src/app/api/shop/*`) and in a separate storefront app — both are regular code.
- The SQLite file is single-writer. Keep transactions short; never run long migrations
  during store hours (Iran 07:00–23:00).
- Deployments follow the existing script pattern (`deploy/make-package-r13.sh` →
  `deploy/deploy-r13.sh`): backup → upload → `bun install` → `prisma db push` (with
  generate) → build → restart services → idempotent data imports → test-data reset →
  verify. Note: since R17 the reset script (`scripts/reset-test-data-r13.ts`) **preserves
  all real staff data** and only purges provable test artifacts — keep it that way.

---

## 2. Goal

A **Persian, RTL, mobile-first online supermarket store** at `https://hyperzeytoon.com`
(and `.ir`), where:

1. The catalog is **live** from the SarResid database (real in-store stock and prices).
2. A customer order flows into SarResid as a first-class order with a delivery/picker
   workflow for staff, and lands in Holoo as a **sales invoice (type 1)** with payment.
3. Payment is an **Iranian gateway + cash on delivery** (gateway choice is an *owner
   decision*: ZarinPal / IDPay / ParsPack payments — propose, don't assume).
4. The storefront is a installable **PWA**, fast on cheap Android phones, in Persian.

---

## 3. Architecture (research-based, deliberately pragmatic)

Research summary (event-driven + headless retail, 2025): online retail works best
**headless** — the storefront is a separate presentation app; commerce logic lives behind
an API; inventory sync is **event-driven with idempotency**; catalog reads are
read-optimized (CQRS-lite). References:
[Event-Driven Architecture in Retail: Real-Time Inventory Sync (2025)](https://www.researchgate.net/publication/394001365_Event-Driven_Architecture_in_Retail_Real-Time_Inventory_Synchronization_for_Omnichannel_Retail) ·
[OrderPilots — idempotency/DLQ](https://orderpilots.com/event-driven-inventory-synchronization) ·
[Gravitee — EDA patterns](https://www.gravitee.io/blog/event-driven-architecture-patterns) ·
[Netguru — Headless Ecommerce](https://www.netguru.com/blog/headless-ecommerce) ·
[Hygraph — headless commerce](https://hygraph.com/blog/headless-commerce).

**Our scale (one store, one server) does not need Kafka or a separate message broker.**
The pragmatic translation of those patterns onto this stack:

```
[ hyperzeytoon.com — Storefront ]      new standalone Next.js app (PWA, fa-IR, RTL)
        ↕  REST/JSON over HTTPS (internal service token)
[ SarResid Commerce API ]              new /api/shop/* route group inside SarResid
        ↕  Prisma (same SQLite DB)     ↕  src/lib/holoo.ts (same Holoo client)
[ SarResid core + staff workflows ]    [ Holoo sales invoice type=1 ]
```

- **Storefront app** (decide: separate folder `storefront/` in the same repo, or a new
  repo — recommend same repo, `storefront/`, deployed as a second systemd service on
  `:3100` with its own nginx vhost). It has **no direct DB access** and **zero secrets**;
  it only talks to `/api/shop/*`.
- **Commerce API inside SarResid** (fastest path, reuses auth/notify/SMS/Holoo libs):
  new Prisma models — `ShopCustomer` (phone OTP identity), `ShopOrder`, `ShopCartItem`,
  `ShopAddress`, `ShopSyncEvent` (outbox), `ShopSetting`. Customer identity = mobile number
  + OTP delivered through the existing SMS pipeline (`SmsOutbox` already exists).
- **Inventory sync (event-driven, no broker):** every stock/price mutation in SarResid
  appends a row to `ShopSyncEvent` (outbox table) with an `idempotencyKey`. The storefront
  reads catalog via `/api/shop/catalog` with ETags; freshness via 30-second polling in
  phase 1, upgrading to the **existing socket.io realtime service (:3030)** later.
- **Sellable stock rule:** `available = Product.stock − reservedByActiveBaskets −
  shelfFloor` where basket reservations carry a TTL of 15 minutes. **Never sell negative
  stock** — reject or trim the basket at checkout, honestly.
- **Money:** every amount in the DB is in **RIAL**, and Iranian gateways are RIAL-based —
  keep RIAL end-to-end, format with Persian digits + thousand separators in the UI.

---

## 4. Roadmap (propose refinements, but keep the shape)

### Phase 0 — Foundations (≈1 day)
1. `staging.hyperzeytoon.com` vhost + Let's Encrypt (mirror the sarresid setup:
   ParsPack DNS → server, certbot webroot, nginx).
2. Prisma models for shop (above) + `prisma db push` (additive only — never destructive).
3. `GET /api/shop/catalog` — active products with image/price/barcode/group, paginated,
   with fuzzy search reusing **`src/lib/fuzzy.ts`** (already shared by the internal app
   and the AI assistant).
4. Service-to-service auth: static token in `ShopSetting` (storefront → API header),
   rate limits on OTP endpoints.

### Phase 1 — Storefront (≈1 week)
- Home with categories (from `Product.mainGroup`), product page, search, guest basket →
  OTP login → customer account (order history).
- PWA (installable, offline shell), optimized for 1366×768 desktop and low-end mobile.
- Product images: reuse `ProductImage` + the existing image-search tooling from the
  internal platform.

### Phase 2 — Ordering & payment (≈1 week)
- Address + delivery time-slot picker; delivery fee rules (owner decision on zones).
- Gateway (ZarinPal/IDPay/… — **owner decision**) + **cash on delivery**; payment result
  verification server-side; order state machine:
  `CART → AWAITING_PAYMENT → PAID/COD → PICKING → DELIVERING → DELIVERED → INVOICED`.
- Every `ShopOrder` appears in the internal **orders** view as a new "online" lane;
  picking/delivery updates notify staff through the existing realtime notifications
  (`src/lib/notify.ts`) so warehouse/cashier see it instantly.

### Phase 3 — Holoo integration (≈1 week)
- On `DELIVERED`, create the Holoo **sales invoice (type 1)**: find-or-create the Holoo
  customer by phone (`createCustomer`), then invoice + `createPaymentReceive` for paid
  orders (careful with `cashsarfasl`; COD invoices get a payment receive only when the
  driver cashes in — owner decision on timing).
- Queue failures in `HolooSyncLog` (existing pattern) and retry; idempotency key =
  `ShopOrder.id`.

### Phase 4 — Growth
- Loyalty: reuse existing CRM (`Customer`, `CrmEvent`, tier) already linked to returns.
- SMS campaigns (existing `smscenter`), smart recommendations via `/api/ai/chat` tools.

**Definition of done for every phase:** role-bot acceptance tests in `qa/bots/`
(the codebase's established pattern — plain Node fetch scripts with per-role logins),
a browser E2E pass, deploy via the existing script pattern, and verification on the live
staging URL before touching production.

---

## 5. Operational notes

- **Server budget:** 2 vCPU / 8 GB shared with the internal app. Keep the storefront
  light: SSR with cache headers, no heavy client bundles, images lazy + sized.
- **nginx:** add `server_name hyperzeytoon.com hyperzeytoon.ir www.hyperzeytoon.com`
  with certbot for the root domain (the wildcard SAN already covers `*.hyperzeytoon.com`
  for subdomains such as sarresid).
- **Secrets:** live only in SarResid `Setting` rows or server env files; the storefront
  process holds nothing but its service token. Rate-limit OTP (e.g., 3/hour/phone) and
  lock IPs after repeated failures.
- **Backups:** the server already snapshots the DB to `/root/backups` — extend retention
  to cover shop tables automatically (they're in the same DB file).
- **Testing:** imitate `qa/bots/r13…r17-bots.mjs` for shop bots (customer OTP flow with a
  dev backdoor code, basket TTL expiry, negative-stock rejection, payment callback
  verification, Holoo invoice against the **simulator on :3040** first).

---

## 6. Suggested first message for the new z.ai chat

> I have read `docs/ECOMMERCE-HANDOFF.md` in github.com/KianooshSafapour/SarResid.
> Execute Phase 0 and Phase 1 exactly as specified in section 4: first the staging
> subdomain + SSL, the shop Prisma models (additive only), `/api/shop/catalog` with fuzzy
> search, then the RTL mobile-first storefront PWA for hyperzeytoon.com. The server is
> 195.248.241.14 (I will provide root credentials). Before deploying anything, give me a
> detailed plan with the exact files and endpoints you will create.

(فارسی، برای پیام اول به چت جدید: «سند docs/ECOMMERCE-HANDOFF.md را خوانده‌ام؛ فاز ۰ و ۱
را طبق بخش ۴ اجرا کن — ابتدا staging و مدل‌ها و /api/shop/catalog، بعد ویترینِ RTL
موبایل‌اول. سرور 195.248.241.14 است و رمز را جداگانه می‌دهم. پیش از استقرار، پلن دقیق
بده.»)
