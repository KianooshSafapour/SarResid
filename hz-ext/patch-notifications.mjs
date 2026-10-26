/**
 * hz-ext/patch-notifications.mjs — make the bell dropdown FUNCTIONAL.
 *
 * BUG (owner R5): clicking a notification navigated but never marked it read,
 * so the item never disappeared and the badge never dropped. Only «خواندن همه»
 * worked. Fix: on item click → fire-and-forget POST /api/app/notifications
 * {ids:[id]} + remove the item from the local list state (o) so the badge and
 * list update instantly, then navigate + close as before.
 *
 * Runs AFTER build.mjs on the LIVE chunk only (never touches ORIG).
 * Idempotent via the __HZ_NOTIF_FIXED__ marker comment.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CHUNK = join(ROOT, 'public', '_next', 'static', 'chunks', 'f58febe0f4682bee.js')

function apply(src, name, broken, fixed, expect = 1) {
  const n = src.split(broken).length - 1
  if (n === 0) {
    if (src.includes(fixed)) { console.log(`  = ${name} already patched`); return src }
    console.error(`✗ ${name}: pattern not found — chunk format changed?`); process.exit(1)
  }
  if (n !== expect) { console.error(`✗ ${name}: expected ${expect} occurrence(s), found ${n}`); process.exit(1) }
  console.log(`  + ${name}`)
  return src.replace(broken, fixed)
}

let src = readFileSync(CHUNK, 'utf8')
if (src.includes('__HZ_NOTIF_FIXED__')) {
  console.log('patch-notifications: already applied')
} else {
  // 1) notification item click: mark read + remove from list, then navigate
  //    (R10 title-badge: also dispatch hz:badges-refresh so document.title
  //     recomputes immediately — see patch-title-badge.mjs)
  src = apply(src, 'notif item click → mark read + remove',
    'onClick:()=>{r.go&&e(r.go.replace(/^#\\/?/,"")),a(!1)}',
    'onClick:()=>{/*__HZ_NOTIF_FIXED__*/try{(0,n.api)("/api/app/notifications",{method:"POST",body:{ids:[r.id]}}).catch(function(){}),o(s.filter(function(x){return x.id!==r.id}))}catch(v){}window.dispatchEvent(new CustomEvent("hz:badges-refresh")),r.go&&e(r.go.replace(/^#\\/?/,"")),a(!1)}')
  src += '\n/*__HZ_NOTIF_FIXED__*/'
  writeFileSync(CHUNK, src)
  console.log('patch-notifications: written')
}
