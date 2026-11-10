import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const EVENT_KINDS = ['VISIT', 'PURCHASE', 'COMPLAINT', 'NOTE']

function eventPayloadOf(content: string | null): Record<string, unknown> {
  const parsed = safeJson<unknown>(content, null)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  if (content) return { note: content }
  return {}
}

/** GET /api/crm/events?customerId= → {events:[{id,customerId,kind,content,payload,createdAt}]} */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const url = new URL(req.url)
  const customerId = (url.searchParams.get('customerId') || '').trim()
  if (!customerId) return fail('شناسه مشتری لازم است')

  const events = await db.crmEvent.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return ok({
    events: events.map((e) => {
      const payload = eventPayloadOf(e.content)
      return {
        id: e.id,
        customerId: e.customerId,
        kind: e.kind,
        content: typeof payload.note === 'string' ? payload.note : null,
        payload,
        createdAt: e.createdAt.toISOString(),
      }
    }),
  })
}

/** POST /api/crm/events — {customerId, kind, payload:{note?}|content?} (customerId may be id or phone) */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const body = await req.json().catch(() => null)
  if (!body) return fail('درخواست نامعتبر است')

  const customerId = String(body.customerId ?? '').trim()
  if (!customerId) return fail('شناسه مشتری لازم است')

  const kind = String(body.kind ?? '').trim().toUpperCase()
  if (!EVENT_KINDS.includes(kind)) return fail('نوع رویداد نامعتبر است')

  let payload: Record<string, unknown>
  if (body.payload && typeof body.payload === 'object') payload = body.payload as Record<string, unknown>
  else if (body.content) payload = { note: String(body.content) }
  else payload = {}

  const content = JSON.stringify(payload)
  const created = await db.crmEvent.create({
    data: { customerId, kind, content, userId: me.id },
  })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'crm.event.create',
    actionLabel: 'ثبت رویداد',
    category: 'crm',
    detail: `${kind} — ${customerId}`,
    entityId: created.id,
  })

  return ok({
    id: created.id,
    customerId: created.customerId,
    kind: created.kind,
    content: typeof payload.note === 'string' ? payload.note : null,
    payload,
    createdAt: created.createdAt.toISOString(),
  })
}
