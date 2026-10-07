import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { canViewApi } from '@/lib/rbac'
import { computeRfmMap, upcomingBirthdays, type Rfm } from '@/lib/crm-engine'
import { todayIso } from '@/lib/jalali'

/** GET /api/customers — فهرست مشتریان (قرارداد قبلی حفظ شده) + پارامترهای CRM:
 *  ?tier=     فیلتر تیئر (سگمنت RFM محاسبه‌شده یا تیئر دستی)
 *  ?q=        جست‌وجو در نام/تلفن/یادداشت/تگ‌ها
 *  ?stats=1   RFM هر مشتری (Hughes 1994) + CLV — محاسبهٔ سرور به‌ازای هر درخواست (دیتاست کوچک)
 *  ?birthdays=1&days=N  تولدهای N روز جلالیِ آینده (پیش‌فرض ۱۴)
 */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'crm'))) return fail('دسترسی به CRM ندارید', 403)
  const { searchParams } = new URL(req.url)
  const wantStats = searchParams.get('stats') === '1' || !!searchParams.get('tier')
  const wantBirthdays = !!searchParams.get('birthdays')
  const tierFilter = searchParams.get('tier') || ''
  const q = (searchParams.get('q') || '').trim().toLowerCase()

  let customers = await db.customer.findMany({ orderBy: { favorite: 'desc' } })

  let rfmMap: Map<string, Rfm> | null = null
  let stats: Record<string, unknown> | undefined
  let birthdays: unknown[] | undefined

  if (wantStats || wantBirthdays) rfmMap = await computeRfmMap()

  if (rfmMap) {
    // tierOverride: تیئر دستی ثبت‌شده روی ستون Customer.tier (به‌جز REGULAR پیش‌فرض)
    // تا تغییر بعدی بر سگمنت محاسبه‌شدهٔ RFM مقدم است؛ سگمنت RFM همچنان پایهٔ تحلیل است.
    const tierCol = new Map(customers.map((c) => [c.id, c.tier]))
    stats = {}
    for (const [id, r] of rfmMap) {
      const manual = tierCol.get(id)
      stats[id] = { ...r, segment: manual && manual !== 'REGULAR' ? manual : r.segment }
    }
  }

  if (tierFilter) {
    customers = customers.filter((c) => {
      const seg = rfmMap?.get(c.id)?.segment
      return seg === tierFilter || c.tier === tierFilter
    })
  }
  if (q) {
    customers = customers.filter((c) => {
      const tags = safeParse<string[]>(c.tags, []).join(' ')
      return `${c.name} ${c.phone} ${c.notes} ${c.preferences} ${tags}`.toLowerCase().includes(q)
    })
  }

  if (wantBirthdays) {
    const days = Math.min(60, Math.max(1, Number(searchParams.get('days')) || 14))
    const hits = await upcomingBirthdays(days)
    const allowed = new Set(customers.map((c) => c.id))
    birthdays = hits.filter((h) => allowed.has(h.id))
  }

  return json({ customers, ...(stats ? { stats } : {}), ...(birthdays ? { birthdays, todayIso: todayIso() } : {}) })
}

