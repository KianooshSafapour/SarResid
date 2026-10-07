import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const SESSION_COOKIE = 'hz_session'
export const SESSION_HEADER = 'x-session-token'
const SECRET = process.env.SESSION_SECRET || 'hyper-zeytoon-kerman-secret'

function sign(value: string): string {
  // lightweight HMAC-ish signature (sandbox-safe, no crypto dep issues)
  let h = 0
  const key = SECRET
  for (let i = 0; i < value.length + key.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i % value.length) + key.charCodeAt(i % key.length)
    h |= 0
  }
  return `${h.toString(36)}.${value}`
}

function unsign(signed: string): string | null {
  const idx = signed.indexOf('.')
  if (idx < 0) return null
  const sig = signed.slice(0, idx)
  const value = signed.slice(idx + 1)
  return sign(value) === signed ? value : null
}

export function makeToken(userId: string): string {
  return sign(userId)
}

export function parseToken(token: string | undefined | null): string | null {
  if (!token) return null
  return unsign(token)
}

export type SessionUser = {
  id: string
  name: string
  username: string
  role: string
  secondaryRoles: string[]
  roleIds?: string
  color: string
  points: number
  hidden?: boolean
}

export async function getSessionUser(req?: Request): Promise<SessionUser | null> {
  // Two-channel session: cookie OR X-Session-Token header.
  // Mobile WebViews / sandbox preview iframes (Safari ITP, cookie partitioning) drop cookies,
  // so the client mirrors the token in localStorage and sends the header — same code path for all.
  let token: string | undefined | null
  if (req) {
    token = req.headers.get(SESSION_HEADER)
    if (!token) {
      const cookieHeader = req.headers.get('cookie') || ''
      const match = cookieHeader.split(';').map((c) => c.trim()).find((c) => c.startsWith(SESSION_COOKIE + '='))
      token = match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null
    }
  }
  if (!token) return null
  const userId = parseToken(token)
  if (!userId) return null
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user || !user.active) return null
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    secondaryRoles: safeParse(user.secondaryRoles, []),
    roleIds: user.roleIds || '[]',
    color: user.color,
    points: user.points,
    hidden: user.hidden,
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

export async function logActivity(
  user: { id: string; name: string } | null,
  action: string,
  entity = '',
  entityId = '',
  detail = ''
) {
  try {
    await db.activityLog.create({
      data: {
        userId: user?.id || 'system',
        userName: user?.name || 'سیستم',
        action,
        entity,
        entityId,
        detail,
      },
    })
  } catch {
    // never block business flow on log failure
  }
}

/** shallow equality helper for JSON re-serialization */
export function appendHistory(historyJson: string, entry: Record<string, unknown>): string {
  const arr = safeParse<any[]>(historyJson, [])
  arr.push({ at: new Date().toISOString(), ...entry })
  return JSON.stringify(arr.slice(-200))
}
