import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { canViewApi, hasCap } from '@/lib/rbac'
import { computeRfmMap, matchTargets, upcomingBirthdays, type TargetFilter } from '@/lib/crm-engine'
import { addDaysIso, todayIso } from '@/lib/jalali'

/** کمپین‌های CRM — تولد (سه لمس: T−۷، روز، T+۷ — Experian: نرخ تراکنش ۴۸۱٪ بالاتر)،
 *  بازگشت (یک پیام قوی — Bain: +۵٪ نگهداشت تا +۹۵٪ سود)، رویداد VIP، پیشنهاد ویژه.
 *  اجرا: مخاطبان تطبیق‌یافته → CustomerEvent («رسیده» فقط با رضایت بازاریابی مشتری). */

const KINDS = ['BIRTHDAY', 'WINBACK', 'VIP_EVENT', 'OFFER', 'OTHER']
const MARGIN_NOTE = 'CLV = میانگین سبد × بازدید سالانه × حاشیه ۲۵٪ × افق ۳ سال'

async function canManage(me: { role: string; secondaryRoles: string[]; roleIds?: string }): Promise<boolean> {
  return (await hasCap(me, 'crm.manage')) || ['OWNER', 'GM', 'OM', 'ADMIN'].includes(me.role)
}

function sanitizeFilter(raw: unknown): TargetFilter {
  const f = (raw || {}) as TargetFilter
  const out: TargetFilter = {}
  if (Array.isArray(f.tiers) && f.tiers.length) out.tiers = f.tiers.map(String).filter((t) => ['VIP', 'LOYAL', 'NEW', 'AT_RISK', 'DORMANT', 'REGULAR'].includes(t))
  if (f.minVisits != null && Number(f.minVisits) > 0) out.minVisits = Math.floor(Number(f.minVisits))
  if (f.inactiveDays != null && Number(f.inactiveDays) > 0) out.inactiveDays = Math.floor(Number(f.inactiveDays))
  if (f.birthdaysNextDays != null && Number(f.birthdaysNextDays) > 0) out.birthdaysNextDays = Math.min(60, Math.floor(Number(f.birthdaysNextDays)))
  return out
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'crm'))) return fail('دسترسی به CRM ندارید', 403)
  const [campaigns, rfm, customers, birthdays] = await Promise.all([
    db.campaign.findMany({ orderBy: { createdAt: 'desc' } }),
    computeRfmMap(),
    db.customer.findMany({ select: { id: true, name: true, consentMarketing: true, tier: true } }),
    upcomingBirthdays(45),
  ])
  const enriched = campaigns.map((c) => {
    const { ids, consentCount } = matchTargets(safeParse<TargetFilter>(c.targetFilter, {}), customers, rfm, birthdays)
    return {
      ...c,
      targetFilter: safeParse<TargetFilter>(c.targetFilter, {}),
      resultStats: safeParse<{ targets?: number; reached?: number; consentCount?: number }>(c.resultStats, {}),
      targetCount: ids.length,
      consentCount,
    }
  })
  return json({ campaigns: enriched, marginNote: MARGIN_NOTE })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canManage(me))) return fail('برای ساخت کمپین دسترسی مدیریت CRM لازم است', 403)
  const body = await req.json()
  if (!body.name?.trim()) return fail('نام کمپین الزامی است')
  const kind = body.kind || 'OFFER'
  if (!KINDS.includes(kind)) return fail('نوع کمپین نامعتبر است')
  const filter = sanitizeFilter(body.targetFilter)
  if (Object.keys(filter).length === 0) return fail('حداقل یک شرط مخاطب تعیین کنید')
  const campaign = await db.campaign.create({
    data: {
      name: body.name.trim(),
      kind,
      targetFilter: JSON.stringify(filter),
      message: body.message || '',
      status: body.scheduledFor ? 'SCHEDULED' : 'DRAFT',
      scheduledFor: body.scheduledFor || '',
      createdById: me.id,
      createdByName: me.name,
    },
  })
  await logActivity(me, 'ایجاد کمپین CRM', 'campaign', campaign.id, `${campaign.name} (${kind})`)
  return json({ campaign: { ...campaign, targetFilter: filter, resultStats: {} } }, 201)
}

