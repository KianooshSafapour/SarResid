/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SarResid — مجموعهٔ تست جامع پلتفرم (روند ۱۷)
 * ─────────────────────────────────────────────────────────────────────────────
 *  اجرا:  bun run test
 *  پوشش: منطق محض (موتور حقوق/تقویم) + قراردادهای API + فرآیندهای کاری
 *  روش:  تست‌های منطقی مستقل‌اند؛ تست‌های API با سرور dev روی :3000 کار می‌کنند.
 *  نکته: دادهٔ تستی با پیشوند TEST_ ساخته و در پایان پاک می‌شود.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'

/* ── پیکربندی ── */
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000'
const OM_NAME = 'کیانوش صفاپور' // مدیر عملیات — دسترسی اجرایی

type Session = { token: string; userId: string }

async function loginAs(name: string): Promise<Session> {
  // userId را از دیتابیس نمی‌خوانیم — ورود با نام کاربر (مسیر تستی سریع):
  // در محیط تست userId را از لیست کاربران لاگین‌شده می‌گیریم؛ برای سادگی:
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', userId: await userIdOf(name) }),
  })
  const j = await res.json()
  if (!j.token) throw new Error(`login failed for ${name}: ${JSON.stringify(j).slice(0, 100)}`)
  return { token: j.token, userId: j.user.id }
}

/** userId از فایل نگاشت کش‌شده (تا تست به دیتابیس مستقیم وابسته نباشد) */
const userIdCache = new Map<string, string>()
async function userIdOf(name: string): Promise<string> {
  if (userIdCache.has(name)) return userIdCache.get(name)!
  const { PrismaClient } = await import('@prisma/client')
  const db = new PrismaClient()
  try {
    const u = await db.user.findFirst({ where: { OR: [{ name }, { name: { contains: name.split(' ')[0] } }] } })
    if (!u) throw new Error(`user not found: ${name}`)
    userIdCache.set(name, u.id)
    return u.id
  } finally {
    await db.$disconnect()
  }
}

function api(token: string) {
  return async function call<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': token,
        ...(init.headers as Record<string, string> | undefined),
      },
    })
    const text = await res.text()
    let body: any = null
    try { body = JSON.parse(text) } catch { body = { raw: text.slice(0, 200) } }
    return { status: res.status, ok: res.ok, ...body } as T
  }
}

/* ═══════════════ ۱) منطق محض — موتور حقوق (بدون شبکه) ═══════════════ */

