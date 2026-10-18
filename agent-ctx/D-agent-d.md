# Task D — Agent D (backend API rebuild: store / hr / reports / admin)

## Scope delivered
All 17 assigned route files + the `[id]` sub-routes the production frontend actually calls + 2 search endpoints required by my views:

**Store**
- `src/app/api/store/floorplans/route.ts` (GET list, POST create) + `[id]/route.ts` (PATCH blocks-replace, PATCH plan meta, DELETE)
- `src/app/api/store/planograms/route.ts` (GET list, POST create, POST duplicateOf) + `[id]/route.ts` (GET detail w/ 2D `layout` + `products`, PATCH layout, PATCH status publish/unpublish/archive/restore, DELETE)
- `src/app/api/store/zones/route.ts` (GET w/ todayCount + week compliance, POST, PATCH {id,...}, DELETE ?id=)
- `src/app/api/store/zone-counts/route.ts` (GET ?date=, POST {zoneName, items:[{name,counted}]} → {itemCount, pointsAwarded}) + `[id]/route.ts` (PATCH {action:'confirm'|'query', mismatchReason})
- `src/app/api/store/price-checks/route.ts` (GET ?date= w/ checks+queue+summary, POST {productId?,barcode?,name,printedPrice,lastCost?} → {ok,margin,suggestedPrice})
- `src/app/api/store/waste/route.ts` (GET ?from&to&reason, POST w/ stock decrement for linked products, DELETE ?id=)
- `src/app/api/store/product-search/route.ts` (categories / category items — planogram auto-fill)
- `src/app/api/products/search/route.ts` (barcode single-product + ?q list — needed by price-check scan + waste/planogram pickers). NOTE for products agent: shape is contract-critical, do not change: `?barcode=` → single `{id,name,lastBuyPrice,...}` (404 `کالایی با این بارکد یافت نشد`), `?q=` → `{products:[{id,name,unit,sellPrice,lastBuyPrice,barcode}]}`.

**HR**
- `hr/personnel/route.ts` (GET w/ linkableUsers, POST) + `[id]/route.ts` (PATCH incl. `salaryProfile` upsert, DELETE soft)
- `hr/shifts/route.ts` (GET ?week= w/ days/users/assignments{dayIdx,shiftType,note}/coverage{counts,status,noCoverage,issues}/needs, POST upsert, DELETE ?id=)
- `hr/leaves/route.ts` (GET {manager, items}, POST) + `[id]/route.ts` (PATCH approve/reject, DELETE)
- `hr/payroll/route.ts` (GET full sheet, POST bulk save → {saved})
- `hr/payroll/settings/route.ts` (GET ?year= → {statutory}, PUT)

**Reports**
- `reports/briefing/route.ts` (managers; others `{denied:true}`)
- `reports/overview/route.ts` (?from&to)
- `reports/export/route.ts` (type=products|suppliers|cheques|returns|margin, count=1 → {count,filename}, else CSV+BOM download)

**Admin**
- `admin/users/route.ts` (GET w/ stats, POST) + `[id]/route.ts` (PATCH w/ self-limits, DELETE soft w/ last OWNER/ADMIN guard)
- `admin/settings/route.ts` (GET {settings}, PUT OWNER/ADMIN)
- `admin/activity/route.ts` (?action&q&page&limit — action matches action/category/action-prefix; q searches detail/userName/action; time = UTC HH:MM Persian digits, dateJalali = Tehran)

**Shared libs created** (uniquely named, no conflicts): `src/lib/payroll.ts`, `src/lib/payroll-statutory.ts`, `src/lib/access.ts` (role gates mirrored from AppShell permission map), `src/lib/zone-counts.ts`, `src/lib/hr-order.ts`.

