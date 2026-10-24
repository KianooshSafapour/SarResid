/**
 * hz-ext/patch-login-roster.mjs — bigger, readable login cards (owner R5).
 *
 * BUG: login cards were minmax(150px) wide with `text-sm truncate` names —
 * «خانم فاطمه تقی‌زاده» rendered as «خانم فاطمه …» and staff with the same
 * first name couldn't tell their card apart. Fix: wider grid (230px min),
 * larger avatars (52px), bolder non-truncated wrapping names, roomier cards.
 *
 * Runs AFTER build.mjs on the LIVE chunk only. Idempotent marker.
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
if (src.includes('__HZ_LOGIN_CARDS__')) {
  console.log('patch-login-roster: already applied')
} else {
  src = apply(src, 'roster grid wider (150→230px min)', 'minmax(150px', 'minmax(230px')
  src = apply(src, 'roster card roomier (p-3→p-4 rounded-2xl shadow)',
    'touch-target card-lift flex items-center gap-3 rounded-xl border bg-card p-3 text-start hover:border-primary/50 active:scale-[0.98]',
    'touch-target card-lift flex items-center gap-3.5 rounded-2xl border bg-card p-4 text-start hover:border-primary/50 hover:shadow-md active:scale-[0.98]')
  src = apply(src, 'avatar bigger (44→52)', 'avatarJson:e.avatarJson,size:44', 'avatarJson:e.avatarJson,size:52')
  src = apply(src, 'name full bold no-truncate',
    'className:"font-semibold text-sm truncate"',
    'className:"font-bold text-[15px] leading-snug break-words"')
  src = apply(src, 'title subtitle spacing',
    'className:"text-xs text-muted-foreground truncate"',
    'className:"text-xs text-muted-foreground mt-0.5 leading-snug"')
  src = apply(src, 'selected-user banner name no-truncate',
    'className:"font-bold truncate"',
    'className:"font-bold leading-snug break-words"')
  src += '\n/*__HZ_LOGIN_CARDS__*/'
  writeFileSync(CHUNK, src)
  console.log('patch-login-roster: written')
}
