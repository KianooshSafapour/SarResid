# Round 17-B — Comparative Audit of the 4 Sibling Demo Platforms

**Task ID:** 17-B · **Agent:** general-purpose (demo audit) · **Date:** 1405-06-31 (2026-09-22)
**Source:** `origin/main` @ `9da4633` («first commit») — extracted read-only via `git archive` to `/tmp/audit/`.
**Method:** full code read of every `views/*` and `sections/*` file + live-site walkthrough with agent-browser (all 4 sites returned HTTP 200; PIN `1234` logins succeeded; 9 screenshots in `/tmp/audit/*.png`).
**Read-only guarantee:** nothing under `/home/z/my-project/src`, `prisma/` or configs was touched. Only writes: this report + `worklog.md` append.

---

## 0. Lineage map — which platform is what

| Directory | Identity | Architecture | Approx. size | Verdict |
|---|---|---|---|---|
| `hyper-zeytoon.space-z.ai` | **Hyper Zeytoon «classic»** — direct ancestor of SarResid's working tree (same `src/components/views/*` file names, same brand tokens `#0e7a4a/#c9a227/#faf7ee`, same `ZoneMap`, `salary-engine.ts`, `lib/client`) | `views/*.tsx` + `app/*` chrome, custom `Modal`, `charts.tsx` (hand-rolled SVG Line/Bar/Donut), next-themes dark | 40 views, 28k LoC views, **972-line Prisma schema** | **Most feature-complete sibling of SarResid's lineage** (round-15 era). SarResid = its successor; round-16 features (sandbox, licensing, floor-plan prefabs, 1405 statutory, granularity+LY product report) exist only in SarResid. |
| `hyperzeytoon.space-z.ai` | **Hyper Zeytoon «Redesign»** — parallel re-architecture of the same domain | `store/app` zustand + `platform/sections/{commerce,catalog,people,reports,archive,warehouse}` + shadcn `Dialog` + **recharts** | 21.9k LoC, 652-line schema | **Most advanced UI/UX layer**: GuidedTour, AppearanceStudio (accents+dark+patterns+font-scale), OrnateAvatar system, ProductDetail hero page, Leave policy science, shelf-health strip, `AnimatedCount`, `formalName(gender,…)` greetings. |
| `nootyezrepyh.space-z.ai` | **«Reversed-name» retail suite** (nootyezrepyh = hyperzeytoon reversed) | `components/sections/*.tsx` lowercase + `zeytoon-ui` kit | 15.5k LoC, 383-line schema | Good **weekly-shift grid**, **server-side role-aware notification engine** (incl. customer birthdays + my-shift), **MonthPlanner** dashboard widget, command palette with Persian normalization, restore-point system, rewards. |
| `nootyez-repyh.space-z.ai` | **«Reversed-name» B2B ordering platform** (hyper-zeytoon reversed) — order→delivery→warehouse→payment→accounting→audit pipeline | `platform/*Section.tsx` + zustand `store` + `kit.tsx` | 16.5k LoC, 414-line schema | **Most operationally mature process engine**: FEFO expiring batches w/ markdown suggestions, `BadgesPoller` (25 s poll + 8 am Tehran digest, idempotent), external **Pilot Program** (invite codes HZP-XXXX, public feedback, CSV), CommunitySection idea board. |

> «Newest/most advanced» depends on axis: **domain depth → hyper-zeytoon** (and beyond it, SarResid itself), **UI craft → hyperzeytoon**, **process ops → nootyez-repyh**. All four are siblings, not a single linear chain: only `hyper-zeytoon` is the true ancestor of SarResid.

---

## 1. View/page inventories

### 1.1 hyper-zeytoon (40 views, `src/components/views/`)
| View | LoC | Purpose |
|---|---|---|
| Archive | 2589 | Hybrid digital↔physical archive (ISO 15489): cabinets › shelves › binders › positions, doc search, party files |
| ZoneCount | 1997 | **Blind zone counting** (counters never see system numbers), mismatch loop «re-count → reason», admin picks confirmant; managers get full board + ZoneMap |
| Cheques | 1913 | Cheque register, due calendar, sign/handover states |
| Crm | 1682 | RFM (Hughes 1994) customers, tiers, birthday gifts, campaign audience matching |
| Products | 1404 | Catalog grid + 6 modals (see §2) |
| Admin | 1240 | Backoffice settings |
| Payroll | 1082 | Monthly payroll + yearly عیدی/سنوات + self payslip + settings (see §5) |
| Perf | 1063 | SPLH (sales-per-labor-hour), points, leaderboard, gifts |
| DataAdmin | 947 | DB admin |
| Leaves | 888 | DAILY + HOURLY (fromHour/toHour) leave, month grid calendar, team-out-today |
| Personnel | 834 | Staff files incl. children (کمک‌هزینه) + birthdays («تولدها برای هدیه 🎂»), birthday-month KPI + pills |
| Orders | 826 | Purchase order cycle SUBMITTED→…→DONE; exports the shared `Modal` |
| Notifs | 807 | Notification center (see §9) |
| Rbac | 761 | Roles + capabilities |
| People | 751 | Sales reps / manufacturers tabs |
| Sales | 731 | Cash-register pre-invoices |
| Science | 717 | ABC analysis + cycle count + stats experiments |
| PriceCheck | 703 | Daily printed-price verification board (red <10 % margin) |
| Planogram | 610 | CSS-grid shelf map w/ fill colors + 🔥 fast-mover badge |
| DemoStudio | 545 | Demo data studio |
| Accounting | 498 | Holoo export/accounting queue |
| Briefing | 494 | Printable «صبح‌نامه» morning report (holiday-aware, auto-archive) |
| Tasks | 440 | Task board w/ delegation |
| Receiving | 410 | Delivery intake |
| Dashboard | 403 | see §4 |
| Research | 394 | In-app research notes |
| Messages | 369 | DMs |
| Kb | 364 | Knowledge base |
| Feedback | 338 | Idea/feedback box |
| Urgent | 306 | **Non-interrupting** urgent Q&A (Camunda-style: critical severity, but no toast ladder) |
| Reports | 293 | Reports |
| Providers | 290 | Suppliers |
| Sop | 268 | SOP checklists |
| MarginCalculator | 239 | «بازطراحی فایل اکسل خانم درویشی» — row-based margin calc, barcode-scanner input, thresholds <10 % red / <25 % yellow / ≥25 % green |
| Login | 235 | User-picker + PIN |
| Help | 234 | Help |
| Notes | 209 | Notes |
| Wall | 173 | Digital wall |
| Verify | 125 | Warehouse verification |

