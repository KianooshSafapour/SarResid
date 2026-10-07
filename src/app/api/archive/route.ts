import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { addDaysIso, toJalaliParts, todayIso } from '@/lib/jalali'
import { computeDisposeAfterIso, LIFECYCLE_VALUES, normalizeFiscalYear } from '@/lib/archive-records'
import { hasCap } from '@/lib/rbac'

/**
 * ساختار فیزیکی آرشیو (round-15): ویرایش کابینت/طبقه با CASCADE + زونکن کامل.
 * برچسب‌های طبقهٔ خالی (بدون زونکن) در Setting «archive.structure» نگه‌داری می‌شود
 * تا درخت کابینت→طبقه→زونکن بتواند جای خالی نشان دهد (بدون تغییر schema).
 */
const STRUCTURE_KEY = 'archive.structure'
type StructureExtras = { extraShelves: { cabinet: string; shelf: string }[] }

async function getStructure(): Promise<StructureExtras> {
  const row = await db.setting.findUnique({ where: { key: STRUCTURE_KEY } })
  try {
    const v = JSON.parse(row?.value || '{}')
    return { extraShelves: Array.isArray(v.extraShelves) ? v.extraShelves : [] }
  } catch {
    return { extraShelves: [] }
  }
}

async function saveStructure(s: StructureExtras) {
  await db.setting.upsert({
    where: { key: STRUCTURE_KEY },
    update: { value: JSON.stringify(s) },
    create: { key: STRUCTURE_KEY, value: JSON.stringify(s) },
  })
}

/** مدیریت ساختار آرشیو — نقش‌های مدیریتی یا cap آرشیو */
async function canManageArchive(me: { id: string; role: string; secondaryRoles: string[]; roleIds?: string }): Promise<boolean> {
  if (['GM', 'OM', 'ACC', 'OWNER'].includes(me.role)) return true
  return hasCap(me as any, 'archive.manage')
}

/**
 * آرشیو اسناد — hybrid digital/physical records archive.
 * Scientific basis: ISO 15489 (records management) — every record carries a
 * persistent unique identifier + a physical custody pointer (cabinet/shelf/binder/seq).
 * Classification: subject-based binder groups (supplier-category aggregation),
 * year sub-series, sequential positioning inside each binder.
 * Record-keeping continuity: every invoice carries line items (ArchiveDocItem) and
 * a link to the provider registry (partyId) so the whole supplier/product history
 * is retrievable in seconds — the bridge between digital records and the physical archive.
 */

