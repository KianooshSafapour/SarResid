/**
 * scripts/seed-archive.ts — ساختار اولیهٔ آرشیو اسناد (R7)
 * ------------------------------------------------------------------
 * فقط وقتی هیچ کابینتی وجود ندارد اجرا می‌شود (idempotent):
 *   • ۲ کابینت: «کابینت حسابداری ۱» (دفتر حسابداری) + «کابینت بایگانی انبار» (انبار)
 *   • قفسه‌ها: ۳ قفسه در کابینت حسابداری، ۲ قفسه در کابینت انبار
 *   • ۶ زون‌بند با دسته‌بندی‌های واقعی سوپرمارکت ایرانی:
 *     لبنیات (کاله، رامک، پگاه، روزانه، پنال) · شیرینی و شکلات · تنقلات و خشکبار ·
 *     کالاهای وارداتی (کیت‌کت، اورئو، نسکوییک، مارس) · اسباب‌بازی و لوازم‌التحریر ·
 *     شوینده و بهداشتی
 * هیچ سند ساختگی ساخته نمی‌شود — فقط ساختار فیزیکی.
 *
 * اجرا:  bun run scripts/seed-archive.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const existing = await db.archiveCabinet.count()
  if (existing > 0) {
    console.log(`↷ ساختار آرشیو از قبل وجود دارد (${existing} کابینت) — چیزی اضافه نشد.`)
    return
  }

  /* ── کابینت حسابداری ۱ (دفتر حسابداری) ── */
  const cab1 = await db.archiveCabinet.create({
    data: {
      name: 'کابینت حسابداری ۱',
      code: 'CAB-01',
      location: 'دفتر حسابداری — کنار میز حسابدار',
      note: 'اسناد مالی تأمین‌کنندگان: فاکتور خرید، رسید پرداخت و چک‌ها',
      sortOrder: 10,
    },
  })
  const s1 = await db.archiveShelf.create({
    data: { cabinetId: cab1.id, name: 'قفسهٔ ۱', code: 'CAB-01-S1', note: 'مواد پروتئینی و خوراکی پایه', sortOrder: 10 },
  })
  const s2 = await db.archiveShelf.create({
    data: { cabinetId: cab1.id, name: 'قفسهٔ ۲', code: 'CAB-01-S2', note: 'تنقلات و کالاهای خاص', sortOrder: 20 },
  })
  const s3 = await db.archiveShelf.create({
    data: { cabinetId: cab1.id, name: 'قفسهٔ ۳', code: 'CAB-01-S3', note: 'پررونق غیرخوراکی', sortOrder: 30 },
  })

  /* ── کابینت بایگانی انبار ── */
  const cab2 = await db.archiveCabinet.create({
    data: {
      name: 'کابینت بایگانی انبار',
      code: 'CAB-02',
      location: 'انبار — دیوار شمالی، کنار در ورودی کالا',
      note: 'اسناد تحویل و مرجوعی انبار',
      sortOrder: 20,
    },
  })
  const w1 = await db.archiveShelf.create({
    data: { cabinetId: cab2.id, name: 'قفسهٔ ۱', code: 'CAB-02-S1', sortOrder: 10 },
  })
  await db.archiveShelf.create({
    data: { cabinetId: cab2.id, name: 'قفسهٔ ۲', code: 'CAB-02-S2', note: 'رزرو برای زون‌بندهای جدید', sortOrder: 20 },
  })

  /* ── زون‌بندها (دسته‌بندی واقعی تأمین‌کنندگان سوپرمارکت) ── */
  await db.archiveBinder.create({
    data: {
      shelfId: s1.id,
      name: 'زون‌بند لبنیات',
      code: 'CAB-01-S1-B1',
      category: 'لبنیات',
      color: 'آبی',
      note: 'کاله، رامک، پگاه، روزانه، پنال — فاکتورها به تفکیک ماه',
      sortOrder: 10,
    },
  })
  await db.archiveBinder.create({
    data: {
      shelfId: s1.id,
      name: 'زون‌بند شیرینی و شکلات',
      code: 'CAB-01-S1-B2',
      category: 'شیرینی و شکلات',
      color: 'قهوه‌ای',
      note: 'شیرینی ایرانی و خارجی، شکلات تابلو و جعبه‌ای',
      sortOrder: 20,
    },
  })
  await db.archiveBinder.create({
    data: {
      shelfId: s2.id,
      name: 'زون‌بند تنقلات و خشکبار',
      code: 'CAB-01-S2-B1',
      category: 'تنقلات و خشکبار',
      color: 'سبز',
      note: 'چیپس، پفک، آجیل، خشکبار و شیرینی خشک',
      sortOrder: 10,
    },
  })
  await db.archiveBinder.create({
    data: {
      shelfId: s2.id,
      name: 'زون‌بند کالاهای وارداتی',
      code: 'CAB-01-S2-B2',
      category: 'کالاهای وارداتی',
      color: 'طلایی',
      note: 'کیت‌کت، اورئو، نسکوییک، مارس و برندهای وارداتی',
      sortOrder: 20,
    },
  })
  await db.archiveBinder.create({
    data: {
      shelfId: s3.id,
      name: 'زون‌بند اسباب‌بازی و لوازم‌التحریر',
      code: 'CAB-01-S3-B1',
      category: 'اسباب‌بازی و لوازم‌التحریر',
      color: 'بنفش',
      note: 'اسباب‌بازی، دفتر، مددرنگی و ملزومات مدرسه',
      sortOrder: 10,
    },
  })
  await db.archiveBinder.create({
    data: {
      shelfId: w1.id,
      name: 'زون‌بند شوینده و بهداشتی',
      code: 'CAB-02-S1-B1',
      category: 'شوینده و بهداشتی',
      color: 'نارنجی',
      note: 'شوینده، بهداشتی و آرایشی — رسیدهای تحویل انبار',
      sortOrder: 10,
    },
  })

  console.log('✓ ساختار آرشیو ساخته شد: ۲ کابینت، ۵ قفسه، ۶ زون‌بند (بدون هیچ سند ساختگی).')
}

main()
  .catch((e) => {
    console.error('✗ خطا در ساخت ساختار آرشیو:', e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