### 1.2 hyperzeytoon (`src/components/platform/sections/…`)
commerce: **Payments (1776)**, NewOrderWizard (751), Orders (727), Deliveries (598), Accounting (380), commerce-bits (361).
archive: **Archive (1174)**, **IranMap (302)** — 31-province square cartogram (8×7 grid, `IRAN_GRID`, Persian-gulf/caspian sea cells) colored by supplier count with 5 fill levels; hover/click → province info card.
warehouse: **StockCount (1095)**, Inventory (474).
catalog: **Providers (1048)**, Products (635), **ProductDetail (556)** — see §2.2.
people: Admin (946), **Leaves (877)**, Tasks (678), Chat (638), Customers (592), Settings (530), **Vault (510)** («گنجینه شخصی» — private per-user files/receipts, owner-only access), Planogram (488), **FloorOps (478)** (floor staff hub: warehouse-request one-click restock `POST /api/warehouse-requests`, suggestions), SOPs (416), Feedback (409), Team (335), **DemoLab (307)**, Help (260), Notes (212), Wall (199).
reports: Reports (555). shell: **GuidedTour (479)**, **AppearanceStudio (479)**, Topbar (232), **GlobalSearch (148)**. ui: shared (356), **OrnateAvatar (204)**, jalali-date-picker (151). Plus `Dashboard (598)` — see §4.2.

### 1.3 nootyezrepyh (`src/components/sections/`)
orders 1420 · **products 1398** (see §2.3) · accounting 1327 · sales 1157 · admin 1145 · cheques 1142 · deliveries 909 · **planogram 866** · warehouse 727 · **shifts 604** (see §8) · dashboard 602 (see §4.3) · suppliers 568 · tasks 552 · research 471 · **rewards 427** (points activity feed w/ grant dialog) · feedback 418 · **demo 416** (0.3 s realistic Iranian retail data generator, 3 company sizes, isolated `demo_registry`) · sops 333 · messages 308 · **versions 250** (restore-point snapshots; «Hello, World» permanently protected + git-tagged) · notes 230 · wall 196. Top-level components: **command-palette.tsx (272)**, **month-planner.tsx**, notification-bell.tsx, cultural-svg.tsx, theme-provider/toggle (dark mode), print/{invoice-print-overlay, print-helpers}, profile-menu, `lib/research-knowledge.ts` (in-app cited research snippets).

### 1.4 nootyez-repyh (`src/components/platform/`)
**Deliveries 1721** · **Crm 1470** · **Orders 1386** · **Warehouse 1166** (FEFO) · Payments 907 · Products 906 · **Pilot 816** · Suppliers 760 · Dashboard 741 · Planogram 594 · **Demo 578** · Admin 515 · **Community 430** · Accounting 405 · Sops 393 · kit 391 · Tasks 351 · **Audit 341** · **LowStockDraft 337** (one-click draft PO for every low-stock item) · Messages 304 · Reports 286 · **Skeletons 241** · Notes 230 · Header 226 · Profile 220 · Login 176 · **BadgesPoller 170** (see §9.1) · JalaliCalendar 168 · Sidebar 159 · QuickNav 105 · CultureArt 55.

---

## 2. PRODUCT INFORMATION DIALOG (highest priority)

### 2.1 hyper-zeytoon — `Products.tsx` two-dialog pattern
Clicking a product card opens **`ProductDetailModal`** (info + price trend); the dedicated «گزارش کالا 📈» button opens **`ProductReportModal`** (the analytics dialog):

- **Fetch:** `GET /api/products/{id}?report=1` → `ReportBlock` (lines 745–774): `sales[90]{date,qty,amount}`, `margins[{date,buyPrice,sellPrice,marginPct}]`, `waste[{date,qty,estValue}]`, `expiry[{date,qty,status}]`, `ordersBuy{series,providers(top3),providersCount,ordersCount,totalQty90,totalBuy90,avgGapDays,nextExpectedIso}`, `categoryShare{category,thisValue,siblings,othersValue,categoryTotal,storeTotal,windowDays}`.
- **KPI strip (5):** موجودی فعلی (red when ≤ reorderLevel) · فروش ۳۰ روز · میانگین حاشیه سود (<10 % `#b3372f`, <25 % `#a16207`, else `#0e7a4a`) · ارزش ضایعات · **پوشش موجودی (روز)** = `stock / (sales30/30)`, amber >45 d.
- **Chart 1 — فروش روزانه ۹۰ روز:** hand-rolled `LineChart` (`src/components/app/charts.tsx`), `color="#0e7a4a" area markers height={210}`, continuous series built by zero-filling empty days (`for i=89..0 addDaysIso(-i)`), tooltip = Jalali date + qty + «{faMoney(amount)} تومان فروش». Help line: «انگشت یا موس را روی نمودار بکشید…».
- **Chart 2/3 — سفارش و خرید ۹۰ روز:** two `LineChart`s (qty `#77934a`, value `#c9a227`) + 4 KPI chips (جمع خرید، تعداد سفارش‌ها، **میانگین فاصلهٔ سفارش**، تأمین‌کننده‌ها) + prediction banner: «🔮 پیش‌بینی سفارش بعدی: حدود {formatJalaliShort(nextExpectedIso)} — بر پایهٔ فاصلهٔ میانگین {avgGapDays} روزه».
- **Donut — سهم تأمین‌کنندگان:** top-3 + «سایر», hover meta = orders/qty/avg-per-order; `centerLabel="خرید (تومان)"`.
- **Chart 4 — روند حاشیه سود:** `LineChart color="#c9a227" autoMin`, footnote «حاشیه = (قیمت چاپ‌شده − قیمت خرید واحد) ÷ قیمت خرید».
- **Donut — سهم فروش در دسته:** this product + siblings + «سایر کالاهای دسته», hover shows each sibling's share of category, center = category total.
- **BarChart — ضایعات** `color="#b3372f"` + **انقضاهای نزدیک (FEFO)** chips: red ≤14 days, gold otherwise, «{jalali} • {qty} عدد • {left} روز مانده».
- Skeleton loading («در حال ساختن گزارش ۹۰ روزه…») + `EmptyState` with emojis (🍃/🚚/🫙) per section — every chart degrades gracefully.

`ProductDetailModal` (lines 679–741): image/emoji hero, برند/دسته/بارکد, buy/sell/margin/stock `KeyValue`s, one-click «چاپ لیبل قفسه این کالا 🏷️», **روند قیمت در سفارش‌های اخیر** `LineChart` of printed price with ▲/▼ % badge vs first order («برای پیگیری تورم روزانه»), and «ماه اخیر: N عدد در M سفارش» + last 4 order codes.

