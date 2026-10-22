import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, clampInt } from '@/lib/api'
import { getSessionUser, MANAGER_ROLES } from '@/lib/auth'
import { displayName } from '@/lib/notify'
import { todayJalaliDash } from '@/lib/jalali'
import { columnStatesByBlock, cycleDaysOfKind } from '@/app/api/store/section-columns/route'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/
const CYCLE = 28 // 28-day line cycle

export interface CheckLine {
  id: string // LINE-01
  label: string // «گوندولا ۲ — روی شرقی»
  blockLabel: string
  daySlot: number // fixed cycle day 1..28
  kind: string
  zone: string | null
}

function isProductBlock(kind: string): boolean {
  return (
    kind === 'GONDOLA' ||
    kind === 'SHELF' ||
    kind === 'FREEZER_ICECREAM' ||
    kind === 'BAKERY' ||
    kind === 'CUSTOM' ||
    kind.startsWith('FRIDGE_')
  )
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))

/**
 * The line system, derived from the real floorplan blocks (creation order):
 *  - every product-bearing block = 1 line
 *  - each GONDOLA = 2 lines (its two long sides):
 *      vertical (N-S) gondolas → «روی شرقی» / «روی غربی»
 *      horizontal (E-W) gondolas → «روی شمالی» / «روی جنوبی»
 *  - numbered LINE-01.. ; fixed daySlot = (index % 28) + 1
 */
export async function getLines(): Promise<CheckLine[]> {
  const plans = await db.floorplan.findMany({ include: { blocks: true } })
  const lines: CheckLine[] = []
  let i = 0
  for (const plan of plans) {
    for (const b of plan.blocks) {
      if (!b.label || !isProductBlock(b.kind)) continue
      if (b.kind === 'GONDOLA') {
        const vertical = b.h >= b.w
        const sides = vertical ? ['روی شرقی', 'روی غربی'] : ['روی شمالی', 'روی جنوبی']
        for (const side of sides) {
          lines.push({
            id: `LINE-${pad2(i + 1)}`,
            label: `${b.label} — ${side}`,
            blockLabel: b.label,
            daySlot: (i % CYCLE) + 1,
            kind: b.kind,
            zone: b.zoneName || null,
          })
          i++
        }
      } else {
        lines.push({
          id: `LINE-${pad2(i + 1)}`,
          label: b.label,
          blockLabel: b.label,
          daySlot: (i % CYCLE) + 1,
          kind: b.kind,
          zone: b.zoneName || null,
        })
        i++
      }
    }
  }
  return lines
}

/** cycle slot checked on a given jalali day d: ((d-1) % 28) + 1 */
export function slotOfDay(d: number): number {
  const dd = Math.max(1, Math.round(d))
  return ((dd - 1) % CYCLE) + 1
}

/** managers + PM */
function canAccess(role: string): boolean {
  return MANAGER_ROLES.includes(role) || role === 'PM'
}

/**
 * GET /api/date-checks?month=1405-07&date=1405-07-27
 * → {lines, todayLines, results, todayPlan}
 * B3: each line additionally carries its block's active ZoneColumns,
 *     lastColumns (latest check's column names) and the rotation nextStart;
 *     todayPlan = per-block column plan for today (startFrom + suggested count).
 */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!canAccess(me.role)) return fail('دسترسی به این بخش ندارید', 403)

  const sp = req.nextUrl.searchParams
  const dateParam = sp.get('date') || ''
  const monthParam = sp.get('month') || ''

  const today = todayJalaliDash()
  if (dateParam && !DATE_RE.test(dateParam)) return fail('تاریخ را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')
  const date = dateParam || ''

  let month = ''
  if (monthParam) {
    if (!MONTH_RE.test(monthParam)) return fail('ماه را به شکل ۱۴۰۵-۰۷ وارد کنید')
    month = monthParam
  }

  // results: exact-day rows when date given, otherwise the month's rows
  const resultsWhere = date
    ? { date }
    : { date: { startsWith: `${month || today.slice(0, 7)}-` } }

  const [lines, results, states] = await Promise.all([
    getLines(),
    db.dateCheck.findMany({ where: resultsWhere as never, orderBy: [{ date: 'desc' }, { lineId: 'asc' }] }),
    columnStatesByBlock(),
  ])

  // todayLines: the lines whose fixed slot matches the cycle day of the reference date
  const refDate = date || today
  const dayOfMonth = Number(refDate.split('-')[2] || 0)
  const todaySlot = slotOfDay(dayOfMonth)

  const activeColumnsOf = (blockLabel: string) =>
    (states.get(blockLabel)?.columns ?? [])
      .filter((c) => c.active)
      .map((c) => ({ id: c.id, name: c.name, order: c.order }))
  const enrich = (l: CheckLine) => {
    const st = states.get(l.blockLabel)
    return {
      ...l,
      columns: activeColumnsOf(l.blockLabel),
      lastColumns: st?.lastCheckedColumns ?? [],
      nextStart: st?.nextStart ?? null,
    }
  }
  const todayLines = lines.filter((l) => l.daySlot === todaySlot).map(enrich)

  // todayPlan: every block with active columns → rotation start + suggested per-day count
  const todayPlan: { blockLabel: string; startFrom: string | null; suggested: number }[] = []
  const seenBlocks = new Set<string>()
  for (const l of lines) {
    if (seenBlocks.has(l.blockLabel)) continue
    seenBlocks.add(l.blockLabel)
    const active = activeColumnsOf(l.blockLabel)
    if (!active.length) continue
    todayPlan.push({
      blockLabel: l.blockLabel,
      startFrom: states.get(l.blockLabel)?.nextStart ?? null,
      suggested: Math.ceil(active.length / cycleDaysOfKind(l.kind)),
    })
  }

  return ok({
    month: month || (date ? date.slice(0, 7) : today.slice(0, 7)),
    date: date || null,
    refDate,
    todaySlot,
    cycle: CYCLE,
    lines: lines.map(enrich),
    todayLines,
    results,
    todayPlan,
  })
}

