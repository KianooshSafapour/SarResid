import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson, clampInt } from '@/lib/api'
import { getSessionUser, isManager, MANAGER_ROLES } from '@/lib/auth'
import { displayName, notify } from '@/lib/notify'

export const dynamic = 'force-dynamic'

/**
 * R5-E — سامانهٔ ردیف‌های قفسه (lane content + charge monitoring)
 * ردیف = ZoneColumn (نام مدل تاریخی). هر ردیف چند کالا با ظرفیت مشخص دارد؛
 * «تعداد مطلوب» = مجموع ظرفیت‌ها؛ «آخرین شارژ/شمارش» در statusJson؛
 * ردیفِ زیر آستانهٔ ۳۰٪ (یا حد اختصاصی) → اعلان به نیروی چیدمانِ مسؤولِ بخش.
 */

/** دیدن وضعیت ردیف‌ها: مدیران + PM + SK + نیروی چیدمان (MERCH) */
const LANE_ROLES = [...MANAGER_ROLES, 'PM', 'SK', 'MERCH']
/** شارژ/شمارش ردیف: مدیران + PM + نیروی چیدمان */
const CHARGE_ROLES = [...MANAGER_ROLES, 'PM', 'MERCH']

const LOW_RATIO = 0.3 // آستانهٔ پیش‌فرض: ≤ ۳۰٪ تعداد مطلوب

export interface LaneProduct {
  productId: string
  name: string
  capacity: number
}
export interface LaneStatus {
  lastCharge?: { count: number; at: string; by: string } | null
  lastCount?: { count: number; at: string; by: string } | null
  minCount?: number | null
}

export function parseProducts(raw: string | null): LaneProduct[] {
  const arr = safeJson<unknown>(raw, [])
  if (!Array.isArray(arr)) return []
  return arr
    .map((p) => {
      const o = (p || {}) as Record<string, unknown>
      return {
        productId: String(o.productId || ''),
        name: String(o.name || ''),
        capacity: clampInt(o.capacity, 0, 9999, 0),
      }
    })
    .filter((p) => p.productId && p.name && p.capacity > 0)
}

export function parseStatus(raw: string | null): LaneStatus {
  const o = safeJson<Record<string, unknown>>(raw, {})
  const one = (v: unknown) => {
    if (!v || typeof v !== 'object') return null
    const r = v as Record<string, unknown>
    const count = clampInt(r.count, 0, 999999, NaN)
    if (!Number.isFinite(count)) return null
    return { count, at: String(r.at || new Date().toISOString()), by: String(r.by || '') }
  }
  const min = o.minCount === undefined || o.minCount === null ? null : clampInt(o.minCount, 0, 99999, 0)
  return { lastCharge: one(o.lastCharge), lastCount: one(o.lastCount), minCount: min }
}

/** وضعیت محاسبه‌شدهٔ یک ردیف */
export function laneState(products: LaneProduct[], status: LaneStatus) {
  const target = products.reduce((s, p) => s + p.capacity, 0)
  const remaining = status.lastCount?.count ?? status.lastCharge?.count ?? null
  const threshold = Math.max(1, Math.ceil(target * LOW_RATIO))
  const low =
    target > 0 &&
    ((remaining === null && (!status.lastCharge || status.lastCharge.count <= threshold)) ||
      (remaining !== null && (remaining <= threshold || (status.minCount != null && remaining <= status.minCount))))
  return { target, remaining, threshold, low }
}

const laneGo = (laneId: string) => `store/liveboard?lane=${laneId}`

/** وضعیت ردیف از روی ردیف خام ZoneColumn (برای استفادهٔ section-columns) */
export function laneOfColumn(c: { productsJson: string | null; statusJson: string | null }) {
  const products = parseProducts(c.productsJson)
  const status = parseStatus(c.statusJson)
  const st = laneState(products, status)
  return {
    products,
    target: st.target,
    remaining: st.remaining,
    threshold: st.threshold,
    minCount: status.minCount,
    lastCharge: status.lastCharge,
    lastCount: status.lastCount,
    low: st.low,
  }
}

/** یافتن کاربرِ مسؤول از روی نام ذخیره‌شده در metaJson.responsible */
async function responsibleUserMap() {
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, fullName: true, honorific: true, role: true } })
  const byDisplay = new Map<string, typeof users[number]>()
  const byFull = new Map<string, typeof users[number]>()
  for (const u of users) {
    byDisplay.set(displayName(u), u)
    if (!byFull.has(u.fullName)) byFull.set(u.fullName, u)
  }
  return { byDisplay, byFull }
}

