import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, clampInt, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { todayJalaliDash, toFaDigits } from '@/lib/jalali'
import { canStockCount } from '../route'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const DASH_DATE = /^\d{4}-\d{2}-\d{2}$/

/** first barcode of a product (main code or barcodesJson) */
function barcodeOf(p: { code: string | null; barcodesJson: string }): string | null {
  if (p.code) return p.code
  const arr = safeJson<string[]>(p.barcodesJson, [])
  return arr.length ? arr[0] : null
}

/** GET /api/stock-counts/[id] → {count, items:[{...item, product:{name,unit,barcode}}]} */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canStockCount(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const { id } = await ctx.params
  const count = await db.stockCount.findUnique({ where: { id }, include: { items: true } })
  if (!count) return fail('انبارگردانی یافت نشد', 404)

  const productIds = count.items.map((i) => i.productId)
  const products = productIds.length
    ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, unit: true, code: true, barcodesJson: true } })
    : []
  const pMap = new Map(products.map((p) => [p.id, p]))

  return ok({
    count,
    items: count.items.map((i) => ({
      ...i,
      product: pMap.get(i.productId)
        ? {
            name: pMap.get(i.productId)!.name,
            unit: pMap.get(i.productId)!.unit,
            barcode: barcodeOf(pMap.get(i.productId)!),
          }
        : null,
    })),
  })
}

/**
 * POST /api/stock-counts/[id] — execute the count
 * {date, items:[{productId, countedQty}], note?}
 * Per item: systemQty = Product.stock at time; diff = counted − system.
 * status DONE (no mismatch) | MISMATCH (≥1). Updates Product.lastCountDate — NOT stock
 * (stock correction stays a manager decision via the products API).
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const { id } = await ctx.params
  const count = await db.stockCount.findUnique({ where: { id } })
  if (!count) return fail('انبارگردانی یافت نشد', 404)

  // managers/PM/SK or the assigned staff member may execute
  if (!canStockCount(user.role) && count.staffId !== user.id) {
    return fail('شما مجاز به اجرای این انبارگردانی نیستید', 403)
  }
  if (count.status !== 'SCHEDULED' && count.status !== 'IN_PROGRESS') {
    return fail('این انبارگردانی قبلاً اجرا شده است')
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const date = String((body as Record<string, unknown>).date ?? '').trim().replace(/\//g, '-') || todayJalaliDash()
  if (!DASH_DATE.test(date)) return fail('تاریخ اجرا را به شکل صحیح وارد کنید')

  const rawItems = Array.isArray((body as Record<string, unknown>).items) ? ((body as Record<string, unknown>).items as Array<Record<string, unknown>>) : []
  if (rawItems.length === 0) return fail('اقلام شمارش‌شده را وارد کنید')

  const seen = new Set<string>()
  const cleaned: { productId: string; countedQty: number }[] = []
  for (const it of rawItems) {
    const productId = String(it.productId ?? '').trim()
    const countedQty = clampInt(it.countedQty, 0, 1_000_000, 0)
    if (!productId || seen.has(productId)) continue
    seen.add(productId)
    cleaned.push({ productId, countedQty })
  }
  if (cleaned.length === 0) return fail('کالای معتبری برای شمارش ثبت نشده است')

  const products = await db.product.findMany({ where: { id: { in: cleaned.map((c) => c.productId) } } })
  const pMap = new Map(products.map((p) => [p.id, p]))
  const missing = cleaned.filter((c) => !pMap.has(c.productId))
  if (missing.length) return fail('برخی کالاها یافت نشدند — شمارش را ذخیره نکنید و دوباره اسکن کنید')

  const rows = cleaned.map((c) => {
    const p = pMap.get(c.productId)!
    const systemQty = p.stock
    const diff = c.countedQty - systemQty
    return {
      productId: p.id,
      name: p.name,
      barcode: barcodeOf(p),
      systemQty,
      countedQty: c.countedQty,
      diff,
    }
  })
  const mismatches = rows.filter((r) => r.diff !== 0).length
  const status = mismatches > 0 ? 'MISMATCH' : 'DONE'
  const note = String((body as Record<string, unknown>).note ?? '').trim() || null

  const updated = await db.$transaction(async (tx) => {
    await tx.stockCountItem.createMany({ data: rows.map((r) => ({ ...r, countId: id })) })
    // lastCountDate bookkeeping only — stock correction is a separate manager decision
    await Promise.all(
      rows.map((r) =>
        tx.product.update({ where: { id: r.productId }, data: { lastCountDate: date } }),
      ),
    )
    return tx.stockCount.update({
      where: { id },
      data: { date, status, itemsCounted: rows.length, mismatches, note: note ?? count.note },
    })
  })

  const label = count.blockLabel ?? count.zoneName ?? 'انبارگردانی'
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'stockcount.execute',
    actionLabel: 'انبارگردانی',
    category: 'stockcount',
    detail: `${label} — ${toFaDigits(String(rows.length))} قلم، ${toFaDigits(String(mismatches))} مغایرت (${toFaDigits(date)})`,
    entityId: id,
  })

  if (mismatches > 0) {
    await notify({
      role: 'GM',
      kind: 'stockcount',
      severity: 'warning',
      title: 'مغایرت در انبارگردانی',
      body: `${label}: از ${toFaDigits(String(rows.length))} قلم شمارش‌شده، ${toFaDigits(String(mismatches))} قلم با موجودی سامانه مغایرت دارد.`,
      go: '#/store/stockcount',
    })
  }

  return ok({ count: updated, mismatches, itemsCounted: rows.length })
}
