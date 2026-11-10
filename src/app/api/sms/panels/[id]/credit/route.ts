import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'
import { checkPanelCredit } from '@/lib/sms'

export const dynamic = 'force-dynamic'

/** POST /api/sms/panels/[id]/credit — بررسی اتصال و اعتبار پنل بدون ارسال پیامک */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'system/smscenter')
  if (!gate.ok) return fail(gate.deny, 403)

  const { id } = await ctx.params
  const panel = await db.smsPanel.findUnique({ where: { id } })
  if (!panel) return fail('پنل یافت نشد', 404)
  if (panel.mode !== 'real') return ok({ ok: true, credit: 'حالت شبیه‌سازی — بدون اتصال واقعی', mock: true })

  let settings: Record<string, string> = {}
  try {
    const v = JSON.parse(panel.settingsJson || '{}')
    settings = v && typeof v === 'object' ? v : {}
  } catch {
    return fail('تنظیمات پنل JSON معتبر نیست')
  }
  const res = await checkPanelCredit(panel.provider, settings)
  return ok(res)
}
