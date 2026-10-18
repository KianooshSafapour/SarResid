import { safeJson } from '@/lib/api'

/** Live ZONE_TYPES label map (chunk 47df0d235ac469b1.js) */
export const ZONE_TYPE_LABELS: Record<string, string> = {
  DECOMPRESSION: 'دی‌کمپرشن',
  POWER_AISLE: 'قفسه پرفروش',
  PERISHABLE: 'فسادپذیر',
  DRY: 'خشک',
  CHECKOUT: 'صندوق',
  BACKROOM: 'انبار',
}

export const VALID_ZONE_TYPES = Object.keys(ZONE_TYPE_LABELS)
export const VALID_ZONE_FREQ = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']
export const VALID_ZONE_CRIT = ['A', 'B', 'C']

/** Weekly expected-count weight per count frequency */
export const ZONE_FREQ_WEIGHT: Record<string, number> = { DAILY: 7, WEEKLY: 1, BIWEEKLY: 0.5, MONTHLY: 0.25 }

export interface CountItem {
  name: string
  counted: number
  stock: number | null
  diff: number | null
}

export interface SerializedZoneCount {
  id: string
  date: string
  zoneId: string
  zoneName: string
  userId: string | null
  userName: string | null
  itemCount: number
  items: CountItem[]
  confirmStatus: string
  mismatchCount: number
  totalMismatch: number
  tolerance: number
  recheckCount: number
  mismatchReason: string | null
  createdAt: Date
  updatedAt: Date
}

export function serializeZoneCount(c: {
  id: string
  date: string
  zoneId: string
  zoneName: string
  userId: string | null
  userName: string | null
  itemsJson: string
  status: string
  mismatchCount: number
  totalItems: number
  tolerance: number
  recheckCount: number
  createdAt: Date
  updatedAt: Date
}): SerializedZoneCount {
  const items = safeJson<CountItem[]>(c.itemsJson, [])
  const totalMismatch = items.filter((i) => i.diff !== null && i.diff !== undefined && i.diff !== 0).length
  // mismatchReason is persisted inside the status column as "STATUS|reason" (no dedicated column in schema)
  const sep = c.status.indexOf('|')
  const confirmStatus = sep >= 0 ? c.status.slice(0, sep) : c.status
  const mismatchReason = sep >= 0 ? c.status.slice(sep + 1) : null
  return {
    id: c.id,
    date: c.date,
    zoneId: c.zoneId,
    zoneName: c.zoneName,
    userId: c.userId,
    userName: c.userName,
    itemCount: c.totalItems,
    items,
    confirmStatus,
    mismatchCount: c.mismatchCount,
    totalMismatch,
    tolerance: c.tolerance,
    recheckCount: c.recheckCount,
    mismatchReason,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }
}
