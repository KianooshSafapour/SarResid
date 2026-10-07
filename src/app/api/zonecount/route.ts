import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { guardCap, hasCap } from '@/lib/rbac'
import { emitNotif, oversightUsers } from '@/lib/notif-engine'
import { addDaysIso, todayIso } from '@/lib/jalali'

/**
 * شمارش کورِ روزانهٔ زون (Blind Zone Count) — جدا از شمارش چرخه‌ای مدیران (Science)
 *
 * اصل طلایی (sacred invariant): systemQty / diff / status / within / tolerance هرگز به
 * نقش‌های غیرمدیریتی (MERCH/SALES/…) ارسال نمی‌شود تا شمارش بی‌طرف بماند (پیشگیری از
 * سوگیری لنگر). فقط پرچم ok هر قلم، هشدار کلی مغایرت، و فیلدهای نظارتیِ بدون عدد
 * (recheckCount، mismatchReason — متن خود کارمند، confirmStatus، confirmNote) برمی‌گردد.
 *
 * جریان مغایرت (mismatch flow) — قرارداد سه‌مرحله‌ای، همه کور:
 *   ۱) ثبت اول با مغایرت و بدون recheck → ذخیرهٔ MISMATCH + {needRecheck:true}
 *      «عدد شما با سامانه نمی‌خواند — دوباره بشمارید»
 *   ۲) ثبت دوم با recheck:true و بدون reason → recheckCount=1 + {needReason:true}
 *      «لطفاً دلیل مغایرت را بنویسید»
 *   ۳) ثبت سوم با recheck:true و reason → recheckCount=2 + mismatchReason=reason (نهایی)
 *      → emitNotif zonecount.mismatch با fieldRefs oversight
 * هیچ‌کدام از پاسخ‌ها عدد سیستم ندارند.
 *
 * نظارت (Oversight): ادمین تعیین می‌کند چه کسی آمار کارکنان را تأیید کند (مثلاً حسابدار).
 * PATCH action:'confirm'|'query' فقط با cap 'zonecount.confirm' (نقش‌های اجرایی خودکار دارند).
 * دارندگان cap ولی غیرمدیر (مثل ACC) دادهٔ تیمی را «کور» می‌بینند + فیلدهای نظارتی.
 */

const MANAGER_ROLES = ['SK', 'OM', 'GM', 'PM', 'OWNER']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type ZoneItem = {
  productId: string
  productName: string
  unit: string
  countedQty: number
  systemQty: number
  diff: number
  within: boolean
}

type CountRow = {
  id: string
  forDate: string
  zone: string
  userId: string
  userName: string
  items: string
  status: string
  mismatchCount: number
  totalItems: number
  tolerance: number
  recheckCount: number
  mismatchReason: string
  confirmStatus: string
  confirmedById: string
  confirmedByName: string
  confirmedAt: string
  confirmNote: string
  createdAt: Date
  updatedAt: Date
}

const isManagerRole = (me: { role: string; secondaryRoles: string[] }) =>
  MANAGER_ROLES.includes(me.role) || (me.secondaryRoles || []).some((r) => MANAGER_ROLES.includes(r))

/** نسخهٔ کور برای شمارنده: بدون systemQty/diff/status — فقط پرچم ok هر قلم + فیلدهای نظارتیِ بی‌عدد */
function sanitizeEntry(e: CountRow, blind: boolean) {
  const items = safeParse<ZoneItem[]>(e.items, [])
  const base = {
    id: e.id,
    forDate: e.forDate,
    zone: e.zone,
    userName: e.userName,
    totalItems: e.totalItems,
    hasMismatch: e.status === 'MISMATCH',
    createdAt: e.createdAt,
    // فیلدهای نظارتی — هیچ عدد موجودی/سیستمی نیستند:
    recheckCount: e.recheckCount,
    mismatchReason: e.mismatchReason, // متن خود کارمند (برای خودش قابل مشاهده)
    confirmStatus: e.confirmStatus, // PENDING | CONFIRMED | QUERIED
    confirmNote: e.confirmNote, // فقط متن — ناظر سوال دارد
    confirmedByName: e.confirmedByName,
    confirmedAt: e.confirmedAt,
  }
  if (blind) {
    return {
      ...base,
      mismatchCount: 0,
      items: items.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        unit: it.unit,
        countedQty: it.countedQty,
        ok: !!it.within,
      })),
    }
  }
  return { ...base, status: e.status, mismatchCount: e.mismatchCount, tolerance: e.tolerance, items }
}

