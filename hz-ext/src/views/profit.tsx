import { useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn, Button, Input, Card, CardContent, CardHeader, CardTitle, Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, money, fa, toEnDigits, toFaDigits, todayJalali, Icon, I } from '../lib/hz'
/* ═══════════════════════════════════════════════════════════════
   profit/builder — «سودسنج پیشرفته» هایپر زیتون
   موتور حاشیه سود (پورت مستقیم سودسنج مستقل) + گیج زندهٔ SVG خالص
   حاشیه ٪ = (قیمت چاپی − بهای هر واحد) ÷ بهای هر واحد × ۱۰۰
   قرمز <۱۲٪ · کهربایی <۲۱٪ · سبز ≥۲۱٪
   ═══════════════════════════════════════════════════════════════ */

const THRESHOLD_RED = 12
const THRESHOLD_YELLOW = 21
const SUSPICIOUS_HIGH = 186 // معادل آستانه قدیمی ۶۵٪ بر مبنای فروش
const HISTORY_DROP_WARN = 0.3
const HISTORY_RISE_INFO = 1.0

/* واحدهای وزنی/حجمی — برای این واحدها، جای‌خالی «تعداد» به‌جای عدد، نام واحد است */
const WEIGHT_UNITS = ['کیلوگرم', 'کیلو', 'گرم', 'لیتر', 'میلی‌لیتر']
const isWeightyUnit = (u: string) => WEIGHT_UNITS.some((w) => (u || '').includes(w))

type Level = 'red' | 'yellow' | 'green' | 'none'
type Alert = {
  kind: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  message: string
  suggestion?: number
  suggestionLabel?: string
}
type History = { lastPrintedPrice: number | null; avgPrintedPrice: number | null; printedPriceCount: number; lastUnitCost: number | null }
type Analysis = {
  valid: boolean
  unitCost: number
  profitPerUnit: number
  revenue: number
  totalProfit: number
  margin: number
  level: Level
  alerts: Alert[]
  hasCritical: boolean
}

function fmtQuick(n: number): string {
  return fa(Math.round(n).toLocaleString('en-US'))
}

function marginLevel(margin: number): Level {
  if (!isFinite(margin)) return 'none'
  if (margin < THRESHOLD_RED) return 'red'
  if (margin < THRESHOLD_YELLOW) return 'yellow'
  return 'green'
}

/** همهٔ جابه‌جایی‌های ممکن دو رقم مجاور */
function transpositionCandidates(n: number): number[] {
  const s = Math.round(n).toString()
  const out: number[] = []
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] === s[i + 1]) continue
    const arr = s.split('')
    ;[arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]
    out.push(parseInt(arr.join(''), 10))
  }
  return out
}

