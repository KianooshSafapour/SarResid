import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/me/password {current, next} — تغییر رمز عبور
 * تأیید رمز فعلی: رمز عبور یا رمز چهاررقمی (کاربران بدون رمز چهاررقمی و مدیران ارشد
 * OWNER/ADMIN فقط با رمز عبور). رمز جدید حداقل ۶ نویسه.
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => ({}))) as { current?: string; next?: string }
  const current = String(body.current ?? '')
  const next = String(body.next ?? '')

  if (!current) return fail('رمز فعلی را وارد کنید')
  if (next.length < 6) return fail('رمز جدید باید حداقل ۶ نویسه باشد')

  const user = await db.user.findUnique({ where: { id: me.id } })
  if (!user) return fail('کاربر یافت نشد', 404)

  // ADMIN/OWNER must authenticate with the password itself
  const mustUsePassword = user.role === 'ADMIN' || user.role === 'OWNER'
  let verified = false
  if (user.password && user.password === current) {
    verified = true
  } else if (!mustUsePassword && user.pin && user.pin === current) {
    verified = true
  }
  if (!verified) {
    return fail(mustUsePassword ? 'رمز عبور فعلی نادرست است' : 'رمز عبور یا رمز چهاررقمی فعلی نادرست است')
  }

  await db.user.update({ where: { id: me.id }, data: { password: next } })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'me.password',
    actionLabel: 'تغییر رمز عبور',
    category: 'auth',
    detail: 'تغییر رمز عبور حساب',
  })

  return ok({ changed: true })
}
