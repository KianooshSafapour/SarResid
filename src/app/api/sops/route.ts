import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, safeJson, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { displayName } from '@/lib/notify'

export const dynamic = 'force-dynamic'

interface SopStep {
  text: string
  hint?: string
}

/** roleKeys are stored in the Setting KV (Sop model has no column for them) */
const roleKeySetting = (id: string) => `sop:rolekeys:${id}`

async function getRoleKeys(id: string): Promise<string[]> {
  const row = await db.setting.findUnique({ where: { key: roleKeySetting(id) } })
  return safeJson<string[]>(row?.value, [])
}

async function saveRoleKeys(id: string, roleKeys: string[]) {
  await db.setting.upsert({
    where: { key: roleKeySetting(id) },
    create: { key: roleKeySetting(id), value: JSON.stringify(roleKeys) },
    update: { value: JSON.stringify(roleKeys) },
  })
}

/** GET /api/sops — list; GET /api/sops?id= — detail (with a views increment) */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const id = req.nextUrl.searchParams.get('id')

  if (id) {
    const sop = await db.sop.findUnique({ where: { id } })
    if (!sop) return fail('روال یافت نشد', 404)

    const [roleKeys, updated] = await Promise.all([
      getRoleKeys(sop.id),
      db.sop.update({ where: { id: sop.id }, data: { views: { increment: 1 } } }),
    ])

    return ok({
      sop: {
        id: sop.id,
        title: sop.title,
        description: sop.description,
        steps: safeJson<SopStep[]>(sop.stepsJson, []),
        // مقدار پس از افزایش — شمارندهٔ بازدید باید همان لحظهٔ مشاهده به‌روز باشد
        views: updated.views,
        completions: updated.completions, // R5-P4: دفعات اجرای کامل
        version: sop.version,
        roleKeys,
        createdAt: sop.createdAt,
        updatedAt: sop.updatedAt,
      },
    })
  }

  const sops = await db.sop.findMany({
    orderBy: [{ id: 'desc' }],
    take: 100,
  })

  // roleKeys همهٔ روال‌ها با یک پرس‌وجو (KV در Setting)
  const keyRows = await db.setting.findMany({ where: { key: { startsWith: 'sop:rolekeys:' } } })
  const rkMap = new Map<string, string[]>()
  for (const row of keyRows) rkMap.set(row.key.slice('sop:rolekeys:'.length), safeJson<string[]>(row.value, []))

  return ok({
    sops: sops.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      stepsCount: safeJson<unknown[]>(s.stepsJson, []).length,
      views: s.views,
      completions: s.completions, // R5-P4
      version: s.version,
      roleKeys: rkMap.get(s.id) || [],
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  })
}

/** POST /api/sops {title, description, steps:[{text,hint?}], roleKeys?} — managers */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!isManager(me)) return fail('فقط مدیران می‌توانند روال بسازند', 403)

  const body = (await req.json().catch(() => ({}))) as {
    title?: string
    description?: string
    steps?: { text?: string; hint?: string }[]
    roleKeys?: string[]
  }
  const title = String(body.title || '').trim()
  if (title.length < 2) return fail('عنوان روال الزامی است')

  const steps = (Array.isArray(body.steps) ? body.steps : [])
    .map((s) => ({ text: String(s.text || '').trim(), hint: String(s.hint || '').trim() || undefined }))
    .filter((s) => s.text.length > 0)
    .slice(0, 80)
  if (steps.length === 0) return fail('حداقل یک مرحله الزامی است')

  const sop = await db.sop.create({
    data: {
      title,
      description: String(body.description || '').trim(),
      stepsJson: JSON.stringify(steps),
    },
  })
  await saveRoleKeys(sop.id, Array.isArray(body.roleKeys) ? body.roleKeys.slice(0, 20) : [])

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'sop_create',
    actionLabel: 'ایجاد روال استاندارد',
    category: 'sops',
    detail: title,
    entityId: sop.id,
  })

  return ok({ sop: { id: sop.id } })
}

/** PUT /api/sops {id, title, description, steps, roleKeys?} — managers; bumps version */
export async function PUT(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!isManager(me)) return fail('فقط مدیران می‌توانند روال را ویرایش کنند', 403)

  const body = (await req.json().catch(() => ({}))) as {
    id?: string
    title?: string
    description?: string
    steps?: { text?: string; hint?: string }[]
    roleKeys?: string[]
  }
  const id = String(body.id || '')
  const sop = await db.sop.findUnique({ where: { id } })
  if (!sop) return fail('روال یافت نشد', 404)

  const title = String(body.title || sop.title).trim()
  if (title.length < 2) return fail('عنوان روال الزامی است')

  const steps = (Array.isArray(body.steps) ? body.steps : safeJson<SopStep[]>(sop.stepsJson, []))
    .map((s) => ({ text: String(s.text || '').trim(), hint: String(s.hint || '').trim() || undefined }))
    .filter((s) => s.text.length > 0)
    .slice(0, 80)
  if (steps.length === 0) return fail('حداقل یک مرحله الزامی است')

  await db.sop.update({
    where: { id },
    data: {
      title,
      description: String(body.description ?? sop.description).trim(),
      stepsJson: JSON.stringify(steps),
      version: { increment: 1 },
    },
  })
  if (Array.isArray(body.roleKeys)) await saveRoleKeys(id, body.roleKeys.slice(0, 20))

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'sop_update',
    actionLabel: 'ویرایش روال استاندارد',
    category: 'sops',
    detail: title,
    entityId: id,
  })

  return ok({ sop: { id } })
}

/** DELETE /api/sops?id= — managers */
export async function DELETE(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!isManager(me)) return fail('فقط مدیران می‌توانند روال را حذف کنند', 403)

  const id = req.nextUrl.searchParams.get('id') || ''
  const sop = await db.sop.findUnique({ where: { id } })
  if (!sop) return fail('روال یافت نشد', 404)

  await db.sop.delete({ where: { id } })
  await db.setting.deleteMany({ where: { key: roleKeySetting(id) } })

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'sop_delete',
    actionLabel: 'حذف روال استاندارد',
    category: 'sops',
    detail: sop.title,
    entityId: id,
  })

  return ok({ deleted: id })
}

/** PATCH /api/sops — همان PUT (نام مستعار؛ سازگاری با فراخوانی‌های جدید) */
export async function PATCH(req: NextRequest) {
  return PUT(req)
}
