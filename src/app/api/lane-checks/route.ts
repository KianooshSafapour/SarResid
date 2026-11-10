import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson, clampInt } from '@/lib/api'
import { getSessionUser, MANAGER_ROLES } from '@/lib/auth'
import { displayName, notify } from '@/lib/notify'
import { todayJalaliDash, addDaysJalaliDash, diffDaysJalali, toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/* ═══════════════ R8-EXPIRY — کنترل انقضای کالاها روی ردیف/طبقهٔ هر بخش ═══════════════
   بازرسی انقضا توسط چیدمان‌گر: مدیر انتخاب می‌کند کدام چیدمان‌گر، کدام بخش/ردیف را
   بررسی کرده؛ سامانه آخرین وضعیت هر (بخش، ردیف) را نگه می‌دارد و نمایش می‌دهد.
   R10-LANE: + برنامهٔ تصادفی روزانهٔ ردیف‌ها (todayPlan — هر روز ۲..۴ ردیف از
   بخش‌های هر نفر، پایدار در طول روز و متفاوت هر روز)، حالت «کارنامهٔ من» برای
   غیرمدیرها (selfMode — فقط دادهٔ خودشان)، اعلان بازرسی برای چیدمان‌گرِ بازرسی‌شده
   (+ خاموشی per-person با Setting و per-review با silent).
   GET  /api/lane-checks[?merchandiser=&section=&days=&take=]  → checks + laneStatus + sections + merchandisers + laneMap + todayPlan (+mutedUsers برای مدیران)
        غیرمدیرها (PM/SK/MERCH/…): selfMode=true — فقط دادهٔ خودشان (stats + todayPlan شخصی)
   GET  /api/lane-checks?laneMap=1                             → {defaults, base, special, map}
   PUT  /api/lane-checks?laneMap=1  {sectionLabel, lanes:[]}   → تنظیم/بازنشانی ردیف‌های یک بخش (مدیران)
   PUT  /api/lane-checks?muteUser=ID {muted:boolean}           → خاموش/روشن‌کردن اعلان بازرسی یک نفر (مدیران)
   POST /api/lane-checks            {…, silent?:boolean}       → ثبت بازرسی (فقط مدیران؛ append-only) */

/** ردیف‌های پیش‌فرض هر بخش — ۷ طبقهٔ گوندولا */
export const DEFAULT_LANES = ['طبقهٔ ۱', 'طبقهٔ ۲', 'طبقهٔ ۳', 'طبقهٔ ۴', 'طبقهٔ ۵', 'طبقهٔ ۶', 'طبقهٔ ۷']
const BATUM = 'باتوم (قفسهٔ پایانی)'
/** پیش‌فرضِ مؤثر وقتی چیزی تنظیم نشده: ۷ طبقه + باتوم */
const DEFAULT_LANES_FULL = [...DEFAULT_LANES, BATUM]
/** ردیف‌های ویژهٔ پرکاربرد برای افزودن سریع در ویرایشگر */
const SPECIAL_LANES = ['سمت چپ', 'سمت راست', BATUM]
const LANE_MAP_KEY = 'laneMap'
/** لیست کاربرانی که اعلان بازرسی برایشان خاموش است (JSON آرایه‌ای از idها) */
const MUTED_USERS_KEY = 'lanecheck.mutedUsers'
/** R13 — تکلیفِ ردیف‌ها به هر نفر: {userId: [{section, lane}]} — مدیر چند ردیفِ
 *  مشخص از بخش‌های همان نفر را برای بازبینی انقضا می‌سپارد؛ برنامهٔ روز جای
 *  نمونهٔ تصادفی را همین تکلیف می‌گیرد. خالی = همان برنامهٔ تصادفی روزانه. */
const ASSIGN_KEY = 'lanecheck.assignments'
const MAX_ASSIGN_PER_USER = 12
const MAX_LANES = 24
const MAX_LANE_NAME = 40
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** نقش‌هایی که صفحهٔ «کنترل انقضای قفسه‌ها» را می‌بینند (هماهنگ با manifest) */
const VIEW_ROLES = [...MANAGER_ROLES, 'PM', 'SK', 'MERCH']
const MERCH_ROLES = ['MERCH', 'EXEC', 'GM', 'ADMIN', 'OWNER', 'PM']
/** ترتیب نمایش چیدمان‌گرها — نیروی چیدمان اول */
const MERCH_ORDER = ['MERCH', 'PM', 'EXEC', 'GM', 'ADMIN', 'OWNER']

const STATUS_LABELS: Record<string, string> = {
  ok: 'سالم',
  needs_attention: 'نیازمند توجه',
  problem: 'مشکل دارد',
}

/* ───────────────── بخش‌های فروشگاه (ادغام همهٔ منابع) ───────────────── */

/** بلوک‌های حامل کالا (بازدیدنی برای کنترل انقضا) — همان قرارداد section-reviews */
function isProductBlock(kind: string): boolean {
  return (
    kind === 'GONDOLA' ||
    kind === 'SHELF' ||
    kind === 'FREEZER_ICECREAM' ||
    kind === 'BAKERY' ||
    kind === 'CUSTOM' ||
    kind.startsWith('FRIDGE_')
  )
}

/** مسؤول بخش از meta بلوک — رشتهٔ نام یا {name}؛ مثل liveboard */
function respNameOf(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim()
  if (raw && typeof raw === 'object') {
    const o = raw as { name?: unknown; fullName?: unknown }
    if (typeof o.name === 'string') return o.name.trim()
    if (typeof o.fullName === 'string') return o.fullName.trim()
  }
  return ''
}

/** نرمال‌سازی نام برای تطبیق: حذف نیم‌فاصله، یکسان‌سازی ی/ک عربی، فشرده‌سازی فاصله‌ها */
function normFa(s: string): string {
  return String(s ?? '')
    .replace(/\u200c/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface SectionInfo {
  label: string
  kind?: string
  zone?: string | null
  responsible?: { id: string | null; name: string } | null
}

/** بخش‌های موجود = بلوک‌های حامل کالای نقشه ∪ بخشِ کالاها ∪ بخشِ ارزیابی‌ها ∪ بخشِ بازرسی‌ها
 *  R10: هر بخشِ بلوکی، مسؤولش را هم برمی‌گرداند (تطبیق نام meta.responsible با کاربران فعال؛
 *  اگر با هیچ کاربری نخواند، با id=null و همان نام آزاد برمی‌گردد). */
async function loadSections(): Promise<SectionInfo[]> {
  const [plans, productSections, reviewBlocks, checkSections, users] = await Promise.all([
    db.floorplan.findMany({ include: { blocks: true } }),
    db.product.findMany({ where: { sectionLabel: { not: null } }, select: { sectionLabel: true }, distinct: ['sectionLabel'] }),
    db.sectionReview.findMany({ select: { blockLabel: true }, distinct: ['blockLabel'] }),
    db.laneCheck.findMany({ select: { sectionLabel: true }, distinct: ['sectionLabel'] }),
    db.user.findMany({ where: { active: true }, orderBy: { fullName: 'asc' } }),
  ])

  // نقشهٔ تطبیق نام → کاربر (نمایشی و بدون honorific؛ نام مستقل هم بخورد)
  const byDisplay = new Map<string, typeof users[number]>()
  const byFull = new Map<string, typeof users[number]>()
  for (const u of users) {
    const d = normFa(displayName(u))
    if (d && !byDisplay.has(d)) byDisplay.set(d, u)
    const f = normFa(u.fullName)
    if (f && !byFull.has(f)) byFull.set(f, u)
  }
  const resolveResp = (rawName: string): { id: string | null; name: string } | null => {
    const n = normFa(rawName)
    if (!n) return null
    const u = byDisplay.get(n) || byFull.get(n)
    return u
      ? { id: u.id, name: displayName(u) } // نامِ قاعده‌مندِ خود کاربر (honorific + fullName)
      : { id: null, name: rawName.trim() } // نام آزاد — در برنامه می‌آید اما کاربر ندارد
  }

  const map = new Map<string, SectionInfo>()
  const add = (raw: string | null | undefined, kind?: string, zone?: string | null, responsible?: SectionInfo['responsible']) => {
    const label = String(raw ?? '').trim()
    if (!label || map.has(label)) return
    map.set(label, {
      label,
      ...(kind ? { kind } : {}),
      ...(zone ? { zone } : {}),
      ...(responsible ? { responsible } : {}),
    })
  }
  for (const plan of plans) {
    for (const b of plan.blocks) {
      if (!b.label || !isProductBlock(b.kind)) continue
      const respRaw = respNameOf(safeJson<Record<string, unknown>>(b.metaJson, {}).responsible)
      add(b.label, b.kind, b.zoneName, respRaw ? resolveResp(respRaw) : null)
    }
  }
  for (const p of productSections) add(p.sectionLabel)
  for (const r of reviewBlocks) add(r.blockLabel)
  for (const c of checkSections) add(c.sectionLabel)
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'fa'))
}

/* ───────────────── نگاشت ردیف‌های هر بخش (Setting laneMap) ───────────────── */

async function readLaneMap(): Promise<Record<string, string[]>> {
  const row = await db.setting.findUnique({ where: { key: LANE_MAP_KEY } })
  const parsed = safeJson<Record<string, unknown>>(row?.value, {})
  const out: Record<string, string[]> = {}
  if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed)) {
      if (!Array.isArray(v)) continue
      const lanes = v.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, MAX_LANES)
      if (lanes.length) out[k] = lanes
    }
  }
  return out
}

