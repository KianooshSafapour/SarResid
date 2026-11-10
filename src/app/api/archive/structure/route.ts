import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, clampInt } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { toFaDigits } from '@/lib/jalali'
import { ARCHIVE_ROLES, astr } from '@/lib/archive'

export const dynamic = 'force-dynamic'

const NODE_TYPES = ['cabinet', 'shelf', 'binder'] as const
type NodeType = (typeof NODE_TYPES)[number]

function parseType(v: unknown): NodeType | null {
  const s = String(v ?? '').trim().toLowerCase()
  return (NODE_TYPES as readonly string[]).includes(s) ? (s as NodeType) : null
}

/** شمارهٔ بعدی کد یکتا از میان کدهای موجود (CAB-01 / -S2 / -B3 …) */
function nextSuffix(codes: string[], re: RegExp): number {
  let max = 0
  for (const c of codes) {
    const m = re.exec(c || '')
    if (m) max = Math.max(max, Number(m[1]) || 0)
  }
  return max + 1
}

/** GET /api/archive/structure — درخت کامل کابینت ← قفسه ← زون‌بند با تعداد اسناد */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!ARCHIVE_ROLES.includes(me.role)) return fail('دسترسی به آرشیو اسناد ندارید', 403)

  const [cabinets, shelves, binders, docCounts, unfiled] = await Promise.all([
    db.archiveCabinet.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    db.archiveShelf.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    db.archiveBinder.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    db.archiveDocument.groupBy({ by: ['binderId'], _count: { _all: true } }),
    db.archiveDocument.count({ where: { binderId: null } }),
  ])

  const countMap = new Map(docCounts.map((d) => [d.binderId, d._count._all]))

  const out = cabinets.map((cab) => {
    const cabShelves = shelves.filter((s) => s.cabinetId === cab.id)
    let cabDocs = 0
    let cabBinders = 0
    const shelfOut = cabShelves.map((sh) => {
      const shBinders = binders.filter((b) => b.shelfId === sh.id)
      let shDocs = 0
      const binderOut = shBinders.map((b) => {
        const documentsCount = countMap.get(b.id) ?? 0
        shDocs += documentsCount
        return {
          id: b.id,
          name: b.name,
          code: b.code,
          category: b.category,
          color: b.color,
          note: b.note,
          sortOrder: b.sortOrder,
          documentsCount,
        }
      })
      cabDocs += shDocs
      cabBinders += shBinders.length
      return {
        id: sh.id,
        cabinetId: sh.cabinetId,
        name: sh.name,
        code: sh.code,
        note: sh.note,
        sortOrder: sh.sortOrder,
        bindersCount: shBinders.length,
        documentsCount: shDocs,
        binders: binderOut,
      }
    })
    return {
      id: cab.id,
      name: cab.name,
      code: cab.code,
      location: cab.location,
      note: cab.note,
      sortOrder: cab.sortOrder,
      shelvesCount: cabShelves.length,
      bindersCount: cabBinders,
      documentsCount: cabDocs,
      shelves: shelfOut,
    }
  })

  return ok({
    cabinets: out,
    totals: {
      cabinets: cabinets.length,
      shelves: shelves.length,
      binders: binders.length,
      documents: docCounts.reduce((s, d) => s + d._count._all, 0),
      unfiled,
    },
  })
}

