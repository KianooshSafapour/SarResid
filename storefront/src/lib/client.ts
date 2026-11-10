'use client'

/** fetch سمت کلاینت به پروکسی ویترین (/api/shop/*) */
export async function cfetch<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<{ ok: boolean; data?: T; error?: string; adjusted?: unknown; status: number }> {
  try {
    const res = await fetch(`/api/shop${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    })
    const j = (await res.json().catch(() => ({ ok: false, error: 'پاسخ نامعتبر' }))) as { ok: boolean; data?: T; error?: string; adjusted?: unknown }
    return { ...j, status: res.status }
  } catch {
    return { ok: false, error: 'ارتباط برقرار نشد — اینترنت خود را بررسی کنید', status: 0 }
  }
}

/** رویداد سراسری «سبد عوض شد» — بج سبد و توستر گوش می‌دهند */
export function cartChanged() {
  window.dispatchEvent(new CustomEvent('hz-cart-changed'))
}

export function toast(msg: string) {
  window.dispatchEvent(new CustomEvent('hz-toast', { detail: msg }))
}