async function writeLaneMap(map: Record<string, string[]>) {
  if (!Object.keys(map).length) {
    // نقشهٔ خالی = هیچ تنظیم اختصاصی؛ ردیف Setting را هم پاک می‌کنیم (DB تمیز)
    await db.setting.deleteMany({ where: { key: LANE_MAP_KEY } })
    return
  }
  const value = JSON.stringify(map)
  await db.setting.upsert({ where: { key: LANE_MAP_KEY }, create: { key: LANE_MAP_KEY, value }, update: { value } })
}

/** ردیف‌های یک بخش: تنظیم اختصاصی، وگرنه ۷ طبقه + باتوم */
function lanesFor(section: string, map: Record<string, string[]>): string[] {
  const custom = map[section]
  return Array.isArray(custom) && custom.length ? custom : DEFAULT_LANES_FULL
}

/* ───────────────── تکلیف ردیف‌ها به افراد (Setting lanecheck.assignments) ── */

export interface AssignLane {
  section: string
  lane: string
}
async function readAssignments(): Promise<Record<string, AssignLane[]>> {
  const row = await db.setting.findUnique({ where: { key: ASSIGN_KEY } })
  const parsed = safeJson<Record<string, unknown>>(row?.value, {})
  const out: Record<string, AssignLane[]> = {}
  if (parsed && typeof parsed === 'object') {
    for (const [uid, v] of Object.entries(parsed)) {
      if (!Array.isArray(v)) continue
      const lanes: AssignLane[] = []
      for (const item of v) {
        if (!item || typeof item !== 'object') continue
        const section = String((item as Record<string, unknown>).section ?? '').trim()
        const lane = String((item as Record<string, unknown>).lane ?? '').trim()
        if (section && lane) lanes.push({ section, lane })
      }
      if (lanes.length) out[uid] = lanes.slice(0, MAX_ASSIGN_PER_USER)
    }
  }
  return out
}
async function writeAssignments(map: Record<string, AssignLane[]>) {
  if (!Object.keys(map).length) {
    await db.setting.deleteMany({ where: { key: ASSIGN_KEY } })
    return
  }
  const value = JSON.stringify(map)
  await db.setting.upsert({ where: { key: ASSIGN_KEY }, create: { key: ASSIGN_KEY, value }, update: { value } })
}

