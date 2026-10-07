'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import { faMoney, faNum } from '@/lib/jalali'
import { Pill, Labeled, SearchInput, EmptyState, FaPriceInput } from '@/components/app/ui-bits'
import { Calculator, Plus, Trash2, ScanBarcode, Wand2, Camera } from 'lucide-react'
import { openBarcodeScanner } from '@/components/app/BarcodeScanner'
import { cn } from '@/lib/utils'

/**
 * ماشین‌حساب حاشیه سود — بازطراحی فایل اکسل خانم درویشی
 * margin = (printed price − single cost) / single cost × 100
 * single cost = full price of the line ÷ count  (includes discounts/tax when entered)
 * < 10% red, < 25% yellow, ≥ 25% green (matching the original spreadsheet thresholds)
 */
type Row = {
  key: string
  productId?: string
  name: string
  barcode: string
  count: number
  fullPrice: number // FP — total price of this product's line in the invoice
  printedPrice: number // P — price printed on the product
  desiredMargin: number // % — target margin
}

type ProductLite = { id: string; name: string; barcodes: string[]; buyPrice: number; sellPrice: number; category: string }

const RED_BELOW = 10
const GREEN_FROM = 25

export function marginTone(margin: number) {
  if (margin < RED_BELOW) return { color: '#b3372f', bg: '#fee2e2', label: 'کمتر از حد مجاز' }
  if (margin < GREEN_FROM) return { color: '#a16207', bg: '#fef9c3', label: 'قابل بهبود' }
  return { color: '#0e7a4a', bg: '#dcfce7', label: 'سود مناسب' }
}

