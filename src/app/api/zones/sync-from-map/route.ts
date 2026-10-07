import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { hasCap } from '@/lib/rbac'

/* ─────────────────────────────────────────────────────────────────────────────
 *  POST /api/zones/sync-from-map — «استنتاج هوشمند نوع زون از ساختار فروشگاه»
 *  زون‌های شمارش را از پلان واقعی طراحی‌شده در ویرایشگر «پلان فروشگاه» می‌سازد/به‌روز می‌کند.
 *
 *  قواعد استنتاج نوع زون از تجهیزات (kinds) بلوک‌های هم‌زون:
 *    ۱) CHECKOUT | CASHIER_U            → 'CHECKOUT'   (خط صندوق)
 *    ۲) یخچال/فریزر/میوه/پروتئین/نان    → 'PERISHABLE' (سرد و فاسدشدنی)
 *       FRIDGE_CLOSED, FRIDGE_OPEN, FRIDGE_SHOWCASE, FREEZER_ICECREAM, PRODUCE, DELI, BAKERY
 *    ۳) ENTRANCE                        → 'DECOMPRESSION' (نوار ورود — زون تنفس آندرهیل)
 *    ۴) STORAGE                         → 'BACKROOM'   (انبار/بارگیر)
 *    ۵) GONDOLA | AISLE | SHELF         → اگر مرکز جرم زون در میانهٔ ۵۰٪ عرض پلانِ اصلیِ خودش باشد
 *         و زون ≥ ۲ گاندولا داشته باشد → 'POWER_AISLE' (راهروی قدرت)؛ وگرنه 'DRY'
 *    ۶) بقیه (CUSTOM و…)                → 'DRY'
 *   اولویت استنتاج به همین ترتیب است (صندوق > سرد > ورود > انبار > گاندولا).
 *
 *  زون موجود (هم‌نام): فقط type به‌روز می‌شود — مالک/جانشین/شدت/رنگ/سایر دست‌نخورده می‌ماند.
 *  زون جدید: criticality 'A' برای PERISHABLE/CHECKOUT و 'C' برای BACKROOM و 'B' بقیه؛
 *    countFrequency بر اساس شدت: A=WEEKLY، B=BIWEEKLY، C=MONTHLY؛ رنگ = هش قطعی نام؛ minStaff = ۱.
 *
 *  زون‌هایی که هیچ بلوکی در پلان ندارند (مثلاً زون‌های دسته‌ای) دست‌نخورده می‌مانند.
 *  دسترسی: OM/GM/OWNER/ADMIN یا cap 'oversight.manage' — بقیه ۴۰۳.
 * ────────────────────────────────────────────────────────────────────────────*/

const MANAGE_ROLES = ['OM', 'GM', 'OWNER', 'ADMIN']

/* تجهیزات هر قاعدهٔ استنتاج */
const CHECKOUT_KINDS = new Set(['CHECKOUT', 'CASHIER_U'])
const PERISHABLE_KINDS = new Set(['FRIDGE_CLOSED', 'FRIDGE_OPEN', 'FRIDGE_SHOWCASE', 'FREEZER_ICECREAM', 'PRODUCE', 'DELI', 'BAKERY'])
const AISLE_KINDS = new Set(['GONDOLA', 'AISLE', 'SHELF'])

/** پالت زون — عیناً همان hashZoneColor کلاینت (ویرایشگر پلان/Canvas) تا رنگ‌ها یکسان بمانند */
const ZONE_PALETTE = ['#0e7a4a', '#c9a227', '#c96f4a', '#77934a', '#b3372f', '#2e6f6a', '#8a6d10', '#6b5b3e', '#a5573a', '#4d9a90', '#5a8f3c', '#9c8b6a']

function hashZoneColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return ZONE_PALETTE[h % ZONE_PALETTE.length]
}

type Vertex = { x: number; y: number }

/** پارس امن shape پلان — نامعتبر = [] یعنی مستطیلی */
function parseShape(raw: unknown): Vertex[] {
  let arr: unknown = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  const out: Vertex[] = []
  for (const v of arr) {
    const x = Number((v as Vertex)?.x)
    const y = Number((v as Vertex)?.y)
    if (isFinite(x) && isFinite(y)) out.push({ x, y })
  }
  return out.length >= 3 ? out : []
}

