import { db } from '@/lib/db'
import { getSessionUser, json, logActivity, fail } from '@/lib/api-helpers'
import { todayIso } from '@/lib/jalali'

/**
 * تطبیق قیمت قفسه با هلو (Holoo price acknowledgment)
 * پس از اینکه حسابدار «قیمت‌های جدید» را در هلو ثبت کرد، فایل خروجی هلو را این‌جا می‌آورد؛
 * سامانه کالاها را با بارکد/کد هلو/نام تطبیق می‌دهد و قیمت رسمی هلو را روی قیمت چاپ‌شده می‌نشاند
 * و همان روز «کنترل شده» ثبت می‌شود — حلقه قفسه ↔ حسابداری ↔ هلو بسته می‌شود.
 *
 * Body: { items: [{ name?, barcode?, holooCode?, sellPrice? }] }
 * Returns: { updated, samePrice, unmatched, log[] }
 */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!['ACC', 'GM', 'OWNER', 'OM'].includes(me.role)) return fail('تطبیق قیمت هلو فقط برای حسابداری و مدیریت است', 403)

  const { items } = await req.json()
  if (!Array.isArray(items) || items.length === 0) return fail('داده‌ای برای تطبیق نیست')

  const products = await db.product.findMany({ where: { active: true } })
  const byBarcode = new Map<string, any>()
  const byHoloo = new Map<string, any>()
  const byName = new Map<string, any>()
  for (const p of products) {
    for (const b of JSON.parse(p.barcodes || '[]')) byBarcode.set(String(b), p)
    if (p.holooCode) byHoloo.set(String(p.holooCode).trim(), p)
    byName.set(p.name.trim().toLowerCase(), p)
  }

  const today = todayIso()
  let updated = 0, samePrice = 0, unmatched = 0
  const log: string[] = []

  for (const it of items as any[]) {
    const sellPrice = Number(it.sellPrice) || 0
    if (sellPrice <= 0) continue // سطر بدون قیمت رسمی هلو بی‌معنی است
    const barcode = String(it.barcode || '').trim()
    const holooCode = String(it.holooCode || '').trim()
    const name = String(it.name || '').trim()
    const match = (barcode && byBarcode.get(barcode)) || (holooCode && byHoloo.get(holooCode)) || (name && byName.get(name.toLowerCase()))
    if (!match) { unmatched++; log.push(`تطبیق نشد: ${name || barcode || holooCode}`); continue }

    if (match.sellPrice === sellPrice) {
      // قیمت یکی است — فقط کنترل امروز ثبت می‌شود (تأیید بدون تغییر)
      if (match.lastPriceCheck !== today) {
        await db.product.update({ where: { id: match.id }, data: { lastPriceCheck: today, lastCheckedPrice: sellPrice } })
      }
      samePrice++
      continue
    }

    await db.product.update({
      where: { id: match.id },
      data: { sellPrice, lastPriceCheck: today, lastCheckedPrice: sellPrice },
    })
    updated++
    log.push(`${match.name}: ${match.sellPrice.toLocaleString('en-US')} ← ${sellPrice.toLocaleString('en-US')} تومان`)
    await logActivity(me, 'قیمت از هلو تأیید شد', 'product', match.id, `${match.name} — قیمت رسمی ${sellPrice.toLocaleString('en-US')} تومان`)
  }

  await logActivity(me, 'تطبیق قیمت قفسه با هلو', 'product', '', `${updated} قیمت به‌روز شد، ${samePrice} تأیید بدون تغییر، ${unmatched} تطبیق‌نشده`)
  return json({ updated, samePrice, unmatched, log: log.slice(0, 80) })
}
