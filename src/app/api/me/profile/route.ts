import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { toEnDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/me/profile { fullName?, honorific?, phone?, title?, avatarJson?,
 *                          mobile?, address?, postalCode? }
 * — ویرایش نمایهٔ شخصی (حساب من)
 * اعتبارسنجی‌های ملی: موبایل ۰۹xxxxxxxxx (۱۱ رقم) · کد پستی ۱۰ رقمی ایران
 */

/** نرمال‌سازی شمارهٔ موبایل ایران → 09xxxxxxxxx یا null */
function normalizeMobile(raw: unknown): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null
  let d = toEnDigits(String(raw)).replace(/\D/g, '')
  if (d.startsWith('98') && d.length === 12) d = '0' + d.slice(2) // +98 → 0
  if (d.startsWith('0098')) d = '0' + d.slice(4)
  return d || null
}

/** اعتبارسنجی کد پستی ایران: ۱۰ رقم، بدون تکرار کامل، بدون ۰۰۰۰۰۰۰۰۰۰، رقم اول ≠ ۰ */
function isValidPostalCode(d: string): boolean {
  if (!/^\d{10}$/.test(d)) return false
  if (d.startsWith('0')) return false // رقم اول کد پستی معتبر ۱–۹ است
  if (/^(\d)\1{9}$/.test(d)) return false // هر ده رقم یکسان (مثل ۱۱۱۱۱۱۱۱۱۱) نامعتبر
  return true
}
export async function PATCH(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const data: Record<string, unknown> = {}
  const changes: string[] = []

  if (body.fullName !== undefined) {
    const fullName = String(body.fullName ?? '').trim()
    if (fullName.length < 2) return fail('نام کامل را وارد کنید')
    if (fullName !== me.fullName) {
      data.fullName = fullName
      changes.push('نام')
    }
  }
  if (body.honorific !== undefined && String(body.honorific ?? '') !== me.honorific) {
    data.honorific = String(body.honorific ?? '')
    changes.push('عنوان احترامی')
  }
  if (body.title !== undefined && String(body.title ?? '') !== me.title) {
    data.title = String(body.title ?? '')
    changes.push('عنوان شغلی')
  }
  if (body.phone !== undefined) {
    const phone = typeof body.phone === 'string' && toEnDigits(body.phone).replace(/\D/g, '') || null
    const clean = phone || null
    if (clean !== me.phone) {
      data.phone = clean
      changes.push('شماره تماس')
    }
  }
  if (body.mobile !== undefined) {
    const m = normalizeMobile(body.mobile)
    if (m) {
      if (!/^09\d{9}$/.test(m)) {
        return fail('شمارهٔ موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد (مثلاً ۰۹۱۲۳۴۵۶۷۸۹)')
      }
      if (m !== me.mobile) {
        data.mobile = m
        changes.push('موبایل پیامک')
      }
    } else if (me.mobile) {
      data.mobile = null
      changes.push('موبایل پیامک')
    }
  }
  if (body.address !== undefined) {
    const address = String(body.address ?? '').trim()
    if (address.length > 250) return fail('نشانی حداکثر ۲۵۰ نویسه است')
    if (address !== (me.address || '')) {
      data.address = address || null
      changes.push('نشانی')
    }
  }
  if (body.postalCode !== undefined) {
    const d = String(body.postalCode ?? '').trim() ? toEnDigits(String(body.postalCode)).replace(/\D/g, '') : ''
    if (d) {
      if (!isValidPostalCode(d)) {
        return fail('کد پستی باید ۱۰ رقم باشد، با رقم غیر صفر شروع شود و رقم‌های تکراری کامل نامعتبر است')
      }
      if (d !== me.postalCode) {
        data.postalCode = d
        changes.push('کد پستی')
      }
    } else if (me.postalCode) {
      data.postalCode = null
      changes.push('کد پستی')
    }
  }
  if (body.avatarJson !== undefined) {
    const avatarJson = String(body.avatarJson ?? '').trim()
    if (avatarJson && avatarJson !== me.avatarJson) {
      try {
        JSON.parse(avatarJson)
      } catch {
        return fail('قالب تصویر نمایه معتبر نیست')
      }
    }
    data.avatarJson = avatarJson || null
    changes.push('تصویر نمایه')
  }

  if (changes.length === 0) return fail('تغییری برای ذخیره وجود ندارد')

  const updated = await db.user.update({ where: { id: me.id }, data })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'me.profile',
    actionLabel: 'ویرایش نمایه',
    category: 'auth',
    detail: changes.join('، '),
  })

  return ok({
    user: {
      id: updated.id,
      fullName: updated.fullName,
      honorific: updated.honorific,
      title: updated.title,
      phone: updated.phone,
      mobile: updated.mobile,
      address: updated.address,
      postalCode: updated.postalCode,
      avatarJson: updated.avatarJson,
    },
    updated: changes,
  })
}