/** GET /api/store/lanes?planId= → {planId, lanes:[...]} */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!LANE_ROLES.includes(me.role)) return fail('دسترسی به این بخش ندارید', 403)

  const planId = req.nextUrl.searchParams.get('planId') || ''
  const plan = planId
    ? await db.floorplan.findUnique({ where: { id: planId } })
    : await db.floorplan.findFirst()
  if (!plan) return fail('نقشه فروشگاه یافت نشد', 404)

  const [cols, blocks, users] = await Promise.all([
    db.zoneColumn.findMany({ where: { planId: plan.id }, orderBy: [{ blockLabel: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }] }),
    db.floorBlock.findMany({ where: { planId: plan.id } }),
    responsibleUserMap(),
  ])

  const blockByLabel = new Map(blocks.filter((b) => b.label).map((b) => [b.label!, b]))
  const lanes = cols.map((c) => {
    const products = parseProducts(c.productsJson)
    const status = parseStatus(c.statusJson)
    const st = laneState(products, status)
    const meta = safeJson<Record<string, unknown>>(blockByLabel.get(c.blockLabel)?.metaJson, {})
    const responsible = typeof meta.responsible === 'string' ? meta.responsible.trim() : ''
    const respUser = users.byDisplay.get(responsible) || (responsible ? users.byFull.get(responsible) || undefined : undefined)
    return {
      id: c.id,
      planId: c.planId,
      blockLabel: c.blockLabel,
      blockKind: blockByLabel.get(c.blockLabel)?.kind || null,
      name: c.name,
      order: c.order,
      active: c.active,
      products,
      target: st.target,
      remaining: st.remaining,
      threshold: st.threshold,
      minCount: status.minCount,
      lastCharge: status.lastCharge,
      lastCount: status.lastCount,
      low: st.low,
      responsible,
      responsibleUserId: respUser?.id || null,
      responsibleRole: respUser?.role || null,
    }
  })

  return ok({
    planId: plan.id,
    lowRatio: LOW_RATIO,
    lanes,
    lowCount: lanes.filter((l) => l.low && l.active).length,
  })
}

