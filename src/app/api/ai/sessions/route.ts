import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { safeJson } from '@/lib/api'

export const dynamic = 'force-dynamic'

function canUseAi(role: string) {
  return ['OWNER', 'ADMIN', 'GM'].includes(role)
}

/** GET /api/ai/sessions — فهرست گفت‌وگوهای من (جدید اول) */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canUseAi(user.role)) return fail('دستیار هوشمند برای مالک/مدیران است', 403)
  const rows = await db.aiChatSession.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: { messages: { select: { id: true } } },
  })
  return ok({
    sessions: rows.map((s) => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updatedAt,
      count: s.messages.length,
    })),
  })
}
