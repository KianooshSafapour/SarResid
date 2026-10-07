import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { canViewApi, hasCap } from '@/lib/rbac'
import { isExecRole } from '@/lib/constants'

/* ─────────────────────────────────────────────────────────────────────────────
 *  پلان فروشگاه — ویرایشگر نقشهٔ دوبعدی با بلوک‌های پیش‌ساخته + زمین چندضلعی (round-17 / 17-C)
 *  GET            → {plans:[{...plan, blocks:[…]}], prefabs}   (shape = JSON رئوس چندضلعی)
 *  POST create-plan  {name, floorIndex, width, height, shape?, unitLabel?}
 *  POST save-blocks  {planId, blocks:[…], shape?, width?, height?, unitLabel?} (جایگزینی کامل تراکنشی)
 *  PATCH/DELETE /[id]  ویرایش/حذف طبقه
 *
 *  shape: "[]" = حالت مستطیلی (width/height)؛ [{x,y}…] = چندضلعی زمین (سانتی‌متر، ۲۰۰ تا ۱۲٬۰۰۰)
 *  اعتبارسنجی سرور: حداقل ۳ رأس، غیرمتقاطع (simple)، محدودهٔ ۰..۱۲۰۰۰، کمترین ضلع ≥ ۲۰۰ — کوژ (concave) مجاز است.
 *  دسترسی خواندن: canViewApi 'floorplan' — نوشتن: exec یا cap planogram.manage
 * ────────────────────────────────────────────────────────────────────────────*/

/** کتابخانهٔ بلوک‌های پیش‌ساخته — مطابق تجهیزات رایج فروشگاه‌های زنجیره‌ای ایران */
export const PREFABS: Array<{ kind: string; label: string; w: number; h: number; color: string; icon: string }> = [
  { kind: 'AISLE', label: 'راهرو مرکزی', w: 420, h: 60, color: '#77934a', icon: '↔' },
  { kind: 'SHELF', label: 'قفسه (شیلف)', w: 240, h: 40, color: '#0e7a4a', icon: '▤' },
  { kind: 'GONDOLA', label: 'گاندولای دوطرفه', w: 260, h: 70, color: '#0b5c38', icon: '▥' },
  { kind: 'FRIDGE_CLOSED', label: 'یخچال دربستهٔ عمودی', w: 200, h: 40, color: '#2e6f6a', icon: '🧊' },
  { kind: 'FRIDGE_OPEN', label: 'یخچال باز (اسلون)', w: 220, h: 50, color: '#3d857c', icon: '❄' },
  { kind: 'FRIDGE_SHOWCASE', label: 'ویترین نمایش', w: 140, h: 50, color: '#4d9a90', icon: '🥤' },
  { kind: 'FREEZER_ICECREAM', label: 'فریزر بستنی', w: 120, h: 70, color: '#7fb3ae', icon: '🍨' },
  { kind: 'CASHIER_U', label: 'صندوق U (تسمه‌نقاله دوطرفه)', w: 200, h: 140, color: '#c9a227', icon: '🛒' },
  { kind: 'CHECKOUT', label: 'خط صندوق', w: 180, h: 40, color: '#8a6d10', icon: '💳' },
  { kind: 'ENTRANCE', label: 'ورودی/خروجی', w: 120, h: 40, color: '#b3372f', icon: '🚪' },
  { kind: 'STORAGE', label: 'انبار/بارگیر', w: 200, h: 120, color: '#6b5b3e', icon: '📦' },
  { kind: 'PRODUCE', label: 'میوه و سبزیجات', w: 180, h: 90, color: '#5a8f3c', icon: '🍎' },
  { kind: 'BAKERY', label: 'نان‌وایی', w: 150, h: 80, color: '#c96f4a', icon: '🥖' },
  { kind: 'DELI', label: 'پروتئین و سالاد', w: 150, h: 70, color: '#a5573a', icon: '🍗' },
  { kind: 'CUSTOM', label: 'فضای سفارشی', w: 100, h: 100, color: '#9c8b6a', icon: '⬚' },
]

const FLOOR_MIN = 200
const FLOOR_MAX = 12000

type BlockIn = { id?: string; kind?: string; x?: number; y?: number; w?: number; h?: number; rotation?: number; label?: string; zoneName?: string; meta?: unknown }
type Vertex = { x: number; y: number }

/* ── هندسهٔ چندضلعی (اعتبارسنجی سرور) ── */

