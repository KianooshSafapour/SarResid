import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canSystem } from '@/lib/access'
import { formatJalaliDash, toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/** GET /api/admin/activity?action=&q=&page=1&limit=50 → paginated activity log */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canSystem(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const sp = req.nextUrl.searchParams
  const page = Math.max(1, Math.round(Number(sp.get('page')) || 1))
  const limit = Math.max(1, Math.min(500, Math.round(Number(sp.get('limit')) || 50)))
  const action = (sp.get('action') || '').trim()
  const q = (sp.get('q') || '').trim()

  const where: {
    OR?: Array<Record<string, unknown>>
    AND?: Array<Record<string, unknown>>
  } = {}

  const conditions: Array<Record<string, unknown>> = []
  if (action) {
    conditions.push({
      OR: [{ action }, { category: action }, { action: { startsWith: `${action}.` } }],
    })
  }
  if (q) {
    conditions.push({
      OR: [{ detail: { contains: q } }, { userName: { contains: q } }, { action: { contains: q } }],
    })
  }
  if (conditions.length > 0) where.AND = conditions

  const [total, rows] = await Promise.all([
    db.activityLog.count({ where }),
    db.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
  ])

  const items = rows.map((r) => {
    // Live site renders the time in the server's local (UTC) clock — captured as ۰۴:۳۲ for 04:32Z rows
    const d = new Date(r.createdAt)
    const hh = String(d.getUTCHours()).padStart(2, '0')
    const mm = String(d.getUTCMinutes()).padStart(2, '0')
    return {
      id: r.id,
      userId: r.userId,
      userName: r.userName,
      action: r.action,
      actionLabel: r.actionLabel ?? r.action,
      category: r.category,
      detail: r.detail,
      entityId: r.entityId,
      createdAt: r.createdAt,
      dateJalali: formatJalaliDash(r.createdAt),
      time: toFaDigits(`${hh}:${mm}`),
    }
  })

  return ok({
    items,
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  })
}