/** تحلیل کامل یک قلم — همان منطق تحلیل زندهٔ سودسنج */
function analyzeItem(quantity: number, totalCost: number, printedPrice: number, history?: History | null): Analysis {
  const qtyOk = quantity > 0
  const costOk = totalCost > 0
  const valid = qtyOk && costOk && printedPrice > 0

  const unitCost = qtyOk ? totalCost / quantity : 0
  const profitPerUnit = valid ? printedPrice - unitCost : 0
  const revenue = qtyOk ? printedPrice * quantity : 0
  const totalProfit = valid ? profitPerUnit * quantity : 0
  const margin = valid ? (profitPerUnit / unitCost) * 100 : NaN
  const level = valid ? marginLevel(margin) : 'none'

  const alerts: Alert[] = []

  if (quantity > 0 && totalCost > 0 && printedPrice > 0) {
    /* ۱) قیمت چاپی کمتر از بهای تمام‌شده — بحرانی */
    if (printedPrice < unitCost) {
      let fix: number | undefined
      for (const m of [10, 100]) {
        const candidate = printedPrice * m
        if (candidate > unitCost && ((candidate - unitCost) / unitCost) * 100 < 900) { fix = candidate; break }
      }
      alerts.push({
        kind: 'below_cost', severity: 'critical',
        title: 'قیمت چاپی از بهای تمام‌شده کمتر است!',
        message: `بهای هر واحد ${fmtQuick(unitCost)} ریال است اما قیمت چاپی فقط ${fmtQuick(printedPrice)} ریال وارد شده؛ با این قیمت هر عدد ${fmtQuick(unitCost - printedPrice)} ریال ضرر می‌کنید. احتمال جا افتادن صفر یا خطای تایپ وجود دارد.`,
        suggestion: fix, suggestionLabel: fix ? `اصلاح به ${fmtQuick(fix)} ریال` : undefined,
      })
    }

    /* ۲) حاشیه غیرعادی بالا — صفر اضافی؟ */
    if (margin >= SUSPICIOUS_HIGH) {
      let fix: number | undefined
      const half = printedPrice / 10
      if (half > unitCost) {
        const hm = ((half - unitCost) / unitCost) * 100
        if (hm > 4 && hm < SUSPICIOUS_HIGH) fix = half
      }
      alerts.push({
        kind: 'high_margin', severity: 'warning',
        title: 'حاشیه سود غیرعادی بالاست — صفر اضافی؟',
        message: `حاشیه سود این قلم ${fa(Math.round(margin))}٪ است؛ چنین حاشیه‌ای در سوپرمارکت رایج نیست. اگر قیمت چاپی یک صفر اضافه دارد آن را اصلاح کنید.` + (fix ? ` با حذف یک صفر (${fmtQuick(fix)} ریال) حاشیه به ${fa(Math.round(((fix - unitCost) / unitCost) * 100))}٪ می‌رسد.` : ''),
        suggestion: fix, suggestionLabel: fix ? `اصلاح به ${fmtQuick(fix)} ریال` : undefined,
      })
    }

    /* ۳) مقایسه با سابقهٔ قیمت همان کالا */
    const lastPrinted = history?.lastPrintedPrice ?? null
    const avg = history?.avgPrintedPrice ?? lastPrinted
    if (avg && avg > 0 && (history?.printedPriceCount ?? 0) >= 1) {
      const dev = (printedPrice - avg) / avg
      /* اگر قیمت واردشده دقیقاً همان آخرین قیمت ثبت‌شده است (یا تقریباً همان است)
         هیچ هشدار سابقه‌ای نباید ظاهر شود — قیمت درست را دوباره «مشکوک» نکنیم */
      const matchesLast = lastPrinted !== null && printedPrice === lastPrinted
      const matchesAvg = Math.abs(dev) <= 0.02
      if (matchesLast || matchesAvg) {
        /* قیمت با سابقه سازگار است — بدون هشدار */
      } else {
        if (dev <= -HISTORY_DROP_WARN) {
          alerts.push({
            kind: 'price_drop', severity: 'warning',
            title: 'قیمت نسبت به ثبت‌های قبلی کمتر شده',
            message: `آخرین قیمت چاپی این کالا ${fmtQuick(avg)} ریال بوده؛ عدد فعلی ${fa(Math.round(Math.abs(dev) * 100))}٪ کمتر است. اگر تولیدکننده قیمت را بالا برده، این کاهش مشکوک است.`,
            suggestion: lastPrinted ?? avg,
            suggestionLabel: `استفاده از آخرین قیمت (${fmtQuick(lastPrinted ?? avg)} ریال)`,
          })
        } else if (dev >= HISTORY_RISE_INFO) {
          alerts.push({
            kind: 'price_jump', severity: 'info',
            title: 'رشد شدید قیمت نسبت به سابقه',
            message: `قیمت فعلی ${fa(Math.round(dev * 100))}٪ بیشتر از آخرین قیمت (${fmtQuick(avg)} ریال) است. در شرایط تورمی طبیعی است، اما اگر صفر اضافه تایپ شده باشد همین‌جا مشخص می‌شود.`,
          })
        }
        /* ۴) جابه‌جایی ارقام در برابر سابقه — فقط وقتی خود عدد واردشده
           از سابقه «دور» است ولی جابه‌جایی‌اش به سابقه «نزدیک» می‌شود؛
           اگر خود عدد به سابقه نزدیک باشد (≤۸٪) هشدار بی‌معناست */
        if (Math.abs(dev) > 0.08) {
          const swaps = transpositionCandidates(printedPrice)
          const match = swaps.find((s) => s !== printedPrice && Math.abs(s - avg) / avg <= 0.08)
          if (match !== undefined) {
            alerts.push({
              kind: 'transposition', severity: 'warning',
              title: 'احتمال جابه‌جایی ارقام',
              message: `با جابه‌جایی دو رقم از عدد وارد شده، به ${fmtQuick(match)} ریال می‌رسیم که به سابقهٔ قیمت این کالا نزدیک است.`,
              suggestion: match, suggestionLabel: `اصلاح به ${fmtQuick(match)} ریال`,
            })
          }
        }
      }
    }

    /* ۵) تغییر محسوس بهای خرید نسبت به خرید قبلی */
    const lastCost = history?.lastUnitCost ?? null
    if (lastCost && lastCost > 0) {
      const costDev = (unitCost - lastCost) / lastCost
      if (Math.abs(costDev) >= 0.5) {
        alerts.push({
          kind: 'cost_change', severity: 'info',
          title: costDev > 0 ? 'بهای خرید نسبت به دفعه قبل افزایش جدی داشته' : 'بهای خرید نسبت به دفعه قبل کاهش جدی داشته',
          message: `بهای قبلی هر واحد ${fmtQuick(lastCost)} ریال بود و الان ${fmtQuick(unitCost)} ریال است (${costDev > 0 ? '+' : '−'}${fa(Math.round(Math.abs(costDev) * 100))}٪). اگر این تغییر عمدی نیست، جمع مبلغ خرید را بررسی کنید.`,
        })
      }
    }

    /* ۶) حاشیه زیر ۱۲٪ */
    if (printedPrice >= unitCost && margin < THRESHOLD_RED) {
      const target = Math.ceil(unitCost * (1 + THRESHOLD_YELLOW / 100))
      alerts.push({
        kind: 'low_margin', severity: 'warning',
        title: 'حاشیه سود زیر ۱۲٪ است',
        message: `با قیمت چاپی فعلی حاشیه سود فقط ${fa(margin.toFixed(1))}٪ است که زیر حد مجاز (${fa(THRESHOLD_RED)}٪) قرار دارد. قیمت فروش پیشنهادی برای رسیدن به حداقل ۲۱٪: ${fmtQuick(target)} ریال.`,
        suggestion: target, suggestionLabel: 'قیمت برای حاشیه ۲۱٪',
      })
    }
  } else if (printedPrice === 0 && (quantity > 0 || totalCost > 0)) {
    alerts.push({
      kind: 'zero_price', severity: 'info',
      title: 'قیمت چاپی وارد نشده',
      message: 'برای محاسبه حاشیه سود، قیمت چاپی روی کالا را وارد کنید.',
    })
  }

  return {
    valid, unitCost, profitPerUnit, revenue, totalProfit,
    margin: valid ? margin : 0, level, alerts,
    hasCritical: alerts.some((a) => a.severity === 'critical'),
  }
}

