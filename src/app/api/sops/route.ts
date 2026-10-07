import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const sops = await db.sOP.findMany({ orderBy: { updatedAt: 'desc' } })
  return json({ sops: sops.map((s) => ({ ...s, steps: JSON.parse(s.steps || '[]') })) })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me || !['GM', 'OM', 'PM'].includes(me.role))
    return fail('فقط مدیران می‌توانند روال جدید تعریف کنند', 403)
  const body = await req.json()
  if (!body.title || !Array.isArray(body.steps) || !body.steps.length)
    return fail('عنوان و مراحل الزامی است')
  const sop = await db.sOP.create({
    data: {
      title: body.title,
      category: body.category || 'عمومی',
      steps: JSON.stringify(body.steps),
      createdById: me.id,
      updatedBy: me.name,
    },
  })
  await logActivity(me, 'تعریف روال جدید (SOP)', 'sop', sop.id, body.title)
  return json({ sop: { ...sop, steps: JSON.parse(sop.steps) } }, 201)
}
