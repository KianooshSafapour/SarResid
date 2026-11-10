import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'
import { todayJalaliDash } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

const MIN_OK_MARGIN = 12
const QUEUE_LIMIT = 30

function marginPct(sell: number, cost: number): number | null {
  if (!cost || cost <= 0) return null
  return ((sell - cost) / cost) * 100
}

/** GET /api/store/price-checks?date= → {date,minOkMargin,checks,queue,summary} */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'store/pricecheck')
  if (!gate.ok) return fail(gate.deny, 403)

  const date = req.nextUrl.searchParams.get('date') || todayJalaliDash()

  const checks = await db.priceCheck.findMany({ where: { date }, orderBy: { createdAt: 'desc' } })
  const checkedProductIds = new Set(checks.map((c) => c.productId).filter(Boolean))

  const checkers = checks.length
    ? await db.user.findMany({ where: { id: { in: [...new Set(checks.map((c) => c.userId).filter((u): u is string => !!u))] } }, select: { id: true, fullName: true } })
    : []
  const checkerName = new Map(checkers.map((c) => [c.id, c.fullName]))

  const serialized = checks.map((c) => {
    const meta = safeJson<{ name?: string; barcode?: string | null }>(c.note, {})
    return {
      id: c.id,
      date: c.date,
      productId: c.productId,
      name: meta.name ?? '',
      barcode: meta.barcode ?? null,
      lastCost: c.lastCost,
      printedPrice: c.sellPrice,
      sellPrice: c.sellPrice,
      margin: c.margin,
      ok: c.ok,
      note: null,
      checkerName: c.userId ? (checkerName.get(c.userId) ?? null) : null,
      createdAt: c.createdAt,
    }
  })

  // Queue: in-stock products under the OK margin, lowest first, excluding today's checked ones
  const candidates = await db.product.findMany({
    where: { stock: { gt: 0 }, lastBuyPrice: { gt: 0 } },
    select: { id: true, name: true, code: true, sellPrice: true, lastBuyPrice: true },
  })
  const queue = candidates
    .map((p) => ({ p, margin: marginPct(p.sellPrice, p.lastBuyPrice) }))
    .filter((x) => x.margin !== null && x.margin < MIN_OK_MARGIN && !checkedProductIds.has(x.p.id))
    // pre-sort by id so equal margins keep a deterministic order (matches live capture ties)
    .sort((a, b) => (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0))
    .sort((a, b) => (a.margin as number) - (b.margin as number))
    .slice(0, QUEUE_LIMIT)
    .map((x) => ({
      productId: x.p.id,
      name: x.p.name,
      barcode: x.p.code,
      lastCost: x.p.lastBuyPrice,
      sellPrice: x.p.sellPrice,
      margin: x.margin as number,
    }))

  const margins = serialized.map((c) => c.margin).filter((m) => Number.isFinite(m))
  const avg = margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : null

  return ok({
    date,
    minOkMargin: MIN_OK_MARGIN,
    checks: serialized,
    queue,
    summary: {
      count: serialized.length,
      redCount: serialized.filter((c) => !c.ok).length,
      avgMargin: avg === null ? null : Math.round(avg * 10) / 10,
    },
  })
}

/** POST /api/store/price-checks {productId?, barcode?, name, printedPrice, lastCost?} → {ok,margin,suggestedPrice} */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'store/pricecheck')
  if (!gate.ok) return fail(gate.deny, 403)

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const printedPrice = Number(body?.printedPrice)
  if (!name) return fail('نام کالا یا بارکد آن را وارد کنید')
  if (!Number.isFinite(printedPrice) || printedPrice <= 0) return fail('قیمت چاپ‌شده روی کالا را وارد کنید')

  const productId = typeof body?.productId === 'string' && body.productId ? body.productId : ''
  let lastCost = Number(body?.lastCost)
  if (!Number.isFinite(lastCost) || lastCost <= 0) {
    if (productId) {
      const p = await db.product.findUnique({ where: { id: productId }, select: { lastBuyPrice: true } })
      lastCost = p?.lastBuyPrice ?? 0
    } else {
      lastCost = 0
    }
  }
  if (!Number.isFinite(lastCost) || lastCost <= 0) return fail('قیمت تمام‌شده کالا را وارد کنید')

  const margin = ((printedPrice - lastCost) / lastCost) * 100
  const isOk = margin >= MIN_OK_MARGIN
  const suggestedPrice = isOk ? null : Math.ceil(lastCost * 1.21)
  const barcode = typeof body?.barcode === 'string' && body.barcode.trim() ? body.barcode.trim() : null

  const check = await db.priceCheck.create({
    data: {
      date: todayJalaliDash(),
      productId,
      userId: user.id,
      lastCost: Math.round(lastCost),
      sellPrice: printedPrice,
      margin,
      ok: isOk,
      note: JSON.stringify({ name, barcode }),
    },
  })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'pricecheck.create',
    actionLabel: 'کنترل قیمت',
    category: 'pricecheck',
    detail: `${name} — حاشیه ${Math.round(margin * 10) / 10}٪`,
    entityId: check.id,
  })

  return ok({ ok: isOk, margin, suggestedPrice, name, id: check.id })
}
