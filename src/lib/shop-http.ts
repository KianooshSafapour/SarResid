import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { fail } from '@/lib/api'
import {
  SHOP_TOKEN_HEADER, SHOP_CART_HEADER, SHOP_SERVICE_HEADER, SHOP_CUSTOMER_COOKIE, SHOP_CART_COOKIE,
  verifyCustomerToken, basketIdByToken, newBasketToken, getShopSettings,
} from '@/lib/shop'

/** کمکی مشترک مسیرهای /api/shop/* — احراز هویت مشتری/سبد + توکن سرویس ویترین */

/** نقش‌هایی که پنل سفارش‌های آنلاین را می‌بینند — همفلسفهٔ دسترسی‌های پلتفرم */
export function canUseShopOps(role: string): boolean {
  return ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'SK', 'HC', 'CASHIER', 'SALES'].includes(role)
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'local'
}

/** اگر shop:apiToken تنظیم شده باشد، ویترین باید همان را در هدر بفرستد */
export async function checkServiceToken(req: NextRequest): Promise<boolean> {
  const settings = await getShopSettings()
  if (!settings.apiToken) return true
  return req.headers.get(SHOP_SERVICE_HEADER) === settings.apiToken
}

export async function shopCustomerOf(req: NextRequest) {
  const token = req.headers.get(SHOP_TOKEN_HEADER) || (await cookies()).get(SHOP_CUSTOMER_COOKIE)?.value
  const customerId = verifyCustomerToken(token)
  if (!customerId) return null
  const customer = await db.shopCustomer.findUnique({ where: { id: customerId } })
  if (!customer || customer.isBlocked) return null
  return customer
}

export async function requireShopCustomer(req: NextRequest) {
  const customer = await shopCustomerOf(req)
  if (!customer) return { customer: null, denied: fail('اول با شمارهٔ موبایل وارد شوید', 401) }
  return { customer, denied: null }
}

export interface BasketCtx {
  basketId: string
  token: string
  isNew: boolean
}

/** سبد فعال از هدر/کوکی؛ اگر نبود توکن تازه می‌سازد (فراخواننده کوکی را ست می‌کند) */
export async function ensureBasket(req: NextRequest): Promise<BasketCtx> {
  const existing = req.headers.get(SHOP_CART_HEADER) || (await cookies()).get(SHOP_CART_COOKIE)?.value
  if (existing && existing.length >= 8 && existing.length <= 80) {
    const basketId = await basketIdByToken(existing)
    if (basketId) return { basketId, token: existing, isNew: false }
  }
  const token = newBasketToken()
  const basketId = await basketIdByToken(token)
  if (!basketId) return { basketId: '', token, isNew: true }
  return { basketId, token, isNew: true }
}