/* ───────────────── خاموشی اعلان‌های بازرسی (Setting lanecheck.mutedUsers) ───────────────── */

async function readMutedUsers(): Promise<string[]> {
  const row = await db.setting.findUnique({ where: { key: MUTED_USERS_KEY } })
  const parsed = safeJson<unknown>(row?.value, [])
  return Array.isArray(parsed) ? parsed.map((x) => String(x ?? '')).filter(Boolean) : []
}

async function writeMutedUsers(ids: string[]) {
  const value = JSON.stringify([...new Set(ids)])
  await db.setting.upsert({ where: { key: MUTED_USERS_KEY }, create: { key: MUTED_USERS_KEY, value }, update: { value } })
}

/* ───────────────── تصادفِ بذری پایدار در طول روز (برنامهٔ امروز) ───────────────── */

/** FNV-1a ۳۲بیتی — بذرِ تکرارپذیر از رشتهٔ «تاریخ|شخص» */
function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/** mulberry32 — PRNG کوچک و قطعی */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface PlanLane {
  section: string
  lane: string
  checked: boolean
  status: string | null
  by: string | null
  dateJalali: string | null
}
export interface PlanPerson {
  userId: string | null
  name: string
  role: string | null
  username: string | null
  sections: string[]
  lanes: PlanLane[]
}

/** نمونهٔ تصادفی ۲..۴ ردیف از استخرِ ردیف‌های یک نفر — پایدار در طول همان روز */
function samplePlanLanes(pool: { section: string; lane: string }[], personKey: string, date: string): { section: string; lane: string }[] {
  if (!pool.length) return []
  const rand = mulberry32(hash32(`${date}|${personKey}|lanecheck-plan`))
  const target = Math.min(pool.length, 2 + Math.floor(rand() * 3)) // ۲ تا ۴ ردیف در روز
  const idx = pool.map((_, i) => i)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = idx[i]
    idx[i] = idx[j]
    idx[j] = t
  }
  return idx.slice(0, target).sort((a, b) => a - b).map((i) => pool[i])
}

/** برنامهٔ امروز: برای هر مسؤولِ بخش‌ها، تکلیفِ مشخصِ مدیر (اگر باشد) وگرنه
 *  چند ردیفِ تصادفی از مجموعهٔ ردیف‌های بخش‌هایش */
