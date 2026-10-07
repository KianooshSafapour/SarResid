import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { canViewApi, guardCap } from '@/lib/rbac'
import { todayIso } from '@/lib/jalali'
import {
  DEFAULT_SCHED_PARAMS, usageForLimit, resolvePeriodKey,
  type ChequeLite, type PaymentLite, type SchedParams,
} from '@/lib/pay-scheduler'

const SCHED_PARAMS_KEY = 'pay_sched_params'

/** پارامترهای مشاور پرداخت از Setting — در نبودش پیش‌فرض‌های تومان‌محور */
async function loadSchedParams(): Promise<SchedParams> {
  const row = await db.setting.findUnique({ where: { key: SCHED_PARAMS_KEY } })
  const p = row ? safeParse<Partial<SchedParams>>(row.value, {}) : {}
  return {
    maxDueDays: Math.max(7, Math.min(180, Math.round(Number(p.maxDueDays) || DEFAULT_SCHED_PARAMS.maxDueDays))),
    sizeBands: p.sizeBands?.length ? p.sizeBands : DEFAULT_SCHED_PARAMS.sizeBands,
    maxPerDay: Math.max(1, Math.round(Number(p.maxPerDay) || DEFAULT_SCHED_PARAMS.maxPerDay)),
  }
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'cheques'))) return fail('دسترسی به بخش چک‌ها را ندارید', 403)

  const [limits, cheques, payments, params] = await Promise.all([
    db.payLimit.findMany({ orderBy: [{ period: 'asc' }, { dateKey: 'asc' }] }),
    db.cheque.findMany({ select: { dueDate: true, amount: true, status: true } }),
    db.payment.findMany({ select: { paidAt: true, amount: true, kind: true } }),
    loadSchedParams(),
  ])
  const today = todayIso()
  const chequesLite: ChequeLite[] = cheques
  const paymentsLite: PaymentLite[] = payments
  return json({
    limits: limits.map((l) => {
      const u = usageForLimit(l, chequesLite, paymentsLite, today)
      return {
        ...l,
        used: u.used,
        usedCheques: u.usedCheques,
        range: u.range,
        overRatio: l.maxAmount > 0 ? Math.round((u.used / l.maxAmount) * 100) : 0,
      }
    }),
    params,
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const capErr = await guardCap(me, 'cheques.limits')
  if (capErr) return fail(capErr, 403)
  const body = await req.json().catch(() => ({}))

  // ── ذخیرهٔ پارامترهای مشاور پرداخت (بندهای اندازه / حداکثر مهلت / چک در روز) ──
  if (body.schedParams) {
    const p = body.schedParams as Partial<SchedParams>
    const value = JSON.stringify({
      maxDueDays: Math.max(7, Math.min(180, Math.round(Number(p.maxDueDays) || DEFAULT_SCHED_PARAMS.maxDueDays))),
      sizeBands:
        Array.isArray(p.sizeBands) && p.sizeBands.length
          ? p.sizeBands.map((b: { max?: number; n: number }) => ({ max: b.max == null ? undefined : Math.max(0, Number(b.max) || 0), n: Math.max(1, Math.round(Number(b.n) || 1)) }))
          : DEFAULT_SCHED_PARAMS.sizeBands,
      maxPerDay: Math.max(1, Math.round(Number(p.maxPerDay) || DEFAULT_SCHED_PARAMS.maxPerDay)),
    })
    await db.setting.upsert({
      where: { key: SCHED_PARAMS_KEY },
      update: { value },
      create: { key: SCHED_PARAMS_KEY, value },
    })
    await logActivity(me, 'ثبت پارامترهای مشاور پرداخت', 'paylimit', SCHED_PARAMS_KEY, value.slice(0, 120))
    return json({ ok: true, params: JSON.parse(value) })
  }

  // ── ثبت سقف هزینه‌کرد ──
  const period = String(body.period || '')
  if (!['DAY', 'WEEK', 'MONTH', 'SEASON', 'YEAR'].includes(period)) return fail('دورهٔ سقف نامعتبر است')
  const method = String(body.method || 'ALL')
  if (!['ALL', 'CHEQUE', 'CASH', 'POS', 'TRANSFER', 'OTHER'].includes(method)) return fail('روش پرداخت نامعتبر است')
  const maxAmount = Number(body.maxAmount)
  if (!maxAmount || maxAmount <= 0) return fail('سقف مبلغ باید بزرگ‌تر از صفر باشد')
  const dateKey = String(body.dateKey || '').trim() || resolvePeriodKey(period, todayIso())

  const limit = await db.payLimit.create({
    data: {
      period,
      dateKey,
      method,
      maxAmount,
      maxCheques: Math.max(0, Math.round(Number(body.maxCheques) || 0)),
      note: String(body.note || '').slice(0, 200),
      createdById: me.id,
      createdByName: me.name,
    },
  })
  await logActivity(me, 'ثبت سقف پرداخت', 'paylimit', limit.id, `${period} ${dateKey} ${method}`)
  return json({ limit }, 201)
}

export async function PATCH(req: Request) {
  // ویرایش سقف ثبت‌شده — مبلغ، تعداد، روش، دوره و توضیح (همان گارد ثبت)
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const capErr = await guardCap(me, 'cheques.limits')
  if (capErr) return fail(capErr, 403)
  const body = await req.json().catch(() => ({}))
  const id = String(body.id || '')
  if (!id) return fail('شناسهٔ سقف الزامی است')
  const limit = await db.payLimit.findUnique({ where: { id } })
  if (!limit) return fail('سقف یافت نشد', 404)

  const data: Record<string, unknown> = {}
  const changes: string[] = []
  const track = (key: string, label: string, next: unknown) => {
    const prev = (limit as unknown as Record<string, unknown>)[key]
    if (String(next ?? '') !== String(prev ?? '')) {
      data[key] = next
      changes.push(`${label}: «${String(prev ?? '') || '—'}» ← «${String(next ?? '') || '—'}»`)
    }
  }

  if (body.maxAmount !== undefined) {
    const amt = Number(body.maxAmount)
    if (!isFinite(amt) || amt <= 0) return fail('سقف مبلغ باید بزرگ‌تر از صفر باشد')
    track('maxAmount', 'سقف مبلغ', amt)
  }
  if (body.maxCheques !== undefined) track('maxCheques', 'حداکثر تعداد چک', Math.max(0, Math.round(Number(body.maxCheques) || 0)))
  if (body.method !== undefined) {
    const m = String(body.method)
    if (!['ALL', 'CHEQUE', 'CASH', 'POS', 'TRANSFER', 'OTHER'].includes(m)) return fail('روش پرداخت نامعتبر است')
    track('method', 'روش', m)
  }
  if (body.period !== undefined) {
    const p = String(body.period)
    if (!['DAY', 'WEEK', 'MONTH', 'SEASON', 'YEAR'].includes(p)) return fail('دورهٔ سقف نامعتبر است')
    track('period', 'دوره', p)
  }
  if (body.dateKey !== undefined) track('dateKey', 'کلید دوره', String(body.dateKey).trim())
  if (body.note !== undefined) track('note', 'توضیح', String(body.note).slice(0, 200))

  if (!Object.keys(data).length) return json({ limit, unchanged: true })
  const updated = await db.payLimit.update({ where: { id }, data })
  await logActivity(me, 'ویرایش سقف پرداخت', 'paylimit', id, changes.join(' • ').slice(0, 200))
  return json({ limit: updated, changes })
}

export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const capErr = await guardCap(me, 'cheques.limits')
  if (capErr) return fail(capErr, 403)
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return fail('شناسهٔ سقف الزامی است')
  const limit = await db.payLimit.findUnique({ where: { id } })
  if (!limit) return fail('سقف یافت نشد', 404)
  await db.payLimit.delete({ where: { id } })
  await logActivity(me, 'حذف سقف پرداخت', 'paylimit', id, `${limit.period} ${limit.dateKey}`)
  return json({ ok: true })
}
