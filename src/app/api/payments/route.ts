import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { todayJalaliDash, formatJalaliDash, toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const KINDS = ['CASH', 'POS', 'TRANSFER']

function monthLabelNow(): string {
  const t = todayJalaliDash()
  const jy = Number(t.slice(0, 4))
  const jm = Number(t.slice(5, 7))
  return `${JALALI_MONTHS[jm - 1]} ${toFaDigits(jy)}`
}

/**
 * GET /api/payments?kind=&q=
 * → {items, stats:{byKind:{CASH,POS,TRANSFER}, monthTotal}, monthLabel}
 * items honour kind/q; stats summarise the current Jalali month (whole book).
 */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const url = new URL(req.url)
  const kind = (url.searchParams.get('kind') || '').trim().toUpperCase()
  const q = (url.searchParams.get('q') || '').trim()

  const where: Record<string, unknown> = {}
  if (kind && KINDS.includes(kind)) where.kind = kind
  if (q) {
    where.OR = [
      { supplierName: { contains: q } },
      { orderCode: { contains: q } },
      { note: { contains: q } },
      { holooReceiptNo: { contains: q } },
    ]
  }

  const items = await db.payment.findMany({ where, orderBy: { createdAt: 'desc' } })

  const monthKey = todayJalaliDash().slice(0, 7)
  const monthRows = await db.payment.findMany()
  const monthPayments = monthRows.filter((p) => formatJalaliDash(p.createdAt).slice(0, 7) === monthKey)

  const byKind: Record<string, { count: number; amount: number }> = {}
  for (const k of KINDS) {
    const rows = monthPayments.filter((p) => p.kind === k)
    byKind[k] = { count: rows.length, amount: rows.reduce((s, p) => s + p.amount, 0) }
  }

  return ok({
    items: items.map((p) => ({
      id: p.id,
      kind: p.kind,
      amount: p.amount,
      supplierName: p.supplierName,
      orderCode: p.orderCode,
      note: p.note,
      holooReceiptNo: p.holooReceiptNo,
      createdBy: p.createdBy,
      createdAt: p.createdAt.toISOString(),
    })),
    stats: {
      byKind,
      monthTotal: monthPayments.reduce((s, p) => s + p.amount, 0),
    },
    monthLabel: monthLabelNow(),
  })
}

/** POST /api/payments — {kind, amount, supplierName?, orderCode?, holooReceiptNo?, note?} */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const body = await req.json().catch(() => null)
  if (!body) return fail('درخواست نامعتبر است')

  const kind = String(body.kind ?? '').trim().toUpperCase()
  if (!KINDS.includes(kind)) return fail('نوع پرداخت نامعتبر است')
  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount <= 0) return fail('مبلغ پرداخت را وارد کنید')

  const supplierName = String(body.supplierName ?? '').trim() || null
  const orderCode = String(body.orderCode ?? '').trim() || null
  const holooReceiptNo = String(body.holooReceiptNo ?? '').trim() || null
  const note = String(body.note ?? '').trim() || null

  if (kind === 'TRANSFER' && !supplierName && !orderCode) {
    return fail('برای انتقال بانکی، طرف حساب یا کد سفارش را وارد کنید')
  }

  const created = await db.payment.create({
    data: {
      kind,
      amount,
      supplierName,
      orderCode,
      holooReceiptNo,
      note,
      createdById: me.id,
      createdBy: me.fullName,
    },
  })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'payment.create',
    actionLabel: 'ثبت پرداخت',
    category: 'finance',
    detail: `${kind} — ${toFaDigits(String(amount))} ریال${supplierName ? ` — ${supplierName}` : ''}`,
    entityId: created.id,
  })

  return ok({
    id: created.id,
    kind: created.kind,
    amount: created.amount,
    supplierName: created.supplierName,
    orderCode: created.orderCode,
    note: created.note,
    holooReceiptNo: created.holooReceiptNo,
    createdBy: created.createdBy,
    createdAt: created.createdAt.toISOString(),
  })
}
