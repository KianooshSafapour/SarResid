import { NextRequest } from 'next/server'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import {
  getHolooConfig,
  setHolooSetting,
  HOLOO_SETTING_KEYS,
  holooLogout,
  isHolooConfigured,
} from '@/lib/holoo'

export const dynamic = 'force-dynamic'

function mask(pass: string): string {
  if (!pass) return ''
  if (pass.length <= 4) return '****'
  return `${pass.slice(0, 4)}****`
}

async function payload() {
  const cfg = await getHolooConfig()
  return {
    configured: isHolooConfigured(cfg),
    baseUrl: cfg.baseUrl,
    mockUrl: cfg.mockUrl,
    useMock: cfg.useMock,
    username: cfg.username,
    userpass: mask(cfg.userpass), // رمز هرگز به صورت خام برگردانده نمی‌شود
    hasUserpass: !!cfg.userpass,
    dbname: cfg.dbname,
    enabled: cfg.enabled,
  }
}

/** GET /api/holoo/settings — تنظیمات اتصال هلو با رمز ماسک‌شده (OWNER/GM/ADMIN) */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN'].includes(user.role)) {
    return fail('دسترسی به تنظیمات هلو فقط برای مدیران ارشد مجاز است', 403)
  }
  return ok(await payload())
}

/** PUT /api/holoo/settings {baseUrl?, mockUrl?, useMock?, username?, userpass?, dbname?, enabled?} */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN'].includes(user.role)) {
    return fail('تغییر تنظیمات هلو فقط برای مدیران ارشد مجاز است', 403)
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')
  const b = body as Record<string, unknown>

  const changed: string[] = []

  const setUrl = async (key: string, label: string, v: unknown) => {
    if (v === undefined) return
    const s = String(v ?? '').trim()
    if (s && !/^https?:\/\/.+/i.test(s)) return fail(`آدرس ${label} باید با http:// یا https:// شروع شود`)
    await setHolooSetting(key, s)
    changed.push(label)
  }

  await setUrl(HOLOO_SETTING_KEYS.baseUrl, 'آدرس وب‌سرویس هلو', b.baseUrl)
  await setUrl(HOLOO_SETTING_KEYS.mockUrl, 'آدرس شبیه‌ساز هلو', b.mockUrl)

  if (b.useMock !== undefined) {
    const v = b.useMock === true || b.useMock === 'true' || b.useMock === '1'
    await setHolooSetting(HOLOO_SETTING_KEYS.useMock, v ? 'true' : 'false')
    changed.push('حالت شبیه‌ساز')
  }

  if (b.username !== undefined) {
    const s = String(b.username ?? '').trim()
    if (s && /\s/.test(s)) return fail('نام کاربری هلو نباید فاصله داشته باشد')
    await setHolooSetting(HOLOO_SETTING_KEYS.username, s)
    changed.push('نام کاربری')
  }

  if (b.userpass !== undefined && b.userpass !== null && b.userpass !== '') {
    // خام یا Base64 — هنگام لاگین به Base64 تبدیل می‌شود
    await setHolooSetting(HOLOO_SETTING_KEYS.userpass, String(b.userpass).trim())
    changed.push('رمز عبور')
  }

  if (b.dbname !== undefined) {
    await setHolooSetting(HOLOO_SETTING_KEYS.dbname, String(b.dbname ?? '').trim())
    changed.push('نام بانک اطلاعاتی')
  }

  if (b.enabled !== undefined) {
    const v = b.enabled === true || b.enabled === 'true' || b.enabled === '1'
    await setHolooSetting(HOLOO_SETTING_KEYS.enabled, v ? 'true' : 'false')
    changed.push(v ? 'فعال‌سازی اتصال' : 'غیرفعال‌سازی اتصال')
  }

  if (!changed.length) return fail('تغییری برای ذخیره وجود ندارد')

  // توکن کش‌شده قدیمی معتبر نیست
  holooLogout(await getHolooConfig())

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'holoo.settings',
    actionLabel: 'تنظیمات اتصال هلو',
    category: 'settings',
    detail: `به‌روزرسانی: ${changed.join('، ')}`,
  })

  return ok(await payload())
}
