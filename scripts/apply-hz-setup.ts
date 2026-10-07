import { PrismaClient } from '@prisma/client'

// استقرار فعلی هایپر زیتون = نصب‌شده با لایسنس بنیان‌گذار (میان‌بر مخفی، round-16)
const db = new PrismaClient()

async function main() {
  const today = new Date().toISOString()
  await db.setting.upsert({
    where: { key: 'setup.done' },
    update: { value: '1' },
    create: { key: 'setup.done', value: '1' },
  })
  await db.setting.upsert({
    where: { key: 'setup.profile' },
    update: { value: JSON.stringify({ name: 'هایپر زیتون', city: 'کرمان', kind: 'هایپرمارکت', phone: '', founder: true, completedAt: today }) },
    create: { key: 'setup.profile', value: JSON.stringify({ name: 'هایپر زیتون', city: 'کرمان', kind: 'هایپرمارکت', phone: '', founder: true, completedAt: today }) },
  })
  await db.setting.upsert({
    where: { key: 'license.state' },
    update: { value: JSON.stringify({ tier: 'ENTERPRISE', founder: true, modules: {}, updatedAt: today }) },
    create: { key: 'license.state', value: JSON.stringify({ tier: 'ENTERPRISE', founder: true, modules: {}, updatedAt: today }) },
  })
  // سال حقوقی ۱۴۰۵ + پیش‌فرض‌های قانونی ۱۴۰۵
  await db.setting.upsert({
    where: { key: 'payroll.year' },
    update: { value: '1405' },
    create: { key: 'payroll.year', value: '1405' },
  })
  console.log('OK: hyperzeytoon founder setup applied')
}

main().finally(() => db.$disconnect())
