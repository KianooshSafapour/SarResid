import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Setting key for per-user tour state (also read by /api/auth/me → user.tourDone) */
function tourKey(userId: string) {
  return `tour_${userId}`
}

interface TourState {
  done: boolean
  step: number
  doneAt?: string | null
}

async function readTour(userId: string): Promise<TourState> {
  const row = await db.setting.findUnique({ where: { key: tourKey(userId) } })
  if (!row) return { done: false, step: 0 }
  const parsed = safeJson<Partial<TourState>>(row.value, {})
  return {
    done: parsed.done === true,
    step: Number.isFinite(parsed.step) ? Number(parsed.step) : 0,
    doneAt: parsed.doneAt ?? null,
  }
}

/** GET /api/me/tour → {done, step} */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const state = await readTour(me.id)
  return ok(state)
}

/**
 * POST /api/me/tour — the live frontend sends {} when the tour is dismissed.
 * Also accepts {done:true} or {step:number} for partial progress.
 * {reset:true} → deletes the Setting row so /api/auth/me reports tourDone:false again
 * (used by «شروع دوبارهٔ تور خوش‌آمدگویی» in the knowledge center).
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => ({}))) as {
    done?: boolean
    step?: number
    reset?: boolean
  }

  if (body.reset === true) {
    await db.setting.deleteMany({ where: { key: tourKey(me.id) } })
    return ok({ done: false, step: 0, reset: true })
  }

  const prev = await readTour(me.id)

  const next: TourState = {
    done: body.done === true || body.done === undefined ? true : prev.done,
    step: Number.isFinite(body.step) ? Number(body.step) : prev.step,
    doneAt: prev.doneAt ?? new Date().toISOString(),
  }

  await db.setting.upsert({
    where: { key: tourKey(me.id) },
    create: { key: tourKey(me.id), value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  })

  return ok(next)
}
