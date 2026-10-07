import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const providers = await db.provider.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  const products = await db.product.findMany({ where: { active: true } })
  return json({
    providers: providers.map((p) => ({
      ...p,
      companyNames: JSON.parse(p.companyNames || '[]'),
      productCount: products.filter((pr) => pr.providerId === p.id).length,
    })),
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  if (!body.name) return fail('نام تأمین‌کننده الزامی است')
  const provider = await db.provider.create({
    data: {
      name: body.name,
      personName: body.personName || '',
      phone: body.phone || '',
      type: body.type || 'DISTRIBUTOR',
      companyNames: JSON.stringify((body.companyNames || []).filter(Boolean)),
      manufacturerId: String(body.manufacturerId || ''),
      notes: body.notes || '',
    },
  })
  await logActivity(me, 'افزودن تأمین‌کننده', 'provider', provider.id, body.name)
  return json({ provider: { ...provider, companyNames: JSON.parse(provider.companyNames) } }, 201)
}