const CHANNELS = ['SMS', 'WHATSAPP', 'CALL', 'NONE']

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'crm'))) return fail('دسترسی به CRM ندارید', 403)
  const body = await req.json()
  if (!body.name?.trim()) return fail('نام مشتری الزامی است')
  if (body.phone && !/^0?\d{6,14}$/.test(String(body.phone).replace(/[\s-]/g, ''))) return fail('شمارهٔ تلفن معتبر نیست')
  if (body.preferredChannel && !CHANNELS.includes(body.preferredChannel)) return fail('کانال ارتباطی نامعتبر است')
  const tags = Array.isArray(body.tags) ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean) : String(body.tags || '').split(/[،,]/).map((t) => t.trim()).filter(Boolean)
  const childrenAges = Array.isArray(body.childrenAges)
    ? body.childrenAges.map((n: unknown) => Number(n)).filter((n: number) => !isNaN(n) && n >= 0 && n < 19)
    : String(body.childrenAges || '').split(/[،,]+/).map((s: string) => s.trim()).filter(Boolean).map(Number).filter((n: number) => !isNaN(n) && n >= 0 && n < 19)
  const customer = await db.customer.create({
    data: {
      name: body.name.trim(),
      phone: body.phone || '',
      notes: body.notes || '',
      preferences: body.preferences || '',
      favorite: body.favorite === true,
      tier: body.tier || 'REGULAR',
      birthday: body.birthday || '',
      anniversary: body.anniversary || '',
      householdSize: Math.max(0, Number(body.householdSize) || 0),
      childrenAges: JSON.stringify(childrenAges),
      preferredChannel: body.preferredChannel || 'NONE',
      consentMarketing: body.consentMarketing === true,
      tags: JSON.stringify(tags),
      joinedAt: body.joinedAt || todayIso(),
      points: Math.max(0, Number(body.points) || 0),
      lastVisitAt: body.lastVisitAt || '',
      createdById: me.id,
    },
  })
  await db.customerEvent.create({
    data: {
      customerId: customer.id,
      type: 'NOTE',
      payload: JSON.stringify({ text: 'ایجاد پروندهٔ مشتری', channel: customer.preferredChannel }),
      userId: me.id,
      userName: me.name,
    },
  })
  await logActivity(me, 'ثبت مشتری جدید', 'customer', customer.id, customer.name)
  return json({ customer }, 201)
}

export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'crm'))) return fail('دسترسی به CRM ندارید', 403)
  const { id, ...rest } = await req.json()
  const customer = await db.customer.findUnique({ where: { id } })
  if (!customer) return fail('یافت نشد', 404)
  const data: Record<string, unknown> = {}
  for (const f of ['name', 'phone', 'notes', 'preferences', 'birthday', 'anniversary', 'preferredChannel', 'joinedAt', 'lastVisitAt']) {
    if (rest[f] !== undefined) data[f] = rest[f]
  }
  if (rest.favorite !== undefined) data.favorite = rest.favorite
  if (rest.consentMarketing !== undefined) data.consentMarketing = rest.consentMarketing === true
  if (rest.householdSize !== undefined) data.householdSize = Math.max(0, Number(rest.householdSize) || 0)
  if (rest.points !== undefined) data.points = Math.max(0, Number(rest.points) || 0)
  if (rest.tags !== undefined) {
    const tags = Array.isArray(rest.tags) ? rest.tags.map((t: unknown) => String(t).trim()).filter(Boolean) : String(rest.tags).split(/[،,]/).map((t: string) => t.trim()).filter(Boolean)
    data.tags = JSON.stringify(tags)
  }
  if (rest.childrenAges !== undefined) {
    const ages = Array.isArray(rest.childrenAges)
      ? rest.childrenAges.map(Number).filter((n: number) => !isNaN(n) && n >= 0 && n < 19)
      : String(rest.childrenAges).split(/[،,]+/).map((s: string) => s.trim()).filter(Boolean).map(Number).filter((n: number) => !isNaN(n) && n >= 0 && n < 19)
    data.childrenAges = JSON.stringify(ages)
  }
  const tierChanged = rest.tier !== undefined && rest.tier !== customer.tier
  if (rest.tier !== undefined) data.tier = rest.tier
  const updated = await db.customer.update({ where: { id }, data })
  if (tierChanged) {
    await db.customerEvent.create({
      data: {
        customerId: id,
        type: 'PREF_UPDATED',
        payload: JSON.stringify({ field: 'tier', from: customer.tier, to: rest.tier }),
        userId: me.id,
        userName: me.name,
      },
    })
  }
  await logActivity(me, 'ویرایش مشتری', 'customer', id, updated.name)
  return json({ customer: updated })
}