export default function MarginCalculator({ prefill }: { prefill?: Partial<Row>[] }) {
  const [rows, setRows] = useState<Row[]>(
    prefill?.length
      ? prefill.map((p, i) => ({
          key: `p${i}`,
          name: p.name || '',
          barcode: p.barcode || '',
          count: p.count || 1,
          fullPrice: p.fullPrice || 0,
          printedPrice: p.printedPrice || 0,
          desiredMargin: 25,
          productId: p.productId,
        }))
      : []
  )
  const [products, setProducts] = useState<ProductLite[]>([])
  const [scan, setScan] = useState('')
  const scanRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api<{ products: ProductLite[] }>('/api/products').then((d) => setProducts(d.products)).catch(() => {})
  }, [])

  const addRow = (patch: Partial<Row> = {}) =>
    setRows((r) => [...r, { key: `r${Date.now()}${Math.random()}`, name: '', barcode: '', count: 1, fullPrice: 0, printedPrice: 0, desiredMargin: 25, ...patch }])

  const findByBarcode = (code: string) => {
    const c = code.trim()
    if (!c) return
    const hit = products.find((p) => p.barcodes.includes(c))
    if (hit) {
      const exists = rows.find((r) => r.productId === hit.id)
      if (exists) {
        toast.info(`«${hit.name}» از قبل در جدول است`)
        return
      }
      addRow({ productId: hit.id, name: hit.name, barcode: c })
      toast.success(`${hit.name} اضافه شد ✅`)
      setScan('')
      // audit trail: every scan is traceable (fire-and-forget)
      api('/api/activity', { method: 'POST', body: { action: 'اسکن بارکد (ماشین‌حساب قیمت)', entity: 'barcode', entityId: c, detail: hit.name } }).catch(() => {})
    } else {
      addRow({ barcode: c })
      toast.info('کالا در پایگاه پیدا نشد — ردیف دستی ساخته شد؛ نام را وارد کنید')
      setScan('')
      api('/api/activity', { method: 'POST', body: { action: 'اسکن بارکد ناشناس', entity: 'barcode', entityId: c, detail: 'کالا در پایگاه یافت نشد' } }).catch(() => {})
    }
  }

  const update = (key: string, patch: Partial<Row>) =>
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const applySuggested = async (row: Row) => {
    if (!row.productId) return toast.error('این ردیف به کالای پایگاه متصل نیست')
    const cost = row.count > 0 ? row.fullPrice / row.count : 0
    const suggested = Math.round(cost * (1 + row.desiredMargin / 100) / 100) * 100
    try {
      await api(`/api/products/${row.productId}`, { method: 'PATCH', body: { sellPrice: suggested } })
      toast.success(`قیمت فروش «${row.name}» روی ${faMoney(suggested)} تومان تنظیم شد ✅`)
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const worst = useMemo(() => {
    const margins = rows.filter((r) => r.count > 0 && r.printedPrice > 0).map((r) => (r.printedPrice - r.fullPrice / r.count) / (r.fullPrice / r.count))
    if (!margins.length) return null
    return Math.round(Math.min(...margins) * 1000) / 10
  }, [rows])

  return (
    <div>
      {/* scanner bar */}
      <div className="mb-4 rounded-2xl border-2 border-dashed border-[#c9a227]/50 bg-[#fdf6dd]/50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0e7a4a]/10 text-primary">
            <ScanBarcode size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black">بارکد کالا را اسکن یا تایپ کنید و Enter بزنید — ردیف خودکار ساخته می‌شود</p>
            <input
              ref={scanRef}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && findByBarcode(scan)}
              placeholder="بارکد…"
              dir="ltr"
              className="mt-2 w-full rounded-xl border-2 border-[#c9a227]/40 bg-white px-4 py-2.5 font-mono text-sm outline-none focus:border-[#c9a227]"
            />
          </div>
          <button
            onClick={() => openBarcodeScanner((code) => findByBarcode(code))}
            title="اسکن با دوربین موبایل"
            className="flex items-center gap-1.5 rounded-xl bg-[#0b2e20] px-4 py-2.5 text-xs font-extrabold text-[#c9a227] shadow-md"
          >
            <Camera size={15} /> دوربین
          </button>
          <button onClick={() => addRow()} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-white">
            <Plus size={14} /> ردیف دستی
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          emoji="🧮"
          title="جدول خالی است"
          hint="دقیقاً مثل فایل اکسل قبلی: تعداد، مبلغ کل خط فاکتور و قیمت چاپ‌شده را وارد کنید — حاشیه سود رنگی محاسبه می‌شود و قیمت فروش پیشنهادی می‌دهد"
        />
      ) : (
        <div className="scroll-gold overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[900px] text-right text-xs table-luxe">
            <thead className="bg-secondary/80 text-[10px] text-muted-foreground">
              <tr>
                <th className="p-2.5">کالا</th>
                <th className="p-2.5 w-20">تعداد</th>
                <th className="p-2.5 w-32">مبلغ کل خط فاکتور</th>
                <th className="p-2.5 w-28">قیمت چاپ‌شده</th>
                <th className="p-2.5 w-24">قیمت تمام‌شده</th>
                <th className="p-2.5 w-24">حاشیه سود</th>
                <th className="p-2.5 w-24">حاشیه مطلوب</th>
                <th className="p-2.5 w-32">قیمت فروش پیشنهادی</th>
                <th className="p-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cost = r.count > 0 ? r.fullPrice / r.count : 0
                const margin = cost > 0 ? ((r.printedPrice - cost) / cost) * 100 : 0
                const tone = marginTone(margin)
                const suggested = cost > 0 ? Math.round((cost * (1 + r.desiredMargin / 100)) / 100) * 100 : 0
                return (
                  <tr key={r.key} className="border-t border-border/50">
                    <td className="p-2">
                      <input
                        value={r.name}
                        onChange={(e) => update(r.key, { name: e.target.value })}
                        placeholder="نام کالا…"
                        className="w-full min-w-36 rounded-lg border border-input bg-white px-2 py-1.5 text-xs font-bold outline-none focus:border-primary"
                      />
                      {r.barcode && <span className="mt-0.5 block font-mono text-[9px] text-muted-foreground" dir="ltr">{r.barcode}</span>}
                    </td>
                    <td className="p-2">
                      <FaPriceInput value={r.count} onChange={(v) => update(r.key, { count: v === '' ? 0 : v })} ariaLabel="تعداد" className="w-full rounded-lg border border-input bg-white px-2 py-1.5" />
                    </td>
                    <td className="p-2">
                      <FaPriceInput value={r.fullPrice || ''} onChange={(v) => update(r.key, { fullPrice: v === '' ? 0 : v })} placeholder="FP" ariaLabel="مبلغ کل خط فاکتور" className="w-full rounded-lg border border-input bg-white px-2 py-1.5" />
                    </td>
                    <td className="p-2">
                      <FaPriceInput value={r.printedPrice || ''} onChange={(v) => update(r.key, { printedPrice: v === '' ? 0 : v })} placeholder="P" ariaLabel="قیمت چاپ‌شده" className="w-full rounded-lg border border-input bg-white px-2 py-1.5" />
                    </td>
                    <td className="p-2 text-center font-black text-foreground/80">{cost ? faMoney(cost) : '—'}</td>
                    <td className="p-2 text-center">
                      {cost > 0 && r.printedPrice > 0 ? (
                        <span className="inline-block rounded-full px-2.5 py-1 text-[11px] font-black" style={{ color: tone.color, background: tone.bg }} title={tone.label}>
                          {faNum(margin.toFixed(1))}٪
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2">
                      <FaPriceInput value={r.desiredMargin} onChange={(v) => update(r.key, { desiredMargin: v === '' ? 0 : v })} ariaLabel="حاشیه مطلوب (درصد)" className="w-full rounded-lg border border-input bg-white px-2 py-1.5" />
                    </td>
                    <td className="p-2 text-center">
                      {suggested > 0 ? (
                        <button onClick={() => applySuggested(r)} title="اعمال روی قیمت فروش کالا" className="w-full rounded-lg bg-[#0e7a4a]/10 py-1.5 font-black text-[#0e7a4a] transition hover:bg-[#0e7a4a] hover:text-white">
                          {faMoney(suggested)}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-2 text-center">
                      <button onClick={() => setRows((arr) => arr.filter((x) => x.key !== r.key))} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-[#fee2e2] hover:text-[#b3372f]">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-secondary/60 p-3.5 text-xs">
          <span className="flex items-center gap-2">
            <Wand2 size={15} className="text-[#8a6d10]" />
            ضوابط رنگی مثل فایل اکسل قبلی: قرمز زیر {faNum(RED_BELOW)}٪ • زرد زیر {faNum(GREEN_FROM)}٪ • سبز بالای {faNum(GREEN_FROM)}٪
          </span>
          {worst !== null && (
            <Pill label={`ضعیف‌ترین حاشیه: ${faNum(worst)}٪`} color={marginTone(worst).color} bg={marginTone(worst).bg} />
          )}
        </div>
      )}
    </div>
  )
}
