import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson, clampInt } from '@/lib/api'
import { getSessionUser, type SessionUser } from '@/lib/auth'

function canMutateSuppliers(u: SessionUser | null): boolean {
  return !!u && (['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(u.role) || u.role === 'ACC')
}

/** Supplier extras (economicCode / nationalId / postalCode) live in a JSON envelope inside the `note` column. */
type SupplierExtras = { note?: string | null; economicCode?: string | null; nationalId?: string | null; postalCode?: string | null }

function parseNote(raw: string | null): SupplierExtras {
  if (!raw) return {}
  if (raw.startsWith('{')) {
    const parsed = safeJson<SupplierExtras>(raw, {})
    if (parsed && typeof parsed === 'object' && ('note' in parsed || 'economicCode' in parsed || 'nationalId' in parsed || 'postalCode' in parsed)) {
      return parsed
    }
  }
  return { note: raw }
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function listItem(s: {
  id: string
  name: string
  code: string | null
  phone: string | null
  job: string | null
  classification: string | null
  balance: number | null
  creditLimit: number
  status: string
}) {
  return {
    id: s.id,
    name: s.name,
    code: s.code,
    phone: s.phone,
    job: s.job,
    classification: s.classification,
    balance: s.balance,
    creditLimit: s.creditLimit,
    status: s.status,
  }
}

/** GET /api/suppliers — live list shape + classifications aggregation */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') ?? '').trim()
  const classification = sp.get('classification') ?? ''
  const sort = (sp.get('sort') ?? 'name').trim()
  const page = Math.max(1, clampInt(sp.get('page'), 1, 100000, 1))
  const pageSize = Math.max(1, clampInt(sp.get('pageSize'), 1, 100, 24))

  const and: Record<string, unknown>[] = []
  if (q) {
    and.push({ OR: [{ name: { contains: q } }, { code: { contains: q } }, { phone: { contains: q } }] })
  }
  if (classification) and.push({ classification })
  const where = and.length ? { AND: and } : {}

  const total = await db.supplier.count({ where })
  const orderBy =
    sort === 'balance'
      ? [{ balance: 'desc' as const }, { id: 'asc' as const }]
      : sort === 'creditLimit'
        ? [{ creditLimit: 'desc' as const }, { id: 'asc' as const }]
        : [{ name: 'asc' as const }, { id: 'asc' as const }]

  const rows = await db.supplier.findMany({
    where,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
  })

  const counts = await db.order.groupBy({ by: ['supplierId'], _count: { _all: true } })
  const countMap = new Map(counts.map((c) => [c.supplierId, c._count._all]))

  const items = rows.map((s) => ({ ...listItem(s), ordersCount: (s.id ? countMap.get(s.id) : 0) ?? 0 }))

  // classifications aggregation (live: [{name:تهران,count:1166},{name:حومه,count:4}] — nulls excluded)
  const all = await db.supplier.findMany({ select: { classification: true } })
  const byClass: Record<string, number> = {}
  for (const s of all) if (s.classification) byClass[s.classification] = (byClass[s.classification] ?? 0) + 1
  const classifications = Object.entries(byClass)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }))

  const pages = Math.max(1, Math.ceil(total / pageSize))
  return ok({ items, classifications, total, page, pageSize, pages })
}

/** POST /api/suppliers {name, code?, phone?, job?, classification?, economicCode?, nationalId?, postalCode?, intermediary?, balance?, creditLimit?, note?} */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canMutateSuppliers(user)) return fail('برای ثبت طرف حساب دسترسی مدیران لازم است', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const name = String(body.name ?? '').trim()
  if (!name) return fail('نام طرف حساب الزامی است')

  const code = body.code ? String(body.code).trim() : null
  if (code) {
    const dup = await db.supplier.findFirst({ where: { code } })
    if (dup) return fail('کد طرف حساب تکراری است')
  }

  const extras: SupplierExtras = {
    note: body.note ? String(body.note) : null,
    economicCode: body.economicCode ? String(body.economicCode) : null,
    nationalId: body.nationalId ? String(body.nationalId) : null,
    postalCode: body.postalCode ? String(body.postalCode) : null,
  }
  const noteStore =
    extras.economicCode || extras.nationalId || extras.postalCode || extras.note ? JSON.stringify(extras) : null

  const created = await db.supplier.create({
    data: {
      name,
      code,
      phone: body.phone ? String(body.phone) : null,
      job: body.job ? String(body.job) : null,
      classification: body.classification ? String(body.classification) : null,
      intermediary: body.intermediary ? String(body.intermediary) : null,
      balance: toNumberOrNull(body.balance),
      creditLimit: toNumberOrNull(body.creditLimit) ?? 0,
      status: 'فعال',
      note: noteStore,
    },
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'supplier_create',
    actionLabel: 'ثبت طرف حساب',
    category: 'suppliers',
    detail: `ثبت طرف حساب «${name}»${code ? ` با کد ${code}` : ''}`,
    entityId: created.id,
  })

  return ok({ id: created.id, name: created.name, code: created.code, status: created.status })
}
