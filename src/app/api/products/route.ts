import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson, clampInt } from '@/lib/api'
import { getSessionUser, type SessionUser } from '@/lib/auth'
import { toEnDigits } from '@/lib/jalali'

/** Roles allowed to mutate products (mirrors frontend isManager gating + ACC/PM) */
function canMutateProducts(u: SessionUser | null): boolean {
  return !!u && (['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(u.role) || u.role === 'ACC' || u.role === 'PM')
}

/** R5-F: واحدهای مجاز — همان مجموعهٔ R4-8 در [id]/route.ts */
const ALLOWED_UNITS = ['عدد', 'کیلوگرم', 'گرم', 'بسته', 'دستی']

/** R5-F: به‌سازی رقم‌ها (فارسی/عربی → لاتین) + trim — برای کد/بارکد/اعداد ورودی فرم */
function normDigits(v: unknown): string {
  return toEnDigits(String(v ?? '')).trim()
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Math.round(Number(toEnDigits(String(v))))
  return Number.isFinite(n) ? n : null
}

function toPrice(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(toEnDigits(String(v)).replace(/[,\s٬،]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** R5-F: بررسی تکراری‌بودن بارکد — تطابق دقیق با کد یا بانک بارکد کالای دیگر (خطای فارسی با نام کالا) */
async function barcodeOwner(barcode: string, excludeId?: string): Promise<{ id: string; name: string } | null> {
  if (!barcode) return null
  const cands = await db.product.findMany({
    where: { OR: [{ code: barcode }, { barcodesJson: { contains: barcode } }] },
    select: { id: true, name: true, code: true, barcodesJson: true },
  })
  for (const c of cands) {
    if (excludeId && c.id === excludeId) continue
    if (c.code === barcode) return { id: c.id, name: c.name }
    const bank = safeJson<string[]>(c.barcodesJson, [])
    if (bank.includes(barcode)) return { id: c.id, name: c.name }
  }
  return null
}

/** R5-F: هشدار غیرمسدودکنندهٔ هم‌نامی کالا */
async function nameWarnings(name: string, excludeId?: string): Promise<string[]> {
  const dup = await db.product.findFirst({ where: { name }, select: { id: true, name: true } })
  if (dup && dup.id !== excludeId) {
    return [`کالایی با همین نام موجود است («${dup.name}») — اگر منظورتان همین کالاست، به‌جای ثبت جدید، همان را ویرایش کنید`]
  }
  return []
}

/** R5-P4: بخش‌های کالادار نقشهٔ فروشگاه (برچسب بلوک‌ها) — برای فیلد «بخش» فرم کالا */
const PRODUCT_BLOCK_KINDS = ['GONDOLA', 'SHELF', 'FREEZER_ICECREAM', 'BAKERY', 'CUSTOM']
function isProductBlock(kind: string): boolean {
  return PRODUCT_BLOCK_KINDS.includes(kind) || kind.startsWith('FRIDGE_')
}
async function productSections(): Promise<{ label: string; zone: string | null }[]> {
  const plans = await db.floorplan.findMany({ include: { blocks: true } })
  const out: { label: string; zone: string | null }[] = []
  const seen = new Set<string>()
  for (const plan of plans) {
    for (const b of plan.blocks) {
      if (!b.label || !isProductBlock(b.kind) || seen.has(b.label)) continue
      seen.add(b.label)
      out.push({ label: b.label, zone: b.zoneName || null })
    }
  }
  return out
}

/** R5-P4: اعتبارسنجی بخش — باید برچسب یک بلوک کالادار نقشه باشد */
async function validSection(label: string): Promise<boolean> {
  const sections = await productSections()
  return sections.some((s) => s.label === label)
}

/** R5-P4: ثبت/جابه‌جایی تأمین‌کنندهٔ اصلی کالا (SupplierProduct با isPrimary) */
async function setPrimarySupplier(productId: string, supplierId: string | null, unitPrice: number): Promise<void> {
  await db.supplierProduct.updateMany({ where: { productId, isPrimary: true }, data: { isPrimary: false } })
  if (!supplierId) return
  await db.supplierProduct.upsert({
    where: { supplierId_productId: { supplierId, productId } },
    create: { supplierId, productId, unitPrice, isPrimary: true },
    update: { isPrimary: true, ...(unitPrice > 0 ? { unitPrice } : {}) },
  })
}

/** R5-P4: نام تأمین‌کنندهٔ اصلی کالا (برای پاسخ API — SupplierProduct رابطهٔ Prisma ندارد، دو پرس‌وجو) */
async function primarySupplierOf(productId: string): Promise<{ id: string; name: string } | null> {
  const link = await db.supplierProduct.findFirst({
    where: { productId, isPrimary: true },
    select: { supplierId: true },
  })
  if (!link) return null
  const sup = await db.supplier.findUnique({ where: { id: link.supplierId }, select: { id: true, name: true } })
  return sup ?? null
}

/** barcodeCount — live: count of barcode rows; ours: barcodesJson length, falling back to the main code */
function barcodeCountOf(barcodesJson: string, code: string | null): number {
  const arr = safeJson<string[]>(barcodesJson, [])
  if (arr.length > 0) return arr.length
  return code ? 1 : 0
}

/** lowStock condition used both for the filter and meta — mirrors live (stock ≤ 5, or ≤ reorderLevel) */
function lowStockWhere() {
  return {
    OR: [
      { stock: { lte: 5 } },
      // Prisma cannot compare two columns; reorderLevel is null for the whole seeded catalog,
      // so products with a manual reorderLevel are treated as low-stock (documented in worklog).
      { reorderLevel: { not: null } },
    ],
  }
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const sp = req.nextUrl.searchParams
  const meta = sp.get('meta')
  const q = (sp.get('q') ?? '').trim()
  const page = Math.max(1, clampInt(sp.get('page'), 1, 100000, 1))
  const pageSize = Math.max(1, clampInt(sp.get('pageSize'), 1, 100, 24)) // live caps at 100
  const mainGroup = sp.get('mainGroup') ?? '' // products view sends it as `group`
  const group = sp.get('group') ?? ''
  const subGroup = sp.get('subGroup') ?? '' // products view sends it as `category`
  const category = sp.get('category') ?? ''
  const status = sp.get('status') ?? ''
  const unit = (sp.get('unit') ?? '').trim() // R4-8: فیلتر واحد («عدد/کیلوگرم/دستی…»)
  const lowStock = sp.get('lowStock') === '1'
  const sort = (sp.get('sort') ?? '').trim()

  // ---------- meta branch (GET /api/products?meta=1) ----------
  if (meta === '1') {
    const all = await db.product.findMany({
      select: { mainGroup: true, subGroup: true, stock: true, reorderLevel: true },
    })
    const mg: Record<string, number> = {}
    const sg: Record<string, number> = {}
    let low = 0
    for (const p of all) {
      if (p.mainGroup) mg[p.mainGroup] = (mg[p.mainGroup] ?? 0) + 1
      if (p.subGroup) sg[p.subGroup] = (sg[p.subGroup] ?? 0) + 1
      if (p.stock <= 5 || (p.reorderLevel !== null && p.stock <= p.reorderLevel)) low++
    }
    const toList = (m: Record<string, number>) =>
      Object.entries(m)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name, count]) => ({ name, count }))
    const sections = await productSections() // R5-P4: بخش‌های نقشه برای فرم ثبت/ویرایش کالا
    return ok({
      total: all.length,
      lowStock: low,
      mainGroups: toList(mg),
      subGroups: toList(sg),
      sections,
    })
  }

  // ---------- list branch ----------
  const where: Record<string, unknown> = {}
  const and: Record<string, unknown>[] = []
  if (q) {
    and.push({
      OR: [
        { name: { contains: q } },
        { code: { contains: q } },
        { barcodesJson: { contains: q } },
      ],
    })
  }
  const mg = mainGroup || group
  if (mg) and.push({ mainGroup: mg })
  const sg = subGroup || category
  if (sg) and.push({ subGroup: sg })
  if (status) and.push({ status })
  if (unit) and.push({ unit }) // R4-8
  if (lowStock) and.push(lowStockWhere())
  if (and.length) where.AND = and

  const total = await db.product.count({ where })
  const order: Record<string, 'asc' | 'desc'>[] =
    sort === 'stock'
      ? [{ stock: 'asc' }, { name: 'asc' }]
      : lowStock && !sort
        ? [{ stock: 'asc' }, { name: 'asc' }] // low-stock view: least stock first
        : [{ name: 'asc' }, { id: 'asc' }] // default: name (matches live page 1)

  const rows = await db.product.findMany({
    where,
    orderBy: order,
    skip: (page - 1) * pageSize,
    take: pageSize,
  })

  const items = rows.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    unit: p.unit,
    lastCountDate: p.lastCountDate, // R4-8: آخرین انبارگردانی در جدول
    monthlySold: p.monthlySold, // R4-8: فروش ماه (برای برچسب جدول)
    category: p.category,
    mainGroup: p.mainGroup,
    subGroup: p.subGroup,
    sellPrice: p.sellPrice,
    sellPrice2: p.sellPrice2,
    lastBuyPrice: p.lastBuyPrice,
    stock: p.stock,
    reorderLevel: p.reorderLevel,
    shelfLifeDays: p.shelfLifeDays,
    status: p.status,
    active: p.active,
    sectionLabel: p.sectionLabel, // R5-P4
    barcodeCount: barcodeCountOf(p.barcodesJson, p.code),
  }))

  const pages = Math.max(1, Math.ceil(total / pageSize))
  return ok({ items, total, page, pageSize, pages })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canMutateProducts(user)) return fail('برای ثبت کالا دسترسی مدیران لازم است', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  /* ── اعتبارسنجی — پیام‌های فارسی (R5-F) ── */
  const name = String(body.name ?? '').trim()
  if (!name) return fail('نام کالا الزامی است')

  const code = normDigits(body.code) || null
  const barcode = normDigits(body.barcode) || null

  if (barcode && !/^\d{4,20}$/.test(barcode)) {
    return fail('بارکد باید فقط رقم باشد (۴ تا ۲۰ رقم)')
  }
  if (code) {
    const dup = await db.product.findFirst({ where: { code }, select: { id: true, name: true } })
    if (dup) return fail(`کد کالا تکراری است — کالای «${dup.name}» همین کد را دارد`)
  }
  if (barcode) {
    const owner = await barcodeOwner(barcode)
    if (owner) return fail(`بارکد تکراری است — کالای «${owner.name}» همین بارکد را دارد`)
  }

  const unit = body.unit == null || body.unit === '' ? 'عدد' : String(body.unit).trim()
  if (!ALLOWED_UNITS.includes(unit)) {
    return fail(`واحد کالا باید یکی از این‌ها باشد: ${ALLOWED_UNITS.join('، ')}`)
  }

  const sellPrice = toPrice(body.sellPrice) ?? 0
  if (sellPrice < 0) return fail('قیمت فروش نمی‌تواند منفی باشد')
  const lastBuyPrice = toPrice(body.lastBuyPrice) ?? 0
  if (lastBuyPrice < 0) return fail('قیمت آخرین خرید نمی‌تواند منفی باشد')
  const stock = toInt(body.stock) ?? 0
  if (stock < 0) return fail('موجودی نمی‌تواند منفی باشد')
  const reorderLevel = toInt(body.reorderLevel)
  if (reorderLevel != null && reorderLevel < 0) return fail('حد سفارش مجدد نمی‌تواند منفی باشد')
  const defaultOrderQty = toInt(body.defaultOrderQty)
  if (defaultOrderQty != null && defaultOrderQty < 0) return fail('تعداد پیش‌فرض سفارش نمی‌تواند منفی باشد')
  const defaultCartonQty = toInt(body.defaultCartonQty)
  if (defaultCartonQty != null && defaultCartonQty < 0) return fail('تعداد پیش‌فرض کارتن نمی‌تواند منفی باشد')

  const active = body.active === false ? false : true

  /* R5-P4: بخش فروشگاه (اختیاری) — باید برچسب بلوک کالادار نقشه باشد */
  const sectionLabel = body.sectionLabel == null || String(body.sectionLabel).trim() === '' ? null : String(body.sectionLabel).trim()
  if (sectionLabel && !(await validSection(sectionLabel))) {
    return fail(`بخش «${sectionLabel}» در نقشه فروشگاه وجود ندارد — بخش را از فهرست انتخاب کنید`)
  }

  /* R5-P4: تأمین‌کنندهٔ اصلی (اختیاری) */
  const supplierId = body.supplierId == null || String(body.supplierId).trim() === '' ? null : String(body.supplierId).trim()
  if (supplierId) {
    const sup = await db.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true } })
    if (!sup) return fail('تأمین‌کنندهٔ انتخاب‌شده یافت نشد')
  }

  /* بانک بارکد: کد (بارکد اصلی) + بارکد اضافی — بدون تکرار (R5-F) */
  const bank: string[] = []
  if (code) bank.push(code)
  if (barcode && !bank.includes(barcode)) bank.push(barcode)

  const created = await db.product.create({
    data: {
      name,
      code,
      unit,
      category: body.category ? String(body.category) : null,
      mainGroup: body.mainGroup ? String(body.mainGroup).trim() || null : null,
      subGroup: body.subGroup ? String(body.subGroup).trim() || null : null,
      sectionLabel,
      barcodesJson: JSON.stringify(bank),
      sellPrice,
      sellPrice2: sellPrice,
      lastBuyPrice,
      stock,
      reorderLevel,
      defaultOrderQty: defaultOrderQty ?? 6,
      defaultCartonQty: defaultCartonQty ?? 1,
      shelfLifeDays: toInt(body.shelfLifeDays),
      status: active ? 'فعال' : 'غیر فعال',
      active,
    },
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'product_create',
    actionLabel: 'ثبت کالا',
    category: 'products',
    detail: `ثبت کالای «${name}»${code ? ` با کد ${code}` : ''}${barcode ? ` و بارکد ${barcode}` : ''}`,
    entityId: created.id,
  })

  /* R5-P4: تأمین‌کنندهٔ اصلی (اختیاری) — بعد از ساخت کالا */
  if (supplierId) await setPrimarySupplier(created.id, supplierId, lastBuyPrice)

  /* R5-F: هشدار هم‌نامی — غیرمسدودکننده؛ در پاسخ برمی‌گردد تا فرم با toast.warning نشان دهد
     (خودِ کالای تازه‌ساخته را مستثنا می‌کنیم تا هشدارِ خودِ خودش نباشد) */
  const warnings = await nameWarnings(name, created.id)
  const supplier = supplierId ? await primarySupplierOf(created.id) : null

  return ok({
    id: created.id,
    name: created.name,
    code: created.code,
    unit: created.unit,
    category: created.category,
    mainGroup: created.mainGroup,
    subGroup: created.subGroup,
    sectionLabel: created.sectionLabel,
    supplierId: supplier?.id ?? null,
    supplierName: supplier?.name ?? null,
    sellPrice: created.sellPrice,
    sellPrice2: created.sellPrice2,
    lastBuyPrice: created.lastBuyPrice,
    stock: created.stock,
    reorderLevel: created.reorderLevel,
    defaultOrderQty: created.defaultOrderQty,
    defaultCartonQty: created.defaultCartonQty,
    shelfLifeDays: created.shelfLifeDays,
    status: created.status,
    active: created.active,
    imageUrl: null,
    warnings,
    barcodes: bank.map((b, i) => ({
      id: `${created.id}:${i}`,
      code: b,
      productId: created.id,
      isPrimary: i === 0,
      createdAt: created.createdAt,
    })),
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  })
}
