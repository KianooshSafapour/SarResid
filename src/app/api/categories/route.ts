/** مدیریت دسته‌بندی کالاها (round-17) — SSOT نام دسته همان Product.category است؛
 *  این جدول فقط «متادیتا» (آیکون/رنگ/لوگو/ترتیب) را به نام دسته می‌چسباند.
 *  GET  → فهرست دسته‌ها + تعداد کالاهای فعال هر دسته (groupBy)
 *  POST → ایجاد دسته (نام یکتا، آیکون ایموجی، رنگ برند، لوگو اختیاری) */
import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { isExecRole } from '@/lib/constants'

/** چه کسی می‌تواند دسته‌ها را مدیریت کند؟ — همان سطح ویرایش کالا (GM/PM/OM/ACC/SK + اجرایی) */
function canManageCategories(role: string, secondaryRoles: string[]): boolean {
  if (isExecRole(role)) return true
  return ['PM', 'ACC', 'SK'].includes(role) || secondaryRoles.includes('PM')
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const [cats, grouped] = await Promise.all([
    db.category.findMany({ orderBy: [{ sort: 'asc' }, { name: 'asc' }] }),
    db.product.groupBy({ by: ['category'], where: { active: true }, _count: { _all: true } }),
  ])
  const countMap = new Map(grouped.map((g) => [g.category, g._count._all]))
  return json({
    categories: cats.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon || '📦',
      color: c.color || '#0e7a4a',
      imageUrl: c.imageUrl || '',
      sort: c.sort,
      active: c.active,
      count: countMap.get(c.name) || 0,
    })),
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!canManageCategories(me.role, me.secondaryRoles))
    return fail('فقط مدیران می‌توانند دسته‌بندی‌ها را مدیریت کنند', 403)

  const body = await req.json().catch(() => null)
  const name = String(body?.name || '').trim().slice(0, 60)
  if (!name) return fail('نام دسته الزامی است')
  const icon = String(body?.icon || '📦').trim().slice(0, 8) || '📦'
  const color = HEX_RE.test(String(body?.color || '')) ? String(body.color) : '#0e7a4a'
  const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl.slice(0, 400_000) : ''
  if (imageUrl && !/^(data:image\/(png|jpe?g|webp|gif);base64,|https?:\/\/)/.test(imageUrl))
    return fail('لوگوی دسته باید تصویر (dataURL یا آدرس اینترنتی) باشد')

  const last = await db.category.findFirst({ orderBy: { sort: 'desc' }, select: { sort: true } })
  try {
    const cat = await db.category.create({
      data: { name, icon, color, imageUrl, sort: (last?.sort ?? 0) + 1, active: body?.active !== false },
    })
    await logActivity(me, 'ایجاد دسته‌بندی کالا', 'category', cat.id, `${icon} ${name}`)
    return json({ category: cat }, 201)
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === 'P2002') return fail('دسته‌ای با این نام از قبل وجود دارد', 409)
    throw e
  }
}
