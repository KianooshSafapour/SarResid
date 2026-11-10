import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { normalizeShopPhone, otpSend, getShopSettings } from '@/lib/shop'
import { clientIp, checkServiceToken } from '@/lib/shop-http'

export const dynamic = 'force-dynamic'

/** POST /api/shop/auth/otp {phone} — ارسال کد ورود (نرخ: ۳/ساعت/شماره) */
export async function POST(req: NextRequest) {
  if (!(await checkServiceToken(req))) return fail('توکن سرویس نامعتبر است', 403)
  const body = (await req.json().catch(() => ({}))) as { phone?: string }
  const phone = normalizeShopPhone(body.phone)
  if (!phone) return fail('شمارهٔ موبایل معتبر نیست — مثل ۰۹۱۲۳۴۵۶۷۸۹ وارد کنید')

  const settings = await getShopSettings()
  const res = await otpSend(phone, clientIp(req), settings.devOtp)
  if (!res.ok) return fail(res.error, 429)
  return ok({ sent: true, ...(res.devCode ? { devCode: res.devCode } : {}) })
}
