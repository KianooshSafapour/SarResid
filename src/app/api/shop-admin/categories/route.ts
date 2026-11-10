import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { getShopSettingsLite as getShopSettings, safeJsonGroups } from '@/lib/shop-admin-helpers'

export const dynamic = 'force-dynamic'

/** GET /api/shop-admin/categories — دسته‌های نمایشی + گروه‌های هلو نگاشت‌نشده + پیشنهاد ادغام */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN'].includes(user.role)) return fail('فقط مدیران', 403)

  const settings = await getShopSettings()
  const [cats, groupRows] = await Promise.all([
    db.shopCategory.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.product.groupBy({
      by: ['mainGroup'],
      where: { active: true, status: 'فعال', OR: [{ sellPrice: { gt: 0 } }, { sellPrice2: { gt: 0 } }] },
      _count: { _all: true },
    }),
  ])
  const countByGroup = new Map<string, number>()
  for (const r of groupRows) {
    const name = (r.mainGroup || '').trim()
    if (!name) continue
    countByGroup.set(name, (countByGroup.get(name) || 0) + r._count._all)
  }
  const mapped = new Set(cats.flatMap((c) => safeJsonGroups(c.groupsJson)))

  // گروه‌های خام قابل‌نگاشت (بدون گروه‌های اداری پنهان)
  const rawGroups = [...countByGroup.entries()]
    .filter(([name]) => !settings.hiddenGroups.includes(name))
    .map(([name, count]) => ({ name, count, mapped: mapped.has(name) }))
    .sort((a, b) => b.count - a.count)

  // پیشنهاد ادغام: نرمال‌سازی با حذف پیشوند «گروه » → نام‌های هم‌ارز
  const norm = (n: string) => n.replace(/^\s*گروه\s+/, '').replace(/\s+/g, ' ').trim()
  const byNorm = new Map<string, string[]>()
  for (const g of rawGroups) {
    const k = norm(g.name)
    byNorm.set(k, [...(byNorm.get(k) || []), g.name])
  }
  const mergeSuggestions = [...byNorm.entries()]
    .filter(([, names]) => new Set(names).size > 1)
    .map(([normalized, names]) => ({ normalized, groups: [...new Set(names)] }))

  const categories = cats.map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    sortOrder: c.sortOrder,
    active: c.active,
    groups: safeJsonGroups(c.groupsJson),
    count: safeJsonGroups(c.groupsJson).reduce((s, g) => s + (countByGroup.get(g) || 0), 0),
  }))

  return ok({ categories, rawGroups, mergeSuggestions })
}

/** POST /api/shop-admin/categories — دستهٔ جدید {name, emoji?, groups[]} */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN'].includes(user.role)) return fail('فقط مدیران', 403)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const name = String(body.name ?? '').trim().slice(0, 50)
  if (name.length < 2) return fail('نام دسته را وارد کنید')
  const exists = await db.shopCategory.findUnique({ where: { name } })
  if (exists) return fail('دسته‌ای با این نام هست', 409)
  const groups = Array.isArray(body.groups) ? body.groups.map((g) => String(g).trim()).filter(Boolean).slice(0, 20) : []
  const row = await db.shopCategory.create({
    data: {
      name,
      emoji: String(body.emoji ?? '🛒').slice(0, 8) || '🛒',
      groupsJson: JSON.stringify(groups),
      sortOrder: Number(body.sortOrder) || 100,
    },
  })
  return ok({ category: row })
}
