import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, logActivity } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { canReports } from '@/lib/access'
import { todayJalaliDash, formatJalaliDash } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

const TYPES = ['products', 'suppliers', 'cheques', 'returns', 'margin'] as const
type ExportType = (typeof TYPES)[number]

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))]
  return '\uFEFF' + lines.join('\r\n')
}

function inRange(date: string | null | undefined, from: string, to: string): boolean {
  return !!date && date >= from && date <= to
}

/** GET /api/reports/export?type=…[&count=1][&from=&to=][&status=] */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!canReports(user.role)) return fail('دسترسی به این بخش ندارید', 403)

  const sp = req.nextUrl.searchParams
  const type = (sp.get('type') || '') as ExportType
  if (!TYPES.includes(type)) return fail('نوع خروجی نامعتبر است')

  const countOnly = sp.get('count') === '1'
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const status = sp.get('status') || ''

  const { headers, rows, count } = await buildExport(type, { from, to, status })
  const filename = `HyperZeytoon-${type}-${todayJalaliDash().replace(/-/g, '')}.xls`

  if (countOnly) {
    return ok({ count, filename })
  }

  await logActivity({
    userId: user.id,
    userName: user.fullName,
    action: 'reports.export',
    actionLabel: 'خروجی اکسل',
    category: 'reports',
    detail: `${type} — ${count} ردیف`,
  })

  const csv = toCsv(headers, rows)
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

async function buildExport(
  type: ExportType,
  filter: { from: string; to: string; status: string },
): Promise<{ headers: string[]; rows: unknown[][]; count: number }> {
  if (type === 'products') {
    const items = await db.product.findMany()
    return {
      headers: ['کد کالا', 'نام کالا', 'واحد', 'قیمت فروش (ریال)', 'آخرین قیمت خرید (ریال)', 'موجودی', 'حاشیه سود ٪'],
      rows: items.map((p) => [
        p.code ?? '',
        p.name,
        p.unit,
        p.sellPrice,
        p.lastBuyPrice,
        p.stock,
        p.lastBuyPrice > 0 ? Math.round(((p.sellPrice - p.lastBuyPrice) / p.lastBuyPrice) * 1000) / 10 : 0,
      ]),
      count: items.length,
    }
  }

  if (type === 'suppliers') {
    const items = await db.supplier.findMany()
    return {
      headers: ['کد', 'نام طرف‌حساب', 'شغل', 'طبقه‌بندی', 'تلفن', 'مانده', 'حد اعتبار', 'وضعیت'],
      rows: items.map((s) => [s.code ?? '', s.name, s.job ?? '', s.classification ?? '', s.phone ?? '', s.balance ?? 0, s.creditLimit, s.status]),
      count: items.length,
    }
  }

  if (type === 'cheques') {
    const all = await db.cheque.findMany({ orderBy: { dueDate: 'desc' } })
    const items = all.filter((c) => !filter.status || c.status === filter.status)
    return {
      headers: ['شماره چک', 'مبلغ (ریال)', 'گیرنده', 'سررسید', 'وضعیت', 'صادره از خودمان', 'یادداشت'],
      rows: items.map((c) => [c.number, c.amount, c.recipient ?? '', c.dueDate, c.status, c.selfIssued ? 'بله' : 'خیر', c.note ?? '']),
      count: items.length,
    }
  }

  if (type === 'returns') {
    const all = await db.returnRequest.findMany({ include: { items: true }, orderBy: { createdAt: 'desc' } })
    const users = await db.user.findMany()
    const userById = new Map(users.map((u) => [u.id, u]))
    const items = all.filter((r) => {
      const d = formatJalaliDash(r.submittedAt ?? r.createdAt)
      return (!filter.from || !filter.to || inRange(d, filter.from, filter.to))
    })
    return {
      headers: ['کد مرجوعی', 'تاریخ', 'مشتری', 'تعداد اقلام', 'مبلغ کل (ریال)', 'نوع تسویه', 'وضعیت', 'صندوقدار'],
      rows: items.map((r) => [
        r.code,
        formatJalaliDash(r.submittedAt ?? r.createdAt),
        r.customerName ?? '',
        r.items.length,
        r.totalAmount,
        r.settlementType,
        r.status,
        r.cashierId ? (userById.get(r.cashierId)?.fullName ?? '') : '',
      ]),
      count: items.length,
    }
  }

  // margin invoices
  const invoices = await db.marginInvoice.findMany({ where: { archived: false }, orderBy: { number: 'desc' } })
  const marginItems = await db.marginItem.findMany()
  const items = invoices.filter((inv) => {
    const d = inv.dateJalali ?? formatJalaliDash(inv.createdAt)
    return (!filter.from || !filter.to || inRange(d, filter.from, filter.to))
  })
  return {
    headers: ['شماره فاکتور', 'تاریخ', 'تأمین‌کننده', 'تعداد اقلام', 'جمع خرید (ریال)', 'درآمد (ریال)', 'سود (ریال)', 'حاشیه ٪'],
    rows: items.map((inv) => {
      const its = marginItems.filter((m) => m.invoiceId === inv.id)
      const purchase = its.reduce((s, i) => s + i.totalCost, 0)
      const revenue = its.reduce((s, i) => s + i.printedPrice * i.quantity, 0)
      const profit = revenue - purchase
      return [
        inv.number,
        inv.dateJalali ?? formatJalaliDash(inv.createdAt),
        inv.supplierName ?? '',
        its.length,
        purchase,
        revenue,
        profit,
        purchase > 0 ? Math.round((profit / purchase) * 1000) / 10 : 0,
      ]
    }),
    count: items.length,
  }
}
