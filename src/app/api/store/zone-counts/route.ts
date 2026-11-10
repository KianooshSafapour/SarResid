import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { canZones } from '@/lib/access'
import { todayJalaliDash } from '@/lib/jalali'
import { serializeZoneCount, type CountItem } from '@/lib/zone-counts'

export const dynamic = 'force-dynamic'

const TOLERANCE = 0.02 // allowed shrink ratio vs system stock
const POINTS_PER_COUNT = 2

/** GET /api/store/zone-counts?date= → {date,isConfirmer,myCounts,allCounts,zones} */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canZones(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const date = req.nextUrl.searchParams.get('date') || todayJalaliDash()
  const zones = await db.zone.findMany()

  const all = await db.zoneCount.findMany({ where: { date }, orderBy: { createdAt: 'desc' } })
  const allCounts = all.map(serializeZoneCount)
  const myCounts = allCounts.filter((c) => c.userId === user.id)

  return ok({
    date,
    isConfirmer: isManager(user),
    myCounts,
    allCounts,
    zones: zones.map((z) => z.name),
  })
}

/** POST /api/store/zone-counts {zoneName, items:[{name,counted}]} → {itemCount, pointsAwarded} */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canZones(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const body = await req.json().catch(() => null)
  const zoneName = typeof body?.zoneName === 'string' ? body.zoneName.trim() : ''
  if (!zoneName) return fail('زون را انتخاب کنید')

  const zone = await db.zone.findFirst({ where: { name: zoneName } })
  if (!zone) return fail('زون یافت نشد', 404)

  const rawItems = Array.isArray(body?.items) ? body.items : []
  const cleaned = rawItems
    .map((i: { name?: unknown; counted?: unknown }) => ({
      name: typeof i?.name === 'string' ? i.name.trim() : '',
      counted: Number(i?.counted),
    }))
    .filter((i: { name: string; counted: number }) => i.name && Number.isFinite(i.counted))
  if (cleaned.length === 0) return fail('حداقل یک ردیف کامل وارد کنید')

  // Resolve system stock per item name (exact product-name match)
  const names = cleaned.map((i: { name: string }) => i.name)
  const products = await db.product.findMany({ where: { name: { in: names } }, select: { name: true, stock: true } })
  const stockByName = new Map(products.map((p) => [p.name, p.stock]))

  const items: CountItem[] = cleaned.map((i: { name: string; counted: number }) => {
    const stock = stockByName.has(i.name) ? stockByName.get(i.name)! : null
    const diff = stock === null ? null : Math.round((i.counted - stock) * 1000) / 1000
    return { name: i.name, counted: i.counted, stock, diff }
  })

  const mismatchCount = items.filter((i) => {
    if (i.diff === null) return false
    if (i.stock === null || i.stock === 0) return i.diff !== 0
    return Math.abs(i.diff) > Math.abs(i.stock) * TOLERANCE
  }).length

  const count = await db.zoneCount.create({
    data: {
      date: todayJalaliDash(),
      zoneId: zone.id,
      zoneName: zone.name,
      userId: user.id,
      userName: user.fullName,
      itemsJson: JSON.stringify(items),
      status: 'PENDING',
      mismatchCount,
      totalItems: items.length,
      tolerance: TOLERANCE,
    },
  })

  await db.user.update({ where: { id: user.id }, data: { points: { increment: POINTS_PER_COUNT } } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'zonecount.create',
    actionLabel: 'شمارش زون',
    category: 'zonecount',
    detail: `${zone.name} — ${items.length} کالا (${mismatchCount} مغایرت)`,
    entityId: count.id,
  })

  return ok({ itemCount: items.length, pointsAwarded: POINTS_PER_COUNT, count: serializeZoneCount(count) })
}