### 2.2 hyperzeytoon — `catalog/ProductDetail.tsx` (full product page dialog, max-w-3xl)
- **Hero image** or deterministic gradient + first-letter fallback (`CARD_COLORS` hash), StatusBadge «آرشیو شده».
- **Editable form** for managers: sellPrice, **sellPrice2 (قیمت فروش ۲ — تخفیفی)**, buyPrice, stock, minStock, unit, category, brand, notes → `PATCH /api/products/{id}`; ConfirmButton archive.
- **Image tools:** «جستجو در وب» → nested Dialog → `POST /api/products/image-search` grid of results; «آپلود از دستگاه» → **`fileToScaledDataUrl(file, 400)`** — canvas-downscales to ≤400 px JPEG q0.82 before save (keeps DB small).
- **Barcode manager:** chips w/ primary dot, add via Enter, remove per-chip (`PATCH { barcodes: { add:[…] | removeIds:[…] } }`).
- **فروش ۳۰ روز اخیر:** recharts `AreaChart` with green gradient fill `#3E7C59`, `dir="ltr"` wrapper, RTL tooltip, `interval={6}` x-ticks.
- **سفارش‌های اخیر:** list with status badges (code/provider/Jalali date/qty/total).
- **چیدمان قفسه:** badges of every shelf where the product sits — «{shelf} — بخش {section} (ردیف r، ستون c)» → **product↔planogram cross-link**.

### 2.3 nootyezrepyh — `ProductDetailDialog` (no charts) + `SmartReorderDialog`
`GET /api/products/{id}` → two info cards (price/cost/stock/min-stock vs holooName/unit/createdAt/updatedAt), barcode chips, «سفارش‌های اخیر» list + totals (فروش کل/مبلغ کل). The interesting part is **`SmartReorderDialog`** (smart draft purchase orders) and the **Holoo import classifier** (`NEW/DUPLICATE` chips). nootyez-repyh `ProductsSection` adds **«عمر مفید (روز)»** per product — shelf-life field that powers its FEFO engine — plus Bulk price import and LowStockDraft modal.

**SarResid delta:** SarResid's `ProductReportModal` already supersedes 2.1 (granularity day/week/month/season + custom range + LY compare). The genuinely new steals are: provider-donut hover metas, «میانگین فاصلهٔ سفارش + 🔮 پیش‌بینی سفارش بعدی» banner (already ported? SarResid has `nextExpectedIso` — yes, line 1560 of SarResid Products.tsx has it), **shelf-placement cross-link**, **sellPrice2**, **client-side image downscale**, **barcode add/remove chips**, and **autoMin margin chart**.

---

## 3. Dashboard layouts & decluttering

### 3.1 hyper-zeytoon (403 lines) — order of sections
1. **Greeting hero** `hero-emerald gold-glow-border` + two hand-drawn **pistachio-branch SVG ornaments** (tl/br corners) + `shimmer-line`; body text is role-aware: «{myOpenTasks} وظیفه باز دارید و {todayDeliveries} مرسوله امروز می‌رسد…» / «امروز وظیفه‌ای بر عهده شما نیست — وقت خوبی برای ایده‌های تازه است ✨»; buttons: «🌅 صبح‌نامه امروز» (managers) + points chip «امتیاز شما — آفرین!».
2. **KPI row** (4 `StatCard`, role-aware, conditional swap: overdue-warning card replaces today-deliveries when `overdueCount>0`).
3. `ArchiveQuickSearch` — type-ahead doc search showing the **physical path** «کابینت › طبقهٔ N › زونکن K › جایگاه M» (MapPin icon) + frequent-party chips.
4. Role queues (only when non-empty!): کنترل قیمت امروز (red variant when crisis) · در انتظار ثبت در هلو · در انتظار تأیید انبار · صف پیش‌فاکتورهای فروش.
5. Charts row: pipeline `Donut` (2/3 width) + **جدول امتیاز تیم 🏆 `RankBars`**.
6. سفارش‌های ۲ هفته اخیر `BarChart` + **سررسید چک‌ها (۸ هفته آینده)** weekly `BarChart color="#c9a227"`.
7. نزدیک به انقضا ⏳ (FEFO cards, ≤3 d red / ≤7 d amber, only for manager roles, only if non-empty).
8. Lists row: وظایف من (+ «همه وظایف →») · دیجیتال‌وال · **پرتقاضاترین درخواست‌های مشتری** («کالاهایی که مشتری دنبالش بود و نداشتیم» — lost-demand counter!).
9. تازه‌ترین فعالیت تیم (managers, max-h-72 scroll).
**Declutter pattern:** every queue section is conditional (`k.x > 0`), every card is clickable and navigates, empty lists render friendly EmptyStates instead of dead panels. *(SarResid already removed ArchiveQuickSearch + activity feed in 17-0; the lost-demand widget and cheque-8-week chart are still absent.)*

### 3.2 hyperzeytoon (598 lines)
Greeting uses **`formalName(user?.gender, name)`** → «جناب آقای …» / «سرکار خانم …»; quick-action buttons row; 6 `StatCard`s with **`AnimatedCount`** (count-up animation); **smart-reorder card** whose tooltip exposes the model: `{model.method} — {model.formulaFa} — سطح اطمینان {serviceLevel*100}٪ — زمان تأمین {leadTimeDays} روز`; **supplier-grouped one-click reorder** («یک کلیک: سفارش N قلم این تأمین‌کننده ({estCost} تومان)» + order-all button); **«سلامت قفسه‌ها» strip** — per-planogram-section fill health chips, red-first ordering, click → planogram (computed client-side from `GET /api/planogram` fill ratios, threshold ۶۰٪+).

### 3.3 nootyezrepyh (602 lines)
Hero with **nearest-holiday banner** («نزدیک‌ترین تعطیلی: {date} — {title}» from `/api/holidays`) + **today's shift chip** ☀️/🌤/🌙/🏠; KPI grid incl. role-gated cards; charts: سفارشات ۱۴ روز · وضعیت سفارشات donut · **فروش صندوق ۱۴ روز** · **مقایسهٔ هفتگی فروش** (هفتهٔ جاری شنبه→امروز vs هفتهٔ قبل with ±delta % pill) · هزینه خرید به تفکیک تأمین‌کننده (میلیون تومان) · پرفروش‌ترین اقلام; آخرین سفارشات table; 🏆 برترین‌های تیم. Sidebar shows **`MonthPlanner`** widget (see §14).

