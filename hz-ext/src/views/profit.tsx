import { useState, useEffect, useMemo, useRef, api, qs, useShell, toast, cn, Button, Input, Card, CardContent, CardHeader, CardTitle, Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, money, fa, toEnDigits, toFaDigits, todayJalali, faSlash, jsDateToJalali, Icon, I } from '../lib/hz'
/* ═══════════════════════════════════════════════════════════════
   profit/builder — «سودسنج پیشرفته» هایپر زیتون — بازطراحی R5-B
   موتور حاشیه سود + گیج زندهٔ SVG خالص + ویرایش درجای اقلام
   حاشیه ٪ = (قیمت فروش − بهای هر واحد) ÷ بهای هر واحد × ۱۰۰ (۴ رقم اعشار)
   قیمت فروش ↔ درصد سود دوطرفه‌ی زنده · تخفیف ۱۰۰٪ (رایگان) با مبنا
   سابقهٔ قیمت هر کالا + هشدار تغییر بهای خرید · آستانه‌های قابل تنظیم مدیران
   «ثبت تحویل و خرید» → فاکتور سودسنج + سند خرید (و در صورت دسترسی، هلو)
   ═══════════════════════════════════════════════════════════════ */

const DEFAULT_TH: { alert: number; ok: number } = { alert: 12, ok: 21 }
const SUSPICIOUS_HIGH = 186 // معادل آستانه قدیمی ۶۵٪ بر مبنای فروش
const HISTORY_DROP_WARN = 0.3
const HISTORY_RISE_INFO = 1.0
const COST_CHANGE_WARN = 0.2 // تغییر بهای خرید نسبت به دفعه قبل ≥ ۲۰٪ (±) → هشدار (خواستهٔ مالک)
const MARGIN_ROLES = ['OWNER', 'GM', 'ADMIN', 'ACC']
const HOLOO_ROLES = ['OWNER', 'GM', 'ADMIN']

/* واحدهای وزنی/حجمی — برای این واحدها، جای‌خالی «تعداد» به‌جای عدد، نام واحد است */
const WEIGHT_UNITS = ['کیلوگرم', 'کیلو', 'گرم', 'لیتر', 'میلی‌لیتر']
const isWeightyUnit = (u: string) => WEIGHT_UNITS.some((w) => (u || '').includes(w))

