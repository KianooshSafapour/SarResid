/* پاک‌سازی وضعیت تست فروشگاه — فقط dev: سفارش‌های در-جریانِ جاماندهٔ اجراهای قبلی بات را لغو می‌کند
   (رزروشان همیشه روی موجودی می‌ماند و اجراهای بعدی را می‌شکند) + رسانه‌های تست محصول آزمون. */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  const cutoff = new Date(Date.now() - 25 * 60_000)
  const staleOrders = await p.shopOrder.findMany({
    where: { status: { in: ['AWAITING_PAYMENT', 'PAID', 'COD', 'PICKING', 'DELIVERING'] }, createdAt: { lt: cutoff } },
    select: { id: true },
  })
  if (staleOrders.length) {
    await p.shopOrder.updateMany({
      where: { id: { in: staleOrders.map((o) => o.id) } },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'پاک‌سازی تست (بات اجرای بعدی)' },
    })
  }
  const staleBaskets = await p.shopBasket.deleteMany({ where: { updatedAt: { lt: cutoff } } })
  const testMedia = await p.shopProductMedia.deleteMany({
    where: { OR: [{ url: { contains: 'example.com/r19' } }, { url: { contains: 'picsum.photos/seed/hz' } }] },
  })
  console.log(`cleanup: ${staleOrders.length} سفارش جامانده لغو شد، ${staleBaskets.count} سبد کهنه حذف، ${testMedia.count} رسانهٔ تست حذف`)
  await p.$disconnect()
}
main()
