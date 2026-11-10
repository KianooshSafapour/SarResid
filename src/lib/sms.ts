/**
 * SMS sending library — kavenegar driver (Agent API-2).
 *
 * Settings live in the Setting KV table:
 *   sms:enabled ('true'|'false'), sms:provider (kavenegar|ippanel|payamak-panel|custom),
 *   sms:apiKey, sms:sender, sms:recipients (comma-separated mobiles), sms:lowstockTemplate.
 * Values are stored as raw strings (seed format) but older rows may be JSON-encoded —
 * parseSetting handles both.
 */
import { db } from '@/lib/db'
import { toEnDigits } from '@/lib/jalali'

export const SMS_PROVIDER_WHITELIST = ['kavenegar', 'ippanel', 'payamak-panel', 'custom']

/** Default low-stock alert text ({name} / {stock} placeholders) */
export const DEFAULT_LOWSTOCK_TEMPLATE =
  'هایپر زیتون: کالای «{name}» به حد سفارش مجدد رسید (موجودی: {stock}). لطفاً سفارش ثبت شود.'

export interface SmsConfig {
  enabled: boolean
  provider: string
  apiKey: string
  sender: string
  recipients: string[] // normalized 09xxxxxxxxx list
  lowstockTemplate: string
}

/** Setting values may be JSON-encoded («"x"», «6», «false») or raw text — normalize to string. */
export function parseSetting(raw: string | null | undefined, fallback = ''): string {
  if (raw === null || raw === undefined) return fallback
  const s = String(raw).trim()
  if (!s) return fallback
  try {
    const parsed = JSON.parse(s)
    if (typeof parsed === 'string') return parsed
    if (typeof parsed === 'boolean' || typeof parsed === 'number') return String(parsed)
    return s
  } catch {
    return s // raw Persian text (seed format) — not valid JSON
  }
}

export function parseBoolSetting(raw: string | null | undefined): boolean {
  const v = parseSetting(raw, 'false').toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

/** Read the full SMS config from the Setting table. */
export async function getSmsConfig(): Promise<SmsConfig> {
  const rows = await db.setting.findMany({
    where: { key: { in: ['sms:enabled', 'sms:provider', 'sms:apiKey', 'sms:sender', 'sms:recipients', 'sms:lowstockTemplate'] } },
  })
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const recipientsRaw = parseSetting(map.get('sms:recipients'), '')
  return {
    enabled: parseBoolSetting(map.get('sms:enabled')),
    provider: parseSetting(map.get('sms:provider'), ''),
    apiKey: parseSetting(map.get('sms:apiKey'), ''),
    sender: parseSetting(map.get('sms:sender'), ''),
    recipients: recipientsRaw
      .split(/[,،؛\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    lowstockTemplate: parseSetting(map.get('sms:lowstockTemplate'), DEFAULT_LOWSTOCK_TEMPLATE) || DEFAULT_LOWSTOCK_TEMPLATE,
  }
}

/** Upsert one sms: setting key (raw string storage, matches the seed format). */
export async function setSmsSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
}

/**
 * Normalize an Iranian mobile number to 09xxxxxxxxx.
 * Accepts 09…, +98…, 0098…, 98…, 9… (10 digits) and Persian/Arabic digits.
 * Returns null when the number is invalid.
 */
export function normalizeMobile(input: string | null | undefined): string | null {
  let s = toEnDigits(String(input ?? '')).replace(/[\s\-()._]/g, '')
  if (s.startsWith('+98')) s = '0' + s.slice(3)
  else if (s.startsWith('0098')) s = '0' + s.slice(4)
  else if (s.length === 12 && s.startsWith('98')) s = '0' + s.slice(2)
  else if (s.length === 10 && s.startsWith('9')) s = '0' + s
  return /^09\d{9}$/.test(s) ? s : null
}

/** Mask an API key for display: «••••••1234» (last 4 chars visible). */
export function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 4) return '••••••'
  return `••••••${key.slice(-4)}`
}

export interface SmsResult {
  ok: boolean
  error?: string
  messageId?: string | null
  provider?: string
}

/**
 * Send an SMS through the configured panel.
 * - !enabled or missing provider/apiKey → {ok:false, error:'پنل پیامک تنظیم نشده'}
 *   (caller should mark the SmsOutbox row SKIPPED with this error note).
 * - kavenegar: GET https://api.kavenegar.com/v1/{apiKey}/sms/send.json?receptor=&message=
 *   with an 8s timeout; success = {return:{status:200}}.
 * - Other providers are not wired yet → explicit Persian error.
 */
