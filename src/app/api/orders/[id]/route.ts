import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser, type SessionUser } from '@/lib/auth'
import { canApproveOrdersUser } from '@/lib/access'
import { toFaDigits, toEnDigits, addDaysJalaliDash, todayJalaliDash } from '@/lib/jalali'

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
  offScheduleNote?: string | null
  offScheduleDays?: number | null
  verifiedById?: string | null
  verifiedByName?: string | null
  marginInvoiceNumber?: number | null
  /* R11: مامور پخشی که اقلام ضایعاتِ برگشتی به او سپرده شد (الزامی هنگام پایان دریافتِ سفارشِ دارای ضایعات) */
  wasteRepName?: string | null
  wasteRepPhone?: string | null
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

/** frontend mismatch formula (R8): accepted (received − returned) ≠ qty or status outside {PENDING, OK} */
function mismatchCount(
  items: { qty: number; receivedQty: number | null; returnedQty?: number | null; status: string }[],
): number {
  return items.filter((it) => {
    const accepted = Math.max(0, (it.receivedQty ?? 0) - (it.returnedQty ?? 0))
    return accepted !== it.qty || (it.status !== 'PENDING' && it.status !== 'OK')
  }).length
}

/** R8: وضعیت هر قلم پس از دریافت — مرجوعی/نرسیدن/کامل
 *  MISSING (هیچ نرسید) ← RETURNED (همه مرجوع) ← PARTIAL_RETURN (مرجوعی جزئی) ← OK ← PARTIAL (کسری بدون مرجوعی) */
