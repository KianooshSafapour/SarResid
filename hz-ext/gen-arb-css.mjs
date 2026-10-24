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

export function patchCss() {
  try { readFileSync(ORIG_CSS) } catch { copyFileSync(CSS_FILE, ORIG_CSS) }
  const pristine = readFileSync(ORIG_CSS, 'utf8')
  const { css, count, classes } = generate()
  if (!count) { console.log('  = no arbitrary utilities needed'); return }
  const block = `\n/* hz-ext arbitrary utilities (${count} rules) — generated by gen-arb-css.mjs; DO NOT EDIT */\n${css}\n`
  const next = pristine + block
  if (readFileSync(CSS_FILE, 'utf8') === next) { console.log(`  = CSS already up-to-date (${count} rules)`); return }
  writeFileSync(CSS_FILE, next)
  console.log(`✓ frozen CSS extended (+${count} arbitrary utilities)`)
  if (process.env.HZ_ARB_DEBUG) console.log(classes.join('\n'))
}

// standalone
if (process.argv[1] && process.argv[1].endsWith('gen-arb-css.mjs')) {
  patchCss()
}
