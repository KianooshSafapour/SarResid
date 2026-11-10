import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { requireShopCustomer } from '@/lib/shop-http'
import { normalizeShopPhone } from '@/lib/shop'

export const dynamic = 'force-dynamic'

async function ownedAddress(customerId: string, id: string) {
  return db.shopAddress.findFirst({ where: { id, customerId } })
}

/** PUT /api/shop/addresses/[id] — ویرایش (و isDefault) */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { customer, denied } = await requireShopCustomer(req)
  if (denied) return denied
  const { id } = await params
  const row = await ownedAddress(customer!.id, id)
  if (!row) return fail('آدرس پیدا نشد', 404)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  if (body.isDefault === true) {
    await db.shopAddress.updateMany({ where: { customerId: customer!.id }, data: { isDefault: false } })
    await db.shopAddress.update({ where: { id }, data: { isDefault: true } })
    return ok({ updated: true })
  }

  const receiver = body.receiver !== undefined ? String(body.receiver).trim().slice(0, 80) : row.receiver
  const address = body.address !== undefined ? String(body.address).trim().slice(0, 400) : row.address
  if (receiver.length < 2 || address.length < 10) return fail('نام گیرنده و آدرس را کامل وارد کنید')
  const phone = body.phone === undefined ? row.phone : body.phone ? normalizeShopPhone(body.phone) : null
  if (body.phone && !phone) return fail('شمارهٔ تماس جایگزین معتبر نیست')

  await db.shopAddress.update({
    where: { id },
    data: {
      label: body.label !== undefined ? String(body.label).trim().slice(0, 30) || 'خانه' : row.label,
      receiver, address, phone,
      city: body.city !== undefined ? String(body.city).trim().slice(0, 40) || 'رفسنجان' : row.city,
      postalCode: body.postalCode !== undefined ? String(body.postalCode).replace(/[^\d]/g, '').slice(0, 10) || null : row.postalCode,
      note: body.note !== undefined ? String(body.note).trim().slice(0, 120) || null : row.note,
    },
  })
  return ok({ updated: true })
}

/** DELETE /api/shop/addresses/[id] */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { customer, denied } = await requireShopCustomer(req)
  if (denied) return denied
  const { id } = await params
  const row = await ownedAddress(customer!.id, id)
  if (!row) return fail('آدرس پیدا نشد', 404)
  await db.shopAddress.delete({ where: { id } })
  if (row.isDefault) {
    const next = await db.shopAddress.findFirst({ where: { customerId: customer!.id }, orderBy: { createdAt: 'desc' } })
    if (next) await db.shopAddress.update({ where: { id: next.id }, data: { isDefault: true } })
  }
  return ok({ deleted: true })
}
