/** /api/categories/[id] — ویرایش / غیرفعال‌سازی / حذف دسته (round-17)
 *  PATCH  { name?, icon?, color?, imageUrl?, sort?, active? }
 *  DELETE { moveTo? } — اگر کالایی به دسته متصل باشد:
 *    بدون moveTo → 409 «این دسته به کالاها متصل است — ابتدا کالاها را منتقل کنید»
 *    با moveTo   → انتقال گروهی همهٔ کالاها به دستهٔ مقصد + حذف، داخل یک تراکنش */
import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { isExecRole } from '@/lib/constants'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** چه کسی می‌تواند دسته‌ها را مدیریت کند؟ — همان سطح ویرایش کالا (GM/PM/OM/ACC/SK + اجرایی) */
function canManageCategories(role: string, secondaryRoles: string[]): boolean {
  if (isExecRole(role)) return true
  return ['PM', 'ACC', 'SK'].includes(role) || secondaryRoles.includes('PM')
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!canManageCategories(me.role, me.secondaryRoles))
    return fail('فقط مدیران می‌توانند دسته‌بندی‌ها را مدیریت کنند', 403)

  const { id } = await params
  const cat = await db.category.findUnique({ where: { id } })
  if (!cat) return fail('دسته یافت نشد', 404)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('دادهٔ ارسالی نامعتبر است')

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 60)
    if (!name) return fail('نام دسته نمی‌تواند خالی باشد')
    data.name = name
  }
  if (body.icon !== undefined) {
    const icon = String(body.icon).trim().slice(0, 8)
    if (!icon) return fail('آیکون نمی‌تواند خالی باشد')
    data.icon = icon
  }
  if (body.color !== undefined) {
    if (!HEX_RE.test(String(body.color))) return fail('رنگ باید در قالب #RRGGBB باشد')
    data.color = String(body.color)
  }
  if (body.imageUrl !== undefined) {
    const imageUrl = String(body.imageUrl || '')
    if (imageUrl && !/^(data:image\/(png|jpe?g|webp|gif);base64,|https?:\/\/)/.test(imageUrl))
      return fail('لوگوی دسته باید تصویر (dataURL یا آدرس اینترنتی) باشد')
    data.imageUrl = imageUrl.slice(0, 400_000)
  }
  if (body.sort !== undefined) {
    const sort = Number(body.sort)
    if (!Number.isFinite(sort)) return fail('ترتیب باید عدد باشد')
    data.sort = Math.max(0, Math.round(sort))
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') return fail('وضعیت فعال/غیرفعال نامعتبر است')
    data.active = body.active
  }
  if (Object.keys(data).length === 0) return fail('تغییری برای ذخیره یافت نشد')

  try {
    const updated = await db.category.update({ where: { id }, data })
    await logActivity(me, 'ویرایش دسته‌بندی کالا', 'category', id, `${updated.icon} ${updated.name}`)
    return json({ category: updated })
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === 'P2002') return fail('دسته‌ای با این نام از قبل وجود دارد', 409)
    throw e
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!canManageCategories(me.role, me.secondaryRoles))
    return fail('فقط مدیران می‌توانند دسته‌بندی‌ها را مدیریت کنند', 403)

  const { id } = await params
  const cat = await db.category.findUnique({ where: { id } })
  if (!cat) return fail('دسته یافت نشد', 404)

  const body = await req.json().catch(() => ({}))
  const used = await db.product.count({ where: { category: cat.name, active: true } })

  if (used > 0) {
    const moveTo = String(body?.moveTo || '').trim()
    if (!moveTo)
      return fail('این دسته به کالاها متصل است — ابتدا کالاها را منتقل کنید', 409)
    if (moveTo === cat.name)
      return fail('دستهٔ مقصد باید با دستهٔ فعلی متفاوت باشد')
    const target = await db.category.findUnique({ where: { name: moveTo } })
    if (!target) return fail('دستهٔ مقصد یافت نشد', 404)
    const moved = await db.$transaction([
      db.product.updateMany({ where: { category: cat.name }, data: { category: moveTo } }),
      db.category.delete({ where: { id } }),
    ])
    await logActivity(me, 'حذف دسته با انتقال کالاها', 'category', id, `${cat.icon} ${cat.name} → ${moveTo} (${moved[0].count} کالا)`)
    return json({ ok: true, moved: moved[0].count, moveTo })
  }

  await db.category.delete({ where: { id } })
  await logActivity(me, 'حذف دسته‌بندی کالا', 'category', id, `${cat.icon} ${cat.name}`)
  return json({ ok: true, moved: 0 })}