### 3.4 nootyez-repyh (741 lines)
Bilingual section headers («سفارش‌های ۱۴ روز اخیر | Orders — last 14 days»); daily-spend chart; Top-suppliers; staff leaderboard top-5; low-stock card with **«ساخت یک‌جای پیش‌نویس سفارش برای همه کمبودها»** button → LowStockDraft; recent events feed; holidays list; **«نبض فروش امروز | Sales pulse»**; «بریفینگ امروز | Today at a glance».

---

## 4. Salary / Payroll

### 4.1 Engine — `hyper-zeytoon/src/lib/salary-engine.ts` (pure, DB-free, all ریال)
```ts
export const STATUTORY_1404 = {
  dailyMinWage: 3_463_656, monthlyMinWage: 103_909_680,   // ماده ۴۱
  housing: 9_000_000,        // حق مسکن
  foodAllowance: 22_000_000, // بن کارگری (خواروبار)
  maritalAllowance: 5_000_000,
  childAllowance: 10_390_968, // شرط ۷۲۰ روز سابقه بیمه
  seniorityDaily: 94_000,     // پایه سنوات روزانه (ماهانه ۲٬۸۲۰٬۰۰۰)
  overtimeDivisor: 220,       // مخرج مزد ساعتی
  otherLevelsFormula: { factor: 1.32, addend: 9_316_080 },
  tax: { exempt: 240_000_000, bands: [{upTo:360e6,rate:.1},{upTo:540e6,rate:.15},{upTo:null,rate:.2}] }, // ماده ۸۴ اصلاحی ۱۴۰۴
}
```
Computation per month: OT ×۱٫۴ (ماده ۵۹, **cap ۴ h/day = 240 min**), Friday/holiday work ×۱٫۴ (مواد ۶۲/۶۳ + replacement-day rule), night +۳۵٪ (ماده ۵۸), insurance worker-share ۷٪ with **housing/ben/OT exempt** (تبصره ماده ۳۸ — `insuranceIncludesOT` toggle), progressive tax, `seniorityAccrual = seniorityBase × 30` (display accrual; settled yearly with عیدی), warnings: «حقوق پایه کمتر از حداقل دستمزد ۱۴۰۴… — مادهٔ ۴۱». Yearly: عیدی = 2× monthly wage prorated by service days, **cap 3× minimum-wage month (۹۰ روز مزد حداقلی)**; سنوات = daily base × service days.

### 4.2 UI — `views/Payroll.tsx` (tabs: ماهانه | عیدی و سنوات | فیش من | تنظیمات)
- **Daily worklog entry is MINUTE-based** with a dedicated `SmallNum` input (accepts Persian/Arabic/Latin digits, `max=720`) plus **`QuickChip`s `+۳۰ / +۶۰ / +۱۲۰`** (minutes), per-day columns: اضافه‌کاری | جمعه/تعطیل | شب‌کاری | غیبت (NONE/FULL/HALF) | یادداشت («شرح / روز جایگزین…»); **batch save** «ذخیرهٔ N روز تغییر یافته» with dirty-row highlight (`bg-amber-50/70`); auto day-kind: «جمعه (مادهٔ ۶۲)، تعطیل رسمی (مادهٔ ۶۳) و مرخصی تأییدشده از سامانه تشخیص داده می‌شود».
- Profile editor per person: baseSalary, حق مسکن، بن کارگری، حق تأهل، حق اولاد/فرزند (hint «شرط ۷۲۰ روز سابقهٔ بیمه — در صورت عدم احراز صفر بگذارید»), سنوات روزانه، مخرج مزد ساعتی (قانون: ۲۲۰), checkbox «مزایا (مسکن+بن) در مأخذ اضافه‌کاری لحاظ شود».
- **تنظیمات tab:** editable tax table (exempt + bands) w/ «ذخیرهٔ جدول مالیات», defaults for all statutory amounts, policy fields `otRate (۱٫۴)`, **`otCapMinutes` (قانون: ۲۴۰)**, `insuranceRate (0.07)`, `insuranceIncludesOT` toggle — all persisted in `Settings` (`payroll.defaults` / `payroll.policy` / `payroll.tax`), falling back to `STATUTORY_1404` when absent (route lines 30–37).
- **Printable payslip** via scoped `<style>` print CSS (`#payslip-print-area` visibility trick) with legal footnotes printed on the slip itself.
- Status machine per row: DRAFT → CONFIRMED → PAID (+reopen), totals strip «اضافه‌کاری: N ساعت», «۷٪ مشمول بیمه».

### 4.3 Leaves & science (hyperzeytoon)
`Settings.leave_policy = { monthlyDays: 4, maxSameDay: 2, hourlyMaxHours: 4 }` editable via `POST /api/leaves/policy` (ranges 1–31 / 1–10 / 1–12); **policy dialog** in Leaves.tsx labels: «ظرفیت مرخصی روزانه تیم (نفر)» (coverage cap!), «سقف مرخصی ساعتی (ساعت در روز)»; hourly request uses a **0.5 h stepper** up to the cap; UI copy explains: «⚖️ ظرفیت روزانه: هر روز ظرفیت مشخصی از مرخصی تأییدشده دارد…». hyper-zeytoon Leaves uses `type: DAILY | HOURLY` with `fromHour/toHour` `<input type="time">` (default 09:00–13:00) and «مرخصی ساعتی معادل نیم‌روز محاسبه می‌شود».
**`docs/LEAVE-SCHEDULING-SCIENCE.md`** is an evidence brief (Pandey 2025 tour-scheduling, NYU 2025 nurse-schedule equity, PMC fatigue review, TimeForge, Iranian law: 2.5 d/month accrual = 26 d/yr, ≤9 d carryover Art. 66, **7h20m hourly = 1 day**, 4 h/day cap) with 5 concrete policy recs — most valuable for SarResid 17-E: coverage-floor warnings on approval («با این تأیید، X نفر از Y نفر این روز خارج می‌شوند»), balance shown as «مانده مرخصی سالانه (از ۲۶ روز)», fair-share queue for contested dates (`lastGrantedAt` + «نوبت شما» chip), ≥72 h notice + 10 h post-night-shift recovery warnings.

**SarResid delta:** SarResid already has 1405 statutory + tax-band editor + insurance rate (16-F). Missing pieces the demos do better: **minute-based OT entry with +30/+60/+120 chips**, batch day-save, **OT cap enforcement surfaced in UI copy (مادهٔ ۵۹)**, yearly عیدی/سنوات settlement tab, **self «فیش من» tab**, printable slip w/ legal footnotes, and the entire leave-coverage policy layer.

