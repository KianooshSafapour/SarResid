# SPEC-R3 — SarResid Round 3 («مهر» → dev) — Extension Contracts v2

READ THIS FULLY. Also read `/home/z/my-project/worklog.md` (last 3 sections) + `SPEC-AGENT.md` (v1 conventions — still valid: API envelope, Persian errors, hz-ext bridge imports, icons list).
BASELINE: git tag `v_0.1_Alpha` (مهر) is the restore point. NEVER delete `hz-ext/originals/`, git tags, or `/home/z/backups/`.

## 0. What this round delivers (user requirements → tasks)

| # | Requirement | Owner task |
|---|---|---|
| 1 | RBAC: per-user page permissions + capabilities for owner/sysadmin | B1 + F4 |
| 2 | Ordering quick-search → RTL TABLE, per-row unit +/- AND carton +/- steppers, supplier (طرف حساب) selector | F1 |
| 3 | Returns: bank card disabled+optional when exchange covers total; BIG readable thermal receipt; customer history = collapsed indicator → dialog | F2 |
| 4 | Welcome tour: only first time (tourDone), dim works every step, retake; per-section tours in knowledge center | ME (patch) + F6 |
| 5 | RTL arrows correct everywhere | ME (patch) + all view agents |
| 6 | Home section redesign + personalization; research-backed | R1 + F5 |
| 7 | Team review: remove presence checkbox; late/hourly-leave/overtime = hours+minutes inputs | F3 (view) + B3 (API) |
| 8 | ALL date inputs → Jalali date picker (incl. original chunk views via global enhancer) | ME (lib/ui + shell.html) |
| 9 | Per-user task/section visibility | B1 (pageDeny) + ME (registry patch) |
| 10 | Holoo integration + dummy Holoo simulator (port 3040) | B2 + F10 |
| 11 | User personalization: password/PIN change, dashboard customization, profile | B1 + F4 + F5 |
| 12 | Professional PDF/print for all documents | F9 + ME (PrintFrame) |
| 13 | Shift handover (گزارش تحویل شیفت) + problems system overhaul | B1 + F8 |
| 14 | Store blueprint: real trapezoid + door recesses | F7 |
| 15 | Column-based floor date-checking with rotation | B3 + F7 |

## 1. SHARED FRONTEND KIT (coordinator provides — DO NOT recreate)

`hz-ext/src/lib/ui.tsx` (exported via `../lib/hz` — import { JalaliDate, Stepper, TourEngine, PrintFrame, barcode128, amountWords } from '../lib/hz'):
- `JalaliDate({ value, onChange(v), placeholder?, className?, quickChips? })` — Popover + RTL Jalali month-grid picker. value = `'1405-07-27'` string or ''.
- `Stepper({ value, onChange, min=0, max?, step=1, unit?, size? })` — minus / persian-digit value / plus stepper.
- `TourEngine({ steps, open, onDone, onClose })` — steps: `{ target?: string (CSS selector), title, body, mobileHint? }`; proper dim via 4 edge panels + highlight ring + tooltip; keyboard (Esc, ArrowLeft=next RTL); progress «n از m».
- `PrintFrame({ open, onOpenChange, title, html, autoPrint? })` — hidden iframe, `@page` sized, print()+save-pdf.
- `barcode128(text, height)` → canvas element generator (Code128-B, ported).
- `amountWords(rial)` → Persian words string (ریال + تومان line).

## 2. BACKEND CONTRACTS