/* ───────────────────────── GET ─────────────────────────
 * ?zone=<دستهٔ کالا>  (اختیاری — محصولات همان زون)
 * ?date=yyyy-mm-dd   (اختیاری — پیش‌فرض امروز)
 * ?mine=1            (اختیاری — فقط داده‌های خودم، بدون تیم)
 */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const manager = isManagerRole(me)
  // دارندگان cap نظارت (مثلاً حسابدار) — غیرمدیر ولی تأییدکننده: دادهٔ تیمی «کور» با فیلدهای نظارتی
  const confirmHolder = !manager && (await hasCap(me, 'zonecount.confirm'))
  const url = new URL(req.url)
  const date = DATE_RE.test(url.searchParams.get('date') || '') ? (url.searchParams.get('date') as string) : todayIso()
  const zone = url.searchParams.get('zone') || ''
  const mineOnly = url.searchParams.get('mine') === '1'

  const meRecord = await db.user.findUnique({ where: { id: me.id } })
  const myZonesSaved = safeParse<string[]>(meRecord?.zones || '[]', [])

  const catRows = await db.product.findMany({
    where: { active: true },
    distinct: ['category'],
    select: { category: true },
    orderBy: { category: 'asc' },
  })
  const zones = catRows.map((c) => c.category).filter(Boolean)
  const myZones = manager || myZonesSaved.length === 0 ? zones : zones.filter((z) => myZonesSaved.includes(z))

  // محصولات زون انتخابی — موجودی هلو فقط برای مدیران (بقیه: شمارش کور)
  let products: Array<{ id: string; name: string; unit: string; category: string; stock?: number }> = []
  if (zone) {
    const rows = await db.product.findMany({
      where: { category: zone, active: true },
      select: { id: true, name: true, unit: true, category: true, stock: true },
      orderBy: { name: 'asc' },
    })
    products = manager
      ? rows
      : rows.map((p) => ({ id: p.id, name: p.name, unit: p.unit, category: p.category }))
  }

  const myTodayRows = await db.zoneCount.findMany({
    where: { userId: me.id, forDate: date },
    orderBy: { updatedAt: 'desc' },
  })
  const myToday = zone ? myTodayRows.find((e) => e.zone === zone) || null : null

  const teamTodayRows =
    (manager || confirmHolder) && !mineOnly
      ? await db.zoneCount.findMany({ where: { forDate: date }, orderBy: { updatedAt: 'desc' } })
      : []

  const historyRows = await db.zoneCount.findMany({
    where: { userId: me.id },
    orderBy: [{ forDate: 'desc' }, { updatedAt: 'desc' }],
    take: 20,
  })

  const teamHistoryRows =
    manager && !mineOnly
      ? await db.zoneCount.findMany({
          where: { forDate: { gte: addDaysIso(-13, date) } },
          orderBy: [{ forDate: 'desc' }, { updatedAt: 'desc' }],
          select: {
            forDate: true,
            zone: true,
            userName: true,
            status: true,
            mismatchCount: true,
            totalItems: true,
            recheckCount: true,
            mismatchReason: true,
            confirmStatus: true,
          },
        })
      : []

  // آمار: زنجیرهٔ روزهای پیوسته (از امروز؛ اگر امروز ثبت نشده از دیروز)
  const allMine = await db.zoneCount.findMany({
    where: { userId: me.id },
    select: { forDate: true, status: true, totalItems: true },
  })
  const days = [...new Set(allMine.map((e) => e.forDate))]
  let myStreak = 0
  let cursor = todayIso()
  if (!days.includes(cursor)) cursor = addDaysIso(-1, cursor)
  while (days.includes(cursor)) {
    myStreak++
    cursor = addDaysIso(-1, cursor)
  }
  const myMismatchDays = new Set(allMine.filter((e) => e.status === 'MISMATCH').map((e) => e.forDate)).size
  const todayItems = allMine.filter((e) => e.forDate === date).reduce((s, e) => s + e.totalItems, 0)

  const blind = !manager
  return json({
    zones,
    myZones,
    products,
    myToday: myToday ? sanitizeEntry(myToday, blind) : null,
    myTodayZones: myTodayRows.map((e) => e.zone),
    teamToday: teamTodayRows.map((e) => sanitizeEntry(e, blind)),
    history: historyRows.map((e) => sanitizeEntry(e, blind)),
    teamHistory: teamHistoryRows,
    stats: { myStreak, myTotal: allMine.length, myMismatchDays, todayItems },
    today: date,
    canConfirm: manager || confirmHolder,
  })
}

