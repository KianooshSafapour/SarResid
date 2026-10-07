import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { canViewApi, hasCap, guardCap } from '@/lib/rbac'
import {
  computeMonth, computeYearly, DEFAULT_POLICY, DEFAULT_PROFILE_1404, DEFAULT_PROFILE_1405, STATUTORY_1404, STATUTORY_1405,
  defaultProfileFor, getStatutory, jMonthDays, type AdjustKind, type PayrollPolicy, type SalaryProfileLike, type TaxConfig,
} from '@/lib/salary-engine'
import { faNum, isoDay, jalaliToIso, toJalaliParts, todayIso } from '@/lib/jalali'

/* ─────────────────────────────────────────────────────────────────────────────
 *  حقوق و دستمزد — API واحد (مطابق قانون کار ایران ۱۴۰۴)
 *  GET  ?jy=1405&jm=6    ← دادهٔ کامل ماه برای مسیَرهای مجاز؛ کاربر عادی فقط «فیش من»
 *  POST body.action:
 *    set-day | set-adjust | delete-adjust | update-profile | confirm | pay |
 *    reopen | set-tax | set-defaults | yearly
 *  همهٔ مبالغ ریال. منبع حقیقت: SalaryDay + SalaryAdjust → کش در SalaryMonth.
 * ────────────────────────────────────────────────────────────────────────────*/

const S_DEFAULTS = 'payroll.defaults'
const S_POLICY = 'payroll.policy'
const S_TAX = 'payroll.tax'
const S_YEAR = 'payroll.year' // سال حقوقی سامانه (پیش‌فرض ۱۴۰۵ — round-16)
const S_POSITION_BASE = 'payroll.positionBase' // حقوق پایهٔ هر جایگاه شغلی {jobTitle: rial}
const S_STATUTORY = 'payroll.statutory' // 17-E: اصلاح دستی جدول قانونی هر سال { [year]: {field: rial} } — admin می‌تواند هر عدد مصوب را اصلاح کند

/** فیلدهای عددی جدول قانونی که اصلاح دستی مجازند (ریال) */
const STATUTORY_FIELDS = [
  'dailyMinWage', 'monthlyMinWage', 'hourlyMinWage', 'housing', 'foodAllowance',
  'maritalAllowance', 'childAllowance', 'seniorityDaily', 'newYearBonusMin', 'newYearBonusMax',
] as const

type StatutoryRow = SettingRow

/** نقشهٔ اصلاحات دستی جدول قانونی — { "1405": { monthlyMinWage: … } } */
function loadStatutoryOvr(rows: SettingRow[]): Record<string, Record<string, number>> {
  const raw = rows.find((r) => r.key === S_STATUTORY)
  const map = raw ? safeParse<Record<string, Record<string, number>>>(raw.value, {}) : {}
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {}
}

/** جدول قانونی سال + اصلاحات دستی مدیر (هر فیلد عددی معتبر نامنفی override می‌شود) */
function statutoryOf(rows: StatutoryRow[], year: number) {
  const base = getStatutory(year)
  const ovr = loadStatutoryOvr(rows)[String(year)] || {}
  const merged: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(ovr)) {
    if (!(STATUTORY_FIELDS as readonly string[]).includes(k)) continue
    const n = Number(v)
    if (isFinite(n) && n >= 0) merged[k] = n
  }
  return merged as unknown as ReturnType<typeof getStatutory>
}

function payrollYear(rows: SettingRow[]): number {
  const raw = rows.find((r) => r.key === S_YEAR)
  const y = Math.round(Number(raw?.value))
  return y >= 1380 && y <= 1460 ? y : 1405
}

const ADJUST_KINDS: AdjustKind[] = ['REWARD', 'FINE', 'COMMISSION', 'ADVANCE', 'OTHER']
const ABSENCES = ['NONE', 'FULL', 'HALF']

type SettingRow = { key: string; value: string }

function loadTax(rows: SettingRow[], year = 1405): TaxConfig {
  const statutory = getStatutory(year).tax as unknown as TaxConfig
  const raw = rows.find((r) => r.key === S_TAX)
  const t = raw ? safeParse<TaxConfig>(raw.value, statutory) : statutory
  const exempt = Number(t?.exempt)
  const bands = Array.isArray(t?.bands) ? t.bands : []
  if (!isFinite(exempt) || exempt < 0 || !bands.length) return statutory
  const clean = bands
    .map((b) => ({ upTo: b.upTo == null ? null : Number(b.upTo), rate: Number(b.rate) }))
    .filter((b) => isFinite(b.rate) && b.rate > 0 && b.rate <= 1 && (b.upTo == null || b.upTo >= 0))
  return clean.length ? { exempt, bands: clean } : statutory
}

function loadPolicy(rows: SettingRow[]): PayrollPolicy {
  const raw = rows.find((r) => r.key === S_POLICY)
  const p = raw ? safeParse<Partial<PayrollPolicy>>(raw.value, {}) : {}
  const num = (v: unknown, d: number) => {
    const n = Number(v)
    return isFinite(n) && n >= 0 ? n : d
  }
  return {
    otRate: num(p.otRate, DEFAULT_POLICY.otRate),
    nightRate: num(p.nightRate, DEFAULT_POLICY.nightRate),
    holidayOtRate: num(p.holidayOtRate, DEFAULT_POLICY.holidayOtRate),
    otCapMinutes: num(p.otCapMinutes, DEFAULT_POLICY.otCapMinutes),
    insuranceRate: num(p.insuranceRate, DEFAULT_POLICY.insuranceRate),
    employerRate: num(p.employerRate, DEFAULT_POLICY.employerRate),
    insuranceIncludesOT: !!p.insuranceIncludesOT,
    fineCapPct: num(p.fineCapPct, DEFAULT_POLICY.fineCapPct),
    roundTo: num(p.roundTo, DEFAULT_POLICY.roundTo),
  }
}

