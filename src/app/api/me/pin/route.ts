import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { toEnDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/**
 * POST /api/me/pin {current, next} — تغییر رمز چهاررقمی
 * رمز جدید دقیقاً ۴ رقم؛ تأیید با رمز چهاررقمی یا رمز عبور فعلی.
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => ({}))) as { current?: string; next?: string }
  const current = String(body.current ?? '')
  const next = toEnDigits(String(body.next ?? ''))

  if (!current) return fail('رمز فعلی را وارد کنید')
  if (!/^\d{4}$/.test(next)) return fail('رمز چهاررقمی جدید باید دقیقاً ۴ رقم باشد')

  const user = await db.user.findUnique({ where: { id: me.id } })
  if (!user) return fail('کاربر یافت نشد', 404)

  let verified = false
  if (user.pin && user.pin === toEnDigits(current)) verified = true
  else if (user.password && user.password === current) verified = true
  if (!verified) {
    return fail('رمز چهاررقمی یا رمز عبور فعلی نادرست است')
  }

  await db.user.update({ where: { id: me.id }, data: { pin: next } })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'me.pin',
    actionLabel: 'تغییر رمز چهاررقمی',
    category: 'auth',
    detail: 'تغییر رمز چهاررقمی حساب',
  })

  return ok({ changed: true })
}
