import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

export async function GET() {
  const posts = await db.wallPost.findMany({ orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }] })
  return json({ posts })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  if (!body.title || !body.content) return fail('عنوان و متن الزامی است')
  const post = await db.wallPost.create({
    data: {
      authorId: me.id,
      authorName: me.name,
      title: body.title,
      content: body.content,
      pinned: body.pinned === true && ['GM', 'OM', 'OWNER'].includes(me.role),
    },
  })
  await logActivity(me, 'درج در دیجیتال‌وال', 'wall', post.id, body.title)
  return json({ post }, 201)
}

export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const post = await db.wallPost.findUnique({ where: { id: id || '' } })
  if (!post) return fail('یافت نشد', 404)
  if (post.authorId !== me.id && !['GM', 'OM', 'OWNER'].includes(me.role))
    return fail('دسترسی غیرمجاز', 403)
  await db.wallPost.delete({ where: { id: id! } })
  return json({ ok: true })
}
