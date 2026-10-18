import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { canZones } from '@/lib/access'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** PATCH /api/store/zone-counts/[id] {action:'confirm'|'query', mismatchReason?} — managers only */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('فقط مدیران می‌توانند شمارش را تأیید کنند', 403)

  const { id } = await ctx.params
  const count = await db.zoneCount.findUnique({ where: { id } })
  if (!count) return fail('شمارش یافت نشد', 404)

  const body = await req.json().catch(() => null)
  const action = String(body?.action || '')
  const mismatchReason = typeof body?.mismatchReason === 'string' && body.mismatchReason.trim() ? body.mismatchReason.trim() : null

  if (action === 'confirm') {
    await db.zoneCount.update({ where: { id }, data: { status: mismatchReason ? `CONFIRMED|${mismatchReason}` : 'CONFIRMED' } })
  } else if (action === 'query') {
    await db.zoneCount.update({
      where: { id },
      data: { status: mismatchReason ? `QUERIED|${mismatchReason}` : 'QUERIED', recheckCount: { increment: 1 } },
    })
  } else {
    return fail('عملیات نامعتبر است')
  }

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: action === 'confirm' ? 'zonecount.confirm' : 'zonecount.query',
    actionLabel: 'شمارش زون',
    category: 'zonecount',
    detail: `${count.zoneName}${mismatchReason ? ` — ${mismatchReason}` : ''}`,
    entityId: id,
  })
  return ok({ id, confirmStatus: action === 'confirm' ? 'CONFIRMED' : 'QUERIED' })
}
