import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canSystem, canSettingsWrite } from '@/lib/access'

export const dynamic = 'force-dynamic'

/** Store settings defaults (captured live values from admin-settings.json) */
const STORE_SETTING_DEFAULTS: Record<string, string> = {
  'store.name': 'هایپر زیتون',
  'store.city': 'رفسنجان، کرمان',
  'store.manager': 'جواد نوروزی بهجت',
  'store.developer': 'کیانوش صفاپور',
  'app.version': '1.0.0',
  'app.name': 'سر رسید',
  'store.phone': '034-34321000',
  'receipt.footer': 'هایپر زیتون — سپاس از خرید شما\nتماس: 034-34321000',
}

/** GET /api/admin/settings → {settings:{...}} */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canSystem(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const rows = await db.setting.findMany()
  const settings: Record<string, string> = { ...STORE_SETTING_DEFAULTS }
  for (const row of rows) {
    if (!(row.key in STORE_SETTING_DEFAULTS)) continue // only store/app keys — other agents' keys stay private
    const parsed = safeJson<unknown>(row.value, null)
    if (typeof parsed === 'string') settings[row.key] = parsed
    else if (parsed !== null) settings[row.key] = row.value
  }
  return ok({ settings })
}

/** PUT /api/admin/settings {key:value,...} → upsert store settings (OWNER/ADMIN) */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canSettingsWrite(user.role)) return fail('فقط مدیر عامل یا مدیر عملیات می‌تواند تنظیمات را ذخیره کند', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const keys = Object.keys(body).filter((k) => k !== 'payroll_statutory' && typeof (body as Record<string, unknown>)[k] === 'string')
  if (keys.length === 0) return fail('تغییری برای ذخیره وجود ندارد')

  for (const key of keys) {
    const value = String((body as Record<string, unknown>)[key])
    await db.setting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    })
  }

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'settings.update',
    actionLabel: 'تنظیمات',
    category: 'settings',
    detail: keys.join('، '),
  })

  const rows = await db.setting.findMany()
  const settings: Record<string, string> = { ...STORE_SETTING_DEFAULTS }
  for (const row of rows) {
    if (!(row.key in STORE_SETTING_DEFAULTS)) continue
    const parsed = safeJson<unknown>(row.value, null)
    if (typeof parsed === 'string') settings[row.key] = parsed
  }
  return ok({ settings })
}
