import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canRecordReturnPaymentUser } from '@/lib/access'
import { toFaDigits } from '@/lib/jalali'
import { queueSms, renderTemplate, normalizeMobile } from '@/lib/sms'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/returns/[id]/payment — record the card-to-card transfer payment.
 * Body: {bankName, cardNumber?, referenceNumber?, transferredAt}
 * Sets the return to `paid` and stores a ReturnPayment (bank details as JSON in note).
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canRecordReturnPaymentUser(me))) return fail('شما مجاز به ثبت پرداخت مرجوعی نیستید', 403)

  const { id } = await ctx.params
  const r = await db.returnRequest.findUnique({ where: { id } })
  if (!r) return fail('مرجوعی یافت نشد', 404)
  if (r.status === 'paid') return fail('پرداخت این مرجوعی قبلاً ثبت شده است')
  if (r.status !== 'approved') return fail('ابتدا مرجوعی باید تأیید شود')

  const body = await req.json().catch(() => null)
  if (!body) return fail('درخواست نامعتبر است')

  const bankName = String(body.bankName ?? '').trim()
  if (!bankName) return fail('نام بانک را انتخاب کنید')

  const cardNumber = String(body.cardNumber ?? '').replace(/\D/g, '')
  const referenceNumber = String(body.referenceNumber ?? '').trim() || null
  const transferredAt = String(body.transferredAt ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transferredAt.replace(/\//g, '-'))) {
    return fail('تاریخ انتقال معتبر نیست (فرمت: ۱۴۰۴-۱۰-۲۰)')
  }

  const existing = await db.returnPayment.findFirst({ where: { returnId: id } })
  if (existing) return fail('پرداخت این مرجوعی قبلاً ثبت شده است')

  const amount = r.transferAmount
  if (amount <= 0) return fail('این مرجوعی بابت پرداخت به کارت مبلغی ندارد')

  const pay = await db.returnPayment.create({
    data: {
      returnId: id,
      kind: 'TRANSFER',
      amount,
      note: JSON.stringify({
        bankName,
        accountNumber: null,
        cardNumber: cardNumber.length === 16 ? cardNumber : cardNumber || null,
        referenceNumber,
        transferredAt,
        recordedBy: me.fullName,
      }),
    },
  })

  await db.returnRequest.update({ where: { id }, data: { status: 'paid' } })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'return.payment',
    actionLabel: 'ثبت پرداخت مرجوعی',
    category: 'returns',
    detail: `${r.code} — ${bankName} — ${toFaDigits(String(amount))} ریال`,
    entityId: id,
  })
  await db.notification.create({
    data: {
      role: 'HC',
      kind: 'return',
      severity: 'info',
      title: 'پرداخت مرجوعی ثبت شد',
      body: `${r.code} — ${bankName} — ${toFaDigits(String(amount))} ریال`,
      go: '#/returns/history',
    },
  })

  // R4-5 — سناریوی پیامک: اطلاع پرداخت مرجوعی به ثبت‌کننده/تأییدکننده + مدیران
  try {
    const tpl = await db.smsTemplate.findUnique({ where: { key: 'RETURN_PAYMENT' } })
    if (!tpl || tpl.enabled) {
      const tplBody = tpl?.body || 'پرداخت مرجوعی {code} به مبلغ {amount} ثبت شد. — هایپر زیتون'
      const text = renderTemplate(tplBody, {
        code: r.code,
        amount: toFaDigits(Number(amount).toLocaleString('en-US')),
        by: me.fullName,
      })
      const linkedIds = [me.id]
      if (r.cashierId) linkedIds.push(r.cashierId)
      if (r.approvedById) linkedIds.push(r.approvedById)
      const recipients = await db.user.findMany({
        where: { active: true, OR: [{ role: { in: ['OWNER', 'GM', 'ADMIN', 'EXEC'] } }, { id: { in: linkedIds } }] },
        select: { id: true, fullName: true, phone: true },
      })
      const seen = new Set<string>()
      for (const rc of recipients) {
        const phone = normalizeMobile(rc.phone)
        if (!phone || seen.has(phone)) continue
        seen.add(phone)
        await queueSms('RETURN_PAYMENT', phone, text, id, rc.fullName)
      }
    }
  } catch {
    // پیامک هرگز نباید جریان ثبت پرداخت مرجوعی را متوقف کند
  }

  return ok({
    amount: pay.amount,
    bankName,
    accountNumber: null,
    cardNumber: cardNumber.length === 16 ? cardNumber : cardNumber || null,
    referenceNumber,
    transferredAt,
    recordedBy: me.fullName,
    createdAt: pay.createdAt.toISOString(),
  })
}
