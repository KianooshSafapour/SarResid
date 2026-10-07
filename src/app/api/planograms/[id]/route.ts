import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  const planogram = await db.planogram.findUnique({ where: { id } })
  if (!planogram) return fail('یافت نشد', 404)
  const data: Record<string, unknown> = {}
  if (Array.isArray(body.layout)) {
    // sanitize به ماتریس دقیق rows×cols — سلول‌ها: null | string | {id, qty} (ضد ماتریس نامنظم)
    const clean: unknown[][] = []
    for (let r = 0; r < planogram.rows; r++) {
      const row: unknown[] = []
      for (let c = 0; c < planogram.cols; c++) {
        const cell = (body.layout as unknown[])[r]?.[c]
        if (typeof cell === 'string' && cell.trim()) row.push(cell)
        else if (cell && typeof cell === 'object' && typeof (cell as { id?: unknown }).id === 'string' && (cell as { id: string }).id)
          row.push({ id: (cell as { id: string }).id, qty: Math.min(99, Math.max(1, Number((cell as { qty?: unknown }).qty) || 1)) })
        else row.push(null)
      }
      clean.push(row)
    }
    data.layout = JSON.stringify(clean)
  }
  if (body.name) data.name = body.name
  if (body.status) {
    if (body.status === 'PUBLISHED' && !['GM', 'PM', 'OM'].includes(me.role))
      return fail('فقط مدیریت می‌تواند منتشر کند', 403)
    data.status = body.status
    if (body.status === 'PUBLISHED') data.publishedById = me.id
  }
  const updated = await db.planogram.update({ where: { id }, data })
  await logActivity(me, body.status === 'PUBLISHED' ? 'انتشار پلانوگرام' : 'ویرایش پلانوگرام', 'planogram', id, updated.name)
  return json({ planogram: { ...updated, layout: JSON.parse(updated.layout) } })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me || !['GM', 'PM', 'OM'].includes(me.role)) return fail('دسترسی غیرمجاز', 403)
  await db.planogram.delete({ where: { id } })
  await logActivity(me, 'حذف پلانوگرام', 'planogram', id)
  return json({ ok: true })
}
