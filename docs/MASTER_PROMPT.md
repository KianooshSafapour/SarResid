# SarResid (سررسید) — Master Build Prompt

> **Purpose:** Give this document to any capable coding agent and it can rebuild — or continue building — the complete SarResid platform up to the latest accepted state, with every requirement the owner has ever asked for, the scientific rationale behind each decision, and the platform's non-negotiable conventions.
> **Audience:** An autonomous full-stack coding agent. Everything here is normative unless marked *OPTIONAL*.
> **Current lineage:** v0.1_alpha "Peste" → v0.2-alpha → restore point **v_0.1alpha3** → **0.1alphaPi "π"** (rounds 16–18). Repo: `https://github.com/KianooshSafapour/sarresid`.

---

## 0. Identity & Origin Story (why this exists)

Hyper Zeytoon (هایپر زیتون) is a real supermarket in Kerman, Iran, with a 10+ year credible operating history. Its operations/IT manager **Kianoosh Safapour** commissions this platform. The platform is being productized and sold to other Iranian supermarkets under the name **SarResid (سررسید)** — literally *"the due date"*, after the traditional pocket diary every Iranian keeps to track personal debts, IOUs and due dates. The first release line is **v0.1_alpha** (codename "Peste"), the first stable enterprise anchor is **0.1alphaPi (codename "π")**.

**Core business reality:** all dates are Jalali (Persian calendar), all money is Toman/Rial with Persian digits, all UI is Persian-first RTL (with EN/AR/TR translations), payroll follows Iranian labor law (قانون کار) with year **1405** statutory parameters, and the store's week ends with special **Friday** shift times (10:00–14:00 and 18:00–22:00). Ignore Iranian context and the product is worthless.

---

## 1. Non-Negotiable Laws (violating any of these has historically destroyed trust)

1. **完整性铁令 (Completeness):** never deliver an in-progress feature. Every task ships complete, verifiable, MVP-presentable, 1-by-1 accepted.
2. **扩展铁令 (Extension-only):** new ideas extend the existing system; never replace or rewrite working parts. If a feature regresses to an earlier state, that is a catastrophe.
3. **恢复点 (Restore points):** before risky work, commit a restore point (e.g., `v_0.1alpha3`). After a stable milestone, commit & push an anchor (e.g., `0.1alphaPi "π"`).
4. **方法论铁令 (Research first):** every new feature starts with academic/scientific literature research (HCI, retail science, operations management, labor law) and the rationale is documented in code comments + docs.
5. **Version safety:** any "reverted feature" report is diagnosed by comparing repo history/sub-directories first — restore the best prior implementation, do not regenerate from scratch.
6. **Regression watch:** the sandbox dev server serves stale PWA chunks if `public/sw.js` cache version isn't bumped when changing code; always bump SW cache version when shipping user-visible changes. Canvas coordinates are LTR math — never use RTL logical `start-*` positioning on transform layers.
7. **Zero in-progress:** the worklog (`worklog.md`) must not end with unfinished task entries.

---

## 2. Tech Stack (fixed)

| Layer | Choice |
|---|---|
| Framework | **Next.js 16 App Router**, single visible route `/`, client-side hash router (`#/view/param`) |
| Language | TypeScript 5 strict |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) |
| DB | Prisma ORM + SQLite (`db/custom.db`), sandbox template `db/sandbox-template.db` |
| State | local React state; TanStack Query/Zustand allowed; no Redux |
| Realtime | socket.io mini-service on **:3003** (`mini-services/chat-service`, `bun --hot`) |
| Charts | self-drawn SVG chart kit `src/components/app/charts.tsx` (BarChart, LineChart, Donut, RankBars) — no recharts dependency |
| Dates | `jalaali-js` via `src/lib/jalali.ts` |
| Auth | custom PIN login (4-digit per user) + session token (cookie + `X-Session-Token` header fallback) |
| Files | image data-URLs client-compressed ≤300 KB |
| Fonts | Vazirmatn (Persian), RTL default |
| Dev | `bun run dev` on **:3000 only** (never `bun run build`), logs to `dev.log`, lint via `bun run lint` |

