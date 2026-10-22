import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

const STATUSES = ['SENT', 'FAILED', 'SKIPPED', 'PENDING']

/** GET /api/sms/outbox?status=&provider=&take= → last rows (max 200) — مرکز پیامک */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'system/smscenter')
  if (!gate.ok) return fail(gate.deny, 403)

  const url = new URL(req.url)
  const status = (url.searchParams.get('status') || '').trim().toUpperCase()
  const provider = (url.searchParams.get('provider') || '').trim()
  const takeRaw = Number(url.searchParams.get('take'))
  const take = Number.isFinite(takeRaw) ? Math.min(200, Math.max(1, Math.round(takeRaw))) : 200

  const where: Record<string, unknown> = {}
  if (status && STATUSES.includes(status)) where.status = status
  if (provider) where.provider = provider

  const rows = await db.smsOutbox.findMany({ where, orderBy: { createdAt: 'desc' }, take })

  return ok({
    items: rows.map((r) => ({
      id: r.id,
      to: r.to,
      toName: r.toName,
      text: r.text,
      reason: r.reason,
      refId: r.refId,
      status: r.status,
      provider: r.provider,
      messageId: r.messageId,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
      sentAt: r.sentAt?.toISOString() ?? null,
    })),
  })
}