### 2.1 User & permissions (B1) — Prisma changes (append to schema.prisma, then `bun run db:push`)
```prisma
model UserPermOverride {
  id        String   @id @default(cuid())
  userId    String
  pageKey   String   // e.g. "finance/cheques" | "section:hr" (whole section) | "cap:approveReturns"
  allow     Boolean  // true=force allow, false=force deny
  createdAt DateTime @default(now())
  @@unique([userId, pageKey])
}
```
- `src/lib/access.ts` — ADD (keep existing exports): `PAGE_DEFAULTS` map (mirror of registry chunk's page map incl. hz-ext views), `SECTION_DEFAULTS`, `CAP_DEFAULTS` (approveReturns, recordReturnPayment, approveOrders, verifyReceiving, managePayroll, manageUsers, signCheques, managePlanograms, confirmZoneCounts, answerUrgent, manageChecklists — role lists copied from registry chunk), `effectiveAccess(user)` → `{ pageDeny: string[], pageAllow: string[], caps: Record<string,boolean> }` (overrides win over role defaults; OWNER/ADMIN cannot be denied pages; super-roles keep all caps).
- `/api/auth/me` — response user gains: `tourDone: boolean` (read Setting `tour_<userId>`, {done:true}), `pageDeny: string[]`, `pageAllow: string[]`, `caps: {...}`.
- `/api/admin/users` PATCH — accept `permissions?: { upserts: [{pageKey, allow}] , removals: [pageKey] }` (admin-only); GET — include per-user override count + `caps`.
- NEW `/api/admin/users/[id]/permissions` — GET `{ overrides: [...] }`, PUT `{ upserts, removals }`.
- Enforcement: NEW helper `assertPageAccess(user, pageKey)` in access.ts (throws Persian fail). B1 applies it to the page-data routes of: hr/payroll, hr/personnel, finance/cheques, finance/payments, crm/campaigns, system/settings, store/floorplan, store/planograms, store/zones, store/pricecheck, store/waste, profit/stats, reports/exports, returns/approvals, returns/customers, supply/orders, supply/receiving, tasks/attendance, hr/performance (only ADD a check after existing auth; if route already restricts to roles, add override check so an allowed user passes even if role lacks it, and a denied user is blocked).
- Per-user caps enforcement: in `returns` approve route (canApproveReturns→cap `approveReturns` + user cap override), payments (recordReturnPayment), orders approve (approveOrders), cheques create (signCheques) — extend existing `src/lib/access.ts` canX helpers to accept user object (keep old signatures working).

### 2.2 Personalization (B1)
- NEW `/api/me/password` POST `{ current, next }` — verify current (password OR pin accepted for non-password users; kianoosh-style admins must give password); min 6 chars; update.
- NEW `/api/me/pin` POST `{ current, next }` — 4 digits; verify current pin/password.
- NEW `/api/me/profile` PATCH `{ fullName?, honorific?, phone?, title?, avatarJson? }`.
- NEW `/api/me/prefs` GET `{ prefs }` / POST `{ prefs }` — stored in Setting `prefs:<userId>` (JSON arbitrary; dashboard uses `dash` key: `{ widgets: [{key, visible, order}], density }`).
- logActivity every mutation.

### 2.3 Shift handover rework (B1) — ShiftReport model: add `shift String @default("MORNING")`, `acknowledgedById String?`, `acknowledgedAt DateTime?`.
- `/api/shift-reports` REWRITE:
  - GET `?date=1405-07-28&shift=EVENING` → `{ report (latest for date+shift), previous (latest earlier), metrics: { returnsToday, returnsPending, lowStockCount, ordersWaiting, chequesThisWeek, tasksOpen, tasksOverdue, problemsOpen, morningChecksFlagged }, history: [last 20] }`
  - GET `?list=1&from=&to=` → `{ items: [...] }`
  - POST `{ date, shift, data: { cashCounted, cashExpected, posTotal, cardTotal, cashDiff (computed server), chequesCollected, pendingDeliveries, priceChangeNotes, staffNotes:[{staffName, note}], handoverTo (userId), problemsCarried:[problemIds], tasksForNext:[{text, assigneeId?}], notes } }` → creates report (type HANDOVER), auto-attach metrics snapshot, notify handoverTo (kind:'handover', severity important, go:'#/tasks/reports'), logActivity.
  - PATCH `[id] { action:'ack' }` → set acknowledgedBy/At + notify author. (add [id] route file)
- Structured JSON replaces the old notepad fields; keep old dataJson rows readable (they are JSON strings — render gracefully).

### 2.4 Problems rework (B1) — Problem model: add `category String @default("other")`, `severity String @default("normal")`, `location String?` (floorplan block label), `assigneeId String?`, `dueDate String?` (Jalali), `resolvedAt DateTime?`.
- `/api/problems` + NEW `[id]` route:
  - GET `?status=&category=&severity=&shift=&assignee=&from=&to=` → `{ items, stats: { open, inProgress, resolved, byCategory }, blocks: [floorplan block labels] }`
  - POST `{ problem (title), category(equipment|it|supply|cleaning|product|staff|customer|security|other), severity(low|normal|high|urgent), location?, assigneeId?, dueDate?, time?, shift, action? }` → notify assignee if set.
  - PATCH `[id] { status }` (OPEN→IN_PROGRESS→RESOLVED) | `{ action:'resolve', actionTaken }` → sets action + status RESOLVED + resolvedAt | `{ action:'assign', assigneeId }` → notify.
- keep existing escalation contract intact.

### 2.5 Holoo integration (B2)
- Settings keys (Setting model): `holoo:baseUrl` (e.g. `http://192.168.1.10:8080/TncHoloo/api`), `holoo:mockUrl` (default `http://127.0.0.1:3040/TncHoloo/api`), `holoo:useMock` (default true), `holoo:username`, `holoo:userpass` (store base64), `holoo:dbname`, `holoo:enabled` (default false).
- NEW `src/lib/holoo.ts` — client per /tmp/holoo-api.txt (READ IT FIRST — full API doc extracted from webserviceHelp.pdf): login (POST /Login {userinfo:{username,userpass,dbname}} → token, cache until 401), auth header `Authorization: <token>`; GET Customer (+code.from/code.to/pagination `/{page}/{size}`), Product (+?name= search rules, getimage), MainGroup, SideGroup, Unit, Invoice (list), Settings; POST/PUT Product/Customer; POST Invoice/PreInvoice, Invoice/Order (type 1=فروش,3=خرید), Invoice/Invoice (type 1=فروش,2=برگشت از فروش,3=خرید,4=برگشت از خرید; Cash/Bank/Nesiyeh/Discount/Levy/Scot + detailinfo), Payment/Havaleh, Payment/ReciveFromCustomer; Reports GetSarfasl/GetCash/GetAccound/GetMaxFewProduct/GetMinFewProduct/GetMaxBedCustomer/GetMaxBesCustomer; webhook subscribe POST {subscriptions:[{url,tablename,apikey}]}. All timeouts 15s, Persian error mapping, token refresh on 401 once.
- Prisma: `model HolooSyncLog { id, kind String, status String (OK|FAIL), statsJson String, error String?, createdAt }` + Product gains `holooErp String?` + Supplier gains `holooErp String?` (db:push).
- NEW `/api/holoo/` routes (OWNER/GM/ADMIN only):
  - `status/route.ts` GET → `{ configured, useMock, baseUrl, lastSyncs:[10], productCount, supplierCount }`
  - `settings/route.ts` GET/PUT (mask password)
  - `test/route.ts` GET → tries Login + /Settings → `{ ok, latency, currency }`
  - `sync/route.ts` POST `{ what: 'products'|'suppliers'|'customers', mode:'pull' }` → pull & upsert (Product.Code↔barcode+barcodesJson[0], Name, Few→stock, BuyPrice→lastBuyPrice, CountInKarton→unitsPerCarton, MainGroup/SideGroup→mainGroup, ErpCode→holooErp; Customer(IsSeller)→Supplier name/tel/mobile/holooErp) — paged loop, log HolooSyncLog with counts.
  - `sync/route.ts` POST `{ what:'orders', mode:'push', orderId }` → map local Order(+items) → POST Invoice/Order type=3 (خرید) with customererpcode of the supplier (create Customer in Holoo first if missing via POST Customer), detailinfo rows (ProductErpCode from product.holooErp; if missing → try create Product). Log + save returned ErpCode on Order (add `holooErp String?` to Order model).
  - `sync/route.ts` POST `{ what:'returns', mode:'push', returnId }` → POST Invoice/Invoice type=2 (برگشت از فروش) — customer as side account (create if missing), items from ReturnItem.
  - `log/route.ts` GET → last 50 sync logs.
- NEW mini-service `mini-services/holoo-sim/` — INDEPENDENT bun project (own package.json, port 3040, `bun --hot index.ts`): dummy Holoo implementing EXACTLY the API above. In-memory + JSON persistence (`data.json`, seeded at first boot from `seed.json` you generate: 300 real products from db via one-time script `scripts/gen-holoo-seed.ts` + 30 suppliers). Behaviors: Login accepts configured user/pass (default admin/admin/Holoo1) returns Bearer token; all GET endpoints with pagination + name search (word-based contains per PDF rules); POST creates (returns Header/Success shape {Id, ErpCode, ReturnParam1..}); PUT updates; webhook subscribe stores and fires POSTs on create/update; /Settings returns CurrencyUnit ریال. README.md inside explains usage.

### 2.6 Team checks & columns (B3)
- StaffCheck model: add `hourlyLeaveMinutes Int @default(0)`, `overtimeMinutes Int @default(0)`. (lateMinutes stays total minutes; `present` derived = arrival!=='absent' — keep column, stop requiring it.)
- `/api/staff-checks` POST rows: `{ staffId, arrival, lateMinutes, hourlyLeaveMinutes, overtimeMinutes, hadPermission, uniform, hygiene, behavior, workQuality, note }` (present optional/ignored). GET returns rows incl. new fields.
- NEW Prisma: `model ZoneColumn { id, planId String, blockLabel String, name String, order Int @default(0), active Boolean @default(true), createdAt }` + `@@unique([planId, blockLabel, name])`. DateCheck: add `columnsJson String?` (checked column names + per-column result).
- NEW `/api/store/section-columns` route: GET `?planId=` (default active plan) → `{ sections: [{ blockLabel, columns: [{id,name,order,active}], lastCheckedAt, lastCheckedColumns: [names], nextStart: name|null, coverage (checked/total %) }] }`; POST `{ blockLabel, name }`; PATCH `[id]` `{ name?, order?, active? }` (route file [id]); DELETE via PATCH `{action:'delete'}` or DELETE.
- `/api/date-checks` EXTEND: POST accepts `{ date, lineId, blockLabel, checkerId, checkerName, status, expiredCount, nearExpiryCount, fefoOk, action?, note?, columns?: [{ name, status(ok|issues), expiredCount?, note? }] }` → store columnsJson; advances cursor (last checked column = last in list). GET `?month=&date=` additionally returns per-line: `columns` (from ZoneColumn), `lastColumns`, `nextStart`, and `todayPlan: [{ blockLabel, startFrom, suggested: ceil(columns/14) }]`.

### 2.7 Section reviews scale (B3)
- `/api/section-reviews` POST accepts scores 0-100 per criterion (0-5 still accepted → ×20). GET returns both `dateScore` (0-100) and `dateScore5` (0-5). Performance API unchanged (already 0-100 composite).

## 3. FRONTEND VIEW SPECS (hz-ext/src/views/*.tsx)

Common: import shared kit from '../lib/hz' (incl. new ui.tsx exports). RTL. Persian digits. Steppers use `Stepper`, dates use `JalaliDate`. NO direct react/lucide imports. Compile: `bunx tsx hz-ext/check.mjs <name>`.

### F1 `orders.tsx` (REWRITE the search+cart area; keep list/calendar tabs as-is)
- Tab «سفارش جدید» top: **طرف حساب (تأمین‌کننده)** selector card — searchable Select (existing suppliers loader) + balance display; selecting supplier is OPTIONAL but prominent (first card).
- Quick search results → **TABLE** (RTL, min-w, striped, hover): columns right→left: ۱. نام کالا (bold, click → گردش dialog) + unit/group subline | ۲. موجودی (StockView chip) | ۳. آخرین سفارش (date + qty + received?) | ۴. قیمت واحد (ریال, money) | ۵. تعداد (Stepper −/+ units, default `defaultOrderQty||6`, step 1) | ۶. کارتن (Stepper −/+ cartons, default `defaultCartonQty||1`; shows ×unitsPerCarton per product; if unknown → click asks size dialog as today) | ۷. افزودن (Button adds BOTH unit+carton quantities as one cart line; in-cart state shows ✓ در سبد). Results table container `max-h-[420px] overflow-y-auto`. Keep the suppliers-compare row expansion per product (chip row under name cell or second line).
- Cart: unchanged behavior but Steppers replace raw inputs for عدد/کارتن; keep price edit + upc edit.
- Submit: JalaliDate for تاریخ تحویل + quick chips (امروز/فردا/هفته آینده); payMethod segmented; note; supplier from top card; submit flow unchanged (POST /api/orders + payment-plan).
- Keep: CirculationDialog (گردش کالا), orders list tab, payment calendar tab.

### F2 `returns.tsx` (targeted fixes — do NOT rewrite whole view)
- **Bank card logic**: when `settleType === 'exchange' || settleType === 'debt'` (کالای جایگزین ≥ کل) → card Input `disabled`, auto-cleared, hint text «کالای جایگزین مبلغ مرجوعی را پوشش می‌دهد — کارت بانکی لازم نیست»; validation skips card entirely when disabled. When partial/full → card stays REQUIRED-optional as today (validate only if entered) BUT show recommendation hint «برای بازگشت وجه، کارت بانکی الزامی است» when transferAmount>0 && card empty.
- **Receipt (drawReceipt)**: bump sizes — store name 30/800, doc title 17/700, tracking code label 11 + code 22/800, rows: label 11.5/500 value 13/700, item name 13/700 qty 12/600, unit price 11, totals: label 12 value 16/800, toman line 12/600, footer 11.5/10/9. Line spacing +40%. Add: Code128 barcode of `data.code` under the code (port `barcode128` from lib/ui — draw scaled 2x via canvas lines), dashed rules as today, amount words line `amountWords(totalAmount)` (2 lines ریال/تومان). Keep W=510, M=16, SCALE=2, INK #18181b, cut command. Verify visual preview in the created-dialog (preview img width ~306px).
- **Customer history**: collapsed ONLY — one row chip: «سابقهٔ مشتری: N مرجوعی · M در انتظار» + button «نمایش سابقه» (eye icon) → existing histOpen dialog (improve it: settlement badge per return, items count, transfer status, sorted desc, empty state). REMOVE the inline first-3 returns list.
- Keep draft persistence, validation, Bixolon settings dialog.

### F3 `attendance.tsx` + `performance.tsx`
- attendance: remove حضور checkbox column entirely (present derived from arrival). ورود select stays (on_time/late/absent/permitted_leave). Replace تأخیر single input with 2 mini inputs (ساعت:دقیق) → saves total minutes. ADD column مرخصی ساعتی (hours+minutes inputs, enabled when arrival==='permitted_leave' OR any value). ADD column اضافه‌کاری (hours+minutes). Save maps to lateMinutes/hourlyLeaveMinutes/overtimeMinutes. Row summary line per staff: «تأخیر ۱:۱۵ · مرخصی ۰:۳۰ · اضافه‌کاری ۲:۰۰». Column headers sticky on mobile scroll (min-w table).
- performance: keep composite; per-criterion SectionReview display in /100 (show `xx/۱۰۰`), grades, manager-review tab unchanged (11 sliders stay 1-5 — research-backed), add research note block (R1 output text, coordinator provides) + weight legend.

### F4 NEW `users.tsx` (replaces system/users) + NEW `account.tsx` (home/account)
- `users.tsx`: stats row (total/active/inactive/admins) + users table (avatar, name+honorific, username, role badge, title, active dot, lastLogin, override count) + row actions: edit dialog (all fields + password/pin reset + active toggle + role select) + «دسترسی‌ها» dialog → PERMISSIONS MATRIX: list ALL sections with their pages (checkbox tri-state: پیش‌فرض نقش / مجاز / مسدود — default = inherit), and CAPABILITIES list (switches with role-default hint). Save → PUT /api/admin/users/[id]/permissions { upserts, removals }. Include «کاربر جدید» (POST /api/admin/users). Search + role filter. This view is dense — use two-column dialog layout, sticky header, max-h scroll areas.
- `account.tsx`: profile card (avatar picker exists in original profile? build simple: name/honorific/phone/title + save via /api/me/profile), change password card (current+next+confirm → /api/me/password), change PIN card (current+next → /api/me/pin), dashboard widget preferences link (goes to home/home personalization), theme note. Persian labels; success toasts.

### F5 NEW `dashboard.tsx` (replaces home/home «میزکار من»)
- Personalizable widget board: gear button «شخصی‌سازی» → dialog with widget toggles + up/down ordering (no dnd lib — arrow buttons); persisted per-user via /api/me/prefs (`dash`).
- Default widgets (each a compact Card with icon + count + link «همه …»):
  1. خلاصه امروز من (greeting + shift + points + today's date long)
  2. چک‌لیست‌های امروز من (+% done, link tasks/checklists)
  3. وظایف من (open count, overdue red, link tasks/tasks)
  4. مرجوعی امروز من / در انتظار تأیید (link returns/*)
  5. سفارش‌های فعال (link supply/orders)
  6. چک‌های نزدیک (7d, link finance/cheques)
  7. کم‌موجودها (top 3 names, link supply/products)
  8. مشکلات باز (link tasks/problems)
  9. گزارش تحویل شیفت (latest handover status, link tasks/reports)
  10. دیوار خبری (last 2 posts, link tasks/wall)
- Data: GET /api/home (existing — EXTEND it in B1? no: coordinator will extend /api/home to include problemsOpen + handoverLatest + lowStockTop3 — B1 does it) — check its current shape first.
- Layout: `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3` auto-dense; no empty 1/4 rows (grid fills fully); compact stat style text-xs meta.
- Quick actions strip under greeting: «ثبت مرجوعی» «سفارش جدید» «کنترل قیمت» «چک جدید» «گزارش شیفت» buttons (go()).

### F6 NEW `guide.tsx` (replaces home/guide «راهنما و دانش‌نامه»)
- Tabs: «مقالات» (existing /api/kb list + search + category chips + article dialog + manager CRUD — port behavior from chunk 0a7d8101's UI, rebuilt in our stack) | «تورهای تعاملی» — cards per tour: welcome (تور خوش‌آمدگویی — ۷ مرحله), plus per-section tours (خانه/وظایف/فروشگاه/انبار/مرجوعی/سود/مالی/کارکنان/مشتریان/گزارش‌ها/سیستم — each 4-7 steps). Launch button → TourEngine with steps: `{target:'[data-tour="rail"]', ...}` etc + view-specific anchors (document selectors like `nav[data-tour=rail]`, header buttons `[data-tour=bell]`, sidebar `[data-tour=sidebar]`, plus text targets like section buttons — for in-page anchors use selectors such as `[data-tour="search"]`). Tour steps navigate FIRST (go(viewKey)) then highlight; TourEngine supports `go` per step (coordinator's impl). «شروع دوبارهٔ تور خوش‌آمدگویی» card too (calls /api/me/tour DELETE? no — coordinator: POST /api/me/tour {reset:true} then location.reload — B1 adds reset support).
- KB article schema: existing /api/kb.

### F7 NEW `floorplan.tsx` (replaces store/floorplan) + update `liveboard.tsx`
- floorplan.tsx: SVG-based blueprint editor:
  - OUTLINE: polygon vertex list per plan (new Floorplan field `outlineJson String?` — coordinator adds to schema via B3? NO — B3 adds ZoneColumn; F7 needs outlineJson — coordinator adds BOTH in B3 spec... adjust: B3 adds `outlineJson String?` to Floorplan model too).
  - DEFAULT plan seeded with REAL Hyper Zeytoon geometry (predefined constant in view + a "بازگردانی نقشه واقعی" button): viewBox meters, north wall top (15.32m), east side vertical, west side with chamfered diagonal cut near SW (2.09×2.28m), south wall with TWO door recesses (each 4m wide, 1.37m deep — exit LEFT/west, entrance RIGHT/east).
  - Render: SVG polygon (outline fill pattern) + door notches drawn as part of path; grid; blocks (existing kinds/colors from liveboard KIND_META) as rects with label; DRAG blocks (pointer events → snap 10cm); click block → side panel (label/zone/responsible edit — PATCH existing API keeps blocks array; outline saved via PATCH too — coordinator: B1 extends /api/store/floorplans PATCH to accept outlineJson; check route first).
  - Outline edit mode: drag vertices (snap 10cm), add vertex on edge click, remove vertex (min 4). Show edge lengths (meters) on hover.
  - Zones list + stats (existing). Save → PATCH (blocks + outlineJson). Zoom buttons + fit.
- liveboard.tsx: render outline polygon behind blocks (same KIND_META), keep stats panel, add columns chip on blocks having ZoneColumns + today's date-check rotation state (from /api/date-checks todayPlan), low-stock pulse.

### F8 NEW `handover.tsx` (replaces tasks/reports) + NEW `problemsv.tsx` (replaces tasks/problems) + tasks.tsx fix
- `handover.tsx`: tabs «گزارش امروز» (structured form sections: صندوق و پرداخت [cashCounted, cashExpected→diff live, posTotal, cardTotal, chequesCollected], وضعیت دریافت و سفارش [pendingDeliveries multi-line, priceChangeNotes], پرسنل [staffNotes rows], کارهای واگذار به شیفت بعد [tasksForNext rows + assignee select], یادداشت) with live METRICS panel (from GET) — counts linked to their pages; «گزارش شیفت قبل» card (previous + acknowledge button if not ack'd); «تاریخچه» tab (list + view). Submit → POST; toast + notify info.
- `problemsv.tsx`: stats chips row (open/inProgress/resolved + byCategory mini-bars), filter bar (status/category/severity/shift + search), NEW problem form (problem, category select, severity select w/ colors, location select from blocks, assignee select (active staff), dueDate JalaliDate, time, action), list (cards: severity stripe, category badge, location chip, assignee avatar, due date red if past, status flow buttons: شروع بررسی → ثبت اقدام/حل → (managers) بستن; escalate banner for evening manager — keep existing morning-escalation contract: unresolvedMorning list) — data via /api/problems.
- `tasks.tsx`: coordinator diagnoses checkmark bug first (may be checklist chunk or this view); agent applies prescribed fix only.

### F9 NEW `printdocs.tsx`? NO — F9 is a LIB + integration: `hz-ext/src/lib/docs.tsx`
- Export `docHTML(kind, data)` builders returning full standalone RTL HTML string (Vazirmatn via /fonts local, letterhead: logo emoji 🫒 + «هایپر زیتون — سامانه سررسید», doc title, code, Jalali date long, parties, items table, totals, amountWords, signature blocks, footer) for kinds: `return` (A4 receipt copy), `return-thermal` (80mm), `order` (سفارش خرید), `cheque-plan`, `handover`, `performance` (کارنامه با جدول معیارها), `problems` (لیست مشکلات باز).
- Integration (F9 applies): returns.tsx created-dialog «چاپ A4 / ذخیره PDF» button (PrintFrame autoPrint); orders list row «چاپ سفارش»; cheques list «چاپ»; handover submit «چاپ گزارش»; performance «چاپ کارنامه». Each: PrintFrame({html: docHTML(kind, row)}).

### F10 NEW `holoo.tsx` view (system/holoo «اتصال هلو»)
- Status card (configured? mock/real, latency, last syncs table), settings form (baseUrl, useMock switch, username, userpass, dbname, enabled switch → PUT), test connection button, sync actions (کشیدن کالاها / اشخاص / هلدی از هلو → با پیشرفت و نتیجه شمارش), push actions per order/return (from lists — simple: push latest 10 orders button + per-id input), log table. All Persian. Roles: OWNER, GM, ADMIN.

## 4. REGISTRY / CHUNK PATCHES (coordinator only — agents don't touch)
- build.mjs: extend manifest with NEW view keys (home/home, home/guide, home/account, system/users, system/holoo, tasks/reports, tasks/problems, store/floorplan replaces). Access-map entries via manifest roles.
- patch-tour.mjs (coordinator): fix GuidedTour dim bug + swap قبلی/بعدی chevrons + wire tourDone (server side done by B1).
- patch-acl.mjs (coordinator): canAccessPage consults globalThis.__HZ_PAGES__ (deny/allow from /api/auth/me); AppShell sets it before state update.
- shell.html: global JalaliDate enhancer for original-chunk date inputs (detect by placeholder ۱۴۰x pattern, attach popover, set value via native setter + input event).

## 5. Worklog
EVERY agent appends `--- / Task ID / Agent / Work Log / Stage Summary` to /home/z/my-project/worklog.md. Verify with tsc + check.mjs + curl (backend) — NO test files, NO new routes beyond spec, do NOT touch other agents' files.
