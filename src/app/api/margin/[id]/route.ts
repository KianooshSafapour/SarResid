import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { toFaDigits } from '@/lib/jalali'
import { deriveItem, invoiceListOut, MARGIN_ROLES, type MarginItemInput } from '../route'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

function firstBarcodeOf(p: { barcodesJson: string; code: string | null }): string | null {
  const list = safeJson<string[]>(p.barcodesJson, [])
  return list[0] ?? p.code ?? null
}

/** GET /api/margin/[id] — {invoice:{…, archived, dateJalali, items:[… with product memory]}} */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const { id } = await ctx.params
  const inv = await db.marginInvoice.findUnique({ where: { id }, include: { items: true } })
  if (!inv) return fail('فاکتور یافت نشد', 404)

  const productIds = [...new Set(inv.items.map((i) => i.productId ?? '').filter(Boolean))]
  const products = productIds.length ? await db.product.findMany({ where: { id: { in: productIds } } }) : []
  const prodById = new Map(products.map((p) => [p.id, p]))

  // printed-price memory from OTHER invoices (per product)
  const others = productIds.length
    ? await db.marginItem.findMany({
        where: { productId: { in: productIds }, invoiceId: { not: inv.id } },
        include: { invoice: { select: { createdAt: true } } },
      })
    : []
  const byProduct = new Map<string, typeof others>()
  for (const o of others) {
    const pid = o.productId as string
    const arr = byProduct.get(pid) ?? []
    arr.push(o)
    byProduct.set(pid, arr)
  }

  const items = inv.items.map((it) => {
    const p = it.productId ? prodById.get(it.productId) : null
    let product: Record<string, unknown> | null = null
    let lastUnitCost: number | null = null
    if (p) {
      const mem = (byProduct.get(p.id) ?? []).sort(
        (a, b) => b.invoice.createdAt.getTime() - a.invoice.createdAt.getTime(),
      )
      const prices = mem.map((m) => m.printedPrice)
      lastUnitCost = p.lastBuyPrice
      product = {
        id: p.id,
        name: p.name,
        unit: p.unit,
        sellPrice: p.sellPrice,
        lastBuyPrice: p.lastBuyPrice,
        mainGroup: p.mainGroup,
        lastPrintedPrice: mem.length ? mem[0].printedPrice : null,
        avgPrintedPrice: prices.length
          ? prices.reduce((s, v) => s + v, 0) / prices.length
          : null,
        printedPriceCount: mem.length,
        barcode: firstBarcodeOf(p),
      }
    }
    return {
      id: it.id,
      productId: it.productId,
      barcode: it.barcode,
      productName: it.productName,
      unit: it.unit,
      quantity: it.quantity,
      totalCost: it.totalCost,
      unitCost: it.unitCost,
      printedPrice: it.printedPrice,
      margin: it.margin,
      profitPerUnit: it.profitPerUnit,
      note: it.note,
      level: it.level,
      alerts: safeJson<unknown[]>(it.alertsJson, []),
      product,
      lastUnitCost,
    }
  })

  return ok({
    invoice: {
      id: inv.id,
      number: inv.number,
      supplierId: inv.supplierId,
      supplierName: inv.supplierName,
      note: inv.note,
      status: inv.status,
      archived: inv.archived,
      archivedAt: inv.archivedAt ? inv.archivedAt.toISOString() : null,
      createdAt: inv.createdAt.toISOString(),
      dateJalali: inv.dateJalali,
      items,
    },
  })
}

