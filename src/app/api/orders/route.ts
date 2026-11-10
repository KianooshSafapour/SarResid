import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson, clampInt } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'
import { toFaDigits, todayJalaliDash } from '@/lib/jalali'

const ORDER_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'RECEIVING',
  'RECEIVED',
  'VERIFIED',
  'ACCOUNTED',
  'DONE',
  'CANCELLED',
] as const

const GROUPS: Record<string, string[]> = {
  open: ['DRAFT', 'SUBMITTED'],
  active: ['APPROVED', 'RECEIVING', 'RECEIVED', 'VERIFIED', 'ACCOUNTED'],
  done: ['DONE'],
  cancelled: ['CANCELLED'],
  queue: ['APPROVED', 'RECEIVING'], // receiving view: approved orders enter the queue automatically
}

/** Persian money with ٬ separators — used in history details (live: «جمع ۱۸٬۰۸۵٬۲۰۰ ریال») */
function faMoney(n: number): string {
  return toFaDigits(Math.round(n).toLocaleString('en-US')).replace(/,/g, '٬')
}

type OrderExtras = {
  note?: string | null
  paymentRef?: string | null
  history?: { at: string; by: string; action: string; detail?: string }[]
  approvedById?: string | null
  approvedByName?: string | null
  receivedById?: string | null
  receivedByName?: string | null
  verifiedById?: string | null
  verifiedByName?: string | null
}

function parseOrderExtras(raw: string | null): OrderExtras {
  if (!raw) return {}
  if (raw.startsWith('{')) {
    const parsed = safeJson<OrderExtras>(raw, {})
    if (parsed && typeof parsed === 'object' && 'history' in parsed) return parsed
  }
  return { note: raw || null }
}

function toNumber(v: unknown, dflt = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : dflt
}

/** GET /api/orders?status=&q=&page=&pageSize= — live list shape */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  /* R11: صفحهٔ دریافت کالا با queue=1 (یا status=queue) کار می‌کند — گیتِ همان صفحه را می‌گیرد
     (دریافت کالا برای همهٔ کارکنان باز است) */
  const isQueue = (req.nextUrl.searchParams.get('status') || '').trim() === 'queue' || req.nextUrl.searchParams.get('queue') === '1'
  const pageKey = isQueue ? 'supply/receiving' : 'supply/orders'
  const gate = await assertPageAccess(user, pageKey)
  if (!gate.ok) return fail(gate.deny, 403)

  const sp = req.nextUrl.searchParams
  const statusParam = (sp.get('status') ?? 'all').trim() || 'all'
  const q = (sp.get('q') ?? '').trim()
  const page = Math.max(1, clampInt(sp.get('page'), 1, 100000, 1))
  const pageSize = Math.max(1, clampInt(sp.get('pageSize'), 1, 100, 20))

  const statuses =
    GROUPS[statusParam] ?? ((ORDER_STATUSES as readonly string[]).includes(statusParam) ? [statusParam] : null)

  const and: Record<string, unknown>[] = []
  if (statuses) and.push({ status: { in: statuses } })
  if (q) and.push({ OR: [{ code: { contains: q } }, { supplierName: { contains: q } }] })
  const where = and.length ? { AND: and } : {}

  const total = await db.order.count({ where })
  const rows = await db.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: { _count: { select: { items: true } } },
  })

  // supplier mini-objects (live: {id, name, code} or null for free-text suppliers)
  const supplierIds = [...new Set(rows.map((r) => r.supplierId).filter((v): v is string => !!v))]
  const suppliers = await db.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true, code: true } })
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]))

  const items = rows.map((o) => {
    const sup = o.supplierId ? (supplierMap.get(o.supplierId) ?? null) : null
    return {
      id: o.id,
      code: o.code,
      status: o.status,
      supplierId: o.supplierId,
      supplierName: o.supplierName,
      supplier: sup ? { id: sup.id, name: sup.name, code: sup.code } : null,
      deliveryDate: o.deliveryDate,
      payMethod: o.payMethod,
      chequeDays: o.chequeDays,
      totalAmount: o.totalAmount,
      createdAt: o.createdAt,
      createdById: o.createdById,
      itemsCount: o._count.items,
    }
  })

  // global counts (live capture: computed over ALL orders, ignoring filters)
  const all = await db.order.findMany({ select: { status: true } })
  const statusTally: Record<string, number> = {}
  for (const o of all) statusTally[o.status] = (statusTally[o.status] ?? 0) + 1
  const count = (names: string[]) => names.reduce((s, k) => s + (statusTally[k] ?? 0), 0)
  const counts = {
    open: count(GROUPS.open),
    active: count(GROUPS.active),
    done: count(GROUPS.done),
    cancelled: count(GROUPS.cancelled),
    all: all.length,
  }
  const statusCounts: Record<string, number> = {}
  for (const st of ORDER_STATUSES) {
    if (statusTally[st]) statusCounts[st] = statusTally[st]
  }

  const pages = Math.max(1, Math.ceil(total / pageSize))
  return ok({ items, counts, statusCounts, total, page, pageSize, pages })
}

