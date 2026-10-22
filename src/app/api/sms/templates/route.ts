import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

/** GET /api/sms/templates → {items} — قالب‌های پیامک */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'system/smscenter')
  if (!gate.ok) return fail(gate.deny, 403)

  const items = await db.smsTemplate.findMany({ orderBy: { createdAt: 'asc' } })
  return ok({
    items: items.map((t) => ({
      id: t.id,
      key: t.key,
      title: t.title,
      body: t.body,
      enabled: t.enabled,
      createdAt: t.createdAt.toISOString(),
    })),
  })
}

/** POST /api/sms/templates {key, title, body, enabled?} — create a new template */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'system/smscenter')
  if (!gate.ok) return fail(gate.deny, 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const key = String(body.key ?? '').trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(key)) {
    return fail('کلید قالب نامعتبر است (حروف بزرگ انگلیسی، عدد و _ — مثال: PAYMENT_SUBMITTED)')
  }
  const title = String(body.title ?? '').trim()
  if (!title) return fail('عنوان قالب را وارد کنید')
  const tplBody = String(body.body ?? '').trim()
  if (!tplBody) return fail('متن قالب را وارد کنید')

  const existing = await db.smsTemplate.findUnique({ where: { key } })
  if (existing) return fail('قالبی با این کلید قبلاً ثبت شده است')

  const created = await db.smsTemplate.create({
    data: { key, title, body: tplBody, enabled: body.enabled !== false },
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'sms.template.create',
    actionLabel: 'قالب پیامک',
    category: 'settings',
    detail: `قالب «${title}» (${key}) ساخته شد`,
    entityId: created.id,
  })

  return ok({ id: created.id })
}
