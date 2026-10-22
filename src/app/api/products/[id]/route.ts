import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser, type SessionUser } from '@/lib/auth'

function canMutateProducts(u: SessionUser | null): boolean {
  return !!u && (['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(u.role) || u.role === 'ACC' || u.role === 'PM')
}

/** R4-8: واحدهای مجاز — پژوهش research/product-units-research.md §۳ (هم‌ارز ALLOWED_UNITS در scripts/apply-default-units.ts) */
const ALLOWED_UNITS = ['عدد', 'کیلوگرم', 'گرم', 'بسته', 'دستی']

/** Product extras are kept in ProductImage rows keyed by productId (schema has no imageUrl column). */
async function imageUrlOf(productId: string): Promise<string | null> {
  const row = await db.productImage.findUnique({ where: { key: productId } })
  return row?.url ?? null
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** barcodes array like the live barcode table: [{id, code, productId, isPrimary, createdAt}] */
function barcodesOf(productId: string, barcodesJson: string, code: string | null, createdAt: Date) {
  const arr = safeJson<string[]>(barcodesJson, [])
  const list = arr.length > 0 ? arr : code ? [code] : []
  const primaryIdx = list.findIndex((b) => b === code)
  const primary = primaryIdx >= 0 ? primaryIdx : 0
  return list.map((b, i) => ({
    id: `${productId}:${i}`,
    code: b,
    productId,
    isPrimary: i === primary,
    createdAt,
  }))
}

/** printed-price stats from order items (live: lastPrintedPrice / avgPrintedPrice / printedPriceCount) */
async function printedStatsOf(productId: string) {
  const items = await db.orderItem.findMany({
    where: { productId },
    select: { printedPrice: true, order: { select: { createdAt: true } } },
  })
  const withPrinted = items.filter((i) => i.printedPrice !== null && i.printedPrice !== 0)
  if (withPrinted.length === 0) {
    return { lastPrintedPrice: null as number | null, avgPrintedPrice: null as number | null, printedPriceCount: 0 }
  }
  const sorted = [...withPrinted].sort((a, b) => b.order.createdAt.getTime() - a.order.createdAt.getTime())
  const prices = withPrinted.map((i) => i.printedPrice as number)
  const sum = prices.reduce((s, v) => s + v, 0)
  return {
    lastPrintedPrice: sorted[0].printedPrice as number,
    avgPrintedPrice: Math.round(sum / prices.length),
    printedPriceCount: prices.length,
  }
}

async function detail(id: string) {
  const p = await db.product.findUnique({ where: { id } })
  if (!p) return null
  const [imageUrl, printed] = await Promise.all([imageUrlOf(p.id), printedStatsOf(p.id)])
  return {
    id: p.id,
    name: p.name,
    searchName: p.name,
    code: p.code,
    unit: p.unit,
    manualUnit: p.manualUnit, // R4-8: قفل واحد دستی مدیر
    category: p.category,
    mainGroup: p.mainGroup,
    subGroup: p.subGroup,
    sellPrice: p.sellPrice,
    sellPrice2: p.sellPrice2,
    lastBuyPrice: p.lastBuyPrice,
    stock: p.stock,
    reorderLevel: p.reorderLevel,
    lowStockThreshold: p.lowStockThreshold,
    leadTimeDays: p.leadTimeDays,
    monthlySold: p.monthlySold,
    lastCountDate: p.lastCountDate ?? null,
    defaultOrderQty: p.defaultOrderQty,
    defaultCartonQty: p.defaultCartonQty,
    unitsPerCarton: p.unitsPerCarton,
    imported: p.imported,
    stock: p.stock,
    reorderLevel: p.reorderLevel,
    shelfLifeDays: p.shelfLifeDays,
    lastPrintedPrice: printed.lastPrintedPrice,
    avgPrintedPrice: printed.avgPrintedPrice,
    printedPriceCount: printed.printedPriceCount,
    status: p.status,
    imageUrl,
    active: p.active,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    barcodes: barcodesOf(p.id, p.barcodesJson, p.code, p.createdAt),
  }
}

/** image-cache miss counter shared by product image flows (read by /api/img/stats) */
async function bumpImageMisses(n: number) {
  const row = await db.setting.findUnique({ where: { key: 'img_stats' } })
  let cur: { misses?: number } = {}
  try {
    cur = row ? JSON.parse(row.value) : {}
  } catch {
    cur = {}
  }
  const value = JSON.stringify({ ...cur, misses: (cur.misses ?? 0) + n })
  if (row) await db.setting.update({ where: { key: 'img_stats' }, data: { value } })
  else await db.setting.create({ data: { key: 'img_stats', value } })
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await ctx.params
  const d = await detail(id)
  if (!d) return fail('کالا یافت نشد', 404)
  return ok(d)
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const { id } = await ctx.params
  const p = await db.product.findUnique({ where: { id } })
  if (!p) return fail('کالا یافت نشد', 404)

  const keys = Object.keys(body)
  const imageUrlOnly = keys.length === 1 && keys[0] === 'imageUrl'
  if (!imageUrlOnly && !canMutateProducts(user)) {
    return fail('برای ویرایش کالا دسترسی مدیران لازم است', 403)
  }

  const data: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return fail('نام کالا الزامی است')
    data.name = name
  }
  if (body.code !== undefined) {
    const code = body.code === null || body.code === '' ? null : String(body.code).trim()
    if (code && code !== p.code) {
      const dup = await db.product.findFirst({ where: { code } })
      if (dup && dup.id !== p.id) return fail('کد کالا تکراری است')
    }
    data.code = code
  }
  // R4-8: واحد کالا — فقط از مجموعهٔ مجاز؛ تغییر واحد از UI/API ⇒ manualUnit=true
  // (manualUnit:false صریح پذیرفته می‌شود تا بازیابی/بازگردانی مدیر ممکن باشد)
  if (body.unit !== undefined) {
    const unit = String(body.unit).trim()
    if (!ALLOWED_UNITS.includes(unit)) {
      return fail(`واحد کالا باید یکی از این‌ها باشد: ${ALLOWED_UNITS.join('، ')}`)
    }
    data.unit = unit
    if (body.manualUnit !== undefined) data.manualUnit = body.manualUnit === true
    else data.manualUnit = true // تغییر واحد = انتخاب دستی
  } else if (body.manualUnit !== undefined) {
    data.manualUnit = body.manualUnit === true
  }
  if (body.category !== undefined) data.category = body.category === null ? null : String(body.category)
  if (body.mainGroup !== undefined) data.mainGroup = body.mainGroup === null ? null : String(body.mainGroup)
  if (body.subGroup !== undefined) data.subGroup = body.subGroup === null ? null : String(body.subGroup)
  if (body.sellPrice !== undefined) data.sellPrice = toNumber(body.sellPrice) ?? 0
  if (body.sellPrice2 !== undefined) data.sellPrice2 = toNumber(body.sellPrice2) ?? 0
  if (body.lastBuyPrice !== undefined) data.lastBuyPrice = toNumber(body.lastBuyPrice) ?? 0
  if (body.stock !== undefined) data.stock = toNumber(body.stock) ?? 0
  if (body.reorderLevel !== undefined) data.reorderLevel = toNumber(body.reorderLevel)
  if (body.shelfLifeDays !== undefined) data.shelfLifeDays = toNumber(body.shelfLifeDays)
  if (body.status !== undefined) data.status = body.status === null ? null : String(body.status)
  if (body.active !== undefined) data.active = body.active !== false

  // barcodes: array of strings replaces the bank (the main code stays the primary barcode)
  if (Array.isArray(body.barcodes)) {
    const list = (body.barcodes as unknown[])
      .map((b) => (b === null || b === undefined ? '' : String(b).trim()))
      .filter(Boolean)
    data.barcodesJson = JSON.stringify(list)
  }

  if (Object.keys(data).length > 0) {
    await db.product.update({ where: { id: p.id }, data })
  }

  // imageUrl only → product image cache (any logged-in user; matches the frontend dialog)
  if (body.imageUrl !== undefined) {
    const url = body.imageUrl === null || body.imageUrl === '' ? null : String(body.imageUrl)
    const existing = await db.productImage.findUnique({ where: { key: p.id } })
    if (url && /^https?:\/\//i.test(url)) {
      if (existing && existing.url === url) {
        await db.productImage.update({ where: { key: p.id }, data: { hits: { increment: 1 } } })
      } else {
        await db.productImage.upsert({
          where: { key: p.id },
          create: { key: p.id, url, bytes: 0, hits: 0 },
          update: { url },
        })
        await bumpImageMisses(1)
      }
    } else if (existing) {
      await db.productImage.delete({ where: { key: p.id } })
    }
  }

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: imageUrlOnly ? 'product_image' : 'product_update',
    actionLabel: imageUrlOnly ? 'ذخیره تصویر کالا' : 'ویرایش کالا',
    category: 'products',
    detail: `کالای «${(data.name as string) ?? p.name}» به‌روزرسانی شد`,
    entityId: p.id,
  })

  const d = await detail(p.id)
  return ok(d)
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canMutateProducts(user)) return fail('برای حذف کالا دسترسی مدیران لازم است', 403)

  const { id } = await ctx.params
  const p = await db.product.findUnique({ where: { id } })
  if (!p) return fail('کالا یافت نشد', 404)

  await db.product.update({ where: { id }, data: { active: false } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'product_delete',
    actionLabel: 'حذف/غیرفعال‌سازی کالا',
    category: 'products',
    detail: `کالای «${p.name}» غیرفعال شد`,
    entityId: p.id,
  })
  return ok({ id: p.id, active: false })
}