/* ─────────────── گیج نیم‌دایره‌ای SVG خالص — مقیاس دولخته ───────────────
   نیمهٔ نخست کمان: ۰ تا ۳۰٪ (تفکیک‌پذیری بالا در ناحیهٔ قرمز/زرد)
   نیمهٔ دوم: ۳۰ تا ۱۵۰٪ — عقربه با CSS transition می‌چرخد */
const GAUGE_SPLIT = 30
const GAUGE_MAX = 150
const G_R = 80
const G_CX = 100
const G_CY = 100
const NEEDLE_LEN = G_R - 16
const ARC_LEN = Math.PI * G_R

function gPt(theta: number, r = G_R): [number, number] {
  const rad = (theta * Math.PI) / 180
  return [G_CX + r * Math.cos(rad), G_CY - r * Math.sin(rad)]
}
function gArc(theta1: number, theta2: number, r = G_R): string {
  const [x1, y1] = gPt(theta1, r)
  const [x2, y2] = gPt(theta2, r)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}
function gFrac(v: number): number {
  const c = Math.max(-4, Math.min(GAUGE_MAX, v))
  return c <= GAUGE_SPLIT ? c / (GAUGE_SPLIT * 2) : 0.5 + (c - GAUGE_SPLIT) / ((GAUGE_MAX - GAUGE_SPLIT) * 2)
}
const gAngle = (v: number) => 180 - gFrac(v) * 180

const G_COLORS = { red: '#d3453f', yellow: '#e0a11b', green: '#3d9a50', none: '#a8a29e' } as const
const G_TICKS = [
  { v: THRESHOLD_RED, label: '۱۲' },
  { v: THRESHOLD_YELLOW, label: '۲۱' },
  { v: GAUGE_SPLIT, label: '۳۰' },
  { v: GAUGE_MAX, label: '۱۵۰' },
]

