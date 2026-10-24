import { db } from '@/lib/db'
import { ok, fail, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { getLowStockSettings, computeThreshold } from '@/lib/lowstock'

export const dynamic = 'force-dynamic'

/** live board: all managers + PM + SK + MERCH (نیروی چیدمان — تابلوی شارژ ردیف‌ها، R5-E) */
const BOARD_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK', 'MERCH']

/** pick the planogram representing a block label: prefer PUBLISHED, then latest update */
function pickPlanogram<T extends { id: string; status: string; updatedAt: Date }>(list: T[]): T | null {
  if (list.length === 0) return null
  const sorted = [...list].sort((a, b) => {
    const pa = a.status === 'PUBLISHED' ? 1 : 0
    const pb = b.status === 'PUBLISHED' ? 1 : 0
    if (pa !== pb) return pb - pa
    return b.updatedAt.getTime() - a.updatedAt.getTime()
  })
  return sorted[0]
}

/** non-null product ids from cellsJson (flat or nested array) */
function cellProducts(cellsJson: string): string[] {
  const cells = safeJson<unknown[]>(cellsJson, [])
  const flat = Array.isArray(cells) && Array.isArray(cells[0]) ? (cells as unknown[][]).flat() : cells
  return flat.filter((c): c is string => typeof c === 'string' && !!c)
}

/** GET /api/floorplan-stats → realtime per-block stats for the live board (no caching) */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!BOARD_ROLES.includes(user.role)) return fail('دسترسی به نقشه زنده فروشگاه ندارید', 403)

  const plan = await db.floorplan.findFirst({ include: { blocks: true } })
  if (!plan) return fail('نقشه فروشگاه یافت نشد', 404)

  const [planograms, zones, zoneCounts, settings] = await Promise.all([
    db.planogram.findMany({ where: { blockLabel: { not: null } } }),
    db.zone.findMany(),
    db.zoneCount.findMany({ select: { zoneName: true, status: true } }),
    getLowStockSettings(),
  ])

  // best planogram per block label
  const byLabel = new Map<string, typeof planograms>()
  for (const pg of planograms) {
    if (!pg.blockLabel) continue
    const list = byLabel.get(pg.blockLabel) ?? []
    list.push(pg)
    byLabel.set(pg.blockLabel, list)
  }

  // one product fetch for every referenced planogram cell
  const allProductIds = [...new Set(planograms.flatMap((pg) => cellProducts(pg.cellsJson)))]
  const products = allProductIds.length
    ? await db.product.findMany({
        where: { id: { in: allProductIds } },
        select: {
          id: true,
          name: true,
          stock: true,
          sellPrice: true,
          lowStockThreshold: true,
          reorderLevel: true,
          monthlySold: true,
          leadTimeDays: true,
        },
      })
    : []
  const pMap = new Map(products.map((p) => [p.id, p]))

  const blocks = plan.blocks.map((b) => {
    const meta = safeJson<Record<string, unknown>>(b.metaJson, {})
    const responsible = typeof meta.responsible === 'string' && meta.responsible.trim() ? meta.responsible.trim() : null

    const pg = b.label ? pickPlanogram(byLabel.get(b.label) ?? []) : null
    let productCount = 0
    let distinctProducts = 0
    let lowStock = 0
    let stockTotal = 0
    let topProducts: Array<{ name: string; stock: number; sellPrice: number }> = []

    if (pg) {
      const ids = cellProducts(pg.cellsJson)
      productCount = ids.length
      const distinct = [...new Set(ids)]
        .map((id) => pMap.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p)
      distinctProducts = distinct.length
      lowStock = distinct.filter((p) => {
        const t = computeThreshold(p, settings)
        return t !== null && p.stock <= t
      }).length
      stockTotal = distinct.reduce((s, p) => s + p.stock, 0)
      topProducts = [...distinct]
        .sort((a, b2) => b2.stock - a.stock)
        .slice(0, 5)
        .map((p) => ({ name: p.name, stock: p.stock, sellPrice: p.sellPrice }))
    }

    return {
      id: b.id,
      kind: b.kind,
      label: b.label,
      zoneName: b.zoneName,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      rotation: b.rotation,
      responsible,
      planogramId: pg?.id ?? null,
      planogramStatus: pg?.status ?? null,
      productCount,
      distinctProducts,
      lowStock,
      stockTotal,
      topProducts,
    }
  })

  // zone count health (Agent D semantics: status may be «open», «CONFIRMED», «QUERIED[|reason]»)
  const zoneStats = new Map<string, { pending: number; confirmed: number; queried: number }>()
  for (const zc of zoneCounts) {
    const key = zc.status.split('|')[0].trim().toUpperCase()
    const entry = zoneStats.get(zc.zoneName) ?? { pending: 0, confirmed: 0, queried: 0 }
    if (key === 'CONFIRMED') entry.confirmed++
    else if (key === 'QUERIED') {
      entry.queried++
      entry.pending++
    } else entry.pending++ // open
    zoneStats.set(zc.zoneName, entry)
  }

  return ok({
    plan: { id: plan.id, name: plan.name, width: plan.width, height: plan.height },
    blocks,
    zones: zones.map((z) => ({
      name: z.name,
      type: z.type,
      criticality: z.criticality,
      countFrequency: z.countFrequency,
      ...(zoneStats.get(z.name) ?? { pending: 0, confirmed: 0, queried: 0 }),
    })),
  })
}
