import { db } from '@/lib/db'
import { fail, getSessionUser, json, safeParse } from '@/lib/api-helpers'

/**
 * شخصی‌سازی ظاهر سامانه — ذخیرهٔ تنظیمات هر کاربر در User.uiPrefs (JSON).
 * GET → { uiPrefs } برای کاربر جاری
 * PUT { uiPrefs: {…patch} } → ادغام سطحی با مقدار فعلی + اعتبارسنجی کلیدها → ذخیره
 *
 * کلیدهای مجاز:
 *  fontScale    number ۰٫۸۵..۱٫۴  — مقیاس کلی قلم سامانه (root font-size)
 *  calFont      'sm'|'base'|'lg'|'xl' — اندازهٔ اعداد تقویم (CSS var --cal-font)
 *  density      'compact'|'cozy' — تراکم نمایش کارت‌ها
 *  calSystem    'jalali'|'gregorian'|'hijri' — تقویم پیش‌فرض ویجت‌ها
 *  showHijri    boolean — نمایش عدد قمری کوچک در خانه‌های تقویم
 *  showGregorian boolean — نمایش عدد میلادی کوچک در خانه‌های تقویم
 *  theme        'light'|'dark'|'system'
 */

const CAL_FONTS = ['sm', 'base', 'lg', 'xl']
const DENSITIES = ['compact', 'cozy']
const CAL_SYSTEMS = ['jalali', 'gregorian', 'hijri']
const THEMES = ['light', 'dark', 'system']

const VALIDATORS: Record<string, (v: unknown) => boolean> = {
  fontScale: (v) => typeof v === 'number' && isFinite(v) && v >= 0.85 && v <= 1.4,
  calFont: (v) => CAL_FONTS.includes(String(v)),
  density: (v) => DENSITIES.includes(String(v)),
  calSystem: (v) => CAL_SYSTEMS.includes(String(v)),
  showHijri: (v) => typeof v === 'boolean',
  showGregorian: (v) => typeof v === 'boolean',
  theme: (v) => THEMES.includes(String(v)),
}

const KEY_LABELS: Record<string, string> = {
  fontScale: 'مقیاس قلم (۰٫۸۵ تا ۱٫۴)',
  calFont: 'اندازهٔ قلم تقویم (sm/base/lg/xl)',
  density: 'تراکم نمایش (compact/cozy)',
  calSystem: 'تقویم پیش‌فرض (jalali/gregorian/hijri)',
  showHijri: 'نمایش قمری (true/false)',
  showGregorian: 'نمایش میلادی (true/false)',
  theme: 'تم (light/dark/system)',
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const user = await db.user.findUnique({ where: { id: me.id }, select: { uiPrefs: true } })
  return json({ uiPrefs: safeParse<Record<string, unknown>>(user?.uiPrefs || '{}', {}) })
}

export async function PUT(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json().catch(() => null)
  const patchRaw = (body && typeof body === 'object' && 'uiPrefs' in body ? body.uiPrefs : body) as unknown
  if (!patchRaw || typeof patchRaw !== 'object' || Array.isArray(patchRaw))
    return fail('دادهٔ ارسالی نامعتبر است')

  const user = await db.user.findUnique({ where: { id: me.id }, select: { uiPrefs: true } })
  const merged: Record<string, unknown> = safeParse(user?.uiPrefs || '{}', {})

  let touched = 0
  for (const [key, value] of Object.entries(patchRaw as Record<string, unknown>)) {
    const check = VALIDATORS[key]
    if (!check) continue // کلید ناشناس نادیده گرفته می‌شود
    if (!check(value)) return fail(`مقدار نامعتبر برای «${KEY_LABELS[key] || key}»`)
    // مقیاس قلم به محدودهٔ امن گیره می‌شود (خوانایی + نشکستن چیدمان)
    merged[key] = key === 'fontScale' ? Math.min(1.4, Math.max(0.85, value as number)) : value
    touched++
  }
  if (touched === 0) return fail('تغییری برای ذخیره یافت نشد (کلیدهای نامعتبر)')

  await db.user.update({ where: { id: me.id }, data: { uiPrefs: JSON.stringify(merged) } })
  return json({ uiPrefs: merged })
}
