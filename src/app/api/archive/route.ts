import { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ok, fail, logActivity, clampInt } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { toEnDigits, toFaDigits } from '@/lib/jalali'
import {
  ARCHIVE_ROLES, DOC_KINDS, BINDER_INCLUDE, docOut, sanitizeDocBody,
} from '@/lib/archive'

export const dynamic = 'force-dynamic'

/** GET /api/archive — جست‌وجو و فهرست اسناد آرشیو
 *  پارامترها: q (جست‌وجوی سراسری) · kind · status · binderId · supplierId · repId
 *  · from/to (بازهٔ تاریخ جلالی YYYY-MM-DD) · sort (date|amount|created) · page/pageSize
 *  خروجی: {items, stats, total, page, pageSize, pages} */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!ARCHIVE_ROLES.includes(me.role)) return fail('دسترسی به آرشیو اسناد ندارید', 403)

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') ?? '').trim()
  const kind = (sp.get('kind') ?? '').trim().toUpperCase()
  const status = (sp.get('status') ?? '').trim().toUpperCase()
  const binderId = (sp.get('binderId') ?? '').trim()
  const supplierId = (sp.get('supplierId') ?? '').trim()
  const repId = (sp.get('repId') ?? '').trim()
  const from = (sp.get('from') ?? '').replace(/\//g, '-').trim()
  const to = (sp.get('to') ?? '').replace(/\//g, '-').trim()
  const sort = (sp.get('sort') ?? 'date').trim()
  const page = clampInt(sp.get('page'), 1, 100000, 1)
  const pageSize = clampInt(sp.get('pageSize'), 1, 200, 50)

  const and: Record<string, unknown>[] = []
  const kindList = kind.split(',').map((k) => k.trim()).filter((k) => (DOC_KINDS as readonly string[]).includes(k))
  if (kindList.length) and.push({ kind: { in: kindList } })
  const statusList = status.split(',').map((s) => s.trim()).filter(Boolean)
  if (statusList.length) and.push({ status: { in: statusList } })
  if (binderId) and.push(binderId === 'NONE' ? { binderId: null } : { binderId })
  if (supplierId) and.push({ supplierId })
  if (repId) and.push(repId === 'NONE' ? { repId: null } : { repId })
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) || /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const dateJalali: Record<string, string> = {}
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) dateJalali.gte = from
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) dateJalali.lte = to
    and.push({ dateJalali })
  }
  if (q) {
    // جست‌وجو با هر دو شکل رقم (فارسی/لاتینی) — شماره چک و فاکتور ممکن است فارسی تایپ شود
    const variants = [...new Set([q, toEnDigits(q), toFaDigits(q)])].filter(Boolean)
    and.push({
      OR: variants.flatMap((v) => [
        { title: { contains: v } },
        { supplierName: { contains: v } },
        { orderCode: { contains: v } },
        { returnCode: { contains: v } },
        { chequeNumber: { contains: v } },
        { holooInvoiceNo: { contains: v } },
        { holooReceiptNo: { contains: v } },
        { repName: { contains: v } },
        { folio: { contains: v } },
        { note: { contains: v } },
        { returnedJson: { contains: v } }, // جست‌وجو در نام اقلام مرجوعی
      ]),
    })
  }
  const where = and.length ? { AND: and } : {}

  const orderBy =
    sort === 'amount'
      ? [{ amount: 'desc' as const }, { createdAt: 'desc' as const }]
      : sort === 'created'
        ? [{ createdAt: 'desc' as const }]
        : [{ dateJalali: 'desc' as const }, { createdAt: 'desc' as const }]

  const total = await db.archiveDocument.count({ where })
  const rows = await db.archiveDocument.findMany({
    where,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: BINDER_INCLUDE,
  })

  /* آمار کل دفتر آرشیو (مستقل از فیلترها — چیپ‌های سربرگ) */
  const all = await db.archiveDocument.findMany({ select: { kind: true, status: true, amount: true, binderId: true } })
  const byKind: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  let amountSum = 0
  let unfiled = 0
  for (const d of all) {
    byKind[d.kind] = (byKind[d.kind] ?? 0) + 1
    byStatus[d.status] = (byStatus[d.status] ?? 0) + 1
    amountSum += d.amount || 0
    if (!d.binderId) unfiled++
  }
  const stats = {
    total: all.length,
    byKind,
    byStatus,
    amountSum,
    unfiled,
    returnedDocs: await db.archiveDocument.count({ where: { NOT: { returnedJson: '[]' } } }),
  }

  return ok({
    items: rows.map(docOut),
    stats,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  })
}

/** POST /api/archive — ثبت سند جدید {kind, title, dateJalali, supplierId|supplierName,
 *  orderId, returnId, chequeId, holooInvoiceNo, holooReceiptNo, repId|repName, repRole,
 *  repNote, binderId, folio, amount, status, returned:[{name,qty,reason}], note} */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!ARCHIVE_ROLES.includes(me.role)) return fail('دسترسی به آرشیو اسناد ندارید', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const res = await sanitizeDocBody(body as Record<string, unknown>, { partial: false })
  if (!res.ok) return fail(res.error)

  const created = await db.archiveDocument.create({
    data: {
      ...res.data,
      createdById: me.id,
      createdByName: me.fullName,
    } as Prisma.ArchiveDocumentUncheckedCreateInput,
    include: BINDER_INCLUDE,
  })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'archive.doc.create',
    actionLabel: 'ثبت سند آرشیو',
    category: 'archive',
    detail: `${created.title} (${created.kind}) — ${created.supplierName ?? 'بدون تأمین‌کننده'}`,
    entityId: created.id,
  })

  return ok(docOut(created))
}