### Backend rules
- `z-ai-web-dev-sdk` only in server code (image search, image gen, LLM features).
- API helpers in `src/lib/api-helpers.ts`: `getSessionUser(req)`, `json`, `fail`, `logActivity(me,'action',entity,entityId,detail)`, `appendHistory`, `safeParse`.
- Prisma has **no list primitives** — JSON strings + `safeParse` everywhere.
- Every mutation logs an ActivityLog entry.
- RBAC: role + secondaryRoles + capability caps (`src/lib/rbac.ts`, `hasCap`); executive bypass: OWNER/GM/OM/ADMIN see everything.
- Multi-tenant licensing: `src/lib/license.ts` — modules (`accounting, cheques, archive, payroll, planogram, crm, analytics`) can be purchased per-term; `MODULE_OF` maps view→module; locked views route to `#/locked/<module>` with a buy hint. Sandbox demo mode = isolated DB template + «هایپر نمونه 🧪» branding + guided tour.

---

## 3. Design System (brand law)

- **Palette:** emerald `#0e7a4a` (primary), deep emerald `#0b2e20` (sidebar) with `.pattern-girih`, gold `#c9a227` (accents/badges), terracotta `#c96f4a`, olive `#77934a`, rose `#b3372f` (danger), cream bg `#faf7ee`. **NO blue/indigo anywhere as primary.**
- Cards: `.glow-card .gold-glow-border`; Kerman paisley/girih decorative motifs; `scroll-gold` on all scrollable lists; `fade-in-up` on sections; `pulse-dot` for live states.
- Touch-first: min **44px** interactive targets; big steppers; PIN pad login with avatar grid.
- Typography: Vazirmatn; Persian digits via `faNum`, money via `faMoney`; `dir="rtl"`.
- Dark mode + 4 theme presets + per-user prefs (`/api/me/ui-prefs`, Setting `S_LICENSE`, `uiPrefs` JSON).
- Shared UI (`src/components/app/ui-bits.tsx`): `AppCtx` (user, navigate(view, param), refreshNotifications…), SectionCard, StatCard, Pill, EmptyState, Avatar, stockStatus, SearchInput, Labeled, KeyValue, CATEGORY_EMOJI.
- Shared `Modal` lives in `src/components/views/Orders.tsx` — closes on backdrop click, X, **and Escape (WAI-ARIA)**.
- Avatar 3-tier fallback: photo (`avatarUrl`) → cartoon (`avatarStyle`) → engraved initials.

---

## 4. Information Architecture (academic basis — round 18)

