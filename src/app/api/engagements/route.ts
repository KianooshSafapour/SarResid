import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { canViewApi, hasCap } from '@/lib/rbac'
import { emitNotif } from '@/lib/notif-engine'
import { todayIso, addDaysIso } from '@/lib/jalali'

/** لایهٔ صداقت پیشنهادهای فروش — نمونه‌گیری تصادفیِ روزانه (قابل پیش‌بینی نیست)،
 *  z-score نسبت به همتایان (پرچم → وظیفهٔ مدیر، هرگز تنبیه خودکار)،
 *  بدون پاداش نقدی تک‌پیشنهاد (Deci 1999)، تأییدکننده ≠ ثبت‌کننده (COSO جداسازی وظایف). */

const MGR_ROLES = ['OM', 'GM', 'HC', 'OWNER', 'ADMIN']
const KINDS = ['SUGGESTION', 'HELP', 'CHECKOUT_ASSIST']
const CLAIM_WINDOW_H = 2 // پنجرهٔ ثبت ادعای تبدیل (ساعت)
const Z_THRESHOLD = 2.5

/** هش FNV-1a قطعی — seed روزانه + شناسهٔ کاربر؛ کارمند نمی‌تواند نتیجه را پیش‌بینی کند */
function seedHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function isSampledToday(staffId: string): boolean {
  return seedHash(`${todayIso()}:${staffId}`) % 100 < 20
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'crm'))) return fail('دسترسی به CRM ندارید', 403)
  const isManager = MGR_ROLES.includes(me.role) || (await hasCap(me, 'sales.claims.verify'))

  const claims = await db.saleEngagement.findMany({ orderBy: { createdAt: 'desc' } })
  const visible = isManager ? claims : claims.filter((c) => c.staffId === me.id)

  // صف راستی‌آزمایی: در انتظار + نمونه‌خورده‌ها اول
  const pending = claims.filter((c) => c.outcome === 'PENDING')
  const queue = isManager
    ? [...pending].sort((a, b) => Number(b.verifySampled) - Number(a.verifySampled) || (a.createdAt < b.createdAt ? 1 : -1))
    : []

  // پرچم‌های آماری: نرخ ادعای ۳۰ روزِ هر نفر در برابر همتایان (فقط کسانی با ≥۵ ادعا در استخر)
  const flags: { staffId: string; staffName: string; z: number; rate: number; note: string }[] = []
  if (isManager) {
    const since30 = new Date(addDaysIso(-30) + 'T00:00:00')
    const perStaff = new Map<string, { name: string; total: number; monthly: number }>()
    for (const c of claims) {
      const rec = perStaff.get(c.staffId) || { name: c.staffName, total: 0, monthly: 0 }
      rec.total++
      if (c.createdAt >= since30) rec.monthly++
      perStaff.set(c.staffId, rec)
    }
    const pool = [...perStaff.entries()].filter(([, r]) => r.total >= 5)
    if (pool.length >= 3) {
      const rates = pool.map(([, r]) => r.monthly)
      const mean = rates.reduce((s, x) => s + x, 0) / rates.length
      const variance = rates.reduce((s, x) => s + (x - mean) ** 2, 0) / rates.length
      const std = Math.sqrt(variance)
      const sorted = [...rates].sort((a, b) => a - b)
      const p95 = sorted[Math.floor(sorted.length * 0.95)]
      for (const [staffId, r] of pool) {
        const z = std > 0 ? (r.monthly - mean) / std : 0
        if (z > Z_THRESHOLD || (p95 > 0 && r.monthly > p95)) {
          flags.push({
            staffId,
            staffName: r.name,
            z: Math.round(z * 10) / 10,
            rate: r.monthly,
            note:
              z > Z_THRESHOLD
                ? `نرخ ثبت پیشنهاد ${Math.round(z * 10) / 10} انحراف معیار بالاتر از میانگین همتایان — صرفاً پرچم؛ تصمیم با مدیر (وظیفهٔ پیگیری، نه تنبیه خودکار)`
                : `نرخ ثبت بالاتر از صدک ۹۵ تیم (${r.monthly} ادعا در ۳۰ روز) — شایستهٔ گفت‌وگوی coaching`,
          })
        }
      }
      flags.sort((a, b) => b.z - a.z)
    }
  }

  // پیشرفت سطح تیم (هرگز رتبه‌بندی فردی — پژوهش انگیزشی)
  const monthStart = new Date(addDaysIso(-30) + 'T00:00:00')
  const recent = claims.filter((c) => c.createdAt >= monthStart)
  const team = {
    claims30d: recent.length,
    sampled30d: recent.filter((c) => c.verifySampled).length,
    verifiedOk30d: claims.filter((c) => c.outcome === 'VERIFIED_OK').length,
    verifiedBad30d: claims.filter((c) => c.outcome === 'VERIFIED_BAD').length,
    converted30d: recent.filter((c) => ['CONVERTED', 'CONVERTED_LATE'].includes(c.outcome)).length,
    pendingQueue: queue.length,
  }

  return json({
    claims: visible.map((c) => ({ ...c, productNames: safeParse<string[]>(c.productNames, []) })),
    queue: queue.map((c) => ({ ...c, productNames: safeParse<string[]>(c.productNames, []) })),
    flags,
    team,
    isManager,
    meId: me.id,
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'crm'))) return fail('دسترسی به CRM ندارید', 403)
  const body = await req.json()
  const kind = body.kind || 'SUGGESTION'
  if (!KINDS.includes(kind)) return fail('نوع تعامل نامعتبر است')
  const productNames = (Array.isArray(body.productNames) ? body.productNames : String(body.productNames || '').split(/[،,]/))
    .map((p: unknown) => String(p).trim())
    .filter(Boolean)
    .slice(0, 12)
  if (!productNames.length && !body.claimNote?.trim()) return fail('نام کالا یا توضیح پیشنهاد را بنویسید')

  let customerName = String(body.customerName || '').trim()
  const customerId = body.customerId || ''
  if (customerId) {
    const c = await db.customer.findUnique({ where: { id: customerId } })
    if (!c) return fail('مشتری یافت نشد', 404)
    customerName = customerName || c.name
  }

  // نمونه‌گیری قطعیِ روزانه: seed = امروز + کارمند — برای کاربر غیرقابل حدس
  const verifySampled = isSampledToday(me.id)
  const claim = await db.saleEngagement.create({
    data: {
      customerId,
      customerName,
      staffId: me.id,
      staffName: me.name,
      kind,
      productNames: JSON.stringify(productNames),
      claimNote: body.claimNote || '',
      outcome: 'PENDING',
      verifySampled,
    },
  })
  if (customerId) {
    await db.customerEvent.create({
      data: {
        customerId,
        type: 'SUGGESTION_GIVEN',
        payload: JSON.stringify({ text: `تعامل ثبت شد: ${productNames.join('، ') || '—'}`, products: productNames }),
        userId: me.id,
        userName: me.name,
      },
    })
  }
  if (verifySampled) {
    await emitNotif({
      event: 'engagement.sampled',
      title: 'نمونهٔ راستی‌آزمایی پیشنهاد فروش',
      detail: `${me.name} — ${customerName || 'بدون پرونده'} · ${productNames.join('، ').slice(0, 60)}`,
      go: '#/crm?tab=verify',
      icon: '🔍',
      fieldRefs: { oversight: [] },
      dedupeId: claim.id,
    })
  }
  await logActivity(me, 'ثبت پیشنهاد فروش', 'saleEngagement', claim.id, `${customerName || '—'} · ${productNames.join('، ').slice(0, 40)}`)
  return json({ claim: { ...claim, productNames }, sampled: verifySampled }, 201)
}

