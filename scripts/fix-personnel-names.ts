/**
 * scripts/fix-personnel-names.ts — هم‌ترازی نام پروندهٔ پرسنل با نام کاربر متصل (R5-C)
 * ---------------------------------------------------------------------------
 * برخی ردیف‌های Personnel نام‌هایی با غلط تایپی داشتند (عبدالله ملايی با «ي» عربی،
 * علی‌حسین محمودی، فائزه سعادی) در حالی که نام کاربر متصل درست است (عبدالله ملایی،
 * علی‌حسین محمدی، فائزه سعدی — اصلاح‌شده توسط هماهنگ‌کننده در جدول User).
 * این اسکریپت idempotent نامِ هر پروندهٔ متصل‌شده را با نام کاربر رسمی‌اش هم‌تراز می‌کند
 * (فقط وقتی نام کاربر معتبر است). برای سرور دمو نیز قابل اجراست.
 */
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  const users = await db.user.findMany({ select: { id: true, fullName: true, active: true } })
  const byId = new Map(users.map((u) => [u.id, u]))
  const personnel = await db.personnel.findMany()
  let fixed = 0
  for (const p of personnel) {
    const u = byId.get(p.userId)
    if (!u) continue // پروندهٔ بدون کاربر — دست نمی‌زنیم
    if (p.fullName !== u.fullName) {
      await db.personnel.update({ where: { id: p.id }, data: { fullName: u.fullName } })
      console.log(`fixed: «${p.fullName}» → «${u.fullName}»`)
      fixed++
    }
  }
  console.log(fixed === 0 ? 'OK — همهٔ نام‌های پرونده‌ها هم‌ترازند (idempotent)' : `${fixed} نام اصلاح شد`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