/** حقوق پایهٔ هر جایگاه شغلی — {"صندوقدار": ۱۷۵٬۰۰۰٬۰۰۰, …} (ریال) */
function loadPositionBase(rows: SettingRow[]): Record<string, number> {
  const raw = rows.find((r) => r.key === S_POSITION_BASE)
  const map = raw ? safeParse<Record<string, number>>(raw.value, {}) : {}
  const clean: Record<string, number> = {}
  for (const [k, v] of Object.entries(map || {})) {
    const n = Number(v)
    if (k.trim() && isFinite(n) && n >= 0) clean[k.trim()] = n
  }
  return clean
}

type Defaults = Partial<typeof DEFAULT_PROFILE_1404>
function loadDefaults(rows: SettingRow[]): Defaults {
  const raw = rows.find((r) => r.key === S_DEFAULTS)
  return raw ? safeParse<Defaults>(raw.value, {}) : {}
}

/** عدد معتبر نامنفی؛ NaN/منفی/بی‌نهایت/boolean → null */
function reqNum(v: unknown, opts: { int?: boolean; max?: number } = {}): number | null {
  if (typeof v === 'boolean' || v == null || v === '') return null
  const n = Number(v)
  if (!isFinite(n) || isNaN(n) || n < 0) return null
  if (opts.int && Math.round(n) !== n) return null
  return opts.max != null && n > opts.max ? null : n
}

/** سال/ماه شمسی و روزهای ماه از تاریخ میلادی iso */
function monthKeyOf(iso: string): { jy: number; jm: number; md: number } {
  const { jy, jm } = toJalaliParts(iso)
  return { jy, jm, md: jMonthDays(jy, jm) }
}

const EMPLOYER = 'هایپر زیتون'

function personnelNo(id: string): string {
  return `HZ-${id.slice(-6).toUpperCase()}`
}

/* ── پروفایل: ساخت خودکار از Personnel.baseSalary + پیش‌فرض‌های سامانه ── */

type PersonnelRow = {
  id: string; firstName: string; lastName: string; nationalId: string; jobTitle: string
  bankCard: string; shaba: string; baseSalary: number; hireDate: string
  children: string; active: boolean
}

async function ensureProfile(p: PersonnelRow, defaults: Defaults, positionBase: Record<string, number> = {}) {
  const existing = await db.salaryProfile.findUnique({ where: { personnelId: p.id } })
  if (existing) return existing
  const children = safeParse<Array<unknown>>(p.children, [])
  // اولویت پایه: پرونده ← جدول جایگاه شغلی ← صفر (مدیر بعداً تعیین می‌کند)
  const resolvedBase = p.baseSalary || positionBase[p.jobTitle?.trim()] || 0
  const created = await db.salaryProfile.upsert({
    where: { personnelId: p.id },
    update: {},
    create: {
      personnelId: p.id,
      baseSalary: resolvedBase,
      housing: Number(defaults.housing ?? DEFAULT_PROFILE_1405.housing),
      foodAllowance: Number(defaults.foodAllowance ?? DEFAULT_PROFILE_1405.foodAllowance),
      maritalAllowance: Number(defaults.maritalAllowance ?? DEFAULT_PROFILE_1405.maritalAllowance),
      // شرط ۷۲۰ روز سابقهٔ بیمه احراز دستی است — بدون فرزندِ ثبت‌شده حق اولاد صفر ذخیره می‌شود
      childAllowance: children.length > 0 ? Number(defaults.childAllowance ?? DEFAULT_PROFILE_1405.childAllowance) : 0,
      childCount: Math.min(15, children.length),
      seniorityBase: Number(defaults.seniorityBase ?? DEFAULT_PROFILE_1405.seniorityBase),
      overtimeDivisor: Number(defaults.overtimeDivisor ?? DEFAULT_PROFILE_1405.overtimeDivisor),
    },
  })
  return created
}

function toEngineProfile(pr: { baseSalary: number; housing: number; foodAllowance: number; maritalAllowance: number; childAllowance: number; childCount: number; seniorityBase: number; overtimeDivisor: number; includeBenefitsInOT: boolean }): SalaryProfileLike {
  return {
    baseSalary: pr.baseSalary, housing: pr.housing, foodAllowance: pr.foodAllowance,
    maritalAllowance: pr.maritalAllowance, childAllowance: pr.childAllowance,
    childCount: pr.childCount, seniorityBase: pr.seniorityBase,
    overtimeDivisor: pr.overtimeDivisor, includeBenefitsInOT: pr.includeBenefitsInOT,
  }
}

/* ── نوع روز: جمعه / تعطیل رسمی / مرخصی تأییدشده / کار ── */

async function computeDayKinds(personnelId: string, monthStartIso: string, monthEndIso: string, daysIso: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const [holidays, users, leaves] = await Promise.all([
    db.holiday.findMany({ where: { date: { gte: monthStartIso, lte: monthEndIso }, kind: 'HOLIDAY' }, select: { date: true } }),
    db.user.findMany({ where: { personnelId }, select: { id: true } }),
    db.leaveRequest.findMany({
      where: { status: 'APPROVED', fromDate: { lte: monthEndIso }, toDate: { gte: monthStartIso } },
      select: { userId: true, fromDate: true, toDate: true },
    }),
  ])
  const holidaySet = new Set(holidays.map((h) => h.date.slice(0, 10)))
  const userIds = new Set(users.map((u) => u.id))
  const leaveDates = new Set<string>()
  for (const l of leaves) {
    if (!userIds.has(l.userId)) continue
    for (const d of daysIso) {
      if (d >= l.fromDate.slice(0, 10) && d <= l.toDate.slice(0, 10)) leaveDates.add(d)
    }
  }
  for (const d of daysIso) {
    const wd = new Date(d + 'T12:00:00').getDay()
    map.set(d, holidaySet.has(d) ? 'HOLIDAY' : wd === 5 ? 'FRIDAY' : leaveDates.has(d) ? 'LEAVE' : 'WORK')
  }
  return map
}

/* ── ردیف ماه (ساخت تنبل) + محاسبه و کش ── */

