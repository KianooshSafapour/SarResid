import { ok } from '@/lib/api'
import { getSessionUser, ROLE_LABELS } from '@/lib/auth'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return ok({ user: null })
  return ok({
    user: {
      ...user,
      roleLabel: ROLE_LABELS[user.role] || user.role,
    },
  })
}
