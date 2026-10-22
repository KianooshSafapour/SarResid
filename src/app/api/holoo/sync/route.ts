import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import {
  getHolooConfig,
  getProducts,
  getCustomers,
  getSideGroups,
  createProduct,
  createCustomer,
  createOrder,
  createInvoice,
  holooNum,
  assertHolooWrite,
  dateToGregorian,
  dateToHm,
  HolooConfig,
  HolooInvoiceDetail,
} from '@/lib/holoo'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 200
const MAX_ROWS = 5000 // سقف هر اجرا

const GENERIC_CUST_NAME = 'مشتری متفرقه فروشگاه'
const GENERIC_CUST_KEY = 'holoo:genericCustomerErp'

type SyncStats = Record<string, unknown>

async function logSync(kind: string, status: 'OK' | 'FAIL', stats: SyncStats, error?: string) {
  try {
    await db.holooSyncLog.create({
      data: { kind, status, statsJson: JSON.stringify(stats), error: error ?? null },
    })
  } catch {
    // لاگ هرگز نباید مسیر اصلی را بشکند
  }
}

function firstBarcode(barcodesJson: string | null): string {
  const arr = safeJson<string[]>(barcodesJson, [])
  return Array.isArray(arr) ? String(arr[0] ?? '') : ''
}

/** یافتن کالای محلی با کد/بارکد هلو — Product.Code ↔ code یا اولین بارکد barcodesJson */
async function findProductByCode(code: string) {
  if (!code) return null
  return db.product.findFirst({
    where: { OR: [{ code }, { barcodesJson: { contains: `"${code}"` } }] },
  })
}

// ============ PULL: کالاها ============

async function pullProducts(cfg: HolooConfig): Promise<SyncStats> {
  let pulled = 0
  let created = 0
  let updated = 0

  for (let page = 1; pulled < MAX_ROWS; page++) {
    const res = await getProducts(cfg, { page, size: PAGE_SIZE })
    const rows = res.product || []
    for (const row of rows) {
      const code = (row.Code || '').trim()
      const erp = (row.ErpCode || '').trim()
      if (!code && !erp) continue
      pulled++
      if (pulled > MAX_ROWS) break

      const name = (row.Name || '').trim() || 'کالای بدون نام'
      const lastBuy = holooNum(row.LastBuyPrice, 0) || holooNum(row.BuyPrice, 0)
      const unitsPerCarton = Math.round(holooNum(row.CountInKarton, 0))
      const mainGroup = (row.MainGroupName || '').trim() || null

      const existing = await findProductByCode(code)
      if (existing) {
        await db.product.update({
          where: { id: existing.id },
          data: {
            name,
            stock: Math.round(holooNum(row.Few, 0)),
            lastBuyPrice: lastBuy,
            unitsPerCarton: unitsPerCarton || existing.unitsPerCarton,
            mainGroup,
            holooErp: erp || existing.holooErp,
          },
        })
        updated++
      } else {
        await db.product.create({
          data: {
            name,
            code: code || null,
            unit: 'عدد',
            sellPrice: holooNum(row.SellPrice, 0),
            lastBuyPrice: lastBuy,
            stock: Math.round(holooNum(row.Few, 0)),
            unitsPerCarton,
            mainGroup,
            subGroup: (row.SideGroupName || '').trim() || null,
            holooErp: erp || null,
            imported: true, // کالای وارده از هلو
          },
        })
        created++
      }
    }
    if (rows.length < PAGE_SIZE) break
  }
  return { pulled, created, updated }
}

// ============ PULL: اشخاص (تأمین‌کنندگان) ============

