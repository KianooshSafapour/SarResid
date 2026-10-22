/**
 * Rebuild the store floorplan from the REAL blueprint (upload/hyper-zeytoon.PNG)
 * per Mr. Safapour's description + VLM geometry analysis:
 *  - 2 inward door alcoves on the south wall: RIGHT = entrance, LEFT = exit
 *  - cashiers registry directly in front of the exit (4 registers + queue path)
 *    with 1 shelf facing them on top + 1 facing away + sideways shelves on both ends
 *  - 4 vertical gondolas in the middle, each with 2 end shelves (one at each end)
 *  - 2 horizontal gondolas on the left, in the free space in front of the exit
 *  - 6 small ice-cream freezers (A–F) on the right (2 cols × 3 rows)
 *  - sweets & cookies table: frozen-products freezer ON TOP of it,
 *    nuts & seeds shelves to its RIGHT, ice-cream freezers to its LEFT
 *  - wall fridges on the north wall (showcase / closed / open)
 *  - shelves along the west wall + top wall of the left section
 *  - toys area right of the entrance
 * Canvas: 2840 × 1540
 */
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const W = 2840
const H = 1540

interface B { kind: string; label: string; x: number; y: number; w: number; h: number; zone?: string; meta?: Record<string, unknown> }
const blocks: B[] = []

// ── درگاه‌ها (دو بخش رفته به درون ساختمان — دیوار جنوبی) ─────────────
blocks.push({ kind: 'ENTRANCE', label: 'خروجی', x: 120, y: 1390, w: 400, h: 130 })
blocks.push({ kind: 'ENTRANCE', label: 'ورودی', x: 2160, y: 1390, w: 400, h: 130 })

// ── خوشه صندوق فروش (مقابل درگاه خروجی) ──────────────────────────────
for (let i = 0; i < 4; i++) blocks.push({ kind: 'CASHIER_U', label: `صندوق ${'۱۲۳۴'[i]}`, x: 200 + i * 190, y: 1150, w: 160, h: 130, zone: 'صندوق' })
blocks.push({ kind: 'CHECKOUT', label: 'مسیر پرداخت', x: 200, y: 1300, w: 730, h: 70, zone: 'صندوق' })
blocks.push({ kind: 'SHELF', label: 'قفسه روبه‌روی صندوق', x: 200, y: 1020, w: 730, h: 110, zone: 'صندوق', meta: { facing: 'south' } })
blocks.push({ kind: 'SHELF', label: 'قفسه پشت صندوق', x: 200, y: 900, w: 730, h: 110, zone: 'صندوق', meta: { facing: 'north' } })
blocks.push({ kind: 'SHELF', label: 'قفسه کنارِ راست صندوق', x: 950, y: 900, w: 100, h: 230, zone: 'صندوق', meta: { facing: 'east' } })
blocks.push({ kind: 'SHELF', label: 'قفسه کنارِ چپ صندوق', x: 70, y: 900, w: 100, h: 230, zone: 'صندوق', meta: { facing: 'west' } })

// ── دو گوندولای سمت چپ (در فضای خالی مقابل درگاه خروجی) ─────────────
blocks.push({ kind: 'GONDOLA', label: 'گوندولا ۵', x: 180, y: 620, w: 780, h: 210, zone: 'خشک', meta: { orientation: 'east-west' } })
blocks.push({ kind: 'SHELF', label: 'گ۵ — سر شرقی', x: 970, y: 630, w: 60, h: 190, zone: 'خشک' })
blocks.push({ kind: 'SHELF', label: 'گ۵ — سر غربی', x: 110, y: 630, w: 60, h: 190, zone: 'خشک' })
blocks.push({ kind: 'GONDOLA', label: 'گوندولا ۶', x: 180, y: 370, w: 780, h: 210, zone: 'خشک', meta: { orientation: 'east-west' } })
blocks.push({ kind: 'SHELF', label: 'گ۶ — سر شرقی', x: 970, y: 380, w: 60, h: 190, zone: 'خشک' })
blocks.push({ kind: 'SHELF', label: 'گ۶ — سر غربی', x: 110, y: 380, w: 60, h: 190, zone: 'خشک' })

