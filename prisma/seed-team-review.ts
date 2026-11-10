/**
 * seed-team-review.ts — «بررسی تیم و بهداشت پرسنل» checklist templates.
 *
 * User requirement: the afternoon manager (Mr. Mollaie) must have a TEAM REVIEW
 * checklist covering personnel dress & hygiene, presence and behavior — visible
 * directly on his «چکلیست‌های امروز» page (in addition to the detailed
 * per-person control in کنترل شیفت پرسنل).
 *
 * - One template per manager shift-role (EXEC = evening manager, GM = morning
 *   manager) with science-backed hygiene & team items (see research notes in
 *   worklog: personal hygiene / GMP-style retail checklists).
 * - Idempotent: re-running updates items but keeps ids/states.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const TEAM_REVIEW_ITEMS = [
  { text: 'حضور و غیاب تیم', hint: 'کنترل حضور همه پرسنل شیفت و ثبت وضعیت ورود' },
  { text: 'لباس فرم و ظاهر پرسنل', hint: 'یکنواختی و پاکیزگی لباس کار همهٔ همکاران' },
  { text: 'بهداشت فردی پرسنل', hint: 'ظاهر، نظافت شخصی و رعایت اصول بهداشتی' },
  { text: 'برخورد با مشتری', hint: 'احترام، صداقت و سرعت پاسخگویی تیم' },
  { text: 'هماهنگی و کار تیمی', hint: 'همکاری بین همکاران در شیفت و کمک متقابل' },
  { text: 'وضعیت سرویس بهداشتی پرسنل', hint: 'نظافت و ترتیب محل استراحت و سرویس کارکنان' },
]

const TEMPLATES = [
  {
    title: 'بررسی تیم و بهداشت پرسنل — شیفت عصر',
    description: 'کنترل روزانهٔ تیم شیفت عصر: حضور، لباس فرم، بهداشت فردی و برخورد (مدیر شیفت عصر)',
    roleKey: 'EXEC',
    phase: 'start',
    points: 3,
    order: 5,
  },
  {
    title: 'بررسی تیم و بهداشت پرسنل — شیفت صبح',
    description: 'کنترل روزانهٔ تیم شیفت صبح: حضور، لباس فرم، بهداشت فردی و برخورد (مدیر شیفت صبح)',
    roleKey: 'GM',
    phase: 'start',
    points: 3,
    order: 6,
  },
]

async function main() {
  for (const t of TEMPLATES) {
    const existing = await db.checklistTemplate.findFirst({ where: { title: t.title } })
    const data = {
      description: t.description,
      phase: t.phase,
      frequency: 'DAILY',
      points: t.points,
      roleKey: t.roleKey,
      itemsJson: JSON.stringify(TEAM_REVIEW_ITEMS),
      order: t.order,
      active: true,
    }
    if (existing) {
      await db.checklistTemplate.update({ where: { id: existing.id }, data })
      console.log(`~ updated «${t.title}»`)
    } else {
      await db.checklistTemplate.create({ data: { title: t.title, ...data } })
      console.log(`+ created «${t.title}»`)
    }
  }
  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
