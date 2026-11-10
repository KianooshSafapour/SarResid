import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { readInbox } from '@/lib/email'

export const dynamic = 'force-dynamic'

function managersOnly(role: string) {
  return ['OWNER', 'GM', 'ADMIN', 'ACC'].includes(role)
}

/** GET /api/email/inbox — ۳۰ ایمیل آخر صندوق ورودی (IMAP) */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!managersOnly(user.role)) return fail('دسترسی ندارید', 403)
  const res = await readInbox(30)
  if (!res.ok) return fail(res.error || 'صندوق خوانده نشد')
  return ok({ mails: res.mails })
}
