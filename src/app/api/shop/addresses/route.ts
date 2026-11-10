import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { requireShopCustomer } from '@/lib/shop-http'
import { normalizeShopPhone } from '@/lib/shop'

export const dynamic = 'force-dynamic'

/** GET /api/shop/addresses — آدرس‌های من */
export async function GET(req: NextRequest) {
  const { customer, denied } = await requireShopCustomer(req)
  if (denied) return denied
  const rows = await db.shopAddress.findMany({ where: { customerId: customer!.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] })
  return ok({ addresses: rows })
}

/** POST /api/shop/addresses — آدرس جدید (receiver/address اجباری؛ سقف ۵ آدرس) */
export async function POST(req: NextRequest) {
  const { customer, denied } = await requireShopCustomer(req)
  if (denied) return denied
  const count = await db.shopAddress.count({ where: { customerId: customer!.id } })
  if (count >= 5) return fail('حداکثر ۵ آدرس می‌توانید داشته باشید — یکی را حذف کنید')

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const receiver = String(body.receiver ?? '').trim().slice(0, 80)
  const address = String(body.address ?? '').trim().slice(0, 400)
  const phone = body.phone ? normalizeShopPhone(body.phone) : null
  if (receiver.length < 2) return fail('نام گیرنده را وارد کنید')
  if (address.length < 10) return fail('آدرس را کامل‌تر وارد کنید (حداقل ۱۰ نویسه)')
  if (body.phone && !phone) return fail('شمارهٔ تماس جایگزین معتبر نیست')

  const row = await db.shopAddress.create({
    data: {
      customerId: customer!.id,
      label: String(body.label ?? 'خانه').trim().slice(0, 30) || 'خانه',
      receiver,
      phone,
      city: String(body.city ?? 'رفسنجان').trim().slice(0, 40) || 'رفسنجان',
      address,
      postalCode: String(body.postalCode ?? '').replace(/[^\d]/g, '').slice(0, 10) || null,
      note: String(body.note ?? '').trim().slice(0, 120) || null,
      isDefault: count === 0,
    },
  })
  return ok({ address: row })
}
