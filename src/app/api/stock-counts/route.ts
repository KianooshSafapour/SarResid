import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, clampInt, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { toFaDigits, toEnDigits, todayJalaliDash, addDaysJalaliDash } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

const DASH_DATE = /^\d{4}-\d{2}-\d{2}$/

/** stockcount view roles: managers + PM + SK (انباردار) */
export function canStockCount(role: string | undefined | null): boolean {
  return !!role && ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK'].includes(role)
}

/** R8-COUNT: تغییر برنامهٔ شمارش دوره‌ای کالاها فقط مدیران */
export function canManageSchedules(role: string | undefined | null): boolean {
  return !!role && ['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(role)
}

/** first barcode of a product (main code or barcodesJson) — همان barcodeOf مسیر [id] */
function barcodeOf(p: { code: string | null; barcodesJson: string }): string | null {
  if (p.code) return p.code
  const arr = safeJson<string[]>(p.barcodesJson, [])
  return arr.length ? arr[0] : null
}

/* ─────────────── R8-COUNT: برنامهٔ شمارش دوره‌ای کالا ─────────────── */

/** دوره‌های مجاز شمارش (روز) */
const ALLOWED_INTERVALS = [7, 14, 30, 60, 90, 120, 180, 365]

/** پیشنهاد دوره بر پایهٔ گردش فروش ماهانه: پرفروش‌تر = شمارش مکررتر */
function suggestInterval(monthlySold: number): number {
  if (monthlySold > 300) return 7
  if (monthlySold > 100) return 14
  if (monthlySold > 30) return 30
  if (monthlySold > 0) return 60
  return 120
}

/** اولویت برنامه بر پایهٔ گردش فروش */
function priorityOf(monthlySold: number): string {
  if (monthlySold > 100) return 'HIGH'
  if (monthlySold > 0) return 'NORMAL'
  return 'LOW'
}

/** موعد بعدی = آخرین شمارش + دوره؛ بدون سابقهٔ شمارش → امروز (بلافاصله در صف) */
function nextDueFrom(lastCountJalali: string | null | undefined, intervalDays: number): string {
  return lastCountJalali ? addDaysJalaliDash(lastCountJalali, intervalDays) : todayJalaliDash()
}

/** GET /api/stock-counts
 *  ?schedules=1[&filter=all|overdue|due][&productId=] → R8-COUNT برنامه‌های شمارش کالا + خلاصه
 *  ?productCounts=1[&limit=20]                        → R8-COUNT شمارش‌های اخیر بر اساس کالا
 *  ?month=&status=&staff=                             → شمارش‌های خط/ناحیه (قدیمی — دست‌نخورده) */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canStockCount(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const sp = req.nextUrl.searchParams

  /* ── R8-COUNT: برنامه‌های شمارش دوره‌ای ── */
  if (sp.get('schedules') === '1') {
    const today = todayJalaliDash()
    const productId = (sp.get('productId') || '').trim()
    const filter = (sp.get('filter') || 'all').trim()

    let where: Record<string, unknown> = {}
    if (productId) where = { productId }
    else if (filter === 'overdue') where = { active: true, nextDueJalali: { lt: today } }
    else if (filter === 'due') where = { active: true, nextDueJalali: today }

    const [rows, total, activeN, overdueN, dueN] = await Promise.all([
      db.countSchedule.findMany({ where, orderBy: [{ active: 'desc' }, { nextDueJalali: 'asc' }], take: 500 }),
      db.countSchedule.count(),
      db.countSchedule.count({ where: { active: true } }),
      db.countSchedule.count({ where: { active: true, nextDueJalali: { lt: today } } }),
      db.countSchedule.count({ where: { active: true, nextDueJalali: today } }),
    ])

    /* موجودی زندهٔ هر کالا از جدول Product (موجودی در برنامه ذخیره نمی‌شود) */
    const ids = rows.map((r) => r.productId)
    const products = ids.length
      ? await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, stock: true, unit: true, monthlySold: true, active: true } })
      : []
    const pMap = new Map(products.map((p) => [p.id, p]))

    return ok({
      today,
      schedules: rows.map((r) => {
        const p = pMap.get(r.productId)
        return {
          ...r,
          stock: p?.stock ?? 0,
          unit: p?.unit ?? 'عدد',
          monthlySold: p?.monthlySold ?? 0,
          productActive: p ? p.active : false,
          overdue: r.active && r.nextDueJalali < today,
          dueToday: r.active && r.nextDueJalali === today,
        }
      }),
      summary: { total, active: activeN, overdue: overdueN, dueToday: dueN },
    })
  }

  /* ── R8-COUNT: شمارش‌های اخیر بر اساس کالا (blockLabel='کالا') ── */
  if (sp.get('productCounts') === '1') {
    const limit = clampInt(sp.get('limit'), 1, 50, 20)
    const rows = await db.stockCount.findMany({
      where: { blockLabel: 'کالا' },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: { items: true },
    })
    return ok({
      counts: rows.map((c) => ({
        id: c.id,
        date: c.date,
        scheduledFor: c.scheduledFor,
        status: c.status,
        itemsCounted: c.itemsCounted,
        mismatches: c.mismatches,
        note: c.note,
        staffName: c.staffName,
        createdAt: c.createdAt,
        item: c.items[0] || null,
      })),
    })
  }

  /* ── قدیمی: فهرست شمارش‌های خط/ناحیه ── */
  const month = (sp.get('month') || '').trim()
  const status = (sp.get('status') || '').trim()
  const staff = (sp.get('staff') || '').trim()

  const and: Record<string, unknown>[] = []
  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) return fail('قالب ماه نامعتبر است (مثال ۱۴۰۵-۰۷)')
    and.push({ OR: [{ scheduledFor: { startsWith: month } }, { date: { startsWith: month } }] })
  }
  if (status) {
    const list = status.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    if (list.length) and.push({ status: { in: list } })
  }
  if (staff) and.push({ staffId: staff })

  const rows = await db.stockCount.findMany({
    where: and.length ? { AND: and } : {},
    orderBy: [{ scheduledFor: 'desc' }, { createdAt: 'desc' }],
    include: { _count: { select: { items: true } } },
  })

  return ok({
    counts: rows.map((c) => ({
      id: c.id,
      date: c.date,
      scheduledFor: c.scheduledFor,
      blockLabel: c.blockLabel,
      zoneName: c.zoneName,
      staffId: c.staffId,
      staffName: c.staffName,
      status: c.status,
      itemsCounted: c.itemsCounted,
      mismatches: c.mismatches,
      itemsCount: c._count.items,
      note: c.note,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  })
}

/**
 * POST /api/stock-counts
 *  {action:'count-product', productId, countedQty, note?}   → R8-COUNT شمارش یک کالا + اصلاح موجودی + زمان‌بندی بعدی
 *  {action:'schedule-products', productIds, intervalDays?, autoReschedule?} → R8-COUNT افزودن گروهی به برنامه
 *  {scheduledFor, blockLabel?, zoneName?, …}                → قدیمی: زمان‌بندی شمارش خط/ناحیه (دست‌نخورده)
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canStockCount(user.role)) return fail('شما مجاز به زمان‌بندی انبارگردانی نیستید', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const action = String((body as Record<string, unknown>).action ?? '').trim()
  if (action === 'count-product') return countProduct(user, body as Record<string, unknown>)
  if (action === 'schedule-products') return scheduleProducts(user, body as Record<string, unknown>)

  const scheduledFor = String((body as Record<string, unknown>).scheduledFor ?? '').trim().replace(/\//g, '-')
  if (!DASH_DATE.test(scheduledFor)) return fail('تاریخ زمان‌بندی را به شکل صحیح وارد کنید (مثال ۱۴۰۵-۰۸-۰۱)')

  const blockLabel = String((body as Record<string, unknown>).blockLabel ?? '').trim() || null
  const zoneName = String((body as Record<string, unknown>).zoneName ?? '').trim() || null
  if (!blockLabel && !zoneName) return fail('بخش (برچسب خط) یا زون را انتخاب کنید')

  // validate against the real floorplan / zones (prevents typos)
  if (blockLabel) {
    const block = await db.floorBlock.findFirst({ where: { label: blockLabel } })
    if (!block) return fail('برچسب بخش در نقشه فروشگاه یافت نشد')
  }
  if (zoneName) {
    const zone = await db.zone.findFirst({ where: { name: zoneName } })
    if (!zone) return fail('زون یافت نشد')
  }

  let staffId = String((body as Record<string, unknown>).staffId ?? '').trim() || null
  let staffName = String((body as Record<string, unknown>).staffName ?? '').trim() || null
  if (staffId) {
    const staff = await db.user.findUnique({ where: { id: staffId } })
    if (!staff || !staff.active) return fail('کارمند انتخاب‌شده یافت نشد')
    staffName = staffName || staff.fullName
  } else {
    staffId = null
    staffName = staffName || null
  }

  const note = String((body as Record<string, unknown>).note ?? '').trim() || null

  const created = await db.stockCount.create({
    data: { scheduledFor, blockLabel, zoneName, staffId, staffName, note, status: 'SCHEDULED' },
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'stockcount.schedule',
    actionLabel: 'انبارگردانی',
    category: 'stockcount',
    detail: `زمان‌بندی برای ${toFaDigits(scheduledFor)} — ${blockLabel ?? zoneName ?? ''}${staffName ? ` — ${staffName}` : ''}`,
    entityId: created.id,
  })

  if (staffId) {
    await notify({
      userId: staffId,
      kind: 'stockcount',
      severity: 'info',
      title: 'انبارگردانی جدید زمان‌بندی شد',
      body: `${blockLabel ?? zoneName ?? 'انبارگردانی'} — تاریخ ${toFaDigits(scheduledFor)}`,
      go: '#/store/stockcount',
    })
  }

  return ok({ count: created })
}

/* ─────────────── R8-COUNT: شمارش یک کالا ─────────────── */

type SessionUser = Awaited<ReturnType<typeof getSessionUser>>

async function countProduct(user: NonNullable<SessionUser>, body: Record<string, unknown>) {
  if (!canStockCount(user.role)) return fail('شما مجاز به شمارش کالا نیستید', 403)

  const productId = String(body.productId ?? '').trim()
  if (!productId) return fail('کالا را انتخاب کنید')

  const qtyRaw = Number(toEnDigits(String(body.countedQty ?? '')))
  if (!Number.isFinite(qtyRaw) || qtyRaw < 0) return fail('تعداد شمارش‌شده معتبر نیست')
  const countedQty = Math.min(1_000_000, Math.round(qtyRaw))

  const note = String(body.note ?? '').trim() || null

  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product) return fail('کالا یافت نشد', 404)

  const today = todayJalaliDash()
  const systemQty = product.stock
  const diff = countedQty - systemQty
  const barcode = barcodeOf(product)

  /* برنامهٔ فعلی (اگر هست) — دورهٔ آن حفظ می‌شود؛ نبود → دورهٔ پیش‌فرض ۳۰ روزه ساخته می‌شود */
  const schedule0 = await db.countSchedule.findUnique({ where: { productId } })
  const intervalDays = schedule0?.intervalDays ?? 30

  const [count, schedule] = await db.$transaction(async (tx) => {
    const count = await tx.stockCount.create({
      data: {
        date: today,
        scheduledFor: today,
        blockLabel: 'کالا', // نشانهٔ شمارشِ بر اساس کالا (R8-COUNT)
        zoneName: null,
        staffId: user.id,
        staffName: user.fullName,
        status: diff === 0 ? 'DONE' : 'MISMATCH',
        itemsCounted: 1,
        mismatches: diff === 0 ? 0 : 1,
        note,
      },
    })
    const item = await tx.stockCountItem.create({
      data: { countId: count.id, productId, name: product.name, barcode, systemQty, countedQty, diff, note },
    })
    /* اصلاح واقعی موجودی + تاریخ آخرین شمارش */
    await tx.product.update({ where: { id: productId }, data: { stock: countedQty, lastCountDate: today } })
    /* زمان‌بندی بعدی: با autoReschedule جلو می‌رود؛ فعال/غیرفعال بودن حفظ می‌شود */
    const schedule = await tx.countSchedule.upsert({
      where: { productId },
      create: {
        productId,
        productName: product.name,
        barcode,
        intervalDays,
        lastCountJalali: today,
        lastDiff: diff,
        nextDueJalali: addDaysJalaliDash(today, intervalDays),
        active: true,
        autoReschedule: true,
        priority: priorityOf(product.monthlySold),
      },
      update: {
        productName: product.name,
        barcode,
        lastCountJalali: today,
        lastDiff: diff,
        ...(schedule0?.autoReschedule === false ? {} : { nextDueJalali: addDaysJalaliDash(today, intervalDays) }),
      },
    })
    return [{ ...count, item }, schedule]
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'stockcount.count_product',
    actionLabel: 'انبارگردانی کالا',
    category: 'stockcount',
    detail: `شمارش «${product.name}» — سیستم ${toFaDigits(String(systemQty))} → شمارش ${toFaDigits(String(countedQty))} (مغایرت ${diff > 0 ? '+' : diff < 0 ? '−' : ''}${toFaDigits(String(Math.abs(diff)))})`,
    entityId: count.id,
  })

  if (diff !== 0) {
    await notify({
      role: 'GM',
      kind: 'stockcount',
      severity: 'warning',
      title: 'مغایرت در شمارش کالا',
      body: `«${product.name}»: موجودی سیستم ${toFaDigits(String(systemQty))} → شمارش ${toFaDigits(String(countedQty))}`,
      go: '#/store/stockcount',
    })
  }

  return ok({
    count,
    schedule,
    product: { id: product.id, name: product.name, stock: countedQty, lastCountDate: today },
  })
}

/* ─────────────── R8-COUNT: افزودن گروهی کالاها به برنامه ─────────────── */

async function scheduleProducts(user: NonNullable<SessionUser>, body: Record<string, unknown>) {
  if (!canManageSchedules(user.role)) return fail('تنظیم برنامهٔ شمارش کالاها فقط برای مدیران مجاز است', 403)

  const raw = Array.isArray(body.productIds) ? body.productIds : []
  const productIds = Array.from(new Set(raw.map((x) => toEnDigits(String(x ?? '')).trim()).filter(Boolean)))
  if (!productIds.length) return fail('حداقل یک کالا انتخاب کنید')
  if (productIds.length > 500) return fail('در هر مرحله حداکثر ۵۰۰ کالا را انتخاب کنید')

  /* دوره: عدد از مجموعهٔ مجاز، یا «suggest»/نامشخص → پیشنهاد هوشمند per-product بر پایهٔ فروش */
  let intervalDays: number | null = null
  const rawInterval = body.intervalDays
  if (rawInterval !== undefined && rawInterval !== null && String(rawInterval).trim() !== '' && String(rawInterval) !== 'suggest') {
    const n = Math.round(Number(toEnDigits(String(rawInterval))))
    if (!ALLOWED_INTERVALS.includes(n)) {
      return fail(`دورهٔ شمارش باید یکی از ${ALLOWED_INTERVALS.map((d) => toFaDigits(String(d))).join('، ')} روز باشد`)
    }
    intervalDays = n
  }
  const autoReschedule = body.autoReschedule === undefined ? undefined : body.autoReschedule === true

  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, code: true, barcodesJson: true, monthlySold: true, lastCountDate: true },
  })
  if (!products.length) return fail('کالای انتخاب‌شده یافت نشد', 404)

  const existing = await db.countSchedule.findMany({ where: { productId: { in: products.map((p) => p.id) } } })
  const exMap = new Map(existing.map((s) => [s.productId, s]))

  let created = 0
  let updated = 0
  for (const p of products) {
    const ex = exMap.get(p.id)
    const interval = intervalDays ?? suggestInterval(p.monthlySold)
    const auto = autoReschedule ?? (ex ? ex.autoReschedule : true)
    const lastCount = ex?.lastCountJalali ?? p.lastCountDate ?? null
    await db.countSchedule.upsert({
      where: { productId: p.id },
      create: {
        productId: p.id,
        productName: p.name,
        barcode: barcodeOf(p),
        intervalDays: interval,
        lastCountJalali: lastCount,
        lastDiff: 0,
        nextDueJalali: nextDueFrom(lastCount, interval),
        active: true,
        autoReschedule: auto,
        priority: priorityOf(p.monthlySold),
      },
      update: {
        productName: p.name,
        barcode: barcodeOf(p),
        intervalDays: interval,
        active: true,
        autoReschedule: auto,
        nextDueJalali: nextDueFrom(ex?.lastCountJalali ?? p.lastCountDate ?? null, interval),
        priority: priorityOf(p.monthlySold),
      },
    })
    if (ex) updated++
    else created++
  }

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'stockcount.schedule_products',
    actionLabel: 'برنامهٔ شمارش کالا',
    category: 'stockcount',
    detail: `${toFaDigits(String(created + updated))} کالا در برنامهٔ شمارش دوره‌ای (${intervalDays ? `${toFaDigits(String(intervalDays))} روزه` : 'دورهٔ پیشنهادی هوشمند'}) — ${created} جدید، ${updated} به‌روزرسانی`,
  })

  return ok({ created, updated, count: created + updated, skipped: productIds.length - products.length })
}

