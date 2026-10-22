import { db } from '@/lib/db'
import { ok, safeJson } from '@/lib/api'
import { getSessionUser, ROLE_LABELS } from '@/lib/auth'
import { effectiveAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

/** GET /api/auth/me — user + tourDone + per-user RBAC (pageDeny/pageAllow/caps) */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return ok({ user: null })

  const [tourRow, access] = await Promise.all([
    db.setting.findUnique({ where: { key: `tour_${user.id}` } }),
    effectiveAccess(user),
  ])
  const tour = safeJson<{ done?: boolean }>(tourRow?.value, {})

  return ok({
    user: {
      ...user,
      roleLabel: ROLE_LABELS[user.role] || user.role,
      tourDone: tour.done === true,
      pageDeny: access.pageDeny,
      pageAllow: access.pageAllow,
      caps: access.caps,
    },
  })
}
