/**
 * R22 — Holoo Purchase Invoice Push (فاکتور خرید، نه سفارش)
 * ---------------------------------------------------------------------------
 * سفارش‌ها فقط در سر رسید می‌مانند. وقتی سودسنج تأیید شد و «ثبت فاکتور» زده شد،
 * فاکتور خرید (type=3) از طریق POST /Invoice/Invoice به هلو می‌رود.
 * شمارهٔ فاکتور و شمارهٔ سند برمی‌گردند و در MarginInvoice ذخیره می‌شوند.
 */
import { db } from '@/lib/db'
import {
  getHolooConfig,
  createInvoice, createCustomer,
  assertHolooWrite,
  dateToGregorian,
  dateToHm,
  type HolooInvoiceDetail,
} from '@/lib/holoo'

export interface PurchaseInvoiceResult {
  pushed: boolean
  invoiceNo?: string
  sanadNo?: string
  erpCode?: string
  reason?: string
}

/**
 * ثبت فاکتور خرید (type=3) در هلو برای یک MarginInvoice تأییدشده.
 * idempotent: اگر holooInvoiceNo از قبل پر باشد، دوباره ثبت نمی‌شود.
 */
export async function pushPurchaseInvoiceToHoloo(marginInvoiceId: string): Promise<PurchaseInvoiceResult> {
  const inv = await db.marginInvoice.findUnique({
    where: { id: marginInvoiceId },
    include: { items: true },
  })
  if (!inv) return { pushed: false, reason: 'فاکتور سودسنج پیدا نشد' }

  // idempotency — اگر قبلاً ثبت شده، همان را برگردان
  if (inv.holooInvoiceNo) {
    return { pushed: true, invoiceNo: inv.holooInvoiceNo, sanadNo: inv.holooReceiptNo || undefined }
  }

  const cfg = await getHolooConfig()
  if (!cfg.enabled) return { pushed: false, reason: 'اتصال هلو غیرفعال است' }

  // ۱) تأمین‌کننده به‌عنوان طرف حساب
  let customerErp: string | undefined
  if (inv.supplierId) {
    const supplier = await db.supplier.findUnique({ where: { id: inv.supplierId } })
    if (supplier?.holooErp) {
      customerErp = supplier.holooErp
    } else if (supplier) {
      // تأمین‌کننده جدید — در هلو بساز (سرویس واقعی code می‌خواهد)
      try {
        const { createCustomer, assertHolooWrite } = await import('@/lib/holoo')
        const res = await createCustomer(cfg, { name: supplier.name, ispurchaser: false, isseller: true, custtype: 0 })
        customerErp = assertHolooWrite(res, 'تأمین‌کننده').ErpCode || ''
        await db.supplier.update({ where: { id: supplier.id }, data: { holooErp: customerErp } })
      } catch (e) {
        return { pushed: false, reason: `تأمین‌کننده: ${e instanceof Error ? e.message : String(e)}` }
      }
    }
  }

  // ۲) اقلام — فقط کالاهایی که ErpCode هلو دارند
  const products = inv.items.length
    ? await db.product.findMany({
        where: { id: { in: inv.items.filter((i) => i.productId).map((i) => i.productId!) } },
        select: { id: true, holooErp: true },
      })
    : []
  const erpById = new Map(products.map((p) => [p.id, p.holooErp]))

  const details: HolooInvoiceDetail[] = []
  let skipped = 0
  for (const item of inv.items) {
    if (!item.accepted) continue // اقلام ردشده ارسال نمی‌شوند
    const erp = item.productId ? erpById.get(item.productId) : null
    if (!erp) {
      skipped++
      continue
    }
    details.push({
      id: '0',
      ProductErpCode: erp,
      few: item.quantity || 1,
      price: Math.round(item.unitCost || item.totalCost / Math.max(item.quantity, 1)) || 0,
    })
  }

  if (!details.length) {
    return { pushed: false, reason: `هیچ قلم قابل ارسالی نیست (${skipped} قلم بدون ErpCode یا ردشده)` }
  }

  // ۳) صندوق خرید (از تنظیمات)
  const cashSarfaslRow = await db.setting.findUnique({ where: { key: 'holoo:cashSarfasl' } })
  const cashSarfasl = (cashSarfaslRow?.value || '10100010001').replace(/^"|"$/g, '')

  // ۴) ثبت فاکتور خرید (type=3) — نقدی = جمع اقلام
  const itemsTotal = details.reduce((s, d) => s + (d.few || 0) * (d.price || 0), 0)

  try {
    let res = await createInvoice(cfg, {
      type: 3, // فاکتور خرید
      customererpcode: customerErp || '',
      date: dateToGregorian(new Date()),
      time: dateToHm(new Date()),
      cash: Math.round(itemsTotal), // تسویهٔ نقدی کامل
      cashsarfasl: cashSarfasl,
      details,
    })
    if ((res as Record<string, unknown>)?.ErrorCode === 47 && inv.supplierId) {
      const sup2 = await db.supplier.findUnique({ where: { id: inv.supplierId } })
      if (sup2) {
        const newCust = await createCustomer(cfg, { name: sup2.name, ispurchaser: false, isseller: true, custtype: 0 })
        const newErp = assertHolooWrite(newCust, 'فروشنده جدید').ErpCode || ''
        await db.supplier.update({ where: { id: sup2.id }, data: { holooErp: newErp } })
        customerErp = newErp
        res = await createInvoice(cfg, { type: 3, customererpcode: newErp, date: dateToGregorian(new Date()), time: dateToHm(new Date()), cash: Math.round(itemsTotal), cashsarfasl, details })
      }
    }
    const succ = assertHolooWrite(res, 'فاکتور خرید')
    const invoiceNo = succ.ReturnParam1 || ''
    const sanadNo = succ.ReturnParam2 || ''

    // ۵) ذخیرهٔ شماره‌ها در MarginInvoice + رویداد تاریخچه
    const history = (() => {
      try { return JSON.parse(inv.historyJson || '[]') as Array<{ at: string; by: string; action: string; detail?: string }> } catch { return [] }
    })()
    history.push({ at: new Date().toISOString(), by: 'system', action: 'holoo-invoice', detail: `فاکتور خرید ${invoiceNo} — سند ${sanadNo}` })

    await db.marginInvoice.update({
      where: { id: marginInvoiceId },
      data: {
        holooInvoiceNo: invoiceNo,
        holooReceiptNo: sanadNo,
        historyJson: JSON.stringify(history),
      },
    })

    // لاگ موفقیت
    await db.holooSyncLog.create({
      data: {
        kind: 'PURCHASE_INVOICE',
        status: 'OK',
        statsJson: JSON.stringify({ invoiceNumber: inv.number, holooInvoiceNo: invoiceNo, sanadNo, items: details.length, skipped, total: itemsTotal }),
      },
    }).catch(() => {})

    return { pushed: true, invoiceNo, sanadNo }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)

    // لاگ شکست
    await db.holooSyncLog.create({
      data: {
        kind: 'PURCHASE_INVOICE',
        status: 'FAIL',
        statsJson: JSON.stringify({ invoiceNumber: inv.number, items: details.length, skipped }),
        error: msg,
      },
    }).catch(() => {})

    return { pushed: false, reason: msg }
  }
}