export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'crm'))) return fail('دسترسی به CRM ندارید', 403)
  const body = await req.json()
  const claim = await db.saleEngagement.findUnique({ where: { id: body.id } })
  if (!claim) return fail('یافت نشد', 404)

  if (body.action === 'convert') {
    const orderCode = String(body.orderCode || '').trim()
    if (!orderCode) return fail('کد پیش‌فاکتور را وارد کنید')
    // پنجرهٔ ۲ ساعتهٔ صداقت: پیش‌فاکتورِ ثبت‌شده بیش از ۲ ساعت بعد از ادعا → پرچم CONVERTED_LATE (تأیید مدیر)
    let late = false
    const po = await db.preOrder.findUnique({ where: { code: orderCode } })
    if (po) late = po.createdAt.getTime() - claim.createdAt.getTime() > CLAIM_WINDOW_H * 3600_000
    else late = Date.now() - claim.createdAt.getTime() > CLAIM_WINDOW_H * 3600_000
    const updated = await db.saleEngagement.update({
      where: { id: claim.id },
      data: {
        orderCode,
        outcome: late ? 'CONVERTED_LATE' : 'CONVERTED',
        claimNote: body.note ? `${claim.claimNote}\n${body.note}`.trim() : claim.claimNote,
      },
    })
    if (claim.customerId) {
      await db.customerEvent.create({
        data: {
          customerId: claim.customerId,
          type: 'SUGGESTION_ACCEPTED',
          payload: JSON.stringify({ text: `پیشنهاد به فروش رسید — ${orderCode}${late ? ' (خارج از پنجرهٔ ۲ ساعته)' : ''}`, orderCode }),
          userId: me.id,
          userName: me.name,
        },
      })
    }
    await logActivity(me, 'ثبت تبدیل پیشنهاد به فروش', 'saleEngagement', claim.id, `${orderCode}${late ? ' — دیرکرد ۲ ساعته' : ''}`)
    return json({ claim: { ...updated, productNames: safeParse<string[]>(updated.productNames, []) }, late })
  }

  if (body.action === 'verify') {
    if (!(MGR_ROLES.includes(me.role) || (await hasCap(me, 'sales.claims.verify')))) return fail('دسترسی راستی‌آزمایی ندارید', 403)
    if (claim.staffId === me.id) return fail('تأییدکننده نمی‌تواند خودِ ثبت‌کننده باشد (جداسازی وظایف — COSO)')
    const outcome = body.outcome
    if (!['VERIFIED_OK', 'VERIFIED_BAD'].includes(outcome)) return fail('نتیجهٔ راستی‌آزمایی نامعتبر است')
    const updated = await db.saleEngagement.update({
      where: { id: claim.id },
      data: {
        outcome,
        verifyNote: body.verifyNote || '',
        verifiedById: me.id,
        verifiedByName: me.name,
      },
    })
    await logActivity(me, `راستی‌آزمایی پیشنهاد (${outcome === 'VERIFIED_OK' ? 'درست' : 'نامعتبر'})`, 'saleEngagement', claim.id, `${claim.staffName} — ${body.verifyNote || ''}`)
    return json({ claim: { ...updated, productNames: safeParse<string[]>(updated.productNames, []) } })
  }

  return fail('عملیات نامعتبر است')
}
