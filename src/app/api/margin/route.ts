import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { todayJalaliDash, formatJalaliDash, toFaDigits } from '@/lib/jalali'
import { notify } from '@/lib/notify'

export const dynamic = 'force-dynamic'

export const MARGIN_ROLES = ['OWNER', 'GM', 'ADMIN', 'ACC']

/** R5-B: آستانه‌های سود — قابل تنظیم توسط مدیران ارشد (Setting margin:thresholds) */
export interface MarginThresholds {
  alert: number
  ok: number
}
export const DEFAULT_MARGIN_THRESHOLDS: MarginThresholds = { alert: 12, ok: 21 }
export const MARGIN_THRESHOLDS_KEY = 'margin:thresholds'

export function parseMarginThresholds(raw: string | null | undefined): MarginThresholds {
  if (!raw) return DEFAULT_MARGIN_THRESHOLDS
  try {
    const parsed = JSON.parse(raw)
    const alert = Number(parsed?.alert)
    const ok = Number(parsed?.ok)
    if (Number.isFinite(alert) && Number.isFinite(ok) && alert >= 0 && ok > alert && ok <= 500) {
      return { alert, ok }
    }
  } catch {
    /* مقدار خراب → پیش‌فرض */
  }
  return DEFAULT_MARGIN_THRESHOLDS
}

