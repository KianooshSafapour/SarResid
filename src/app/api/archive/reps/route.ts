import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, clampInt } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { ARCHIVE_ROLES, astr } from '@/lib/archive'
import { toEnDigits } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/** نرمال‌سازی موبایل: فقط رقم (ارقام فارسی هم پذیرفته می‌شود) */
function mobileOrNull(v: unknown): string | null {
  const s = toEnDigits(String(v ?? '')).replace(/[^\d+]/g, '').slice(0, 15)
  return s || null
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

  const [rows, docCounts] = await Promise.all([
    db.salesRep.findMany({ where, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    db.archiveDocument.groupBy({ by: ['repId'], _count: { _all: true } }),
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
      createdAt: r.createdAt.toISOString(),
    })),
    total: rows.length,
  })
}

/** POST /api/archive/reps — ثبت نماینده {name, mobile?, company?, title?, note?, active?} */
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

  const created = await db.salesRep.create({
    data: {
      name,
      mobile: mobileOrNull(body.mobile),
      company: astr(body.company, 120),
      title: astr(body.title, 60),
      note: astr(body.note, 400),
      active: body.active === undefined ? true : !!body.active,
    },
  })

  await logActivity({
    userId: me.id, userName: me.fullName,
    action: 'archive.rep.create', actionLabel: 'نمایندهٔ فروش',
    category: 'archive', detail: `ثبت نمایندهٔ «${name}»`, entityId: created.id,
  })

  return ok({ ...created, documentsCount: 0 })
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

  if (!Object.keys(data).length) return fail('فیلدی برای ویرایش ارسال نشده است')

  const updated = await db.salesRep.update({ where: { id }, data })
  await logActivity({
    userId: me.id, userName: me.fullName,
    action: 'archive.rep.update', actionLabel: 'نمایندهٔ فروش',
    category: 'archive', detail: `ویرایش نمایندهٔ «${updated.name}»`, entityId: id,
  })
  return ok(updated)
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
