import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

/**
 * B3 outline payload (Floorplan.outlineJson): [[x,y],...] — the store's real outline polygon.
 * Accepts a JSON string or an already-parsed array of [x,y] pairs or {x,y} objects.
 * Returns normalized pairs (null = clear) or a Persian error message.
 */
export function parseOutline(
  v: unknown,
  width: number,
  height: number,
): { pairs: number[][] | null; error: string | null } {
  if (v === null || v === undefined || v === '') return { pairs: null, error: null }
  let raw: unknown = v
  if (typeof v === 'string') {
    try {
      raw = JSON.parse(v)
    } catch {
      return { pairs: null, error: 'ساختار خط دور نقشه معتبر نیست (JSON نامعتبر)' }
    }
  }
  if (!Array.isArray(raw)) return { pairs: null, error: 'خط دور نقشه باید فهرستی از نقاط باشد' }
  if (raw.length > 500) return { pairs: null, error: 'تعداد نقاط خط دور بیش از حد مجاز است' }
  const pairs: number[][] = []
  for (const item of raw) {
    let x: number
    let y: number
    if (Array.isArray(item) && item.length >= 2) {
      x = Number(item[0])
      y = Number(item[1])
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      x = Number((item as { x?: unknown }).x)
      y = Number((item as { y?: unknown }).y)
    } else {
      return { pairs: null, error: 'هر نقطهٔ خط دور باید به شکل [x,y] یا {x,y} باشد' }
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { pairs: null, error: 'مختصات نقاط خط دور باید عدد باشد' }
    }
    if (x < 0 || x > width || y < 0 || y > height) {
      return { pairs: null, error: 'مختصات نقاط خط دور خارج از ابعاد طرح است' }
    }
    pairs.push([x, y])
  }
  if (pairs.length < 4) return { pairs: null, error: 'خط دور نقشه باید حداقل ۴ نقطه داشته باشد' }
  return { pairs, error: null }
}

/** GET /api/store/floorplans → {plans:[{id,name,width,height,outlineJson,blocks:[...]}]} */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'store/floorplan')
  if (!gate.ok) return fail(gate.deny, 403)

  const plans = await db.floorplan.findMany({ include: { blocks: true } })
  return ok({
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      width: p.width,
      height: p.height,
      outlineJson: safeJson<number[][] | null>(p.outlineJson, null),
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

/** POST /api/store/floorplans {name,width,height,outlineJson?} → {id, plan} */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'store/floorplan')
  if (!gate.ok) return fail(gate.deny, 403)

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return fail('نام نقشه را وارد کنید')
  const width = clampDim(body?.width, 2560)
  const height = clampDim(body?.height, 1200)

  // B3: optional real-store outline polygon
  let outlineJson: string | null = null
  if (body?.outlineJson !== undefined && body?.outlineJson !== null && body?.outlineJson !== '') {
    const outline = parseOutline(body.outlineJson, width, height)
    if (outline.error) return fail(outline.error)
    outlineJson = outline.pairs ? JSON.stringify(outline.pairs) : null
  }

  const plan = await db.floorplan.create({ data: { name, width, height, outlineJson } })
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
    plan: {
      id: plan.id,
      name: plan.name,
      width: plan.width,
      height: plan.height,
      outlineJson: safeJson<number[][] | null>(plan.outlineJson, null),
      blocks: [],
    },
  })
}

function clampDim(v: unknown, dflt: number): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return dflt
  return Math.min(20000, Math.max(200, Math.round(n)))
}