async function pullSuppliers(cfg: HolooConfig): Promise<SyncStats> {
  let pulled = 0
  let created = 0
  let updated = 0

  for (let page = 1; pulled < MAX_ROWS; page++) {
    const res = await getCustomers(cfg, { seller: true, page, size: PAGE_SIZE })
    const rows = res.customer || []
    for (const row of rows) {
      const name = (row.Name || '').trim()
      const erp = (row.ErpCode || '').trim()
      if (!name && !erp) continue
      pulled++
      if (pulled > MAX_ROWS) break

      const tel = (row.Tel || '').trim() || (row.Mobile || '').trim() || null
      const existing = await db.supplier.findFirst({
        where: erp ? { OR: [{ holooErp: erp }, { name }] } : { name },
      })
      if (existing) {
        await db.supplier.update({
          where: { id: existing.id },
          data: {
            name,
            phone: tel ?? existing.phone,
            holooErp: erp || existing.holooErp,
          },
        })
        updated++
      } else {
        await db.supplier.create({
          data: { name, phone: tel, holooErp: erp || null, status: 'فعال' },
        })
        created++
      }
    }
    if (rows.length < PAGE_SIZE) break
  }
  return { pulled, created, updated }
}

// ============ PUSH: سفارش خرید ============

async function ensureDefaultSideGroup(cfg: HolooConfig): Promise<string> {
  const groups = await getSideGroups(cfg)
  const erp = (groups.sideGroup || [])[0]?.ErpCode
  if (!erp) throw new Error('هیچ گروه فرعی در هلو یافت نشد — ابتدا ساختار گروه‌ها را در هلو تعریف کنید')
  return erp
}

async function ensureProductInHoloo(
  cfg: HolooConfig,
  productId: string,
  defaultSideGroup: string
): Promise<{ erp: string; created: boolean }> {
  const p = await db.product.findUnique({ where: { id: productId } })
  if (!p) throw new Error('کالای سفارش در سامانه یافت نشد')
  if (p.holooErp) return { erp: p.holooErp, created: false }
  const res = await createProduct(cfg, {
    name: p.name,
    code: p.code || firstBarcode(p.barcodesJson) || undefined,
    buyprice: p.lastBuyPrice || 0,
    sellprice: p.sellPrice || 0,
    countinkarton: p.unitsPerCarton || 0,
    sidegrouperpcode: defaultSideGroup,
  })
  const erp = assertHolooWrite(res, 'کالا').ErpCode || ''
  await db.product.update({ where: { id: p.id }, data: { holooErp: erp } })
  return { erp, created: true }
}

async function pushOrder(cfg: HolooConfig, orderId: string): Promise<SyncStats> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
  if (!order) throw new Error('سفارش یافت نشد')
  if (order.holooErp) return { orderCode: order.code, alreadyPushed: true, holooErp: order.holooErp }

  // ۱) تأمین‌کننده به عنوان طرف حساب هلو (فروشنده)
  let customerErp: string | undefined
  let supplierCreated = false
  if (order.supplierId) {
    const supplier = await db.supplier.findUnique({ where: { id: order.supplierId } })
    if (supplier) {
      if (supplier.holooErp) {
        customerErp = supplier.holooErp
      } else {
        const res = await createCustomer(cfg, {
          name: supplier.name,
          ispurchaser: false,
          isseller: true,
          custtype: 0,
          tel: supplier.phone || undefined,
        })
        customerErp = assertHolooWrite(res, 'طرف حساب تأمین‌کننده').ErpCode || ''
        await db.supplier.update({ where: { id: supplier.id }, data: { holooErp: customerErp } })
        supplierCreated = true
      }
    }
  }

  // ۲) کالاها باید در هلو موجود باشند
  const defaultSideGroup = await ensureDefaultSideGroup(cfg)
  const details: HolooInvoiceDetail[] = []
  let productsCreated = 0
  let skipped = 0
  for (const item of order.items) {
    let erp: string | null = null
    if (item.productId) {
      try {
        const r = await ensureProductInHoloo(cfg, item.productId, defaultSideGroup)
        erp = r.erp
        if (r.created) productsCreated++
      } catch {
        erp = null
      }
    }
    if (!erp && item.barcode) {
      const local = await findProductByCode(item.barcode)
      if (local) {
        try {
          const r = await ensureProductInHoloo(cfg, local.id, defaultSideGroup)
          erp = r.erp
          if (r.created) productsCreated++
        } catch {
          erp = null
        }
      }
    }
    if (!erp) {
      skipped++
      continue
    }
    details.push({
      id: item.id,
      ProductErpCode: erp,
      few: item.qty || 1,
      karton: item.cartonQty || 0,
      price: item.unitBuyPrice || 0,
    })
  }
  if (!details.length) throw new Error('هیچ قلم قابل ارسالی برای این سفارش یافت نشد — کالاها هنوز به هلو متصل نیستند')

  // ۳) ثبت سفارش خرید (type=3)
  const res = await createOrder(cfg, {
    type: 3,
    customererpcode: customerErp,
    date: dateToGregorian(order.createdAt),
    time: dateToHm(order.createdAt),
    details,
  })
  const succ = assertHolooWrite(res, 'سفارش خرید')
  const holooErp = succ.ErpCode || ''
  await db.order.update({ where: { id: order.id }, data: { holooErp } })

  return {
    orderCode: order.code,
    holooErp,
    invoiceNo: succ.ReturnParam1 || '',
    items: details.length,
    supplierCreated,
    productsCreated,
    skipped,
  }
}

