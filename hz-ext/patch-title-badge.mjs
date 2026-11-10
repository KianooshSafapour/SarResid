/**
 * hz-ext/patch-title-badge.mjs — connect the document.title badge to the bell.
 *
 * OWNER R10 REQUEST: «the badge in the site's title must be connected to
 * something and gets updated when you check the notifications».
 *
 * BEFORE: document.title counted messages_unread + returns_pending +
 * orders_waiting + cheques_due + tasks_open (sidebar badges) but IGNORED the
 * notification bell entirely — reading notifications («خواندن همه» or single
 * click) never moved the title until the 30s poll happened to run.
 *
 * AFTER (3 surgical anchors on the frozen registry chunk):
 *   A) title sum += notifications_unread  (new field from /api/app/badges —
 *      same visibility scope as the bell: me / my role / global)
 *   B) badges poll effect also listens for window event "hz:badges-refresh"
 *      → immediate refetch of /api/app/badges → title recomputes at once
 *   C) «خواندن همه» dispatches that event after POST read-all succeeds
 *   (D lives in patch-notifications.mjs: single-item click dispatches it too)
 *
 * Runs AFTER build.mjs on the LIVE chunk only (never touches ORIG).
 * Idempotent via the __HZ_TITLE_BADGE__ marker comment.
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
if (src.includes('__HZ_TITLE_BADGE__')) {
  console.log('patch-title-badge: already applied')
} else {
  // A) title sum: include the notification bell count
  src = apply(src, 'title sum += notifications_unread',
    '(O.messages_unread||0)+(O.returns_pending||0)+(O.orders_waiting||0)+(O.cheques_due||0)+(O.tasks_open||0);document.title=e>0?',
    '(O.messages_unread||0)+(O.returns_pending||0)+(O.orders_waiting||0)+(O.cheques_due||0)+(O.tasks_open||0)+(O.notifications_unread||0);document.title=e>0?')

  // B) badges poll effect: also refresh on demand via window event
  src = apply(src, 'badges refresh on hz:badges-refresh event',
    '(0,r.useEffect)(()=>{J();let e=setInterval(J,3e4);return()=>clearInterval(e)},[J])',
    '(0,r.useEffect)(()=>{J();let e=setInterval(J,3e4),t=()=>J();return window.addEventListener("hz:badges-refresh",t),()=>{clearInterval(e),window.removeEventListener("hz:badges-refresh",t)}},[J])')

  // C) read-all: dispatch immediate badges refresh after marking read
  src = apply(src, 'read-all → dispatch hz:badges-refresh',
    '{method:"POST",body:{action:"read-all"}}),o([])}',
    '{method:"POST",body:{action:"read-all"}}),o([]),window.dispatchEvent(new CustomEvent("hz:badges-refresh"))}')

  src += '\n/*__HZ_TITLE_BADGE__*/'
  writeFileSync(CHUNK, src)
  console.log('patch-title-badge: written')
}
