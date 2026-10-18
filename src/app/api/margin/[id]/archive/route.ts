import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { toFaDigits } from '@/lib/jalali'
import { MARGIN_ROLES } from '../../route'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** POST /api/margin/[id]/archive — {archived: bool} toggles the archive lock */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!MARGIN_ROLES.includes(me.role)) return fail('شما مجاز به بایگانی فاکتور نیستید', 403)

  const { id } = await ctx.params
  const inv = await db.marginInvoice.findUnique({ where: { id } })
  if (!inv) return fail('فاکتور یافت نشد', 404)

  const body = await req.json().catch(() => ({}))
  const archived = body?.archived === undefined ? true : !!body.archived

  const updated = await db.marginInvoice.update({
    where: { id },
    data: archived ? { archived: true, archivedAt: new Date() } : { archived: false, archivedAt: null },
  })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: archived ? 'margin.archive' : 'margin.unarchive',
    actionLabel: 'بایگانی فاکتور سودسنج',
    category: 'profit',
    detail: `#${toFaDigits(String(updated.number))} — ${archived ? 'بایگانی و قفل شد' : 'بایگانی باز شد'}`,
    entityId: id,
  })

  return ok({
    id: updated.id,
    archived: updated.archived,
    archivedAt: updated.archivedAt ? updated.archivedAt.toISOString() : null,
  })
}
