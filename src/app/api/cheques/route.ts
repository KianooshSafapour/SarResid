import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'
import { todayJalaliDash, parseJalaliDash, jalaliToDate, formatJalaliDash, toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']

export const FINANCE_ROLES = ['OWNER', 'GM', 'ADMIN', 'ACC']
export const SIGN_ROLES = ['OWNER', 'GM', 'ADMIN'] // hasCap('signCheques') incl. owner-style override list

export interface HistoryEntry {
  at: string
  by: string
  action: string
  detail?: string
}

export function daysLeftOf(dueDate: string): number {
  try {
    const a = parseJalaliDash(dueDate)
    const b = parseJalaliDash(todayJalaliDash())
    const da = jalaliToDate(a.jy, a.jm, a.jd)
    const db = jalaliToDate(b.jy, b.jm, b.jd)
    return Math.round((da.getTime() - db.getTime()) / 86400000)
  } catch {
    return 0
  }
}

function monthLabelNow(): string {
  const t = todayJalaliDash()
  const jy = Number(t.slice(0, 4))
  const jm = Number(t.slice(5, 7))
  return `${JALALI_MONTHS[jm - 1]} ${toFaDigits(jy)}`
}

export { monthLabelNow }

export interface ChequeRow {
  id: string
  number: string
  amount: number
  status: string
  recipient: string | null
  sayadSerial: string | null
  selfIssued: boolean
  writtenAt: string | null
  dueDate: string
  note: string | null
  orderCode: string | null
  historyJson: string
  createdAt: Date
  updatedAt: Date
}

export function chequeOut(c: ChequeRow): Record<string, unknown> {
  return {
    id: c.id,
    number: c.number,
    amount: c.amount,
    status: c.status,
    recipient: c.recipient,
    sayadSerial: c.sayadSerial,
    selfIssued: c.selfIssued,
    writtenAt: c.writtenAt,
    dueDate: c.dueDate,
    note: c.note,
    orderCode: c.orderCode,
    history: safeJson<HistoryEntry[]>(c.historyJson, []),
    daysLeft: daysLeftOf(c.dueDate),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

/** stats are always computed over the whole cheque book (matches live capture) */
async function chequeStats() {
  const all = await db.cheque.findMany({ select: { status: true, amount: true, updatedAt: true } })
  const monthKey = todayJalaliDash().slice(0, 7)
  const bucket = (statuses: string[]) => {
    const rows = all.filter((c) => statuses.includes(c.status))
    return { count: rows.length, amount: rows.reduce((s, c) => s + c.amount, 0) }
  }
  const clearedMonth = all.filter(
    (c) => c.status === 'CLEARED' && formatJalaliDash(c.updatedAt).slice(0, 7) === monthKey,
  )
  return {
    pendingOwner: bucket(['PENDING_OWNER']),
    inTransit: bucket(['SIGNED', 'DELIVERED']),
    clearedThisMonth: {
      count: clearedMonth.length,
      amount: clearedMonth.reduce((s, c) => s + c.amount, 0),
    },
    bouncedRejected: bucket(['BOUNCED', 'REJECTED', 'RETURNED']),
    total: { count: all.length },
  }
}

/** GET /api/cheques?status=&q= → {items, stats} */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(me, 'finance/cheques')
  if (!gate.ok) return fail(gate.deny, 403)

  const url = new URL(req.url)
  const status = (url.searchParams.get('status') || '').trim()
  const q = (url.searchParams.get('q') || '').trim()

  const where: Record<string, unknown> = {}
  if (status) {
    const list = status.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    if (list.length) where.status = { in: list }
  }
  if (q) {
    where.OR = [
      { number: { contains: q } },
      { recipient: { contains: q } },
      { orderCode: { contains: q } },
      { sayadSerial: { contains: q } },
      { note: { contains: q } },
    ]
  }

  const rows = await db.cheque.findMany({
    where,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  })

  return ok({ items: rows.map(chequeOut), stats: await chequeStats() })
}

/** POST /api/cheques — {number, amount, dueDate, recipient, selfIssued, sayadSerial?, orderCode?, note?} */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(me, 'finance/cheques')
  if (!gate.ok) return fail(gate.deny, 403)

  const body = await req.json().catch(() => null)
  if (!body) return fail('درخواست نامعتبر است')

  const number = String(body.number ?? '').trim()
  if (!number) return fail('شماره چک را وارد کنید')
  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount <= 0) return fail('مبلغ چک را وارد کنید')
  const dueDate = String(body.dueDate ?? '').trim().replace(/\//g, '-')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return fail('تاریخ سررسید را وارد کنید')

  const recipient = String(body.recipient ?? '').trim() || null
  const selfIssued = body.selfIssued === undefined ? true : !!body.selfIssued
  const sayadSerial = String(body.sayadSerial ?? '').trim() || null
  const orderCode = String(body.orderCode ?? '').trim() || null
  const note = String(body.note ?? '').trim() || null

  const history: HistoryEntry[] = [
    {
      at: new Date().toISOString(),
      by: me.fullName,
      action: 'create',
      detail: selfIssued ? 'چک صادره (منتشرشده توسط فروشگاه)' : 'چک دریافتنی از مشتری/طرف حساب',
    },
  ]

  const created = await db.cheque.create({
    data: {
      number,
      amount,
      status: 'PENDING_OWNER',
      recipient,
      sayadSerial,
      selfIssued,
      writtenAt: todayJalaliDash(),
      dueDate,
      note,
      orderCode,
      historyJson: JSON.stringify(history),
    },
  })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'cheque.create',
    actionLabel: 'ثبت چک',
    category: 'finance',
    detail: `${number} — ${toFaDigits(String(amount))} ریال — سررسید ${dueDate}`,
    entityId: created.id,
  })
  await db.notification.create({
    data: {
      role: 'GM',
      kind: 'cheque',
      severity: 'info',
      title: 'چک جدید در انتظار امضا',
      body: `${number} — سررسید ${toFaDigits(dueDate)}`,
      go: '#/finance/cheques',
    },
  })

  return ok(chequeOut(created as unknown as ChequeRow))
}
