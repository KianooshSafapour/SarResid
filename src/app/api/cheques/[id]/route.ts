import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canSignChequesUser } from '@/lib/access'
import { toFaDigits } from '@/lib/jalali'
import { chequeOut, FINANCE_ROLES, type HistoryEntry, type ChequeRow } from '../route'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** live state machine (chunk CHEQUE_TRANSITIONS) */
const TRANSITIONS: Record<
  string,
  { from: string[]; to: string; reason?: 'required' | 'optional'; sign?: boolean }
> = {
  sign: { from: ['PENDING_OWNER'], to: 'SIGNED', sign: true },
  deliver: { from: ['SIGNED'], to: 'DELIVERED' },
  clear: { from: ['SIGNED', 'DELIVERED'], to: 'CLEARED' },
  reject: { from: ['PENDING_OWNER', 'SIGNED', 'DELIVERED'], to: 'REJECTED', reason: 'required' },
  bounce: { from: ['SIGNED', 'DELIVERED'], to: 'BOUNCED', reason: 'required' },
  return: { from: ['SIGNED', 'DELIVERED'], to: 'RETURNED', reason: 'optional' },
}

/** PATCH /api/cheques/[id] — {action, reason?, …editFields} */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const { id } = await ctx.params
  const row = await db.cheque.findUnique({ where: { id } })
  if (!row) return fail('چک یافت نشد', 404)

  const body = await req.json().catch(() => null)
  if (!body) return fail('درخواست نامعتبر است')
  const action = String(body.action ?? '').trim()

  const history = safeJson<HistoryEntry[]>(row.historyJson, [])

  if (action === 'edit') {
    if (!FINANCE_ROLES.includes(me.role)) return fail('شما مجاز به ویرایش چک نیستید', 403)
    if (row.status !== 'PENDING_OWNER') return fail('فقط چک‌های «در انتظار امضا» قابل ویرایش هستند')

    const number = String(body.number ?? row.number).trim()
    if (!number) return fail('شماره چک را وارد کنید')
    const amount = Number(body.amount ?? row.amount)
    if (!Number.isFinite(amount) || amount <= 0) return fail('مبلغ چک را وارد کنید')
    const dueDate = String(body.dueDate ?? row.dueDate).trim().replace(/\//g, '-')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return fail('تاریخ سررسید را وارد کنید')

    const data = {
      number,
      amount,
      dueDate,
      recipient: body.recipient === undefined ? row.recipient : String(body.recipient ?? '').trim() || null,
      selfIssued: body.selfIssued === undefined ? row.selfIssued : !!body.selfIssued,
      sayadSerial: body.sayadSerial === undefined ? row.sayadSerial : String(body.sayadSerial ?? '').trim() || null,
      orderCode: body.orderCode === undefined ? row.orderCode : String(body.orderCode ?? '').trim() || null,
      note: body.note === undefined ? row.note : String(body.note ?? '').trim() || null,
    }
    history.push({ at: new Date().toISOString(), by: me.fullName, action: 'edit', detail: 'ویرایش اطلاعات چک' })
    const updated = await db.cheque.update({
      where: { id },
      data: { ...data, historyJson: JSON.stringify(history) },
    })
    await logActivity({
      userId: me.id,
      userName: me.fullName,
      action: 'cheque.edit',
      actionLabel: 'ویرایش چک',
      category: 'finance',
      detail: `${number} — سررسید ${toFaDigits(dueDate)}`,
      entityId: id,
    })
    return ok(chequeOut(updated as unknown as ChequeRow))
  }

  const t = TRANSITIONS[action]
  if (!t) return fail('عملیات نامعتبر است')

  if (t.sign) {
    if (!(await canSignChequesUser(me))) return fail('امضا فقط توسط مدیرعامل/مدیرکل/مدیر عملیات انجام می‌شود', 403)
  } else if (!FINANCE_ROLES.includes(me.role)) {
    return fail('شما مجاز به این عملیات نیستید', 403)
  }

  if (!t.from.includes(row.status)) {
    return fail('این عملیات در وضعیت فعلی چک مجاز نیست')
  }

  const reason = String(body.reason ?? '').trim()
  if (t.reason === 'required' && !reason) return fail('دلیل این عملیات الزامی است')

  history.push({
    at: new Date().toISOString(),
    by: me.fullName,
    action,
    ...(reason ? { detail: reason } : {}),
  })

  const updated = await db.cheque.update({
    where: { id },
    data: { status: t.to, historyJson: JSON.stringify(history) },
  })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: `cheque.${action}`,
    actionLabel: 'گردش چک',
    category: 'finance',
    detail: `${row.number} — ${action}${reason ? ` — ${reason}` : ''}`,
    entityId: id,
  })

  return ok(chequeOut(updated as unknown as ChequeRow))
}

/** DELETE /api/cheques/[id] — only unsigned (PENDING_OWNER) cheques */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!FINANCE_ROLES.includes(me.role)) return fail('شما مجاز به حذف چک نیستید', 403)

  const { id } = await ctx.params
  const row = await db.cheque.findUnique({ where: { id } })
  if (!row) return fail('چک یافت نشد', 404)
  if (row.status !== 'PENDING_OWNER') {
    return fail('فقط چک‌های در انتظار امضا قابل حذف هستند')
  }

  await db.cheque.delete({ where: { id } })
  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'cheque.delete',
    actionLabel: 'حذف چک',
    category: 'finance',
    detail: `${row.number} — سررسید ${toFaDigits(row.dueDate)}`,
    entityId: id,
  })
  return ok({ id })
}