export async function sendSms(opts: { to: string; text: string; config?: SmsConfig }): Promise<SmsResult> {
  const cfg = opts.config ?? (await getSmsConfig())
  if (!cfg.enabled) return { ok: false, error: 'پنل پیامک تنظیم نشده' }
  if (!cfg.provider || !cfg.apiKey) return { ok: false, error: 'پنل پیامک تنظیم نشده' }

  const to = normalizeMobile(opts.to)
  if (!to) return { ok: false, error: 'شماره موبایل گیرنده نامعتبر است' }
  const text = String(opts.text ?? '').trim()
  if (!text) return { ok: false, error: 'متن پیامک خالی است' }

  if (cfg.provider !== 'kavenegar') {
    return { ok: false, error: `ارسال از پنل «${cfg.provider}» فعلاً پشتیبانی نمی‌شود` }
  }

  try {
    const url =
      `https://api.kavenegar.com/v1/${encodeURIComponent(cfg.apiKey)}/sms/send.json` +
      `?receptor=${encodeURIComponent(to)}&message=${encodeURIComponent(text)}` +
      (cfg.sender ? `&sender=${encodeURIComponent(cfg.sender)}` : '')
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return { ok: false, error: `خطای پنل پیامک (کد ${toEnDigits(String(res.status))})` }
    const data = (await res.json().catch(() => null)) as
      | { return?: { status?: number; message?: string }; entries?: Array<{ messageid?: number | string }> }
      | null
    if (data?.return?.status === 200) {
      const mid = data.entries?.[0]?.messageid
      return { ok: true, provider: 'kavenegar', messageId: mid !== undefined ? String(mid) : null }
    }
    const msg = data?.return?.message
    return { ok: false, error: msg ? `پنل پیامک: ${msg}` : 'ارسال پیامک ناموفق بود' }
  } catch {
    return { ok: false, error: 'ارتباط با پنل پیامک برقرار نشد (مهلت پاسخ پایان یافت)' }
  }
}

/** Render the low-stock template with {name} / {stock} placeholders. */
export function renderLowstockText(template: string, product: { name: string; stock: number }): string {
  const t = template || DEFAULT_LOWSTOCK_TEMPLATE
  return t.replace(/\{name\}/g, product.name).replace(/\{stock\}/g, toEnDigits(String(product.stock)))
}

// ====================================================================
// R4-5 — Multi-provider SMS center (8 Iranian providers + custom panel)
// All exports above stay untouched (used by /api/defaults, /api/low-stock…).
// ====================================================================

/** Provider enum for SmsPanel.provider */
export const PANEL_PROVIDERS = [
  'farazsms', 'kavenegar', 'melipayamak', 'smsir', 'payamresan', 'webone', 'niksms',
  'payamito', 'farapayamak', 'custom',
] as const
export type PanelProvider = (typeof PANEL_PROVIDERS)[number]

