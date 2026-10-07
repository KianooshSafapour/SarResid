import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { addDaysIso, todayIso } from '@/lib/jalali'
import { hasCap } from '@/lib/rbac'
import { computeDisposeAfterIso, LIFECYCLE_VALUES, normalizeFiscalYear } from '@/lib/archive-records'

/**
 * PATCH — عملیات روی سند آرشیو (custody chain + record continuity).
 * عملیات فیزیکی (امانت/بازگشت/جابه‌جایی) + چرخهٔ حیات ISO 15489 (ویرایش، رخدادهای مالی/هلو،
 * مرجوعی/مردود/کسری، درخواست و تأیید دومِ دفع، نگهداری حقوقی، تغییر مرحلهٔ حیات).
 * اصل مدیریت اسناد: رکوردها هرگز حذف نمی‌شوند — DISPOSED فقط وضعیت است.
 */

const REGISTER_ROLES = ['GM', 'OM', 'ACC', 'OWNER', 'SK', 'ADMIN']
const DISPOSAL_APPROVER_ROLES = ['ACC', 'OM', 'GM', 'OWNER', 'ADMIN']

const EVENT_KINDS = [
  'DELIVERY', 'PAYMENT_POS', 'PAYMENT_CHEQUE', 'PAYMENT_CASH', 'PAYMENT_TRANSFER',
  'RETURN', 'REJECT', 'SHORTAGE', 'HOLOO_INVOICE', 'HOLOO_RECEIPT', 'NOTE',
]
const EVENT_KIND_LABELS: Record<string, string> = {
  DELIVERY: 'تحویل کالا', PAYMENT_POS: 'پرداخت کارتخوان (POS)', PAYMENT_CHEQUE: 'پرداخت چک',
  PAYMENT_CASH: 'پرداخت نقدی', PAYMENT_TRANSFER: 'پرداخت کارت‌به‌کارت', RETURN: 'مرجوعی',
  REJECT: 'مردود', SHORTAGE: 'کسری/نیامده', HOLOO_INVOICE: 'ثبت فاکتور در هلو',
  HOLOO_RECEIPT: 'ثبت رسید پرداخت در هلو', NOTE: 'یادداشت',
}

/** sensitive ops — cap آرشیو یا نقش اجرایی (rbac) */
async function canAdmin(me: { id: string; role: string; secondaryRoles: string[]; roleIds?: string }): Promise<boolean> {
  if (isExec(me.role)) return true
  return hasCap(me as any, 'archive.manage')
}
function isExec(role: string): boolean {
  return ['OWNER', 'GM', 'OM', 'ADMIN'].includes(role)
}

async function resolveRep(repId: string, repName: string): Promise<{ repId: string; repName: string }> {
  const id = String(repId || '')
  let name = String(repName || '').trim()
  if (id && !name) {
    const rep = await db.salesRep.findUnique({ where: { id } })
    if (rep) name = rep.fullName
  }
  return { repId: id, repName: name }
}

