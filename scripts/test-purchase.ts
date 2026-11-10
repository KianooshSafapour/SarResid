/* تست مستقیم ثبت سفارش خرید در هلو — با نمایش پاسخ خام */
import { PrismaClient } from '@prisma/client'
import { getHolooConfig, holooLogin, createOrder } from '../src/lib/holoo'

const p = new PrismaClient()

const cfg = await getHolooConfig()
console.log('target:', cfg.useMock ? 'mock' : 'real', '| user:', cfg.username, '| db:', cfg.dbname)
await holooLogin(cfg)
console.log('login ✓')

// یک کالای دارای ErpCode
const product = await p.product.findFirst({ where: { holooErp: { not: null }, active: true }, select: { holooErp: true, name: true } })
console.log('product:', product?.name, '| erp:', product?.holooErp?.slice(0, 12))

// تأمین‌کننده موجود
const supplier = await p.supplier.findFirst({ where: { holooErp: { not: null } }, select: { holooErp: true, name: true } })
console.log('supplier:', supplier?.name, '| erp:', supplier?.holooErp?.slice(0, 12))

await p.$disconnect()

if (!product?.holooErp) { console.log('NO PRODUCT WITH ERP'); process.exit(1) }

// ثبت سفارش خرید type=3 — پاسخ خام
const body = {
  invoiceinfo: [{
    id: '0',
    type: 3,
    ...(supplier?.holooErp ? { customererpcode: supplier.holooErp } : {}),
    date: '2026-11-04',
    time: '14:00',
    detailinfo: [{ id: '0', ProductErpCode: product.holooErp, few: 1, price: 100000 }],
  }],
}

const target = (cfg.useMock ? cfg.mockUrl : cfg.baseUrl).replace(/\/+$/, '')
const res = await fetch(target + '/Invoice/Order', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' }, // token از holooLogin می‌آید — مستقیم fetch می‌کنیم
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(20000),
})
const raw = await res.text()
console.log('\nPOST /Invoice/Order →', res.status)
console.log('RAW:', raw.slice(0, 500))