---

## 5. Store floor plan / نقشه فروشگاه

### 5.1 `hyper-zeytoon/src/components/app/ZoneMap.tsx` — pure SVG, deterministic
- 690×566 viewBox, shop body `<rect rx=16 stroke=#0b2e20>`, gold entrance bar at bottom «▲ در ورودی» with dashed arrow.
- **Zone types:** `BACKROOM (انبار پشتی — top strip)` · `PERISHABLE (دیوار سرد — left column)` · `DRY (center, two bands)` · `POWER_AISLE (راهروی قدرت — middle)` · `CHECKOUT (near entrance)` · `DECOMPRESSION (زون تنفس — entrance band, dashed gold border, italic caption «زون تنفس — فروش‌سنج نیست (۳–۵ متر اول ورود)» — Paco Underhill)`.
- Layout = `layoutBucket(names, areaBox, cols, gap=7)` row-major grid inside each type's territory, ordering stabilized by `hashName` (deterministic across renders/sessions — no jitter).
- **Per-zone decorations:** A/B/C criticality circle, emoji + name, **owner chip «👤 {firstName}»** (responsible staff!), backup name in tooltip, **min-staff gold dots** (●●●+N), count-status fill: ok `#0e7a4a` .85 / mismatch `#b3372f` .85 **with CSS pulse animation** `hzmap-mismatch` / inprogress gold .55 / untouched zone-color .2; `<title>` tooltip carries owner/criticality/cadence/efficiency line.
- **Efficiency view toggle:** «نمای بهره‌وری (شاخص سهم)» — `shareIndex = zoneSalesShare ÷ zoneStaffHoursShare`, bands: متعادل ۰٫۷–۱٫۳ olive / نیروی بیش از فروش gold / فروش بیش از نیرو rose; footnote explains the formula; `salesTargetExcluded` for decompression zone; `countCompliance {lastDate, dueDate, overdue, cadenceDays}`.

### 5.2 Others
- **SarResid (round-16)** already has prefab-based FloorPlan editor + `FloorPlan.shape` polygon foundation (17-C in flight).
- hyperzeytoon Planogram/FloorOps: **no geometric floor plan** — the floor layer is the section-tab grid; FloorOps adds barcode-driven restock requests. nootyezrepyh planogram: fill-health grid, no shapes. nootyez-repyh PlanogramSection: shelf rows w/ FEFO-ish stock visuals.
- **Key takeaway for 17-C:** ZoneMap is the reference for **semantic auto-layout**: zone-type → territory box → deterministic sub-grid; plus the staff-responsibility and share-index layers that no other demo has. Its A/B/C criticality + count cadence are directly reusable for polygon zones in SarResid.

---

## 6. Planogram rendering
All four use **CSS grid of shelf cells** (no SVG/canvas, no drag-and-drop found — `grep onDragStart` = 0 hits):
- hyper-zeytoon: `grid-template-columns: repeat(cols, minmax(0,1fr))`, cell = product emoji/img, 🔥 badge when sales30 ≥ 8 (≥3 gold), bottom 1.5 px status bar colored by `stockStatus`, print sheet preview (maxWidth 150 thumbnails per plan).
- hyperzeytoon: `ShelfCellFooter` + **`fillColor(fill)`** 4-tier palette («پُر ۶۰٪+» full color else 15 % tint), stock/capacity «۲۴/۳۶ · کمبود», section-count button «جرد بخش «{section}»» → creates SECTION-scoped count, «پر کردن» → warehouse request with computed qty `capacity - stock`.
- Dashboard cross-links: hyperzeytoon shelf-health strip; nootyezrepyh planogram 866-line file adds per-shelf search + skeleton grid `grid-cols-6 aspect-[4/5]`.

---

## 7. Shifts / scheduling systems
**Only nootyezrepyh has a full module** (`sections/shifts.tsx`, 604 lines + `/api/shifts`):
- `SHIFT_TYPES`: صبح `#fdf3e0/#a06d0f` ☀️ · عصر `#eef4e6/#44682f` 🌤 · شب `#f0e7f3/#6d4f7d` 🌙 · مرخصی `#fbe9ec/#c25e77` 🏠; `TYPE_ORDER ['',MORNING,EVENING,NIGHT,OFF]` → **click a cell cycles its value**.
- **Persian week math:** `currentWeekStart()` = Saturday via `jalaliWeekday`; week label «هفتهٔ ۱ فروردین تا ۷ فروردین ۱۴۰۵»; `GET /api/shifts?week=…`, bulk `PUT /api/shifts {week, entries}`; **«کپی برنامه هفته قبل»** (toasts «{N} شیفت وارد شد — برای اعمال، ذخیره کنید»), per-cell notes, baseline/diff tracking.
- **Live coverage analysis:** `MIN_COVER = {MORNING:2, EVENING:2, NIGHT:1}`; re-computed while planning; banner «پوشش شیفت کامل است — همهٔ روزها حداقل نصاب دارند ✓» or «هشدار پوشش شیفت — N کمبود شناسایی شد» with per-shift text «شیفت صبح: ۱ نفر (حداقل ۲)»; coverage ratio in header «پوشش: ۱۸ از ۲۱ مورد».
- Notification engine adds **«شیفت امروز شما»** (always, severity info) and **shift-coverage warnings for planners for the next 2 days** (route lines 254–270).
- Dashboard shift chip + `MonthPlanner` plum-dot = my shift.
hyperzeytoon docs additionally treat leave as a *coverage event* (see §4.3) — the conceptual bridge between the two modules.

---

## 8. (merged into §4.3/§7 for leave+shift; overtime specifics in §4.2)

## 9. Notification badge isolation (per-user)

### 9.1 nootyez-repyh `BadgesPoller.tsx` — the reference implementation
- Invisible singleton: `GET /api/badges?userId=` once on mount/login, then **every 25 s + on window focus**; silent-fail; **stale-response guard** (`useApp.getState().user?.id !== uid` → drop); logout → `setBadges(ZERO_BADGES, null)`.
- **Daily digest with two triggers** hitting idempotent `POST /api/notifications/digest {userId}`: (1) first successful fetch of a session; (2) **08:00 Tehran check every tick** (`Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran'})`, handles ICU `hour==='24'`), closing the «tab open across midnight» gap; dedupe via localStorage `hz_digest_last` + server idempotency (`created|already`).

