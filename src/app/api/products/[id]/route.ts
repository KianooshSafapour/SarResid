import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser, type SessionUser } from '@/lib/auth'
import { toEnDigits } from '@/lib/jalali'

function canMutateProducts(u: SessionUser | null): boolean {
  return !!u && (['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(u.role) || u.role === 'ACC' || u.role === 'PM')
}

/** R5-F: به‌سازی رقم‌ها (فارسی/عربی → لاتین) + trim */
function normDigits(v: unknown): string {
  return toEnDigits(String(v ?? '')).trim()
}

/** R5-F: عدد صحیح منفی‌گرفته‌نشدنی — null = ارائه نشده */
function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Math.round(Number(toEnDigits(String(v))))
  return Number.isFinite(n) ? n : null
}

/** R5-F: هشدار هم‌نامی غیرمسدودکننده (برگردانده می‌شود، نه خطا) */
async function nameWarnings(name: string, excludeId: string): Promise<string[]> {
  const dup = await db.product.findFirst({ where: { name }, select: { id: true, name: true } })
  if (dup && dup.id !== excludeId) {
    return [`کالایی با همین نام موجود است («${dup.name}») — اگر دو کالای هم‌نام واقعی دارید مشکلی نیست`]
  }
  return []
}

/** R4-8: واحدهای مجاز — پژوهش research/product-units-research.md §۳ (هم‌ارز ALLOWED_UNITS در scripts/apply-default-units.ts) */
const ALLOWED_UNITS = ['عدد', 'کیلوگرم', 'گرم', 'بسته', 'دستی']

/** R5-P4: بخش‌های کالادار نقشهٔ فروشگاه — همان منطق /api/products */
const PRODUCT_BLOCK_KINDS = ['GONDOLA', 'SHELF', 'FREEZER_ICECREAM', 'BAKERY', 'CUSTOM']
function isProductBlock(kind: string): boolean {
  return PRODUCT_BLOCK_KINDS.includes(kind) || kind.startsWith('FRIDGE_')
}
async function validSection(label: string): Promise<boolean> {
  const plans = await db.floorplan.findMany({ include: { blocks: true } })
  for (const plan of plans) {
    for (const b of plan.blocks) {
      if (b.label === label && isProductBlock(b.kind)) return true
    }
  }
  return false
}

/** Product extras are kept in ProductImage rows keyed by productId (schema has no imageUrl column). */
async function imageUrlOf(productId: string): Promise<string | null> {
  const row = await db.productImage.findUnique({ where: { key: productId } })
  return row?.url ?? null
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** barcodes array like the live barcode table: [{id, code, productId, isPrimary, createdAt}] */
function barcodesOf(productId: string, barcodesJson: string, code: string | null, createdAt: Date) {
  const arr = safeJson<string[]>(barcodesJson, [])
  const list = arr.length > 0 ? arr : code ? [code] : []
  const primaryIdx = list.findIndex((b) => b === code)
  const primary = primaryIdx >= 0 ? primaryIdx : 0
  return list.map((b, i) => ({
    id: `${productId}:${i}`,
    code: b,
    productId,
    isPrimary: i === primary,
    createdAt,
  }))
}

/** printed-price stats from order items (live: lastPrintedPrice / avgPrintedPrice / printedPriceCount) */
async function printedStatsOf(productId: string) {
  const items = await db.orderItem.findMany({
    where: { productId },
    select: { printedPrice: true, order: { select: { createdAt: true } } },
  })
  const withPrinted = items.filter((i) => i.printedPrice !== null && i.printedPrice !== 0)
  if (withPrinted.length === 0) {
    return { lastPrintedPrice: null as number | null, avgPrintedPrice: null as number | null, printedPriceCount: 0 }
  }
  const sorted = [...withPrinted].sort((a, b) => b.order.createdAt.getTime() - a.order.createdAt.getTime())
  const prices = withPrinted.map((i) => i.printedPrice as number)
  const sum = prices.reduce((s, v) => s + v, 0)
  return {
    lastPrintedPrice: sorted[0].printedPrice as number,
    avgPrintedPrice: Math.round(sum / prices.length),
    printedPriceCount: prices.length,
  }
}

async function detail(id: string) {
  const p = await db.product.findUnique({ where: { id } })
  if (!p) return null
  /* R5-P4: تأمین‌کنندهٔ اصلی — SupplierProduct رابطهٔ Prisma ندارد؛ دو پرس‌وجوی ساده */
  const primaryLink = await db.supplierProduct.findFirst({
    where: { productId: p.id, isPrimary: true },
    select: { supplierId: true },
  })
  const primarySup = primaryLink
    ? await db.supplier.findUnique({ where: { id: primaryLink.supplierId }, select: { id: true, name: true } })
    : null
  const [imageUrl, printed] = await Promise.all([imageUrlOf(p.id), printedStatsOf(p.id)])
  return {
    id: p.id,
    name: p.name,
    searchName: p.name,
    code: p.code,
    unit: p.unit,
    manualUnit: p.manualUnit, // R4-8: قفل واحد دستی مدیر
    category: p.category,
    mainGroup: p.mainGroup,
    subGroup: p.subGroup,
    sellPrice: p.sellPrice,
    sellPrice2: p.sellPrice2,
    lastBuyPrice: p.lastBuyPrice,
    stock: p.stock,
    reorderLevel: p.reorderLevel,
    lowStockThreshold: p.lowStockThreshold,
    leadTimeDays: p.leadTimeDays,
    monthlySold: p.monthlySold,
    lastCountDate: p.lastCountDate ?? null,
    defaultOrderQty: p.defaultOrderQty,
    defaultCartonQty: p.defaultCartonQty,
    unitsPerCarton: p.unitsPerCarton,
    imported: p.imported,
    shelfLifeDays: p.shelfLifeDays,
    lastPrintedPrice: printed.lastPrintedPrice,
    avgPrintedPrice: printed.avgPrintedPrice,
    printedPriceCount: printed.printedPriceCount,
    status: p.status,
    holooErp: p.holooErp ?? null, // R13: پیوند هلو (برای انتشار قیمت و پایش اتصال)
    sectionLabel: p.sectionLabel, // R5-P4
    supplierId: primaryLink?.supplierId ?? null, // R5-P4: تأمین‌کنندهٔ اصلی
    supplierName: primarySup?.name ?? null,
    imageUrl,
    active: p.active,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    barcodes: barcodesOf(p.id, p.barcodesJson, p.code, p.createdAt),
  }
}

/** image-cache miss counter shared by product image flows (read by /api/img/stats) */
async function bumpImageMisses(n: number) {
  const row = await db.setting.findUnique({ where: { key: 'img_stats' } })
  let cur: { misses?: number } = {}
  try {
    cur = row ? JSON.parse(row.value) : {}
  } catch {
    cur = {}
  }
  const value = JSON.stringify({ ...cur, misses: (cur.misses ?? 0) + n })
  if (row) await db.setting.update({ where: { key: 'img_stats' }, data: { value } })
  else await db.setting.create({ data: { key: 'img_stats', value } })
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await ctx.params
  const d = await detail(id)
  if (!d) return fail('کالا یافت نشد', 404)
  return ok(d)
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const { id } = await ctx.params
  const p = await db.product.findUnique({ where: { id } })
  if (!p) return fail('کالا یافت نشد', 404)

  const keys = Object.keys(body)
  const imageUrlOnly = keys.length === 1 && keys[0] === 'imageUrl'
  if (!imageUrlOnly && !canMutateProducts(user)) {
    return fail('برای ویرایش کالا دسترسی مدیران لازم است', 403)
  }

  const data: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return fail('نام کالا الزامی است')
    data.name = name
  }
  if (body.code !== undefined) {
    const code = body.code === null || body.code === '' ? null : normDigits(body.code) || null
    if (code && code !== p.code) {
      const dup = await db.product.findFirst({ where: { code }, select: { id: true, name: true } })
      if (dup && dup.id !== p.id) return fail(`کد کالا تکراری است — کالای «${dup.name}» همین کد را دارد`)
    }
    data.code = code
  }

  /* R5-F: بارکد — تنها رقم‌ها؛ یکتا در کل فروشگاه؛ جایگزینی جراحی‌‌شده در بانک بارکد
     (کد اصلی حفظ می‌شود؛ سایر بارکدهای بانک دست‌نخورده می‌مانند) */
  if (body.barcode !== undefined) {
    const barcode = body.barcode === null || body.barcode === '' ? null : normDigits(body.barcode) || null
    if (barcode && !/^\d{4,20}$/.test(barcode)) {
      return fail('بارکد باید فقط رقم باشد (۴ تا ۲۰ رقم)')
    }
    if (barcode) {
      const cands = await db.product.findMany({
        where: { OR: [{ code: barcode }, { barcodesJson: { contains: barcode } }] },
        select: { id: true, name: true, code: true, barcodesJson: true },
      })
      for (const c of cands) {
        if (c.id === p.id) continue
        if (c.code === barcode) return fail(`بارکد تکراری است — کالای «${c.name}» همین بارکد را دارد`)
        if (safeJson<string[]>(c.barcodesJson, []).includes(barcode)) {
          return fail(`بارکد تکراری است — کالای «${c.name}» همین بارکد را دارد`)
        }
      }
    }
    const oldBank = safeJson<string[]>(p.barcodesJson, [])
    const oldPrimary = oldBank.find((b) => b && b !== p.code) ?? null // نخستین بارکد غیر از کد = همان فیلد «بارکد» فرم
    const newBank: string[] = []
    if (p.code && p.code !== barcode) newBank.push(p.code)
    if (barcode) newBank.push(barcode)
    for (const b of oldBank) {
      if (b && !newBank.includes(b) && b !== oldPrimary && b !== p.code) newBank.push(b)
    }
    data.barcodesJson = JSON.stringify(newBank)
  }
  // R4-8: واحد کالا — فقط از مجموعهٔ مجاز؛ تغییر واحد از UI/API ⇒ manualUnit=true
  // (manualUnit:false صریح پذیرفته می‌شود تا بازیابی/بازگردانی مدیر ممکن باشد)
  if (body.unit !== undefined) {
    const unit = String(body.unit).trim()
    if (!ALLOWED_UNITS.includes(unit)) {
      return fail(`واحد کالا باید یکی از این‌ها باشد: ${ALLOWED_UNITS.join('، ')}`)
    }
    data.unit = unit
    if (body.manualUnit !== undefined) data.manualUnit = body.manualUnit === true
    else data.manualUnit = true // تغییر واحد = انتخاب دستی
  } else if (body.manualUnit !== undefined) {
    data.manualUnit = body.manualUnit === true
  }
  if (body.category !== undefined) data.category = body.category === null ? null : String(body.category)
  if (body.mainGroup !== undefined) data.mainGroup = body.mainGroup === null ? null : String(body.mainGroup).trim() || null
  if (body.subGroup !== undefined) data.subGroup = body.subGroup === null ? null : String(body.subGroup).trim() || null

  /* R5-P4: بخش فروشگاه (اختیاری) — null = بدون بخش؛ رشته = باید بلوک کالادار نقشه باشد */
  if (body.sectionLabel !== undefined) {
    const sectionLabel = body.sectionLabel === null || String(body.sectionLabel).trim() === '' ? null : String(body.sectionLabel).trim()
    if (sectionLabel && sectionLabel !== p.sectionLabel && !(await validSection(sectionLabel))) {
      return fail(`بخش «${sectionLabel}» در نقشه فروشگاه وجود ندارد — بخش را از فهرست انتخاب کنید`)
    }
    data.sectionLabel = sectionLabel
  }

  /* R5-F: اعداد — اعتبارسنجی منفی‌نبودن با پیام فارسی + پیش‌فرض‌های سفارش */
  if (body.sellPrice !== undefined) {
    const n = toNumber(body.sellPrice) ?? 0
    if (n < 0) return fail('قیمت فروش نمی‌تواند منفی باشد')
    data.sellPrice = n
  }
  if (body.sellPrice2 !== undefined) {
    const n = toNumber(body.sellPrice2) ?? 0
    if (n < 0) return fail('قیمت فروش دوم نمی‌تواند منفی باشد')
    data.sellPrice2 = n
  }
  if (body.lastBuyPrice !== undefined) {
    const n = toNumber(body.lastBuyPrice) ?? 0
    if (n < 0) return fail('قیمت آخرین خرید نمی‌تواند منفی باشد')
    data.lastBuyPrice = n
  }
  if (body.stock !== undefined) {
    const n = toNumber(body.stock) ?? 0
    if (n < 0) return fail('موجودی نمی‌تواند منفی باشد')
    data.stock = Math.round(n)
  }
  if (body.reorderLevel !== undefined) {
    const n = toNumber(body.reorderLevel)
    if (n != null && n < 0) return fail('حد سفارش مجدد نمی‌تواند منفی باشد')
    data.reorderLevel = n == null ? null : Math.round(n)
  }
  if (body.defaultOrderQty !== undefined) {
    const n = toIntOrNull(body.defaultOrderQty)
    if (n == null) return fail('تعداد پیش‌فرض سفارش را وارد کنید')
    if (n < 0) return fail('تعداد پیش‌فرض سفارش نمی‌تواند منفی باشد')
    data.defaultOrderQty = n
  }
  if (body.defaultCartonQty !== undefined) {
    const n = toIntOrNull(body.defaultCartonQty)
    if (n == null) return fail('تعداد پیش‌فرض کارتن را وارد کنید')
    if (n < 0) return fail('تعداد پیش‌فرض کارتن نمی‌تواند منفی باشد')
    data.defaultCartonQty = n
  }
  /* R8: اندازهٔ کارتن به‌یادسپاری‌شده (۰ = نامشخص) — از دیالوگ «اندازهٔ کارتن» سفارش‌گذاری */
  if (body.unitsPerCarton !== undefined) {
    const n = toIntOrNull(body.unitsPerCarton)
    if (n == null) return fail('تعداد در هر کارتن را وارد کنید')
    if (n < 0 || n > 10000) return fail('تعداد در هر کارتن باید بین ۰ تا ۱۰٬۰۰۰ باشد')
    data.unitsPerCarton = n
  }
  if (body.shelfLifeDays !== undefined) data.shelfLifeDays = toNumber(body.shelfLifeDays)
  if (body.status !== undefined) data.status = body.status === null ? null : String(body.status)
  if (body.active !== undefined) {
    data.active = body.active !== false
    /* R5-F: همگام‌سازی وضعیت با فعال/غیرفعال — مگر آنکه status صریح داده شده باشد */
    if (body.status === undefined) data.status = data.active ? 'فعال' : 'غیر فعال'
  }

  // barcodes: array of strings replaces the bank (the main code stays the primary barcode)
  if (Array.isArray(body.barcodes)) {
    const list = (body.barcodes as unknown[])
      .map((b) => (b === null || b === undefined ? '' : String(b).trim()))
      .filter(Boolean)
    data.barcodesJson = JSON.stringify(list)
  }

  if (Object.keys(data).length > 0) {
    await db.product.update({ where: { id: p.id }, data })
  }

  /* R5-P4: تأمین‌کنندهٔ اصلی (اختیاری) — null = حذف اصلی؛ رشته = ثبت/جابه‌جایی */
  if (body.supplierId !== undefined) {
    const supplierId = body.supplierId === null || String(body.supplierId).trim() === '' ? null : String(body.supplierId).trim()
    if (supplierId) {
      const sup = await db.supplier.findUnique({ where: { id: supplierId }, select: { id: true } })
      if (!sup) return fail('تأمین‌کنندهٔ انتخاب‌شده یافت نشد')
    }
    await db.supplierProduct.updateMany({ where: { productId: p.id, isPrimary: true }, data: { isPrimary: false } })
    if (supplierId) {
      const unitPrice = data.lastBuyPrice != null ? Number(data.lastBuyPrice) : p.lastBuyPrice
      await db.supplierProduct.upsert({
        where: { supplierId_productId: { supplierId, productId: p.id } },
        create: { supplierId, productId: p.id, unitPrice, isPrimary: true },
        update: { isPrimary: true, ...(unitPrice > 0 ? { unitPrice } : {}) },
      })
    }
  }

  // imageUrl only → product image cache (any logged-in user; matches the frontend dialog)
  if (body.imageUrl !== undefined) {
    const url = body.imageUrl === null || body.imageUrl === '' ? null : String(body.imageUrl)
    const existing = await db.productImage.findUnique({ where: { key: p.id } })
    if (url && /^https?:\/\//i.test(url)) {
      if (existing && existing.url === url) {
        await db.productImage.update({ where: { key: p.id }, data: { hits: { increment: 1 } } })
      } else {
        await db.productImage.upsert({
          where: { key: p.id },
          create: { key: p.id, url, bytes: 0, hits: 0 },
          update: { url },
        })
        await bumpImageMisses(1)
      }
    } else if (existing) {
      await db.productImage.delete({ where: { key: p.id } })
    }
  }

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: imageUrlOnly ? 'product_image' : 'product_update',
    actionLabel: imageUrlOnly ? 'ذخیره تصویر کالا' : 'ویرایش کالا',
    category: 'products',
    detail: `کالای «${(data.name as string) ?? p.name}» به‌روزرسانی شد`,
    entityId: p.id,
  })

  const d = await detail(p.id)

  /* R5-F: هشدار هم‌نامی غیرمسدودکننده (فقط وقتی نام عوض شده) — در پاسخ، نه خطا */
  const warnings = data.name !== undefined ? await nameWarnings(String(data.name), p.id) : []
  return warnings.length ? ok({ ...d, warnings }) : ok(d)
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canMutateProducts(user)) return fail('برای حذف کالا دسترسی مدیران لازم است', 403)

  const { id } = await ctx.params
  const p = await db.product.findUnique({ where: { id } })
  if (!p) return fail('کالا یافت نشد', 404)

  await db.product.update({ where: { id }, data: { active: false } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'product_delete',
    actionLabel: 'حذف/غیرفعال‌سازی کالا',
    category: 'products',
    detail: `کالای «${p.name}» غیرفعال شد`,
    entityId: p.id,
  })
  return ok({ id: p.id, active: false })
}