// ── قفسه‌های دیواری چپ ────────────────────────────────────────────────
blocks.push({ kind: 'SHELF', label: 'قفسه دیوار غربی', x: 30, y: 240, w: 70, h: 600, zone: 'خشک', meta: { wall: 'west' } })
blocks.push({ kind: 'SHELF', label: 'قفسه دیوار شمالیِ بخش چپ', x: 150, y: 200, w: 810, h: 150, zone: 'خشک', meta: { wall: 'north-left' } })

// ── یخچال‌های دیوار شمالی ────────────────────────────────────────────
blocks.push({ kind: 'FRIDGE_SHOWCASE', label: 'ویترین سرد', x: 150, y: 30, w: 520, h: 140, zone: 'فسادپذیر' })
blocks.push({ kind: 'FRIDGE_CLOSED', label: 'یخچال', x: 700, y: 30, w: 180, h: 140, zone: 'فسادپذیر' })
blocks.push({ kind: 'FRIDGE_OPEN', label: 'یخچال باز', x: 920, y: 30, w: 560, h: 140, zone: 'فسادپذیر' })

// ── چهار گوندولای مرکزی (عمودی) + دو سرِ هر کدام ─────────────────────
for (let i = 0; i < 4; i++) {
  const gx = 1050 + i * 240
  const n = '۱۲۳۴'[i]
  blocks.push({ kind: 'GONDOLA', label: `گوندولا ${n}`, x: gx, y: 430, w: 170, h: 580, zone: 'خشک', meta: { orientation: 'north-south' } })
  blocks.push({ kind: 'SHELF', label: `گ${n} — سر شمالی`, x: gx - 15, y: 365, w: 200, h: 60, zone: 'خشک' })
  blocks.push({ kind: 'SHELF', label: `گ${n} — سر جنوبی`, x: gx - 15, y: 1015, w: 200, h: 60, zone: 'خشک' })
}

// ── شش فریزر بستنی (سمت راست — دو ستون × سه ردیف: A..F) ─────────────
const icCols = [2020, 2230]
const icRows = [430, 650, 870]
const icNames = ['A', 'B', 'C', 'D', 'E', 'F']
let icIdx = 0
for (const ry of icRows) for (const cx of icCols) {
  blocks.push({ kind: 'FREEZER_ICECREAM', label: `بستنی ${icNames[icIdx]}`, x: cx, y: ry, w: 180, h: 190, zone: 'فسادپذیر' })
  icIdx++
}

// ── فریزر محصولات منجمد (بالای میز شیرینی) + میز شیرینی و بیسکویت ───
blocks.push({ kind: 'FRIDGE_CLOSED', label: 'فریزر محصولات منجمد', x: 2470, y: 430, w: 260, h: 300, zone: 'فسادپذیر' })
blocks.push({ kind: 'BAKERY', label: 'میز شیرینی و بیسکویت', x: 2470, y: 780, w: 260, h: 220, zone: 'خشک', meta: { sweetsTable: true } })
blocks.push({ kind: 'SHELF', label: 'قفسه آجیل و تخمه', x: 2770, y: 430, w: 60, h: 570, zone: 'خشک', meta: { wall: 'east' } })

// ── اسباب‌بازی (راستِ درگاه ورودی) ────────────────────────────────────
blocks.push({ kind: 'CUSTOM', label: 'اسباب‌بازی', x: 2600, y: 1330, w: 210, h: 140, zone: 'خشک' })

async function main() {
  const old = await db.floorplan.findMany({ include: { blocks: true } })
  let removedBlocks = 0
  for (const p of old) removedBlocks += p.blocks.length
  await db.floorplan.deleteMany({}) // cascades blocks
  const removedPlanograms = await db.planogram.deleteMany({}) // old labels no longer exist
  const plan = await db.floorplan.create({
    data: {
      name: 'طبقه همکف — هایپر زیتون (نقشه واقعی)',
      width: W,
      height: H,
      blocks: {
        create: blocks.map((b) => ({
          kind: b.kind,
          label: b.label,
          x: b.x, y: b.y, w: b.w, h: b.h,
          zoneName: b.zone ?? null,
          metaJson: b.meta ? JSON.stringify(b.meta) : null,
        })),
      },
    },
    include: { blocks: true },
  })
  console.log(JSON.stringify({
    removedPlans: old.length,
    removedBlocks,
    removedPlanograms: removedPlanograms.count,
    newPlan: plan.name,
    newBlocks: plan.blocks.length,
    canvas: `${W}x${H}`,
  }, null, 2))
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
