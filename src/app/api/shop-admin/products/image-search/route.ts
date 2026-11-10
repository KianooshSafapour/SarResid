import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

let zaiPromise: Promise<any> | null = null
async function getZai() {
  if (!zaiPromise) {
    zaiPromise = import('z-ai-web-dev-sdk').then((m: any) => (m.default as any).create())
  }
  return zaiPromise
}

/** جست‌وجوی تصویر وب برای کالا (همان موتور پلتفرم داخلی) */
async function searchImages(query: string): Promise<{ url: string; caption: string; source: string }[]> {
  try {
    const zai = await getZai()
    const res = await zai.images.search.create({ query, count: 8 })
    if (!res || res.success !== true || !Array.isArray(res.results)) return []
    return res.results
      .map((r: any) => ({ url: String(r.original_url ?? ''), caption: r.caption ? String(r.caption) : '', source: r.source ? String(r.source) : '' }))
      .filter((r: { url: string }) => /^https?:\/\//i.test(r.url))
  } catch {
    return []
  }
}

/** POST /api/shop-admin/products/image-search {query | productId} — با productId از نام کالا جست‌وجو می‌کند */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN', 'PM', 'MERCH'].includes(user.role)) return fail('دسترسی ندارید', 403)
  const body = (await req.json().catch(() => ({}))) as { query?: string; productId?: string }

  let query = String(body.query ?? '').trim()
  if (!query && body.productId) {
    const { db } = await import('@/lib/db')
    const p = await db.product.findUnique({ where: { id: String(body.productId) }, select: { name: true } })
    if (p) query = p.name.replace(/^[\s*_\-•·]+/, '').trim()
  }
  if (query.length < 2) return fail('عبارت جستجو (حداقل ۲ نویسه) لازم است')
  const results = await searchImages(query)
  return ok({ results, query })
}
