import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { faMoney, faNum } from '@/lib/jalali'

/* ── چرخهٔ زندگی پیش‌فاکتور (راند ۱۹) ──
   NEW → (پذیرش و ویرایش) → CASHIER_EDITED → (آماده) → READY → (تأیید صندوق و تسویه) → DONE
   هر وضعیت فعال قابل لغو است؛ هر تغییری یک ردیف به «دفتر تغییرات» (history) اضافه می‌کند.
   اکشن‌های قدیمی (cashier_edit / done / note) برای سازگاری حفظ شده‌اند. */

const CASHIER_ROLES = ['HC', 'CASHIER', 'GM', 'OM']
const ACTIVE = ['NEW', 'CASHIER_EDITED', 'READY']
/** کلیدهای روش پرداخت — برچسب فارسی همان چیزی است که در UI صندوق انتخاب می‌شود */
const PAY_METHODS: Record<string, string> = {
  CASH: 'نقدی',
  POS: 'کارتخوان فروشگاه',
  CHEQUE: 'چک',
}
/** ارسال status مستقیم (بدون action) — نگاشت به همان مسیر اعتبارسنجی */
const STATUS_TO_ACTION: Record<string, string> = {
  CASHIER_EDITED: 'accept',
  READY: 'ready',
  DONE: 'settle',
  CANCELLED: 'cancel',
}

type HistoryEntry = { at: string; byName: string; action: string; detail: string }
type CleanItem = { productId: string; name: string; qty: number; price: number }

