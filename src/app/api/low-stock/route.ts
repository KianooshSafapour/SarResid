import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity, clampInt } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { toFaDigits } from '@/lib/jalali'
import { getSmsConfig, sendSms, renderLowstockText, normalizeMobile, type SmsConfig } from '@/lib/sms'
import { getLowStockSettings, computeThreshold, analyzableWhere, type LowStockSettings } from '@/lib/lowstock'

export const dynamic = 'force-dynamic'

/** GET: managers + ACC (finance view). PATCH/scan: managers only. */
const VIEW_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC']

interface AnalyzedProduct {
  id: string
  name: string
  unit: string
  stock: number
  sellPrice: number
  monthlySold: number
  leadTimeDays: number
  smsAlert: boolean
  lowStockThreshold: number | null
  reorderLevel: number | null
  threshold: number | null
  needed: number
  criticality: number // sort key: stock/threshold ascending = most critical first
}

function analyze(
  p: {
    id: string
    name: string
    unit: string
    stock: number
    sellPrice: number
    monthlySold: number
    leadTimeDays: number
    smsAlert: boolean
    lowStockThreshold: number | null
    reorderLevel: number | null
  },
  s: LowStockSettings,
): AnalyzedProduct {
  const threshold = computeThreshold(p, s)
  const needed = threshold !== null ? Math.max(0, threshold * 2 - p.stock) : 0
  const criticality = threshold !== null && threshold > 0 ? p.stock / threshold : p.stock <= 0 ? -1 : Number.MAX_SAFE_INTEGER
  return { ...p, threshold, needed, criticality }
}

/**
 * GET /api/low-stock?q=&limit=
 * → {items (stock ≤ threshold, most critical first), config, stats}
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!VIEW_ROLES.includes(user.role)) return fail('دسترسی به تحلیل موجودی ندارید', 403)

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') || '').trim()
  const limitRaw = (sp.get('limit') || '').trim()
  const limit = limitRaw === '' ? 200 : clampInt(limitRaw, 1, 1000, 200)

  const [settings, smsCfg] = await Promise.all([getLowStockSettings(), getSmsConfig()])

  const candidates = await db.product.findMany({
    where: { ...analyzableWhere(settings), ...(q ? { name: { contains: q } } : {}) },
    select: {
      id: true,
      name: true,
      unit: true,
      stock: true,
      sellPrice: true,
      monthlySold: true,
      leadTimeDays: true,
      smsAlert: true,
      lowStockThreshold: true,
      reorderLevel: true,
    },
  })

  const analyzed = candidates.map((p) => analyze(p, settings))
  const low = analyzed
    .filter((p) => p.threshold !== null && p.stock <= (p.threshold as number))
    .sort((a, b) => a.criticality - b.criticality || a.stock - b.stock)

  const [totalAnalyzed, smsMarked] = await Promise.all([
    db.product.count({ where: analyzableWhere(settings) }),
    db.product.count({ where: { active: true, smsAlert: true } }),
  ])

  return ok({
    items: low.slice(0, limit).map((p) => ({
      productId: p.id,
      name: p.name,
      unit: p.unit,
      stock: p.stock,
      sellPrice: p.sellPrice,
      monthlySold: p.monthlySold,
      leadTimeDays: p.leadTimeDays,
      threshold: p.threshold,
      needed: p.needed,
      smsAlert: p.smsAlert,
    })),
    total: low.length,
    limit,
    truncated: low.length > limit,
    config: {
      enabled: smsCfg.enabled,
      provider: smsCfg.provider,
      sender: smsCfg.sender,
      recipients: smsCfg.recipients,
      template: smsCfg.lowstockTemplate,
      leadBuffer: settings.leadBuffer,
      minMonthlySold: settings.minMonthlySold,
    },
    stats: {
      total: totalAnalyzed,
      low: low.length,
      smsMarked,
    },
  })
}

/** PATCH /api/low-stock {productId, lowStockThreshold?, smsAlert?} — per-product config (managers) */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('فقط مدیران می‌توانند تنظیمات موجودی کالا را تغییر دهند', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const productId = String((body as Record<string, unknown>).productId ?? '').trim()
  if (!productId) return fail('شناسه کالا الزامی است')
  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product) return fail('کالا یافت نشد', 404)

  const data: Record<string, unknown> = {}
  const b = body as Record<string, unknown>
  if (b.lowStockThreshold !== undefined) {
    if (b.lowStockThreshold === null || b.lowStockThreshold === '') {
      data.lowStockThreshold = null
    } else {
      const n = Number(b.lowStockThreshold)
      if (!Number.isFinite(n) || n < 0) return fail('حد سفارش مجدد باید عددی نامنفی باشد')
      data.lowStockThreshold = Math.round(n)
    }
  }
  if (b.smsAlert !== undefined) data.smsAlert = b.smsAlert === true
  if (Object.keys(data).length === 0) return fail('تغییری برای ذخیره وجود ندارد')

  const updated = await db.product.update({ where: { id: productId }, data })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'lowstock.config',
    actionLabel: 'تحلیل موجودی',
    category: 'products',
    detail: `«${product.name}» — ${Object.keys(data).join('، ')}`,
    entityId: productId,
  })

  return ok({
    product: {
      id: updated.id,
      name: updated.name,
      lowStockThreshold: updated.lowStockThreshold,
      smsAlert: updated.smsAlert,
      stock: updated.stock,
    },
  })
}

