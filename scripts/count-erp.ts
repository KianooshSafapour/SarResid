/* شمارش کالاهای دارای ErpCode */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const c = await p.product.count({ where: { holooErp: { not: null } } })
console.log('products with ErpCode:', c)
await p.$disconnect()