### 9.2 nootyezrepyh `NotificationBell` — seen-state per user
Unified computed feed `GET /api/notifications` filtered **server-side by the session user's roles** (MANAGE_ORDERS→pending approvals/overdue; RECEIVE_DELIVERY→expected; INSPECT→control; ACCOUNTING→Holoo queue; APPROVE_CHEQUES→PENDING_OWNER; CASHIER→pending sales; SALES_FLOOR→birthdays; everyone→my-shift). Seen-state: **`User.notifSeen` JSON map persisted server-side (cross-device)** with `localStorage zeytoon_notif_seen_${user.id}` as instant cache; an item is "new" when its current `count` differs from the seen snapshot. `KIND_ICON` maps 17 kinds incl. `birthday: Cake`, `shift-coverage: CalendarClock`.

### 9.3 hyper-zeytoon `Notifs.tsx` + `/api/notifications`
Per-user: `db.message.findMany({ where: { toId: me.id, readAt: null } })`, **`NotifPref { userId, mutedCats[], snoozeUntil }`** (mute categories + snooze all), categories order/cheque/stock/task/team/workflow, severities critical/warning/info, each item carries `go` (deep-link section) + `count`; plus a rules engine (`notif-prefs`, `notif-rules`, `NotifOutbox` with `ruleKey/outboxId`).

**SarResid delta:** round-16 shipped sidebar badges; 17-F needs exactly the `notifSeen`-snapshot pattern + role-gating + mute/snooze. BadgesPoller's 8 am Tehran digest is a clean add-on.

