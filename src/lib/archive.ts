/**
 * src/lib/archive.ts — منطق مشترک آرشیو اسناد (R7)
 * ------------------------------------------------------------------
 * اعتبارسنجی/نرمال‌سازی فیلدهای ArchiveDocument + خروجی استاندارد ردیف
 * (زنجیرهٔ محل فیزیکی: زون‌بند ← قفسه ← کابینت) — مشترک بین
 * /api/archive و /api/archive/[id] و /api/archive/structure.
 */
import { db } from '@/lib/db'
import { safeJson } from '@/lib/api'
import { toEnDigits } from '@/lib/jalali'

/** نقش‌های مجاز به کار با آرشیو اسناد */
export const ARCHIVE_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC']

export const DOC_KINDS = ['ORDER', 'INVOICE', 'RECEIPT', 'CHEQUE', 'RETURN', 'OTHER'] as const
export const DOC_STATUSES = ['PENDING', 'IN_PROGRESS', 'ARCHIVED', 'MISSING'] as const

/** رشتهٔ اختیاری: برش + پاک‌سازی؛ خالی → null */
export function astr(v: unknown, max = 200): string | null {
  const s = String(v ?? '').trim().slice(0, max)
  return s || null
}

/** تاریخ جلالی YYYY-MM-DD (اسلش → خط تیره) یا null */
export function jalaliOrNull(v: unknown): string | null {
  const s = toEnDigits(String(v ?? '')).replace(/\//g, '-').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

/** شمارهٔ لاتین: فقط رقم/حرف (شماره چک، فاکتور هلو، برگه و…) */
export function numStr(v: unknown, max = 60): string | null {
  const s = toEnDigits(String(v ?? '')).replace(/[\s\u200c]/g, '').trim().slice(0, max)
  return s || null
}

export interface ReturnedItem {
  name: string
  qty: number
  reason: string
}

/** اقلام مرجوعی [{name, qty, reason}] — حداکثر ۶۰ قلم، متن‌ها برش‌خورده */
export function sanitizeReturned(raw: unknown): ReturnedItem[] {
  if (!Array.isArray(raw)) return []
  const out: ReturnedItem[] = []
  for (const it of raw.slice(0, 60)) {
    if (!it || typeof it !== 'object') continue
    const b = it as Record<string, unknown>
    const name = String(b.name ?? '').trim().slice(0, 120)
    if (!name) continue
    const q = Number(b.qty)
    out.push({
      name,
      qty: Number.isFinite(q) && q > 0 ? q : 1,
      reason: String(b.reason ?? '').trim().slice(0, 200),
    })
  }
  return out
}

export function parseReturned(json: string | null | undefined): ReturnedItem[] {
  return safeJson<ReturnedItem[]>(json, []).filter(
    (r) => r && typeof r === 'object' && typeof r.name === 'string',
  )
}

type BinderWithPath = {
  id: string
  name: string
  code: string
  category: string | null
  color: string | null
  note: string | null
  shelfId: string
  shelf: {
    id: string
    name: string
    code: string
    cabinetId: string
    cabinet: { id: string; name: string; code: string; location: string | null }
  } | null
} | null

type DocRow = {
  id: string
  kind: string
  title: string
  dateJalali: string | null
  supplierId: string | null
  supplierName: string | null
  orderId: string | null
  orderCode: string | null
  returnId: string | null
  returnCode: string | null
  chequeId: string | null
  chequeNumber: string | null
  holooInvoiceNo: string | null
  holooReceiptNo: string | null
  repId: string | null
  repName: string | null
  repRole: string | null
  repNote: string | null
  binderId: string | null
  folio: string | null
  amount: number
  status: string
  returnedJson: string
  note: string | null
  createdById: string | null
  createdByName: string | null
  createdAt: Date
  updatedAt: Date
  binder?: BinderWithPath
}

/** خروجی استاندارد سند — همراه زنجیرهٔ محل فیزیکی و تعداد اقلام مرجوعی */
export function docOut(d: DocRow): Record<string, unknown> {
  const b = d.binder ?? null
  const sh = b?.shelf ?? null
  const cab = sh?.cabinet ?? null
  const returned = parseReturned(d.returnedJson)
  return {
    id: d.id,
    kind: d.kind,
    title: d.title,
    dateJalali: d.dateJalali,
    supplierId: d.supplierId,
    supplierName: d.supplierName,
    orderId: d.orderId,
    orderCode: d.orderCode,
    returnId: d.returnId,
    returnCode: d.returnCode,
    chequeId: d.chequeId,
    chequeNumber: d.chequeNumber,
    holooInvoiceNo: d.holooInvoiceNo,
    holooReceiptNo: d.holooReceiptNo,
    repId: d.repId,
    repName: d.repName,
    repRole: d.repRole,
    repNote: d.repNote,
    binderId: d.binderId,
    folio: d.folio,
    amount: d.amount,
    status: d.status,
    returned,
    returnedCount: returned.length,
    note: d.note,
    createdById: d.createdById,
    createdByName: d.createdByName,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    location: b
      ? {
          binder: { id: b.id, name: b.name, code: b.code, category: b.category, color: b.color },
          shelf: sh ? { id: sh.id, name: sh.name, code: sh.code } : null,
          cabinet: cab ? { id: cab.id, name: cab.name, code: cab.code, location: cab.location } : null,
        }
      : null,
  }
}

/** include ثابت برای زنجیرهٔ محل فیزیکی */
export const BINDER_INCLUDE = {
  binder: {
    include: {
      shelf: { include: { cabinet: true } },
    },
  },
} as const

export interface SanitizeDocInput {
  kind?: unknown
  title?: unknown
  dateJalali?: unknown
  supplierId?: unknown
  supplierName?: unknown
  orderId?: unknown
  orderCode?: unknown
  returnId?: unknown
  returnCode?: unknown
  chequeId?: unknown
  chequeNumber?: unknown
  holooInvoiceNo?: unknown
  holooReceiptNo?: unknown
  repId?: unknown
  repName?: unknown
  repRole?: unknown
  repNote?: unknown
  binderId?: unknown
  folio?: unknown
  amount?: unknown
  status?: unknown
  returned?: unknown
  note?: unknown
}

export type SanitizeResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string }

/**
 * اعتبارسنجی و نرمال‌سازی بدنهٔ سند (create کامل / update جزئی).
 * ارجاع‌ها به‌صورت خودکار تفکیک می‌شوند: orderId→orderCode،
 * returnId→returnCode، chequeId→chequeNumber، supplierId→supplierName، repId→repName.
 * binderId نامعتبر → خطا (سند نباید به جایگاه خیالی وصل شود).
 */
export async function sanitizeDocBody(
  body: Record<string, unknown>,
  opts: { partial: boolean },
): Promise<SanitizeResult> {
  const data: Record<string, unknown> = {}
  const has = (k: string) => body[k] !== undefined

  /* ── نوع سند ── */
  if (has('kind')) {
    const kind = String(body.kind ?? '').trim().toUpperCase()
    if (!(DOC_KINDS as readonly string[]).includes(kind)) return { ok: false, error: 'نوع سند نامعتبر است' }
    data.kind = kind
  } else if (!opts.partial) {
    data.kind = 'OTHER'
  }

  /* ── عنوان ── */
  if (has('title')) {
    const title = String(body.title ?? '').trim().slice(0, 160)
    if (!title) return { ok: false, error: 'عنوان سند را وارد کنید' }
    data.title = title
  } else if (!opts.partial) {
    return { ok: false, error: 'عنوان سند را وارد کنید' }
  }

  /* ── تاریخ ── */
  if (has('dateJalali')) data.dateJalali = jalaliOrNull(body.dateJalali)

  /* ── وضعیت ── */
  if (has('status')) {
    const status = String(body.status ?? '').trim().toUpperCase()
    if (!(DOC_STATUSES as readonly string[]).includes(status)) return { ok: false, error: 'وضعیت سند نامعتبر است' }
    data.status = status
  } else if (!opts.partial) {
    data.status = 'ARCHIVED'
  }

  /* ── مبلغ ── */
  if (has('amount')) {
    const n = Number(toEnDigits(String(body.amount ?? '0')).replace(/[^\d.-]/g, ''))
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'مبلغ سند نامعتبر است' }
    data.amount = Math.round(n)
  } else if (!opts.partial) {
    data.amount = 0
  }

  /* ── تأمین‌کننده: انتخاب از فهرست یا متن آزاد ── */
  if (has('supplierId')) {
    const supplierId = astr(body.supplierId, 40)
    if (supplierId) {
      const sup = await db.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true } })
      if (!sup) return { ok: false, error: 'تأمین‌کنندهٔ انتخاب‌شده یافت نشد' }
      data.supplierId = sup.id
      data.supplierName = sup.name
    } else {
      data.supplierId = null
      if (has('supplierName')) data.supplierName = astr(body.supplierName, 120)
    }
  } else if (has('supplierName')) {
    data.supplierName = astr(body.supplierName, 120)
  }

  /* ── سفارش خرید ── */
  if (has('orderId')) {
    const orderId = astr(body.orderId, 40)
    if (orderId) {
      const ord = await db.order.findUnique({ where: { id: orderId }, select: { id: true, code: true } })
      if (!ord) return { ok: false, error: 'سفارش انتخاب‌شده یافت نشد' }
      data.orderId = ord.id
      data.orderCode = ord.code
    } else {
      data.orderId = null
      data.orderCode = null
    }
  } else if (has('orderCode')) {
    data.orderCode = astr(body.orderCode, 40)
  }

  /* ── مرجوعی ── */
  if (has('returnId')) {
    const returnId = astr(body.returnId, 40)
    if (returnId) {
      const ret = await db.returnRequest.findUnique({ where: { id: returnId }, select: { id: true, code: true } })
      if (!ret) return { ok: false, error: 'مرجوعی انتخاب‌شده یافت نشد' }
      data.returnId = ret.id
      data.returnCode = ret.code
    } else {
      data.returnId = null
      data.returnCode = null
    }
  } else if (has('returnCode')) {
    data.returnCode = astr(body.returnCode, 40)
  }

  /* ── چک ── */
  if (has('chequeId')) {
    const chequeId = astr(body.chequeId, 40)
    if (chequeId) {
      const chq = await db.cheque.findUnique({ where: { id: chequeId }, select: { id: true, number: true } })
      if (!chq) return { ok: false, error: 'چک انتخاب‌شده یافت نشد' }
      data.chequeId = chq.id
      data.chequeNumber = chq.number
    } else {
      data.chequeId = null
      data.chequeNumber = null
    }
  } else if (has('chequeNumber')) {
    data.chequeNumber = numStr(body.chequeNumber, 40)
  }

  /* ── شماره‌های هلو ── */
  if (has('holooInvoiceNo')) data.holooInvoiceNo = numStr(body.holooInvoiceNo, 40)
  if (has('holooReceiptNo')) data.holooReceiptNo = numStr(body.holooReceiptNo, 40)

  /* ── نمایندهٔ فروش ── */
  if (has('repId')) {
    const repId = astr(body.repId, 40)
    if (repId) {
      const rep = await db.salesRep.findUnique({ where: { id: repId }, select: { id: true, name: true } })
      if (!rep) return { ok: false, error: 'نمایندهٔ انتخاب‌شده یافت نشد' }
      data.repId = rep.id
      data.repName = rep.name
    } else {
      data.repId = null
      if (has('repName')) data.repName = astr(body.repName, 100)
    }
  } else if (has('repName')) {
    data.repName = astr(body.repName, 100)
  }
  if (has('repRole')) data.repRole = astr(body.repRole, 60)
  if (has('repNote')) data.repNote = astr(body.repNote, 300)

  /* ── جایگاه فیزیکی ── */
  if (has('binderId')) {
    const binderId = astr(body.binderId, 40)
    if (binderId) {
      const binder = await db.archiveBinder.findUnique({ where: { id: binderId }, select: { id: true } })
      if (!binder) return { ok: false, error: 'زون‌بند انتخاب‌شده یافت نشد' }
      data.binderId = binder.id
    } else {
      data.binderId = null
    }
  }
  if (has('folio')) data.folio = numStr(body.folio, 20)

  /* ── اقلام مرجوعی + یادداشت ── */
  if (has('returned')) {
    const returned = sanitizeReturned(body.returned)
    data.returnedJson = JSON.stringify(returned)
  }
  if (has('note')) data.note = astr(body.note, 600)

  return { ok: true, data }
}
