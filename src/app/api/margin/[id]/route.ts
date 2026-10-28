import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser, type SessionUser } from '@/lib/auth'
import { toFaDigits, todayJalaliDash, addDaysJalaliDash } from '@/lib/jalali'
import { deriveItem, invoiceListOut, MARGIN_ROLES, getMarginThresholds, type MarginItemInput } from '../route'
import { createPurchaseOrder, pushOrderToHoloo, publishPricesToHoloo, faMoney, MAX_CHEQUE_DAYS, type PurchaseDerivedItem } from '@/lib/margin-purchase'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/* R12 — نقش‌های گردش‌کار دفتر فاکتورها:
   • تأیید تحویل (deliver): هر کاربرِ واردشده (همان اصل R11 دریافت کالا — همه باید بتوانند تأیید کنند)
   • بررسی حسابداری و نهایی‌سازی (review/finalize): حسابدار یا مدیران (اگر حسابدار در دسترس نبود)
   • بایگانی سند: حسابدار یا مدیران
   • لغو/بازکردن بایگانی: مدیران ارشد */
const REVIEW_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC']
const MANAGER_ROLES = ['OWNER', 'GM', 'ADMIN']
/* R13 — تأیید نهایی مدیر کل (خانم لطفی): مدیر کل؛ در نبودِ ایشان مالک/ادمین */
const GM_ROLES = ['GM', 'OWNER', 'ADMIN']

const REJECT_REASONS = [
  'قیمت چاپی متفاوت',
  'تاریخ انقضا گذشته/نزدیک',
  'شکسته/مخدوش',
  'کالای اشتباه',
  'کیفیت نامطلوب',
  'سفارش نبود',
  'دیگر',
]

function firstBarcodeOf(p: { barcodesJson: string; code: string | null }): string | null {
  const list = safeJson<string[]>(p.barcodesJson, [])
  return list[0] ?? p.code ?? null
}

/** ردپای گردش‌کار — الحاق رویداد به historyJson */
type HistoryEvent = { at: string; by: string; action: string; detail?: string }
function readHistory(raw: string | null): HistoryEvent[] {
  const list = safeJson<HistoryEvent[]>(raw, [])
  return Array.isArray(list) ? list : []
}
function withEvent(raw: string | null, ev: HistoryEvent): string {
  const list = readHistory(raw)
  list.push({ at: ev.at || new Date().toISOString(), by: ev.by, action: ev.action, ...(ev.detail ? { detail: ev.detail } : {}) })
  return JSON.stringify(list.slice(-80))
}

const HISTORY_LABEL: Record<string, string> = {
  create: 'ثبت پیش‌نویس',
  edit: 'ویرایش',
  deliver: 'تأیید تحویل کالا',
  'start-review': 'شروع بررسی حسابداری',
  'review-save': 'ذخیرهٔ بررسی',
  finalize: 'ثبت فاکتور خرید',
  'gm-approve': 'تأیید مدیر کل و انتشار قیمت',
  archive: 'بایگانی سند',
  unarchive: 'بازکردن بایگانی',
  cancel: 'لغو فاکتور',
}

/** GET /api/margin/[id] — {invoice:{…, archived, dateJalali, items:[… with product memory], workflow…}} */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const { id } = await ctx.params
  const inv = await db.marginInvoice.findUnique({ where: { id }, include: { items: true } })
  if (!inv) return fail('فاکتور یافت نشد', 404)

  const productIds = [...new Set(inv.items.map((i) => i.productId ?? '').filter(Boolean))]
  const products = productIds.length ? await db.product.findMany({ where: { id: { in: productIds } } }) : []
  const prodById = new Map(products.map((p) => [p.id, p]))

  // printed-price memory from OTHER invoices (per product)
  const others = productIds.length
    ? await db.marginItem.findMany({
        where: { productId: { in: productIds }, invoiceId: { not: inv.id } },
        include: { invoice: { select: { createdAt: true } } },
      })
    : []
  const byProduct = new Map<string, typeof others>()
  for (const o of others) {
    const pid = o.productId as string
    const arr = byProduct.get(pid) ?? []
    arr.push(o)
    byProduct.set(pid, arr)
  }

  /* R12: سند بایگانی پیوسته + زنجیرهٔ محل فیزیکی کاغذ */
  const archiveDoc = inv.archiveDocId
    ? await db.archiveDocument
        .findUnique({
          where: { id: inv.archiveDocId },
          include: { binder: { include: { shelf: { include: { cabinet: true } } } } },
        })
        .catch(() => null)
    : null
  let archiveOut: Record<string, unknown> | null = null
  if (archiveDoc) {
    const b = archiveDoc.binder
    const sh = b?.shelf ?? null
    const cab = sh?.cabinet ?? null
    archiveOut = {
      id: archiveDoc.id,
      title: archiveDoc.title,
      status: archiveDoc.status,
      folio: archiveDoc.folio,
      holooInvoiceNo: archiveDoc.holooInvoiceNo,
      holooReceiptNo: archiveDoc.holooReceiptNo,
      hasScan: !!archiveDoc.scanDataUrl,
      scanName: archiveDoc.scanName,
      amount: archiveDoc.amount,
      location: b ? { binder: b.name, binderCode: b.code, shelf: sh?.name ?? null, cabinet: cab?.name ?? null } : null,
    }
  }

  const items = inv.items.map((it) => {
    const p = it.productId ? prodById.get(it.productId) : null
    let product: Record<string, unknown> | null = null
    let lastUnitCost: number | null = null
    if (p) {
      const mem = (byProduct.get(p.id) ?? []).sort(
        (a, b) => b.invoice.createdAt.getTime() - a.invoice.createdAt.getTime(),
      )
      const prices = mem.map((m) => m.printedPrice)
      lastUnitCost = p.lastBuyPrice
      product = {
        id: p.id,
        name: p.name,
        unit: p.unit,
        sellPrice: p.sellPrice,
        lastBuyPrice: p.lastBuyPrice,
        mainGroup: p.mainGroup,
        lastPrintedPrice: mem.length ? mem[0].printedPrice : null,
        avgPrintedPrice: prices.length
          ? prices.reduce((s, v) => s + v, 0) / prices.length
          : null,
        printedPriceCount: mem.length,
        barcode: firstBarcodeOf(p),
      }
    }
    return {
      id: it.id,
      productId: it.productId,
      barcode: it.barcode,
      productName: it.productName,
      unit: it.unit,
      quantity: it.quantity,
      totalCost: it.totalCost,
      unitCost: it.unitCost,
      printedPrice: it.printedPrice,
      salePrice: it.salePrice,
      marginPct: it.marginPct,
      free100: it.free100,
      baseCost: it.baseCost,
      margin: it.margin,
      profitPerUnit: it.profitPerUnit,
      note: it.note,
      level: it.level,
      alerts: safeJson<unknown[]>(it.alertsJson, []),
      accepted: it.accepted,
      rejectReason: it.rejectReason,
      product,
      lastUnitCost,
    }
  })

  const order = inv.purchaseOrderId
    ? await db.order.findUnique({ where: { id: inv.purchaseOrderId }, select: { id: true, code: true, status: true, holooErp: true, payMethod: true } })
    : null

  return ok({
    invoice: {
      id: inv.id,
      number: inv.number,
      supplierId: inv.supplierId,
      supplierName: inv.supplierName,
      note: inv.note,
      status: inv.status,
      archived: inv.archived,
      archivedAt: inv.archivedAt ? inv.archivedAt.toISOString() : null,
      createdAt: inv.createdAt.toISOString(),
      dateJalali: inv.dateJalali,
      providerDocNumber: inv.providerDocNumber,
      purchaseOrderId: inv.purchaseOrderId,
      order: order ? { code: order.code, status: order.status, holooErp: order.holooErp, payMethod: order.payMethod } : null,
      deliveredAt: inv.deliveredAt?.toISOString() ?? null,
      deliveredByName: inv.deliveredByName,
      reviewedAt: inv.reviewedAt?.toISOString() ?? null,
      reviewedByName: inv.reviewedByName,
      finalizedAt: inv.finalizedAt?.toISOString() ?? null,
      finalizedByName: inv.finalizedByName,
      gmApprovedAt: inv.gmApprovedAt?.toISOString() ?? null,
      gmApprovedByName: inv.gmApprovedByName,
      cancelledAt: inv.cancelledAt?.toISOString() ?? null,
      cancelledByName: inv.cancelledByName,
      cancelReason: inv.cancelReason,
      holooInvoiceNo: inv.holooInvoiceNo,
      holooReceiptNo: inv.holooReceiptNo,
      history: readHistory(inv.historyJson).map((h) => ({ ...h, label: HISTORY_LABEL[h.action] ?? h.action })),
      archive: archiveOut,
      /* R14: زون‌بندِ خودکارِ این شرکت (اگر تعیین شده باشد) */
      autoArchiveBinder: await resolveAutoBinder(inv).then((b) =>
        b ? { id: b.id, name: b.name, code: b.code, shelf: b.shelf?.name ?? null, cabinet: b.shelf?.cabinet?.name ?? null } : null,
      ),
      items,
    },
  })
}