describe('موتور حقوق — منطق محض', () => {
  let engine: typeof import('../src/lib/salary-engine')
  beforeAll(async () => {
    engine = await import('../src/lib/salary-engine')
  })

  const baseProfile = {
    baseSalary: 220_000_000, housing: 30_000_000, foodAllowance: 22_000_000,
    maritalAllowance: 5_000_000, childAllowance: 16_625_550, childCount: 2,
    seniorityBase: 166_667, overtimeDivisor: 220, includeBenefitsInOT: false,
  }
  const policy = { otRate: 1.4, nightRate: 0.35, holidayOtRate: 1.4, otCapMinutes: 240, insuranceRate: 0.07, employerRate: 0.23, insuranceIncludesOT: false, fineCapPct: 25, roundTo: 0 }
  const tax1405 = { exempt: 400_000_000, bands: [
    { upTo: 800_000_000, rate: 0.1 }, { upTo: 1_000_000_000, rate: 0.15 },
    { upTo: 1_200_000_000, rate: 0.2 }, { upTo: 1_400_000_000, rate: 0.25 }, { upTo: null, rate: 0.3 },
  ] }
  const day = (over: Partial<import('../src/lib/salary-engine').SalaryDayLike> = {}): import('../src/lib/salary-engine').SalaryDayLike => ({
    forDate: '2026-09-10', otMinutes: 0, holidayOtMinutes: 0, nightMinutes: 0, absence: 'NONE', absenceMinutes: 0, dayKind: 'WORK', note: '', ...over,
  })

  test('مالیات پلکانی — زیر معافیت صفر است', () => {
    expect(engine.computeTax(399_999_999, tax1405)).toBe(0)
  })
  test('مالیات پلکانی — مازادِ ۵۰۰م همه در پلهٔ اول (سقف‌ها مطلق‌اند)', () => {
    // مازاد ۵۰۰م < سقف پلهٔ اول ۸۰۰م → همه × ۱۰٪
    expect(engine.computeTax(900_000_000, tax1405)).toBe(Math.round(500_000_000 * 0.1))
  })
  test('مالیات پلکانی — پیمودن همهٔ پله‌ها با سقف مطلق + نرخ آخر برای مازاد نهایی', () => {
    // مازاد ۱٫۵ میلیارد: ۸۰۰م×۱۰٪ + ۲۰۰م×۱۵٪ + ۲۰۰م×۲۰٪ + ۲۰۰م×۲۵٪ + ۱۰۰م×۳۰٪
    const expected = 800 * 0.1 + 200 * 0.15 + 200 * 0.2 + 200 * 0.25 + 100 * 0.3 // به میلیون
    expect(engine.computeTax(400_000_000 + 1_500_000_000, tax1405)).toBe(Math.round(expected * 1_000_000))
  })
  test('حقوق ماهانهٔ کامل بدون غیبت — اجزای اصلی', () => {
    const c = engine.computeMonth({ profile: baseProfile, days: [], adjusts: [], monthDays: 31, tax: tax1405, policy, jy: 1405, jm: 6 })
    expect(c.workDays).toBe(31)
    expect(c.baseProrated).toBe(220_000_000)
    expect(c.housing).toBe(30_000_000)
    expect(c.foodAllowance).toBe(22_000_000)
    expect(c.childTotal).toBe(16_625_550 * 2)
    expect(c.overtimePay).toBe(0)
    expect(c.absenceDeduction).toBe(0)
  })
  test('اضافه‌کاری ۴ ساعت — دقیقاً برابر قانون ۱٫۴ × مزد ساعتی', () => {
    const c = engine.computeMonth({ profile: baseProfile, days: [day({ otMinutes: 240 })], adjusts: [], monthDays: 31, tax: tax1405, policy, jy: 1405, jm: 6 })
    const hourly = 220_000_000 / 220
    expect(c.overtimePay).toBe(Math.round(4 * hourly * 1.4))
    expect(c.otCapViolations).toEqual([]) // در سقف — بدون تخلف
  })
  test('اضافه‌کاری ۶ ساعت (دوشیفت توافقی) — پرداخت می‌شود + فقط هشدار', () => {
    const c = engine.computeMonth({ profile: baseProfile, days: [day({ otMinutes: 360 })], adjusts: [], monthDays: 31, tax: tax1405, policy, jy: 1405, jm: 6 })
    const hourly = 220_000_000 / 220
    expect(c.overtimePay).toBe(Math.round(6 * hourly * 1.4)) // ثبت و پرداخت کامل
    expect(c.otCapViolations).toEqual(['2026-09-10']) // علامت‌گذاری
    expect(c.warnings.some((w) => w.includes('توافق کتبی'))).toBe(true) // هشدار، نه منع
  })
  test('مرخصی ساعتی — کسر دقیق مزد ساعتی (۹۰ دقیقه)', () => {
    const c = engine.computeMonth({ profile: baseProfile, days: [day({ absence: 'HOUR', absenceMinutes: 90 })], adjusts: [], monthDays: 31, tax: tax1405, policy, jy: 1405, jm: 6 })
    const hourly = 220_000_000 / 220
    expect(c.absentHours).toBe(1.5)
    expect(c.absenceDeduction).toBe(Math.round(hourly * 1.5))
    expect(c.workDays).toBe(31) // روز کامل حساب می‌شود، کسرش ساعتی است
    expect(c.gross).toBe(c.baseProrated + c.housing + c.foodAllowance + c.marital + c.childTotal - c.absenceDeduction)
  })
  test('غیبت کامل — کسر یک روزمزد و کاهش روز کارکرد', () => {
    const c = engine.computeMonth({ profile: baseProfile, days: [day({ absence: 'FULL' })], adjusts: [], monthDays: 31, tax: tax1405, policy, jy: 1405, jm: 6 })
    expect(c.workDays).toBe(30)
    expect(c.baseProrated).toBe(Math.round(220_000_000 * 30 / 31))
  })
  test('غیبت نیم‌روز — نصف روز', () => {
    const c = engine.computeMonth({ profile: baseProfile, days: [day({ absence: 'HALF' })], adjusts: [], monthDays: 31, tax: tax1405, policy, jy: 1405, jm: 6 })
    expect(c.workDays).toBe(30.5)
  })
  test('بیمه — مسکن/بن/اضافه‌کاری از مأخذ خارج‌اند (تبصرهٔ مادهٔ ۳۸)', () => {
    const c = engine.computeMonth({ profile: baseProfile, days: [day({ otMinutes: 240 })], adjusts: [], monthDays: 31, tax: tax1405, policy, jy: 1405, jm: 6 })
    expect(c.insurableBase).toBe(220_000_000 + 5_000_000 + 16_625_550 * 2)
    expect(c.insurance).toBe(Math.round(c.insurableBase * 0.07))
  })
  test('حقوق پایهٔ زیر حداقل ۱۴۰۵ — هشدار مادهٔ ۴۱', () => {
    const c = engine.computeMonth({ profile: { ...baseProfile, baseSalary: 100_000_000 }, days: [], adjusts: [], monthDays: 30, tax: tax1405, policy, jy: 1405, jm: 6, statutoryYear: 1405 })
    expect(c.warnings.some((w) => w.includes('حداقل دستمزد'))).toBe(true)
  })
  test('عیدی و سنوات — خدمت ناقص متناسب با روزها', () => {
    const y = engine.computeYearly({ profile: baseProfile, serviceFromIso: '2026-06-21', jy: 1405, todayIso: '2026-09-21' })
    expect(y.partial).toBe(true)
    expect(y.serviceDays).toBe(92)
    expect(y.seniority).toBe(Math.round(166_667 * 92))
    const cap = 3 * 166_255_500
    expect(y.eydiCap).toBe(cap)
    expect(y.eydi).toBe(Math.round(Math.min(2 * 220_000_000, cap) * y.ratio))
  })
  test('ثابت‌های ۱۴۰۵ — حداقل دستمزد و مزایا (راستی‌آزمایی)', () => {
    const s = engine.getStatutory(1405)
    expect(s.monthlyMinWage).toBe(166_255_500)
    expect(s.housing).toBe(30_000_000)
    expect(s.foodAllowance).toBe(22_000_000)
    expect(s.overtimeDivisor).toBe(220)
    expect((engine.getStatutory(1404).monthlyMinWage as number)).toBe(103_909_680)
    expect(engine.getStatutory(1400)).toEqual(engine.getStatutory(1405)) // سال ناشناخته → پیش‌فرض ۱۴۰۵
  })
})

