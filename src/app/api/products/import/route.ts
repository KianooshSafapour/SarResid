import { db } from '@/lib/db'
import { getSessionUser, json, logActivity, fail } from '@/lib/api-helpers'

/**
 * Bulk product import (Holoo xls export flow).
 * Body: { items: [{name, barcode?, holooCode?, buyPrice?, sellPrice?, stock?, unit?, brand?, category?}],
 *         mode: 'skip' | 'update' }
 * Duplicate detection happens client-side too, but server double-checks by barcode/name.
 */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { items, mode } = await req.json()
  if (!Array.isArray(items) || items.length === 0) return fail('داده‌ای برای درون‌ریزی نیست')

  const existing = await db.product.findMany({ where: { active: true } })
  const byBarcode = new Map<string, any>()
  const byName = new Map<string, any>()
  for (const p of existing) {
    for (const b of JSON.parse(p.barcodes || '[]')) byBarcode.set(String(b), p)
    byName.set(p.name.trim().toLowerCase(), p)
  }

  let created = 0, updated = 0, skipped = 0
  const log: string[] = []

  for (const it of items as any[]) {
    const name = String(it.name || '').trim()
    if (!name) { skipped++; continue }
    const barcode = String(it.barcode || '').trim()
    const match = (barcode && byBarcode.get(barcode)) || byName.get(name.toLowerCase())
    if (match) {
      if (mode === 'update') {
        const data: Record<string, unknown> = {}
        if (it.sellPrice) data.sellPrice = Number(it.sellPrice)
        if (it.buyPrice) data.buyPrice = Number(it.buyPrice)
        if (it.stock !== undefined && it.stock !== null && it.stock !== '') data.stock = Number(it.stock)
        if (barcode && !(JSON.parse(match.barcodes) as string[]).includes(barcode)) {
          data.barcodes = JSON.stringify([...JSON.parse(match.barcodes), barcode])
        }
        if (Object.keys(data).length) {
          await db.product.update({ where: { id: match.id }, data })
          updated++
          log.push(`به‌روزرسانی: ${name}`)
        } else skipped++
      } else {
        // attach barcode to existing product if new
        if (barcode && !(JSON.parse(match.barcodes) as string[]).includes(barcode)) {
          await db.product.update({
            where: { id: match.id },
            data: { barcodes: JSON.stringify([...JSON.parse(match.barcodes), barcode]) },
          })
          log.push(`بارکد جدید به «${match.name}» افزوده شد`)
          updated++
        } else skipped++
      }
    } else {
      const p = await db.product.create({
        data: {
          name,
          barcodes: JSON.stringify(barcode ? [barcode] : []),
          holooCode: String(it.holooCode || ''),
          unit: String(it.unit || 'عدد'),
          brand: String(it.brand || ''),
          category: String(it.category || 'عمومی'),
          buyPrice: Number(it.buyPrice) || 0,
          sellPrice: Number(it.sellPrice) || 0,
          stock: Number(it.stock) || 0,
          imageUrl: '',
        },
      })
      byName.set(name.toLowerCase(), p)
      if (barcode) byBarcode.set(barcode, p)
      created++
    }
  }

  await logActivity(me, 'درون‌ریزی کالاها از فایل Holoo', 'product', '', `${created} جدید، ${updated} به‌روزرسانی`)
  return json({ created, updated, skipped, log: log.slice(0, 50) })
}