export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canManage(me))) return fail('برای اجرای کمپین دسترسی مدیریت CRM لازم است', 403)
  const body = await req.json()
  const campaign = await db.campaign.findUnique({ where: { id: body.id } })
  if (!campaign) return fail('یافت نشد', 404)

  if (body.action === 'run') {
    if (campaign.status === 'DONE') return fail('این کمپین قبلاً اجرا شده است')
    const filter = safeParse<TargetFilter>(campaign.targetFilter, {})
    const [rfm, customers, birthdays] = await Promise.all([computeRfmMap(), db.customer.findMany({ select: { id: true, name: true, consentMarketing: true, tier: true } }), upcomingBirthdays(60)])
    const { ids, consentCount } = matchTargets(filter, customers, rfm, birthdays)
    const today = todayIso()
    let eventsCreated = 0

    if (campaign.kind === 'BIRTHDAY') {
      // سه لمس تولد برای هر مخاطب — به‌عنوان یادداشت زمان‌بندی‌شده در رخدادهای مشتری
      for (const id of ids) {
        const du = birthdays.find((x) => x.id === id)?.daysUntil ?? 0
        const touches = [
          { touch: 'T−۷', at: addDaysIso(du - 7, today) },
          { touch: 'روز تولد', at: addDaysIso(du, today) },
          { touch: 'T+۷', at: addDaysIso(du + 7, today) },
        ]
        for (const t of touches) {
          await db.customerEvent.create({
            data: {
              customerId: id,
              type: 'CAMPAIGN',
              payload: JSON.stringify({ campaignId: campaign.id, campaignName: campaign.name, kind: campaign.kind, touch: t.touch, scheduledFor: t.at, message: campaign.message }),
              userId: me.id,
              userName: me.name,
            },
          })
          eventsCreated++
        }
      }
    } else {
      const evType = campaign.kind === 'WINBACK' ? 'WINBACK' : 'CAMPAIGN'
      for (const id of ids) {
        const r = rfm.get(id)
        await db.customerEvent.create({
          data: {
            customerId: id,
            type: evType,
            payload: JSON.stringify({ campaignId: campaign.id, campaignName: campaign.name, kind: campaign.kind, message: campaign.message, segment: r?.segment, text: campaign.message }),
            userId: me.id,
            userName: me.name,
          },
        })
        eventsCreated++
      }
    }
    const resultStats = { targets: ids.length, reached: consentCount, consentCount }
    const updated = await db.campaign.update({
      where: { id: campaign.id },
      data: { status: 'DONE', resultStats: JSON.stringify(resultStats) },
    })
    await logActivity(me, 'اجرای کمپین CRM', 'campaign', campaign.id, `${campaign.name} — ${ids.length} مخاطب، ${consentCount} با رضایت پیام`)
    return json({ campaign: { ...updated, targetFilter: filter, resultStats }, eventsCreated })
  }

  if (body.action === 'update') {
    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = String(body.name).trim()
    if (body.message !== undefined) data.message = String(body.message)
    if (body.targetFilter !== undefined) data.targetFilter = JSON.stringify(sanitizeFilter(body.targetFilter))
    if (body.scheduledFor !== undefined) {
      data.scheduledFor = body.scheduledFor
      if (campaign.status === 'DRAFT' && body.scheduledFor) data.status = 'SCHEDULED'
    }
    const updated = await db.campaign.update({ where: { id: campaign.id }, data })
    await logActivity(me, 'ویرایش کمپین', 'campaign', campaign.id, campaign.name)
    return json({ campaign: { ...updated, targetFilter: safeParse(updated.targetFilter, {}) } })
  }

  return fail('عملیات نامعتبر است')
}

export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canManage(me))) return fail('دسترسی مدیریت CRM لازم است', 403)
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return fail('شناسه کمپین لازم است')
  const campaign = await db.campaign.findUnique({ where: { id } })
  if (!campaign) return fail('یافت نشد', 404)
  if (campaign.status === 'DONE') return fail('کمپین اجراشده حذف نمی‌شود — سابقهٔ بازاریابی می‌ماند')
  await db.campaign.delete({ where: { id } })
  await logActivity(me, 'حذف کمپین', 'campaign', id, campaign.name)
  return json({ ok: true })
}
