import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { canViewApi, hasCap } from '@/lib/rbac'

/* ── پروندهٔ پرسنل هایپر زیتون — فیلدهای JSON (children / emergencyContact / documents) اینجا باز می‌شوند ── */

type Child = { name: string; birthday: string; gender: string }
type Emergency = { name: string; phone: string; relation: string }
type Doc = { name: string; kind: string; url: string; size: number; addedAt: string; addedByName: string }

type PersonnelRaw = {
  id: string
  firstName: string
  lastName: string
  nationalId: string
  phone: string
  address: string
  birthday: string
  hireDate: string
  jobTitle: string
  department: string
  bankCard: string
  shaba: string
  baseSalary: number
  childSupport: number
  children: string
  emergencyContact: string
  documents: string
  notes: string
  userId: string
  active: boolean
  createdAt: Date
  updatedAt: Date
}

function parsePersonnel(p: PersonnelRaw) {
  return {
    ...p,
    children: safeParse<Child[]>(p.children, []),
    emergencyContact: safeParse<Emergency>(p.emergencyContact, { name: '', phone: '', relation: '' }),
    documents: safeParse<Doc[]>(p.documents, []),
  }
}

/** گارد نوشتن: نقش‌های مجاز (HC/ACC/OM/GM/OWNER/ADMIN) یا cap «personnel.manage» */
async function canManage(me: Awaited<ReturnType<typeof getSessionUser>>): Promise<boolean> {
  if (!me) return false
  if (['HC', 'ACC', 'OM', 'GM', 'OWNER', 'ADMIN'].includes(me.role)) return true
  return hasCap(me, 'personnel.manage')
}

/** GET — فهرست پرونده‌ها + نقشهٔ حساب‌های متصل (userId → {name,color,role,roleIds}) */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const viewOk = await canViewApi(me, 'personnel')
  const manageOk = await hasCap(me, 'personnel.manage')
  if (!viewOk && !manageOk) return fail('دسترسی غیرمجاز', 403)

  const rows = await db.personnel.findMany({ orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] })
  const users = await db.user.findMany({
    select: { id: true, name: true, color: true, role: true, roleIds: true, personnelId: true },
  })
  const linkedUsers: Record<string, { name: string; color: string; role: string; roleIds: string[] }> = {}
  for (const u of users) {
    linkedUsers[u.id] = { name: u.name, color: u.color, role: u.role, roleIds: safeParse<string[]>(u.roleIds, []) }
  }
  return json({ personnel: rows.map(parsePersonnel), linkedUsers })
}

/** POST — ایجاد پروندهٔ پرسنل (اختیاری: userId برای اتصال حساب) */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!(await canManage(me))) return fail('دسترسی غیرمجاز', 403)
  const body = await req.json()
  if (!body.firstName || !body.lastName) return fail('نام و نام خانوادگی الزامی است')

  let userId = typeof body.userId === 'string' ? body.userId : ''
  if (userId) {
    const u = await db.user.findUnique({ where: { id: userId } })
    if (!u) return fail('حساب کاربری انتخاب‌شده یافت نشد', 404)
    if (u.personnelId) return fail('این حساب کاربری به پروندهٔ دیگری متصل است')
  }

  const p = await db.personnel.create({
    data: {
      firstName: String(body.firstName).trim(),
      lastName: String(body.lastName).trim(),
      nationalId: body.nationalId || '',
      phone: body.phone || '',
      address: body.address || '',
      birthday: body.birthday || '',
      hireDate: body.hireDate || '',
      jobTitle: body.jobTitle || '',
      department: body.department || '',
      bankCard: body.bankCard || '',
      shaba: body.shaba || '',
      baseSalary: Number(body.baseSalary) || 0,
      childSupport: Number(body.childSupport) || 0,
      children: JSON.stringify(Array.isArray(body.children) ? body.children : []),
      emergencyContact: JSON.stringify(body.emergencyContact || { name: '', phone: '', relation: '' }),
      documents: '[]',
      notes: body.notes || '',
      userId,
      active: body.active !== false,
    },
  })

  if (userId) {
    await db.user.update({ where: { id: userId }, data: { personnelId: p.id } })
  }
  await logActivity(me, 'ایجاد پروندهٔ پرسنل', 'personnel', p.id, `${p.firstName} ${p.lastName}`)
  return json({ personnel: parsePersonnel(p) }, 201)
}