/** PUT /api/margin/[id] — full replace (builder «ذخیره»); archived invoices are locked */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!MARGIN_ROLES.includes(me.role)) return fail('شما مجاز به ویرایش فاکتور سودسنج نیستید', 403)

  const { id } = await ctx.params
  const inv = await db.marginInvoice.findUnique({ where: { id } })
  if (!inv) return fail('فاکتور یافت نشد', 404)
  if (inv.archived) return fail('فاکتور بایگانی‌شده قابل ویرایش نیست؛ ابتدا بایگانی را باز کنید')

  const body = await req.json().catch(() => null)
  if (!body) return fail('درخواست نامعتبر است')

  const supplierName = String(body.supplierName ?? '').trim() || null
  if (!supplierName) return fail('تأمین‌کننده را انتخاب یا نامش را وارد کنید')
  const supplierId = String(body.supplierId ?? '').trim() || null
  const note = String(body.note ?? '').trim() || null

  const rawItems = Array.isArray(body.items) ? body.items : []
  if (rawItems.length === 0) return fail('فاکتور باید حداقل یک قلم داشته باشد')

  const items: (MarginItemInput & { alertsJson: string })[] = []
  for (const raw of rawItems) {
    const name = String(raw?.productName ?? '').trim()
    if (!name) return fail('نام کالا را وارد کنید')
    const quantity = Math.trunc(Number(raw?.quantity) || 0)
    if (quantity < 1) return fail('تعداد باید بزرگ‌تر از صفر باشد')
    items.push(
      deriveItem({
        productId: raw?.productId ? String(raw.productId) : null,
        barcode: raw?.barcode ? String(raw.barcode).trim() : null,
        productName: name,
        unit: String(raw?.unit ?? 'عدد').trim() || 'عدد',
        quantity,
        totalCost: Number(raw?.totalCost) || 0,
        printedPrice: Number(raw?.printedPrice) || 0,
        note: raw?.note ? String(raw.note).trim() : null,
      }) as MarginItemInput & { alertsJson: string },
    )
  }

  await db.marginItem.deleteMany({ where: { invoiceId: id } })
  const updated = await db.marginInvoice.update({
    where: { id },
    data: {
      supplierId,
      supplierName,
      note,
      items: { create: items },
    },
  })

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'margin.update',
    actionLabel: 'ویرایش فاکتور سودسنج',
    category: 'profit',
    detail: `#${toFaDigits(String(updated.number))} — ${supplierName}`,
    entityId: id,
  })

  return ok({ id: updated.id, number: updated.number })
}

/** PATCH /api/margin/[id] — {action:'finalize'|'archive'} or {note, items} updates */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!MARGIN_ROLES.includes(me.role)) return fail('شما مجاز به ویرایش فاکتور سودسنج نیستید', 403)

  const { id } = await ctx.params
  const inv = await db.marginInvoice.findUnique({ where: { id } })
  if (!inv) return fail('فاکتور یافت نشد', 404)

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action ?? '')

  if (action === 'finalize') {
    if (inv.archived) return fail('فاکتور بایگانی‌شده قابل تغییر نیست')
    const updated = await db.marginInvoice.update({ where: { id }, data: { status: 'final' } })
    return ok({ id, number: updated.number, status: updated.status })
  }
  if (action === 'archive') {
    if (inv.archived) return fail('فاکتور قبلاً بایگانی شده است')
    const updated = await db.marginInvoice.update({
      where: { id },
      data: { archived: true, archivedAt: new Date() },
    })
    return ok({ id, archived: updated.archived, archivedAt: updated.archivedAt?.toISOString() ?? null })
  }

  // plain field update (note / items) — archived stays locked
  if (inv.archived) return fail('فاکتور بایگانی‌شده قابل ویرایش نیست؛ ابتدا بایگانی را باز کنید')
  const data: Record<string, unknown> = {}
  if (body?.note !== undefined) data.note = String(body.note ?? '').trim() || null
  if (Array.isArray(body?.items) && body.items.length) {
    await db.marginItem.deleteMany({ where: { invoiceId: id } })
    const items = body.items.map((raw: Record<string, unknown>) =>
      deriveItem({
        productId: raw?.productId ? String(raw.productId) : null,
        barcode: raw?.barcode ? String(raw.barcode).trim() : null,
        productName: String(raw?.productName ?? '').trim() || '—',
        unit: String(raw?.unit ?? 'عدد').trim() || 'عدد',
        quantity: Math.trunc(Number(raw?.quantity) || 1),
        totalCost: Number(raw?.totalCost) || 0,
        printedPrice: Number(raw?.printedPrice) || 0,
        note: raw?.note ? String(raw.note).trim() : null,
      }) as MarginItemInput & { alertsJson: string },
    )
    data.items = { create: items }
  }
  await db.marginInvoice.update({ where: { id }, data })
  const refreshed = await db.marginInvoice.findUnique({ where: { id }, include: { items: { select: { quantity: true, totalCost: true, printedPrice: true } } } })
  return ok(refreshed ? invoiceListOut(refreshed) : { id })
}

/** DELETE /api/margin/[id] — archived invoices are locked */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!MARGIN_ROLES.includes(me.role)) return fail('شما مجاز به حذف فاکتور سودسنج نیستید', 403)

  const { id } = await ctx.params
  const inv = await db.marginInvoice.findUnique({ where: { id } })
  if (!inv) return fail('فاکتور یافت نشد', 404)
  if (inv.archived) return fail('فاکتور بایگانی‌شده قابل حذف نیست؛ ابتدا بایگانی را باز کنید')

  await db.marginInvoice.delete({ where: { id } })
  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'margin.delete',
    actionLabel: 'حذف فاکتور سودسنج',
    category: 'profit',
    detail: `#${toFaDigits(String(inv.number))} — ${inv.supplierName ?? ''}`,
    entityId: id,
  })
  return ok({ id })
}
