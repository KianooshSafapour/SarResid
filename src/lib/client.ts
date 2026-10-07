'use client'

/** Small typed fetch helper for all client → API calls.
 *  Dual-channel session: cookie (desktop) + X-Session-Token header (mobile WebView /
 *  sandbox iframe where cookies are partitioned/blocked by Safari ITP). */

const TOKEN_KEY = 'hz_token'

export function setSessionToken(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token) } catch { /* storage blocked — cookie only */ }
}

export function getSessionToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' }
}

export function clearSessionToken() {
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...extra }
  const t = getSessionToken()
  if (t) h['X-Session-Token'] = t
  return h
}

export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  // 🎓 حالت آموزشی (Sandbox): درخواست‌های نوشتن هرگز به سرور نمی‌رسند —
  // کاربر با دادهٔ واقعی تمرین می‌کند و هیچ رکوردی تغییر نمی‌کند.
  const method = (options.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && typeof window !== 'undefined') {
    try {
      if (sessionStorage.getItem('hz-sandbox') === '1' && !path.startsWith('/api/feedback')) {
        const { toast } = await import('sonner')
        toast.info('🎓 حالت آموزشی — این تغییر ذخیره نشد (تمرین امن)')
        return { ok: true, __sandbox: true } as T
      }
    } catch { /* storage unavailable */ }
  }
  const res = await fetch(path, {
    method,
    headers: authHeaders(options.body ? { 'Content-Type': 'application/json' } : undefined),
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error || 'خطای ارتباط با سرور')
  }
  return data as T
}
