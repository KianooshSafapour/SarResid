import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canFloorplan } from '@/lib/access'

export const dynamic = 'force-dynamic'

interface BlockPayload {
  kind?: unknown
  x?: unknown
  y?: unknown
  w?: unknown
  h?: unknown
  rotation?: unknown
  label?: unknown
  zoneName?: unknown
  meta?: unknown
}

function blockData(b: BlockPayload) {
  if (!b || typeof b !== 'object') return null
  const kind = typeof b.kind === 'string' && b.kind ? b.kind : 'CUSTOM'
  const label = typeof b.label === 'string' && b.label.trim() ? b.label.trim() : null
  const zoneName = typeof b.zoneName === 'string' && b.zoneName.trim() ? b.zoneName.trim() : null
  let metaJson: string | null = null
  if (b.meta && typeof b.meta === 'object' && !Array.isArray(b.meta)) {
    const entries = Object.entries(b.meta as Record<string, unknown>).filter(
      ([, v]) => v !== undefined && v !== null && v !== '',
    )
    if (entries.length > 0) metaJson = JSON.stringify(Object.fromEntries(entries))
  }
  return {
    kind,
    x: Math.round(Number(b.x) || 0),
    y: Math.round(Number(b.y) || 0),
    w: Math.round(Number(b.w) || 0),
    h: Math.round(Number(b.h) || 0),
    rotation: Math.round(Number(b.rotation) || 0),
    label,
    zoneName,
    metaJson,
  }
}

function serializePlan(p: { id: string; name: string; width: number; height: number; blocks: Array<{ id: string; kind: string; x: number; y: number; w: number; h: number; rotation: number; label: string | null; zoneName: string | null; metaJson: string | null }> }) {
  return {
    id: p.id,
    name: p.name,
    width: p.width,
    height: p.height,
    blocks: p.blocks.map((b) => ({
      id: b.id,
      kind: b.kind,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      rotation: b.rotation,
      label: b.label,
      zoneName: b.zoneName,
      meta: safeJson<Record<string, unknown>>(b.metaJson, {}),
    })),
  }
}

type RouteContext = { params: Promise<{ id: string }> }

/** PATCH /api/store/floorplans/[id] — {name?,width?,height?} OR {blocks:[...]} → {plan} */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canFloorplan(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const { id } = await ctx.params
  const plan = await db.floorplan.findUnique({ where: { id } })
  if (!plan) return fail('نقشه یافت نشد', 404)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  if (Array.isArray(body.blocks)) {
    // Replace the whole block set (live editor "ذخیره تغییرات")
    const rows = body.blocks
      .map((b: BlockPayload) => blockData(b))
      .filter((d: ReturnType<typeof blockData>) => d !== null && d!.w > 0 && d!.h > 0)
    await db.$transaction([
      db.floorBlock.deleteMany({ where: { planId: id } }),
      db.floorBlock.createMany({ data: rows.map((r) => ({ ...r, planId: id })) }),
    ])
    await logActivity({
      userId: user.id,
      userName: user.fullName,
      action: 'floorplan.update',
      actionLabel: 'نقشه فروشگاه',
      category: 'floorplan',
      detail: `${plan.name} — ${rows.length} بلوک`,
      entityId: id,
    })
  } else {
    const data: { name?: string; width?: number; height?: number } = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (body.width !== undefined) data.width = Math.max(200, Math.round(Number(body.width) || plan.width))
    if (body.height !== undefined) data.height = Math.max(200, Math.round(Number(body.height) || plan.height))
    if (Object.keys(data).length > 0) {
      await db.floorplan.update({ where: { id }, data })
      await logActivity({
        userId: user.id,
        userName: user.fullName,
        action: 'floorplan.update',
        actionLabel: 'نقشه فروشگاه',
        category: 'floorplan',
        detail: data.name ?? plan.name,
        entityId: id,
      })
    }
  }

  const fresh = await db.floorplan.findUnique({ where: { id }, include: { blocks: true } })
  return ok({ plan: serializePlan(fresh!) })
}

/** DELETE /api/store/floorplans/[id] → archive (hard delete; blocks cascade) */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canFloorplan(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const { id } = await ctx.params
  const plan = await db.floorplan.findUnique({ where: { id } })
  if (!plan) return fail('نقشه یافت نشد', 404)

  await db.floorplan.delete({ where: { id } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'floorplan.delete',
    actionLabel: 'نقشه فروشگاه',
    category: 'floorplan',
    detail: plan.name,
    entityId: id,
  })
  return ok({ deleted: true })
}
