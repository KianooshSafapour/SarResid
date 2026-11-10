/**
 * hz-ext/patch-registry-fixes.mjs — surgical fix inside the frozen registry
 * chunk (applied to the PRISTINE original so every build re-bakes it):
 *
 *  hr workspace defaultPage "personnel" → "hrdocs": hr/personnel was removed
 *  from the nav (superseded by our پرونده پرسنل view) but remained the DEFAULT
 *  page, so the کارکنان rail button opened a nav-less frozen page with a
 *  broken flex-col toolbar.
 *
 *  (The «لباز»→«لباس» nav typo lives in manifest.json — the tasks/attendance
 *  nav entry is generated from the manifest every build — so nothing to do
 *  here; we only verify the original is clean.)
 *
 * Idempotent.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ORIG = join(__dirname, 'originals', 'f58febe0f4682bee.js')

const TYPO = 'لباز'
const HR_DEF = 'defaultPage:"personnel",pages:[{key:"hr/personnel"'
const HR_FIX = 'defaultPage:"hrdocs",pages:[{key:"hr/personnel"'

function main() {
  let src
  try {
    src = readFileSync(ORIG, 'utf8')
  } catch {
    console.error('✗ registry-fixes: original registry chunk not found')
    process.exit(1)
  }
  let changed = 0

  if (src.includes(TYPO)) {
    // نباید رخ دهد — عنوان ناوبری از manifest می‌آید؛ فقط محض اطمینان
    src = src.split(TYPO).join('لباس')
    console.log('  + registry-fixes: لباز → لباس (unexpected find in original!)')
    changed++
  } else {
    console.log('  = registry-fixes: original clean of لباز (nav title comes from manifest)')
  }

  if (src.includes(HR_DEF)) {
    src = src.replace(HR_DEF, HR_FIX)
    console.log('  + registry-fixes: hr defaultPage personnel → hrdocs')
    changed++
  } else if (src.includes(HR_FIX)) {
    console.log('  = registry-fixes: hr defaultPage already hrdocs')
  } else {
    console.error('✗ registry-fixes: hr workspace anchor not found — registry format changed?')
    process.exit(1)
  }

  if (changed > 0) writeFileSync(ORIG, src)
  console.log(`✓ registry-fixes applied (${changed} change(s))`)
}

main()