/** محدودهٔ افقی پلان برای آزمون «میانهٔ ۵۰٪ عرض» — از bbox چندضلعی یا width */
function planSpanX(plan: { width: number; shape: string }): { minX: number; maxX: number } {
  const v = parseShape(plan.shape)
  if (v.length >= 3) {
    let minX = Infinity
    let maxX = -Infinity
    for (const p of v) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
    }
    return { minX, maxX }
  }
  return { minX: 0, maxX: Math.max(1, plan.width) }
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const roles = [me.role, ...(me.secondaryRoles || [])]
  const allowed = roles.some((r) => MANAGE_ROLES.includes(r)) || (await hasCap(me, 'oversight.manage'))
  if (!allowed) return fail('همگام‌سازی زون‌ها فقط برای مدیران مجاز است', 403)

  /* همهٔ پلان‌های غیربایگانی + بلوک‌هایشان */
  const plans = await db.floorPlan.findMany({ where: { archived: false }, orderBy: { floorIndex: 'asc' } })
  const allBlocks = await db.floorBlock.findMany()
  const blocksByPlan = new Map<string, typeof allBlocks>()
  for (const b of allBlocks) {
    const list = blocksByPlan.get(b.planId) || []
    list.push(b)
    blocksByPlan.set(b.planId, list)
  }

  /* گروه‌بندی بلوک‌ها بر اساس نام زون (بلوک‌های بدون زون نادیده گرفته می‌شوند) */
  type ZoneAgg = { kinds: Set<string>; count: number; centroidXSum: number; planCounts: Map<string, number>; gondolas: number }
  const zonesAgg = new Map<string, ZoneAgg>()
  for (const b of allBlocks) {
    const zn = (b.zoneName || '').trim()
    if (!zn) continue
    let agg = zonesAgg.get(zn)
    if (!agg) {
      agg = { kinds: new Set(), count: 0, centroidXSum: 0, planCounts: new Map(), gondolas: 0 }
      zonesAgg.set(zn, agg)
    }
    agg.kinds.add(b.kind)
    agg.count++
    agg.centroidXSum += b.x + b.w / 2
    if (b.kind === 'GONDOLA') agg.gondolas++
    agg.planCounts.set(b.planId, (agg.planCounts.get(b.planId) || 0) + 1)
  }

  /* استنتاج نوع هر زون + upsert */
  const createdRows: string[] = []
  const updatedRows: string[] = []
  const zoneResults: Array<{ name: string; type: string; blockCount: number }> = []

  // ترتیب قطعی (الفبای فارسی) برای خروجی/گزارش
  const orderedNames = [...zonesAgg.keys()].sort((a, b) => a.localeCompare(b, 'fa'))
  for (const name of orderedNames) {
    const agg = zonesAgg.get(name)!
    const kinds = [...agg.kinds]

    /* «استنتاج هوشمند نوع زون از ساختار فروشگاه» — به ترتیب اولویت قواعد */
    let type = 'DRY'
    if (kinds.some((k) => CHECKOUT_KINDS.has(k))) {
      type = 'CHECKOUT'
    } else if (kinds.some((k) => PERISHABLE_KINDS.has(k))) {
      type = 'PERISHABLE'
    } else if (agg.kinds.has('ENTRANCE')) {
      type = 'DECOMPRESSION'
    } else if (agg.kinds.has('STORAGE')) {
      type = 'BACKROOM'
    } else if (kinds.some((k) => AISLE_KINDS.has(k))) {
      // راهروی قدرت: ≥۲ گاندولا + مرکز جرم زون در میانهٔ ۵۰٪ عرض پلان اصلیِ خودش
      let mainPlanId = ''
      let mainCount = 0
      for (const [pid, c] of agg.planCounts) if (c > mainCount) [mainPlanId, mainCount] = [pid, c]
      const mainPlan = plans.find((p) => p.id === mainPlanId)
      const span = planSpanX(mainPlan || { width: 1200, shape: '[]' })
      const mid = (span.minX + span.maxX) / 2
      const halfRange = (span.maxX - span.minX) * 0.25
      const centroidX = agg.centroidXSum / agg.count
      const inMiddle = centroidX >= mid - halfRange && centroidX <= mid + halfRange
      type = agg.gondolas >= 2 && inMiddle ? 'POWER_AISLE' : 'DRY'
    }

    const existing = await db.zone.findUnique({ where: { name } })
    if (existing) {
      // زون موجود: فقط نوع — مالک/جانشین/شدت/فرکانس/رنگ دست نمی‌خورد
      if (existing.type !== type) {
        await db.zone.update({ where: { name }, data: { type } })
        updatedRows.push(`${name}: ${existing.type}→${type}`)
      }
    } else {
      // زون جدید: مقادیر پیش‌فرض هوشمند بر اساس نوع استنتاج‌شده
      const criticality = type === 'PERISHABLE' || type === 'CHECKOUT' ? 'A' : type === 'BACKROOM' ? 'C' : 'B'
      const countFrequency = criticality === 'A' ? 'WEEKLY' : criticality === 'B' ? 'BIWEEKLY' : 'MONTHLY'
      await db.zone.create({
        data: { name, type, criticality, countFrequency, color: hashZoneColor(name), minStaff: 1 },
      })
      createdRows.push(`${name}(${type})`)
    }
    zoneResults.push({ name, type, blockCount: agg.count })
  }

  const floors = plans.map((p) => ({ id: p.id, name: p.name, blockCount: (blocksByPlan.get(p.id) || []).length }))

  await logActivity(
    me,
    'همگام‌سازی زون‌ها از نقشهٔ فروشگاه',
    'zone',
    'map',
    `ایجاد: ${createdRows.length}، به‌روزرسانی نوع: ${updatedRows.length}${createdRows.length ? ` — جدیدها: ${createdRows.join('، ')}` : ''}${updatedRows.length ? ` — تغییر نوع: ${updatedRows.join('، ')}` : ''}`
  )

  return json({ created: createdRows.length, updated: updatedRows.length, zones: zoneResults, floors })
}
