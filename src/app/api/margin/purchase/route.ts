import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { todayJalaliDash, toFaDigits } from '@/lib/jalali'
import { getHolooConfig } from '@/lib/holoo'
import { MARGIN_ROLES, deriveItem, getMarginThresholds } from '../route'

export const dynamic = 'force-dynamic'

/** «ثبت تحویل و خرید» — R5-B req#5
 *  POST /api/margin/purchase
 *  یک فاکتور سودسنج (status=final) + یک سند خرید (Order RECEIVED با اقلام دریافت‌شده)
 *  می‌سازد؛ موجودی و بهای آخرین خرید و قیمت فروش کالاها هم مثل فرایند «دریافت» به‌روز می‌شود.
 *  بدنه: {supplierId?, supplierName, note?, providerDocNumber?, dateJalali?, payMethod?, pushToHoloo?, items:[…]}
 *  pushToHoloo=true → تلاش برای ثبت سفارش خرید در هلو (Apex) با همان انتگراسیون /api/holoo/sync؛
 *  اگر در دسترس نبود، ردیف HolooSyncLog با وضعیت FAIL/در انتظار ثبت می‌شود (الگوی موجود).
 */

function faMoney(n: number): string {
  return toFaDigits(Math.round(n).toLocaleString('en-US')).replace(/,/g, '٬')
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!MARGIN_ROLES.includes(me.role)) return fail('شما مجاز به ثبت تحویل و خرید نیستید', 403)

  const body = await req.json().catch(() => null)
  if (!body) return fail('درخواست نامعتبر است')

  const supplierName = String(body.supplierName ?? '').trim() || null
  if (!supplierName) return fail('تأمین‌کننده را انتخاب یا نامش را وارد کنید')

  let supplierId: string | null = String(body.supplierId ?? '').trim() || null
  if (supplierId) {
    const sup = await db.supplier.findUnique({ where: { id: supplierId } })
    if (!sup) return fail('تأمین‌کننده یافت نشد')
  } else {
    supplierId = null
  }

  const note = String(body.note ?? '').trim() || null
  const providerDocNumber = String(body.providerDocNumber ?? '').trim() || null
  const payMethod = ['CASH', 'CHEQUE', 'POS'].includes(String(body.payMethod)) ? String(body.payMethod) : 'CASH'
  const dateJalali =
    typeof body?.dateJalali === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dateJalali.trim())
      ? body.dateJalali.trim()
      : todayJalaliDash()

  const rawItems = Array.isArray(body.items) ? body.items : []
  if (rawItems.length === 0) return fail('فاکتور باید حداقل یک قلم داشته باشد')
  const pushToHoloo = body.pushToHoloo === true

  const thresholds = await getMarginThresholds()

  type DerivedItem = ReturnType<typeof deriveItem>
  const items: DerivedItem[] = []
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
      ),
    )
  }

  const totalAmount = items.reduce((s, it) => s + it.totalCost, 0)

  /* شمارهٔ بعدی فاکتور سودسنج */
  const maxNumber = await db.marginInvoice.aggregate({ _max: { number: true } })
  const number = (maxNumber._max.number ?? 0) + 1

  /* کد بعدی سند خرید: HZ-ORD-NNN (همان الگوی /api/orders) */
  const last = await db.order.findFirst({ orderBy: { code: 'desc' } })
  let next = 1
  if (last) {
    const m = last.code.match(/HZ-ORD-(\d+)$/)
    if (m) next = Math.max(1, parseInt(m[1], 10) + 1)
  }
  const code = `HZ-ORD-${String(next).padStart(3, '0')}`

  const now = new Date()
  const nowIso = now.toISOString()
  const extras = {
    note,
    paymentRef: null,
    marginInvoiceNumber: number,
    providerDocNumber,
    source: 'margin' as const,
    history: [
      { at: nowIso, by: me.fullName, action: 'create', detail: `ثبت تحویل و خرید از سودسنج — ${items.length} قلم، جمع ${faMoney(totalAmount)} ریال` },
      { at: nowIso, by: me.fullName, action: 'receive', detail: 'تحویل در لحظهٔ ثبت سودسنج — همهٔ اقلام کامل دریافت شد' },
    ],
  }

  /* اقلام سند خرید — qty ستون عددی است؛ عدد اعشاری در یادداشت خط می‌ماند */
  const orderItems = items.map((it) => {
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
        ? `تعداد دقیق سودسنج: ${toFaDigits(String(it.quantity))} ${it.unit}${providerDocNumber ? ` · سند تأمین‌کننده ${toFaDigits(providerDocNumber)}` : ''}`
        : null,
    }
  })

  const invoice = await db.marginInvoice.create({
    data: {
      number,
      supplierId,
      supplierName,
      note,
      status: 'final',
      providerDocNumber,
      dateJalali,
      items: { create: items },
    },
  })

  const order = await db.order.create({
    data: {
      code,
      status: 'RECEIVED',
      supplierId,
      supplierName,
      deliveryDate: dateJalali,
      payMethod,
      notes: JSON.stringify(extras),
      totalAmount,
      createdById: me.id,
      createdByName: me.fullName,
      receivedAt: now,
      items: { create: orderItems },
    },
  })

  /* پیوند دو سند */
  await db.marginInvoice.update({ where: { id: invoice.id }, data: { purchaseOrderId: order.id } })

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

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'margin.purchase',
    actionLabel: 'ثبت تحویل و خرید',
    category: 'profit',
    detail: `فاکتور #${toFaDigits(String(number))} + سند خرید ${code} — ${supplierName} — ${items.length} قلم، جمع ${faMoney(totalAmount)} ریال`,
    entityId: invoice.id,
  })

  /* ── تلاش برای ثبت سفارش خرید در هلو (Apex) — همان انتگراسیون موجود /api/holoo/sync ──
     اگر اتصال در دسترس نباشد: ثبت HolooSyncLog (FAIL/در انتظار) و بازگرداندن pending=true؛
     سفارش با holooErp=null در صف «ارسال گروهی سفارش‌ها» بخش هلو می‌ماند. */
  let holoo: { pushed: boolean; pending?: boolean; reason?: string; invoiceNo?: string } | null = null
  if (pushToHoloo) {
    try {
      const cfg = await getHolooConfig()
      if (!cfg.enabled) {
        holoo = { pushed: false, pending: true, reason: 'اتصال هلو غیرفعال است' }
        await db.holooSyncLog
          .create({
            data: {
              kind: 'PUSH_ORDER',
              status: 'FAIL',
              statsJson: JSON.stringify({ orderCode: code, source: 'margin', pending: true, invoiceNumber: number }),
              error: 'اتصال هلو غیرفعال است — سفارش خرید در انتظار ارسال',
            },
          })
          .catch(() => {})
      } else {
        /* فراخوانی درون‌سروری همان مسیر موجود — بدون کپی‌کردن منطق pushOrder */
        const origin = new URL(req.url).origin
        const hres = await fetch(`${origin}/api/holoo/sync`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: req.headers.get('cookie') || '' },
          body: JSON.stringify({ what: 'order', mode: 'push', orderId: order.id }),
        })
        const hj = (await hres.json().catch(() => null)) as { ok?: boolean; data?: Record<string, unknown>; error?: string } | null
        if (hres.ok && hj?.ok) {
          holoo = { pushed: true, invoiceNo: String(hj.data?.invoiceNo ?? '') || undefined }
        } else {
          const reason = String(hj?.error ?? `خطای ${hres.status}`)
          holoo = { pushed: false, pending: true, reason }
          await db.holooSyncLog
            .create({
              data: {
                kind: 'PUSH_ORDER',
                status: 'FAIL',
                statsJson: JSON.stringify({ orderCode: code, source: 'margin', pending: true, invoiceNumber: number }),
                error: `تلاش از سودسنج ناموفق — ${reason}`,
              },
            })
            .catch(() => {})
        }
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'خطای نامشخص'
      holoo = { pushed: false, pending: true, reason }
      await db.holooSyncLog
        .create({
          data: {
            kind: 'PUSH_ORDER',
            status: 'FAIL',
            statsJson: JSON.stringify({ orderCode: code, source: 'margin', pending: true, invoiceNumber: number }),
            error: `تلاش از سودسنج ناموفق — ${reason}`,
          },
        })
        .catch(() => {})
    }
  }

  return ok({
    invoice: { id: invoice.id, number: invoice.number, status: invoice.status },
    order: { id: order.id, code: order.code, status: order.status },
    totalAmount,
    stockUpdated,
    holoo,
  })
}
