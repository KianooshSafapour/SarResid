import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import {
  WILDCARD_REASON,
  renderReturnMsg,
  seedReturnMsgTemplatesIfEmpty,
} from './lib'

export const dynamic = 'force-dynamic'

/**
 * GET /api/return-templates — فهرست الگوهای پیام مرجوعی (هر کاربرِ واردشده؛
 * مودال «ثبت پرداخت» برای پیش‌نمایش پیام لازمش دارد).
 * ?render=1&reason=X&code=Y&amount=Z&customer=W&date=D&bank=B&ref=R
 *   → {message, usedReason} — متن رندرشدهٔ همان علت (با جایگزینی «*» در نبود/غیرفعالی)
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)

  await seedReturnMsgTemplatesIfEmpty(db)

  const sp = req.nextUrl.searchParams
  if (sp.get('render') === '1') {
    const reason = String(sp.get('reason') ?? '').trim() || 'سایر'
    const all = await db.returnMsgTemplate.findMany()
    let tpl = all.find((t) => t.enabled && t.reason === reason) ?? null
    let usedReason: string | null = tpl?.reason ?? null
    if (!tpl) {
      tpl = all.find((t) => t.enabled && t.reason === WILDCARD_REASON) ?? null
      usedReason = tpl?.reason ?? null
    }
    const message = tpl
      ? renderReturnMsg(tpl.body, {
          customer: sp.get('customer'),
          amount: Number(sp.get('amount') ?? 0) || 0,
          code: sp.get('code'),
          date: sp.get('date'),
          reason,
          bank: sp.get('bank'),
          ref: sp.get('ref'),
        })
      : ''
    return ok({ message, usedReason, title: tpl?.title ?? null })
  }

  const items = await db.returnMsgTemplate.findMany({ orderBy: { createdAt: 'asc' } })
  return ok({
    items: items.map((t) => ({
      id: t.id,
      reason: t.reason,
      title: t.title,
      body: t.body,
      enabled: t.enabled,
    })),
  })
}

/** POST /api/return-templates {reason, title, body, enabled?} — فقط مدیران */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('فقط مدیران می‌توانند الگوی پیام مرجوعی بسازند', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const reason = String(body.reason ?? '').trim()
  if (!reason) return fail('علت مرجوعی را انتخاب کنید')
  if (reason.length > 80) return fail('علت مرجوعی بیش از حد طولانی است (حداکثر ۸۰ نویسه)')

  const title = String(body.title ?? '').trim()
  if (!title) return fail('عنوان الگو را وارد کنید')
  if (title.length > 120) return fail('عنوان بیش از حد طولانی است (حداکثر ۱۲۰ نویسه)')

  const tplBody = String(body.body ?? '').trim()
  if (!tplBody) return fail('متن الگو را وارد کنید')
  if (tplBody.length > 700) return fail('متن الگو بیش از حد طولانی است (حداکثر ۷۰۰ نویسه)')

  const dup = await db.returnMsgTemplate.findUnique({ where: { reason } })
  if (dup) return fail(`برای «${reason}» قبلاً الگو ثبت شده است`, 409)

  const created = await db.returnMsgTemplate.create({
    data: { reason, title, body: tplBody, enabled: body.enabled !== false },
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'returnmsg.template.create',
    actionLabel: 'الگوی پیام مرجوعی',
    category: 'settings',
    detail: `الگوی «${title}» برای علت «${reason}» ساخته شد`,
    entityId: created.id,
  })

  return ok({ id: created.id })
}
