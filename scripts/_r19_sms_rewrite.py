# -*- coding: utf-8 -*-
"""بازنویسی لایهٔ ارائه‌دهندهٔ پیامک بر پایهٔ مستندات رسمی (اکتبر ۲۰۲۶)"""
import io, re

p = 'src/lib/sms.ts'
s = io.open(p, encoding='utf-8').read()

# ─────────────────────────────────────────────────────────────
# ۱) PANEL_PROVIDERS + PROVIDER_META (اصلاح فراز + افزودن کاوه‌نگار)
# ─────────────────────────────────────────────────────────────
old_providers = """export const PANEL_PROVIDERS = [
  'melipayamak', 'farazsms', 'payamresan', 'webone', 'niksms',
  'payamito', 'smsir', 'farapayamak', 'custom',
] as const"""
new_providers = """export const PANEL_PROVIDERS = [
  'farazsms', 'kavenegar', 'melipayamak', 'smsir', 'payamresan', 'webone', 'niksms',
  'payamito', 'farapayamak', 'custom',
] as const"""
assert old_providers in s
s = s.replace(old_providers, new_providers)

old_meta_faraz = """  farazsms: {
    title: 'فراز اس‌ام‌اس (IPPanel)',
    fields: ['apiKey', 'from'],
    help: 'کلید API پنل IPPanel/فراز + شماره خط ارسال‌کننده. api2.ippanel.com',
  },"""
new_meta_faraz = """  farazsms: {
    title: 'فراز اس‌ام‌اس',
    fields: ['apiKey', 'from'],
    help: 'کلید API فراز (هدر Api-Key) + شماره خط ارسال (line_number). API رسمی: api.iranpayamak.com — مستندات: docs.farazsms.com',
  },
  kavenegar: {
    title: 'کاوه‌نگار',
    fields: ['apiKey', 'sender'],
    help: 'کلید API کاوه‌نگار (در مسیر URL می‌رود) + خط ارسال اختیاری (sender). api.kavenegar.com',
  },"""
assert old_meta_faraz in s
s = s.replace(old_meta_faraz, new_meta_faraz)

s = s.replace("""  melipayamak: {
    title: 'ملی‌پیامک',
    fields: ['username', 'password', 'from'],
    help: 'نام کاربری و رمز پنل ملی‌پیامک + شماره خط ارسال‌کننده (from). REST: rest.payamak-panel.com',
  },""",
"""  melipayamak: {
    title: 'ملی‌پیامک',
    fields: ['username', 'password', 'from'],
    help: 'نام کاربری و رمز پنل ملی‌پیامک + شماره خط ارسال (from). REST: rest.payamak-panel.com/api/SendSMS/SendSMS',
  },""")

s = s.replace("""  payamito: {
    title: 'پیامیتو',
    fields: ['apiKey', 'from'],
    help: 'کلید API پیامیتو + شماره خط. api.payamito.com',
  },""",
"""  payamito: {
    title: 'پیامیتو',
    fields: ['username', 'password', 'from'],
    help: 'نام کاربری/رمز پنل پیامیتو + خط ارسال — روی پلتفرم payamak-panel (rest.payamak-panel.com)',
  },""")

s = s.replace("""  smsir: {
    title: 'پیامک رسا (SMS.ir)',
    fields: ['apiKey', 'lineNumber'],
    help: 'کلید API رسا + شماره خط خدماتی (lineNumber). api.sms.ir',
  },""",
"""  smsir: {
    title: 'پیامک رسا (SMS.ir)',
    fields: ['apiKey', 'lineNumber'],
    help: 'کلید API رسا (هدر X-API-KEY) + شماره خط خدماتی. api.sms.ir/v1/send/bulk — شماره‌ها بدون ۰ اول ارسال می‌شوند',
  },""")

s = s.replace("""  payamresan: {
    title: 'پیام‌رسان',
    fields: ['username', 'password', 'from'],
    help: 'نام کاربری و رمز پیام‌رسان + خط ارسال. sms.payam-resan.com',
  },""",
"""  payamresan: {
    title: 'پیام‌رسان',
    fields: ['apiKey', 'sender'],
    help: 'کلید API پیام‌رسان (ApiKey در بدنه؛ قالب ۱۲۳۴۵۶-XXXX) + خط ارسال. api.sms-webservice.com/api/V3',
  },""")

s = s.replace("""  webone: {
    title: 'وب‌وان',
    fields: ['baseUrl', 'username', 'password', 'sender'],
    help: 'پنل وب‌وان — نشانی پایهٔ پنل (baseUrl) + نام کاربری/رمز + خط ارسال (sender)',
  },""",
"""  webone: {
    title: 'وب‌وان',
    fields: ['username', 'password', 'sender'],
    help: 'نام کاربری/رمز وب‌وان + خط ارسال. rest.payamakapi.ir/api/v1/SMS/Send',
  },""")

s = s.replace("""  farapayamak: {
    title: 'فراپیامک',
    fields: ['baseUrl', 'username', 'password', 'sender'],
    help: 'نام کاربری/رمز فراپیامک + خط ارسال (sender)؛ نشانی پایه اختیاری است (پیش‌فرض farapayamak.ir)',
  },""",
"""  farapayamak: {
    title: 'فراپیامک',
    fields: ['username', 'password', 'sender'],
    help: 'نام کاربری/رمز فراپیامک + خط ارسال — روی پلتفرم payamak-panel (rest.payamak-panel.com)',
  },""")

# ─────────────────────────────────────────────────────────────
# ۲) callProvider — بازنویسی کامل با قراردادهای رسمی
# ─────────────────────────────────────────────────────────────
start = s.index('/** One raw provider call')
end_marker = "    return { ok: false, provider, error: 'ارتباط با پنل پیامک برقرار نشد (مهلت پاسخ پایان یافت)' }\n  }\n}"
end = s.index(end_marker) + len(end_marker)
new_call = '''/** شماره بدون صفرِ اول (SMS.ir / پیام‌رسان) */
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
      const codes = raw.match(/\\d+/g)
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
        tpl.replace(/\\{(to|from|text|username|password)\\}/g, (_m, k: string) => {
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
      const data = (await res.json().catch(() => null)) as { status?: string; message?: string; data?: { balanceAmount?: number; balanceCount?: number } } | null
      if (data?.status === 'success' && data.data) {
        return { ok: true, credit: `مانده: ${toEnDigits(String(data.data.balanceAmount ?? '?'))} — ${toEnDigits(String(data.data.balanceCount ?? '?'))} پیامک` }
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
}'''
s = s[:start] + new_call + s[end:]

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('sms.ts providers rewritten against official docs')
