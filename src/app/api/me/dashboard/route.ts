import { db } from '@/lib/db'
import { fail, getSessionUser, json } from '@/lib/api-helpers'
import { readDashPrefs, writeDashPrefs, DASH_PREFS_CAP, type DashPrefs } from '@/lib/dashboard-widgets'

/**
 * شخصی‌سازی داشبورد — ترجیحات ویجت‌ها برای کاربر جاری (Task 19-d)
 * ذخیره در User.uiPrefs (JSON) زیر کلید «dash» — بقیهٔ کلیدهای uiPrefs حفظ می‌شوند.
 *
 * GET  → { dash: { hidden, order } }  (مهمان: پیش‌فرض خالی = همه در ترتیب ثبت)
 * PUT  { hidden: string[], order: string[] }
 *      → اعتبارسنجی بر پایهٔ ثبت ویجت‌ها (شناسهٔ ناشناس نادیده، تکرار حذف، سقف ۵۰)
 *      → ادغام در uiPrefs و ذخیره → { dash: مقدار پاک‌سازی‌شده }
 */

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) {
    // مهمان / بدون نشست — کلاینت همین مقدار را به‌عنوان پیش‌فرض نشان می‌دهد
    return json({ dash: { hidden: [], order: [] }, guest: true })
  }
  const user = await db.user.findUnique({ where: { id: me.id }, select: { uiPrefs: true } })
  return json({ dash: readDashPrefs(user?.uiPrefs) })
}

export async function PUT(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('دادهٔ ارسالی نامعتبر است')
  const raw = body as Record<string, unknown>

  if (raw.hidden !== undefined && !Array.isArray(raw.hidden)) return fail('«hidden» باید آرایهٔ شناسه باشد')
  if (raw.order !== undefined && !Array.isArray(raw.order)) return fail('«order» باید آرایهٔ شناسه باشد')
  const hiddenLen = Array.isArray(raw.hidden) ? raw.hidden.length : 0
  const orderLen = Array.isArray(raw.order) ? raw.order.length : 0
  if (hiddenLen > DASH_PREFS_CAP || orderLen > DASH_PREFS_CAP)
    return fail(`هر فهرست حداکثر ${DASH_PREFS_CAP} قلم می‌تواند باشد`)

  const asStrArr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : [])
  const prefs: DashPrefs = {
    hidden: asStrArr(raw.hidden),
    order: asStrArr(raw.order),
  }

  const user = await db.user.findUnique({ where: { id: me.id }, select: { uiPrefs: true } })
  // writeDashPrefs فقط شناسه‌های معتبرِ ثبت را نگه می‌دارد و بقیهٔ کلیدهای uiPrefs را دست نمی‌زند
  const merged = writeDashPrefs(user?.uiPrefs, prefs)
  await db.user.update({ where: { id: me.id }, data: { uiPrefs: merged } })

  return json({ dash: readDashPrefs(merged) })
}
