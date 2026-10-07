/** GET /api/notif-rules — قواعد اعلان + کاتالوگ رخدادها (برای ویرایشگر بصری جریان اعلان‌ها)
 *  PUT — ویرایش/ایجاد قاعده (گارد: cap 'notif.rules' یا نقش‌های اجرایی)
 *  PATCH — ارسال اعلان آزمایشی به خودِ ویرایشگر برای پیش‌نمایش */
import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { hasCap } from '@/lib/rbac'
import { DIGEST_SLOTS, NOTIF_EVENTS, NOTIF_EVENT_MAP, type NotifSeverity, type NotifTargets } from '@/lib/notif-catalog'

type EscalationStep = { afterMinutes: number; to: { roles: string[]; users: string[] }; mode: 'notify' | 'reassign' }
type Digest = { enabled: boolean; slots: string[] }

const SEVERITIES: NotifSeverity[] = ['critical', 'important', 'info']

async function canEditRules(me: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>) {
  return hasCap(me, 'notif.rules')
}

function parseRule(r: {
  key: string; name: string; event: string; enabled: boolean; severity: string; icon: string
  targets: string; escalation: string; digest: string; dedupeHours: number; note: string
  updatedByName: string; updatedAt: Date
}, stats: { lastFired: Date | null; firedCount: number }) {
  return {
    key: r.key,
    name: r.name,
    event: r.event,
    enabled: r.enabled,
    severity: (SEVERITIES.includes(r.severity as NotifSeverity) ? r.severity : 'important') as NotifSeverity,
    icon: r.icon,
    targets: safeParse<NotifTargets>(r.targets, { roles: [] }),
    escalation: safeParse<EscalationStep[]>(r.escalation, []),
    digest: safeParse<Digest>(r.digest, { enabled: false, slots: [...DIGEST_SLOTS] }),
    dedupeHours: r.dedupeHours,
    note: r.note,
    updatedByName: r.updatedByName,
    updatedAt: r.updatedAt,
    lastFired: stats.lastFired,
    firedCount: stats.firedCount,
    configured: true,
  }
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canEditRules(me))) return fail('دسترسی ویرایش جریان اعلان‌ها را ندارید', 403)

  const weekAgo = new Date(Date.now() - 7 * 86400000)
  const [rules, allTime, last7d] = await Promise.all([
    db.notifRule.findMany({ orderBy: { key: 'asc' } }),
    db.notifOutbox.groupBy({ by: ['ruleKey'], _max: { createdAt: true }, _count: { _all: true } }),
    db.notifOutbox.groupBy({ by: ['ruleKey'], _count: { _all: true }, where: { createdAt: { gte: weekAgo } } }),
  ])

  const lastFiredMap: Record<string, Date | null> = {}
  for (const g of allTime) lastFiredMap[g.ruleKey] = g._max.createdAt
  const fired7dMap: Record<string, number> = {}
  for (const g of last7d) fired7dMap[g.ruleKey] = g._count._all

  return json({
    rules: rules.map((r) => parseRule(r, { lastFired: lastFiredMap[r.key] || null, firedCount: fired7dMap[r.key] || 0 })),
    catalog: NOTIF_EVENTS,
  })
}