/** PUT /api/margin/[id] — full replace (builder «ذخیره»); فقط پیش‌نویس/فاکتور نهاییِ باز */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!MARGIN_ROLES.includes(me.role)) return fail('شما مجاز به ویرایش فاکتور سودسنج نیستید', 403)

  const { id } = await ctx.params
  const inv = await db.marginInvoice.findUnique({ where: { id } })
  if (!inv) return fail('فاکتور یافت نشد', 404)
  if (inv.archived) return fail('فاکتور بایگانی‌شده قابل ویرایش نیست؛ ابتدا بایگانی را باز کنید')
  /* R17: سودسنج = تحویل‌شده؛ تا پیش از شروع بررسی حسابداری، ثبت‌کننده می‌تواند اصلاح کند */
  if (inv.status === 'reviewing')
    return fail('این فاکتور در بررسی حسابداری است — ویرایش اقلام از «بررسی حسابداری» در دفتر فاکتورها انجام می‌شود')
  if (inv.status === 'delivered' && inv.reviewedAt)
    return fail('بررسی حسابداری این فاکتور آغاز شده — ویرایش از «بررسی حسابداری» در دفتر فاکتورها انجام می‌شود')
  if (inv.status === 'cancelled') return fail('فاکتور لغوشده قابل ویرایش نیست')

  const body = await req.json().catch(() => null)
  if (!body) return fail('درخواست نامعتبر است')

  const supplierName = String(body.supplierName ?? '').trim() || null
  if (!supplierName) return fail('تأمین‌کننده را انتخاب یا نامش را وارد کنید')
  const supplierId = String(body.supplierId ?? '').trim() || null
  const note = String(body.note ?? '').trim() || null
  const thresholds = await getMarginThresholds()

  const rawItems = Array.isArray(body.items) ? body.items : []
  if (rawItems.length === 0) return fail('فاکتور باید حداقل یک قلم داشته باشد')

  const items: (MarginItemInput & { alertsJson: string })[] = []
  for (const raw of rawItems) {
    const name = String(raw?.productName ?? '').trim()
    if (!name) return fail('نام کالا را وارد کنید')
    const quantity = Math.round((Number(raw?.quantity) || 0) * 1000) / 1000
    if (quantity < 1) return fail('تعداد باید بزرگ‌تر از صفر باشد')
    items.push(
      deriveItem(
        {
          productId: raw?.productId ? String(raw.productId) : null,
          barcode: raw?.barcode ? String(raw.barcode).trim() : null,
          productName: name,
          unit: String(raw?.unit ?? 'عدد').trim() || 'عدد',
          quantity,
          totalCost: Number(raw?.totalCost) || 0,
          printedPrice: Number(raw?.printedPrice) || 0,
          note: raw?.note ? String(raw.note).trim() : null,
          salePrice: Number(raw?.salePrice) || 0,
          marginPct: Number(raw?.marginPct) || 0,
          free100: raw?.free100 === true,
          baseCost: Number(raw?.baseCost) || 0,
        },
        thresholds,
      ) as MarginItemInput & { alertsJson: string },
    )
  }

  await db.marginItem.deleteMany({ where: { invoiceId: id } })
  const updated = await db.marginInvoice.update({
    where: { id },
    data: {
      supplierId,
      supplierName,
      note,
      ...(body?.providerDocNumber !== undefined ? { providerDocNumber: String(body.providerDocNumber ?? '').trim() || null } : {}),
      historyJson: withEvent(inv.historyJson, { at: new Date().toISOString(), by: me.fullName, action: 'edit', detail: 'ویرایش کامل اقلام از فاکتورنویس' }),
      items: { create: items },
    },
  })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'margin.update',
    actionLabel: 'ویرایش فاکتور سودسنج',
    category: 'profit',
    detail: `#${toFaDigits(String(updated.number))} — ${supplierName}`,
    entityId: id,
  })

  return ok({ id: updated.id, number: updated.number })
}

