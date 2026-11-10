import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { settleGatewayPayment } from '@/lib/shop'
import { checkServiceToken } from '@/lib/shop-http'

export const dynamic = 'force-dynamic'

/**
 * POST /api/shop/payment/callback {ref, ok} — تسویهٔ پرداخت.
 * mock: صفحهٔ شبیه‌ساز ویترین می‌زند. زرین‌پال: صفحهٔ بازگشت ویترین بعد از verify سمت سرور
 * (verify خود اینجا هم انجام می‌شود وقتی ok=true و مرجع authority باشد — نهایتاً توسط مالک
 * با merchant واقعی فعال می‌شود).
 */
export async function POST(req: NextRequest) {
  if (!(await checkServiceToken(req))) return fail('توکن سرویس نامعتبر است', 403)
  const body = (await req.json().catch(() => ({}))) as { ref?: string; ok?: boolean }
  const ref = String(body.ref ?? '').slice(0, 80)
  if (!ref) return fail('مرجع پرداخت نیست')
  const res = await settleGatewayPayment(ref, body.ok === true)
  if (!res.ok) return fail(res.error || 'تسویه ناموفق', 400)
  return ok({ settled: true, orderCode: res.orderCode })
}
