import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, clampInt } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

const DASH_DATE = /^\d{4}-\d{2}-\d{2}$/

/** stockcount view roles: managers + PM + SK (انباردار) */
export function canStockCount(role: string | undefined | null): boolean {
  return !!role && ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK'].includes(role)
}

/** GET /api/stock-counts?month=1405-07&status=&staff= → {counts:[... with items summary]} */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canStockCount(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const sp = req.nextUrl.searchParams
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

/** POST /api/stock-counts {scheduledFor, blockLabel?, zoneName?, staffId?, staffName?, note?} → {count} SCHEDULED */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canStockCount(user.role)) return fail('شما مجاز به زمان‌بندی انبارگردانی نیستید', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

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