const DEFAULT_BINDERS: { title: string; groupName: string; cabinet: string; shelf: string; colorTag: string }[] = [
  { title: 'لبنیات — کاله، رامک، پگاه، روزانه، پانال', groupName: 'لبنیات', cabinet: '۱', shelf: '۱', colorTag: '#0e7a4a' },
  { title: 'شیرینی، شکلات و آیس‌پک', groupName: 'شیرینی و شکلات', cabinet: '۱', shelf: '۲', colorTag: '#8a5a2b' },
  { title: 'کالاهای وارداتی — KitKat، Oreo، Nesquik، Mars', groupName: 'وارداتی', cabinet: '۱', shelf: '۳', colorTag: '#c9a227' },
  { title: 'اسباب‌بازی و لوازم‌تحریر', groupName: 'اسباب‌بازی و لوازم‌تحریر', cabinet: '۱', shelf: '۴', colorTag: '#c96f4a' },
  { title: 'نوشیدنی و آبمیوه', groupName: 'نوشیدنی', cabinet: '۲', shelf: '۱', colorTag: '#77934a' },
  { title: 'خواروبار، غلات و کنسرو', groupName: 'خواروبار', cabinet: '۲', shelf: '۲', colorTag: '#0e7a4a' },
  { title: 'آجیل و خشکبار رفسنجان', groupName: 'آجیل و خشکبار', cabinet: '۲', shelf: '۳', colorTag: '#b3372f' },
  { title: 'شوینده، بهداشتی و سلولزی', groupName: 'بهداشتی', cabinet: '۲', shelf: '۴', colorTag: '#1e40af' },
  { title: 'پروتئینی — مرغ، گوشت، سوسیس', groupName: 'پروتئینی', cabinet: '۳', shelf: '۱', colorTag: '#b3372f' },
  { title: 'یخچالی و انجمادی', groupName: 'یخچالی', cabinet: '۳', shelf: '۲', colorTag: '#6d28d9' },
  { title: 'میوه و سبزی', groupName: 'میوه و سبزی', cabinet: '۳', shelf: '۳', colorTag: '#3f6212' },
  { title: 'اسناد بانکی، ضمانت‌نامه‌ها و اصل چک‌ها', groupName: 'بانکی', cabinet: '۴', shelf: '۱', colorTag: '#a16207' },
  { title: 'قراردادها و اسناد حقوقی', groupName: 'حقوقی', cabinet: '۴', shelf: '۲', colorTag: '#334155' },
  { title: 'صورتحساب خدمات، تعمیرات و نگهداری', groupName: 'خدمات', cabinet: '۴', shelf: '۳', colorTag: '#9a3412' },
  { title: 'بیمه، مالیات و عوارض', groupName: 'بیمه و مالیات', cabinet: '۴', shelf: '۴', colorTag: '#0f766e' },
  { title: 'نامه‌نگاری اداری و مکاتبات', groupName: 'اداری', cabinet: '۵', shelf: '۱', colorTag: '#6b7280' },
  { title: 'اسناد پرسنلی و کارگزینی', groupName: 'پرسنلی', cabinet: '۵', shelf: '۲', colorTag: '#991b1b' },
  { title: 'فروش، پیش‌فاکتور و مشتریان عمده', groupName: 'فروش', cabinet: '۵', shelf: '۳', colorTag: '#166534' },
  { title: 'مرجوعی‌ها، گیرش‌ها و اعتبارنامه‌ها', groupName: 'مرجوعی', cabinet: '۵', shelf: '۴', colorTag: '#c96f4a' },
  { title: 'متفرقه و اسناد قدیمی', groupName: 'متفرقه', cabinet: '۵', shelf: '۵', colorTag: '#8a5a2b' },
]

/** مهلت دفع در آستانهٔ ۶۰ روز آینده → ویجت «سرِرسید نگهداری» (هرگز دفع خودکار انجام نمی‌شود) */
const RETENTION_WINDOW_DAYS = 60

/** generic legal-entity words — excluded from fuzzy token matching */
const GENERIC_WORDS = ['شرکت', 'بازرگانی', 'پخش', 'فروشگاه', 'کارخانه', 'گروه']

function partyTokens(s: string): string[] {
  return String(s || '')
    .toLowerCase()
    .split(/[\s،ـ\-–—_()[\]«»؛.,:]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !GENERIC_WORDS.includes(w))
}

/** fuzzy-match a free-text party string against Provider.name + Provider.companyNames (JSON array) */
async function matchProviderId(party: string): Promise<string> {
  const needle = String(party || '').trim().toLowerCase()
  if (needle.length < 3) return ''
  const providers = await db.provider.findMany({ where: { active: true }, select: { id: true, name: true, companyNames: true } })
  const tokens = partyTokens(needle)
  for (const p of providers) {
    let candidates: string[] = [p.name]
    try {
      const arr = JSON.parse(p.companyNames || '[]')
      if (Array.isArray(arr)) candidates = candidates.concat(arr.map((c: any) => String(c)))
    } catch { /* malformed JSON — name only */ }
    for (const c of candidates) {
      const cl = String(c || '').trim().toLowerCase()
      if (cl.length < 3) continue
      const clTight = cl.replace(/\s+/g, '')
      // token containment (both directions) + full-string containment
      if (tokens.some((t) => cl.includes(t) || (clTight.length && t.includes(clTight)))) return p.id
      if (cl.includes(needle) || needle.includes(clTight)) return p.id
    }
  }
  return ''
}

