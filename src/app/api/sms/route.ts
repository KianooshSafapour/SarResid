import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import {
  getSmsConfig,
  setSmsSetting,
  normalizeMobile,
  maskKey,
  SMS_PROVIDER_WHITELIST,
  DEFAULT_LOWSTOCK_TEMPLATE,
  type SmsConfig,
} from '@/lib/sms'

export const dynamic = 'force-dynamic'

function configOut(cfg: SmsConfig) {
  return {
    enabled: cfg.enabled,
    provider: cfg.provider,
    apiKey: maskKey(cfg.apiKey), // masked — never leak the raw key
    apiKeyMasked: maskKey(cfg.apiKey),
    hasApiKey: !!cfg.apiKey,
    sender: cfg.sender,
    recipients: cfg.recipients,
    recipientsRaw: cfg.recipients.join('، '),
    lowstockTemplate: cfg.lowstockTemplate || DEFAULT_LOWSTOCK_TEMPLATE,
  }
}

async function payload() {
  const [cfg, outbox] = await Promise.all([
    getSmsConfig(),
    db.smsOutbox.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
  ])
  return { config: configOut(cfg), outbox }
}

/** GET /api/sms → {config (masked apiKey), outbox: last 50} — managers */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('دسترسی به تنظیمات پیامک ندارید', 403)
  return ok(await payload())
}

/** PATCH /api/sms {enabled?, provider?, apiKey?, sender?, recipients?, lowstockTemplate?} — managers */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('فقط مدیران می‌توانند تنظیمات پیامک را تغییر دهند', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')
  const b = body as Record<string, unknown>

  const changed: string[] = []

  if (b.enabled !== undefined) {
    const enabled = b.enabled === true || b.enabled === 'true' || b.enabled === '1'
    await setSmsSetting('sms:enabled', enabled ? 'true' : 'false')
    changed.push('فعال‌سازی')
  }

  if (b.provider !== undefined) {
    const provider = String(b.provider ?? '').trim().toLowerCase()
    if (provider && !SMS_PROVIDER_WHITELIST.includes(provider)) {
      return fail('سرویس‌دهنده پیامک نامعتبر است (کاوه‌نگار / آی‌پی‌پنل / پیامک‌پنل / سفارشی)')
    }
    await setSmsSetting('sms:provider', provider)
    changed.push('سرویس‌دهنده')
  }

  if (b.apiKey !== undefined) {
    const apiKey = String(b.apiKey ?? '').trim()
    await setSmsSetting('sms:apiKey', apiKey)
    changed.push('کلید API')
  }

  if (b.sender !== undefined) {
    const senderRaw = String(b.sender ?? '').trim()
    if (senderRaw && !normalizeMobile(senderRaw)) {
      return fail('شماره ارسال‌کننده نامعتبر است')
    }
    await setSmsSetting('sms:sender', senderRaw)
    changed.push('شماره ارسال‌کننده')
  }

  if (b.recipients !== undefined) {
    const rawList = Array.isArray(b.recipients) ? b.recipients.map((r) => String(r)) : String(b.recipients ?? '').split(/[,،؛\n;]+/)
    const cleaned: string[] = []
    const invalid: string[] = []
    for (const raw of rawList) {
      const s = raw.trim()
      if (!s) continue
      const n = normalizeMobile(s)
      if (n) cleaned.push(n)
      else invalid.push(s)
    }
    if (invalid.length) {
      return fail(`شماره‌های زیر نامعتبرند: ${invalid.join('، ')} — شماره باید با ۰۹ شروع شده و ۱۱ رقم باشد`)
    }
    await setSmsSetting('sms:recipients', cleaned.join(','))
    changed.push('گیرندگان هشدار')
  }

  if (b.lowstockTemplate !== undefined) {
    const template = String(b.lowstockTemplate ?? '').trim() || DEFAULT_LOWSTOCK_TEMPLATE
    await setSmsSetting('sms:lowstockTemplate', template)
    changed.push('قالب پیامک موجودی')
  }

  if (changed.length === 0) return fail('تغییری برای ذخیره وجود ندارد')

  // the raw key never appears in logs either
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'sms.config',
    actionLabel: 'تنظیمات پیامک',
    category: 'settings',
    detail: `به‌روزرسانی: ${changed.join('، ')}`,
  })

  return ok(await payload())
}
