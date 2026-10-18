import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { todayJalaliDash, formatJalaliDash, toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']

/** Jalali month key ("1405-07") of a Date in Tehran time */
function jalaliMonthKeyOf(d: Date): string {
  return formatJalaliDash(d).slice(0, 7)
}

/** GET /api/returns/stats — live shape:
 * {pending:{count,total,transfer}, awaiting:{count,total,transfer}, paidMonth:{count,amount}, monthLabel} */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const monthKey = todayJalaliDash().slice(0, 7) // 1405-07
  const jy = Number(monthKey.slice(0, 4))
  const jm = Number(monthKey.slice(5, 7))
  const monthLabel = `${JALALI_MONTHS[jm - 1]} ${toFaDigits(jy)}`

  const all = await db.returnRequest.findMany({
    select: { status: true, totalAmount: true, transferAmount: true, updatedAt: true },
  })

  const pendingRows = all.filter((r) => r.status === 'draft' || r.status === 'pending')
  const awaitingRows = all.filter((r) => r.status === 'approved')
  const paidRows = all.filter((r) => r.status === 'paid')
  const paidMonth = paidRows.filter((r) => jalaliMonthKeyOf(r.updatedAt) === monthKey)

  const sum = (rows: typeof all, f: 'totalAmount' | 'transferAmount') =>
    rows.reduce((s, r) => s + (r[f] ?? 0), 0)

  return ok({
    pending: {
      count: pendingRows.length,
      total: sum(pendingRows, 'totalAmount'),
      transfer: sum(pendingRows, 'transferAmount'),
    },
    awaiting: {
      count: awaitingRows.length,
      total: sum(awaitingRows, 'totalAmount'),
      transfer: sum(awaitingRows, 'transferAmount'),
    },
    paidMonth: {
      count: paidMonth.length,
      amount: paidMonth.reduce((s, r) => s + (r.transferAmount ?? 0), 0),
    },
    monthLabel,
  })
}