async function ensureDefaults() {
  const count = await db.archiveBinder.count()
  if (count > 0) return
  let i = 1
  for (const b of DEFAULT_BINDERS) {
    await db.archiveBinder.create({
      data: { ...b, code: `B-${String(i).padStart(2, '0')}`, capacity: 250 },
    })
    i++
  }
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  await ensureDefaults()

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  const binderId = url.searchParams.get('binderId') || ''
  const status = url.searchParams.get('status') || ''
  const docType = url.searchParams.get('docType') || ''
  const partyId = url.searchParams.get('partyId') || ''
  const partyName = url.searchParams.get('party') || ''
  const docId = url.searchParams.get('docId') || ''
  const lifecycle = url.searchParams.get('lifecycle') || ''
  const retentionDue = url.searchParams.get('retention') === 'due'

  // ── lightweight rep list for pickers (نمایندهٔ طرف حساب) ──
  if (url.searchParams.get('reps')) {
    const reps = await db.salesRep.findMany({
      orderBy: [{ active: 'desc' }, { fullName: 'asc' }],
      select: { id: true, fullName: true, providerName: true, providerId: true, jobRole: true, mobile: true, active: true },
    })
    return json({ reps })
  }

  // ── single document + invoice line items + custody chain + DocEvent ledger ──
  if (docId) {
    const doc = await db.archiveDoc.findUnique({ where: { id: docId } })
    if (!doc) return fail('سند یافت نشد', 404)
    const items = await db.archiveDocItem.findMany({ where: { docId } })
    const custody = await db.archiveCustody.findMany({ where: { docId }, take: 30, orderBy: { createdAt: 'desc' } })
    const eventRows = await db.docEvent.findMany({ where: { docId }, take: 30, orderBy: [{ at: 'desc' }, { createdAt: 'desc' }] })
    return json({
      doc,
      items,
      custody,
      events: eventRows.map((e) => {
        let evItems: any[] = []
        try {
          const arr = JSON.parse(e.items || '[]')
          if (Array.isArray(arr)) evItems = arr
        } catch { /* malformed */ }
        return { ...e, items: evItems }
      }),
    })
  }

  const binders = await db.archiveBinder.findMany({ where: { active: true }, orderBy: { code: 'asc' } })
  const docCounts = await db.archiveDoc.groupBy({ by: ['binderId'], _count: { _all: true }, where: { status: { not: 'DESTROYED' } } })
  const countMap = new Map(docCounts.map((d) => [d.binderId, d._count._all]))

  const where: any = {}
  if (binderId) where.binderId = binderId
  if (status) where.status = status
  if (docType) where.docType = docType
  if (lifecycle && LIFECYCLE_VALUES.includes(lifecycle)) where.lifecycle = lifecycle
  if (partyId || partyName) {
    where.AND = [{ OR: [...(partyId ? [{ partyId }] : []), ...(partyName ? [{ party: partyName }] : [])] }]
  }
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { party: { contains: q } },
      { code: { contains: q } },
      { invoiceNo: { contains: q } },
      { refOrderCode: { contains: q } },
      { notes: { contains: q } },
      { holooInvoiceNo: { contains: q } },
      { holooReceiptNo: { contains: q } },
      { repName: { contains: q } },
    ]
  }
  // ?retention=due → اسنادی که مهلت نگهداری‌شان تا ۶۰ روز آینده تمام می‌شود (یا قدیمی‌های بدون محاسبهٔ مهلت)
  if (retentionDue) {
    const cutoff = addDaysIso(RETENTION_WINDOW_DAYS)
    where.AND = [
      ...(where.AND || []),
      { lifecycle: { not: 'DISPOSED' } },
      { legalHold: false },
      { OR: [{ disposeAfterIso: { lte: cutoff } }, { disposeAfterIso: '' }] },
    ]
  }
  let docs = await db.archiveDoc.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 })

  // legacy docs without a computed disposal date: derive from fiscalYear (or docDate year) in JS
  if (retentionDue) {
    const cutoff = addDaysIso(RETENTION_WINDOW_DAYS)
    docs = docs.filter((d) => {
      const eff = d.disposeAfterIso || computeDisposeAfterIso(d.fiscalYear || String(toJalaliParts(d.docDate || todayIso()).jy), d.retentionYears)
      return Boolean(eff) && eff <= cutoff
    })
  }

  // ── supplier directory: group all active docs by party (independent of filters above) ──
  const dirRows = await db.archiveDoc.groupBy({
    by: ['party', 'partyId'],
    where: { status: { not: 'DESTROYED' } },
    _count: { _all: true },
    _sum: { amount: true },
    _max: { docDate: true },
    _min: { docDate: true },
  })
  const merged = new Map<string, { party: string; partyId: string; docCount: number; totalAmount: number; lastDate: string; firstDate: string }>()
  for (const r of dirRows) {
    const cur = merged.get(r.party)
    if (cur) {
      cur.docCount += r._count._all
      cur.totalAmount += r._sum.amount || 0
      if ((r._max.docDate || '') > cur.lastDate) cur.lastDate = r._max.docDate || ''
      if (cur.firstDate === '' || (r._min.docDate || '') < cur.firstDate) cur.firstDate = r._min.docDate || ''
      if (!cur.partyId && r.partyId) cur.partyId = r.partyId
    } else {
      merged.set(r.party, {
        party: r.party,
        partyId: r.partyId,
        docCount: r._count._all,
        totalAmount: r._sum.amount || 0,
        lastDate: r._max.docDate || '',
        firstDate: r._min.docDate || '',
      })
    }
  }
  const parties = [...merged.values()]
    .sort((a, b) => b.docCount - a.docCount || b.totalAmount - a.totalAmount)
    .slice(0, 60)

  const monthPrefix = todayIso().slice(0, 7)
  const stats = {
    docs: await db.archiveDoc.count({ where: { status: { not: 'DESTROYED' } } }),
    binders: binders.length,
    borrowed: await db.archiveDoc.count({ where: { status: 'BORROWED' } }),
    monthIntake: await db.archiveDoc.count({ where: { createdAt: { gte: new Date(`${monthPrefix}-01T00:00:00`) } } }),
    totalValue: await db.archiveDoc.aggregate({ _sum: { amount: true }, where: { status: { not: 'DESTROYED' } } }),
    parties: parties.length,
    // ویجت نگهداری: سرِرسید مهلت دفع + در انتظار دفع (دفع هرگز خودکار نیست)
    retentionDue: await db.archiveDoc.count({
      where: { lifecycle: { not: 'DISPOSED' }, legalHold: false, OR: [{ disposeAfterIso: { lte: addDaysIso(RETENTION_WINDOW_DAYS) } }, { disposeAfterIso: '' }] },
    }),
    disposalPending: await db.archiveDoc.count({ where: { lifecycle: 'DISPOSAL_PENDING' } }),
  }

  const structure = await getStructure()

  return json({
    binders: binders.map((b) => ({ ...b, docCount: countMap.get(b.id) || 0 })),
    docs,
    parties,
    structure,
    stats: { ...stats, totalValue: stats.totalValue._sum?.amount || 0 },
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  const kind = String(body.kind || 'doc')

  // ── ویرایش ساختار آرشیو (کابینت/طبقه) — CASCADE روی همهٔ زونکن‌ها در یک تراکنش ──
  if (kind === 'structure') {
    if (!(await canManageArchive(me as any)))
      return fail('ویرایش ساختار آرشیو نیازمند دسترسی مدیریت آرشیو است', 403)
    const action = String(body.action || '')
    const structure = await getStructure()

    if (action === 'rename') {
      const fromCabinet = String(body.fromCabinet || '').trim()
      const toCabinet = String(body.toCabinet ?? '').trim()
      const fromShelf = String(body.fromShelf ?? '').trim()
      const toShelf = String(body.toShelf ?? '').trim()
      if (!fromCabinet) return fail('کابینت مبدأ الزامی است', 400)
      if (!toCabinet && !toShelf) return fail('نام جدید کابینت یا طبقه را وارد کنید', 400)

      const finalCabinet = toCabinet || fromCabinet
      const ops: any[] = []

      if (toCabinet && toCabinet !== fromCabinet) {
        const collision = await db.archiveBinder.count({ where: { cabinet: toCabinet } })
        if (collision > 0) return fail(`کابینتی با نام «${toCabinet}» از قبل وجود دارد`, 409)
        ops.push(db.archiveBinder.updateMany({ where: { cabinet: fromCabinet }, data: { cabinet: toCabinet } }))
      }

      if (fromShelf && toShelf && toShelf !== fromShelf) {
        const collision = await db.archiveBinder.count({ where: { cabinet: finalCabinet, shelf: toShelf } })
        if (collision > 0) return fail(`طبقه‌ای با نام «${toShelf}» در کابینت ${finalCabinet} از قبل وجود دارد`, 409)
        ops.push(db.archiveBinder.updateMany({ where: { cabinet: finalCabinet, shelf: fromShelf }, data: { shelf: toShelf } }))
      }

      await db.$transaction(ops)

      // برچسب‌های طبقهٔ خالی را هم هم‌راستا کن (CASCADE روی registry)
      let extraShelves = structure.extraShelves
      if (toCabinet && toCabinet !== fromCabinet)
        extraShelves = extraShelves.map((s) => (s.cabinet === fromCabinet ? { ...s, cabinet: toCabinet } : s))
      if (fromShelf && toShelf && toShelf !== fromShelf)
        extraShelves = extraShelves.map((s) => (s.cabinet === finalCabinet && s.shelf === fromShelf ? { ...s, shelf: toShelf } : s))
      if (extraShelves !== structure.extraShelves) await saveStructure({ extraShelves })

      await logActivity(
        me,
        'ویرایش ساختار آرشیو (تغییر نام)',
        'archive-structure',
        fromCabinet,
        `${fromCabinet}${toCabinet && toCabinet !== fromCabinet ? ` → ${toCabinet}` : ''}${fromShelf && toShelf && toShelf !== fromShelf ? ` — طبقهٔ ${fromShelf} → ${toShelf}` : ''}`,
      )
      return json({ ok: true, structure: { extraShelves } })
    }

    if (action === 'add-shelf') {
      const cabinet = String(body.cabinet || '').trim()
      const shelf = String(body.shelf || '').trim()
      if (!cabinet || !shelf) return fail('کابینت و نام طبقه الزامی است', 400)
      const bindersHere = await db.archiveBinder.count({ where: { cabinet, shelf } })
      if (bindersHere > 0 || structure.extraShelves.some((s) => s.cabinet === cabinet && s.shelf === shelf))
        return fail(`طبقه‌ای با نام «${shelf}» در کابینت ${cabinet} از قبل وجود دارد`, 409)
      const extraShelves = [...structure.extraShelves, { cabinet, shelf }]
      await saveStructure({ extraShelves })
      await logActivity(me, 'افزودن طبقه به ساختار آرشیو', 'archive-structure', cabinet, `کابینت ${cabinet} — طبقهٔ ${shelf}`)
      return json({ ok: true, structure: { extraShelves } }, 201)
    }

    if (action === 'del-shelf') {
      const cabinet = String(body.cabinet || '').trim()
      const shelf = String(body.shelf || '').trim()
      if (!cabinet || !shelf) return fail('کابینت و نام طبقه الزامی است', 400)
      const used = await db.archiveBinder.count({ where: { cabinet, shelf } })
      if (used > 0) return fail(`${used} زونکن در این طبقه است — حذف طبقه ممکن نیست`, 409)
      const extraShelves = structure.extraShelves.filter((s) => !(s.cabinet === cabinet && s.shelf === shelf))
      await saveStructure({ extraShelves })
      await logActivity(me, 'حذف طبقه از ساختار آرشیو', 'archive-structure', cabinet, `کابینت ${cabinet} — طبقهٔ ${shelf}`)
      return json({ ok: true, structure: { extraShelves } })
    }

    if (action === 'del-cabinet') {
      const cabinet = String(body.cabinet || '').trim()
      if (!cabinet) return fail('نام کابینت الزامی است', 400)
      const used = await db.archiveBinder.count({ where: { cabinet } })
      if (used > 0) return fail(`کابینت ${cabinet} خالی نیست (${used} زونکن) — حذف ممکن نیست`, 409)
      const extraShelves = structure.extraShelves.filter((s) => s.cabinet !== cabinet)
      await saveStructure({ extraShelves })
      await logActivity(me, 'حذف کابینت از ساختار آرشیو', 'archive-structure', cabinet)
      return json({ ok: true, structure: { extraShelves } })
    }

    return fail('عملیات ساختار نامعتبر است', 400)
  }

  // ── register a new binder ──
  if (kind === 'binder') {
    if (!['GM', 'OM', 'ACC', 'OWNER'].includes(me.role))
      return fail('تنها مدیریت مجاز به ثبت زونکن جدید است', 403)
    if (!body.title) return fail('عنوان زونکن الزامی است', 400)
    const maxBinder = await db.archiveBinder.findFirst({ orderBy: { code: 'desc' } })
    const nextNum = maxBinder ? (Number(maxBinder.code.replace(/\D/g, '')) || 0) + 1 : 1
    const binder = await db.archiveBinder.create({
      data: {
        code: `B-${String(nextNum).padStart(2, '0')}`,
        title: String(body.title),
        groupName: String(body.groupName || body.title),
        cabinet: String(body.cabinet || '۱'),
        shelf: String(body.shelf || '۱'),
        colorTag: String(body.colorTag || '#0e7a4a'),
        capacity: Number(body.capacity) || 250,
        notes: String(body.notes || ''),
      },
    })
    await logActivity(me, 'ثبت زونکن آرشیو', 'archive-binder', binder.id, binder.code)
    return json({ binder }, 201)
  }

  // ── register a document into the physical archive ──
  if (!['GM', 'OM', 'ACC', 'OWNER', 'SK'].includes(me.role))
    return fail('اجازهٔ ثبت سند در آرشیو را ندارید', 403)
  if (!body.title || !body.party) return fail('عنوان سند و طرف حساب الزامی است', 400)

  // validate + normalize line items (before binder selection so invalid input fails fast)
  const rawItems: any[] = Array.isArray(body.items) ? body.items : []
  const productRows = await db.product.findMany({ select: { id: true, name: true, barcodes: true } })
  const productByName = new Map(productRows.map((p) => [p.name, p]))
  const itemsToCreate: {
    docId: string; productId: string; productName: string; barcode: string; qty: number; unit: string; unitPrice: number; expiryDate: string
    returned: boolean; returnReason: string; rejected: boolean; rejectReason: string; missing: boolean
  }[] = []
  for (const it of rawItems) {
    const name = String(it?.productName || it?.name || '').trim()
    if (!name) return fail('برای هر ردیف کالا، نام کالا الزامی است', 400)
    let productId = String(it?.productId || '')
    let barcode = String(it?.barcode || '')
    const p = productByName.get(name)
    if (p) {
      if (!productId) productId = p.id
      if (!barcode) {
        try {
          const b = JSON.parse(p.barcodes || '[]')
          if (Array.isArray(b) && b[0]) barcode = String(b[0])
        } catch { /* ignore malformed */ }
      }
    }
    itemsToCreate.push({
      docId: '',
      productId,
      productName: name,
      barcode,
      qty: Number(it?.qty) || 0,
      unit: String(it?.unit || 'عدد'),
      unitPrice: Number(it?.unitPrice) || 0,
      expiryDate: String(it?.expiryDate || ''),
      returned: Boolean(it?.returned),
      returnReason: String(it?.returnReason || ''),
      rejected: Boolean(it?.rejected),
      rejectReason: String(it?.rejectReason || ''),
      missing: Boolean(it?.missing),
    })
  }

  const binders = await db.archiveBinder.findMany({ where: { active: true }, orderBy: { code: 'asc' } })
  const docCounts = await db.archiveDoc.groupBy({ by: ['binderId'], _count: { _all: true }, where: { status: { not: 'DESTROYED' } } })
  const countMap = new Map(docCounts.map((d) => [d.binderId, d._count._all]))

  // binder selection: explicit → subject match (party words vs binder title/group) → least-full binder
  let binder = binders.find((b) => b.id === body.binderId)
  let pickReason = 'انتخاب دستی'
  if (!binder) {
    const needle = String(body.party).trim()
    const words = partyTokens(needle)
    binder =
      binders.find((b) => words.some((w) => b.groupName.includes(w) || b.title.includes(w)) && (countMap.get(b.id) || 0) < b.capacity)
    if (binder) pickReason = 'تطبیق موضوعی خودکار'
    else binder = binders.find((b) => (countMap.get(b.id) || 0) < b.capacity) || binders[0]
    if (!binder) return fail('هیچ زونکن فعالی یافت نشد — ابتدا زونکن ثبت کنید', 400)
  }

  // auto-link the party to the provider registry (fuzzy token match on name + companyNames)
  let partyId = String(body.partyId || '')
  if (!partyId) partyId = await matchProviderId(body.party)

  const seq = (countMap.get(binder.id) || 0) + 1
  const jy = toJalaliParts(body.docDate || todayIso()).jy
  const code = `${binder.code.replace('-', '')}-${jy}-${String(seq).padStart(3, '0')}`

  // ── lifecycle-init (ISO 15489): fiscalYear = سال مالی جلالی سند — لنگر قانونی نگهداری ──
  const fiscalYear = body.fiscalYear !== undefined && String(body.fiscalYear).trim() !== '' ? normalizeFiscalYear(body.fiscalYear) : String(jy)
  const retentionYears = Number(body.retentionYears) || 10 // قانون تجارت ماده ۱۳
  const disposeAfterIso = computeDisposeAfterIso(fiscalYear, retentionYears)
  const lifecycle = LIFECYCLE_VALUES.includes(String(body.lifecycle)) ? String(body.lifecycle) : 'ACTIVE'

  // نمایندهٔ طرف حساب — اگر فقط repId داده شده، نامش از دفتر نمایندگان خوانده می‌شود
  let repName = String(body.repName || '').trim()
  const repId = String(body.repId || '')
  if (repId && !repName) {
    const rep = await db.salesRep.findUnique({ where: { id: repId } })
    if (rep) repName = rep.fullName
  }

  const deliveryAt = String(body.deliveryAt || '')
  const holooInvoiceNo = String(body.holooInvoiceNo || '').trim()

  const doc = await db.archiveDoc.create({
    data: {
      code,
      title: String(body.title),
      docType: String(body.docType || 'INVOICE'),
      party: String(body.party),
      partyId,
      amount: Number(body.amount) || 0,
      docDate: String(body.docDate || todayIso()),
      invoiceNo: String(body.invoiceNo || ''),
      binderId: binder.id,
      binderCode: binder.code,
      seq,
      refOrderCode: String(body.refOrderCode || ''),
      notes: String(body.notes || ''),
      createdById: me.id,
      createdByName: me.name,
      lifecycle,
      fiscalYear,
      retentionYears,
      disposeAfterIso,
      confidentiality: ['PUBLIC', 'STAFF', 'MANAGEMENT'].includes(String(body.confidentiality)) ? String(body.confidentiality) : 'STAFF',
      legalHold: Boolean(body.legalHold),
      repId,
      repName,
      holooInvoiceNo,
      holooReceiptNo: String(body.holooReceiptNo || '').trim(),
      paymentStatus: ['UNPAID', 'PARTIAL', 'PAID'].includes(String(body.paymentStatus)) ? String(body.paymentStatus) : 'UNPAID',
      paidAmount: Number(body.paidAmount) || 0,
      deliveryAt,
      submittedAt: String(body.submittedAt || ''),
    },
  })

  let itemsCreated = 0
  if (itemsToCreate.length) {
    await db.archiveDocItem.createMany({ data: itemsToCreate.map((i) => ({ ...i, docId: doc.id })) })
    itemsCreated = itemsToCreate.length
  }

  // رخدادهای اولیهٔ سند در دفتر رخدادها (append-only) — بدون انتشار اعلان
  if (deliveryAt) {
    await db.docEvent.create({
      data: {
        docId: doc.id, docCode: doc.code, kind: 'DELIVERY', at: deliveryAt,
        repId, repName, note: 'تحویل کالا هنگام ثبت سند', createdById: me.id, createdByName: me.name,
      },
    })
  }
  if (holooInvoiceNo) {
    await db.docEvent.create({
      data: {
        docId: doc.id, docCode: doc.code, kind: 'HOLOO_INVOICE', at: new Date().toISOString(),
        repId, repName, holooRef: holooInvoiceNo, note: 'ثبت فاکتور خرید در هلو هنگام ثبت سند', createdById: me.id, createdByName: me.name,
      },
    })
  }

  await logActivity(me, 'ثبت سند در آرشیو', 'archive-doc', doc.id, `${code} → ${binder.code}${itemsCreated ? ` — ${itemsCreated} ردیف کالا` : ''}${repName ? ` — نماینده: ${repName}` : ''}`)
  return json(
    {
      doc,
      binder: { id: binder.id, code: binder.code, title: binder.title, cabinet: binder.cabinet, shelf: binder.shelf },
      pickReason,
      itemsCreated,
    },
    201,
  )
}

/** ویرایش زونکن — شناسنامه، موقعیت فیزیکی، کد و فعال/غیرفعال (گاردهای سندالصاقی) */
export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  const id = String(body.id || '')
  if (!id) return fail('شناسهٔ زونکن الزامی است', 400)
  const binder = await db.archiveBinder.findUnique({ where: { id } })
  if (!binder) return fail('زونکن یافت نشد', 404)

  const data: Record<string, unknown> = {}
  const changed: string[] = []

  if (body.title !== undefined) {
    const title = String(body.title || '').trim()
    if (!title) return fail('عنوان زونکن الزامی است', 400)
    if (title !== binder.title) { data.title = title; changed.push('title') }
  }
  if (body.groupName !== undefined) {
    const groupName = String(body.groupName || '').trim()
    if (groupName !== binder.groupName) { data.groupName = groupName; changed.push('groupName') }
  }
  if (body.cabinet !== undefined) {
    const cabinet = String(body.cabinet || '').trim()
    if (!cabinet) return fail('کابینت نمی‌تواند خالی باشد', 400)
    if (cabinet !== binder.cabinet) { data.cabinet = cabinet; changed.push('cabinet') }
  }
  if (body.shelf !== undefined) {
    const shelf = String(body.shelf || '').trim()
    if (!shelf) return fail('طبقه نمی‌تواند خالی باشد', 400)
    if (shelf !== binder.shelf) { data.shelf = shelf; changed.push('shelf') }
  }
  if (body.colorTag !== undefined && String(body.colorTag) !== binder.colorTag) { data.colorTag = String(body.colorTag); changed.push('colorTag') }
  if (body.capacity !== undefined) {
    const capacity = Number(body.capacity) || 250
    if (capacity !== binder.capacity) { data.capacity = capacity; changed.push('capacity') }
  }
  if (body.notes !== undefined) {
    const notes = String(body.notes || '')
    if (notes !== binder.notes) { data.notes = notes; changed.push('notes') }
  }

  // کد زونکن فقط تا وقتی سند الصاق نشده قابل تغییر است (ISO 15489: شناسهٔ اسنادِ الصاق‌شده تغییر نمی‌کند)
  if (body.code !== undefined && String(body.code).trim() !== binder.code) {
    const docCount = await db.archiveDoc.count({ where: { binderId: id } })
    if (docCount > 0) return fail('به این زونکن سند الصاق شده — کد تغییر نمی‌کند', 409)
    const code = String(body.code).trim()
    const dup = await db.archiveBinder.findFirst({ where: { code, id: { not: id } } })
    if (dup) return fail(`کد «${code}» برای زونکن دیگری استفاده شده است`, 409)
    data.code = code
    changed.push('code')
  }

  if (body.active !== undefined && Boolean(body.active) !== binder.active) {
    if (!body.active) {
      const docCount = await db.archiveDoc.count({ where: { binderId: id } })
      if (docCount > 0) return fail(`به این زونکن ${docCount} سند الصاق شده — غیرفعال‌سازی ممکن نیست`, 409)
    }
    data.active = Boolean(body.active)
    changed.push('active')
  }

  if (!Object.keys(data).length) return fail('تغییری برای ذخیره ارسال نشده است', 400)
  const updated = await db.archiveBinder.update({ where: { id }, data })
  await logActivity(me, 'ویرایش زونکن آرشیو', 'archive-binder', id, `${binder.code}${changed.length ? ` — فیلدها: ${changed.join('، ')}` : ''}`)
  return json({ binder: updated })
}

/** حذف سخت زونکن — تنها وقتی هیچ سندی به آن الصاق نشده باشد */
export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canManageArchive(me as any)))
    return fail('حذف زونکن نیازمند دسترسی مدیریت آرشیو است', 403)
  const url = new URL(req.url)
  const id = String(url.searchParams.get('id') || '')
  if (!id) return fail('شناسهٔ زونکن الزامی است', 400)
  const binder = await db.archiveBinder.findUnique({ where: { id } })
  if (!binder) return fail('زونکن یافت نشد', 404)
  const docCount = await db.archiveDoc.count({ where: { binderId: id } })
  if (docCount > 0)
    return fail(`به این زونکن ${docCount} سند الصاق شده — حذف ممکن نیست؛ ابتدا اسناد را جابه‌جا کنید`, 409)
  await db.archiveBinder.delete({ where: { id } })
  await logActivity(me, 'حذف زونکن آرشیو (بدون سند)', 'archive-binder', id, binder.code)
  return json({ ok: true })
}
