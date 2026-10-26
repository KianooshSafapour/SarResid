import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, clampInt, safeJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { ARCHIVE_ROLES, astr } from '@/lib/archive'
import { toEnDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/** نرمال‌سازی موبایل: فقط رقم (ارقام فارسی هم پذیرفته می‌شود) */
function mobileOrNull(v: unknown): string | null {
  const s = toEnDigits(String(v ?? '')).replace(/[^\d+]/g, '').slice(0, 15)
  return s || null
}

/* ═══ R10: تأمین‌کنندگانِ مرتبط با نماینده (supplierIdsJson) ═══ */

const REP_SUPPLIER_CAP = 40

type SupBrief = { id: string; name: string; code: string | null }

/** تجزیهٔ supplierIdsJson → فهرست شناسه‌های معتبر (رشته) */
function parseSupplierIds(json: string | null | undefined): string[] {
  const arr = safeJson<string[]>(json, [])
  if (!Array.isArray(arr)) return []
  return arr.filter((x) => typeof x === 'string' && !!x)
}

/** یک کوئری گروهی → نقشهٔ id به {id, name, code} برای همهٔ شناسه‌های داده‌شده */
async function supplierMapFor(ids: string[]): Promise<Map<string, SupBrief>> {
  const uniq = [...new Set(ids)].slice(0, 400)
  if (!uniq.length) return new Map()
  const rows = await db.supplier.findMany({
    where: { id: { in: uniq } },
    select: { id: true, name: true, code: true },
  })
  return new Map(rows.map((s) => [s.id, { id: s.id, name: s.name, code: s.code }]))
}

/** رزولو کامل: از رشتهٔ JSON ذخیره‌شده به [{id,name,code}] (ترتیب ذخیره حفظ می‌شود) */
async function resolveSuppliers(json: string | null | undefined): Promise<SupBrief[]> {
  const ids = parseSupplierIds(json)
  if (!ids.length) return []
  const map = await supplierMapFor(ids)
  return ids.map((id) => map.get(id)).filter((s): s is SupBrief => !!s)
}

/**
 * اعتبارسنجی supplierIds دریافتی از بدنه (POST/PUT):
 * آرایهٔ رشته — حداکثر ۴۰؛ هر شناسه باید در جدول Supplier موجود باشد
 * (نامعتبرها بی‌صدا حذف می‌شوند)؛ تکراری‌ها یکتا می‌شوند.
 * خروجی: رشتهٔ JSON قابل ذخیره یا null (خالی).
 */
async function supplierIdsJsonOrNull(v: unknown): Promise<string | null> {
  const raw = Array.isArray(v)
    ? v.map((x) => toEnDigits(String(x ?? '')).trim()).filter((s) => !!s)
    : []
  const uniq = [...new Set(raw)].slice(0, REP_SUPPLIER_CAP)
  if (!uniq.length) return null
  const found = await db.supplier.findMany({
    where: { id: { in: uniq } },
    select: { id: true },
  })
  const valid = new Set(found.map((s) => s.id))
  const keep = uniq.filter((id) => valid.has(id)).slice(0, REP_SUPPLIER_CAP)
  return keep.length ? JSON.stringify(keep) : null
}

/** GET /api/archive/reps — نمایندگان فروش + تعداد اسناد (q: نام/موبایل/شرکت/سمت) */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!ARCHIVE_ROLES.includes(me.role)) return fail('دسترسی به آرشیو اسناد ندارید', 403)

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') ?? '').trim()
  const active = (sp.get('active') ?? '').trim()

  const and: Record<string, unknown>[] = []
  if (q) {
    and.push({
      OR: [
        { name: { contains: q } },
        { mobile: { contains: toEnDigits(q) } },
        { company: { contains: q } },
        { title: { contains: q } },
        { note: { contains: q } },
      ],
    })
  }
  if (active === '1') and.push({ active: true })
  else if (active === '0') and.push({ active: false })
  const where = and.length ? { AND: and } : {}

  const rows = await db.salesRep.findMany({ where, orderBy: [{ active: 'desc' }, { name: 'asc' }] })
  const [docCounts, supMap] = await Promise.all([
    db.archiveDocument.groupBy({ by: ['repId'], _count: { _all: true } }),
    // R10: همهٔ تأمین‌کنندگانِ ارجاع‌شده در همهٔ نماینده‌ها با «یک» کوئری گروهی رزولو می‌شوند
    supplierMapFor(rows.flatMap((r) => parseSupplierIds(r.supplierIdsJson))),
  ])
  const countMap = new Map(docCounts.map((d) => [d.repId, d._count._all]))

  return ok({
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      mobile: r.mobile,
      company: r.company,
      title: r.title,
      note: r.note,
      active: r.active,
      documentsCount: countMap.get(r.id) ?? 0,
      // R10: تأمین‌کنندگانِ مرتبط (نام/کد رزولو‌شده — ترتیب انتخاب حفظ می‌شود)
      suppliers: parseSupplierIds(r.supplierIdsJson)
        .map((id) => supMap.get(id))
        .filter((s): s is SupBrief => !!s),
      createdAt: r.createdAt.toISOString(),
    })),
    total: rows.length,
  })
}