function cross(o: Vertex, a: Vertex, b: Vertex): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}
function onSeg(p: Vertex, q: Vertex, r: Vertex): boolean {
  // آیا q روی پاره‌خط pr قرار دارد؟ (با هم‌خطی)
  return (
    Math.min(p.x, r.x) - 0.01 <= q.x && q.x <= Math.max(p.x, r.x) + 0.01 &&
    Math.min(p.y, r.y) - 0.01 <= q.y && q.y <= Math.max(p.y, r.y) + 0.01 &&
    Math.abs(cross(p, q, r)) < 0.01
  )
}
function segInt(p1: Vertex, p2: Vertex, p3: Vertex, p4: Vertex): boolean {
  const d1 = cross(p3, p4, p1)
  const d2 = cross(p3, p4, p2)
  const d3 = cross(p1, p2, p3)
  const d4 = cross(p1, p2, p4)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  if (Math.abs(d1) < 0.01 && onSeg(p3, p1, p4)) return true
  if (Math.abs(d2) < 0.01 && onSeg(p3, p2, p4)) return true
  if (Math.abs(d3) < 0.01 && onSeg(p1, p3, p2)) return true
  if (Math.abs(d4) < 0.01 && onSeg(p1, p4, p2)) return true
  return false
}
/** چندضلعی ساده = بدون تلاقی خطوط (کوژ مجاز است) */
function polygonIsSimple(verts: Vertex[]): boolean {
  const n = verts.length
  if (n < 3) return true
  const pts: Vertex[] = []
  for (const v of verts) {
    const last = pts[pts.length - 1]
    if (last && Math.abs(last.x - v.x) < 0.5 && Math.abs(last.y - v.y) < 0.5) continue
    pts.push(v)
  }
  if (pts.length >= 2) {
    const f = pts[0]
    const l = pts[pts.length - 1]
    if (Math.abs(f.x - l.x) < 0.5 && Math.abs(f.y - l.y) < 0.5) pts.pop()
  }
  const m = pts.length
  if (m < 3) return false
  for (let i = 0; i < m; i++) {
    const a1 = pts[i]
    const a2 = pts[(i + 1) % m]
    for (let j = i + 1; j < m; j++) {
      if (j === i + 1) continue
      if (i === 0 && j === m - 1) continue
      if (segInt(a1, a2, pts[j], pts[(j + 1) % m])) return false
    }
  }
  return true
}
function polyBBox(verts: Vertex[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const v of verts) {
    if (v.x < minX) minX = v.x
    if (v.y < minY) minY = v.y
    if (v.x > maxX) maxX = v.x
    if (v.y > maxY) maxY = v.y
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}

type ShapeResult = { ok: true; verts: Vertex[] } | { ok: false; error: string }

/** پارس و اعتبارسنجی shape ورودی — [] یعنی حالت مستطیلی */
function parseShape(raw: unknown): ShapeResult {
  let arr: unknown = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return { ok: false, error: 'قالب چندضلعی زمین نامعتبر است' }
    }
  }
  if (!Array.isArray(arr)) return { ok: false, error: 'قالب چندضلعی زمین نامعتبر است' }
  if (arr.length === 0) return { ok: true, verts: [] }
  if (arr.length < 3) return { ok: false, error: 'چندضلعی زمین حداقل ۳ رأس لازم دارد' }
  if (arr.length > 200) return { ok: false, error: 'حداکثر ۲۰۰ رأس برای زمین مجاز است' }
  const verts: Vertex[] = []
  for (const v of arr as Array<{ x?: unknown; y?: unknown }>) {
    const x = Math.round(Number(v?.x))
    const y = Math.round(Number(v?.y))
    if (!isFinite(x) || !isFinite(y)) return { ok: false, error: 'مختصات رأس چندضلعی نامعتبر است' }
    if (x < 0 || y < 0 || x > FLOOR_MAX || y > FLOOR_MAX)
      return { ok: false, error: 'رئوس زمین باید در محدودهٔ ۰ تا ۱۲٬۰۰۰ سانتی‌متر باشند' }
    const last = verts[verts.length - 1]
    if (last && Math.abs(last.x - x) < 1 && Math.abs(last.y - y) < 1) continue
    verts.push({ x, y })
  }
  if (verts.length >= 2) {
    const f = verts[0]
    const l = verts[verts.length - 1]
    if (Math.abs(f.x - l.x) < 1 && Math.abs(f.y - l.y) < 1) verts.pop()
  }
  if (verts.length < 3) return { ok: false, error: 'چندضلعی زمین حداقل ۳ رأس مجزا لازم دارد' }
  if (!polygonIsSimple(verts)) return { ok: false, error: 'خطوط زمین نباید همدیگر را قطع کنند (چندضلعی متقاطع مجاز نیست)' }
  const bb = polyBBox(verts)
  if (bb.w < FLOOR_MIN || bb.h < FLOOR_MIN)
    return { ok: false, error: 'کمترین ضلع زمین باید حداقل ۲۰۰ سانتی‌متر (۲ متر) باشد' }
  return { ok: true, verts }
}

