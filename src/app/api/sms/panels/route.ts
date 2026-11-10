import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'
import { PANEL_PROVIDERS, PROVIDER_META } from '@/lib/sms'

export const dynamic = 'force-dynamic'

type Panel = {
  id: string
  name: string
  provider: string
  mode: string
  settingsJson: string
  active: boolean
  isDefault: boolean
  lastTestAt: Date | null
  lastTestOk: boolean | null
  note: string
  createdAt: Date
}

function panelOut(p: Panel) {
  let settings: Record<string, string> = {}
  try {
    const v = JSON.parse(p.settingsJson || '{}')
    if (v && typeof v === 'object') settings = v
  } catch {
    settings = {}
  }
  return {
    id: p.id,
    name: p.name,
    provider: p.provider,
    providerTitle: PROVIDER_META[p.provider]?.title ?? p.provider,
    mode: p.mode,
    settings,
    active: p.active,
    isDefault: p.isDefault,
    lastTestAt: p.lastTestAt?.toISOString() ?? null,
    lastTestOk: p.lastTestOk,
    note: p.note,
    createdAt: p.createdAt.toISOString(),
  }
}

async function outboxStats() {
  const rows = await db.smsOutbox.groupBy({ by: ['status'], _count: { _all: true } })
  const stats: Record<string, number> = { SENT: 0, FAILED: 0, SKIPPED: 0, PENDING: 0 }
  for (const r of rows) stats[r.status] = r._count._all
  return stats
}

/** GET /api/sms/panels → {panels, stats, providers} — مرکز پیامک (system/smscenter) */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'system/smscenter')
  if (!gate.ok) return fail(gate.deny, 403)

  const [panels, stats] = await Promise.all([
    db.smsPanel.findMany({ orderBy: [{ createdAt: 'asc' }] }),
    outboxStats(),
  ])

  return ok({
    panels: panels.map(panelOut),
    stats,
    providers: PROVIDER_META,
  })
}

/** POST /api/sms/panels {name, provider, mode?, settings?, active?, isDefault?, note?} */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'system/smscenter')
  if (!gate.ok) return fail(gate.deny, 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const name = String(body.name ?? '').trim()
  if (!name) return fail('نام پنل را وارد کنید')
  const provider = String(body.provider ?? '').trim().toLowerCase()
  if (!(PANEL_PROVIDERS as readonly string[]).includes(provider)) {
    return fail('سرویس‌دهندهٔ پیامک نامعتبر است')
  }

  const mode = String(body.mode ?? 'mock') === 'real' ? 'real' : 'mock'
  let settings: Record<string, string> = {}
  if (body.settings !== undefined) {
    if (!body.settings || typeof body.settings !== 'object' || Array.isArray(body.settings)) {
      return fail('تنظیمات پنل نامعتبر است')
    }
    for (const [k, v] of Object.entries(body.settings as Record<string, unknown>)) {
      settings[k] = v === null || v === undefined ? '' : String(v)
    }
  }
  const allowed = PROVIDER_META[provider]?.fields ?? []
  const extra = Object.keys(settings).filter((k) => !allowed.includes(k) && k !== 'bodyTemplate')
  if (extra.length) return fail(`فیلدهای ناشناخته در تنظیمات: ${extra.join('، ')}`)

  const isDefault = body.isDefault === true
  const active = isDefault ? true : body.active === true // default panel must be active

  if (isDefault) await db.smsPanel.updateMany({ where: {}, data: { isDefault: false } })

  const created = await db.smsPanel.create({
    data: {
      name,
      provider,
      mode,
      settingsJson: JSON.stringify(settings),
      active,
      isDefault,
      note: String(body.note ?? '').trim(),
    },
  })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'sms.panel.create',
    actionLabel: 'مرکز پیامک',
    category: 'settings',
    detail: `پنل «${name}» (${PROVIDER_META[provider]?.title ?? provider}) اضافه شد${isDefault ? ' — پیش‌فرض' : ''}`,
    entityId: created.id,
  })

  return ok({ panel: panelOut(created), stats: await outboxStats() })
}
