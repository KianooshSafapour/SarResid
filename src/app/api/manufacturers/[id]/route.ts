import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { hasCap } from '@/lib/rbac'

/**
 * ویرایش/حذف تولیدکننده + اتصال تأمین‌کنندگان (PATCH action:'assign-providers').
 */

function parseBrands(s: string): string[] {
  try {
    const arr = JSON.parse(s || '[]')
    return Array.isArray(arr) ? arr.map((b: any) => String(b)).filter(Boolean) : []
  } catch {
    return []
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await hasCap(me as any, 'manufacturers.manage')))
    return fail('ویرایش تولیدکننده نیازمند دسترسی «مدیریت تولیدکنندگان» است', 403)

  const manufacturer = await db.manufacturer.findUnique({ where: { id } })
  if (!manufacturer) return fail('تولیدکننده یافت نشد', 404)

  const body = await req.json()

  // ── اتصال/جداکردن تأمین‌کنندگان به این تولیدکننده (multi-select) ──
  if (body.action === 'assign-providers') {
    const ids: string[] = Array.isArray(body.providerIds) ? body.providerIds.map((x: any) => String(x)).filter(Boolean) : []
    const current = await db.provider.findMany({ where: { manufacturerId: id }, select: { id: true, name: true } })
    const toUnset = current.filter((p) => !ids.includes(p.id))
    const currentIds = new Set(current.map((p) => p.id))
    const toSet = ids.filter((pid) => !currentIds.has(pid))
    await db.$transaction([
      ...toUnset.map((p) => db.provider.update({ where: { id: p.id }, data: { manufacturerId: '' } })),
      ...toSet.map((pid) => db.provider.update({ where: { id: pid }, data: { manufacturerId: id } })),
    ])
    await logActivity(
      me,
      'اتصال تأمین‌کنندگان به تولیدکننده',
      'manufacturer',
      id,
      `${manufacturer.name} — متصل: ${toSet.length}، جدا: ${toUnset.length}`,
    )
    const providers = await db.provider.findMany({ where: { manufacturerId: id }, select: { id: true, name: true } })
    return json({ ok: true, providers, providerCount: providers.length })
  }

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = String(body.name || '').trim()
    if (!name) return fail('نام تولیدکننده الزامی است', 400)
    if (name !== manufacturer.name) {
      const dup = await db.manufacturer.findFirst({ where: { name } })
      if (dup) return fail(`تولیدکننده‌ای با همین نام از قبل ثبت شده است (${dup.name})`, 409)
      data.name = name
    }
  }
  if (body.country !== undefined) data.country = String(body.country || '').trim()
  if (body.website !== undefined) data.website = String(body.website || '').trim()
  if (body.phone !== undefined) data.phone = String(body.phone || '').trim()
  if (body.notes !== undefined) data.notes = String(body.notes || '')
  if (body.active !== undefined) data.active = Boolean(body.active)
  if (body.brands !== undefined) {
    const brands = (Array.isArray(body.brands) ? body.brands : []).map((b: any) => String(b).trim()).filter(Boolean)
    data.brands = JSON.stringify([...new Set(brands)])
  }

  const updated = await db.manufacturer.update({ where: { id }, data })
  await logActivity(me, 'ویرایش تولیدکننده', 'manufacturer', id, updated.name)
  return json({ manufacturer: { ...updated, brands: parseBrands(updated.brands) } })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await hasCap(me as any, 'manufacturers.manage')))
    return fail('حذف تولیدکننده نیازمند دسترسی «مدیریت تولیدکنندگان» است', 403)

  const manufacturer = await db.manufacturer.findUnique({ where: { id } })
  if (!manufacturer) return fail('تولیدکننده یافت نشد', 404)

  const linked = await db.provider.count({ where: { manufacturerId: id } })
  if (linked > 0)
    return fail(`${linked} تأمین‌کننده به این تولیدکننده متصل است — ابتدا اتصال‌ها را جدا کنید`, 409)

  await db.manufacturer.delete({ where: { id } })
  await logActivity(me, 'حذف تولیدکننده', 'manufacturer', id, manufacturer.name)
  return json({ ok: true })
}
