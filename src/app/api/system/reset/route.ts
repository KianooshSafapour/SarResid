import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['OWNER', 'ADMIN']

/**
 * POST /api/system/reset — بازنشانی وضعیت سامانه برای تست‌های پیش از بهره‌برداری.
 * مدیر (OWNER/ADMIN) قبل از شروع کار واقعی تیم، وضعیت‌های آزمایشی را پاک می‌کند.
 *
 * body: { confirm: 'بازنشانی', scopes: string[] }
 *   scopes ⊆ ['tours', 'notifications', 'activity', 'drafts', 'testData', 'points']
 *     tours         → tourDone=false همهٔ کاربران + حذف KV تورهای دیده‌شده (localStorage سمت کلاینت است؛
 *                     راهنمای کاربر در پاسخ می‌آید)
 *     notifications → حذف همهٔ اعلان‌ها
 *     activity      → حذف ActivityLog
 *     drafts        → حذف پیش‌نویس‌های محلی سمت سرور (KV های hz-draft*)
 *     testData      → حذف داده‌های تراکنشی آزمایشی: سفارش‌ها، مرجوعی‌ها، فاکتورهای سودسنج،
 *                     مشکلات، وظایف مدیر، چک‌های آزمایشی، شمارش‌ها، پیام‌ها، برنامه‌های پرداخت
 *                     (کالا، تأمین‌کننده، کاربر، پرسنل، نقشه، آرشیو، پیکربندی — دست‌نخورده)
 *     points        → صفر کردن امتیاز کاربران
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!ADMIN_ROLES.includes(user.role)) return fail('فقط مالک یا مدیر سامانه می‌تواند بازنشانی کند', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')
  if (String(body.confirm ?? '') !== 'بازنشانی') return fail('برای تأیید، عبارت «بازنشانی» را دقیق وارد کنید')

  const valid = ['tours', 'notifications', 'activity', 'drafts', 'testData', 'points']
  const scopes = Array.isArray(body.scopes) ? body.scopes.filter((s: unknown) => valid.includes(String(s))).map(String) : []
  if (scopes.length === 0) return fail('حداقل یک محدودهٔ بازنشانی را انتخاب کنید')

  const done: Record<string, number> = {}

  if (scopes.includes('tours')) {
    const r = await db.user.updateMany({ data: { tourDone: false } })
    done['تورهای راهنما'] = r.count
    const kv = await db.setting.deleteMany({ where: { key: { startsWith: 'tour:' } } })
    done['کلیدهای تور'] = kv.count
  }

  if (scopes.includes('notifications')) {
    const r = await db.notification.deleteMany({})
    done['اعلان‌ها'] = r.count
  }

  if (scopes.includes('activity')) {
    const r = await db.activityLog.deleteMany({})
    done['رویدادها'] = r.count
  }

  if (scopes.includes('drafts')) {
    const r = await db.setting.deleteMany({ where: { key: { startsWith: 'hz-draft' } } })
    done['پیش‌نویس‌ها'] = r.count
  }

  if (scopes.includes('testData')) {
    // ترتیب: فرزندان وابسته اول
    const pairs: [string, () => Promise<number>][] = [
      ['اقلام شمارش', () => db.stockCountItem.deleteMany({})],
      ['شمارش‌ها', () => db.stockCount.deleteMany({})],
      ['اقلام سفارش', () => db.orderItem.deleteMany({})],
      ['برنامه‌های پرداخت', () => db.paymentPlan.deleteMany({})],
      ['پرداخت‌ها', () => db.payment.deleteMany({})],
      ['چک‌ها', () => db.cheque.deleteMany({})],
      ['اقلام مرجوعی', () => db.returnItem.deleteMany({})],
      ['پرداخت مرجوعی', () => db.returnPayment.deleteMany({})],
      ['درخواست‌های مرجوعی', () => db.returnRequest.deleteMany({})],
      ['اقلام فاکتور سودسنج', () => db.marginItem.deleteMany({})],
      ['فاکتورهای سودسنج', () => db.marginInvoice.deleteMany({})],
      ['مشکلات', () => db.problem.deleteMany({})],
      ['دستور کارها', () => db.taskOrder.deleteMany({})],
      ['پیام‌ها', () => db.message.deleteMany({})],
      ['گزارش‌های تحویل', () => db.shiftReport.deleteMany({})],
      ['کنترل‌های شیفت', () => db.staffCheck.deleteMany({})],
      ['ارزیابی چیدمان', () => db.sectionReview.deleteMany({})],
      ['سفارش‌ها', () => db.order.deleteMany({})],
    ]
    for (const [label, fn] of pairs) {
      try {
        const r = await fn()
        done[label] = r.count
      } catch {
        // جدول شاید در این نسخه باشد/نباشد — نادیده بگیر
      }
    }
  }

  if (scopes.includes('points')) {
    const r = await db.user.updateMany({ data: { points: 0 } })
    done['امتیاز کاربران'] = r.count
  }

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'system.reset',
    actionLabel: 'بازنشانی سامانه',
    category: 'system',
    detail: scopes.join(' + '),
  })

  return ok({
    done,
    note: 'برای پاک‌کردن تور روی هر مرورگر/تبلت، دکمهٔ «شروع دوبارهٔ تور» در منوی کاربر هم هست — بازنشانی سرور tourDone همه را برمی‌گرداند.',
  })
}
