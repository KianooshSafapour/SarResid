import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

// سقف پاسخ فهرست کامل — محافظت در برابر ده‌ها هزار کالا (خواست مالک: صفحه‌بندی)
const FULL_LIST_CAP = 2000
const MAX_PAGE_SIZE = 500

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const category = searchParams.get('category') || ''
  const lowOnly = searchParams.get('low') === '1'
  const lowstock = searchParams.get('lowstock') === '1'
  const providerId = searchParams.get('providerId') || ''

  // ── حالت‌ها ──
  // ?facets=1 → فقط دسته‌ها + تعداد (سبک، برای سایدبار دسته‌بندی)
  // ?page=N  → پاسخ صفحه‌بندی‌شده {products,total,page,pageSize,totalPages,categories:[{name,count}]}
  // پیش‌فرض (بدون page) → فهرست کامل مثل قبل (سازگار با Sales/Orders/Planogram/MarginCalculator/Receiving/…)
  //   که سمت کلاینت روی دادهٔ دمو (~۲۰۰ ردیف) فیلتر می‌کنند. با ورود دادهٔ واقعی ۱۰هزارتایی،
  //   همین کوئری‌های page/pageSize آمادهٔ استفاده‌اند.
  const paged = searchParams.has('page')
  const pageRaw = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(6, Number(searchParams.get('pageSize')) || 48))
  const sort = searchParams.get('sort') || 'name' // name | stock | sales30 | margin

  // دسته‌ها با groupBy — ارزان و همیشه به‌روز
  const grouped = await db.product.groupBy({
    by: ['category'],
    where: { active: true },
    _count: { _all: true },
    orderBy: { _count: { category: 'desc' } },
  })
  const categories = grouped.map((g) => ({ name: g.category, count: g._count._all }))

  // شمارش کم‌موجودی‌ها (مقایسهٔ دو ستون در SQLite فقط با SQL خام ممکن است)
  let lowCount = 0
  try {
    const rows = await db.$queryRaw<Array<{ c: number }>>`SELECT COUNT(*) as c FROM Product WHERE active = 1 AND stock <= reorderLevel`
    lowCount = Number(rows?.[0]?.c ?? 0)
  } catch { /* جداول خالی یا مشکل موقت — صفر نمایش داده می‌شود */ }

  if (searchParams.get('facets') === '1') return json({ categories, lowCount })

  const where: Record<string, unknown> = { active: true }
  if (category) where.category = category
  if (providerId) where.providerId = providerId

  const [all, preorders] = await Promise.all([
    db.product.findMany({ where, orderBy: { name: 'asc' } }),
    db.preOrder.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) }, status: { not: 'CANCELLED' } },
      select: { items: true },
    }),
  ])
  // سرعت فروش ۳۰ روز اخیر (مجموع تعداد در پیش‌فاکتورهای فروش)
  const sales30 = new Map<string, number>()
  for (const po of preorders) {
    try {
      for (const it of JSON.parse(po.items || '[]') as { productId?: string; qty: number }[]) {
        if (it.productId) sales30.set(it.productId, (sales30.get(it.productId) || 0) + (it.qty || 0))
      }
    } catch { /* skip malformed rows */ }
  }

  let items = all
  if (q) {
    const needle = q.trim().toLowerCase()
    items = items.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.brand.toLowerCase().includes(needle) ||
        p.barcodes.includes(needle) ||
        p.holooCode.toLowerCase().includes(needle)
    )
  }
  if (lowOnly || lowstock) items = items.filter((p) => p.stock <= p.reorderLevel)

  // ── پاسخ صفحه‌بندی‌شده ──
  if (paged) {
    const marginOf = (p: (typeof all)[number]) => (p.buyPrice > 0 ? (p.sellPrice - p.buyPrice) / p.buyPrice : p.sellPrice > 0 ? 999 : -1)
    const sorted = [...items].sort((a, b) => {
      if (sort === 'stock') return a.stock - b.stock
      if (sort === 'sales30') return (sales30.get(b.id) || 0) - (sales30.get(a.id) || 0)
      if (sort === 'margin') return marginOf(b) - marginOf(a)
      return a.name.localeCompare(b.name, 'fa')
    })
    const total = sorted.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const p = Math.min(pageRaw, totalPages)
    const rows = sorted.slice((p - 1) * pageSize, p * pageSize).map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      unit: p.unit,
      brand: p.brand,
      stock: p.stock,
      reorderLevel: p.reorderLevel,
      buyPrice: p.buyPrice,
      sellPrice: p.sellPrice,
      sellPrice2: p.sellPrice2,
      inHoloo: p.inHoloo,
      active: p.active,
      barcodes: JSON.parse(p.barcodes || '[]') as string[],
      holooCode: p.holooCode,
      imageUrl: p.imageUrl,
      sales30: sales30.get(p.id) || 0,
    }))
    return json({ products: rows, total, page: p, pageSize, totalPages, categories, lowCount, sort })
  }

  // ── پاسخ فهرست کامل (سازگاری کامل با مصرف‌کنندگان فعلی) — با سقف حفاظتی ──
  const capped = items.length > FULL_LIST_CAP
  const fullList = capped ? items.slice(0, FULL_LIST_CAP) : items
  return json({
    products: fullList.map((p) => ({ ...p, barcodes: JSON.parse(p.barcodes || '[]'), sales30: sales30.get(p.id) || 0 })),
    categories: [...new Set(all.map((p) => p.category))],
    total: items.length,
    ...(capped
      ? {
          capped: true,
          warning: `به‌دلیل حجم بالا فقط ${FULL_LIST_CAP.toLocaleString('fa-IR')} کالای اول نمایش داده شد — برای مرور کامل از صفحه‌بندی یا جستجو استفاده کنید`,
        }
      : {}),
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  if (!body.name) return fail('نام کالا الزامی است')
  const product = await db.product.create({
    data: {
      name: body.name,
      barcodes: JSON.stringify(body.barcodes?.filter(Boolean) || []),
      holooCode: body.holooCode || '',
      unit: body.unit || 'عدد',
      brand: body.brand || '',
      category: body.category || 'عمومی',
      providerId: body.providerId || null,
      buyPrice: Number(body.buyPrice) || 0,
      sellPrice: Number(body.sellPrice) || 0,
      sellPrice2: Number(body.sellPrice2) || 0,
      stock: Number(body.stock) || 0,
      reorderLevel: Number(body.reorderLevel) || 12,
      imageUrl: body.imageUrl || '',
      notes: body.notes || '',
      inHoloo: body.inHoloo !== false,
    },
  })
  await logActivity(me, 'افزودن کالای جدید', 'product', product.id, body.name)
  return json({ product: { ...product, barcodes: JSON.parse(product.barcodes) } }, 201)
}