async function ensureMonthRow(personnelId: string, personnelName: string, jy: number, jm: number) {
  const found = await db.salaryMonth.findUnique({ where: { personnelId_jy_jm: { personnelId, jy, jm } } })
  if (found) return found
  try {
    return await db.salaryMonth.create({ data: { personnelId, personnelName, jy, jm } })
  } catch {
    const again = await db.salaryMonth.findUnique({ where: { personnelId_jy_jm: { personnelId, jy, jm } } })
    if (!again) throw new Error('ساخت ردیف ماه ناموفق بود')
    return again
  }
}

async function monthRange(jy: number, jm: number) {
  const md = jMonthDays(jy, jm)
  return { md, start: jalaliToIso(jy, jm, 1), end: jalaliToIso(jy, jm, md) }
}

/** محاسبهٔ مجدد جمع‌های ماه و ذخیره در SalaryMonth (پس از هر نوشتن) */
async function recomputeMonth(personnelId: string, personnelName: string, jy: number, jm: number, profile: SalaryProfileLike, policy: PayrollPolicy, tax: TaxConfig, personnelActive: boolean, minMonthlyWage?: number) {
  const month = await ensureMonthRow(personnelId, personnelName, jy, jm)
  const [days, adjusts] = await Promise.all([
    db.salaryDay.findMany({ where: { monthId: month.id }, orderBy: { forDate: 'asc' } }),
    db.salaryAdjust.findMany({ where: { monthId: month.id }, orderBy: { createdAt: 'asc' } }),
  ])
  const engineDays = days.map((d) => ({ forDate: d.forDate, otMinutes: d.otMinutes, holidayOtMinutes: d.holidayOtMinutes, nightMinutes: d.nightMinutes, absence: d.absence as 'NONE', dayKind: d.dayKind as 'WORK', note: d.note }))
  const engineAdjusts = adjusts.map((a) => ({ kind: a.kind as AdjustKind, amount: a.amount, ownerOnly: a.ownerOnly }))
  const computed = computeMonth({ profile, days: engineDays, adjusts: engineAdjusts, monthDays: jMonthDays(jy, jm), tax, policy, jy, jm, statutoryYear: jy, personnelActive, minMonthlyWage })
  const updated = await db.salaryMonth.update({
    where: { id: month.id },
    data: {
      workDays: computed.workDays, overtimeHours: computed.otHours, holidayOtHours: computed.holidayOtHours,
      nightHours: computed.nightHours, gross: computed.gross, insurance: computed.insurance,
      tax: computed.tax, otherDeductions: computed.otherDeductions, net: computed.net,
      seniorityAccrual: computed.seniorityAccrual,
    },
  })
  return { month: updated, days, adjusts, computed }
}

function engineDaysOf(days: Array<{ forDate: string; otMinutes: number; holidayOtMinutes: number; nightMinutes: number; absence: string; dayKind: string; note: string }>) {
  return days.map((d) => ({ forDate: d.forDate, otMinutes: d.otMinutes, holidayOtMinutes: d.holidayOtMinutes, nightMinutes: d.nightMinutes, absence: d.absence as 'NONE', dayKind: d.dayKind as 'WORK', note: d.note }))
}
function engineAdjustsOf(list: Array<{ kind: string; amount: number; ownerOnly?: boolean }>) {
  return list.map((a) => ({ kind: a.kind as AdjustKind, amount: a.amount, ownerOnly: a.ownerOnly }))
}

/* ═══════════════════════════ GET ═══════════════════════════ */

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)

  const url = new URL(req.url)
  const cur = monthKeyOf(todayIso())
  const jy = Math.round(Number(url.searchParams.get('jy')) || cur.jy)
  const jm = Math.round(Number(url.searchParams.get('jm')) || cur.jm)
  if (!(jm >= 1 && jm <= 12) || !(jy >= 1380 && jy <= 1460)) return fail('ماه شمسی نامعتبر است')

  const [isManager, isViewer, canSettings] = await Promise.all([
    hasCap(me, 'payroll.manage'),
    canViewApi(me, 'payroll'),
    hasCap(me, 'settings.manage'),
  ])
  const isOwner = me.role === 'OWNER' || me.role === 'ADMIN' // دیدن/تعیین پورسانت — فقط مالک و روت
  const meRow = await db.user.findUnique({ where: { id: me.id }, select: { personnelId: true } })
  const selfPersonnelId = meRow?.personnelId || ''

  const rows = await db.setting.findMany({ where: { key: { in: [S_DEFAULTS, S_POLICY, S_TAX, S_YEAR, S_POSITION_BASE, S_STATUTORY] } } })
  const defaults = loadDefaults(rows)
  const policy = loadPolicy(rows)
  const py = payrollYear(rows)
  const tax = loadTax(rows, py)
  const positionBase = loadPositionBase(rows)

  if (!isViewer && !selfPersonnelId) {
    return json({
      jy, jm, isManager: false, isOwner: false, self: null, personnel: [],
      defaults: { ...defaultProfileFor(py), ...defaults }, policy, tax, statutory: statutoryOf(rows, py), statutoryOvr: loadStatutoryOvr(rows)[String(py)] || {}, salaryYear: py, positionBase,
      viewer: { isManager: false, isOwner: false, canCommission: false, canSettings },
      hint: 'به پروندهٔ پرسنلی متصل نیستید — برای مشاهدهٔ فیش خود با منابع انسانی تماس بگیرید',
    })
  }

  const { md, start, end } = await monthRange(jy, jm)
  const daysIso: string[] = []
  for (let i = 0; i < md; i++) daysIso.push(jalaliToIso(jy, jm, i + 1))

  const all = await db.personnel.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }] })
  const scope = isViewer ? all : all.filter((p) => p.id === selfPersonnelId)

  const out: unknown[] = []
  for (const p of scope) {
    const profileRow = await ensureProfile(p, defaults, positionBase)
    const profile = toEngineProfile(profileRow)
    const name = `${p.firstName} ${p.lastName}`.trim()
    const { month, days, adjusts, computed } = await recomputeMonth(p.id, name, jy, jm, profile, policy, tax, p.active, statutoryOf(rows, jy).monthlyMinWage)

    const visibleAdjusts = isOwner ? adjusts : adjusts.filter((a) => !a.ownerOnly)
    const hiddenCount = adjusts.length - visibleAdjusts.length

    // غیرمالک: محاسبهٔ نمایشی بدون اقلام پورسانت تا مبلغ محرمانه نشت نکند
    const computedShown = hiddenCount === 0 ? computed : computeMonth({
      profile, days: engineDaysOf(days), adjusts: engineAdjustsOf(visibleAdjusts),
      monthDays: md, tax, policy, jy, jm, statutoryYear: jy, personnelActive: p.active,
    })

    out.push({
      id: p.id,
      name,
      personnelNo: personnelNo(p.id),
      jobTitle: p.jobTitle,
      nationalId: p.nationalId,
      bankCard: p.bankCard,
      shaba: p.shaba,
      hireDate: p.hireDate, // شمسی
      active: p.active,
      childrenCount: safeParse<unknown[]>(p.children, []).length,
      profile,
      month: {
        id: month.id, status: month.status, payslipNo: month.payslipNo,
        confirmedByName: month.confirmedByName, confirmedAt: month.confirmedAt, paidAt: month.paidAt,
        note: month.note,
        gross: hiddenCount === 0 ? month.gross : computedShown.gross,
        net: hiddenCount === 0 ? month.net : computedShown.net,
      },
      days,
      adjusts: visibleAdjusts,
      hiddenCommissionCount: hiddenCount,
      computed: computedShown,
    })
  }

  return json({
    jy, jm, monthDays: md, employer: EMPLOYER,
    isManager, isOwner,
    self: selfPersonnelId ? { personnelId: selfPersonnelId } : null,
    defaults: { ...defaultProfileFor(py), ...defaults },
    policy, tax, statutory: statutoryOf(rows, py), statutoryOvr: loadStatutoryOvr(rows)[String(py)] || {}, salaryYear: py, positionBase,
    viewer: { isManager, isOwner, canCommission: isOwner, canSettings },
    personnel: out,
  })
}