/** POST /api/store/lanes — action-based:
 *  {action:'products', id, products:[{productId,capacity}], minCount?}  مدیران
 *  {action:'charge',   id, count}   مدیران/PM/MERCH — تأیید شارژ ردیف + پاک‌کردن اعلان
 *  {action:'count',    id, count}   مدیران/PM/MERCH — شمارش دستی (موجودی فعلی)
 *  {action:'evaluate'}              مدیران/PM/MERCH — ارزیابی ردیف‌های کم → اعلان بی‌تکرار
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!LANE_ROLES.includes(me.role)) return fail('دسترسی به این بخش ندارید', 403)

  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    id?: string
    count?: number
    minCount?: number | null
    products?: { productId?: string; capacity?: number }[]
  }
  const action = String(body.action || '')

  /* ── تعریف محتوای ردیف (مدیران) ── */
  if (action === 'products') {
    if (!isManager(me)) return fail('فقط مدیران می‌توانند محتوای ردیف را تعریف کنند', 403)
    const lane = await db.zoneColumn.findUnique({ where: { id: String(body.id || '') } })
    if (!lane) return fail('ردیف یافت نشد', 404)

    const raw = Array.isArray(body.products) ? body.products.slice(0, 20) : []
    const ids = [...new Set(raw.map((p) => String(p?.productId || '')).filter(Boolean))]
    const prods = ids.length
      ? await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, active: true } })
      : []
    const byId = new Map(prods.map((p) => [p.id, p]))
    const products: LaneProduct[] = []
    const seen = new Set<string>()
    for (const p of raw) {
      const pid = String(p?.productId || '')
      const dbp = byId.get(pid)
      if (!dbp || seen.has(pid)) continue
      seen.add(pid)
      products.push({ productId: pid, name: dbp.name, capacity: clampInt(p?.capacity, 1, 9999, 1) })
    }
    if (raw.length && !products.length) return fail('کالای معتبری برای این ردیف انتخاب نشده است')

    const status = parseStatus(lane.statusJson)
    const minCount = body.minCount === undefined ? status.minCount : body.minCount === null ? null : clampInt(body.minCount, 0, 99999, 0)
    const updated = await db.zoneColumn.update({
      where: { id: lane.id },
      data: {
        productsJson: JSON.stringify(products),
        statusJson: JSON.stringify({ ...status, minCount }),
      },
    })
    await logActivity({
      userId: me.id,
      userName: displayName(me),
      action: 'store.lane.products',
      actionLabel: 'محتوای ردیف قفسه',
      category: 'store',
      detail: `${lane.blockLabel} / ${lane.name} — ${products.length} کالا، تعداد مطلوب ${products.reduce((s, p) => s + p.capacity, 0)}`,
      entityId: lane.id,
    })
    return ok({ lane: updated, products, target: products.reduce((s, p) => s + p.capacity, 0) })
  }

  /* ── تأیید شارژ / شمارش دستی ── */
  if (action === 'charge' || action === 'count') {
    if (!CHARGE_ROLES.includes(me.role)) return fail('دسترسی به ثبت شارژ/شمارش ردیف را ندارید', 403)
    const lane = await db.zoneColumn.findUnique({ where: { id: String(body.id || '') } })
    if (!lane) return fail('ردیف یافت نشد', 404)
    const count = clampInt(body.count, 0, 999999, -1)
    if (count < 0) return fail('تعداد را وارد کنید')

    const status = parseStatus(lane.statusJson)
    const at = new Date().toISOString()
    const entry = { count, at, by: displayName(me) }
    if (action === 'charge') {
      // شارژ = خط پایهٔ تازه؛ شمارش فعلی هم همان است
      status.lastCharge = entry
      status.lastCount = entry
    } else {
      status.lastCount = entry
    }
    const updated = await db.zoneColumn.update({
      where: { id: lane.id },
      data: { statusJson: JSON.stringify(status) },
    })

    // پاک‌کردن اعلان‌های بازِ این ردیف (شارژ = رفع نیاز)
    let cleared = 0
    if (action === 'charge') {
      const res = await db.notification.updateMany({
        where: { kind: 'lane_charge', go: laneGo(lane.id), readAt: null },
        data: { readAt: new Date() },
      })
      cleared = res.count
    }

    await logActivity({
      userId: me.id,
      userName: displayName(me),
      action: action === 'charge' ? 'store.lane.charge' : 'store.lane.count',
      actionLabel: action === 'charge' ? 'شارژ ردیف قفسه' : 'شمارش ردیف قفسه',
      category: 'store',
      detail: `${lane.blockLabel} / ${lane.name} — ${count} عدد`,
      entityId: lane.id,
    })
    return ok({ lane: updated, cleared })
  }

  /* ── ارزیابی ردیف‌های کم‌موجود → اعلان بی‌تکرار به مسؤول بخش ── */
  if (action === 'evaluate') {
    if (!CHARGE_ROLES.includes(me.role)) return fail('دسترسی به ارزیابی ردیف‌ها را ندارید', 403)
    const plan = await db.floorplan.findFirst()
    if (!plan) return fail('نقشه فروشگاه یافت نشد', 404)

    const [cols, blocks, users, openNotifs] = await Promise.all([
      db.zoneColumn.findMany({ where: { planId: plan.id, active: true } }),
      db.floorBlock.findMany({ where: { planId: plan.id } }),
      responsibleUserMap(),
      db.notification.findMany({ where: { kind: 'lane_charge', readAt: null }, select: { go: true } }),
    ])
    const openLanes = new Set(openNotifs.map((n) => n.go).filter(Boolean))
    const metaByLabel = new Map(
      blocks.filter((b) => b.label).map((b) => {
        const meta = safeJson<Record<string, unknown>>(b.metaJson, {})
        return [b.label!, typeof meta.responsible === 'string' ? meta.responsible.trim() : '']
      }),
    )

    let created = 0
    const skipped = { open: 0, noResp: 0 }
    for (const c of cols) {
      const products = parseProducts(c.productsJson)
      const status = parseStatus(c.statusJson)
      const st = laneState(products, status)
      if (!st.low) continue
      const go = laneGo(c.id)
      if (openLanes.has(go)) { skipped.open++; continue }

      const responsible = metaByLabel.get(c.blockLabel) || ''
      const respUser = users.byDisplay.get(responsible) || (responsible ? users.byFull.get(responsible) || undefined : undefined)
      if (!respUser) { skipped.noResp++; continue }

      const productTxt = products.length
        ? products.length === 1
          ? products[0].name
          : `${products[0].name} و ${products.length > 2 ? `${products.length - 1} کالای دیگر` : products[1].name}`
        : 'بدون کالای تعریف‌شده'
      const remTxt = st.remaining === null ? 'بدون شارژ ثبت‌شده' : `موجودی تقریبی ${st.remaining} از ${st.target}`
      const row = await notify({
        userId: respUser.id,
        kind: 'lane_charge',
        severity: 'warning',
        title: `ردیف «${c.name}» در بخش «${c.blockLabel}» نیاز به شارژ دارد`,
        body: `ردیف ${c.name} در بخش ${c.blockLabel} نیاز به شارژ دارد — ${productTxt} (${remTxt})`,
        go,
      })
      if (row) { created++; openLanes.add(go) }
    }
    return ok({ created, skippedOpen: skipped.open, skippedNoResp: skipped.noResp })
  }

  return fail('عملیات نامعتبر است')
}
