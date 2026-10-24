import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const MANAGER_ROLES = ['OWNER', 'GM', 'ADMIN']

/** GET /api/settings/brand → {logoUrl, storeName, storePhone, storeAddress} — همهٔ کاربران
 *  لوگوی فروشگاه در اسناد چاپی و رسیدها استفاده می‌شود. */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const keys = ['brand.logoUrl', 'brand.storeName', 'brand.storePhone', 'brand.storeAddress', 'brand.footerNote']
  const rows = await db.setting.findMany({ where: { key: { in: keys } } })
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value
  return ok({
    logoUrl: map['brand.logoUrl'] || '',
    storeName: map['brand.storeName'] || 'هایپر زیتون',
    storePhone: map['brand.storePhone'] || '',
    storeAddress: map['brand.storeAddress'] || '',
    footerNote: map['brand.footerNote'] || '',
  })
}

/** PUT /api/settings/brand — بارگذاری/به‌روزرسانی هویت چاپی (لوگو و مشخصات) — مدیران
 *  body: {logoUrl?: string(data-url ≤ 300KB), storeName?, storePhone?, storeAddress?, footerNote?} */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!MANAGER_ROLES.includes(user.role)) return fail('فقط مدیران می‌توانند هویت چاپی را تغییر دهند', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const upserts: { key: string; value: string }[] = []
  const fields: [string, unknown, number][] = [
    ['brand.storeName', body.storeName, 60],
    ['brand.storePhone', body.storePhone, 30],
    ['brand.storeAddress', body.storeAddress, 160],
    ['brand.footerNote', body.footerNote, 200],
  ]
  for (const [key, v, max] of fields) {
    if (v === undefined) continue
    const s = String(v ?? '').trim().slice(0, max)
    if (s) upserts.push({ key, value: s })
    else await db.setting.deleteMany({ where: { key } })
  }

  if (body.logoUrl !== undefined) {
    const logo = String(body.logoUrl ?? '')
    if (logo === '') {
      await db.setting.deleteMany({ where: { key: 'brand.logoUrl' } })
    } else {
      // فقط data-URL تصویر؛ حداکثر ۳۰۰KB (base64)
      if (!/^data:image\/(png|jpe?g|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(logo)) {
        return fail('فایل لوگو باید تصویر PNG/JPG/WebP/SVG باشد')
      }
      if (logo.length > 300 * 1024 * 1.4) {
        return fail('حجم لوگو بیش از حد مجاز است (حداکثر ~۳۰۰ کیلوبایت) — تصویر کوچک‌تری انتخاب کنید')
      }
      upserts.push({ key: 'brand.logoUrl', value: logo })
    }
  }

  for (const u of upserts) {
    await db.setting.upsert({ where: { key: u.key }, update: { value: u.value }, create: { key: u.key, value: u.value } })
  }
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'brand.update',
    actionLabel: 'هویت چاپی فروشگاه',
    category: 'system',
    detail: upserts.map((u) => u.key).join(' · ') || 'حذف لوگو',
  })
  return ok({ updated: upserts.length })
}
