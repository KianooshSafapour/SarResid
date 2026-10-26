import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, safeJson } from '@/lib/api'
import { getSessionUser, type SessionUser } from '@/lib/auth'

function canMutateSuppliers(u: SessionUser | null): boolean {
  return !!u && (['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(u.role) || u.role === 'ACC')
}

/** Supplier extras (economicCode / nationalId / postalCode) live in a JSON envelope inside the `note` column. */
type SupplierExtras = {
  note?: string | null
  economicCode?: string | null
  nationalId?: string | null
  postalCode?: string | null
}

function parseNote(raw: string | null): SupplierExtras {
  if (!raw) return {}
  if (raw.startsWith('{')) {
    const parsed = safeJson<SupplierExtras>(raw, {})
    if (
      parsed &&
      typeof parsed === 'object' &&
      ('note' in parsed || 'economicCode' in parsed || 'nationalId' in parsed || 'postalCode' in parsed)
    ) {
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

async function detail(id: string) {
  const s = await db.supplier.findUnique({ where: { id } })
  if (!s) return null

  const extras = parseNote(s.note)

  // last payment (live: 0 / null when none — matches the capture)
  const lastPayment = await db.payment.findFirst({
    where: { supplierName: s.name },
    orderBy: { createdAt: 'desc' },
  })

  const orders = await db.order.findMany({
    where: { supplierId: s.id },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { items: true } } },
  })

  return {
    id: s.id,
    name: s.name,
    searchName: s.name,
    code: s.code,
    phone: s.phone,
    economicCode: extras.economicCode ?? null,
    balance: s.balance,
    creditLimit: s.creditLimit,
    classification: s.classification,
    job: s.job,
    intermediary: s.intermediary,
    nationalId: extras.nationalId ?? null,
    postalCode: extras.postalCode ?? null,
    lastPaymentAmount: lastPayment?.amount ?? 0,
    lastPaymentDate: lastPayment?.createdAt ?? null,
    // no receipts data source exists (matches live capture: 0 / null)
    lastReceiptAmount: 0,
    lastReceiptDate: null,
    status: s.status,
    note: extras.note ?? null,
    createdAt: s.createdAt,
    orders: orders.map((o) => ({
      id: o.id,
      code: o.code,
      status: o.status,
      deliveryDate: o.deliveryDate,
      totalAmount: o.totalAmount,
      createdAt: o.createdAt,
      itemsCount: o._count.items,
    })),
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await ctx.params
  const d = await detail(id)
  if (!d) return fail('طرف حساب یافت نشد', 404)
  return ok(d)
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canMutateSuppliers(user)) return fail('برای ویرایش طرف حساب دسترسی مدیران لازم است', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const { id } = await ctx.params
  const s = await db.supplier.findUnique({ where: { id } })
  if (!s) return fail('طرف حساب یافت نشد', 404)

  const data: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return fail('نام طرف حساب الزامی است')
    data.name = name
  }
  if (body.code !== undefined) {
    const code = body.code === null || body.code === '' ? null : String(body.code).trim()
    if (code && code !== s.code) {
      const dup = await db.supplier.findFirst({ where: { code } })
      if (dup && dup.id !== s.id) return fail('کد طرف حساب تکراری است')
    }
    data.code = code
  }
  if (body.phone !== undefined) data.phone = body.phone === null || body.phone === '' ? null : String(body.phone)
  if (body.job !== undefined) data.job = body.job === null || body.job === '' ? null : String(body.job)
  if (body.classification !== undefined)
    data.classification = body.classification === null || body.classification === '' ? null : String(body.classification)
  if (body.intermediary !== undefined)
    data.intermediary = body.intermediary === null || body.intermediary === '' ? null : String(body.intermediary)
  if (body.status !== undefined) {
    // R8: فعال/غیرفعال — فقط دو مقدار معتبر؛ نرمال‌سازی ی/ک فارسی و فاصله‌ها
    const st = body.status === null ? '' : String(body.status).trim()
    const norm = st.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ')
    if (norm === 'فعال') data.status = 'فعال'
    else if (norm === 'غیر فعال' || norm === 'غیرفعال') data.status = 'غیر فعال'
    else if (st === '') data.status = null
    else return fail('وضعیت طرف حساب باید «فعال» یا «غیر فعال» باشد')
  }
  if (body.balance !== undefined) data.balance = toNumberOrNull(body.balance)
  if (body.creditLimit !== undefined) data.creditLimit = toNumberOrNull(body.creditLimit) ?? 0

  // note + extras → JSON envelope in the `note` column
  const cur = parseNote(s.note)
  const extras: SupplierExtras = {
    note:
      body.note !== undefined ? (body.note === null || body.note === '' ? null : String(body.note)) : (cur.note ?? null),
    economicCode:
      body.economicCode !== undefined
        ? body.economicCode === null || body.economicCode === ''
          ? null
          : String(body.economicCode)
        : (cur.economicCode ?? null),
    nationalId:
      body.nationalId !== undefined
        ? body.nationalId === null || body.nationalId === ''
          ? null
          : String(body.nationalId)
        : (cur.nationalId ?? null),
    postalCode:
      body.postalCode !== undefined
        ? body.postalCode === null || body.postalCode === ''
          ? null
          : String(body.postalCode)
        : (cur.postalCode ?? null),
  }
  data.note =
    extras.economicCode || extras.nationalId || extras.postalCode || extras.note ? JSON.stringify(extras) : null

  await db.supplier.update({ where: { id: s.id }, data })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'supplier_update',
    actionLabel: 'ویرایش طرف حساب',
    category: 'suppliers',
    detail: `طرف حساب «${(data.name as string) ?? s.name}» به‌روزرسانی شد`,
    entityId: s.id,
  })

  const d = await detail(s.id)
  return ok(d)
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canMutateSuppliers(user)) return fail('برای حذف طرف حساب دسترسی مدیران لازم است', 403)

  const { id } = await ctx.params
  const s = await db.supplier.findUnique({ where: { id } })
  if (!s) return fail('طرف حساب یافت نشد', 404)

  // soft delete — R8: فارسیِ استاندارد «غیر فعال» (قبلاً با ی عربی ذخیره می‌شد)
  await db.supplier.update({ where: { id }, data: { status: 'غیر فعال' } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'supplier_delete',
    actionLabel: 'حذف طرف حساب',
    category: 'suppliers',
    detail: `طرف حساب «${s.name}» غیرفعال شد`,
    entityId: s.id,
  })
  return ok({ id: s.id, status: 'غیر فعال' })
}
