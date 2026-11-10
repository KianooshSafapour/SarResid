/**
 * hz-ext/patch-checklists.mjs — surgical fix for the frozen checklists view.
 *
 * BUG (user-reported "checkmarks don't work"):
 *   The live app's «چکلیست‌های امروز» view (chunk 50a5b03f5c7742a2.js) toggles
 *   a checklist item inside a <label onClick> that wraps a Radix <Checkbox>.
 *   One physical click fires the handler TWICE:
 *     (a) the user's click on the label, and
 *     (b) the browser's label-activation behavior dispatches a synthetic click
 *         on the first labelable descendant (the Radix bubble <input>), which
 *         bubbles back up to the label.
 *   Additionally Radix's bubble-input useEffect dispatches ANOTHER click when
 *   the `checked` prop changes (bubbles:true).
 *   Net effect: done toggles false→true→false in the same tick → UI never
 *   changes and the debounced save overwrites the state with all-false.
 *
 * FIX (kept minimal, semantics preserved):
 *   1. event.preventDefault() on the label click — kills (b).
 *   2. a per-(checklist,item) 150ms time guard — kills the Radix re-dispatch (c)
 *      even if it lands asynchronously after the re-render.
 *
 * Idempotent: always re-applied from the pristine original kept in
 * hz-ext/originals/. Run automatically by build.mjs after every build.
 */
import { readFileSync, writeFileSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CHUNK = join(ROOT, 'public', '_next', 'static', 'chunks', '50a5b03f5c7742a2.js')
const ORIG = join(__dirname, 'originals', '50a5b03f5c7742a2.js')

const BROKEN =
  'onClick:()=>{let t;return t=e.state.map((e,t)=>t===s?{...e,done:!e.done}:e),void(E(a=>a.map(a=>a.id===e.id?{...a,state:t}:a)),H(e.id,t))}'

const FIXED =
  'onClick:(pv)=>{try{pv&&pv.preventDefault()}catch(_){}var zk=e.id+":"+s,zn=Date.now();' +
  'if(globalThis.__hzTk&&globalThis.__hzTk.k===zk&&zn-globalThis.__hzTk.t<150)return;' +
  'globalThis.__hzTk={k:zk,t:zn};' +
  'let t;return t=e.state.map((e,t)=>t===s?{...e,done:!e.done}:e),void(E(a=>a.map(a=>a.id===e.id?{...a,state:t}:a)),H(e.id,t))}'

function main() {
  let src = readFileSync(CHUNK, 'utf8')
  if (src.includes('__hzTk')) {
    console.log('✓ checklists chunk already patched')
    return
  }
  copyFileSync(CHUNK, ORIG) // snapshot the pristine chunk before patching
  src = readFileSync(ORIG, 'utf8')
  const n = src.split(BROKEN).length - 1
  if (n !== 1) {
    console.error(`✗ expected exactly 1 toggle handler in checklists chunk, found ${n} — aborting (format changed?)`)
    process.exit(1)
  }
  src = src.replace(BROKEN, FIXED)
  writeFileSync(CHUNK, src)
  console.log('✓ checklists chunk patched (double-fire toggle fix)')
}

main()
