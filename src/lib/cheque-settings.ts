/**
 * تنظیمات مشترک چک (سقف‌ها + پارامترهای تقسیم هوشمند)
 * -----------------------------------------------------
 * کلیدهای KV:
 *  · cheque:limits → { day, week, month } (ریال؛ ۰ = بدون سقف)
 *  · cheque:split  → { mediumMax, heavyMax, mediumThreshold, heavyThreshold, roundTo }
 *
 * از این lib هم route اصلی تنظیمات (api/cheques/settings) و هم route
 * پیشنهاد هوشمند (api/cheque-calc/split) استفاده می‌کنند — import مستقیم
 * بین دو route در Next build مجاز نیست.
 */
import { db } from '@/lib/db'
import { safeJson } from '@/lib/api'

const LIMITS_KEY = 'cheque:limits'
const SPLIT_KEY = 'cheque:split'

export interface ChequeLimits {
  day: number
  week: number
  month: number
}
export interface ChequeSplit {
  mediumMax: number
  heavyMax: number
  mediumThreshold: number
  heavyThreshold: number
  roundTo: number
}

export const DEFAULT_LIMITS: ChequeLimits = { day: 0, week: 0, month: 0 }
export const DEFAULT_SPLIT: ChequeSplit = {
  mediumMax: 3,
  heavyMax: 5,
  mediumThreshold: 200_000_000, // ۲۰ میلیون تومان
  heavyThreshold: 800_000_000, // ۸۰ میلیون تومان
  roundTo: 100_000,
}

export function posInt(v: unknown, fallback: number, max = 1_000_000_000_000): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.min(Math.round(n), max)
}

export async function readLimits(): Promise<ChequeLimits> {
  const row = await db.setting.findUnique({ where: { key: LIMITS_KEY } })
  const parsed = safeJson<Partial<ChequeLimits>>(row?.value, {})
  return {
    day: posInt(parsed?.day, DEFAULT_LIMITS.day),
    week: posInt(parsed?.week, DEFAULT_LIMITS.week),
    month: posInt(parsed?.month, DEFAULT_LIMITS.month),
  }
}

export async function readSplit(): Promise<ChequeSplit> {
  const row = await db.setting.findUnique({ where: { key: SPLIT_KEY } })
  const parsed = safeJson<Partial<ChequeSplit>>(row?.value, {})
  return {
    mediumMax: Math.max(2, Math.min(10, posInt(parsed?.mediumMax, DEFAULT_SPLIT.mediumMax, 10))),
    heavyMax: Math.max(2, Math.min(10, posInt(parsed?.heavyMax, DEFAULT_SPLIT.heavyMax, 10))),
    mediumThreshold: Math.max(0, posInt(parsed?.mediumThreshold, DEFAULT_SPLIT.mediumThreshold)),
    heavyThreshold: Math.max(0, posInt(parsed?.heavyThreshold, DEFAULT_SPLIT.heavyThreshold)),
    roundTo: Math.max(1000, posInt(parsed?.roundTo, DEFAULT_SPLIT.roundTo, 100_000_000)),
  }
}
