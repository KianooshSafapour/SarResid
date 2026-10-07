import { db } from '@/lib/db'
import { fail, getSessionUser, json } from '@/lib/api-helpers'
import { toJalaliParts, todayIso } from '@/lib/jalali'

/* ─────────────────────────────────────────────────────────────────────────────
 *  رویدادهای یک روز تقویم (round-16) — ویجت تقویم نوار بالا
 *  GET ?date=yyyy-mm-dd (میلادی iso) → {
 *    date, holiday, occasions, cheques, tasks, deliveries, birthdays,
 *    summary: {total}
 *  }
 *  دسترسی: هر کاربر واردشده (رویدادهای حساس فقط عنوان/نوع بدون مبالغ برای غیرمالک)
 * ────────────────────────────────────────────────────────────────────────────*/

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const url = new URL(req.url)
  const date = (url.searchParams.get('date') || todayIso()).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('تاریخ نامعتبر است')

  const isMoney = me.role === 'OWNER' || me.role === 'GM' || me.role === 'ACC' || me.role === 'ADMIN' || me.role === 'OM'

  const [holidays, cheques, tasks, orders, customers] = await Promise.all([
    db.holiday.findMany({ where: { date } }),
    db.cheque.findMany({ where: { dueDate: date }, select: { id: true, amount: true, status: true, recipientName: true, selfIssued: true, number: true } }),
    db.task.findMany({ where: { dueDate: date, status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true, title: true, priority: true, status: true, assignedToId: true, assignedToName: true } }).catch(() => []),
    db.order.findMany({ where: { deliveryDate: date, status: { notIn: ['CANCELLED', 'REJECTED'] } }, select: { id: true, code: true, status: true, providerId: true, providerName: true, totalAmount: true } }).catch(() => []),
    db.customer.findMany({ where: { birthday: { not: '' } }, select: { id: true, name: true, birthday: true, tier: true } }).catch(() => []),
  ])

  const { jm, jd } = toJalaliParts(date)

  const holidayRows = holidays.map((h) => ({ id: h.id, title: h.title, kind: h.kind, source: h.source }))
  const isHoliday = holidayRows.some((h) => h.kind === 'HOLIDAY')

  const birthdays = customers
    .filter((c) => {
      const b = (c.birthday || '').slice(0, 10)
      // birthday شمسی yyyy-mm-dd ذخیره می‌شود — تطبیق ماه/روز بدون در نظر گرفتن سال
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(b)
      if (!m) return false
      return Number(m[2]) === jm && Number(m[3]) === jd
    })
    .map((c) => ({ id: c.id, name: c.name, tier: c.tier }))

  const providerIds = Array.from(new Set(orders.map((o) => o.providerId).filter(Boolean)))
  const providers = providerIds.length ? await db.provider.findMany({ where: { id: { in: providerIds } }, select: { id: true, name: true } }) : []
  const providerMap = new Map(providers.map((p) => [p.id, p.name]))

  const summary = {
    holidays: holidayRows.filter((h) => h.kind === 'HOLIDAY').length,
    occasions: holidayRows.filter((h) => h.kind !== 'HOLIDAY').length,
    cheques: cheques.length,
    chequesAmount: isMoney ? cheques.reduce((s, c) => s + (c.amount || 0), 0) : undefined,
    tasks: tasks.length,
    deliveries: orders.length,
    deliveriesAmount: isMoney ? orders.reduce((s, o) => s + (o.totalAmount || 0), 0) : undefined,
    birthdays: birthdays.length,
  }

  return json({
    date,
    jalali: { jm, jd },
    isHoliday,
    holidays: holidayRows,
    cheques: cheques.map((c) => ({
      id: c.id, status: c.status, recipient: c.recipientName, selfIssued: !!c.selfIssued, chequeNo: c.number,
      amount: isMoney ? c.amount : undefined,
    })),
    tasks,
    deliveries: orders.map((o) => ({ id: o.id, code: o.code, status: o.status, provider: providerMap.get(o.providerId) || '—', total: isMoney ? o.totalAmount : undefined })),
    birthdays,
    summary,
  })
}
