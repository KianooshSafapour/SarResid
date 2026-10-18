import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson, clampInt } from '@/lib/api'
import { getSessionUser, type SessionUser } from '@/lib/auth'

/** Roles allowed to mutate products (mirrors frontend isManager gating + ACC/PM) */
function canMutateProducts(u: SessionUser | null): boolean {
  return !!u && (['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(u.role) || u.role === 'ACC' || u.role === 'PM')
}

/** barcodeCount — live: count of barcode rows; ours: barcodesJson length, falling back to the main code */
function barcodeCountOf(barcodesJson: string, code: string | null): number {
  const arr = safeJson<string[]>(barcodesJson, [])
  if (arr.length > 0) return arr.length
  return code ? 1 : 0
}

/** lowStock condition used both for the filter and meta — mirrors live (stock ≤ 5, or ≤ reorderLevel) */
function lowStockWhere() {
  return {
    OR: [
      { stock: { lte: 5 } },
      // Prisma cannot compare two columns; reorderLevel is null for the whole seeded catalog,
      // so products with a manual reorderLevel are treated as low-stock (documented in worklog).
      { reorderLevel: { not: null } },
    ],
  }
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const sp = req.nextUrl.searchParams
  const meta = sp.get('meta')
  const q = (sp.get('q') ?? '').trim()
  const page = Math.max(1, clampInt(sp.get('page'), 1, 100000, 1))
  const pageSize = Math.max(1, clampInt(sp.get('pageSize'), 1, 100, 24)) // live caps at 100
  const mainGroup = sp.get('mainGroup') ?? '' // products view sends it as `group`
  const group = sp.get('group') ?? ''
  const subGroup = sp.get('subGroup') ?? '' // products view sends it as `category`
  const category = sp.get('category') ?? ''
  const status = sp.get('status') ?? ''
  const lowStock = sp.get('lowStock') === '1'
  const sort = (sp.get('sort') ?? '').trim()

  // ---------- meta branch (GET /api/products?meta=1) ----------
  if (meta === '1') {
    const all = await db.product.findMany({
      select: { mainGroup: true, subGroup: true, stock: true, reorderLevel: true },
    })
    const mg: Record<string, number> = {}
    const sg: Record<string, number> = {}
    let low = 0
    for (const p of all) {
      if (p.mainGroup) mg[p.mainGroup] = (mg[p.mainGroup] ?? 0) + 1
      if (p.subGroup) sg[p.subGroup] = (sg[p.subGroup] ?? 0) + 1
      if (p.stock <= 5 || (p.reorderLevel !== null && p.stock <= p.reorderLevel)) low++
    }
    const toList = (m: Record<string, number>) =>
      Object.entries(m)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name, count]) => ({ name, count }))
    return ok({
      total: all.length,
      lowStock: low,
      mainGroups: toList(mg),
      subGroups: toList(sg),
    })
  }

  // ---------- list branch ----------
  const where: Record<string, unknown> = {}
  const and: Record<string, unknown>[] = []
  if (q) {
    and.push({
      OR: [
        { name: { contains: q } },
        { code: { contains: q } },
        { barcodesJson: { contains: q } },
      ],
    })
  }
  const mg = mainGroup || group
  if (mg) and.push({ mainGroup: mg })
  const sg = subGroup || category
  if (sg) and.push({ subGroup: sg })
  if (status) and.push({ status })
  if (lowStock) and.push(lowStockWhere())
  if (and.length) where.AND = and

  const total = await db.product.count({ where })
  const order: Record<string, 'asc' | 'desc'>[] =
    sort === 'stock'
      ? [{ stock: 'asc' }, { name: 'asc' }]
      : lowStock && !sort
        ? [{ stock: 'asc' }, { name: 'asc' }] // low-stock view: least stock first
        : [{ name: 'asc' }, { id: 'asc' }] // default: name (matches live page 1)

  const rows = await db.product.findMany({
    where,
    orderBy: order,
    skip: (page - 1) * pageSize,
    take: pageSize,
  })

  const items = rows.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    unit: p.unit,
    category: p.category,
    mainGroup: p.mainGroup,
    subGroup: p.subGroup,
    sellPrice: p.sellPrice,
    sellPrice2: p.sellPrice2,
    lastBuyPrice: p.lastBuyPrice,
    stock: p.stock,
    reorderLevel: p.reorderLevel,
    shelfLifeDays: p.shelfLifeDays,
    status: p.status,
    active: p.active,
    barcodeCount: barcodeCountOf(p.barcodesJson, p.code),
  }))

  const pages = Math.max(1, Math.ceil(total / pageSize))
  return ok({ items, total, page, pageSize, pages })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canMutateProducts(user)) return fail('برای ثبت کالا دسترسی مدیران لازم است', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const name = String(body.name ?? '').trim()
  if (!name) return fail('نام کالا الزامی است')

  const code = body.code ? String(body.code).trim() : null
  if (code) {
    const dup = await db.product.findFirst({ where: { code } })
    if (dup) return fail('کد کالا تکراری است')
  }

  const num = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const created = await db.product.create({
    data: {
      name,
      code,
      unit: body.unit ? String(body.unit).trim() || 'عدد' : 'عدد',
      category: body.category ? String(body.category) : null,
      mainGroup: body.mainGroup ? String(body.mainGroup) : null,
      subGroup: body.subGroup ? String(body.subGroup) : null,
      // «کد کالا به‌عنوان بارکد اصلی در بانک بارکد ثبت می‌شود»
      barcodesJson: JSON.stringify(code ? [code] : []),
      sellPrice: num(body.sellPrice) ?? 0,
      sellPrice2: num(body.sellPrice2) ?? (num(body.sellPrice) ?? 0),
      lastBuyPrice: num(body.lastBuyPrice) ?? 0,
      stock: num(body.stock) ?? 0,
      reorderLevel: num(body.reorderLevel),
      shelfLifeDays: num(body.shelfLifeDays),
      status: 'فعال',
      active: true,
    },
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'product_create',
    actionLabel: 'ثبت کالا',
    category: 'products',
    detail: `ثبت کالای «${name}»${code ? ` با کد ${code}` : ''}`,
    entityId: created.id,
  })

  return ok({
    id: created.id,
    name: created.name,
    code: created.code,
    unit: created.unit,
    category: created.category,
    mainGroup: created.mainGroup,
    subGroup: created.subGroup,
    sellPrice: created.sellPrice,
    sellPrice2: created.sellPrice2,
    lastBuyPrice: created.lastBuyPrice,
    stock: created.stock,
    reorderLevel: created.reorderLevel,
    shelfLifeDays: created.shelfLifeDays,
    status: created.status,
    active: created.active,
    imageUrl: null,
    barcodes: code
      ? [{ id: `${created.id}:0`, code, productId: created.id, isPrimary: true, createdAt: created.createdAt }]
      : [],
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  })
}
