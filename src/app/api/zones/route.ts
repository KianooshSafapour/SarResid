import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { hasCap } from '@/lib/rbac'
import { addDaysIso, faNum, todayIso } from '@/lib/jalali'

/**
 * زون‌های فروشگاه (Underhill zoning) + نظارت بهره‌وری
 * — CRUD زون: cap 'oversight.manage' یا نقش‌های OM/GM/OWNER/ADMIN
 * — GET: مدیران → جزئیات کامل (مالک/جانشین + بهره‌وری: ZoneSLH، شاخص سهم، انطباق شمارش)؛
 *   کارکنان → فهرست زون‌ها + تخصیص خودشان.
 *
 * پژوهش پشتوانه:
 *   ZoneSLH = فروش ۳۰ روزهٔ زون ÷ ساعت‌کار ۷ روزهٔ نیروهای زون
 *   ZoneShareIndex = (سهم فروش زون از فروش مغازه) ÷ (سهم ساعت‌کار زون از ساعت‌کار مغازه)
 *     < 0.7 → «نیروی بیش از فروش» (معنی: نیرو بیشتر از سهم فروشش) | > 1.3 → «فروش بیش از نیرو»
 *   ABC cadence: A=هفتگی، B=دوهفتگی، C=ماهانه — انطباق = آخرین شمارش زون نسبت به سررسید
 *   زون DECOMPRESSION (تنفس): ۳ تا ۵ متر اول ورود هرگز فروش‌ساز نیست — از اهداف فروش مستثناست.
 */

const MANAGE_ROLES = ['OM', 'GM', 'OWNER', 'ADMIN']
const ASSIGN_EXTRA = ['SK', 'PM'] // همان گارد users/[id] zonesOnly — تخصیص شمارش روزانه
const VIEW_ROLES = ['SK', 'OM', 'GM', 'PM', 'OWNER']
const ZONE_TYPES = ['DECOMPRESSION', 'POWER_AISLE', 'PERISHABLE', 'DRY', 'CHECKOUT', 'BACKROOM']
const CRITICALITIES = ['A', 'B', 'C']
const FREQUENCIES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY']
const CADENCE_DAYS: Record<string, number> = { WEEKLY: 7, BIWEEKLY: 14, MONTHLY: 30 }
const HEX_RE = /^#[0-9a-fA-F]{6}$/

type ZoneRow = {
  id: string
  name: string
  type: string
  criticality: string
  countFrequency: string
  color: string
  minStaff: number
  notes: string
  ownerId: string
  ownerName: string
  backupId: string
  backupName: string
  updatedAt: Date
}

function parseZones(z: string | null | undefined): string[] {
  const arr = safeParse<string[]>(z || '[]', [])
  return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
}

function shapeZone(z: ZoneRow) {
  return {
    id: z.id,
    name: z.name,
    type: z.type,
    criticality: z.criticality,
    countFrequency: z.countFrequency,
    color: z.color,
    minStaff: z.minStaff,
    notes: z.notes,
    ownerId: z.ownerId,
    ownerName: z.ownerName,
    backupId: z.backupId,
    backupName: z.backupName,
    updatedAt: z.updatedAt,
  }
}