type Level = 'red' | 'yellow' | 'green' | 'none'
type Thresholds = { alert: number; ok: number }
type Alert = {
  kind: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  message: string
  suggestion?: number
  suggestionLabel?: string
  suggestionField?: 'sale' | 'totalCost' // فیلدی که پیشنهاد باید اصلاح کند (پیش‌فرض قیمت فروش)
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

/** عدد ریالی با ارقام فارسی و جداکنندهٔ هزارگان فارسی (٬) — مطابق نمونهٔ مالک: ۲۰۵٬۰۰۰ */
function fmtQuick(n: number): string {
  return toFaDigits(Math.round(n).toLocaleString('en-US')).replace(/,/g, '٬')
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
/** نمایش درصد با ۴ رقم اعشار و ممیز فارسی — ۲۴٫۹۱۷۳ */
function faPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return '—'
  return toFaDigits(round4(n).toFixed(4)).replace('.', '٫')
}

function marginLevel(margin: number, th: Thresholds): Level {
  if (!isFinite(margin)) return 'none'
  if (margin < th.alert) return 'red'
  if (margin < th.ok) return 'yellow'
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

/** تحلیل کامل یک قلم — همان منطق تحلیل زندهٔ سودسنج
 *  قیمت فروش مؤثر: salePrice وگرنه قیمت چاپی · کالای رایگان: بهای ۰ + درصد روی مبنا */
function analyzeItem(
  quantity: number,
  totalCost: number,
  printedPrice: number,
  salePrice: number,
  history: History | null | undefined,
  th: Thresholds,
  free100 = false,
  freeBase = 0,
  freePct: number | null = null,
): Analysis {
  const qtyOk = quantity > 0
  const costOk = free100 || totalCost > 0
  const effSale = free100 ? salePrice : salePrice || printedPrice
  const valid = qtyOk && costOk && effSale > 0

  const unitCost = free100 ? 0 : qtyOk ? totalCost / quantity : 0
  const profitPerUnit = valid ? effSale - unitCost : 0
  const revenue = qtyOk ? effSale * quantity : 0
  const totalProfit = valid ? profitPerUnit * quantity : 0
  /* کالای رایگان: درصد سود روی مبنا؛ در غیر این صورت درصد روی بهای خرید */
  const margin = free100
    ? freeBase > 0
      ? ((effSale - freeBase) / freeBase) * 100
      : freePct ?? NaN
    : valid
      ? (profitPerUnit / unitCost) * 100
      : NaN
  const level = valid ? marginLevel(margin, th) : 'none'

  const alerts: Alert[] = []

  if (free100 && valid) {
    alerts.push({
      kind: 'free_item', severity: 'info',
      title: 'کالای رایگان (تخفیف ۱۰۰٪)',
      message: `این قلم رایگان است — بهای خرید آن صفر ثبت می‌شود و قیمت فروش ${fmtQuick(effSale)} ریال از درصد سود ${faPct(freePct ?? margin)} روی مبنای ${fmtQuick(freeBase)} ریال محاسبه شده است.`,
    })
    if (isFinite(margin) && margin < th.alert) {
      const target = freeBase > 0 ? Math.ceil(freeBase * (1 + th.ok / 100)) : 0
      alerts.push({
        kind: 'low_margin', severity: 'warning',
        title: `درصد سود انتخابی زیر ${fa(th.alert)}٪ است`,
        message: `برای کالای رایگان هم درصد سود معقول (${fa(th.ok)}٪ و بالاتر) توصیه می‌شود.` + (target ? ` قیمت پیشنهادی: ${fmtQuick(target)} ریال.` : ''),
        suggestion: target || undefined, suggestionLabel: target ? `قیمت برای حاشیه ${fa(th.ok)}٪` : undefined,
      })
    }
  } else if (quantity > 0 && totalCost > 0 && effSale > 0) {
    /* ۱) قیمت فروش کمتر از بهای تمام‌شده — بحرانی */
    if (effSale < unitCost) {
      let fix: number | undefined
      for (const m of [10, 100]) {
        const candidate = effSale * m
        if (candidate > unitCost && ((candidate - unitCost) / unitCost) * 100 < 900) { fix = candidate; break }
      }
      alerts.push({
        kind: 'below_cost', severity: 'critical',
        title: 'قیمت فروش از بهای تمام‌شده کمتر است!',
        message: `بهای هر واحد ${fmtQuick(unitCost)} ریال است اما قیمت فروش فقط ${fmtQuick(effSale)} ریال وارد شده؛ با این قیمت هر عدد ${fmtQuick(unitCost - effSale)} ریال ضرر می‌کنید. احتمال جا افتادن صفر یا خطای تایپ وجود دارد.`,
        suggestion: fix, suggestionLabel: fix ? `اصلاح به ${fmtQuick(fix)} ریال` : undefined,
      })
    }

    /* ۲) حاشیه غیرعادی بالا — صفر اضافی؟ */
    if (margin >= SUSPICIOUS_HIGH) {
      let fix: number | undefined
      const half = effSale / 10
      if (half > unitCost) {
        const hm = ((half - unitCost) / unitCost) * 100
        if (hm > 4 && hm < SUSPICIOUS_HIGH) fix = half
      }
      alerts.push({
        kind: 'high_margin', severity: 'warning',
        title: 'حاشیه سود غیرعادی بالاست — صفر اضافی؟',
        message: `حاشیه سود این قلم ${fa(Math.round(margin))}٪ است؛ چنین حاشیه‌ای در سوپرمارکت رایج نیست. اگر قیمت فروش یک صفر اضافه دارد آن را اصلاح کنید.` + (fix ? ` با حذف یک صفر (${fmtQuick(fix)} ریال) حاشیه به ${fa(Math.round(((fix - unitCost) / unitCost) * 100))}٪ می‌رسد.` : ''),
        suggestion: fix, suggestionLabel: fix ? `اصلاح به ${fmtQuick(fix)} ریال` : undefined,
      })
    }

    /* ۳) مقایسه با سابقهٔ قیمت چاپی همان کالا */
    const lastPrinted = history?.lastPrintedPrice ?? null
    const avg = history?.avgPrintedPrice ?? lastPrinted
    if (printedPrice > 0 && avg && avg > 0 && (history?.printedPriceCount ?? 0) >= 1) {
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
           از سابقه «دور» است ولی جابه‌جایی‌اش به سابقه «نزدیک» می‌شود */
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
      if (Math.abs(costDev) >= COST_CHANGE_WARN) {
        alerts.push({
          kind: 'cost_change', severity: costDev > 0 ? 'warning' : 'info',
          title: costDev > 0 ? 'بهای خرید نسبت به دفعه قبل افزایش جدی داشته' : 'بهای خرید نسبت به دفعه قبل کاهش جدی داشته',
          message: `بهای قبلی هر واحد ${fmtQuick(lastCost)} ریال بود و الان ${fmtQuick(unitCost)} ریال است (${costDev > 0 ? '+' : '−'}${fa(Math.round(Math.abs(costDev) * 100))}٪). اگر این تغییر عمدی نیست، جمع مبلغ خرید را بررسی کنید.`,
          suggestion: lastCost > 0 && qtyOk ? Math.round(lastCost * quantity) : undefined,
          suggestionLabel: lastCost > 0 && qtyOk ? `بازگشت به بهای قبلی (جمع ${fmtQuick(lastCost * quantity)} ریال)` : undefined,
          suggestionField: 'totalCost',
        })
      }
    }

    /* ۶) حاشیه زیر آستانهٔ قرمز */
    if (effSale >= unitCost && margin < th.alert) {
      const target = Math.ceil(unitCost * (1 + th.ok / 100))
      alerts.push({
        kind: 'low_margin', severity: 'warning',
        title: `حاشیه سود زیر ${fa(th.alert)}٪ است`,
        message: `با قیمت فروش فعلی حاشیه سود فقط ${faPct(margin)}٪ است که زیر حد مجاز (${fa(th.alert)}٪) قرار دارد. قیمت فروش پیشنهادی برای رسیدن به حداقل ${fa(th.ok)}٪: ${fmtQuick(target)} ریال.`,
        suggestion: target, suggestionLabel: `قیمت برای حاشیه ${fa(th.ok)}٪`,
      })
    }
  } else if (effSale === 0 && (quantity > 0 || totalCost > 0)) {
    alerts.push({
      kind: 'zero_price', severity: 'info',
      title: 'قیمت وارد نشده',
      message: 'برای محاسبه حاشیه سود، قیمت چاپی یا قیمت فروش را وارد کنید.',
    })
  }

  return {
    valid, unitCost, profitPerUnit, revenue, totalProfit,
    margin: valid ? margin : 0, level, alerts,
    hasCritical: alerts.some((a) => a.severity === 'critical'),
  }
}

/** آیا بهای هر واحد این قلم با آخرین خرید همان کالا اختلاف جدی دارد؟ (≥۵۰٪) */
function costDeviation(unitCost: number, history: History | null | undefined): number | null {
  const last = history?.lastUnitCost ?? null
  if (!last || last <= 0 || unitCost <= 0) return null
  const dev = (unitCost - last) / last
  return Math.abs(dev) >= COST_CHANGE_WARN ? dev : null
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

function MarginGauge({ result, caption, th }: { result: Analysis; caption: string; th: Thresholds }) {
  const { level, margin, valid, hasCritical } = result
  const value = valid ? (hasCritical ? Math.min(margin, -2) : Math.min(margin, GAUGE_MAX)) : 0
  const frac = gFrac(value)
  const color = hasCritical || level === 'red' ? G_COLORS.red : level === 'yellow' ? G_COLORS.yellow : level === 'green' ? G_COLORS.green : G_COLORS.none
  const ticks = [
    { v: th.alert, label: fa(String(Math.round(th.alert))) },
    { v: th.ok, label: fa(String(Math.round(th.ok))) },
    { v: GAUGE_SPLIT, label: '۳۰' },
    { v: GAUGE_MAX, label: '۱۵۰' },
  ]

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

      <div data-tour="gauge" className="relative mx-auto w-full" dir="ltr">
        <svg viewBox="0 0 200 128" className="w-full" role="img" aria-label={valid ? `حاشیه سود ${faPct(margin)} درصد` : 'گیج حاشیه سود'}>
          {/* ریل زمینه */}
          <path d={gArc(180, 0)} fill="none" stroke="#e7e5e4" strokeWidth="15" strokeLinecap="round" />
          {/* ناحیهٔ قرمز */}
          <path d={gArc(gAngle(0), gAngle(th.alert))} fill="none" stroke={G_COLORS.red} strokeOpacity="0.88" strokeWidth="15" strokeLinecap="round" />
          {/* ناحیهٔ کهربایی */}
          <path d={gArc(gAngle(th.alert), gAngle(th.ok))} fill="none" stroke={G_COLORS.yellow} strokeOpacity="0.9" strokeWidth="15" />
          {/* ناحیهٔ سبز */}
          <path d={gArc(gAngle(th.ok), gAngle(GAUGE_MAX))} fill="none" stroke={G_COLORS.green} strokeOpacity="0.9" strokeWidth="15" strokeLinecap="round" />
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
          {ticks.map((t) => {
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
                {faPct(value)}
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
                  ? `پرخطر — زیر ${fa(th.alert)}٪`
                  : level === 'yellow'
                    ? `هشدار — زیر ${fa(th.ok)}٪`
                    : `مطلوب — ${fa(th.ok)}٪ و بالاتر (سود بر بهای خرید)`
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

/* ─────────────── نوع ردیف فاکتور — قابل ویرایش درجا ─────────────── */
type Row = {
  key: number
  productId: string | null
  barcode: string | null
  name: string
  unit: string
  quantity: number
  totalCost: number
  printedPrice: number
  salePrice: number
  free100: boolean
  baseCost: number
  pct: number // درصد سود واردشده (درایور درصد) — در غیر این صورت محاسبهٔ زنده
  driver: 'sale' | 'pct' | null
  history: History | null
}

type HistDialogRow = {
  dateJalali: string | null
  createdAt: string
  source: string
  supplierName: string | null
  quantity: number
  unitCost: number
  printedPrice: number
  salePrice: number
  profitPct: number | null
  free100: boolean
}

const num = (s: string): number => {
  const v = Number(toEnDigits(String(s ?? '')).replace(/[^\d.]/g, ''))
  return isFinite(v) ? v : 0
}

/* ورودی عددی ردیف — رشتهٔ خام تایپ را حفظ می‌کند تا ممیز میانی (۲۴.) از بین نرود */
function RowNumInput({ value, onCommit, className, title }: { value: string; onCommit: (raw: string) => void; className?: string; title?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value
  return (
    <Input
      dir="ltr"
      inputMode="decimal"
      className={className}
      title={title}
      value={shown}
      onFocus={(e: any) => { setDraft(e.target.value); try { e.target.select?.() } catch { /* noop */ } }}
      onChange={(e: any) => {
        const v = toEnDigits(e.target.value).replace(/٫/g, '.').replace(/[^\d.]/g, '')
        setDraft(v)
        onCommit(v)
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); try { (e.target as HTMLElement).blur?.() } catch { /* noop */ } } }}
    />
  )
}

/** درصد سود مؤثر یک ردیف — ۴ رقم اعشار */
function rowPct(r: Row): number {
  const effSale = r.free100 ? r.salePrice : r.salePrice || r.printedPrice
  if (r.free100) {
    if (r.baseCost > 0) return (effSale - r.baseCost) / r.baseCost * 100
    return r.pct
  }
  const unitCost = r.quantity > 0 ? r.totalCost / r.quantity : 0
  if (unitCost > 0 && effSale > 0) return (effSale - unitCost) / unitCost * 100
  return r.pct
}

function rowAnalysis(r: Row, th: Thresholds): Analysis {
  return analyzeItem(
    r.quantity, r.totalCost, r.printedPrice, r.salePrice,
    r.history, th, r.free100, r.baseCost, rowPct(r),
  )
}

let rowSeq = 0

export default function ProfitView() {
  const { user, go } = useShell()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [pushHoloo, setPushHoloo] = useState(false)
  const canEdit = MARGIN_ROLES.includes(String(user?.role || ''))
  const canSetTh = HOLOO_ROLES.includes(String(user?.role || ''))

  /* آستانه‌های سود — قابل تنظیم توسط مدیران ارشد */
  const [th, setTh] = useState<Thresholds>(DEFAULT_TH)
  const [thOpen, setThOpen] = useState(false)
  const [thAlert, setThAlert] = useState('12')
  const [thOk, setThOk] = useState('21')
  const [thSaving, setThSaving] = useState(false)

  /* سربرگ فاکتور */
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; code: string }[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [supplierText, setSupplierText] = useState('')
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [nextNumber, setNextNumber] = useState<number | null>(null)
  const [dateJalali, setDateJalali] = useState(todayJalali())
  const [providerDoc, setProviderDoc] = useState('')
  const [note, setNote] = useState('')

  /* حالت ویرایش — «بازکردن در فاکتورنویس» از دفتر فاکتورها (hash: ?id=) */
  const [editing, setEditing] = useState<null | { id: string; number: number | string; purchaseOrderId: string | null; archived: boolean; status: string }>(null)
  const editingRef = useRef<string | null>(null)
  const productRef = useRef<string | null>(null)

  /* فرم قلم */
  const [barcode, setBarcode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [productId, setProductId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('عدد')
  const [qty, setQty] = useState('')
  const [totalCost, setTotalCost] = useState('')
  const [printedPrice, setPrintedPrice] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [pctInput, setPctInput] = useState('')
  const [free100, setFree100] = useState(false)
  const [baseCost, setBaseCost] = useState('')
  const [driver, setDriver] = useState<'sale' | 'pct' | null>(null)
  const [qtyErr, setQtyErr] = useState('')
  const [history, setHistory] = useState<History | null>(null)
  const [items, setItems] = useState<Row[]>([])

  /* دیالوگ سابقهٔ قیمت کالا */
  const [histOpen, setHistOpen] = useState(false)
  const [histLoading, setHistLoading] = useState(false)
  const [histProduct, setHistProduct] = useState<{ id: string; name: string } | null>(null)
  const [histRows, setHistRows] = useState<HistDialogRow[]>([])
  const [histMeta, setHistMeta] = useState<History | null>(null)

  const barcodeRef = useRef<any>(null)
  const supplierRef = useRef<any>(null)
  const qtyRef = useRef<any>(null)
  const costRef = useRef<any>(null)
  const priceRef = useRef<any>(null)
  const saleRef = useRef<any>(null)
  const pctRef = useRef<any>(null)

  useEffect(() => { void load() }, [])

  /* ─── «بازکردن در فاکتورنویس» — hash ‏#/finance/builder?id=… از دفتر فاکتورها/آمار (R12: سودسنج زیر بخش مالی؛ R14: پیشوند قدیمی profit هم پذیرفته می‌شود) ─── */
  function invoiceIdFromHash(): string | null {
    const m = String(typeof location !== 'undefined' ? location.hash || '' : '').match(/#\/(?:finance|profit)\/builder\?id=([A-Za-z0-9_-]+)/)
    return m ? m[1] : null
  }
  /* R15: ?product=<id> از «آمار و تحلیل سود» — فرم جدید با همان کالا پیش‌پر می‌شود */
  function productIdFromHash(): string | null {
    const m = String(typeof location !== 'undefined' ? location.hash || '' : '').match(/#\/(?:finance|profit)\/builder\?product=([A-Za-z0-9_-]+)/)
    return m ? m[1] : null
  }
  async function loadProductForNewRow(pid: string) {
    const r = await api(`/api/products/${encodeURIComponent(pid)}`)
    if (!r.ok || !r.data) { toast.error(r.error || 'کالا یافت نشد'); return }
    const p = r.data
    editingRef.current = null
    setEditing(null)
    setItems((cur) => {
      if (cur.some((it: any) => it.productId === p.id)) return cur
      return [...cur, {
        key: ++rowSeq,
        productId: p.id,
        barcode: (p.barcodes || [])[0]?.code ?? p.code ?? null,
        name: p.name,
        unit: p.unit || 'عدد',
        quantity: 1,
        totalCost: Math.round((p.lastBuyPrice || 0)),
        printedPrice: p.sellPrice2 || p.sellPrice || 0,
        salePrice: p.sellPrice || p.sellPrice2 || 0,
        free100: false,
        baseCost: 0,
        pct: 0,
        driver: null,
        history: null,
      }]
    })
    toast.success(`کالای «${p.name}» برای بازبینی قیمت به فاکتورنویس اضافه شد — قیمت‌ها را با نرخ روز اصلاح کنید`)
    try { barcodeRef.current?.focus?.() } catch { /* noop */ }
  }
  async function loadInvoiceForEdit(id: string) {
    const r = await api(`/api/margin/${encodeURIComponent(id)}`)
    if (!r.ok || !r.data?.invoice) { toast.error(r.error || 'بازکردن فاکتور برای ویرایش ناموفق بود'); return }
    const inv = r.data.invoice
    editingRef.current = String(inv.id)
    setEditing({ id: String(inv.id), number: inv.number, purchaseOrderId: inv.purchaseOrderId ?? null, archived: !!inv.archived, status: String(inv.status || '') })
    setSupplierId(inv.supplierId ?? '')
    setSupplierText(inv.supplierName ?? '')
    setProviderDoc(inv.providerDocNumber ?? '')
    setNote(inv.note ?? '')
    if (inv.dateJalali) setDateJalali(String(inv.dateJalali))
    setItems((inv.items || []).map((it: any) => ({
      key: ++rowSeq,
      productId: it.productId ?? null,
      barcode: it.barcode ?? null,
      name: it.productName ?? '',
      unit: it.unit ?? 'عدد',
      quantity: Number(it.quantity) || 0,
      totalCost: Number(it.totalCost) || 0,
      printedPrice: Number(it.printedPrice) || 0,
      salePrice: Number(it.salePrice) || Number(it.printedPrice) || 0,
      free100: !!it.free100,
      baseCost: Number(it.baseCost) || 0,
      pct: Number(it.marginPct) || 0,
      driver: null,
      history: it.product ? {
        lastPrintedPrice: it.product.lastPrintedPrice ?? null,
        avgPrintedPrice: it.product.avgPrintedPrice ?? null,
        printedPriceCount: Number(it.product.printedPriceCount) || 0,
        lastUnitCost: it.product.lastBuyPrice ?? null,
      } : null,
    })))
    if (inv.archived) toast.warning('این فاکتور بایگانی شده — فقط قابل مشاهده است؛ برای ویرایش، ابتدا بایگانی را باز کنید')
    else toast.success(`فاکتور ${fa(inv.number)} برای ویرایش باز شد — ${fa((inv.items || []).length)} قلم بارگذاری شد`)
    try { barcodeRef.current?.focus?.() } catch { /* noop */ }
  }
  useEffect(() => {
    const apply = () => {
      const id = invoiceIdFromHash()
      if (id && id !== editingRef.current) void loadInvoiceForEdit(id)
      const pid = productIdFromHash()
      if (pid && pid !== productRef.current) { productRef.current = pid; void loadProductForNewRow(pid) }
    }
    apply()
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [])

  async function load() {
    setLoading(true)
    const [sup, inv, meta] = await Promise.all([api('/api/margin/suppliers'), api('/api/margin'), api('/api/margin/meta')])
    setLoading(false)
    if (sup.ok && Array.isArray(sup.data?.suppliers)) setSuppliers(sup.data.suppliers)
    else if (!sup.ok) toast.error(sup.error || 'دریافت فهرست تأمین‌کننده‌ها ناموفق بود')
    if (inv.ok && Array.isArray(inv.data?.invoices)) {
      const max = inv.data.invoices.reduce((m: number, r: any) => Math.max(m, Number(r.number) || 0), 0)
      setNextNumber(max > 0 ? max + 1 : 1)
    }
    if (meta.ok && meta.data?.thresholds) {
      setTh({ alert: Number(meta.data.thresholds.alert) || 12, ok: Number(meta.data.thresholds.ok) || 21 })
    }
  }

  /* تحلیل زندهٔ قلم جاری */
  const liveQty = num(qty)
  const liveCost = free100 ? 0 : num(totalCost)
  const liveUnitCost = liveQty > 0 ? liveCost / liveQty : 0
  const liveBase = free100 ? num(baseCost) : 0
  const liveSale = free100
    ? (liveBase > 0 && num(pctInput) > 0 ? Math.round(liveBase * (1 + num(pctInput) / 100)) : num(salePrice))
    : num(salePrice) || num(printedPrice)
  const livePct = free100
    ? (liveBase > 0 && liveSale > 0 ? (liveSale - liveBase) / liveBase * 100 : num(pctInput))
    : (liveUnitCost > 0 && liveSale > 0 ? (liveSale - liveUnitCost) / liveUnitCost * 100 : num(pctInput))

  const live = useMemo(
    () => analyzeItem(liveQty, liveCost, num(printedPrice), liveSale, history, th, free100, liveBase, livePct),
    [qty, totalCost, printedPrice, salePrice, pctInput, free100, baseCost, history, th],
  )

  /* جمع‌بندی وزنی فاکتور */
  const summary = useMemo(() => {
    let cost = 0, revenue = 0
    for (const r of items) {
      cost += r.free100 ? 0 : r.totalCost || 0
      revenue += (r.free100 ? r.salePrice : r.salePrice || r.printedPrice) * (r.quantity || 0)
    }
    const profit = revenue - cost
    return { count: items.length, totalQty: items.reduce((s, r) => s + r.quantity, 0), cost, revenue, profit, margin: cost > 0 ? (profit / cost) * 100 : 0 }
  }, [items])

  const summaryAnalysis: Analysis = {
    valid: summary.cost > 0, unitCost: 0, profitPerUnit: 0,
    revenue: summary.revenue, totalProfit: summary.profit,
    margin: summary.margin, level: marginLevel(summary.margin, th), alerts: [], hasCritical: false,
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
    /* بارکد داخلی فروشگاه می‌تواند ۴ رقمی باشد (مثلاً ۱۵۵۰ برای پسته فله) — حداقل ۴ رقم */
    if (!/^\d{4,}$/.test(code)) {
      toast.error('بارکد باید حداقل ۴ رقم باشد — بارکدهای داخلی فروشگاه معمولاً ۴ رقمی‌اند')
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
    /* پیش‌پرکردن فوری از حافظهٔ کالا؛ سپس سابقهٔ واقعی از سرور */
    setHistory({
      lastPrintedPrice: sell > 0 ? sell : null,
      avgPrintedPrice: sell > 0 ? sell : null,
      printedPriceCount: sell > 0 ? 1 : 0,
      lastUnitCost: lastBuy > 0 ? lastBuy : null,
    })
    if (p.id) void fetchProductHistory(p.id, p.name, false)
    if (free100 && lastBuy > 0 && !num(baseCost)) setBaseCost(String(lastBuy))
    toast.success(`«${p.name ?? ''}» پیدا شد`)
    qtyRef.current?.focus?.()
  }

  /** سابقهٔ قیمت کالا از سرور — هم برای فرم و هم برای دیالوگ */
  async function fetchProductHistory(pid: string, pname: string, openDialog: boolean) {
    if (openDialog) {
      setHistLoading(true)
      setHistProduct({ id: pid, name: pname })
      setHistOpen(true)
      setHistRows([])
      setHistMeta(null)
    }
    const r = await api(`/api/margin/history${qs({ productId: pid })}`)
    if (openDialog) setHistLoading(false)
    if (!r.ok) {
      if (openDialog) toast.error(r.error || 'دریافت سابقهٔ قیمت ناموفق بود')
      return
    }
    const d = r.data
    const h: History = {
      lastPrintedPrice: d.lastPrintedPrice ?? null,
      avgPrintedPrice: d.avgPrintedPrice ?? null,
      printedPriceCount: Number(d.printedPriceCount) || 0,
      lastUnitCost: d.lastUnitCost ?? null,
    }
    if (openDialog) {
      setHistRows(Array.isArray(d.history) ? d.history : [])
      setHistMeta(h)
    } else {
      setHistory(h)
      if (free100 && h.lastUnitCost && !num(baseCost)) setBaseCost(String(h.lastUnitCost))
    }
  }

  function openHistoryDialog(r: Row) {
    if (!r.productId) {
      toast.info('این قلم به کالای ثبت‌شده‌ای متصل نیست — سابقه‌ای ندارد')
      return
    }
    void fetchProductHistory(r.productId, r.name, true)
  }

  /** جستجوی سابقهٔ قیمت با نام کالا — ورود دستی بدون بارکد (req#4: تطبیق با نام) */
  async function lookupHistoryByName(nm: string) {
    const n = nm.trim()
    if (!n || productId) return
    const r = await api(`/api/margin/history${qs({ name: n })}`)
    if (!r.ok || !r.data?.product) return
    const d = r.data
    if (d.product.id && d.product.id !== productId) {
      setProductId(String(d.product.id))
      if (d.product.unit) setUnit(String(d.product.unit))
    }
    setHistory({
      lastPrintedPrice: d.lastPrintedPrice ?? null,
      avgPrintedPrice: d.avgPrintedPrice ?? null,
      printedPriceCount: Number(d.printedPriceCount) || 0,
      lastUnitCost: d.lastUnitCost ?? null,
    })
  }

  function resetItemForm() {
    setBarcode(''); setProductId(null); setName(''); setUnit('عدد'); setQty('')
    setTotalCost(''); setPrintedPrice(''); setSalePrice(''); setPctInput('')
    setFree100(false); setBaseCost(''); setDriver(null); setHistory(null); setQtyErr('')
  }

  function applySuggestion(v: number, field?: 'sale' | 'totalCost') {
    if (field === 'totalCost') {
      /* پیشنهادِ اصلاح جمع خرید — قیمت فروش اگر درصد درایور است بازمحاسبه می‌شود */
      onQtyOrCostChange('cost', String(Math.round(v)))
      toast.info(`جمع بهای خرید به ${fmtQuick(v)} ریال اصلاح شد`)
      return
    }
    setSalePrice(String(Math.round(v)))
    setDriver('sale')
  }

  /* ─── ویرایشگرهای فرم — پیوند دوطرفهٔ قیمت فروش ↔ درصد سود ─── */

  function onPrintedChange(v: string) {
    setPrintedPrice(v)
    /* اگر هنوز قیمت فروش دستی وارد نشده، همسان با قیمت چاپی بماند (روند سریع قدیمی) */
    if (driver === null) setSalePrice(v)
  }

  function onSaleChange(v: string) {
    setSalePrice(v)
    setDriver('sale')
  }

  function onPctChange(v: string) {
    setPctInput(v)
    setDriver('pct')
    const p = num(v)
    if (free100) {
      const b = num(baseCost)
      if (b > 0 && p > 0) setSalePrice(String(Math.round(b * (1 + p / 100))))
    } else if (liveUnitCost > 0 && p > 0) {
      setSalePrice(String(Math.round(liveUnitCost * (1 + p / 100))))
    }
  }

  function onQtyOrCostChange(which: 'qty' | 'cost', v: string) {
    if (which === 'qty') setQty(v)
    else setTotalCost(v)
    /* تغییر تعداد/جمع خرید: اگر درصد سود درایور است، قیمت فروش بازمحاسبه شود؛ وگرنه درصد، زنده به‌روز می‌شود */
    const q = which === 'qty' ? num(v) : liveQty
    const c = which === 'cost' ? num(v) : liveCost
    const uc = q > 0 ? c / q : 0
    if (driver === 'pct' && uc > 0 && !free100) {
      const p = num(pctInput)
      if (p > 0) setSalePrice(String(Math.round(uc * (1 + p / 100))))
    }
  }

  function toggleFree100() {
    if (!free100) {
      /* روشن: جمع خرید → مبنا (فی واحد)، قیمت چاپی صفر */
      const q = num(qty)
      const uc = q > 0 ? num(totalCost) / q : 0
      setBaseCost(uc > 0 ? String(Math.round(uc)) : (history?.lastUnitCost ? String(Math.round(history.lastUnitCost)) : ''))
      setTotalCost('0')
      setPrintedPrice('')
      if (driver === null && num(salePrice) === 0 && num(baseCost) === 0) setSalePrice('')
      setFree100(true)
      toast.info('حالت کالای رایگان (تخفیف ۱۰۰٪) — درصد سود را روی مبنای قیمت عادی وارد کنید')
    } else {
      /* خاموش: مبنا → جمع خرید، قیمت چاپی = قیمت فروش */
      const q = Math.max(1, num(qty))
      const b = num(baseCost)
      setTotalCost(b > 0 ? String(Math.round(b * q)) : '')
      setPrintedPrice(salePrice || '')
      setFree100(false)
    }
  }

  function addItem() {
    if (!canEdit) return toast.error('شما فقط اجازهٔ مشاهده دارید — ثبت قلم نیازمند دسترسی حسابداری/مدیریتی است')
    const n = name.trim()
    if (!n) return toast.error('نام کالا را وارد کنید')
    const q = num(qty)
    if (q < 1) { setQtyErr('تعداد را وارد کنید (حداقل ۱)'); qtyRef.current?.focus?.(); return }
    if (!free100 && num(totalCost) <= 0) return toast.error('جمع بهای خرید را وارد کنید')
    const pp = free100 ? 0 : Math.round(num(printedPrice))
    const sp = free100 ? num(salePrice) : (num(salePrice) || pp)
    if (sp <= 0) return toast.error(free100 ? 'درصد سود (یا قیمت فروش) را وارد کنید' : 'قیمت چاپی یا قیمت فروش را وارد کنید')
    setItems((prev) => [
      ...prev,
      {
        key: ++rowSeq, productId, barcode: barcode.trim() || null, name: n, unit,
        quantity: Math.round(q * 1000) / 1000,
        totalCost: free100 ? 0 : Math.round(num(totalCost)),
        printedPrice: pp,
        salePrice: Math.round(sp),
        free100,
        baseCost: free100 ? Math.round(num(baseCost)) : 0,
        pct: round4(free100 ? livePct : (liveUnitCost > 0 ? (sp - liveUnitCost) / liveUnitCost * 100 : num(pctInput))),
        driver,
        history,
      },
    ])
    if (live.hasCritical) toast.error('قلم با هشدار بحرانی ثبت شد — قیمت فروش کمتر از بهای تمام‌شده است؛ پیش از ذخیره حتماً بازبینی کنید')
    else if (live.level === 'red') toast.warning(`حاشیه این قلم ${faPct(live.margin)}٪ و زیر حد ${fa(th.alert)}٪ است`)
    else toast.success(`«${n}» با حاشیه ${faPct(live.margin)}٪ افزوده شد — پیش از ثبت نهایی می‌توانید آن را ویرایش کنید`)
    resetItemForm()
    barcodeRef.current?.focus?.()
  }

  function removeItem(key: number) {
    setItems((prev) => prev.filter((r) => r.key !== key))
  }

  /* ─── ویرایش درجا — هر ردیف: تعداد، جمع خرید، قیمت چاپی، قیمت فروش ↔ درصد سود ─── */
  function updateItem(key: number, patch: Partial<Row>) {
    setItems((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r
        const next: Row = { ...r, ...patch }
        const q = next.quantity > 0 ? next.quantity : 0
        const uc = next.free100 ? 0 : q > 0 ? next.totalCost / q : 0
        /* هم‌سان‌ماندن قیمت فروش با قیمت چاپی — تا وقتی دستی جدا نشده باشد */
        if (patch.printedPrice !== undefined && !next.free100) {
          if (r.salePrice === r.printedPrice || r.salePrice === 0) next.salePrice = next.printedPrice
        }
        if (patch.salePrice !== undefined) next.driver = 'sale'
        if (patch.pct !== undefined) {
          next.driver = 'pct'
          const base = next.free100 ? next.baseCost : uc
          if (base > 0) next.salePrice = Math.round(base * (1 + next.pct / 100))
        }
        if ((patch.quantity !== undefined || patch.totalCost !== undefined || (patch.free100 !== undefined && patch.free100)) && next.driver === 'pct') {
          const base = next.free100 ? next.baseCost : uc
          if (base > 0) next.salePrice = Math.round(base * (1 + next.pct / 100))
        }
        if (patch.free100 !== undefined && patch.free100 !== r.free100) {
          if (patch.free100) {
            /* → رایگان: مبنا = فی واحد فعلیِ قبل از صفرشدن (وگرنه آخرین خرید)، بهای خرید و چاپی صفر */
            const preUc = r.free100 ? 0 : r.quantity > 0 ? r.totalCost / r.quantity : 0
            next.baseCost = Math.round(preUc > 0 ? preUc : (r.history?.lastUnitCost ?? 0))
            next.totalCost = 0
            next.printedPrice = 0
          } else {
            /* → عادی: جمع خرید از مبنا، قیمت چاپی = قیمت فروش */
            const qq = Math.max(1, next.quantity)
            next.totalCost = Math.round(next.baseCost * qq)
            next.printedPrice = next.salePrice
          }
          next.pct = round4(rowPct(next))
        }
        if (next.free100) next.totalCost = 0
        return next
      }),
    )
  }

  function newInvoice() {
    setItems([])
    setNote('')
    setProviderDoc('')
    setEditing(null)
    editingRef.current = null
    setSupplierId('')
    setSupplierText('')
    resetItemForm()
    setNextNumber((n) => (n == null ? n : n + 1))
    barcodeRef.current?.focus?.()
    toast.info('فاکتور جدید آماده است')
  }

  function itemsPayload() {
    return items.map((it) => {
      const a = rowAnalysis(it, th)
      return {
        productId: it.productId,
        barcode: it.barcode,
        name: it.name,
        productName: it.name,
        unit: it.unit,
        quantity: it.quantity,
        totalCost: it.totalCost,
        unitCost: Math.round(a.unitCost),
        printedPrice: it.printedPrice,
        salePrice: it.salePrice,
        marginPct: round4(rowPct(it)),
        free100: it.free100,
        baseCost: it.baseCost,
        margin: a.margin,
        profitPerUnit: Math.round(a.profitPerUnit),
        level: a.level,
        alerts: a.alerts.map((x) => x.kind),
      }
    })
  }

  async function save() {
    if (!canEdit) return toast.error('شما فقط اجازهٔ مشاهده دارید')
    if (items.length === 0) return toast.error('فاکتور باید حداقل یک قلم داشته باشد')
    const sName = supplierText.trim()
    if (!sName) return toast.error('تأمین‌کننده را انتخاب یا نامش را وارد کنید')
    setSaving(true)
    if (editing) {
      /* ویرایش فاکتور موجود — جایگزینی کامل اقلام (PUT) */
      const r = await api(`/api/margin/${encodeURIComponent(editing.id)}`, {
        method: 'PUT',
        body: {
          supplierId: supplierId || null,
          supplierName: sName,
          note: note.trim() || null,
          providerDocNumber: providerDoc.trim() || null,
          items: itemsPayload(),
        },
      })
      setSaving(false)
      if (!r.ok) return toast.error(r.error || 'به‌روزرسانی فاکتور ناموفق بود')
      toast.success(`فاکتور ${toFaDigits(String(editing.number))} به‌روزرساری شد — ${fa(items.length)} قلم`)
      /* R15: پس از ذخیره، به «سفارش‌ها» می‌رویم تا وضعیت سفارش دیده شود */
      go('supply/orders')
      return
    }
    const r = await api('/api/margin', {
      method: 'POST',
      body: {
        supplierId: supplierId || null,
        supplierName: sName,
        note: note.trim() || null,
        providerDocNumber: providerDoc.trim() || null,
        dateJalali,
        items: itemsPayload(),
      },
    })
    setSaving(false)
    if (!r.ok) return toast.error(r.error || 'ثبت فاکتور ناموفق بود')
    toast.success(`پیش‌نویس شماره ${toFaDigits(String(r.data?.number ?? ''))} با ${fa(items.length)} قلم ثبت شد — وضعیت سفارش را در «سفارش‌ها» ببینید`)
    newInvoice()
    go('supply/orders')
  }

  /* «ثبت تحویل و خرید» — فاکتور سودسنج + سند خرید (+ هلو در صورت دسترسی و انتخاب) */
  async function submitPurchase() {
    if (!canEdit) return toast.error('شما فقط اجازهٔ مشاهده دارید')
    if (items.length === 0) return toast.error('فاکتور باید حداقل یک قلم داشته باشد')
    const sName = supplierText.trim()
    if (!sName) return toast.error('تأمین‌کننده را انتخاب یا نامش را وارد کنید')
    if (editing) {
      if (editing.purchaseOrderId) return toast.error('برای این فاکتور قبلاً «تحویل و خرید» ثبت شده است — برای اصلاح اقلام، فاکتور را ویرایش و با «ثبت فاکتور» (Alt+S) ذخیره کنید؛ سند خرید قبلی معتبر می‌ماند')
      return toast.error('در حالت ویرایش، «ثبت تحویل و خرید» فعال نیست — ابتدا تغییرات را با «ثبت فاکتور» (Alt+S) ذخیره کنید، سپس از دفتر فاکتورها دوباره بازش کنید و «ثبت تحویل و خرید» را بزنید')
    }
    setPurchasing(true)
    const r = await api('/api/margin/purchase', {
      method: 'POST',
      body: {
        supplierId: supplierId || null,
        supplierName: sName,
        note: note.trim() || null,
        providerDocNumber: providerDoc.trim() || null,
        dateJalali,
        pushToHoloo: pushHoloo && canSetTh,
        items: itemsPayload(),
      },
    })
    if (!r.ok) {
      setPurchasing(false)
      return toast.error(r.error || 'ثبت تحویل و خرید ناموفق بود')
    }
    const inv = r.data?.invoice ?? {}
    const ord = r.data?.order ?? {}
    const holoo = r.data?.holoo ?? null
    toast.success(`تحویل و خرید ثبت شد — فاکتور ${fa(inv.number ?? '')} + سند خرید ${String(ord.code ?? '')}`)
    /* نتیجهٔ ارسال به هلو (تلاش سمت سرور در همان فراخوانی) */
    if (holoo) {
      if (holoo.pushed) toast.success(`سفارش ${String(ord.code ?? '')} در هلو ثبت شد — فاکتور ${fa(String(holoo.invoiceNo ?? '—'))}`)
      else if (holoo.pending) toast.warning(`ثبت در هلو انجام نشد (${holoo.reason ?? 'اتصال در دسترس نیست'}) — سند خرید محلی ثبت شد و در صف ارسال هلو است`)
      else toast.error(`ثبت در هلو ناموفق بود: ${holoo.reason || 'خطای نامشخص'} — سند خرید محلی ثبت شده است`)
    }
    setPurchasing(false)
    newInvoice()
  }

  /* ذخیرهٔ آستانه‌ها */
  async function saveThresholds() {
    const a = num(thAlert)
    const o = num(thOk)
    if (!(a >= 0) || !(o > a)) return toast.error('آستانه‌ها نامعتبرند — آستانهٔ اول باید ≥ ۰ و آستانهٔ دوم بزرگ‌تر از آن باشد')
    setThSaving(true)
    const r = await api('/api/margin/meta', { method: 'PUT', body: { alert: a, ok: o } })
    setThSaving(false)
    if (!r.ok) return toast.error(r.error || 'ذخیرهٔ آستانه‌ها ناموفق بود')
    setTh({ alert: a, ok: o })
    setThOpen(false)
    toast.success(`آستانه‌ها ذخیره شد — قرمز < ${fa(a)}٪ · کهربایی < ${fa(o)}٪ · سبز ≥ ${fa(o)}٪`)
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

  const targetOk = live.valid && !live.hasCritical && live.margin < th.ok && liveUnitCost > 0
    ? Math.ceil(liveUnitCost * (1 + th.ok / 100))
    : null
  const liveCostDev = free100 ? null : costDeviation(liveUnitCost, history)

  const levelBadge = (lvl: Level) =>
    lvl === 'red' ? { cls: 'bg-rose-100 text-rose-700', label: 'قرمز' }
      : lvl === 'yellow' ? { cls: 'bg-amber-100 text-amber-700', label: 'کهربایی' }
        : lvl === 'green' ? { cls: 'bg-emerald-100 text-emerald-700', label: 'سبز' }
          : { cls: 'bg-stone-100 text-stone-500', label: '—' }

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
      {/* بنر حالت ویرایش — فاکتور موجود بازشده از دفتر فاکتورها */}
      {editing ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <span className="flex flex-wrap items-center gap-2 font-bold">
            <I.penLine size={15} /> ویرایش فاکتور #{toFaDigits(String(editing.number))} — {supplierText || '—'}
            {editing.archived ? <Badge variant="outline" className="border-amber-400 text-[10px] text-amber-700">بایگانی‌شده — فقط قابل مشاهده</Badge> : null}
            {editing.purchaseOrderId ? <Badge variant="outline" className="border-teal-300 text-[10px] text-teal-700">تحویل/خرید ثبت‌شده</Badge> : null}
          </span>
          <span className="flex items-center gap-2">
            <span className="hidden text-[11px] text-amber-700 sm:inline">تغییرات با «ثبت فاکتور» (Alt+S) ذخیره می‌شود</span>
            <Button variant="outline" size="sm" className="h-7 gap-1 border-amber-300 bg-white text-amber-800 hover:bg-amber-100" onClick={newInvoice}>
              <I.plus size={13} /> فاکتور جدید (Alt+N)
            </Button>
          </span>
        </div>
      ) : null}
      {/* سربرگ: راهنمای میان‌بر + راهنمای آستانه‌ها + تنظیم آستانه‌ها */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-[11px] text-stone-500">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1 font-bold text-stone-600"><I.sparkles size={13} /> میان‌برها:</span>
          <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-bold" dir="ltr">Alt+N</span> فاکتور جدید
          <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-bold" dir="ltr">Alt+B</span> بارکد
          <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-bold" dir="ltr">Alt+S</span> ذخیره
          <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-bold" dir="ltr">Alt+F</span> تأمین‌کننده
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-full" style={{ background: G_COLORS.red }} /> قرمز &lt;{fa(th.alert)}٪</span>
          <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-full" style={{ background: G_COLORS.yellow }} /> کهربایی &lt;{fa(th.ok)}٪</span>
          <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-full" style={{ background: G_COLORS.green }} /> سبز ≥{fa(th.ok)}٪</span>
          {canSetTh ? (
            <Button variant="outline" size="sm" className="h-7 gap-1 border-stone-300 px-2 text-[11px]" onClick={() => { setThAlert(String(th.alert)); setThOk(String(th.ok)); setThOpen(true) }}>
              <I.settings size={13} /> آستانه‌ها
            </Button>
          ) : null}
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
                <label className="mb-1 block text-xs text-stone-500">شماره سند تأمین‌کننده</label>
                <Input
                  value={providerDoc}
                  onChange={(e: any) => setProviderDoc(e.target.value)}
                  placeholder="شمارهٔ روی برگهٔ فروشنده…"
                />
                <p className="mt-1 text-[10px] text-stone-400">شماره‌ای که نمایندهٔ تأمین‌کننده روی سند کاغذی می‌نویسد</p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-stone-500">تاریخ فاکتور</label>
                <Input
                  value={toFaDigits(dateJalali).replace(/-/g, '/')}
                  onChange={(e: any) => setDateJalali(toEnDigits(e.target.value).replace(/[^۰-۹0-9\/-]/g, '').replace(/\//g, '-'))}
                  placeholder="۱۴۰۵/۰۷/۲۷" className="text-center" />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="mb-1 block text-xs text-stone-500">یادداشت فاکتور (اختیاری)</label>
                <Input value={note} onChange={(e: any) => setNote(e.target.value)} placeholder="مثلاً: نسیه دو هفته‌ای…" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-stone-500">{editing ? 'شمارهٔ فاکتور (ویرایش)' : 'شمارهٔ داخلی (خودکار)'}</label>
                <Input
                  readOnly
                  value={editing ? toFaDigits(String(editing.number)) : nextNumber == null ? '—' : toFaDigits(String(nextNumber))}
                  className={cn('text-center font-bold', editing ? 'bg-amber-50 text-amber-800' : 'bg-stone-50')}
                />
              </div>
            </CardContent>
          </Card>

          {/* فرم ثبت قلم */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <I.plus size={18} /> ثبت قلم جدید
                <span className="text-[11px] font-normal text-stone-400">با بارکدخوان یا کیبورد — Enter: فیلد بعدی؛ در «قیمت چاپی» ثبت قلم</span>
                <button
                  type="button"
                  onClick={toggleFree100}
                  className={cn(
                    'ms-auto flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors',
                    free100 ? 'border-emerald-300 bg-emerald-100 text-emerald-700' : 'border-stone-300 bg-stone-50 text-stone-500 hover:bg-emerald-50 hover:text-emerald-700',
                  )}
                >
                  <I.packagePlus size={13} /> تخفیف ۱۰۰٪ (رایگان) {free100 ? '✓' : ''}
                </button>
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
                    onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); void lookupHistoryByName(e.currentTarget?.value ?? name); qtyRef.current?.focus?.() } }} />
                </div>
              </div>

              {/* چیپ‌های سابقه */}
              {history && (history.lastUnitCost || history.lastPrintedPrice) ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-stone-400"><I.history size={12} className="inline" /> سابقهٔ این کالا — برای پرکردن سریع کلیک کنید:</span>
                  {history.lastUnitCost ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (free100) { setBaseCost(String(Math.round(history.lastUnitCost!))); toast.info(`مبنای رایگان از آخرین خرید پر شد (${money(history.lastUnitCost)} ریال)`) }
                        else { const q = Math.max(1, num(qty) || 1); setTotalCost(String(Math.round(history.lastUnitCost! * q))); toast.info(`جمع خرید از آخرین خرید پر شد (${fa(q)} × ${money(history.lastUnitCost)})`) }
                      }}
                      className="flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-bold text-teal-700 hover:bg-emerald-100"
                    >
                      <I.banknote size={12} /> آخرین خرید: {money(history.lastUnitCost)} ریال
                    </button>
                  ) : null}
                  {history.lastPrintedPrice ? (
                    <button
                      type="button"
                      onClick={() => { onPrintedChange(String(Math.round(history.lastPrintedPrice!))); toast.info('قیمت چاپی از آخرین قیمت فروش پر شد') }}
                      className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                    >
                      <I.receipt size={12} /> آخرین قیمت چاپی: {money(history.lastPrintedPrice)} ریال
                    </button>
                  ) : null}
                  {productId ? (
                    <button
                      type="button"
                      onClick={() => { if (productId) void fetchProductHistory(productId, name || 'کالا', true) }}
                      className="flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-bold text-stone-600 hover:bg-stone-100"
                    >
                      <I.history size={12} /> سابقهٔ کامل قیمت
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                      onQtyOrCostChange('qty', v)
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
                  <label className="mb-1 flex items-center gap-1 text-xs text-stone-500">
                    {free100 ? 'مبنای قیمت (فی واحد، ریال)' : 'جمع بهای خرید (ریال) *'}
                    {!free100 && liveCostDev !== null ? (
                      <span
                        className="cursor-help text-amber-500"
                        title={liveCostDev > 0
                          ? `بهای خرید نسبت به دفعه قبل افزایش جدی داشته — بهای قبلی هر واحد ${fmtQuick(history?.lastUnitCost ?? 0)} ریال بود و الان ${fmtQuick(liveUnitCost)} ریال است (+${fa(Math.round(liveCostDev * 100))}٪). اگر این تغییر عمدی نیست، جمع مبلغ خرید را بررسی کنید.`
                          : `بهای خرید نسبت به دفعه قبل کاهش جدی داشته — بهای قبلی هر واحد ${fmtQuick(history?.lastUnitCost ?? 0)} ریال بود و الان ${fmtQuick(liveUnitCost)} ریال است (−${fa(Math.round(Math.abs(liveCostDev) * 100))}٪). اگر این تغییر عمدی نیست، جمع مبلغ خرید را بررسی کنید.`}
                      >
                        <I.alertTriangle size={13} />
                      </span>
                    ) : null}
                  </label>
                  <Input
                    ref={costRef}
                    dir="ltr"
                    inputMode="decimal"
                    className="num text-end"
                    value={toFaDigits(free100 ? baseCost : totalCost)}
                    placeholder={free100 ? 'قیمت عادی تأمین‌کننده…' : 'مثلاً ۲۵۰٬۰۰۰'}
                    onChange={(e: any) => {
                      const v = toEnDigits(e.target.value).replace(/٫/g, '.').replace(/[^\d.]/g, '')
                      if (free100) {
                        setBaseCost(v)
                        const b = num(v)
                        const p = num(pctInput)
                        if (b > 0 && p > 0) setSalePrice(String(Math.round(b * (1 + p / 100))))
                      } else onQtyOrCostChange('cost', v)
                    }}
                    onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); (free100 ? pctRef : priceRef).current?.focus?.() } }}
                  />
                  {free100
                    ? <p className="mt-1 text-[10px] text-stone-400">بهای واقعی این قلم صفر است — مبنا فقط برای محاسبهٔ قیمت فروش</p>
                    : live.valid ? <p className="mt-1 text-[10px] text-stone-400">فی هر واحد: {money(live.unitCost)} ریال</p> : null}
                </div>
                {free100 ? (
                  <div>
                    <label className="mb-1 block text-xs text-stone-500">درصد سود (٪) *</label>
                    <Input
                      ref={pctRef}
                      dir="ltr"
                      inputMode="decimal"
                      className="num text-end"
                      value={toFaDigits(pctInput).replace(/\./g, '٫')}
                      placeholder="مثلاً ۲۵"
                      onChange={(e: any) => onPctChange(toEnDigits(e.target.value).replace(/٫/g, '.').replace(/[^\d.]/g, ''))}
                      onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                    />
                    <p className="mt-1 text-[10px] text-stone-400">قیمت فروش از مبنا × (۱ + درصد) محاسبه می‌شود</p>
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-xs text-stone-500">قیمت چاپی (ریال) *</label>
                    <Input
                      ref={priceRef}
                      dir="ltr" inputMode="decimal" className="num text-end"
                      value={toFaDigits(printedPrice)}
                      onChange={(e: any) => onPrintedChange(toEnDigits(e.target.value).replace(/٫/g, '.').replace(/[^\d.]/g, ''))}
                      onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                      placeholder="قیمت روی برچسب کالا"
                    />
                    {targetOk ? (
                      <button type="button" onClick={() => applySuggestion(targetOk)} className="mt-1 flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100">
                        <I.trendingUp size={11} /> قیمت برای حاشیه {fa(th.ok)}٪: {money(targetOk)} ریال
                      </button>
                    ) : null}
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs text-stone-500">
                    {free100 ? 'قیمت فروش پیشنهادی (ریال)' : 'قیمت فروش (ریال) *'}
                  </label>
                  {free100 ? (
                    <div className="flex h-10 items-center justify-end gap-1 rounded-md border border-dashed border-emerald-300 bg-emerald-50 px-3 text-sm font-bold text-emerald-700" dir="ltr">
                      {liveSale > 0 ? <>{money(liveSale)} <span className="text-[10px] font-normal text-emerald-600">ریال</span></> : <span className="text-xs font-normal text-stone-400">درصد سود را وارد کنید</span>}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        ref={saleRef}
                        dir="ltr" inputMode="decimal" className="num text-end"
                        value={toFaDigits(salePrice)}
                        onChange={(e: any) => onSaleChange(toEnDigits(e.target.value).replace(/٫/g, '.').replace(/[^\d.]/g, ''))}
                        onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                        placeholder="اگر همان چاپی است خالی بماند"
                      />
                      <Input
                        ref={pctRef}
                        dir="ltr" inputMode="decimal" className="num w-24 text-end"
                        value={toFaDigits(driver === 'pct' ? pctInput : (livePct > 0 ? String(round4(livePct)) : '')).replace(/\./g, '٫')}
                        onChange={(e: any) => onPctChange(toEnDigits(e.target.value).replace(/٫/g, '.').replace(/[^\d.]/g, ''))}
                        onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                        placeholder="٪ سود"
                        title="درصد سود — با تغییرش قیمت فروش بازمحاسبه می‌شود"
                      />
                    </div>
                  )}
                  <p className="mt-1 text-[10px] text-stone-400">
                    {free100
                      ? (liveSale > 0 ? <>درصد سود مؤثر: <b className="text-emerald-700">{faPct(livePct)}٪</b></> : '—')
                      : (liveUnitCost > 0 && liveSale > 0
                        ? <>درصد سود زنده: <b className={cn(live.level === 'red' ? 'text-rose-600' : live.level === 'yellow' ? 'text-amber-600' : 'text-emerald-600')}>{faPct(livePct)}٪</b> (۴ رقم اعشار)</>
                        : 'درصد سود با تغییر قیمت فروش، زنده به‌روز می‌شود')}
                  </p>
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
                          <Button size="sm" variant="outline" className="h-7 gap-1 border-stone-300 text-xs" onClick={() => applySuggestion(a.suggestion!, a.suggestionField)}>
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
                    ? <>حاشیهٔ این قلم: <b className={cn(live.level === 'red' ? 'text-rose-600' : live.level === 'yellow' ? 'text-amber-600' : 'text-emerald-600')}>{faPct(live.margin)}٪</b> — سود هر واحد {money(live.profitPerUnit)} ریال</>
                    : 'تعداد، جمع خرید و قیمت را وارد کنید تا تحلیل زنده نمایش داده شود'}
                </span>
                <Button className="gap-1.5" onClick={addItem}>
                  <I.plus size={15} /> افزودن به فاکتور
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* اقلام فاکتور — قابل ویرایش درجا */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon name="carton" size={18} /> اقلام فاکتور
                {items.length ? <Badge variant="secondary">{fa(items.length)} قلم</Badge> : null}
                {items.length ? <span className="text-[11px] font-normal text-stone-400">همهٔ خانه‌ها قبل از ثبت نهایی قابل ویرایشند</span> : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.length === 0 ? (
                <p className="py-6 text-center text-sm text-stone-400">هنوز قلمی به فاکتور اضافه نشده — با اسکن بارکد شروع کنید</p>
              ) : (
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">کالا</TableHead>
                        <TableHead className="text-center">تعداد</TableHead>
                        <TableHead className="text-center">جمع خرید</TableHead>
                        <TableHead className="text-center">فی واحد</TableHead>
                        <TableHead className="text-center">قیمت چاپی</TableHead>
                        <TableHead className="text-center">قیمت فروش</TableHead>
                        <TableHead className="text-center">٪ سود</TableHead>
                        <TableHead className="text-center">وضعیت</TableHead>
                        <TableHead className="text-center">سود کل</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((r) => {
                        const a = rowAnalysis(r, th)
                        const b = levelBadge(a.level)
                        const dev = r.free100 ? null : costDeviation(r.quantity > 0 ? r.totalCost / r.quantity : 0, r.history)
                        const rp = rowPct(r)
                        const effSale = r.free100 ? r.salePrice : r.salePrice || r.printedPrice
                        return (
                          <TableRow key={r.key}>
                            <TableCell className="min-w-40">
                              <div className="flex items-center gap-1.5 text-xs font-medium">
                                {dev !== null ? (
                                  <button
                                    type="button"
                                    onClick={() => openHistoryDialog(r)}
                                    title={dev > 0
                                      ? `بهای خرید نسبت به دفعه قبل افزایش جدی داشته — بهای قبلی هر واحد ${fmtQuick(r.history!.lastUnitCost!)} ریال بود و الان ${fmtQuick(r.totalCost / (r.quantity || 1))} ریال است (+${fa(Math.round(dev * 100))}٪). اگر این تغییر عمدی نیست، جمع مبلغ خرید را بررسی کنید.`
                                      : `بهای خرید نسبت به دفعه قبل کاهش جدی داشته — بهای قبلی هر واحد ${fmtQuick(r.history!.lastUnitCost!)} ریال بود و الان ${fmtQuick(r.totalCost / (r.quantity || 1))} ریال است (−${fa(Math.round(Math.abs(dev) * 100))}٪). اگر این تغییر عمدی نیست، جمع مبلغ خرید را بررسی کنید.`}
                                    className="shrink-0 text-amber-500 hover:text-amber-600"
                                    aria-label="هشدار تغییر بهای خرید — سابقهٔ قیمت"
                                  >
                                    <I.alertTriangle size={14} />
                                  </button>
                                ) : r.productId ? (
                                  <button
                                    type="button"
                                    onClick={() => openHistoryDialog(r)}
                                    title="سابقهٔ قیمت این کالا"
                                    className="shrink-0 text-stone-300 hover:text-teal-600"
                                    aria-label="سابقهٔ قیمت"
                                  >
                                    <I.history size={13} />
                                  </button>
                                ) : null}
                                <span className="truncate">{r.name}</span>
                              </div>
                              <div className="text-[10px] text-stone-400">
                                {r.unit}{r.barcode ? <span dir="ltr"> · {r.barcode}</span> : null}
                                {r.free100 ? <span className="font-bold text-emerald-600"> · رایگان (تخفیف ۱۰۰٪)</span> : null}
                                {a.hasCritical ? <span className="font-bold text-rose-600"> · زیر بهای تمام‌شده!</span> : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => updateItem(r.key, { free100: !r.free100 })}
                                className={cn(
                                  'mt-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold transition-colors',
                                  r.free100 ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-stone-200 bg-stone-50 text-stone-400 hover:border-emerald-200 hover:text-emerald-600',
                                )}
                              >
                                تخفیف ۱۰۰٪ {r.free100 ? '✓' : ''}
                              </button>
                            </TableCell>
                            <TableCell className="text-center">
                              <RowNumInput
                                className="num h-8 w-16 text-center text-xs"
                                value={toFaDigits(String(r.quantity)).replace(/\./g, '٫')}
                                onCommit={(v) => updateItem(r.key, { quantity: Math.round(num(v) * 1000) / 1000 || 0 })}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              {r.free100 ? (
                                <div className="flex h-8 items-center justify-center text-[11px] text-stone-400">رایگان</div>
                              ) : (
                                <RowNumInput
                                  className="num h-8 w-24 text-center text-xs"
                                  value={toFaDigits(String(r.totalCost))}
                                  onCommit={(v) => updateItem(r.key, { totalCost: Math.round(num(v)) })}
                                />
                              )}
                            </TableCell>
                            <TableCell className="text-center text-xs text-stone-500" dir="ltr">
                              {r.free100 ? <span className="text-[10px] text-stone-400">مبنا {money(r.baseCost)}</span> : money(r.quantity > 0 ? r.totalCost / r.quantity : 0)}
                            </TableCell>
                            <TableCell className="text-center">
                              {r.free100 ? (
                                <div className="flex h-8 items-center justify-center text-[11px] text-stone-400">ندارد</div>
                              ) : (
                                <RowNumInput
                                  className="num h-8 w-24 text-center text-xs"
                                  value={toFaDigits(String(r.printedPrice))}
                                  onCommit={(v) => updateItem(r.key, { printedPrice: Math.round(num(v)) })}
                                />
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <RowNumInput
                                className="num h-8 w-24 text-center text-xs"
                                value={toFaDigits(String(r.salePrice))}
                                onCommit={(v) => updateItem(r.key, { salePrice: Math.round(num(v)) })}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <RowNumInput
                                className={cn('num h-8 w-24 text-center text-xs font-bold', a.level === 'red' && 'border-rose-300 text-rose-700', a.level === 'yellow' && 'border-amber-300 text-amber-700', a.level === 'green' && 'border-emerald-300 text-emerald-700')}
                                value={toFaDigits(r.driver === 'pct' ? String(r.pct) : (effSale > 0 && (r.free100 ? r.baseCost > 0 : (r.quantity > 0 && r.totalCost > 0)) ? String(round4(rp)) : '')).replace(/\./g, '٫')}
                                onCommit={(v) => updateItem(r.key, { pct: num(v) })}
                                title="درصد سود — با تغییرش قیمت فروش بازمحاسبه می‌شود و برعکس"
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <span className={cn('inline-block rounded px-1.5 py-0.5 text-[11px] font-bold', b.cls)}>{faPct(rp)}٪</span>
                            </TableCell>
                            <TableCell className={cn('text-center text-xs font-bold', a.totalProfit < 0 ? 'text-rose-600' : 'text-emerald-700')} dir="ltr">
                              {money(a.totalProfit)}
                            </TableCell>
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
                  <div className="text-[10px] text-stone-500">جمع فروش</div>
                  <div className="text-sm font-bold text-teal-700" dir="ltr">{money(summary.revenue)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-stone-500">سود کل</div>
                  <div className={cn('text-sm font-bold', summary.profit < 0 ? 'text-rose-600' : 'text-emerald-700')} dir="ltr">{money(summary.profit)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-stone-500">میانگین درصد سود</div>
                  <div className={cn('text-sm font-bold', summary.margin < th.alert ? 'text-rose-600' : summary.margin < th.ok ? 'text-amber-600' : 'text-emerald-700')}>
                    {summary.cost > 0 ? `${faPct(summary.margin)}٪` : '—'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="outline" className="gap-1.5" onClick={newInvoice}>
                  <I.refresh size={15} /> فاکتور جدید
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" data-tour="save" disabled={saving || items.length === 0} className="gap-1.5" onClick={() => void save()}>
                    {saving ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />}
                    ذخیرهٔ فاکتور در سودسنج
                  </Button>
                  <Button disabled={purchasing || items.length === 0} className="gap-1.5" onClick={() => void submitPurchase()}>
                    {purchasing ? <I.loader size={15} className="animate-spin" /> : <I.store size={15} />}
                    ثبت خرید مستقیم (بدون سفارش)
                  </Button>
                  {canSetTh ? (
                    <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[11px] font-bold text-stone-600">
                      <input type="checkbox" checked={pushHoloo} onChange={(e: any) => setPushHoloo(!!e.target.checked)} className="size-3.5 accent-emerald-600" />
                      همزمان ثبت در هلو
                    </label>
                  ) : null}
                </div>
              </div>
              {!canSetTh ? (
                <p className="text-[10px] text-stone-400">مسیر اصلی خرید: «سفارش‌گذاری» → تأیید → «دریافت کالا» → راستی‌آزمایی → «ثبت حسابداری». این دکمه فقط برای خریدِ مستقیمِ بدون سفارش قبلی است (تحویل در لحظهٔ ثبت، فاکتور سودسنج + سند خرید می‌سازد)؛ ارسال به هلو پس از ثبت توسط مدیران ارشد از بخش هلو انجام می‌شود.</p>
              ) : (
                <p className="text-[10px] text-stone-400">مسیر اصلی خرید: «سفارش‌گذاری» → تأیید → «دریافت کالا» → راستی‌آزمایی → «ثبت حسابداری». این دکمه فقط برای خریدِ مستقیمِ بدون سفارش قبلی است (تحویل در لحظهٔ ثبت) و (در صورت فعال‌بودن اتصال) سفارش خرید را به هلو ارسال می‌کند.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* گیج زنده — ستون چپ */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <MarginGauge
            result={live.valid ? live : summaryAnalysis}
            caption={live.valid ? 'حاشیه سود این قلم' : 'میانگین درصد سود فاکتور'}
            th={th}
          />
          <p className="mt-2 text-center text-[10px] leading-4 text-stone-400">
            حاشیه = (قیمت فروش − بهای هر واحد) ÷ بهای هر واحد × ۱۰۰
            <br />
            {user?.fullName ? `کاربر: ${user.fullName}` : null}
          </p>
        </div>
      </div>

      {/* دیالوگ تنظیم آستانه‌های سود */}
      <Dialog open={thOpen} onOpenChange={setThOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.settings size={17} /> آستانه‌های سودسنج</DialogTitle>
            <DialogDescription>
              سه ناحیهٔ رنگی حاشیه سود را مدیران تعیین می‌کنند — همهٔ گیج‌ها، چیپ‌ها و هشدارها با همین اعداد به‌روز می‌شوند.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-stone-500">آستانهٔ قرمز (زیر این درصد)</label>
                <Input
                  dir="ltr" inputMode="decimal" className="num text-center"
                  value={toFaDigits(thAlert)}
                  onChange={(e: any) => setThAlert(toEnDigits(e.target.value).replace(/٫/g, '.').replace(/[^\d.]/g, ''))}
                  placeholder="12"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-stone-500">آستانهٔ سبز (از این درصد به بالا)</label>
                <Input
                  dir="ltr" inputMode="decimal" className="num text-center"
                  value={toFaDigits(thOk)}
                  onChange={(e: any) => setThOk(toEnDigits(e.target.value).replace(/٫/g, '.').replace(/[^\d.]/g, ''))}
                  placeholder="21"
                />
              </div>
            </div>
            {(() => {
              const a = num(thAlert)
              const o = num(thOk)
              const valid = a >= 0 && o > a
              return (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-stone-500">پیش‌نمایش ناحیه‌ها:</div>
                  <div className="flex items-center justify-center gap-2">
                    <span className={cn('rounded-lg px-2.5 py-1.5 text-[11px] font-bold', valid ? 'bg-rose-100 text-rose-700' : 'bg-stone-100 text-stone-400')}>قرمز · زیر {fa(thAlert) || '؟'}٪</span>
                    <span className="text-stone-300">→</span>
                    <span className={cn('rounded-lg px-2.5 py-1.5 text-[11px] font-bold', valid ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-400')}>کهربایی · {fa(thAlert) || '؟'}٪ تا {fa(thOk) || '؟'}٪</span>
                    <span className="text-stone-300">→</span>
                    <span className={cn('rounded-lg px-2.5 py-1.5 text-[11px] font-bold', valid ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-400')}>سبز · {fa(thOk) || '؟'}٪ و بالاتر</span>
                  </div>
                  {!valid ? <p className="text-center text-[11px] font-bold text-rose-600">آستانهٔ سبز باید بزرگ‌تر از آستانهٔ قرمز باشد</p> : null}
                </div>
              )
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setThOpen(false)}>انصراف</Button>
            <Button disabled={thSaving} onClick={() => void saveThresholds()}>
              {thSaving ? <I.loader size={15} className="animate-spin" /> : <I.save size={15} />} ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ سابقهٔ قیمت کالا */}
      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><I.history size={17} /> سابقهٔ قیمت «{histProduct?.name ?? 'کالا'}»</DialogTitle>
            <DialogDescription>
              همهٔ خریدهای قبلی این کالا از فاکتورهای سودسنج و سفارش‌های خرید — برای پایش روند قیمت.
            </DialogDescription>
          </DialogHeader>
          {histLoading ? (
            <div className="py-8 text-center text-sm text-stone-400"><I.loader size={18} className="mx-auto mb-2 animate-spin" /> در حال دریافت سابقه…</div>
          ) : histRows.length === 0 ? (
            <div className="py-8 text-center text-sm text-stone-400">
              سابقهٔ ثبت‌شده‌ای برای این کالا یافت نشد.
              {histMeta?.lastUnitCost ? <div className="mt-1 text-[11px]">آخرین بهای هر واحد در حافظهٔ کالا: <b dir="ltr">{money(histMeta.lastUnitCost)}</b> ریال</div> : null}
            </div>
          ) : (
            <div className="max-h-80 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">تاریخ</TableHead>
                    <TableHead className="text-center">منبع</TableHead>
                    <TableHead className="text-right">تأمین‌کننده</TableHead>
                    <TableHead className="text-center">تعداد</TableHead>
                    <TableHead className="text-center">بهای هر واحد</TableHead>
                    <TableHead className="text-center">قیمت چاپی</TableHead>
                    <TableHead className="text-center">قیمت فروش</TableHead>
                    <TableHead className="text-center">٪ سود</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {histRows.map((row, i) => {
                    const lvl = row.profitPct === null ? 'none' : marginLevel(row.profitPct, th)
                    const bb = levelBadge(lvl as Level)
                    return (
                      <TableRow key={i} className={row.latest ? 'bg-emerald-50/40' : ''}>
                        <TableCell className="text-xs">{faSlash(row.dateJalali || jsDateToJalali(new Date(row.createdAt)))}</TableCell>
                        <TableCell className="text-center text-[11px]">{row.source === 'order' ? 'سفارش خرید' : 'سودسنج'}</TableCell>
                        <TableCell className="max-w-32 truncate text-xs">{row.supplierName || '—'}</TableCell>
                        <TableCell className="text-center text-xs">{fa(row.quantity)}</TableCell>
                        <TableCell className="text-center text-xs" dir="ltr">{row.unitCost > 0 ? money(row.unitCost) : '—'}</TableCell>
                        <TableCell className="text-center text-xs" dir="ltr">{row.printedPrice > 0 ? money(row.printedPrice) : '—'}</TableCell>
                        <TableCell className="text-center text-xs" dir="ltr">{row.salePrice > 0 ? money(row.salePrice) : '—'}</TableCell>
                        <TableCell className="text-center">
                          <span className={cn('inline-block rounded px-1.5 py-0.5 text-[11px] font-bold', bb.cls)}>{faPct(row.profitPct)}٪</span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter className="items-center gap-2 sm:justify-between">
            <div className="text-[11px] text-stone-500">
              {histMeta?.lastUnitCost ? <>آخرین بهای هر واحد: <b dir="ltr">{money(histMeta.lastUnitCost)}</b> ریال</> : null}
              {histMeta?.lastPrintedPrice ? <> · آخرین قیمت چاپی: <b dir="ltr">{money(histMeta.lastPrintedPrice)}</b> ریال</> : null}
            </div>
            <Button variant="outline" onClick={() => setHistOpen(false)}>بستن</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
