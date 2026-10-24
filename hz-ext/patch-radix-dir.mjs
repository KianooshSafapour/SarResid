/**
 * hz-ext/patch-radix-dir.mjs — ROOT-CAUSE RTL fix for the whole frozen app.
 *
 * Radix UI primitives (Tabs, Select, DropdownMenu, Popover, …) call
 * `useDirection(localDir)` which falls back to "ltr" when no `direction` prop
 * is passed and no DirectionProvider is mounted. The frozen app never passes
 * it → every Tabs container renders dir="ltr", cascading LTR flex layout to
 * ALL tab content (month-navigators laid out backwards, rows flipped, Select
 * dropdowns/trigger aligned LTR) — exactly the "inverted arrows" the owner
 * reported on /store/stockcount and the returns form dropdown.
 *
 * Surgical patch: the fallback becomes document-aware — when the document is
 * RTL (our whole app is fa/rtl) the primitives default to "rtl". Components
 * that explicitly pass a direction keep theirs. Idempotent.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ORIG = join(__dirname, 'originals', '2fb9e5ced3d1b0e6.js')

const BROKEN = 'function h(e){let s=t.useContext(f);return e||s||"ltr"}'
const FIXED =
  'function h(e){let s=t.useContext(f);return e||s||(typeof document<"u"&&document.documentElement&&document.documentElement.dir==="rtl"?"rtl":"ltr")}'

function main() {
  let src
  try {
    src = readFileSync(ORIG, 'utf8')
  } catch {
    console.error('✗ radix-dir: original loader chunk not found')
    process.exit(1)
  }
  if (src.includes(FIXED)) {
    console.log('  = radix-dir: loader already RTL-aware')
    return
  }
  const n = src.split(BROKEN).length - 1
  if (n !== 1) {
    console.error(`✗ radix-dir: expected 1 useDirection definition, found ${n} — loader format changed?`)
    process.exit(1)
  }
  writeFileSync(ORIG, src.replace(BROKEN, FIXED))
  console.log('  + radix-dir: useDirection now follows document dir (RTL default for fa app)')
}

main()
