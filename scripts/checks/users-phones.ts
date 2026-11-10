import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const users = await db.user.findMany({ where: { active: true }, select: { username: true, fullName: true, role: true, phone: true } })
  console.log('phones:', JSON.stringify(users.filter(u => u.phone).map(u => ({ u: u.username, n: u.fullName, r: u.role, p: u.phone }))))
  const sample = await db.product.findFirst({ select: { name: true, defaultOrderQty: true, defaultCartonQty: true, unitsPerCarton: true, lowStockThreshold: true, reorderLevel: true, stock: true } })
  console.log('sample product:', JSON.stringify(sample))
  const orders = await db.order.findMany({ select: { code: true, supplierName: true, payMethod: true, totalAmount: true, items: { select: { name: true, productId: true, qty: true, unitBuyPrice: true } } }, take: 3 })
  console.log('orders:', JSON.stringify(orders))
  const margins = await db.marginInvoice.findMany({ select: { supplierId: true, supplierName: true, items: { select: { productId: true, productName: true, unitCost: true } } }, take: 3 })
  console.log('margins:', JSON.stringify(margins))
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
