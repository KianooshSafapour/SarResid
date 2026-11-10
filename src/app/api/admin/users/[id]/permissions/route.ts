import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, ROLE_LABELS } from '@/lib/auth'
import { userCan, isValidPermKey } from '@/lib/access'
import { toEnDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

interface PermPayload {
  upserts?: { pageKey?: unknown; allow?: unknown }[]
  removals?: unknown[]
}

export interface PermActor {
  id: string
  fullName: string
}

export interface PermTarget {
  id: string
  fullName: string
  username: string
}

/**
 * Shared permission-write engine (used by PUT /api/admin/users/[id]/permissions
 * and PATCH /api/admin/users). Validates keys, upserts/removes overrides, logs.
 */
export async function applyPermissionChanges(
  actor: PermActor,
  target: PermTarget,
  perms: PermPayload,
) {
  const upserts = Array.isArray(perms.upserts) ? perms.upserts : []
  const removals = Array.isArray(perms.removals) ? perms.removals.map((r) => String(r ?? '')) : []
  if (upserts.length === 0 && removals.length === 0) {
    return fail('تغییری برای ذخیره وجود ندارد')
  }

  const cleanUpserts: { pageKey: string; allow: boolean }[] = []
  for (const u of upserts) {
    const pageKey = String(u?.pageKey ?? '').trim()
    if (!isValidPermKey(pageKey)) return fail(`کلید دسترسی نامعتبر است: ${pageKey}`)
    cleanUpserts.push({ pageKey, allow: u?.allow !== false && u?.allow !== 'false' }) // default allow=true
  }
  for (const pageKey of removals) {
    if (!isValidPermKey(pageKey)) return fail(`کلید دسترسی نامعتبر است: ${pageKey}`)
  }

  for (const u of cleanUpserts) {
    await db.userPermOverride.upsert({
      where: { userId_pageKey: { userId: target.id, pageKey: u.pageKey } },
      create: { userId: target.id, pageKey: u.pageKey, allow: u.allow },
      update: { allow: u.allow },
    })
  }
  for (const pageKey of removals) {
    await db.userPermOverride
      .deleteMany({ where: { userId: target.id, pageKey } })
      .catch(() => {})
  }

  await logActivity({
    userId: actor.id,
    userName: actor.fullName,
    action: 'users.permissions',
    actionLabel: 'دسترسی‌های کاربر',
    category: 'user',
    detail: `${target.fullName} (${target.username}) — ${toEnDigits(String(cleanUpserts.length))} تغییر، ${toEnDigits(String(removals.length))} حذف`,
    entityId: target.id,
  })

  const overrides = await db.userPermOverride.findMany({
    where: { userId: target.id },
    orderBy: { createdAt: 'desc' },
  })
  return ok({
    overrides: overrides.map((o) => ({ pageKey: o.pageKey, allow: o.allow })),
    upserted: cleanUpserts.length,
    removed: removals.length,
  })
}

/** GET /api/admin/users/[id]/permissions → { overrides:[{pageKey,allow,createdAt}] } */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await userCan(me, 'manageUsers'))) return fail('دسترسی به این بخش ندارید', 403)

  const { id } = await ctx.params
  const target = await db.user.findUnique({ where: { id } })
  if (!target) return fail('کاربر یافت نشد', 404)

  const overrides = await db.userPermOverride.findMany({
    where: { userId: id },
    orderBy: { createdAt: 'desc' },
  })
  return ok({
    overrides: overrides.map((o) => ({
      pageKey: o.pageKey,
      allow: o.allow,
      createdAt: o.createdAt.toISOString(),
    })),
    user: { id: target.id, fullName: target.fullName, username: target.username, role: target.role },
  })
}

/** PUT /api/admin/users/[id]/permissions { upserts:[{pageKey,allow}], removals:[pageKey] } */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await userCan(me, 'manageUsers'))) return fail('دسترسی به این بخش ندارید', 403)

  const { id } = await ctx.params
  const target = await db.user.findUnique({ where: { id } })
  if (!target) return fail('کاربر یافت نشد', 404)

  const perms = (await req.json().catch(() => null)) as PermPayload | null
  if (!perms || typeof perms !== 'object') return fail('درخواست نامعتبر است')

  return applyPermissionChanges(me, target, perms)
}
