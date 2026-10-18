import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { todayJalaliDash, formatJalaliDash, toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

export const MARGIN_ROLES = ['OWNER', 'GM', 'ADMIN', 'ACC']

export interface MarginItemInput {
  productId: string | null
  barcode: string | null
  productName: string
  unit: string
  quantity: number
  totalCost: number
  printedPrice: number
  note: string | null
}

/** per-item derived values (live contract):
 *  unitCost = totalCost/qty · margin = (printed-unitCost)/printed (fraction) ·
 *  profitPerUnit = printed-unitCost · level from markup (printed-unitCost)/unitCost ×100 */
export function deriveItem(it: MarginItemInput) {
  const quantity = Math.max(1, Math.trunc(Number(it.quantity) || 1))
  const totalCost = Math.max(0, Math.round(Number(it.totalCost) || 0))
  const printedPrice = Math.max(0, Math.round(Number(it.printedPrice) || 0))
  const unitCost = quantity > 0 ? totalCost / quantity : 0
  const profitPerUnit = printedPrice - unitCost
  const margin = printedPrice > 0 ? (printedPrice - unitCost) / printedPrice : 0
  const markup = unitCost > 0 ? ((printedPrice - unitCost) / unitCost) * 100 : printedPrice > 0 ? 1000 : 0
  const level = markup < 0 ? 'CRITICAL' : markup < 12 ? 'WARN' : 'OK'
  return {
    productId: it.productId,
    barcode: it.barcode,
    productName: it.productName,
    unit: it.unit || 'عدد',
    quantity,
    totalCost,
    unitCost,
    printedPrice,
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

/** list row (live margin.json shape) */
export function invoiceListOut(inv: {
  id: string
  number: number
  supplierId: string | null
  supplierName: string | null
  note: string | null
  status: string
  archivedAt: Date | null
  createdAt: Date
  dateJalali: string | null
  items: { quantity: number; totalCost: number; printedPrice: number }[]
}) {
  const itemCount = inv.items.length
  const totalQty = inv.items.reduce((s, i) => s + i.quantity, 0)
  const totalCost = inv.items.reduce((s, i) => s + i.totalCost, 0)
  const revenue = inv.items.reduce((s, i) => s + i.printedPrice * i.quantity, 0)
  const profit = revenue - totalCost
  const margin = totalCost > 0 ? (profit / totalCost) * 100 : null
  return {
    id: inv.id,
    number: inv.number,
    supplierId: inv.supplierId,
    supplierName: inv.supplierName,
    note: inv.note,
    status: inv.status,
    archivedAt: inv.archivedAt ? inv.archivedAt.toISOString() : null,
    createdAt: inv.createdAt.toISOString(),
    itemCount,
    totalQty,
    totalCost,
    revenue,
    profit,
    margin,
    dateJalali: inv.dateJalali,
  }
}

/** GET /api/margin?q=&from=&to=&archived=active|archived|all → {invoices:[…]} */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  const from = (url.searchParams.get('from') || '').trim().replace(/\//g, '-')
  const to = (url.searchParams.get('to') || '').trim().replace(/\//g, '-')
  const archived = (url.searchParams.get('archived') || 'active').trim()

  const rows = await db.marginInvoice.findMany({
    where: archived === 'archived' ? { archived: true } : archived === 'all' ? {} : { archived: false },
    orderBy: { createdAt: 'desc' },
    include: { items: { select: { quantity: true, totalCost: true, printedPrice: true } } },
  })

  let list = rows
  if (q) {
    list = list.filter(
      (r) =>
        (r.supplierName ?? '').includes(q) ||
        String(r.number).includes(q) ||
        (r.note ?? '').includes(q),
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

/** POST /api/margin — {supplierId?, supplierName?, note?, items:[…]} */
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

  const rawItems = Array.isArray(body.items) ? body.items : []
  if (rawItems.length === 0) return fail('فاکتور باید حداقل یک قلم داشته باشد')

  const prepared = rawItems.map((raw: Record<string, unknown>) => {
    const name = String(raw?.productName ?? '').trim()
    if (!name) return { error: 'نام کالا را وارد کنید' }
    const quantity = Math.trunc(Number(raw?.quantity) || 0)
    if (quantity < 1) return { error: 'تعداد باید بزرگ‌تر از صفر باشد' }
    return {
      value: deriveItem({
        productId: raw?.productId ? String(raw.productId) : null,
        barcode: raw?.barcode ? String(raw.barcode).trim() : null,
        productName: name,
        unit: String(raw?.unit ?? 'عدد').trim() || 'عدد',
        quantity,
        totalCost: Number(raw?.totalCost) || 0,
        printedPrice: Number(raw?.printedPrice) || 0,
        note: raw?.note ? String(raw.note).trim() : null,
      }) as MarginItemInput & { alertsJson: string },
    }
  })
  for (const p of prepared) if ('error' in p) return fail(p.error as string)

  const items = prepared.map((p) => ('value' in p ? p.value : null)) as (MarginItemInput & { alertsJson: string })[]

  const maxNumber = await db.marginInvoice.aggregate({ _max: { number: true } })
  const number = (maxNumber._max.number ?? 0) + 1

  const created = await db.marginInvoice.create({
    data: {
      number,
      supplierId,
      supplierName,
      note,
      status: 'draft',
      dateJalali: todayJalaliDash(),
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

  return ok({ id: created.id, number: created.number, status: created.status, archived: created.archived })
}
