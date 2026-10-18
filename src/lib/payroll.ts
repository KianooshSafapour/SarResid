/**
 * Payroll engine — SarResid live contract (verified against /tmp/live-api/payroll.json):
 *  - آزاده محمدی‌پور (base 200M, 240min overtime, 1 day absence):
 *      gross 286,890,919 / insurance 20,082,364 / tax 31,695,044 / net 235,113,511 ✓
 *  - جواد نوروزی بهجت (base 166,255,500, 0/0): 218,255,500 / 15,277,885 / 20,446,642 / 182,530,973 ✓
 */

export interface Statutory {
  year: number
  minWage: number
  housing: number
  food: number
  child: number
  seniorityDaily: number
  taxExempt: number
  taxBands: [number, number][] // [width, rate%]
}

export const STATUTORY_PRESETS: Record<number, Statutory> = {
  1404: {
    year: 1404,
    minWage: 132050450,
    housing: 9000000,
    food: 15000000,
    child: 7166666,
    seniorityDaily: 132050,
    taxExempt: 288000000,
    taxBands: [
      [100000000, 10],
      [100000000, 15],
      [100000000, 20],
      [100000000, 25],
      [100000000000, 30],
    ],
  },
  1405: {
    year: 1405,
    minWage: 166255500,
    housing: 30000000,
    food: 22000000,
    child: 16600000,
    seniorityDaily: 166667,
    taxExempt: 400000000,
    taxBands: [
      [100000000, 10],
      [100000000, 15],
      [100000000, 20],
      [100000000, 25],
      [100000000000, 30],
    ],
  },
}

/** JSON can't encode Infinity — the client sends null for the open-ended last band. */
export function normalizeStatutory(raw: Record<string, unknown>): Statutory {
  const year = Number(raw.year) || 1405
  const fallback = STATUTORY_PRESETS[year] ?? STATUTORY_PRESETS[1405]
  const bandsRaw = Array.isArray(raw.taxBands) ? raw.taxBands : fallback.taxBands
  const taxBands: [number, number][] = []
  for (let i = 0; i < bandsRaw.length; i++) {
    const b = bandsRaw[i]
    const width = Number(Array.isArray(b) ? b[0] : 100000000000)
    const rate = Number(Array.isArray(b) ? b[1] : 0)
    const isLast = i === bandsRaw.length - 1
    const w = !Number.isFinite(width) || width <= 0 ? (isLast ? 100000000000 : 0) : width
    taxBands.push([w, Math.max(0, Math.min(100, rate))])
  }
  if (taxBands.length === 0) taxBands.push(...fallback.taxBands)
  return {
    year,
    minWage: Number(raw.minWage) || fallback.minWage,
    housing: Number(raw.housing) || 0,
    food: Number(raw.food) || 0,
    child: Number(raw.child) || 0,
    seniorityDaily: Number(raw.seniorityDaily) || 0,
    taxExempt: Number(raw.taxExempt) || 0,
    taxBands,
  }
}

export interface PayrollProfileInput {
  baseSalary: number
  housingAllowance: number
  foodAllowance: number
  childAllowance: number
  children: number
  seniorityDaily: number
}

export interface PayrollInputs {
  overtimeMinutes: number
  absenceDays: number
  adjustment: number
}

export interface PayrollComputed {
  base: number
  housing: number
  food: number
  childTotal: number
  seniorityTotal: number
  monthly: number
  dailyWage: number
  hourlyWage: number
  overtimeRate: number
  overtimePay: number
  absenceDeduction: number
  adjustment: number
  gross: number
  insurance: number
  taxExemptMonthly: number
  taxableBase: number
  tax: number
  net: number
}

export function computePayroll(profile: PayrollProfileInput, inputs: PayrollInputs, statutory: Statutory): PayrollComputed {
  const base = profile.baseSalary
  const housing = profile.housingAllowance
  const food = profile.foodAllowance
  const childTotal = profile.childAllowance * profile.children
  const seniorityTotal = profile.seniorityDaily * 30
  const monthly = base + housing + food + childTotal + seniorityTotal
  const dailyWage = base / 30
  const hourlyWage = dailyWage / (220 / 30) // 220 monthly work hours ÷ 30 days (float-exact vs live capture)
  const overtimeRate = hourlyWage * 1.4
  const overtimePay = Math.round((overtimeRate * inputs.overtimeMinutes) / 60)
  const absenceDeduction = Math.round(((base + housing + food) / 30) * inputs.absenceDays)
  const adjustment = inputs.adjustment || 0
  const gross = monthly + overtimePay - absenceDeduction + adjustment
  const insurance = Math.round(gross * 0.07)
  const taxExemptMonthly = statutory.taxExempt / 12
  const taxableBase = Math.round(gross - taxExemptMonthly - insurance)
  let remaining = Math.max(0, taxableBase)
  let tax = 0
  for (const [width, rate] of statutory.taxBands) {
    if (remaining <= 0) break
    const take = Math.min(remaining, width)
    tax += (take * rate) / 100
    remaining -= take
  }
  tax = Math.round(tax)
  const net = gross - insurance - tax
  return {
    base,
    housing,
    food,
    childTotal,
    seniorityTotal,
    monthly,
    dailyWage,
    hourlyWage,
    overtimeRate,
    overtimePay,
    absenceDeduction,
    adjustment,
    gross,
    insurance,
    taxExemptMonthly,
    taxableBase,
    tax,
    net,
  }
}

export interface SavedPayroll {
  gross: number
  insurance: number
  tax: number
  net: number
  overtimeMinutes: number
  absenceDays: number
}

export function buildSaved(computed: PayrollComputed, inputs: PayrollInputs): SavedPayroll {
  return {
    gross: computed.gross,
    insurance: computed.insurance,
    tax: computed.tax,
    net: computed.net,
    overtimeMinutes: inputs.overtimeMinutes,
    absenceDays: inputs.absenceDays,
  }
}
