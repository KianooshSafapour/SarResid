import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function canManageImages(role: string) {
  return ['OWNER', 'GM', 'ADMIN', 'PM', 'MERCH'].includes(role)
}

/**
 * POST /api/shop-admin/products/media {productId, urls:[{url, caption?}...], source?}
 * افزودن چند تصویر؛ اولین تصویر کالای بی‌تصویر خودکار primary می‌شود.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canManageImages(user.role)) return fail('دسترسی ندارید', 403)
  const body = (await req.json().catch(() => ({}))) as { productId?: string; urls?: unknown; source?: string }
  const productId = String(body.productId ?? '')
  if (!productId) return fail('کالا مشخص نیست')
  const items = Array.isArray(body.urls)
    ? body.urls.map((u) => (typeof u === 'string' ? { url: u, caption: '' } : { url: String((u as { url?: string })?.url ?? ''), caption: String((u as { caption?: string })?.caption ?? '') }))
    : []
  const valid = items.filter((i) => /^https?:\/\//i.test(i.url)).slice(0, 10)
  if (!valid.length) return fail('نشانی تصویر معتبر نیست (https لازم است)')

  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true } })
  if (!product) return fail('کالا پیدا نشد', 404)

  const existing = await db.shopProductMedia.count({ where: { productId } })
  let added = 0
  for (let i = 0; i < valid.length; i++) {
    const it = valid[i]
    const created = await db.shopProductMedia.create({
      data: { productId, url: it.url, caption: it.caption.slice(0, 120), source: body.source === 'manual' ? 'manual' : 'web-search', sortOrder: existing + i },
    }).catch(() => null)
    if (created) added++
  }
  // اگر کالا هیچ primary ندارد، اولین رسانه primary شود
  const hasPrimary = await db.shopProductMedia.findFirst({ where: { productId, isPrimary: true } })
  if (!hasPrimary) {
    const first = await db.shopProductMedia.findFirst({ where: { productId }, orderBy: { sortOrder: 'asc' } })
    if (first) await db.shopProductMedia.update({ where: { id: first.id }, data: { isPrimary: true } })
  }
  const media = await db.shopProductMedia.findMany({ where: { productId }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] })
  return ok({ added, media })
}

/** PUT /api/shop-admin/products/media {mediaId, isPrimary|sortOrder|caption} */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canManageImages(user.role)) return fail('دسترسی ندارید', 403)
  const body = (await req.json().catch(() => ({}))) as { mediaId?: string; isPrimary?: boolean; sortOrder?: number; caption?: string }
  const mediaId = String(body.mediaId ?? '')
  const row = await db.shopProductMedia.findUnique({ where: { id: mediaId } })
  if (!row) return fail('تصویر پیدا نشد', 404)

  if (body.isPrimary === true) {
    await db.shopProductMedia.updateMany({ where: { productId: row.productId }, data: { isPrimary: false } })
    await db.shopProductMedia.update({ where: { id: mediaId }, data: { isPrimary: true } })
  }
  if (body.sortOrder !== undefined || body.caption !== undefined) {
    await db.shopProductMedia.update({
      where: { id: mediaId },
      data: {
        ...(body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) || 0 } : {}),
        ...(body.caption !== undefined ? { caption: String(body.caption).slice(0, 120) } : {}),
      },
    })
  }
  const media = await db.shopProductMedia.findMany({ where: { productId: row.productId }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] })
  return ok({ media })
}

/** DELETE /api/shop-admin/products/media?mediaId= */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canManageImages(user.role)) return fail('دسترسی ندارید', 403)
  const mediaId = req.nextUrl.searchParams.get('mediaId') || ''
  const row = await db.shopProductMedia.findUnique({ where: { id: mediaId } })
  if (!row) return fail('تصویر پیدا نشد', 404)
  await db.shopProductMedia.delete({ where: { id: mediaId } })
  // اگر primary حذف شد، اولین باقی‌مانده primary شود
  if (row.isPrimary) {
    const first = await db.shopProductMedia.findFirst({ where: { productId: row.productId }, orderBy: { sortOrder: 'asc' } })
    if (first) await db.shopProductMedia.update({ where: { id: first.id }, data: { isPrimary: true } })
  }
  const media = await db.shopProductMedia.findMany({ where: { productId: row.productId }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] })
  return ok({ media })
}
