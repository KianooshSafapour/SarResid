import { toFaDigits, todayJalali } from '@/lib/jalali'

/** علت‌های مرجوعی — دقیقاً مثل REASON_PRESETS در چانکِ منجمدِ «در انتظار تایید و پرداخت» */
export const REASON_PRESETS: string[] = [
  'کالای معیوب',
  'اشتباه در خرید',
  'اختلاف قیمت',
  'انقضای کالا',
  'عدم رضایت از کیفیت',
  'خطای کارت‌خوان',
  'سایر',
]

/** علتِ «*» = پیش‌فرض کلی (وقتی علت دقیق الگو ندارد یا غیرفعال است) */
export const WILDCARD_REASON = '*'

/** جای‌نگرده‌های مجاز در متن الگو */
export const RETURN_MSG_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: '{مشتری}', label: 'نام مشتری' },
  { key: '{مبلغ}', label: 'مبلغ پرداختی (ریال)' },
  { key: '{کد}', label: 'کد پیگیری مرجوعی' },
  { key: '{تاریخ}', label: 'تاریخ امروز (شمسی)' },
  { key: '{علت}', label: 'علت مرجوعی' },
  { key: '{بانک}', label: 'بانک انتخابی' },
  { key: '{شماره‌پیگیری}', label: 'شماره پیگیری / مرجع' },
]

export interface RenderCtx {
  customer?: string | null
  amount?: number | string | null
  code?: string | null
  date?: string | null
  reason?: string | null
  bank?: string | null
  ref?: string | null
}

function faAmount(v: unknown): string {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return '۰'
  return toFaDigits(Math.round(n).toLocaleString('en-US')).replace(/,/g, '٬')
}

function or(v: string | null | undefined, fallback = '—'): string {
  const s = String(v ?? '').trim()
  return s || fallback
}

/**
 * جای‌گذاری متن الگو با مقادیر فارسی‌شده.
 * {مشتری} {مبلغ} {کد} {تاریخ} {علت} {بانک} {شماره‌پیگیری}
 */
export function renderReturnMsg(body: string, ctx: RenderCtx): string {
  const date = or(ctx.date, toFaDigits(todayJalali()))
  return String(body ?? '')
    .replace(/\{مشتری\}/g, or(ctx.customer, 'مشتری'))
    .replace(/\{مبلغ\}/g, faAmount(ctx.amount))
    .replace(/\{کد\}/g, or(ctx.code))
    .replace(/\{تاریخ\}/g, date)
    .replace(/\{علت\}/g, or(ctx.reason, 'سایر'))
    .replace(/\{بانک\}/g, or(ctx.bank))
    .replace(/\{شماره‌یگیری\}/g, or(ctx.ref))
    .replace(/\{شماره‌پیگیری\}/g, or(ctx.ref))
}

/** متن پیش‌فرض هر علت — کاشته می‌شود در نخستین GET (idempotent) */
export const RETURN_MSG_SEED: { reason: string; title: string; body: string }[] = [
  {
    reason: WILDCARD_REASON,
    title: 'پیش‌فرض (همهٔ علل)',
    body:
      '{مشتری} عزیز، بازگشت کالا (علت: {علت}) با کد پیگیری {کد} در تاریخ {تاریخ} تأیید شد و مبلغ {مبلغ} ریال به کارت شما واریز گردید. از اعتماد شما سپاسگزاریم — هایپر زیتون',
  },
  {
    reason: 'کالای معیوب',
    title: 'کالای معیوب پذیرفته شد',
    body:
      '{مشتری} عزیز، کالای معیوب پذیرفته شد؛ مرجوعی با کد پیگیری {کد} در تاریخ {تاریخ} تأیید شد و مبلغ {مبلغ} ریال به کارت شما واریز گردید. از اعتماد شما سپاسگزاریم — هایپر زیتون',
  },
  {
    reason: 'اشتباه در خرید',
    title: 'بازگشت به علت اشتباه در خرید',
    body:
      '{مشتری} عزیز، بازگشت کالا به علت اشتباه در خرید با کد پیگیری {کد} تأیید شد و مبلغ {مبلغ} ریال در تاریخ {تاریخ} به کارت شما واریز گردید. از اعتماد شما سپاسگزاریم — هایپر زیتون',
  },
  {
    reason: 'اختلاف قیمت',
    title: 'اختلاف قیمت تسویه شد',
    body:
      '{مشتری} عزیز، اختلاف قیمت کالا بررسی و تأیید شد؛ مبلغ {مبلغ} ریال بابت مرجوعی با کد پیگیری {کد} در تاریخ {تاریخ} به کارت شما واریز گردید. از اعتماد شما سپاسگزاریم — هایپر زیتون',
  },
  {
    reason: 'انقضای کالا',
    title: 'کالای منقضی بازگردانده شد',
    body:
      '{مشتری} عزیز، کالای منقضی بازگردانده شد و مرجوعی با کد پیگیری {کد} تأیید گردید؛ مبلغ {مبلغ} ریال در تاریخ {تاریخ} به کارت شما واریز شد. از اعتماد شما سپاسگزاریم — هایپر زیتون',
  },
  {
    reason: 'عدم رضایت از کیفیت',
    title: 'پس گرفتن کالا بابت کیفیت',
    body:
      '{مشتری} عزیز، نظر شما دربارهٔ کیفیت کالا ثبت شد و کالا پس گرفته شد؛ مرجوعی با کد پیگیری {کد} تأیید شد و مبلغ {مبلغ} ریال در تاریخ {تاریخ} به کارت شما واریز گردید. از اعتماد شما سپاسگزاریم — هایپر زیتون',
  },
  {
    reason: 'خطای کارت‌خوان',
    title: 'جبران خطای کارت‌خوان',
    body:
      '{مشتری} عزیز، بابت خطای کارت‌خوان مبلغ {مبلغ} ریال با کد پیگیری {کد} در تاریخ {تاریخ} به کارت شما واریز گردید. از اعتماد شما سپاسگزاریم — هایپر زیتون',
  },
  {
    reason: 'سایر',
    title: 'سایر علل',
    body:
      '{مشتری} عزیز، بازگشت کالا (علت: {علت}) با کد پیگیری {کد} تأیید شد و مبلغ {مبلغ} ریال در تاریخ {تاریخ} به کارت شما واریز گردید. از اعتماد شما سپاسگزاریم — هایپر زیتون',
  },
]

/** کاشت پیش‌فرض‌ها اگر جدول خالی بود — idempotent (رقابتِ دو GET با catch حل می‌شود) */
export async function seedReturnMsgTemplatesIfEmpty(
  dbLike: {
    returnMsgTemplate: {
      count(): Promise<number>
      createMany(data: { data: { reason: string; title: string; body: string }[] }): Promise<unknown>
    }
  },
): Promise<boolean> {
  const n = await dbLike.returnMsgTemplate.count()
  if (n > 0) return false
  try {
    await dbLike.returnMsgTemplate.createMany({ data: RETURN_MSG_SEED })
    return true
  } catch {
    // رکورد همزمانِ دیگری قید یکتا را نقض کرد → همان کاشته‌شده کافی است
    return false
  }
}
