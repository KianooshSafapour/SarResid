import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { todayJalaliDash, toFaDigits } from '@/lib/jalali'
import { MARGIN_ROLES, deriveItem, getMarginThresholds } from '../route'
import { createPurchaseOrder, pushOrderToHoloo, faMoney, type PurchaseDerivedItem } from '@/lib/margin-purchase'

export const dynamic = 'force-dynamic'

/** «ثبت تحویل و خرید» — R5-B req#5 (مسیر سریع)
 *  POST /api/margin/purchase
 *  یک فاکتور سودسنج (status=final) + یک سند خرید (Order RECEIVED با اقلام دریافت‌شده)
 *  می‌سازد؛ موجودی و بهای آخرین خرید و قیمت فروش کالاها هم مثل فرایند «دریافت» به‌روز می‌شود.
 *  بدنه: {supplierId?, supplierName, note?, providerDocNumber?, dateJalali?, payMethod?, pushToHoloo?, items:[…]}
 *  pushToHoloo=true → تلاش برای ثبت سفارش خرید در هلو (Apex) با همان انتگراسیون /api/holoo/sync؛
 *  اگر در دسترس نبود، ردیف HolooSyncLog با وضعیت FAIL/در انتظار ثبت می‌شود (الگوی موجود).
 *
 *  R12: مسیر گام‌به‌گام (پیش‌نویس → تحویل → بررسی → فاکتور خرید → بایگانی) از
 *  PATCH /api/margin/[id] action=finalize می‌گذرد و همان منطق مشترک
 *  src/lib/margin-purchase.ts را استفاده می‌کند. این ENDPOINT برای ثبت یک‌ضربهٔ
 *  تحویلِ بی‌مشکل باقی مانده (سازگار با گذشته). پس از ثبت، فاکتور در دفتر
 *  فاکتورها با وضعیت «فاکتور خرید» می‌نشیند و بایگانی سند کاغذی همان‌جا انجام می‌شود.
 */

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

  const items: (ReturnType<typeof deriveItem>)[] = []
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

  /* شمارهٔ بعدی فاکتور سودسنج */
  const maxNumber = await db.marginInvoice.aggregate({ _max: { number: true } })
  const number = (maxNumber._max.number ?? 0) + 1

  const invoice = await db.marginInvoice.create({
    data: {
      number,
      supplierId,
      supplierName,
      note,
      status: 'final',
      providerDocNumber,
      dateJalali,
      finalizedAt: new Date(),
      finalizedById: me.id,
      finalizedByName: me.fullName,
      historyJson: JSON.stringify([
        { at: new Date().toISOString(), by: me.fullName, action: 'create', detail: 'ثبت یک‌ضربهٔ تحویل و خرید از فاکتورنویس سودسنج' },
        { at: new Date().toISOString(), by: me.fullName, action: 'finalize', detail: 'فاکتور خرید نهایی شد (مسیر سریع) — پس از بایگانی کاغذی، از دفتر فاکتورها سند را بایگانی کنید' },
      ]),
      items: { create: items },
    },
  })

  const { order, totalAmount, stockUpdated } = await createPurchaseOrder({
    items: items as unknown as PurchaseDerivedItem[],
    supplierId,
    supplierName,
    note,
    providerDocNumber,
    dateJalali,
    payMethod,
    actor: { id: me.id, fullName: me.fullName },
    marginInvoiceNumber: number,
    sourceLabel: 'ثبت تحویل و خرید از سودسنج',
  })

  /* پیوند دو سند */
  await db.marginInvoice.update({ where: { id: invoice.id }, data: { purchaseOrderId: order.id } })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'margin.purchase',
    actionLabel: 'ثبت تحویل و خرید',
    category: 'profit',
    detail: `فاکتور #${toFaDigits(String(number))} + سند خرید ${order.code} — ${supplierName} — ${items.length} قلم، جمع ${faMoney(totalAmount)} ریال`,
    entityId: invoice.id,
  })

  /* ── تلاش برای ثبت سفارش خرید در هلو (Apex) — همان انتگراسیون موجود /api/holoo/sync ──
     اگر اتصال در دسترس نباشد: ثبت HolooSyncLog (FAIL/در انتظار) و بازگرداندن pending=true؛
     سفارش با holooErp=null در صف «ارسال گروهی سفارش‌ها» بخش هلو می‌ماند. */
  let holoo: { pushed: boolean; pending?: boolean; reason?: string; invoiceNo?: string } | null = null
  if (pushToHoloo) {
    holoo = await pushOrderToHoloo({
      orderId: order.id,
      orderCode: order.code,
      marginInvoiceNumber: number,
      cookie: req.headers.get('cookie'),
      origin: `http://127.0.0.1:${process.env.PORT || 3000}`,
    })
  }

  return ok({
    invoice: { id: invoice.id, number: invoice.number, status: invoice.status },
    order: { id: order.id, code: order.code, status: order.status },
    totalAmount,
    stockUpdated,
    holoo,
  })
}