/** Per-provider metadata: Persian title, credential field keys, help text. */
export const PROVIDER_META: Record<string, { title: string; fields: string[]; help: string }> = {
  melipayamak: {
    title: 'ملی‌پیامک',
    fields: ['username', 'password', 'from'],
    help: 'نام کاربری و رمز پنل ملی‌پیامک + شماره خط ارسال (from). REST: rest.payamak-panel.com/api/SendSMS/SendSMS',
  },
  farazsms: {
    title: 'فراز اس‌ام‌اس',
    fields: ['apiKey', 'from'],
    help: 'کلید API فراز (هدر Api-Key) + شماره خط ارسال (line_number). API رسمی: api.iranpayamak.com — مستندات: docs.farazsms.com',
  },
  kavenegar: {
    title: 'کاوه‌نگار',
    fields: ['apiKey', 'sender'],
    help: 'کلید API کاوه‌نگار (در مسیر URL می‌رود) + خط ارسال اختیاری (sender). api.kavenegar.com',
  },
  payamresan: {
    title: 'پیام‌رسان',
    fields: ['apiKey', 'sender'],
    help: 'کلید API پیام‌رسان (ApiKey در بدنه؛ قالب ۱۲۳۴۵۶-XXXX) + خط ارسال. api.sms-webservice.com/api/V3',
  },
  webone: {
    title: 'وب‌وان',
    fields: ['username', 'password', 'sender'],
    help: 'نام کاربری/رمز وب‌وان + خط ارسال. rest.payamakapi.ir/api/v1/SMS/Send',
  },
  niksms: {
    title: 'نیک‌پیامک',
    fields: ['username', 'password', 'from'],
    help: 'نام کاربری و رمز نیک‌پیامک + خط ارسال. niksms.com',
  },
  payamito: {
    title: 'پیامیتو',
    fields: ['username', 'password', 'from'],
    help: 'نام کاربری/رمز پنل پیامیتو + خط ارسال — روی پلتفرم payamak-panel (rest.payamak-panel.com)',
  },
  smsir: {
    title: 'پیامک رسا (SMS.ir)',
    fields: ['apiKey', 'lineNumber'],
    help: 'کلید API رسا (هدر X-API-KEY) + شماره خط خدماتی. api.sms.ir/v1/send/bulk — شماره‌ها بدون ۰ اول ارسال می‌شوند',
  },
  farapayamak: {
    title: 'فراپیامک',
    fields: ['username', 'password', 'sender'],
    help: 'نام کاربری/رمز فراپیامک + خط ارسال — روی پلتفرم payamak-panel (rest.payamak-panel.com)',
  },
  custom: {
    title: 'پنل سفارشی',
    fields: ['method', 'urlTemplate', 'headers', 'from', 'username', 'password'],
    help: 'آداپتور عمومی: متد GET/POST، الگوی نشانی با جای‌نگرد‌های {to} {from} {text} {username} {password} و هدرهای JSON',
  },
}

export interface SmsPanelLike {
  id: string
  name: string
  provider: string
  mode: string
  settingsJson: string
  active?: boolean
}

export interface SmsOutboxRow {
  id: string
  to: string
  toName: string
  text: string
  reason: string
  refId: string | null
  status: string
  provider: string
  messageId: string | null
  error: string | null
  createdAt: Date
  sentAt: Date | null
}

export interface PanelSendOutcome {
  ok: boolean
  error?: string
  row: SmsOutboxRow
}

