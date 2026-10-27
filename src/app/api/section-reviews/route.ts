import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, clampInt } from '@/lib/api'
import { getSessionUser, isManager, MANAGER_ROLES } from '@/lib/auth'
import { displayName } from '@/lib/notify'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** product-bearing block kinds (carry goods → reviewable / date-checkable) */
export function isProductBlock(kind: string): boolean {
  return (
    kind === 'GONDOLA' ||
    kind === 'SHELF' ||
    kind === 'FREEZER_ICECREAM' ||
    kind === 'BAKERY' ||
    kind === 'CUSTOM' ||
    kind.startsWith('FRIDGE_')
  )
}

/** product-bearing blocks of every floorplan, in creation order */
export async function productBlocks() {
  const plans = await db.floorplan.findMany({ include: { blocks: true } })
  const out: { label: string; zone: string | null; kind: string }[] = []
  const seen = new Set<string>()
  for (const plan of plans) {
    for (const b of plan.blocks) {
      if (!b.label || !isProductBlock(b.kind) || seen.has(b.label)) continue
      seen.add(b.label)
      out.push({ label: b.label, zone: b.zoneName || null, kind: b.kind })
    }
  }
  return out
}

/** managers + PM (store section) may read the review board */
function canView(role: string): boolean {
  return MANAGER_ROLES.includes(role) || role === 'PM'
}

/**
 * GET /api/section-reviews?from=&to=&staff=&block=
 * → {reviews, blocks (from floorplan), staff (active users)}
 */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!canView(me.role)) return fail('دسترسی به این بخش ندارید', 403)

  const sp = req.nextUrl.searchParams
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const staff = sp.get('staff') || ''
  const block = sp.get('block') || ''

  if (from && !DATE_RE.test(from)) return fail('از تاریخ را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')
  if (to && !DATE_RE.test(to)) return fail('تا تاریخ را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')

  const where: Record<string, unknown> = {}
  const dateRange: Record<string, string> = {}
  if (from) dateRange.gte = from
  if (to) dateRange.lte = to
  if (Object.keys(dateRange).length) where.date = dateRange
  if (staff) where.staffId = staff
  if (block) where.blockLabel = block

  const [reviews, blocks, staffUsers] = await Promise.all([
    db.sectionReview.findMany({
      where: where as never,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    }),
    productBlocks(),
    db.user.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } }),
  ])

  // B3: scores stored 0-100; also expose the 0-5 scale (÷20, 1 decimal)
  const to5 = (v: number) => Math.round((v / 20) * 10) / 10
  return ok({
    reviews: reviews.map((r) => ({
      ...r,
      dateScore5: to5(r.dateScore),
      layoutScore5: to5(r.layoutScore),
      cleanScore5: to5(r.cleanScore),
      labelScore5: to5(r.labelScore),
      serveScore5: to5(r.serveScore),
    })),
    blocks,
    staff: staffUsers.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      honorific: u.honorific,
      role: u.role,
      title: u.title,
    })),
  })
}

/**
 * POST /api/section-reviews — managers only.
 * {date, blockLabel, staffId?, staffName?, dateScore, layoutScore, cleanScore, labelScore, note?, points?}
 * B3: scores accepted 0-100 (legacy 0-5 values ≤5 → ×20); stored 0-100.
 * points defaults to the average of the four 0-100 scores.
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!isManager(me)) return fail('فقط مدیران می‌توانند ارزیابی چیدمان ثبت کنند', 403)

  const body = (await req.json().catch(() => ({}))) as {
    date?: string
    blockLabel?: string
    staffId?: string
    staffName?: string
    dateScore?: number
    layoutScore?: number
    cleanScore?: number
    labelScore?: number
    serveScore?: number
    note?: string
    points?: number
  }

  const date = String(body.date || '')
  if (!DATE_RE.test(date)) return fail('تاریخ را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')

  const blockLabel = String(body.blockLabel || '').trim()
  const blocks = await productBlocks()
  if (!blocks.some((b) => b.label === blockLabel)) return fail('بخش انتخاب‌شده در نقشه فروشگاه یافت نشد')

  // 0-100 storage; legacy 0-5 inputs (≤5) are scaled ×20 (B3)
  const score100 = (v: unknown) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return 0
    return clampInt(n <= 5 ? n * 20 : n, 0, 100, 0)
  }
  const dateScore = score100(body.dateScore)
  const layoutScore = score100(body.layoutScore)
  const cleanScore = score100(body.cleanScore)
  const labelScore = score100(body.labelScore)
  const serveScore = score100(body.serveScore)
  const avg = Math.round((dateScore + layoutScore + cleanScore + labelScore + serveScore) / 5)
  const points = body.points !== undefined ? clampInt(body.points, 0, 100, avg) : avg

  // responsible staff of the line: staffId (validated user) wins; free-text staffName allowed
  let staffId: string | null = null
  let staffName: string | null = null
  if (body.staffId) {
    const u = await db.user.findUnique({ where: { id: String(body.staffId) } })
    if (!u || !u.active) return fail('مسئول خط یافت نشد', 404)
    staffId = u.id
    staffName = displayName(u)
  } else if (body.staffName) {
    staffName = String(body.staffName).trim() || null
  }

  const review = await db.sectionReview.create({
    data: {
      date,
      reviewerId: me.id,
      reviewerName: displayName(me),
      blockLabel,
      staffId,
      staffName,
      dateScore,
      layoutScore,
      cleanScore,
      labelScore,
      serveScore,
      note: body.note ? String(body.note).trim().slice(0, 500) || null : null,
      points,
    },
  })

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'sectionreview.create',
    actionLabel: 'ارزیابی چیدمان',
    category: 'store',
    detail: `${blockLabel} — ${date} (امتیاز ${points})${staffName ? ` — مسئول: ${staffName}` : ''}`,
    entityId: review.id,
  })

  return ok({ review })
}