/**
 * POST /api/low-stock {action:'scan'}
 * For every product with smsAlert=true AND stock ≤ threshold AND no SENT/PENDING
 * SmsOutbox row for it in the last 24h → create an outbox row + try to send + notify.
 * With SMS disabled the rows land as SKIPPED with the «پنل پیامک تنظیم نشده» note.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!isManager(user)) return fail('فقط مدیران می‌توانند اسکن هشدار موجودی را اجرا کنند', 403)

  const body = await req.json().catch(() => null)
  const action = String((body as Record<string, unknown> | null)?.action ?? '').trim()
  if (action !== 'scan') return fail('عملیات نامعتبر است')

  const [settings, smsCfg] = await Promise.all([getLowStockSettings(), getSmsConfig()])

  const candidates = await db.product.findMany({
    where: { ...analyzableWhere(settings), smsAlert: true },
    select: {
      id: true,
      name: true,
      stock: true,
      monthlySold: true,
      leadTimeDays: true,
      lowStockThreshold: true,
      reorderLevel: true,
    },
  })
  const triggered = candidates
    .map((p) => ({ ...p, threshold: computeThreshold(p, settings) }))
    .filter((p) => p.threshold !== null && p.stock <= (p.threshold as number))

  // 24h dedupe: SENT/PENDING rows for the same product suppress a repeat alert
  const since = new Date(Date.now() - 24 * 3600 * 1000)
  const recent = await db.smsOutbox.findMany({
    where: { reason: 'LOW_STOCK', status: { in: ['SENT', 'PENDING'] }, createdAt: { gte: since } },
    select: { refId: true },
  })
  const recentlyAlerted = new Set(recent.map((r) => r.refId))

  let sent = 0
  let failed = 0
  let skipped = 0
  const toFire = triggered.filter((p) => !recentlyAlerted.has(p.id))

  for (const p of toFire) {
    const text = renderLowstockText(smsCfg.lowstockTemplate, { name: p.name, stock: p.stock })
    const recipients = smsCfg.recipients.length ? smsCfg.recipients : ['']
    for (const rawTo of recipients) {
      const to = normalizeMobile(rawTo) ?? rawTo
      const row = await db.smsOutbox.create({
        data: { to, toName: '', text, reason: 'LOW_STOCK', refId: p.id, status: 'PENDING', provider: smsCfg.provider },
      })
      const result = await sendSafe(to, text, smsCfg)
      if (result.ok) {
        sent++
        await db.smsOutbox.update({
          where: { id: row.id },
          data: { status: 'SENT', sentAt: new Date(), messageId: result.messageId ?? null, error: null },
        })
      } else if (result.skipped) {
        skipped++
        await db.smsOutbox.update({ where: { id: row.id }, data: { status: 'SKIPPED', error: result.error } })
      } else {
        failed++
        await db.smsOutbox.update({ where: { id: row.id }, data: { status: 'FAILED', error: result.error } })
      }
    }
  }

  if (toFire.length > 0) {
    await notify({
      role: 'GM',
      kind: 'lowstock',
      severity: 'warning',
      title: 'هشدار اتمام موجودی',
      body: `${toFaDigits(String(toFire.length))} کالا به حد سفارش مجدد رسید — ${toFaDigits(String(sent))} پیامک ارسال شد، ${toFaDigits(String(skipped))} رد شد (پنل غیرفعال)`,
      go: '#/supply/orders',
    })
  }

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'lowstock.scan',
    actionLabel: 'تحلیل موجودی',
    category: 'products',
    detail: `اسکن هشدار موجودی — ${toFaDigits(String(toFire.length))} کالا فعال، ${toFaDigits(String(sent))} ارسال، ${toFaDigits(String(skipped))} ردشده، ${toFaDigits(String(failed))} خطا`,
  })

  return ok({ triggered: toFire.length, sent, skipped, failed, suppressed: triggered.length - toFire.length })
}

/** classify send outcome — config problems are SKIPPED (not FAILED), network/panel errors are FAILED */
async function sendSafe(to: string, text: string, cfg: SmsConfig) {
  if (!cfg.enabled || !cfg.provider || !cfg.apiKey) {
    return { ok: false as const, skipped: true, error: 'پنل پیامک تنظیم نشده' }
  }
  if (!normalizeMobile(to)) {
    return { ok: false as const, skipped: true, error: 'شماره گیرنده تنظیم نشده' }
  }
  const result = await sendSms({ to, text, config: cfg })
  if (result.ok) return { ok: true as const, messageId: result.messageId }
  const configErrors = ['پنل پیامک تنظیم نشده', 'شماره موبایل گیرنده نامعتبر است', 'متن پیامک خالی است']
  const skipped = !!result.error && configErrors.includes(result.error)
  return { ok: false as const, skipped, error: result.error ?? 'خطای نامشخص' }
}
