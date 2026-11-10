import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

/** GET /api/sms/drafts — پیش‌نویس‌های پیامک (جدید اول) */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'system/smscenter')
  if (!gate.ok) return fail(gate.deny, 403)
  const rows = await db.smsDraft.findMany({ orderBy: { updatedAt: 'desc' }, take: 60 })
  return ok({ drafts: rows })
}

/** POST /api/sms/drafts {title, body} — پیش‌نویس جدید */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'system/smscenter')
  if (!gate.ok) return fail(gate.deny, 403)
  const body = (await req.json().catch(() => ({}))) as { title?: string; body?: string }
  const text = String(body.body ?? '').trim()
  if (!text) return fail('متن پیش‌نویس خالی است')
  const row = await db.smsDraft.create({
    data: { userId: user.id, userName: user.fullName, title: String(body.title ?? '').trim().slice(0, 60), body: text.slice(0, 2000) },
  })
  return ok({ draft: row })
}

/** PUT /api/sms/drafts {id, title?, body?} */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'system/smscenter')
  if (!gate.ok) return fail(gate.deny, 403)
  const body = (await req.json().catch(() => ({}))) as { id?: string; title?: string; body?: string }
  const row = await db.smsDraft.findUnique({ where: { id: String(body.id ?? '') } })
  if (!row) return fail('پیش‌نویس پیدا نشد', 404)
  await db.smsDraft.update({
    where: { id: row.id },
    data: {
      ...(body.title !== undefined ? { title: String(body.title).slice(0, 60) } : {}),
      ...(body.body !== undefined ? { body: String(body.body).slice(0, 2000) } : {}),
      updatedAt: new Date(),
    },
  })
  return ok({ updated: true })
}

/** DELETE /api/sms/drafts?id= */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'system/smscenter')
  if (!gate.ok) return fail(gate.deny, 403)
  const id = req.nextUrl.searchParams.get('id') || ''
  const row = await db.smsDraft.findUnique({ where: { id } })
  if (!row) return fail('پیش‌نویس پیدا نشد', 404)
  await db.smsDraft.delete({ where: { id } })
  return ok({ deleted: true })
}