function parseSettings(json: string): Record<string, string> {
  try {
    const v = JSON.parse(json || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

const PANEL_TIMEOUT_MS = 10_000

/** شماره بدون صفرِ اول (SMS.ir / پیام‌رسان) */
const noZero = (to: string) => to.replace(/^0/, '')

/** استخراج شناسهٔ پیام از پاسخ‌های مختلف */
function pickId(o: unknown, keys: string[]): string | null {
  if (!o || typeof o !== 'object') return null
  const rec = o as Record<string, unknown>
  for (const k of keys) {
    const v = rec[k]
    if (v != null && (typeof v === 'string' || typeof v === 'number')) return String(v)
  }
  return null
}

/** کد خطای پلتفرم payamak-panel → فارسی */
function payamakPanelError(valueCode: number): string {
  const map: Record<number, string> = {
    0: 'نام کاربری یا رمز پنل اشتباه است',
    2: 'اعتبار پنل کافی نیست',
    3: 'سقف ارسال روزانه پر شده',
    4: 'محدودیت حجم ارسال',
    5: 'خط ارسال‌کننده نامعتبر است',
    6: 'پنل در حال به‌روزرسانی است',
    7: 'متن پیامک دارای واژهٔ فیلترشده است',
  }
  return map[valueCode] || `پاسخ پنل ناموفق بود (کد ${toEnDigits(String(valueCode))})`
}

/**
 * یک فراخوانی خام ارائه‌دهنده — هرگز throw نمی‌کند.
 * قراردادها بر پایهٔ مستندات رسمی (اکتبر ۲۰۲۶):
 *  farazsms  → api.iranpayamak.com  (هدر Api-Key) — docs.farazsms.com
 *  kavenegar → api.kavenegar.com/v1/{key}/sms/send.json
 *  smsir     → api.sms.ir/v1/send/bulk (هدر X-API-KEY، موبایل بدون ۰)
 *  melipayamak/payamito/farapayamak → rest.payamak-panel.com (فرم؛ RetStatus=1/Ok)
 *  payamresan→ api.sms-webservice.com/api/V3/Send (ApiKey در بدنه؛ Success)
 *  niksms    → niksms.com/fa/publicapi/PtpSms (فرم؛ کد رهگیری)
 *  webone    → rest.payamakapi.ir/api/v1/SMS/Send (JSON؛ ۰ = موفق)
 */
async function callProvider(
  provider: string,
  s: Record<string, string>,
  to: string,
  text: string,
): Promise<SmsResult> {
  try {
    /* ── فراز اس‌ام‌اس (API رسمی iranpayamak) ── */
    if (provider === 'farazsms') {
      const res = await fetch('https://api.iranpayamak.com/ws/v1/sms/simple', {
        method: 'POST',
        headers: { 'Api-Key': s.apiKey ?? '', 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ text, line_number: s.from ?? s.line ?? '', recipients: [to], number_format: 'english' }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const data = (await res.json().catch(() => null)) as { status?: string; message?: string; data?: Record<string, unknown> } | null
      if (data?.status === 'success') {
        return { ok: true, provider, messageId: pickId(data.data, ['message_id', 'id', 'messageId', 'code']) }
      }
      const msg = data?.message || (res.status === 401 ? 'کلید API نامعتبر است' : `کد HTTP ${toEnDigits(String(res.status))}`)
      return { ok: false, provider, error: `فراز اس‌ام‌اس: ${msg}` }
    }

    /* ── کاوه‌نگار ── */
    if (provider === 'kavenegar') {
      const form = new URLSearchParams({ receptor: to, message: text })
      if (s.sender) form.set('sender', s.sender)
      const res = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(s.apiKey ?? '')}/sms/send.json`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const data = (await res.json().catch(() => null)) as { return?: { status?: number; message?: string }; entries?: Array<{ messageid?: number | string }> } | null
      if (data?.return?.status === 200) {
        const mid = data.entries?.[0]?.messageid
        return { ok: true, provider, messageId: mid != null ? String(mid) : null }
      }
      const st = data?.return?.status
      const fa: Record<number, string> = { 403: 'کلید API نامعتبر است', 411: 'شماره گیرنده نامعتبر است', 413: 'متن پیامک خالی یا بلند است', 418: 'اعتبار پنل کافی نیست' }
      return { ok: false, provider, error: `کاوه‌نگار: ${fa[st ?? 0] || data?.return?.message || `کد ${toEnDigits(String(st ?? res.status))}`}` }
    }

    /* ── SMS.ir (رسا) — موبایل بدون ۰ اول ── */
    if (provider === 'smsir') {
      const res = await fetch('https://api.sms.ir/v1/send/bulk', {
        method: 'POST',
        headers: { 'X-API-KEY': s.apiKey ?? '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineNumber: s.lineNumber ?? s.from ?? '', messageText: text, mobiles: [noZero(to)] }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const data = (await res.json().catch(() => null)) as { status?: number; message?: string; data?: { messageIds?: Array<number | string>; messageId?: number | string } } | null
      if (data?.status === 1) {
        const mid = data.data?.messageIds?.[0] ?? data.data?.messageId
        return { ok: true, provider, messageId: mid != null ? String(mid) : null }
      }
      const fa: Record<number, string> = { 10: 'کلید API نامعتبر است', 102: 'اعتبار پنل کافی نیست', 105: 'تعداد گیرندگان زیاد است' }
      return { ok: false, provider, error: `پیامک رسا: ${fa[data?.status ?? 0] || data?.message || `کد ${toEnDigits(String(data?.status ?? res.status))}`}` }
    }

    /* ── ملی‌پیامک / فراپیامک / پیامیتو — پلتفرم payamak-panel (فرم‌انکدد) ── */
    if (provider === 'melipayamak' || provider === 'farapayamak' || provider === 'payamito') {
      const from = s.from ?? s.sender ?? ''
      if (!s.username || !s.password || !from) {
        return { ok: false, provider, error: 'نام کاربری، رمز و شماره خط ارسال (from) پنل را کامل وارد کنید' }
      }
      const res = await fetch('https://rest.payamak-panel.com/api/SendSMS/SendSMS', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: s.username, password: s.password, to, from, text, isFlash: 'false' }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const data = (await res.json().catch(() => null)) as { Value?: string; RetStatus?: number; StrRetStatus?: string } | null
      if (data && data.RetStatus === 1 && data.StrRetStatus === 'Ok') {
        return { ok: true, provider, messageId: data.Value ?? null }
      }
      const vc = Number(data?.Value)
      if (Number.isFinite(vc) && vc !== 1 && data?.RetStatus !== 1) {
        return { ok: false, provider, error: payamakPanelError(vc) }
      }
      return { ok: false, provider, error: `پاسخ پنل ناموفق بود${data?.StrRetStatus ? ` (${data.StrRetStatus})` : ` (کد HTTP ${toEnDigits(String(res.status))})`}` }
    }

    /* ── پیام‌رسان — V3 (ApiKey در بدنه؛ همیشه HTTP 200) ── */
    if (provider === 'payamresan') {
      if (!s.apiKey) return { ok: false, provider, error: 'کلید API پیام‌رسان (ApiKey) را وارد کنید' }
      const res = await fetch('https://api.sms-webservice.com/api/V3/Send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ApiKey: s.apiKey, Text: text, Sender: s.sender ?? s.from ?? '', Recipients: [noZero(to)] }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const data = (await res.json().catch(() => null)) as { Success?: boolean; Error?: string; ErrorCode?: number; Result?: Array<{ Id?: number | string }> } | null
      if (data?.Success === true) {
        return { ok: true, provider, messageId: data.Result?.[0]?.Id != null ? String(data.Result[0].Id) : null }
      }
      return { ok: false, provider, error: `پیام‌رسان: ${data?.Error || `کد ${toEnDigits(String(data?.ErrorCode ?? res.status))}`}` }
    }

    /* ── نیک‌پیامک — publicapi/PtpSms (فرم؛ پاسخ = کد رهگیری) ── */
    if (provider === 'niksms') {
      if (!s.username || !s.password || !s.from) {
        return { ok: false, provider, error: 'نام کاربری، رمز و خط ارسال نیک‌پیامک را کامل وارد کنید' }
      }
      const res = await fetch('https://niksms.com/fa/publicapi/PtpSms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: s.username, password: s.password, senderNumber: s.from, numbers: to, message: text }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const raw = (await res.text().catch(() => '')).trim()
      const codes = raw.match(/\d+/g)
      if (codes && codes.some((c) => Number(c) > 0) && !/error|fail/i.test(raw)) {
        return { ok: true, provider, messageId: codes[0] }
      }
      return { ok: false, provider, error: `نیک‌پیامک: ${raw.slice(0, 80) || `کد HTTP ${toEnDigits(String(res.status))}`}` }
    }

    /* ── وب‌وان — rest.payamakapi.ir (JSON؛ پاسخ عددی، ۰ = موفق) ── */
    if (provider === 'webone') {
      if (!s.username || !s.password || !s.sender) {
        return { ok: false, provider, error: 'نام کاربری، رمز و خط ارسال وب‌وان را کامل وارد کنید' }
      }
      const res = await fetch('https://rest.payamakapi.ir/api/v1/SMS/Send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ UserName: s.username, Password: s.password, From: s.sender, To: to, Message: text }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const raw = (await res.text().catch(() => '')).trim()
      const code = Number(raw)
      if (code === 0) return { ok: true, provider, messageId: null }
      const fa: Record<number, string> = { 1: 'نام کاربری یا رمز اشتباه است', 8: 'اعتبار پنل کافی نیست', 17: 'خط ارسال OTP یافت نشد' }
      return { ok: false, provider, error: `وب‌وان: ${fa[code] || raw.slice(0, 60) || `کد HTTP ${toEnDigits(String(res.status))}`}` }
    }

    if (provider === 'custom') {
      const method = (s.method ?? 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST'
      const urlTemplate = (s.urlTemplate ?? '').trim()
      if (!urlTemplate) return { ok: false, provider, error: 'الگوی نشانی پنل سفارشی (urlTemplate) تنظیم نشده است' }
      const fill = (tpl: string, encode: boolean) =>
        tpl.replace(/\{(to|from|text|username|password)\}/g, (_m, k: string) => {
          const v = k === 'to' ? to : k === 'text' ? text : (s[k] ?? '')
          return encode ? encodeURIComponent(v) : v
        })
      const url = fill(urlTemplate, true)
      let headers: Record<string, string> = {}
      try {
        const h = JSON.parse(s.headers ?? '{}')
        if (h && typeof h === 'object') headers = Object.fromEntries(Object.entries(h).map(([k, v]) => [String(k), String(v)]))
      } catch {
        return { ok: false, provider, error: 'هدرهای پنل سفارشی JSON معتبر نیستند' }
      }
      const init: RequestInit = { method, headers, signal: AbortSignal.timeout(PANEL_TIMEOUT_MS) }
      if (method === 'POST') {
        const body = s.bodyTemplate ? fill(s.bodyTemplate, false) : JSON.stringify({ to, from: s.from ?? '', text })
        if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
          headers['Content-Type'] = s.bodyTemplate && !s.bodyTemplate.trim().startsWith('{') ? 'text/plain' : 'application/json'
        }
        init.headers = headers
        init.body = body
      }
      const res = await fetch(url, init)
      if (res.ok) return { ok: true, provider, messageId: null }
      return { ok: false, provider, error: `پاسخ پنل سفارشی ناموفق بود (کد ${toEnDigits(String(res.status))})` }
    }

    return { ok: false, provider, error: `سرویس‌دهندهٔ ناشناخته: ${provider}` }
  } catch {
    return { ok: false, provider, error: 'ارتباط با پنل پیامک برقرار نشد (مهلت پاسخ پایان یافت)' }
  }
}

/** بررسی اتصال/اعتبار پنل بدون ارسال پیامک — برای دکمهٔ «بررسی اتصال» */
export async function checkPanelCredit(provider: string, s: Record<string, string>): Promise<{ ok: boolean; credit?: string; error?: string }> {
  try {
    if (provider === 'farazsms') {
      const res = await fetch('https://api.iranpayamak.com/ws/v1/account/balance', { headers: { 'Api-Key': s.apiKey ?? '', Accept: 'application/json' }, signal: AbortSignal.timeout(PANEL_TIMEOUT_MS) })
      const data = (await res.json().catch(() => null)) as { status?: string; message?: string; data?: Record<string, unknown> } | null
      if (data?.status === 'success' && data.data) {
        const amount = String(data.data.balance_amount ?? data.data.balanceAmount ?? '?')
        const count = String(data.data.balance_count ?? data.data.balanceCount ?? '?')
        return { ok: true, credit: `مانده: ${toEnDigits(amount)} — تقریباً ${toEnDigits(Number(count).toFixed(0))} پیامک` }
      }
      return { ok: false, error: data?.message || `کد HTTP ${toEnDigits(String(res.status))}` }
    }
    if (provider === 'kavenegar') {
      const res = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(s.apiKey ?? '')}/account/info.json`, { signal: AbortSignal.timeout(PANEL_TIMEOUT_MS) })
      const data = (await res.json().catch(() => null)) as { return?: { status?: number; message?: string }; entries?: { credit?: number } } | null
      if (data?.return?.status === 200) return { ok: true, credit: `اعتبار: ${toEnDigits(String(data.entries?.credit ?? '?'))}` }
      return { ok: false, error: data?.return?.message || `کد ${toEnDigits(String(data?.return?.status ?? res.status))}` }
    }
    if (provider === 'smsir') {
      const res = await fetch('https://api.sms.ir/v1/credit', { headers: { 'X-API-KEY': s.apiKey ?? '' }, signal: AbortSignal.timeout(PANEL_TIMEOUT_MS) })
      const data = (await res.json().catch(() => null)) as { status?: number; message?: string; data?: number | string } | null
      if (data?.status === 1) return { ok: true, credit: `اعتبار: ${toEnDigits(String(data.data ?? '?'))}` }
      return { ok: false, error: data?.message || `کد ${toEnDigits(String(data?.status ?? res.status))}` }
    }
    if (provider === 'melipayamak' || provider === 'farapayamak' || provider === 'payamito') {
      const res = await fetch('https://rest.payamak-panel.com/api/SendSMS/GetCredit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: s.username ?? '', password: s.password ?? '' }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const raw = (await res.text().catch(() => '')).trim()
      const v = Number(raw)
      if (Number.isFinite(v) && v > 0) return { ok: true, credit: `اعتبار: ${toEnDigits(raw)}` }
      if (v === 0) return { ok: false, error: 'نام کاربری یا رمز پنل اشتباه است' }
      return { ok: false, error: raw.slice(0, 60) || 'پاسخ نامعتبر' }
    }
    if (provider === 'payamresan') {
      const res = await fetch('https://api.sms-webservice.com/api/V3/AccountInfo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ApiKey: s.apiKey ?? '' }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const data = (await res.json().catch(() => null)) as { Success?: boolean; Error?: string; Result?: { Credit?: number } } | null
      if (data?.Success === true) return { ok: true, credit: `اعتبار: ${toEnDigits(String(data.Result?.Credit ?? '?'))}` }
      return { ok: false, error: data?.Error || 'پاسخ نامعتبر' }
    }
    if (provider === 'niksms') {
      const res = await fetch('https://niksms.com/fa/publicapi/GetCredit', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: s.username ?? '', password: s.password ?? '' }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const raw = (await res.text().catch(() => '')).trim()
      const v = Number(raw)
      if (Number.isFinite(v) && v >= 0) return { ok: true, credit: `اعتبار: ${toEnDigits(raw)}` }
      return { ok: false, error: raw.slice(0, 60) || 'پاسخ نامعتبر' }
    }
    if (provider === 'webone') {
      const res = await fetch('https://rest.payamakapi.ir/api/v1/SMS/GetCredit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ UserName: s.username ?? '', Password: s.password ?? '' }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const raw = (await res.text().catch(() => '')).trim()
      const v = Number(raw)
      if (v === 1) return { ok: false, error: 'نام کاربری یا رمز اشتباه است' }
      if (v === 2) return { ok: false, error: 'حساب فعال نیست' }
      if (Number.isFinite(v)) return { ok: true, credit: `اعتبار: ${toEnDigits(raw)}` }
      return { ok: false, error: raw.slice(0, 60) || 'پاسخ نامعتبر' }
    }
    return { ok: false, error: 'بررسی اتصال برای این سرویس‌دهنده تعریف نشده — با «ارسال آزمایشی» امتحان کنید' }
  } catch {
    return { ok: false, error: 'ارتباط برقرار نشد (مهلت پاسخ پایان یافت)' }
  }
}

/**
 * Send through a specific panel — ALWAYS writes a SmsOutbox row:
 * mock → SENT/«MOCK», real → provider result (SENT or FAILED with error).
 * Returns {ok, row, error?}; NEVER throws to the caller.
 */
export async function sendViaPanelDetailed(
  panel: SmsPanelLike,
  to: string,
  text: string,
  meta?: { reason?: string; refId?: string | null; toName?: string },
): Promise<PanelSendOutcome> {
  const reason = meta?.reason ?? 'MANUAL'
  const write = async (status: string, extra: Partial<SmsOutboxRow>) => {
    const row = await db.smsOutbox.create({
      data: {
        to: String(to ?? ''),
        toName: meta?.toName ?? '',
        text: String(text ?? ''),
        reason,
        refId: meta?.refId ?? null,
        status,
        provider: panel.provider,
        messageId: extra.messageId ?? null,
        error: extra.error ?? null,
        sentAt: status === 'SENT' || status === 'FAILED' ? new Date() : null,
      },
    })
    return row as SmsOutboxRow
  }

  const normalized = normalizeMobile(to)
  if (!normalized) {
    return { ok: false, error: 'شماره موبایل گیرنده نامعتبر است', row: await write('FAILED', { error: 'شماره موبایل گیرنده نامعتبر است' }) }
  }
  const body = String(text ?? '').trim()
  if (!body) {
    return { ok: false, error: 'متن پیامک خالی است', row: await write('FAILED', { error: 'متن پیامک خالی است' }) }
  }

  if (panel.mode !== 'real') {
    // شبیه‌سازی — ارسال آزمایشی بدون اعتبارنامه واقعی
    return { ok: true, row: await write('SENT', { messageId: 'MOCK' }) }
  }

  const settings = parseSettings(panel.settingsJson)
  const result = await callProvider(panel.provider, settings, normalized, body)
  if (result.ok) {
    return { ok: true, row: await write('SENT', { messageId: result.messageId ?? null }) }
  }
  return { ok: false, error: result.error, row: await write('FAILED', { error: result.error ?? 'ارسال پیامک ناموفق بود' }) }
}

/** Convenience wrapper — returns the outbox row on SENT, null on FAILED (row still written). */
export async function sendViaPanel(
  panel: SmsPanelLike,
  to: string,
  text: string,
  meta?: { reason?: string; refId?: string | null; toName?: string },
): Promise<SmsOutboxRow | null> {
  const outcome = await sendViaPanelDetailed(panel, to, text, meta)
  return outcome.ok ? outcome.row : null
}

/** Resolve the active default panel (mode mock or real) — null when none is configured. */
export async function getDefaultPanel(): Promise<SmsPanelLike | null> {
  const panel = await db.smsPanel.findFirst({
    where: { active: true, isDefault: true },
    orderBy: [{ createdAt: 'asc' }],
  })
  return panel ?? null
}

/** Send through the default panel; no default → SKIPPED outbox row + null. */
export async function sendViaDefaultPanel(
  to: string,
  text: string,
  meta?: { reason?: string; refId?: string | null; toName?: string },
): Promise<SmsOutboxRow | null> {
  const panel = await getDefaultPanel()
  if (!panel) {
    await db.smsOutbox.create({
      data: {
        to: String(to ?? ''),
        toName: meta?.toName ?? '',
        text: String(text ?? ''),
        reason: meta?.reason ?? 'MANUAL',
        refId: meta?.refId ?? null,
        status: 'SKIPPED',
        provider: '',
        error: 'پنل پیامک پیش‌فرض فعالی تنظیم نشده است',
      },
    })
    return null
  }
  return sendViaPanel(panel, to, text, meta)
}

/** Queue an SMS for a scenario hook (PAYMENT_SUBMITTED / RETURN_PAYMENT / …). */
export async function queueSms(
  reason: string,
  to: string,
  text: string,
  refId?: string | null,
  toName?: string,
): Promise<SmsOutboxRow | null> {
  return sendViaDefaultPanel(to, text, { reason, refId: refId ?? null, toName })
}

/** Render a template body with {key} placeholders (missing keys keep their placeholder). */
export function renderTemplate(body: string, vars: Record<string, string | number>): string {
  return String(body ?? '').replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

export interface BroadcastTarget {
  to: string
  name: string
}

/** Resolve a broadcast audience to normalized, deduped mobile numbers. */
export async function resolveBroadcastAudience(audience: string): Promise<BroadcastTarget[]> {
  const kind = String(audience ?? '').trim()
  const map = new Map<string, BroadcastTarget>()
  const add = (phone: string | null | undefined, name: string) => {
    const n = normalizeMobile(phone)
    if (n && !map.has(n)) map.set(n, { to: n, name })
  }
  if (kind === 'ALL') {
    const users = await db.user.findMany({ where: { active: true }, select: { fullName: true, phone: true } })
    for (const u of users) add(u.phone, u.fullName)
    const personnel = await db.personnel.findMany({ where: { active: true }, select: { fullName: true, phone: true } })
    for (const p of personnel) add(p.phone, p.fullName)
    return [...map.values()]
  }
  if (kind.startsWith('ROLE:')) {
    const role = kind.slice('ROLE:'.length).trim().toUpperCase()
    if (!role) return []
    const users = await db.user.findMany({ where: { active: true, role }, select: { fullName: true, phone: true } })
    for (const u of users) add(u.phone, u.fullName)
    return [...map.values()]
  }
  // 'SECTION:…' and anything else → not supported
  return []
}

/**
 * Broadcast one text to an audience ('ALL' | 'ROLE:xxx' — 'SECTION' unsupported → []).
 * Returns the outbox rows created (SENT / FAILED / SKIPPED per recipient).
 */
export async function broadcastSms(
  reason: string,
  text: string,
  audience: string,
  refId?: string | null,
): Promise<SmsOutboxRow[]> {
  const targets = await resolveBroadcastAudience(audience)
  if (!targets.length) return []
  const panel = await getDefaultPanel()
  const rows: SmsOutboxRow[] = []
  for (const t of targets) {
    if (!panel) {
      const row = await db.smsOutbox.create({
        data: {
          to: t.to,
          toName: t.name,
          text,
          reason,
          refId: refId ?? null,
          status: 'SKIPPED',
          provider: '',
          error: 'پنل پیامک پیش‌فرض فعالی تنظیم نشده است',
        },
      })
      rows.push(row as SmsOutboxRow)
      continue
    }
    const outcome = await sendViaPanelDetailed(panel, t.to, text, { reason, refId: refId ?? null, toName: t.name })
    rows.push(outcome.row)
  }
  return rows
}

