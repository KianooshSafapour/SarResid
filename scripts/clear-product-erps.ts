/* پاک کردن ErpCode محصولات + sync دوباره از Holoo4 */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const products = await p.product.count({ where: { holooErp: { not: null } } })
console.log(`products with holooErp: ${products}`)
await p.product.updateMany({ data: { holooErp: null } })
console.log('all product holooErp cleared ✓')
await p.$disconnect()