## 10. Avatars
- **hyperzeytoon avatar system = best-in-class, zero-network:** `lib/avatar.ts` + `ui/OrnateAvatar.tsx`. Pure inline SVG (~1 KB): warm gradient (`AVATAR_PALETTES`: pistachio/saffron/copper/olive/pomegranate/walnut — **no blue/indigo by design law #4**), one of **8 stroke-only Persian ornaments** — `boteh` (بته‌جقه کرمان), `girih` (eight-point tile star), `shamsa` (dome medallion), `cypress`, `olive branch`, `pistachio kernel`, `jajim` (tribal weave), `khatam` (marquetry) — engraved double ring + radial sheen + initials.
- **`safeInitials()`** — naive Persian initials can be obscene (their real case: «کیانوش صفاپور» → «کص»); `normalizeName` (ZWNJ/NBSP/ي→ی/ك→ک/diacritics), `UNSAFE_PAIRS` blocklist + `UNSAFE_PAIRS_LATIN` ('kk','fk','xx','qq') + fallback «کی».
- **Deterministic default** `avatarConfigFor(name, username)` (FNV-ish hash → palette + pattern) so a person looks identical everywhere; **pinned config** via user prefs (`avatar: {pattern, palette}`) edited in AppearanceStudio «آواتار من»; contract: «any future avatar rendering MUST go through UserAvatar/OrnateAvatar». Server prefs PATCH is **merge-semantics** (partial writers can't wipe sidebar/avatar keys) — `POST /api/auth/prefs`.
- **No photo-upload avatar exists in any demo** (grep `avatarUrl|photoUrl` = 0 hits) — SarResid's `User.avatarUrl` (17-F) will be new; the ornament system can serve as the fallback layer behind photos.
- Login user-picker shows `OrnateAvatar` + name + role for each account (screenshots).

## 11. Birthday workflows
- **Customer birthdays (nootyezrepyh `/api/notifications` lines 202–235):** Jalali MM-DD match (`mdOf = j.slice(5)`) with **T-7 scan** (`for off=1..7 addDaysJalali`) + **T-0**: «🎂 تولد {names} امروز است» severity **urgent**, «یک تبریک کوچک، مشتری را برای همیشه خوشحال می‌کند.»; T-7 aggregated «تولد {names} در ۷ روز آینده» severity info. Role-gated to front-of-house + managers; deep-link `section:'sales'`. **(No T-3 exists in any demo — SarResid's planned T-7/T-3/T-0 ladder is a superset.)**
- **Staff birthdays (hyper-zeytoon Personnel.tsx):** `isBirthdayMonth = jMonth(p.birthday) === thisMonth` → KPI «تولدهای این ماه — آمادهٔ هدیه باشید 🎁», per-card pill «تولد این ماه 🎂», detail KeyValue «تاریخ تولد 🎂»; hiring-form hint: «تولدها برای هدیه 🎁، فرزندان برای کمک‌هزینه، مدارک اسکن‌شده… — ما اطلاعات را برای مراقبت استفاده می‌کنیم، نه بازخواست.» CRM `crm-engine.ts` computes Jalali month/day windows for campaigns («با مهار روزِ اسفند در سال کبیسه‌ناپذیر» — Esfand-30 clamp!). nootyez-repyh stores customer birthdays for gifts as well.

## 12. Category management for products
- **No dedicated Category CRUD view exists in any demo** — categories are free-text (`product.category String`) with autocomplete chips; product counts per category shown as «{faNum(total)} کالا در {faNum(categories.length)} دسته» (hyper-zeytoon pagination bar).
- **CATEGORY_EMOJI map** (hyper-zeytoon `lib/constants`) — Persian category name → emoji fallback for images (`CATEGORY_EMOJI[product.category] || '📦'`); the same map labels ZoneMap zones.
- hyperzeytoon groups products by category in reports (shrinkage) and uses `category` chips in the detail dialog.
- SarResid's new `Category` model (name/icon/color/imageUrl/sort/active) + CRUD is therefore **ahead of all four demos**; steal only the emoji-fallback idea for legacy uncategorized products.

## 13. Themes — exact palettes

### 13.1 hyper-zeytoon (same DNA as SarResid) — `src/app/globals.css` (1134 lines)
Light: `--background #faf7ee` (cream), `--primary #0e7a4a` (emerald), `--gold #c9a227`, extra tokens `--pistachio --olive --terracotta`; font `"Vazirmatn", Tahoma, "Segoe UI"`; decorative classes `.pattern-girih`, `.hero-emerald`, `.gold-glow-border`, `.shimmer-line`, `.glow-card`, `.scroll-gold`, `--cal-font` variable (13 px). Dark (`html.dark` via next-themes): `--background #0d1a14`, `--primary #17a05f`. Keyframes: `hzmap-pulse`, fire-pulse, stagger-item.

### 13.2 hyperzeytoon — AppearanceStudio + prefs.ts
- **5 accents** (`ACCENTS`): پسته‌ای `#3E7C59` «سبز پسته کرمان» · زعفرانی `#D4A017` «طلایی زعفران» · اناری `#B33A3A` «سرخ انار» · مسی `#B87333` «سفالگری کرمان» · فیروزه‌ای `#2E8E8E` «کاشی فیروزه».
- **3 modes** (`THEMES`): روشن «کاشی و خامه», **شب کویر «زغالی گرم با طلایی درخشان»**, سیستمی — via `theme-provider` class strategy.
- **3 background patterns** (`PATTERNS`): بته‌جقه / اسلیمی (girih stars) / ساده — CSS classes `.pattern-paisley/.pattern-girih/.pattern-stars` with dark variants (globals.css lines 237–243).
- **Font-scale** slider `FONT_SCALE_MIN..MAX` persisted in prefs; **accent themes CSS ordering discipline** documented in globals.css: «Accent themes — LIGHT (must precede .dark …)» and «— DARK (specificity 0,2,0 beats plain .dark)».
- Per-user persistence via `POST /api/auth/prefs` (merge semantics).

### 13.3 Others
nootyezrepyh: theme-provider + «فعالسازی تم تیره» toggle on the login screen; palette olive `#5A7D4F`, gold `#B8860B`, pattern-stars; nootyez-repyh: hardcoded warm light palette `#253A2A` ink / `#3E6B4A` green badges / `#8A6508` gold badges / `#F3F7EF` `#FBF3DC` chip fills + **bilingual headers**; no separate dark theme.
*(SarResid's 4-preset زیتون/پسته/زعفران/انار from 16-D already covers this; the steal is the per-user server-side persistence + font-scale slider + pattern layer.)*

## 14. Unique widgets/features NOT yet in SarResid
| # | Feature | Platform | Where | Notes |
|---|---|---|---|---|
| 1 | **GuidedTour** spotlight onboarding | hyperzeytoon | `shell/GuidedTour.tsx` (479) | Role-aware scripts (owner/gm/…, 6–9 steps), selector-based spotlight (`nav[aria-label="فهرست اصلی"]`, `button[aria-label="اعلان‌ها"]`…) with graceful **fallback to centered modal** when selector missing (mobile); per-user done-flag `localStorage hz_tour_done_<uid>`; re-run from Help; custom event `hz:start-tour`. (SarResid has SandboxTour — GuidedTour adds role scripts + chrome selectors.) |
| 2 | **OrnateAvatar + safeInitials** | hyperzeytoon | `lib/avatar.ts`, `ui/OrnateAvatar.tsx` | §10. 1 KB SVG, 8 Persian ornaments, obscene-initials blocklist. |
| 3 | **IranMap supplier cartogram** | hyperzeytoon | `sections/archive/IranMap.tsx` + `lib/iran-geo.ts` | 31 provinces as 8×7 cell grid w/ sea cells; 5 green-intensity levels by supplier count; click → province card. |
| 4 | **MonthPlanner dashboard widget** | nootyezrepyh | `components/month-planner.tsx` | Jalali month grid, colored dots per day: gold=cheques · olive=tasks · green=deliveries · plum=my-shift · red=holiday; click-day detail list; ‹ › month nav. |
| 5 | **Weekly compare (WoW)** | nootyezrepyh | `sections/dashboard.tsx` «مقایسهٔ هفتگی فروش» | Two cards + ±delta % pill with TrendingUp rotate-180 when down; server computes Sat→today vs prev full week. |
| 6 | **BadgesPoller + 8 am Tehran digest** | nootyez-repyh | `platform/BadgesPoller.tsx` | §9.1. |
| 7 | **notifSeen snapshot seen-state** | nootyezrepyh | `notification-bell.tsx` + `User.notifSeen` | §9.2 — cross-device "new" detection by count-diff. |
| 8 | **FEFO expiring panel + markdown suggestions** | nootyez-repyh | `WarehouseSection.tsx` lines 955–996 | «اول انقضا، اول خروج — تا ۲۱ روز آینده»; per-batch value + daysLeft; «قیمت‌گذاری بر پایه انقضا — پژوهش‌پشتیبانی‌شده» suggestMarkdown flag; footnote cites FEFO research. |
| 9 | **LowStockDraft** one-click draft PO for all shortages | nootyez-repyh | `LowStockDraft.tsx` (337) + dashboard button | Draft order grouped by supplier in one action. |
| 10 | **Pilot Program** | nootyez-repyh | `PilotSection.tsx` (816) + `/api/pilot` (+ public `/api/pilot/feedback`) | Invite codes `HZP-XXXX`, tester status board, module leaderboard by avg rating, live feedback inbox, CSV export. |
| 11 | **CommunitySection idea board** | nootyez-repyh | `CommunitySection.tsx` | Wall + ideas with `IDEA_STATUSES` lifecycle (submitted→decided, `decision` text), manager decides. |
| 12 | **Persian command palette** | nootyezrepyh | `command-palette.tsx` | Ctrl/⌘+K; `norm()` normalizes ي/ك + Persian/Arabic digits before matching; searches sections, staff, products, orders; lazy prefetch 1.5 s after mount; permission-gated actions. |
| 13 | **Vault «گنجینه شخصی»** | hyperzeytoon | `people/Vault.tsx` | Private per-user encrypted-feel file store (receipts/photos), owner-only access. |
| 14 | **print kit** | nootyezrepyh | `print/invoice-print-overlay.tsx`, `print-helpers.ts` | Reusable invoice print overlay (vs hyper-zeytoon's inline style trick). |
| 15 | **Urgent Q&A** (already ported to SarResid), **restore-points UI** | hyper-zeytoon / nootyezrepyh | `Urgent.tsx`, `versions.tsx` | versions: snapshot/restore with protected «Hello, World» tag, git auto-tag before risky ops. |
| 16 | `formalName(gender,name)` greetings + `AnimatedCount` | hyperzeytoon | `ui/shared.tsx` | «جناب آقای/سرکار خانم» |
| 17 | Leave science doc + policy knobs | hyperzeytoon | `docs/LEAVE-SCHEDULING-SCIENCE.md`, `people/Leaves.tsx` | §4.3 — direct input to 17-E. |
| 18 | Demo data generator (0.3 s, 3 sizes) + DemoLab | nootyezrepyh / hyperzeytoon | `sections/demo.tsx`, `people/DemoLab.tsx` | Complements SarResid sandbox. |
| 19 | Holoo import classifier (NEW/DUPLICATE) + Bulk price import + «عمر مفید» field | nootyezrepyh / nootyez-repyh | products sections | Price import inverse-export «all=1». |
| 20 | Shelf-health strip + supplier-grouped 1-click reorder w/ model tooltip | hyperzeytoon | `Dashboard.tsx` | §3.2. |

## 15. TOP 15 STEAL-WORTHY IDEAS (prioritized for SarResid round 17)

1. **Minute-based OT entry + quick chips + batch save** — hyper-zeytoon `Payroll.tsx` `SmallNum`/`QuickChip` (+۳۰/+۶۰/+۱۲۰), daily grid with auto day-kind and «ذخیرهٔ N روز تغییر یافته». Adapt to 17-E: keep h+min inputs, minutes in DB, cap chip at ۲۴۰ min with مادهٔ ۵۹ footnote, emerald headers/gold chips in SarResid style.
2. **Leave coverage policy layer** — hyperzeytoon `Leaves.tsx` policy dialog (`monthlyDays/maxSameDay/hourlyMaxHours`) + science doc's approval warning «با این تأیید، X نفر از Y نفر این روز خارج می‌شوند», balance «مانده مرخصی سالانه (از ۲۶ روز)», 7h20m=1 day conversion note, 0.5 h hourly stepper. For 17-E.
3. **OrnateAvatar system with safeInitials** — hyperzeytoon `lib/avatar.ts` + `ui/OrnateAvatar.tsx`. Adapt: render as fallback behind `User.avatarUrl` photos; reuse 8 ornaments/palettes (drop turquoise? — it's fine, no blue/indigo); port `UNSAFE_PAIRS` verbatim; wire «آواتار من» picker into DataAdmin profile card; keep prefs PATCH merge-semantics.
4. **notifSeen snapshot + role-computed feed + mute/snooze** — nootyezrepyh `notification-bell.tsx` (`User.notifSeen` JSON + count-diff "new") and hyper-zeytoon `NotifPref.mutedCats/snoozeUntil`. For 17-F badge isolation: badge = Σ items whose count ≠ seen snapshot, computed per session user.
5. **Customer birthday notifications T-7 + T-0** — nootyezrepyh `/api/notifications` lines 202–235 (Jalali MM/DD scan, urgent «🎂 …امروز است»). Extend to planned T-7/T-3/T-0 ladder for staff+customers; keep role-gating and deep-link `go`.
6. **GuidedTour role-aware spotlight** — hyperzeytoon `shell/GuidedTour.tsx`. Adapt to SarResid: extend existing SandboxTour with role scripts (OWNER/OM/ACC/CASHIER), selector fallback, `hz_tour_done_<uid>` flag, «تور را دوباره ببینید» in Help.
7. **ZoneMap efficiency + responsibility layers for FloorPlan polygons** — hyper-zeytoon `app/ZoneMap.tsx`: owner chip 👤 + backup, min-staff dots, A/B/C criticality, count-cadence compliance, shareIndex bands (۰٫۷–۱٫۳) with «زون تنفس» exclusion. For 17-C: attach these fields to polygon zones; reuse deterministic hash-ordering for auto-suggested layouts; CSS pulse for mismatch zones.
8. **Shifts weekly grid with live coverage + copy-last-week** — nootyezrepyh `sections/shifts.tsx` (TYPE cycle click, `MIN_COVER {2,2,1}`, coverage banner, `PUT /api/shifts`). For 17-D: port mechanics onto the new `Shift`/`ShiftAssignment` models (add double-shift support already in schema); Persian-week Saturday math from `jalaliWeekday`.
9. **FEFO expiring panel + auto-markdown suggestions** — nootyez-repyh `WarehouseSection.tsx`: 21-day window, per-batch value, suggestMarkdown chip with research footnote. Feed from SarResid expiry data; gold/terracotta styling.
10. **WoW weekly sales compare card** — nootyezrepyh dashboard «مقایسهٔ هفتگی فروش» (Sat-anchored, ±delta % pill). Cheap add to SarResid dashboard next to existing charts; complements the products LY-compare.
11. **MonthPlanner widget** — nootyezrepyh `month-planner.tsx`: colored-dot Jalali month grid (cheques/tasks/deliveries/shift/holiday). Perfect companion for NavbarCalendar; data via one `GET /api/calendar-events?month=`.
12. **BadgesPoller 8 am Tehran digest** — nootyez-repyh: silent singleton, focus-refresh, digest idempotency. Reuse as SarResid's daily «صبح‌نامه» notification trigger.
13. **ProductDetail upgrades: shelf-placement cross-link + sellPrice2 + client-side image downscale** — hyperzeytoon `catalog/ProductDetail.tsx` (`fileToScaledDataUrl(file,400)`, barcode add/remove chips, «چیدمان قفسه» badges from planogram). Slot into SarResid `ProductEditModal`/`ProductDetailModal`.
14. **Persian command palette hardening** — nootyezrepyh `command-palette.tsx` `norm()` (ي/ك/ Persian-digit folding) + lazy prefetch + permission-gated quick actions; apply to SarResid `CommandPalette.tsx` matching.
15. **Pilot/Community machinery for SarResid's testers** — nootyez-repyh `PilotSection.tsx` (HZP-XXXX invite codes, public feedback endpoint, module leaderboard, CSV) + `CommunitySection.tsx` idea lifecycle; adapt for the PRICING.md pilot plan (van Westendorp interviews) with emerald/gold UI.

**Brand-fit guardrail (all platforms):** every steal above is already in the emerald/gold/cream family — map any stray hex (`#3E7C59→#0e7a4a`, `#D4A017→#c9a227`, `#B8860B→#c9a227`, `#5A7D4F→#77934a`, surfaces→`#faf7ee`) and keep faNum digits + formal-friendly Persian labels.

---

### Browser evidence (agent-browser)
- `hyperzeytoon.space-z.ai`: login picker w/ OrnateAvatars → owner PIN 1234 → dashboard, products, planogram, settings, first-run GuidedTour dialog. Screenshots: `hz2-dash.png`, `hz2-products.png`, `hz2-planogram.png`, `hz2-settings.png`, `hz2-tour.png`.
- `nootyezrepyh.space-z.ai`: owner PIN 1234 → dashboard + «شیفت‌های هفته» grid. `nrp-dash.png`, `nrp-shifts.png`.
- `nootyez-repyh.space-z.ai`: bilingual login («HYPER ZEYTOON — Smart Operations Platform») → dashboard. `nrp2-login.png`, `nrp2-dash.png`.
- `hyper-zeytoon.space-z.ai`: HTTP 200 (verified by curl; code audit used for detail).
