import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/app/notifications — bell dropdown (UNREAD items only; the client
 * clears the list locally after "read-all" and re-polls every 30s).
 * Visibility: userId = me OR role = my role OR (userId null AND role null).
 */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const where = {
    readAt: null,
    OR: [{ userId: me.id }, { role: me.role }, { userId: null, role: null }],
  }

  const [items, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 30 }),
    db.notification.count({ where }),
  ])

  return ok({
    items: items.map((n) => ({
      id: n.id,
      userId: n.userId,
      role: n.role,
      kind: n.kind,
      severity: n.severity,
      title: n.title,
      body: n.body,
      go: n.go,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
    unread,
  })
}

/**
 * POST /api/app/notifications — mark read.
 * Body: {action:"read-all"} | {all:true} | {ids:[...]}
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    all?: boolean
    ids?: string[]
  }

  const scope = {
    readAt: null,
    OR: [{ userId: me.id }, { role: me.role }, { userId: null, role: null }],
  }

  const now = new Date()
  if (body.action === 'read-all' || body.all === true) {
    const res = await db.notification.updateMany({ where: scope, data: { readAt: now } })
    return ok({ updated: res.count })
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    const ids = body.ids.filter((x) => typeof x === 'string').slice(0, 100)
    const res = await db.notification.updateMany({
      where: { ...scope, id: { in: ids } },
      data: { readAt: now },
    })
    return ok({ updated: res.count })
  }

  return fail('درخواست نامعتبر است')
}
