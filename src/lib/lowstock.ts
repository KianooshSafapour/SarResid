/**
 * Shared low-stock threshold logic (Agent API-2) — used by /api/low-stock and /api/floorplan-stats.
 *
 * Threshold per product (Rial-free, pure inventory rule):
 *   lowStockThreshold (manager-set) ?? reorderLevel (Holoo import) ?? computed
 *   computed = ceil(monthlySold × (leadTimeDays + leadBuffer) / 30)
 *   — only when the product actually sells (monthlySold ≥ minMonthlySold); dead catalog
 *     items with no explicit threshold are excluded from auto-analysis (otherwise ~10k
 *     zero-stock catalog entries would flood the list).
 *
 * Settings: defaults:lowstock.leadBuffer (default 2), defaults:lowstock.minMonthlySold (default 1).
 */
import { db } from '@/lib/db'
import { parseSetting } from '@/lib/sms'

export interface LowStockSettings {
  leadBuffer: number
  minMonthlySold: number
}

export async function getLowStockSettings(): Promise<LowStockSettings> {
  const rows = await db.setting.findMany({
    where: { key: { in: ['defaults:lowstock.leadBuffer', 'defaults:lowstock.minMonthlySold'] } },
  })
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const leadBuffer = Math.max(0, Math.round(Number(parseSetting(map.get('defaults:lowstock.leadBuffer'), '2')) || 2))
  const minMonthlySold = Math.max(0, Math.round(Number(parseSetting(map.get('defaults:lowstock.minMonthlySold'), '1')) || 0))
  return { leadBuffer, minMonthlySold }
}

export interface ThresholdProduct {
  lowStockThreshold: number | null
  reorderLevel: number | null
  monthlySold: number
  leadTimeDays: number
}

/** Threshold for one product — null = not analyzable (no explicit level, no sales history). */
export function computeThreshold(p: ThresholdProduct, s: LowStockSettings): number | null {
  if (p.lowStockThreshold !== null && p.lowStockThreshold !== undefined) return p.lowStockThreshold
  if (p.reorderLevel !== null && p.reorderLevel !== undefined) return p.reorderLevel
  if (p.monthlySold >= Math.max(1, s.minMonthlySold)) {
    return Math.ceil((p.monthlySold * (p.leadTimeDays + s.leadBuffer)) / 30)
  }
  return null
}

/** Prisma where-clause for the analyzable universe (products with an explicit level or real sales). */
export function analyzableWhere(s: LowStockSettings) {
  return {
    active: true,
    OR: [{ lowStockThreshold: { not: null } }, { reorderLevel: { not: null } }, { monthlySold: { gte: Math.max(1, s.minMonthlySold) } }],
  }
}
