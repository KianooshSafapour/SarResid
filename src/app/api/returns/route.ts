import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, clampInt } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'
import { todayJalaliDash, parseJalaliDash, jalaliToDate, pad2, toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/** roles allowed to register a return (cashier-side flow) */
const RETURN_CREATE_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC', 'HC', 'CASHIER', 'ACC' ]

/** live settlement-type rule (chunk lib): (total, exchange, transfer)
 *  «exchange» فقط وقتی درست است که کالای جایگزین به‌تنهایی کل مبلغ را بپوشاند و
 *  هیچ واریزی به کارت در کار نباشد؛ حالت ترکیبی (کالا + واریز به کارت) = «full»
 *  چون وجهی به کارت مشتری برمی‌گردد و شماره کارت لازم است. */
export function computeSettlementType(total: number, exchange: number, transfer: number): string {
  if (exchange > total) return 'debt'
  if (exchange > 0 && Math.abs(transfer + exchange - total) <= 1) return transfer > 1 ? 'full' : 'exchange'
  if (transfer + exchange < total - 1) return 'partial'
  return 'full'
}

/** parse a date query param that may be an ISO datetime or a Jalali "1405-07-25"/"1405/07/25" */
export function parseDateParam(v: string | null | undefined): Date | null {
  if (!v) return null
  const s = v.trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) || /^\d{4}-\d{2}-\d{2} /.test(s) || /^\d{4}\/\d{2}\/\d{2}/.test(s)) {
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  }
  const jm = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (jm) {
    const j = parseJalaliDash(`${jm[1]}-${pad2(+jm[2])}-${pad2(+jm[3])}`)
    return jalaliToDate(j.jy, j.jm, j.jd)
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export function isoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

function normalizeMobile(v: unknown): string {
  return String(v ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/\D/g, '')
}

/** load users by ids → map (schema has no relation from ReturnRequest to User) */
async function userMap(ids: string[]): Promise<Map<string, { id: string; fullName: string; title: string }>> {
  const clean = [...new Set(ids.filter(Boolean))]
  if (!clean.length) return new Map()
  const users = await db.user.findMany({ where: { id: { in: clean } } })
  return new Map(users.map((u) => [u.id, { id: u.id, fullName: u.fullName, title: u.title }]))
}

// ---------------- GET /api/returns ----------------
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  // approvals board vs history page — both consume this list endpoint
  const pageKey = (new URL(req.url).searchParams.get('status') || '').trim() === 'pending'
    ? 'crm/approvals'
    : 'crm/history'
  const gate = await assertPageAccess(me, pageKey)
  if (!gate.ok) return fail(gate.deny, 403)

  const url = new URL(req.url)
  const page = clampInt(url.searchParams.get('page'), 1, 100000, 1)
  const limit = clampInt(url.searchParams.get('limit'), 1, 200, 20)
  const status = (url.searchParams.get('status') || '').trim()
  const q = (url.searchParams.get('q') || '').trim()
  const mine = url.searchParams.get('mine') === '1'
  const from = parseDateParam(url.searchParams.get('from'))
  const to = parseDateParam(url.searchParams.get('to'))

  const where: Record<string, unknown> = {}
  if (status === 'pending') where.status = { in: ['draft', 'pending'] }
  else if (status === 'approved') where.status = 'approved'
  else if (status === 'paid') where.status = 'paid'
  else if (status && status !== 'all') where.status = status
  if (mine) where.cashierId = me.id
  if (from || to) {
    const createdAt: Record<string, Date> = {}
    if (from) createdAt.gte = from
    if (to) createdAt.lt = to
    where.createdAt = createdAt
  }
  if (q) {
    where.OR = [
      { code: { contains: q } },
      { customerName: { contains: q } },
      { customerPhone: { contains: q } },
      { reason: { contains: q } },
    ]
  }

  const total = await db.returnRequest.count({ where })
  const rows = await db.returnRequest.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    skip: (page - 1) * limit,
    take: limit,
    include: { items: { select: { id: true } } },
  })

  const users = await userMap(rows.flatMap((r) => [r.cashierId ?? '', r.approvedById ?? '']))

  const items = rows.map((r) => ({
    id: r.id,
    code: r.code,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    customerCardNumber: r.customerCardNumber,
    purchaseAt: r.purchaseAt,
    reason: r.reason,
    note: r.note,
    totalAmount: r.totalAmount,
    exchangeValue: r.exchangeValue,
    transferAmount: r.transferAmount,
    transferNote: r.transferNote,
    settlementType: r.settlementType,
    status: r.status,
    cashierId: r.cashierId,
    approvedById: r.approvedById,
    approvedAt: isoOrNull(r.approvedAt),
    submittedAt: isoOrNull(r.submittedAt),
    createdAt: r.createdAt.toISOString(),
    cashier: r.cashierId ? { id: r.cashierId, fullName: users.get(r.cashierId)?.fullName ?? '—' } : null,
    _count: { items: r.items.length },
  }))

  return ok({
    items,
    total,
    page,
    pageSize: limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  })
}

