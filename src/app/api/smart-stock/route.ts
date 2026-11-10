import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { calcSmartStock, recalcAllSmartStocks } from '@/lib/smart-stock'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** GET /api/smart-stock?productId= — پیشنهاد نقطهٔ سفارش مجدد برای یک کالا */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const productId = req.nextUrl.searchParams.get('productId')
  if (productId) {
    const calc = await calcSmartStock(productId)
    if (!calc) return fail('کالا پیدا نشد', 404)
    return ok(calc)
  }
  return fail('productId الزامی است')
}

/** POST /api/smart-stock — بازمحاسبهٔ گروهی همهٔ کالاها */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(user.role)) return fail('فقط مدیران', 403)

  const result = await recalcAllSmartStocks()
  return ok(result)
}

/** PUT /api/smart-stock {productId, threshold} — تنظیم دستی نقطهٔ سفارش */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM'].includes(user.role)) return fail('دسترسی ندارید', 403)

  const body = (await req.json().catch(() => ({}))) as { productId?: string; threshold?: number }
  const productId = String(body.productId ?? '')
  const threshold = Number(body.threshold)
  if (!productId) return fail('productId الزامی است')
  if (!Number.isFinite(threshold) || threshold < 0) return fail('مقدار نامعتبر')

  await db.product.update({
    where: { id: productId },
    data: { lowStockThreshold: threshold > 0 ? Math.round(threshold) : null },
  })
  return ok({ productId, threshold: threshold > 0 ? Math.round(threshold) : null, source: threshold > 0 ? 'manual' : 'auto' })
}
