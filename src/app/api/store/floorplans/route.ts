import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canFloorplan } from '@/lib/access'

export const dynamic = 'force-dynamic'

/** GET /api/store/floorplans → {plans:[{id,name,width,height,blocks:[...]}]} */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canFloorplan(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const plans = await db.floorplan.findMany({ include: { blocks: true } })
  return ok({
    plans: plans.map((p) => ({
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
    })),
  })
}

/** POST /api/store/floorplans {name,width,height} → {id, plan} */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canFloorplan(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return fail('نام نقشه را وارد کنید')
  const width = clampDim(body?.width, 2560)
  const height = clampDim(body?.height, 1200)

  const plan = await db.floorplan.create({ data: { name, width, height } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'floorplan.create',
    actionLabel: 'نقشه فروشگاه',
    category: 'floorplan',
    detail: name,
    entityId: plan.id,
  })
  return ok({
    id: plan.id,
    plan: { id: plan.id, name: plan.name, width: plan.width, height: plan.height, blocks: [] },
  })
}

function clampDim(v: unknown, dflt: number): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return dflt
  return Math.min(20000, Math.max(200, Math.round(n)))
}
