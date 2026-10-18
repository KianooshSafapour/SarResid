import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canPersonnel } from '@/lib/access'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const PERSONNEL_FIELDS = [
  'fullName',
  'nationalId',
  'phone',
  'jobTitle',
  'department',
  'hireDate',
  'birthday',
  'bankCard',
  'shaba',
  'emergencyName',
  'emergencyPhone',
  'note',
] as const

/** PATCH /api/hr/personnel/[id] {…personnelFields, userId?, salaryProfile?} */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canPersonnel(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const { id } = await ctx.params
  const person = await db.personnel.findUnique({ where: { id } })
  if (!person) return fail('پرونده یافت نشد', 404)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const data: Record<string, string | null> = {}
  for (const field of PERSONNEL_FIELDS) {
    if (field in body) data[field] = optStr(body[field])
  }
  if ('fullName' in data && (data.fullName ?? '').trim().length < 3) {
    return fail('نام و نام خانوادگی الزامی است')
  }

  let linkedUserId = person.userId
  if ('userId' in body) {
    const newUserId = typeof body.userId === 'string' && body.userId ? body.userId : null
    if (newUserId && newUserId !== person.userId) {
      const target = await db.user.findUnique({ where: { id: newUserId } })
      if (!target) return fail('کاربر انتخاب‌شده یافت نشد', 404)
      const taken = await db.personnel.findUnique({ where: { userId: newUserId } })
      if (taken && taken.id !== id) return fail('این کاربر قبلاً پرونده دارد')
      linkedUserId = newUserId
      data.userId = newUserId
    } else if (!newUserId && person.userId && !(await db.user.findUnique({ where: { id: person.userId } }))) {
      // stays unlinked — keep sentinel
    }
  }

  const updated = await db.personnel.update({ where: { id }, data })

  // optional salary profile upsert (only when the person is linked to a user account)
  const sp = body.salaryProfile
  if (sp && typeof sp === 'object' && linkedUserId && (await db.user.findUnique({ where: { id: linkedUserId } }))) {
    await db.salaryProfile.upsert({
      where: { userId: linkedUserId },
      create: {
        userId: linkedUserId,
        baseSalary: num(sp.baseSalary),
        housingAllowance: num(sp.housingAllowance),
        foodAllowance: num(sp.foodAllowance),
        childAllowance: num(sp.childAllowance),
        children: Math.max(0, Math.round(Number(sp.children) || 0)),
        seniorityDaily: num(sp.seniorityDaily),
        active: sp.active === undefined ? true : !!sp.active,
      },
      update: {
        baseSalary: num(sp.baseSalary),
        housingAllowance: num(sp.housingAllowance),
        foodAllowance: num(sp.foodAllowance),
        childAllowance: num(sp.childAllowance),
        children: Math.max(0, Math.round(Number(sp.children) || 0)),
        seniorityDaily: num(sp.seniorityDaily),
        active: sp.active === undefined ? true : !!sp.active,
      },
    })
  }

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'personnel.update',
    actionLabel: 'پرسنل',
    category: 'personnel',
    detail: updated.fullName,
    entityId: id,
  })
  return ok({ id: updated.id })
}

/** DELETE /api/hr/personnel/[id] — soft delete (active=false) */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canPersonnel(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const { id } = await ctx.params
  const person = await db.personnel.findUnique({ where: { id } })
  if (!person) return fail('پرونده یافت نشد', 404)

  await db.personnel.update({ where: { id }, data: { active: false } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'personnel.deactivate',
    actionLabel: 'پرسنل',
    category: 'personnel',
    detail: `${person.fullName} غیرفعال شد`,
    entityId: id,
  })
  return ok({ id, active: false })
}

function optStr(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

function num(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}
