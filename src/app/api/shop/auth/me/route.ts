import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { requireShopCustomer } from '@/lib/shop-http'

export const dynamic = 'force-dynamic'

/** GET /api/shop/auth/me — پروفایل مشتری جاری */
export async function GET(req: NextRequest) {
  const { customer, denied } = await requireShopCustomer(req)
  if (denied) return denied
  const ordersCount = await db.shopOrder.count({ where: { customerId: customer!.id } })
  return ok({ id: customer!.id, phone: customer!.phone, name: customer!.name, ordersCount })
}

/** PATCH /api/shop/auth/me {name} — ثبت/ویرایش نام نمایشی */
export async function PATCH(req: NextRequest) {
  const { customer, denied } = await requireShopCustomer(req)
  if (denied) return denied
  const body = (await req.json().catch(() => ({}))) as { name?: string }
  const name = String(body.name ?? '').trim().slice(0, 60)
  if (name.length < 2) return fail('نام را کامل وارد کنید')
  await db.shopCustomer.update({ where: { id: customer!.id }, data: { name } })
  return ok({ name })
}