/** POST /api/archive/structure — ساخت نود {type: cabinet|shelf|binder, ...}
 *  کد یکتا خودکار: CAB-01 / CAB-01-S2 / CAB-01-S2-B1 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!ARCHIVE_ROLES.includes(me.role)) return fail('دسترسی به آرشیو اسناد ندارید', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const type = parseType(body.type)
  if (!type) return fail('نوع نود باید cabinet یا shelf یا binder باشد')
  const name = String(body.name ?? '').trim().slice(0, 120)
  if (!name) return fail('نام را وارد کنید')
  const note = astr(body.note, 400)
  const sortOrder = clampInt(body.sortOrder, 0, 9999, 100)

  if (type === 'cabinet') {
    const all = await db.archiveCabinet.findMany({ select: { code: true } })
    const code = `CAB-${String(nextSuffix(all.map((c) => c.code), /^CAB-(\d+)$/)).padStart(2, '0')}`
    const created = await db.archiveCabinet.create({
      data: { name, code, location: astr(body.location, 120), note, sortOrder },
    })
    await logActivity({
      userId: me.id, userName: me.fullName,
      action: 'archive.structure.create', actionLabel: 'ساختار آرشیو',
      category: 'archive', detail: `کابینت «${name}» (${code})`, entityId: created.id,
    })
    return ok({ type, node: { ...created, shelves: [], documentsCount: 0 } })
  }

  if (type === 'shelf') {
    const cabinetId = String(body.cabinetId ?? '').trim()
    if (!cabinetId) return fail('کابینت را انتخاب کنید')
    const cab = await db.archiveCabinet.findUnique({ where: { id: cabinetId } })
    if (!cab) return fail('کابینت یافت نشد', 404)
    const siblings = await db.archiveShelf.findMany({ where: { cabinetId }, select: { code: true } })
    const code = `${cab.code}-S${nextSuffix(siblings.map((s) => s.code), /-S(\d+)$/)}`
    const created = await db.archiveShelf.create({ data: { cabinetId, name, code, note, sortOrder } })
    await logActivity({
      userId: me.id, userName: me.fullName,
      action: 'archive.structure.create', actionLabel: 'ساختار آرشیو',
      category: 'archive', detail: `قفسهٔ «${name}» (${code}) در ${cab.name}`, entityId: created.id,
    })
    return ok({ type, node: { ...created, binders: [], documentsCount: 0 } })
  }

  const shelfId = String(body.shelfId ?? '').trim()
  if (!shelfId) return fail('قفسه را انتخاب کنید')
  const shelf = await db.archiveShelf.findUnique({ where: { id: shelfId } })
  if (!shelf) return fail('قفسه یافت نشد', 404)
  const siblings = await db.archiveBinder.findMany({ where: { shelfId }, select: { code: true } })
  const code = `${shelf.code}-B${nextSuffix(siblings.map((b) => b.code), /-B(\d+)$/)}`
  const created = await db.archiveBinder.create({
    data: { shelfId, name, code, category: astr(body.category, 60), color: astr(body.color, 30), note, sortOrder },
  })
  await logActivity({
    userId: me.id, userName: me.fullName,
    action: 'archive.structure.create', actionLabel: 'ساختار آرشیو',
    category: 'archive', detail: `زون‌بند «${name}» (${code}) در ${shelf.name}`, entityId: created.id,
  })
  return ok({ type, node: { ...created, documentsCount: 0 } })
}

/** PUT /api/archive/structure — ویرایش نود {type, id, name?, location?, note?, sortOrder?, category?, color?, code?} */
export async function PUT(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!ARCHIVE_ROLES.includes(me.role)) return fail('دسترسی به آرشیو اسناد ندارید', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const type = parseType(body.type)
  if (!type) return fail('نوع نود باید cabinet یا shelf یا binder باشد')
  const id = String(body.id ?? '').trim()
  if (!id) return fail('شناسهٔ نود لازم است')

  const data: Record<string, unknown> = {}
  let label = ''
  if (body.name !== undefined) {
    const name = String(body.name ?? '').trim().slice(0, 120)
    if (!name) return fail('نام را وارد کنید')
    data.name = name
  }
  if (body.note !== undefined) data.note = astr(body.note, 400)
  if (body.sortOrder !== undefined) data.sortOrder = clampInt(body.sortOrder, 0, 9999, 100)

  if (type === 'cabinet') {
    const node = await db.archiveCabinet.findUnique({ where: { id } })
    if (!node) return fail('کابینت یافت نشد', 404)
    if (body.location !== undefined) data.location = astr(body.location, 120)
    label = `کابینت «${data.name ?? node.name}»`
  } else if (type === 'shelf') {
    const node = await db.archiveShelf.findUnique({ where: { id } })
    if (!node) return fail('قفسه یافت نشد', 404)
    label = `قفسهٔ «${data.name ?? node.name}»`
  } else {
    const node = await db.archiveBinder.findUnique({ where: { id } })
    if (!node) return fail('زون‌بند یافت نشد', 404)
    if (body.category !== undefined) data.category = astr(body.category, 60)
    if (body.color !== undefined) data.color = astr(body.color, 30)
    label = `زون‌بند «${data.name ?? node.name}»`
  }

  /* کد دستی؟ باید یکتا بماند */
  if (body.code !== undefined) {
    const code = String(body.code ?? '').trim().slice(0, 40)
    if (code) {
      const dup =
        type === 'cabinet'
          ? await db.archiveCabinet.findFirst({ where: { code, NOT: { id } } })
          : type === 'shelf'
            ? await db.archiveShelf.findFirst({ where: { code, NOT: { id } } })
            : await db.archiveBinder.findFirst({ where: { code, NOT: { id } } })
      if (dup) return fail('این کد قبلاً استفاده شده است')
      data.code = code
    }
  }

  if (!Object.keys(data).length) return fail('فیلدی برای ویرایش ارسال نشده است')

  const updated =
    type === 'cabinet'
      ? await db.archiveCabinet.update({ where: { id }, data })
      : type === 'shelf'
        ? await db.archiveShelf.update({ where: { id }, data })
        : await db.archiveBinder.update({ where: { id }, data })

  await logActivity({
    userId: me.id, userName: me.fullName,
    action: 'archive.structure.update', actionLabel: 'ساختار آرشیو',
    category: 'archive', detail: `ویرایش ${label}`, entityId: id,
  })

  return ok({ type, node: updated })
}

