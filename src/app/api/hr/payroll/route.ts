import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'
import { dateToJalali, JALALI_MONTHS, toFaDigits } from '@/lib/jalali'
import { computePayroll, normalizeStatutory, buildSaved, type SavedPayroll, type Statutory } from '@/lib/payroll'
import { resolvePersonnelUserId } from '@/lib/hr-order'
import { getStatutory } from '@/lib/payroll-statutory'

export const dynamic = 'force-dynamic'

/** GET /api/hr/payroll?year=&month= → full payroll sheet
 *  GET /api/hr/payroll?userId= → سوابق فیش‌های یک پرسنل (همهٔ دوره‌ها — R4-6) */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'hr/payroll')
  if (!gate.ok) return fail(gate.deny, 403)

  const staffId = req.nextUrl.searchParams.get('userId') || ''
  if (staffId) {
    const staff = await staffRecords(staffId)
    if (!staff) return fail('کاربر مورد نظر یافت نشد', 404)
    return ok(staff)
  }

  const now = dateToJalali()
  const year = clampYear(req.nextUrl.searchParams.get('year')) || now.jy
  const month = clampMonth(req.nextUrl.searchParams.get('month')) || now.jm

  const statutory = await getStatutory(year)

  const [personnel, users, profiles, records] = await Promise.all([
    db.personnel.findMany(),
    db.user.findMany(),
    db.salaryProfile.findMany(),
    db.payrollRecord.findMany({ where: { year, month } }),
  ])
  const userById = new Map(users.map((u) => [u.id, u]))
  const profileByUser = new Map(profiles.map((p) => [p.userId, p]))
  const recordByUser = new Map(records.map((r) => [r.userId, r]))

  const usedIds = new Set<string>()
  const totals = { gross: 0, insurance: 0, tax: 0, net: 0 }

  const rows = personnel.map((p) => {
    const userId = resolvePersonnelUserId(p, userById, usedIds) ?? ''
    if (userId) usedIds.add(userId)
    const u = userId ? userById.get(userId) : undefined
    const sp = userId ? profileByUser.get(userId) : undefined
    const rec = userId ? recordByUser.get(userId) : undefined

    const profile = {
      baseSalary: sp?.baseSalary ?? statutory.minWage,
      housingAllowance: sp?.housingAllowance ?? statutory.housing,
      foodAllowance: sp?.foodAllowance ?? statutory.food,
      childAllowance: sp?.childAllowance ?? 0,
      children: sp?.children ?? 0,
      seniorityDaily: sp?.seniorityDaily ?? 0,
    }
    const inputs = {
      overtimeMinutes: rec?.overtimeMinutes ?? 0,
      absenceDays: rec?.absenceDays ?? 0,
      adjustment: rec?.adjustment ?? 0,
    }
    const computed = computePayroll(profile, inputs, statutory)
    totals.gross += computed.gross
    totals.insurance += computed.insurance
    totals.tax += computed.tax
    totals.net += computed.net

    const saved: SavedPayroll | null = rec
      ? safeJson<SavedPayroll | null>(rec.savedJson, null)
      : null

    return {
      userId: userId || null,
      fullName: p.fullName,
      role: u?.role ?? '',
      jobTitle: p.jobTitle,
      profile,
      saved,
      inputs,
      computed,
    }
  })

  return ok({
    year,
    month,
    monthLabel: `${JALALI_MONTHS[month - 1]} ${toFaDigits(year)}`,
    statutory,
    rows,
    totals,
  })
}