/**
 * POST /api/date-checks — upsert (unique date+lineId). Managers + PM.
 * {date, lineId, status(ok|issues), expiredCount, nearExpiryCount, fefoOk, action?, note?,
 *  columns?: [{name, status(ok|issues), expiredCount?, note?}]} → stored in columnsJson;
 *  the block's rotation cursor becomes the LAST column of the list.
 * blockLabel/lineLabel/daySlot come from the line system; checker = session user.
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!canAccess(me.role)) return fail('دسترسی به این بخش ندارید', 403)

  const body = (await req.json().catch(() => ({}))) as {
    date?: string
    lineId?: string
    blockLabel?: string
    status?: string
    expiredCount?: number
    nearExpiryCount?: number
    fefoOk?: boolean
    action?: string
    note?: string
    columns?: { name?: string; status?: string; expiredCount?: number; note?: string }[]
  }

  const date = String(body.date || '')
  if (!DATE_RE.test(date)) return fail('تاریخ را به شکل ۱۴۰۵-۰۷-۲۷ وارد کنید')

  const lines = await getLines()
  const line = lines.find((l) => l.id === String(body.lineId || ''))
  if (!line) return fail('خط موردنظر در سیستم خط‌های فروشگاه یافت نشد', 404)

  const status = String(body.status) === 'issues' ? 'issues' : 'ok'

  // B3: per-column results → columnsJson (rotation payload); omitted → field untouched
  let columnsJson: string | undefined
  if (Array.isArray(body.columns)) {
    const list = body.columns
      .slice(0, 100)
      .map((c) => ({
        name: String(c?.name || '').trim().slice(0, 60),
        status: String(c?.status) === 'issues' ? 'issues' : 'ok',
        expiredCount: clampInt(c?.expiredCount, 0, 9999, 0),
        note: c?.note ? String(c.note).trim().slice(0, 200) || null : null,
      }))
      .filter((c) => c.name)
    columnsJson = JSON.stringify(list)
  }

  const data = {
    status,
    expiredCount: clampInt(body.expiredCount, 0, 9999, 0),
    nearExpiryCount: clampInt(body.nearExpiryCount, 0, 9999, 0),
    fefoOk: body.fefoOk !== false,
    action: body.action ? String(body.action).trim().slice(0, 500) || null : null,
    note: body.note ? String(body.note).trim().slice(0, 500) || null : null,
    ...(columnsJson !== undefined ? { columnsJson } : {}),
  }

  const check = await db.dateCheck.upsert({
    where: { date_lineId: { date, lineId: line.id } },
    create: {
      date,
      lineId: line.id,
      lineLabel: line.label,
      blockLabel: line.blockLabel,
      daySlot: line.daySlot,
      checkerId: me.id,
      checkerName: displayName(me),
      ...data,
    },
    update: { ...data, checkerId: me.id, checkerName: displayName(me) },
  })

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'datecheck.save',
    actionLabel: 'کنترل تاریخ انقضا',
    category: 'store',
    detail: `${line.label} — ${date}${status === 'issues' ? ' (موجود مشکل)' : ' (سالم)'}${
      data.expiredCount ? ` — منقضی: ${data.expiredCount}` : ''
    }${columnsJson !== undefined ? ` — ستون‌ها: ${JSON.parse(columnsJson).length}` : ''}`,
    entityId: check.id,
  })

  return ok({ check })
}
