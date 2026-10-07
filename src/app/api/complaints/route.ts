import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { canViewApi, hasCap } from '@/lib/rbac'
import { emitNotif } from '@/lib/notif-engine'

/** شکایت‌های مشتری — service recovery paradox: حل زیر ۲۴ ساعت + جبران کوچک = وفاداری بیشتر از قبل.
 *  تشدید خودکار: بازِ بیش از ۱۲ ساعت → اعلان critical (قاعدهٔ complaint.new با dedupe اسپم نمی‌سازد). */

const CATEGORIES = ['PRODUCT', 'SERVICE', 'PRICE', 'QUEUE', 'GENERAL']
const SEVERITIES = ['LOW', 'NORMAL', 'HIGH']
const SLA_H = 24
const ESCALATE_H = 12

const CAT_LABEL: Record<string, string> = {
  PRODUCT: 'کالا',
  SERVICE: 'خدمات',
  PRICE: 'قیمت',
  QUEUE: 'صف و صندوق',
  GENERAL: 'عمومی',
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'crm'))) return fail('دسترسی به CRM ندارید', 403)
  const complaints = await db.complaint.findMany({ orderBy: [{ status: 'asc' }, { openedAt: 'desc' }] })
  const now = Date.now()
  const openOld = complaints.filter((c) => c.status === 'OPEN' && now - c.openedAt.getTime() > ESCALATE_H * 3600_000)
  // تشدید خودکار — قاعدهٔ complaint.new با dedupeId هر شکایت را اسپم‌نکرده تکرار می‌کند
  for (const c of openOld) {
    await emitNotif({
      event: 'complaint.new',
      title: 'شکایت بازِ بیش از ۱۲ ساعت',
      detail: `${c.customerName || 'مشتری'} — ${CAT_LABEL[c.category] || c.category}: ${c.body.slice(0, 80)}`,
      go: '#/crm?tab=complaints',
      severity: 'critical',
      icon: '📣',
      dedupeId: `${c.id}:escalate`,
    })
  }
  return json({
    complaints,
    openOlderThan12h: openOld.length,
    openCount: complaints.filter((c) => c.status !== 'RESOLVED').length,
    slaHours: SLA_H,
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'crm'))) return fail('دسترسی به CRM ندارید', 403)
  const body = await req.json()
  if (!body.customerId && !body.customerName?.trim()) return fail('مشتری را انتخاب یا نامش را بنویسید')
  if (!body.body?.trim()) return fail('متن شکایت الزامی است')
  const category = body.category || 'GENERAL'
  const severity = body.severity || 'NORMAL'
  if (!CATEGORIES.includes(category)) return fail('دستهٔ شکایت نامعتبر است')
  if (!SEVERITIES.includes(severity)) return fail('شدت شکایت نامعتبر است')

  let customerName = String(body.customerName || '').trim()
  if (body.customerId) {
    const c = await db.customer.findUnique({ where: { id: body.customerId } })
    if (!c) return fail('مشتری یافت نشد', 404)
    customerName = customerName || c.name
  }

  // گارد تکرار (idempotency): همان مشتری + همان دسته + همان متن در ۳۰ ثانیهٔ اخیر
  // → رکورد موجود برگردانده می‌شود و دوباره ساخته نمی‌شود (باگ ثبت دوبارهٔ شکایت)
  const content = String(body.body).trim()
  const recent = await db.complaint.findFirst({
    where: {
      customerId: body.customerId || '',
      category,
      body: content,
      openedAt: { gte: new Date(Date.now() - 30_000) },
    },
  })
  if (recent) return json({ complaint: recent, duplicate: true })

  // دقیقاً یک رکورد Complaint + یک CustomerEvent (با subCategory) به‌ازای هر فراخوانی
  const complaint = await db.complaint.create({
    data: {
      customerId: body.customerId || '',
      customerName,
      category,
      severity,
      body: content,
      status: 'OPEN',
    },
  })
  await db.customerEvent.create({
    data: {
      customerId: body.customerId || '',
      type: 'COMPLAINT',
      payload: JSON.stringify({
        category: 'شکایت',
        subCategory: CAT_LABEL[category] || category,
        text: `[${CAT_LABEL[category]}] ${content.slice(0, 200)}`,
        complaintId: complaint.id,
        severity,
      }),
      userId: me.id,
      userName: me.name,
    },
  })
  await emitNotif({
    event: 'complaint.new',
    title: 'شکایت مشتری جدید',
    detail: `${customerName || 'مشتری'} — ${CAT_LABEL[category]}: ${String(body.body).slice(0, 100)}`,
    go: '#/crm?tab=complaints',
    severity: 'critical',
    icon: '📣',
    dedupeId: complaint.id,
  })
  await logActivity(me, 'ثبت شکایت مشتری', 'complaint', complaint.id, `${customerName || '—'} — ${CAT_LABEL[category]}`)
  return json({ complaint }, 201)
}

export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  const complaint = await db.complaint.findUnique({ where: { id: body.id } })
  if (!complaint) return fail('یافت نشد', 404)
  const status = body.status
  if (!['RESOLVING', 'RESOLVED'].includes(status)) return fail('وضعیت نامعتبر است')
  // رسیدگی/حل: crm.manage یا نقش اجرایی یا HC/OM
  const allowed =
    (await hasCap(me, 'crm.manage')) || ['OWNER', 'GM', 'OM', 'ADMIN', 'HC'].includes(me.role)
  if (!allowed) return fail('برای رسیدگی به شکایت دسترسی مدیریت لازم است', 403)

  const data: { status: string; resolutionNote?: string; compensationValue?: number; resolvedAt?: Date } = { status }
  if (body.resolutionNote !== undefined) data.resolutionNote = String(body.resolutionNote)
  if (body.compensationValue !== undefined) data.compensationValue = Math.max(0, Number(body.compensationValue) || 0)
  if (status === 'RESOLVED') {
    data.resolvedAt = new Date()
    if (!data.resolutionNote && !complaint.resolutionNote) return fail('یادداشت حل برای بستن شکایت الزامی است')
  }
  const updated = await db.complaint.update({ where: { id: complaint.id }, data })
  if (status === 'RESOLVED' && complaint.customerId) {
    await db.customerEvent.create({
      data: {
        customerId: complaint.customerId,
        type: 'COMPLAINT',
        payload: JSON.stringify({
          text: `شکایت حل شد — ${data.resolutionNote || complaint.resolutionNote}${updated.compensationValue ? ` · جبران: ${updated.compensationValue.toLocaleString('fa-IR')} تومان` : ''}`,
          complaintId: complaint.id,
          status: 'RESOLVED',
          compensation: updated.compensationValue,
        }),
        userId: me.id,
        userName: me.name,
      },
    })
  }
  await logActivity(me, status === 'RESOLVED' ? 'حل شکایت مشتری' : 'شروع رسیدگی به شکایت', 'complaint', complaint.id, `${complaint.customerName || '—'}${updated.compensationValue ? ` · جبران ${updated.compensationValue}` : ''}`)
  return json({ complaint: updated })
}
