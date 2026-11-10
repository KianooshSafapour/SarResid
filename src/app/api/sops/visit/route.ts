import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { displayName } from '@/lib/notify'

export const dynamic = 'force-dynamic'

/**
 * POST /api/sops/visit {id} — R5-P4
 * پایان موفق «شروع روال» (اجرای مرحله‌به‌مرحله تا آخر) ⇒ شمارندهٔ ماندگار
 * completions یک واحد زیاد می‌شود و شمارنده‌های به‌روز برگردانده می‌شوند.
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => ({}))) as { id?: string }
  const id = String(body.id || '').trim()
  if (!id) return fail('شناسهٔ روال الزامی است')

  const sop = await db.sop.findUnique({ where: { id } })
  if (!sop) return fail('روال یافت نشد', 404)

  const updated = await db.sop.update({
    where: { id },
    data: { completions: { increment: 1 } },
  })

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'sop_complete',
    actionLabel: 'اجرای کامل روال',
    category: 'sops',
    detail: `روال «${sop.title}» کامل اجرا شد`,
    entityId: id,
  })

  return ok({ id, views: updated.views, completions: updated.completions })
}
