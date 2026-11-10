import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'
import { todayJalaliDash, addDaysJalaliDash, jalaliWeekdayDash } from '@/lib/jalali'
import {
  ZONE_TYPE_LABELS,
  VALID_ZONE_TYPES,
  VALID_ZONE_FREQ,
  VALID_ZONE_CRIT,
  ZONE_FREQ_WEIGHT,
  serializeZoneCount,
} from '@/lib/zone-counts'

export const dynamic = 'force-dynamic'

/** GET /api/store/zones → {today, zones, week} */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'store/zones')
  if (!gate.ok) return fail(gate.deny, 403)

  const today = todayJalaliDash()
  const zones = await db.zone.findMany()
  const zoneIds = zones.map((z) => z.id)

  const weekStart = addDaysJalaliDash(today, -jalaliWeekdayDash(today))
  const weekEnd = addDaysJalaliDash(weekStart, 6)

  const [todayCounts, weekCounts] = await Promise.all([
    db.zoneCount.findMany({ where: { date: today, zoneId: { in: zoneIds } }, orderBy: { createdAt: 'desc' } }),
    db.zoneCount.findMany({ where: { date: { gte: weekStart, lte: weekEnd }, zoneId: { in: zoneIds } } }),
  ])

  const latestByZone = new Map<string, ReturnType<typeof serializeZoneCount>>()
  for (const c of todayCounts) {
    if (!latestByZone.has(c.zoneId)) latestByZone.set(c.zoneId, serializeZoneCount(c))
  }

  const compliance: Record<string, { done: number; expected: number; pct: number }> = {}
  for (const crit of ['A', 'B', 'C']) {
    const zoneSet = new Set(zones.filter((z) => z.criticality === crit).map((z) => z.id))
    const done = weekCounts.filter((c) => zoneSet.has(c.zoneId)).length
    const expected = zones
      .filter((z) => z.criticality === crit)
      .reduce((sum, z) => sum + (ZONE_FREQ_WEIGHT[z.countFrequency] ?? 0), 0)
    compliance[crit] = {
      done,
      expected: Math.round(expected * 100) / 100,
      pct: expected > 0 ? Math.round((done / expected) * 100) : 0,
    }
  }

  return ok({
    today,
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      type: z.type,
      typeLabel: ZONE_TYPE_LABELS[z.type] ?? z.type,
      criticality: z.criticality,
      countFrequency: z.countFrequency,
      ownerName: z.ownerName,
      minStaff: z.minStaff,
      todayCount: latestByZone.get(z.id) ?? null,
    })),
    week: { start: weekStart, compliance },
  })
}

/** POST /api/store/zones {name,type,criticality,countFrequency,ownerName?,minStaff?} */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'store/zones')
  if (!gate.ok) return fail(gate.deny, 403)

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return fail('نام زون را وارد کنید')
  if (await db.zone.findFirst({ where: { name } })) return fail('زونی با این نام وجود دارد')

  const zone = await db.zone.create({
    data: {
      name,
      type: VALID_ZONE_TYPES.includes(body?.type) ? body.type : 'DRY',
      criticality: VALID_ZONE_CRIT.includes(body?.criticality) ? body.criticality : 'C',
      countFrequency: VALID_ZONE_FREQ.includes(body?.countFrequency) ? body.countFrequency : 'MONTHLY',
      ownerName: optStr(body?.ownerName),
      minStaff: optInt(body?.minStaff),
    },
  })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'zone.create',
    actionLabel: 'زون فروشگاه',
    category: 'zone',
    detail: name,
    entityId: zone.id,
  })
  return ok({ id: zone.id, zone })
}

/** PATCH /api/store/zones {id, name?, type?, criticality?, countFrequency?, ownerName?, minStaff?} */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'store/zones')
  if (!gate.ok) return fail(gate.deny, 403)

  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const zone = await db.zone.findUnique({ where: { id } })
  if (!zone) return fail('زون یافت نشد', 404)

  const data: {
    name?: string
    type?: string
    criticality?: string
    countFrequency?: string
    ownerName?: string | null
    minStaff?: number | null
  } = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (VALID_ZONE_TYPES.includes(body.type)) data.type = body.type
  if (VALID_ZONE_CRIT.includes(body.criticality)) data.criticality = body.criticality
  if (VALID_ZONE_FREQ.includes(body.countFrequency)) data.countFrequency = body.countFrequency
  if ('ownerName' in body) data.ownerName = optStr(body.ownerName)
  if ('minStaff' in body) data.minStaff = optInt(body.minStaff)

  const updated = await db.zone.update({ where: { id }, data })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'zone.update',
    actionLabel: 'زون فروشگاه',
    category: 'zone',
    detail: updated.name,
    entityId: id,
  })
  return ok({ zone: updated })
}

/** DELETE /api/store/zones?id= */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'store/zones')
  if (!gate.ok) return fail(gate.deny, 403)

  const id = req.nextUrl.searchParams.get('id') || ''
  const zone = await db.zone.findUnique({ where: { id } })
  if (!zone) return fail('زون یافت نشد', 404)

  await db.zone.delete({ where: { id } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'zone.delete',
    actionLabel: 'زون فروشگاه',
    category: 'zone',
    detail: zone.name,
    entityId: id,
  })
  return ok({ deleted: true })
}

function optStr(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

function optInt(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(50, Math.round(n))
}
