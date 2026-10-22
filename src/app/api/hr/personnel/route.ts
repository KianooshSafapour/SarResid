import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'hr/personnel')
  if (!gate.ok) return fail(gate.deny, 403)

  const [personnel, users, profiles] = await Promise.all([
    db.personnel.findMany(),
    db.user.findMany(),
    db.salaryProfile.findMany(),
  ])
  const userById = new Map(users.map((u) => [u.id, u]))
  const profileByUser = new Map(profiles.map((p) => [p.userId, p]))
  const linkedUserIds = new Set(personnel.map((p) => p.userId).filter((uid) => userById.has(uid)))

  const items = personnel.map((p) => {
    const u = userById.get(p.userId)
    const sp = u ? profileByUser.get(u.id) : undefined
    return {
      id: p.id,
      userId: u ? u.id : null,
      fullName: p.fullName,
      nationalId: p.nationalId,
      phone: p.phone,
      jobTitle: p.jobTitle,
      department: p.department,
      hireDate: p.hireDate,
      birthday: p.birthday,
      bankCard: p.bankCard,
      shaba: p.shaba,
      emergencyName: p.emergencyName,
      emergencyPhone: p.emergencyPhone,
      note: p.note,
      contractType: p.contractType,
      contractStart: p.contractStart,
      contractEnd: p.contractEnd,
      contractSalary: p.contractSalary,
      contractNote: p.contractNote,
      active: p.active,
      user: u ? { id: u.id, username: u.username, fullName: u.fullName, role: u.role } : null,
      salaryProfile: sp
        ? {
            id: sp.id,
            userId: sp.userId,
            baseSalary: sp.baseSalary,
            housingAllowance: sp.housingAllowance,
            foodAllowance: sp.foodAllowance,
            childAllowance: sp.childAllowance,
            children: sp.children,
            seniorityDaily: sp.seniorityDaily,
            active: sp.active,
            createdAt: sp.createdAt,
          }
        : null,
    }
  })

  const linkableUsers = users
    .filter((u) => !linkedUserIds.has(u.id))
    .map((u) => ({ id: u.id, username: u.username, fullName: u.fullName, role: u.role }))

  return ok({ items, linkableUsers })
}

/** POST /api/hr/personnel {fullName, jobTitle?, department?, nationalId?, phone?, hireDate?, birthday?, userId?, note?} */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'hr/personnel')
  if (!gate.ok) return fail(gate.deny, 403)

  const body = await req.json().catch(() => null)
  const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : ''
  if (fullName.length < 3) return fail('نام و نام خانوادگی را کامل وارد کنید')

  const linkUserId = typeof body?.userId === 'string' && body.userId ? body.userId : null
  if (linkUserId) {
    const target = await db.user.findUnique({ where: { id: linkUserId } })
    if (!target) return fail('کاربر انتخاب‌شده یافت نشد', 404)
    const taken = await db.personnel.findUnique({ where: { userId: linkUserId } })
    if (taken) return fail('این کاربر قبلاً پرونده دارد')
  }

  // unique sentinel for unlinked personnel (schema requires a unique string userId)
  let userId = linkUserId ?? `__unlinked_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

  const person = await db.personnel.create({
    data: {
      userId,
      fullName,
      jobTitle: optStr(body?.jobTitle),
      department: optStr(body?.department),
      nationalId: optStr(body?.nationalId),
      phone: optStr(body?.phone),
      hireDate: optStr(body?.hireDate),
      birthday: optStr(body?.birthday),
      bankCard: optStr(body?.bankCard),
      shaba: optStr(body?.shaba),
      emergencyName: optStr(body?.emergencyName),
      emergencyPhone: optStr(body?.emergencyPhone),
      note: optStr(body?.note),
    },
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'personnel.create',
    actionLabel: 'پرسنل',
    category: 'personnel',
    detail: fullName,
    entityId: person.id,
  })
  return ok({ id: person.id })
}

function optStr(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}
