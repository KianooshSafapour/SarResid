import { db } from '@/lib/db'
import { fail, getSessionUser, json } from '@/lib/api-helpers'

/**
 * جعبه‌ابزار علمی موجودی — همه مدل‌ها مستند به ادبیات علمی:
 *  - ABC (اصل پارتو؛ Gupta 2011, PMC)
 *  - Safety Stock & ROP (Gonçalves et al. 2020, PMC)
 *  - EOQ (Harris 1913; Erlenkotter 1990)
 *  - پیش‌بینی نمایی (ETS) + Croston (1972) برای تقاضای متناوب
 * تقاضا از پیش‌فاکتورهای فروش (PreOrder) ۹۰ روز اخیر برآورد می‌شود.
 */

const Z: Record<string, number> = { '90': 1.28, '95': 1.65, '98': 2.05, '99': 2.33 }

function isoDaysAgo(days: number): Date {
  return new Date(Date.now() - days * 86400000)
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const tool = searchParams.get('tool') || 'all'
  const serviceLevel = searchParams.get('sl') || '95'
  const leadTime = Math.max(1, Number(searchParams.get('lead') || 3))
  const orderCost = Math.max(0, Number(searchParams.get('orderCost') || 150000)) // هزینه هر بار سفارش (تومان)
  const holdingRate = Math.min(2, Math.max(0.05, Number(searchParams.get('holdingRate') || 0.4))) // نرخ نگهداری سالانه (تورم ایران)
  const alpha = Math.min(0.9, Math.max(0.05, Number(searchParams.get('alpha') || 0.3)))

  const [products, preorders] = await Promise.all([
    db.product.findMany({ where: { active: true } }),
    db.preOrder.findMany({
      where: { createdAt: { gte: isoDaysAgo(90) }, status: { not: 'CANCELLED' } },
      select: { items: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  // ── demand series per product (12 weekly buckets over last 90d)
  const weekly = new Map<string, number[]>() // productId -> 12 weekly qty
  for (const po of preorders) {
    let items: { productId?: string; qty?: number }[] = []
    try { items = JSON.parse(po.items || '[]') } catch { continue }
    const ageDays = Math.floor((Date.now() - new Date(po.createdAt).getTime()) / 86400000)
    if (ageDays > 90) continue
    const wk = 11 - Math.min(11, Math.floor(ageDays / 7)) // 0=oldest … 11=current
    for (const it of items) {
      if (!it.productId || !it.qty) continue
      const w = weekly.get(it.productId) || Array(12).fill(0)
      w[wk] += it.qty
      weekly.set(it.productId, w)
    }
  }

  const stats = (p: (typeof products)[number]) => {
    const w = weekly.get(p.id) || Array(12).fill(0)
    const avg = w.reduce((a, b) => a + b, 0) / 12
    const variance = w.reduce((a, b) => a + (b - avg) * (b - avg), 0) / 12
    const sd = Math.sqrt(variance)
    const nonZero = w.filter((x) => x > 0)
    // Croston (1972): size & interval smoothing for intermittent demand
    let croston = 0
    if (nonZero.length > 0 && nonZero.length < 12) {
      const zAvg = nonZero.reduce((a, b) => a + b, 0) / nonZero.length
      const pAvg = 12 / Math.max(1, nonZero.length)
      croston = zAvg / pAvg
    }
    return { w, avg, sd, croston }
  }

  // ── ABC analysis (annualized consumption value from 90d demand)
  const abc =
    tool === 'all' || tool === 'abc'
      ? (() => {
          const rows = products
            .map((p) => {
              const { w } = stats(p)
              const annualValue = (w.reduce((a, b) => a + b, 0) / 90) * 365 * (p.sellPrice || p.buyPrice || 0)
              return { id: p.id, name: p.name, category: p.category, annualValue, stock: p.stock, sellPrice: p.sellPrice }
            })
            .filter((r) => r.annualValue > 0)
            .sort((a, b) => b.annualValue - a.annualValue)
          const total = rows.reduce((a, r) => a + r.annualValue, 0) || 1
          let cum = 0
          const classified = rows.map((r, i) => {
            cum += r.annualValue
            const cumPct = (cum / total) * 100
            const cls = cumPct <= 80 ? 'A' : cumPct <= 95 ? 'B' : 'C'
            return { ...r, rank: i + 1, share: (r.annualValue / total) * 100, cumPct, cls }
          })
          const summary = (['A', 'B', 'C'] as const).map((k) => {
            const g = classified.filter((r) => r.cls === k)
            return { cls: k, count: g.length, share: g.reduce((a, r) => a + r.share, 0), value: g.reduce((a, r) => a + r.annualValue, 0) }
          })
          return { rows: classified.slice(0, 200), summary, total }
        })()
      : null

  // ── ROP + safety stock (+ below-ROP alerts)
  const rop =
    tool === 'all' || tool === 'rop'
      ? (() => {
          const z = Z[String(serviceLevel)] || 1.65
          const rows = products
            .map((p) => {
              const { avg, sd } = stats(p)
              const dBar = avg / 7 // daily demand
              const sigmaD = sd / 7
              const ss = z * sigmaD * Math.sqrt(leadTime)
              const ropVal = dBar * leadTime + ss
              return {
                id: p.id,
                name: p.name,
                category: p.category,
                stock: p.stock,
                dailyDemand: +dBar.toFixed(2),
                sdDaily: +sigmaD.toFixed(2),
                ss: Math.ceil(ss),
                rop: Math.ceil(ropVal),
                below: p.stock <= Math.ceil(ropVal),
                suggest: Math.max(0, Math.ceil(ropVal * 1.5) - p.stock), // سفارش پیشنهادی تا ۱۵۰٪ نقطه سفارش
              }
            })
            .filter((r) => r.dailyDemand > 0)
            .sort((a, b) => Number(b.below) - Number(a.below) || b.dailyDemand - a.dailyDemand)
          return { rows, serviceLevel, leadTime, z }
        })()
      : null

  // ── EOQ (Harris 1913)
  const eoq =
    tool === 'all' || tool === 'eoq'
      ? (() => {
          const rows = products
            .map((p) => {
              const { w } = stats(p)
              const D = (w.reduce((a, b) => a + b, 0) / 90) * 365 // annual demand
              const H = (p.buyPrice || p.sellPrice / 1.25 || 1) * holdingRate
              const eoqVal = H > 0 ? Math.sqrt((2 * D * orderCost) / H) : 0
              return {
                id: p.id,
                name: p.name,
                category: p.category,
                annualDemand: Math.round(D),
                buyPrice: p.buyPrice,
                eoq: Math.round(eoqVal),
                ordersPerYear: eoqVal > 0 ? +(D / eoqVal).toFixed(1) : 0,
                cycleDays: eoqVal > 0 && D > 0 ? Math.round(365 / (D / eoqVal)) : 0,
              }
            })
            .filter((r) => r.annualDemand > 0)
            .sort((a, b) => b.annualDemand - a.annualDemand)
          return { rows: rows.slice(0, 200), orderCost, holdingRate }
        })()
      : null

  // ── Forecast (ETS + Croston for intermittent demand)
  const forecast =
    tool === 'all' || tool === 'forecast'
      ? (() => {
          const rows = products
            .map((p) => {
              const { w, croston } = stats(p)
              let f = w[0] || 0
              for (let i = 1; i < w.length; i++) f = alpha * w[i] + (1 - alpha) * f
              const recent = w.slice(4) // last 8 weeks
              const mean = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length)
              const mae = recent.reduce((a, b) => a + Math.abs(b - f), 0) / Math.max(1, recent.length)
              const intermittent = w.filter((x) => x > 0).length < 5
              return {
                id: p.id,
                name: p.name,
                category: p.category,
                history: w,
                forecastNext: +(intermittent ? croston : f).toFixed(1),
                method: intermittent ? 'کراستون (تقاضای متناوب)' : 'هموارسازی نمایی',
                mae: +mae.toFixed(1),
                trend: f > mean * 1.1 ? 'صعودی' : f < mean * 0.9 ? 'نزولی' : 'ثابت',
              }
            })
            .filter((r) => r.history.some((x) => x > 0))
            .sort((a, b) => b.forecastNext - a.forecastNext)
          return { rows: rows.slice(0, 150), alpha }
        })()
      : null

  return json({ abc, rop, eoq, forecast, generatedAt: new Date().toISOString() })
}