/* ─────────────── R8-COUNT: ویرایش یک برنامه (PATCH) ─────────────── */

/** PATCH /api/stock-counts {id, intervalDays?, autoReschedule?, active?, nextDueJalali?, note?} → {schedule} */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canManageSchedules(user.role)) return fail('ویرایش برنامهٔ شمارش فقط برای مدیران مجاز است', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const id = String((body as Record<string, unknown>).id ?? '').trim()
  if (!id) return fail('شناسهٔ برنامه را ارسال کنید')

  const sch = await db.countSchedule.findUnique({ where: { id } })
  if (!sch) return fail('برنامهٔ شمارش یافت نشد', 404)

  const data: Record<string, unknown> = {}

  if ((body as Record<string, unknown>).intervalDays !== undefined) {
    const n = Math.round(Number(toEnDigits(String((body as Record<string, unknown>).intervalDays))))
    if (!ALLOWED_INTERVALS.includes(n)) {
      return fail(`دورهٔ شمارش باید یکی از ${ALLOWED_INTERVALS.map((d) => toFaDigits(String(d))).join('، ')} روز باشد`)
    }
    data.intervalDays = n
  }
  if ((body as Record<string, unknown>).nextDueJalali !== undefined) {
    const nd = toEnDigits(String((body as Record<string, unknown>).nextDueJalali)).trim().replace(/\//g, '-')
    if (!DASH_DATE.test(nd)) return fail('موعد بعدی را به شکل ۱۴۰۵-۰۸-۰۱ وارد کنید')
    data.nextDueJalali = nd
  } else if (data.intervalDays !== undefined) {
    /* دوره عوض شد و موعد دستی نداد → از آخرین شمارش بازمحاسبه */
    data.nextDueJalali = nextDueFrom(sch.lastCountJalali, data.intervalDays as number)
  }
  if ((body as Record<string, unknown>).autoReschedule !== undefined) {
    data.autoReschedule = (body as Record<string, unknown>).autoReschedule === true
  }
  if ((body as Record<string, unknown>).active !== undefined) {
    data.active = (body as Record<string, unknown>).active === true
  }
  if ((body as Record<string, unknown>).note !== undefined) {
    data.note = String((body as Record<string, unknown>).note ?? '').trim() || null
  }

  const updated = await db.countSchedule.update({ where: { id }, data })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'stockcount.schedule_update',
    actionLabel: 'برنامهٔ شمارش کالا',
    category: 'stockcount',
    detail: `برنامهٔ «${sch.productName}» به‌روزرسانی شد${data.intervalDays !== undefined ? ` — دورهٔ ${toFaDigits(String(data.intervalDays))} روزه` : ''}${data.nextDueJalali ? ` — موعد ${toFaDigits(String(data.nextDueJalali))}` : ''}`,
    entityId: id,
  })

  return ok({ schedule: updated })
}

/* ─────────────── R8-COUNT: حذف یک برنامه (DELETE) ─────────────── */

/** DELETE /api/stock-counts?id=… → {deleted:true} */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canManageSchedules(user.role)) return fail('حذف برنامهٔ شمارش فقط برای مدیران مجاز است', 403)

  const id = (req.nextUrl.searchParams.get('id') || '').trim()
  if (!id) return fail('شناسهٔ برنامه را ارسال کنید')

  const sch = await db.countSchedule.findUnique({ where: { id } })
  if (!sch) return fail('برنامهٔ شمارش یافت نشد', 404)

  await db.countSchedule.delete({ where: { id } })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'stockcount.schedule_delete',
    actionLabel: 'برنامهٔ شمارش کالا',
    category: 'stockcount',
    detail: `برنامهٔ «${sch.productName}» حذف شد`,
    entityId: id,
  })

  return ok({ deleted: true })
}
