import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { runDueAlerts } from '../_due'

export const dynamic = 'force-dynamic'

/**
 * GET /api/problems/alerts — ارزیابی تنبل هشدارهای مهلت رسیدگی (بدون کرون).
 *
 * هر بار کاربری فهرست مشکلات را باز می‌کند، این مسیر مشکلات حل‌نشدهٔ دارای
 * مهلت را بررسی می‌کند و برای سه فاز — یک روز مانده، روز مهلت و گذشته از
 * مهلت — یک‌باره (idempotent) به مسئول پیگیری اطلاع‌رسانی می‌کند:
 *  - ردیف Notification (زنگ اعلان) از طریق notify()
 *  - پیامک از طریق پنل پیش‌فرض مرکز پیامک (فقط اگر کلید problem:smsalert:{id}
 *    فعال باشد و مسئول شمارهٔ موبایل معتبر داشته باشد — در غیر این صورت
 *    بی‌صدا رد می‌شود)
 *
 * کلیدهای نشانه (Setting KV) از ایجاد دوباره جلوگیری می‌کنند:
 *  problem:alert:{problemId}:{phase}
 *
 * منطق اصلی در «../_due.ts» است و «GET /api/problems» هم همین ارزیابی را
 * اجرا می‌کند تا با باز شدن صفحه توسط هر کاربری هشدارها شلیک شوند.
 */
export async function GET(_req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  return ok(await runDueAlerts())
}
