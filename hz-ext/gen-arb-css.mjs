/**
 * gen-arb-css.mjs — تولید CSS برای کلاس‌های arbitrary-value استفاده‌شده در ویوهای hz-ext
 * -----------------------------------------------------------------------------
 * مشکل: CSS اپ فروزن (b8c5081c….css) فقط کلاس‌های استفاده‌شده در کد اصلی اپ را دارد.
 * ویوهای hz-ext کلاس‌های `h-[420px]`، `lg:grid-cols-[1fr_370px]` و مانند آن را
 * به‌کار می‌برند که در CSS فروزن نیستند → ظرف با ارتفاع صفر رندر می‌شود
 * (بیماری «نقشهٔ فروشگاه ۲ پیکسلی»).
 * راه‌حل: اسکن سورس‌های hz-ext/src (همهٔ tsx/ts)، استخراج توکن‌های کلاس arbitrary،
 * تولید قواعد CSS معادل (شامل variantهای sm:/md:/lg:/xl: و hover:/focus:/…)
 * و الحاق به CSS فروزن (idempotent — هر بار از نسخهٔ بکر originals بازسازی می‌شود).
 *
 * اعتبارسنجی سخت‌گیرانهٔ مقدار بر اساس prefix (طول، رنگ، گرید، سایه و…) تضمین
 * می‌کند فقط کلاس‌های واقعی CSS تولید شوند و کدهای JS (مثل m-[k]) رد شوند.
 *
 * استفادهٔ مستقل:  node hz-ext/gen-arb-css.mjs   (build.mjs هم آن را صدا می‌زند)
 */
