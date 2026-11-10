import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { getShopSettings } from '@/lib/shop'

export const dynamic = 'force-dynamic'

/** GET /api/shop-admin/settings + stats — وضعیت فروشگاه آنلاین برای مدیران */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(user.role)) return fail('فقط مدیران', 403)

  const [settings, today] = await Promise.all([getShopSettings(), db.shopOrder.count()])
  const agg = await db.shopOrder.groupBy({ by: ['status'], _count: { _all: true }, _sum: { total: true } })
  const revenue = agg.filter((a) => ['PAID', 'DELIVERED', 'INVOICED'].includes(a.status)).reduce((s, a) => s + (a._sum.total || 0), 0)
  const holooFails = await db.shopOrder.count({ where: { holooError: { not: null } } })
  return ok({
    settings: { ...settings, apiToken: settings.apiToken ? 'تنظیم‌شده' : '' },
    totals: { orders: today, revenue, byStatus: agg.map((a) => ({ status: a.status, count: a._count._all, total: a._sum.total || 0 })), holooFails },
  })
}

/** PUT /api/shop-admin/settings — تغییر تنظیمات فروشگاه (مدیران) */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['OWNER', 'GM', 'ADMIN'].includes(user.role)) return fail('فقط مدیر ارشد', 403)

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const allowed: Record<string, (v: unknown) => string> = {
    'shop:open': (v) => (v === true || v === 'true' ? 'true' : 'false'),
    'shop:devOtp': (v) => (v === true || v === 'true' ? 'true' : 'false'),
    'shop:storeName': (v) => String(v ?? '').slice(0, 60),
    'shop:announcement': (v) => String(v ?? '').slice(0, 200),
    'shop:deliveryFee': (v) => String(Math.max(0, Math.round(Number(v) || 0))),
    'shop:freeDeliveryMin': (v) => String(Math.max(0, Math.round(Number(v) || 0))),
    'shop:minOrder': (v) => String(Math.max(0, Math.round(Number(v) || 0))),
    'shop:shelfFloor': (v) => String(Math.max(0, Math.round(Number(v) || 0))),
    'shop:hotline': (v) => String(v ?? '').slice(0, 30),
    'shop:gateway': (v) => (['mock', 'zarinpal'].includes(String(v)) ? String(v) : 'mock'),
    'shop:gatewayMerchant': (v) => String(v ?? '').slice(0, 80),
    'shop:gatewaySandbox': (v) => (v === true || v === 'true' ? 'true' : 'false'),
    'shop:apiToken': (v) => String(v ?? '').slice(0, 80),
    'shop:notifyRoles': (v) => JSON.stringify(Array.isArray(v) ? v.map(String).slice(0, 8) : ['SK', 'HC', 'GM', 'EXEC']),
    'shop:hiddenGroups': (v) => JSON.stringify(Array.isArray(v) ? v.map(String).slice(0, 40) : []),
    'shop:slots': (v) => JSON.stringify(v ?? {}),
  }
  const updates: { key: string; value: string }[] = []
  for (const [key, val] of Object.entries(body)) {
    if (!(key in allowed) || val === undefined) continue
    updates.push({ key, value: allowed[key](val) })
  }
  if (!updates.length) return fail('تغییری ارسال نشد')
  for (const u of updates) {
    await db.setting.upsert({ where: { key: u.key }, create: u, update: { value: u.value } })
  }
  return ok({ updated: updates.map((u) => u.key) })
}