/* ────────────────────────────────────────────────────────────────
   R12 — گردش‌کار دفتر فاکتورها (PATCH actions)
   draft →(deliver)→ delivered →(start-review/review-save)→ reviewing
        →(finalize)→ final →(archive)→ archived
   draft|delivered →(cancel)→ cancelled      archived →(unarchive)→ final
   ──────────────────────────────────────────────────────────────── */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const { id } = await ctx.params
  const inv = await db.marginInvoice.findUnique({ where: { id }, include: { items: true } })
  if (!inv) return fail('فاکتور یافت نشد', 404)

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action ?? '')
  const now = new Date()
  const nowIso = now.toISOString()
  const numFa = toFaDigits(String(inv.number))

  /* ── گام ۲: تأیید تحویل کالا — هر کاربرِ واردشده ── */
  if (action === 'deliver') {
    if (inv.status !== 'draft') return fail('تأیید تحویل فقط برای فاکتور در وضعیت «پیش‌نویس» ممکن است')
    const note = body?.note ? ` — ${String(body.note).trim().slice(0, 200)}` : ''
    const updated = await db.marginInvoice.update({
      where: { id },
      data: {
        status: 'delivered',
        deliveredAt: now,
        deliveredById: me.id,
        deliveredByName: me.fullName,
        historyJson: withEvent(inv.historyJson, {
          at: nowIso,
          by: me.fullName,
          action: 'deliver',
          detail: `تحویل فیزیکی کالا تأیید شد؛ آمادهٔ بررسی حسابداری${note}`,
        }),
      },
    })
    await notifyRoles(['ACC', 'OWNER', 'GM', 'ADMIN', 'EXEC'], {
      kind: `margin:deliver:${inv.id}`,
      severity: 'info',
      title: 'پیش‌فاکتور تحویل‌شده در انتظار بررسی حسابداری',
      body: `فاکتور #${numFa} (${inv.supplierName ?? 'بدون تأمین‌کننده'}) توسط ${me.fullName} تحویل تأیید شد — بررسی قیمت‌ها و حاشیهٔ سود نوبت حسابداری است.`,
      go: `#/finance/invoices?open=${inv.id}`,
    })
    await logActivity({
      userId: me.id, userName: me.fullName,
      action: 'margin.deliver', actionLabel: 'تأیید تحویل پیش‌فاکتور',
      category: 'profit', detail: `#${numFa} — ${inv.supplierName ?? ''}`, entityId: id,
    })
    return ok({ id, status: updated.status, deliveredAt: nowIso })
  }

  /* ── گام ۳: شروع بررسی حسابداری ── */
  if (action === 'start-review') {
    if (!REVIEW_ROLES.includes(me.role)) return fail('بررسی حسابداری فقط برای حسابدار یا مدیران ممکن است', 403)
    if (inv.status !== 'delivered' && inv.status !== 'reviewing' && inv.status !== 'draft')
      return fail('بررسی فقط برای فاکتور «تحویل‌شده» (یا پیش‌نویس قدیمی) ممکن است')
    /* R17: پیش‌نویس‌های قدیمی (پیش از R17) همزمان تحویل‌شده فرض می‌شوند — ثبت سودسنج = تحویل */
    const legacyDeliver = inv.status === 'draft'
      ? {
          deliveredAt: inv.deliveredAt ?? now,
          deliveredById: inv.deliveredById ?? me.id,
          deliveredByName: inv.deliveredByName ?? me.fullName,
        }
      : null
    const updated = await db.marginInvoice.update({
      where: { id },
      data: {
        ...(legacyDeliver ?? {}),
        status: 'reviewing',
        reviewedAt: now,
        reviewedById: me.id,
        reviewedByName: me.fullName,
        historyJson: withEvent(
          legacyDeliver
            ? withEvent(inv.historyJson, { at: nowIso, by: legacyDeliver.deliveredByName, action: 'deliver', detail: 'سند قدیمی — ثبت سودسنج = تحویل‌شده' })
            : inv.historyJson,
          { at: nowIso, by: me.fullName, action: 'start-review', detail: 'بررسی قیمت‌ها و حاشیهٔ سود آغاز شد' },
        ),
      },
    })
    return ok({ id, status: updated.status })
  }

  /* ── گام ۳ (ادامه): ذخیرهٔ بررسی — ویرایش قیمت‌ها + پذیرش/رد اقلام (مرجوعی) ── */
  if (action === 'review-save') {
    if (!REVIEW_ROLES.includes(me.role)) return fail('بررسی حسابداری فقط برای حسابدار یا مدیران ممکن است', 403)
    if (inv.status !== 'delivered' && inv.status !== 'reviewing') return fail('ذخیرهٔ بررسی فقط برای فاکتور «تحویل‌شده» ممکن است — ابتدا تأیید تحویل')

    const rawItems: Record<string, unknown>[] = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : []
    if (rawItems.length === 0) return fail('فهرست اقلام را بفرستید')
    const byId = new Map(rawItems.map((r) => [String(r?.id ?? ''), r]))

    const thresholds = await getMarginThresholds()
    let acceptedCount = 0
    let rejectedCount = 0
    const rejectSummary: string[] = []

    for (const it of inv.items) {
      const raw = byId.get(it.id)
      if (!raw) continue
      const accepted = raw?.accepted === false ? false : true
      let rejectReason: string | null = null
      if (!accepted) {
        rejectReason = String(raw?.rejectReason ?? '').trim() || 'دیگر'
        if (!REJECT_REASONS.includes(rejectReason) && rejectReason !== 'دیگر') rejectReason = rejectReason.slice(0, 120)
        rejectedCount++
        rejectSummary.push(`${it.productName} (${rejectReason})`)
      } else {
        acceptedCount++
      }
      /* ویرایش قیمت‌ها توسط حسابدار (تورم روزانه) — فقط اقلام پذیرفته‌ده ویرایش می‌شوند */
      const edits: Record<string, unknown> = { accepted, rejectReason }
      if (accepted && (raw?.totalCost !== undefined || raw?.printedPrice !== undefined || raw?.salePrice !== undefined)) {
        const merged = deriveItem(
          {
            productId: it.productId,
            barcode: it.barcode,
            productName: it.productName,
            unit: it.unit,
            quantity: it.quantity,
            totalCost: raw?.totalCost !== undefined ? Number(raw.totalCost) || 0 : it.totalCost,
            printedPrice: raw?.printedPrice !== undefined ? Number(raw.printedPrice) || 0 : it.printedPrice,
            note: it.note,
            salePrice: raw?.salePrice !== undefined ? Number(raw.salePrice) || 0 : it.salePrice,
            marginPct: it.marginPct,
            free100: it.free100,
            baseCost: it.baseCost,
          },
          thresholds,
        )
        edits.totalCost = merged.totalCost
        edits.unitCost = merged.unitCost
        edits.printedPrice = merged.printedPrice
        edits.salePrice = merged.salePrice
        edits.margin = merged.margin
        edits.profitPerUnit = merged.profitPerUnit
        edits.marginPct = merged.marginPct
        edits.level = merged.level
      }
      await db.marginItem.update({ where: { id: it.id }, data: edits })
    }

    const detail = rejectedCount
      ? `${toFaDigits(String(acceptedCount))} قلم پذیرفته شد · ${toFaDigits(String(rejectedCount))} قلم مرجوعی: ${rejectSummary.slice(0, 6).join('، ')}${rejectSummary.length > 6 ? ' و…' : ''}`
      : `${toFaDigits(String(acceptedCount))} قلم پذیرفته شد`
    const updated = await db.marginInvoice.update({
      where: { id },
      data: {
        status: 'reviewing',
        reviewedAt: now,
        reviewedById: me.id,
        reviewedByName: me.fullName,
        historyJson: withEvent(inv.historyJson, { at: nowIso, by: me.fullName, action: 'review-save', detail }),
      },
    })
    return ok({ id, status: updated.status, acceptedCount, rejectedCount })
  }

  /* ── گام ۴: ثبت فاکتور خرید (نهایی) — سند خرید + موجودی/قیمت کالا + هلو ── */
  if (action === 'finalize') {
    if (!REVIEW_ROLES.includes(me.role)) return fail('ثبت فاکتور خرید فقط برای حسابدار یا مدیران ممکن است', 403)
    if (inv.status !== 'delivered' && inv.status !== 'reviewing' && inv.status !== 'draft')
      return fail('ثبت فاکتور خرید فقط برای پیش‌فاکتورِ تحویل‌شده (یا پیش‌نویس) ممکن است')
    if (inv.purchaseOrderId) return fail('برای این فاکتور قبلاً سند خرید ثبت شده است')
    if (inv.items.length === 0) return fail('فاکتور قلمی ندارد')

    const acceptedItems = inv.items.filter((it) => it.accepted !== false)
    const rejectedItems = inv.items.filter((it) => it.accepted === false)
    if (acceptedItems.length === 0) return fail('حداقل یک قلم باید پذیرفته شود — اگر کل محموله مرجوع است، فاکتور را لغو کنید')

    const payMethod = ['CASH', 'CHEQUE', 'POS'].includes(String(body.payMethod)) ? String(body.payMethod) : 'CASH'
    const pushToHoloo = body.pushToHoloo === true
    /* R17: چکِ پرداخت خرید همیشه با سقف مهلت (۴۵ روز) ثبت می‌شود — سررسید = تاریخ فاکتور + مهلت */
    const chequeDays = payMethod === 'CHEQUE' ? Math.max(1, Math.min(MAX_CHEQUE_DAYS, Math.round(Number(body?.chequeDays) || MAX_CHEQUE_DAYS))) : 0

    const { order, totalAmount, stockUpdated } = await createPurchaseOrder({
      items: acceptedItems as unknown as PurchaseDerivedItem[],
      supplierId: inv.supplierId,
      supplierName: inv.supplierName,
      note: inv.note,
      providerDocNumber: inv.providerDocNumber,
      dateJalali: inv.dateJalali || todayJalaliDash(),
      payMethod,
      chequeDays,
      actor: { id: me.id, fullName: me.fullName },
      marginInvoiceNumber: inv.number,
      sourceLabel: 'ثبت فاکتور خرید از دفتر فاکتورها (پس از بررسی حسابداری)',
      receivedDetail: rejectedItems.length
        ? `پس از بررسی حسابداری — ${toFaDigits(String(acceptedItems.length))} قلم پذیرفته و ${toFaDigits(String(rejectedItems.length))} قلم مرجوع تأمین‌کننده شد`
        : 'پس از بررسی حسابداری — همهٔ اقلام پذیرفته شد',
      /* R13: انتشار قیمت‌ها به گام «تأیید مدیر کل» موکول می‌شود */
      publishPrices: false,
    })

    let holoo: { pushed: boolean; pending?: boolean; reason?: string; invoiceNo?: string } | null = null
    if (pushToHoloo) {
      holoo = await pushOrderToHoloo({
        orderId: order.id,
        orderCode: order.code,
        marginInvoiceNumber: inv.number,
        cookie: req.headers.get('cookie'),
        origin: `http://127.0.0.1:${process.env.PORT || 3000}`,
      })
    }

    /* R17: چک خودکار خرید — پرداخت چکی، همزمان چک پیش‌نویس (PENDING_OWNER) می‌سازد؛
       سقف مهلت ۴۵ روز؛ سررسید = تاریخ فاکتور + مهلت (idempotent با orderId) */
    let cheque: { number: string; dueDate: string; amount: number } | null = null
    if (payMethod === 'CHEQUE' && chequeDays > 0) {
      const existingCheque = await db.cheque.findFirst({ where: { orderId: order.id }, select: { id: true } })
      if (!existingCheque) {
        const chequeBase = inv.dateJalali && /^\d{4}-\d{2}-\d{2}$/.test(inv.dateJalali) ? inv.dateJalali : todayJalaliDash()
        const dueDate = addDaysJalaliDash(chequeBase, chequeDays)
        const row = await db.cheque.create({
          data: {
            number: `AUTO-${order.code}`,
            amount: totalAmount,
            status: 'PENDING_OWNER',
            recipient: inv.supplierName,
            selfIssued: false,
            dueDate,
            note: `چک خودکار فاکتور خرید #${numFa} — مهلت ${toFaDigits(String(chequeDays))} روز`,
            orderId: order.id,
            orderCode: order.code,
            historyJson: JSON.stringify([
              { at: nowIso, by: 'system', action: 'auto-create', detail: `ثبت خودکار هنگام ثبت فاکتور خرید #${numFa} از دفتر فاکتورها` },
            ]),
          },
        })
        cheque = { number: row.number, dueDate, amount: totalAmount }
        await notifyRoles(['OWNER', 'GM'], {
          kind: `cheque:auto:${row.id}`,
          severity: 'info',
          title: 'چک خودکار خرید ثبت شد',
          body: `چک ${faMoney(totalAmount)} ریالی برای فاکتور #${numFa} (سند ${order.code}) ثبت شد — سررسید ${toFaDigits(dueDate)}؛ آمادهٔ نوشتن.`,
          go: '#/finance/cheques',
        })
      }
    }

    await db.marginInvoice.update({
      where: { id },
      data: {
        status: 'final',
        purchaseOrderId: order.id,
        finalizedAt: now,
        finalizedById: me.id,
        finalizedByName: me.fullName,
        ...(holoo?.pushed && holoo.invoiceNo ? { holooInvoiceNo: holoo.invoiceNo } : {}),
        historyJson: withEvent(inv.historyJson, {
          at: nowIso,
          by: me.fullName,
          action: 'finalize',
          detail: `فاکتور خرید نهایی شد — سند خرید ${order.code} · ${toFaDigits(String(acceptedItems.length))} قلم پذیرفته، ${toFaDigits(String(rejectedItems.length))} قلم مرجوعی · جمع پذیرفته ${faMoney(totalAmount)} ریال${cheque ? ` · چک ${toFaDigits(String(chequeDays))} روزه (سررسید ${toFaDigits(cheque.dueDate)}) خودکار ثبت شد` : ''}${holoo ? (holoo.pushed ? ' · ثبت شد در هلو' : ' · هلو: در صف ارسال') : ''}`,
        }),
      },
    })

    await notifyRoles(['GM', 'OWNER', 'ADMIN'], {
      kind: `margin:finalize:${inv.id}`,
      severity: 'warning',
      title: 'فاکتور خرید در انتظار تأیید مدیر کل',
      body: `فاکتور #${numFa} (${inv.supplierName ?? 'بدون تأمین‌کننده'}) توسط ${me.fullName} ثبت شد — سند خرید ${order.code} تشکیل و موجودی به‌روز شد. قیمت‌ها پس از تأیید مدیر کل در هلو منتشر می‌شود؛ سپس بایگانی سند کاغذی.`,
      go: `#/finance/invoices?open=${inv.id}`,
    })

    await logActivity({
      userId: me.id, userName: me.fullName,
      action: 'margin.finalize', actionLabel: 'ثبت فاکتور خرید',
      category: 'profit',
      detail: `#${numFa} + سند خرید ${order.code} — ${inv.supplierName ?? ''} — ${toFaDigits(String(acceptedItems.length))} قلم پذیرفته / ${toFaDigits(String(rejectedItems.length))} مرجوعی`,
      entityId: id,
    })

    return ok({
      id,
      status: 'final',
      order: { id: order.id, code: order.code, status: order.status },
      totalAmount,
      stockUpdated,
      acceptedCount: acceptedItems.length,
      rejectedCount: rejectedItems.length,
      holoo,
      cheque,
    })
  }

  /* ── گام ۵ (R13): تأیید نهایی مدیر کل — انتشار قیمت‌ها (سر رسید + هلو) ── */
  if (action === 'gm-approve') {
    if (!GM_ROLES.includes(me.role)) return fail('تأیید نهایی فقط برای مدیر کل (یا مالک/ادمین در نبودِ ایشان) ممکن است', 403)
    if (inv.status !== 'final') return fail('تأیید مدیر کل فقط برای «فاکتور خرید» ثبت‌شده ممکن است')
    if (inv.gmApprovedAt) return fail('این فاکتور قبلاً تأیید مدیر کل شده است')

    const accepted = inv.items.filter((it) => it.accepted !== false)
    /* انتشار قیمت: قیمت فروش = قیمت نهایی سودسنج (salePrice)؛ قیمت چاپی = sellPrice2/SellPrice2 هلو */
    const prices = await publishPricesToHoloo({
      items: accepted as unknown as PurchaseDerivedItem[],
      marginInvoiceNumber: inv.number,
    })

    const priceDetail = prices.updatedLocal
      ? ` · قیمت ${toFaDigits(String(prices.updatedLocal))} کالا به‌روز شد` +
        (prices.holooEnabled
          ? prices.pushedHoloo
            ? ` · ${toFaDigits(String(prices.pushedHoloo))} قلم در هلو (SellPrice/SellPrice2) منتشر شد`
            : prices.reason
              ? ` · هلو: ${prices.reason}`
              : ''
          : ' · هلو: در دسترس نبود، بعداً از «اتصال هلو» ارسال می‌شود')
      : ''

    const updated = await db.marginInvoice.update({
      where: { id },
      data: {
        gmApprovedAt: now,
        gmApprovedById: me.id,
        gmApprovedByName: me.fullName,
        historyJson: withEvent(inv.historyJson, {
          at: nowIso,
          by: me.fullName,
          action: 'gm-approve',
          detail: `مدیر کل سود و قیمت‌های فاکتور را تأیید کرد${priceDetail} — آمادهٔ بایگانی سند کاغذی`,
        }),
      },
    })

    /* R14: بایگانی خودکار — اگر فعال باشد و شرکتِ فاکتور زون‌بندِ تعیین‌شده داشته باشد،
       سند همان‌جا (با برگهٔ خودکارِ بعدی) بایگانی می‌شود؛ دیگر نیازی به گام دستی نیست. */
    let autoArchived: { docId: string; binder: string; folio: string; location: string } | null = null
    if (body?.autoArchive === true && !inv.archived) {
      const binder = await resolveAutoBinder(inv)
      if (binder) {
        const folio = String(await nextFolioOf(binder.id))
        const rejectedAuto = inv.items.filter((it) => it.accepted === false)
        const totalAcceptedAuto = inv.items.filter((it) => it.accepted !== false).reduce((sm, it) => sm + it.totalCost, 0)
        const doc = await db.archiveDocument.create({
          data: {
            kind: 'INVOICE',
            title: `فاکتور خرید #${numFa}${inv.supplierName ? ` — ${inv.supplierName}` : ''}`,
            dateJalali: inv.dateJalali || todayJalaliDash(),
            supplierId: inv.supplierId,
            supplierName: inv.supplierName,
            holooInvoiceNo: inv.holooInvoiceNo,
            holooReceiptNo: inv.holooReceiptNo,
            binderId: binder.id,
            folio,
            amount: totalAcceptedAuto,
            status: 'ARCHIVED',
            returnedJson: JSON.stringify(rejectedAuto.map((it) => ({ name: it.productName, qty: it.quantity, reason: it.rejectReason ?? 'دیگر' }))),
            note: [
              inv.providerDocNumber ? `سند تأمین‌کننده: ${inv.providerDocNumber}` : null,
              inv.purchaseOrderId ? 'سند خرید این فاکتور در «انبار و سفارش» ثبت شده است' : null,
              'بایگانی خودکار پس از تأیید مدیر کل',
            ].filter(Boolean).join(' · ') || null,
            createdById: me.id,
            createdByName: me.fullName,
          },
        })
        await db.marginInvoice.update({
          where: { id },
          data: {
            status: 'archived',
            archived: true,
            archivedAt: now,
            archiveDocId: doc.id,
            historyJson: withEvent(
              (
                await db.marginInvoice.findUnique({ where: { id }, select: { historyJson: true } })
              )?.historyJson ?? '[]',
              {
                at: nowIso,
                by: me.fullName,
                action: 'archive',
                detail: `بایگانی خودکار — ${binder.shelf?.cabinet?.name ?? 'کابینت؟'} ‹ ${binder.shelf?.name ?? 'قفسه؟'} ‹ زون‌بند «${binder.name}» · برگه ${toFaDigits(folio)}`,
              },
            ),
          },
        })
        autoArchived = {
          docId: doc.id,
          binder: binder.name,
          folio,
          location: `${binder.shelf?.cabinet?.name ? `${binder.shelf.cabinet.name} ‹ ` : ''}${binder.shelf?.name ? `${binder.shelf.name} ‹ ` : ''}زون‌بند «${binder.name}»`,
        }
      }
    }

    await notifyRoles(['ACC', 'OWNER', 'ADMIN', 'EXEC'], {
      kind: `margin:gm:${inv.id}`,
      severity: 'success',
      title: autoArchived ? 'تأیید مدیر کل انجام شد — سند خودکار بایگانی شد' : 'تأیید مدیر کل انجام شد — آمادهٔ بایگانی',
      body: `فاکتور #${numFa} (${inv.supplierName ?? 'بدون تأمین‌کننده'}) توسط ${me.fullName} تأیید شد.${prices.holooEnabled && prices.pushedHoloo ? ` قیمت ${toFaDigits(String(prices.pushedHoloo))} کالا در هلو به‌روز شد.` : ''}${autoArchived ? ` بایگانی خودکار: ${autoArchived.location} · برگه ${toFaDigits(autoArchived.folio)}.` : ' سند کاغذی را در زون‌بند آرشیو بایگانی کنید.'}`,
      go: `#/finance/invoices?open=${inv.id}`,
    })

    await logActivity({
      userId: me.id, userName: me.fullName,
      action: 'margin.gmApprove', actionLabel: 'تأیید مدیر کل فاکتور خرید',
      category: 'profit',
      detail: `#${numFa} — ${toFaDigits(String(prices.updatedLocal))} قیمت به‌روز / ${toFaDigits(String(prices.pushedHoloo))} در هلو`,
      entityId: id,
    })

    return ok({ id, status: autoArchived ? 'archived' : updated.status, gmApprovedAt: nowIso, gmApprovedByName: me.fullName, prices, autoArchived })
  }

  /* ── گام ۶: بایگانی سند — ثبت در نظام آرشیو + زون‌بند/برگه ── */
  if (action === 'archive') {
    if (!REVIEW_ROLES.includes(me.role)) return fail('بایگانی سند فقط برای حسابدار یا مدیران ممکن است', 403)
    if (inv.status !== 'final') return fail('بایگانی فقط برای «فاکتور خرید» نهایی‌شده ممکن است')
    if (!inv.gmApprovedAt) return fail('پیش از بایگانی، تأیید نهایی مدیر کل (خانم لطفی) لازم است — در همین پنجره دکمهٔ «تأیید مدیر کل»')
    if (inv.archived || inv.archiveDocId) return fail('این فاکتور قبلاً بایگانی شده است')

    const binderId = String(body?.binderId ?? '').trim() || null
    if (!binderId) return fail('زون‌بند (جایگاه فیزیکی سند کاغذی) را انتخاب کنید')
    const binder = await db.archiveBinder.findUnique({
      where: { id: binderId },
      include: { shelf: { include: { cabinet: true } } },
    })
    if (!binder) return fail('زون‌بند یافت نشد')

    /* R14: «این زون‌بند را برای این شرکت ذخیره کن» — بایگانی خودکارِ فاکتورهای بعدی */
    if (body?.saveBinder === true) {
      const map = await readAutoBind()
      for (const k of supplierKeysOf(inv)) map[k] = binderId
      await writeAutoBind(map)
    }

    const folio = String(body?.folio ?? '').trim().slice(0, 60) || null
    const holooInvoiceNo = String(body?.holooInvoiceNo ?? '').trim().slice(0, 60) || null
    const holooReceiptNo = String(body?.holooReceiptNo ?? '').trim().slice(0, 60) || null

    let scanDataUrl: string | null = null
    let scanName: string | null = null
    if (body?.scan != null && body.scan !== '') {
      const dataUrl = String((body.scan as { dataUrl?: string })?.dataUrl ?? body.scan)
      const name = String((body.scan as { name?: string })?.name ?? '').slice(0, 120)
      if (!/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl)) return fail('قالب اسکن باید PNG/JPG/WebP باشد')
      if (dataUrl.length > 420_000) return fail('حجم اسکن بیش از حد مجاز است (حداکثر ~۳۰۰ کیلوبایت)')
      scanDataUrl = dataUrl
      scanName = name || 'اسکن فاکتور خرید'
    }

    /* اقلام مرجوعی — در سند آرشیو قرمز می‌شوند */
    const rejected = inv.items.filter((it) => it.accepted === false)
    const returnedJson = JSON.stringify(
      rejected.map((it) => ({ name: it.productName, qty: it.quantity, reason: it.rejectReason ?? 'دیگر' })),
    )
    const totalAccepted = inv.items.filter((it) => it.accepted !== false).reduce((s, it) => s + it.totalCost, 0)

    const doc = await db.archiveDocument.create({
      data: {
        kind: 'INVOICE',
        title: `فاکتور خرید #${numFa}${inv.supplierName ? ` — ${inv.supplierName}` : ''}`,
        dateJalali: inv.dateJalali || todayJalaliDash(),
        supplierId: inv.supplierId,
        supplierName: inv.supplierName,
        holooInvoiceNo: holooInvoiceNo || inv.holooInvoiceNo,
        holooReceiptNo: holooReceiptNo || inv.holooReceiptNo,
        binderId,
        folio,
        amount: totalAccepted,
        status: 'ARCHIVED',
        returnedJson,
        note: [
          inv.providerDocNumber ? `سند تأمین‌کننده: ${inv.providerDocNumber}` : null,
          inv.purchaseOrderId ? 'سند خرید این فاکتور در «انبار و سفارش» ثبت شده است' : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
        scanDataUrl,
        scanName,
        createdById: me.id,
        createdByName: me.fullName,
      },
    })

    await db.marginInvoice.update({
      where: { id },
      data: {
        status: 'archived',
        archived: true,
        archivedAt: now,
        archiveDocId: doc.id,
        holooInvoiceNo: holooInvoiceNo || inv.holooInvoiceNo,
        holooReceiptNo: holooReceiptNo || inv.holooReceiptNo,
        historyJson: withEvent(inv.historyJson, {
          at: nowIso,
          by: me.fullName,
          action: 'archive',
          detail: `سند کاغذی بایگانی شد — ${binder.shelf?.cabinet?.name ?? 'کابینت؟'} ‹ ${binder.shelf?.name ?? 'قفسه؟'} ‹ زون‌بند «${binder.name}»${folio ? ` · برگه ${toFaDigits(folio)}` : ''}${holooInvoiceNo ? ` · هلو فاکتور ${toFaDigits(holooInvoiceNo)}` : ''}${holooReceiptNo ? ` · هلو رسید ${toFaDigits(holooReceiptNo)}` : ''}`,
        }),
      },
    })

    await logActivity({
      userId: me.id, userName: me.fullName,
      action: 'margin.archive', actionLabel: 'بایگانی فاکتور خرید',
      category: 'profit',
      detail: `#${numFa} → سند آرشیو ${doc.id.slice(-6)} — زون‌بند «${binder.name}»`,
      entityId: id,
    })

    return ok({ id, status: 'archived', archivedAt: nowIso, archiveDocId: doc.id, docId: doc.id })
  }

  /* ── بازکردن بایگانی (در صورت اشتباه) — مدیران ارشد ── */
  if (action === 'unarchive') {
    if (!MANAGER_ROLES.includes(me.role)) return fail('بازکردن بایگانی فقط برای مدیران ارشد ممکن است', 403)
    if (!inv.archived) return fail('این فاکتور بایگانی نشده است')
    if (inv.archiveDocId) {
      await db.archiveDocument.deleteMany({ where: { id: inv.archiveDocId } }).catch(() => {})
    }
    const updated = await db.marginInvoice.update({
      where: { id },
      data: {
        status: 'final',
        archived: false,
        archivedAt: null,
        archiveDocId: null,
        historyJson: withEvent(inv.historyJson, { at: nowIso, by: me.fullName, action: 'unarchive', detail: 'بایگانی باز شد — سند آرشیو مرتبط حذف شد؛ پس از اصلاح، دوباره بایگانی کنید' }),
      },
    })
    await logActivity({
      userId: me.id, userName: me.fullName,
      action: 'margin.unarchive', actionLabel: 'بازکردن بایگانی فاکتور',
      category: 'profit', detail: `#${numFa}`, entityId: id,
    })
    return ok({ id, status: updated.status, archived: false })
  }

  /* ── لغو فاکتور (کل محموله مرجوع/ابطال) ── */
  if (action === 'cancel') {
    if (!MANAGER_ROLES.includes(me.role)) return fail('لغو فاکتور فقط برای مدیران ارشد ممکن است', 403)
    if (inv.status !== 'draft' && inv.status !== 'delivered')
      return fail('لغو فقط برای پیش‌نویس یا فاکتور تحویل‌شده (پیش از ثبت خرید) ممکن است')
    if (inv.purchaseOrderId) return fail('برای این فاکتور سند خرید ثبت شده — از مسیر سفارش‌ها پیگیری کنید')
    const reason = String(body?.reason ?? '').trim()
    if (reason.length < 3) return fail('علت لغو را حداقل با ۳ حرف بنویسید')
    const updated = await db.marginInvoice.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledAt: now,
        cancelledByName: me.fullName,
        cancelReason: reason.slice(0, 300),
        historyJson: withEvent(inv.historyJson, { at: nowIso, by: me.fullName, action: 'cancel', detail: `لغو شد — علت: ${reason.slice(0, 200)}` }),
      },
    })
    await logActivity({
      userId: me.id, userName: me.fullName,
      action: 'margin.cancel', actionLabel: 'لغو فاکتور سودسنج',
      category: 'profit', detail: `#${numFa} — ${reason.slice(0, 120)}`, entityId: id,
    })
    return ok({ id, status: updated.status })
  }

  /* سازگار با گذشته: action:'archive' قدیمی (قفل بدون سند) دیگر پشتیبانی نمی‌شود؛
     بایگانی واقعی از مسیر بالا با زون‌بند انجام می‌شود. */

  // plain field update (note / items) — archived stays locked
  if (!MARGIN_ROLES.includes(me.role)) return fail('شما مجاز به ویرایش فاکتور سودسنج نیستید', 403)
  if (inv.archived) return fail('فاکتور بایگانی‌شده قابل ویرایش نیست؛ ابتدا بایگانی را باز کنید')
  if (inv.status !== 'draft' && inv.status !== 'final')
    return fail('در این وضعیت، ویرایش مستقیم مجاز نیست — از بررسی حسابداری در دفتر فاکتورها استفاده کنید')
  const thresholds = await getMarginThresholds()
  const data: Record<string, unknown> = {}
  if (body?.note !== undefined) data.note = String(body.note ?? '').trim() || null
  if (body?.providerDocNumber !== undefined) data.providerDocNumber = String(body.providerDocNumber ?? '').trim() || null
  if (Array.isArray(body?.items) && body.items.length) {
    await db.marginItem.deleteMany({ where: { invoiceId: id } })
    const items = body.items.map((raw: Record<string, unknown>) =>
      deriveItem(
        {
          productId: raw?.productId ? String(raw.productId) : null,
          barcode: raw?.barcode ? String(raw.barcode).trim() : null,
          productName: String(raw?.productName ?? '').trim() || '—',
          unit: String(raw?.unit ?? 'عدد').trim() || 'عدد',
          quantity: Math.round((Number(raw?.quantity) || 1) * 1000) / 1000,
          totalCost: Number(raw?.totalCost) || 0,
          printedPrice: Number(raw?.printedPrice) || 0,
          note: raw?.note ? String(raw.note).trim() : null,
          salePrice: Number(raw?.salePrice) || 0,
          marginPct: Number(raw?.marginPct) || 0,
          free100: raw?.free100 === true,
          baseCost: Number(raw?.baseCost) || 0,
        },
        thresholds,
      ) as MarginItemInput & { alertsJson: string },
    )
    data.items = { create: items }
    data.historyJson = withEvent(inv.historyJson, { at: nowIso, by: me.fullName, action: 'edit', detail: 'ویرایش اقلام' })
  }
  await db.marginInvoice.update({ where: { id }, data })
  const refreshed = await db.marginInvoice.findUnique({ where: { id }, include: { items: { select: { quantity: true, totalCost: true, printedPrice: true, salePrice: true } } } })
  return ok(refreshed ? invoiceListOut(refreshed) : { id })
}

