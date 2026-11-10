import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

let zaiPromise: Promise<any> | null = null
async function getZai() {
  if (!zaiPromise) {
    zaiPromise = import('z-ai-web-dev-sdk').then((m: any) => (m.default as any).create())
  }
  return zaiPromise
}

async function searchFirstImage(query: string): Promise<string | null> {
  try {
    const zai = await getZai()
    const res = await zai.images.search.create({ query, count: 3 })
    if (!res || res.success !== true || !Array.isArray(res.results)) return null
    for (const r of res.results) {
      const url = String(r?.original_url ?? '')
      if (/^https?:\/\//i.test(url)) return url
    }
    return null
  } catch {
    return null
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

/**
 * GET /api/products/bulk-image
 * live: data.candidates = top 60 products without an image, stock DESC (id ASC tie-break),
 * each {id, name, unit, category, stock, sellPrice, orderCount}
 */
export async function GET(_req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const images = await db.productImage.findMany({ select: { key: true } })
  const imageKeys = new Set(images.map((i) => i.key))

  const products = await db.product.findMany({
    where: { id: { notIn: [...imageKeys] } },
    orderBy: [{ stock: 'desc' }, { id: 'asc' }],
    take: 60,
    select: { id: true, name: true, unit: true, category: true, stock: true, sellPrice: true },
  })

  const counts = await db.orderItem.groupBy({
    by: ['productId'],
    _count: { _all: true },
  })
  const countMap = new Map(counts.map((c) => [c.productId, c._count._all]))

  const candidates = products.map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    category: p.category,
    stock: p.stock,
    sellPrice: p.sellPrice,
    orderCount: countMap.get(p.id) ?? 0,
  }))
  return ok({ candidates })
}

/**
 * POST /api/products/bulk-image {productId}
 * live: cache hit → {imageUrl}; fresh fetch → {imageUrl} (+miss); nothing found → {none:true}
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const body = await req.json().catch(() => null)
  const productId = body?.productId ? String(body.productId) : ''
  if (!productId) return fail('شناسه کالا لازم است')

  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product) return fail('کالا یافت نشد', 404)

  const cached = await db.productImage.findUnique({ where: { key: productId } })
  if (cached) {
    // cache hit — no web search
    await db.productImage.update({ where: { key: productId }, data: { hits: { increment: 1 } } })
    return ok({ imageUrl: cached.url })
  }

  const url = await searchFirstImage(product.name)
  if (!url) return ok({ none: true })

  await db.productImage.create({ data: { key: productId, url, bytes: 0, hits: 0 } })
  await bumpImageMisses(1)
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'product_image',
    actionLabel: 'دریافت تصویر کالا',
    category: 'products',
    detail: `تصویر وب برای کالای «${product.name}» ذخیره شد`,
    entityId: product.id,
  })
  return ok({ imageUrl: url })
}