// ============ PUSH: مرجوعی (فاکتور برگشت از فروش) ============

/** یافتن/ایجاد طرف حساب هلو بر اساس نام (اسکن صفحه‌به‌صفحه + ایجاد) */
async function ensureHolooCustomerByName(cfg: HolooConfig, name: string): Promise<string> {
  const norm = name.trim()
  for (let page = 1; page <= 5; page++) {
    const res = await getCustomers(cfg, { page, size: 200 })
    const rows = res.customer || []
    if (!rows.length) break
    const hit = rows.find((c) => (c.Name || '').trim() === norm)
    if (hit?.ErpCode) return hit.ErpCode
    if (rows.length < 200) break
  }
  const res = await createCustomer(cfg, { name: norm, ispurchaser: true, isseller: false, custtype: 0 })
  return assertHolooWrite(res, 'طرف حساب').ErpCode || ''
}

async function ensureGenericCustomer(cfg: HolooConfig): Promise<string> {
  const cached = await db.setting.findUnique({ where: { key: GENERIC_CUST_KEY } })
  if (cached?.value) return cached.value
  const erp = await ensureHolooCustomerByName(cfg, GENERIC_CUST_NAME)
  await db.setting.upsert({ where: { key: GENERIC_CUST_KEY }, create: { key: GENERIC_CUST_KEY, value: erp }, update: { value: erp } })
  return erp
}

async function pushReturn(cfg: HolooConfig, returnId: string): Promise<SyncStats> {
  const ret = await db.returnRequest.findUnique({ where: { id: returnId }, include: { items: true } })
  if (!ret) throw new Error('مرجوعی یافت نشد')

  // طرف حساب: نام مشتری اگر در CRM ثبت شده، وگرنه مشتری متفرقه
  let accountName = GENERIC_CUST_NAME
  if (ret.customerPhone) {
    const crm = await db.customer.findUnique({ where: { phone: ret.customerPhone } })
    if (crm?.name) accountName = crm.name
  } else if (ret.customerName?.trim()) {
    accountName = ret.customerName.trim()
  }
  const customerErp =
    accountName === GENERIC_CUST_NAME ? await ensureGenericCustomer(cfg) : await ensureHolooCustomerByName(cfg, accountName)

  // اقلام → کالای هلو
  const defaultSideGroup = await ensureDefaultSideGroup(cfg)
  const details: HolooInvoiceDetail[] = []
  let productsCreated = 0
  let skipped = 0
  for (const item of ret.items) {
    const local =
      (item.barcode ? await findProductByCode(item.barcode) : null) ??
      (item.name ? await db.product.findFirst({ where: { name: item.name } }) : null)
    let erp: string | null = local?.holooErp ?? null
    if (!erp && local) {
      try {
        const r = await ensureProductInHoloo(cfg, local.id, defaultSideGroup)
        erp = r.erp
        if (r.created) productsCreated++
      } catch {
        erp = null
      }
    }
    if (!erp) {
      skipped++
      continue
    }
    details.push({ id: item.id, ProductErpCode: erp, few: item.qty || 1, price: item.unitPrice || 0 })
  }
  if (!details.length) throw new Error('هیچ قلم قابل ارسالی برای این مرجوعی یافت نشد — کالاها هنوز به هلو متصل نیستند')

  const total = details.reduce((s, d) => s + d.few * d.price, 0)
  const res = await createInvoice(cfg, {
    type: 2, // برگشت از فروش
    customererpcode: customerErp,
    date: dateToGregorian(ret.createdAt),
    time: dateToHm(ret.createdAt),
    cash: Math.round(total), // تسویه = جمع فاکتور (خطای ۳۶ هلو)
    details,
  })
  const succ = assertHolooWrite(res, 'فاکتور برگشت از فروش')

  return {
    returnCode: ret.code,
    accountName,
    holooErp: succ.ErpCode || '',
    invoiceNo: succ.ReturnParam1 || '',
    sanadNo: succ.ReturnParam2 || '',
    items: details.length,
    productsCreated,
    skipped,
    total,
  }
}

