import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { getEmailConfig, EMAIL_SETTING_KEYS } from '@/lib/email'

export const dynamic = 'force-dynamic'

function managersOnly(role: string) {
  return ['OWNER', 'GM', 'ADMIN', 'ACC'].includes(role)
}

/** GET /api/email/config — پیکربندی ایمیل (رمزها ماسک) + رکوردهای DNS پیشنهادی */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!managersOnly(user.role)) return fail('دسترسی ندارید', 403)
  const c = await getEmailConfig()
  const mask = (v: string) => (v ? `••••••${v.slice(-4)}` : '')
  return ok({
    config: {
      smtpHost: c.smtpHost, smtpPort: c.smtpPort, smtpUser: c.smtpUser, smtpPass: mask(c.smtpPass),
      fromName: c.fromName, imapHost: c.imapHost, imapPort: c.imapPort, imapUser: c.imapUser, imapPass: mask(c.imapPass),
      configured: !!(c.smtpHost && c.smtpUser && c.smtpPass),
    },
    dnsHint: {
      mx: 'hyperzeytoon.com. MX 10 mail.hyperzeytoon.com.',
      spf: 'hyperzeytoon.com. TXT "v=spf1 mx a ip4:{IP-سرور} ~all"',
      note: 'اگر صندوق را نزد سرویس‌دهنده (پارس‌پک/…) ساخته‌اید، رکوردهای MX/SPF همان سرویس را تنظیم کنید — این فقط راهنما است.',
    },
  })
}

/** PUT /api/email/config — ذخیرهٔ پیکربندی (فیلد خالی = دست‌نخورده برای رمزها) */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN'].includes(user.role)) return fail('فقط مدیران', 403)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const map: Record<string, string> = {
    smtpHost: 'email:smtpHost', smtpPort: 'email:smtpPort', smtpUser: 'email:smtpUser', smtpPass: 'email:smtpPass',
    fromName: 'email:fromName', imapHost: 'email:imapHost', imapPort: 'email:imapPort', imapUser: 'email:imapUser', imapPass: 'email:imapPass',
  }
  for (const [field, key] of Object.entries(map)) {
    const v = body[field]
    if (v === undefined || v === null) continue
    const s = String(v).trim()
    if (!s) continue // رمز خالی = بدون تغییر
    await db.setting.upsert({ where: { key }, create: { key, value: s }, update: { value: s } })
  }
  return ok({ saved: true, keys: EMAIL_SETTING_KEYS.length })
}
