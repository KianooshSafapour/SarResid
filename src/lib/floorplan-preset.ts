/**
 * floorplan-preset — قالب‌های آمادهٔ زمین فروشگاه (منبع واحد هندسه — مشترک بین ویرایشگر و آیندهٔ API/seed)
 *
 * هندسهٔ واقعی هایپر زیتون (سانتی‌متر، محور y به پایین — کادر ۲۵۶۰×۱۲۰۰):
 *   • دیوار پشتی شمالی: ۲۵۶۰ سانتی‌متر (y=0) — لبهٔ شرقی ۸۰۰ سانتی‌متر پایین (x=2560)
 *   • ضلع مورب گوشهٔ خیابان: ۴۰۰×۴۰۰ تا کنج خیابان (2160,1200) — طول ضلع خیابان ≈ ۲۲ متر = ۲۷ کاشی ۸۰ سانتی‌متری
 *   • شانهٔ ۸۰ سانتی + الکوی فرورفتهٔ ورود: خط درب y=1120 با دیوار داخلی ۶۴۰ سانتی (x ۱۴۴۰..۲۰۸۰)
 *     فرورفتگی ورود تا عابرانِ پیاده درب اتوماتیک را فعال نکنند؛ سپس نمای خیابان ۱۴۴۰ سانتی تا کنج جنوب‌غربی
 *   • عمق زمین: ۱۲۰۰ سانتی‌متر (۱۲ متر)
 *   این رئوس عین رکورد DB است (FloorPlan id cmua9jklx0009sgxhzjz2v5x6).
 */

import { faNum } from '@/lib/jalali'

export type PresetVertex = { x: number; y: number }

/** متای بلوک قالب — همساخت BlockMeta ویرایشگر پلان */
export type PresetBlockMeta = { planogramId?: string; responsibleId?: string; responsibleName?: string; capacity?: number; note?: string }

export type PresetBlock = {
  kind: string // یکی از kindهای PREFABS سرویس floorplans
  x: number
  y: number
  w: number
  h: number
  rotation: number // ۰|۹۰|۱۸۰|۲۷۰
  label: string
  zoneName: string
  meta?: PresetBlockMeta
}

/** رئوس زمین هایپر زیتون (سانتی‌متر) — ۹ رأس، چندضلعی سادهٔ کوژ+فرورفته */
export const HYPER_ZEYTOON_VERTICES: PresetVertex[] = [
  { x: 0, y: 0 },
  { x: 2560, y: 0 },
  { x: 2560, y: 800 },
  { x: 2160, y: 1200 },
  { x: 2080, y: 1200 },
  { x: 2080, y: 1120 },
  { x: 1440, y: 1120 },
  { x: 1440, y: 1200 },
  { x: 0, y: 1200 },
]

/**
 * قالب هایپر زیتون: زمین واقعی + بلوک‌های پیشنهادی.
 * بلوک‌ها: ورودی روی خط دربِ الکو (x≈۱۴۴۰..۲۰۸۰ در y=۱۱۲۰)، صندوق U و صندوق دوم داخل الکو،
 * و زون‌های نمونهٔ میوه‌فروشی، لبنیات و نان در جای طبیعی‌شان داخل چندضلعی.
 */
export const hyperZeytoonPreset: {
  nameFa: string
  width: number
  height: number
  shape: PresetVertex[]
  blocks: PresetBlock[]
} = {
  nameFa: 'هایپر زیتون — ۱۲×۲۲ متر',
  width: 2560,
  height: 1200,
  shape: HYPER_ZEYTOON_VERTICES,
  blocks: [
    // ورودی — درب اتوماتیک روی خط درب الکو (بالای دیوار داخلی y=1120)
    { kind: 'ENTRANCE', x: 1450, y: 1076, w: 560, h: 44, rotation: 0, label: 'ورودی', zoneName: 'صندوق و خروج', meta: {} },
    // صندوق‌ها داخل الکو (دقیقاً بالای ورودی)
    { kind: 'CASHIER_U', x: 1520, y: 916, w: 200, h: 144, rotation: 0, label: 'صندوق U', zoneName: 'صندوق و خروج', meta: {} },
    { kind: 'CHECKOUT', x: 1760, y: 1032, w: 264, h: 44, rotation: 0, label: 'صندوق ۲', zoneName: 'صندوق و خروج', meta: {} },
    // زون‌های نمونه — جای طبیعی داخل زمین
    { kind: 'PRODUCE', x: 60, y: 940, w: 260, h: 168, rotation: 0, label: 'میوه‌فروشی', zoneName: 'میوه‌فروشی', meta: {} },
    { kind: 'FRIDGE_CLOSED', x: 90, y: 16, w: 480, h: 70, rotation: 0, label: 'لبنیات', zoneName: 'لبنیات', meta: {} },
    { kind: 'BAKERY', x: 1180, y: 940, w: 200, h: 120, rotation: 0, label: 'نان‌وایی', zoneName: 'نان', meta: {} },
  ],
}

/** طبقهٔ تازهٔ پیش‌فرض: مستطیل سادهٔ ۱۲×۸ متر (بدون چندضلعی) */
export const defaultNewFloor: { nameFa: string; width: number; height: number; shape: PresetVertex[] } = {
  nameFa: 'طبقهٔ تازه',
  width: 1200,
  height: 800,
  shape: [], // خالی = حالت مستطیلی
}

/** کادر محیطی (bbox) چندضلعی — ورودی خالی/تهی = همهٔ صفر */
export function polygonBBox(pts: Array<{ x: number; y: number }> | null | undefined): {
  minX: number
  minY: number
  maxX: number
  maxY: number
  w: number
  h: number
} {
  if (!pts || pts.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}

/** سانتی‌متر → رشتهٔ متر با یک رقم اعشار و ارقام فارسی (۲۵۶۰ → «۲۵٫۶») */
export function fmtM(cm: number): string {
  return faNum((cm / 100).toFixed(1)).replace('.', '٫')
}