// ============ Route ============

/**
 * POST /api/holoo/sync (OWNER/GM/ADMIN)
 * {what:'products'|'suppliers'|'customers', mode:'pull'} — کشیدن از هلو
 * {what:'order', mode:'push', orderId} — ارسال سفارش خرید به هلو
 * {what:'orders', mode:'push'} — ارسال ۱۰ سفارش اخیر بدون شناسه هلو
 * {what:'return', mode:'push', returnId} — ارسال مرجوعی به هلو
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN'].includes(user.role)) {
    return fail('سینک هلو فقط برای مدیران ارشد مجاز است', 403)
  }

  const cfg = await getHolooConfig()
  if (!cfg.enabled) {
    return fail('اتصال هلو غیرفعال است — ابتدا از تنظیمات فعال کنید')
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')
  const b = body as Record<string, unknown>
  const what = String(b.what ?? '').trim()
  const mode = String(b.mode ?? 'pull').trim()

  const kind = what === 'order' ? 'PUSH_ORDER' : what === 'orders' ? 'PUSH_ORDERS_BULK' : what === 'return' ? 'PUSH_RETURN' : what === 'suppliers' || what === 'customers' ? 'PULL_SUPPLIERS' : 'PULL_PRODUCTS'

  try {
    let stats: SyncStats
    if (mode === 'pull') {
      if (what === 'products') stats = await pullProducts(cfg)
      else if (what === 'suppliers' || what === 'customers') stats = await pullSuppliers(cfg)
      else return fail('نوع سینک نامعتبر است — products یا suppliers')
    } else if (mode === 'push') {
      if (what === 'order') {
        const orderId = String(b.orderId ?? '').trim()
        if (!orderId) return fail('شناسه سفارش (orderId) الزامی است')
        stats = await pushOrder(cfg, orderId)
      } else if (what === 'orders') {
        const orders = await db.order.findMany({
          where: { holooErp: null },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
        let pushed = 0
        let failed = 0
        const results: { code: string; ok: boolean; error?: string }[] = []
        for (const o of orders) {
          try {
            await pushOrder(cfg, o.id)
            pushed++
            results.push({ code: o.code, ok: true })
          } catch (e) {
            failed++
            results.push({ code: o.code, ok: false, error: e instanceof Error ? e.message : 'خطای نامشخص' })
          }
        }
        stats = { pushed, failed, results }
      } else if (what === 'return') {
        const returnId = String(b.returnId ?? '').trim()
        if (!returnId) return fail('شناسه مرجوعی (returnId) الزامی است')
        stats = await pushReturn(cfg, returnId)
      } else {
        return fail('نوع ارسال نامعتبر است — order یا orders یا return')
      }
    } else {
      return fail('حالت سینک نامعتبر است — pull یا push')
    }

    await logSync(kind, 'OK', stats)
    await logActivity({
      userId: user.id,
      userName: user.fullName,
      action: `holoo.sync.${what}`,
      actionLabel: 'سینک هلو',
      category: 'settings',
      detail: `${kind} موفق — ${JSON.stringify(stats).slice(0, 180)}`,
    })
    return ok({ kind, ...stats })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'سینک هلو ناموفق بود'
    await logSync(kind, 'FAIL', {}, msg)
    await logActivity({
      userId: user.id,
      userName: user.fullName,
      action: `holoo.sync.${what}`,
      actionLabel: 'سینک هلو',
      category: 'settings',
      detail: `${kind} ناموفق — ${msg.slice(0, 180)}`,
    })
    return fail(msg, 502)
  }
}
