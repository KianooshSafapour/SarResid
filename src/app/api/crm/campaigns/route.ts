import { NextRequest } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const NOTE_FILE = () => `${process.cwd()}/db/campaign-notes.json`

/** campaign notes live outside the DB (schema has no note column) */
function loadNotes(): Record<string, string> {
  try {
    if (!existsSync(NOTE_FILE())) return {}
    return JSON.parse(readFileSync(NOTE_FILE(), 'utf8'))
  } catch {
    return {}
  }
}
function saveNotes(n: Record<string, string>) {
  writeFileSync(NOTE_FILE(), JSON.stringify(n, null, 2))
}

const KINDS = ['BIRTHDAY', 'WINBACK', 'VIP_EVENT', 'OFFER']
const TIERS = ['ALL', 'VIP', 'LOYAL', 'REGULAR', 'NEW', 'AT_RISK', 'DORMANT']
const CAMPAIGN_ROLES = ['OWNER', 'GM', 'ADMIN']

interface CampaignRow {
  id: string
  title: string
  kind: string
  targetTier: string | null
  date: string | null
  status: string
  createdAt: Date
}

function toOut(c: CampaignRow, notes: Record<string, string>) {
  const base: Record<string, unknown> = {
    id: c.id,
    title: c.title,
    kind: c.kind,
    targetTier: c.targetTier,
    date: c.date,
    status: c.status,
  }
  if (notes[c.id]) base.note = notes[c.id]
  base.createdAt = c.createdAt.toISOString()
  return base
}

/** GET /api/crm/campaigns → {items:[{id,title,kind,targetTier,date,status,note?,createdAt}]} */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)

  const rows = await db.campaign.findMany({ orderBy: { createdAt: 'desc' } })
  const notes = loadNotes()
  return ok({ items: rows.map((c) => toOut(c, notes)) })
}

/** POST /api/crm/campaigns — {title, kind, targetTier, date, status?, note?} */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!CAMPAIGN_ROLES.includes(me.role)) return fail('شما مجاز به مدیریت کمپین‌ها نیستید', 403)

  const body = await req.json().catch(() => null)
  if (!body) return fail('درخواست نامعتبر است')

  const title = String(body.title ?? '').trim()
  if (title.length < 2) return fail('عنوان کمپین را وارد کنید')
  const kind = String(body.kind ?? '').trim().toUpperCase()
  if (!KINDS.includes(kind)) return fail('نوع کمپین نامعتبر است')
  const targetTier = String(body.targetTier ?? 'ALL').trim().toUpperCase()
  if (!TIERS.includes(targetTier)) return fail('طیف هدف نامعتبر است')
  const date = String(body.date ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.replace(/\//g, '-'))) return fail('تاریخ کمپین را وارد کنید')
  const status = String(body.status ?? 'DRAFT').trim().toUpperCase() === 'DONE' ? 'DONE' : 'DRAFT'
  const note = String(body.note ?? '').trim() || null

  const created = await db.campaign.create({ data: { title, kind, targetTier, date, status } })
  if (note) {
    const notes = loadNotes()
    notes[created.id] = note
    saveNotes(notes)
  }

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'crm.campaign.create',
    actionLabel: 'ایجاد کمپین',
    category: 'crm',
    detail: `${title} — ${targetTier}`,
    entityId: created.id,
  })

  return ok(toOut(created, loadNotes()))
}

/** PATCH /api/crm/campaigns — {id, title?, kind?, targetTier?, date?, status?, note?} */
export async function PATCH(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!CAMPAIGN_ROLES.includes(me.role)) return fail('شما مجاز به مدیریت کمپین‌ها نیستید', 403)

  const body = await req.json().catch(() => null)
  const id = String(body?.id ?? '').trim()
  const row = id ? await db.campaign.findUnique({ where: { id } }) : null
  if (!row) return fail('کمپین یافت نشد', 404)

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) {
    const title = String(body.title ?? '').trim()
    if (title.length < 2) return fail('عنوان کمپین را وارد کنید')
    data.title = title
  }
  if (body.kind !== undefined) {
    const kind = String(body.kind ?? '').trim().toUpperCase()
    if (!KINDS.includes(kind)) return fail('نوع کمپین نامعتبر است')
    data.kind = kind
  }
  if (body.targetTier !== undefined) {
    const targetTier = String(body.targetTier ?? 'ALL').trim().toUpperCase()
    if (!TIERS.includes(targetTier)) return fail('طیف هدف نامعتبر است')
    data.targetTier = targetTier
  }
  if (body.date !== undefined) {
    const date = String(body.date ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.replace(/\//g, '-'))) return fail('تاریخ کمپین را وارد کنید')
    data.date = date
  }
  if (body.status !== undefined) {
    data.status = String(body.status ?? '').trim().toUpperCase() === 'DONE' ? 'DONE' : 'DRAFT'
  }
  if (Object.keys(data).length) await db.campaign.update({ where: { id }, data })

  if (body.note !== undefined) {
    const note = String(body.note ?? '').trim()
    const notes = loadNotes()
    if (note) notes[id] = note
    else delete notes[id]
    saveNotes(notes)
  }

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'crm.campaign.update',
    actionLabel: 'ویرایش کمپین',
    category: 'crm',
    detail: row.title,
    entityId: id,
  })

  const updated = await db.campaign.findUnique({ where: { id } })
  return ok(updated ? toOut(updated, loadNotes()) : { id })
}

/** DELETE /api/crm/campaigns?id= */
export async function DELETE(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!CAMPAIGN_ROLES.includes(me.role)) return fail('شما مجاز به مدیریت کمپین‌ها نیستید', 403)

  const url = new URL(req.url)
  const id = (url.searchParams.get('id') || '').trim()
  const row = id ? await db.campaign.findUnique({ where: { id } }) : null
  if (!row) return fail('کمپین یافت نشد', 404)

  await db.campaign.delete({ where: { id } })
  const notes = loadNotes()
  delete notes[id]
  saveNotes(notes)

  await logActivity({
    userId: me.id,
    userName: me.fullName,
    action: 'crm.campaign.delete',
    actionLabel: 'حذف کمپین',
    category: 'crm',
    detail: row.title,
    entityId: id,
  })
  return ok({ id })
}
