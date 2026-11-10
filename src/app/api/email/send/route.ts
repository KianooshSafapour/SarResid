import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { logActivity } from '@/lib/api'

export const dynamic = 'force-dynamic'

/** POST /api/email/send {to, subject, body} — ارسال + ثبت در Outbox */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN', 'ACC'].includes(user.role)) return fail('دسترسی ندارید', 403)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const to = String(body.to ?? '').trim()
  const subject = String(body.subject ?? '').trim()
  const text = String(body.body ?? '').trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return fail('نشانی گیرنده معتبر نیست')
  if (!subject || !text) return fail('موضوع و متن ایمیل را کامل کنید')

  const res = await sendEmail({ to, subject, body: text, user: { id: user.id, fullName: user.fullName } })
  await logActivity({
    userId: user.id, userName: user.fullName,
    action: 'email.send', actionLabel: 'ایمیل', category: 'system',
    detail: `به ${to} — ${res.ok ? 'ارسال شد' : `ناموفق: ${res.error}`}`,
  }).catch(() => null)
  if (!res.ok) return fail(res.error || 'ارسال ایمیل ناموفق بود')
  return ok({ sent: true, messageId: res.messageId ?? null })
}
