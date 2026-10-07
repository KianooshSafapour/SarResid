import { db } from '@/lib/db'
import { fail, getSessionUser, json } from '@/lib/api-helpers'
import { CHEQUE_STATUSES, ORDER_STATUSES, ROLE_LABELS, SECONDARY_LABELS } from '@/lib/constants'
import { formatJalaliShort } from '@/lib/jalali'

const MANAGERS = ['GM', 'OM', 'OWNER', 'ACC']
const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)

/**
 * گزارش‌ها — manager/acc XLS-ready report data.
 * GET /api/reports?type=cheques|staff|orders|inventory
 * Returns { type, title, columns, rows, summary } — client renders preview + builds .xlsx via SheetJS.
 */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!MANAGERS.includes(me.role)) return fail('گزارش‌ها فقط برای مدیریت و حسابداری است', 403)

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || 'cheques'
  const today = new Date().toISOString().slice(0, 10)

  if (type === 'cheques') {
    const cheques = await db.cheque.findMany({ orderBy: { dueDate: 'asc' } })
    const open = cheques.filter((c) => !['CLEARED', 'REJECTED', 'RETURNED'].includes(c.status))
    return json({
      title: 'گزارش چک‌های پرداختی',
      columns: ['شماره چک', 'مبلغ (تومان)', 'وضعیت', 'گیرنده', 'تلفن گیرنده', 'سفارش مرتبط', 'تاریخ نوشتن', 'سررسید', 'روز تا سررسید', 'ثبت‌کننده'],
      rows: cheques.map((c) => [
        c.number || '—',
        c.amount,
        CHEQUE_STATUSES[c.status]?.label || c.status,
        c.recipientName,
        c.recipientPhone || '—',
        c.orderCode || '—',
        formatJalaliShort(c.writtenAt),
        formatJalaliShort(c.dueDate),
        daysBetween(today, c.dueDate),
        c.createdByName,
      ]),
      summary: {
        label: 'مجموع چک‌های باز',
        value: open.reduce((s, c) => s + c.amount, 0),
        extra: `${open.length} چک باز از ${cheques.length} چک`,
      },
    })
  }

  if (type === 'staff') {
    const [users, tasks, awards, activities] = await Promise.all([
      db.user.findMany({ orderBy: { points: 'desc' } }),
      db.task.findMany(),
      db.award.findMany(),
      db.activityLog.findMany({ orderBy: { createdAt: 'desc' } }),
    ])
    const lastAct = new Map<string, string>()
    for (const a of activities) if (!lastAct.has(a.userId)) lastAct.set(a.userId, a.createdAt.toISOString())
    return json({
      title: 'گزارش عملکرد تیم',
      columns: ['نام همکار', 'نقش اصلی', 'نقش‌های فرعی', 'امتیاز', 'وظایف انجام‌شده', 'وظایف باز', 'قدردانی‌ها', 'مجموع امتیاز قدردانی', 'آخرین فعالیت در سامانه', 'فعال'],
      rows: users.map((u) => [
        u.name,
        ROLE_LABELS[u.role] || u.role,
        (JSON.parse(u.secondaryRoles || '[]') as string[]).map((r) => SECONDARY_LABELS[r] || r).join('، ') || '—',
        u.points,
        tasks.filter((t) => t.assignedToId === u.id && t.status === 'DONE').length,
        tasks.filter((t) => t.assignedToId === u.id && ['OPEN', 'IN_PROGRESS', 'PAUSED'].includes(t.status)).length,
        awards.filter((a) => a.userId === u.id).length,
        awards.filter((a) => a.userId === u.id).reduce((s, a) => s + a.points, 0),
        lastAct.has(u.id) ? formatJalaliShort(lastAct.get(u.id)!) : '—',
        u.active ? 'بله' : 'خیر',
      ]),
      summary: {
        label: 'مجموع امتیازهای تیم',
        value: users.reduce((s, u) => s + u.points, 0),
        extra: `${users.filter((u) => u.active).length} همکار فعال از ${users.length} نفر`,
      },
    })
  }

  if (type === 'orders') {
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const orders = await db.order.findMany({ orderBy: { createdAt: 'desc' } })
    const recent = orders.filter((o) => o.createdAt.toISOString().slice(0, 10) >= since)
    const live = recent.filter((o) => o.status !== 'CANCELLED')
    return json({
      title: 'گزارش سفارش‌های ۳۰ روز اخیر',
      columns: ['کد سفارش', 'تأمین‌کننده', 'وضعیت', 'نوع پرداخت', 'مبلغ کل (تومان)', 'تاریخ تحویل', 'ثبت‌کننده', 'تاریخ ثبت'],
      rows: recent.map((o) => [
        o.code,
        o.providerName,
        ORDER_STATUSES[o.status]?.label || o.status,
        o.payMethod === 'CHEQUE' ? 'چکی' : 'نقدی',
        o.totalAmount,
        formatJalaliShort(o.deliveryDate),
        o.createdByName,
        formatJalaliShort(o.createdAt.toISOString()),
      ]),
      summary: {
        label: 'گردش خرید ۳۰ روز اخیر',
        value: live.reduce((s, o) => s + o.totalAmount, 0),
        extra: `${live.length} سفارش فعال از ${recent.length} سفارش`,
      },
    })
  }

  if (type === 'inventory') {
    const [products, providers, preorders] = await Promise.all([
      db.product.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      db.provider.findMany(),
      db.preOrder.findMany({ where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
    ])
    const pName = (id: string | null) => (id ? providers.find((p) => p.id === id)?.name || '—' : '—')
    const sales30 = new Map<string, number>()
    for (const po of preorders) {
      try {
        for (const it of JSON.parse(po.items || '[]') as { productId?: string; qty: number }[]) {
          if (it.productId) sales30.set(it.productId, (sales30.get(it.productId) || 0) + (it.qty || 0))
        }
      } catch { /* skip malformed */ }
    }
    const stockValue = products.reduce((s, p) => s + p.stock * p.buyPrice, 0)
    return json({
      title: 'گزارش موجودی و ارزش انبار',
      columns: ['کالا', 'دسته', 'برند', 'موجودی', 'نقطه سفارش', 'قیمت خرید', 'قیمت فروش', 'ارزش موجودی (تومان)', 'فروش ۳۰ روز (عدد)', 'تأمین‌کننده'],
      rows: products.map((p) => [
        p.name,
        p.category,
        p.brand || '—',
        p.stock,
        p.reorderLevel,
        p.buyPrice,
        p.sellPrice,
        p.stock * p.buyPrice,
        sales30.get(p.id) || 0,
        pName(p.providerId),
      ]),
      summary: {
        label: 'ارزش کل موجودی انبار',
        value: stockValue,
        extra: `${products.length} قلم کالا • ${preorders.length} پیش‌فاکتور فروش در ۳۰ روز`,
      },
    })
  }

  if (type === 'pricechanges') {
    // خواندن تغییرات قیمت چاپ‌شده از گزارش فعالیت — برای هماهنگی دفتر هلو با قفسه
    const since = new Date(Date.now() - 30 * 86400000)
    const [logs, products] = await Promise.all([
      db.activityLog.findMany({
        where: { entity: 'product', action: { in: ['ثبت قیمت چاپ‌شده جدید', 'کنترل قیمت چاپ‌شده'] }, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
      }),
      db.product.findMany({ select: { id: true, name: true, holooCode: true, category: true } }),
    ])
    const pOf = new Map(products.map((p) => [p.id, p]))
    const parsePrice = (detail: string) => {
      const m = detail.match(/([\d,]+)\s*تومان/)
      return m ? Number(m[1].replace(/,/g, '')) : 0
    }
    const rows: (string | number)[][] = logs
      .map((l): (string | number)[] => {
        const p = pOf.get(l.entityId)
        return [
          formatJalaliShort(l.createdAt.toISOString()),
          l.createdAt.toISOString().slice(11, 16),
          l.userName,
          l.action,
          p?.name || l.detail.split('—')[0]?.trim() || '—',
          p?.holooCode || '—',
          p?.category || '—',
          parsePrice(l.detail),
        ]
      })
      .filter((r) => r[3] === 'ثبت قیمت چاپ‌شده جدید' || (r[7] as number) > 0)
    return json({
      title: 'گزارش تغییرات قیمت چاپ‌شده (۳۰ روز اخیر)',
      columns: ['تاریخ', 'ساعت', 'ثبت‌کننده', 'عملیات', 'کالا', 'کد هلو', 'دسته', 'قیمت (تومان)'],
      rows,
      summary: {
        label: 'عملیات قیمت در ۳۰ روز اخیر',
        value: rows.length,
        extra: `${rows.filter((r) => r[3] === 'ثبت قیمت چاپ‌شده جدید').length} قیمت جدید ثبت شد — این‌ها را در هلو به‌روز کنید`,
      },
      unit: 'عملیات',
    })
  }

  if (type === 'pricetrend') {
    // روند هفتگی قیمت خرید — تورم واقعی هر کالا در ۱۰ هفته اخیر (هفته شمسی: شنبه تا جمعه)
    const since = new Date(Date.now() - 70 * 86400000)
    const [orders, products] = await Promise.all([
      db.order.findMany({
        where: { createdAt: { gte: since }, status: { not: 'CANCELLED' } },
        select: { id: true, createdAt: true },
      }),
      db.product.findMany({ select: { id: true, name: true, category: true } }),
    ])
    const orderIdSet = new Set(orders.map((o) => o.id))
    const items = await db.orderItem.findMany({
      where: { orderId: { in: [...orderIdSet] }, unitBuyPrice: { gt: 0 } },
      select: { orderId: true, productId: true, productName: true, unitBuyPrice: true },
    })
    const orderCreated = new Map(orders.map((o) => [o.id, o.createdAt]))

    // شنبه‌ی هفته جاری + ۹ هفته قبل → ستون‌های هفته
    const now = new Date()
    const satOffset = (d: Date) => (d.getDay() + 1) % 7 // شنبه=۰ … جمعه=۶
    const weekStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - satOffset(d))
    const currentWeek = weekStart(now)
    const weeks: Date[] = []
    for (let i = 9; i >= 0; i--) weeks.push(new Date(currentWeek.getFullYear(), currentWeek.getMonth(), currentWeek.getDate() - i * 7))
    const weekIdx = (d: Date) => {
      const ws = weekStart(d).getTime()
      for (let i = 0; i < weeks.length; i++) if (weeks[i].getTime() === ws) return i
      return -1
    }
    const weekLabel = (d: Date) => formatJalaliShort(d.toISOString())

    // productId → (weekIdx → جمع/شمار) و همه نقاط قیمت
    const perProduct = new Map<string, { name: string; category: string; sums: Map<number, { s: number; c: number }>; points: { t: number; p: number }[] }>()
    for (const it of items) {
      if (!it.productId) continue
      const o = orderCreated.get(it.orderId)
      if (!o) continue
      const wi = weekIdx(o)
      if (wi < 0) continue
      let e = perProduct.get(it.productId)
      if (!e) {
        e = { name: it.productName, category: products.find((p) => p.id === it.productId)?.category || '—', sums: new Map(), points: [] }
        perProduct.set(it.productId, e)
      }
      const s = e.sums.get(wi) || { s: 0, c: 0 }
      s.s += it.unitBuyPrice; s.c += 1
      e.sums.set(wi, s)
      e.points.push({ t: o.getTime(), p: it.unitBuyPrice })
    }

    const rows: (string | number)[][] = []
    let inflationSum = 0, inflationCount = 0
    for (const [pid, e] of perProduct) {
      // قیمت هفتگی: میانگین خریدهای همان هفته
      const weekly = weeks.map((_, i) => {
        const s = e.sums.get(i)
        return s ? Math.round(s.s / s.c) : null
      })
      // اولین و آخرین قیمت واقعی (بر اساس زمان خرید)
      e.points.sort((a, b) => a.t - b.t)
      const first = e.points[0].p
      const last = e.points[e.points.length - 1].p
      if (first <= 0 || e.points.length < 2 || first === last) continue
      const inflation = Math.round(((last - first) / first) * 1000) / 10
      inflationSum += inflation; inflationCount++
      rows.push([
        e.name,
        e.category,
        first,
        last,
        inflation,
        e.points.length,
        ...weekly.map((v) => v ?? '—'),
      ])
    }
    rows.sort((a, b) => (b[4] as number) - (a[4] as number))
    const weekCols = weeks.map((w) => `${weekLabel(w)}`)
    const moneyCols = ['قدیمی‌ترین قیمت خرید', 'جدیدترین قیمت خرید', ...weekCols]
    return json({
      title: 'روند هفتگی قیمت خرید (۱۰ هفته اخیر) — تورم واقعی قفسه',
      columns: ['کالا', 'دسته', 'قدیمی‌ترین قیمت خرید', 'جدیدترین قیمت خرید', 'تورم کل ٪', 'تعداد خرید', ...weekCols],
      rows,
      moneyColumns: moneyCols,
      summary: {
        label: 'میانگین تورم کالاهای پرنوسان',
        value: inflationCount ? Math.round((inflationSum / inflationCount) * 10) / 10 : 0,
        extra: `${inflationCount} کالا با تغییر قیمت در ۱۰ هفته اخیر — ستون‌ها میانگین قیمت خرید هر هفته شمسی است`,
      },
      unit: '٪',
    })
  }

  return fail('نوع گزارش نامعتبر است', 400)
}
