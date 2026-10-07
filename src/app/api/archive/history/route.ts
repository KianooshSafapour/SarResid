import { db } from '@/lib/db'
import { fail, getSessionUser, json } from '@/lib/api-helpers'

/**
 * کارت کالا — unified product record history (record-keeping continuity).
 * Merges three record sources into one descending timeline:
 *  1. ORDER   — purchase lines from OrderItem + Order (CANCELLED orders excluded)
 *  2. ARCHIVE — physical archive invoice lines from ArchiveDocItem + ArchiveDoc (+ binder location)
 *  3. WASTE   — waste entries from WasteLog
 * Response: { product, timeline: [{at, kind, label, ...detail}], summary }
 */

const WASTE_REASONS: Record<string, string> = {
  EXPIRED: 'انقضا',
  DAMAGED: 'آسیب',
  SPOILED: 'فاسد شدن',
  THEFT: 'سرقت',
  OTHER: 'سایر',
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const url = new URL(req.url)
  const productId = url.searchParams.get('productId') || ''
  if (!productId) return fail('شناسه کالا الزامی است', 400)

  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product) return fail('کالا یافت نشد', 404)

  // ── 1. purchase records (orders, excluding CANCELLED) ──
  const orderItems = await db.orderItem.findMany({ where: { productId }, take: 300 })
  const orderIds = [...new Set(orderItems.map((i) => i.orderId))]
  const orders = await db.order.findMany({
    where: { id: { in: orderIds }, status: { not: 'CANCELLED' } },
    select: { id: true, code: true, providerName: true, status: true, createdAt: true },
  })
  const orderMap = new Map(orders.map((o) => [o.id, o]))
  const purchaseRecords: Record<string, any>[] = []
  for (const it of orderItems) {
    const o = orderMap.get(it.orderId)
    if (!o) continue
    purchaseRecords.push({
      at: o.createdAt.toISOString(),
      kind: 'ORDER',
      label: `سفارش خرید ${o.code}`,
      orderCode: o.code,
      providerName: o.providerName,
      orderStatus: o.status,
      qty: it.qty,
      receivedQty: it.receivedQty,
      unitPrice: it.unitBuyPrice,
      printedPrice: it.printedPrice,
      expiryDate: it.expiryDate || '',
      itemStatus: it.status,
    })
  }

  // ── 2. physical archive records (invoice line items + the doc/binder holding the paper) ──
  const docItems = await db.archiveDocItem.findMany({ where: { productId }, take: 300 })
  const docIds = [...new Set(docItems.map((i) => i.docId))]
  const docs = docIds.length
    ? await db.archiveDoc.findMany({
        where: { id: { in: docIds } },
        select: {
          id: true, code: true, title: true, party: true, invoiceNo: true,
          docDate: true, createdAt: true, status: true, binderId: true, binderCode: true, seq: true,
        },
      })
    : []
  const docMap = new Map(docs.map((d) => [d.id, d]))
  const binderIds = [...new Set(docs.map((d) => d.binderId))]
  const binders = binderIds.length
    ? await db.archiveBinder.findMany({
        where: { id: { in: binderIds } },
        select: { id: true, code: true, title: true, cabinet: true, shelf: true },
      })
    : []
  const binderMap = new Map(binders.map((b) => [b.id, b]))
  const archiveRecords: Record<string, any>[] = []
  for (const it of docItems) {
    const d = docMap.get(it.docId)
    if (!d) continue
    const b = binderMap.get(d.binderId)
    archiveRecords.push({
      at: d.docDate || d.createdAt.toISOString(),
      kind: 'ARCHIVE',
      label: `سند آرشیو ${d.code}`,
      docCode: d.code,
      docTitle: d.title,
      docStatus: d.status,
      party: d.party,
      invoiceNo: d.invoiceNo || '',
      qty: it.qty,
      unit: it.unit,
      unitPrice: it.unitPrice,
      expiryDate: it.expiryDate || '',
      binderCode: d.binderCode,
      binderTitle: b?.title || '',
      cabinet: b?.cabinet || '',
      shelf: b?.shelf || '',
      seq: d.seq,
    })
  }

  // ── 3. waste records ──
  const wastes = await db.wasteLog.findMany({ where: { productId }, take: 200, orderBy: { forDate: 'desc' } })
  const wasteRecords: Record<string, any>[] = wastes.map((w) => ({
    at: w.forDate || w.createdAt.toISOString(),
    kind: 'WASTE',
    label: 'ثبت ضایعات',
    qty: w.qty,
    unit: w.unit,
    reason: w.reason,
    reasonLabel: WASTE_REASONS[w.reason] || w.reason,
    estValue: w.estValue,
    note: w.note || '',
  }))

  const timeline = [...purchaseRecords, ...archiveRecords, ...wasteRecords].sort((a, b) =>
    String(b.at).localeCompare(String(a.at)),
  )

  // ── summary (کارت کالا KPIs) ──
  let totalPurchasedQty = 0
  for (const r of purchaseRecords) {
    totalPurchasedQty += Number(r.receivedQty ?? r.qty) || 0
  }
  const lastPurchase = [...purchaseRecords].sort((a, b) => String(b.at).localeCompare(String(a.at)))[0]
  const lastBuyPrice = lastPurchase ? Number(lastPurchase.unitPrice) || 0 : 0
  let lastExpiry = ''
  for (const r of timeline) {
    if (r.expiryDate && (!lastExpiry || String(r.expiryDate) > lastExpiry)) lastExpiry = String(r.expiryDate)
  }

  let barcode = ''
  try {
    const b = JSON.parse(product.barcodes || '[]')
    if (Array.isArray(b) && b[0]) barcode = String(b[0])
  } catch { /* ignore malformed */ }

  return json({
    product: {
      id: product.id,
      name: product.name,
      unit: product.unit,
      brand: product.brand,
      category: product.category,
      barcode,
    },
    timeline,
    summary: {
      purchaseCount: purchaseRecords.length,
      totalPurchasedQty,
      lastBuyPrice,
      lastExpiry,
      archiveDocCount: docIds.length,
      wasteCount: wasteRecords.length,
      wasteValue: wasteRecords.reduce((s, w) => s + (Number(w.estValue) || 0), 0),
      archiveValue: archiveRecords.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unitPrice) || 0), 0),
    },
  })
}