/* ───────────────────────── GET ───────────────────────── */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)

  const roles = [me.role, ...(me.secondaryRoles || [])]
  const manager = roles.some((r) => VIEW_ROLES.includes(r)) || (await hasCap(me, 'oversight.manage'))
  const canManage = roles.some((r) => MANAGE_ROLES.includes(r)) || (await hasCap(me, 'oversight.manage'))

  const zoneRows = await db.zone.findMany({ orderBy: { name: 'asc' } })
  const users = await db.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true, color: true, zones: true },
    orderBy: { name: 'asc' },
  })

  // تخصیص‌ها: مدیران همهٔ تیم؛ بقیه فقط خودشان
  const allAssignments = users.map((u) => ({
    userId: u.id,
    userName: u.name,
    color: u.color,
    role: u.role,
    zones: parseZones(u.zones),
  }))
  const staffAssignments = manager ? allAssignments : allAssignments.filter((a) => a.userId === me.id)

  const zones = zoneRows.map(shapeZone)

  if (!manager) {
    // نسخهٔ کارکنان: بدون اعداد بهره‌وری
    return json({ zones, staffAssignments, canManage: false, today: todayIso() })
  }

  /* ── بهره‌وری (فقط مدیران) ── */
  const startDt = new Date(addDaysIso(-29) + 'T00:00:00')
  const endDt = new Date(todayIso() + 'T23:59:59.999')
  const [preorders, products, labor7d] = await Promise.all([
    db.preOrder.findMany({
      where: { status: { not: 'CANCELLED' }, createdAt: { gte: startDt, lte: endDt } },
      select: { items: true },
    }),
    db.product.findMany({ where: { active: true }, select: { id: true, category: true } }),
    db.laborHour.findMany({
      where: { forDate: { gte: addDaysIso(-6, todayIso()) } },
      select: { userId: true, hours: true },
    }),
  ])

  // دستهٔ هر کالا (یک کوئری گروه‌شده) → فروش ۳۰ روزه به تفکیک دسته از اقلام PreOrder
  const catByProduct = new Map(products.map((p) => [p.id, p.category]))
  const salesByCat = new Map<string, number>()
  let storeSales = 0
  for (const po of preorders) {
    const items = safeParse<Array<{ productId?: string; qty?: number; price?: number }>>(po.items, [])
    for (const it of items) {
      const cat = catByProduct.get(String(it.productId || ''))
      if (!cat) continue
      const amount = Math.max(0, Number(it.qty) || 0) * Math.max(0, Number(it.price) || 0)
      salesByCat.set(cat, (salesByCat.get(cat) || 0) + amount)
      storeSales += amount
    }
  }

  const hoursByUser = new Map<string, number>()
  let storeStaffHours = 0
  for (const l of labor7d) {
    hoursByUser.set(l.userId, (hoursByUser.get(l.userId) || 0) + l.hours)
    storeStaffHours += l.hours
  }

  // آخرین شمارش هر زون (یک کوئری گروه‌شده) → انطباق با سررسید ABC
  const lastCounts = await db.zoneCount.groupBy({ by: ['zone'], _max: { forDate: true } })
  const lastByZone = new Map(lastCounts.map((r) => [r.zone, r._max.forDate || '']))
  const today = todayIso()

  const efficiency: Record<
    string,
    {
      sales30: number
      staffHours: number
      zoneSLH: number | null
      shareIndex: number | null
      band: 'balanced' | 'overstaffed' | 'underserved' | null
      salesTargetExcluded: boolean
      countCompliance: { lastDate: string; dueDate: string; overdue: boolean; cadenceDays: number }
    }
  > = {}

  for (const z of zoneRows) {
    const sales30 = salesByCat.get(z.name) || 0
    // ساعت‌کار = مالک + جانشین + کاربران تخصیص‌یافته به این زون (۷ روز اخیر)
    const memberIds = new Set<string>()
    if (z.ownerId) memberIds.add(z.ownerId)
    if (z.backupId) memberIds.add(z.backupId)
    for (const a of allAssignments) if (a.zones.includes(z.name)) memberIds.add(a.userId)
    let staffHours = 0
    for (const id of memberIds) staffHours += hoursByUser.get(id) || 0

    const zoneSLH = staffHours > 0 ? sales30 / staffHours : null
    const salesShare = storeSales > 0 ? sales30 / storeSales : null
    const hoursShare = storeStaffHours > 0 ? staffHours / storeStaffHours : null
    const shareIndex = salesShare !== null && hoursShare !== null && hoursShare > 0 ? salesShare / hoursShare : null
    const band =
      shareIndex === null ? null : shareIndex < 0.7 ? ('overstaffed' as const) : shareIndex > 1.3 ? ('underserved' as const) : ('balanced' as const)

    const cadenceDays = CADENCE_DAYS[z.countFrequency] || 30
    const lastDate = lastByZone.get(z.name) || ''
    const dueDate = lastDate ? addDaysIso(cadenceDays, lastDate) : today
    const overdue = !lastDate || dueDate < today

    efficiency[z.name] = {
      sales30: Math.round(sales30),
      staffHours: Math.round(staffHours * 10) / 10,
      zoneSLH: zoneSLH === null ? null : Math.round(zoneSLH),
      shareIndex: shareIndex === null ? null : Math.round(shareIndex * 100) / 100,
      band,
      salesTargetExcluded: z.type === 'DECOMPRESSION', // اصل آندرهیل: زون تنفس فروش‌سنج نیست
      countCompliance: { lastDate, dueDate, overdue, cadenceDays },
    }
  }

  return json({ zones, staffAssignments, efficiency, canManage, storeTotals: { sales30: Math.round(storeSales), staffHours: Math.round(storeStaffHours * 10) / 10 }, today })
}

