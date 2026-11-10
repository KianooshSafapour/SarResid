import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { normalizeShopPhone, ORDER_STATUS_FA } from '@/lib/shop'
import { checkServiceToken } from '@/lib/shop-http'

export const dynamic = 'force-dynamic'

/** GET /api/shop/track?code=&phone= — پیگیری عمومی با کد+موبایل (بدون ورود؛ فقط خلاصه) */
export async function GET(req: NextRequest) {
  if (!(await checkServiceToken(req))) return fail('توکن سرویس نامعتبر است', 403)
  const code = (req.nextUrl.searchParams.get('code') || '').trim().toUpperCase()
  const phone = normalizeShopPhone(req.nextUrl.searchParams.get('phone') || '')
  if (!/^HZ-WEB-\d+$/.test(code)) return fail('کد سفارش معتبر نیست (مثل HZ-WEB-0017)')
  if (!phone) return fail('شمارهٔ موبایل معتبر نیست')

  const order = await db.shopOrder.findFirst({
    where: { code, customer: { phone } },
    select: { code: true, status: true, total: true, slotDate: true, slotFrom: true, slotTo: true, createdAt: true },
  })
  if (!order) return fail('سفارشی با این کد و شماره پیدا نشد', 404)
  return ok({
    order: {
      code: order.code,
      status: order.status,
      statusFa: ORDER_STATUS_FA[order.status] || order.status,
      total: order.total,
      slotDate: order.slotDate, slotFrom: order.slotFrom, slotTo: order.slotTo,
      createdAt: order.createdAt,
    },
  })
}