function computeReceiveStatus(qty: number, receivedQty: number, returnedQty: number): string {
  if (receivedQty <= 0) return 'MISSING'
  if (qty > 0 && returnedQty >= qty) return 'RETURNED'
  if (returnedQty > 0) return 'PARTIAL_RETURN'
  if (receivedQty >= qty) return 'OK'
  return 'PARTIAL'
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

  /* R8: قیمت فروش جاری کالا برای هر قلم — شرط چیپ «قیمت چاپی متفاوت» در فرم دریافت */
  const productIds = [...new Set(o.items.map((it) => it.productId).filter((v): v is string => !!v))]
  const productRows = productIds.length
    ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, sellPrice: true } })
    : []
  const sellBy = new Map(productRows.map((p) => [p.id, p.sellPrice]))

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

  /* R9: اقلام ضایعات برگشتیِ این سفارش (SELECTED یا RETURNED) — برای فرم دریافت و چاپ فاکتور */
  const wasteRows = await db.wasteRecord.findMany({
    where: { orderId: o.id, status: { in: ['SELECTED', 'RETURNED'] } },
    orderBy: { date: 'asc' },
  })

  const historyJson = JSON.stringify(history)
  return {
    id: o.id,
    code: o.code,
    status: o.status,
    supplierId: o.supplierId,
    supplierName: o.supplierName,
    deliveryDate: o.deliveryDate,
    payMethod: o.payMethod,
    chequeDays: o.chequeDays,
    paymentRef: extras.paymentRef ?? null,
    totalAmount: o.totalAmount,
    note: extras.note ?? null,
    createdById: o.createdById,
    approvedById: extras.approvedById ?? null,
    receivedById: extras.receivedById ?? null,
    verifiedById: extras.verifiedById ?? null,
    /* R14: تأیید مدیر کل پس از ثبت حسابداری */
    gmApprovedAt: o.gmApprovedAt ? o.gmApprovedAt.toISOString() : null,
    gmApprovedByName: o.gmApprovedByName ?? null,
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
      returnedQty: it.returnedQty,
      returnReason: it.returnReason,
      cartonQty: it.cartonQty,
      unitsPerCarton: it.unitsPerCarton,
      lineTotal: it.lineTotal,
      productSellPrice: it.productId ? (sellBy.get(it.productId) ?? null) : null,
      status: it.status,
      expiryDate: it.expiryDate,
      note: it.note,
    })),
    /* R9: اقلام ضایعاتِ برگشتی این سفارش — چیزی که باید به مامور پخش بدهیم */
    wasteReturns: wasteRows.map((w) => ({
      id: w.id,
      name: w.name,
      qty: w.qty,
      unit: w.unit,
      reason: w.reason,
      reasonLabel: w.reason === 'EXPIRED' ? 'منقضی' : w.reason === 'DAMAGED' ? 'آسیب‌دیده' : w.reason === 'SPOILED' ? 'فاسد' : w.reason === 'THEFT' ? 'سرقت' : 'سایر',
      estValue: w.estValue,
      status: w.status,
      selectedAtJalali: w.selectedAtJalali,
      selectedByName: w.selectedByName,
      returnedAtJalali: w.returnedAtJalali,
      /* R11: مامور پخشی که اقلام به او سپرده شد */
      repName: w.repName ?? null,
      repPhone: w.repPhone ?? null,
    })),
    /* R11: مامور پخشِ ثبت‌شده برای برگشت ضایعات — برای گام‌های بعدی و پرونده */
    wasteRep: extras.wasteRepName ? { name: extras.wasteRepName, phone: extras.wasteRepPhone ?? null } : null,
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
/** R14 — ردپای «تأیید مدیر کل» روی فاکتور سودسنجِ متصلِ سفارش */
function linkedInvoiceHistory(
  inv: { historyJson: string },
  by: string,
): string {
  try {
    const list = JSON.parse(inv.historyJson || '[]') as { at?: string; by?: string; action?: string; detail?: string }[]
    list.push({
      at: new Date().toISOString(),
      by,
      action: 'gm-approve',
      detail: 'مدیر کل از مسیر سفارش‌ها تأیید کرد — قیمت‌ها در سر رسید و هلو به‌روز شد',
    })
    return JSON.stringify(list.slice(-80))
  } catch {
    return inv.historyJson
  }
}

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
      /* R10: اعلان به مدیران — سفارشی در انتظار تأیید هست */
      for (const role of ['OWNER', 'GM', 'ADMIN', 'EXEC']) {
        await db.notification.create({
          data: {
            role,
            kind: `order:submit:${o.id}`,
            severity: 'warning',
            title: 'سفارش جدید در انتظار تأیید',
            body: `سفارش ${o.code} (${o.supplierName ?? 'بدون تأمین‌کننده'}) توسط ${by} ارسال شد و نیازمند تأیید است.`,
            go: '#/supply/orders',
          },
        }).catch(() => {})
      }
      break
    }

    case 'edit-submitted': {
      /* R8: ویرایش کامل پیش از تأیید نهایی — مدیر می‌تواند اقلام/قیمت/طرف‌حساب را اصلاح کند */
      if (o.status !== 'SUBMITTED' && o.status !== 'APPROVED') return fail('ویرایش فقط تا پیش از شروع دریافت امکان‌پذیر است')
      if (!(await canApproveOrdersUser(user))) return fail('ویرایش پیش از تأیید فقط با دسترسی مدیران ممکن است', 403)
      const rawItems = Array.isArray(body.items) ? body.items : []
      if (rawItems.length === 0) return fail('اقلام سفارش الزامی است')
      let supplierId: string | null = o.supplierId
      let supplierName: string | null = o.supplierName
      if (body.supplierId !== undefined) {
        if (body.supplierId && body.supplierId !== 'none') {
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
        orderId: o.id,
        productId: it.productId ? String(it.productId) : null,
        name: String(it.name ?? '').trim() || 'کالا',
        barcode: it.barcode ? String(it.barcode) : null,
        qty: Math.max(1, Math.round(toNumber(it.qty, 1)) || 1),
        unitBuyPrice: Math.max(0, toNumber(it.unitBuyPrice, 0)),
        printedPrice: Math.max(0, toNumber(it.printedPrice, 0)),
        cartonQty: Math.max(0, Math.round(toNumber(it.cartonQty, 0)) || 0),
        unitsPerCarton: Math.max(0, Math.round(toNumber(it.unitsPerCarton, 0)) || 0),
        lineTotal: Math.max(0, toNumber(it.lineTotal, 0)),
      }))
      const totalAmount = items.reduce((s, it) => s + it.qty * it.unitBuyPrice, 0)
      const payMethod = ['CASH', 'CHEQUE', 'POS'].includes(String(body.payMethod)) ? String(body.payMethod) : o.payMethod
      const chequeDays =
        payMethod === 'CHEQUE' ? Math.max(0, Math.min(365, Math.round(toNumber(body.chequeDays, o.chequeDays)) || 0)) : 0
      if (body.note !== undefined) extras.note = body.note ? String(body.note) : null
      await pushHistory(extras, {
        at: now,
        by,
        action: 'edit-submitted',
        detail: `ویرایش پیش از تأیید توسط ${by} — ${items.length} قلم، جمع ${faMoney(totalAmount)} ریال`,
      })
      await db.order.update({
        where: { id: o.id },
        data: {
          supplierId,
          supplierName,
          deliveryDate: body.deliveryDate !== undefined ? (body.deliveryDate ? String(body.deliveryDate) : null) : o.deliveryDate,
          payMethod,
          chequeDays,
          notes: JSON.stringify(extras),
          totalAmount,
        },
      })
      await db.orderItem.deleteMany({ where: { orderId: o.id } })
      await db.orderItem.createMany({ data: items.map((it) => ({ ...it, status: 'PENDING' })) })
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_edit_submitted',
        actionLabel: 'ویرایش پیش از تأیید',
        category: 'orders',
        detail: `ویرایش سفارش ${o.code} پیش از تأیید توسط ${by}`,
        entityId: o.id,
      })
      break
    }

    case 'approve': {
      if (o.status !== 'SUBMITTED') return fail('فقط سفارش در انتظار تأیید قابل تأیید است')
      if (!(await canApproveOrdersUser(user))) return fail('تأیید سفارش فقط با دسترسی مدیران ممکن است', 403)
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
      /* R10: دریافت کالا برای همهٔ کارکنان باز است (مالک: «همه باید بتوانند دریافت کنند») —
         فقط کاربر لاگین‌شده لازم است؛ کنترل دو‌نفره در مرحلهٔ راستی‌آزمایی اعمال می‌شود. */
      /* R14: دریافت خارج از تاریخ تحویل — کاربر هشدار را تأیید و توضیح نوشته است */
      const offNote = String(body.offScheduleNote ?? '').trim().slice(0, 300)
      const offDays = Number(body.offScheduleDays)
      if (offNote) {
        extras.offScheduleNote = offNote
        extras.offScheduleDays = Number.isFinite(offDays) ? offDays : null
        await pushHistory(extras, {
          at: now,
          by,
          action: 'off-schedule',
          detail: `دریافت ${offDays > 0 ? `${toFaDigits(String(offDays))} روز زودتر` : offDays < 0 ? `${toFaDigits(String(Math.abs(offDays)))} روز دیرتر` : 'خارج از تاریخ'} از تاریخ تحویل (${toFaDigits(o.deliveryDate ?? '—')}) — توضیح کاربر: ${offNote}`,
        })
      }
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
        const spReturned =
          it.returnedQty === undefined
            ? undefined
            : Math.min(it.receivedQty == null ? 0 : Math.max(0, it.receivedQty), Math.max(0, Math.round(toNumber(it.returnedQty, 0))))
        await db.orderItem
          .update({
            where: { id: String(it.id) },
            data: {
              receivedQty: it.receivedQty === null || it.receivedQty === undefined ? null : Math.max(0, Math.round(toNumber(it.receivedQty, 0))),
              status: it.status ? String(it.status) : undefined,
              // R8: مرجوعی جزئی هم در ذخیرهٔ پیشرفت پایدار می‌شود
              ...(spReturned !== undefined
                ? { returnedQty: spReturned, returnReason: spReturned > 0 && it.returnReason ? String(it.returnReason) : null }
                : {}),
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
      /* R11: اگر این سفارش اقلام ضایعاتِ برگشتی (SELECTED) دارد، ثبت «مامور پخش» الزامی است —
         نام کامل و شمارهٔ موبایل نمایندهٔ تأمین‌کننده؛ بدون آن، پایان دریافت پذیرفته نمی‌شود */
      const selectedWaste = await db.wasteRecord.count({ where: { orderId: o.id, status: 'SELECTED' } })
      let wasteRepName = ''
      let wasteRepPhone = ''
      if (selectedWaste > 0) {
        wasteRepName = String(body.wasteRepName ?? '').trim()
        wasteRepPhone = String(body.wasteRepPhone ?? '').trim()
        if (wasteRepName.length < 3) return fail('نام کامل مامور پخش (نمایندهٔ تأمین‌کننده) را وارد کنید — اقلام ضایعات به او سپرده می‌شود')
        const phoneDigits = wasteRepPhone.replace(/[^0-9]/g, '')
        if (phoneDigits.length < 10 || phoneDigits.length > 14) return fail('شمارهٔ موبایل مامور پخش را درست وارد کنید (۱۰ تا ۱۴ رقم)')
      }
      /* تعداد سفارش‌شدهٔ هر قلم از بانک (نه از کلاینت) — مبنای محاسبهٔ وضعیت */
      const qtyById = new Map(o.items.map((i) => [i.id, i.qty]))
      for (const it of incoming) {
        if (!it?.id) continue
        const receivedQty =
          it.receivedQty === null || it.receivedQty === undefined ? null : Math.max(0, Math.round(toNumber(it.receivedQty, 0)))
        /* R8: مرجوعی جزئی — هرگز بیشتر از دریافت‌شده */
        const returnedQty = Math.min(
          receivedQty ?? 0,
          Math.max(0, Math.round(toNumber(it.returnedQty, 0))),
        )
        await db.orderItem
          .update({
            where: { id: String(it.id) },
            data: {
              receivedQty,
              // R8: وضعیت هر قلم روی سرور محاسبه می‌شود (OK / PARTIAL / MISSING / PARTIAL_RETURN / RETURNED)
              status: computeReceiveStatus(qtyById.get(String(it.id)) ?? 1, receivedQty ?? 0, returnedQty),
              returnedQty,
              returnReason: returnedQty > 0 && it.returnReason ? String(it.returnReason) : null,
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
        items.map((i) => ({ qty: i.qty, receivedQty: i.receivedQty, returnedQty: i.returnedQty, status: i.status })),
      )
      // R8: خلاصهٔ دریافت — چند قلم کامل، چند مرجوعی، چند نرسید
      const okCount = items.filter((i) => i.status === 'OK').length
      const returnCount = items.filter((i) => i.status === 'PARTIAL_RETURN' || i.status === 'RETURNED').length
      const missingCount = items.filter((i) => i.status === 'MISSING').length
      // stock: فقط واحدهای پذیرفته‌شده (دریافت − مرجوعی) وارد انبار می‌شوند
      for (const it of items) {
        const accepted = Math.max(0, (it.receivedQty ?? 0) - (it.returnedQty ?? 0))
        if (it.productId && accepted > 0) {
          await db.product
            .update({
              where: { id: it.productId },
              data: {
                stock: { increment: accepted },
                /* قیمت خرید اصلاح‌شدهٔ مدیر در فرم سفارش، به یاد کالا منتقل شود */
                ...(it.unitBuyPrice > 0 ? { lastBuyPrice: it.unitBuyPrice } : {}),
              },
            })
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
        detail: `پایان دریافت — ${toFaDigits(okCount)} قلم کامل، ${toFaDigits(returnCount)} قلم مرجوعی جزئی، ${toFaDigits(missingCount)} قلم نرسید`,
      })
      /* R8: چک خودکار — سفارش چکیِ دارای مهلت، هنگام پایان دریافت چک پیش‌نویس می‌سازد (idempotent) */
      let chequeMade = false
      if (o.payMethod === 'CHEQUE' && o.chequeDays > 0) {
        const existingCheque = await db.cheque.findFirst({ where: { orderId: o.id }, select: { id: true } })
        if (!existingCheque) {
          const acceptedTotal = items.reduce(
            (s, it) => s + Math.max(0, (it.receivedQty ?? 0) - (it.returnedQty ?? 0)) * it.unitBuyPrice,
            0,
          )
          if (acceptedTotal > 0) {
            /* R10: سررسید چک = تاریخ تحویل سفارش + مهلت — نه روز ثبت دریافت.
               (اگر تاریخ تحویل معتبر نبود، همان روز جاری مبنا می‌ماند) */
            const chequeBase = o.deliveryDate && /^\d{4}-\d{2}-\d{2}$/.test(o.deliveryDate) ? o.deliveryDate : todayJalaliDash()
            const dueDate = addDaysJalaliDash(chequeBase, o.chequeDays)
            const cheque = await db.cheque.create({
              data: {
                number: `AUTO-${o.code}`,
                amount: acceptedTotal,
                status: 'PENDING_OWNER',
                recipient: o.supplierName,
                selfIssued: false,
                dueDate,
                note: `چک خودکار سفارش ${o.code} — مهلت ${toFaDigits(o.chequeDays)} روز`,
                orderId: o.id,
                orderCode: o.code,
                historyJson: JSON.stringify([
                  {
                    at: now,
                    by: 'system',
                    action: 'auto-create',
                    detail: `ثبت خودکار هنگام پایان دریافت سفارش ${o.code}`,
                  },
                ]),
              },
            })
            chequeMade = true
            /* اعلان به مالک و مدیر کل — آمادهٔ نوشتن چک */
            for (const role of ['OWNER', 'GM']) {
              await db.notification.create({
                data: {
                  role,
                  kind: `cheque:auto:${cheque.id}`,
                  severity: 'info',
                  title: 'چک خودکار سفارش ثبت شد',
                  body: `چک ${faMoney(acceptedTotal)} ریالی برای سفارش ${o.code} ثبت شد — آمادهٔ نوشتن.`,
                  go: '#/finance/cheques',
                },
              })
            }
            await pushHistory(extras, {
              at: now,
              by: 'سامانه',
              action: 'cheque-auto',
              detail: `چک ${toFaDigits(o.chequeDays)} روزه به مبلغ ${faMoney(acceptedTotal)} ریال (سررسید ${toFaDigits(dueDate)}) خودکار ثبت شد`,
            })
          }
        }
      }
      await saveExtras(o.id, extras)
      await db.order.update({
        where: { id: o.id },
        data: { status: 'RECEIVED', receivedAt: new Date(), totalAmount },
      })
      /* R9: اقلام ضایعاتِ برگشتی این سفارش ← RETURNED (همراه مامور پخش به تأمین‌کننده برگشت)
         R11: نام و موبایل مامور پخش روی رکوردها ثبت می‌شود */
      const wasteReturned = await db.wasteRecord.updateMany({
        where: { orderId: o.id, status: 'SELECTED' },
        data: {
          status: 'RETURNED',
          returnedAtJalali: todayJalaliDash(),
          ...(wasteRepName ? { repName: wasteRepName, repPhone: wasteRepPhone } : {}),
        },
      })
      if (wasteReturned.count > 0) {
        if (wasteRepName) {
          extras.wasteRepName = wasteRepName
          extras.wasteRepPhone = wasteRepPhone
        }
        await pushHistory(extras, {
          at: now,
          by: 'سامانه',
          action: 'waste-returned',
          detail: `${toFaDigits(wasteReturned.count)} قلم ضایعات به تأمین‌کننده برگشت خورد${wasteRepName ? ` — تحویل به مامور پخش «${wasteRepName}»${wasteRepPhone ? ` (${toFaDigits(wasteRepPhone)})` : ''}` : ''}`,
        })
        await saveExtras(o.id, extras)
      }
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_receive',
        actionLabel: 'پایان دریافت',
        category: 'orders',
        detail: `پایان دریافت ${o.code}${mismatch ? ` با ${toFaDigits(mismatch)} قلم مغایرت` : ''}${chequeMade ? ' + چک خودکار ثبت شد' : ''}${wasteReturned.count ? ` + ${toFaDigits(wasteReturned.count)} قلم ضایعات برگشت` : ''}`,
        entityId: o.id,
      })
      const d = await detail(o.id)
      return ok(d ? { ...d, mismatch } : { mismatch })
    }

    /* ── R14: اسکن بارکد در فرم دریافت — بارکد جدیدِ کالا در بانک بارکد ثبت می‌شود ── */
    case 'scan-barcode': {
      if (!['RECEIVING', 'RECEIVED'].includes(o.status)) return fail('اسکن فقط در حین دریافت ممکن است')
      const itemId = String(body.itemId ?? '')
      const code = toEnDigits(String(body.barcode ?? '')).replace(/[^0-9]/g, '')
      if (!itemId) return fail('قلم سفارش مشخص نیست')
      if (!/^\d{4,20}$/.test(code)) return fail('قالب بارکد نامعتبر است (۴ تا ۲۰ رقم)')
      const it = o.items.find((x) => x.id === itemId)
      if (!it) return fail('این قلم در سفارش نیست')
      if (!it.productId) return fail('این قلم به کالای بانک متصل نیست — بارکد فقط برای اقلام متصل ثبت می‌شود')
      const prod = await db.product.findUnique({ where: { id: it.productId }, select: { id: true, name: true, code: true, barcodesJson: true, holooErp: true } })
      if (!prod) return fail('کالای این قلم یافت نشد')
      const bank = safeJson<string[]>(prod.barcodesJson, [])
      if (code === prod.code || bank.includes(code)) return ok({ known: true, added: false, barcode: code })
      bank.push(code)
      await db.product.update({ where: { id: prod.id }, data: { barcodesJson: JSON.stringify(bank.slice(0, 60)) } })
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_scan_barcode',
        actionLabel: 'بارکد جدید از فرم دریافت',
        category: 'orders',
        detail: `${code} → ${prod.name} (سفارش ${o.code})`,
        entityId: prod.id,
      })
      /* هلو: سرویس Apex (PDF) برای افزودن بارکد/Morecodes اندپوینت نوشتاری ندارد؛
         ثبت در بانک خودمان + لاگ برای پیگیری دستی/آتی */
      await db.holooSyncLog
        .create({
          data: {
            kind: 'BARCODE_ADD',
            status: 'FAIL',
            statsJson: JSON.stringify({ orderCode: o.code, productCode: prod.code, barcode: code, holooErp: prod.holooErp ?? null }),
            error: 'سرویس وب Apex هلو بارکد افزوردن را پشتیبانی نمی‌کند (PDF فاقد اندپوینت Morecodes نوشتاری) — در خود هلو ثبت شود',
          },
        })
        .catch(() => {})
      return ok({ known: false, added: true, barcode: code })
    }

    case 'verify': {
      if (o.status !== 'RECEIVED') return fail('فقط سفارش دریافت‌شده قابل راستی‌آزمایی است')
      /* R11: راستی‌آزمایی برای همهٔ کارکنان باز است (هر کارمندِ دیگری غیر از دریافت‌کنندهٔ همان سفارش).
         اصل دو‌نفره همچنان برقرار است: کسی که دریافت را ثبت کرده، راستی‌آزمایی همان سفارش را نمی‌تواند بکند. */
      if (extras.receivedById && extras.receivedById === user.id) {
        return fail('شما دریافتِ این سفارش را ثبت کرده‌اید — راستی‌آزمایی باید توسط نفر دیگری انجام شود (اصل دو‌نفره).', 403)
      }
      const items = await db.orderItem.findMany({ where: { orderId: o.id } })
      const mismatch = mismatchCount(items.map((i) => ({ qty: i.qty, receivedQty: i.receivedQty, returnedQty: i.returnedQty, status: i.status })))
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
      /* R8: اصلاح قیمت‌های حسابدار (بهای خرید / قیمت چاپی) پیش از ثبت نهایی */
      const adjustments = Array.isArray(body.items) ? body.items : []
      const markedReturned = new Set(
        adjustments.filter((it: Record<string, unknown>) => it?.id && it.markedReturned === true).map((it: Record<string, unknown>) => String(it.id)),
      )
      for (const it of adjustments) {
        if (!it?.id) continue
        const patch: Record<string, unknown> = {}
        if (it.unitBuyPrice !== undefined) patch.unitBuyPrice = Math.max(0, toNumber(it.unitBuyPrice, 0))
        if (it.printedPrice !== undefined) patch.printedPrice = Math.max(0, toNumber(it.printedPrice, 0))
        if (Object.keys(patch).length > 0) {
          await db.orderItem.update({ where: { id: String(it.id) }, data: patch }).catch(() => {})
        }
      }
      const items = await db.orderItem.findMany({ where: { orderId: o.id } })
      const totalAmount = items.reduce((s, it) => s + it.qty * it.unitBuyPrice, 0)
      /* R8: سند آرشیو فاکتور خرید — به‌صورت خودکار (idempotent) با وضعیت «در انتظار بایگانی فیزیکی» */
      let archiveDocId: string | null = null
      const existingDoc = await db.archiveDocument.findFirst({
        where: { orderId: o.id, kind: 'INVOICE' },
        select: { id: true },
      })
      if (!existingDoc) {
        const returnedItems = items
          .filter((it) => (it.returnedQty ?? 0) > 0 || markedReturned.has(it.id))
          .map((it) => ({ name: it.name, qty: it.returnedQty ?? 0, reason: it.returnReason ?? '' }))
        const doc = await db.archiveDocument.create({
          data: {
            kind: 'INVOICE',
            title: `فاکتور خرید ${o.code} — ${o.supplierName ?? 'بدون تأمین‌کننده'}`,
            dateJalali: todayJalaliDash(),
            supplierId: o.supplierId,
            supplierName: o.supplierName,
            orderId: o.id,
            orderCode: o.code,
            amount: totalAmount,
            status: 'PENDING',
            returnedJson: JSON.stringify(returnedItems),
            note: `سند خودکارِ ثبت حسابداری سفارش ${o.code}`,
            createdById: user.id,
            createdByName: by,
          },
        })
        archiveDocId = doc.id
      }

      /* ── R9: فاکتور سودسنج این تحویل — «بعد از دریافت، فاکتور در سامانهٔ سود ثبت شود» ──
         اقلام پذیرفته‌شده (دریافت − مرجوعی) با قیمت‌های اصلاح‌شدهٔ حسابدار؛
         marginPct از deriveItem سودسنج (آستانه‌ها هم). سند به سفارش پیوند می‌خورد. */
      const { deriveItem, getMarginThresholds } = await import('../../margin/route')
      const thresholds = await getMarginThresholds()
      const sellRows = items.filter((it) => it.productId).length
        ? await db.product.findMany({
            where: { id: { in: items.filter((it) => it.productId).map((it) => it.productId as string) } },
            select: { id: true, sellPrice: true, unit: true },
          })
        : []
      const sellMap = new Map(sellRows.map((p) => [p.id, p]))
      const marginItems = items
        .map((it) => {
          const accepted = Math.max(0, (it.receivedQty ?? 0) - (it.returnedQty ?? 0))
          if (accepted <= 0) return null
          const sell = it.productId ? (sellMap.get(it.productId)?.sellPrice ?? 0) : 0
          const unit = it.productId ? (sellMap.get(it.productId)?.unit ?? 'عدد') : 'عدد'
          return deriveItem(
            {
              productId: it.productId,
              barcode: it.barcode,
              productName: it.name,
              unit,
              quantity: accepted,
              totalCost: Math.round(accepted * it.unitBuyPrice),
              printedPrice: it.printedPrice,
              salePrice: sell > 0 ? sell : it.printedPrice,
              marginPct: 0,
              free100: false,
              baseCost: 0,
              note: it.returnedQty ? `${toFaDigits(it.returnedQty)} مرجوعی` : null,
            },
            thresholds,
          )
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
      let marginInvoiceId: string | null = null
      let marginInvoiceNumber: number | null = null
      if (marginItems.length) {
        const maxNumber = await db.marginInvoice.aggregate({ _max: { number: true } })
        const number = (maxNumber._max.number ?? 0) + 1
        const inv = await db.marginInvoice.create({
          data: {
            number,
            supplierId: o.supplierId,
            supplierName: o.supplierName,
            note: `فاکتور خودکارِ ثبت حسابداری سفارش ${o.code}`,
            status: 'final',
            providerDocNumber: body.providerDocNumber ? String(body.providerDocNumber) : null,
            dateJalali: todayJalaliDash(),
            purchaseOrderId: o.id,
            items: { create: marginItems },
          },
        })
        marginInvoiceId = inv.id
        marginInvoiceNumber = inv.number
        extras.marginInvoiceNumber = number
      }

      /* ── R9: ثبت سفارش خرید در هلو (Apex) — همان انتگراسیون /api/holoo/sync ──
         pushToHoloo=true → تلاش درون‌سروری؛ در صورت عدم دسترسی HolooSyncLog FAIL و pending=true */
      let holoo: { pushed: boolean; pending?: boolean; reason?: string; invoiceNo?: string } | null = null
      if (body.pushToHoloo === true) {
        try {
          const { getHolooConfig } = await import('@/lib/holoo')
          const cfg = await getHolooConfig()
          if (!cfg.enabled) {
            holoo = { pushed: false, pending: true, reason: 'اتصال هلو غیرفعال است' }
            await db.holooSyncLog
              .create({
                data: {
                  kind: 'PUSH_ORDER',
                  status: 'FAIL',
                  statsJson: JSON.stringify({ orderCode: o.code, source: 'account', pending: true }),
                  error: 'اتصال هلو غیرفعال است — سفارش خرید در انتظار ارسال',
                },
              })
              .catch(() => {})
          } else {
            /* R9: درون‌سروری مستقیم روی حلقهٔ محلی — درخواست https از خود سرور
               (nginx/SNI) به EPROTO می‌افتد؛ 127.0.0.1:${PORT} در دمو و sandbox یکی است */
            const origin = `http://127.0.0.1:${process.env.PORT || 3000}`
            const hres = await fetch(`${origin}/api/holoo/sync`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', cookie: req.headers.get('cookie') || '' },
              body: JSON.stringify({ what: 'order', mode: 'push', orderId: o.id }),
            })
            const hj = (await hres.json().catch(() => null)) as { ok?: boolean; data?: Record<string, unknown>; error?: string } | null
            if (hres.ok && hj?.ok) {
              holoo = { pushed: true, invoiceNo: String(hj.data?.invoiceNo ?? '') || undefined }
            } else {
              const rs = String(hj?.error ?? `خطای ${hres.status}`)
              holoo = { pushed: false, pending: true, reason: rs }
              await db.holooSyncLog
                .create({
                  data: {
                    kind: 'PUSH_ORDER',
                    status: 'FAIL',
                    statsJson: JSON.stringify({ orderCode: o.code, source: 'account', pending: true }),
                    error: `تلاش از ثبت حسابداری ناموفق — ${rs}`,
                  },
                })
                .catch(() => {})
            }
          }
        } catch (e) {
          const rs = e instanceof Error ? e.message : 'خطای نامشخص'
          holoo = { pushed: false, pending: true, reason: rs }
        }
      }

      await pushHistory(extras, {
        at: now,
        by,
        action: 'account',
        detail: `ثبت در حسابداری توسط ${by} — جمع نهایی ${faMoney(totalAmount)} ریال${archiveDocId ? ' + سند آرشیو فاکتور ساخته شد' : ''}${marginInvoiceNumber ? ` + فاکتور سودسنج #${toFaDigits(String(marginInvoiceNumber))}` : ''}${holoo ? (holoo.pushed ? ' + در هلو ثبت شد' : ' + هلو: در انتظار ارسال') : ''}`,
      })
      await saveExtras(o.id, extras)
      await db.order.update({ where: { id: o.id }, data: { status: 'ACCOUNTED', totalAmount } })
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_account',
        actionLabel: 'ثبت در حسابداری',
        category: 'orders',
        detail: `ثبت ${o.code} در حسابداری — جمع ${faMoney(totalAmount)} ریال${archiveDocId ? ' + سند آرشیو' : ''}`,
        entityId: o.id,
      })
      /* R14: اعلان به مدیر کل — سفارش در انتظار تأیید ایشان است */
      for (const role of ['GM', 'OWNER', 'ADMIN']) {
        await db.notification.create({
          data: {
            role,
            kind: `order:gm:${o.id}`,
            severity: 'warning',
            title: 'سفارش در انتظار تأیید مدیر کل',
            body: `سفارش ${o.code} (${o.supplierName ?? 'بدون تأمین‌کننده'}) توسط ${by} در حسابداری ثبت شد — پس از تأیید مدیر کل (خانم لطفی)، قیمت‌ها منتشر و سفارش قابل بستن است.`,
            go: `#/supply/receiving?open=${o.id}`,
          },
        }).catch(() => {})
      }
      const dAcc = await detail(o.id)
      return ok(dAcc ? { ...dAcc, archiveDocId, marginInvoiceId, marginInvoiceNumber, holoo } : { archiveDocId, marginInvoiceId, marginInvoiceNumber, holoo })
    }

    /* ── R14: تأیید مدیر کل (خانم لطفی) — پس از ثبت حسابداری، پیش از بستن سفارش.
       هم‌زمان قیمت‌های فاکتور سودسنجِ متصل (sellPrice=نهایی، sellPrice2=قیمت چاپی)
       روی کالا و در هلو منتشر می‌شود. ── */
    case 'gm-approve': {
      if (o.status !== 'ACCOUNTED') return fail('تأیید مدیر کل فقط برای سفارشِ ثبت‌شده در حسابداری ممکن است')
      if (!['GM', 'OWNER', 'ADMIN'].includes(user.role)) return fail('تأیید مدیر کل فقط برای مدیر کل (خانم لطفی) یا مالک/ادمین ممکن است', 403)
      if (o.gmApprovedAt) return fail('این سفارش قبلاً تأیید مدیر کل شده است')

      let prices: { updatedLocal: number; pushedHoloo: number; reason?: string } | null = null
      const linkedInv = await db.marginInvoice.findFirst({ where: { purchaseOrderId: o.id }, include: { items: true } })
      if (linkedInv && !linkedInv.gmApprovedAt) {
        const { publishPricesToHoloo } = await import('@/lib/margin-purchase')
        prices = await publishPricesToHoloo({
          items: linkedInv.items.filter((it) => it.accepted !== false),
          marginInvoiceNumber: linkedInv.number,
        })
        await db.marginInvoice.update({
          where: { id: linkedInv.id },
          data: {
            gmApprovedAt: new Date(),
            gmApprovedById: user.id,
            gmApprovedByName: by,
            historyJson: linkedInvoiceHistory(linkedInv, by),
          },
        })
      }

      await pushHistory(extras, {
        at: now,
        by,
        action: 'gm-approve',
        detail: `تأیید مدیر کل (خانم لطفی) — ${by}${prices ? ` · قیمت ${toFaDigits(String(prices.updatedLocal))} کالا به‌روز شد${prices.pushedHoloo ? ` و ${toFaDigits(String(prices.pushedHoloo))} قلم در هلو منتشر شد` : ''}` : ''} — آمادهٔ بستن سفارش`,
      })
      await saveExtras(o.id, extras)
      await db.order.update({
        where: { id: o.id },
        data: { gmApprovedAt: new Date(), gmApprovedById: user.id, gmApprovedByName: by },
      })
      await logActivity({
        userId: user.id,
        userName: by,
        action: 'order_gm_approve',
        actionLabel: 'تأیید مدیر کل سفارش',
        category: 'orders',
        detail: `${o.code}${prices ? ` — ${toFaDigits(String(prices.updatedLocal))} قیمت به‌روز / ${toFaDigits(String(prices.pushedHoloo))} در هلو` : ''}`,
        entityId: o.id,
      })
      const dGm = await detail(o.id)
      return ok(dGm ? { ...dGm, prices } : { prices })
    }

    case 'final-approve': {
      if (o.status !== 'ACCOUNTED') return fail('فقط سفارش ثبت‌شده در حسابداری قابل بستن است')
      if (!manager) return fail('تأیید نهایی فقط با دسترسی مدیران ممکن است', 403)
      if (!o.gmApprovedAt) return fail('پیش از بستن سفارش، تأیید مدیر کل (خانم لطفی) لازم است')
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
      /* R9: لغو سفارش ← ضایعاتِ SELECTED این سفارش به PENDING برمی‌گردند (برای سفارش بعدی) */
      const wasteReverted = await db.wasteRecord.updateMany({
        where: { orderId: o.id, status: 'SELECTED' },
        data: { status: 'PENDING', orderId: null, orderCode: null, selectedAtJalali: null, selectedByName: null },
      })
      if (wasteReverted.count > 0) {
        await pushHistory(extras, {
          at: now,
          by: 'سامانه',
          action: 'waste-revert',
          detail: `${toFaDigits(wasteReverted.count)} قلم ضایعات به حالت انتظار برگشت`,
        })
        await saveExtras(o.id, extras)
      }
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
