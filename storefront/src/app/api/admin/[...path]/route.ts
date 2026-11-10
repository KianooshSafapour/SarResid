import { NextRequest, NextResponse } from 'next/server'

/**
 * پروکسی مدیر — فروشگاه آنلاین → سررسید.
 * نشست کارکنان (hz_session) به‌صورت کوکی first-party روی hyperzeytoon.com نگه داشته می‌شود
 * و اینجا به هدر Cookie برای سررسید ترجمه می‌شود؛ فقط مسیرهای مجاز مدیر.
 */
export const dynamic = 'force-dynamic'

const UPSTREAM = process.env.SHOP_API_BASE || 'http://127.0.0.1:3000'
const ALLOWED = [
  '/api/auth/roster',
  '/api/auth/login',
  '/api/auth/me',
  '/api/auth/logout',
  '/api/shop-admin/',
  '/api/sms/panels',
  '/api/products/image-search',
]

function target(path: string[]) {
  const p = '/api/' + path.join('/')
  if (!ALLOWED.some((a) => p === a || p.startsWith(a))) return null
  return p
}

async function proxy(req: NextRequest, path: string[]) {
  const p = target(path)
  if (!p) return NextResponse.json({ ok: false, error: 'مسیر مجاز نیست' }, { status: 403 })
  const url = new URL(UPSTREAM + p)
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v))

  const headers: Record<string, string> = { 'content-type': req.headers.get('content-type') || 'application/json' }
  const sess = req.cookies.get('hz_admin_session')?.value
  if (sess) headers.cookie = `hz_session=${sess}`

  let body: string | undefined
  if (!['GET', 'HEAD'].includes(req.method)) body = await req.text()

  try {
    const res = await fetch(url.toString(), {
      method: req.method,
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    const outHeaders = new Headers()
    res.headers.forEach((v, k) => {
      if (!['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k.toLowerCase())) outHeaders.set(k, v)
    })
    const out = new NextResponse(await res.text(), { status: res.status, headers: outHeaders })
    // نشست ورود مدیر را کوکی first-party خودمان کن
    const setCookies = res.headers.getSetCookie?.() || []
    for (const sc of setCookies) {
      const m = /hz_session=([^;]+)/.exec(sc)
      if (m) {
        out.headers.append('set-cookie', `hz_admin_session=${m[1]}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
      }
    }
    return out
  } catch {
    return NextResponse.json({ ok: false, error: 'ارتباط با سررسید برقرار نشد' }, { status: 503 })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}
