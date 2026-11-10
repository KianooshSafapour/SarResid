import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canPayroll } from '@/lib/access'
import { normalizeStatutory } from '@/lib/payroll'
import { getStatutory } from '@/lib/payroll-statutory'
import { toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/** GET /api/hr/payroll/settings[?year=] → {statutory} */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canPayroll(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const yearParam = Number(req.nextUrl.searchParams.get('year'))
  const year = Number.isFinite(yearParam) && yearParam >= 1300 && yearParam <= 1500 ? Math.round(yearParam) : undefined
  const statutory = await getStatutory(year)
  return ok({ statutory })
}

/** PUT /api/hr/payroll/settings {year,minWage,housing,food,child,seniorityDaily,taxExempt,taxBands} → {statutory} */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canPayroll(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const statutory = normalizeStatutory(body)
  if (statutory.minWage <= 0) return fail('حداقل دستمزد باید مثبت باشد')
  if (statutory.taxBands.some(([, rate]) => rate < 0 || rate > 100)) return fail('باندهای مالیاتی معتبر نیستند')

  await db.setting.upsert({
    where: { key: 'payroll_statutory' },
    create: { key: 'payroll_statutory', value: JSON.stringify(statutory) },
    update: { value: JSON.stringify(statutory) },
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'payroll.settings',
    actionLabel: 'حقوق',
    category: 'payroll',
    detail: `ثابت‌های قانونی سال ${toFaDigits(statutory.year)} ذخیره شد`,
  })

  return ok({ statutory })
}