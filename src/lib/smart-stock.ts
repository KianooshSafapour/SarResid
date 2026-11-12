/**
 * R23 — Smart Low-Stock Engine
 * ---------------------------------------------------------------------------
 * از TradeRecord (خرید/فروش واقعی هلو) نقطهٔ سفارش مجدد هر کالا را محاسبه می‌کند.
 * فرمول: (میانگین فروش روزانه) × (مدت تأمین تأمین‌کننده + روز ایمنی) + کف قفسه
 * اگر داده کافی نباشد، مقدار پیش‌فرض ۵ را نگه می‌دارد.
 * مدیر می‌تواند برای هر کالا مقدار دستی override کند (Product.lowStockThreshold).
 */
import { db } from '@/lib/db'

export interface SmartStockLevel {
  productId: string
  suggested: number      // پیشنهاد موتور
  dailyAvg: number       // میانگین فروش روزانه
  leadTimeDays: number   // زمان تأمین
  safetyDays: number     // روز ایمنی
  currentThreshold: number // مقدار فعلی (دستی یا auto)
  source: 'manual' | 'auto' | 'default'
}

/**
 * محاسبهٔ نقطهٔ سفارش مجدد برای یک کالا از TradeRecord
 */
export async function calcSmartStock(productId: string): Promise<SmartStockLevel | null> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, lowStockThreshold: true, leadTimeDays: true },
  })
  if (!product) return null

  // اگر مدیر مقدار دستی تعیین کرده، همان را برگردان
  if (product.lowStockThreshold !== null && product.lowStockThreshold !== undefined) {
    return {
      productId,
      suggested: product.lowStockThreshold,
      dailyAvg: 0, leadTimeDays: product.leadTimeDays, safetyDays: 0,
      currentThreshold: product.lowStockThreshold,
      source: 'manual',
    }
  }

  // دادهٔ فروش ۹۰ روز اخیر
  const trades = await db.tradeRecord.findMany({
    where: { productId, kind: 'SELL' },
    orderBy: { dateJalali: 'desc' },
    take: 200,
    select: { qty: true, dateJalali: true },
  })

  if (trades.length < 3) {
    // داده کافی نیست — پیش‌فرض ۵
    return {
      productId,
      suggested: 5,
      dailyAvg: 0, leadTimeDays: product.leadTimeDays, safetyDays: 2,
      currentThreshold: 5,
      source: 'default',
    }
  }

  // کل فروش در ۹۰ روز (تقریبی — dates are Jalali strings)
  const totalSold = trades.reduce((s, t) => s + t.qty, 0)
  const daysSpan = 90
  const dailyAvg = totalSold / daysSpan

  // زمان تأمین + ایمنی
  const leadTime = product.leadTimeDays || 3
  const safetyDays = Math.max(2, Math.ceil(leadTime * 0.5))

  // نقطهٔ سفارش: (فروش روزانه × (تأمین + ایمنی))
  const reorderPoint = Math.ceil(dailyAvg * (leadTime + safetyDays))

  return {
    productId,
    suggested: Math.max(1, reorderPoint),
    dailyAvg: Math.round(dailyAvg * 100) / 100,
    leadTimeDays: leadTime,
    safetyDays,
    currentThreshold: reorderPoint,
    source: 'auto',
  }
}

/**
 * بازمحاسبهٔ گروهی برای همهٔ کالاها — برای cron یا دستور مدیر
 * فقط کالاهایی که مقدار دستی ندارند را آپدیت می‌کند
 */
export async function recalcAllSmartStocks(): Promise<{ updated: number; manual: number; default: number }> {
  // همهٔ کالاهای فعال که مقدار دستی ندارند
  const products = await db.product.findMany({
    where: { active: true, lowStockThreshold: null },
    select: { id: true },
    take: 5000,
  })

  let updated = 0
  let manual = 0
  let default_ = 0

  // شمارش کالاهای دستی
  const manualCount = await db.product.count({
    where: { active: true, lowStockThreshold: { not: null } },
  })
  manual = manualCount

  for (const p of products) {
    const calc = await calcSmartStock(p.id)
    if (!calc) continue
    if (calc.source === 'default') {
      default_++
    } else {
      // آپدیت reorderLevel (نه lowStockThreshold — آن فقط دستی است)
      await db.product.update({
        where: { id: p.id },
        data: { reorderLevel: calc.suggested },
      }).catch(() => null)
      updated++
    }
  }

  return { updated, manual, default: default_ }
}

/**
 * R24: کالاهای مرده — کالاهایی که ۶+ ماه خریداری/فروش نشده‌اند باید غیرفعال شوند
 */
export async function markDeadProducts(): Promise<{ marked: number }> {
  // آخرین خرید/فروش هر کالا از TradeRecord
  const sixMonthsAgoJalali = (() => {
    // تقریب: ۶ ماه پیش
    const d = new Date()
    d.setMonth(d.getMonth() - 6)
    const jy = d.getFullYear() - 621
    return jy // سال جلالی تقریبی
  })()

  // کالاهایی که در ۶ ماه اخیر هیچ خرید یا فروشی نداشته‌اند و موجودی صفر است
  const products = await db.product.findMany({
    where: {
      active: true,
      stock: { lte: 0 },
    },
    select: { id: true, name: true },
    take: 5000,
  })

  let marked = 0
  for (const p of products) {
    const hasRecentTrade = await db.tradeRecord.findFirst({
      where: { productId: p.id, kind: { in: ['BUY', 'SELL'] } },
      orderBy: { createdAt: 'desc' },
    })
    // اگر آخرین معامله بیش از ۶ ماه پیش بوده یا اصلاً نبوده
    if (!hasRecentTrade || new Date(hasRecentTrade.createdAt) < new Date(Date.now() - 180 * 24 * 3600 * 1000)) {
      await db.product.update({ where: { id: p.id }, data: { active: false } }).catch(() => null)
      marked++
    }
  }
  return { marked }
}
