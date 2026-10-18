import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser, type SessionUser } from '@/lib/auth'
import { toFaDigits } from '@/lib/jalali'

const MANAGERS = ['OWNER', 'GM', 'ADMIN', 'EXEC']

function isManager(u: SessionUser | null): boolean {
  return !!u && MANAGERS.includes(u.role)
}

/** Persian money with ٬ separators (live: «جمع ۱۸٬۰۸۵٬۲۰۰ ریال») */
function faMoney(n: number): string {
  return toFaDigits(Math.round(n).toLocaleString('en-US')).replace(/,/g, '٬')
}

type HistoryEntry = { at: string; by: string; action: string; detail?: string }

type OrderExtras = {
  note?: string | null
  paymentRef?: string | null
  history?: HistoryEntry[]
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

/** frontend mismatch formula: receivedQty ≠ qty or status outside {PENDING, RECEIVED} */
function mismatchCount(items: { qty: number; receivedQty: number | null; status: string }[]): number {
  return items.filter((it) => (it.receivedQty ?? 0) !== it.qty || (it.status !== 'PENDING' && it.status !== 'RECEIVED')).length
}

async function loadOrder(id: string) {
  return db.order.findUnique({ where: { id }, include: { items: true } })
}

async function detail(id: string) {
  const o = await db.order.findUnique({ where: { id }, include: { items: true } })
  if (!o) return null
  const extras = parseOrderExtras(o.notes)
  const history = extras.history ?? []

  const supplier = o.supplierId
    ? await db.supplier.findUnique({ where: { id: o.supplierId }, select: { id: true, name: true, code: true, phone: true } })
    : null

  const userIds = [
    o.createdById,
    extras.approvedById ?? null,
    extras.receivedById ?? null,
    extras.verifiedById ?? null,
  ].filter((v): v is string => !!v)
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
    : []
  const userMap = new Map(users.map((u) => [u.id, u.fullName]))
  const nameOf = (uid: string | null | undefined, fallback: string | null | undefined) =>
    uid ? (userMap.get(uid) ?? fallback ?? null) : (fallback ?? null)
  const person = (uid: string | null | undefined, fallback: string | null | undefined) => {
    const fullName = nameOf(uid, fallback)
    return uid || fullName ? { id: uid ?? null, fullName } : null
  }

  const historyJson = JSON.stringify(history)
  return {
    id: o.id,
    code: o.code,
    status: o.status,
    supplierId: o.supplierId,
    supplierName: o.supplierName,
    deliveryDate: o.deliveryDate,
    payMethod: o.payMethod,
    paymentRef: extras.paymentRef ?? null,
    totalAmount: o.totalAmount,
    note: extras.note ?? null,
    createdById: o.createdById,
    approvedById: extras.approvedById ?? null,
    receivedById: extras.receivedById ?? null,
    verifiedById: extras.verifiedById ?? null,
    historyJson,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    items: o.items.map((it) => ({
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
    supplier: supplier ? { id: supplier.id, name: supplier.name, code: supplier.code, phone: supplier.phone } : null,
    createdBy: person(o.createdById, o.createdByName),
    approvedBy: person(extras.approvedById, extras.approvedByName),
    receivedBy: person(extras.receivedById, extras.receivedByName),
    verifiedBy: person(extras.verifiedById, extras.verifiedByName),
    history,
  }
}

async function saveExtras(orderId: string, extras: OrderExtras) {
  await db.order.update({ where: { id: orderId }, data: { notes: JSON.stringify(extras) } })
}

async function pushHistory(extras: OrderExtras, entry: HistoryEntry) {
  if (!extras.history) extras.history = []
  extras.history.push(entry)
}

/** GET /api/orders/[id] — live flat detail (items, history, people, supplier) */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await ctx.params
  const d = await detail(id)
  if (!d) return fail('سفارش یافت نشد', 404)
  return ok(d)
}

/** PATCH /api/orders/[id] — workflow actions; response is the updated detail (+mismatch for receive) */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || !body.action) return fail('نوع عملیات مشخص نیست')

  const { id } = await ctx.params
  const o = await loadOrder(id)
  if (!o) return fail('سفارش یافت نشد', 404)

  const extras = parseOrderExtras(o.notes)
  const action = String(body.action)
  const by = user.fullName
  const now = new Date().toISOString()
  const isCreator = o.createdById === user.id
  const manager = isManager(user)
  const canTouch = manager || isCreator

  switch (action) {
    case 'update': {
      if (o.status !== 'DRAFT') return fail('فقط پیش‌نویس سفارش قابل ویرایش است')
      if (!canTouch) return fail('اجازه ویرایش این سفارش را ندارید', 403)
      const rawItems = Array.isArray(body.items) ? body.items : []
      if (rawItems.length === 0) return fail('اقلام سفارش الزامی است')
      let supplierId: string | null = o.supplierId
      let supplierName: string | null = o.supplierName
      if (body.supplierId !== undefined) {
        if (body.supplierId) {
          const sup = await db.supplier.findUnique({ where: { id: String(body.supplierId) } })
          if (!sup) return fail('تأمین‌کننده یافت نشد')
          supplierId = sup.id
          supplierName = sup.name
        } else {
          supplierId = null
          supplierName = body.supplierName ? String(body.supplierName) : null
        }
      }
      const items = rawItems.map((it: Record<string, unknown>) => ({
        productId: it.productId ? String(it.productId) : null,
        name: String(it.name ?? '').trim() || 'کالا',
        barcode: it.barcode ? String(it.barcode) : null,
        qty: Math.max(1, Math.round(toNumber(it.qty, 1)) || 1),
        unitBuyPrice: Math.max(0, toNumber(it.unitBuyPrice, 0)),
        printedPrice:
          it.printedPrice === null || it.printedPrice === undefined || it.printedPrice === ''
            ? null
            : toNumber(it.printedPrice, 0) || null,
      }))
      const totalAmount = items.reduce((s, it) => s + it.qty * it.unitBuyPrice, 0)
      const payMethod = ['CASH', 'CHEQUE', 'POS'].includes(String(body.payMethod)) ? String(body.payMethod) : o.payMethod
      if (body.note !== undefined) extras.note = body.note ? String(body.note) : null
      if (body.paymentRef !== undefined) extras.paymentRef = body.paymentRef ? String(body.paymentRef) : null
      await pushHistory(extras, { at: now, by, action: 'update', detail: 'ویرایش اقلام سفارش' })
      await db.order.update({
        where: { id: o.id },
        data: {
          supplierId,
          supplierName,
          deliveryDate: body.deliveryDate !== undefined ? (body.deliveryDate ? String(body.deliveryDate) : null) : o.deliveryDate,
          payMethod,
          notes: JSON.stringify(extras),
          totalAmount,
        },
      })
      await db.orderItem.deleteMany({ where: { orderId: o.id } })
      await db.orderItem.createMany({
        data: items.map((it) => ({ ...it, orderId: o.id, status: 'PENDING' })),
      })
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_update',
        actionLabel: 'ویرایش سفارش',
        category: 'orders',
        detail: `ویرایش پیش‌نویس ${o.code}`,
        entityId: o.id,
      })
      break
    }

    case 'submit': {
      if (o.status !== 'DRAFT') return fail('این سفارش قبلاً ارسال شده است')
      if (!canTouch) return fail('اجازه ارسال این سفارش را ندارید', 403)
      await pushHistory(extras, { at: now, by, action: 'submit', detail: 'ارسال برای تأیید' })
      await saveExtras(o.id, extras)
      await db.order.update({ where: { id: o.id }, data: { status: 'SUBMITTED' } })
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_submit',
        actionLabel: 'ارسال برای تأیید',
        category: 'orders',
        detail: `ارسال سفارش ${o.code} برای تأیید`,
        entityId: o.id,
      })
      break
    }

    case 'approve': {
      if (o.status !== 'SUBMITTED') return fail('فقط سفارش در انتظار تأیید قابل تأیید است')
      if (!MANAGERS.includes(user.role) && user.role !== 'ACC') return fail('تأیید سفارش فقط با دسترسی مدیران ممکن است', 403)
      extras.approvedById = user.id
      extras.approvedByName = by
      await pushHistory(extras, { at: now, by, action: 'approve', detail: `تأیید توسط ${by}` })
      await saveExtras(o.id, extras)
      await db.order.update({ where: { id: o.id }, data: { status: 'APPROVED' } })
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_approve',
        actionLabel: 'تأیید سفارش',
        category: 'orders',
        detail: `تأیید سفارش ${o.code}`,
        entityId: o.id,
      })
      break
    }

    case 'start-receive': {
      if (o.status !== 'APPROVED') return fail('این سفارش در وضعیت دریافت نیست')
      if (user.role !== 'SK' && !manager) return fail('شروع دریافت فقط برای انباردار/مدیران ممکن است', 403)
      await pushHistory(extras, { at: now, by, action: 'start-receive', detail: 'شروع دریافت کالا در انبار' })
      await saveExtras(o.id, extras)
      await db.order.update({ where: { id: o.id }, data: { status: 'RECEIVING' } })
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_start_receive',
        actionLabel: 'شروع دریافت',
        category: 'orders',
        detail: `شروع دریافت کالا برای ${o.code}`,
        entityId: o.id,
      })
      break
    }

    case 'save-progress': {
      if (o.status !== 'RECEIVING') return fail('این سفارش در حال دریافت نیست')
      const incoming = Array.isArray(body.items) ? body.items : []
      for (const it of incoming) {
        if (!it?.id) continue
        await db.orderItem
          .update({
            where: { id: String(it.id) },
            data: {
              receivedQty: it.receivedQty === null || it.receivedQty === undefined ? null : Math.max(0, Math.round(toNumber(it.receivedQty, 0))),
              status: it.status ? String(it.status) : undefined,
              // column is non-nullable Float — null collapses to 0 (documented in worklog)
              printedPrice: it.printedPrice === undefined ? undefined : toNumber(it.printedPrice, 0) || 0,
              expiryDate: it.expiryDate === undefined ? undefined : it.expiryDate ? String(it.expiryDate) : null,
              note: it.note === undefined ? undefined : it.note ? String(it.note) : null,
            },
          })
          .catch(() => {})
      }
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_save_progress',
        actionLabel: 'ذخیره پیشرفت دریافت',
        category: 'orders',
        detail: `ذخیره پیشرفت دریافت ${o.code}`,
        entityId: o.id,
      })
      break
    }

    case 'add-item': {
      if (o.status !== 'RECEIVING') return fail('این سفارش در حال دریافت نیست')
      const qty = Math.max(1, Math.round(toNumber(body.qty, 1)) || 1)
      await db.orderItem.create({
        data: {
          orderId: o.id,
          productId: body.productId ? String(body.productId) : null,
          name: String(body.name ?? '').trim() || 'کالا',
          barcode: body.barcode ? String(body.barcode) : null,
          qty,
          unitBuyPrice: Math.max(0, toNumber(body.unitBuyPrice, 0)),
          printedPrice:
            body.printedPrice === null || body.printedPrice === undefined || body.printedPrice === ''
              ? undefined
              : toNumber(body.printedPrice, 0) || undefined,
          receivedQty: qty,
          status: 'RECEIVED',
          note: 'افزوده‌شده در جریان دریافت',
        },
      })
      const items = await db.orderItem.findMany({ where: { orderId: o.id } })
      const totalAmount = items.reduce((s, it) => s + it.qty * it.unitBuyPrice, 0)
      await pushHistory(extras, {
        at: now,
        by,
        action: 'add-item',
        detail: `افزودن «${String(body.name ?? 'کالا')}» به‌مقدار ${toFaDigits(qty)}`,
      })
      await saveExtras(o.id, extras)
      await db.order.update({ where: { id: o.id }, data: { totalAmount } })
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_add_item',
        actionLabel: 'افزودن قلم در جریان دریافت',
        category: 'orders',
        detail: `افزودن قلم به ${o.code}`,
        entityId: o.id,
      })
      break
    }

    case 'receive': {
      if (o.status !== 'RECEIVING') return fail('این سفارش در حال دریافت نیست')
      const incoming = Array.isArray(body.items) ? body.items : []
      for (const it of incoming) {
        if (!it?.id) continue
        await db.orderItem
          .update({
            where: { id: String(it.id) },
            data: {
              receivedQty: it.receivedQty === null || it.receivedQty === undefined ? null : Math.max(0, Math.round(toNumber(it.receivedQty, 0))),
              status: it.status ? String(it.status) : undefined,
              // column is non-nullable Float — null collapses to 0 (documented in worklog)
              printedPrice: it.printedPrice === undefined ? undefined : toNumber(it.printedPrice, 0) || 0,
              expiryDate: it.expiryDate === undefined ? undefined : it.expiryDate ? String(it.expiryDate) : null,
              note: it.note === undefined ? undefined : it.note ? String(it.note) : null,
            },
          })
          .catch(() => {})
      }
      const items = await db.orderItem.findMany({ where: { orderId: o.id } })
      const mismatch = mismatchCount(
        items.map((i) => ({ qty: i.qty, receivedQty: i.receivedQty, status: i.status })),
      )
      // stock: received goods enter the inventory
      for (const it of items) {
        if (it.productId && (it.receivedQty ?? 0) > 0) {
          await db.product
            .update({ where: { id: it.productId }, data: { stock: { increment: it.receivedQty as number } } })
            .catch(() => {})
        }
      }
      const totalAmount = items.reduce((s, it) => s + it.qty * it.unitBuyPrice, 0)
      extras.receivedById = user.id
      extras.receivedByName = by
      await pushHistory(extras, {
        at: now,
        by,
        action: 'receive',
        detail: mismatch ? `پایان دریافت — ${toFaDigits(mismatch)} قلم مغایرت داشت` : 'پایان دریافت — همه اقلام کامل دریافت شد',
      })
      await saveExtras(o.id, extras)
      await db.order.update({
        where: { id: o.id },
        data: { status: 'RECEIVED', receivedAt: new Date(), totalAmount },
      })
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_receive',
        actionLabel: 'پایان دریافت',
        category: 'orders',
        detail: `پایان دریافت ${o.code}${mismatch ? ` با ${toFaDigits(mismatch)} قلم مغایرت` : ''}`,
        entityId: o.id,
      })
      const d = await detail(o.id)
      return ok(d ? { ...d, mismatch } : { mismatch })
    }

    case 'verify': {
      if (o.status !== 'RECEIVED') return fail('فقط سفارش دریافت‌شده قابل راستی‌آزمایی است')
      if (!MANAGERS.includes(user.role) && user.role !== 'SK') return fail('راستی‌آزمایی فقط با دسترسی مدیران/انباردار ممکن است', 403)
      const items = await db.orderItem.findMany({ where: { orderId: o.id } })
      const mismatch = mismatchCount(items.map((i) => ({ qty: i.qty, receivedQty: i.receivedQty, status: i.status })))
      extras.verifiedById = user.id
      extras.verifiedByName = by
      await pushHistory(extras, {
        at: now,
        by,
        action: 'verify',
        detail: mismatch ? `راستی‌آزمایی با ${toFaDigits(mismatch)} قلم مغایرت تأیید شد` : 'راستی‌آزمایی دریافت تأیید شد',
      })
      await saveExtras(o.id, extras)
      await db.order.update({ where: { id: o.id }, data: { status: 'VERIFIED' } })
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_verify',
        actionLabel: 'راستی‌آزمایی دریافت',
        category: 'orders',
        detail: `راستی‌آزمایی ${o.code}`,
        entityId: o.id,
      })
      break
    }

    case 'account': {
      if (o.status !== 'VERIFIED') return fail('فقط سفارش راستی‌آزمایی‌شده قابل ثبت در حسابداری است')
      if (!MANAGERS.includes(user.role) && user.role !== 'ACC') return fail('ثبت در حسابداری فقط با دسترسی مدیران/حسابداری ممکن است', 403)
      await pushHistory(extras, {
        at: now,
        by,
        action: 'account',
        detail: `ثبت در حسابداری توسط ${by}${extras.paymentRef ? ` — ارجاع: ${extras.paymentRef}` : ''}`,
      })
      await saveExtras(o.id, extras)
      await db.order.update({ where: { id: o.id }, data: { status: 'ACCOUNTED' } })
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_account',
        actionLabel: 'ثبت در حسابداری',
        category: 'orders',
        detail: `ثبت ${o.code} در حسابداری`,
        entityId: o.id,
      })
      break
    }

    case 'final-approve': {
      if (o.status !== 'ACCOUNTED') return fail('فقط سفارش ثبت‌شده در حسابداری قابل بستن است')
      if (!manager) return fail('تأیید نهایی فقط با دسترسی مدیران ممکن است', 403)
      await pushHistory(extras, { at: now, by, action: 'final-approve', detail: 'سفارش بسته شد' })
      await saveExtras(o.id, extras)
      await db.order.update({ where: { id: o.id }, data: { status: 'DONE' } })
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_final',
        actionLabel: 'تأیید نهایی',
        category: 'orders',
        detail: `بستن سفارش ${o.code}`,
        entityId: o.id,
      })
      break
    }

    case 'cancel': {
      if (!['DRAFT', 'SUBMITTED', 'APPROVED'].includes(o.status)) return fail('این سفارش قابل لغو نیست')
      if (!canTouch) return fail('اجازه لغو این سفارش را ندارید', 403)
      const reason = String(body.reason ?? '').trim()
      if (reason.length < 3) return fail('دلیل لغو الزامی است')
      await pushHistory(extras, { at: now, by, action: 'cancel', detail: reason })
      await saveExtras(o.id, extras)
      await db.order.update({ where: { id: o.id }, data: { status: 'CANCELLED' } })
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_cancel',
        actionLabel: 'لغو سفارش',
        category: 'orders',
        detail: `لغو سفارش ${o.code} — ${reason}`,
        entityId: o.id,
      })
      break
    }

    default:
      return fail('عملیات ناشناخته است')
  }

  const d = await detail(o.id)
  return ok(d)
}

/** DELETE /api/orders/[id] — live: only DRAFT orders, creator or manager */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const { id } = await ctx.params
  const o = await db.order.findUnique({ where: { id } })
  if (!o) return fail('سفارش یافت نشد', 404)
  if (o.status !== 'DRAFT') return fail('فقط پیش‌نویس‌ها قابل حذف هستند')
  if (!isManager(user) && o.createdById !== user.id) return fail('اجازه حذف این سفارش را ندارید', 403)

  await db.order.delete({ where: { id } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'order_delete',
    actionLabel: 'حذف پیش‌نویس',
    category: 'orders',
    detail: `حذف قطعی پیش‌نویس ${o.code}`,
    entityId: o.id,
  })
  return ok({ id: o.id, deleted: true })
}
