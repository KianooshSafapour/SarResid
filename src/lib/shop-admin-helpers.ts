import { db } from '@/lib/db'

/** کمکی‌های مشترک shop-admin (بدون چرخهٔ import) */
export async function getShopSettingsLite() {
  const rows = await db.setting.findMany({ where: { key: { in: ['shop:hiddenGroups'] } } })
  const raw = (v: string | undefined, d: string) => {
    if (v === undefined) return d
    try {
      const p = JSON.parse(v)
      if (typeof p === 'string') return p
      if (typeof p === 'number' || typeof p === 'boolean') return String(p)
    } catch { /* raw */ }
    return v
  }
  let hiddenGroups: string[] = []
  try {
    const parsed = JSON.parse(raw(rows[0]?.value, '[]'))
    if (Array.isArray(parsed)) hiddenGroups = parsed.map(String)
  } catch { /* [] */ }
  return { hiddenGroups }
}

export function safeJsonGroups(json: string): string[] {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.map((x) => String(x)) : []
  } catch {
    return []
  }
}
