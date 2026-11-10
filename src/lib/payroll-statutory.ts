import { db } from '@/lib/db'
import { safeJson } from '@/lib/api'
import { normalizeStatutory, STATUTORY_PRESETS, type Statutory } from '@/lib/payroll'
import { dateToJalali } from '@/lib/jalali'

/** Read the stored payroll_statutory setting; fall back to year presets. */
export async function getStatutory(year?: number): Promise<Statutory> {
  const row = await db.setting.findUnique({ where: { key: 'payroll_statutory' } })
  if (row) {
    const parsed = safeJson<Record<string, unknown>>(row.value, {})
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
      const st = normalizeStatutory(parsed)
      if (!year || st.year === year) return st
    }
  }
  if (year && STATUTORY_PRESETS[year]) return STATUTORY_PRESETS[year]
  if (year) return { ...STATUTORY_PRESETS[1405], year }
  const { jy } = dateToJalali()
  return STATUTORY_PRESETS[jy] ?? STATUTORY_PRESETS[1405]
}
