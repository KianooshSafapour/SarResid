import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { randomBytes } from 'crypto'

/** Issue a one-time ticket for the socket.io realtime service (port 3030) */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('نیاز به ورود', 401)

  const token = randomBytes(24).toString('base64url')
  await db.realtimeTicket.create({
    data: {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
    },
  })
  return ok({ ticket: token })
}
