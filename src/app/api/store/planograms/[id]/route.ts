import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canPlanogram } from '@/lib/access'

export const dynamic = 'force-dynamic'

/** cellsJson is stored flat (rows*cols); the live detail view expects a 2D `layout`. */
function toLayout(cells: unknown[], rows: number, cols: number): unknown[][] {
  const layout: unknown[][] = []
  for (let r = 0; r < rows; r++) {
    layout.push(Array.from({ length: cols }, (_v, c) => (cells[r * cols + c] ?? null) as unknown))
  }
  return layout
}

function flatCells(layout: unknown): unknown[] {
  if (Array.isArray(layout) && layout.length > 0 && Array.isArray(layout[0])) {
    return (layout as unknown[][]).flat()
  }
  return Array.isArray(layout) ? layout : []
}

type RouteContext = { params: Promise<{ id: string }> }

/** GET /api/store/planograms/[id] → {planogram:{...,layout}, products:[...]} */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canPlanogram(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const { id } = await ctx.params
  const pg = await db.planogram.findUnique({ where: { id } })
  if (!pg) return fail('پلانوگرام یافت نشد', 404)

  const cells = safeJson<unknown[]>(pg.cellsJson, [])
  const layout = toLayout(cells, pg.rows, pg.cols)
  const productIds = [...new Set(cells.filter((c): c is string => typeof c === 'string' && c.length > 0))]
  const products = productIds.length
    ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, unit: true, sellPrice: true, code: true } })
    : []

  return ok({
    planogram: {
      id: pg.id,
      name: pg.name,
      blockLabel: pg.blockLabel,
      rows: pg.rows,
      cols: pg.cols,
      status: pg.status,
      note: pg.note,
      layout,
      createdAt: pg.createdAt,
      updatedAt: pg.updatedAt,
    },
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      sellPrice: p.sellPrice,
      barcode: p.code,
    })),
  })
}

/** PATCH /api/store/planograms/[id] — {layout:[[...]]} | {status:'publish'|'unpublish'|'archive'|'restore'|raw} */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canPlanogram(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const { id } = await ctx.params
  const pg = await db.planogram.findUnique({ where: { id } })
  if (!pg) return fail('پلانوگرام یافت نشد', 404)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const data: { cellsJson?: string; status?: string; name?: string; note?: string; blockLabel?: string | null } = {}
  let detail = pg.name

  // R7: تغییر بخش متصل پلانوگرام (اتصال پلانوگرام به جای فروشگاه)
  if (body.blockLabel !== undefined) {
    const bl = typeof body.blockLabel === 'string' && body.blockLabel.trim() ? body.blockLabel.trim() : null
    data.blockLabel = bl
    detail = `${pg.name} — بخش ${bl ?? 'بدون بخش'}`
  }

  if (body.layout !== undefined) {
    const flat = flatCells(body.layout)
    const total = pg.rows * pg.cols
    const cells = Array.from({ length: total }, (_v, i) => (flat[i] ?? null) as unknown)
    data.cellsJson = JSON.stringify(cells)
    detail = `${pg.name} — چیدمان ${cells.filter((c) => c).length} خانه`
  }
  if (body.status !== undefined) {
    const action = String(body.status)
    const map: Record<string, string> = {
      publish: 'PUBLISHED',
      unpublish: 'DRAFT',
      archive: 'ARCHIVE',
      restore: 'DRAFT',
    }
    const status = map[action] ?? (['DRAFT', 'PUBLISHED', 'DONE', 'ARCHIVE'].includes(action) ? action : 'DRAFT')
    data.status = status
    detail = `${pg.name} — وضعیت ${status}`
  }
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (body.note !== undefined) data.note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null

  if (Object.keys(data).length > 0) {
    await db.planogram.update({ where: { id }, data })
    await logActivity({
      userId: user.id,
      userName: user.fullName,
      action: 'planogram.update',
      actionLabel: 'پلانوگرام',
      category: 'planogram',
      detail,
      entityId: id,
    })
  }

  const fresh = await db.planogram.findUnique({ where: { id } })
  const cells = safeJson<unknown[]>(fresh!.cellsJson, [])
  return ok({
    planogram: {
      id: fresh!.id,
      name: fresh!.name,
      blockLabel: fresh!.blockLabel,
      rows: fresh!.rows,
      cols: fresh!.cols,
      status: fresh!.status,
      note: fresh!.note,
      layout: toLayout(cells, fresh!.rows, fresh!.cols),
      createdAt: fresh!.createdAt,
      updatedAt: fresh!.updatedAt,
    },
  })
}

/** DELETE /api/store/planograms/[id] */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canPlanogram(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const { id } = await ctx.params
  const pg = await db.planogram.findUnique({ where: { id } })
  if (!pg) return fail('پلانوگرام یافت نشد', 404)

  await db.planogram.delete({ where: { id } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'planogram.delete',
    actionLabel: 'پلانوگرام',
    category: 'planogram',
    detail: pg.name,
    entityId: id,
  })
  return ok({ deleted: true })
}