/** DELETE /api/archive/structure?type=&id=&force=1 — حذف نود
 *  اگر سندی به زون‌بندهای زیرمجموعه وصل باشد، بدون force حذف مسدود و تعداد برگردانده می‌شود؛
 *  با force اسناد «بدون جایگاه» می‌شوند (binderId=null) و نود حذف می‌شود. */
export async function DELETE(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!ARCHIVE_ROLES.includes(me.role)) return fail('دسترسی به آرشیو اسناد ندارید', 403)

  const url = new URL(req.url)
  const body = await req.json().catch(() => ({}) as Record<string, unknown>)
  const type = parseType(url.searchParams.get('type') ?? (body as Record<string, unknown>).type)
  const id = String(url.searchParams.get('id') ?? ((body as Record<string, unknown>).id ?? '')).trim()
  const force = url.searchParams.get('force') === '1' || body.force === true
  if (!type) return fail('نوع نود باید cabinet یا shelf یا binder باشد')
  if (!id) return fail('شناسهٔ نود لازم است')

  /* زون‌بندهای زیرمجموعهٔ نود → شمارش اسناد متصل */
  let binderIds: string[] = []
  let label = ''
  if (type === 'cabinet') {
    const cab = await db.archiveCabinet.findUnique({ where: { id } })
    if (!cab) return fail('کابینت یافت نشد', 404)
    const shelves = await db.archiveShelf.findMany({ where: { cabinetId: id }, select: { id: true } })
    binderIds = (
      await db.archiveBinder.findMany({ where: { shelfId: { in: shelves.map((s) => s.id) } }, select: { id: true } })
    ).map((b) => b.id)
    label = `کابینت «${cab.name}»`
  } else if (type === 'shelf') {
    const shelf = await db.archiveShelf.findUnique({ where: { id } })
    if (!shelf) return fail('قفسه یافت نشد', 404)
    binderIds = (await db.archiveBinder.findMany({ where: { shelfId: id }, select: { id: true } })).map((b) => b.id)
    label = `قفسهٔ «${shelf.name}»`
  } else {
    const binder = await db.archiveBinder.findUnique({ where: { id } })
    if (!binder) return fail('زون‌بند یافت نشد', 404)
    binderIds = [id]
    label = `زون‌بند «${binder.name}»`
  }

  const docCount = binderIds.length
    ? await db.archiveDocument.count({ where: { binderId: { in: binderIds } } })
    : 0
  if (docCount > 0 && !force) {
    return fail(`${label} به ${toFaDigits(docCount)} سند بایگانی‌شده متصل است — ابتدا اسناد را به زون‌بند دیگری منتقل کنید یا با تأیید قطعی، جایگاه آن‌ها را بردارید`)
  }

  let detached = 0
  if (binderIds.length) {
    const res = await db.archiveDocument.updateMany({
      where: { binderId: { in: binderIds } },
      data: { binderId: null },
    })
    detached = res.count
  }

  if (type === 'cabinet') await db.archiveCabinet.delete({ where: { id } })
  else if (type === 'shelf') await db.archiveShelf.delete({ where: { id } })
  else await db.archiveBinder.delete({ where: { id } })

  await logActivity({
    userId: me.id, userName: me.fullName,
    action: 'archive.structure.delete', actionLabel: 'ساختار آرشیو',
    category: 'archive',
    detail: `حذف ${label}${detached ? ` — ${detached} سند بدون جایگاه شد` : ''}`,
    entityId: id,
  })

  return ok({ deleted: true, detached })
}
