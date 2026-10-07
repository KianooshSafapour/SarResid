import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

/** Merge duplicate products: keep primary, move references, deactivate the rest */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { primaryId, duplicateIds } = await req.json()
  if (!primaryId || !Array.isArray(duplicateIds) || duplicateIds.length === 0)
    return fail('کالای اصلی و تکراری‌ها را مشخص کنید')

  const primary = await db.product.findUnique({ where: { id: primaryId } })
  if (!primary) return fail('کالای اصلی یافت نشد', 404)

  const dupes = await db.product.findMany({ where: { id: { in: duplicateIds } } })
  const barcodes = JSON.parse(primary.barcodes || '[]') as string[]
  for (const d of dupes) {
    for (const b of JSON.parse(d.barcodes || '[]') as string[]) {
      if (!barcodes.includes(b)) barcodes.push(b)
    }
  }

  await db.product.update({
    where: { id: primaryId },
    data: {
      barcodes: JSON.stringify(barcodes),
      stock: primary.stock + dupes.reduce((s, d) => s + d.stock, 0),
    },
  })
  await db.product.updateMany({ where: { id: { in: duplicateIds } }, data: { active: false } })
  await logActivity(me, 'ادغام کالاهای تکراری', 'product', primaryId, `${dupes.length} مورد ادغام شد`)
  return json({ ok: true, merged: dupes.length, barcodes })
}