function clampDim(v: unknown, d: number): number {
  const n = Math.round(Number(v))
  return isFinite(n) ? Math.max(FLOOR_MIN, Math.min(FLOOR_MAX, n)) : d
}

function sanitizeBlock(b: BlockIn) {
  const kind = PREFABS.some((p) => p.kind === b.kind) ? String(b.kind) : 'CUSTOM'
  const clamp = (v: unknown, min: number, max: number, d: number) => {
    const n = Math.round(Number(v))
    return isFinite(n) ? Math.max(min, Math.min(max, n)) : d
  }
  const meta = b.meta && typeof b.meta === 'object' && !Array.isArray(b.meta) ? b.meta : {}
  return {
    kind,
    x: clamp(b.x, -2000, FLOOR_MAX, 0),
    y: clamp(b.y, -2000, FLOOR_MAX, 0),
    w: clamp(b.w, 20, FLOOR_MAX, 120),
    h: clamp(b.h, 20, FLOOR_MAX, 60),
    rotation: [0, 90, 180, 270].includes(clamp(b.rotation, 0, 359, 0)) ? clamp(b.rotation, 0, 359, 0) : 0,
    label: String(b.label || '').slice(0, 80),
    zoneName: String(b.zoneName || '').slice(0, 80),
    meta: JSON.stringify(meta).slice(0, 2000),
  }
}

async function canRead(req: Request): Promise<boolean> {
  const me = await getSessionUser(req)
  if (!me) return false
  return canViewApi(me, 'floorplan')
}

async function canWrite(req: Request): Promise<boolean> {
  const me = await getSessionUser(req)
  if (!me) return false
  if (isExecRole(me.role)) return true
  return hasCap(me, 'planogram.manage')
}

export async function GET(req: Request) {
  if (!(await canRead(req))) return fail('ابتدا وارد شوید یا دسترسی لازم را بگیرید', 401)
  const plans = await db.floorPlan.findMany({ where: { archived: false }, orderBy: { floorIndex: 'asc' } })
  const blocks = await db.floorBlock.findMany({ orderBy: { kind: 'asc' } })
  const byPlan = new Map<string, typeof blocks>()
  for (const b of blocks) {
    const list = byPlan.get(b.planId) || []
    list.push(b)
    byPlan.set(b.planId, list)
  }
  return json({
    plans: plans.map((p) => ({ ...p, blocks: byPlan.get(p.id) || [] })),
    prefabs: PREFABS,
  })
}

