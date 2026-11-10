/**
 * R22 — Holoo Retry Worker (فاکتور خرید، نه سفارش)
 * Cron: هر ۲ دقیقه. فاکتورهای سودسنج که holooInvoiceNo=null دارند را دوباره به هلو می‌فرستد.
 * idempotent: holooInvoiceNo بعد از موفقیت ست می‌شود → تکرار نمی‌شود.
 */
import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()
const BATCH_SIZE = 3

async function main() {
  // فاکتورهای سودسنج final/reviewing که holooInvoiceNo ندارند (یعنی قبلاً به هلو نرفته‌اند)
  const pending = await p.marginInvoice.findMany({
    where: {
      holooInvoiceNo: null,
      status: { in: ['final', 'reviewing'] },
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
  })

  if (!pending.length) {
    console.log('no pending purchase invoices')
    await p.$disconnect()
    return
  }

  console.log(`processing ${pending.length} pending purchase invoices…`)

  for (const inv of pending) {
    try {
      const result = await pushInvoice(inv.id)
      console.log(`  #${inv.number}: ${result.pushed ? `✓ invoice=${result.invoiceNo} sanad=${result.sanadNo}` : `✗ ${result.reason}`}`)
    } catch (e) {
      console.log(`  #${inv.number}: ERROR ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  await p.$disconnect()
}

async function pushInvoice(marginInvoiceId: string) {
  const { getHolooConfig, holooLogin, createInvoice, assertHolooWrite, dateToGregorian, dateToHm, createCustomer } = await import('../src/lib/holoo')
  const cfg = await getHolooConfig()
  if (!cfg.enabled) return { pushed: false, reason: 'holo disabled' }

  try { await holooLogin(cfg) } catch (e) {
    return { pushed: false, reason: `connection: ${e instanceof Error ? e.message : String(e)}` }
  }

  const inv = await p.marginInvoice.findUnique({ where: { id: marginInvoiceId }, include: { items: true } })
  if (!inv) return { pushed: false, reason: 'not found' }
  if (inv.holooInvoiceNo) return { pushed: true, invoiceNo: inv.holooInvoiceNo, sanadNo: inv.holooReceiptNo || '' }

  // تأمین‌کننده
  let customerErp: string | undefined
  if (inv.supplierId) {
    const supplier = await p.supplier.findUnique({ where: { id: inv.supplierId } })
    if (supplier?.holooErp) customerErp = supplier.holooErp
    else if (supplier) {
      try {
              const res = await createCustomer(cfg, { name: supplier.name, ispurchaser: false, isseller: true, custtype: 0 })
        customerErp = assertHolooWrite(res, 'تأمین‌کننده').ErpCode || ''
        await p.supplier.update({ where: { id: supplier.id }, data: { holooErp: customerErp } })
      } catch (e) {
        return { pushed: false, reason: `supplier: ${e instanceof Error ? e.message : String(e)}` }
      }
    }
  }

  // اقلام
  const products = await p.product.findMany({
    where: { id: { in: inv.items.filter((i) => i.productId && i.accepted !== false).map((i) => i.productId!) } },
    select: { id: true, holooErp: true },
  })
  const erpById = new Map(products.map((p) => [p.id, p.holooErp]))
  const details = []
  let skipped = 0
  for (const item of inv.items) {
    if (item.accepted === false) continue
    const erp = item.productId ? erpById.get(item.productId) : null
    if (!erp) { skipped++; continue }
    details.push({ id: '0', ProductErpCode: erp, few: item.quantity || 1, price: Math.round(item.unitCost || 0) || 0 })
  }
  if (!details.length) return { pushed: false, reason: 'no items with ErpCode' }

  const cashSarfaslRow = await p.setting.findUnique({ where: { key: 'holoo:cashSarfasl' } })
  const cashSarfasl = (cashSarfaslRow?.value || '10100010001').replace(/^"|"$/g, '')
  const itemsTotal = details.reduce((s, d) => s + (d.few || 0) * (d.price || 0), 0)

  try {
    let res = await createInvoice(cfg, {
      type: 3,
      customererpcode: customerErp || '',
      date: dateToGregorian(new Date()),
      time: dateToHm(new Date()),
      cash: Math.round(itemsTotal),
      cashsarfasl: cashSarfasl,
      details,
    })
    // اگر طرف حساب فروشنده نیست (۴۷) — فروشندهٔ جدید بساز و retry
    if (res?.ErrorCode === 47 && inv.supplierId) {
      const supplier = await p.supplier.findUnique({ where: { id: inv.supplierId } })
      if (supplier) {
        const newRes = await createCustomer(cfg, { name: supplier.name, ispurchaser: false, isseller: true, custtype: 0 })
        const newErp = assertHolooWrite(newRes, 'فروشندهٔ جدید').ErpCode || ''
        await p.supplier.update({ where: { id: supplier.id }, data: { holooErp: newErp } })
        customerErp = newErp
        res = await createInvoice(cfg, {
          type: 3,
          customererpcode: newErp,
          date: dateToGregorian(new Date()),
          time: dateToHm(new Date()),
          cash: Math.round(itemsTotal),
          cashsarfasl: cashSarfasl,
          details,
        })
      }
    }
    const succ = assertHolooWrite(res, 'فاکتور خرید')
    const invoiceNo = succ.ReturnParam1 || succ.Code || ''
    const sanadNo = succ.ReturnParam2 || succ.SanadCode || ''

    await p.marginInvoice.update({
      where: { id: marginInvoiceId },
      data: { holooInvoiceNo: invoiceNo, holooReceiptNo: sanadNo },
    })
    await p.holooSyncLog.create({
      data: { kind: 'RETRY_PURCHASE_INVOICE', status: 'OK', statsJson: JSON.stringify({ invoiceNumber: inv.number, holooInvoiceNo: invoiceNo, sanadNo }) },
    }).catch(() => {})

    return { pushed: true, invoiceNo, sanadNo }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await p.holooSyncLog.create({
      data: { kind: 'RETRY_PURCHASE_INVOICE', status: 'FAIL', statsJson: JSON.stringify({ invoiceNumber: inv.number }), error: msg },
    }).catch(() => {})
    return { pushed: false, reason: msg }
  }
}

main().catch(console.error)
