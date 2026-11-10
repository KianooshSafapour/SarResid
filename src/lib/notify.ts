import { spawn } from 'child_process'
import { db } from '@/lib/db'

/**
 * Shared notification + realtime push helpers (Agent A scope).
 *
 * The realtime service is a socket.io mini-service: `mini-services/realtime`.
 * - socket.io on port 3030 (frontend: io("/?XTransformPort=3030", {path:"/", auth:{ticket}}))
 * - internal control API on port 3031: POST /emit {secret, room, event, payload}
 *   with rooms `user:{userId}` | `role:{ROLE}` | `all`.
 * The sandbox has an aggressive OOM-killer, so the service is supervised
 * (supervisor.ts auto-restart) and `ensureRealtime()` revives it from this
 * app whenever a health probe fails.
 */

const REALTIME_URL = process.env.REALTIME_URL || 'http://localhost:3031'
export const REALTIME_SECRET =
  process.env.REALTIME_SECRET || 'hz-realtime-internal-6677'

/** Display name with honorific, e.g. "خانم حدیث لطفی" */
export function displayName(u: { honorific?: string | null; fullName: string }): string {
  return `${u.honorific || ''} ${u.fullName}`.trim()
}

// ---- watchdog state (module scope, per Next.js server process) ----
let lastProbeAt = 0
let lastProbeOk = false
let lastReviveAt = 0
let reviving = false

async function realtimeHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${REALTIME_URL}/health`, { signal: AbortSignal.timeout(600) })
    return res.ok
  } catch {
    return false
  }
}

function spawnSupervisor() {
  try {
    const child = spawn('bun', ['supervisor.ts'], {
      cwd: '/home/z/my-project/mini-services/realtime',
      detached: true,
      stdio: 'ignore',
      env: process.env,
    })
    child.unref()
  } catch {
    // best effort
  }
}

/**
 * Revive the realtime mini-service if it is down (sandbox OOM-killer etc.).
 * Cheap: probes at most once every 15s; spawns at most once every 60s.
 */
export async function ensureRealtime(): Promise<void> {
  const now = Date.now()
  if (now - lastProbeAt < 15_000 && lastProbeOk) return
  lastProbeAt = now
  lastProbeOk = await realtimeHealthy()
  if (lastProbeOk) return
  if (reviving || now - lastReviveAt < 60_000) return
  reviving = true
  lastReviveAt = now
  spawnSupervisor()
  // re-probe later; another Next.js worker may have revived it already
  setTimeout(() => {
    reviving = false
  }, 10_000)
}

/** Push an event to a room through the realtime service. Never throws. */
export async function realtimeEmit(
  room: string,
  payload: Record<string, unknown>,
  event = 'msg'
): Promise<void> {
  try {
    const res = await fetch(`${REALTIME_URL}/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: REALTIME_SECRET, room, event, payload }),
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) await ensureRealtime()
  } catch {
    // realtime service down — revive it; the polling fallback still updates the UI
    await ensureRealtime()
  }
}

export interface NotifyOpts {
  userId?: string | null
  role?: string | null
  kind: string
  severity?: string // info | important | warning | critical
  title: string
  body: string
  go?: string | null
}

/**
 * Create a Notification row (bell dropdown) and push it live.
 * Targeting: userId (specific user) / role (manager roles) / neither (everyone).
 */
export async function notify(opts: NotifyOpts) {
  try {
    const row = await db.notification.create({
      data: {
        userId: opts.userId ?? null,
        role: opts.role ?? null,
        kind: opts.kind,
        severity: opts.severity || 'info',
        title: opts.title,
        body: opts.body,
        go: opts.go ?? null,
      },
    })
    const room = opts.userId
      ? `user:${opts.userId}`
      : opts.role
        ? `role:${opts.role}`
        : 'all'
    await realtimeEmit(room, {
      kind: 'notification',
      id: row.id,
      title: opts.title,
      body: opts.body,
      go: opts.go ?? null,
    })
    return row
  } catch {
    return null
  }
}

/** Public user projection used across collab endpoints (wall/awards/messages/kb...). */
export function publicUser(u: {
  id: string
  fullName: string
  honorific: string
  role: string
  avatarJson?: string | null
}) {
  return {
    id: u.id,
    fullName: u.fullName,
    honorific: u.honorific,
    role: u.role,
    avatarJson: u.avatarJson ?? null,
  }
}
