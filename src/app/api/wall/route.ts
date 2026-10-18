import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, safeJson, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { displayName } from '@/lib/notify'

export const dynamic = 'force-dynamic'

/** GET /api/wall — news wall: pinned first, then newest */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const posts = await db.wallPost.findMany({
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  })
  const authorIds = [...new Set(posts.map((p) => p.authorId))]
  const authors = authorIds.length
    ? await db.user.findMany({ where: { id: { in: authorIds } } })
    : []
  const authorMap = new Map(authors.map((a) => [a.id, a]))

  return ok({
    posts: posts.map((p) => {
      const a = authorMap.get(p.authorId)
      return {
        id: p.id,
        content: p.content,
        pinned: p.pinned,
        authorId: p.authorId,
        likesJson: p.likesJson,
        createdAt: p.createdAt,
        author: a
          ? {
              id: a.id,
              fullName: a.fullName,
              honorific: a.honorific,
              role: a.role,
              avatarJson: a.avatarJson,
            }
          : null,
        likes: safeJson<string[]>(p.likesJson, []),
        authorName: a ? displayName(a) : '—',
      }
    }),
  })
}

/** POST /api/wall {content, pinned?} — any logged-in user can post; pin = managers */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => ({}))) as { content?: string; pinned?: boolean }
  const content = String(body.content || '').trim()
  if (content.length < 2) return fail('متن پست الزامی است')

  const post = await db.wallPost.create({
    data: {
      content,
      pinned: body.pinned === true && isManager(me),
      authorId: me.id,
      likesJson: '[]',
    },
  })

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'wall_post',
    actionLabel: 'پست روی دیوار خبری',
    category: 'wall',
    detail: content.slice(0, 80),
    entityId: post.id,
  })

  return ok({ post: { id: post.id } })
}

/**
 * PATCH /api/wall {id, action}
 *  - action:"like" → toggle my like → {likes:[userId,...]}
 *  - action:"pin"  → toggle pinned (managers)
 */
export async function PATCH(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => ({}))) as { id?: string; action?: string }
  const id = String(body.id || '')
  const action = String(body.action || '')
  const post = await db.wallPost.findUnique({ where: { id } })
  if (!post) return fail('پست یافت نشد', 404)

  if (action === 'like') {
    const likes = safeJson<string[]>(post.likesJson, [])
    const idx = likes.indexOf(me.id)
    if (idx >= 0) likes.splice(idx, 1)
    else likes.push(me.id)
    await db.wallPost.update({ where: { id }, data: { likesJson: JSON.stringify(likes) } })
    return ok({ likes })
  }

  if (action === 'pin') {
    if (!isManager(me)) return fail('فقط مدیران می‌توانند پست را سنجاق کنند', 403)
    await db.wallPost.update({ where: { id }, data: { pinned: !post.pinned } })
    return ok({ pinned: !post.pinned })
  }

  return fail('درخواست نامعتبر است')
}

/** DELETE /api/wall?id= — managers or the author */
export async function DELETE(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const id = req.nextUrl.searchParams.get('id') || ''
  const post = await db.wallPost.findUnique({ where: { id } })
  if (!post) return fail('پست یافت نشد', 404)
  if (!isManager(me) && post.authorId !== me.id) return fail('اجازه حذف این پست را ندارید', 403)

  await db.wallPost.delete({ where: { id } })
  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'wall_post_delete',
    actionLabel: 'حذف پست دیوار خبری',
    category: 'wall',
    entityId: id,
  })
  return ok({ deleted: id })
}
