import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const MANAGER_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC']
const KINDS = ['count', 'weight', 'volume']

/** GET /api/units → {units:[...]} — همهٔ کاربران واردشده (برای فرم‌های کالا و مرجوعی) */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  let units = await db.unit.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
  // خودکفا: اگر هنوز واحدی تعریف نشده، پنج واحد پایه را یک‌بار بساز
  if (units.length === 0) {
    await db.unit.createMany({
      data: [
        { name: 'عدد', kind: 'count', decimals: 0, sortOrder: 1 },
        { name: 'کیلوگرم', kind: 'weight', decimals: 3, sortOrder: 2 },
        { name: 'گرم', kind: 'weight', decimals: 3, sortOrder: 3 },
        { name: 'بسته', kind: 'count', decimals: 0, sortOrder: 4 },
        { name: 'دستی', kind: 'count', decimals: 0, sortOrder: 5 },
      ],
    })
    units = await db.unit.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
  }
  return ok({
    units: units.map((u) => ({ id: u.id, name: u.name, kind: u.kind, decimals: u.decimals, active: u.active, sortOrder: u.sortOrder })),
  })
}

/** POST /api/units — {name,kind,decimals?,sortOrder?} ایجاد واحد جدید (مدیران) */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!MANAGER_ROLES.includes(user.role)) return fail('فقط مدیران می‌توانند واحد بسازند', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const name = String(body.name ?? '').trim()
  if (name.length < 1 || name.length > 30) return fail('نام واحد باید بین ۱ تا ۳۰ نویسه باشد')
  const kind = KINDS.includes(String(body.kind)) ? String(body.kind) : 'count'
  const decimals = kind === 'count' ? 0 : Math.max(0, Math.min(4, Math.round(Number(body.decimals) || 3)))
  const sortOrder = Math.max(0, Math.min(999, Math.round(Number(body.sortOrder) || 100)))

  const exists = await db.unit.findUnique({ where: { name } })
  if (exists) return fail(`واحد «${name}» از قبل تعریف شده است`)

  const unit = await db.unit.create({ data: { name, kind, decimals, sortOrder } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'unit.create',
    actionLabel: 'واحد شمارش',
    category: 'products',
    detail: `${name} (${kind === 'weight' ? 'وزنی' : kind === 'volume' ? 'حجمی' : 'عددی'})`,
    entityId: unit.id,
  })
  return ok({ unit: { id: unit.id, name: unit.name, kind: unit.kind, decimals: unit.decimals, active: unit.active, sortOrder: unit.sortOrder } })
}

/** PATCH /api/units — {id,name?,kind?,decimals?,active?,sortOrder?} ویرایش (مدیران) */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!MANAGER_ROLES.includes(user.role)) return fail('فقط مدیران می‌توانند واحد را ویرایش کنند', 403)

  const body = await req.json().catch(() => null)
  const id = String(body?.id ?? '')
  if (!id) return fail('شناسهٔ واحد لازم است')
  const unit = await db.unit.findUnique({ where: { id } })
  if (!unit) return fail('واحد یافت نشد', 404)

  const data: { name?: string; kind?: string; decimals?: number; active?: boolean; sortOrder?: number } = {}
  if (typeof body.name === 'string' && body.name.trim()) {
    const name = body.name.trim()
    if (name !== unit.name) {
      const dup = await db.unit.findUnique({ where: { name } })
      if (dup) return fail(`واحد «${name}» از قبل تعریف شده است`)
      data.name = name
    }
  }
  if (KINDS.includes(String(body.kind))) data.kind = String(body.kind)
  if (body.decimals !== undefined) data.decimals = Math.max(0, Math.min(4, Math.round(Number(body.decimals) || 0)))
  if (body.active !== undefined) data.active = !!body.active
  if (body.sortOrder !== undefined) data.sortOrder = Math.max(0, Math.min(999, Math.round(Number(body.sortOrder) || 100)))

  const updated = await db.unit.update({ where: { id }, data })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'unit.update',
    actionLabel: 'واحد شمارش',
    category: 'products',
    detail: updated.name,
    entityId: id,
  })
  return ok({ unit: { id: updated.id, name: updated.name, kind: updated.kind, decimals: updated.decimals, active: updated.active, sortOrder: updated.sortOrder } })
}

/** DELETE /api/units?id= — حذف فقط وقتی هیچ کالایی از آن واحد استفاده نکند (مدیران) */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!MANAGER_ROLES.includes(user.role)) return fail('فقط مدیران می‌توانند واحد را حذف کنند', 403)

  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return fail('شناسهٔ واحد لازم است')
  const unit = await db.unit.findUnique({ where: { id } })
  if (!unit) return fail('واحد یافت نشد', 404)

  const inUse = await db.product.count({ where: { unit: unit.name } })
  if (inUse > 0) return fail(`${toFa(inUse)} کالا با واحد «${unit.name}» ثبت شده — اول واحد کالاها را تغییر دهید (یا واحد را غیرفعال کنید)`)

  await db.unit.delete({ where: { id } })
  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'unit.delete',
    actionLabel: 'واحد شمارش',
    category: 'products',
    detail: unit.name,
  })
  return ok({ deleted: true })
}

function toFa(n: number): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
}