/* ───────────────────────── POST ─────────────────────────
 * { zone, items: [{productId, countedQty}], tolerance?, silent?, date?,
 *   recheck?: boolean («بله دوباره شمردم»), reason?: string (دلیل نهایی مغایرت) }
 * upsert ثبتِ (امروز، زون، من) — محاسبهٔ سمت سرور: systemQty از Product.stock (موجودی هلو)
 */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json().catch(() => null)
  const zone = typeof body?.zone === 'string' ? body.zone.trim() : ''
  if (!zone) return fail('زون انتخاب نشده است')
  const rawItems: Array<{ productId?: unknown; countedQty?: unknown }> = Array.isArray(body?.items) ? body.items : []
  if (!rawItems.length) return fail('هیچ عددی برای ثبت وارد نشده است')

  const manager = isManagerRole(me)
  const meRecord = await db.user.findUnique({ where: { id: me.id } })
  const myZonesSaved = safeParse<string[]>(meRecord?.zones || '[]', [])
  if (!manager && myZonesSaved.length > 0 && !myZonesSaved.includes(zone))
    return fail('این زون به شما تخصیص نیافته است — با مدیر خود هماهنگ کنید', 403)

  const forDate = DATE_RE.test(body?.date || '') ? (body.date as string) : todayIso()
  const tolerance = Math.min(20, Math.max(0, Number(body?.tolerance ?? 2) || 2))

  const ids = [...new Set(rawItems.map((i) => String(i?.productId || '')).filter(Boolean))]
  const prods = await db.product.findMany({ where: { id: { in: ids } } })
  const byId = new Map(prods.map((p) => [p.id, p]))

  const items: ZoneItem[] = []
  for (const ri of rawItems) {
    const p = byId.get(String(ri?.productId || ''))
    if (!p) continue
    const countedQty = Math.max(0, Math.round(Number(ri?.countedQty) || 0))
    const systemQty = p.stock
    const diff = countedQty - systemQty
    // تلورانس درصدی: |diff| <= max(1, round(systemQty × tolerance٪))
    const allowed = Math.max(1, Math.round((Math.abs(systemQty) * tolerance) / 100))
    items.push({
      productId: p.id,
      productName: p.name,
      unit: p.unit,
      countedQty,
      systemQty,
      diff,
      within: Math.abs(diff) <= allowed,
    })
  }
  if (!items.length) return fail('هیچ قلم معتبری برای این زون پیدا نشد')

  const mismatchCount = items.filter((i) => !i.within).length
  const mismatch = mismatchCount > 0
  const status = mismatch ? 'MISMATCH' : 'MATCHED'

  const existing = await db.zoneCount.findUnique({
    where: { forDate_zone_userId: { forDate, zone, userId: me.id } },
  })

  // ── قرارداد جریان مغایرت (کور — بدون هیچ عدد سیستمی در پاسخ) ──
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  const recheck = body?.recheck === true

  let needRecheck = false
  let needReason = false
  let finalMismatch = false
  let recheckCount = existing?.recheckCount ?? 0
  let mismatchReason: string | undefined // undefined = دست نزن (حفظ مقدار قبلی)

  if (mismatch) {
    if (reason) {
      // مرحلهٔ ۳ — ثبت نهایی با دلیل
      recheckCount = 2
      mismatchReason = reason
      finalMismatch = true
    } else if (recheck) {
      // مرحلهٔ ۲ — دوباره شمرده شد و باز مغایرت
      recheckCount = Math.max(existing?.recheckCount ?? 0, 1)
      needReason = true
    } else {
      // مرحلهٔ ۱ — اولین مغایرت
      needRecheck = true
    }
  } else {
    // مطابق شد — چرخهٔ مغایرت از نو
    recheckCount = 0
    mismatchReason = ''
  }

  const createData = {
    forDate,
    zone,
    userId: me.id,
    userName: me.name,
    items: JSON.stringify(items),
    status,
    mismatchCount,
    totalItems: items.length,
    tolerance,
    recheckCount,
    mismatchReason: mismatchReason ?? '',
    confirmStatus: 'PENDING',
    confirmNote: '',
  }
  // در مغایرت، وضعیت تأیید/یادداشت ناظر حفظ می‌شود (کارمند در جریان اصلاح است)؛
  // با مطابق‌شدن، چرخهٔ تأیید از نو (PENDING).
  const updateData: Record<string, unknown> = {
    items: JSON.stringify(items),
    status,
    mismatchCount,
    totalItems: items.length,
    tolerance,
    recheckCount,
  }
  if (mismatchReason !== undefined) updateData.mismatchReason = mismatchReason
  if (!mismatch) {
    updateData.confirmStatus = 'PENDING'
    updateData.confirmNote = ''
  }

  const entry = await db.zoneCount.upsert({
    where: { forDate_zone_userId: { forDate, zone, userId: me.id } },
    create: createData,
    update: updateData,
  })

  if (!body?.silent) {
    if (finalMismatch) {
      await logActivity(
        me,
        'مغایرت شمارش زون — ثبت نهایی با دلیل',
        'zonecount',
        entry.id,
        `زون ${zone} — ${mismatchCount} قلم مغایر — دوباره‌شماری انجام شد — دلیل: ${reason || 'ثبت نشده'} (عدد برای شمارنده ارسال نشد)`
      )
    } else if (mismatch) {
      await logActivity(
        me,
        needReason ? 'دوباره‌شماری زون — همچنان مغایر' : 'هشدار مغایرت شمارش زون',
        'zonecount',
        entry.id,
        `زون ${zone} — ${mismatchCount} قلم مغایر (عدد برای مرچندایزر ارسال نشد)`
      )
    } else {
      await logActivity(me, 'ثبت شمارش روزانهٔ زون', 'zonecount', entry.id, `زون ${zone} — مطابق موجودی هلو`)
    }
  }

  // اعلان نظارت — فقط روی مغایرت نهایی (با دلیل)؛ قاعدهٔ zonecount.mismatch + fieldRef oversight
  if (finalMismatch) {
    const oversight = await oversightUsers('zonecount')
    await emitNotif({
      event: 'zonecount.mismatch',
      title: `مغایرت شمارش زون — ${zone}`,
      detail: `${me.name} — ${mismatchCount} قلم مغایر — دلیل: ${reason || 'ثبت نشده'}`,
      go: '#/zonecount',
      fieldRefs: { oversight },
    })
  }

  const message = !mismatch
    ? 'شمارش شما با موجودی هلو مطابق بود — آفرین 🌿'
    : finalMismatch
      ? 'مغایرت همراه با دلیل شما ثبت شد و برای مدیریت/ناظر ارسال شد — ممنون از دقت‌تان 🌿'
      : needReason
        ? 'دوباره شمرده شد و باز هم مغایرت است — لطفاً دلیل مغایرت را بنویسید'
        : 'عدد شما با سامانه نمی‌خواند — لطفاً همهٔ اقلام زون را دوباره بشمارید'

  return json({
    entry: sanitizeEntry(entry, !manager),
    hasMismatch: mismatch,
    // پرچم‌های جریان مغایرت — فقط وقتی true فرستاده می‌شوند (قرارداد تمیز)
    ...(needRecheck ? { needRecheck: true } : {}),
    ...(needReason ? { needReason: true } : {}),
    ...(finalMismatch ? { finalMismatch: true } : {}),
    message,
  })
}

