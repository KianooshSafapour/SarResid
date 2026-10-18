import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, safeJson, clampInt, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { displayName } from '@/lib/notify'
import { todayJalaliDash } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

interface TplItem {
  text: string
  hint?: string
}
interface StateItem {
  text: string
  hint?: string
  done: boolean
  note: string
}

/** default state mirrors the template items */
function defaultState(items: TplItem[]): StateItem[] {
  return items.map((i) => ({ text: i.text, hint: i.hint ?? '', done: false, note: '' }))
}

/** GET /api/checklists?day=1405-07-25 → {day, checklists, history} */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const day = req.nextUrl.searchParams.get('day') || todayJalaliDash()

  const templates = await db.checklistTemplate.findMany({
    where: { active: true, OR: [{ roleKey: null }, { roleKey: me.role }] },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  })
  const states = await db.checklistState.findMany({
    where: { day, templateId: { in: templates.map((t) => t.id) } },
  })
  const stateMap = new Map(states.map((s) => [s.templateId, s]))

  const historyRows = await db.checklistState.findMany({
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: 20,
  })
  const historyTplIds = [...new Set(historyRows.map((h) => h.templateId))]
  const historyTpls = historyTplIds.length
    ? await db.checklistTemplate.findMany({ where: { id: { in: historyTplIds } } })
    : []
  const historyTplMap = new Map(historyTpls.map((t) => [t.id, t]))

  return ok({
    day,
    checklists: templates.map((t) => {
      const items = safeJson<TplItem[]>(t.itemsJson, [])
      const state = stateMap.get(t.id)
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        phase: t.phase === '' ? null : t.phase,
        frequency: t.frequency,
        points: t.points,
        roleKey: t.roleKey,
        items,
        state: state ? safeJson<StateItem[]>(state.itemsJson, defaultState(items)) : defaultState(items),
        completedAt: state?.completedAt ?? null,
      }
    }),
    history: historyRows.map((h) => ({
      id: h.id,
      day: h.day,
      completedAt: h.completedAt,
      checklist: { title: historyTplMap.get(h.templateId)?.title || '' },
    })),
  })
}

/**
 * POST /api/checklists {checklistId, day, state:[{done,note}]}
 * Saves today's state; completing every item awards the template points once.
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => ({}))) as {
    checklistId?: string
    id?: string
    day?: string
    state?: { done?: boolean; note?: string }[]
  }
  const checklistId = String(body.checklistId || body.id || '')
  const day = String(body.day || todayJalaliDash())

  const template = await db.checklistTemplate.findUnique({ where: { id: checklistId } })
  if (!template || !template.active) return fail('چک‌لیست یافت نشد', 404)

  const items = safeJson<TplItem[]>(template.itemsJson, [])
  const incoming = Array.isArray(body.state) ? body.state : []

  const newState: StateItem[] = items.map((item, i) => ({
    text: item.text,
    hint: item.hint ?? '',
    done: !!incoming[i]?.done,
    note: String(incoming[i]?.note ?? '').slice(0, 500),
  }))
  const allDone = items.length > 0 && newState.every((s) => s.done)

  const existing = await db.checklistState.findUnique({
    where: { day_templateId: { day, templateId: template.id } },
  })

  // award points only on the transition to fully-complete
  const awardable = allDone && (!existing || existing.completedAt === null)
  const awarded = awardable ? template.points : 0

  await db.checklistState.upsert({
    where: { day_templateId: { day, templateId: template.id } },
    create: {
      day,
      templateId: template.id,
      itemsJson: JSON.stringify(newState),
      userId: me.id,
      completedAt: allDone ? new Date() : null,
    },
    update: {
      itemsJson: JSON.stringify(newState),
      userId: me.id,
      completedAt: allDone ? (existing?.completedAt ?? new Date()) : null,
    },
  })

  if (awarded > 0) {
    await db.user.update({ where: { id: me.id }, data: { points: { increment: awarded } } })
    await logActivity({
      userId: me.id,
      userName: displayName(me),
      action: 'checklist_complete',
      actionLabel: 'تکمیل چک‌لیست',
      category: 'checklists',
      detail: `${template.title} (+${awarded} امتیاز)`,
      entityId: template.id,
    })
  }

  return ok({ awarded })
}

/**
 * PUT /api/checklists — managers create/update a template.
 * Body: {id?, title, roleKey("ALL"→null), frequency, phase("NONE"→null), points, items:[{text,hint?}]}
 */
