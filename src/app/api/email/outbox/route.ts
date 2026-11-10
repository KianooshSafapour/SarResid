import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** GET /api/email/outbox — تاریخچهٔ ایمیل‌های ارسالی پلتفرم */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN', 'ACC'].includes(user.role)) return fail('دسترسی ندارید', 403)
  const rows = await db.emailOutbox.findMany({ orderBy: { createdAt: 'desc' }, take: 60 })
  return ok({ outbox: rows })
}
