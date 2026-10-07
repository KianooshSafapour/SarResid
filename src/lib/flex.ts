/**
 * Cheque-day flexibility engine — treasury-management tolerance model.
 *
 * Academic grounding:
 *  - Treasury & working-capital management literature treats settlement dates as
 *    "soft constraints": a payment window (tolerance) around the contractual date
 *    is standard practice for cheque-based supply chains (cf. corporate treasury
 *    textbooks; Baum et al. on working-capital flexibility).
 *  - Resolution follows a specificity hierarchy (DAY > WEEK > MONTH > SEASON >
 *    YEAR > GLOBAL) — the same inheritance principle used in hierarchical
 *    classification systems (ISO 15489 for records; ISO 8601 for time intervals).
 *
 * Persian week starts Saturday (شنبه). Season keys: S1 بهار / S2 تابستان / S3 پاییز / S4 زمستان.
 */
import { toJalaliParts, jalaliToIso, addDaysIso, weekdayName } from './jalali'

export type FlexScope = 'GLOBAL' | 'YEAR' | 'SEASON' | 'MONTH' | 'WEEK' | 'DAY'

export type FlexRuleLite = {
  id: string
  scope: string
  label: string
  dateKey: string
  days: number
  note?: string
}

export const SCOPE_LABELS: Record<string, string> = {
  GLOBAL: 'سراسری',
  YEAR: 'سال',
  SEASON: 'فصل',
  MONTH: 'ماه',
  WEEK: 'هفته',
  DAY: 'روز',
}

export const SEASON_NAMES = ['بهار', 'تابستان', 'پاییز', 'زمستان']

/** season index 0..3 from jalali month */
export function seasonOf(jm: number): number {
  return Math.floor((jm - 1) / 3)
}

/** ISO date of the Saturday that starts the (Persian) week containing dateIso */
export function weekStartIso(dateIso: string): string {
  const d = new Date(dateIso + 'T12:00:00')
  // JS: 0=Sun..6=Sat → Persian weekday index: Sat=0, Sun=1, … Fri=6
  const pIdx = d.getDay() === 6 ? 0 : d.getDay() + 1
  return addDaysIso(-pIdx, dateIso)
}

/** machine keys for every scope that matches the given ISO date */
export function flexKeysFor(dateIso: string): Record<string, string> {
  const { jy, jm } = toJalaliParts(dateIso)
  return {
    DAY: dateIso,
    WEEK: weekStartIso(dateIso),
    MONTH: `${jy}-${String(jm).padStart(2, '0')}`,
    SEASON: `${jy}-S${seasonOf(jm) + 1}`,
    YEAR: String(jy),
    GLOBAL: '*',
  }
}

/** most specific rule wins: DAY > WEEK > MONTH > SEASON > YEAR > GLOBAL */
export function resolveFlex(rules: FlexRuleLite[], dateIso: string): { days: number; rule?: FlexRuleLite } {
  const keys = flexKeysFor(dateIso)
  const order: string[] = ['DAY', 'WEEK', 'MONTH', 'SEASON', 'YEAR', 'GLOBAL']
  for (const scope of order) {
    const hit = rules.find((r) => r.scope === scope && r.dateKey === keys[scope])
    if (hit) return { days: Math.max(0, Number(hit.days) || 0), rule: hit }
  }
  return { days: 0 }
}

/** friendly description of a rule's coverage in Persian */
export function flexScopeDesc(rule: FlexRuleLite): string {
  if (rule.scope === 'DAY') return 'یک روز مشخص'
  if (rule.scope === 'WEEK') return 'یک هفتهٔ مشخص'
  if (rule.scope === 'MONTH') return 'یک ماه مشخص'
  if (rule.scope === 'SEASON') return 'یک فصل'
  if (rule.scope === 'YEAR') return 'کل سال'
  return 'همهٔ زمان‌ها'
}

export type DueAlternative = {
  iso: string
  offset: number // signed day delta vs nominal due date
  actualDays: number // days from writtenAt
  weekday: string
  working: boolean // not Friday, not holiday
  holidayTitle?: string
  isFriday: boolean
}

/**
 * Candidate settlement dates within the flexibility window around the nominal due date.
 * Sorted: working days first (nearest to nominal), then non-working with reason.
 */
export function dueAlternatives(
  nominalDue: string,
  writtenAt: string,
  holidays: Map<string, string>,
  flexDays: number,
): DueAlternative[] {
  const out: DueAlternative[] = []
  if (flexDays <= 0) return out
  for (let off = -flexDays; off <= flexDays; off++) {
    if (off === 0) continue
    const iso = addDaysIso(off, nominalDue)
    const d = new Date(iso + 'T12:00:00')
    const isFriday = d.getDay() === 5
    const holidayTitle = holidays.get(iso)
    out.push({
      iso,
      offset: off,
      actualDays: Math.round(
        (d.getTime() - new Date(writtenAt + 'T12:00:00').getTime()) / 86400000,
      ),
      weekday: weekdayName(iso),
      working: !isFriday && !holidayTitle,
      holidayTitle: holidayTitle || undefined,
      isFriday,
    })
  }
  out.sort((a, b) => (a.working === b.working ? Math.abs(a.offset) - Math.abs(b.offset) : a.working ? -1 : 1))
  return out
}
