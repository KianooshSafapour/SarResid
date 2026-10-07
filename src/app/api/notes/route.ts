import { db } from '@/lib/db'
import { fail, getSessionUser, json } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const notes = await db.note.findMany({
    where: { userId: me.id },
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
  })
  return json({ notes })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { content, color } = await req.json()
  if (!content?.trim()) return fail('متن یادداشت الزامی است')
  const note = await db.note.create({ data: { userId: me.id, content: content.trim(), color: color || '#f6e7c1' } })
  return json({ note }, 201)
}

export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { id, content, color, pinned } = await req.json()
  const note = await db.note.findUnique({ where: { id } })
  if (!note || note.userId !== me.id) return fail('یافت نشد', 404)
  const updated = await db.note.update({
    where: { id },
    data: {
      ...(content !== undefined ? { content } : {}),
      ...(color !== undefined ? { color } : {}),
      ...(pinned !== undefined ? { pinned } : {}),
    },
  })
  return json({ note: updated })
}

export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const note = await db.note.findUnique({ where: { id: id || '' } })
  if (!note || note.userId !== me.id) return fail('یافت نشد', 404)
  await db.note.delete({ where: { id: id! } })
  return json({ ok: true })
}
