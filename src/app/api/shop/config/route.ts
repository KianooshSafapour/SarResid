import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { getShopSettings } from '@/lib/shop'
import { checkServiceToken } from '@/lib/shop-http'

export const dynamic = 'force-dynamic'

/** GET /api/shop/config — پیکربندی عمومی ویترین (بدون راز) */
export async function GET(req: NextRequest) {
  if (!(await checkServiceToken(req))) return fail('توکن سرویس نامعتبر است', 403)
  const s = await getShopSettings()
  return ok({
    open: s.open,
    storeName: s.storeName,
    announcement: s.announcement,
    deliveryFee: s.deliveryFee,
    freeDeliveryMin: s.freeDeliveryMin,
    minOrder: s.minOrder,
    hotline: s.hotline,
    gatewayAvailable: s.gateway === 'zarinpal' && !!s.gatewayMerchant,
  })
}
