/**
 * scripts/seed-sms-defaults.ts — R4-5 (مرکز پیامک)
 * Idempotent seed:
 *   • 9 provider cards as INACTIVE mock panels (one per Iranian provider + custom),
 *     pre-filled with empty credentials, mode=mock, active=false, isDefault=false.
 *   • 4 default templates (upsert by key): PAYMENT_SUBMITTED / RETURN_PAYMENT /
 *     STAFF_BROADCAST / LOW_STOCK.
 * Usage: bunx tsx scripts/seed-sms-defaults.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

export const SMS_PANEL_PROVIDERS = [
  'melipayamak',
  'farazsms',
  'payamresan',
  'webone',
  'niksms',
  'payamito',
  'smsir',
  'farapayamak',
  'custom',
] as const

/** Display names for provider badges (used by seed titles). */
export const PROVIDER_TITLES: Record<string, string> = {
  melipayamak: 'ملی‌پیامک',
  farazsms: 'فراز اس‌ام‌اس (IPPanel)',
  payamresan: 'پیام‌رسان',
  webone: 'وب‌وان',
  niksms: 'نیک‌پیامک',
  payamito: 'پیامیتو',
  smsir: 'پیامک رسا (SMS.ir)',
  farapayamak: 'فراپیامک',
  custom: 'پنل سفارشی',
}

const DEFAULT_TEMPLATES: Array<{ key: string; title: string; body: string }> = [
  {
    key: 'PAYMENT_SUBMITTED',
    title: 'ثبت پرداخت (اطلاع‌رسانی مالی)',
    body: '{by} پرداخت {amount} ریالی ({method}) را برای {code} ثبت کرد. — هایپر زیتون',
  },
  {
    key: 'RETURN_PAYMENT',
    title: 'پرداخت مرجوعی',
    body: 'پرداخت مرجوعی {code} به مبلغ {amount} ریال ثبت شد. — هایپر زیتون',
  },
  {
    key: 'STAFF_BROADCAST',
    title: 'اطلاع‌رسانی همگانی کارکنان',
    body: '{name} عزیز، {text} — مدیریت هایپر زیتون',
  },
  {
    key: 'LOW_STOCK',
    title: 'هشدار اتمام موجودی',
    body: 'هایپر زیتون: کالای «{name}» به حد سفارش مجدد رسید (موجودی: {stock}). لطفاً سفارش ثبت شود.',
  },
]

async function main() {
  // ---- panels: one INACTIVE mock card per provider (upsert by name) ----
  let panels = 0
  for (const provider of SMS_PANEL_PROVIDERS) {
    const name = `پنل ${PROVIDER_TITLES[provider]}`
    const existing = await db.smsPanel.findFirst({ where: { name } })
    if (existing) continue // idempotent — never overwrite user-edited panels
    await db.smsPanel.create({
      data: {
        name,
        provider,
        mode: 'mock',
        settingsJson: '{}',
        active: false,
        isDefault: false,
        note: 'کارت آماده — اطلاعات پنل را وارد و فعال کنید',
      },
    })
    panels++
  }

  // ---- templates: upsert by key ----
  let templates = 0
  for (const t of DEFAULT_TEMPLATES) {
    await db.smsTemplate.upsert({
      where: { key: t.key },
      create: t,
      update: {}, // idempotent — keep user edits
    })
    templates++
  }

  const [panelCount, templateCount] = await Promise.all([db.smsPanel.count(), db.smsTemplate.count()])
  console.log(`✓ seed-sms-defaults: +${panels} panels (total ${panelCount}), ${templates} templates ensured (total ${templateCount})`)
}

main()
  .catch((e) => {
    console.error('✗ seed failed:', e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