export async function getMarginThresholds(): Promise<MarginThresholds> {
  const row = await db.setting.findUnique({ where: { key: MARGIN_THRESHOLDS_KEY } })
  return parseMarginThresholds(row?.value)
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

export interface MarginItemInput {
  productId: string | null
  barcode: string | null
  productName: string
  unit: string
  quantity: number
  totalCost: number
  printedPrice: number
  note: string | null
  /* ── R5-B ── */
  salePrice?: number // قیمت فروش نهایی (۰ = همان قیمت چاپی)
  marginPct?: number // درصد سود ۴ رقمی روی بهای خرید (کلید واگذار برای کالای رایگان)
  free100?: boolean // تخفیف ۱۰۰٪ / رایگان
  baseCost?: number // مبنای محاسبهٔ فروش کالای رایگان
}

/** per-item derived values (R5-B live contract):
 *  quantity اعشاری مجاز (اقلام وزنی) · unitCost = totalCost/qty ·
 *  sale = salePrice || printedPrice (سازگار با ردیف‌های قدیمی) ·
 *  margin = (sale-unitCost)/sale (کسر — سازگار با stats قدیمی) ·
 *  marginPct = (sale-unitCost)/unitCost×100 با ۴ رقم اعشار — همان عدد حسابدار ·
 *  کالای رایگان: totalCost=printedPrice=0، درصد سود از ورودی، level=OK */
export function deriveItem(it: MarginItemInput, th: MarginThresholds = DEFAULT_MARGIN_THRESHOLDS) {
  const quantity = Math.max(1, Math.round((Number(it.quantity) || 1) * 1000) / 1000)
  const free100 = it.free100 === true
  const totalCost = free100 ? 0 : Math.max(0, Math.round(Number(it.totalCost) || 0))
  const printedPrice = free100 ? 0 : Math.max(0, Math.round(Number(it.printedPrice) || 0))
  const baseCost = Math.max(0, Math.round(Number(it.baseCost) || 0))
  const unitCost = quantity > 0 ? totalCost / quantity : 0
  const salePrice = Math.max(0, Math.round(Number(it.salePrice) || 0)) || printedPrice
  const profitPerUnit = salePrice - unitCost
  const margin = salePrice > 0 ? (salePrice - unitCost) / salePrice : 0
  const marginPct = free100
    ? round4(Math.max(0, Number(it.marginPct) || 0))
    : unitCost > 0
      ? round4((profitPerUnit / unitCost) * 100)
      : 0
  const level = free100 ? 'OK' : marginPct < 0 ? 'CRITICAL' : marginPct < th.alert ? 'WARN' : 'OK'
  return {
    productId: it.productId,
    barcode: it.barcode,
    productName: it.productName,
    unit: it.unit || 'عدد',
    quantity,
    totalCost,
    unitCost,
    printedPrice,
    salePrice,
    marginPct,
    free100,
    baseCost,
    margin,
    profitPerUnit,
    note: it.note,
    level,
    alertsJson: '[]',
  }
}

/** invoice date used for range filters: dateJalali ?? Jalali(createdAt) */
export function invoiceDateKey(inv: { dateJalali: string | null; createdAt: Date }): string {
  return inv.dateJalali || formatJalaliDash(inv.createdAt)
}

/** list row (live margin.json shape + R5-B fields + R12 workflow) */
export function invoiceListOut(inv: {
  id: string
  number: number
  supplierId: string | null
  supplierName: string | null
  note: string | null
  status: string
  archivedAt: Date | null
  archived?: boolean
  createdAt: Date
  dateJalali: string | null
  providerDocNumber?: string | null
  purchaseOrderId?: string | null
  finalizedAt?: Date | null
  gmApprovedAt?: Date | null
  items: { quantity: number; totalCost: number; printedPrice: number; salePrice?: number; accepted?: boolean }[]
}) {
  const itemCount = inv.items.length
  const totalQty = inv.items.reduce((s, i) => s + i.quantity, 0)
  const totalCost = inv.items.reduce((s, i) => s + i.totalCost, 0)
  const revenue = inv.items.reduce((s, i) => s + (i.salePrice || i.printedPrice) * i.quantity, 0)
  const profit = revenue - totalCost
  const margin = totalCost > 0 ? (profit / totalCost) * 100 : null
  const acceptedCount = inv.items.filter((i) => i.accepted !== false).length
  const rejectedCount = itemCount - acceptedCount
  return {
    id: inv.id,
    number: inv.number,
    supplierId: inv.supplierId,
    supplierName: inv.supplierName,
    note: inv.note,
    status: inv.status,
    state: inv.archived || inv.status === 'archived' ? 'archived' : inv.status,
    providerDocNumber: inv.providerDocNumber ?? null,
    purchaseOrderId: inv.purchaseOrderId ?? null,
    archivedAt: inv.archivedAt ? inv.archivedAt.toISOString() : null,
    finalizedAt: inv.finalizedAt ? inv.finalizedAt.toISOString() : null,
    gmApprovedAt: inv.gmApprovedAt ? inv.gmApprovedAt.toISOString() : null,
    gmPending: inv.status === 'final' && !inv.gmApprovedAt,
    createdAt: inv.createdAt.toISOString(),
    itemCount,
    acceptedCount,
    rejectedCount,
    totalQty,
    totalCost,
    revenue,
    profit,
    margin,
    dateJalali: inv.dateJalali,
  }
}

/** GET /api/margin?q=&from=&to=&archived=active|archived|all&status=draft|delivered|reviewing|final|archived|cancelled|active → {invoices:[…]}
 *  R12: پارامتر status روی «وضعیت مؤثر» (بایگانی = archived) کار می‌کند؛ active = همهٔ بازها */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  const from = (url.searchParams.get('from') || '').trim().replace(/\//g, '-')
  const to = (url.searchParams.get('to') || '').trim().replace(/\//g, '-')
  const archived = (url.searchParams.get('archived') || 'active').trim()
  const statusFilter = (url.searchParams.get('status') || '').trim()

  const rows = await db.marginInvoice.findMany({
    where: archived === 'archived' ? { archived: true } : archived === 'all' ? {} : { archived: false },
    orderBy: { createdAt: 'desc' },
    include: { items: { select: { quantity: true, totalCost: true, printedPrice: true, salePrice: true, accepted: true } } },
  })

  let list = rows
  if (statusFilter) {
    list = list.filter((r) => {
      const state = r.archived || r.status === 'archived' ? 'archived' : r.status
      if (statusFilter === 'active') return state !== 'archived' && state !== 'cancelled'
      return state === statusFilter
    })
  }
  if (q) {
    list = list.filter(
      (r) =>
        (r.supplierName ?? '').includes(q) ||
        String(r.number).includes(q) ||
        (r.note ?? '').includes(q) ||
        (r.providerDocNumber ?? '').includes(q),
    )
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) || /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    list = list.filter((r) => {
      const d = invoiceDateKey(r)
      if (/^\d{4}-\d{2}-\d{2}$/.test(from) && d < from) return false
      if (/^\d{4}-\d{2}-\d{2}$/.test(to) && d > to) return false
      return true
    })
  }

  return ok({ invoices: list.map(invoiceListOut) })
}

/** POST /api/margin — {supplierId?, supplierName?, note?, providerDocNumber?, dateJalali?, items:[…]} */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!MARGIN_ROLES.includes(me.role)) return fail('شما مجاز به ثبت فاکتور سودسنج نیستید', 403)

  const body = await req.json().catch(() => null)
  if (!body) return fail('درخواست نامعتبر است')

  const supplierName = String(body.supplierName ?? '').trim() || null
  if (!supplierName) return fail('تأمین‌کننده را انتخاب یا نامش را وارد کنید')

  const supplierId = String(body.supplierId ?? '').trim() || null
  const note = String(body.note ?? '').trim() || null
  const providerDocNumber = String(body.providerDocNumber ?? '').trim() || null

  const rawItems = Array.isArray(body.items) ? body.items : []
  if (rawItems.length === 0) return fail('فاکتور باید حداقل یک قلم داشته باشد')

  const thresholds = await getMarginThresholds()

  const prepared = rawItems.map((raw: Record<string, unknown>) => {
    const name = String(raw?.productName ?? '').trim()
    if (!name) return { error: 'نام کالا را وارد کنید' }
    const quantity = Math.round((Number(raw?.quantity) || 0) * 1000) / 1000
    if (quantity < 1) return { error: 'تعداد باید بزرگ‌تر از صفر باشد' }
    return {
      value: deriveItem(
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
    }
  })
  for (const p of prepared) if ('error' in p) return fail(p.error as string)

  const items = prepared.map((p) => ('value' in p ? p.value : null)) as (MarginItemInput & { alertsJson: string })[]

  const maxNumber = await db.marginInvoice.aggregate({ _max: { number: true } })
  const number = (maxNumber._max.number ?? 0) + 1

  /* R17: ثبت در سودسنج یعنی کالا تحویلِ تحویل‌شده است — پیش‌فاکتور همزمان با ثبت،
     «تحویل‌شده» می‌شود و مستقیم در انتظار بررسی حسابداری است؛ گام «تأیید تحویل کالا»
     حذف شد (دریافت فیزیکیِ واقعی از مسیر «دریافت کالا»ی سفارش‌ها انجام می‌شود). */
  const now = new Date()
  const created = await db.marginInvoice.create({
    data: {
      number,
      supplierId,
      supplierName,
      note,
      status: 'delivered',
      deliveredAt: now,
      deliveredById: me.id,
      deliveredByName: me.fullName,
      providerDocNumber,
      dateJalali: (typeof body?.dateJalali === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dateJalali.trim())) ? body.dateJalali.trim() : todayJalaliDash(),
      historyJson: JSON.stringify([
        {
          at: now.toISOString(),
          by: me.fullName,
          action: 'create',
          detail: `ثبت پیش‌فاکتور سودسنج — ${items.length} قلم${supplierName ? ` · ${supplierName}` : ''}`,
        },
        {
          at: now.toISOString(),
          by: me.fullName,
          action: 'deliver',
          detail: 'ثبت در سودسنج = کالا تحویل‌شده — بدون نیاز به تأیید جداگانه؛ در انتظار بررسی حسابداری',
        },
      ]),
      items: { create: items },
    },
  })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'margin.create',
    actionLabel: 'ثبت فاکتور سودسنج',
    category: 'profit',
    detail: `#${toFaDigits(String(number))} — ${supplierName} — ${items.length} قلم`,
    entityId: created.id,
  })

  await notify({
    role: 'ACC',
    kind: `margin:deliver:${created.id}`,
    severity: 'info',
    title: 'پیش‌فاکتور سودسنج ثبت شد — در انتظار بررسی حسابداری',
    body: `فاکتور #${toFaDigits(String(number))} (${supplierName ?? 'بدون تأمین‌کننده'}) توسط ${me.fullName} ثبت شد — کالا همزمان با ثبت تحویل‌شده است؛ بررسی قیمت‌ها و حاشیهٔ سود نوبت حسابداری است.`,
    go: `#/finance/invoices?open=${created.id}`,
  }).catch(() => {})

  return ok({ id: created.id, number: created.number, status: created.status, archived: created.archived, providerDocNumber })
}
