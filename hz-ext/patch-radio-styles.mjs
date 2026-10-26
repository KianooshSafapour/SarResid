/**
 * hz-ext/patch-radio-styles.mjs — soften the payment-kind radio cards on the
 * frozen «پرداخت‌های نقدی و کارتی» page (finance/payments).
 *
 * OWNER R10: «رادیوهای بصری در چند جای سامانه زشت‌اند» — the payments radio
 * cards used a HEAVY solid-primary block for the selected state (same visual
 * weight as a primary action button). New style matches the platform-wide
 * R10 radio-pill language: soft tinted card + primary ring + primary text —
 * clearly selected without shouting.
 *
 * Runs AFTER build.mjs on the LIVE chunk only (never touches ORIG).
 * Idempotent via the __HZ_RADIO_PAY__ marker comment.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CHUNK = join(ROOT, 'public', '_next', 'static', 'chunks', '7c3e1b1c248102ff.js')

let src = readFileSync(CHUNK, 'utf8')
if (src.includes('__HZ_RADIO_PAY__')) {
  console.log('patch-radio-styles: already applied')
} else {
  const broken = 'border-primary bg-primary text-primary-foreground":"bg-card hover:bg-accent"}`'
  const fixed = 'border-primary/60 bg-primary/10 text-primary ring-1 ring-primary/30":"bg-card hover:bg-accent"}`'
  const n = src.split(broken).length - 1
  if (n === 0) {
    if (src.includes(fixed)) { console.log('  = payments radio already patched (marker missing)') }
    else { console.error('✗ payments radio: pattern not found — chunk format changed?'); process.exit(1) }
  } else if (n !== 1) {
    console.error(`✗ payments radio: expected 1 occurrence, found ${n}`); process.exit(1)
  } else {
    src = src.replace(broken, fixed)
    console.log('  + payments radio cards → soft selected state')
  }
  src += '\n/*__HZ_RADIO_PAY__*/'
  writeFileSync(CHUNK, src)
  console.log('patch-radio-styles: written')
}
