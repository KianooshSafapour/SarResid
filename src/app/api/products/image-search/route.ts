import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

let zaiPromise: Promise<any> | null = null
async function getZai() {
  if (!zaiPromise) {
    zaiPromise = import('z-ai-web-dev-sdk').then((m: any) => (m.default as any).create())
  }
  return zaiPromise
}

/** Web image search (SDK). Returns [] on any failure — the UI shows «یافت نشد». */
async function searchImages(query: string): Promise<{ url: string; caption: string; source: string }[]> {
  try {
    const zai = await getZai()
    const res = await zai.images.search.create({ query, count: 6 })
    if (!res || res.success !== true || !Array.isArray(res.results)) return []
    return res.results
      .map((r: any) => ({
        url: String(r.original_url ?? ''),
        caption: r.caption ? String(r.caption) : '',
        source: r.source ? String(r.source) : '',
      }))
      .filter((r: { url: string }) => /^https?:\/\//i.test(r.url))
  } catch {
    return []
  }
}

async function handle(query: string) {
  const results = await searchImages(query)
  return ok({ results })
}

/** POST /api/products/image-search {query} — live contract: data.results = [{url, caption, source}] */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const body = await req.json().catch(() => null)
  const query = body?.query ? String(body.query).trim() : ''
  if (query.length < 2) return fail('عبارت جستجو (حداقل ۲ نویسه) لازم است')
  return handle(query)
}

/** GET /api/products/image-search?q=... (kept for compatibility) */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const query = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (query.length < 2) return fail('عبارت جستجو (حداقل ۲ نویسه) لازم است')
  return handle(query)
}
