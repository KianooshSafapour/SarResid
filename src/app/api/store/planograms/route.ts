import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

function serializeList(pg: {
  id: string
  name: string
  blockLabel: string | null
  rows: number
  cols: number
  status: string
  note: string | null
  cellsJson: string
  updatedAt: Date
  createdAt: Date
}) {
  const cells = safeJson<unknown[]>(pg.cellsJson, [])
  const flat = Array.isArray(cells) && Array.isArray(cells[0]) ? (cells as unknown[][]).flat() : cells
  const filled = flat.filter((c) => c !== null && c !== undefined && c !== '').length
  const total = Math.max(1, pg.rows * pg.cols)
  return {
    id: pg.id,
    name: pg.name,
    blockLabel: pg.blockLabel,
    rows: pg.rows,
    cols: pg.cols,
    status: pg.status,
    note: pg.note,
    fillHealth: Math.round((filled / total) * 100),
    filled,
    updatedAt: pg.updatedAt,
    createdAt: pg.createdAt,
  }
}

/** GET /api/store/planograms → {planograms:[...]} */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'store/planograms')
  if (!gate.ok) return fail(gate.deny, 403)

  const pgs = await db.planogram.findMany()
  return ok({ planograms: pgs.map(serializeList) })
}

/** POST /api/store/planograms — {name,blockLabel?,rows,cols} create | {duplicateOf:id} duplicate */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'store/planograms')
  if (!gate.ok) return fail(gate.deny, 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  if (body.duplicateOf) {
    const src = await db.planogram.findUnique({ where: { id: String(body.duplicateOf) } })
    if (!src) return fail('پلانوگرام مبدأ یافت نشد', 404)
    const copy = await db.planogram.create({
      data: {
        name: `${src.name} (کپی)`,
        blockLabel: src.blockLabel,
        rows: src.rows,
        cols: src.cols,
        cellsJson: src.cellsJson,
        status: 'DRAFT',
        note: src.note,
      },
    })
    await logActivity({
      userId: user.id,
      userName: user.fullName,
      action: 'planogram.create',
      actionLabel: 'پلانوگرام',
      category: 'planogram',
      detail: `کپی از «${src.name}»`,
      entityId: copy.id,
    })
    return ok({ id: copy.id, planogram: serializeList(copy) })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return fail('نام پلانوگرام را وارد کنید')
  const rows = Math.max(1, Math.min(12, Math.round(Number(body.rows) || 4)))
  const cols = Math.max(1, Math.min(24, Math.round(Number(body.cols) || 6)))
  const blockLabel = typeof body.blockLabel === 'string' && body.blockLabel.trim() ? body.blockLabel.trim() : null

  const pg = await db.planogram.create({
    data: {
      name,
      blockLabel,
      rows,
      cols,
      cellsJson: JSON.stringify(Array.from({ length: rows * cols }, () => null)),
      status: 'DRAFT',
    },
  })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'planogram.create',
    actionLabel: 'پلانوگرام',
    category: 'planogram',
    detail: name,
    entityId: pg.id,
  })
  return ok({ id: pg.id, planogram: serializeList(pg) })
}
