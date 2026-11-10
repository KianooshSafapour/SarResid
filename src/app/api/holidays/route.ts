import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { toFaDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

const KINDS = ['OFFICIAL', 'RELIGIOUS', 'NATIONAL', 'CUSTOM', 'FRIDAY-EQUIV']

const KIND_LABELS: Record<string, string> = {
  OFFICIAL: 'رسمی',
  RELIGIOUS: 'مذهبی',
  NATIONAL: 'ملی',
  CUSTOM: 'اختصاصی',
  'FRIDAY-EQUIV': 'معادل جمعه',
}

const DASH_DATE = /^\d{4}-\d{2}-\d{2}$/

/** GET /api/holidays?from=&to= → {holidays:[...]} (calendar views + cheque-calc) */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const sp = req.nextUrl.searchParams
  const from = (sp.get('from') || '').trim()
  const to = (sp.get('to') || '').trim()
  // ?y=1405 → کل سال شمسی (R4-7)
  const y = (sp.get('y') || '').trim()

  const where: Record<string, unknown> = {}
  if (DASH_DATE.test(from)) where.date = { gte: from }
  if (DASH_DATE.test(to)) where.date = typeof where.date === 'object' ? { ...(where.date as object), lte: to } : { lte: to }
  if (/^\d{4}$/.test(y)) {
    const yFrom = `${y}-01-01`
    const yTo = `${y}-12-29`
    where.date = {
      gte: typeof where.date === 'object' ? (where.date as { gte?: string }).gte ?? yFrom : yFrom,
      lte: typeof where.date === 'object' ? (where.date as { lte?: string }).lte ?? yTo : yTo,
    }
  }

  const rows = await db.holiday.findMany({ where, orderBy: { date: 'asc' } })
  return ok({
    holidays: rows.map((h) => ({ ...h, kindLabel: KIND_LABELS[h.kind] ?? h.kind })),
  })
}

/** POST /api/holidays {date, title, kind?} — managers only (religious dates are approximate + editable) */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('فقط مدیران می‌توانند تعطیلات را ثبت کنند', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const date = String((body as Record<string, unknown>).date ?? '').trim().replace(/\//g, '-')
  if (!DASH_DATE.test(date)) return fail('تاریخ تعطیلی را به شکل صحیح وارد کنید (مثال ۱۴۰۵-۰۷-۲۷)')
  const title = String((body as Record<string, unknown>).title ?? '').trim()
  if (!title) return fail('عنوان تعطیلی را وارد کنید')
  const kindRaw = String((body as Record<string, unknown>).kind ?? 'CUSTOM').trim().toUpperCase()
  const kind = KINDS.includes(kindRaw) ? kindRaw : 'CUSTOM'

  const exists = await db.holiday.findFirst({ where: { date, title } })
  if (exists) return fail('این تعطیلی برای این تاریخ قبلاً ثبت شده است')

  const id = `hol-${date}-${Date.now().toString(36)}`
  const created = await db.holiday.create({ data: { id, date, title, kind } })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'holiday.create',
    actionLabel: 'تعطیلات',
    category: 'settings',
    detail: `${title} — ${toFaDigits(date)}`,
    entityId: created.id,
  })
  return ok({ holiday: { ...created, kindLabel: KIND_LABELS[created.kind] ?? created.kind } })
}

/** PATCH /api/holidays {id, date?, title?, kind?} — managers only */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('فقط مدیران می‌توانند تعطیلات را ویرایش کنند', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')
  const id = String((body as Record<string, unknown>).id ?? '').trim()
  if (!id) return fail('شناسه تعطیلی الزامی است')

  const row = await db.holiday.findUnique({ where: { id } })
  if (!row) return fail('تعطیلی یافت نشد', 404)

  const data: Record<string, string> = {}
  if ((body as Record<string, unknown>).date !== undefined) {
    const date = String((body as Record<string, unknown>).date).trim().replace(/\//g, '-')
    if (!DASH_DATE.test(date)) return fail('تاریخ تعطیلی را به شکل صحیح وارد کنید')
    data.date = date
  }
  if ((body as Record<string, unknown>).title !== undefined) {
    const title = String((body as Record<string, unknown>).title).trim()
    if (!title) return fail('عنوان تعطیلی نمی‌تواند خالی باشد')
    data.title = title
  }
  if ((body as Record<string, unknown>).kind !== undefined) {
    const kindRaw = String((body as Record<string, unknown>).kind).trim().toUpperCase()
    if (!KINDS.includes(kindRaw)) return fail('نوع تعطیلی نامعتبر است')
    data.kind = kindRaw
  }
  if (Object.keys(data).length === 0) return fail('تغییری برای ذخیره وجود ندارد')

  const updated = await db.holiday.update({ where: { id }, data })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'holiday.update',
    actionLabel: 'تعطیلات',
    category: 'settings',
    detail: `${updated.title} — ${toFaDigits(updated.date)}`,
    entityId: id,
  })
  return ok({ holiday: { ...updated, kindLabel: KIND_LABELS[updated.kind] ?? updated.kind } })
}

/** DELETE /api/holidays?id= — managers only */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('فقط مدیران می‌توانند تعطیلات را حذف کنند', 403)

  const id = (req.nextUrl.searchParams.get('id') || '').trim()
  if (!id) return fail('شناسه تعطیلی الزامی است')

  const row = await db.holiday.findUnique({ where: { id } })
  if (!row) return fail('تعطیلی یافت نشد', 404)

  await db.holiday.delete({ where: { id } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'holiday.delete',
    actionLabel: 'تعطیلات',
    category: 'settings',
    detail: `${row.title} — ${toFaDigits(row.date)}`,
    entityId: id,
  })
  return ok({ id })
}
