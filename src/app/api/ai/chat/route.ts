import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { getAiConfig, aiChatRaw, type AiMessage, type AiToolDef } from '@/lib/ai'
import { tokenizeQuery } from '@/lib/fuzzy'

export const dynamic = 'force-dynamic'

/**
 * R14 — POST /api/ai/chat — دستیار هوشمندِ داخل سر رسید (z.ai / GLM).
 * پیام‌های گفت‌وگو را می‌گیرد و با «ابزارهای» فقط-خواندنیِ پلتفرم پاسخ می‌سازد:
 * مدل می‌تواند وضعیت فروش/انبار/قیمت را خودش کوئری کند (حداکثر ۵ نوبت ابزار).
 * دسترسی: مالک/ادمین (مدیر سامانه) — با کلید z.ai که در تنظیمات ذخیره شده.
 */

const AI_ROLES = ['OWNER', 'ADMIN']

/* ─────────────────── ابزارهای فقط-خواندنی پلتفرم ─────────────────── */

type ToolFn = (args: Record<string, unknown>) => Promise<unknown>

const TOOLS: Record<string, { def: AiToolDef; fn: ToolFn }> = {
  get_kpi_overview: {
    def: {
      type: 'function',
      function: {
        name: 'get_kpi_overview',
        description: 'نمای کلی فروشگاه: تعداد کالاها، کم‌موجودها، فروش/خرید آخرین ماهِ دادهٔ هلو، فاکتورهای باز، سفارش‌های فعال',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    fn: async () => {
      const latest = await db.tradeRecord.findFirst({ orderBy: { month: 'desc' }, select: { month: true } })
      const month = latest?.month ?? null
      const [productCount, activeProducts, activeOrders, openInvoices, monthAgg, lowCount] = await Promise.all([
        db.product.count(),
        db.product.count({ where: { active: true } }),
        db.order.count({ where: { status: { in: ['SUBMITTED', 'APPROVED', 'RECEIVING', 'RECEIVED', 'VERIFIED'] } } }),
        db.marginInvoice.count({ where: { status: { in: ['draft', 'delivered', 'reviewing', 'final'] } } }),
        month
          ? db.tradeRecord.groupBy({ by: ['kind'], where: { month }, _sum: { lineTotal: true, qty: true }, _count: { _all: true } })
          : Promise.resolve([]),
        /* تقریب کم‌موجود: فعال با موجودی ≤ آستانه (COALESCE ستون‌به‌ستون — raw SQL) */
        db
          .$queryRaw<Array<{ n: number | bigint }>>(
            Prisma.sql`SELECT COUNT(*) AS n FROM Product WHERE active = 1 AND stock <= COALESCE(NULLIF(lowStockThreshold, 0), COALESCE(NULLIF(reorderLevel, 0), 5))`,
          )
          .then((r) => Number(r[0]?.n ?? 0))
          .catch(() => 0),
      ])
      const sell = monthAgg.find((g) => g.kind === 'SELL')
      const buy = monthAgg.find((g) => g.kind === 'BUY')
      return {
        month,
        productCount,
        activeProducts,
        lowStockCount: lowCount,
        activeOrders,
        openInvoices,
        sell: sell ? { rows: sell._count._all, totalRial: sell._sum.lineTotal ?? 0, qty: sell._sum.qty ?? 0 } : null,
        buy: buy ? { rows: buy._count._all, totalRial: buy._sum.lineTotal ?? 0, qty: buy._sum.qty ?? 0 } : null,
      }
    },
  },
  get_monthly_sales: {
    def: {
      type: 'function',
      function: {
        name: 'get_monthly_sales',
        description: 'جمع فروش و خرید هر ماه (از دادهٔ واقعی فاکتورهای هلو — تیر ۱۴۰۵ به بعد)',
        parameters: {
          type: 'object',
          properties: { months: { type: 'number', description: 'چند ماه اخیر (پیش‌فرض ۵)' } },
          additionalProperties: false,
        },
      },
    },
    fn: async (args) => {
      const take = Math.max(1, Math.min(12, Number(args.months) || 5))
      const all = await db.tradeRecord.groupBy({ by: ['month', 'kind'], _sum: { lineTotal: true, qty: true } })
      const months = [...new Set(all.map((m) => m.month))].sort().slice(-take)
      return months.map((month) => {
        const sell = all.find((g) => g.month === month && g.kind === 'SELL')
        const buy = all.find((g) => g.month === month && g.kind === 'BUY')
        return {
          month,
          sellRial: sell?._sum.lineTotal ?? 0,
          sellQty: sell?._sum.qty ?? 0,
          buyRial: buy?._sum.lineTotal ?? 0,
          buyQty: buy?._sum.qty ?? 0,
        }
      })
    },
  },
  get_top_products: {
    def: {
      type: 'function',
      function: {
        name: 'get_top_products',
        description: 'پرفروش‌ترین (یا پرخریدترین) کالاهای یک ماه بر اساس گردش ریالی',
        parameters: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['SELL', 'BUY'], description: 'پیش‌فرض SELL' },
            month: { type: 'string', description: 'مثل 1405-08؛ خالی = آخرین ماه' },
            limit: { type: 'number', description: 'پیش‌فرض ۱۰' },
          },
          additionalProperties: false,
        },
      },
    },
    fn: async (args) => {
      const kind = args.kind === 'BUY' ? 'BUY' : 'SELL'
      let month = String(args.month ?? '').trim()
      if (!/^\d{4}-\d{2}$/.test(month)) {
        const latest = await db.tradeRecord.findFirst({ where: { kind }, orderBy: { month: 'desc' }, select: { month: true } })
        month = latest?.month ?? ''
      }
      if (!month) return []
      const rows = await db.tradeRecord.groupBy({
        by: ['productId', 'productName'],
        where: { kind, month },
        _sum: { lineTotal: true, qty: true },
      })
      return rows
        .sort((a, b) => (b._sum.lineTotal ?? 0) - (a._sum.lineTotal ?? 0))
        .slice(0, Math.max(1, Math.min(30, Number(args.limit) || 10)))
        .map((r) => ({ name: r.productName, qty: r._sum.qty ?? 0, totalRial: r._sum.lineTotal ?? 0 }))
    },
  },
  get_low_stock: {
    def: {
      type: 'function',
      function: {
        name: 'get_low_stock',
        description: 'کم‌موجودترین کالاهای فعال برای سفارش مجدد',
        parameters: {
          type: 'object',
          properties: { limit: { type: 'number', description: 'پیش‌فرض ۱۵' } },
          additionalProperties: false,
        },
      },
    },
    fn: async (args) => {
      const limit = Math.max(1, Math.min(50, Number(args.limit) || 15))
      const rows = await db.product.findMany({
        where: { active: true },
        orderBy: { stock: 'asc' },
        take: 300,
        select: { name: true, stock: true, reorderLevel: true, lowStockThreshold: true, unit: true, sellPrice: true },
      })
      return rows
        .filter((p) => p.stock <= (p.lowStockThreshold ?? p.reorderLevel ?? 5))
        .slice(0, limit)
        .map((p) => ({ name: p.name, stock: p.stock, unit: p.unit, threshold: p.lowStockThreshold ?? p.reorderLevel ?? 5, sellPriceRial: p.sellPrice }))
    },
  },
  search_products: {
    def: {
      type: 'function',
      function: {
        name: 'search_products',
        description: 'جست‌وجوی فازی کالا (هر ترتیب واژه) — نام، موجودی، قیمت فروش/چاپی، آخرین خرید',
        parameters: {
          type: 'object',
          properties: { q: { type: 'string' }, limit: { type: 'number', description: 'پیش‌فرض ۸' } },
          required: ['q'],
          additionalProperties: false,
        },
      },
    },
    fn: async (args) => {
      const q = String(args.q ?? '').trim()
      if (!q) return []
      const tokens = tokenizeQuery(q)
      const { rankFuzzy } = await import('@/lib/fuzzy')
      const candidates = await db.product.findMany({
        where: { OR: [...tokens.map((t) => ({ name: { contains: t } })), { code: q }, { barcodesJson: { contains: q } }] },
        take: 400,
        select: { id: true, name: true, code: true, unit: true, stock: true, sellPrice: true, sellPrice2: true, lastBuyPrice: true, barcodesJson: true, active: true },
      })
      const ranked = rankFuzzy(q, candidates)
      return (ranked.matched.length ? ranked.matched : ranked.partial)
        .slice(0, Math.max(1, Math.min(20, Number(args.limit) || 8)))
        .map((p) => ({ name: p.name, code: p.code, unit: p.unit, stock: p.stock, sellPriceRial: p.sellPrice, printedPriceRial: p.sellPrice2, lastBuyRial: p.lastBuyPrice, active: p.active }))
    },
  },
  get_price_trend: {
    def: {
      type: 'function',
      function: {
        name: 'get_price_trend',
        description: 'روند قیمت ماهانهٔ یک کالا (میانگین فی خرید/فروش واقعی از فاکتورهای هلو)',
        parameters: {
          type: 'object',
          properties: { q: { type: 'string', description: 'نام یا بخشی از نام کالا' } },
          required: ['q'],
          additionalProperties: false,
        },
      },
    },
    fn: async (args) => {
      const q = String(args.q ?? '').trim()
      if (!q) return { error: 'نام کالا را بدهید' }
      const tokens = tokenizeQuery(q)
      const { rankFuzzy } = await import('@/lib/fuzzy')
      const candidates = await db.product.findMany({
        where: { OR: tokens.map((t) => ({ name: { contains: t } })) },
        take: 50,
        select: { id: true, name: true, unit: true, sellPrice: true, sellPrice2: true },
      })
      const ranked = rankFuzzy(q, candidates)
      const p = (ranked.matched[0] ?? ranked.partial[0]) as { id: string; name: string; unit: string; sellPrice: number; sellPrice2: number } | undefined
      if (!p) return { error: `کالایی با «${q}» پیدا نشد` }
      const series = await db.tradeRecord.groupBy({
        by: ['month', 'kind'],
        where: { productId: p.id },
        _avg: { unitPrice: true },
        _sum: { qty: true },
      })
      const months = [...new Set(series.map((s) => s.month))].sort()
      return {
        product: p.name,
        unit: p.unit,
        currentSellRial: p.sellPrice,
        currentPrintedRial: p.sellPrice2,
        months: months.map((month) => {
          const buy = series.find((s) => s.month === month && s.kind === 'BUY')
          const sell = series.find((s) => s.month === month && s.kind === 'SELL')
          return { month, avgBuyRial: buy?._avg.unitPrice ?? null, avgSellRial: sell?._avg.unitPrice ?? null }
        }),
      }
    },
  },
}

