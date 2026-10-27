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
 *   حذف می‌شود (تست/Dummy — هر دو منبع: کاربر و ربات‌ها):
 *     بقیهٔ MarginInvoice/Item · سفارش‌ها و اقلام تست · چک‌ها · مرجوعی‌ها
 *     ضایعات · بازرسی‌های ردیف · انبارگردانی‌ها · ارزیابی بخش · اعلان‌ها
 *     گزارش فعالیت · پیامک‌های خروجی · اسنپ‌شات‌ها · لاگ هلو · حضوروغیاب
 *     مرخصی · وظایف · شیفت‌ها · گزارش شیفت · تیکت ریل‌تایم · پیام‌ها
 *     بازخورد · مشکل‌ها · دیوار · کمپین/CRM · PriceCheck · ManagerReview
 *     PerformanceScore · StaffCheck · TaskOrder · DateCheck · ZoneCount
 *     Payment/PaymentPlan (تست) · Customer (تست)
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

  /* شمارش همهٔ گروه‌های حذف */
  const counts: [string, number | Promise<number>][] = [
    ['OrderItem (سفارش‌های تست)', db.orderItem.count({ where: { orderId: { in: p.dropOrderIds } } })],
    ['MarginItem (فاکتورهای تست)', db.marginItem.count({ where: { invoiceId: { in: p.dropMarginIds } } })],
    ['MarginInvoice (فاکتورهای تست)', db.marginInvoice.count({ where: { id: { in: p.dropMarginIds } } })],
    ['Order (تست)', db.order.count({ where: { id: { in: p.dropOrderIds } } })],
    ['ArchiveDocument (متصل به تست)', db.archiveDocument.count({ where: { id: { in: p.dropDocIds } } })],
    ['Cheque', db.cheque.count()],
    ['ReturnRequest', db.returnRequest.count()],
    ['ReturnItem', db.returnItem.count()],
    ['ReturnPayment', db.returnPayment.count()],
    ['Payment', db.payment.count()],
    ['PaymentPlan', db.paymentPlan.count()],
    ['WasteRecord', db.wasteRecord.count()],
    ['LaneCheck', db.laneCheck.count()],
    ['CountSchedule', db.countSchedule.count()],
    ['StockCount', db.stockCount.count()],
    ['StockCountItem', db.stockCountItem.count()],
    ['SectionReview', db.sectionReview.count()],
    ['PriceCheck', db.priceCheck.count()],
    ['ZoneCount', db.zoneCount.count()],
    ['Notification', db.notification.count()],
    ['ActivityLog', db.activityLog.count()],
    ['SmsOutbox', db.smsOutbox.count()],
    ['DataSnapshot', db.dataSnapshot.count()],
    ['HolooSyncLog', db.holooSyncLog.count()],
    ['RealtimeTicket', db.realtimeTicket.count()],
    ['ShiftAssignment', db.shiftAssignment.count()],
    ['ShiftReport', db.shiftReport.count()],
    ['LeaveRequest', db.leaveRequest.count()],
    ['Attendance* (ShiftReport)', db.shiftReport.count()],
    ['PayrollRecord', db.payrollRecord.count()],
    ['Task', db.task.count()],
    ['TaskOrder', db.taskOrder.count()],
    ['StaffCheck', db.staffCheck.count()],
    ['Message', db.message.count()],
    ['Broadcast', db.broadcast.count()],
    ['Feedback', db.feedback.count()],
    ['Problem', db.problem.count()],
    ['WallPost', db.wallPost.count()],
    ['Customer', db.customer.count()],
    ['Campaign', db.campaign.count()],
    ['CrmEvent', db.crmEvent.count()],
    ['ManagerReview', db.managerReview.count()],
    ['PerformanceScore', db.performanceScore.count()],
    ['ChecklistState', db.checklistState.count()],
    ['DateCheck', db.dateCheck.count()],
    ['UserPermOverride', db.userPermOverride.count()],
  ]
  console.log('\n── اقلام حذفی ──')
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
    ['Cheque', db.cheque.deleteMany({})],
    ['ReturnItem', db.returnItem.deleteMany({})],
    ['ReturnPayment', db.returnPayment.deleteMany({})],
    ['ReturnRequest', db.returnRequest.deleteMany({})],
    ['Payment', db.payment.deleteMany({})],
    ['PaymentPlan', db.paymentPlan.deleteMany({})],
    ['WasteRecord', db.wasteRecord.deleteMany({})],
    ['LaneCheck', db.laneCheck.deleteMany({})],
    ['CountSchedule', db.countSchedule.deleteMany({})],
    ['StockCountItem', db.stockCountItem.deleteMany({})],
    ['StockCount', db.stockCount.deleteMany({})],
    ['SectionReview', db.sectionReview.deleteMany({})],
    ['PriceCheck', db.priceCheck.deleteMany({})],
    ['ZoneCount', db.zoneCount.deleteMany({})],
    ['Notification', db.notification.deleteMany({})],
    ['ActivityLog', db.activityLog.deleteMany({})],
    ['SmsOutbox', db.smsOutbox.deleteMany({})],
    ['DataSnapshot', db.dataSnapshot.deleteMany({})],
    ['HolooSyncLog', db.holooSyncLog.deleteMany({})],
    ['RealtimeTicket', db.realtimeTicket.deleteMany({})],
    ['ShiftAssignment', db.shiftAssignment.deleteMany({})],
    ['ShiftReport', db.shiftReport.deleteMany({})],
    ['LeaveRequest', db.leaveRequest.deleteMany({})],
    ['PayrollRecord', db.payrollRecord.deleteMany({})],
    ['Task', db.task.deleteMany({})],
    ['TaskOrder', db.taskOrder.deleteMany({})],
    ['StaffCheck', db.staffCheck.deleteMany({})],
    ['Message', db.message.deleteMany({})],
    ['Broadcast', db.broadcast.deleteMany({})],
    ['Feedback', db.feedback.deleteMany({})],
    ['Problem', db.problem.deleteMany({})],
    ['WallPost', db.wallPost.deleteMany({})],
    ['CrmEvent', db.crmEvent.deleteMany({})],
    ['Campaign', db.campaign.deleteMany({})],
    ['Customer', db.customer.deleteMany({})],
    ['ManagerReview', db.managerReview.deleteMany({})],
    ['PerformanceScore', db.performanceScore.deleteMany({})],
    ['ChecklistState', db.checklistState.deleteMany({})],
    ['DateCheck', db.dateCheck.deleteMany({})],
    ['UserPermOverride', db.userPermOverride.deleteMany({})],
  ]
  for (const [label, op] of ops) {
    const r = await op as { count: number }
    if (r.count > 0) console.log(`   ✓ ${label}: ${r.count} حذف شد`)
  }

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
