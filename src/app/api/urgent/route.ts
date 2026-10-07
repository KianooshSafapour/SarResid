/** GET /api/urgent — پرسش‌های فوری: mine (همیشه) + صف پاسخ برای مدیران (scope=open|all)
 *  POST — ثبت پرسش فوری → emitNotif urgent.new (critical، غیرقطع‌کننده)
 *  PATCH — پاسخ مدیر → emitNotif urgent.answered به پرسشگر
 *  DELETE — حذف پرسش بی‌پاسخِ خود، یا هر پرسشی توسط نقش‌های اجرایی */
import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { hasCap } from '@/lib/rbac'
import { emitNotif } from '@/lib/notif-engine'
import { isExecRole } from '@/lib/constants'

/** گارد پاسخ: cap 'urgent.answer' یا نقش‌های اجرایی یا OM/GM/HC */
async function canAnswerNow(me: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>) {
  if (isExecRole(me.role) || ['OM', 'GM', 'HC'].includes(me.role)) return true
  return hasCap(me, 'urgent.answer')
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const scope = searchParams.get('scope') === 'all' ? 'all' : 'open'

  const answerer = await canAnswerNow(me)
  const mine = await db.urgentQuestion.findMany({ where: { askedById: me.id }, orderBy: { createdAt: 'desc' }, take: 50 })

  // خواندن صف پاسخ فقط برای مدیران — بقیه فقط پرسش‌های خودشان را می‌بینند
  let open: Awaited<ReturnType<typeof db.urgentQuestion.findMany>> = []
  let recent: Awaited<ReturnType<typeof db.urgentQuestion.findMany>> = []
  if (answerer) {
    open = await db.urgentQuestion.findMany({ where: { answered: false }, orderBy: { createdAt: 'asc' }, take: 60 })
    if (scope === 'all') {
      const weekAgo = new Date(Date.now() - 7 * 86400000)
      recent = await db.urgentQuestion.findMany({ where: { answered: true, answeredAt: { gte: weekAgo } }, orderBy: { answeredAt: 'desc' }, take: 20 })
    }
  }

  return json({ canAnswer: answerer, mine, open, recent })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json().catch(() => ({}))

  const question = String(body?.question || '').trim().slice(0, 500)
  const context = String(body?.context || '').trim().slice(0, 200)
  if (question.length < 3) return fail('متن پرسش را بنویسید (حداقل ۳ نویسه)')

  const q = await db.urgentQuestion.create({
    data: { question, context, askedById: me.id, askedByName: me.name },
  })

  // مقصدها از قاعدهٔ urgent.new خوانده می‌شود (پیش‌فرض: OM + GM) — بدون قطع‌کردن کار مدیر
  const sent = await emitNotif({
    event: 'urgent.new',
    title: '⚡ پرسش فوری جدید',
    detail: `${me.name}: ${question.slice(0, 80)}`,
    go: '#/urgent',
    severity: 'critical',
    icon: '⚡',
    actor: { id: me.id, name: me.name },
    payload: { questionId: q.id },
  })

  await logActivity(me, 'ثبت پرسش فوری', 'urgent', q.id, context || question.slice(0, 60))

  return json({ question: q, sent: sent.sent }, 201)
}

export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canAnswerNow(me))) return fail('فقط مدیران مجاز به پاسخ‌اند', 403)

  const body = await req.json().catch(() => null)
  const id = String(body?.id || '')
  const answer = String(body?.answer || '').trim().slice(0, 1000)
  if (!id || answer.length < 2) return fail('متن پاسخ الزامی است')

  const q = await db.urgentQuestion.findUnique({ where: { id } })
  if (!q) return fail('پرسش یافت نشد', 404)
  if (q.answered) return fail('این پرسش قبلاً پاسخ داده شده است')

  const updated = await db.urgentQuestion.update({
    where: { id },
    data: { answered: true, answer, answeredById: me.id, answeredByName: me.name, answeredAt: new Date() },
  })

  // پاسخ به خودِ پرسشگر برمی‌گردد (fieldRef: asker — از قاعدهٔ urgent.answered)
  await emitNotif({
    event: 'urgent.answered',
    title: 'پاسخ پرسش فوری',
    detail: `${me.name}: ${answer.slice(0, 80)}`,
    go: '#/urgent',
    icon: '💬',
    fieldRefs: { asker: [q.askedById] },
    payload: { questionId: q.id },
  })

  await logActivity(me, 'پاسخ به پرسش فوری', 'urgent', id, q.question.slice(0, 60))

  return json({ question: updated })
}

export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return fail('شناسهٔ پرسش الزامی است')

  const q = await db.urgentQuestion.findUnique({ where: { id } })
  if (!q) return fail('پرسش یافت نشد', 404)

  const ownUnanswered = q.askedById === me.id && !q.answered
  if (!ownUnanswered && !isExecRole(me.role)) return fail('فقط پرسشِ بی‌پاسخ خودتان قابل حذف است', 403)

  await db.urgentQuestion.delete({ where: { id } })
  await logActivity(me, 'حذف پرسش فوری', 'urgent', id, q.question.slice(0, 60))

  return json({ ok: true })
}