export async function POST(req: Request) {
  if (!(await canWrite(req))) return fail('دسترسی ویرایش پلان را ندارید', 403)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const action = String(body.action || '')
  const me = await getSessionUser(req)

  if (action === 'create-plan') {
    const name = String(body.name || '').trim().slice(0, 80)
    if (!name) return fail('نام طبقه الزامی است')
    const floorIndex = Math.max(0, Math.min(20, Math.round(Number(body.floorIndex) || 0)))
    let width = clampDim(body.width, 1200)
    let height = clampDim(body.height, 800)
    let shapeStr = '[]'
    if (body.shape !== undefined) {
      const sh = parseShape(body.shape)
      if (!sh.ok) return fail(sh.error, 400)
      if (sh.verts.length >= 3) {
        const bb = polyBBox(sh.verts)
        shapeStr = JSON.stringify(sh.verts)
        width = bb.w
        height = bb.h
      }
    }
    const unitLabel = String(body.unitLabel || 'سانتی‌متر').slice(0, 40)
    const plan = await db.floorPlan.create({ data: { name, floorIndex, width, height, shape: shapeStr, unitLabel } })
    await logActivity(me!, `پلان «${name}» ساخته شد`, 'floorplan', plan.id, name)
    return json({ ok: true, plan })
  }

  if (action === 'save-blocks') {
    const planId = String(body.planId || '')
    const plan = await db.floorPlan.findUnique({ where: { id: planId } })
    if (!plan) return fail('پلان یافت نشد', 404)
    const list = Array.isArray(body.blocks) ? (body.blocks as BlockIn[]) : []
    if (list.length > 500) return fail('حداکثر ۵۰۰ بلوک برای هر طبقه مجاز است')
    const clean = list.map(sanitizeBlock)

    // دادهٔ به‌روزرسانی پلان (shape/ابعاد) — داخل همان تراکنش جایگزینی بلوک‌ها
    let planData: Record<string, unknown> | null = null
    if (body.shape !== undefined) {
      const sh = parseShape(body.shape)
      if (!sh.ok) return fail(sh.error, 400)
      const unitLabel = String(body.unitLabel || plan.unitLabel || 'سانتی‌متر').slice(0, 40)
      if (sh.verts.length >= 3) {
        const bb = polyBBox(sh.verts)
        planData = { shape: JSON.stringify(sh.verts), width: bb.w, height: bb.h, unitLabel }
      } else {
        planData = { shape: '[]', width: clampDim(body.width, plan.width), height: clampDim(body.height, plan.height), unitLabel }
      }
    } else if (body.width !== undefined || body.height !== undefined) {
      planData = { width: clampDim(body.width, plan.width), height: clampDim(body.height, plan.height) }
    }

    const [, , plan2] = await db.$transaction([
      db.floorBlock.deleteMany({ where: { planId } }),
      db.floorBlock.createMany({ data: clean.map((b) => ({ ...b, planId })) }),
      db.floorPlan.update({ where: { id: planId }, data: planData || {} }),
    ])
    const blocks2 = await db.floorBlock.findMany({ where: { planId }, orderBy: { kind: 'asc' } })
    const shapeNote = planData?.shape && planData.shape !== '[]' ? '، زمین چندضلعی' : ''
    await logActivity(me!, `پلان «${plan2.name}» ذخیره شد (${clean.length} بلوک${shapeNote})`, 'floorplan', planId, String(clean.length))
    return json({ ok: true, count: clean.length, plan: { ...plan2, blocks: blocks2 } })
  }

  return fail('عملیات نامعتبر است', 400)
}

export async function PATCH(req: Request) {
  if (!(await canWrite(req))) return fail('دسترسی ویرایش پلان را ندارید', 403)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = String(body.id || '')
  const plan = await db.floorPlan.findUnique({ where: { id } })
  if (!plan) return fail('پلان یافت نشد', 404)
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = String(body.name || '').trim().slice(0, 80)
    if (!name) return fail('نام طبقه الزامی است')
    data.name = name
  }
  if (body.shape !== undefined) {
    const sh = parseShape(body.shape)
    if (!sh.ok) return fail(sh.error, 400)
    if (sh.verts.length >= 3) {
      const bb = polyBBox(sh.verts)
      data.shape = JSON.stringify(sh.verts)
      data.width = bb.w
      data.height = bb.h
    } else {
      data.shape = '[]'
    }
  }
  if (body.unitLabel !== undefined) data.unitLabel = String(body.unitLabel || 'سانتی‌متر').slice(0, 40)
  if (body.width !== undefined && data.shape === undefined) data.width = clampDim(body.width, plan.width)
  if (body.height !== undefined && data.shape === undefined) data.height = clampDim(body.height, plan.height)
  if (body.floorIndex !== undefined) data.floorIndex = Math.max(0, Math.min(20, Math.round(Number(body.floorIndex) || 0)))
  if (body.archived !== undefined) data.archived = !!body.archived
  const plan2 = await db.floorPlan.update({ where: { id }, data })
  await logActivity(await getSessionUser(req), `پلان «${plan2.name}» ویرایش شد`, 'floorplan', id, JSON.stringify(data))
  return json({ ok: true, plan: plan2 })
}

export async function DELETE(req: Request) {
  if (!(await canWrite(req))) return fail('دسترسی ویرایش پلان را ندارید', 403)
  const url = new URL(req.url)
  const id = url.searchParams.get('id') || ''
  const plan = await db.floorPlan.findUnique({ where: { id } })
  if (!plan) return fail('پلان یافت نشد', 404)
  await db.$transaction([db.floorBlock.deleteMany({ where: { planId: id } }), db.floorPlan.delete({ where: { id } })])
  await logActivity(await getSessionUser(req), `پلان «${plan.name}» حذف شد`, 'floorplan', id, '')
  return json({ ok: true })
}
