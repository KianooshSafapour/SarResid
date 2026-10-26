import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, type SessionUser } from '@/lib/auth'

/** Success envelope: {ok:true, data} */
export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init)
}

/** Error envelope: {ok:false, error} */
export function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status })
}

export function qs(params: Record<string, string | undefined | null>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, v)
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Require session; returns user or null (caller returns 401) */
export async function requireUser(): Promise<SessionUser | null> {
  return getSessionUser()
}

export async function logActivity(opts: {
  userId?: string | null
  userName?: string | null
  action: string
  actionLabel?: string
  category?: string
  detail?: string
  entityId?: string
}) {
  try {
    await db.activityLog.create({
      data: {
        userId: opts.userId ?? null,
        userName: opts.userName ?? null,
        action: opts.action,
        actionLabel: opts.actionLabel ?? null,
        category: opts.category ?? 'general',
        detail: opts.detail ?? null,
        entityId: opts.entityId ?? null,
      },
    })
  } catch {
    // never throw from logging
  }
}

export function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function clampInt(v: unknown, min: number, max: number, dflt = 0): number {
  /* R12: Number(null) === 0 و محدود است — پارامتر غایب (null از sp.get) قبلاً به
     به Math.min می‌رسید و مثلاً pageSize بی‌پارامتر می‌شد ۱ (سند: آرشیو فقط یک سند در
     صفحه برمی‌گرداند). غایب/خالی/ناعدد → مقدار پیش‌فرض. */
  if (v === null || v === undefined || v === '') return dflt
  const n = Number(v)
  if (!Number.isFinite(n)) return dflt
  return Math.max(min, Math.min(max, Math.round(n)))
}
