import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { safeJsonGroups } from '@/lib/shop-admin-helpers'

export const dynamic = 'force-dynamic'

async function managerOnly() {
  const user = await getSessionUser()
  if (!user) return { user: null, denied: fail('ابتدا وارد شوید', 401) }
  if (!['OWNER', 'GM', 'ADMIN'].includes(user.role)) return { user, denied: fail('فقط مدیران', 403) }
  return { user, denied: null }
}

/** PUT /api/shop-admin/categories/[id] — ویرایش نام/ایموجی/گروه‌ها/ترتیب/فعال بودن */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await managerOnly()
  if (denied) return denied
  const { id } = await params
  const row = await db.shopCategory.findUnique({ where: { id } })
  if (!row) return fail('دسته پیدا نشد', 404)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const name = body.name !== undefined ? String(body.name).trim().slice(0, 50) : row.name
  if (name.length < 2) return fail('نام دسته را کامل وارد کنید')
  if (name !== row.name) {
    const dup = await db.shopCategory.findUnique({ where: { name } })
    if (dup) return fail('دسته‌ای با این نام هست', 409)
  }
  const groups = body.groups !== undefined
    ? (Array.isArray(body.groups) ? body.groups.map((g) => String(g).trim()).filter(Boolean).slice(0, 20) : [])
    : safeJsonGroups(row.groupsJson)

  const updated = await db.shopCategory.update({
    where: { id },
    data: {
      name,
      emoji: body.emoji !== undefined ? String(body.emoji).slice(0, 8) || '🛒' : row.emoji,
      groupsJson: JSON.stringify(groups),
      sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) || 100 : row.sortOrder,
      active: body.active !== undefined ? body.active === true : row.active,
    },
  })
  return ok({ category: { ...updated, groups } })
}

/** DELETE /api/shop-admin/categories/[id] */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await managerOnly()
  if (denied) return denied
  const { id } = await params
  const row = await db.shopCategory.findUnique({ where: { id } })
  if (!row) return fail('دسته پیدا نشد', 404)
  await db.shopCategory.delete({ where: { id } })
  return ok({ deleted: true })
}