function buildTodayPlan(
  sections: SectionInfo[],
  map: Record<string, string[]>,
  todayChecks: Map<string, { status: string; merchandiserName: string; dateJalali: string }>,
  onlyUserId?: string,
  assignments?: Record<string, AssignLane[]>,
): { date: string; persons: PlanPerson[] } {
  const today = todayJalaliDash()
  // گروه‌بندی بخش‌ها بر اساس مسؤول (کاربر تطبیق‌یافته یا نام آزاد)
  const groups = new Map<string, PlanPerson>()
  for (const s of sections) {
    const resp = s.responsible
    if (!resp) continue
    const key = resp.id ?? `name:${normFa(resp.name)}`
    const existing = groups.get(key)
    if (existing) {
      existing.sections.push(s.label)
      continue
    }
    groups.set(key, {
      userId: resp.id,
      name: resp.name,
      role: null,
      username: null,
      sections: [s.label],
      lanes: [],
    })
  }

  const persons: PlanPerson[] = []
  for (const [key, g] of groups) {
    // بخش‌ها به ترتیب حروف فارسی — همان ترتیب sections
    const secs = [...new Set(g.sections)].sort((a, b) => a.localeCompare(b, 'fa'))
    /* R13: تکلیفِ مشخصِ مدیر مقدم بر نمونهٔ تصادفی — فقط ردیف‌های همچنان معتبر */
    const assigned = g.userId ? (assignments?.[g.userId] ?? []).filter((a) => secs.includes(a.section) && lanesFor(a.section, map).includes(a.lane)) : []
    const pool: { section: string; lane: string }[] = []
    for (const sec of secs) for (const lane of lanesFor(sec, map)) pool.push({ section: sec, lane })
    const picked = assigned.length ? assigned : samplePlanLanes(pool, key, today)
    g.sections = secs
    g.lanes = picked.map(({ section, lane }) => {
      const hit = todayChecks.get(`${section}||${lane}`)
      return {
        section,
        lane,
        checked: !!hit,
        status: hit?.status ?? null,
        by: hit?.merchandiserName ?? null,
        dateJalali: hit?.dateJalali ?? null,
      }
    })
    if (g.lanes.length) persons.push({ userId: g.userId, name: g.name, role: g.role, username: g.username, sections: g.sections, lanes: g.lanes })
  }
  persons.sort((a, b) => a.name.localeCompare(b.name, 'fa'))

  const filtered = onlyUserId ? persons.filter((p) => p.userId === onlyUserId) : persons
  return { date: today, persons: filtered }
}

/* ───────────────── کمک‌های تاریخ ───────────────── */

const toSlash = (s: string) => s.replace(/-/g, '/')
/** چند روز گذشته (امروز=۰)؛ تاریخ‌های خراب → null */
function daysAgoOf(dash: string): number | null {
  if (!DATE_RE.test(dash)) return null
  const d = diffDaysJalali(toSlash(todayJalaliDash()), toSlash(dash))
  return Number.isFinite(d) ? d : null
}

/** نقش/یوزرنیم اشخاص برنامه — از یک کوئریٔ سبک روی User */
async function attachRoles(persons: PlanPerson[]): Promise<void> {
  const ids = persons.map((p) => p.userId).filter((x): x is string => !!x)
  if (!ids.length) return
  const rows = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, role: true, username: true } })
  const byId = new Map(rows.map((r) => [r.id, r]))
  for (const p of persons) {
    if (!p.userId) continue
    const u = byId.get(p.userId)
    if (u) {
      p.role = u.role
      p.username = u.username
    }
  }
}

