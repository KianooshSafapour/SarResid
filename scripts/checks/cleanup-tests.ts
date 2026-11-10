import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  // task orders: all 3 are test-created (agent smoke + coordinator flow test)
  const t = await db.taskOrder.deleteMany({})
  // cancelled VIEW-1 order + any draft
  const o = await db.order.deleteMany({ where: { OR: [{ code: 'HZ-ORD-007' }, { status: 'CANCELLED' }] } })
  // payment plans without a real order linkage created during testing
  const pp = await db.paymentPlan.deleteMany({ where: { orderCode: { in: ['HZ-ORD-007', ''] } } })
  // stray plan from concurrent agent (no orderCode)
  const pp2 = await db.paymentPlan.deleteMany({ where: { orderCode: null } })
  // test notifications referencing task orders
  const n = await db.notification.deleteMany({ where: { kind: 'task' } })
  // activity logs from testing
  const a = await db.activityLog.deleteMany({ where: { OR: [{ action: 'taskorder.create' }, { action: { startsWith: 'order_' } }, { action: 'taskorder.' }] } })
  console.log(JSON.stringify({ taskOrders: t.count, orders: o.count, paymentPlans: (pp.count + pp2.count), notifications: n.count, activity: a.count }))
  // final state
  const [tc, oc, pc, nc] = await Promise.all([db.taskOrder.count(), db.order.count(), db.paymentPlan.count(), db.notification.count({ where: { kind: 'task' } })])
  console.log('after:', JSON.stringify({ taskOrders: tc, orders: oc, paymentPlans: pc, taskNotifs: nc }))
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
