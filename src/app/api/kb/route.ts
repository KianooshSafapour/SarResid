import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { hasCap } from '@/lib/rbac'

/** جست‌وجوی بخشندهٔ فارسی — ك→ک، ي→ی، نیم‌فاصله → فاصله */
export function normFa(s: string): string {
  return String(s || '')
    .replace(/ك/g, 'ک')
    .replace(/ي/g, 'ی')
    .replace(/\u200c/g, ' ')
    .toLowerCase()
    .trim()
}

function slugify(title: string): string {
  const base = title.trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '').slice(0, 60)
  return base || `kb-${Date.now().toString(36)}`
}

function parseArticle(a: {
  id: string; slug: string; title: string; category: string; body: string; tags: string
  sortOrder: number; updatedByName: string; updatedAt: Date; createdAt: Date
}) {
  return { ...a, tags: safeParse<string[]>(a.tags, []) }
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const q = normFa(searchParams.get('q') || '')
  const category = searchParams.get('category') || ''

  const [all, meCaps] = await Promise.all([
    db.kbArticle.findMany({ orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }] }),
    hasCap(me, 'kb.manage'),
  ])

  let articles = all
  if (q) {
    articles = articles.filter((a) => normFa(`${a.title} ${a.body} ${a.tags} ${a.category}`).includes(q))
  }
  if (category) articles = articles.filter((a) => a.category === category)

  const categories = Array.from(new Set(all.map((a) => a.category).filter(Boolean)))
  return json({ articles: articles.map(parseArticle), categories, canManage: meCaps })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await hasCap(me, 'kb.manage'))) return fail('دسترسی مدیریت دانشنامه ندارید', 403)
  const { title, category, body, tags, sortOrder } = await req.json().catch(() => ({}))
  if (!title?.trim() || !body?.trim()) return fail('عنوان و متن مقاله الزامی است')
  const tagList = Array.isArray(tags)
    ? tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 10)
    : String(tags || '').split(/[،,]/).map((t) => t.trim()).filter(Boolean).slice(0, 10)

  let slug = slugify(String(title))
  let i = 1
  while (await db.kbArticle.findUnique({ where: { slug } })) slug = `${slugify(String(title))}-${++i}`

  const article = await db.kbArticle.create({
    data: {
      slug,
      title: title.trim(),
      category: String(category || '').trim() || 'عمومی',
      body: String(body),
      tags: JSON.stringify(tagList),
      sortOrder: Math.round(Number(sortOrder) || 0),
      updatedById: me.id,
      updatedByName: me.name,
    },
  })
  await logActivity(me, 'مقالهٔ دانشنامه ثبت شد', 'kb', article.id, title.trim())
  return json({ article: parseArticle(article) }, 201)
}

export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await hasCap(me, 'kb.manage'))) return fail('دسترسی مدیریت دانشنامه ندارید', 403)
  const { id, title, category, body, tags, sortOrder } = await req.json().catch(() => ({}))
  if (!id) return fail('شناسه مقاله الزامی است')
  const existing = await db.kbArticle.findUnique({ where: { id } })
  if (!existing) return fail('مقاله یافت نشد', 404)
  if (!title?.trim() || !body?.trim()) return fail('عنوان و متن مقاله الزامی است')
  const tagList = Array.isArray(tags)
    ? tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 10)
    : String(tags || '').split(/[،,]/).map((t) => t.trim()).filter(Boolean).slice(0, 10)

  const article = await db.kbArticle.update({
    where: { id },
    data: {
      title: title.trim(),
      category: String(category || '').trim() || 'عمومی',
      body: String(body),
      tags: JSON.stringify(tagList),
      sortOrder: Math.round(Number(sortOrder) || 0),
      updatedById: me.id,
      updatedByName: me.name,
    },
  })
  await logActivity(me, 'مقالهٔ دانشنامه ویرایش شد', 'kb', id, title.trim())
  return json({ article: parseArticle(article) })
}

export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await hasCap(me, 'kb.manage'))) return fail('دسترسی مدیریت دانشنامه ندارید', 403)
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return fail('شناسه مقاله الزامی است')
  const existing = await db.kbArticle.findUnique({ where: { id } })
  if (!existing) return fail('مقاله یافت نشد', 404)
  await db.kbArticle.delete({ where: { id } })
  await logActivity(me, 'مقالهٔ دانشنامه حذف شد', 'kb', id, existing.title)
  return json({ ok: true })
}
