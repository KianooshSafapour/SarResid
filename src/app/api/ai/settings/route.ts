import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { getAiConfig, setAiSettings, aiChatRaw, AI_DEFAULT_BASE_URL, AI_DEFAULT_MODEL } from '@/lib/ai'

export const dynamic = 'force-dynamic'

const AI_ROLES = ['OWNER', 'ADMIN']

/**
 * GET /api/ai/settings — وضعیت پیکربندی دستیار (کلید ماسک می‌شود)
 * PUT /api/ai/settings {apiKey?, baseUrl?, model?} — ذخیره (مالک/ادمین)
 * POST /api/ai/settings — تست اتصال با یک پیام کوچک
 */

export async function GET() {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!AI_ROLES.includes(me.role)) return fail('دسترسی ندارید', 403)
  const cfg = await getAiConfig()
  return ok({
    configured: cfg.configured,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    apiKeyMasked: cfg.apiKey ? `${cfg.apiKey.slice(0, 6)}…${cfg.apiKey.slice(-4)}` : null,
    defaults: { baseUrl: AI_DEFAULT_BASE_URL, model: AI_DEFAULT_MODEL },
  })
}

export async function PUT(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!AI_ROLES.includes(me.role)) return fail('فقط مالک/ادمین می‌تواند تنظیم کند', 403)
  const body = (await req.json().catch(() => null)) as { apiKey?: unknown; baseUrl?: unknown; model?: unknown } | null
  if (!body) return fail('درخواست نامعتبر است')
  const patch: { apiKey?: string; baseUrl?: string; model?: string } = {}
  if (body.apiKey !== undefined) {
    const key = String(body.apiKey ?? '').trim()
    if (key && key.length < 12) return fail('کلید API خیلی کوتاه است')
    patch.apiKey = key
  }
  if (body.baseUrl !== undefined) {
    const u = String(body.baseUrl ?? '').trim()
    if (u && !/^https?:\/\//.test(u)) return fail('آدرس سرویس باید با http/https شروع شود')
    patch.baseUrl = u || AI_DEFAULT_BASE_URL
  }
  if (body.model !== undefined) patch.model = String(body.model ?? '').trim() || AI_DEFAULT_MODEL
  if (!Object.keys(patch).length) return fail('چیزی برای ذخیره ارسال نشد')
  await setAiSettings(patch)
  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'ai.settings',
    actionLabel: 'تنظیم دستیار هوشمند',
    category: 'system',
    detail: Object.keys(patch).join('، '),
  }).catch(() => {})
  const cfg = await getAiConfig()
  return ok({ configured: cfg.configured, baseUrl: cfg.baseUrl, model: cfg.model })
}

export async function POST() {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!AI_ROLES.includes(me.role)) return fail('دسترسی ندارید', 403)
  const cfg = await getAiConfig()
  if (!cfg.configured) return fail('اول کلید API را ذخیره کنید', 400)
  try {
    const t0 = Date.now()
    const { message } = await aiChatRaw(cfg, [
      { role: 'system', content: 'فقط با یک کلمه جواب بده.' },
      { role: 'user', content: 'سلام' },
    ], undefined, { maxTokens: 16 })
    return ok({ ok: true, reply: String(message.content ?? '').slice(0, 60), model: cfg.model, tookMs: Date.now() - t0 })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'اتصال برقرار نشد', 502)
  }
}
