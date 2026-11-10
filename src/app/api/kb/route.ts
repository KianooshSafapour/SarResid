import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, safeJson, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { displayName } from '@/lib/notify'

export const dynamic = 'force-dynamic'

/** canManage for the knowledge base (matches the live site) */
function kbCanManage(role: string): boolean {
  return ['ADMIN', 'GM', 'OWNER'].includes(role)
}

/** roleKeys are stored in the Setting KV (KbArticle has no column for them) */
const roleKeySetting = (id: string) => `kb:rolekeys:${id}`

async function getRoleKeys(id: string): Promise<string[]> {
  const row = await db.setting.findUnique({ where: { key: roleKeySetting(id) } })
  return safeJson<string[]>(row?.value, [])
}

async function saveRoleKeys(id: string, roleKeys: string[]) {
  await db.setting.upsert({
    where: { key: roleKeySetting(id) },
    create: { key: roleKeySetting(id), value: JSON.stringify(roleKeys) },
    update: { value: JSON.stringify(roleKeys) },
  })
}

function articleCard(a: {
  id: string
  slug: string
  title: string
  category: string
  summary: string
  imageUrl: string | null
  pinned: boolean
  views: number
  updatedAt: Date
}) {
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    category: a.category,
    summary: a.summary,
    imageUrl: a.imageUrl,
    pinned: a.pinned,
    views: a.views,
    updatedAt: a.updatedAt,
  }
}

/** slug from a (possibly Persian) title, e.g. "خوش آمدید" → "خوش-آمدید" */
function slugify(title: string): string {
  const s = title
    .trim()
    .replace(/[\s\u200c]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return s || `kb-${Date.now().toString(36)}`
}

async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  let slug = base
  let n = 2
  for (;;) {
    const existing = await db.kbArticle.findUnique({ where: { slug } })
    if (!existing || existing.id === ignoreId) return slug
    slug = `${base}-${n++}`
  }
}

/**
 * GET /api/kb — knowledge base.
 *  - ?q=&category= → {articles, categories, canManage}
 *  - ?id= (or ?slug=) → {article} with body + roleKeys (and a views increment)
 */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const sp = req.nextUrl.searchParams
  const id = sp.get('id')
  const slug = sp.get('slug')

  // ---- single article ----
  if (id || slug) {
    const article = id
      ? await db.kbArticle.findUnique({ where: { id } })
      : await db.kbArticle.findUnique({ where: { slug: slug || '' } })
    if (!article) return fail('مقاله یافت نشد', 404)

    const [roleKeys] = await Promise.all([
      getRoleKeys(article.id),
      db.kbArticle.update({ where: { id: article.id }, data: { views: { increment: 1 } } }),
    ])

    return ok({
      article: {
        ...articleCard(article),
        body: article.body,
        roleKeys,
      },
    })
  }

  // ---- list ----
  const q = (sp.get('q') || '').trim()
  const category = (sp.get('category') || '').trim()

  const all = await db.kbArticle.findMany({
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
  })

  const filtered = all.filter((a) => {
    if (category && a.category !== category) return false
    if (q) {
      const hay = `${a.title}\n${a.summary}\n${a.body}\n${a.category}`
      if (!hay.includes(q)) return false
    }
    return true
  })

  const categories: string[] = []
  for (const a of all) if (!categories.includes(a.category)) categories.push(a.category)

  return ok({
    articles: filtered.map(articleCard),
    categories,
    canManage: me ? kbCanManage(me.role) : false,
  })
}

/** POST /api/kb {title, category, summary, body, imageUrl, roleKeys, pinned} */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!kbCanManage(me.role)) return fail('اجازه مدیریت دانش‌نامه را ندارید', 403)

  const body = (await req.json().catch(() => ({}))) as {
    title?: string
    category?: string
    summary?: string
    body?: string
    imageUrl?: string
    roleKeys?: string[]
    pinned?: boolean
    slug?: string
  }

  const title = String(body.title || '').trim()
  if (title.length < 2) return fail('عنوان مقاله الزامی است')

  const article = await db.kbArticle.create({
    data: {
      slug: await uniqueSlug(body.slug?.trim() || slugify(title)),
      title,
      category: String(body.category || '').trim() || 'عمومی',
      summary: String(body.summary || '').trim(),
      body: String(body.body || '').trim(),
      imageUrl: body.imageUrl ? String(body.imageUrl).trim() : null,
      pinned: body.pinned === true,
    },
  })
  await saveRoleKeys(article.id, Array.isArray(body.roleKeys) ? body.roleKeys.slice(0, 20) : [])

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'kb_create',
    actionLabel: 'ایجاد مقاله دانش‌نامه',
    category: 'kb',
    detail: title,
    entityId: article.id,
  })

  return ok({ article: { id: article.id, slug: article.slug } })
}

/** PATCH /api/kb {id, title, category, summary, body, imageUrl, roleKeys, pinned} */
export async function PATCH(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!kbCanManage(me.role)) return fail('اجازه مدیریت دانش‌نامه را ندارید', 403)

  const body = (await req.json().catch(() => ({}))) as {
    id?: string
    title?: string
    category?: string
    summary?: string
    body?: string
    imageUrl?: string
    roleKeys?: string[]
    pinned?: boolean
  }

  const id = String(body.id || '')
  const existing = await db.kbArticle.findUnique({ where: { id } })
  if (!existing) return fail('مقاله یافت نشد', 404)

  const title = String(body.title || '').trim()
  if (title.length < 2) return fail('عنوان مقاله الزامی است')

  await db.kbArticle.update({
    where: { id },
    data: {
      title,
      category: String(body.category || '').trim() || 'عمومی',
      summary: String(body.summary || '').trim(),
      body: String(body.body || '').trim(),
      imageUrl: body.imageUrl ? String(body.imageUrl).trim() : null,
      pinned: body.pinned === true,
    },
  })
  await saveRoleKeys(id, Array.isArray(body.roleKeys) ? body.roleKeys.slice(0, 20) : [])

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'kb_update',
    actionLabel: 'ویرایش مقاله دانش‌نامه',
    category: 'kb',
    detail: title,
    entityId: id,
  })

  return ok({ article: { id } })
}

/** DELETE /api/kb?id= */
export async function DELETE(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!kbCanManage(me.role)) return fail('اجازه مدیریت دانش‌نامه را ندارید', 403)

  const id = req.nextUrl.searchParams.get('id') || ''
  const existing = await db.kbArticle.findUnique({ where: { id } })
  if (!existing) return fail('مقاله یافت نشد', 404)

  await db.kbArticle.delete({ where: { id } })
  await db.setting.deleteMany({ where: { key: roleKeySetting(id) } })

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'kb_delete',
    actionLabel: 'حذف مقاله دانش‌نامه',
    category: 'kb',
    detail: existing.title,
    entityId: id,
  })

  return ok({ deleted: id })
}
