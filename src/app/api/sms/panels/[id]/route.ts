import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { assertPageAccess } from '@/lib/access'
import { PROVIDER_META } from '@/lib/sms'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** PATCH /api/sms/panels/[id] {name?, mode?, settings?, active?, isDefault?, note?} */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'system/smscenter')
  if (!gate.ok) return fail(gate.deny, 403)

  const { id } = await ctx.params
  const panel = await db.smsPanel.findUnique({ where: { id } })
  if (!panel) return fail('پنل یافت نشد', 404)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('درخواست نامعتبر است')

  const data: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = String(body.name ?? '').trim()
    if (!name) return fail('نام پنل را وارد کنید')
    data.name = name
  }

  if (body.mode !== undefined) {
    data.mode = String(body.mode) === 'real' ? 'real' : 'mock'
  }

  if (body.settings !== undefined) {
    if (!body.settings || typeof body.settings !== 'object' || Array.isArray(body.settings)) {
      return fail('تنظیمات پنل نامعتبر است')
    }
    const settings: Record<string, string> = {}
    for (const [k, v] of Object.entries(body.settings as Record<string, unknown>)) {
      settings[k] = v === null || v === undefined ? '' : String(v)
    }
    const allowed = PROVIDER_META[panel.provider]?.fields ?? []
    const extra = Object.keys(settings).filter((k) => !allowed.includes(k) && k !== 'bodyTemplate')
    if (extra.length) return fail(`فیلدهای ناشناخته در تنظیمات: ${extra.join('، ')}`)
    data.settingsJson = JSON.stringify(settings)
  }

  if (body.note !== undefined) data.note = String(body.note ?? '').trim()

  let makeDefault = body.isDefault === true
  if (body.isDefault === false) data.isDefault = false
  if (body.active !== undefined) data.active = body.active === true
  // a default panel must stay active; deactivating drops the default flag
  if (body.active === false && panel.isDefault) makeDefault = false
  if (makeDefault) {
    data.isDefault = true
    data.active = true
  }

  if (makeDefault) await db.smsPanel.updateMany({ where: { id: { not: id } }, data: { isDefault: false } })

  const updated = await db.smsPanel.update({ where: { id }, data })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'sms.panel.update',
    actionLabel: 'مرکز پیامک',
    category: 'settings',
    detail: `به‌روزرسانی پنل «${updated.name}»`,
    entityId: id,
  })

  return ok({ id: updated.id })
}

/** DELETE /api/sms/panels/[id] */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  const gate = await assertPageAccess(user, 'system/smscenter')
  if (!gate.ok) return fail(gate.deny, 403)

  const { id } = await ctx.params
  const panel = await db.smsPanel.findUnique({ where: { id } })
  if (!panel) return fail('پنل یافت نشد', 404)

  await db.smsPanel.delete({ where: { id } })

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'sms.panel.delete',
    actionLabel: 'مرکز پیامک',
    category: 'settings',
    detail: `حذف پنل «${panel.name}»`,
    entityId: id,
  })

  return ok({ id })
}