/** POST /api/archive/reps — ثبت نماینده {name, mobile?, company?, title?, note?, active?, supplierIds?} */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!ARCHIVE_ROLES.includes(me.role)) return fail('دسترسی به آرشیو اسناد ندارید', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const name = String(body.name ?? '').trim().slice(0, 100)
  if (!name) return fail('نام نماینده را وارد کنید')

  const dup = await db.salesRep.findFirst({ where: { name } })
  if (dup) return fail('نماینده‌ای با همین نام ثبت شده است')

  // R10: تأمین‌کنندگان مرتبط — شناسه‌های ناموجود بی‌صدا حذف می‌شوند
  const supplierIdsJson = await supplierIdsJsonOrNull(body.supplierIds)

  const created = await db.salesRep.create({
    data: {
      name,
      mobile: mobileOrNull(body.mobile),
      company: astr(body.company, 120),
      title: astr(body.title, 60),
      note: astr(body.note, 400),
      active: body.active === undefined ? true : !!body.active,
      supplierIdsJson,
    },
  })

  await logActivity({
    userId: me.id, userName: me.fullName,
    action: 'archive.rep.create', actionLabel: 'نمایندهٔ فروش',
    category: 'archive', detail: `ثبت نمایندهٔ «${name}»`, entityId: created.id,
  })

  return ok({ ...created, documentsCount: 0, suppliers: await resolveSuppliers(created.supplierIdsJson) })
}

/** PUT /api/archive/reps — ویرایش نماینده {id, ...} */
export async function PUT(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!ARCHIVE_ROLES.includes(me.role)) return fail('دسترسی به آرشیو اسناد ندارید', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')
  const id = String(body.id ?? '').trim()
  if (!id) return fail('شناسهٔ نماینده لازم است')

  const rep = await db.salesRep.findUnique({ where: { id } })
  if (!rep) return fail('نماینده یافت نشد', 404)

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = String(body.name ?? '').trim().slice(0, 100)
    if (!name) return fail('نام نماینده را وارد کنید')
    const dup = await db.salesRep.findFirst({ where: { name, NOT: { id } } })
    if (dup) return fail('نماینده‌ای با همین نام ثبت شده است')
    data.name = name
  }
  if (body.mobile !== undefined) data.mobile = mobileOrNull(body.mobile)
  if (body.company !== undefined) data.company = astr(body.company, 120)
  if (body.title !== undefined) data.title = astr(body.title, 60)
  if (body.note !== undefined) data.note = astr(body.note, 400)
  if (body.active !== undefined) data.active = !!body.active
  // R10: تأمین‌کنندگان مرتبط — فقط هنگام ارسال صریح supplierIds (آرایه/null) تغییر می‌کند
  if (body.supplierIds !== undefined) data.supplierIdsJson = await supplierIdsJsonOrNull(body.supplierIds)

  if (!Object.keys(data).length) return fail('فیلدی برای ویرایش ارسال نشده است')

  const updated = await db.salesRep.update({ where: { id }, data })
  await logActivity({
    userId: me.id, userName: me.fullName,
    action: 'archive.rep.update', actionLabel: 'نمایندهٔ فروش',
    category: 'archive', detail: `ویرایش نمایندهٔ «${updated.name}»`, entityId: id,
  })
  return ok({ ...updated, suppliers: await resolveSuppliers(updated.supplierIdsJson) })
}

/** DELETE /api/archive/reps?id= — حذف نماینده؛ سندهای متصل فقط متنِ نام را نگه می‌دارند (repId=null) */
export async function DELETE(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!ARCHIVE_ROLES.includes(me.role)) return fail('دسترسی به آرشیو اسناد ندارید', 403)

  const id = String(req.nextUrl.searchParams.get('id') ?? '').trim()
  if (!id) return fail('شناسهٔ نماینده لازم است')

  const rep = await db.salesRep.findUnique({ where: { id } })
  if (!rep) return fail('نماینده یافت نشد', 404)

  const detached = await db.archiveDocument.updateMany({ where: { repId: id }, data: { repId: null } })
  await db.salesRep.delete({ where: { id } })

  await logActivity({
    userId: me.id, userName: me.fullName,
    action: 'archive.rep.delete', actionLabel: 'نمایندهٔ فروش',
    category: 'archive',
    detail: `حذف نمایندهٔ «${rep.name}»${detached.count ? ` — ${detached.count} سند فقط با نام او ثبت ماند` : ''}`,
    entityId: id,
  })

  return ok({ deleted: true, detached: detached.count })
}
