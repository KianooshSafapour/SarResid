import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { generateDemoCompany, DEMO_PROFILES, type DemoProfile } from '@/lib/demo-generator'

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (id) {
    const row = await db.demoCompany.findUnique({ where: { id } })
    if (!row) return fail('دمو یافت نشد', 404)
    return json({ demo: { ...row, data: safeParse(row.data, {}) } })
  }

  const rows = await db.demoCompany.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, profile: true, branchCount: true, description: true, createdAt: true, createdByName: true },
  })
  return json({ demos: rows, profiles: DEMO_PROFILES })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  const profile = String(body.profile || '') as DemoProfile
  if (!DEMO_PROFILES[profile]) return fail('پروفایل نامعتبر است')

  // حداکثر ۸ دمو نگه می‌داریم (قدیمی‌ها حذف)
  const existing = await db.demoCompany.findMany({ orderBy: { createdAt: 'asc' } })
  if (existing.length >= 8) {
    await db.demoCompany.delete({ where: { id: existing[0].id } })
  }

  const data = generateDemoCompany(profile, me.name)
  const row = await db.demoCompany.create({
    data: {
      name: DEMO_PROFILES[profile].name,
      profile,
      branchCount: data.branches.length,
      description: DEMO_PROFILES[profile].desc,
      data: JSON.stringify(data),
      createdById: me.id,
      createdByName: me.name,
    },
  })
  await logActivity(me, 'ساخت دموی نمایشی', 'demo', row.id, DEMO_PROFILES[profile].name)
  return json({ demo: { id: row.id, name: row.name, profile: row.profile }, data })
}

export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return fail('شناسه لازم است')
  await db.demoCompany.delete({ where: { id } }).catch(() => null)
  await logActivity(me, 'حذف دموی نمایشی', 'demo', id)
  return json({ ok: true })
}
