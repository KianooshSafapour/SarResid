import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson, clampInt } from '@/lib/api'
import { getSessionUser, isManager, MANAGER_ROLES } from '@/lib/auth'
import { displayName } from '@/lib/notify'
import { addDaysJalaliDash, todayJalaliDash } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/** product-bearing block kinds (carry goods → column-based date checking) */
function isProductBlock(kind: string): boolean {
  return (
    kind === 'GONDOLA' ||
    kind === 'SHELF' ||
    kind === 'FREEZER_ICECREAM' ||
    kind === 'BAKERY' ||
    kind === 'CUSTOM' ||
    kind.startsWith('FRIDGE_')
  )
}

/** the default (active/first) floorplan */
export async function defaultPlan() {
  return db.floorplan.findFirst({})
}

/** risk-tier cycle length in days by block kind (research round3 — B3) */
export function cycleDaysOfKind(kind: string): number {
  if (kind === 'PRODUCE' || kind === 'DELI' || kind === 'BAKERY' || kind.startsWith('FRIDGE')) return 7
  if (kind === 'SHELF') return 14
  return 28 // GONDOLA | CUSTOM | FREEZER* | default
}

export interface SectionColumnState {
  columns: { id: string; name: string; order: number; active: boolean }[]
  lastCheckedAt: string | null
  lastCheckedColumns: string[]
  nextStart: string | null
  coverage: number // checkedDistinct / activeColumns (%)
}

/** next active column after the rotation cursor (wrap around; skip inactive) */
function nextStartOf(active: { name: string }[], cursor: string | null): string | null {
  if (!active.length) return null
  if (!cursor) return active[0].name
  const idx = active.findIndex((c) => c.name === cursor)
  if (idx === -1) return active[0].name
  return active[(idx + 1) % active.length].name
}

/**
 * Rotation state per blockLabel for a plan (default plan when omitted):
 * columns (all, ordered), last check (≤28 days), cursor → nextStart, coverage %.
 * Shared with /api/date-checks (B3).
 */
export async function columnStatesByBlock(planId?: string): Promise<Map<string, SectionColumnState>> {
  const plan = planId
    ? await db.floorplan.findUnique({ where: { id: planId } })
    : await defaultPlan()
  const map = new Map<string, SectionColumnState>()
  if (!plan) return map

  const cols = await db.zoneColumn.findMany({
    where: { planId: plan.id },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  })
  const byBlock = new Map<string, typeof cols>()
  for (const c of cols) {
    const list = byBlock.get(c.blockLabel) ?? []
    list.push(c)
    byBlock.set(c.blockLabel, list)
  }

  // DateCheck rows with column payloads within the last 28-day cycle
  const cutoff = addDaysJalaliDash(todayJalaliDash(), -27)
  const checks = await db.dateCheck.findMany({
    where: { date: { gte: cutoff }, columnsJson: { not: null } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  })

  for (const [blockLabel, list] of byBlock) {
    const columns = list.map((c) => ({ id: c.id, name: c.name, order: c.order, active: c.active }))
    const active = columns.filter((c) => c.active)
    const blockChecks = checks.filter((ch) => ch.blockLabel === blockLabel)
    const latest = blockChecks[0] || null
    const lastColumns = latest
      ? (safeJson<{ name?: string }[]>(latest.columnsJson, []) ?? [])
          .map((c) => String(c?.name || ''))
          .filter(Boolean)
      : []
    const cursor = lastColumns.length ? lastColumns[lastColumns.length - 1] : null
    // coverage: distinct checked columns in the cycle / active columns
    const distinct = new Set<string>()
    for (const ch of blockChecks) {
      for (const c of safeJson<{ name?: string }[]>(ch.columnsJson, []) ?? []) {
        const n = String(c?.name || '')
        if (n) distinct.add(n)
      }
    }
    map.set(blockLabel, {
      columns,
      lastCheckedAt: latest ? latest.date : null,
      lastCheckedColumns: lastColumns,
      nextStart: nextStartOf(active, cursor),
      coverage: active.length ? Math.round((distinct.size / active.length) * 100) : 0,
    })
  }
  return map
}

/** managers + PM may read the column board */
function canView(role: string): boolean {
  return MANAGER_ROLES.includes(role) || role === 'PM'
}

/**
 * GET /api/store/section-columns?planId=
 * → {planId, sections:[{blockLabel, kind, zone, columns, lastCheckedAt, lastCheckedColumns, nextStart, coverage}]}
 */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!canView(me.role)) return fail('دسترسی به این بخش ندارید', 403)

  const planId = req.nextUrl.searchParams.get('planId') || ''
  const plan = planId ? await db.floorplan.findUnique({ where: { id: planId } }) : await defaultPlan()
  if (!plan) return fail('نقشه فروشگاه یافت نشد', 404)

  const [blocks, states] = await Promise.all([
    db.floorBlock.findMany({ where: { planId: plan.id } }),
    columnStatesByBlock(plan.id),
  ])

  const sections: Record<string, unknown>[] = []
  for (const b of blocks) {
    if (!b.label || !isProductBlock(b.kind)) continue
    const st = states.get(b.label)
    sections.push({
      blockLabel: b.label,
      kind: b.kind,
      zone: b.zoneName || null,
      columns: st?.columns ?? [],
      lastCheckedAt: st?.lastCheckedAt ?? null,
      lastCheckedColumns: st?.lastCheckedColumns ?? [],
      nextStart: st?.nextStart ?? null,
      coverage: st?.coverage ?? 0,
    })
  }

  return ok({ planId: plan.id, planName: plan.name, sections })
}

/**
 * POST /api/store/section-columns {blockLabel, name, order?, planId?} — managers only.
 * Unique per plan+block+name. order defaults to append-at-end.
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!isManager(me)) return fail('فقط مدیران می‌توانند ستون تعریف کنند', 403)

  const body = (await req.json().catch(() => ({}))) as {
    planId?: string
    blockLabel?: string
    name?: string
    order?: number
  }

  const name = String(body.name || '').trim().slice(0, 60)
  if (!name) return fail('نام ستون را وارد کنید')
  const blockLabel = String(body.blockLabel || '').trim()
  if (!blockLabel) return fail('بخش (برچسب بلوک) را انتخاب کنید')

  const plan = body.planId
    ? await db.floorplan.findUnique({ where: { id: String(body.planId) } })
    : await defaultPlan()
  if (!plan) return fail('نقشه فروشگاه یافت نشد', 404)

  const block = await db.floorBlock.findFirst({ where: { planId: plan.id, label: blockLabel } })
  if (!block || !isProductBlock(block.kind)) return fail('بخش موردنظر در نقشه فروشگاه یافت نشد')

  const dup = await db.zoneColumn.findUnique({
    where: { planId_blockLabel_name: { planId: plan.id, blockLabel, name } },
  })
  if (dup) return fail('ستونی با این نام در این بخش قبلاً ثبت شده است')

  const last = await db.zoneColumn.findFirst({
    where: { planId: plan.id, blockLabel },
    orderBy: { order: 'desc' },
  })
  const order = body.order !== undefined ? clampInt(body.order, 0, 9999, 0) : (last?.order ?? -1) + 1

  const column = await db.zoneColumn.create({
    data: { planId: plan.id, blockLabel, name, order },
  })

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'store.section-column',
    actionLabel: 'ستون چیدمان',
    category: 'store',
    detail: `افزودن ستون «${name}» به بخش ${blockLabel}`,
    entityId: column.id,
  })

  return ok({ column })
}
