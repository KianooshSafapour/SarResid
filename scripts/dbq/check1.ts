import { db } from '@/lib/db'
async function main() {
  const [products, suppliers, links, taskOrders, staffChecks, secReviews, stockCounts, orders, marginItems, returnReq, plans, cheques, dateChecks, users, perfScores, mgrReviews] = await Promise.all([
    db.product.count(), db.supplier.count(), db.supplierProduct.count(),
    db.taskOrder.count(), db.staffCheck.count(), db.sectionReview.count(),
    db.stockCount.count(), db.order.count(), db.marginItem.count(),
    db.returnRequest.count(), db.paymentPlan.count(), db.cheque.count(),
    db.dateCheck.count(), db.user.count(), db.performanceScore.count(), db.managerReview.count(),
  ])
  console.log(JSON.stringify({ products, suppliers, links, taskOrders, staffChecks, secReviews, stockCounts, orders, marginItems, returnReq, plans, cheques, dateChecks, users, perfScores, mgrReviews }, null, 1))
  const withStock = await db.product.count({ where: { stock: { gt: 0 } } })
  const withBuy = await db.product.count({ where: { lastBuyPrice: { gt: 0 } } })
  const withUPC = await db.product.count({ where: { unitsPerCarton: { gt: 0 } } })
  console.log('withStock:', withStock, 'withBuyPrice:', withBuy, 'withUnitsPerCarton:', withUPC)
  const sampleProd = await db.product.findMany({ take: 3, where: { name: { contains: 'بیژن' } }, select: { name: true, stock: true, lastBuyPrice: true, unitsPerCarton: true, defaultOrderQty: true, sellPrice: true } })
  console.log('بیژن products:', sampleProd.length, JSON.stringify(sampleProd.slice(0,3)))
  const anyProd = await db.product.findMany({ take: 3, orderBy: { lastBuyPrice: 'desc' }, select: { name: true, stock: true, lastBuyPrice: true, unitsPerCarton: true } })
  console.log('any products:', JSON.stringify(anyProd))
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