/* ═══════════════════════════ POST ═══════════════════════════ */

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const action = String(body.action || '')
  const isOwner = me.role === 'OWNER' || me.role === 'ADMIN'

  /* ── set-tax — جدول مالیات (settings.manage یا نقش اجرایی) ── */
  if (action === 'set-tax') {
    const g = await guardCap(me, 'settings.manage')
    if (g) return fail(g, 403)
    const exempt = reqNum(body.exempt, { max: 1e15 })
    if (exempt == null) return fail('مبلغ معافیت مالیات نامعتبر است (عدد نامنفی ریال)')
    const bandsRaw = Array.isArray(body.bands) ? body.bands : []
    if (!bandsRaw.length) return fail('حداقل یک پلهٔ نرخ مالیات لازم است')
    const bands: TaxConfig['bands'] = []
    for (const b of bandsRaw as Array<{ upTo?: unknown; rate?: unknown }>) {
      const rate = Number(b.rate)
      if (!isFinite(rate) || rate <= 0 || rate > 1) return fail('نرخ هر پله باید بین ۰ و ۱۰۰ درصد باشد')
      const upTo = b.upTo == null || b.upTo === '' ? null : reqNum(b.upTo, { max: 1e15 })
      if (b.upTo != null && b.upTo !== '' && upTo == null) return fail('سقف پلهٔ مالیاتی نامعتبر است')
      bands.push({ upTo, rate })
    }
    const payload = { exempt, bands }
    await db.setting.upsert({
      where: { key: S_TAX },
      update: { value: JSON.stringify(payload) },
      create: { key: S_TAX, value: JSON.stringify(payload) },
    })
    await logActivity(me, 'به‌روزرسانی جدول مالیات حقوق', 'payroll', S_TAX, JSON.stringify(payload))
    return json({ ok: true, tax: payload })
  }

  /* ── set-defaults — پیش‌فرض‌های پروفایل + سیاست (settings.manage یا نقش اجرایی) ── */
  if (action === 'set-defaults') {
    const g = await guardCap(me, 'settings.manage')
    if (g) return fail(g, 403)
    const rows = await db.setting.findMany({ where: { key: { in: [S_DEFAULTS, S_POLICY, S_STATUTORY] } } })
    const nextDefaults: Record<string, number | boolean> = { ...loadDefaults(rows) }
    for (const f of ['baseSalary', 'housing', 'foodAllowance', 'maritalAllowance', 'childAllowance', 'seniorityBase'] as const) {
      if (body[f] !== undefined) {
        const n = reqNum(body[f], { max: 1e15 })
        if (n == null) return fail('مقادیر عددی باید نامنفی و معتبر باشند')
        nextDefaults[f] = n
      }
    }
    if (body.overtimeDivisor !== undefined) {
      const n = Number(body.overtimeDivisor)
      if (!isFinite(n) || n < 1 || n > 400) return fail('مخرج مزد ساعتی باید عددی بین ۱ تا ۴۰۰ باشد')
      nextDefaults.overtimeDivisor = n
    }
    await db.setting.upsert({
      where: { key: S_DEFAULTS },
      update: { value: JSON.stringify(nextDefaults) },
      create: { key: S_DEFAULTS, value: JSON.stringify(nextDefaults) },
    })

    const nextPolicy: Record<string, number | boolean> = { ...loadPolicy(rows) }
    let touchedPolicy = false
    for (const f of ['otRate', 'nightRate', 'holidayOtRate', 'otCapMinutes', 'insuranceRate', 'employerRate', 'fineCapPct', 'roundTo'] as const) {
      if (body[f] !== undefined) {
        const n = reqNum(body[f], { max: 1e9 })
        if (n == null) return fail('مقادیر سیاست باید نامنفی و معتبر باشند')
        nextPolicy[f] = n
        touchedPolicy = true
      }
    }
    if (body.insuranceIncludesOT !== undefined) {
      nextPolicy.insuranceIncludesOT = !!body.insuranceIncludesOT
      touchedPolicy = true
    }
    if (touchedPolicy) {
      await db.setting.upsert({
        where: { key: S_POLICY },
        update: { value: JSON.stringify(nextPolicy) },
        create: { key: S_POLICY, value: JSON.stringify(nextPolicy) },
      })
    }
    // سال حقوقی + جدول پایهٔ جایگاه‌های شغلی (round-16)
    let salaryYear = payrollYear(rows)
    if (body.salaryYear !== undefined) {
      const y = Math.round(Number(body.salaryYear))
      if (!(y >= 1380 && y <= 1460)) return fail('سال حقوقی باید بین ۱۳۸۰ تا ۱۴۶۰ باشد')
      salaryYear = y
      await db.setting.upsert({
        where: { key: S_YEAR },
        update: { value: String(y) },
        create: { key: S_YEAR, value: String(y) },
      })
    }

    // 17-E — اصلاح دستی جدول قانونی (هر فیلد ریال) یا بازگشت به مقادیر مصوب
    // body.statutory = { dailyMinWage?, monthlyMinWage?, … } (ریال) | null (بازنشانی) · body.statutoryReset = true
    const statOvrAll = loadStatutoryOvr(rows)
    let touchedStatutory = false
    if (body.statutoryReset === true || body.statutory === null) {
      if (statOvrAll[String(salaryYear)]) {
        delete statOvrAll[String(salaryYear)]
        touchedStatutory = true
      }
    } else if (body.statutory !== undefined) {
      if (typeof body.statutory !== 'object' || Array.isArray(body.statutory)) return fail('جدول قانونی نامعتبر است')
      const incoming = body.statutory as Record<string, unknown>
      const cur = { ...(statOvrAll[String(salaryYear)] || {}) }
      for (const f of STATUTORY_FIELDS) {
        if (incoming[f] === undefined) continue
        const n = reqNum(incoming[f], { max: 1e15 })
        if (n == null) return fail('مقادیر جدول قانونی باید اعداد نامنفی و معتبر باشند (ریال)')
        cur[f] = n
      }
      statOvrAll[String(salaryYear)] = cur
      touchedStatutory = true
    }
    if (touchedStatutory) {
      await db.setting.upsert({
        where: { key: S_STATUTORY },
        update: { value: JSON.stringify(statOvrAll) },
        create: { key: S_STATUTORY, value: JSON.stringify(statOvrAll) },
      })
    }

    if (body.positionBase !== undefined) {
      if (typeof body.positionBase !== 'object' || body.positionBase == null || Array.isArray(body.positionBase)) return fail('جدول پایهٔ جایگاه‌ها نامعتبر است')
      const clean = loadPositionBase([{ key: 'x', value: JSON.stringify(body.positionBase) }])
      await db.setting.upsert({
        where: { key: S_POSITION_BASE },
        update: { value: JSON.stringify(clean) },
        create: { key: S_POSITION_BASE, value: JSON.stringify(clean) },
      })
    }
    await logActivity(me, 'به‌روزرسانی تنظیمات حقوق و دستمزد', 'payroll', S_DEFAULTS, JSON.stringify({ defaults: nextDefaults, policy: touchedPolicy ? nextPolicy : undefined, salaryYear, positionBase: body.positionBase !== undefined ? 'updated' : undefined, statutory: touchedStatutory ? 'updated' : undefined }))
    const rows2 = await db.setting.findMany({ where: { key: { in: [S_DEFAULTS, S_POLICY, S_TAX, S_YEAR, S_POSITION_BASE, S_STATUTORY] } } })
    return json({
      ok: true, defaults: { ...defaultProfileFor(salaryYear), ...loadDefaults(rows2) },
      policy: loadPolicy(rows2), tax: loadTax(rows2, salaryYear), statutory: statutoryOf(rows2, salaryYear),
      statutoryOvr: loadStatutoryOvr(rows2)[String(salaryYear)] || {},
      salaryYear, positionBase: loadPositionBase(rows2),
    })
  }

  /* ── set-position-base — تعیین/ویرایش پایهٔ یک جایگاه شغلی (round-16) ── */
  if (action === 'set-position-base') {
    const g = await guardCap(me, 'settings.manage')
    if (g) return fail(g, 403)
    const jobTitle = String(body.jobTitle || '').trim()
    if (!jobTitle || jobTitle.length > 80) return fail('عنوان جایگاه شغلی نامعتبر است')
    const amount = reqNum(body.baseSalary, { max: 1e15 })
    if (amount == null) return fail('مبلغ پایه نامعتبر است (عدد نامنفی ریال)')
    const rows = await db.setting.findMany({ where: { key: { in: [S_POSITION_BASE] } } })
    const map = loadPositionBase(rows)
    if (amount === 0) delete map[jobTitle]
    else map[jobTitle] = amount
    await db.setting.upsert({
      where: { key: S_POSITION_BASE },
      update: { value: JSON.stringify(map) },
      create: { key: S_POSITION_BASE, value: JSON.stringify(map) },
    })
    await logActivity(me, `پایهٔ جایگاه «${jobTitle}» تعیین شد`, 'payroll', S_POSITION_BASE, String(amount))
    return json({ ok: true, positionBase: map })
  }

  /* ── raise-all — افزایش/کاهش گروهی پایهٔ حقوق با درصدها و سقف‌گذاری (round-16) ── */
  if (action === 'raise-all') {
    const g = await guardCap(me, 'settings.manage')
    if (g) return fail(g, 403)
    const pct = Number(body.percent)
    if (!isFinite(pct) || pct === 0 || Math.abs(pct) > 100) return fail('درصد تغییر باید عددی غیرصفر بین -۱۰۰ تا ۱۰۰ باشد')
    const rows = await db.setting.findMany({ where: { key: { in: [S_DEFAULTS, S_POLICY, S_TAX, S_YEAR, S_POSITION_BASE, S_STATUTORY] } } })
    const py = payrollYear(rows)
    const statutory = statutoryOf(rows, py)
    const minMonthly = statutory.monthlyMinWage
    const profiles = await db.salaryProfile.findMany()
    let changed = 0
    let skippedBelowMin = 0
    for (const pr of profiles) {
      const next = Math.round(pr.baseSalary * (1 + pct / 100))
      if (next <= 0) { skippedBelowMin++; continue }
      if (pct > 0 && next < minMonthly) { skippedBelowMin++; continue } // حداقل دستمزد مادهٔ ۴۱
      if (next === pr.baseSalary) continue
      await db.salaryProfile.update({ where: { id: pr.id }, data: { baseSalary: next } })
      changed++
    }
    await logActivity(me, `افزایش گروهی ${pct}٪ پایهٔ حقوق (${changed} پرونده)`, 'payroll', 'raise-all', String(pct))
    return json({ ok: true, changed, skippedBelowMin, minMonthly })
  }

  /* ── yearly — تسویهٔ عیدی/سنوات (ماشین‌حساب، بدون ذخیره) ── */
  if (action === 'yearly') {
    const canManage = await hasCap(me, 'payroll.manage')
    const canView = await hasCap(me, 'payroll.view')
    const selfPid = (await db.user.findUnique({ where: { id: me.id }, select: { personnelId: true } }))?.personnelId || ''
    if (!canManage && !canView) {
      if (!selfPid || selfPid !== String(body.personnelId || '')) return fail('دسترسی لازم را ندارید', 403)
    }
    const p = await db.personnel.findUnique({ where: { id: String(body.personnelId || '') } })
    if (!p) return fail('پروندهٔ پرسنلی یافت نشد', 404)
    const rows = await db.setting.findMany({ where: { key: { in: [S_DEFAULTS, S_POLICY, S_YEAR, S_POSITION_BASE, S_STATUTORY] } } })
    const profileRow = await ensureProfile(p, loadDefaults(rows), loadPositionBase(rows))
    // hireDate شمسی است → تبدیل به iso میلادی
    const hj = String(p.hireDate || '').split('-').map(Number)
    const serviceFromIso = hj.length === 3 && hj[0] >= 1300 && hj[0] <= 1500
      ? jalaliToIso(hj[0], hj[1], hj[2])
      : String(p.hireDate || '').slice(0, 10)
    const jy = Math.round(Number(body.jy) || monthKeyOf(todayIso()).jy)
    if (!(jy >= 1380 && jy <= 1460)) return fail('سال شمسی نامعتبر است')
    const yearly = computeYearly({ profile: toEngineProfile(profileRow), serviceFromIso, jy, todayIso: todayIso(), minMonthlyWage: statutoryOf(rows, jy).monthlyMinWage })
    return json({
      ok: true, yearly,
      personnel: { id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), jobTitle: p.jobTitle, hireDate: p.hireDate, shaba: p.shaba, bankCard: p.bankCard },
      employer: EMPLOYER, personnelNo: personnelNo(p.id), generatedBy: me.name,
    })
  }

  /* ── بقیهٔ اکشن‌ها: payroll.manage یا نقش اجرایی ── */
  const rows = await db.setting.findMany({ where: { key: { in: [S_DEFAULTS, S_POLICY, S_TAX, S_STATUTORY] } } })
  const policy = loadPolicy(rows)
  const tax = loadTax(rows)
  const statMinWageOf = (y: number) => statutoryOf(rows, y).monthlyMinWage
  const g = await guardCap(me, 'payroll.manage')
  if (g) return fail(g, 403)

  /* ── delete-adjust — بدون لزوم personnelId در بدنه ── */
  if (action === 'delete-adjust') {
    const adj = await db.salaryAdjust.findUnique({ where: { id: String(body.adjustId || '') } })
    if (!adj) return fail('قلم یافت نشد', 404)
    if (adj.kind === 'COMMISSION' && !isOwner) return fail('حذف پورسانت فقط از سوی مالک مجاز است', 403)
    const month = await db.salaryMonth.findUnique({ where: { id: adj.monthId } })
    if (!month) return fail('ماهِ قلم یافت نشد', 404)
    if (month.status === 'PAID') return fail('ماه پرداخت‌شده قفل است', 409)
    if (month.status === 'CONFIRMED') return fail('ماه تأییدشده قفل است — ابتدا بازگشایی کنید', 409)
    const p = await db.personnel.findUnique({ where: { id: month.personnelId } })
    if (!p) return fail('پروندهٔ پرسنلی یافت نشد', 404)
    const profileRow = await ensureProfile(p, loadDefaults(rows))
    await db.salaryAdjust.delete({ where: { id: adj.id } })
    await recomputeMonth(p.id, `${p.firstName} ${p.lastName}`.trim(), month.jy, month.jm, toEngineProfile(profileRow), policy, tax, p.active, statMinWageOf(month.jy))
    await logActivity(me, `حذف قلم ${adj.kind}`, 'SalaryAdjust', adj.id, `${p.firstName} ${p.lastName} — ${adj.amount.toLocaleString('en-US')} ریال — ${month.jy}/${month.jm}`)
    return json({ ok: true })
  }

  // از اینجا به بعد personnelId لازم است
  const p = await db.personnel.findUnique({ where: { id: String(body.personnelId || '') } })
  if (!p) return fail('پروندهٔ پرسنلی یافت نشد', 404)
  const profileRow = await ensureProfile(p, loadDefaults(rows))
  const profile = toEngineProfile(profileRow)
  const name = `${p.firstName} ${p.lastName}`.trim()

  /* ── update-profile ── */
  if (action === 'update-profile') {
    const data: Record<string, number | boolean> = {}
    for (const f of ['baseSalary', 'housing', 'foodAllowance', 'maritalAllowance', 'childAllowance', 'seniorityBase'] as const) {
      if (body[f] !== undefined) {
        const n = reqNum(body[f], { max: 1e15 })
        if (n == null) return fail('مقادیر عددی پروفایل باید نامنفی و معتبر باشند')
        data[f] = n
      }
    }
    if (body.childCount !== undefined) {
      const n = reqNum(body.childCount, { int: true, max: 15 })
      if (n == null) return fail('تعداد فرزند باید عدد صحیح ۰ تا ۱۵ باشد')
      data.childCount = n
    }
    if (body.overtimeDivisor !== undefined) {
      const n = Number(body.overtimeDivisor)
      if (!isFinite(n) || n < 1 || n > 400) return fail('مخرج مزد ساعتی باید عددی بین ۱ تا ۴۰۰ باشد')
      data.overtimeDivisor = n
    }
    if (body.includeBenefitsInOT !== undefined) data.includeBenefitsInOT = !!body.includeBenefitsInOT
    if (body.active !== undefined) data.active = !!body.active
    if (!Object.keys(data).length) return fail('تغییری ارسال نشده است')
    await db.salaryProfile.update({ where: { personnelId: p.id }, data })
    await logActivity(me, 'ویرایش پروفایل حقوق', 'SalaryProfile', p.id, `${name} → ${JSON.stringify(data)}`)
    // بازمحاسبهٔ ماه‌های پیش‌نویسِ همان پرسنل (ماه‌های قفل‌شده دست‌نخورده می‌مانند)
    const merged = { ...profile, ...(data as Partial<SalaryProfileLike>) }
    const draftMonths = await db.salaryMonth.findMany({ where: { personnelId: p.id, status: 'DRAFT' } })
    for (const m of draftMonths) {
      await recomputeMonth(p.id, name, m.jy, m.jm, merged, policy, tax, p.active, statMinWageOf(m.jy))
    }
    return json({ ok: true })
  }

  const jy = Math.round(Number(body.jy) || 0)
  const jm = Math.round(Number(body.jm) || 0)

  /* ── set-day ── */
  if (action === 'set-day') {
    const forDate = typeof body.forDate === 'string' ? body.forDate.slice(0, 10) : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(forDate)) return fail('تاریخ روز نامعتبر است (قالب میلادی yyyy-mm-dd)')
    const parsed = new Date(forDate + 'T12:00:00')
    // ۲۰۲۶-۱۳-۹۹ و مشابه‌ها از تاریخ واقعی عبور نمی‌کنند (سقوط به تاریخ امروز مسدود شود)
    if (isNaN(parsed.getTime()) || isoDay(parsed) !== forDate) return fail('تاریخ واردشده وجود ندارد — درست‌سازی کنید')
    const mk = monthKeyOf(forDate)
    if (!(mk.jm >= 1 && mk.jm <= 12) || mk.jy < 1380 || mk.jy > 1460) return fail('تاریخ خارج از بازهٔ مجاز است')

    /** دقیقهٔ کارکرد — همیشه می‌پذیرد: هر عدد ≥۰ تا سقف здрав‌سنجی ۹۶۰ دقیقه (۱۶ ساعت)؛ هرگز رد نمی‌کند */
    const clampMin = (v: unknown): number => {
      const n = Math.round(Number(v ?? 0))
      if (!isFinite(n) || isNaN(n) || n <= 0) return 0
      return Math.min(960, n)
    }
    const otMinutes = clampMin(body.otMinutes)
    const holidayOtMinutes = clampMin(body.holidayOtMinutes)
    const nightMinutes = clampMin(body.nightMinutes)
    const absence = String(body.absence || 'NONE')
    if (!ABSENCES.includes(absence)) return fail('نوع غیبت نامعتبر است (هیچ / غیبت کامل / نیم‌روز)')
    let note = String(body.note || '').trim()

    // مادهٔ ۵۹ — آستانهٔ هشدار (نه منع): فراتر از سقف ثبت می‌شود و فقط هشدار غیرمسدودکننده برمی‌گردد.
    // «شیفت‌ها را طرفین در موارد خاص توافق می‌کنند» — یادداشت خودکار برای مستندسازی.
    const warnings: string[] = []
    if (policy.otCapMinutes > 0 && otMinutes + holidayOtMinutes > policy.otCapMinutes) {
      const capLabel = policy.otCapMinutes % 60 === 0
        ? `${faNum(Math.floor(policy.otCapMinutes / 60))} ساعت`
        : `${faNum(Math.round(policy.otCapMinutes))} دقیقه`
      warnings.push(`اضافه‌کاری بالاتر از سقف مادهٔ ۵۹ (${capLabel}) — مبنای توافق کاری پذیرفته شد`)
      if (!note) note = 'توافق کاری طرفین — بیش از آستانهٔ هشدار اضافه‌کاری روزانه (مادهٔ ۵۹)'
    }

    const { start, end } = await monthRange(mk.jy, mk.jm)
    const kinds = await computeDayKinds(p.id, start, end, [forDate])
    const dayKind = kinds.get(forDate) || 'WORK'

    const month = await ensureMonthRow(p.id, name, mk.jy, mk.jm)
    if (month.status === 'PAID') return fail('ماه پرداخت‌شده قفل است', 409)
    if (month.status === 'CONFIRMED') return fail('ماه تأییدشده قفل است — ابتدا بازگشایی کنید', 409)

    await db.salaryDay.upsert({
      where: { monthId_forDate: { monthId: month.id, forDate } },
      update: { otMinutes, holidayOtMinutes, nightMinutes, absence, dayKind, note },
      create: { monthId: month.id, forDate, otMinutes, holidayOtMinutes, nightMinutes, absence, dayKind, note },
    })
    const after = await recomputeMonth(p.id, name, mk.jy, mk.jm, profile, policy, tax, p.active, statMinWageOf(mk.jy))
    await logActivity(me, 'ثبت کارکرد روزانه', 'SalaryDay', month.id, `${name} — ${forDate} — عادی ${otMinutes}د / جمعه‌تعطیل ${holidayOtMinutes}د / شب ${nightMinutes}د / غیبت ${absence}${note ? ` — ${note}` : ''}`)
    return json({ ok: true, dayKind, computed: after.computed, month: { id: month.id, status: 'DRAFT' }, warnings })
  }

  if (!(jm >= 1 && jm <= 12) || !(jy >= 1380 && jy <= 1460)) return fail('ماه شمسی نامعتبر است (jy/jm)')
  const month = await ensureMonthRow(p.id, name, jy, jm)

  /* ── set-adjust ── */
  if (action === 'set-adjust') {
    const kind = String(body.kind || '') as AdjustKind
    if (!ADJUST_KINDS.includes(kind)) return fail('نوع قلم نامعتبر است (تشویقی/جریمه/پورسانت/مساعده/سایر)')
    const amount = reqNum(body.amount, { max: 1e15 })
    if (amount == null || amount <= 0) return fail('مبلغ باید عددی نامنفی، معتبر و بزرگ‌تر از صفر باشد')
    const note = String(body.note || '').trim()

    // پورسانت — فقط مالک/روت؛ بقیه ۴۰۳
    if (kind === 'COMMISSION' && !isOwner) {
      return fail('تعیین پورسانت فقط از سوی مالک مجاز است', 403)
    }

    if (month.status === 'PAID') return fail('ماه پرداخت‌شده قفل است', 409)
    if (month.status === 'CONFIRMED') return fail('ماه تأییدشده قفل است — ابتدا بازگشایی کنید', 409)

    if (kind === 'FINE') {
      if (note.length < 5) return fail('جریمه مستلزم شرح قانونی و مستند است — یادداشت حداقل ۵ نویسه الزامی است')
      // سقف جریمه: درصدی از جمع حقوق و مزایای همان ماه (پیش‌فرض ۲۵٪) — قبل از افزودن قلم سنجیده می‌شود
      const before = await recomputeMonth(p.id, name, jy, jm, profile, policy, tax, p.active, statMinWageOf(jy))
      const cap = (before.computed.gross * policy.fineCapPct) / 100
      if (policy.fineCapPct > 0 && amount > cap) {
        return fail(`سقف جریمهٔ ماهانه ${policy.fineCapPct}٪ جمع حقوق و مزایاست (حداکثر ${Math.round(cap).toLocaleString('en-US')} ریال) — مبلغ واردشده فراتر است`)
      }
    }

    const created = await db.salaryAdjust.create({
      data: {
        monthId: month.id, kind, amount, note,
        ownerOnly: kind === 'COMMISSION',
        createdById: me.id, createdByName: me.name,
      },
    })
    const after = await recomputeMonth(p.id, name, jy, jm, profile, policy, tax, p.active, statMinWageOf(jy))
    await logActivity(me, `ثبت قلم ${kind}`, 'SalaryAdjust', created.id, `${name} — ${jy}/${jm} — ${amount.toLocaleString('en-US')} ریال${note ? ` — ${note}` : ''}`)
    return json({ ok: true, adjust: created, computed: after.computed })
  }

  /* ── confirm ── */
  if (action === 'confirm') {
    if (month.status === 'PAID') return fail('ماه پرداخت‌شده است', 409)
    if (month.status === 'CONFIRMED') return json({ ok: true, already: true })
    const cur = monthKeyOf(todayIso())
    if (jy > cur.jy || (jy === cur.jy && jm > cur.jm)) {
      return fail('ماه آینده قابل تأیید نیست — ثبت پیش‌نویس آزاد است، تأیید پس از پایان ماه انجام می‌شود')
    }
    const { computed } = await recomputeMonth(p.id, name, jy, jm, profile, policy, tax, p.active, statMinWageOf(jy))
    if (computed.gross <= 0) return fail('برای تأیید، جمع حقوق و مزایا باید بزرگ‌تر از صفر باشد')
    await db.salaryMonth.update({
      where: { id: month.id },
      data: { status: 'CONFIRMED', confirmedById: me.id, confirmedByName: me.name, confirmedAt: new Date().toISOString() },
    })
    await logActivity(me, 'تأیید ماه حقوق', 'SalaryMonth', month.id, `${name} — ${jy}/${jm} — خالص ${computed.net.toLocaleString('en-US')} ریال${p.active ? '' : ' — هشدار: پرسنل غیرفعال'}`)
    return json({ ok: true, warning: p.active ? undefined : 'این پرسنل غیرفعال است — پیش از پرداخت بررسی کنید' })
  }

  /* ── pay ── */
  if (action === 'pay') {
    if (month.status === 'PAID') return json({ ok: true, already: true })
    if (month.status !== 'CONFIRMED') return fail('ابتدا ماه را تأیید کنید، سپس پرداخت را ثبت نمایید')
    const payslipNo = month.payslipNo || `HZ-${jy}${String(jm).padStart(2, '0')}-${p.id.slice(-6).toUpperCase()}`
    await db.salaryMonth.update({ where: { id: month.id }, data: { status: 'PAID', paidAt: new Date().toISOString(), payslipNo } })
    await logActivity(me, 'ثبت پرداخت حقوق', 'SalaryMonth', month.id, `${name} — ${jy}/${jm} — خالص ${month.net.toLocaleString('en-US')} ریال — فیش ${payslipNo}`)
    return json({ ok: true, payslipNo })
  }

  /* ── reopen ── */
  if (action === 'reopen') {
    if (month.status === 'DRAFT') return json({ ok: true, already: true })
    const note = String(body.note || '').trim()
    if (month.status === 'PAID' && month.paidAt && !note) {
      return fail('بازگشایی ماه پرداخت‌شده مستلزم ذکر دلیل است — یادداشت الزامی است')
    }
    await db.salaryMonth.update({
      where: { id: month.id },
      data: { status: 'DRAFT', confirmedById: '', confirmedByName: '', confirmedAt: '', paidAt: '' },
    })
    await logActivity(me, 'بازگشایی ماه حقوق (حسابرسی)', 'SalaryMonth', month.id, `${name} — ${jy}/${jm} — وضعیت قبلی: ${month.status}${note ? ` — دلیل: ${note}` : ''}`)
    return json({ ok: true })
  }

  return fail('اکشن نامعتبر است')
}
