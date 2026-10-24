import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { displayName } from '@/lib/notify'
import { toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/** 11 duty-book indicators — Lotfi reviews Mollaie with these */
export const INDICATORS: { key: string; label: string }[] = [
  { key: 'staffMgmt', label: 'مدیریت پرسنل' },
  { key: 'hallControl', label: 'کنترل سالن' },
  { key: 'layoutQuality', label: 'کیفیت چیدمان' },
  { key: 'cleanliness', label: 'نظافت' },
  { key: 'labelsControl', label: 'کنترل برچسب' },
  { key: 'datesControl', label: 'کنترل تاریخ' },
  { key: 'customerService', label: 'پاسخگویی مشتری' },
  { key: 'problemSolving', label: 'حل مسئله' },
  { key: 'reporting', label: 'کیفیت گزارش' },
  { key: 'discipline', label: 'نظم و حضور' },
  { key: 'salesGrowth', label: 'نگاه فروش' },
]

const PERIOD_RE = /^\d{4}-(\d{2}|W\d{1,2})$/

/* R7-PERF (پژوهش R7 بخش ۶.۶): نمرهٔ حدی = ۱، ۲ یا ۵ — برای مقاوم‌سازی نمره‌ها در برابر
 * تساهل/سخت‌گیری، ثبت «توضیح شاهد» (رویداد بحرانی) با حداقل ۸ نویسه الزامی است. */
const EXTREME_MIN = 8

function reviewOut(r: {
  id: string
  periodKey: string
  managerId: string
  managerName: string
  reviewerId: string
  reviewerName: string
  scoresJson: string
  total: number
  note: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: r.id,
    periodKey: r.periodKey,
    managerId: r.managerId,
    managerName: r.managerName,
    reviewerId: r.reviewerId,
    reviewerName: r.reviewerName,
    scores: safeJson<Record<string, number>>(r.scoresJson, {}),
    total: r.total,
    note: r.note,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

/**
 * GET /api/manager-reviews?periodKey=1405-07&manager=<userId>
 * → {reviews, indicators}
 */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!isManager(me)) return fail('دسترسی به این بخش ندارید', 403)

  const sp = req.nextUrl.searchParams
  const periodKey = sp.get('period') || sp.get('periodKey') || ''
  const manager = sp.get('manager') || ''

  const where: Record<string, unknown> = {}
  if (periodKey) where.periodKey = periodKey
  if (manager) where.managerId = manager

  const reviews = await db.managerReview.findMany({
    where: where as never,
    orderBy: [{ periodKey: 'desc' }, { updatedAt: 'desc' }],
  })

  return ok({ reviews: reviews.map(reviewOut), indicators: INDICATORS })
}

/**
 * POST /api/manager-reviews — GM/OWNER/ADMIN only (Lotfi reviews Mollaie).
 * {periodKey, managerId, scores:{11 indicators 1-5}, note} → upsert (unique managerId+periodKey)
 * total = avg × 20 (0-100).
 * R7-PERF: اگر هر شاخصی نمرهٔ ۱، ۲ یا ۵ داشته باشد، «note» به‌عنوان توضیح شاهد الزامی است
 * (حداقل ۸ نویسه) — در غیر این صورت درخواست با خطای فارسی رد می‌شود.
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!['GM', 'OWNER', 'ADMIN'].includes(me.role)) {
    return fail('فقط مدیر ارشد (لطفی) می‌تواند ارزیابی مدیران را ثبت کند', 403)
  }

  const body = (await req.json().catch(() => ({}))) as {
    periodKey?: string
    managerId?: string
    managerName?: string
    scores?: Record<string, number>
    note?: string
  }

  const periodKey = String(body.periodKey || '').trim()
  if (!PERIOD_RE.test(periodKey)) return fail('دوره را به شکل ۱۴۰۵-۰۷ وارد کنید')

  const managerId = String(body.managerId || '')
  const manager = await db.user.findUnique({ where: { id: managerId } })
  if (!manager || !manager.active) return fail('مدیر مورد ارزیابی یافت نشد', 404)
  const managerName = body.managerName ? String(body.managerName).trim() : displayName(manager)

  const incoming = body.scores || {}
  const scores: Record<string, number> = {}
  for (const ind of INDICATORS) {
    const v = incoming[ind.key]
    if (v === undefined || v === null || !Number.isFinite(Number(v))) {
      return fail(`نمره شاخص «${ind.label}» الزامی است`)
    }
    scores[ind.key] = Math.max(1, Math.min(5, Math.round(Number(v))))
  }

  // R7-PERF: نمرهٔ حدی (≤۲ یا =۵) بدون توضیح شاهد رد می‌شود
  const witnessNote = String(body.note || '').trim()
  const extremes = INDICATORS.filter((i) => scores[i.key] <= 2 || scores[i.key] === 5)
  if (extremes.length && witnessNote.length < EXTREME_MIN) {
    return fail(
      `برای نمرهٔ حدی (۱، ۲ یا ۵) در «${extremes[0].label}»، ثبت توضیح شاهد (حداقل ${toFaDigits(EXTREME_MIN)} نویسه) الزامی است`,
    )
  }

  const values = INDICATORS.map((i) => scores[i.key])
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const total = Math.round(avg * 20 * 10) / 10 // avg(1-5) × 20 → 0-100

  const review = await db.managerReview.upsert({
    where: { managerId_periodKey: { managerId: manager.id, periodKey } },
    create: {
      periodKey,
      managerId: manager.id,
      managerName,
      reviewerId: me.id,
      reviewerName: displayName(me),
      scoresJson: JSON.stringify(scores),
      total,
      note: body.note ? String(body.note).trim().slice(0, 1000) || null : null,
    },
    update: {
      managerName,
      reviewerId: me.id,
      reviewerName: displayName(me),
      scoresJson: JSON.stringify(scores),
      total,
      note: body.note !== undefined ? String(body.note).trim().slice(0, 1000) || null : undefined,
    },
  })

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'managerreview.save',
    actionLabel: 'ارزیابی مدیر',
    category: 'hr',
    detail: `${managerName} — ${periodKey} — مجموع ${total}`,
    entityId: review.id,
  })

  return ok({ review: reviewOut(review) })
}