/* ═══════════ GET ═══════════ */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!VIEW_ROLES.includes(me.role)) return fail('دسترسی به این بخش ندارید', 403)

  const isMgr = MANAGER_ROLES.includes(me.role)
  const sp = req.nextUrl.searchParams

  /* حالت ویژه: فقط نگاشت ردیف‌ها */
  if (sp.get('laneMap') === '1') {
    const map = await readLaneMap()
    return ok({ defaults: DEFAULT_LANES_FULL, base: DEFAULT_LANES, special: SPECIAL_LANES, map })
  }

  const merchandiser = (sp.get('merchandiser') || '').trim()
  const section = (sp.get('section') || '').trim()
  const days = clampInt(sp.get('days'), 0, 3650, 0)
  // نکته: clampInt(null) → 0 (عددِ متناهی) و در نتیجه take=۱ می‌شد؛ پارامتر غایب = پیش‌فرض ۲۰۰
  const takeRaw = sp.get('take')
  const take = takeRaw === null ? 200 : clampInt(takeRaw, 1, 500, 200)

  const sections = await loadSections()

  /* ── حالت «کارنامهٔ من»: غیرمدیرها فقط دادهٔ خودشان را می‌بینند ── */
  if (!isMgr) {
    const mySections = sections.filter((s) => s.responsible?.id === me.id).map((s) => s.label)
    const ownWhere = {
      OR: [{ merchandiserId: me.id }, ...(mySections.length ? [{ sectionLabel: { in: mySections } }] : [])],
    } as Record<string, unknown>
    const and: Record<string, unknown>[] = [ownWhere]
    if (section) and.push({ sectionLabel: section })
    if (days > 0) and.push({ dateJalali: { gte: addDaysJalaliDash(todayJalaliDash(), -(days - 1)) } })
    const where = and.length === 1 ? ownWhere : { AND: and }

    const orderBy = [{ dateJalali: 'desc' as const }, { createdAt: 'desc' as const }]
    const [ownRows, filteredRows, statRows, map, todayChecks, assignments] = await Promise.all([
      db.laneCheck.findMany({ where: ownWhere as never, orderBy, take: 500 }),
      db.laneCheck.findMany({ where: where as never, orderBy, take }),
      db.laneCheck.findMany({ where: ownWhere as never, select: { status: true } }),
      readLaneMap(),
      db.laneCheck.findMany({ where: { dateJalali: todayJalaliDash() }, orderBy: { createdAt: 'desc' as const } }),
      readAssignments(),
    ])
    const checks = filteredRows

    // وضعیت ردیف‌ها فقط از دریچهٔ چشم خودِ او
    const laneStatus: Record<string, unknown> = {}
    for (const c of ownRows) {
      const key = `${c.sectionLabel}||${c.lane}`
      if (laneStatus[key]) continue
      laneStatus[key] = {
        sectionLabel: c.sectionLabel,
        lane: c.lane,
        status: c.status,
        dateJalali: c.dateJalali,
        daysAgo: daysAgoOf(c.dateJalali),
        merchandiserId: c.merchandiserId,
        merchandiserName: c.merchandiserName,
        expiredFound: c.expiredFound,
        nearExpiry: c.nearExpiry,
        removedQty: c.removedQty,
      }
    }

    const todayMap = new Map(todayChecks.map((c) => [`${c.sectionLabel}||${c.lane}`, { status: c.status, merchandiserName: c.merchandiserName, dateJalali: c.dateJalali } as const]))
    const todayPlan = buildTodayPlan(sections, map, todayMap, me.id, assignments)

    const stats = {
      total: statRows.length,
      ok: statRows.filter((r) => r.status === 'ok').length,
      needsAttention: statRows.filter((r) => r.status === 'needs_attention').length,
      problem: statRows.filter((r) => r.status === 'problem').length,
    }

    return ok({
      selfMode: true,
      self: { id: me.id, name: displayName(me), role: me.role, title: me.title, mySections },
      today: todayJalaliDash(),
      checks,
      laneStatus,
      sections: sections.filter((s) => mySections.includes(s.label)),
      merchandisers: [],
      laneMap: { defaults: DEFAULT_LANES_FULL, base: DEFAULT_LANES, special: SPECIAL_LANES, map },
      todayPlan,
      /* R13: تکلیفِ فعلی خودم — برای نمایش «از طرف مدیر» */
      myAssignment: assignments[me.id] ?? [],
      stats,
    })
  }

  /* ── حالت مدیران: نمای کامل + برنامهٔ امروز برای همه + لیست خاموشی‌ها ── */
  const where: Record<string, unknown> = {}
  if (merchandiser) where.merchandiserId = merchandiser
  if (section) where.sectionLabel = section
  if (days > 0) where.dateJalali = { gte: addDaysJalaliDash(todayJalaliDash(), -(days - 1)) }
  const hasFilter = Boolean(merchandiser) || Boolean(section) || days > 0

  const orderBy = [{ dateJalali: 'desc' as const }, { createdAt: 'desc' as const }]
  const [statusRows, filteredRows, map, merchUsers, todayChecks, mutedUsers, assignments] = await Promise.all([
    db.laneCheck.findMany({ orderBy, take: 500 }), // برای نقشهٔ وضعیت: بدون فیلتر (حقیقتِ «آخرین بار»)
    hasFilter ? db.laneCheck.findMany({ where: where as never, orderBy, take }) : Promise.resolve(null),
    readLaneMap(),
    db.user.findMany({
      where: { active: true, OR: [{ role: { in: MERCH_ROLES } }, { title: { contains: 'چیدمان' } }] },
      orderBy: { createdAt: 'asc' },
    }),
    db.laneCheck.findMany({ where: { dateJalali: todayJalaliDash() }, orderBy: { createdAt: 'desc' as const } }),
    readMutedUsers(),
    readAssignments(),
  ])
  const checks = (hasFilter ? filteredRows : statusRows.slice(0, take)) ?? []

  /* نقشهٔ وضعیت ردیف‌ها: برای هر (بخش، ردیف) فقط آخرین بازرسی */
  const laneStatus: Record<string, {
    sectionLabel: string; lane: string; status: string; dateJalali: string; daysAgo: number | null
    merchandiserId: string | null; merchandiserName: string; expiredFound: number; nearExpiry: number; removedQty: number
  }> = {}
  for (const c of statusRows) {
    const key = `${c.sectionLabel}||${c.lane}`
    if (laneStatus[key]) continue
    laneStatus[key] = {
      sectionLabel: c.sectionLabel,
      lane: c.lane,
      status: c.status,
      dateJalali: c.dateJalali,
      daysAgo: daysAgoOf(c.dateJalali),
      merchandiserId: c.merchandiserId,
      merchandiserName: c.merchandiserName,
      expiredFound: c.expiredFound,
      nearExpiry: c.nearExpiry,
      removedQty: c.removedQty,
    }
  }

  /* چیدمان‌گرها: نیروی چیدمان اول، بعد PM و مدیران */
  merchUsers.sort(
    (a, b) => MERCH_ORDER.indexOf(a.role) - MERCH_ORDER.indexOf(b.role) || a.fullName.localeCompare(b.fullName, 'fa'),
  )

  const todayMap = new Map(todayChecks.map((c) => [`${c.sectionLabel}||${c.lane}`, { status: c.status, merchandiserName: c.merchandiserName, dateJalali: c.dateJalali } as const]))
  const todayPlan = buildTodayPlan(sections, map, todayMap, undefined, assignments)
  await attachRoles(todayPlan.persons)

  return ok({
    today: todayJalaliDash(),
    checks,
    laneStatus,
    sections,
    merchandisers: merchUsers.map((u) => ({ id: u.id, fullName: u.fullName, honorific: u.honorific, title: u.title, role: u.role })),
    laneMap: { defaults: DEFAULT_LANES_FULL, base: DEFAULT_LANES, special: SPECIAL_LANES, map },
    todayPlan,
    mutedUsers,
    /* R13: تکلیف‌های مشخص مدیر — کل نقشه برای ویرایشگر */
    assignments,
  })
}

