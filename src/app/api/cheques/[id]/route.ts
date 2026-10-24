import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canSignChequesUser } from '@/lib/access'
import { toFaDigits } from '@/lib/jalali'
import { chequeOut, FINANCE_ROLES, sanitizeMeta, upsertChequeMeta, loadChequeMetas, type HistoryEntry, type ChequeRow } from '../route'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** وضعیت‌های مجاز برای ویرایش/تنظیم دستی وضعیت */
const ALL_STATUSES = ['PENDING_OWNER', 'SIGNED', 'DELIVERED', 'CLEARED', 'REJECTED', 'BOUNCED', 'RETURNED', 'UNCOLLECTED', 'WRITTEN']

/** live state machine (chunk CHEQUE_TRANSITIONS) + R5-G: UNCOLLECTED برمی‌گردد به گردش */
const TRANSITIONS: Record<
  string,
  { from: string[]; to: string; reason?: 'required' | 'optional'; sign?: boolean }
> = {
  sign: { from: ['PENDING_OWNER'], to: 'SIGNED', sign: true },
  deliver: { from: ['SIGNED', 'UNCOLLECTED'], to: 'DELIVERED' },
  clear: { from: ['SIGNED', 'DELIVERED', 'UNCOLLECTED'], to: 'CLEARED' },
  reject: { from: ['PENDING_OWNER', 'SIGNED', 'DELIVERED'], to: 'REJECTED', reason: 'required' },
  bounce: { from: ['SIGNED', 'DELIVERED'], to: 'BOUNCED', reason: 'required' },
  return: { from: ['SIGNED', 'DELIVERED'], to: 'RETURNED', reason: 'optional' },
}

/** اطلاع‌رسانی به مدیر کل بعد از تصمیم مالک (امضا/رد) — گردش کار new-4.txt سطر ۲۱ */
async function notifyGM(title: string, bodyTxt: string) {
  await db.notification.create({
    data: { role: 'GM', kind: 'cheque', severity: 'info', title, body: bodyTxt, go: '#/finance/cheques' },
  })
}

