/**
 * scripts/reset-test-data-r13.ts — R13 پاک‌سازی کامل داده‌های آزمایشی
 * ---------------------------------------------------------------------------
 * «بازنشانی دیتابیس بدون Dummy» — نگه‌داشتن دادهٔ واقعی، حذف همهٔ تست‌ها:
 *
 *   نگه‌داشته می‌شود (دادهٔ واقعی):
 *     Product (+ProductImage) · User · Supplier · SupplierProduct · Unit
 *     Floorplan/ZoneColumn/FloorBlock · Zone · Planogram · ArchiveCabinet/Shelf/Binder
 *     Setting (پیکربندی) · Holiday · TradeRecord (دادهٔ واقعی هلو)
 *     KbArticle/Sop/ChecklistTemplate/ReturnMsgTemplate/SmsPanel/SmsTemplate
 *     Personnel/StaffDocument/SalaryProfile (پرسنل واقعی) · SalesRep
 *     فاکتورهای سودسنجِ واقعی (#۴ بانی چاو و #۵ گلپخش + هر فاکتورِ واقعیِ
 *     بعد از ۱۴۰۵/۰۸/۴ که تأمین‌کنندهٔ تستی ندارد) و اسناد خرید متصل به همان‌ها
 *     + ArchiveDocumentهای متصل به فاکتورهای نگه‌داشته‌شده
 *
 *   حذف می‌شود (فقط اثر آزمایشی قابل‌اثبات — سیاست R17):
 *     فاکتورهای سودسنجِ تست + اقلام و اسناد خرید همان‌ها + آرشیوِ متصل به آنها
 *     چک‌های AUTO متصل به اسناد حذف‌شده (یا AUTOهای یتیم) — چک‌های واقعی می‌مانند
 *     درخواست‌های کارکنانِ ثبت‌شده توسط بات‌ها (عنوان شامل «بات»)
 *     کلیدهای KV تور (بازدید دوبارهٔ تورها) + تیکت ریل‌تایمِ منقضی
 *
 *   R17: دادهٔ واقعیِ روزمرهٔ کارکنان دیگر هرگز پاک نمی‌شود — برنامهٔ شیفت،
 *     مرخصی، حضوروغیاب، حقوق، مرجوعی، ضایعات، انبارگردانی، ارزیابی چیدمان،
 *     کنترل انقضا، مشکل‌ها/پیام‌ها/دیوار، CRM/مشتریان، گزارش فعالیت (ردپا)،
 *     اعلان‌ها، پیامک‌ها، اسنپ‌شات‌ها و لاگ هلو همه حفظ می‌شوند
 *
 * اجرا:  bun scripts/reset-test-data-r13.ts           → فقط گزارش (DRY RUN)
 *        APPLY=1 bun scripts/reset-test-data-r13.ts   → اعمال واقعی
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const APPLY = process.env.APPLY === '1'

/** فاکتورهای سودسنجِ واقعی — #۴ «بانی چاو» و #۵ «گلپخش» + واقعی‌های تازه */
const KEEP_MARGIN_NUMBERS = [4, 5]
/** آستانهٔ «فعالیت واقعی پس از استقرار R12» — ۲۰۲۶-۱۰-۲۶ (۴ آبان) به بعد */
const REAL_SINCE = new Date('2026-10-26T00:00:00Z')
const TEST_NAME_HINTS = ['تست', 'تستی', 'آزمایش', 'دفاعی؟', 'dummy', 'test']

function isTestName(name: string | null | undefined): boolean {
  const n = String(name ?? '').trim()
  if (!n) return false
  return TEST_NAME_HINTS.some((h) => n.includes(h))
}

