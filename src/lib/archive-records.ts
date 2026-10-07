import { enDigits, jalaliToIso, jMonthLength } from '@/lib/jalali'

/**
 * قواعد نگهداری اسناد (ISO 15489 + قانون تجارت ماده ۱۳):
 * مبنای قانونی نگهداری «سال مالی سند» است — پایان مهلت دفع = آخرین روز اسفندِ
 * (سال مالی + سال‌های نگهداری). پیش‌فرض ۱۰ سال؛ هرگز دفع خودکار انجام نمی‌شود.
 */
export function computeDisposeAfterIso(fiscalYear: string | number, retentionYears: number): string {
  const jy = Number(String(fiscalYear).replace(/[^\d]/g, ''))
  const years = Number(retentionYears) || 10
  if (!jy || jy < 1300 || jy > 1600) return ''
  const endJy = jy + years
  const lastDay = jMonthLength(endJy, 12)
  return jalaliToIso(endJy, 12, lastDay)
}

/** نرمال‌سازی سال مالی ورودی ('۱۴۰۴' | '1404' | 1404 → '1404') */
export function normalizeFiscalYear(v: unknown): string {
  return enDigits(String(v ?? '')).replace(/[^\d]/g, '')
}

export const LIFECYCLE_VALUES = ['CAPTURED', 'CLASSIFIED', 'ACTIVE', 'SEMI_ACTIVE', 'RETENTION_DUE', 'DISPOSAL_PENDING', 'DISPOSED']
