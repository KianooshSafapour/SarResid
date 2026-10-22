import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, clampInt } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

const PRODUCT_FIELDS = {
  id: true,
  name: true,
  unit: true,
  sellPrice: true,
  lastBuyPrice: true,
  stock: true,
  defaultOrderQty: true,
  defaultCartonQty: true,
  unitsPerCarton: true,
} as const

/**
 * GET /api/supplier-products?productId=X → {links:[...], product:{...}}
 * GET /api/supplier-products?supplierId=Y → {products:[...]}
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const sp = req.nextUrl.searchParams
  const productId = (sp.get('productId') || '').trim()
  const supplierId = (sp.get('supplierId') || '').trim()
  if (!productId && !supplierId) return fail('شناسه کالا یا تأمین‌کننده را مشخص کنید')

  if (productId) {
    const product = await db.product.findUnique({ where: { id: productId }, select: PRODUCT_FIELDS })
    if (!product) return fail('کالا یافت نشد', 404)

    const links = await db.supplierProduct.findMany({
      where: { productId },
      orderBy: [{ isPrimary: 'desc' }, { unitPrice: 'asc' }],
    })
    const supplierIds = [...new Set(links.map((l) => l.supplierId))]
    const suppliers = supplierIds.length
      ? await db.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true, code: true, phone: true, status: true } })
      : []
    const sMap = new Map(suppliers.map((s) => [s.id, s]))

    return ok({
      product,
      links: links.map((l) => {
        const sup = sMap.get(l.supplierId)
        return {
          id: l.id,
          supplierId: l.supplierId,
          supplierName: sup?.name ?? 'تأمین‌کننده حذف‌شده',
          supplierPhone: sup?.phone ?? null,
          supplierStatus: sup?.status ?? null,
          unitPrice: l.unitPrice,
          lastBuyPrice: l.lastBuyPrice,
          perCarton: l.perCarton,
          isPrimary: l.isPrimary,
          note: l.note,
          updatedAt: l.updatedAt,
        }
      }),
    })
  }

  // supplierId view — their product list
  const supplier = await db.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true, code: true, phone: true } })
  if (!supplier) return fail('تأمین‌کننده یافت نشد', 404)

  const links = await db.supplierProduct.findMany({
    where: { supplierId },
    orderBy: [{ isPrimary: 'desc' }, { unitPrice: 'asc' }],
  })
  const productIds = [...new Set(links.map((l) => l.productId))]
  const products = productIds.length
    ? await db.product.findMany({ where: { id: { in: productIds } }, select: PRODUCT_FIELDS })
    : []
  const pMap = new Map(products.map((p) => [p.id, p]))
  // stable alphabetical product order within isPrimary groups
  links.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
    return (pMap.get(a.productId)?.name ?? '').localeCompare(pMap.get(b.productId)?.name ?? '', 'fa')
  })

  return ok({
    supplier,
    products: links.map((l) => {
      const p = pMap.get(l.productId)
      return {
        id: l.id,
        supplierId: l.supplierId,
        productId: l.productId,
        name: p?.name ?? l.note ?? 'کالا',
        unit: p?.unit ?? 'عدد',
        unitPrice: l.unitPrice,
        lastBuyPrice: l.lastBuyPrice,
        perCarton: l.perCarton,
        isPrimary: l.isPrimary,
        note: l.note,
        product: p
          ? {
              name: p.name,
              unit: p.unit,
              stock: p.stock,
              sellPrice: p.sellPrice,
              lastBuyPrice: p.lastBuyPrice,
              defaultOrderQty: p.defaultOrderQty,
              defaultCartonQty: p.defaultCartonQty,
              unitsPerCarton: p.unitsPerCarton,
            }
          : null,
      }
    }),
  })
}

/** POST /api/supplier-products {supplierId, productId, unitPrice, perCarton?, isPrimary?} — upsert unique pair (managers) */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('فقط مدیران می‌توانند قیمت تأمین‌کننده را ثبت کنند', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const supplierId = String((body as Record<string, unknown>).supplierId ?? '').trim()
  const productId = String((body as Record<string, unknown>).productId ?? '').trim()
  if (!supplierId || !productId) return fail('تأمین‌کننده و کالا را انتخاب کنید')

  const supplier = await db.supplier.findUnique({ where: { id: supplierId } })
  if (!supplier) return fail('تأمین‌کننده یافت نشد', 404)
  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product) return fail('کالا یافت نشد', 404)

  const unitPrice = Number((body as Record<string, unknown>).unitPrice)
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return fail('فی واحد را وارد کنید')
  const perCarton = clampInt((body as Record<string, unknown>).perCarton, 0, 100000, 0)
  const isPrimary = (body as Record<string, unknown>).isPrimary === true
  const note = String((body as Record<string, unknown>).note ?? '').trim() || null

  const saved = await db.$transaction(async (tx) => {
    if (isPrimary) {
      // only ONE primary supplier per product
      await tx.supplierProduct.updateMany({ where: { productId, isPrimary: true }, data: { isPrimary: false } })
    }
    return tx.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId, productId } },
      create: { supplierId, productId, unitPrice, perCarton, isPrimary, note },
      update: { unitPrice, perCarton, ...(isPrimary ? { isPrimary: true } : {}), ...(note !== null ? { note } : {}) },
    })
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'supplier-product.upsert',
    actionLabel: 'قیمت تأمین‌کننده',
    category: 'supply',
    detail: `«${supplier.name}» ← «${product.name}» — فی واحد ${toFaDigits(Math.round(unitPrice).toLocaleString('en-US'))} ریال${isPrimary ? ' (تأمین‌کننده اصلی)' : ''}`,
    entityId: saved.id,
  })
  return ok({ link: saved })
}

