# Academic Research Summary — Staff Performance & Date-Check Scheduling (applied 1405-07-27)

User requirement: validate/enrich our performance quantification + date-check scheduling
against scholarly body of work. Sources below found via web search (Google Scholar /
PMC / university pages). Findings applied to the platform are marked ✅.

## 1. Employee performance measurement in retail

**Sources**
- "Performance Management Based on Key Performance Indicators" (2025, PDF) — KPI
  measurement drives employee performance when indicators are few, weighted, and
  behavior-linked.
- Vuong (2022, cited 298×) — balanced scorecard & structured appraisals improve
  productivity; multi-source (manager + system) beats single-rater.
- KPI literature consensus: strong employee KPIs = goal completion rate, quality/error
  rate, customer satisfaction, peer collaboration.

**Applied in platform ✅**
- hr/performance composite: وظایف ۳۵٪ · چیدمان ۲۵٪ · چک‌لیست ۱۵٪ · حضور ۱۰٪ ·
  شمارش ۱۰٪ · تشویقی ۵٪ — multi-source (system data + manager reviews), weighted,
  graded A–D with actionable bands. Matches weighted-scorecard best practice.
- store/reviews 4-parameter shelf audit (FEFO dates / layout / cleanliness / labels)
  = "quality rate" KPI operationalized for merchandisers.
- ManagerReview (11 indicators from شرح وظایف doc) = structured appraisal for the
  evening manager — validated approach (multi-rater, defined rubric).

## 2. Cycle counting & date-check scheduling

**Sources**
- Penn State extension: modified ABC analysis minimizes cycle-counting effort —
  high-value items counted more often.
- Cycle counting best practice: count a slice of the store every day so the FULL
  store is verified within a fixed window (inventory accuracy ≈ 95%+).
- Kandasamy (2025, cited 17×): FEFO maximizes turnover & minimizes waste vs FIFO.

**Applied in platform ✅**
- date-checks: 28-day rotation cycle — each line gets a fixed daySlot (1..28);
  today's slot shown to the checker; full store verified monthly. This IS the
  cycle-counting model with a 28-day window.
- stockcount (انبارگردانی): per-product scheduled counts spread across the month —
  same model for inventory accuracy.
- Section review parameter #1 (dates/FEFO) enforces 临期-in-front discipline —
  the Kandasamy finding (FEFO reduces waste) is why it carries review weight.

## 3. Personnel hygiene & team review (GMP-style)

**Sources** — food-retail GMP/personal-hygiene checklists (uniform cleanliness,
hand hygiene, appearance, staff facilities) are standard in food-safety management
(Codex GHP; retail HACCP prerequisites).

**Applied in platform ✅ (this round)**
- NEW checklist template «بررسی تیم و بهداشت پرسنل» (EXEC=evening + GM=morning):
  presence & punctuality, uniform/appearance, personal hygiene, customer conduct,
  teamwork, staff-facility cleanliness.
- Existing tasks/attendance per-staff control (uniform/hygiene/behavior/quality
  per person per shift) = the detailed instrument; the new checklist is the daily
  summary nudge so it cannot be missed on Mollaie's checklists page.

## 4. Ordering UX (rebuild this round)

No academic source needed — user-specified flow (fuzzy search → stock + last-order
memory → quick add unit/carton → price correction → delivery date + cost estimate)
now implemented as the primary «سفارش جدید» tab; supplier-first flow kept as
optional header. Corrected buy price now propagates to product.lastBuyPrice at
receive time.