/* ───────────────────────── PATCH ─────────────────────────
 * {id, action:'confirm'|'query', note?} — نظارت: تأیید آمار یا سؤال از شمارنده
 * cap 'zonecount.confirm' (نقش‌های اجرایی خودکار دارند؛ ادمین تعیین می‌کند چه کسی دارد)
 */
export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const capErr = await guardCap(me, 'zonecount.confirm')
  if (capErr) return fail(capErr, 403)

  const body = await req.json().catch(() => null)
  const id = String(body?.id || '')
  const action = body?.action
  if (!id) return fail('شناسهٔ ثبت مشخص نیست')
  if (action !== 'confirm' && action !== 'query') return fail('عملیات نامعتبر است')
  const entry = await db.zoneCount.findUnique({ where: { id } })
  if (!entry) return fail('ثبت پیدا نشد', 404)

  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : ''
  const nowIso = new Date().toISOString()

  const updated =
    action === 'confirm'
      ? await db.zoneCount.update({
          where: { id },
          data: {
            confirmStatus: 'CONFIRMED',
            confirmedById: me.id,
            confirmedByName: me.name,
            confirmedAt: nowIso,
            confirmNote: note,
          },
        })
      : await db.zoneCount.update({
          where: { id },
          data: {
            confirmStatus: 'QUERIED',
            confirmNote: note || 'لطفاً شمارش را دوباره بررسی و ثبت کنید',
          },
        })

  if (action === 'confirm') {
    await logActivity(me, 'تأیید آمار شمارش زون', 'zonecount', id, `زون ${entry.zone} — ${entry.userName} — ${entry.forDate}`)
  } else {
    await logActivity(me, 'سؤال ناظر دربارهٔ شمارش زون', 'zonecount', id, `زون ${entry.zone} — ${entry.userName} — ${entry.forDate}`)
    // اعلان به شمارنده — قاعده ممکن است تعریف نشده باشد؛ موتور با پیش‌فرض‌ها از صندوق خارج می‌سازد
    await emitNotif({
      event: 'zonecount.queried',
      title: `ناظر سوال دارد — شمارش زون ${entry.zone}`,
      detail: `${me.name}: ${note || 'لطفاً شمارش را دوباره بررسی و ثبت کنید'}`,
      go: '#/zonecount',
      severity: 'important',
      icon: '❓',
      fieldRefs: { submitter: [entry.userId] },
    })
  }

  return json({ entry: sanitizeEntry(updated, false) })
}

/* ───────────────────────── DELETE ─────────────────────────
 * ?id= — ثبت‌کننده (فقط ثبتِ امروزِ خودش) یا مدیران
 */
export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return fail('شناسهٔ ثبت مشخص نیست')
  const entry = await db.zoneCount.findUnique({ where: { id } })
  if (!entry) return fail('ثبت پیدا نشد', 404)
  const manager = isManagerRole(me)
  const ownToday = entry.userId === me.id && entry.forDate === todayIso()
  if (!manager && !ownToday) return fail('فقط ثبتِ امروزِ خودتان قابل حذف است', 403)
  await db.zoneCount.delete({ where: { id } })
  await logActivity(me, 'حذف ثبت شمارش زون', 'zonecount', id, `زون ${entry.zone} — ${entry.forDate}`)
  return json({ ok: true })
}