function MarginGauge({ result, caption }: { result: Analysis; caption: string }) {
  const { level, margin, valid, hasCritical } = result
  const value = valid ? (hasCritical ? Math.min(margin, -2) : margin) : 0
  const frac = gFrac(value)
  const color = hasCritical || level === 'red' ? G_COLORS.red : level === 'yellow' ? G_COLORS.yellow : level === 'green' ? G_COLORS.green : G_COLORS.none

  return (
    <div
      className={cn(
        'rounded-2xl border bg-white p-4 transition-shadow',
        hasCritical ? 'border-rose-300 shadow-[0_0_0_4px_rgba(211,69,63,0.10)]' : 'border-stone-200',
        !hasCritical && level === 'red' && 'border-rose-200',
        level === 'yellow' && !hasCritical && 'border-amber-200',
        level === 'green' && !hasCritical && 'border-emerald-200',
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-stone-500">{caption}</span>
        {hasCritical ? (
          <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
            <I.alertTriangle className="inline" size={12} /> قیمت مشکوک است!
          </span>
        ) : valid ? (
          <span className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">
            <I.trendingUp className="inline" size={12} /> سود هر واحد: {money(result.profitPerUnit)} ریال
          </span>
        ) : null}
      </div>

      <div className="relative mx-auto w-full" dir="ltr">
        <svg viewBox="0 0 200 128" className="w-full" role="img" aria-label={valid ? `حاشیه سود ${fa(margin.toFixed(1))} درصد` : 'گیج حاشیه سود'}>
          {/* ریل زمینه */}
          <path d={gArc(180, 0)} fill="none" stroke="#e7e5e4" strokeWidth="15" strokeLinecap="round" />
          {/* ناحیهٔ قرمز */}
          <path d={gArc(gAngle(0), gAngle(THRESHOLD_RED))} fill="none" stroke={G_COLORS.red} strokeOpacity="0.88" strokeWidth="15" strokeLinecap="round" />
          {/* ناحیهٔ کهربایی */}
          <path d={gArc(gAngle(THRESHOLD_RED), gAngle(THRESHOLD_YELLOW))} fill="none" stroke={G_COLORS.yellow} strokeOpacity="0.9" strokeWidth="15" />
          {/* ناحیهٔ سبز */}
          <path d={gArc(gAngle(THRESHOLD_YELLOW), gAngle(GAUGE_MAX))} fill="none" stroke={G_COLORS.green} strokeOpacity="0.9" strokeWidth="15" strokeLinecap="round" />
          {/* کمان مقدار جاری — با گذار CSS روی stroke-dashoffset */}
          <path
            d={gArc(180, 0)}
            fill="none"
            stroke={color}
            strokeOpacity="0.9"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeDasharray={`${ARC_LEN} ${ARC_LEN}`}
            strokeDashoffset={ARC_LEN * (1 - frac)}
            style={{ transition: 'stroke-dashoffset 400ms cubic-bezier(.4,1.2,.6,1), stroke 300ms' }}
          />
          {/* نشانه‌های آستانه */}
          {G_TICKS.map((t) => {
            const [x1, y1] = gPt(gAngle(t.v), G_R - 11)
            const [x2, y2] = gPt(gAngle(t.v), G_R + 11)
            const [lx, ly] = gPt(gAngle(t.v), G_R + 23)
            return (
              <g key={t.v}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#a8a29e" strokeWidth="1.6" />
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fill="#78716c" fontWeight="600">{t.label}٪</text>
              </g>
            )
          })}
          {/* عقربه — چرخش با CSS transition */}
          <g
            style={{
              transform: `rotate(${frac * 180}deg)`,
              transformOrigin: '100px 100px',
              transformBox: 'view-box',
              transition: 'transform 400ms cubic-bezier(.34,1.3,.64,1)',
            }}
          >
            <line x1={G_CX} y1={G_CY} x2={G_CX - NEEDLE_LEN} y2={G_CY} stroke="#44403c" strokeWidth="4" strokeLinecap="round" />
            <circle cx={G_CX - NEEDLE_LEN} cy={G_CY} r="4.5" fill={color} stroke="#f5f5f4" strokeWidth="1.5" />
          </g>
          <circle cx={G_CX} cy={G_CY} r="9" fill="#44403c" />
          <circle cx={G_CX} cy={G_CY} r="4" fill="#f5f5f4" />
        </svg>

        {/* عدد بزرگ زیر کمان */}
        <div className="pointer-events-none mt-0.5 text-center" dir="rtl" aria-live="polite">
          {valid ? (
            <div className="flex items-end justify-center gap-1">
              <span
                dir="ltr"
                className={cn(
                  'text-4xl font-extrabold leading-none',
                  hasCritical || level === 'red' ? 'text-rose-600' : level === 'yellow' ? 'text-amber-600' : 'text-emerald-600',
                )}
              >
                {fa(value.toFixed(1)).replace('.', '٫')}
              </span>
              <span className="pb-0.5 text-lg font-bold text-stone-400">٪</span>
            </div>
          ) : (
            <span className="text-2xl font-extrabold text-stone-400">—</span>
          )}
          <div className="mt-0.5 text-[10px] font-medium text-stone-400">
            {hasCritical
              ? 'زیر بهای تمام‌شده!'
              : valid
                ? level === 'red'
                  ? 'پرخطر — زیر ۱۲٪'
                  : level === 'yellow'
                    ? 'هشدار — زیر ۲۱٪'
                    : 'مطلوب — ۲۱٪ و بالاتر (سود بر بهای خرید)'
                : 'مقادیر را کامل وارد کنید'}
          </div>
        </div>
      </div>

      {/* آمار کوچک */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-stone-100 px-2 py-1.5">
          <div className="text-[10px] text-stone-500">فی خرید (بهای هر واحد)</div>
          <div className="text-sm font-bold" dir="ltr">{valid ? money(result.unitCost) : '—'}</div>
        </div>
        <div className="rounded-xl bg-stone-100 px-2 py-1.5">
          <div className="text-[10px] text-stone-500">سود کل این ردیف</div>
          <div className="text-sm font-bold" dir="ltr">{valid ? money(result.totalProfit) : '—'}</div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────── نوع ردیف فاکتور ─────────────── */
type Row = {
  key: number
  productId: string | null
  barcode: string | null
  name: string
  unit: string
  quantity: number
  totalCost: number
  printedPrice: number
  analysis: Analysis
}

const num = (s: string): number => {
  const v = Number(toEnDigits(String(s ?? '')).replace(/[^\d.]/g, ''))
  return isFinite(v) ? v : 0
}

let rowSeq = 0

export default function ProfitView() {
  const { user } = useShell()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  /* سربرگ فاکتور */
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; code: string }[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [supplierText, setSupplierText] = useState('')
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [nextNumber, setNextNumber] = useState<number | null>(null)
  const [dateJalali, setDateJalali] = useState(todayJalali())
  const [note, setNote] = useState('')

  /* فرم قلم */
  const [barcode, setBarcode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [productId, setProductId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('عدد')
  const [qty, setQty] = useState('')
  const [totalCost, setTotalCost] = useState('')
  const [printedPrice, setPrintedPrice] = useState('')
  const [qtyErr, setQtyErr] = useState('')
  const [history, setHistory] = useState<History | null>(null)
  const [items, setItems] = useState<Row[]>([])

  const barcodeRef = useRef<any>(null)
  const supplierRef = useRef<any>(null)
  const qtyRef = useRef<any>(null)
  const costRef = useRef<any>(null)
  const priceRef = useRef<any>(null)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const [sup, inv] = await Promise.all([api('/api/margin/suppliers'), api('/api/margin')])
    setLoading(false)
    if (sup.ok && Array.isArray(sup.data?.suppliers)) setSuppliers(sup.data.suppliers)
    else if (!sup.ok) toast.error(sup.error || 'دریافت فهرست تأمین‌کننده‌ها ناموفق بود')
    if (inv.ok && Array.isArray(inv.data?.invoices)) {
      const max = inv.data.invoices.reduce((m: number, r: any) => Math.max(m, Number(r.number) || 0), 0)
      setNextNumber(max > 0 ? max + 1 : 1)
    }
  }

  /* تحلیل زندهٔ قلم جاری */
  const live = useMemo(
    () => analyzeItem(num(qty), num(totalCost), num(printedPrice), history),
    [qty, totalCost, printedPrice, history],
  )

  /* جمع‌بندی وزنی فاکتور */
  const summary = useMemo(() => {
    let cost = 0, revenue = 0
    for (const r of items) { cost += r.totalCost || 0; revenue += (r.printedPrice || 0) * (r.quantity || 0) }
    const profit = revenue - cost
    return { count: items.length, totalQty: items.reduce((s, r) => s + r.quantity, 0), cost, revenue, profit, margin: cost > 0 ? (profit / cost) * 100 : 0 }
  }, [items])

  const summaryAnalysis: Analysis = {
    valid: summary.cost > 0, unitCost: 0, profitPerUnit: 0,
    revenue: summary.revenue, totalProfit: summary.profit,
    margin: summary.margin, level: marginLevel(summary.margin), alerts: [], hasCritical: false,
  }

  const supplierMatches = useMemo(() => {
    const t = supplierText.trim()
    const list = t ? suppliers.filter((s) => s.name.includes(t)) : suppliers
    return list.slice(0, 60)
  }, [suppliers, supplierText])

  /* اسکن بارکد → GET ?barcode=، در غیر این صورت ?q= */
  async function scanBarcode(raw?: string) {
    const code = toEnDigits(String(raw ?? barcode)).trim()
    if (!code) return
    if (!/^\d{8,}$/.test(code)) {
      toast.error('بارکد باید حداقل ۸ رقم باشد')
      return
    }
    setScanning(true)
    let p: any = null
    const exact = await api(`/api/products/search${qs({ barcode: code })}`)
    if (exact.ok && exact.data?.id) p = exact.data
    else {
      const fuzzy = await api(`/api/products/search${qs({ q: code })}`)
      if (fuzzy.ok && Array.isArray(fuzzy.data?.products) && fuzzy.data.products.length > 0) p = fuzzy.data.products[0]
    }
    setScanning(false)
    if (!p) {
      toast.error('کالایی با این بارکد یافت نشد — نام کالا را دستی وارد کنید')
      return
    }
    fillProduct(p)
  }

  function fillProduct(p: any) {
    setProductId(p.id ?? null)
    setName(p.name ?? '')
    setUnit(p.unit || 'عدد')
    const sell = Number(p.sellPrice) || 0
    const lastBuy = Number(p.lastBuyPrice) || 0
    setHistory({
      lastPrintedPrice: sell > 0 ? sell : null,
      avgPrintedPrice: sell > 0 ? sell : null,
      printedPriceCount: sell > 0 ? 1 : 0,
      lastUnitCost: lastBuy > 0 ? lastBuy : null,
    })
    toast.success(`«${p.name ?? ''}» پیدا شد`)
    qtyRef.current?.focus?.()
  }

  function resetItemForm() {
    setBarcode(''); setProductId(null); setName(''); setUnit('عدد'); setQty('')
    setTotalCost(''); setPrintedPrice(''); setHistory(null); setQtyErr('')
  }

  function applySuggestion(v: number) {
    setPrintedPrice(String(Math.round(v)))
  }

  function addItem() {
    const n = name.trim()
    if (!n) return toast.error('نام کالا را وارد کنید')
    const q = num(qty)
    if (q < 1) { setQtyErr('تعداد را وارد کنید (حداقل ۱)'); qtyRef.current?.focus?.(); return }
    const c = num(totalCost)
    if (c <= 0) return toast.error('جمع بهای خرید را وارد کنید')
    const pp = num(printedPrice)
    if (pp <= 0) return toast.error('قیمت چاپی را وارد کنید')
    setItems((prev) => [...prev, { key: ++rowSeq, productId, barcode: barcode.trim() || null, name: n, unit, quantity: Math.round(q * 1000) / 1000, totalCost: Math.round(c), printedPrice: Math.round(pp), analysis: live }])
    if (live.hasCritical) toast.error('قلم با هشدار بحرانی ثبت شد — قیمت چاپی کمتر از بهای تمام‌شده است؛ پیش از ذخیره حتماً بازبینی کنید')
    else if (live.level === 'red') toast.warning(`حاشیه این قلم ${fa(live.margin.toFixed(1))}٪ و زیر حد ${fa(THRESHOLD_RED)}٪ است`)
    else toast.success(`«${n}» با حاشیه ${fa(live.margin.toFixed(1))}٪ افزوده شد`)
    resetItemForm()
    barcodeRef.current?.focus?.()
  }

  function removeItem(key: number) {
    setItems((prev) => prev.filter((r) => r.key !== key))
  }

  function newInvoice() {
    setItems([])
    setNote('')
    setSupplierId('')
    setSupplierText('')
    resetItemForm()
    setNextNumber((n) => (n == null ? n : n + 1))
    barcodeRef.current?.focus?.()
    toast.info('فاکتور جدید آماده است')
  }

  async function save() {
    if (items.length === 0) return toast.error('فاکتور باید حداقل یک قلم داشته باشد')
    const sName = supplierText.trim()
    if (!sName) return toast.error('تأمین‌کننده را انتخاب یا نامش را وارد کنید')
    setSaving(true)
    const r = await api('/api/margin', {
      method: 'POST',
      body: {
        supplierId: supplierId || null,
        supplierName: sName,
        note: note.trim() || null,
        dateJalali,
        items: items.map((it) => ({
          productId: it.productId,
          barcode: it.barcode,
          name: it.name,
          productName: it.name,
          unit: it.unit,
          quantity: it.quantity,
          totalCost: it.totalCost,
          unitCost: Math.round(it.analysis.unitCost),
          printedPrice: it.printedPrice,
          margin: it.analysis.margin,
          profitPerUnit: Math.round(it.analysis.profitPerUnit),
          level: it.analysis.level,
          alerts: it.analysis.alerts.map((a) => a.kind),
        })),
      },
    })
    setSaving(false)
    if (!r.ok) return toast.error(r.error || 'ثبت فاکتور ناموفق بود')
    toast.success(`فاکتور شماره ${fa(r.data?.number ?? '')} با ${fa(items.length)} قلم ثبت شد`)
    newInvoice()
  }

  /* میان‌برهای سراسری — فقط Alt (بدون Ctrl/Shift/Meta) بر اساس کلید فیزیکی */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return
      if (e.code === 'KeyB') { e.preventDefault(); barcodeRef.current?.focus?.(); barcodeRef.current?.select?.() }
      else if (e.code === 'KeyN') { e.preventDefault(); newInvoice() }
      else if (e.code === 'KeyS') { e.preventDefault(); void save() }
      else if (e.code === 'KeyF') { e.preventDefault(); supplierRef.current?.focus?.(); setSupplierOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const target21 = live.valid && live.margin < THRESHOLD_YELLOW
    ? Math.ceil(live.unitCost * (1 + THRESHOLD_YELLOW / 100))
    : null

  const levelBadge = (lvl: Level) =>
    lvl === 'red' ? { cls: 'bg-rose-100 text-rose-700', label: 'قرمز' }
      : lvl === 'yellow' ? { cls: 'bg-amber-100 text-amber-700', label: 'کهربایی' }
        : { cls: 'bg-emerald-100 text-emerald-700', label: 'سبز' }

  if (loading) {
    return (
      <Card><CardContent className="p-10 text-center text-stone-500">
        <I.loader className="mx-auto mb-3 animate-spin" size={22} />
        در حال دریافت تأمین‌کننده‌ها و فاکتورها…
      </CardContent></Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* سربرگ: راهنمای میان‌بر + راهنمای آستانه‌ها */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-[11px] text-stone-500">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1 font-bold text-stone-600"><I.sparkles size={13} /> میان‌برها:</span>
          <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-bold" dir="ltr">Alt+N</span> فاکتور جدید
          <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-bold" dir="ltr">Alt+B</span> بارکد
          <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-bold" dir="ltr">Alt+S</span> ذخیره
          <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-bold" dir="ltr">Alt+F</span> تأمین‌کننده
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-full" style={{ background: G_COLORS.red }} /> قرمز &lt;۱۲٪</span>
          <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-full" style={{ background: G_COLORS.yellow }} /> کهربایی &lt;۲۱٪</span>
          <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-full" style={{ background: G_COLORS.green }} /> سبز ≥۲۱٪</span>
        </div>
      </div>

      {/* فرم (راست) + گیج زنده (چپ) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* سربرگ فاکتور */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon name="clipboard" size={18} /> سربرگ فاکتور خرید
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative sm:col-span-2">
                <label className="mb-1 block text-xs text-stone-500">تأمین‌کننده *</label>
                <Input
                  ref={supplierRef}
                  value={supplierText}
                  placeholder="جستجو یا انتخاب تأمین‌کننده…"
                  onFocus={() => setSupplierOpen(true)}
                  onChange={(e: any) => { setSupplierText(e.target.value); setSupplierId(''); setSupplierOpen(true) }}
                  onBlur={() => setTimeout(() => setSupplierOpen(false), 150)}
                />
                {supplierId ? (
                  <span className="pointer-events-none absolute left-2 top-6 flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                    <I.check size={11} /> انتخاب‌شده
                  </span>
                ) : null}
                {supplierOpen && supplierMatches.length > 0 && (
                  <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg">
                    {supplierMatches.map((s) => (
                      <button
                        key={s.id} type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-xs hover:bg-emerald-50"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setSupplierId(s.id); setSupplierText(s.name); setSupplierOpen(false) }}
                      >
                        <span className="font-medium">{s.name}</span>
                        {s.code ? <span className="shrink-0 text-stone-400">{toFaDigits(s.code)}</span> : null}
                      </button>
                    ))}
                    {suppliers.length > supplierMatches.length ? (
                      <div className="border-t border-stone-200 px-3 py-1.5 text-[10px] text-stone-400">… از {fa(suppliers.length)} تأمین‌کننده — برای محدودکردن، تایپ کنید</div>
                    ) : null}
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs text-stone-500">شماره فاکتور (خودکار)</label>
                <Input readOnly value={nextNumber == null ? '—' : fa(nextNumber)} className="bg-stone-50 text-center font-bold" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-stone-500">تاریخ فاکتور</label>
                <Input
                  value={toFaDigits(dateJalali).replace(/-/g, '/')}
                  onChange={(e: any) => setDateJalali(toEnDigits(e.target.value).replace(/[^۰-۹0-9\/-]/g, '').replace(/\//g, '-'))}
                  placeholder="۱۴۰۵/۰۷/۲۷" className="text-center" />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label className="mb-1 block text-xs text-stone-500">یادداشت فاکتور (اختیاری)</label>
                <Input value={note} onChange={(e: any) => setNote(e.target.value)} placeholder="مثلاً: نسیه دو هفته‌ای…" />
              </div>
            </CardContent>
          </Card>

          {/* فرم ثبت قلم */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <I.plus size={18} /> ثبت قلم جدید
                <span className="text-[11px] font-normal text-stone-400">با بارکدخوان یا کیبورد — Enter: فیلد بعدی؛ در «قیمت چاپی» ثبت قلم</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-stone-500">بارکد کالا</label>
                  <div className="flex gap-2">
                    <Input
                      ref={barcodeRef}
                      autoFocus
                      dir="ltr"
                      inputMode="numeric"
                      className="num text-end"
                      value={barcode}
                      placeholder="اسکن یا تایپ بارکد…"
                      onChange={(e: any) => setBarcode(toEnDigits(e.target.value).replace(/\D/g, ''))}
                      onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); void scanBarcode() } }}
                    />
                    <Button variant="secondary" className="shrink-0 gap-1" disabled={scanning} onClick={() => void scanBarcode()}>
                      {scanning ? <I.loader size={15} className="animate-spin" /> : <I.search size={15} />} جستجو
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-stone-500">نام کالا *</label>
                  <Input value={name} onChange={(e: any) => setName(e.target.value)} placeholder="نام کالا…"
                    onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); qtyRef.current?.focus?.() } }} />
                </div>
              </div>

              {/* چیپ‌های سابقه */}
              {history && (history.lastUnitCost || history.lastPrintedPrice) ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-stone-400"><I.history size={12} className="inline" /> سابقهٔ این کالا — برای پرکردن سریع کلیک کنید:</span>
                  {history.lastUnitCost ? (
                    <button
                      type="button"
                      onClick={() => { const q = Math.max(1, Math.trunc(num(qty)) || 1); setTotalCost(String(Math.round(history.lastUnitCost! * q))); toast.info(`جمع خرید از آخرین خرید پر شد (${fa(q)} × ${money(history.lastUnitCost)})`) }}
                      className="flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-bold text-teal-700 hover:bg-emerald-100"
                    >
                      <I.banknote size={12} /> آخرین خرید: {money(history.lastUnitCost)} ریال
                    </button>
                  ) : null}
                  {history.lastPrintedPrice ? (
                    <button
                      type="button"
                      onClick={() => { setPrintedPrice(String(Math.round(history.lastPrintedPrice!))); toast.info('قیمت چاپی از آخرین قیمت فروش پر شد') }}
                      className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                    >
                      <I.receipt size={12} /> آخرین قیمت چاپی: {money(history.lastPrintedPrice)} ریال
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs text-stone-500">تعداد ({toFaDigits(unit)}) *</label>
                  <Input
                    ref={qtyRef}
                    dir="ltr"
                    inputMode="decimal"
                    className={cn('num text-end', qtyErr && 'border-rose-300')}
                    value={toFaDigits(qty).replace(/\./g, '٫')}
                    placeholder={isWeightyUnit(unit) ? unit : 'تعداد'}
                    onChange={(e: any) => {
                      const v = toEnDigits(e.target.value).replace(/٫/g, '.').replace(/[^\d.]/g, '')
                      setQty(v)
                      if (qtyErr) setQtyErr('')
                    }}
                    onKeyDown={(e: any) => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      if (num(qty) < 1) { setQtyErr('تعداد را وارد کنید (حداقل ۱)'); return }
                      costRef.current?.focus?.()
                    }}
                  />
                  {qtyErr && <p className="mt-1 text-[11px] font-medium text-rose-600">{qtyErr}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs text-stone-500">جمع بهای خرید (ریال) *</label>
                  <Input
                    ref={costRef}
                    dir="ltr"
                    inputMode="decimal"
                    className="num text-end"
                    value={toFaDigits(totalCost)}
                    placeholder="مثلاً ۲۵۰٬۰۰۰"
                    onChange={(e: any) => setTotalCost(toEnDigits(e.target.value).replace(/٫/g, '.').replace(/[^\d.]/g, ''))}
                    onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); priceRef.current?.focus?.() } }}
                  />
                  {live.valid ? <p className="mt-1 text-[10px] text-stone-400">فی هر واحد: {money(live.unitCost)} ریال</p> : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs text-stone-500">قیمت چاپی (ریال) *</label>
                  <Input
                    ref={priceRef}
                    dir="ltr" inputMode="decimal" className="num text-end"
                    value={toFaDigits(printedPrice)}
                    onChange={(e: any) => setPrintedPrice(toEnDigits(e.target.value).replace(/٫/g, '.').replace(/[^\d.]/g, ''))}
                    onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                    placeholder="قیمت روی برچسب کالا"
                  />
                  {target21 ? (
                    <button type="button" onClick={() => applySuggestion(target21)} className="mt-1 flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100">
                      <I.trendingUp size={11} /> قیمت برای حاشیه ۲۱٪: {money(target21)} ریال
                    </button>
                  ) : null}
                </div>
              </div>

              {/* هشدارهای زندهٔ تحلیل */}
              {live.alerts.length > 0 ? (
                <div className="space-y-2">
                  {live.alerts.map((a, i) => (
                    <div
                      key={i}
                      className={cn(
                        'rounded-lg border p-3',
                        a.severity === 'critical' ? 'border-rose-300 bg-rose-50' : a.severity === 'warning' ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-stone-50',
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className={cn('flex items-center gap-1.5 text-xs font-bold', a.severity === 'critical' ? 'text-rose-700' : a.severity === 'warning' ? 'text-amber-700' : 'text-stone-600')}>
                          <Icon name={a.severity === 'critical' ? 'alertTriangle' : a.severity === 'warning' ? 'alertTriangle' : 'info'} size={14} />
                          {a.title}
                        </div>
                        {a.suggestion && a.suggestionLabel ? (
                          <Button size="sm" variant="outline" className="h-7 gap-1 border-stone-300 text-xs" onClick={() => applySuggestion(a.suggestion!)}>
                            <I.check size={12} /> {a.suggestionLabel}
                          </Button>
                        ) : null}
                      </div>
                      <p className={cn('mt-1 text-[11px] leading-5', a.severity === 'critical' ? 'text-rose-600' : a.severity === 'warning' ? 'text-amber-700' : 'text-stone-500')}>{a.message}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-2 border-t border-stone-200 pt-3">
                <span className="text-[11px] text-stone-400">
                  {live.valid
                    ? <>حاشیهٔ این قلم: <b className={cn(live.level === 'red' ? 'text-rose-600' : live.level === 'yellow' ? 'text-amber-600' : 'text-emerald-600')}>{fa(live.margin.toFixed(1))}٪</b> — سود هر واحد {money(live.profitPerUnit)} ریال</>
                    : 'تعداد، جمع خرید و قیمت چاپی را وارد کنید تا تحلیل زنده نمایش داده شود'}
                </span>
                <Button className="gap-1.5" onClick={addItem}>
                  <I.plus size={15} /> افزودن به فاکتور
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* اقلام فاکتور + خلاصه */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon name="carton" size={18} /> اقلام فاکتور
                {items.length ? <Badge variant="secondary">{fa(items.length)} قلم</Badge> : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.length === 0 ? (
                <p className="py-6 text-center text-sm text-stone-400">هنوز قلمی به فاکتور اضافه نشده — با اسکن بارکد شروع کنید</p>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">کالا</TableHead>
                        <TableHead className="text-center">تعداد</TableHead>
                        <TableHead className="text-left">فی خرید</TableHead>
                        <TableHead className="text-left">قیمت چاپی</TableHead>
                        <TableHead className="text-center">حاشیه</TableHead>
                        <TableHead className="text-left">سود کل</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((r) => {
                        const b = levelBadge(r.analysis.level)
                        return (
                          <TableRow key={r.key}>
                            <TableCell>
                              <div className="text-xs font-medium">{r.name}</div>
                              <div className="text-[10px] text-stone-400">{r.unit}{r.barcode ? <span dir="ltr"> · {r.barcode}</span> : null}{r.analysis.hasCritical ? <span className="font-bold text-rose-600"> · زیر بهای تمام‌شده!</span> : null}</div>
                            </TableCell>
                            <TableCell className="text-center text-xs">{fa(r.quantity)}</TableCell>
                            <TableCell className="text-left text-xs" dir="ltr">{money(r.analysis.unitCost)}</TableCell>
                            <TableCell className="text-left text-xs" dir="ltr">{money(r.printedPrice)}</TableCell>
                            <TableCell className="text-center">
                              <span className={cn('inline-block rounded px-1.5 py-0.5 text-[11px] font-bold', b.cls)}>{fa(r.analysis.margin.toFixed(1))}٪</span>
                            </TableCell>
                            <TableCell className={cn('text-left text-xs font-bold', r.analysis.totalProfit < 0 ? 'text-rose-600' : 'text-emerald-700')} dir="ltr">{money(r.analysis.totalProfit)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="size-7 text-stone-400 hover:text-rose-600" onClick={() => removeItem(r.key)} aria-label="حذف قلم">
                                <I.trash size={14} />
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* نوار خلاصه */}
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-center sm:grid-cols-5">
                <div>
                  <div className="text-[10px] text-stone-500">تعداد اقلام</div>
                  <div className="text-sm font-bold text-stone-700">{fa(summary.count)} <span className="text-[10px] font-normal text-stone-400">({fa(summary.totalQty)} عدد)</span></div>
                </div>
                <div>
                  <div className="text-[10px] text-stone-500">جمع خرید</div>
                  <div className="text-sm font-bold text-stone-700" dir="ltr">{money(summary.cost)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-stone-500">درآمد مورد انتظار</div>
                  <div className="text-sm font-bold text-teal-700" dir="ltr">{money(summary.revenue)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-stone-500">سود مورد انتظار</div>
                  <div className={cn('text-sm font-bold', summary.profit < 0 ? 'text-rose-600' : 'text-emerald-700')} dir="ltr">{money(summary.profit)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-stone-500">حاشیه وزنی</div>
                  <div className={cn('text-sm font-bold', summary.margin < THRESHOLD_RED ? 'text-rose-600' : summary.margin < THRESHOLD_YELLOW ? 'text-amber-600' : 'text-emerald-700')}>
                    {summary.cost > 0 ? `${fa(summary.margin.toFixed(1))}٪` : '—'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="outline" className="gap-1.5" onClick={newInvoice}>
                  <I.refresh size={15} /> فاکتور جدید
                </Button>
                <Button disabled={saving || items.length === 0} className="gap-1.5" onClick={() => void save()}>
                  {saving ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />}
                  ذخیرهٔ فاکتور در سودسنج
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* گیج زنده — ستون چپ */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <MarginGauge
            result={live.valid ? live : summaryAnalysis}
            caption={live.valid ? 'حاشیه سود این قلم' : 'حاشیه وزنی فاکتور'}
          />
          <p className="mt-2 text-center text-[10px] leading-4 text-stone-400">
            حاشیه = (قیمت چاپی − بهای هر واحد) ÷ بهای هر واحد × ۱۰۰
            <br />
            {user?.fullName ? `کاربر: ${user.fullName}` : null}
          </p>
        </div>
      </div>
    </div>
  )
}
