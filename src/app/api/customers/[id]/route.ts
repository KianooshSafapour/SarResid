import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { canViewApi } from '@/lib/rbac'
import { computeRfmMap } from '@/lib/crm-engine'
import { CUSTOMER_TIERS } from '@/lib/constants'

const EVENT_ICONS: Record<string, string> = {
  VISIT: '🚶',
  PURCHASE: '🛒',
  REQUEST: '🙋',
  SUGGESTION_GIVEN: '⭐',
  SUGGESTION_ACCEPTED: '🛒',
  COMPLAINT: '💬',
  REWARD: '🎁',
  BIRTHDAY_GIFT: '🎂',
  CAMPAIGN: '📣',
  WINBACK: '🌅',
  PREF_UPDATED: '⚙️',
  NOTE: '📝',
  PROFILE_UPDATED: '🛠️',
}

const EVENT_LABELS: Record<string, string> = {
  VISIT: 'بازدید',
  PURCHASE: 'خرید',
  REQUEST: 'درخواست',
  SUGGESTION_GIVEN: 'پیشنهاد فروش',
  SUGGESTION_ACCEPTED: 'پیشنهاد پذیرفته شد',
  COMPLAINT: 'شکایت',
  REWARD: 'پاداش',
  BIRTHDAY_GIFT: 'هدیهٔ تولد',
  CAMPAIGN: 'کمپین',
  WINBACK: 'پیام بازگشت',
  PREF_UPDATED: 'تغییر پرونده',
  NOTE: 'یادداشت',
  PROFILE_UPDATED: 'ویرایش پرونده',
}

const COMPLAINT_CAT_LABEL: Record<string, string> = {
  PRODUCT: 'کالا',
  SERVICE: 'خدمات',
  PRICE: 'قیمت',
  QUEUE: 'صف و صندوق',
  GENERAL: 'عمومی',
}

/** GET /api/customers/[id] — پروفایل کامل: مشتری + رخدادها + RFM + تعامل‌ها + شکایت‌ها + پیش‌فاکتورها + تایم‌لاین یکی‌شده */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'crm'))) return fail('دسترسی به CRM ندارید', 403)

  const customer = await db.customer.findUnique({ where: { id } })
  if (!customer) return fail('یافت نشد', 404)

  const [events, engagements, complaints, preorders, rfmMap] = await Promise.all([
    db.customerEvent.findMany({ where: { customerId: id }, orderBy: { at: 'desc' }, take: 100 }),
    db.saleEngagement.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' } }),
    db.complaint.findMany({ where: { customerId: id }, orderBy: { openedAt: 'desc' } }),
    db.preOrder.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' } }),
    computeRfmMap(),
  ])
  const rfm = rfmMap.get(id) || null

  type TimelineRow = { kind: string; icon: string; at: string; title: string; detail: string; meta?: Record<string, unknown> }
  const timeline: TimelineRow[] = []
  // رد رخداد COMPLAINT تکراری: هر شکایت یک ردیف در تایم‌لاین دارد (خود رکورد Complaint).
  // رخداد CustomerEvent هم‌زوج آن (payload.complaintId) حذف می‌شود تا شکایت دوبار دیده نشود.
  const complaintIds = new Set(complaints.map((c) => c.id))
  for (const e of events) {
    const p = safeParse<{ text?: string; amount?: number; touch?: string; scheduledFor?: string; complaintId?: string; subCategory?: string }>(e.payload, {})
    if (e.type === 'COMPLAINT' && p.complaintId && complaintIds.has(p.complaintId)) continue
    timeline.push({
      kind: 'event',
      icon: EVENT_ICONS[e.type] || '📌',
      at: e.at.toISOString(),
      title: p.touch ? `${EVENT_LABELS[e.type] || e.type} — لمس ${p.touch}` : EVENT_LABELS[e.type] || e.type,
      detail: p.text || p.scheduledFor || '',
      meta: { type: e.type, userName: e.userName, amount: p.amount },
    })
  }
  for (const po of preorders) {
    const items = safeParse<{ name: string; qty: number }[]>(po.items, [])
    timeline.push({
      kind: 'preorder',
      icon: '🛒',
      at: po.createdAt.toISOString(),
      title: `پیش‌فاکتور ${po.code}`,
      detail: `${items.map((i) => `${i.name} ×${i.qty}`).join('، ')} — ${po.total.toLocaleString('fa-IR')} تومان`,
      meta: { code: po.code, status: po.status, total: po.total },
    })
  }
  for (const g of engagements) {
    timeline.push({
      kind: 'engagement',
      icon: '⭐',
      at: g.createdAt.toISOString(),
      title: 'تعامل فروش',
      detail: `${safeParse<string[]>(g.productNames, []).join('، ') || g.claimNote || '—'}`,
      meta: { outcome: g.outcome, staffName: g.staffName },
    })
  }
  for (const c of complaints) {
    timeline.push({
      kind: 'complaint',
      icon: '💬',
      at: c.openedAt.toISOString(),
      title: `شکایت ${COMPLAINT_CAT_LABEL[c.category] ? `(${COMPLAINT_CAT_LABEL[c.category]} — ` : '('}${c.status === 'RESOLVED' ? 'حل‌شده' : c.status === 'RESOLVING' ? 'در رسیدگی' : 'باز'})`,
      detail: c.body.slice(0, 120),
      meta: { status: c.status, severity: c.severity, compensation: c.compensationValue },
    })
  }
  timeline.sort((a, b) => (a.at < b.at ? 1 : -1))

  // تیئر دستی بر سگمنت محاسبه‌شده مقدم است (tierOverride) — تا وقتی تغییر نکند همان نمایش داده می‌شود
  if (rfm && customer.tier && customer.tier !== 'REGULAR') rfm.segment = customer.tier as typeof rfm.segment

  return json({
    customer: { ...customer, tags: safeParse<string[]>(customer.tags, []), childrenAges: safeParse<number[]>(customer.childrenAges, []) },
    events,
    rfm,
    engagements,
    complaints,
    preorders: preorders.map((p) => ({ ...p, items: safeParse(p.items, []) })),
    timeline: timeline.slice(0, 120),
  })
}