/* ─────────────────── حلقهٔ ابزار ─────────────────── */

const SYSTEM_PROMPT = `تو «دستیار هوشمند سر رسید» هستی — سامانهٔ یکپارچهٔ مدیریت هایپر زیتون (سوپرمارکت، رفسنجر).
کاربر این سامانه مدیر و کارمندان فروشگاه‌اند و فارسی صحبت می‌کنند.
وظیفهٔ تو: پاسخ به سؤال‌ها دربارهٔ پلتفرم و تحلیل عملکرد فروشگاه (فروش، سود، موجودی، قیمت‌ها) و پیشنهاد بهبور.
قواعد:
- همهٔ اعداد پولی در دیتابیس «ریال» است؛ در پاسخ ریال/تومان را شفاف بگو.
- برای هر ادعای عددی، اول ابزار مربوط را صدا بزن؛ از خودت عدد نساز.
- تحلیل‌ها کوتاه، عملی و برای مدیر مغازه باشد؛ از اصطلاحات تخصصی بی‌مورد پرهیز کن.
- دادهٔ فروش/خرید واقعی از فاکتورهای هلو (TradeRecord) از تیر ۱۴۰۵ به بعد است.
- اگر چیزی را نمی‌دانی یا ابزارش را نداری، صادقانه بگو.`

