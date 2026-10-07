import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { hasCap } from '@/lib/rbac'
import { isFriday, jMonthLength, jalaliToIso, toJalaliParts, todayIso, addDaysIso } from '@/lib/jalali'
import { usageForLimit, type ChequeLite, type PaymentLite } from '@/lib/pay-scheduler'

const ACTIVE = ['PENDING_OWNER', 'SIGNED', 'DELIVERED']

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const url = new URL(req.url)
  const wantStats = url.searchParams.get('stats') === '1'
  const today = todayIso()

  const [cheques, limits, payments] = await Promise.all([
    db.cheque.findMany({ orderBy: { dueDate: 'asc' } }),
    wantStats ? db.payLimit.findMany() : Promise.resolve([]),
    wantStats ? db.payment.findMany({ select: { paidAt: true, amount: true, kind: true } }) : Promise.resolve([]),
  ])

  const list = cheques.map((c) => ({
    ...c,
    history: JSON.parse(c.history || '[]'),
    isFriday: isFriday(c.dueDate),
    overdue: c.dueDate < today && !['CLEARED', 'REJECTED'].includes(c.status),
  }))

  if (!wantStats) return json({ cheques: list })

  // ── آمار جامع برای کارت‌های بالای صفحه ──
  const bucket = (rows: typeof cheques, from: string, to: string) => {
    const hit = rows.filter((c) => c.dueDate >= from && c.dueDate <= to)
    return { count: hit.length, amount: hit.reduce((s, c) => s + c.amount, 0) }
  }
  const { jy, jm } = toJalaliParts(today)
  const monthStart = jalaliToIso(jy, jm, 1)
  const monthEnd = jalaliToIso(jy, jm, jMonthLength(jy, jm))
  const weekStart = (() => {
    // شنبهٔ آغازین هفتهٔ جاری
    const d = new Date(today + 'T12:00:00')
    const pIdx = d.getDay() === 6 ? 0 : d.getDay() + 1
    return addDaysIso(-pIdx, today)
  })()
  const weekEnd = addDaysIso(6, weekStart)

  const byStatus: Record<string, number> = {}
  for (const c of cheques) byStatus[c.status] = (byStatus[c.status] || 0) + 1
  const sumOf = (st: string) => cheques.filter((c) => c.status === st)
  const dueByStatus = (st: string) => {
    const rows = cheques.filter((c) => c.status === st)
    return {
      today: bucket(rows, today, today),
      tomorrow: bucket(rows, addDaysIso(1, today), addDaysIso(1, today)),
      week: bucket(rows, weekStart, weekEnd),
      month: bucket(rows, monthStart, monthEnd),
    }
  }
  const active = cheques.filter((c) => ACTIVE.includes(c.status))

  const limitsUsage = limits.map((l) => {
    const u = usageForLimit(l, cheques as ChequeLite[], payments as PaymentLite[], today)
    return {
      id: l.id, period: l.period, dateKey: l.dateKey, method: l.method,
      maxAmount: l.maxAmount, maxCheques: l.maxCheques, note: l.note,
      used: u.used, usedCheques: u.usedCheques, range: u.range,
      overRatio: l.maxAmount > 0 ? Math.round((u.used / l.maxAmount) * 100) : 0,
    }
  })

  return json({
    cheques: list,
    stats: {
      totalWritten: cheques.length,
      totalAmount: cheques.reduce((s, c) => s + c.amount, 0),
      byStatus,
      pendingOwner: { count: sumOf('PENDING_OWNER').length, amount: sumOf('PENDING_OWNER').reduce((s, c) => s + c.amount, 0) },
      waitingPickup: { count: sumOf('SIGNED').length, amount: sumOf('SIGNED').reduce((s, c) => s + c.amount, 0) },
      delivered: { count: sumOf('DELIVERED').length, amount: sumOf('DELIVERED').reduce((s, c) => s + c.amount, 0) },
      cleared: { count: sumOf('CLEARED').length, amount: sumOf('CLEARED').reduce((s, c) => s + c.amount, 0) },
      dueToday: { count: active.filter((c) => c.dueDate === today).length, amount: active.filter((c) => c.dueDate === today).reduce((s, c) => s + c.amount, 0) },
      dueTomorrow: bucket(active, addDaysIso(1, today), addDaysIso(1, today)),
      dueThisWeek: bucket(active, weekStart, weekEnd),
      dueThisMonth: bucket(active, monthStart, monthEnd),
      overdue: active.filter((c) => c.dueDate < today).length,
      byStatusDue: {
        PENDING_OWNER: dueByStatus('PENDING_OWNER'),
        SIGNED: dueByStatus('SIGNED'),
        DELIVERED: dueByStatus('DELIVERED'),
        CLEARED: dueByStatus('CLEARED'),
      },
    },
    limitsUsage,
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json().catch(() => ({}))

  // ── چک مستقل (بدون سفارش) — ثبت توسط مالک/مدیران با cap «cheques.create» ──
  if (body.selfIssued) {
    if (!(await hasCap(me, 'cheques.create')))
      return fail('ثبت چک مستقل نیاز به دسترسی «cheques.create» دارد', 403)
    const amount = Number(body.amount)
    if (!amount || amount <= 0) return fail('مبلغ چک الزامی است')
    if (!String(body.recipientName || '').trim()) return fail('نام گیرندهٔ چک الزامی است')
    const dueDate = String(body.dueDate || '')
    if (!dueDate) return fail('تاریخ سررسید الزامی است')
    const writtenAt = String(body.writtenAt || todayIso()).slice(0, 10)
    const warnings: string[] = []
    if (isFriday(dueDate)) warnings.push('سررسید روی جمعه است — بانک‌ها تعطیل‌اند (مادهٔ ۳۱۵: به روز کاری بعد منتقل می‌شود)')
    const holiday = await db.holiday.findUnique({ where: { date: dueDate.slice(0, 10) } })
    if (holiday) warnings.push(`سررسید روی تعطیل رسمی است: ${holiday.title}`)

    // مالک/مدیر سامانه خودش امضاکننده است → چک مستقیم «امضاشده» ثبت می‌شود
    const signedDirectly = ['OWNER', 'ADMIN'].includes(me.role)
    const cheque = await db.cheque.create({
      data: {
        number: String(body.number || ''),
        amount,
        orderId: null,
        // annotation: چک مستقل می‌تواند «بابت سفارش X» باشد بدون اتصال رکوردی
        orderCode: String(body.orderCode || ''),
        recipientName: String(body.recipientName).slice(0, 120),
        recipientPhone: String(body.recipientPhone || '').slice(0, 40),
        writtenAt,
        dueDate,
        periodDays: Math.max(0, Math.round((new Date(dueDate + 'T12:00:00').getTime() - new Date(writtenAt + 'T12:00:00').getTime()) / 86400000)),
        status: signedDirectly ? 'SIGNED' : 'PENDING_OWNER',
        sayadSerial: String(body.sayadSerial || '').slice(0, 30),
        selfIssued: true,
        holooReceiptNo: String(body.holooReceiptNo || '').slice(0, 60),
        repId: String(body.repId || ''),
        repName: String(body.repName || '').slice(0, 120),
        createdById: me.id,
        createdByName: me.name,
        history: JSON.stringify([
          {
            at: new Date().toISOString(),
            userId: me.id,
            userName: me.name,
            action: 'ثبت چک مستقل',
            detail: signedDirectly
              ? `ثبت مستقل توسط مالک — بدون نیاز به فرایند امضا${body.sayadSerial ? ` • سریال صیاد ${body.sayadSerial}` : ''}`
              : 'ثبت مستقل — در انتظار امضای مالک',
          },
        ]),
      },
    })
    await logActivity(me, 'ثبت چک مستقل', 'cheque', cheque.id, `${cheque.recipientName} — ${amount}`)
    return json({ cheque: { ...cheque, history: JSON.parse(cheque.history) }, warnings }, 201)
  }

  // ── چک متصل به سفارش — فرایند قبلی (مدیر کل / مدیر عملیات / حسابدار) ──
  if (!['GM', 'OM', 'ACC'].includes(me.role))
    return fail('فقط مدیر کل / مدیر عملیات / حسابدار چک ثبت می‌کند', 403)
  if (!body.amount || !body.dueDate) return fail('مبلغ و تاریخ سررسید الزامی است')
  const warnings: string[] = []
  if (isFriday(body.dueDate)) warnings.push('سررسید روی جمعه است — بانک‌ها تعطیل‌اند')
  const holiday = await db.holiday.findUnique({ where: { date: String(body.dueDate).slice(0, 10) } })
  if (holiday) warnings.push(`سررسید روی تعطیل رسمی است: ${holiday.title}`)

  const cheque = await db.cheque.create({
    data: {
      number: body.number || '',
      amount: Number(body.amount),
      orderId: body.orderId || null,
      orderCode: body.orderCode || '',
      recipientName: body.recipientName || '',
      recipientPhone: body.recipientPhone || '',
      writtenAt: body.writtenAt || new Date().toISOString().slice(0, 10),
      dueDate: body.dueDate,
      periodDays: Number(body.periodDays) || 30,
      status: 'PENDING_OWNER',
      sayadSerial: String(body.sayadSerial || '').slice(0, 30),
      holooReceiptNo: String(body.holooReceiptNo || '').slice(0, 60),
      repId: String(body.repId || ''),
      repName: String(body.repName || '').slice(0, 120),
      createdById: me.id,
      createdByName: me.name,
      history: JSON.stringify([
        { at: new Date().toISOString(), userId: me.id, userName: me.name, action: 'ثبت چک', detail: body.orderCode ? `متصل به سفارش ${body.orderCode}` : '' },
      ]),
    },
  })
  await logActivity(me, 'ثبت چک جدید', 'cheque', cheque.id, body.recipientName || '')
  return json({ cheque: { ...cheque, history: JSON.parse(cheque.history) }, warnings }, 201)
}
