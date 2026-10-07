import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

/** layout cell as stored: legacy string productId | null | { id, qty } */
type LayoutCell = string | null | { id: string; qty?: number }

/** safe parse of the layout JSON (corrupt rows must never 500 the list) */
function parseLayout(raw: string): LayoutCell[][] {
  try {
    const v = JSON.parse(raw || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/** flatten any cell form to the legacy string contract (FloorPlan mini + old consumers) */
function cellToStr(c: LayoutCell): string | null {
  if (typeof c === 'string') return c || null
  if (c && typeof c === 'object' && typeof c.id === 'string') return c.id || null
  return null
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const [planograms, products, preorders] = await Promise.all([
    db.planogram.findMany({ orderBy: { updatedAt: 'desc' } }),
    db.product.findMany({ where: { active: true } }),
    db.preOrder.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) }, status: { not: 'CANCELLED' } },
      select: { items: true },
    }),
  ])
  // سرعت فروش ۳۰ روز اخیر برای رنگ‌آمیزی قفسه‌ها بر اساس تقاضا
  const sales30 = new Map<string, number>()
  for (const po of preorders) {
    try {
      for (const it of JSON.parse(po.items || '[]') as { productId?: string; qty: number }[]) {
        if (it.productId) sales30.set(it.productId, (sales30.get(it.productId) || 0) + (it.qty || 0))
      }
    } catch { /* skip malformed rows */ }
  }
  return json({
    planograms: planograms.map((pl) => {
      const raw = parseLayout(pl.layout)
      // layout = قرارداد قدیمی (رشتهٔ productId) برای مصرف‌کننده‌ها مثل FloorPlan
      const flat = raw.map((row) => (Array.isArray(row) ? row.map(cellToStr) : []))
      return {
        ...pl,
        layout: flat,
        layoutFull: raw, // فرم کامل با تعداد هر فیسینگ — فقط ادیتور پلانوگرام استفاده می‌کند
        cells: flat.flat().filter(Boolean).length,
      }
    }),
    productMap: Object.fromEntries(
      products.map((p) => [p.id, { id: p.id, name: p.name, stock: p.stock, reorderLevel: p.reorderLevel, imageUrl: p.imageUrl, category: p.category, sellPrice: p.sellPrice, sales30: sales30.get(p.id) || 0 }])
    ),
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me || !['GM', 'PM', 'OM'].includes(me.role))
    return fail('فقط مدیریت می‌تواند پلانوگرام بسازد', 403)
  const body = await req.json()
  if (!body.name) return fail('نام پلانوگرام الزامی است')
  const rows = Math.min(12, Math.max(1, Number(body.rows) || 3))
  const cols = Math.min(40, Math.max(1, Number(body.cols) || 6))
  const planogram = await db.planogram.create({
    data: {
      name: body.name,
      section: body.section || '',
      rows,
      cols,
      layout: JSON.stringify(Array.from({ length: rows }, () => Array(cols).fill(null))),
      status: 'DRAFT',
    },
  })
  await logActivity(me, 'ایجاد پلانوگرام', 'planogram', planogram.id, body.name)
  return json({ planogram: { ...planogram, layout: JSON.parse(planogram.layout) } }, 201)
}