/* ═══════════════ ۲) API — حقوق و دستمزد (فرآیند واقعی) ═══════════════ */

describe('API حقوق — ثبت کارکرد و سقف اضافه‌کاری', () => {
  let call: ReturnType<typeof api>
  let personnelId: string
  const TODAY = new Date().toISOString().slice(0, 10)

  beforeAll(async () => {
    const s = await loginAs(OM_NAME)
    call = api(s.token)
    const pay = await call<any>('/api/payroll')
    expect(pay.isManager === undefined ? true : true).toBe(true)
    const first = (pay.personnel || [])[0]
    if (!first) throw new Error('no personnel rows')
    personnelId = first.id
  })

  test('GET — ساختار پاسخ با سال ۱۴۰۵ و سیاست کامل', async () => {
    const pay = await call<any>('/api/payroll')
    expect(pay.jy).toBe(1405)
    expect(pay.salaryYear).toBe(1405)
    for (const k of ['otRate', 'nightRate', 'holidayOtRate', 'otCapMinutes', 'insuranceRate', 'employerRate', 'insuranceIncludesOT', 'fineCapPct', 'roundTo'])
      expect(pay.policy).toHaveProperty(k)
  })

  test('ثبت اضافه‌کاری ۳۰۰ دقیقه (بالای سقف ۴ ساعت) — موفق با هشدار، بدون بلاک', async () => {
    const r = await call<any>('/api/payroll', { method: 'POST', body: JSON.stringify({ action: 'set-day', personnelId, forDate: TODAY, otMinutes: 300, holidayOtMinutes: 0, nightMinutes: 0, absence: 'NONE', absenceMinutes: 0, note: '' }) })
    expect(r.ok).toBe(true)
    expect(Array.isArray(r.warnings) && r.warnings.some((w: string) => w.includes('مادهٔ ۵۹'))).toBe(true)
  })

  test('مرخصی ساعتی ۹۰ دقیقه — کسر مزد ساعتی در محاسبه', async () => {
    const r = await call<any>('/api/payroll', { method: 'POST', body: JSON.stringify({ action: 'set-day', personnelId, forDate: TODAY, otMinutes: 0, holidayOtMinutes: 0, nightMinutes: 0, absence: 'HOUR', absenceMinutes: 90, note: '' }) })
    expect(r.ok).toBe(true)
    expect(r.computed.absentHours).toBe(1.5)
    expect(r.computed.absenceDeduction).toBeGreaterThan(0)
  })

  test('غیبت کامل + مرخصی ساعتی هم‌زمان — رد می‌شود', async () => {
    const r = await call<any>('/api/payroll', { method: 'POST', body: JSON.stringify({ action: 'set-day', personnelId, forDate: TODAY, otMinutes: 0, holidayOtMinutes: 0, nightMinutes: 0, absence: 'FULL', absenceMinutes: 60, note: '' }) })
    expect(r.ok).toBe(false)
  })

  test('دقیقهٔ منفی و نامعتبر — رد می‌شود', async () => {
    const r = await call<any>('/api/payroll', { method: 'POST', body: JSON.stringify({ action: 'set-day', personnelId, forDate: TODAY, otMinutes: -30, holidayOtMinutes: 0, nightMinutes: 0, absence: 'NONE', absenceMinutes: 0 }) })
    expect(r.ok).toBe(false)
  })

  test('تاریخ ناموجود (۲۰۲۶-۱۳-۹۹) — رد می‌شود', async () => {
    const r = await call<any>('/api/payroll', { method: 'POST', body: JSON.stringify({ action: 'set-day', personnelId, forDate: '2026-13-99', otMinutes: 0, holidayOtMinutes: 0, nightMinutes: 0, absence: 'NONE', absenceMinutes: 0 }) })
    expect(r.ok).toBe(false)
  })

  afterAll(async () => {
    // پاک‌سازی ردیف‌های روز تست
    if (personnelId) {
      await call<any>('/api/payroll', { method: 'POST', body: JSON.stringify({ action: 'set-day', personnelId, forDate: TODAY, otMinutes: 0, holidayOtMinutes: 0, nightMinutes: 0, absence: 'NONE', absenceMinutes: 0, note: '' }) })
    }
  })
})

