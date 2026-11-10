/* پاک کردن ErpCodeهای stale تأمین‌کنندگان (بعد از import مجدد Holoo4) */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// همهٔ تأمین‌کنندگان را ببین
const suppliers = await p.supplier.findMany({ select: { id: true, name: true, holooErp: true } })
const withErp = suppliers.filter((s) => s.holooErp)
console.log(`suppliers: ${suppliers.length} total, ${withErp.length} have holooErp`)

// همه را null کن — retry worker فروشندهٔ جدید می‌سازد
await p.supplier.updateMany({ data: { holooErp: null } })
console.log('all supplier holooErp cleared ✓')

await p.$disconnect()
