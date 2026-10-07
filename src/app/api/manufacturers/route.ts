import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { hasCap } from '@/lib/rbac'

/**
 * تولیدکنندگان (Manufacturers) — رکورد مادر زنجیرهٔ تأمین (SSOT).
 * هر تولیدکننده برندها و اسناد خودش را یک‌بار تعریف می‌کند؛ تأمین‌کنندگان/پخش‌ها
 * (Provider) به آن وصل می‌شوند تا «چه شرکتی چه محصولاتی را پشتیبانی می‌کند» شفاف بماند.
 */

function parseBrands(s: string): string[] {
  try {
    const arr = JSON.parse(s || '[]')
    return Array.isArray(arr) ? arr.map((b: any) => String(b)).filter(Boolean) : []
  } catch {
    return []
  }
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)

  const rows = await db.manufacturer.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] })
  const providers = await db.provider.findMany({ where: { active: true }, select: { id: true, name: true, manufacturerId: true } })
  const products = await db.product.findMany({ where: { active: true }, select: { id: true, brand: true } })

  return json({
    manufacturers: rows.map((m) => {
      const brands = parseBrands(m.brands)
      const myProviders = providers.filter((p) => p.manufacturerId === m.id)
      const brandSet = new Set(brands.map((b) => b.trim().toLowerCase()))
      const productCount = products.filter((p) => brandSet.has(p.brand.trim().toLowerCase())).length
      return {
        ...m,
        brands,
        providerCount: myProviders.length,
        productCount,
        providers: myProviders.map((p) => ({ id: p.id, name: p.name })),
      }
    }),
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await hasCap(me as any, 'manufacturers.manage')))
    return fail('ثبت تولیدکننده نیازمند دسترسی «مدیریت تولیدکنندگان» است', 403)

  const body = await req.json()
  const name = String(body.name || '').trim()
  if (!name) return fail('نام تولیدکننده الزامی است', 400)

  const dup = await db.manufacturer.findFirst({ where: { name } })
  if (dup) return fail(`تولیدکننده‌ای با همین نام از قبل ثبت شده است (${dup.name})`, 409)

  const brands = (Array.isArray(body.brands) ? body.brands : []).map((b: any) => String(b).trim()).filter(Boolean)

  const manufacturer = await db.manufacturer.create({
    data: {
      name,
      country: String(body.country || 'ایران').trim() || 'ایران',
      website: String(body.website || '').trim(),
      phone: String(body.phone || '').trim(),
      brands: JSON.stringify(brands),
      notes: String(body.notes || ''),
    },
  })
  await logActivity(me, 'ثبت تولیدکننده', 'manufacturer', manufacturer.id, `${name}${brands.length ? ` — برندها: ${brands.join('، ')}` : ''}`)
  return json({ manufacturer: { ...manufacturer, brands } }, 201)
}