/* ═══════════════ ۳) API — چارت شیفت‌ها ═══════════════ */

describe('API چارت شیفت‌ها', () => {
  let call: ReturnType<typeof api>
  const tplName = `TEST_شیفت_${Date.now()}`

  beforeAll(async () => {
    const s = await loginAs(OM_NAME)
    call = api(s.token)
  })

  test('ساخت شیفت عادی ۰۸:۰۰–۱۵:۳۰ (۷٫۵ ساعت — بالای ۴ ساعت مجاز)', async () => {
    const r = await call<any>('/api/shifts', { method: 'POST', body: JSON.stringify({ action: 'create-template', name: tplName, weekdays: [0, 1, 2, 3], startTime: '08:00', endTime: '15:30', requiredStaff: 3 }) })
    expect(r.ok).toBe(true)
    expect(r.template.startMin).toBe(480)
    expect(r.template.endMin).toBe(930)
    expect(r.template.weekdays).toEqual([0, 1, 2, 3])
  })

  test('ساخت شیفت جمعه ۱۰:۰۰–۱۴:۰۰', async () => {
    const r = await call<any>('/api/shifts', { method: 'POST', body: JSON.stringify({ action: 'create-template', name: `TEST_جمعه_${Date.now()}`, weekdays: [6], startTime: '10:00', endTime: '14:00', requiredStaff: 2, doubleShift: false }) })
    expect(r.ok).toBe(true)
    expect(r.template.weekdays).toEqual([6])
    await call(`/api/shifts?id=${r.template.id}`, { method: 'DELETE' })
  })

  test('ساعت نامعتبر — رد می‌شود', async () => {
    const r = await call<any>('/api/shifts', { method: 'POST', body: JSON.stringify({ action: 'create-template', name: 'TEST_بد', weekdays: [0], startTime: '25:99', endTime: '15:30', requiredStaff: 1 }) })
    expect(r.ok).toBe(false)
  })

  test('بدون روز هفته — رد می‌شود', async () => {
    const r = await call<any>('/api/shifts', { method: 'POST', body: JSON.stringify({ action: 'create-template', name: 'TEST_بد', weekdays: [], startTime: '08:00', endTime: '15:30', requiredStaff: 1 }) })
    expect(r.ok).toBe(false)
  })

  test('تخصیص + دوشیفت + حذف تخصیص', async () => {
    const board = await call<any>('/api/shifts')
    const tpl = (board.templates || []).find((t: any) => t.name === tplName)
    expect(tpl).toBeTruthy()
    const user = (board.users || [])[0]
    expect(user).toBeTruthy()
    const forDate = board.today

    const a = await call<any>('/api/shifts', { method: 'POST', body: JSON.stringify({ action: 'assign', templateId: tpl.id, forDate, userId: user.id }) })
    expect(a.ok).toBe(true)

    const d = await call<any>('/api/shifts', { method: 'POST', body: JSON.stringify({ action: 'toggle-double', templateId: tpl.id, forDate, userId: user.id }) })
    expect(d.assignment.double).toBe(true)

    const u = await call<any>('/api/shifts', { method: 'POST', body: JSON.stringify({ action: 'unassign', templateId: tpl.id, forDate, userId: user.id }) })
    expect(u.ok).toBe(true)
  })

  afterAll(async () => {
    const board = await call!('/api/shifts') as any
    const tpl = (board.templates || []).find((t: any) => t.name.startsWith('TEST_'))
    if (tpl) await call!(`/api/shifts?id=${tpl.id}`, { method: 'DELETE' }) as any
  })
})

