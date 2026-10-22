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
  'melipayamak', 'farazsms', 'payamresan', 'webone', 'niksms',
  'payamito', 'smsir', 'farapayamak', 'custom',
] as const
export type PanelProvider = (typeof PANEL_PROVIDERS)[number]

/** Per-provider metadata: Persian title, credential field keys, help text. */
export const PROVIDER_META: Record<string, { title: string; fields: string[]; help: string }> = {
  melipayamak: {
    title: 'ملی‌پیامک',
    fields: ['username', 'password', 'from'],
    help: 'نام کاربری و رمز پنل ملی‌پیامک + شماره خط ارسال‌کننده (from). REST: rest.payamak-panel.com',
  },
  farazsms: {
    title: 'فراز اس‌ام‌اس (IPPanel)',
    fields: ['apiKey', 'from'],
    help: 'کلید API پنل IPPanel/فراز + شماره خط ارسال‌کننده. api2.ippanel.com',
  },
  payamresan: {
    title: 'پیام‌رسان',
    fields: ['username', 'password', 'from'],
    help: 'نام کاربری و رمز پیام‌رسان + خط ارسال. sms.payam-resan.com',
  },
  webone: {
    title: 'وب‌وان',
    fields: ['baseUrl', 'username', 'password', 'sender'],
    help: 'پنل وب‌وان — نشانی پایهٔ پنل (baseUrl) + نام کاربری/رمز + خط ارسال (sender)',
  },
  niksms: {
    title: 'نیک‌پیامک',
    fields: ['username', 'password', 'from'],
    help: 'نام کاربری و رمز نیک‌پیامک + خط ارسال. niksms.com',
  },
  payamito: {
    title: 'پیامیتو',
    fields: ['apiKey', 'from'],
    help: 'کلید API پیامیتو + شماره خط. api.payamito.com',
  },
  smsir: {
    title: 'پیامک رسا (SMS.ir)',
    fields: ['apiKey', 'lineNumber'],
    help: 'کلید API رسا + شماره خط خدماتی (lineNumber). api.sms.ir',
  },
  farapayamak: {
    title: 'فراپیامک',
    fields: ['baseUrl', 'username', 'password', 'sender'],
    help: 'نام کاربری/رمز فراپیامک + خط ارسال (sender)؛ نشانی پایه اختیاری است (پیش‌فرض farapayamak.ir)',
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

/** One raw provider call — never throws; returns {ok, messageId?, error?}. */
async function callProvider(
  provider: string,
  s: Record<string, string>,
  to: string,
  text: string,
): Promise<SmsResult> {
  try {
    if (provider === 'melipayamak') {
      const res = await fetch('https://rest.payamak-panel.com/api/SendSMS/SendSMS', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: s.username, password: s.password, from: s.from, to, text }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const data = (await res.json().catch(() => null)) as { Value?: unknown; RecId?: string | number | null; Status?: number } | null
      if (data && data.RecId != null) return { ok: true, provider, messageId: String(data.RecId) }
      return { ok: false, provider, error: `پاسخ پنل ملی‌پیامک ناموفق بود${data?.Status !== undefined ? ` (کد ${toEnDigits(String(data.Status))})` : ''}` }
    }

    if (provider === 'farazsms') {
      const res = await fetch('https://api2.ippanel.com/api/v1/sms/send/single', {
        method: 'POST',
        headers: { apikey: s.apiKey ?? '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: s.from, to, text }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const data = (await res.json().catch(() => null)) as { data?: { status?: string; message_id?: string | number }; error?: unknown } | null
      if (data?.data && (data.data.status === 'OK' || data.data.status === 'ok' || data.data.status === 'success')) {
        return { ok: true, provider, messageId: data.data.message_id != null ? String(data.data.message_id) : null }
      }
      return { ok: false, provider, error: `پاسخ پنل فراز اس‌ام‌اس ناموفق بود${data?.error ? `: ${String(data.error)}` : ''}` }
    }

    if (provider === 'payamresan') {
      const res = await fetch('https://sms.payam-resan.com/API/SendSMS.aspx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: s.username ?? '', password: s.password ?? '', from: s.from ?? '', to, text }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const raw = await res.text().catch(() => '')
      let statusNum = NaN
      let mid: string | null = null
      try {
        const j = JSON.parse(raw)
        statusNum = Number(j?.Status ?? j?.status ?? NaN)
        mid = j?.Id != null ? String(j.Id) : j?.MessageID != null ? String(j.MessageID) : null
      } catch {
        statusNum = Number(raw)
      }
      if (statusNum === 1) return { ok: true, provider, messageId: mid }
      return { ok: false, provider, error: `پاسخ پنل پیام‌رسان ناموفق بود${Number.isFinite(statusNum) ? ` (وضعیت ${toEnDigits(String(statusNum))})` : ''}` }
    }

    if (provider === 'webone') {
      const baseUrl = (s.baseUrl ?? '').trim().replace(/\/+$/, '')
      if (!baseUrl) return { ok: false, provider, error: 'نشانی پنل وب‌وان (baseUrl) تنظیم نشده است' }
      const res = await fetch(`${baseUrl}/api/v1/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: s.username, password: s.password, from: s.sender ?? s.from, to, text }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const data = (await res.json().catch(() => null)) as { ok?: boolean | string; success?: boolean; id?: string | number; messageId?: string | number } | null
      if (res.ok && (data?.ok === true || data?.ok === 'true' || data?.success === true)) {
        return { ok: true, provider, messageId: data?.id != null ? String(data.id) : data?.messageId != null ? String(data.messageId) : null }
      }
      return { ok: false, provider, error: `پاسخ پنل وب‌وان ناموفق بود (کد ${toEnDigits(String(res.status))})` }
    }

    if (provider === 'niksms') {
      const res = await fetch('https://niksms.com/API/SendSMS.ashx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: s.username, password: s.password, from: s.from, to, text }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const data = (await res.json().catch(() => null)) as { Status?: number; status?: number; Code?: number; code?: number; MsgID?: string | number } | null
      const code = Number(data?.Status ?? data?.status ?? data?.Code ?? data?.code ?? NaN)
      if (code === 1) return { ok: true, provider, messageId: data?.MsgID != null ? String(data.MsgID) : null }
      return { ok: false, provider, error: `پاسخ پنل نیک‌پیامک ناموفق بود${Number.isFinite(code) ? ` (کد ${toEnDigits(String(code))})` : ''}` }
    }

    if (provider === 'payamito') {
      const res = await fetch('https://api.payamito.com/v1/sms/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.apiKey ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: s.from, to, text }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message_id?: string | number; error?: unknown } | null
      if (data?.ok === true) return { ok: true, provider, messageId: data.message_id != null ? String(data.message_id) : null }
      return { ok: false, provider, error: `پاسخ پنل پیامیتو ناموفق بود${data?.error ? `: ${String(data.error)}` : ''}` }
    }

    if (provider === 'smsir') {
      const res = await fetch('https://api.sms.ir/v1/send/bulk', {
        method: 'POST',
        headers: { 'x-api-key': s.apiKey ?? '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineNumber: s.lineNumber, messageText: text, mobiles: [to] }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const data = (await res.json().catch(() => null)) as { statusCode?: number; status?: number; data?: { messageId?: string | number }; message?: string } | null
      const sc = Number(data?.statusCode ?? data?.status ?? NaN)
      if (sc === 101) return { ok: true, provider, messageId: data?.data?.messageId != null ? String(data.data.messageId) : null }
      return { ok: false, provider, error: `پاسخ پنل رسا ناموفق بود${Number.isFinite(sc) ? ` (کد ${toEnDigits(String(sc))})` : ''}${data?.message ? ` — ${data.message}` : ''}` }
    }

    if (provider === 'farapayamak') {
      const baseUrl = ((s.baseUrl ?? '').trim().replace(/\/+$/, '')) || 'https://farapayamak.ir'
      const res = await fetch(`${baseUrl}/API/SendSMS`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: s.username ?? '', password: s.password ?? '', from: s.sender ?? s.from ?? '', to, text }),
        signal: AbortSignal.timeout(PANEL_TIMEOUT_MS),
      })
      const raw = await res.text().catch(() => '')
      let statusNum = NaN
      let mid: string | null = null
      try {
        const j = JSON.parse(raw)
        statusNum = Number(j?.Status ?? j?.status ?? NaN)
        mid = j?.Id != null ? String(j.Id) : null
      } catch {
        statusNum = Number(raw)
      }
      if (statusNum === 1) return { ok: true, provider, messageId: mid }
      return { ok: false, provider, error: `پاسخ پنل فراپیامک ناموفق بود${Number.isFinite(statusNum) ? ` (وضعیت ${toEnDigits(String(statusNum))})` : ''}` }
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

