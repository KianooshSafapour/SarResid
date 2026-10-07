/**
 * Order lifecycle helpers — round-19e (تأیید نهایی مدیر + پنجرهٔ اصلاح ۴۸ ساعته)
 *
 * منطق علمی پنجرهٔ اصلاح (adjustment cut-off):
 *   مطابق اصل «دورهٔ مالی» در IFRS و کنترل‌های SOX، اسناد پس از «بستن/تأیید» تنها تا
 *   پایان یک بازهٔ مهلت‌دار قابل اصلاح‌اند؛ پس از آن اصلاح از مسیر اصلاحیهٔ حسابداری
 *   دورهٔ بعد انجام می‌شود (ERP order-lock window).
 *
 *   - سفارش‌های پیش از تأیید انبار (SUBMITTED/APPROVED/RECEIVING/RECEIVED):
 *     سند هنوز «بسته» نشده → اصلاح آزاد (با ثبت کامل تاریخچه).
 *   - سفارش‌های VERIFIED (و ACCOUNTED در انتظار تایید مدیر):
 *     مبدأ پنجره = زمان تأیید انبار (checkedAt اگر ثبت شده باشد، وگرنه آخرین
 *     رویداد «تأیید انبار» در تاریخچه، وگرنه updatedAt) → تا ۴۸ ساعت قابل اصلاح.
 *   - DONE/CANCELLED: هرگز قابل اصلاح نیستند.
 *
 * فایل کمکی داخل پوشهٔ api/orders است (route نیست — Next فقط route.ts را روت می‌کند).
 */
import { safeParse } from '@/lib/api-helpers'

/** پنجرهٔ اصلاح ۴۸ ساعته — منطبق با اصل دورهٔ مالی و کنترل‌های SOX */
export const CORRECTION_WINDOW_H = 48

/** وضعیت‌های قابل اصلاح توسط مدیر — تا لحظهٔ تأیید انبار */
export const CORRECTABLE_STATUSES = ['SUBMITTED', 'APPROVED', 'RECEIVING', 'RECEIVED', 'VERIFIED']

/** وضعیت‌های «در انتظار تایید مدیر» — گیت نهایی: فقط تأیید صریح مدیر سفارش را DONE می‌کند */
export const PENDING_APPROVAL_STATUSES = ['VERIFIED', 'ACCOUNTED']

export type OrderCore = {
  status: string
  history: string
  checkedAt?: string
  updatedAt?: string | Date
  createdAt?: string | Date
}

export type CorrectionState = {
  windowHours: number
  /** مبدأ پنجره (زمان تأیید انبار) — برای سفارش‌های باز null */
  anchorAt: string | null
  /** پایان پنجره — برای سفارش‌های باز null */
  openUntil: string | null
  /** دقیقهٔ باقی‌مانده (وقتی anchor وجود دارد) */
  remainingMinutes: number | null
  /** آیا اصلاح در همین لحظه مجاز است؟ (سمت سرور هم گارد می‌شود) */
  editable: boolean
  /** پنجره آغاز شده ولی بسته شده؟ */
  expired: boolean
}

export function isPendingApproval(status: string): boolean {
  return PENDING_APPROVAL_STATUSES.includes(status)
}

/** تاریخچهٔ parsed */
export function parseHistory(historyJson: string): any[] {
  return safeParse<any[]>(historyJson || '[]', [])
}

/**
 * مبدأ پنجرهٔ اصلاح = زمان «تأیید انبار»:
 * checkedAt (ثبت هنگام تصویب حسابداری) → آخرین رویداد «تأیید انبار» در تاریخچه → updatedAt
 */
export function verificationAnchorIso(order: OrderCore, history: any[]): string {
  if (order.checkedAt) return String(order.checkedAt)
  const verifyEv = [...history].reverse().find((h) => String(h?.action || '').includes('تأیید انبار'))
  if (verifyEv?.at) return String(verifyEv.at)
  const upd = order.updatedAt || order.createdAt
  return upd ? new Date(upd as any).toISOString() : new Date().toISOString()
}

/** وضعیت پنجرهٔ اصلاح برای یک سفارش */
export function correctionState(order: OrderCore): CorrectionState {
  const history = parseHistory(order.history)
  const preClose = ['SUBMITTED', 'APPROVED', 'RECEIVING', 'RECEIVED'].includes(order.status)
  if (preClose) {
    // سند هنوز بسته نشده — اصلاح آزاد تا قبل از تأیید انبار
    return { windowHours: CORRECTION_WINDOW_H, anchorAt: null, openUntil: null, remainingMinutes: null, editable: true, expired: false }
  }
  if (!CORRECTABLE_STATUSES.includes(order.status)) {
    // VERIFIED هم اینجا می‌آید اگر پنجره‌اش بسته باشد؛ ACCOUNTED/DONE/CANCELLED اصلاً قابل اصلاح نیستند
    const anchor = order.status === 'VERIFIED' ? verificationAnchorIso(order, history) : null
    const openUntil = anchor ? new Date(new Date(anchor).getTime() + CORRECTION_WINDOW_H * 3600_000).toISOString() : null
    const remainingMinutes = openUntil ? Math.round((new Date(openUntil).getTime() - Date.now()) / 60_000) : null
    if (order.status === 'VERIFIED' && remainingMinutes !== null && remainingMinutes > 0) {
      return { windowHours: CORRECTION_WINDOW_H, anchorAt: anchor, openUntil, remainingMinutes, editable: true, expired: false }
    }
    return { windowHours: CORRECTION_WINDOW_H, anchorAt: anchor, openUntil, remainingMinutes, editable: false, expired: order.status === 'VERIFIED' }
  }
  // VERIFIED با پنجرهٔ باز (این شاخه با شرط بالا عملاً پوشش داده شده ولی برای وضوح نگه داشته شد)
  const anchor = verificationAnchorIso(order, history)
  const openUntil = new Date(new Date(anchor).getTime() + CORRECTION_WINDOW_H * 3600_000).toISOString()
  const remainingMinutes = Math.round((new Date(openUntil).getTime() - Date.now()) / 60_000)
  return { windowHours: CORRECTION_WINDOW_H, anchorAt: anchor, openUntil, remainingMinutes, editable: remainingMinutes > 0, expired: remainingMinutes <= 0 }
}

/** برچسب فارسی برای actionهای ماشینی تاریخچه (سایر actionها فارسی ذخیره شده‌اند) */
export const HISTORY_ACTION_LABELS: Record<string, string> = {
  'final-approval': 'تایید نهایی مدیر — ثبت نهایی سفارش',
  'correction': 'اصلاح سفارش',
}
