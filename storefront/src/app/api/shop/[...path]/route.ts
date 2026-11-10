import { NextRequest, NextResponse } from 'next/server'

/**
 * پروکسی ویترین → Commerce API سررسید.
 * کوکی‌های خودمون (hz_shop/hz_cart) به هدر X-Shop-Token/X-Shop-Cart ترجمه می‌شوند تا
 * سررسید بدون CORS/کوکیِ بین‌دامنه کار کند؛ Set-Cookie پاسخ عیناً به مرورگر می‌رسد
 * (کوکی first-party روی hyperzeytoon.com).
 */
export const dynamic = 'force-dynamic'

const UPSTREAM = process.env.SHOP_API_BASE || 'http://127.0.0.1:3000'
const SERVICE_TOKEN = process.env.SHOP_SERVICE_TOKEN || ''

async function proxy(req: NextRequest, path: string[]) {
  const url = new URL(`${UPSTREAM}/api/shop/${path.join('/')}`)
  const sp = req.nextUrl.searchParams
  sp.forEach((v, k) => url.searchParams.set(k, v))

  const headers: Record<string, string> = {
    'content-type': req.headers.get('content-type') || 'application/json',
    'x-forwarded-for': req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1',
    'user-agent': req.headers.get('user-agent') || '',
  }
  const cust = req.cookies.get('hz_shop')?.value
  const cart = req.cookies.get('hz_cart')?.value
  if (cust) headers['x-shop-token'] = cust
  if (cart) headers['x-shop-cart'] = cart
  if (SERVICE_TOKEN) headers['x-shop-service'] = SERVICE_TOKEN

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
    // کوکی‌های سررسید (hz_shop/hz_cart) روی دامنهٔ خود ویترین ست می‌شوند
    const setCookies = res.headers.getSetCookie?.() || []
    for (const sc of setCookies) out.headers.append('set-cookie', sc)
    return out
  } catch {
    return NextResponse.json({ ok: false, error: 'ارتباط با فروشگاه برقرار نشد — چند لحظه بعد تلاش کنید' }, { status: 503 })
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
