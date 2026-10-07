import { db } from '@/lib/db'
import { fail, getSessionUser, json } from '@/lib/api-helpers'
import { canViewApi } from '@/lib/rbac'

/**
 * پروندهٔ نماینده — تاریخچهٔ کامل رخدادهای سند که این نماینده انجام داده است.
 * GET /api/sales-reps/[id] → { rep, events: [{...event, docCode, docTitle}], docs: [distinct docs] }
 */

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'archive')) && !(await canViewApi(me, 'people')))
    return fail('دسترسی به دفتر اشخاص را ندارید', 403)

  const { id } = await params
  const rep = await db.salesRep.findUnique({ where: { id } })
  if (!rep) return fail('نماینده یافت نشد', 404)

  // parseJsonArr — فیلدهای JSON باید همیشه آرایه برگردانند (رفع crash «rep.tags.map is not a function»)
  const parseJsonArr = (s: string | null | undefined): any[] => {
    try {
      const arr = JSON.parse(s || '[]')
      return Array.isArray(arr) ? arr : []
    } catch { return [] }
  }
  const repSafe = { ...rep, tags: parseJsonArr(rep.tags), providerHistory: parseJsonArr(rep.providerHistory) }

  const events = await db.docEvent.findMany({ where: { repId: id }, take: 200, orderBy: [{ at: 'desc' }, { createdAt: 'desc' }] })
  const docIds = [...new Set(events.map((e) => e.docId).filter(Boolean))]
  const docs = docIds.length
    ? await db.archiveDoc.findMany({
        where: { id: { in: docIds } },
        select: { id: true, code: true, title: true, party: true, amount: true, docDate: true },
      })
    : []
  const docMap = new Map(docs.map((d) => [d.id, d]))

  return json({
    rep: repSafe,
    events: events.map((e) => {
      const d = docMap.get(e.docId)
      let items: any[] = []
      try {
        const arr = JSON.parse(e.items || '[]')
        if (Array.isArray(arr)) items = arr
      } catch { /* malformed */ }
      return { ...e, items, docCode: d?.code || '', docTitle: d?.title || '', docParty: d?.party || '' }
    }),
    docs: docs.map((d) => ({ ...d })),
  })
}
