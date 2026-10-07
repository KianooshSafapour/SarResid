import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const take = Number(searchParams.get('take')) || 80
  const entity = searchParams.get('entity') || ''
  const q = searchParams.get('q') || ''

  let logs = await db.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 400 })
  if (entity) logs = logs.filter((l) => l.entity === entity)
  if (q) logs = logs.filter((l) => l.userName.includes(q) || l.action.includes(q) || l.detail.includes(q))
  return json({ logs: logs.slice(0, take) })
}

/** POST /api/activity — lightweight fire-and-forget audit entry (e.g. barcode scans for traceability)
 * body: { action: string, entity?: string, entityId?: string, detail?: string } */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json().catch(() => null)
  const action = typeof body?.action === 'string' ? body.action.slice(0, 80) : ''
  if (!action) return fail('اقدام نامشخص است')
  await logActivity(
    me,
    action,
    typeof body?.entity === 'string' ? body.entity.slice(0, 40) : '',
    typeof body?.entityId === 'string' ? body.entityId.slice(0, 80) : '',
    typeof body?.detail === 'string' ? body.detail.slice(0, 200) : ''
  )
  return json({ ok: true })
}