/* ───────────────────────── POST ─────────────────────────
 * {name*, type, criticality, countFrequency, color, minStaff, notes} — ایجاد زون
 * {action:'assign', userId, zones:[names]} — همگام‌سازی User.zones (میان‌بر تخصیص)
 */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json().catch(() => null)
  const roles = [me.role, ...(me.secondaryRoles || [])]

  if (body?.action === 'assign') {
    const allowed =
      roles.some((r) => MANAGE_ROLES.includes(r) || ASSIGN_EXTRA.includes(r)) || (await hasCap(me, 'oversight.manage'))
    if (!allowed) return fail('دسترسی لازم را ندارید', 403)
    const userId = String(body?.userId || '')
    const zones = Array.isArray(body?.zones) ? body.zones.filter((z: unknown): z is string => typeof z === 'string' && z.trim() !== '').map((z: string) => z.trim()) : null
    if (!userId || zones === null) return fail('کاربر یا فهرست زون‌ها نامعتبر است')
    const target = await db.user.findUnique({ where: { id: userId } })
    if (!target) return fail('کاربر پیدا نشد', 404)
    await db.user.update({ where: { id: userId }, data: { zones: JSON.stringify(zones) } })
    await logActivity(me, 'تخصیص زون‌های شمارش', 'zone', userId, `${target.name} → ${zones.length ? zones.join('، ') : 'بدون زون'}`)
    return json({ ok: true, user: { id: userId, name: target.name, zones } })
  }

  const allowed = roles.some((r) => MANAGE_ROLES.includes(r)) || (await hasCap(me, 'oversight.manage'))
  if (!allowed) return fail('دسترسی لازم را ندارید', 403)

  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return fail('نام زون الزامی است')
  const dup = await db.zone.findUnique({ where: { name } })
  if (dup) return fail('زونی با این نام از قبل وجود دارد')

  const type = ZONE_TYPES.includes(body?.type) ? body.type : 'DRY'
  const criticality = CRITICALITIES.includes(body?.criticality) ? body.criticality : 'B'
  const countFrequency = FREQUENCIES.includes(body?.countFrequency) ? body.countFrequency : 'MONTHLY'
  const color = typeof body?.color === 'string' && HEX_RE.test(body.color) ? body.color : '#77934a'
  const minStaff = Math.min(10, Math.max(0, Math.round(Number(body?.minStaff ?? 1)) || 0))
  const notes = typeof body?.notes === 'string' ? body.notes.slice(0, 500) : ''

  const zone = await db.zone.create({ data: { name, type, criticality, countFrequency, color, minStaff, notes } })
  await logActivity(me, 'تعریف زون جدید', 'zone', zone.id, `${name} — نوع ${type} — سرعت شمارش ${countFrequency}`)
  return json({ zone: shapeZone(zone) }, 201)
}

/* ───────────────────────── PATCH ?id= ───────────────────────── */
export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const roles = [me.role, ...(me.secondaryRoles || [])]
  const allowed = roles.some((r) => MANAGE_ROLES.includes(r)) || (await hasCap(me, 'oversight.manage'))
  if (!allowed) return fail('دسترسی لازم را ندارید', 403)

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return fail('شناسهٔ زون مشخص نیست')
  const zone = await db.zone.findUnique({ where: { id } })
  if (!zone) return fail('زون پیدا نشد', 404)

  const body = await req.json().catch(() => null)
  const data: Record<string, unknown> = {}
  if (typeof body?.name === 'string' && body.name.trim()) {
    const name = body.name.trim()
    if (name !== zone.name) {
      const dup = await db.zone.findUnique({ where: { name } })
      if (dup) return fail('زونی با این نام از قبل وجود دارد')
      data.name = name
    }
  }
  if (ZONE_TYPES.includes(body?.type)) data.type = body.type
  if (CRITICALITIES.includes(body?.criticality)) data.criticality = body.criticality
  if (FREQUENCIES.includes(body?.countFrequency)) data.countFrequency = body.countFrequency
  if (typeof body?.color === 'string' && HEX_RE.test(body.color)) data.color = body.color
  if (body?.minStaff !== undefined) data.minStaff = Math.min(10, Math.max(0, Math.round(Number(body.minStaff)) || 0))
  if (typeof body?.notes === 'string') data.notes = body.notes.slice(0, 500)
  if (body?.ownerId !== undefined) {
    const ownerId = String(body.ownerId || '')
    if (ownerId) {
      const u = await db.user.findUnique({ where: { id: ownerId } })
      if (!u) return fail('کاربر مالک پیدا نشد')
      data.ownerId = ownerId
      data.ownerName = u.name
    } else {
      data.ownerId = ''
      data.ownerName = ''
    }
  }
  if (body?.backupId !== undefined) {
    const backupId = String(body.backupId || '')
    if (backupId) {
      const u = await db.user.findUnique({ where: { id: backupId } })
      if (!u) return fail('کاربر جانشین پیدا نشد')
      data.backupId = backupId
      data.backupName = u.name
    } else {
      data.backupId = ''
      data.backupName = ''
    }
  }

  const updated = await db.zone.update({ where: { id }, data })
  await logActivity(me, 'ویرایش زون', 'zone', id, `${updated.name} — ${JSON.stringify(Object.keys(data))}`)
  return json({ zone: shapeZone(updated) })
}

/* ───────────────────────── DELETE ?id= ───────────────────────── */
export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const roles = [me.role, ...(me.secondaryRoles || [])]
  const allowed = roles.some((r) => MANAGE_ROLES.includes(r)) || (await hasCap(me, 'oversight.manage'))
  if (!allowed) return fail('دسترسی لازم را ندارید', 403)

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return fail('شناسهٔ زون مشخص نیست')
  const zone = await db.zone.findUnique({ where: { id } })
  if (!zone) return fail('زون پیدا نشد', 404)

  const refCount = await db.zoneCount.count({ where: { zone: zone.name } })
  if (refCount > 0)
    return fail(`برای این زون ${faNum(refCount)} ثبت شمارش روزانه وجود دارد — حذف زون ممکن نیست؛ ابتدا سوابق را مدیریت کنید`)

  await db.zone.delete({ where: { id } })
  await logActivity(me, 'حذف زون', 'zone', id, zone.name)
  return json({ ok: true })
}