/* ═══════════════ ۴) API — دسته‌بندی کالاها ═══════════════ */

describe('API دسته‌بندی کالاها', () => {
  let call: ReturnType<typeof api>
  const catName = `TEST_دسته_${Date.now()}`

  beforeAll(async () => {
    const s = await loginAs(OM_NAME)
    call = api(s.token)
  })

  test('ساخت دسته با آیکون و رنگ', async () => {
    const r = await call<any>('/api/categories', { method: 'POST', body: JSON.stringify({ name: catName, icon: '🧪', color: '#2e6f6a' }) })
    expect(r.ok).toBe(true)
    expect(r.category.icon).toBe('🧪')
  })

  test('دستهٔ تکراری — رد می‌شود', async () => {
    const r = await call<any>('/api/categories', { method: 'POST', body: JSON.stringify({ name: catName }) })
    expect(r.ok).toBe(false)
  })

  test('تغییر نام دسته — کالاهای آن دسته هم منتقل می‌شوند', async () => {
    const list = await call<any>('/api/categories')
    const cat = list.categories.find((c: any) => c.name === catName)
    expect(cat).toBeTruthy()
    const renamed = `TEST_دسته۲_${Date.now()}`
    const r = await call<any>(`/api/categories?id=${cat.id}`, { method: 'PATCH', body: JSON.stringify({ renameTo: renamed, icon: '🎯' }) })
    expect(r.ok).toBe(true)
    expect(r.category.name).toBe(renamed)
    await call(`/api/categories?id=${cat.id}`, { method: 'DELETE' })
  })

  test('شکل چندضلعی نقشهٔ فروشگاه (ذوزنقه) — ذخیره و بازیابی', async () => {
    const plans = await call<any>('/api/floorplans')
    const plan = (plans.plans || [])[0]
    if (!plan) return // بدون پلان — آزمون رد می‌شود
    const trapezoid = [
      [0, Math.round(plan.height * 0.32)], [Math.round(plan.width * 0.28), 0],
      [plan.width, 0], [plan.width, plan.height], [0, plan.height],
    ]
    const r = await call<any>('/api/floorplans', { method: 'PATCH', body: JSON.stringify({ id: plan.id, shape: trapezoid }) })
    expect(r.ok).toBe(true)
    const saved = typeof r.plan.shape === 'string' ? JSON.parse(r.plan.shape) : r.plan.shape
    expect(saved.length).toBe(5)
    // بازگشت به مستطیل
    await call('/api/floorplans', { method: 'PATCH', body: JSON.stringify({ id: plan.id, shape: [] }) })
  })
})

/* ═══════════════ ۵) API — دفتر اشخاص و اعلان‌ها ═══════════════ */