function parseHistory(raw: string): HistoryEntry[] {
  try {
    const v = JSON.parse(raw || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/** اعتبارسنجی سبد: ۱ تا ۲۰۰ قلم؛ هر قلم productId و نام معتبر، تعداد ۱..۹۹۹۹ و قیمت ≥ ۰ */
function sanitizeItems(raw: unknown): { ok: boolean; items: CleanItem[] } {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) return { ok: false, items: [] }
  const items: CleanItem[] = []
  for (const it of raw) {
    const productId = typeof it?.productId === 'string' ? it.productId.trim() : ''
    const name = typeof it?.name === 'string' ? it.name.trim() : ''
    const qty = Math.round(Number(it?.qty))
    const price = Number(it?.price)
    if (!productId || !name || !Number.isFinite(qty) || qty < 1 || qty > 9999 || !Number.isFinite(price) || price < 0)
      return { ok: false, items: [] }
    items.push({ productId, name, qty, price: Math.round(price) })
  }
  return { ok: true, items }
}

const sumTotal = (items: { qty: number; price: number }[]) =>
  items.reduce((s, i) => s + i.qty * i.price, 0)

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const preOrder = await db.preOrder.findUnique({ where: { id } })
  if (!preOrder) return fail('یافت نشد', 404)

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const action =
    (typeof body.action === 'string' && body.action) ||
    (body.status ? STATUS_TO_ACTION[String(body.status)] || '' : '') ||
    (body.note !== undefined ? 'note' : '')
  if (!action) return fail('درخواست نامعتبر است', 400)

  const isCashier =
    CASHIER_ROLES.includes(me.role) || (me.secondaryRoles || []).some((r) => CASHIER_ROLES.includes(r))
  const isCreator = preOrder.createdById === me.id

  const history = parseHistory(preOrder.history)
  const push = (act: string, detail: string) =>
    history.push({ at: new Date().toISOString(), byName: me.name, action: act, detail })

  const data: Record<string, unknown> = {}
  const curItems = (() => {
    try {
      return JSON.parse(preOrder.items || '[]')
    } catch {
      return []
    }
  })()

  /** اعمال سبد/یادداشت/مشتری اختیاری — جمع همیشه سمت سرور بازمحاسبه می‌شود */
  const applyOptionalFields = () => {
    if (body.items !== undefined) {
      const s = sanitizeItems(body.items)
      if (!s.ok) return false
      data.items = JSON.stringify(s.items)
      data.total = sumTotal(s.items)
    }
    if (body.note !== undefined) data.note = String(body.note).slice(0, 500)
    if (body.customerName !== undefined)
      data.customerName = String(body.customerName).trim().slice(0, 120) || 'مشتری'
    return true
  }
  const itemCount = () => {
    const raw = data.items
    if (typeof raw === 'string') return (JSON.parse(raw) as unknown[]).length
    return curItems.length
  }
  const money = () => (typeof data.total === 'number' ? (data.total as number) : preOrder.total)

  switch (action) {
    /* پذیرش و ویرایش: NEW → CASHIER_EDITED (هویت صندوق‌دار ثبت می‌شود) */
    case 'accept': {
      if (!isCashier) return fail('فقط صندوق‌دار می‌تواند پیش‌فاکتور را بپذیرد', 403)
      if (!['NEW', 'CASHIER_EDITED'].includes(preOrder.status))
        return fail('این پیش‌فاکتور در مرحلهٔ پذیرش نیست', 400)
      if (!applyOptionalFields()) return fail('سبد ارسالی نامعتبر است', 400)
      data.status = 'CASHIER_EDITED'
      data.cashierId = me.id
      data.cashierName = me.name
      push('accept', `پذیرش در صندوق — ${faNum(itemCount())} قلم، جمع ${faMoney(money())} تومان`)
      break
    }

    /* آماده: NEW/CASHIER_EDITED → READY */
    case 'ready': {
      if (!isCashier) return fail('فقط صندوق‌دار می‌تواند وضعیت «آماده» را ثبت کند', 403)
      if (!['NEW', 'CASHIER_EDITED'].includes(preOrder.status))
        return fail('فقط پیش‌فاکتور پذیرش‌شده می‌تواند آماده شود', 400)
      data.status = 'READY'
      data.cashierId = me.id
      data.cashierName = me.name
      push('ready', 'آمادهٔ تحویل/ارسال شد')
      break
    }

    /* تأیید صندوق و تسویه: → DONE با روش پرداخت + مرجع */
    case 'settle': {
      if (!isCashier) return fail('تسویه فقط توسط صندوق‌دار مجاز است', 403)
      if (!ACTIVE.includes(preOrder.status)) return fail('این پیش‌فاکتور قابل تسویه نیست', 400)
      const payMethod = PAY_METHODS[String(body.payMethod || '')]
      if (!payMethod) return fail('روش پرداخت را انتخاب کنید (نقدی، کارتخوان فروشگاه یا چک)', 400)
      const paymentRef = String(body.paymentRef ?? '').trim().slice(0, 120)
      if (body.payMethod === 'CHEQUE' && !paymentRef)
        return fail('برای پرداخت با چک، شماره چک را وارد کنید', 400)
      data.status = 'DONE'
      data.payMethod = payMethod
      data.paymentRef = paymentRef
      data.cashierId = me.id
      data.cashierName = me.name
      push('settle', `تأیید صندوق و تسویه — پرداخت: ${payMethod}${paymentRef ? ` — مرجع: ${paymentRef}` : ''}`)
      break
    }

    /* ویرایش محض (بدون تغییر وضعیت) — صندوق‌دار یا همان فروشندهٔ ثبت‌کننده */
    case 'edit': {
      if (!isCashier && !isCreator) return fail('اجازهٔ ویرایش این پیش‌فاکتور را ندارید', 403)
      if (!ACTIVE.includes(preOrder.status)) return fail('پیش‌فاکتور بسته‌شده قابل ویرایش نیست', 400)
      if (!applyOptionalFields()) return fail('سبد ارسالی نامعتبر است', 400)
      const touched: string[] = []
      if (data.items !== undefined) touched.push('سبد')
      if (data.note !== undefined) touched.push('یادداشت')
      if (data.customerName !== undefined) touched.push('مشتری')
      if (touched.length === 0) return fail('تغییری برای ذخیره ارسال نشده است', 400)
      push('edit', `ویرایش ${touched.join(' و ')} — ${faNum(itemCount())} قلم، جمع ${faMoney(money())} تومان`)
      break
    }

    /* لغو با تأیید — صندوق‌دار (مرجع نهایی) یا فروشندهٔ ثبت‌کننده */
    case 'cancel': {
      if (!isCashier && !isCreator) return fail('اجازهٔ لغو این پیش‌فاکتور را ندارید', 403)
      if (!ACTIVE.includes(preOrder.status)) return fail('این پیش‌فاکتور قبلاً بسته شده است', 400)
      const reason = String(body.reason ?? '').trim().slice(0, 200)
      data.status = 'CANCELLED'
      push('cancel', reason ? `لغو شد — دلیل: ${reason}` : 'لغو شد')
      break
    }

    /* ── سازگاری با فلوهای قبلی ── */
    case 'cashier_edit': {
      if (!isCashier) return fail('فقط صندوق‌دار می‌تواند پردازش کند', 403)
      if (body.items !== undefined) {
        const s = sanitizeItems(body.items)
        if (!s.ok) return fail('سبد ارسالی نامعتبر است', 400)
        data.items = JSON.stringify(s.items)
        data.total = sumTotal(s.items)
      }
      data.status = 'READY'
      data.cashierId = me.id
      data.cashierName = me.name
      push('cashier_edit', `ارسال به صندوق هلو — ${faNum(itemCount())} قلم، جمع ${faMoney(money())} تومان`)
      break
    }
    case 'done': {
      if (!ACTIVE.includes(preOrder.status)) return fail('این پیش‌فاکتور قابل تکمیل نیست', 400)
      data.status = 'DONE'
      push('done', 'تکمیل شد')
      break
    }
    case 'note': {
      if (!isCashier && !isCreator) return fail('اجازهٔ ویرایش را ندارید', 403)
      data.note = String(body.note ?? '').slice(0, 500)
      push('note', 'یادداشت به‌روزرسانی شد')
      break
    }
    default:
      return fail('درخواست نامعتبر است', 400)
  }

  data.history = JSON.stringify(history)
  const updated = await db.preOrder.update({ where: { id }, data })
  await logActivity(me, `به‌روزرسانی پیش‌فاکتور ${preOrder.code}`, 'preOrder', id, action)
  return json({
    preOrder: { ...updated, items: JSON.parse(updated.items || '[]'), history },
  })
}
