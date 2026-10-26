import { db } from '@/lib/db'
import { toFaDigits } from '@/lib/jalali'
import { getHolooConfig } from '@/lib/holoo'

/**
 * R12 — منطق مشترک «ثبت خرید» سودسنج.
 * پیش از این فقط POST /api/margin/purchase از آن استفاده می‌کرد؛ حالا گام
 * «فاکتور خرید» در گردش‌کار دفتر فاکتورها (PATCH /api/margin/[id] action=finalize)
 * هم همان مسیر را طی می‌کند تا سند خرید، موجودی/قیمت کالا و هلو همیشه یکسان
 * به‌روز شوند — بدون کپی‌کردن منطق.
 */

export interface PurchaseDerivedItem {
  productId: string | null
  barcode: string | null
  productName: string
  unit: string
  quantity: number
  totalCost: number
  unitCost: number
  printedPrice: number
  salePrice: number
  free100: boolean
  baseCost: number
}

export interface HolooPushOutcome {
  pushed: boolean
  pending?: boolean
  reason?: string
  invoiceNo?: string
}

export function faMoney(n: number): string {
  return toFaDigits(Math.round(n).toLocaleString('en-US')).replace(/,/g, '٬')
}

/** کد بعدی سند خرید: HZ-ORD-NNN (همان الگوی /api/orders) */
export async function nextOrderCode(): Promise<string> {
  const last = await db.order.findFirst({ orderBy: { code: 'desc' } })
  let next = 1
  if (last) {
    const m = last.code.match(/HZ-ORD-(\d+)$/)
    if (m) next = Math.max(1, parseInt(m[1], 10) + 1)
  }
  return `HZ-ORD-${String(next).padStart(3, '0')}`
}

/** ثبت سند خرید (Order RECEIVED) + به‌روزرسانی موجودی/بهای خرید/قیمت فروش کالاها.
 *  پیوند فاکتور (purchaseOrderId) و ثبت رویداد با فراخواننده است. */
export async function createPurchaseOrder(opts: {
  items: PurchaseDerivedItem[]
  supplierId: string | null
  supplierName: string | null
  note: string | null
  providerDocNumber: string | null
  dateJalali: string
  payMethod: string
  actor: { id: string; fullName: string }
  marginInvoiceNumber?: number
  sourceLabel?: string
  receivedDetail?: string
}): Promise<{ order: { id: string; code: string; status: string }; totalAmount: number; stockUpdated: number }> {
  const code = await nextOrderCode()
  const totalAmount = opts.items.reduce((s, it) => s + it.totalCost, 0)
  const now = new Date()
  const numFa = opts.marginInvoiceNumber != null ? toFaDigits(String(opts.marginInvoiceNumber)) : null
  const extras = {
    note: opts.note,
    paymentRef: null,
    marginInvoiceNumber: opts.marginInvoiceNumber ?? null,
    providerDocNumber: opts.providerDocNumber,
    source: 'margin' as const,
    history: [
      {
        at: now.toISOString(),
        by: opts.actor.fullName,
        action: 'create',
        detail: `${opts.sourceLabel ?? 'ثبت تحویل و خرید از سودسنج'}${numFa ? ` — فاکتور #${numFa}` : ''} — ${opts.items.length} قلم، جمع ${faMoney(totalAmount)} ریال`,
      },
      {
        at: now.toISOString(),
        by: opts.actor.fullName,
        action: 'receive',
        detail: opts.receivedDetail ?? 'تحویل در لحظهٔ ثبت سودسنج — همهٔ اقلام کامل دریافت شد',
      },
    ],
  }

  /* اقلام سند خرید — qty ستون عددی است؛ عدد اعشاری در یادداشت خط می‌ماند */
  const orderItems = opts.items.map((it) => {
    const qtyInt = Math.max(1, Math.round(it.quantity))
    const fractional = Math.abs(it.quantity - qtyInt) > 1e-9
    return {
      productId: it.productId,
      name: it.productName,
      barcode: it.barcode,
      qty: qtyInt,
      unitBuyPrice: Math.max(0, Math.round(it.unitCost)),
      printedPrice: Math.max(0, Math.round(it.salePrice || it.printedPrice)),
      receivedQty: qtyInt,
      status: 'OK',
      lineTotal: Math.round(it.totalCost),
      note: fractional
        ? `تعداد دقیق سودسنج: ${toFaDigits(String(it.quantity))} ${it.unit}${opts.providerDocNumber ? ` · سند تأمین‌کننده ${toFaDigits(opts.providerDocNumber)}` : ''}`
        : null,
    }
  })

  const order = await db.order.create({
    data: {
      code,
      status: 'RECEIVED',
      supplierId: opts.supplierId,
      supplierName: opts.supplierName,
      deliveryDate: opts.dateJalali,
      payMethod: opts.payMethod,
      notes: JSON.stringify(extras),
      totalAmount,
      createdById: opts.actor.id,
      createdByName: opts.actor.fullName,
      receivedAt: now,
      items: { create: orderItems },
    },
  })

  /* موجودی و بهای آخرین خرید و قیمت فروش — مثل پایان «دریافت» در سفارش‌ها
     قیمت فروش (فروشگاهی) کالا = قیمت نهایی سودسنج (printedPrice سند = salePrice || چاپی) */
  let stockUpdated = 0
  for (const it of orderItems) {
    if (!it.productId) continue
    const qty = it.receivedQty ?? it.qty
    if (qty > 0) {
      await db.product
        .update({
          where: { id: it.productId },
          data: {
            stock: { increment: qty },
            /* بهای خرید واقعی این تحویل → حافظهٔ کالا برای سودسنج بعدی */
            ...(it.unitBuyPrice > 0 ? { lastBuyPrice: it.unitBuyPrice } : {}),
            /* قیمت فروش نهایی تعیین‌شده در سودسنج → قیمت فروشگاهی کالا */
            ...(it.printedPrice > 0 ? { sellPrice: it.printedPrice } : {}),
          },
        })
        .catch(() => {})
      stockUpdated++
    }
  }

  return { order: { id: order.id, code: order.code, status: order.status }, totalAmount, stockUpdated }
}

