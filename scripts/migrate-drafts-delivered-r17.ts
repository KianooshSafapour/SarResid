/**
 * scripts/migrate-drafts-delivered-r17.ts — R17 MIGRATION (idempotent)
 * ---------------------------------------------------------------------------
 * R17: ثبت در سودسنج = کالا تحویل‌شده — گام «تأیید تحویل کالا» حذف شد.
 * این اسکریپت پیش‌نویس‌های باقی‌مانده (وضعیت draft) را «تحویل‌شده» می‌کند:
 *   deliveredAt/By = ثبت‌کنندهٔ اصلی (از رویداد create در تاریخچه)،
 *   + رویداد deliver در تاریخچه («سند قدیمی — ثبت سودسنج = تحویل‌شده»).
 * فاکتورهای reviewing/final/archived/cancelled دست نمی‌خورند.
 *
 * Run:  bun scripts/migrate-drafts-delivered-r17.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

type HistoryEvent = { at: string; by: string; action: string; detail?: string }

async function main() {
  const drafts = await db.marginInvoice.findMany({ where: { status: 'draft' } })
  console.log(`[r17-migrate] draft invoices found: ${drafts.length}`)
  let migrated = 0
  for (const inv of drafts) {
    let history: HistoryEvent[] = []
    try {
      history = JSON.parse(inv.historyJson || '[]')
    } catch {
      history = []
    }
    const creator = history.find((h) => h.action === 'create')?.by || 'سامانه'
    history.push({
      at: new Date().toISOString(),
      by: creator,
      action: 'deliver',
      detail: 'سند قدیمی — ثبت سودسنج = تحویل‌شده (مهاجرت R17)',
    })
    await db.marginInvoice.update({
      where: { id: inv.id },
      data: {
        status: 'delivered',
        deliveredAt: inv.deliveredAt ?? inv.createdAt,
        deliveredById: inv.deliveredById,
        deliveredByName: inv.deliveredByName ?? creator,
        historyJson: JSON.stringify(history.slice(-80)),
      },
    })
    migrated++
    console.log(`   #${inv.number} (${inv.supplierName ?? '—'}) → delivered`)
  }
  console.log(`[r17-migrate] migrated: ${migrated}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