**Sidebar = 8 collapsible clusters** (card-sorting derived, Miller 7±2, progressive disclosure à la Nielsen, Hick's Law, recognition-over-recall, CommandPalette `⌘K` for experts / GOMS):

1. **عملیات روزانه** — dashboard, orders, receiving, verify, accounting
2. **فروشگاه و انبار** — products, zonecount (Daily Zone Count), planogram, floorplan (Store Map), sales
3. **نیروی انسانی (Workforce)** — personnel, shifts, leaves, payroll, perf  ← the whole HR cycle in one cluster
4. **شبکهٔ اشخاص (People Network)** — people (دفتر اشخاص), providers (تأمین‌کنندگان), crm  ← designed together; `PeopleNetBar` shared header with unified cross-network search
5. **مالی و اسناد** — pricecheck, cheques, archive, reports
6. **همکاری تیمی** — tasks, sop, wall, messages, urgent, notes, feedback
7. **علم و پژوهش** — science, research, demo
8. **سیستم** — notifs, briefing, kb, admin, rbac, data, help

Behavior: only the active cluster auto-expands; manual open/close persisted in `localStorage('sarresid.nav.groups')`; collapsed headers show item count + active/badge dots; aria-expanded on headers; i18n keys `nav.store/workforce/peoplenet/collab` in EN/AR/TR.

**Access map (VIEW_ACCESS in `src/lib/constants.ts`):** role lists + secondary roles per view; custom roles get views via stored `extraViews`.

**Related-page design law:** pages that are one mental workflow must link both ways. Examples shipped: Archive «چرخهٔ سفارش تا حسابداری» (orders ↔ ledger cross-jumps + 4-stage CycleStrip); People ↔ Providers rep records; ZoneCount ↔ FloorPlan (zones come from the map).

---

## 5. Complete Feature Catalogue (build exactly this)

### 5.1 Identity, Auth, Profile & Avatars (round 17–18)
- Login: avatar grid → PIN pad (4 digits, auto-submit); system-admin username/password door; session token header fallback for webviews.
- **Avatar v2 (Bitmoji-grade, 16 fields):** skins ×8; hair ×12 (short, long, curly, bun, braid, ponytail, bald, buzz, wavy, mohawk, afro, undercut); hair colors ×10 (incl. dyed terracotta/olive/gold); eyes ×5; mouths ×6; outfits ×8 (تی‌شرت، هودی، پیراهن، مانتو، **فرم هایپر زیتون (vest)**، کت، بافت، آپرای دکلره); outfit colors ×12; accessories ×5 (none/cap/earrings/headband/earbuds); glasses ×4 (none/round/square/sun); brows ×3; blush + freckles toggles; backgrounds ×10 (6 solids + 4 SVG patterns: girih diamonds, paisley dots, stripes, checkers); interest-pin emoji ×8; **hijab ×4 (none default + روسری، شال، مقنعه) with ×8 colors — explicitly opt-in, respectful note «برای همه پیش‌فرض نیست»**, hair hidden under cover, small fringe allowed for شال; **beard ×4** (none/ته‌ریش/ریش کامل/سبیل).
- Pure-SVG renderer `CartoonAvatar` + `UserAvatar` 3-tier fallback; deterministic migration of old configs (`migrateAvatarStyle`).
- **«پروفایل من» modal, 3 tabs:** تصویر (photo upload w/ client compress ≤300 KB + remove) / آواتار (builder) / دربارهٔ من (nickname ≤24, phone, bio ≤160; name & role read-only). APIs: `GET/POST /api/me/avatar` (validated style whitelist), `GET/PATCH /api/me/profile`. User fields: `avatarUrl`, `avatarStyle`, `nickname`, `bio`, `phone`.

### 5.2 Daily Operations
- **Orders:** 4-step creation wizard, pipeline statuses (DRAFT→SUBMITTED→APPROVED→RECEIVING→RECEIVED→VERIFIED→ACCOUNTED/DONE + CANCELLED), corrections log, delivery-date guard vs holidays, print. Badge counts in nav.
- **Receiving (دریافت مرسوله):** barcode scanner host, ± steppers, printed-price fix, reject/short entry, quick «F5 هلو» product add.
- **Verify (تأیید انبار):** storekeeper two-man-rule confirmation.
- **Accounting (حسابداری و هلو):** Holoo diff banner, XLS export (SheetJS), print/PDF; price margins guard (warn <10%, good >25%), VAT 9%.
- **Cheques:** Jalali calendar with cheque due dots + holiday guard; lifecycle sign/reject/split/deliver/clear/bounce; owner-GM delivery flow; due-date planner + flexibility engine (FlexRule); PayLimits.
- **Archive (آرشیو اسناد):** binders→docs→items hierarchy, custody loans, doc events, disposal with two-man rule; **tabs grouped in 3 clusters**: «اسناد و بایگانی» (docs/structure), «چرخهٔ سفارش تا حسابداری» (**orders + ledger together**), «اشخاص و شبکه» (parties/reps); cross-links both directions: order row → «در دفتر حسابداری» (ledger pre-filtered by party), ledger doc → «سفارش مرتبط» (conservative matcher: same providerName + nearest date ±30d, else party-search fallback); CycleStrip (سفارش → دریافت → تأیید انبار → ثبت در دفتر) with current stage lit; comprehensive document search (this is where document search lives — NOT on the dashboard).

### 5.3 Store & Inventory
- **Products:** grid, filters, per-product dialog with analytics (90-day zero-filled sales LineChart, orders buy qty/value, top-3 providers Donut, margin trend, category share, waste BarChart, FEFO expiry chips, KPI strip incl. stock coverage, 🔮 next-order prediction from avg gap days; granularity + last-year compare); Holoo XLS import wizard with duplicate detection + merge; internet image search via z-ai CLI (up to 90 s, spinner required); client-side scaled image upload; barcode add/remove chips.
- **Categories (SSOT):** `/api/categories` CRUD + bulk product move; icon emoji, brand color, logo URL, sort, active; used by products, planograms, zone inference.
- **Store Map (نقشهٔ فروشگاه / FloorPlan):** multi-floor; **polygon floor editor** (vertex add/drag/insert/delete, simple-polygon validation) with `shape` JSON vertices in cm — arbitrary sizing 200–12000 cm (NO 4×4 m limit); **«پیش‌تنظیم هایپر زیتون» one-click preset = trapezoid 12 m × 25 m** (vertices 0,0→1200,0→1200,2500→400,2500→0,2100) with SW entrance-right/exit-left 4 m auto doors, E-wall glass nut cabinets ×3, N-wall open fridges + three-door showcase fridges ×3, ice-cream freezers ×2, 4 gondola aisles, 3-sided U cashier diagonal left, per the owner's hand-drawn blueprint; **15-prefab library** (AISLE/SHELF/GONDOLA/FRIDGE_CLOSED/FRIDGE_OPEN/FRIDGE_SHOWCASE/FREEZER_ICECREAM/CASHIER_U/CHECKOUT/ENTRANCE/STORAGE/PRODUCE/BAKERY/DELI/CUSTOM) with distinct renders, rotation, zone assignment (datalist + chips), zone grouping with Shift+click, responsible staff per block (`meta.responsibleId`), capacity, notes; floor tabs; legend.
- **Daily Zone Count (شمارش روزانهٔ زون):** blind counting (counter never sees system qty; only ✓/⚠ flags + overall mismatch), re-check flow, reason capture, supervisor confirmation (ACC/OM/GM/OWNER/ADMIN) — never leaks numbers to merchandisers; **its map tab renders THE REAL store map** via shared `FloorPlanCanvas` (polygon + blocks + zone footprints, click-to-select, multi-floor tabs, off-map zone chips); manager action «همگام‌سازی زون‌ها از نقشهٔ فروشگاه» → `POST /api/zones/sync-from-map` which **intelligently infers zone types from block structure**: CHECKOUT/CASHIER_U→CHECKOUT; fridges/freezers/produce/deli/bakery→PERISHABLE; ENTRANCE→DECOMPRESSION; STORAGE→BACKROOM; GONDOLA clusters with centroid in middle 50%→POWER_AISLE else DRY; new zones get criticality/cadence defaults (A/WEEKLY perishables & checkout, C/MONTHLY backroom); idempotent; falls back to abstract `ZoneMap` + editor deep-link when no plan exists; `ZoneMap` deterministic layout also available (Underhill zoning: BACKROOM top, PERISHABLE wall, POWER_AISLE center, DECOMPRESSION dashed-gold 3–5 m entry band excluded from sales targets).
- **Zone science:** ZoneSLH = zone 30-day sales ÷ zone staff weekly hours; ZoneShareIndex = sales share ÷ hours share (<0.7 overstaffed, >1.3 underserved); ABC count cadence compliance (A weekly, B biweekly, C monthly) with overdue flags; per-zone owner/backup/minStaff.
- **Planogram:** CSS-grid shelves; published/draft states; fill-health strip; product picker with lazy pagination; merchandiser → storekeeper refill requests; **RTL-safe rendering fix, proportional shelves, zoom 0.6–1.6 with hit scaling, print block**.
- **Sales & Customers:** customer chips + inline new customer, cart with steppers, preorders queue (cashier edit → READY → Holoo receipt simulation), SPHL (sales per hour of labor ÷ 8 h), salesperson charts, customer requests (increment-on-repeat).
- **CRM:** customers with tiers (incl. VIP), events timeline, campaigns, complaints (شکایت) workflow, engagement scoring; birthday notifications T-7/T-3/T-0 for staff (see 5.5) and customers.

### 5.4 Finance
- **Price Check board:** daily price control, per-checker flow.
- **Reports & Excel:** XLS exports via SheetJS, weekly/monthly packs.
- **Payroll (حقوق و دستمزد) — PRODUCTION-CRITICAL, law-accurate:**
  - Engine `src/lib/salary-engine.ts` with **STATUTORY_1405** constants (Rial): monthly wage base, housing allowance `۹٬۰۰۰٬۰۰۰`, food/worker allowance `۲۲٬۰۰۰٬۰۰۰`, seniority daily `۹۴٬۰۰۰`, divisor 220, monthly leave days 26/12 equivalents, insurance rate 7% employee share; tax: exempt 240m/yr then 10/15/20% bands (editable in settings).
  - **Overtime: h+min dual inputs per day** with carry (1:45+0:30=2:15), h:mm display, quick chips +۳۰/+۶۰/+۱۲۰; **Article 59 (ماده ۵۹) daily cap is a NON-BLOCKING warning only** — entering 8:00 OT shows an amber notice «مبنای توافق کاری طرفین پذیرفته شد» and saves; **never block**.
  - Night/holiday bonus fields (hot/night) same h+min UX.
  - Minute-precision hourly leave (from HH:MM → duration «۱ ساعت و ۴۵ دقیقه»), leave policy: monthly days 4, max same-day 2, hourly max 4 h, 7h20m=1 day, coverage-floor warning on approval, fair-share queue.
  - Batch save «ذخیرهٔ N روز تغییر یافته»; عیدی/سنوات yearly tab (2× wage, cap 3× minimum wage); self payslip with scoped print CSS; **settings tab: admin-configurable OT rate, OT cap minutes, insurance rate, insurance-includes-OT toggle, editable tax table, housing/allowance constants**; all money Persian digits Toman.
  - SalaryMonth/SalaryDay/SalaryAdjust/SalaryProfile models; month navigation; KPI strip (gross/net/insurance/employer cost).
- **Shifts (شیفت‌ها و برنامهٔ تیم):** weekly template grid شنبه…جمعه (JS weekday 0..6, Fri=5); shift editor **no duration limit, overnight supported (end<=start)**; per-shift `staffNeed`; Hyper Zeytoon preset (Sat–Thu صبح 08:00–15:30 + عصر 15:30–23:00 need 2; **Fri 10:00–14:00 + 18:00–22:00 need 3**); daily assignment board with date nav, coverage pills (کامل/کمبود), **double-shift toggle** (double pay flag), week strip; ShiftAssignment unique [date,shiftId,personnelId].
- **Leaves:** minute/hour/full-day three granularities; approval workflow with response notes; team calendar.

### 5.5 Team & Communication
- Tasks (mine/all; start/pause-with-note/done/reopen; auto-award points on done with 🎉 celebration overlay), SOPs (steps editor, category chips), Wall (sticky notes), Messages (private chat over socket.io :3003 `hz-msg`), Urgent questions, Notes (private masonry, 6 colors, pin), Feedback (anonymous box + ideas with manager responses and +۱۵/+۳۰/+۵۰ awards).
- **Notifications (SSOT engine):** `notif-engine` computes rules → `NotifOutbox` rows with `visibleToUser()` single audience filter (targetUsers ∪ targetRoles ∩ mine ∪ broadcast) — **badges are per-user isolated** (never global); `NotifPref` mute/snooze; nav badges per view from `go` field; bell dropdown + full center view.
- **Birthday engine:** `runBirthdayCheck()` on notifications GET with daily lock; T-7/T-3/T-0 from `Personnel.birthday` (Jalali year-agnostic, اسفند 30→29 clamp); recipients OWNER/GM/HC/PM + zone managers; dedupeKey `person×date×threshold`; 🎂 severity escalating.
- **Gamification:** points, 8 badges, leaderboard, awards with reasons; Award log.
- **Briefing (صبح‌نامه):** daily snapshot generation + print for morning meeting.

### 5.6 Science & Research (brand differentiators)
- **Science Toolkit:** ABC analysis, SPLH, cycle-count planner, waste logging (WasteLog), margin tools — each tool carries its academic «چرا؟» explainer (`SciExplain` component).
- **Research Center (مرکز پژوهش):** curated retail-science library (Underhill, ABC/VED, FEFO, SRM scorecards, RFM) with click-through drill-downs into live platform data.
- **Demo Studio:** sandbox company creation for sales demos (isolated DB template, virtualized demo data, guided tour `SandboxTour`).
- **Guided Tour:** role-based intro scripts (`TourState` per user).

### 5.7 System
- Admin: users CRUD (PIN default ۱۲۳۴, colors, secondary roles), holidays (manual + internet sync), activity log with entity filters, read-only settings.
- RBAC: role builder, capability caps (`hasCap`), protected `Administrators` group, hidden admin flag; roleIds on User.
- Data Admin: DB reset, column mapping import, sandbox template regeneration (OWNER/ACC/IT only).
- Setup Wizard (`SetupWizard`) on first run with **hidden Hyper Zeytoon express lane** (staff shortcut); licensing admin (module purchase dates, trial flags, founder bypass).
- Calendar: navbar Jalali calendar widget with day events (holidays, cheque dues, deliveries, birthdays) clickable to per-day view; tri-calendar support (Jalali primary, Hijri Ghamari + Gregorian secondary with official-source corrections, 11px minimum font — never the old 6.5px); custom font support everywhere.
- Help & KB: FAQ, pipelines explained, contact card.
- PWA: manifest + `sw.js` — **stale-while-revalidate for static, NEVER cache-first for Turbopack dev chunks (`._.js`/`.map` never cached); bump CACHE version each release**; desktop notification opt-in.

---

## 6. Data Model (63 Prisma models — SQLite, JSON-string lists)

Core: **User**(role, secondaryRoles JSON, roleIds, zones JSON, color, pin, points, avatarUrl, avatarStyle, nickname, bio, phone, personnelId, uiPrefs, hidden) · Role · Personnel(birthday, manage…) · SalesRep(kind REP/DRIVER/…, providerId, providerHistory JSON, tags JSON — always `safeParse` before `.map`!) · Provider(companies JSON, manufacturerId, type DISTRIBUTOR/DIRECT/VISITOR) · Manufacturer(brands JSON) · Product(barcodes JSON, holooCode, prices, stock, reorderLevel, imageUrl, category, inHoloo, lastPriceCheck…) · Category(icon, color, imageUrl, sort, active) · Order/OrderItem(status pipeline, history JSON, corrections) · Cheque/Payment/PayLimit · Holiday(@unique date) · Task · SOP(steps JSON) · WallPost · Message · Note · Feedback · Award · ActivityLog(entity, entityId, detail) · Planogram(layout JSON) · RefillRequest · Customer/CustomerEvent/Campaign/Complaint/SaleEngagement · CustomerRequest(count, lastByName) · PreOrder(items JSON) · Zone(name @unique, type DECOMPRESSION/POWER_AISLE/PERISHABLE/DRY/CHECKOUT/BACKROOM, criticality, countFrequency, owner/backup, minStaff, color) · ZoneCount(forDate+zone+userId @unique, items JSON, blind fields, recheckCount, mismatchReason, confirmStatus…) · LeaveRequest(minutes, type, status, approver) · LaborHour · FloorPlan(name, floorIndex, width, height, shape JSON, unitLabel, archived) · FloorBlock(kind, x, y, w, h, rotation, label, zoneName, meta JSON) · Shift(weekday 0..6, start/end HH:MM, staffNeed, color, active, note) · ShiftAssignment(date, shiftId, personnelId, double, @@unique[date,shiftId,personnelId]) · SalaryProfile/SalaryMonth/SalaryDay(daily OT h/min JSON, warnings)/SalaryAdjust · KbArticle · TourState · BriefingSnapshot · NotifPref/NotifRule/NotifOutbox(visibleToUser filtering) · UrgentQuestion · Oversight · SyncLedger · WasteLog · StockCount · FlexRule · ArchiveBinder/ArchiveDoc/ArchiveDocItem/ArchiveCustody/DocEvent · DemoCompany.

**Seed data:** 16 Hyper Zeytoon staff (PIN ۱۲۳۴; جواد نوروزی OWNER, مینا لطفی GM, کیانوش صفاپور OM, مریم درویشی ACC, زهرا محمدی HC/CASHIER, فاطمه شریفی + سارا عرب‌نژاد CASHIER, حسن محمدی SK, هستی ایران‌نژاد SALES+RECEIVER, نگار یادگاری SALES, الهام سعدی + مینا غلامحسینی + سمیرا میرزایی + نگین تقی‌زاده + امیرعلی علیخانی MERCH, سارا نوروزی PM), 6 providers, 30+ products, holidays 1404/1405, orders across all pipeline stages, cheques, SOPs, tasks, wall posts, awards, the Hyper Zeytoon trapezoid floor plan (16 blocks).

---

## 7. API Surface (summary)

`auth(login/me/logout)` · `users(+[id])` · `roles` · `personnel` · `me/{avatar,profile,ui-prefs}` · `products(+[id], import)` · `categories(+[id])` · `providers(+[id])` · `manufacturers` · `sales-reps(+[id])` · `orders(+[id] action workflow)` · `receiving` inside orders · `verify` · `cheques(+[id] lifecycle)` · `payments` · `paylimits` · `payroll` (daily grid, batch, yearly, settings) · `shifts(+[id])` · `leaves` · `zones(+ sync-from-map POST)` · `zonecount` · `cyclecount` · `floorplans` · `planograms(+[id])` · `customers` · `customer-requests` · `preorders(+[id])` · `campaigns` · `complaints` · `engagements` · `price-check` · `reports` · `archive` (binders/docs/custody/events) · `dashboard` · `briefing` · `calendar-events` · `notifications` (engine + outbox) · `notif-rules` · `notif-prefs` · `tasks(+[id])` · `sops(+[id])` · `wall` · `messages` · `notes` · `feedback` · `urgent` · `gamification(+award)` · `waste` · `splh` · `science` · `research` · `holidays(+sync)` · `activity` · `admin` · `setup` · `tours` · `kb` · `extra-activities` · `import` · `demo`.

Conventions: JSON body, `{ok}` / `fail(msg, status)`, session via cookie or `X-Session-Token`, capability checks server-side (client role checks are cosmetic), `logActivity` on mutations, lists return `{<plural>: [...]}`, pagination via `take/skip` where needed.

---

## 8. Acceptance Checklist (run before any "done" claim)

1. `bun run lint` → 0 problems in `src/`; `tsc --noEmit` clean in `src/`.
2. Dev server on :3000 healthy; `dev.log` free of runtime errors; SW cache version bumped.
3. **Agent-browser walkthrough 1-by-1:** login (PIN ۱۲۳۴) → dashboard (both segments) → every sidebar cluster opens → every view's heading renders → no console/page errors → mobile 390px no horizontal scroll.
4. Feature-specific E2E for whatever was touched (e.g., payroll OT 8:00 saves with warning; zone sync idempotent; avatar persists; Escape closes any modal).
5. Persian digits/RTL intact; no blue/indigo; 44px targets; sticky footer law if a footer exists (`min-h-screen flex flex-col` + `mt-auto`).
6. `worklog.md` updated (append-only, `---`-delimited Task ID sections); git commit (+push for stable anchors).

---

## 9. Roadmap Ledger (explicitly accepted backlog — build as extensions)

- Supplier scorecard phase 2: **lead-time reliability + fill-rate per provider** (requires receiving timestamps attribution; current scorecard = stock-health only).
- WoW (week-over-week) compare card + MonthPlanner for dashboard; FEFO markdown suggestions panel; palette `norm()` for themes.
- Guided tour role scripts expansion; GuidedTour analytics.
- Leave approval coverage-floor automation from Shifts data.
- Holoo two-way sync beyond import (order push, payment reconciliation).
- Demand forecasting (moving average → Holt-Winters) for order suggestions; shrinkage (کسری) trend alerts tied to ZoneCount confirmations.
- Multi-store tenancy: per-store license + cross-store HQ rollups.
- Voice input for blind counting (ASR) and TTS morning briefing readout.

---

## 10. Known Historical Pitfalls (do not repeat)

1. **SW cache-first regression disaster (round 17):** dev chunks cached → users saw old bundles → "features reverted" complaints. Fixed by SWR + dev-chunk exclusion; keep the rule.
2. RTL `start-*` on canvas transform layers breaks LTR coordinate math (floor map once never painted).
3. JSON fields (tags, companies, items, steps, shape, meta) MUST pass through `safeParse` + `Array.isArray` guards before `.map` (the `rep.tags.map is not a function` crash).
4. Overtime must never hard-block (Article 59 = agreement basis, warning only).
5. Notification counts without `visibleToUser` leak other users' alerts.
6. Hijri dates from arithmetic conversion drift ~10 days — use official-source corrected tables.
7. `Dove` doesn't exist in installed lucide-react (use `Bird`); don't import non-existent icons (dead `ProfileModal.tsx` once did).
8. Prisma SQLite has no list primitives — JSON strings + safeParse, and never `String[]` in schema.
9. Never start a second dev server on another port; never `bun run build`.
10. Subagent file-ownership must be declared per task to avoid concurrent edits to the same view (see worklog round-17/18 ownership maps).
