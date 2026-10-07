/** /api/me/avatar — تصویر واقعی + آواتار کارتونی کاربر جاری (round-17، نسخهٔ ۲ در ۱۸-D)
 *  GET  → { avatarUrl, avatarStyle } (همچنین از /api/auth/me هم برمی‌گردد)
 *  POST { avatarUrl? , avatarStyle? , clear?: 'photo'|'style' }
 *    avatarUrl   → dataURL تصویر واقعی (پس از فشرده‌سازی سمت کلاینت ≤۲۵۶px؛ سقف سرور ۳۰۰KB)
 *    avatarStyle → JSON آواتار کارتونی v2 {skin,hair,hairColor,eyes,mouth,outfit,outfitColor,accessory,bg,
 *                                          hijab,hijabColor,beard,brows,blush,freckles,glasses,emoji}
 *    رشتهٔ خالی = پاک‌کردن همان بخش */
import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'

const MAX_DATAURL = 300 * 1024 // ۳۰۰ کیلوبایت
const URL_RE = /^(data:image\/(png|jpe?g|webp|gif);base64,|https?:\/\/)/

/** سنجش اعتبار پیکربندی آواتار کارتونی v2 — هر کلید باید از فهرست مجاز باشد */
const HAIR = ['short', 'long', 'curly', 'bun', 'braid', 'ponytail', 'bald', 'buzz', 'wavy', 'mohawk', 'afro', 'undercut']
const ACCESSORY = ['none', 'cap', 'earrings', 'headband', 'earbuds']
/* پوشش سر — semi = شال نیمه‌سر (عقب‌رفته)، neck = روسری گردن (سر باز؛ 19-b) */
const HIJAB = ['none', 'scarf', 'shawl', 'maghnaeh', 'semi', 'neck']
const BEARD = ['none', 'stubble', 'full', 'mustache']
const GLASSES = ['none', 'round', 'square', 'sun']
function validStyle(s: Record<string, unknown>): boolean {
  const idx = (v: unknown, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max
  const emojiOk = typeof s.emoji === 'number' && Number.isFinite(s.emoji) && s.emoji >= -1 && s.emoji <= 7
  return (
    idx(s.skin, 7) &&
    (typeof s.hair === 'string' && HAIR.includes(s.hair)) &&
    idx(s.hairColor, 9) &&
    idx(s.eyes, 4) &&
    idx(s.mouth, 5) &&
    idx(s.outfit, 7) &&
    idx(s.outfitColor, 11) &&
    (typeof s.accessory === 'string' && ACCESSORY.includes(s.accessory)) &&
    idx(s.bg, 9) &&
    (typeof s.hijab === 'string' && HIJAB.includes(s.hijab)) &&
    idx(s.hijabColor, 7) &&
    (typeof s.beard === 'string' && BEARD.includes(s.beard)) &&
    idx(s.brows, 2) &&
    typeof s.blush === 'boolean' &&
    typeof s.freckles === 'boolean' &&
    (typeof s.glasses === 'string' && GLASSES.includes(s.glasses)) &&
    emojiOk
  )
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const user = await db.user.findUnique({ where: { id: me.id }, select: { avatarUrl: true, avatarStyle: true } })
  return json({ avatarUrl: user?.avatarUrl || '', avatarStyle: user?.avatarStyle || '' })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('دادهٔ ارسالی نامعتبر است')

  const data: { avatarUrl?: string; avatarStyle?: string } = {}

  if (body.clear === 'photo') data.avatarUrl = ''
  if (body.clear === 'style') data.avatarStyle = ''

  if (body.avatarUrl !== undefined) {
    const url = String(body.avatarUrl || '')
    if (url === '') data.avatarUrl = ''
    else {
      if (!URL_RE.test(url)) return fail('تصویر باید dataURL معتبر یا آدرس اینترنتی باشد')
      if (url.length > MAX_DATAURL) return fail('حجم تصویر بیش از حد مجاز است — پس از فشرده‌سازی حداکثر ۳۰۰ کیلوبایت', 413)
      data.avatarUrl = url
    }
  }

  if (body.avatarStyle !== undefined) {
    if (body.avatarStyle === '' || body.avatarStyle === null) data.avatarStyle = ''
    else {
      let style: Record<string, unknown> | null = null
      if (typeof body.avatarStyle === 'string') style = safeParse<Record<string, unknown>>(body.avatarStyle, null as unknown as Record<string, unknown>)
      else if (typeof body.avatarStyle === 'object') style = body.avatarStyle as Record<string, unknown>
      if (!style || !validStyle(style))
        return fail('پیکربندی آواتار کارتونی نامعتبر است')
      data.avatarStyle = JSON.stringify(style)
    }
  }

  if (Object.keys(data).length === 0) return fail('تغییری برای ذخیره یافت نشد')

  await db.user.update({ where: { id: me.id }, data })
  await logActivity(me, data.avatarStyle !== undefined ? 'به‌روزرسانی آواتار کارتونی' : 'به‌روزرسانی تصویر پروفایل', 'user', me.id, me.name)
  const user = await db.user.findUnique({ where: { id: me.id }, select: { avatarUrl: true, avatarStyle: true } })
  return json({ avatarUrl: user?.avatarUrl || '', avatarStyle: user?.avatarStyle || '' })
}