/** POST /api/hr/payroll {year, month, rows:[{userId,overtimeMinutes,absenceDays,adjustment}]} → {saved} */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'hr/payroll')
  if (!gate.ok) return fail(gate.deny, 403)

  const body = await req.json().catch(() => null)
  const year = clampYear(body?.year?.toString?.())
  const month = clampMonth(body?.month?.toString?.())
  if (!year || !month) return fail('دوره حقوق نامعتبر است')

  const rawRows = Array.isArray(body?.rows) ? body.rows : []
  if (rawRows.length === 0) return fail('ردیفی برای ذخیره وجود ندارد')

  const statutory = await getStatutory(year)
  const profiles = await db.salaryProfile.findMany()
  const profileByUser = new Map(profiles.map((p) => [p.userId, p]))

  let saved = 0
  for (const r of rawRows) {
    const userId = typeof r?.userId === 'string' ? r.userId : ''
    if (!userId) continue
    const sp = profileByUser.get(userId)
    const profile = {
      baseSalary: sp?.baseSalary ?? statutory.minWage,
      housingAllowance: sp?.housingAllowance ?? statutory.housing,
      foodAllowance: sp?.foodAllowance ?? statutory.food,
      childAllowance: sp?.childAllowance ?? 0,
      children: sp?.children ?? 0,
      seniorityDaily: sp?.seniorityDaily ?? 0,
    }
    const inputs = {
      overtimeMinutes: Math.max(0, Math.round(Number(r.overtimeMinutes) || 0)),
      absenceDays: Math.max(0, Math.round(Number(r.absenceDays) || 0)),
      adjustment: Number(r.adjustment) || 0,
    }
    const computed = computePayroll(profile, inputs, statutory)
    await db.payrollRecord.upsert({
      where: { userId_year_month: { userId, year, month } },
      create: { userId, year, month, ...inputs, savedJson: JSON.stringify(buildSaved(computed, inputs)) },
      update: { ...inputs, savedJson: JSON.stringify(buildSaved(computed, inputs)) },
    })
    saved += 1
  }

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'payroll.save',
    actionLabel: 'حقوق',
    category: 'payroll',
    detail: `ذخیره فیش‌های ${JALALI_MONTHS[month - 1]} ${toFaDigits(year)} برای ${saved} نفر`,
  })

  return ok({ saved })
}

function clampYear(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 1300 || n > 1500) return null
  return Math.round(n)
}

function clampMonth(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 1 || n > 12) return null
  return Math.round(n)
}

/** سوابق فیش‌های یک پرسنل — همهٔ دوره‌ها با پروفایل و محاسبات (R4-6) */
async function staffRecords(staffId: string) {
  const [u, p, sp, records] = await Promise.all([
    db.user.findUnique({ where: { id: staffId } }),
    db.personnel.findUnique({ where: { userId: staffId } }),
    db.salaryProfile.findUnique({ where: { userId: staffId } }),
    db.payrollRecord.findMany({ where: { userId: staffId }, orderBy: [{ year: 'desc' }, { month: 'desc' }] }),
  ])
  if (!u) return null

  const years = [...new Set(records.map((r) => r.year))]
  const statutoryByYear = new Map<number, Statutory>()
  for (const y of years) statutoryByYear.set(y, await getStatutory(y))

  const person = p ?? null
  const items = records.map((r) => {
    const statutory = statutoryByYear.get(r.year)
    if (!statutory) return null
    const profile = {
      baseSalary: sp?.baseSalary ?? statutory.minWage,
      housingAllowance: sp?.housingAllowance ?? statutory.housing,
      foodAllowance: sp?.foodAllowance ?? statutory.food,
      childAllowance: sp?.childAllowance ?? 0,
      children: sp?.children ?? 0,
      seniorityDaily: sp?.seniorityDaily ?? 0,
    }
    const inputs = {
      overtimeMinutes: r.overtimeMinutes,
      absenceDays: r.absenceDays,
      adjustment: r.adjustment,
    }
    const computed = computePayroll(profile, inputs, statutory)
    return {
      id: r.id,
      userId: r.userId,
      year: r.year,
      month: r.month,
      monthLabel: `${JALALI_MONTHS[r.month - 1]} ${toFaDigits(r.year)}`,
      inputs,
      profile,
      computed,
      saved: safeJson<SavedPayroll | null>(r.savedJson, null),
    }
  })

  return {
    userId: staffId,
    fullName: person?.fullName ?? u.fullName,
    jobTitle: person?.jobTitle ?? null,
    nationalId: person?.nationalId ?? null,
    department: person?.department ?? null,
    salaryProfile: sp
      ? {
          baseSalary: sp.baseSalary,
          housingAllowance: sp.housingAllowance,
          foodAllowance: sp.foodAllowance,
          childAllowance: sp.childAllowance,
          children: sp.children,
          seniorityDaily: sp.seniorityDaily,
        }
      : null,
    items: items.filter((x): x is NonNullable<typeof x> => x !== null),
  }
}