export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!AI_ROLES.includes(me.role)) return fail('دستیار هوشمند فعلاً برای مالک/ادمین فعال است', 403)

  const cfg = await getAiConfig()
  if (!cfg.configured) return fail('کلید z.ai تنظیم نشده — از تنظیمات دستیار، کلید API را ذخیره کنید', 400)

  const body = (await req.json().catch(() => null)) as { messages?: { role: string; content: string }[] } | null
  const history = Array.isArray(body?.messages) ? body!.messages! : []
  if (!history.length) return fail('پیامی برای ارسال نیست')

  /* فقط نقش‌های مجاز + سقف طول تاریخچه */
  const cleaned: AiMessage[] = history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-24)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 6000) }))
  if (!cleaned.length || cleaned[cleaned.length - 1].role !== 'user') return fail('آخرین پیام باید از کاربر باشد')

  const messages: AiMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...cleaned]
  const tools = Object.values(TOOLS).map((t) => t.def)
  const toolCallsMade: string[] = []

  try {
    for (let turn = 0; turn < 6; turn++) {
      const { message, finishReason } = await aiChatRaw(cfg, messages, tools)
      if (message.tool_calls && message.tool_calls.length) {
        messages.push({ role: 'assistant', content: message.content ?? '', tool_calls: message.tool_calls })
        for (const tc of message.tool_calls) {
          const tool = TOOLS[tc.function.name]
          let result: unknown
          if (!tool) {
            result = { error: `ابزار «${tc.function.name}» وجود ندارد` }
          } else {
            try {
              const args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>
              result = await tool.fn(args)
              toolCallsMade.push(tc.function.name)
            } catch (e) {
              result = { error: e instanceof Error ? e.message : 'خطای ابزار' }
            }
          }
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 24_000) })
        }
        continue
      }
      const answer = String(message.content ?? '').trim() || '—'
      await logActivity({
        userId: me.id,
        userName: me.fullName,
        action: 'ai.chat',
        actionLabel: 'دستیار هوشمند',
        category: 'system',
        detail: `${toolCallsMade.length ? `ابزارها: ${toolCallsMade.join('، ')}` : 'بدون ابزار'} — پاسخ ${answer.length} نویسه`,
      }).catch(() => {})
      return ok({ answer, tools: toolCallsMade, model: cfg.model })
    }
    return fail('دستیار بیش از حد از ابزار استفاده کرد — سؤال را مشخص‌تر بپرسید')
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'ارتباط با سرویس هوش مصنوعی برقرار نشد', 502)
  }
}