/* ═══════════ PUT — تنظیم ردیف‌های یک بخش / خاموشی اعلان یک نفر (فقط مدیران) ═══════════ */
export async function PUT(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!MANAGER_ROLES.includes(me.role)) return fail('این عملیات فقط برای مدیران ممکن است', 403)

  const sp = req.nextUrl.searchParams

  /* ── حالت سوم (R13): تکلیف چند ردیف مشخص به یک نفر ── */
  const assignUser = (sp.get('assign') || '').trim()
  if (assignUser) {
    const target = await db.user.findUnique({ where: { id: assignUser } })
    if (!target || !target.active) return fail('کاربر یافت نشد', 404)

    const body = (await req.json().catch(() => ({}))) as { lanes?: unknown; silent?: unknown }
    const rawLanes = Array.isArray(body.lanes) ? body.lanes : null
    if (!rawLanes) return fail('فهرست ردیف‌ها را ارسال کنید (آرایه‌ای از {section, lane})')

    const [sections, map] = await Promise.all([loadSections(), readLaneMap()])
    const known = new Set(sections.map((s) => s.label))
    const lanes: AssignLane[] = []
    for (const item of rawLanes) {
      if (!item || typeof item !== 'object') continue
      const section = String((item as Record<string, unknown>).section ?? '').trim()
      const lane = String((item as Record<string, unknown>).lane ?? '').trim()
      if (!section && !lane) continue
      if (!section || !lane) return fail('هر ردیف باید بخش و نام ردیف داشته باشد')
      if (!known.has(section)) return fail(`بخش «${section}» در فروشگاه شناخته نشد`)
      if (!lanesFor(section, map).includes(lane)) return fail(`ردیف «${lane}» برای بخش «${section}» تعریف نشده است`)
      if (lanes.some((l) => l.section === section && l.lane === lane)) continue
      lanes.push({ section, lane })
      if (lanes.length > MAX_ASSIGN_PER_USER) return fail(`برای هر نفر حداکثر ${toFaDigits(MAX_ASSIGN_PER_USER)} ردیف می‌توان تکلیف کرد`)
    }

    const all = await readAssignments()
    if (lanes.length) all[target.id] = lanes
    else delete all[target.id]
    await writeAssignments(all)

    /* اعلان برای خودِ نفر — تکلیف جدیدِ بازبینی انقضا */
    let notified = false
    if (lanes.length && body.silent !== true) {
      const mutedUsers = await readMutedUsers()
      if (!mutedUsers.includes(target.id)) {
        const row = await notify({
          userId: target.id,
          kind: `lanecheck:assign:${target.id}:${todayJalaliDash()}`,
          severity: 'info',
          title: 'تکلیف بازبینی انقضا از مدیر',
          body: `${toFaDigits(lanes.length)} ردیف برای بازبینی به شما سپرده شد: ${lanes.map((l) => `${l.section}/${l.lane}`).join(' · ')} — در «کنترل انقضای قفسه‌ها › برنامهٔ امروز»`,
          go: '#/store/lanecheck',
        })
        notified = !!row
      }
    }

    await logActivity({
      userId: me.id,
      userName: displayName(me),
      action: 'lanecheck.assign',
      actionLabel: 'تکلیف ردیف‌های انقضا',
      category: 'store',
      detail: lanes.length
        ? `${displayName(target)} — ${toFaDigits(lanes.length)} ردیف: ${lanes.map((l) => `${l.section}/${l.lane}`).join(' · ')}`
        : `${displayName(target)} — تکلیف پاک شد (بازگشت به برنامهٔ تصادفی)`,
      entityId: target.id,
    })
    return ok({ userId: target.id, lanes, assignments: all, notified })
  }

  /* ── حالت دوم: خاموش/روشن‌کردن اعلان‌های بازرسی یک نفر ── */
  const muteUser = (sp.get('muteUser') || '').trim()
  if (muteUser) {
    const target = await db.user.findUnique({ where: { id: muteUser } })
    if (!target || !target.active) return fail('کاربر یافت نشد', 404)

    const body = (await req.json().catch(() => ({}))) as { muted?: unknown }
    const muted = body.muted === undefined ? true : !!body.muted

    const current = await readMutedUsers()
    const next = muted
      ? [...new Set([...current, target.id])]
      : current.filter((id) => id !== target.id)
    // فهرست خالی = هیچ خاموشی؛ کلید را هم نگه نمی‌داریم (DB تمیز، مثل laneMap)
    if (next.length) await writeMutedUsers(next)
    else await db.setting.deleteMany({ where: { key: MUTED_USERS_KEY } })

    await logActivity({
      userId: me.id,
      userName: displayName(me),
      action: 'lanecheck.mute',
      actionLabel: 'اعلان‌های بازرسی',
      category: 'store',
      detail: `${displayName(target)} — ${muted ? 'خاموش' : 'روشن'}`,
      entityId: target.id,
    })
    return ok({ userId: target.id, muted, mutedUsers: next })
  }

  /* ── حالت اول (موجود): تنظیم ردیف‌های یک بخش ── */
  if (sp.get('laneMap') !== '1') return fail('پارامتر نامعتبر — از ?laneMap=1 یا ?muteUser=ID استفاده کنید')

  const body = (await req.json().catch(() => ({}))) as { sectionLabel?: unknown; lanes?: unknown }
  const sectionLabel = String(body.sectionLabel ?? '').trim()
  if (!sectionLabel) return fail('بخش را انتخاب کنید')
  if (sectionLabel.length > 80) return fail('نام بخش خیلی طولانی است')
  if (!Array.isArray(body.lanes)) return fail('فهرست ردیف‌ها را ارسال کنید')

  const lanes: string[] = []
  for (const item of body.lanes) {
    const name = String(item ?? '').trim()
    if (!name) continue
    if (name.length > MAX_LANE_NAME) return fail(`نام ردیف خیلی طولانی است (حداکثر ${toFaDigits(MAX_LANE_NAME)} حرف)`)
    if (lanes.includes(name)) continue
    lanes.push(name)
    if (lanes.length > MAX_LANES) return fail(`برای هر بخش حداکثر ${toFaDigits(MAX_LANES)} ردیف می‌توان تعریف کرد`)
  }

  const map = await readLaneMap()
  const reset = lanes.length === 0 // فهرست خالی = حذف تنظیم اختصاصی (بازگشت به پیش‌فرض)
  if (reset) delete map[sectionLabel]
  else map[sectionLabel] = lanes
  await writeLaneMap(map)

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'lanecheck.lanemap',
    actionLabel: 'تعریف ردیف‌های بخش',
    category: 'store',
    detail: reset
      ? `${sectionLabel} — بازنشانی به پیش‌فرض (${toFaDigits(DEFAULT_LANES_FULL.length)} ردیف)`
      : `${sectionLabel} — ${toFaDigits(lanes.length)} ردیف: ${lanes.join(' · ')}`,
    entityId: sectionLabel,
  })
  return ok({ sectionLabel, lanes, reset, map })
}