/** PATCH /api/supplier-products {supplierId, productId, isPrimary?, unitPrice?, perCarton?, note?} — managers */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('فقط مدیران می‌توانند اطلاعات تأمین‌کننده کالا را ویرایش کنند', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const supplierId = String((body as Record<string, unknown>).supplierId ?? '').trim()
  const productId = String((body as Record<string, unknown>).productId ?? '').trim()
  if (!supplierId || !productId) return fail('تأمین‌کننده و کالا را مشخص کنید')

  const link = await db.supplierProduct.findUnique({ where: { supplierId_productId: { supplierId, productId } } })
  if (!link) return fail('این ارتباط کالا-تأمین‌کننده یافت نشد', 404)

  const data: Record<string, unknown> = {}
  if ((body as Record<string, unknown>).isPrimary !== undefined) {
    data.isPrimary = (body as Record<string, unknown>).isPrimary === true
  }
  if ((body as Record<string, unknown>).unitPrice !== undefined) {
    const unitPrice = Number((body as Record<string, unknown>).unitPrice)
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return fail('فی واحد نامعتبر است')
    data.unitPrice = unitPrice
  }
  if ((body as Record<string, unknown>).perCarton !== undefined) {
    data.perCarton = clampInt((body as Record<string, unknown>).perCarton, 0, 100000, 0)
  }
  if ((body as Record<string, unknown>).note !== undefined) {
    data.note = String((body as Record<string, unknown>).note).trim() || null
  }
  if (Object.keys(data).length === 0) return fail('تغییری برای ذخیره وجود ندارد')

  const updated = await db.$transaction(async (tx) => {
    if (data.isPrimary === true) {
      await tx.supplierProduct.updateMany({ where: { productId, isPrimary: true }, data: { isPrimary: false } })
    }
    return tx.supplierProduct.update({ where: { id: link.id }, data })
  })

  const supplier = await db.supplier.findUnique({ where: { id: supplierId }, select: { name: true } })
  const product = await db.product.findUnique({ where: { id: productId }, select: { name: true } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'supplier-product.update',
    actionLabel: 'قیمت تأمین‌کننده',
    category: 'supply',
    detail: `«${supplier?.name ?? supplierId}» / «${product?.name ?? productId}» — ${Object.keys(data).join('، ')}`,
    entityId: link.id,
  })
  return ok({ link: updated })
}
