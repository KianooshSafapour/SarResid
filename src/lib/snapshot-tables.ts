/**
 * R4-7 — Snapshot/Reset system: covered tables + ordering.
 *
 * SNAPSHOT_TABLES lists every table included in a DataSnapshot, in
 * PARENT→CHILD insert order. The reverse order is used for deletes.
 * DB-level FKs (the only @relation constraints in schema.prisma):
 *   OrderItem→Order · ReturnItem→ReturnRequest · MarginItem→MarginInvoice
 *   Zone→Floorplan · StockCountItem→StockCount
 * — all satisfied by this order (parents strictly before children).
 *
 * Deliberately NOT snapshotted (security / size / volatility):
 *   User, UserPermOverride, RealtimeTicket, ActivityLog, Notification,
 *   DataSnapshot (itself), SmsPanel, SmsTemplate, HolooSyncLog.
 */
export const SNAPSHOT_TABLES: readonly string[] = [
  'product',
  'supplier',
  'order',
  'orderItem',
  'cheque',
  'payment',
  'paymentPlan',
  'returnRequest',
  'returnItem',
  'returnPayment',
  'customer',
  'marginInvoice',
  'marginItem',
  'leaveRequest',
  'payrollRecord',
  'salaryProfile',
  'personnel',
  'shiftAssignment',
  'stockCount',
  'stockCountItem',
  'dateCheck',
  'zoneColumn',
  'zoneCount',
  'priceCheck',
  'wasteRecord',
  'taskOrder',
  'staffCheck',
  'sectionReview',
  'performanceScore',
  'managerReview',
  'holiday',
  'setting',
  'wallPost',
  'award',
  'campaign',
  'crmEvent',
  'productImage',
  'supplierProduct',
  'floorplan',
  'floorBlock',
  'planogram',
  'zone',
  'checklistTemplate',
  'checklistState',
  'task',
  'problem',
  'shiftReport',
  'smsOutbox',
]

/** key tables shown as «خلاصه وضعیت فعلی» chips in the data view */
export const SUMMARY_TABLES: readonly string[] = [
  'product',
  'supplier',
  'order',
  'orderItem',
  'cheque',
  'payment',
  'paymentPlan',
  'returnRequest',
  'customer',
  'personnel',
  'task',
  'holiday',
  'setting',
]

export const SNAPSHOT_KINDS = ['MANUAL', 'BASELINE', 'PRE_IMPORT'] as const

/** rows per createMany batch (SQLite parameter limits) */
export const RESTORE_CHUNK = 200