function parseItemsJson(s: string): any[] {
  try {
    const arr = JSON.parse(s || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { id } = await params
  const body = await req.json()
  const doc = await db.archiveDoc.findUnique({ where: { id } })
  if (!doc) return fail('سند یافت نشد', 404)
  const action = String(body.action || '')

  const custody = (docAction: string, detail: string, extra: Record<string, unknown> = {}) =>
    db.archiveCustody.create({
      data: { docId: id, docCode: doc.code, action: docAction, userId: me.id, userName: me.name, detail, ...extra },
    })

  // ── physical custody: borrow (outguide / charge-out pattern) ──
  if (action === 'borrow') {
    if (doc.status !== 'IN_BINDER') return fail('سند در وضعیت قابل امانت نیست', 400)
    const dueBackIso = String(body.dueBackIso || addDaysIso(7))
    const updated = await db.archiveDoc.update({
      where: { id },
      data: {
        status: 'BORROWED',
        borrowById: me.id,
        borrowByName: String(body.byName || me.name),
        borrowAt: new Date().toISOString(),
      },
    })
    await custody('BORROW', `امانت به ${String(body.byName || me.name)} — مهلت بازگشت ثبت شد`, { dueBackIso })
    await logActivity(me, 'امانت سند آرشیو', 'archive-doc', id, `${doc.code} — مهلت بازگشت: ${dueBackIso}`)
    return json({ doc: updated })
  }

  if (action === 'return') {
    if (doc.status !== 'BORROWED') return fail('سند امانتی نیست', 400)
    const updated = await db.archiveDoc.update({
      where: { id },
      data: { status: 'IN_BINDER', borrowById: '', borrowByName: '', borrowAt: '' },
    })
    await custody('RETURN', `بازگشت سند به زونکن ${doc.binderCode} (امانت‌گیرندهٔ پیشین: ${doc.borrowByName || '—'})`)
    await logActivity(me, 'بازگشت سند امانتی به آرشیو', 'archive-doc', id, doc.code)
    return json({ doc: updated })
  }

  if (action === 'move') {
    if (!['GM', 'OM', 'ACC', 'OWNER'].includes(me.role))
      return fail('تنها مدیریت مجاز به جابه‌جایی سند است', 403)
    const binder = await db.archiveBinder.findUnique({ where: { id: String(body.binderId || '') } })
    if (!binder) return fail('زونکن مقصد یافت نشد', 404)
    const docCounts = await db.archiveDoc.groupBy({ by: ['binderId'], _count: { _all: true }, where: { status: { not: 'DESTROYED' }, binderId: binder.id } })
    const seq = (docCounts[0]?._count._all || 0) + 1
    const updated = await db.archiveDoc.update({
      where: { id },
      data: { binderId: binder.id, binderCode: binder.code, seq, notes: `${doc.notes} | جابه‌جایی به ${binder.code}`.trim() },
    })
    await custody('MOVE', `جابه‌جایی از زونکن ${doc.binderCode} به ${binder.code} — جایگاه ${seq}`)
    await logActivity(me, 'جابه‌جایی سند بین زونکن‌ها', 'archive-doc', id, `${doc.binderCode} → ${binder.code}`)
    return json({ doc: updated })
  }

  // append invoice line items to an existing document (post-intake completion of the product record)
  if (action === 'add-items' || action === 'add-item') {
    if (!REGISTER_ROLES.includes(me.role))
      return fail('اجازهٔ افزودن اقلام به سند را ندارید', 403)
    const raw: any[] = action === 'add-item' && body.item ? [body.item] : Array.isArray(body.items) ? body.items : action === 'add-item' ? [body] : []
    const rows: any[] = []
    for (const it of raw) {
      const name = String(it?.productName || it?.name || '').trim()
      if (!name) return fail('نام کالا برای هر ردیف الزامی است', 400)
      rows.push({
        docId: id,
        productId: String(it?.productId || ''),
        productName: name,
        barcode: String(it?.barcode || ''),
        qty: Number(it?.qty) || 0,
        unit: String(it?.unit || 'عدد'),
        unitPrice: Number(it?.unitPrice) || 0,
        expiryDate: String(it?.expiryDate || ''),
        returned: Boolean(it?.returned),
        returnReason: String(it?.returnReason || ''),
        rejected: Boolean(it?.rejected),
        rejectReason: String(it?.rejectReason || ''),
        missing: Boolean(it?.missing),
      })
    }
    if (!rows.length) return fail('ردیفی برای افزودن ارسال نشده است', 400)
    await db.archiveDocItem.createMany({ data: rows })
    await logActivity(me, 'افزودن اقلام به سند آرشیو', 'archive-doc', id, `${doc.code} — ${rows.length} ردیف`)
    const items = await db.archiveDocItem.findMany({ where: { docId: id } })
    return json({ doc, items, itemsCreated: rows.length })
  }

  // mark a line item as returned / rejected / missing — the owner's visibility demand:
  // flagged rows POP OUT IN RED with the reason, and a DocEvent is appended automatically
  if (action === 'edit-item') {
    if (!REGISTER_ROLES.includes(me.role))
      return fail('اجازهٔ ویرایش اقلام سند را ندارید', 403)
    const itemId = String(body.itemId || '')
    const item = await db.archiveDocItem.findUnique({ where: { id: itemId } })
    if (!item || item.docId !== id) return fail('ردیف کالا یافت نشد', 404)

    const returned = body.returned === undefined ? item.returned : Boolean(body.returned)
    const returnReason = String(body.returnReason ?? item.returnReason ?? '')
    const rejected = body.rejected === undefined ? item.rejected : Boolean(body.rejected)
    const rejectReason = String(body.rejectReason ?? item.rejectReason ?? '')
    const missing = body.missing === undefined ? item.missing : Boolean(body.missing)
    await db.archiveDocItem.update({
      where: { id: itemId },
      data: { returned, returnReason, rejected, rejectReason, missing },
    })

    const { repId, repName } = await resolveRep(String(body.repId || ''), String(body.repName || ''))
    const nowIso = new Date().toISOString()
    // auto DocEvent per newly-raised flag (با دلیل + نمایندهٔ طرف حساب)
    const autoEvents: { kind: string; reason: string }[] = []
    if (returned && !item.returned) autoEvents.push({ kind: 'RETURN', reason: returnReason })
    if (rejected && !item.rejected) autoEvents.push({ kind: 'REJECT', reason: rejectReason })
    if (missing && !item.missing) autoEvents.push({ kind: 'SHORTAGE', reason: returnReason || rejectReason || String(body.missingReason || '') })
    for (const ev of autoEvents) {
      await db.docEvent.create({
        data: {
          docId: id, docCode: doc.code, kind: ev.kind, at: nowIso, repId, repName,
          note: ev.reason ? `«${item.productName}» — ${ev.reason}` : `«${item.productName}»`,
          items: JSON.stringify([{ productName: item.productName, qty: item.qty, reason: ev.reason }]),
          createdById: me.id, createdByName: me.name,
        },
      })
    }
    if (autoEvents.length) await logActivity(me, 'علامت‌گذاری قلم سند (مرجوعی/مردود/نیامده)', 'archive-doc', id, `${doc.code} — ${item.productName}`)
    const items = await db.archiveDocItem.findMany({ where: { docId: id } })
    return json({ doc, items })
  }

  // ── full document edit (شناسنامه + مالی + هلو + نماینده + نگهداری) ──
  if (action === 'edit') {
    if (!REGISTER_ROLES.includes(me.role))
      return fail('اجازهٔ ویرایش سند را ندارید', 403)
    const data: Record<string, unknown> = {}
    const changed: string[] = []

    const strField = (key: string, apply: (v: string) => unknown) => {
      if (body[key] !== undefined) {
        const v = String(body[key] ?? '').trim()
        if (v !== String((doc as any)[key] ?? '')) changed.push(key)
        data[key] = apply(v)
      }
    }

    strField('title', (v) => v)
    strField('party', (v) => v)
    if (body.docType !== undefined && String(body.docType) !== doc.docType) { data.docType = String(body.docType); changed.push('docType') }
    if (body.amount !== undefined && Number(body.amount) !== doc.amount) { data.amount = Number(body.amount) || 0; changed.push('amount') }
    strField('docDate', (v) => v)
    strField('invoiceNo', (v) => v)
    strField('holooInvoiceNo', (v) => v)
    strField('holooReceiptNo', (v) => v)
    if (body.paymentStatus !== undefined && ['UNPAID', 'PARTIAL', 'PAID'].includes(String(body.paymentStatus)) && body.paymentStatus !== doc.paymentStatus) {
      data.paymentStatus = String(body.paymentStatus); changed.push('paymentStatus')
    }
    if (body.paidAmount !== undefined && Number(body.paidAmount) !== doc.paidAmount) { data.paidAmount = Number(body.paidAmount) || 0; changed.push('paidAmount') }
    strField('deliveryAt', (v) => v)
    strField('submittedAt', (v) => v)
    strField('notes', (v) => v)
    if (body.confidentiality !== undefined && ['PUBLIC', 'STAFF', 'MANAGEMENT'].includes(String(body.confidentiality)) && body.confidentiality !== doc.confidentiality) {
      data.confidentiality = String(body.confidentiality); changed.push('confidentiality')
    }
    if (body.partyId !== undefined) data.partyId = String(body.partyId || '')

    // lifecycle (manual progression allowed via edit too)
    if (body.lifecycle !== undefined && LIFECYCLE_VALUES.includes(String(body.lifecycle)) && body.lifecycle !== doc.lifecycle) {
      data.lifecycle = String(body.lifecycle); changed.push('lifecycle')
    }

    // نمایندهٔ طرف حساب
    if (body.repId !== undefined || body.repName !== undefined) {
      const { repId, repName } = await resolveRep(body.repId ?? doc.repId, body.repName ?? doc.repName)
      if (repId !== doc.repId || repName !== doc.repName) {
        data.repId = repId
        data.repName = repName
        changed.push('rep')
      }
    }

    // retention recompute — پایان مهلت دفع از لنگر قانونی «سال مالی» محاسبه می‌شود
    let fiscalYear = doc.fiscalYear
    let retentionYears = doc.retentionYears
    if (body.fiscalYear !== undefined) {
      const fy = normalizeFiscalYear(body.fiscalYear)
      if (fy !== doc.fiscalYear) { fiscalYear = fy; data.fiscalYear = fy; changed.push('fiscalYear') }
    }
    if (body.retentionYears !== undefined && Number(body.retentionYears) && Number(body.retentionYears) !== doc.retentionYears) {
      retentionYears = Number(body.retentionYears); data.retentionYears = retentionYears; changed.push('retentionYears')
    }
    if (data.fiscalYear !== undefined || data.retentionYears !== undefined) {
      data.disposeAfterIso = computeDisposeAfterIso(fiscalYear, retentionYears)
    }

    if (!Object.keys(data).length) return fail('تغییری برای ذخیره ارسال نشده است', 400)
    const updated = await db.archiveDoc.update({
      where: { id },
      data: { ...data, editedAt: new Date().toISOString(), editedByName: me.name },
    })
    await custody('EDIT', `ویرایش سند توسط ${me.name}${changed.length ? ` — فیلدها: ${changed.join('، ')}` : ''}`)
    await logActivity(me, 'ویرایش سند آرشیو', 'archive-doc', id, `${doc.code}${changed.length ? ` — ${changed.join('، ')}` : ''}`)
    return json({ doc: updated })
  }

  // ── doc event ledger (تحویل / پرداخت / مرجوعی / مردود / کسری / هلو / یادداشت) ──
  if (action === 'doc-event') {
    if (!REGISTER_ROLES.includes(me.role))
      return fail('اجازهٔ ثبت رخداد سند را ندارید', 403)
    const kind = String(body.kind || '')
    if (!EVENT_KINDS.includes(kind)) return fail('نوع رخداد نامعتبر است', 400)
    const at = String(body.at || new Date().toISOString())
    const amount = Number(body.amount) || 0
    const holooRef = String(body.holooRef || '').trim()
    const note = String(body.note || '').trim()
    const { repId, repName } = await resolveRep(String(body.repId || ''), String(body.repName || ''))

    const evItems = (Array.isArray(body.items) ? body.items : [])
      .map((it: any) => ({
        productName: String(it?.productName || '').trim(),
        qty: Number(it?.qty) || 0,
        reason: String(it?.reason || '').trim(),
      }))
      .filter((it: any) => it.productName)
    if (['RETURN', 'REJECT', 'SHORTAGE'].includes(kind) && !evItems.length)
      return fail('برای مرجوعی/مردود/کسری، حداقل یک قلم با نام کالا لازم است', 400)

    const data: Record<string, unknown> = {}
    if (kind.startsWith('PAYMENT')) {
      if (amount <= 0) return fail('مبلغ پرداخت باید بزرگ‌تر از صفر باشد', 400)
      const newPaid = doc.paidAmount + amount
      const newStatus = doc.amount > 0 && newPaid >= doc.amount - 0.5 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID'
      data.paidAmount = newPaid
      data.paymentStatus = newStatus
    }
    if (kind === 'DELIVERY') data.deliveryAt = at
    if (kind === 'HOLOO_INVOICE' && holooRef) data.holooInvoiceNo = holooRef
    if (kind === 'HOLOO_RECEIPT' && holooRef) data.holooReceiptNo = holooRef

    await db.docEvent.create({
      data: {
        docId: id, docCode: doc.code, kind, at, amount, repId, repName, holooRef, note,
        items: JSON.stringify(evItems), createdById: me.id, createdByName: me.name,
      },
    })

    if (Object.keys(data).length) await db.archiveDoc.update({ where: { id }, data })
    // custody mirror — مالی/تحویل/هلو در زنجیرهٔ custody هم ثبت می‌شود (append-only)
    if (kind.startsWith('PAYMENT')) {
      await custody('PAYMENT', `${EVENT_KIND_LABELS[kind]} — ${Math.round(amount).toLocaleString('fa-IR')} تومان${holooRef ? ` — رسید هلو: ${holooRef}` : ''}${repName ? ` — نماینده: ${repName}` : ''}`)
    } else if (kind === 'DELIVERY') {
      await custody('DELIVERY', `تحویل کالا${repName ? ` — نماینده: ${repName}` : ''}${note ? ` — ${note}` : ''}`)
    } else if (kind === 'HOLOO_INVOICE' || kind === 'HOLOO_RECEIPT') {
      await custody('HOLOO_REF', `${EVENT_KIND_LABELS[kind]} — شماره: ${holooRef || '—'}`)
    }
    await logActivity(me, `ثبت رخداد سند: ${EVENT_KIND_LABELS[kind]}`, 'archive-doc', id, `${doc.code}${repName ? ` — نماینده: ${repName}` : ''}${amount ? ` — ${Math.round(amount).toLocaleString('fa-IR')} تومان` : ''}`)

    const updated = await db.archiveDoc.findUnique({ where: { id } })
    return json({ doc: updated })
  }

  // ── disposal workflow — dual approval (COSO segregation of duties) ──
  if (action === 'request-disposal') {
    if (!(await canAdmin(me))) return fail('درخواست دفع سند نیازمند دسترسی مدیریت آرشیو است', 403)
    if (doc.lifecycle === 'DISPOSED') return fail('این سند قبلاً دفع شده است', 400)
    if (doc.legalHold) return fail('سند تحت نگهداری حقوقی است — دفع مجاز نیست', 400)
    const method = ['SHRED', 'BURN', 'DIGITAL_DELETE'].includes(String(body.method)) ? String(body.method) : 'SHRED'
    const updated = await db.archiveDoc.update({
      where: { id },
      data: { lifecycle: 'DISPOSAL_PENDING', disposalMethod: method },
    })
    await custody('DISPOSAL_REQUEST', `درخواست دفع سند توسط ${me.name} — روش پیشنهادی: ${method === 'SHRED' ? 'خردکن' : method === 'BURN' ? 'سوزاندن' : 'حذف دیجیتال'}`)
    await logActivity(me, 'درخواست دفع سند آرشیو', 'archive-doc', id, `${doc.code} — روش: ${method}`)
    return json({ doc: updated })
  }

  if (action === 'approve-disposal') {
    if (!(await canAdmin(me))) return fail('تأیید دفع نیازمند دسترسی مدیریت آرشیو است', 403)
    if (!DISPOSAL_APPROVER_ROLES.includes(me.role))
      return fail('تأیید نهایی دفع تنها توسط حسابدار/مدیریت ممکن است', 403)
    if (doc.lifecycle === 'DISPOSED') return fail('این سند قبلاً دفع شده است', 400)
    if (doc.legalHold) return fail('سند تحت نگهداری حقوقی است — دفع ممکن نیست', 400)
    const lastReq = await db.archiveCustody.findFirst({
      where: { docId: id, action: 'DISPOSAL_REQUEST' },
      orderBy: { createdAt: 'desc' },
    })
    if (!lastReq) return fail('برای این سند درخواست دفعی ثبت نشده است', 400)
    // dual approval: requester ≠ approver — the requester id lives in the custody chain
    if (lastReq.userId === me.id)
      return fail('دفع سند نیازمند تأیید دوم توسط کاربر دیگر است', 403)
    const method = ['SHRED', 'BURN', 'DIGITAL_DELETE'].includes(String(body.method)) ? String(body.method) : (doc.disposalMethod || 'SHRED')
    const updated = await db.archiveDoc.update({
      where: { id },
      data: {
        lifecycle: 'DISPOSED',
        disposalDate: todayIso(),
        disposalMethod: method,
        disposalApprovedBy: me.name,
      },
    })
    await custody('DISPOSAL_DONE', `دفع سند تأیید و انجام شد — درخواست‌دهنده: ${lastReq.userName}، تأییدکنندهٔ دوم: ${me.name} — سند در آرشیو رکورد محفوظ می‌ماند`)
    await logActivity(me, 'تأیید دفع سند آرشیو (تأیید دوم)', 'archive-doc', id, `${doc.code} — روش: ${method}`)
    return json({ doc: updated })
  }

  // ── legal hold — freeze disposal (اختلاف / رسیدگی مالیاتی) ──
  if (action === 'legal-hold') {
    if (!(await canAdmin(me))) return fail('نگهداری حقوقی نیازمند دسترسی مدیریت آرشیو است', 403)
    const on = Boolean(body.on)
    const note = String(body.note || '').trim()
    const updated = await db.archiveDoc.update({ where: { id }, data: { legalHold: on } })
    await custody('LEGAL_HOLD', `${on ? '🔒 نگهداری حقوقی سند فعال شد' : '🔓 نگهداری حقوقی سند برداشته شد'} توسط ${me.name}${note ? ` — ${note}` : ''} — دفع تا برداشتن توقف مسدود است`)
    await logActivity(me, on ? 'فعال‌سازی نگهداری حقوقی سند' : 'برداشتن نگهداری حقوقی سند', 'archive-doc', id, doc.code)
    return json({ doc: updated })
  }

  // ── manual lifecycle progression (SEMI_ACTIVE …) — admin ──
  if (action === 'set-lifecycle') {
    if (!(await canAdmin(me))) return fail('تغییر مرحلهٔ حیات نیازمند دسترسی مدیریت آرشیو است', 403)
    const lifecycle = String(body.lifecycle || '')
    if (!LIFECYCLE_VALUES.includes(lifecycle)) return fail('مرحلهٔ حیات نامعتبر است', 400)
    if (lifecycle === 'DISPOSED') return fail('دفع تنها از مسیر درخواست + تأیید دوم انجام می‌شود', 400)
    const updated = await db.archiveDoc.update({ where: { id }, data: { lifecycle } })
    await custody('LIFECYCLE', `تغییر مرحلهٔ حیات: ${doc.lifecycle} → ${lifecycle} توسط ${me.name}`)
    await logActivity(me, 'تغییر مرحلهٔ حیات سند', 'archive-doc', id, `${doc.code}: ${doc.lifecycle} → ${lifecycle}`)
    return json({ doc: updated })
  }

  if (action === 'destroy') {
    if (!['GM', 'OM', 'ACC', 'OWNER'].includes(me.role))
      return fail('تنها مدیریت مجاز به خارج‌کردن سند از چرخه است', 403)
    const updated = await db.archiveDoc.update({
      where: { id },
      data: { status: 'DESTROYED', notes: `${doc.notes} | خارج‌شده از چرخه: ${String(body.note || '')}`.trim() },
    })
    await logActivity(me, 'خارج‌سازی سند از آرشیو', 'archive-doc', id, doc.code)
    return json({ doc: updated })
  }

  return fail('عملیات نامعتبر', 400)
}