/* ═══════════ POST — ثبت بازرسی (فقط مدیران؛ سابقهٔ append-only) ═══════════ */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!MANAGER_ROLES.includes(me.role)) return fail('ثبت بازرسی فقط برای مدیران ممکن است', 403)

  const body = (await req.json().catch(() => ({}))) as {
    merchandiserId?: unknown; merchandiserName?: unknown
    sectionLabel?: unknown; lane?: unknown; status?: unknown
    expiredFound?: unknown; nearExpiry?: unknown; removedQty?: unknown; note?: unknown
    silent?: unknown
  }

  const sectionLabel = String(body.sectionLabel ?? '').trim()
  if (!sectionLabel) return fail('بخش (قفسه) را انتخاب کنید')
  const lane = String(body.lane ?? '').trim()
  if (!lane) return fail('ردیف (طبقه) را انتخاب کنید')

  const [sections, map] = await Promise.all([loadSections(), readLaneMap()])
  if (!sections.some((s) => s.label === sectionLabel)) return fail(`بخش «${sectionLabel}» در فروشگاه شناخته نشد`)
  const allowed = lanesFor(sectionLabel, map)
  /* R15: ردیف ساختاری «سمت چپ|راست · طبقهٔ N / ستون M» بدون تعریف در ویرایشگر پذیرفته
     می‌شود — گوندولا‌ها دو سمت دارند و هر طبقه چند ستون؛ مدیر برای بازبینی انقضا
     همان ترکیب را در فرم می‌چیند. */
  const STRUCTURED_LANE_RE = /^(سمت (چپ|راست) · )?طبقهٔ [۱-۷]( \/ ستون [۱-۹]\d?)?$/
  if (!allowed.includes(lane) && !STRUCTURED_LANE_RE.test(lane)) {
    return fail(`ردیف «${lane}» برای بخش «${sectionLabel}» تعریف نشده است`)
  }

  const status = body.status === undefined || body.status === null || String(body.status) === '' ? 'ok' : String(body.status)
  if (!STATUS_LABELS[status]) return fail('وضعیت بازرسی باید یکی از «سالم»، «نیازمند توجه» یا «مشکل دارد» باشد')

  /* بازرس: id معتبر → نام از همان کاربر؛ وگرنه نام آزاد اجباری */
  let merchandiserId: string | null = null
  let merchandiserName = String(body.merchandiserName ?? '').trim()
  if (body.merchandiserId) {
    const u = await db.user.findUnique({ where: { id: String(body.merchandiserId) } })
    if (!u || !u.active) return fail('چیدمان‌گر یافت نشد', 404)
    merchandiserId = u.id
    merchandiserName = displayName(u)
  }
  if (!merchandiserName) return fail('چیدمان‌گر (بازرس) را انتخاب کنید')

  const expiredFound = clampInt(body.expiredFound, 0, 100_000, 0)
  const nearExpiry = clampInt(body.nearExpiry, 0, 100_000, 0)
  const removedQty = clampInt(body.removedQty, 0, 100_000, 0)
  const note = String(body.note ?? '').trim().slice(0, 500) || null
  const silent = body.silent === true

  const check = await db.laneCheck.create({
    data: {
      dateJalali: todayJalaliDash(),
      merchandiserId,
      merchandiserName,
      sectionLabel,
      lane,
      status,
      expiredFound,
      nearExpiry,
      removedQty,
      note,
      createdById: me.id,
      createdByName: displayName(me),
    },
  })

  /* اعلان بازرسی برای چیدمان‌گرِ بازرسی‌شده — مگر این‌که silent باشد یا کاربر خاموش باشد */
  let notified = false
  if (merchandiserId && !silent) {
    const mutedUsers = await readMutedUsers()
    if (!mutedUsers.includes(merchandiserId)) {
      const parts = [`بخش «${sectionLabel}» / ردیف «${lane}» — وضعیت: ${STATUS_LABELS[status] || status}`]
      if (expiredFound) parts.push(`تاریخ‌گذشته ${toFaDigits(expiredFound)}`)
      if (nearExpiry) parts.push(`نزدیک انقضا ${toFaDigits(nearExpiry)}`)
      parts.push(`ثبت‌کننده: ${displayName(me)}`)
      const row = await notify({
        userId: merchandiserId,
        kind: `lanecheck:${check.id}`,
        severity: status === 'problem' ? 'warning' : 'info',
        title: 'بازرسی جدید ثبت شد',
        body: parts.join(' · '),
        go: '#/store/lanecheck',
      })
      notified = !!row
    }
  }

  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'lanecheck.create',
    actionLabel: 'بازرسی انقضای ردیف',
    category: 'store',
    detail: `${sectionLabel} / ${lane} — ${STATUS_LABELS[status]}`
      + (expiredFound ? ` · تاریخ‌گذشته ${toFaDigits(expiredFound)}` : '')
      + (nearExpiry ? ` · نزدیک انقضا ${toFaDigits(nearExpiry)}` : '')
      + (removedQty ? ` · جمع‌آوری ${toFaDigits(removedQty)}` : '')
      + ` — بازرس: ${merchandiserName}`
      + (silent ? ' · بی‌اعلان' : ''),
    entityId: check.id,
  })
  return ok({ check, notified, silent })
}
