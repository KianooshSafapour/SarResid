import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { slotsAvailable } from '@/lib/shop'
import { checkServiceToken } from '@/lib/shop-http'

export const dynamic = 'force-dynamic'

/** GET /api/shop/slots — بازه‌های تحویل آزاد (ظرفیت باقی‌ماندهٔ واقعی) */
export async function GET(req: NextRequest) {
  if (!(await checkServiceToken(req))) return fail('توکن سرویس نامعتبر است', 403)
  const slots = await slotsAvailable()
  return ok({ slots })
}