/** تلاش برای ثبت سفارش خرید در هلو (Apex) — همان انتگراسیون /api/holoo/sync.
 *  اگر در دسترس نبود: HolooSyncLog (FAIL/در انتظار) و سفارش با holooErp=null
 *  در صف «ارسال گروهی سفارش‌ها» می‌ماند. cookie درخواستِ اصلی را می‌گیرد
 *  تا فراخوانی درون‌سروری احراز هویت را رد نکند. */
export async function pushOrderToHoloo(opts: {
  orderId: string
  orderCode: string
  marginInvoiceNumber?: number
  cookie: string | null
  origin: string
}): Promise<HolooPushOutcome> {
  try {
    const cfg = await getHolooConfig()
    if (!cfg.enabled) {
      await db.holooSyncLog
        .create({
          data: {
            kind: 'PUSH_ORDER',
            status: 'FAIL',
            statsJson: JSON.stringify({
              orderCode: opts.orderCode,
              source: 'margin',
              pending: true,
              invoiceNumber: opts.marginInvoiceNumber ?? null,
            }),
            error: 'اتصال هلو غیرفعال است — سفارش خرید در انتظار ارسال',
          },
        })
        .catch(() => {})
      return { pushed: false, pending: true, reason: 'اتصال هلو غیرفعال است' }
    }
    const hres = await fetch(`${opts.origin}/api/holoo/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(opts.cookie ? { cookie: opts.cookie } : {}) },
      body: JSON.stringify({ what: 'order', mode: 'push', orderId: opts.orderId }),
    })
    const hj = (await hres.json().catch(() => null)) as { ok?: boolean; data?: Record<string, unknown>; error?: string } | null
    if (hres.ok && hj?.ok) {
      return { pushed: true, invoiceNo: String(hj.data?.invoiceNo ?? '') || undefined }
    }
    const reason = String(hj?.error ?? `خطای ${hres.status}`)
    await logHolooFail(opts, `تلاش از سودسنج ناموفق — ${reason}`)
    return { pushed: false, pending: true, reason }
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'خطای نامشخص'
    await logHolooFail(opts, `تلاش از سودسنج ناموفق — ${reason}`)
    return { pushed: false, pending: true, reason }
  }
}

async function logHolooFail(opts: { orderId: string; orderCode: string; marginInvoiceNumber?: number }, error: string) {
  await db.holooSyncLog
    .create({
      data: {
        kind: 'PUSH_ORDER',
        status: 'FAIL',
        statsJson: JSON.stringify({
          orderCode: opts.orderCode,
          source: 'margin',
          pending: true,
          invoiceNumber: opts.marginInvoiceNumber ?? null,
        }),
        error,
      },
    })
    .catch(() => {})
}
