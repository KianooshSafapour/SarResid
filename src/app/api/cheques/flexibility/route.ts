import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

/** GET — all flexibility rules; auto-seeds the global ±2d default (treasury tolerance baseline) */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)

  const count = await db.flexRule.count({ where: { scope: 'GLOBAL' } })
  if (count === 0) {
    await db.flexRule.create({
      data: {
        scope: 'GLOBAL',
        label: 'سراسری — پیش‌فرض سازمان',
        dateKey: '*',
        days: 2,
        note: 'پنجرهٔ پیش‌فرض جابه‌جایی سررسید در همهٔ روزها',
      },
    })
  }

  const rules = await db.flexRule.findMany({ orderBy: [{ scope: 'asc' }, { dateKey: 'asc' }] })
  return json({ rules })
}

/** POST — upsert one rule (same scope+dateKey replaces) */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me || !['GM', 'OM', 'ACC', 'OWNER'].includes(me.role))
    return fail('تنها مدیر کل / مدیر عملیات / حسابدار / مالک مجاز به تنظیم انعطاف پرداخت است', 403)
  const body = await req.json()
  const scope = String(body.scope || 'GLOBAL')
  if (!['GLOBAL', 'YEAR', 'SEASON', 'MONTH', 'WEEK', 'DAY'].includes(scope))
    return fail('سطح قانون نامعتبر است', 400)
  const days = Math.max(0, Math.min(30, Number(body.days) || 0))
  const dateKey = scope === 'GLOBAL' ? '*' : String(body.dateKey || '')
  if (scope !== 'GLOBAL' && dateKey === '') return fail('کلید تاریخ برای این سطح الزامی است', 400)

  await db.flexRule.deleteMany({ where: { scope, dateKey } })
  const rule = await db.flexRule.create({
    data: {
      scope,
      label: String(body.label || '').trim() || scope,
      dateKey,
      days,
      note: String(body.note || ''),
      createdById: me.id,
      createdByName: me.name,
    },
  })
  await logActivity(me, 'تنظیم انعطاف پرداخت', 'flexrule', rule.id, `${scope} ±${days}`)
  return json({ rule }, 201)
}

/** DELETE — remove one rule by id */
export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me || !['GM', 'OM', 'ACC', 'OWNER'].includes(me.role))
    return fail('اجازهٔ حذف قانون انعطاف را ندارید', 403)
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return fail('شناسهٔ قانون الزامی است', 400)
  const rule = await db.flexRule.findUnique({ where: { id } })
  if (!rule) return fail('قانون یافت نشد', 404)
  if (rule.scope === 'GLOBAL') return fail('قانون سراسری قابل حذف نیست — فقط مقدار آن قابل ویرایش است', 400)
  await db.flexRule.delete({ where: { id } })
  await logActivity(me, 'حذف قانون انعطاف', 'flexrule', id, rule.label)
  return json({ ok: true })
}
