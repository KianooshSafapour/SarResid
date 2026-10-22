import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** GET /api/holoo/log — ۵۰ گزارش آخر سینک هلو (OWNER/GM/ADMIN) */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN'].includes(user.role)) {
    return fail('دسترسی به گزارش سینک هلو فقط برای مدیران ارشد مجاز است', 403)
  }

  const logs = await db.holooSyncLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
  return ok({
    logs: logs.map((l) => ({
      id: l.id,
      kind: l.kind,
      status: l.status,
      stats: l.statsJson,
      error: l.error,
      createdAt: l.createdAt,
    })),
  })
}
