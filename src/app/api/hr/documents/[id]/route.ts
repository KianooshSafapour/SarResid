import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** GET /api/hr/documents/[id] → مدرک کامل (dataUrl برای پیش‌نمایش)
 *  مدیران: هر مدرکی — سایر کاربران: فقط مدارک خودشان */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const { id } = await ctx.params
  const doc = await db.staffDocument.findUnique({ where: { id } })
  if (!doc) return fail('مدرک یافت نشد', 404)

  if (!isManager(user) && doc.userId !== user.id) return fail('اجازهٔ دسترسی به این مدرک را ندارید', 403)

  return ok({
    id: doc.id,
    userId: doc.userId,
    kind: doc.kind,
    title: doc.title,
    mimeType: doc.mimeType,
    size: doc.size,
    note: doc.note,
    uploadedBy: doc.uploadedBy,
    createdAt: doc.createdAt,
    dataUrl: doc.dataUrl,
  })
}

/** DELETE /api/hr/documents/[id] — فقط مدیران */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('فقط مدیران می‌توانند مدرک را حذف کنند', 403)

  const { id } = await ctx.params
  const doc = await db.staffDocument.findUnique({ where: { id } })
  if (!doc) return fail('مدرک یافت نشد', 404)

  await db.staffDocument.delete({ where: { id } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'staffdoc.delete',
    actionLabel: 'مدارک پرسنل',
    category: 'personnel',
    detail: `${doc.kind}${doc.title ? ` — ${doc.title}` : ''} از پروندهٔ ${doc.userId}`,
    entityId: id,
  })
  return ok({ deleted: true })
}
