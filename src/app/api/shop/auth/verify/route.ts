import { NextRequest, NextResponse } from 'next/server'
import { ok, fail } from '@/lib/api'
import { normalizeShopPhone, otpVerify, getShopSettings, SHOP_CUSTOMER_COOKIE, customerCookieOptions, basketAttachCustomer } from '@/lib/shop'
import { checkServiceToken, ensureBasket } from '@/lib/shop-http'

export const dynamic = 'force-dynamic'

/** POST /api/shop/auth/verify {phone, code} → توکن نشست (+کوکی hz_shop) — سبد مهمان به حساب وصل می‌شود */
export async function POST(req: NextRequest) {
  if (!(await checkServiceToken(req))) return fail('توکن سرویس نامعتبر است', 403)
  const body = (await req.json().catch(() => ({}))) as { phone?: string; code?: string }
  const phone = normalizeShopPhone(body.phone)
  const code = String(body.code ?? '').replace(/[^\d]/g, '')
  if (!phone) return fail('شمارهٔ موبایل معتبر نیست')
  if (code.length !== 5) return fail('کد ۵ رقمی را وارد کنید')

  const settings = await getShopSettings()
  const res = await otpVerify(phone, code, settings.devOtp)
  if (!res.ok) return fail(res.error, 401)

  // سبد مهمان فعلی را به مشتری وصل کن (اگر بود)
  const basket = await ensureBasket(req)
  await basketAttachCustomer(basket.basketId, res.customer.id)

  const response = NextResponse.json({ ok: true, data: { token: res.token, customer: res.customer } })
  response.cookies.set(SHOP_CUSTOMER_COOKIE, res.token, customerCookieOptions)
  return response
}
