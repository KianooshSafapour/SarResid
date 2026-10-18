import { db } from '@/lib/db'

/**
 * The live shifts/payroll views list people in PERSONNEL insertion order
 * (matches captured shifts.json & payroll.json). Users without a personnel
 * row are appended at the end in user insertion order.
 */
export async function orderedUsers(): Promise<
  Array<{ id: string; username: string; fullName: string; honorific: string; role: string; title: string; active: boolean }>
> {
  const [personnel, users] = await Promise.all([db.personnel.findMany(), db.user.findMany()])
  const userById = new Map(users.map((u) => [u.id, u]))
  const usedUserIds = new Set<string>()
  const ordered: Array<{ id: string; username: string; fullName: string; honorific: string; role: string; title: string; active: boolean }> = []

  for (const p of personnel) {
    const direct = userById.get(p.userId)
    if (direct) {
      ordered.push(direct)
      usedUserIds.add(direct.id)
      continue
    }
    // personnel row without a valid user link — try matching by full name (live DB was linked at capture time)
    const byName = users.find((u) => u.fullName === p.fullName && !usedUserIds.has(u.id))
    if (byName) {
      ordered.push(byName)
      usedUserIds.add(byName.id)
    }
  }
  for (const u of users) {
    if (!usedUserIds.has(u.id)) {
      ordered.push(u)
      usedUserIds.add(u.id)
    }
  }
  return ordered
}

/** Resolve the userId a personnel row belongs to (direct link or full-name fallback). */
export function resolvePersonnelUserId(
  p: { userId: string; fullName: string },
  userById: Map<string, { id: string; fullName: string }>,
  usedIds: Set<string>,
): string | null {
  if (userById.has(p.userId)) return p.userId
  const byName = [...userById.values()].find((u) => u.fullName === p.fullName && !usedIds.has(u.id))
  return byName ? byName.id : null
}