/** POST /api/customers/[id] — ثبت رخداد دستی (یادداشت/شکایت/هدیهٔ تولد/لغو هدیه/پیام بازگشت) */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'crm'))) return fail('دسترسی به CRM ندارید', 403)
  const customer = await db.customer.findUnique({ where: { id } })
  if (!customer) return fail('یافت نشد', 404)
  const body = await req.json()
  const type = String(body.type || 'NOTE').toUpperCase()
  const allowed = ['NOTE', 'COMPLAINT', 'BIRTHDAY_GIFT', 'WINBACK', 'VISIT', 'REQUEST', 'REWARD']
  if (!allowed.includes(type)) return fail('نوع رخداد مجاز نیست')
  const event = await db.customerEvent.create({
    data: {
      customerId: id,
      type,
      payload: JSON.stringify({ text: String(body.text || ''), undo: body.undo === true }),
      userId: me.id,
      userName: me.name,
    },
  })
  await logActivity(me, `ثبت رخداد ${EVENT_LABELS[type] || type} برای مشتری`, 'customerEvent', event.id, customer.name)
  return json({ event }, 201)
}

const CHANNELS = ['SMS', 'WHATSAPP', 'CALL', 'NONE']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const TIER_FIELD_LABEL: Record<string, string> = {
  name: 'نام',
  phone: 'تلفن',
  tier: 'تیئر',
  birthday: 'تولد',
  anniversary: 'سالگرد',
  preferredChannel: 'کانال ترجیحی',
  tags: 'تگ‌ها',
  householdSize: 'تعداد خانوار',
  childrenAges: 'سن فرزندان',
  consentMarketing: 'رضایت بازاریابی',
  notes: 'یادداشت',
  preferences: 'ترجیحات خرید',
}

const CHANNEL_LABEL: Record<string, string> = { SMS: 'پیامک', WHATSAPP: 'واتساپ', CALL: 'تماس تلفنی', NONE: '—' }