import { readFileSync, writeFileSync, copyFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC_ROOT = join(__dirname, 'src')
const CHUNKS = join(ROOT, 'public', '_next', 'static', 'chunks')
const CSS_FILE = join(CHUNKS, 'b8c5081c57c11dd3.css')
const ORIG_CSS = join(__dirname, 'originals', 'b8c5081c57c11dd3.css')

// ── نقشهٔ prefix → property ─────────────────────────────────────────────
const LENGTH_PROPS = {
  'w': 'width', 'h': 'height', 'size': ['width', 'height'],
  'min-w': 'min-width', 'min-h': 'min-height', 'max-w': 'max-width', 'max-h': 'max-height',
  'p': 'padding', 'px': 'padding-inline', 'py': 'padding-block',
  'pt': 'padding-top', 'pr': 'padding-right', 'pb': 'padding-bottom', 'pl': 'padding-left',
  'm': 'margin', 'mx': 'margin-inline', 'my': 'margin-block',
  'mt': 'margin-top', 'mr': 'margin-right', 'mb': 'margin-bottom', 'ml': 'margin-left',
  'gap': 'gap', 'gap-x': 'column-gap', 'gap-y': 'row-gap',
  'top': 'top', 'right': 'right', 'bottom': 'bottom', 'left': 'left', 'inset': 'inset',
  'inset-x': 'inset-inline', 'inset-y': 'inset-block',
  'leading': 'line-height', 'tracking': 'letter-spacing',
  'basis': 'flex-basis',
  'border': 'border-width', 'border-t': 'border-top-width', 'border-b': 'border-bottom-width',
  'border-l': 'border-left-width', 'border-r': 'border-right-width',
  'border-x': ['border-left-width', 'border-right-width'], 'border-y': ['border-top-width', 'border-bottom-width'],
  'rounded': 'border-radius',
  'rounded-t': 'border-top-left-radius;border-top-right-radius',
  'rounded-b': 'border-bottom-left-radius;border-bottom-right-radius',
  'rounded-l': 'border-top-left-radius;border-bottom-left-radius',
  'rounded-r': 'border-top-right-radius;border-bottom-right-radius',
  'rounded-tl': 'border-top-left-radius', 'rounded-tr': 'border-top-right-radius',
  'rounded-bl': 'border-bottom-left-radius', 'rounded-br': 'border-bottom-right-radius',
  'grid-cols': 'grid-template-columns', 'grid-rows': 'grid-template-rows',
  'col-span': 'grid-column', 'row-span': 'grid-row',
  'columns': 'columns',
}
const INT_PROPS = { 'z': 'z-index', 'order': 'order', 'col-span': 'grid-column', 'row-span': 'grid-row' }
const COLOR_PROPS = {
  'text': 'color', 'bg': 'background-color', 'border': 'border-color',
  'fill': 'fill', 'stroke': 'stroke',
}
const MEDIA = { 'sm': 640, 'md': 768, 'lg': 1024, 'xl': 1280, '2xl': 1536 }
const PSEUDO = {
  'hover': ':hover', 'focus': ':focus', 'focus-visible': ':focus-visible', 'focus-within': ':focus-within',
  'active': ':active', 'disabled': ':disabled', 'enabled': ':enabled', 'checked': ':checked',
  'first': ':first-child', 'last': ':last-child', 'odd': ':nth-child(odd)', 'even': ':nth-child(even)',
  'placeholder': '::placeholder', 'selection': '::selection',
}
const VARIANTS = new Set([...Object.keys(MEDIA), ...Object.keys(PSEUDO)])

const normValue = (v) => v.replace(/_/g, ' ').trim()
const escSel = (cls) => cls.replace(/([^\w-])/g, (c) => '\\' + c)
const isLength = (v) => /^-?[\d.]+(px|rem|em|%|vh|vw|vmin|vmax|ch|ex|ms|s)$/i.test(v) || /^calc\(/i.test(v)
const isColor = (v) => /^#/.test(v) || /^(rgb|rgba|hsl|hsla|color-mix)\(/i.test(v)

/** تولید declaration از utility (بدون variant) — یا null اگر نامعتبر */
function declFor(prefix, rawVal) {
  const val = normValue(rawVal)
  // سایه
  if (prefix === 'shadow') return /^[\d.]/.test(val) || /^inset/.test(val) ? `box-shadow:${val}` : null
  // فلکس
  if (prefix === 'flex') return /^[\d.\s]/.test(val) ? `flex:${val}` : null
  // رنگ
  if (isColor(val)) {
    const prop = COLOR_PROPS[prefix]
    return prop ? `${prop}:${val}` : null
  }
  // عدد صحیح (z/order/span)
  if (INT_PROPS[prefix]) return /^-?\d+$/.test(val) ? `${INT_PROPS[prefix]}:${val}` : null
  // طول
  if (prefix === 'translate-x' || prefix === 'translate-y') {
    if (!isLength(val)) return null
    const varName = prefix === 'translate-x' ? '--hz-translate-x' : '--hz-translate-y'
    return `${varName}:${val};transform:translate(var(--hz-translate-x,0),var(--hz-translate-y,0))`
  }
  if (prefix === 'rotate') return /^-?[\d.]+(deg|turn|rad)$/.test(val) ? `rotate:${val}` : null
  if (prefix === 'scale') return /^-?[\d.]+%?$/.test(val) ? `scale:${val}` : null
  // طول/گرید
  const prop = LENGTH_PROPS[prefix]
  if (!prop) return null
  if (prefix === 'grid-cols' || prefix === 'grid-rows' || prefix === 'columns') {
    return /\d/.test(val) ? (Array.isArray(prop) ? prop.map((p) => `${p}:${val}`).join(';') : `${prop}:${val}`) : null
  }
  if (prefix === 'col-span' || prefix === 'row-span') return null // بالاتر هندل شد (INT)
  if (!isLength(val)) return null // «۱» بدون واحد یا کد JS → رد
  if (Array.isArray(prop)) return prop.map((p) => `${p}:${val}`).join(';')
  return `${prop}:${val}`
}

function collectTokens() {
  const tokens = new Set()
  const walk = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name)
      if (f.isDirectory()) walk(p)
      else if (/\.(tsx|ts)$/.test(f.name)) {
        const src = readFileSync(p, 'utf8')
        // هر توکن X[Y] که X فقط حروف/عدد/دونقطه/خط تیره دارد و Y بدون براکت/کوت/آکولاد/فاصله است
        const re = /([a-zA-Z0-9_.\-:]+)\[([^\[\]`'"{}\s]+)\]/g
        let m
        while ((m = re.exec(src))) tokens.add(m[1] + '[' + m[2] + ']')
      }
    }
  }
  walk(SRC_ROOT)
  return tokens
}

/** تجزیهٔ توکن: variantها + utility + مقدار — یا null اگر کلاس نیست */
function parseToken(tok) {
  // بخش utility = آخرین سگمنت بعد از «:» بیرون از براکت
  const lastColon = (() => {
    let depth = 0, idx = -1
    for (let i = 0; i < tok.length; i++) {
      const c = tok[i]
      if (c === '[') depth++
      else if (c === ']') depth--
      else if (c === ':' && depth === 0) idx = i
    }
    return idx
  })()
  const util = lastColon >= 0 ? tok.slice(lastColon + 1) : tok
  const variantPart = lastColon >= 0 ? tok.slice(0, lastColon) : ''
  const variants = variantPart ? variantPart.split(':') : []
  for (const v of variants) if (!VARIANTS.has(v)) return null // کد JS، نه کلاس
  const bm = util.match(/^(-?)([a-z][a-z0-9-]*)-\[([^\]]+)\]$/)
  if (!bm) return null
  return { variants, neg: bm[1] === '-', prefix: bm[2], val: bm[3] }
}

function generate() {
  const parsed = [...collectTokens()].map(parseToken).filter(Boolean)
  const seen = new Set()
  const out = []
  for (const t of parsed) {
    let d = declFor(t.prefix, t.val)
    if (!d) continue
    if (t.neg) {
      // فقط برای margin/inset/translate منطقی است
      if (!/^(m|mx|my|mt|mr|mb|ml|top|right|bottom|left|inset|inset-x|inset-y|translate-x|translate-y)$/.test(t.prefix)) continue
      d = d.replace(/^(--[a-z-]+|[a-z-]+):(.+)$/, (_m, p, v) => `${p}:-${v.replace(/^calc\(/, 'calc(((').replace(/\)$/, ')*-1)')}`)
    }
    const cls = `${t.variants.length ? t.variants.join(':') + ':' : ''}${t.neg ? '-' : ''}${t.prefix}-[${t.val}]`
    const key = cls
    if (seen.has(key)) continue
    seen.add(key)
    const sel = '.' + escSel(cls)
    let rule = `${sel}{${d}}`
    const pseudoVars = t.variants.filter((v) => PSEUDO[v])
    for (const pv of pseudoVars) rule = `${sel}${PSEUDO[pv]}{${d}}`
    const mediaVars = t.variants.filter((v) => MEDIA[v])
    for (const mv of mediaVars) rule = `@media (min-width:${MEDIA[mv]}px){${rule}}`
    out.push(rule)
  }
  return { css: out.join('\n'), count: out.length, classes: [...seen] }
}

/** R10 — اصلاح راست‌چین دیالوگ‌ها: کامپوننت‌های shadnc dialog-header و alert-dialog-header
 *  پیش‌فرض LTRِ «text-center sm:text-left» دارند؛ در اپ فارسی RTL این یعنی متنِ توضیح
 *  دیالوگ از لبهٔ چپ شروع می‌شود (عنوان به‌خاطر flex درست می‌ماند ولی توضیح خراب است).
 *  این قاعده در breakpoint اس‌ام و بالاتر راست‌چین می‌کند (هم‌ارزِ sm:text-right).
 *  + استایل مرتب برای radio/checkbox های بومی (اگر جایی رندر شوند دیگر شکل خام مرورگر
 *  با تم روشن نمی‌گیرند — هم‌رنگِ هویت سبز فروشگاه می‌شوند). */
const RTL_FIX_CSS = `
/* R10 RTL dialog-header fix — shadcn default is sm:text-left (LTR); Persian app needs right */
@media (min-width: 640px) {
  [data-slot="dialog-header"], [data-slot="alert-dialog-header"] { text-align: right; }
}
/* R10 — native radio/checkbox polish (wherever they render): brand-colored, crisp */
[dir="rtl"] input[type="radio"] {
  accent-color: #227849;
  width: 1.05rem; height: 1.05rem;
  cursor: pointer;
  vertical-align: middle;
}
[dir="rtl"] input[type="checkbox"] {
  accent-color: #227849;
  width: 1.05rem; height: 1.05rem;
  cursor: pointer;
  vertical-align: middle;
  border-radius: 0.25rem;
}
`

/* ═══════════════════════════════════════════════════════════════════════
   R11 — genMissingStandard(): قواعد کلاس‌های استانداردِ غایب در CSS فروزن
   ─────────────────────────────────────────────────────────────────────
   مشکل: CSS اپ فروزن فقط کلاس‌های استفاده‌شده در کد اصلی را دارد. ویوهای hz-ext
   کلاس‌هایی مثل `bg-teal-700` به‌کار می‌برند که در CSS نیستند → استایل بی‌صدا
   اعمال نمی‌شود. نمونهٔ گزارش‌شدهٔ مالک (R11): دکمهٔ سگمنتِ فعالِ «همهٔ پرسنل»
   در تم روشن = متنِ سفید روی پس‌زمینهٔ شفاف/سفید (bg-teal-700 وجود نداشت).
   راه‌حل: اسکن سورس‌های hz-ext، یافتن توکن‌های کلاسِ استانداردِ غایب و تولید
   قاعدهٔ سازگار با Tailwind v4 (مقادیر از پالتِ تعریف‌شده در @theme:
   var(--color-<family>-<scale>) — همهٔ مقادیر در CSS موجودند).
   پوشش:
     • رنگ‌های مقیاس‌دار: bg/text/border/ring/accent/decoration/fill/stroke
       + ۲۴ خانوادهٔ رنگ + ۱۱ درجه + شفافیت /N (color-mix مثل الگوی فروزن)
     • گرادیان: from-/to- (الگوی دقیق --tw-gradient-* فروزن)
     • فاصلهٔ منفی: -(m|mt|…|top|left|…)-<n> → calc(var(--spacing)*-n)
     • نقشهٔ ایستا: align-top، bg-gradient-to-t و مانند آن
     • variantها: hover/focus/… (pseudo)، dark: (`.dark\:X:is(.dark *)`)،
       sm/md/lg/xl (media) — با ترکیب‌های واقعی.
   idempotent: هر بار از CSS بکر بازسازی می‌شود.
   ═══════════════════════════════════════════════════════════════════════ */
const COLOR_FAMILIES = [
  'teal', 'emerald', 'rose', 'amber', 'stone', 'orange', 'red', 'green', 'lime', 'yellow',
  'cyan', 'sky', 'violet', 'purple', 'pink', 'slate', 'gray', 'neutral',
  'primary', 'secondary', 'destructive', 'gold', 'muted', 'accent', 'card', 'popover',
  'background', 'foreground',
]
const SCALES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
const COLOR_PROPS2 = { bg: 'background-color', text: 'color', border: 'border-color', accent: 'accent-color', decoration: 'text-decoration-color', fill: 'fill', stroke: 'stroke' }
const PSEUDO2 = { hover: ':hover', focus: ':focus', 'focus-visible': ':focus-visible', active: ':active', disabled: ':disabled', first: ':first-child', last: ':last-child', odd: ':nth-child(odd)', even: ':nth-child(even)' }
const MEDIA2 = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 }
const VARIANT_KEYS = new Set([...Object.keys(PSEUDO2), ...Object.keys(MEDIA2), 'dark'])
const SPACING_PREFIXES = {
  m: 'margin', mt: 'margin-top', mr: 'margin-right', mb: 'margin-bottom', ml: 'margin-left',
  mx: ['margin-inline'], my: ['margin-block'],
  p: 'padding', pt: 'padding-top', pr: 'padding-right', pb: 'padding-bottom', pl: 'padding-left',
  px: ['padding-inline'], py: ['padding-block'],
  top: 'top', right: 'right', bottom: 'bottom', left: 'left',
  inset: 'inset', 'inset-x': ['inset-inline'], 'inset-y': ['inset-block'],
  w: 'width', h: 'height', 'min-w': 'min-width', 'min-h': 'min-height', 'max-w': 'max-width', 'max-h': 'max-height',
  gap: 'gap', 'gap-x': 'column-gap', 'gap-y': 'row-gap', basis: 'flex-basis',
}
/** نقشهٔ ایستا برای کلاس‌های خاصی که الگوی عام ندارند (هرچه استفاده شود و غایب باشد) */
const STATIC_RULES = {
  'align-top': 'vertical-align:top',
  'align-middle': 'vertical-align:middle',
  'align-bottom': 'vertical-align:bottom',
  'bg-gradient-to-t': '--tw-gradient-position:to top in oklab;background-image:linear-gradient(var(--tw-gradient-stops))',
  'bg-gradient-to-tl': '--tw-gradient-position:to top left in oklab;background-image:linear-gradient(var(--tw-gradient-stops))',
  'bg-gradient-to-tr': '--tw-gradient-position:to top right in oklab;background-image:linear-gradient(var(--tw-gradient-stops))',
  'bg-gradient-to-bl': '--tw-gradient-position:to bottom left in oklab;background-image:linear-gradient(var(--tw-gradient-stops))',
  'bg-gradient-to-br': '--tw-gradient-position:to bottom right in oklab;background-image:linear-gradient(var(--tw-gradient-stops))',
  'auto-cols-min': 'grid-auto-columns:min-content',
  'not-italic': 'font-style:normal',
  'snap-x': 'scroll-snap-type:x var(--tw-scroll-snap-strictness,proximity)',
  'snap-mandatory': '--tw-scroll-snap-strictness:mandatory',
  'scroll-smooth': 'scroll-behavior:smooth',
  'hyphens-auto': 'hyphens:auto',
}
/** pattern توکن رنگ: [variants:]-(prefix)-(family)-(scale)(/N)? — variantهای ناشناخته (group-hover: و…) اصلاً match نمی‌شوند */
const COLOR_TOKEN = new RegExp(
  '^((?:(?:hover|focus|focus-visible|active|disabled|first|last|odd|even|dark|sm|md|lg|xl|2xl)(?::))*)?(bg|text|border|ring|accent|decoration|fill|stroke|from|via|to)-(' +
    COLOR_FAMILIES.join('|') + ')(?:-(\\d+))?(?:\\/(\\d+))?$',
)

/** استخراج مجموعهٔ کلاس‌های موجود از CSS (نام کلاس با/بدون variant — مثل فروزن) */
function availableClasses(cssText) {
  const out = new Set()
  for (const m of cssText.matchAll(/([^{}@]+)\{/g)) {
    const sels = m[1]
    if (sels.trim().startsWith('/*')) continue
    for (const part of sels.split(',')) {
      for (const sm of part.matchAll(/\.((?:[a-z0-9-]+\\:)*-?[a-zA-Z0-9][a-zA-Z0-9._\[\]/%\\-]*)(?![\w(])/g)) {
        const tok = sm[1].replace(/\\/g, '')
        if (!tok.startsWith('hz-')) out.add(tok)
      }
    }
  }
  return out
}

/** اسکن سورس‌های hz-ext → همهٔ توکن‌های کلاس‌مانند در رشته‌ها */
function collectSourceTokens() {
  const toks = new Set()
  const walk = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name)
      if (f.isDirectory()) walk(p)
      else if (/\.(tsx|ts)$/.test(f.name)) {
        const src = readFileSync(p, 'utf8')
        for (const m of src.matchAll(/[`"']((?:[^`"'\\\n]|\\.){1,300}?)[`"']/g)) {
          const s = m[1]
          for (const t of s.split(/[\s]+/)) {
            const tok = t.trim().replace(/^['"`]+|['"`]+$/g, '')
            if (tok && /^-?[a-z][a-zA-Z0-9:\/\[\]\.\-%_,()#\\]*$/.test(tok) && tok.length < 70) toks.add(tok)
          }
        }
      }
    }
  }
  walk(SRC_ROOT)
  return toks
}

const esc2 = (cls) => cls.replace(/([^\w-])/g, (c) => '\\' + c)

/** ساخت قاعدهٔ CSS با variantها — الگوی Tailwind v4 فروزن */
function buildRule(cls, decl) {
  const parts = cls.split(':')
  const util = parts[parts.length - 1]
  const variants = parts.slice(0, -1)
  let sel = '.' + esc2(cls)
  let media = ''
  for (const v of variants) {
    if (v === 'dark') sel += ':is(.dark *)'
    else if (PSEUDO2[v]) sel += PSEUDO2[v]
    else if (MEDIA2[v]) media = `@media (min-width:${MEDIA2[v]}px)`
    else return null // variant ناشناخته
  }
  let rule = `${sel}{${decl}}`
  if (media) rule = `${media}{${rule}}`
  return rule
}

/** decl برای کلاس رنگ (بدون variant) */
function colorDecl(prefix, family, scale, op) {
  const base = scale ? `var(--color-${family}-${scale})` : `var(--color-${family})`
  const withOp = (plain) => (op ? `color-mix(in oklab,${plain}${op}%,transparent)` : plain)
  if (prefix === 'ring') return `--tw-ring-color:${withOp(base)}`
  if (prefix === 'from') return `--tw-gradient-from:${base};--tw-gradient-stops:var(--tw-gradient-via-stops,var(--tw-gradient-position),var(--tw-gradient-from)var(--tw-gradient-from-position),var(--tw-gradient-to)var(--tw-gradient-to-position))`
  if (prefix === 'to') return `--tw-gradient-to:${base};--tw-gradient-stops:var(--tw-gradient-via-stops,var(--tw-gradient-position),var(--tw-gradient-from)var(--tw-gradient-from-position),var(--tw-gradient-to)var(--tw-gradient-to-position))`
  if (prefix === 'via') return `--tw-gradient-via:${base}`
  const prop = COLOR_PROPS2[prefix]
  return prop ? `${prop}:${withOp(base)}` : null
}

/** decl برای کلاس فاصلهٔ منفی/مثبت عددی */
function spacingDecl(prefix, num, neg) {
  const props = SPACING_PREFIXES[prefix]
  if (!props) return null
  const n = Number(num)
  if (!Number.isFinite(n) || n < 0 || n > 200) return null
  const val = `calc(var(--spacing)*${neg ? '-' : ''}${n})`
  const list = Array.isArray(props) ? props : [props]
  return list.map((p) => `${p}:${val}`).join(';')
}

/** تولید کامل بخش کلاس‌های استانداردِ غایب */
export function genMissingStandard(pristineCss) {
  const avail = availableClasses(pristineCss)
  const toks = collectSourceTokens()
  const rules = new Map() // cls -> rule
  const unmatched = []
  for (const tok of toks) {
    if (avail.has(tok)) continue
    // ── ۱) کلاس ایستا ──
    if (STATIC_RULES[tok] && !rules.has(tok)) { rules.set(tok, buildRule(tok, STATIC_RULES[tok]) ?? ''); continue }
    // ── ۲) کلاس رنگ ──
    const cm = COLOR_TOKEN.exec(tok)
    if (cm) {
      const variants2 = (cm[1] || '').split(':').filter(Boolean)
      if (!variants2.every((v) => VARIANT_KEYS.has(v))) { unmatched.push(tok); continue }
      const prefix = cm[2]
      const family = cm[3]
      const scale = cm[4] ? Number(cm[4]) : null
      const op = cm[5] ? Number(cm[5]) : null
      if (scale !== null && !SCALES.includes(scale)) { unmatched.push(tok); continue }
      if (op !== null && !(op >= 0 && op <= 100)) { unmatched.push(tok); continue }
      const decl = colorDecl(prefix, family, scale, op)
      if (decl) { rules.set(tok, buildRule(tok, decl) ?? ''); continue }
    }
    // ── ۳) فاصلهٔ (منفی) عددی: -mt-0.5 / top-2 / -left-1.5 ──
    const sm = /^(-?)((?:mx|my|mt|mr|mb|ml|m|px|py|pt|pr|pb|pl|p|top|right|bottom|left|inset-x|inset-y|inset|w|h|min-w|min-h|max-w|max-h|gap-x|gap-y|gap|basis))-(\d+(?:\.\d+)?)$/.exec(tok)
    if (sm) {
      const decl = spacingDecl(sm[2], sm[3], sm[1] === '-')
      if (decl) { rules.set(tok, buildRule(tok, decl) ?? ''); continue }
    }
    // فقط کلاس‌هایی که شبیه utility معنادارند را گزارش کن (نه شناسه‌های JS)
    if (/^(hover|focus|dark|sm|md|lg|xl):.+(bg|text|border|ring)-/.test(tok) || /^-(m|p|top|left|right|bottom|inset|w|h)-/.test(tok)) unmatched.push(tok)
  }
  const cssOut = [...rules.values()].filter(Boolean).sort().join('\n')
  return { css: cssOut, count: rules.size, unmatched }
}

export function patchCss() {
  try { readFileSync(ORIG_CSS) } catch { copyFileSync(CSS_FILE, ORIG_CSS) }
  const pristine = readFileSync(ORIG_CSS, 'utf8')
  const { css, count, classes } = generate()
  const std = genMissingStandard(pristine)
  const block = `\n/* hz-ext arbitrary utilities (${count} rules) — generated by gen-arb-css.mjs; DO NOT EDIT */\n${css}\n${RTL_FIX_CSS}\n/* hz-ext standard utilities (${std.count} rules — R11: fixes silently-missing classes like bg-teal-700; DO NOT EDIT) */\n${std.css}`
  const next = pristine + block
  if (readFileSync(CSS_FILE, 'utf8') === next) { console.log(`  = CSS already up-to-date (${count} arb + ${std.count} std rules + RTL fix)`); return }
  writeFileSync(CSS_FILE, next)
  console.log(`✓ frozen CSS extended (+${count} arbitrary + ${std.count} standard utilities + RTL fix)`)
  if (std.unmatched.length && process.env.HZ_ARB_DEBUG) console.log('  ⚠ unmatched variant tokens:\n   ' + std.unmatched.join('\n   '))
  if (process.env.HZ_ARB_DEBUG) console.log(classes.join('\n'))
}

// standalone
if (process.argv[1] && process.argv[1].endsWith('gen-arb-css.mjs')) {
  patchCss()
}