/** POST /api/orders {supplierId?, supplierName?, deliveryDate?, payMethod?, paymentRef?, note?, items:[...], submit?} */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'supply/orders')
  if (!gate.ok) return fail(gate.deny, 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const rawItems = Array.isArray(body.items) ? body.items : []
  if (rawItems.length === 0) return fail('اقلام سفارش الزامی است')

  // supplier: id → lookup; otherwise free text supplierName (live HZ-ORD-004 pattern)
  let supplierId: string | null = null
  let supplierName: string | null = null
  let supplierCode: string | null = null
  if (body.supplierId) {
    const sup = await db.supplier.findUnique({ where: { id: String(body.supplierId) } })
    if (!sup) return fail('تأمین‌کننده یافت نشد')
    supplierId = sup.id
    supplierName = sup.name
    supplierCode = sup.code
  } else if (body.supplierName) {
    supplierName = String(body.supplierName)
  }

  const items = rawItems.map((it: Record<string, unknown>) => ({
    productId: it.productId ? String(it.productId) : null,
    name: String(it.name ?? '').trim() || 'کالا',
    barcode: it.barcode ? String(it.barcode) : null,
    qty: Math.max(1, Math.round(toNumber(it.qty, 1)) || 1),
    unitBuyPrice: Math.max(0, toNumber(it.unitBuyPrice, 0)),
    // non-nullable column — always a number (null here caused Prisma 500s)
    printedPrice: Math.max(0, toNumber(it.printedPrice, 0)),
    // v0.2 carton ordering (qty already includes carton units per VIEW-1 contract)
    cartonQty: Math.max(0, Math.round(toNumber(it.cartonQty, 0)) || 0),
    unitsPerCarton: Math.max(0, Math.round(toNumber(it.unitsPerCarton, 0)) || 0),
    lineTotal: Math.max(0, toNumber(it.lineTotal, 0)),
    supplierProductId: it.supplierProductId ? String(it.supplierProductId) : null,
  }))
  const totalAmount = items.reduce((s, it) => s + it.qty * it.unitBuyPrice, 0)

  // next code: HZ-ORD-NNN
  const last = await db.order.findFirst({ orderBy: { code: 'desc' } })
  let next = 1
  if (last) {
    const m = last.code.match(/HZ-ORD-(\d+)$/)
    if (m) next = Math.max(1, parseInt(m[1], 10) + 1)
  }
  const code = `HZ-ORD-${String(next).padStart(3, '0')}`

  const submitted = body.submit !== false
  const now = new Date().toISOString()
  const history: NonNullable<OrderExtras['history']> = [
    { at: now, by: user.fullName, action: 'create', detail: `${items.length} قلم، جمع ${faMoney(totalAmount)} ریال` },
  ]
  if (submitted) history.push({ at: now, by: user.fullName, action: 'submit', detail: 'ارسال برای تأیید' })

  const extras: OrderExtras = {
    note: body.note ? String(body.note) : null,
    paymentRef: body.paymentRef ? String(body.paymentRef) : null,
    history,
  }

  const payMethod = ['CASH', 'CHEQUE', 'POS'].includes(String(body.payMethod)) ? String(body.payMethod) : 'CASH'

  // R8: مهلت چک (روز) — فقط برای پرداخت چکی معنا دارد؛ بازهٔ ۰ تا ۳۶۵ روز
  const chequeDays = Math.max(0, Math.min(365, Math.round(toNumber(body.chequeDays, 0)) || 0))

  /* ── R9: انتخاب ضایعات برای برگشت با همین سفارش ──
     خانم لطفی در تب «سفارش جدید» ضایعاتِ در انتظارِ همین تأمین‌کننده را علامت می‌زند؛
     اقلام علامت‌خورده وضعیت SELECTED می‌گیرند و هنگام پایان دریافت، RETURNED می‌شوند. */
  const wasteIds: string[] = Array.isArray(body.wasteIds)
    ? body.wasteIds.map((w: unknown) => String(w)).filter(Boolean).slice(0, 60)
    : []
  let selectedWaste: { id: string; name: string; qty: number; unit: string; supplierId: string | null }[] = []
  if (wasteIds.length) {
    const rows = await db.wasteRecord.findMany({ where: { id: { in: wasteIds } } })
    selectedWaste = rows.filter((r) => r.status === 'PENDING')
    // همهٔ اقلام باید متعلق به همان تأمین‌کنندهٔ سفارش باشند (یا تأمین‌کنندهٔ سفارش از اقلام ارث می‌برد)
    const wasteSuppliers = new Set(selectedWaste.map((r) => r.supplierId ?? ''))
    if (supplierId) {
      const foreign = selectedWaste.filter((r) => r.supplierId && r.supplierId !== supplierId)
      if (foreign.length) return fail('ضایعات انتخابی به تأمین‌کنندهٔ دیگری تعلق دارند')
    } else if (wasteSuppliers.size === 1 && selectedWaste[0]?.supplierId) {
      const sup = await db.supplier.findUnique({ where: { id: selectedWaste[0].supplierId }, select: { id: true, name: true } })
      if (sup) { supplierId = sup.id; supplierName = sup.name }
    }
    void wasteSuppliers
  }

  const created = await db.order.create({
    data: {
      code,
      status: submitted ? 'SUBMITTED' : 'DRAFT',
      supplierId,
      supplierName,
      deliveryDate: body.deliveryDate ? String(body.deliveryDate) : null,
      payMethod,
      ...(payMethod === 'CHEQUE' && chequeDays > 0 ? { chequeDays } : {}),
      notes: JSON.stringify(extras),
      totalAmount,
      createdById: user.id,
      createdByName: user.fullName,
      items: {
        create: items.map((it) => ({ ...it, status: 'PENDING' })),
      },
    },
    include: { items: true },
  })

  /* R9: اقلام ضایعات ← SELECTED + پیوند به همین سفارش */
  if (selectedWaste.length) {
    await db.wasteRecord.updateMany({
      where: { id: { in: selectedWaste.map((r) => r.id) } },
      data: {
        status: 'SELECTED',
        orderId: created.id,
        orderCode: created.code,
        selectedAtJalali: todayJalaliDash(),
        selectedByName: user.fullName,
      },
    })
    history.push({
      at: new Date().toISOString(),
      by: user.fullName,
      action: 'waste-select',
      detail: `${selectedWaste.length} قلم ضایعات برای برگشت با همین سفارش علامت خورد`,
    })
    await db.order.update({ where: { id: created.id }, data: { notes: JSON.stringify({ ...extras, history }) } })
  }

  void supplierCode

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'order_create',
    actionLabel: 'ثبت سفارش',
    category: 'orders',
    detail: `ثبت سفارش ${code} برای «${supplierName ?? 'بدون تأمین‌کننده'}» — ${items.length} قلم، جمع ${faMoney(totalAmount)} ریال${selectedWaste.length ? ` + ${selectedWaste.length} قلم ضایعات برگشتی` : ''}`,
    entityId: created.id,
  })

  /* R10: سفارش ارسال‌شده ← اعلان به مدیران (نیاز به تأیید) — نشانهٔ سفارش‌ها را روشن می‌کند */
  if (submitted) {
    for (const role of ['OWNER', 'GM', 'ADMIN', 'EXEC']) {
      await db.notification.create({
        data: {
          role,
          kind: `order:submit:${created.id}`,
          severity: 'warning',
          title: 'سفارش جدید در انتظار تأیید',
          body: `سفارش ${code} (${supplierName ?? 'بدون تأمین‌کننده'}) توسط ${user.fullName} ثبت شد و نیازمند تأیید مدیران است — ${items.length} قلم، جمع ${faMoney(totalAmount)} ریال.`,
          go: '#/supply/orders',
        },
      }).catch(() => {})
    }
  }

  return ok({
    id: created.id,
    code: created.code,
    status: created.status,
    supplierId: created.supplierId,
    supplierName: created.supplierName,
    deliveryDate: created.deliveryDate,
    payMethod: created.payMethod,
    chequeDays: created.chequeDays,
    note: extras.note ?? null,
    paymentRef: extras.paymentRef ?? null,
    totalAmount: created.totalAmount,
    createdAt: created.createdAt,
    createdById: created.createdById,
    items: created.items.map((it) => ({
      id: it.id,
      orderId: it.orderId,
      productId: it.productId,
      name: it.name,
      barcode: it.barcode,
      qty: it.qty,
      unitBuyPrice: it.unitBuyPrice,
      printedPrice: it.printedPrice,
      receivedQty: it.receivedQty,
      status: it.status,
      expiryDate: it.expiryDate,
      note: it.note,
    })),
  })
}
