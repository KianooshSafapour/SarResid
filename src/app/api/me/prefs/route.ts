import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Setting key: prefs:<userId> — JSON object (dashboard uses {dash:{widgets,density}}) */
function prefsKey(userId: string) {
  return `prefs:${userId}`
}

/** GET /api/me/prefs → { prefs } (arbitrary JSON object) */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const row = await db.setting.findUnique({ where: { key: prefsKey(me.id) } })
  const prefs = safeJson<Record<string, unknown>>(row?.value, {})
  return ok({ prefs: prefs && typeof prefs === 'object' ? prefs : {} })
}

/** POST /api/me/prefs { prefs } → merge + store (whole object replace when prefs is complete) */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => null)) as { prefs?: unknown } | null
  if (!body || typeof body.prefs !== 'object' || body.prefs === null || Array.isArray(body.prefs)) {
    return fail('ترجیحات باید به‌صورت شیء JSON ارسال شود')
  }

  const incoming = body.prefs as Record<string, unknown>
  const row = await db.setting.findUnique({ where: { key: prefsKey(me.id) } })
  const current = safeJson<Record<string, unknown>>(row?.value, {})
  const merged = { ...(current && typeof current === 'object' ? current : {}), ...incoming }

  await db.setting.upsert({
    where: { key: prefsKey(me.id) },
    create: { key: prefsKey(me.id), value: JSON.stringify(merged) },
    update: { value: JSON.stringify(merged) },
  })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'me.prefs',
    actionLabel: 'ترجیحات کاربری',
    category: 'auth',
    detail: `ذخیره ترجیحات (${Object.keys(incoming).join('، ') || '—'})`,
  })

  return ok({ prefs: merged })
}