export async function PUT(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canEditRules(me))) return fail('دسترسی ویرایش جریان اعلان‌ها را ندارید', 403)

  const body = await req.json().catch(() => null)
  const key = String(body?.key || '')
  const def = NOTIF_EVENT_MAP[key]
  if (!def) return fail('رخداد شناخته‌شده نیست', 400)

  const data: Record<string, unknown> = { updatedById: me.id, updatedByName: me.name }

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') return fail('وضعیت روشن/خاموش نامعتبر است')
    data.enabled = body.enabled
  }
  if (body.severity !== undefined) {
    if (!SEVERITIES.includes(body.severity)) return fail('سطح اهمیت نامعتبر است')
    data.severity = body.severity
  }
  if (body.targets !== undefined) {
    const t = body.targets || {}
    if (typeof t !== 'object') return fail('قالب مقصدها نامعتبر است')
    const roles = Array.isArray(t.roles) ? t.roles.filter((x: unknown) => typeof x === 'string' && x.trim()).map((x: string) => x.trim().toUpperCase()) : []
    const users = Array.isArray(t.users) ? t.users.filter((x: unknown) => typeof x === 'string' && x.trim()) : []
    const fieldRef = typeof t.fieldRef === 'string' && def.fieldRefs.includes(t.fieldRef) ? t.fieldRef : ''
    data.targets = JSON.stringify({ roles, users, fieldRef })
  }
  if (body.escalation !== undefined) {
    if (!Array.isArray(body.escalation)) return fail('قالب تشدید نامعتبر است')
    const esc: EscalationStep[] = []
    for (const s of body.escalation.slice(0, 5)) {
      const afterMinutes = Math.max(1, Math.min(10080, Number(s?.afterMinutes) || 0))
      if (!afterMinutes) continue
      esc.push({
        afterMinutes,
        to: {
          roles: Array.isArray(s?.to?.roles) ? s.to.roles.filter((x: unknown) => typeof x === 'string').map((x: string) => String(x).toUpperCase()) : [],
          users: Array.isArray(s?.to?.users) ? s.to.users.filter((x: unknown) => typeof x === 'string') : [],
        },
        mode: s?.mode === 'reassign' ? 'reassign' : 'notify',
      })
    }
    data.escalation = JSON.stringify(esc)
  }
  if (body.digest !== undefined) {
    const d = body.digest || {}
    const slots = Array.isArray(d.slots) ? d.slots.filter((s: unknown) => (DIGEST_SLOTS as readonly string[]).includes(String(s))) : []
    data.digest = JSON.stringify({ enabled: !!d.enabled, slots })
  }
  if (body.dedupeHours !== undefined) {
    const h = Number(body.dedupeHours)
    if (!Number.isFinite(h) || h < 0 || h > 720) return fail('پنجرهٔ ضدتکرار باید بین ۰ تا ۷۲۰ ساعت باشد')
    data.dedupeHours = Math.round(h)
  }
  if (body.note !== undefined) data.note = String(body.note || '').slice(0, 300)

  const rule = await db.notifRule.upsert({
    where: { key },
    update: data,
    create: {
      key,
      name: def.label,
      event: def.key,
      icon: def.icon,
      severity: (data.severity as string) || def.severity,
      targets: (data.targets as string) || JSON.stringify(def.defaultTargets),
      escalation: (data.escalation as string) || '[]',
      digest: (data.digest as string) || JSON.stringify({ enabled: false, slots: [...DIGEST_SLOTS] }),
      dedupeHours: (data.dedupeHours as number) ?? 12,
      note: (data.note as string) || '',
      enabled: (data.enabled as boolean) ?? true,
      updatedById: me.id,
      updatedByName: me.name,
    },
  })

  await logActivity(me, 'ویرایش قاعدهٔ اعلان', 'notif-rule', key, def.label)

  return json({ rule: parseRule(rule, { lastFired: null, firedCount: 0 }) })
}

/** PATCH {key, action:'test'} — اعلان آزمایشی فقط برای خودِ ویرایشگر (پیش‌نمایش نحوهٔ رسیدن) */
export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canEditRules(me))) return fail('دسترسی ویرایش جریان اعلان‌ها را ندارید', 403)

  const body = await req.json().catch(() => null)
  const key = String(body?.key || '')
  if (body?.action !== 'test') return fail('عملیات نامعتبر است')
  const def = NOTIF_EVENT_MAP[key]
  if (!def) return fail('رخداد شناخته‌شده نیست', 400)

  const rule = await db.notifRule.findUnique({ where: { key } })
  const icon = rule?.icon || def.icon

  await db.notifOutbox.create({
    data: {
      ruleKey: key,
      severity: 'info',
      icon,
      title: `${def.label} (تست)`,
      detail: 'این یک اعلان آزمایشی است تا ببینید با تنظیم فعلی چگونه می‌رسد — فقط برای شما ارسال شد.',
      go: '#/notifs',
      targetRoles: '[]',
      targetUsers: JSON.stringify([me.id]),
      dedupeKey: '',
    },
  })

  await logActivity(me, 'ارسال اعلان آزمایشی', 'notif-rule', key, def.label)

  return json({ ok: true })
}