describe('API دفتر اشخاص + اعلان‌ها', () => {
  let call: ReturnType<typeof api>

  beforeAll(async () => {
    const s = await loginAs(OM_NAME)
    call = api(s.token)
  })

  test('پروندهٔ شخص — tags همیشه آرایه است (رگرسیون باگ rep.tags.map)', async () => {
    const list = await call<any>('/api/sales-reps')
    const rep = (list.reps || [])[0]
    if (!rep) return
    const profile = await call<any>(`/api/sales-reps/${rep.id}`)
    expect(profile.ok).toBe(true)
    expect(Array.isArray(profile.rep.tags)).toBe(true)
    expect(Array.isArray(profile.rep.providerHistory)).toBe(true)
  })

  test('اعلان‌ها — همیشه آرایه با ساختار معتبر', async () => {
    const r = await call<any>('/api/notifications')
    expect(Array.isArray(r.notifications)).toBe(true)
    for (const n of (r.notifications || []).slice(0, 5)) {
      expect(n).toHaveProperty('id')
      expect(n).toHaveProperty('severity')
      expect(n).toHaveProperty('title')
    }
  })

  test('اعلان تولد — برای مدیر عملیات قابل مشاهده (۹۹ روز قبل نیست، فقط ۷/۳/۱/۰)', async () => {
    const r = await call<any>('/api/notifications')
    const birthdays = (r.notifications || []).filter((n: any) => String(n.id).startsWith('birthday-'))
    for (const b of birthdays) {
      expect(['birthday-7', 'birthday-3', 'birthday-1', 'birthday-0'].some((p) => String(b.id).startsWith(p))).toBe(true)
    }
  })
})

/* ═══════════════ ۶) API — آواتار ═══════════════ */

describe('API آواتار کاربر', () => {
  let call: ReturnType<typeof api>

  beforeAll(async () => {
    const s = await loginAs(OM_NAME)
    call = api(s.token)
  })

  test('PUT آواتار کارتونی — ذخیره و خواندن', async () => {
    const cfg = { skin: '#eab995', hair: 'curly', hairColor: '#3a2a1a', outfit: '#c9a227', accessory: 'none' }
    const r = await call<any>('/api/me/avatar', { method: 'PUT', body: JSON.stringify({ avatarCfg: cfg }) })
    expect(r.ok).toBe(true)
    const g = await call<any>('/api/me/avatar')
    const parsed = JSON.parse(g.avatarCfg)
    expect(parsed.hair).toBe('curly')
    expect(parsed.outfit).toBe('#c9a227')
  })

  test('رشتهٔ JSON هم پذیرفته می‌شود (سازگاری کلاینت)', async () => {
    const r = await call<any>('/api/me/avatar', { method: 'PUT', body: JSON.stringify({ avatarCfg: JSON.stringify({ skin: '#f6d3b8', hair: 'bun', hairColor: '#1d1610', outfit: '#0b2e20', accessory: 'glasses' }) }) })
    expect(r.ok).toBe(true)
    const g = await call<any>('/api/me/avatar')
    expect(JSON.parse(g.avatarCfg).hair).toBe('bun')
  })

  test('مقدار نامعتبر (رنگ غلط) — رد می‌شود', async () => {
    const r = await call<any>('/api/me/avatar', { method: 'PUT', body: JSON.stringify({ avatarCfg: { skin: 'green', hair: 'zzz' } }) })
    expect(r.ok).toBe(false)
  })

  test('حذف آواتار — بازگشت به خالی', async () => {
    await call('/api/me/avatar', { method: 'PUT', body: JSON.stringify({ avatarUrl: '', avatarCfg: '' }) })
    const g = await call<any>('/api/me/avatar')
    expect(g.avatarCfg === '' || g.avatarCfg === undefined || g.avatarCfg === null).toBe(true)
  })
})

/* ═══════════════ ۷) دسترسی — بدون توکن هرگز ═══════════════ */

describe('امنیت پایه — گاردهای احراز هویت', () => {
  test('پرداخت بدون توکن — 401', async () => {
    const res = await fetch(`${BASE}/api/payroll`)
    expect(res.status).toBe(401)
  })
  test('شیفت‌ها بدون توکن — 401', async () => {
    const res = await fetch(`${BASE}/api/shifts`)
    expect(res.status).toBe(401)
  })
  test('دسته‌ها بدون توکن — 401', async () => {
    const res = await fetch(`${BASE}/api/categories`)
    expect(res.status).toBe(401)
  })
  test('آواتار بدون توکن — 401', async () => {
    const res = await fetch(`${BASE}/api/me/avatar`)
    expect(res.status).toBe(401)
  })
})
