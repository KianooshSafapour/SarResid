import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { getHolooConfig, isHolooConfigured } from '@/lib/holoo'

export const dynamic = 'force-dynamic'

/** GET /api/holoo/status — وضعیت اتصال هلو (OWNER/GM/ADMIN) */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN'].includes(user.role)) {
    return fail('دسترسی به اتصال هلو فقط برای مدیران ارشد مجاز است', 403)
  }

  const cfg = await getHolooConfig()
  const [lastSyncs, productCount, supplierCount, orderCount] = await Promise.all([
    db.holooSyncLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
    db.product.count({ where: { holooErp: { not: null } } }),
    db.supplier.count({ where: { holooErp: { not: null } } }),
    db.order.count({ where: { holooErp: { not: null } } }),
  ])

  return ok({
    configured: isHolooConfigured(cfg),
    useMock: cfg.useMock,
    baseUrl: cfg.baseUrl,
    mockUrl: cfg.mockUrl,
    username: cfg.username,
    dbname: cfg.dbname,
    enabled: cfg.enabled,
    lastSyncs: lastSyncs.map((l) => ({
      id: l.id,
      kind: l.kind,
      status: l.status,
      stats: l.statsJson,
      error: l.error,
      createdAt: l.createdAt,
    })),
    productCount,
    supplierCount,
    orderCount,
  })
}