## Key contract discoveries (chunks vs task brief)
- The task brief's mutation shapes were partly wrong; the chunks are authoritative:
  - floorplans PATCH/DELETE → **path** `/api/store/floorplans/{id}` (not body-id)
  - planograms detail/layout/status PATCH → **path** `/api/store/planograms/{id}`; status actions are lowercase `publish|unpublish|archive|restore`; POST supports `{duplicateOf}`
  - zone-counts POST uses **zoneName** (not zoneId) and returns `{itemCount, pointsAwarded}`; PATCH actions are `confirm|query` (not complete)
  - price-checks POST body is `{productId?, barcode?, name, printedPrice, lastCost?}` → `{ok, margin, suggestedPrice}` (suggested = ceil(1.21×cost) when red); checks items need `printedPrice` + `checkerName`
  - shifts POST is one assignment per call `{weekStart, dayIdx, userId, shiftType, note?}`; DELETE is flat `?id=`
  - personnel PATCH/DELETE → **path** `/api/hr/personnel/{id}`; salary block key is `salaryProfile`
  - leaves PATCH/DELETE → **path** `/api/hr/leaves/{id}`
  - payroll save is **POST bulk** `{year, month, rows:[...]}` → `{saved}`
  - admin/users PATCH/DELETE → **path** `/api/admin/users/{id}`; DELETE = soft-deactivate
  - briefing `todayLong` uses LATIN digits ("25 مهر 1405"); non-managers get `{denied:true}` (client has explicit z.denied branch)
  - admin/activity `action` filter = category-ish values (login, return, pricecheck, …)
- Queue definition (price-checks) verified EXACT vs capture: products `stock>0 AND lastBuyPrice>0 AND margin<12`, sorted margin asc, limit 30, ties pre-sorted by id; barcode = `product.code`.
- Payroll math reproduced to the rial (آزاده: 286,890,919 / 20,082,364 / 31,695,044 / 235,113,511). Float-exact detail: `hourlyWage = dailyWage / (220/30)` (NOT base/220 — differs in the last ULP).

## Data fixes applied to DB (scripts in /tmp/agent-d-*-backup.ts, no schema changes)
1. Added missing Personnel row فاطمه شریفی (userId sentinel `__unlinked_sharifi` → surfaces as `userId:null, user:null`; keeps linkableUsers=[sharifi] like the capture)
2. Restored 7 `ReturnRequest.cashierId` values (seed dropped them; needed for overview cashierPerformance)
3. Seeded 2 PayrollRecords (آزاده 240min/1day, جواد 0/0) with savedJson computed by my engine — exactly matches capture
4. Seeded 3 red PriceChecks dated 1405-07-20 (drives overview priceCheckReds=3 like capture; doesn't affect today's checks/queue)
5. Filled planograms cellsJson (24/24/3) to match captured fillHealth
6. Re-inserted all Personnel rows in captured order (rowid order drives personnel/shifts/payroll ordering)

## Verification
Full deep-compare (every array element) vs `/tmp/live-api/*.json` — EXACT MATCH on: floorplans, planograms (updatedAt differs — my cells-fill bumped it), zones, zone-counts, price-checks, waste, personnel, shifts, leaves, payroll (all 18 rows + totals), briefing, overview, admin/users, admin/settings.
Remaining known deltas (data, not shape):
- `briefing.checklistProgress` = 3 entries vs capture's 7 (seed has only 3 DAILY templates; the 4 extra daily templates from the live DB — «چک‌لیست شروع شیفت عصر» (8), «بازگشایی صندوق» (5), «بستن صندوق» (4), «چیدمان صبحگاهی» (5) — were never seeded. tasks/checklists agent could add them if pixel-parity is wanted.)
- `lowStock.count` / `lowStockPreview` / `lowStockCount`: 10328 vs 10313 — Product.stock is Int in schema; live DB had float stocks (-9.735 etc.) that the seed rounded.
- `admin/users` lastLoginAt/points drift from live testing (my own logins; awards agent gave alikhani +5).
- ShiftAssignment `note` can't persist (no column) — accepted and returned as null.
- zone-count mismatchReason persisted as `STATUS|reason` inside the status column (no dedicated column).

`tsc --noEmit`: 0 errors in all my files (remaining project errors are pre-existing template leftovers `src/lib/audit.ts`, `src/lib/demo-factory.ts`, `src/hooks/use-toast.ts`, old `prisma/seed.ts`, `examples/`, plus another agent's in-progress `api/returns/route.ts`). `bun run lint`: 0 problems in my files (remaining errors are pre-existing: `prisma/seed-live.ts` require-import + minified public chunks).