// ---------------- POST /api/returns ----------------
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!RETURN_CREATE_ROLES.includes(me.role) && !isManager(me)) {
    return fail('شما مجاز به ثبت مرجوعی نیستید', 403)
  }

  const body = await req.json().catch(() => null)
  if (!body) return fail('درخواست نامعتبر است')

  const rawItems = Array.isArray(body.items) ? body.items : []
  if (rawItems.length === 0) return fail('حداقل یک قلم کالا لازم است')

  const customerName = String(body.customerName ?? '').trim()
  if (customerName.length < 2) return fail('نام مشتری را کامل وارد کنید')

  const customerPhone = normalizeMobile(body.customerPhone)
  if (!/^09\d{9}$/.test(customerPhone)) return fail('شماره موبایل مشتری معتبر نیست (فرمت: ۰۹۱۲۳۴۵۶۷۸۹)')

  const cardRaw = String(body.customerCardNumber ?? '').replace(/\D/g, '')
  const customerCardNumber = cardRaw.length > 0 ? cardRaw : null

  const purchaseAt = String(body.purchaseAt ?? '').trim() || null
  const reason = String(body.reason ?? '').trim()
  if (!reason) return fail('علت مرجوعی را انتخاب کنید')
  const note = String(body.note ?? '').trim() || null

  // resolve items — R7: کالای وزنی (کیلوگرم/گرم/…) مقدار اعشاری می‌پذیرد (۰٫۷۲ کیلو)؛ عددی must be integer ≥ 1
  const WEIGHT_UNITS = ['کیلوگرم', 'گرم', 'کیلو', 'لیتر', 'متر']
  type RawItem = Record<string, unknown>
  const productIds = rawItems.map((i: RawItem) => String(i?.productId ?? '')).filter(Boolean)
  const products = productIds.length ? await db.product.findMany({ where: { id: { in: productIds } } }) : []
  const prodById = new Map(products.map((p) => [p.id, p]))

  const items: { name: string; barcode: string | null; qty: number; unit: string; unitPrice: number; lineTotal: number }[] = []
  for (const it of rawItems) {
    const name = String(it?.name ?? '').trim()
    if (!name) return fail('نام همه اقلام را وارد کنید')
    const unit = (it?.unit ? String(it.unit) : '') || prodById.get(String(it?.productId ?? ''))?.unit || 'عدد'
    const rawQty = Number(it?.qty) || 0
    const qty = WEIGHT_UNITS.includes(unit) ? Math.round(rawQty * 1000) / 1000 : Math.trunc(rawQty)
    if (!(qty > 0)) return fail('مقدار هر قلم باید بیشتر از صفر باشد')
    if (!WEIGHT_UNITS.includes(unit) && Math.abs(rawQty - Math.round(rawQty)) > 1e-9) {
      return fail(`«${name}» به ${unit} است — مقدار باید عدد صحیح باشد (اعشار فقط برای کالای وزنی)`)
    }
    const unitPrice = Math.max(0, Math.round(Number(it?.unitPrice) || 0))
    const prod = it?.productId ? prodById.get(String(it.productId)) : undefined
    const barcode = it?.barcode == null ? null : String(it.barcode).replace(/\D/g, '') || null
    items.push({ name, barcode, qty, unit: prod?.unit || unit, unitPrice, lineTotal: Math.round(qty * unitPrice) })
  }

  const totalAmount = items.reduce((s, i) => s + i.lineTotal, 0)
  if (totalAmount <= 0) return fail('مبلغ کل مرجوعی باید بیشتر از صفر باشد')

  const exchangeValue = Math.max(0, Math.round(Number(body.exchangeValue) || 0))
  const transferAmount = Math.max(0, Math.round(Number(body.transferAmount) || 0))
  if (transferAmount > 0 && exchangeValue + transferAmount > totalAmount + 1) {
    return fail('پرداخت به کارت + کالای جایگزین نباید از مبلغ کل مرجوعی بیشتر باشد')
  }
  const transferNote = String(body.transferNote ?? '').trim() || null
  const settlementType = computeSettlementType(totalAmount, exchangeValue, transferAmount)

  // code = HZ-YYMMDD-NNNN (Jalali today), per-day sequence
  const tj = todayJalaliDash()
  const [jy, jm, jd] = tj.split('-').map(Number)
  const dateTag = `${String(jy % 100).padStart(2, '0')}${pad2(jm)}${pad2(jd)}`
  const prefix = `HZ-${dateTag}-`
  const sameDay = await db.returnRequest.count({ where: { code: { startsWith: prefix } } })
  const code = `${prefix}${String(sameDay + 1).padStart(4, '0')}`

  const now = new Date()
  const created = await db.returnRequest.create({
    data: {
      code,
      customerName,
      customerPhone,
      customerCardNumber,
      purchaseAt,
      reason,
      note,
      totalAmount,
      exchangeValue,
      transferAmount,
      transferNote,
      settlementType,
      status: 'pending',
      cashierId: me.id,
      submittedAt: now,
      items: { create: items },
    },
    include: { items: true },
  })

  // auto-upsert CRM customer (per-phone stats, live behaviour)
  if (customerPhone) {
    const cust = await db.customer.upsert({
      where: { phone: customerPhone },
      create: {
        phone: customerPhone,
        name: customerName,
        returnsCount: 1,
        totalAmount,
        firstAt: now,
        lastVisitAt: now,
      },
      update: {
        returnsCount: { increment: 1 },
        totalAmount: { increment: totalAmount },
        lastVisitAt: now,
      },
    })
    /* R15: هر مرجوعی یک رویداد CRM است — خط زمانی تجربهٔ مشتری */
    await db.crmEvent
      .create({
        data: {
          customerId: cust.id,
          kind: 'return',
          content: `مرجوعی ${code} — ${items.length} قلم · ${Math.round(totalAmount).toLocaleString('en-US')} ریال · علت: ${reason || '—'}${body.exchangeValue ? ' · کارت بانکی' : ''}`,
          userId: me.id,
        },
      })
      .catch(() => {})
  }

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'return.create',
    actionLabel: 'ثبت مرجوعی',
    category: 'returns',
    detail: `${code} — ${customerName} — ${items.length} قلم — ${totalAmount} ریال`,
    entityId: created.id,
  })
  await db.notification.create({
    data: {
      role: 'EXEC',
      kind: 'return',
      severity: 'info',
      title: 'مرجوعی جدید در انتظار تأیید',
      body: `${code} — ${customerName} (${toFaDigits(String(items.length))} قلم)`,
      go: '#/returns/approvals',
    },
  })

  return ok({
    id: created.id,
    code: created.code,
    customerName: created.customerName,
    customerPhone: created.customerPhone,
    customerCardNumber: created.customerCardNumber,
    purchaseAt: created.purchaseAt,
    reason: created.reason,
    note: created.note,
    totalAmount: created.totalAmount,
    exchangeValue: created.exchangeValue,
    transferAmount: created.transferAmount,
    transferNote: created.transferNote,
    settlementType: created.settlementType,
    status: created.status,
    createdAt: created.createdAt.toISOString(),
    submittedAt: created.submittedAt ? created.submittedAt.toISOString() : null,
    cashier: { id: me.id, fullName: me.fullName },
    items: created.items,
  })
}
