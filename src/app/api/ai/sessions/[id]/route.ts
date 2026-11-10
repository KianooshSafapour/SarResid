import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { safeJson } from '@/lib/api'

export const dynamic = 'force-dynamic'

function canUseAi(role: string) {
  return ['OWNER', 'ADMIN', 'GM'].includes(role)
}

/** GET /api/ai/sessions/[id] — پیام‌های یک گفت‌وگو */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canUseAi(user.role)) return fail('دسترسی ندارید', 403)
  const { id } = await params
  const session = await db.aiChatSession.findFirst({
    where: { id, userId: user.id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!session) return fail('گفت‌وگو پیدا نشد', 404)
  return ok({
    session: {
      id: session.id,
      title: session.title,
      messages: session.messages.map((m) => ({ role: m.role, content: m.content, tools: safeJson<string[]>(m.toolsJson, []), at: m.model })),
    },
  })
}

/** PUT /api/ai/sessions/[id] {title} — تغییر عنوان */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canUseAi(user.role)) return fail('دسترسی ندارید', 403)
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { title?: string }
  const title = String(body.title ?? '').trim().slice(0, 80)
  if (!title) return fail('عنوان خالی است')
  const session = await db.aiChatSession.findFirst({ where: { id, userId: user.id } })
  if (!session) return fail('گفت‌وگو پیدا نشد', 404)
  await db.aiChatSession.update({ where: { id }, data: { title } })
  return ok({ title })
}

/** DELETE /api/ai/sessions/[id] */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canUseAi(user.role)) return fail('دسترسی ندارید', 403)
  const { id } = await params
  const session = await db.aiChatSession.findFirst({ where: { id, userId: user.id } })
  if (!session) return fail('گفت‌وگو پیدا نشد', 404)
  await db.aiChatSession.delete({ where: { id } })
  return ok({ deleted: true })
}
