/** /api/me/profile — فیلدهای پروفایل قابل ویرایش توسط کاربر (round-18-D)
 *  GET   → { name, nickname, bio, phone, role, points, avatarUrl, avatarStyle }
 *          name/role/points فقط‌خواندنی‌اند (نام واقعی و نقش را مدیر نگهداری می‌کند)
 *  PATCH { nickname?, bio?, phone? } — سقف‌ها: nickname ۲۴، bio ۱۶۰، phone ۲۰ نویسه */
import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

const CAPS = { nickname: 24, bio: 160, phone: 20 } as const

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const user = await db.user.findUnique({
    where: { id: me.id },
    select: { name: true, nickname: true, bio: true, phone: true, role: true, points: true, avatarUrl: true, avatarStyle: true },
  })
  if (!user) return fail('کاربر یافت نشد', 404)
  return json({ name: user.name, nickname: user.nickname, bio: user.bio, phone: user.phone, role: user.role, points: user.points, avatarUrl: user.avatarUrl || '', avatarStyle: user.avatarStyle || '' })
}

export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('دادهٔ ارسالی نامعتبر است')

  const data: { nickname?: string; bio?: string; phone?: string } = {}

  if (body.nickname !== undefined) {
    const v = clean(body.nickname)
    if (v.length > CAPS.nickname) return fail(`نام مستعار حداکثر ${CAPS.nickname} نویسه است`)
    data.nickname = v
  }
  if (body.bio !== undefined) {
    const v = clean(body.bio)
    if (v.length > CAPS.bio) return fail(`دربارهٔ من حداکثر ${CAPS.bio} نویسه است`)
    data.bio = v
  }
  if (body.phone !== undefined) {
    let v = clean(body.phone)
    if (v.length > CAPS.phone) return fail(`شماره تماس حداکثر ${CAPS.phone} نویسه است`)
    // نرمال‌سازی ارقام فارسی/عربی به لاتین برای سازگاری با تماس‌ها
    v = v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    if (v && !/^[+0-9][0-9\s-]{0,19}$/.test(v)) return fail('شماره تماس معتبر نیست — فقط رقم، + و - مجاز است')
    data.phone = v
  }

  if (Object.keys(data).length === 0) return fail('تغییری برای ذخیره یافت نشد')

  const user = await db.user.update({ where: { id: me.id }, data })
  await logActivity(me, 'update', 'user', me.id, 'profile')
  return json({ name: user.name, nickname: user.nickname, bio: user.bio, phone: user.phone, role: user.role, points: user.points, avatarUrl: user.avatarUrl || '', avatarStyle: user.avatarStyle || '' })
}
