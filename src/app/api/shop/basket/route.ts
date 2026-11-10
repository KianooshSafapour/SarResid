import { NextRequest, NextResponse } from 'next/server'
import { ok, fail, clampInt } from '@/lib/api'
import { db } from '@/lib/db'
import {
  basketView, SHOP_CART_COOKIE, cartCookieOptions, getShopSettings,
  priceOf, availableOf, reservedMap,
} from '@/lib/shop'
import { checkServiceToken, ensureBasket } from '@/lib/shop-http'

export const dynamic = 'force-dynamic'

/** GET /api/shop/basket — سبد جاری (کوکی/هدر) با قیمت‌ها و موجودی زنده */
export async function GET(req: NextRequest) {
  if (!(await checkServiceToken(req))) return fail('توکن سرویس نامعتبر است', 403)
  const basket = await ensureBasket(req)
  const view = await basketView(basket.basketId)
  const res = NextResponse.json({ ok: true, data: view })
  if (basket.isNew) res.cookies.set(SHOP_CART_COOKIE, basket.token, cartCookieOptions)
  return res
}

/** DELETE /api/shop/basket — خالی‌کردن سبد */
export async function DELETE(req: NextRequest) {
  if (!(await checkServiceToken(req))) return fail('توکن سرویس نامعتبر است', 403)
  const basket = await ensureBasket(req)
  await db.shopBasketItem.deleteMany({ where: { basketId: basket.basketId } })
  const res = NextResponse.json({ ok: true, data: { cleared: true } })
  if (basket.isNew) res.cookies.set(SHOP_CART_COOKIE, basket.token, cartCookieOptions)
  return res
}

/** POST /api/shop/basket {productId, qty} — افزودن/کم‌وزیاد کردن مستقیم (qty=۰ حذف) */
export async function POST(req: NextRequest) {
  if (!(await checkServiceToken(req))) return fail('توکن سرویس نامعتبر است', 403)
  const body = (await req.json().catch(() => ({}))) as { productId?: string; qty?: number }
  const productId = String(body.productId ?? '')
  const qty = clampInt(body.qty, 0, 99, 1)
  if (!productId) return fail('کالا مشخص نیست')

  const p = await db.product.findUnique({ where: { id: productId }, select: { id: true, name: true, active: true, status: true, sellPrice: true, sellPrice2: true, stock: true } })
  if (!p || !p.active || p.status !== 'فعال') return fail('این کالای در فروشگاه آنلاین نیست', 404)
  const price = priceOf(p)
  if (price <= 0) return fail('قیمت این کالا هنوز تنظیم نشده است', 400)

  const settings = await getShopSettings()
  const basket = await ensureBasket(req)

  if (qty === 0) {
    await db.shopBasketItem.deleteMany({ where: { basketId: basket.basketId, productId } })
  } else {
    const reserved = await reservedMap([productId], basket.basketId)
    const avail = availableOf(p.stock, reserved.get(productId) || 0, settings.shelfFloor)
    if (avail <= 0) return fail('موجودی این کالا تمام شده است', 409)
    const finalQty = Math.min(qty, avail)
    const trimmed = finalQty < qty
    await db.shopBasketItem.upsert({
      where: { basketId_productId: { basketId: basket.basketId, productId } },
      create: { basketId: basket.basketId, productId, qty: finalQty, unitPrice: price },
      update: { qty: finalQty, unitPrice: price },
    })
    await db.shopBasket.update({ where: { id: basket.basketId }, data: { updatedAt: new Date() } })
    if (trimmed) {
      const view = await basketView(basket.basketId)
      const res = NextResponse.json({ ok: true, data: { ...view, trimmedTo: finalQty, available: avail } })
      if (basket.isNew) res.cookies.set(SHOP_CART_COOKIE, basket.token, cartCookieOptions)
      return res
    }
  }

  const view = await basketView(basket.basketId)
  const res = NextResponse.json({ ok: true, data: view })
  if (basket.isNew) res.cookies.set(SHOP_CART_COOKIE, basket.token, cartCookieOptions)
  return res
}