/** DELETE /api/margin/[id] — بایگانی‌شده و فاکتورهای ثبت‌شده قابل حذف نیستند */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!MARGIN_ROLES.includes(me.role)) return fail('شما مجاز به حذف فاکتور سودسنج نیستید', 403)

  const { id } = await ctx.params
  const inv = await db.marginInvoice.findUnique({ where: { id } })
  if (!inv) return fail('فاکتور یافت نشد', 404)
  if (inv.archived) return fail('فاکتور بایگانی‌شده قابل حذف نیست؛ ابتدا بایگانی را باز کنید')
  if (inv.purchaseOrderId) return fail('برای این فاکتور سند خرید ثبت شده — ابتدا از مسیر سفارش‌ها اصلاح کنید')
  if (inv.status === 'reviewing')
    return fail('فاکتورِ در بررسی حسابداری قابل حذف نیست — ابتدا لغوش کنید')

  await db.marginInvoice.delete({ where: { id } })
  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'margin.delete',
    actionLabel: 'حذف فاکتور سودسنج',
    category: 'profit',
    detail: `#${toFaDigits(String(inv.number))} — ${inv.supplierName ?? ''}`,
    entityId: id,
  })
  return ok({ id })
}

/* ── R14: بایگانی خودکار — نگاشت شرکت → زون‌بند (Setting archive.autoBind) ── */
const AUTO_BIND_KEY = 'archive.autoBind'
type AutoBindMap = Record<string, string> // "id:<supplierId>" یا "name:<supplierName>" → binderId