export async function PUT(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!isManager(me)) return fail('فقط مدیران می‌توانند چک‌لیست را ویرایش کنند', 403)

  const body = (await req.json().catch(() => ({}))) as {
    id?: string
    title?: string
    description?: string
    roleKey?: string | null
    frequency?: string
    phase?: string | null
    points?: number
    items?: { text?: string; hint?: string }[]
  }

  const title = String(body.title || '').trim()
  if (title.length < 2) return fail('عنوان الزامی است')

  const frequency = ['DAILY', 'WEEKLY', 'MONTHLY'].includes(String(body.frequency))
    ? String(body.frequency)
    : 'DAILY'
  // phase column is NOT NULL — null/NONE stored as "" and mapped back to null on GET
  const phase =
    body.phase && body.phase !== 'NONE' ? String(body.phase) : ''
  const roleKey =
    body.roleKey && body.roleKey !== 'ALL' ? String(body.roleKey) : null
  const points = clampInt(body.points, 1, 20, 2)

  const items = (Array.isArray(body.items) ? body.items : [])
    .map((i) => ({ text: String(i.text || '').trim(), hint: String(i.hint || '').trim() || undefined }))
    .filter((i) => i.text.length > 0)
    .slice(0, 60)
  if (items.length === 0) return fail('حداقل یک مورد الزامی است')

  const itemsJson = JSON.stringify(items)

  if (body.id) {
    const existing = await db.checklistTemplate.findUnique({ where: { id: String(body.id) } })
    if (!existing) return fail('چک‌لیست یافت نشد', 404)
    await db.checklistTemplate.update({
      where: { id: existing.id },
      data: {
        title,
        description: body.description !== undefined ? String(body.description || '') : existing.description,
        phase,
        frequency,
        points,
        roleKey,
        itemsJson,
      },
    })
    await logActivity({
      userId: me.id,
      userName: displayName(me),
      action: 'checklist_template_update',
      actionLabel: 'ویرایش چک‌لیست',
      category: 'checklists',
      detail: title,
      entityId: existing.id,
    })
    return ok({ checklist: { id: existing.id } })
  }

  const created = await db.checklistTemplate.create({
    data: {
      title,
      description: String(body.description || ''),
      phase,
      frequency,
      points,
      roleKey,
      itemsJson,
      active: true,
    },
  })
  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'checklist_template_create',
    actionLabel: 'ایجاد چک‌لیست',
    category: 'checklists',
    detail: title,
    entityId: created.id,
  })
  return ok({ checklist: { id: created.id } })
}

/** DELETE /api/checklists?id= — managers; soft-deletes the template */
export async function DELETE(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)
  if (!isManager(me)) return fail('فقط مدیران می‌توانند چک‌لیست را حذف کنند', 403)

  const id = req.nextUrl.searchParams.get('id') || ''
  const existing = await db.checklistTemplate.findUnique({ where: { id } })
  if (!existing) return fail('چک‌لیست یافت نشد', 404)

  await db.checklistTemplate.update({ where: { id }, data: { active: false } })
  await logActivity({
    userId: me.id,
    userName: displayName(me),
    action: 'checklist_template_delete',
    actionLabel: 'حذف چک‌لیست',
    category: 'checklists',
    detail: existing.title,
    entityId: id,
  })
  return ok({ deleted: id })
}
