import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** DELETE /api/admin/snapshot/[id] — remove a snapshot (the DB data itself is untouched) */
export async function DELETE(_req: Request, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!isManager(me)) return fail('فقط مدیران می‌توانند نسخه پشتیبان را حذف کنند', 403)

  const { id } = await ctx.params
  const row = await db.dataSnapshot.findUnique({ where: { id } })
  if (!row) return fail('نسخه پشتیبان یافت نشد', 404)

  await db.dataSnapshot.delete({ where: { id } })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'snapshot.delete',
    actionLabel: 'پشتیبان داده',
    category: 'settings',
    detail: `${row.name} — ${toFaDigits(String(row.rowCount))} ردیف`,
    entityId: id,
  })

  return ok({ id })
}