async function readAutoBind(): Promise<AutoBindMap> {
  const row = await db.setting.findUnique({ where: { key: AUTO_BIND_KEY } })
  const parsed = safeJson<Record<string, unknown>>(row?.value, {})
  const out: AutoBindMap = {}
  if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed)) {
      const key = String(k ?? '').trim()
      const val = String(v ?? '').trim()
      if (/^(id|name):.+/.test(key) && val) out[key] = val
    }
  }
  return out
}

async function writeAutoBind(map: AutoBindMap) {
  if (!Object.keys(map).length) {
    await db.setting.deleteMany({ where: { key: AUTO_BIND_KEY } })
    return
  }
  const value = JSON.stringify(map)
  await db.setting.upsert({ where: { key: AUTO_BIND_KEY }, create: { key: AUTO_BIND_KEY, value }, update: { value } })
}

function supplierKeysOf(inv: { supplierId: string | null; supplierName: string | null }): string[] {
  const keys: string[] = []
  if (inv.supplierId) keys.push(`id:${inv.supplierId}`)
  if (inv.supplierName && inv.supplierName.trim()) keys.push(`name:${inv.supplierName.trim()}`)
  return keys
}

async function resolveAutoBinder(inv: { supplierId: string | null; supplierName: string | null }) {
  const map = await readAutoBind()
  for (const k of supplierKeysOf(inv)) {
    const binderId = map[k]
    if (!binderId) continue
    const binder = await db.archiveBinder
      .findUnique({ where: { id: binderId }, include: { shelf: { include: { cabinet: true } } } })
      .catch(() => null)
    if (binder) return binder
  }
  return null
}

/** برگهٔ بعدی زون‌بند — بیشینهٔ عددی برگه‌های موجود + ۱ */
async function nextFolioOf(binderId: string): Promise<number> {
  const docs = await db.archiveDocument.findMany({ where: { binderId }, select: { folio: true } })
  let max = 0
  for (const d of docs) {
    const n = parseInt(String(d.folio ?? '').replace(/[^0-9]/g, ''), 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return max + 1
}

/** اعلان درون‌برنامه‌ای برای نقش‌ها — R15: با کتابخانهٔ مشترک notify() تا
    هم ردیف زنگ ایجاد شود و هم رویداد لحظه‌ای (realtime) به نقش‌ها برسد. */
import { notify } from '@/lib/notify'
async function notifyRoles(roles: string[], data: { kind: string; severity: string; title: string; body: string; go: string }) {
  for (const role of roles) {
    await notify({ role, kind: data.kind, severity: data.severity, title: data.title, body: data.body, go: data.go }).catch(() => {})
  }
}