/** '1405-07-30' → '۱۴۰۵/۰۷/۳۰' (نمایش فارسی با ممیز) */
function faSlashDash(d: string): string {
  return toFaDigits(String(d || '').replace(/-/g, '/'))
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
    // R5-G (new-4.txt سطر ۱۵۶): چک‌ها باید قابل اصلاح باشند — ویرایش در هر وضعیتی، با ثبت در تاریخچه

    const number = String(body.number ?? row.number).trim()
    if (!number) return fail('شماره چک را وارد کنید')
    const amount = Number(body.amount ?? row.amount)
    if (!Number.isFinite(amount) || amount <= 0) return fail('مبلغ چک را وارد کنید')
    const dueDate = String(body.dueDate ?? row.dueDate).trim().replace(/\//g, '-')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return fail('تاریخ سررسید را وارد کنید')

    const data: Record<string, unknown> = {
      number,
      amount,
      dueDate,
      recipient: body.recipient === undefined ? row.recipient : String(body.recipient ?? '').trim() || null,
      selfIssued: body.selfIssued === undefined ? row.selfIssued : !!body.selfIssued,
      sayadSerial: body.sayadSerial === undefined ? row.sayadSerial : String(body.sayadSerial ?? '').trim() || null,
      orderCode: body.orderCode === undefined ? row.orderCode : String(body.orderCode ?? '').trim() || null,
      note: body.note === undefined ? row.note : String(body.note ?? '').trim() || null,
      writtenAt: body.writtenAt === undefined ? row.writtenAt : (/^\d{4}-\d{2}-\d{2}$/.test(String(body.writtenAt).replace(/\//g, '-')) ? String(body.writtenAt).replace(/\//g, '-') : row.writtenAt),
    }

    // تغییر وضعیت دستی توسط مدیر (اختیاری) — با سابقه
    const wantStatus = String(body.status ?? '').trim().toUpperCase()
    if (wantStatus && wantStatus !== row.status) {
      if (!ALL_STATUSES.includes(wantStatus)) return fail('وضعیت نامعتبر است')
      if (row.status === 'CLEARED' && wantStatus !== 'CLEARED') {
        // وصول‌شده فقط با تأیید مدیر ارشد قابل بازگشت است
        if (!['OWNER', 'GM', 'ADMIN'].includes(me.role)) return fail('بازگشت وضعیت وصول‌شده فقط توسط مدیران ارشد مجاز است', 403)
      }
      data.status = wantStatus
      history.push({ at: new Date().toISOString(), by: me.fullName, action: 'status', detail: `وضعیت: ${row.status} → ${wantStatus}` })
    }

    const changed: string[] = []
    if (amount !== row.amount) changed.push('مبلغ')
    if (dueDate !== row.dueDate) changed.push('سررسید')
    if (data.recipient !== row.recipient) changed.push('گیرنده')
    if (data.note !== (row.note ?? null)) changed.push('یادداشت')
    history.push({ at: new Date().toISOString(), by: me.fullName, action: 'edit', detail: changed.length ? `ویرایش اطلاعات چک (${changed.join('، ')})` : 'ویرایش اطلاعات چک' })
    const updated = await db.cheque.update({
      where: { id },
      data: { ...data, historyJson: JSON.stringify(history) },
    })

    // اطلاعات گیرنده/صدور (KV cheque:meta:<id>) — بدون تغییر اسکیما
    if (body.meta !== undefined) {
      const meta = sanitizeMeta(body.meta)
      await upsertChequeMeta(id, meta)
    }

    await logActivity({
      userId: me.id,
      userName: me.fullName,
      action: 'cheque.edit',
      actionLabel: 'ویرایش چک',
      category: 'finance',
      detail: `${number} — سررسید ${toFaDigits(dueDate).replace(/-/g, '/')}`,
      entityId: id,
    })
    const metas = await loadChequeMetas([id])
    return ok({ ...chequeOut(updated as unknown as ChequeRow), meta: metas[id] || null })
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

  // تحویل چک — اطلاعات دریافت‌کننده و تاریخ/ساعت تحویل (new-4.txt سطر ۵۶)
  let deliverMeta: ReturnType<typeof sanitizeMeta> = null
  if (action === 'deliver' && body.meta !== undefined) {
    deliverMeta = sanitizeMeta(body.meta)
  }

  history.push({
    at: new Date().toISOString(),
    by: me.fullName,
    action,
    ...(reason ? { detail: reason } : {}),
    ...(action === 'deliver' && deliverMeta?.receiverName
      ? { detail: `تحویل به ${deliverMeta.receiverName}${deliverMeta.receiverPhone ? ` (${toFaDigits(deliverMeta.receiverPhone)})` : ''}${deliverMeta.issuedAt ? ` — ${faSlashDash(deliverMeta.issuedAt)}${deliverMeta.issuedTime ? ` ساعت ${toFaDigits(deliverMeta.issuedTime)}` : ''}` : ''}` }
      : {}),
  })

  const updated = await db.cheque.update({
    where: { id },
    data: { status: t.to, historyJson: JSON.stringify(history) },
  })

  // ثبت/ادغام اطلاعات گیرنده و صدور در KV cheque:meta:<id> (فقط تحویل)
  if (action === 'deliver' && body.meta !== undefined) {
    const prevRow = await db.setting.findUnique({ where: { key: `cheque:meta:${id}` } })
    const prev = safeJson<Record<string, unknown>>(prevRow?.value, {})
    const merged = { ...prev, ...(deliverMeta || {}) }
    await upsertChequeMeta(id, sanitizeMeta(merged))
  }

  // R5-G: تصمیم مالک → اطلاع به مدیر کل (new-4.txt سطر ۲۱)
  if (action === 'sign') {
    await notifyGM('چک امضا شد', `چک ${row.number} توسط ${me.fullName} امضا شد — سررسید ${faSlashDash(row.dueDate)}`)
  } else if (action === 'reject') {
    await notifyGM('چک رد شد', `چک ${row.number} رد شد: ${reason || '—'} (تصمیم: ${me.fullName})`)
  }

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: `cheque.${action}`,
    actionLabel: 'گردش چک',
    category: 'finance',
    detail: `${row.number} — ${action}${reason ? ` — ${reason}` : ''}`,
    entityId: id,
  })

  const metas = await loadChequeMetas([id])
  return ok({ ...chequeOut(updated as unknown as ChequeRow), meta: metas[id] || null })
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
  await db.setting.deleteMany({ where: { key: `cheque:meta:${id}` } })
  await db.notification.deleteMany({ where: { kind: `cheque:uncollected:${id}` } }).catch(() => null)
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