async function plan() {
  /* ── فاکتورهای سودسنج: واقعی‌ها را نگه می‌داریم ── */
  const margins = await db.marginInvoice.findMany({
    include: { items: true },
    orderBy: { number: 'asc' },
  })
  const keepMarginIds = new Set<string>()
  for (const m of margins) {
    const real =
      (KEEP_MARGIN_NUMBERS.includes(m.number) && !isTestName(m.supplierName)) ||
      (m.createdAt >= REAL_SINCE && !isTestName(m.supplierName) && m.items.length > 0)
    if (real) keepMarginIds.add(m.id)
  }
  const dropMarginIds = margins.filter((m) => !keepMarginIds.has(m.id)).map((m) => m.id)

  /* ── سفارش‌ها: سند خریدِ فاکتورهای نگه‌داشته‌شده واقعی است؛ بقیه تست ── */
  const orders = await db.order.findMany({ select: { id: true, code: true, supplierName: true, notes: true, totalAmount: true, createdAt: true } })
  const keepOrderIds = new Set<string>()
  for (const o of orders) {
    let marginNo: number | null = null
    try {
      const ex = JSON.parse(o.notes || '{}') as { marginInvoiceNumber?: number }
      marginNo = ex.marginInvoiceNumber ?? null
    } catch {
      marginNo = null
    }
    const real =
      (marginNo != null && KEEP_MARGIN_NUMBERS.includes(marginNo) && !isTestName(o.supplierName)) ||
      (o.createdAt >= REAL_SINCE && !isTestName(o.supplierName) && (o.totalAmount ?? 0) > 0)
    if (real) keepOrderIds.add(o.id)
  }
  const dropOrderIds = orders.filter((o) => !keepOrderIds.has(o.id)).map((o) => o.id)

  /* ── اسناد آرشیو: فقط متصل به فاکتور/سفارشِ واقعی می‌ماند ── */
  const docs = await db.archiveDocument.findMany({ select: { id: true, orderId: true, title: true } })
  const keepDocIds = new Set<string>()
  for (const d of docs) {
    if (d.orderId && keepOrderIds.has(d.orderId)) keepDocIds.add(d.id)
    else if (d.orderId) continue
    /* اسناد بدون سفارش: اگر فاکتور هلو/عنوانشان واقعی است (در آرشیو کاغذی ثبت شده‌اند) نگه می‌داریم */
    else keepDocIds.add(d.id)
  }
  const dropDocIds = docs.filter((d) => !keepDocIds.has(d.id)).map((d) => d.id)

  return { margins, keepMarginIds, dropMarginIds, orders, keepOrderIds, dropOrderIds, dropDocIds }
}

