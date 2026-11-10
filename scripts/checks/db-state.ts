import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const [users, products, suppliers] = await Promise.all([
    db.user.count(), db.product.count(), db.supplier.count(),
  ])
  const [orders, returns, cheques] = await Promise.all([
    db.order.count(), db.returnRequest.count(), db.cheque.count(),
  ])
  const floorplans = await db.floorplan.findMany({ select: { name: true } })
  const [planograms, zones, tasks] = await Promise.all([
    db.planogram.count(), db.zone.count(), db.task.count(),
  ])
  const [taskOrders, staffChecks, sectionReviews, perfScores, managerReviews, stockCounts, holidays, supplierProducts, paymentPlans] = await Promise.all([
    db.taskOrder.count(), db.staffCheck.count(), db.sectionReview.count(),
    db.performanceScore.count(), db.managerReview.count(), db.stockCount.count(),
    db.holiday.count(), db.supplierProduct.count(), db.paymentPlan.count(),
  ])
  console.log(JSON.stringify({ users, products, suppliers, orders, returns, cheques, planograms, zones, tasks, taskOrders, staffChecks, sectionReviews, perfScores, managerReviews, stockCounts, holidays, supplierProducts, paymentPlans, floorplans: floorplans.map(f => f.name) }, null, 2))
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