/** PATCH /api/customers/[id] — ویرایش کامل پروندهٔ مشتری توسط کاربر مسئول:
 *  اعتبارسنجی (نام، تیئر، تلفن) + رخداد PROFILE_UPDATED با خلاصهٔ فیلدهای تغییر‌یافته.
 *  tier دستی روی ستون Customer.tier نوشته می‌شود و تا تغییر بعدی بر سگمنت RFM مقدم است. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'crm'))) return fail('دسترسی به CRM ندارید', 403)
  const customer = await db.customer.findUnique({ where: { id } })
  if (!customer) return fail('یافت نشد', 404)
  const body = await req.json()

  const data: Record<string, unknown> = {}
  const changes: { field: string; label: string; from: string; to: string }[] = []
  const short = (v: unknown) => String(v ?? '').slice(0, 60) || '—'

  // نام — غیرخالی
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return fail('نام مشتری نمی‌تواند خالی باشد')
    data.name = name
  }
  // تلفن — فقط رقم و + (اختیاری)
  if (body.phone !== undefined) {
    const phone = String(body.phone).trim()
    if (phone && !/^\+?[0-9]{6,15}$/.test(phone.replace(/[\s-]/g, ''))) {
      return fail('شمارهٔ تلفن فقط می‌تواند شامل رقم و + باشد (حداقل ۶ رقم)')
    }
    data.phone = phone.replace(/[\s-]/g, '')
  }
  // تیئر — باید از مجموعهٔ مجاز باشد؛ REGULAR یعنی «خودکار (RFM)»
  if (body.tier !== undefined) {
    const tier = String(body.tier)
    if (!(tier in CUSTOMER_TIERS)) return fail('تیئر نامعتبر است')
    data.tier = tier
  }
  // تاریخ‌های جلالی
  for (const f of ['birthday', 'anniversary'] as const) {
    if (body[f] !== undefined) {
      const v = String(body[f] || '')
      if (v && !DATE_RE.test(v)) return fail(f === 'birthday' ? 'تاریخ تولد معتبر نیست' : 'تاریخ سالگرد معتبر نیست')
      data[f] = v
    }
  }
  if (body.preferredChannel !== undefined) {
    const ch = String(body.preferredChannel)
    if (!CHANNELS.includes(ch)) return fail('کانال ارتباطی نامعتبر است')
    data.preferredChannel = ch
  }
  if (body.notes !== undefined) data.notes = String(body.notes)
  if (body.preferences !== undefined) data.preferences = String(body.preferences)
  if (body.consentMarketing !== undefined) data.consentMarketing = body.consentMarketing === true
  if (body.householdSize !== undefined) data.householdSize = Math.max(0, Math.min(30, Number(body.householdSize) || 0))
  if (body.tags !== undefined) {
    const tags = Array.isArray(body.tags)
      ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
      : String(body.tags).split(/[،,]/).map((t: string) => t.trim()).filter(Boolean)
    data.tags = JSON.stringify([...new Set(tags)].slice(0, 24))
  }
  if (body.childrenAges !== undefined) {
    const ages = Array.isArray(body.childrenAges)
      ? body.childrenAges.map(Number).filter((n: number) => !isNaN(n) && n >= 0 && n < 19)
      : String(body.childrenAges).split(/[،,]+/).map((s: string) => s.trim()).filter(Boolean).map(Number).filter((n: number) => !isNaN(n) && n >= 0 && n < 19)
    data.childrenAges = JSON.stringify(ages)
  }

  const before: Record<string, unknown> = customer
  const updated = await db.customer.update({ where: { id }, data })

  // خلاصهٔ تغییرات برای تایم‌لاین — تایم‌لاین صادق می‌ماند
  const fmt = (field: string, v: unknown): string => {
    if (field === 'tier') return CUSTOMER_TIERS[String(v)]?.label || String(v)
    if (field === 'preferredChannel') return CHANNEL_LABEL[String(v)] || String(v)
    if (field === 'consentMarketing') return v === true ? 'دارد' : 'ندارد'
    if (field === 'tags') return (safeParse<string[]>(String(v), []) as string[]).join('، ') || '—'
    if (field === 'childrenAges') return (safeParse<number[]>(String(v), []) as number[]).map((a) => String(a)).join('، ') || '—'
    return String(v ?? '') || '—'
  }
  for (const [field, label] of Object.entries(TIER_FIELD_LABEL)) {
    if (data[field] === undefined) continue
    const from = short(fmt(field, before[field]))
    const to = short(fmt(field, data[field]))
    if (from !== to) changes.push({ field, label, from, to })
  }
  if (changes.length) {
    await db.customerEvent.create({
      data: {
        customerId: id,
        type: 'PROFILE_UPDATED',
        payload: JSON.stringify({
          text: `ویرایش پرونده — ${changes.map((c) => c.label).join('، ')}`,
          changes,
        }),
        userId: me.id,
        userName: me.name,
      },
    })
  }
  await logActivity(me, 'ویرایش پروندهٔ مشتری', 'customer', id, `${updated.name}${changes.length ? ` — ${changes.map((c) => c.label).join('، ')}` : ''}`)
  return json({
    customer: { ...updated, tags: safeParse<string[]>(updated.tags, []), childrenAges: safeParse<number[]>(updated.childrenAges, []) },
    changes,
  })
}