async function main() {
  const p = await plan()

  console.log('════ گزارش بازنشانی (DRY RUN — بدون تغییر) ════')
  console.log(`فاکتورهای سودسنج: کل=${p.margins.length} | نگه=${p.keepMarginIds.size} | حذف=${p.dropMarginIds.length}`)
  for (const m of p.margins) {
    console.log(`   #${m.number} ${m.supplierName ?? '—'} (${m.status}) ${m.createdAt.toISOString().slice(0, 10)} → ${p.keepMarginIds.has(m.id) ? 'نگه' : 'حذف'}`)
  }
  console.log(`سفارش‌ها: کل=${p.orders.length} | نگه=${p.keepOrderIds.size} | حذف=${p.dropOrderIds.length}`)
  for (const o of p.orders) {
    console.log(`   ${o.code} ${o.supplierName ?? '—'} ${o.createdAt.toISOString().slice(0, 10)} → ${p.keepOrderIds.has(o.id) ? 'نگه' : 'حذف'}`)
  }
  console.log(`اسناد آرشیو متصل به سفارشِ تست: حذف=${p.dropDocIds.length}`)

  /* شمارش اثر آزمایشی قابل‌اثبات (سیاست R17 — فقط همین‌ها حذف می‌شوند) */
  const counts: [string, number | Promise<number>][] = [
    ['OrderItem (سفارش‌های تست)', db.orderItem.count({ where: { orderId: { in: p.dropOrderIds } } })],
    ['MarginItem (فاکتورهای تست)', db.marginItem.count({ where: { invoiceId: { in: p.dropMarginIds } } })],
    ['MarginInvoice (فاکتورهای تست)', db.marginInvoice.count({ where: { id: { in: p.dropMarginIds } } })],
    ['Order (تست)', db.order.count({ where: { id: { in: p.dropOrderIds } } })],
    ['ArchiveDocument (متصل به تست)', db.archiveDocument.count({ where: { id: { in: p.dropDocIds } } })],
    ['Cheque (AUTO متصل به تست/یتیم)', db.cheque.count({
      where: { OR: [
        { orderId: { in: p.dropOrderIds } },
        { AND: [{ number: { startsWith: 'AUTO-' } }, { orderId: null }] },
      ] },
    })],
    ['StaffRequest (بات)', db.staffRequest.count({ where: { title: { contains: 'بات' } } })],
    ['RealtimeTicket (منقضی)', db.realtimeTicket.count({ where: { expiresAt: { lt: new Date() } } })],
  ]
  let total = 0
  for (const [label, cnt] of counts) {
    const n = await cnt
    total += n
    if (n > 0) console.log(`   ${label}: ${n}`)
  }
  console.log(`\nجمع ردیف‌های حذف‌شدنی: ${total}`)

  /* داده‌های امن نگه‌داشته‌شده — راستی‌آزمایی */
  const keepCounts = {
    products: await db.product.count(),
    users: await db.user.count(),
    suppliers: await db.supplier.count(),
    trades: await db.tradeRecord.count(),
    floorplans: await db.floorplan.count(),
    binders: await db.archiveBinder.count(),
    personnel: await db.personnel.count(),
  }
  console.log('\n── نگه‌داشته می‌شود ──')
  console.log('  ', JSON.stringify(keepCounts))

  if (!APPLY) {
    console.log('\nDRY RUN — برای اعمال: APPLY=1 bun scripts/reset-test-data-r13.ts')
    return
  }

  console.log('\n════ اعمال حذف‌ها ════')
  /* ترتیب: فرزندان قبل از والد‌ها */
  const ops: [string, unknown][] = [
    ['OrderItem', db.orderItem.deleteMany({ where: { orderId: { in: p.dropOrderIds } } })],
    ['MarginItem', db.marginItem.deleteMany({ where: { invoiceId: { in: p.dropMarginIds } } })],
    ['ArchiveDocument', db.archiveDocument.deleteMany({ where: { id: { in: p.dropDocIds } } })],
    ['Cheque.orderId unlink', db.cheque.updateMany({ where: { orderId: { in: p.dropOrderIds } }, data: { orderId: null } })],
    ['WasteRecord.orderId unlink', db.wasteRecord.updateMany({ where: { orderId: { in: p.dropOrderIds } }, data: { orderId: null, orderCode: null } })],
    ['MarginInvoice', db.marginInvoice.deleteMany({ where: { id: { in: p.dropMarginIds } } })],
    ['Order', db.order.deleteMany({ where: { id: { in: p.dropOrderIds } } })],
    /* R17: چک‌ها — فقط AUTOهای متصل به اسناد حذف‌شده یا AUTOهای یتیم؛ چک واقعی هرگز */
    ['Cheque (AUTO تست)', db.cheque.deleteMany({
      where: { OR: [
        { orderId: { in: p.dropOrderIds } },
        { AND: [{ number: { startsWith: 'AUTO-' } }, { orderId: null }] },
      ] },
    })],
    /* R17: درخواست‌های کارکنانِ بات‌ها (عنوان شامل «بات») */
    ['StaffRequest (بات)', db.staffRequest.deleteMany({ where: { title: { contains: 'بات' } } })],
    /* R17: تیکت ریل‌تایمِ منقضی — فنی و بی‌اثر، پاک‌سازی امن */
    ['RealtimeTicket (منقضی)', db.realtimeTicket.deleteMany({ where: { expiresAt: { lt: new Date() } } })],
  ]
  for (const [label, op] of ops) {
    const r = await op as { count: number }
    if (r.count > 0) console.log(`   ✓ ${label}: ${r.count} حذف شد`)
  }

  /* R17: نگاشت زون‌بندِ خودکار (archive.autoBind) پیکربندیِ واقعی است — حفظ می‌شود */

  /* کلیدهای تورِ KV هم دادهٔ تست‌اند */
  const tourKeys = await db.setting.findMany({ where: { key: { startsWith: 'tour:' } } })
  if (tourKeys.length) {
    await db.setting.deleteMany({ where: { key: { startsWith: 'tour:' } } })
    console.log(`   ✓ tour KV keys: ${tourKeys.length}`)
  }

  /* شمارهٔ فاکتور بعدی را بعد از بزرگ‌ترین شمارهٔ نگه‌داشته تنظیم نمی‌کنیم —
     Prisma number به‌صورت max+1 در POST محاسبه می‌شود (route.ts) — فقط گزارش: */
  const remaining = await db.marginInvoice.findMany({ select: { number: true }, orderBy: { number: 'desc' }, take: 1 })
  console.log(`\n════ انجام شد — فاکتورهای باقی: ${await db.marginInvoice.count()} (بزرگ‌ترین شماره: ${remaining[0]?.number ?? '—'}) ════`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
