/**
 * hz-ext/patch-returns-card.mjs — show the customer's bank card number IN FULL
 * in the frozen app views (returns approvals / returns history / CRM customer
 * detail). The frozen views mask the middle digits (6037-99**-****-1234) which
 * makes the POS refund impossible to verify — managers need every digit.
 *
 * Surgical: replaces the masked grouping with the full 4-4-4-4 grouping.
 * Idempotent per chunk (skips if already patched).
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CHUNKS = join(ROOT, 'public', '_next', 'static', 'chunks')

/** chunk → local mask-function name inside that chunk */
const TARGETS = [
  { file: '03279e393cf0183f.js', fn: 'A' },
  { file: '87f86e4eb7c80d3c.js', fn: '$' },
  { file: 'eec90cfcc6ba6635.js', fn: 'B' },
]

const BROKEN = '${t.slice(0,4)}-${t.slice(4,6)}**-****-${t.slice(12)}'
const FIXED = '${t.slice(0,4)}-${t.slice(4,8)}-${t.slice(8,12)}-${t.slice(12)}'

function main() {
  let patched = 0
  for (const { file } of TARGETS) {
    const path = join(CHUNKS, file)
    let src
    try {
      src = readFileSync(path, 'utf8')
    } catch {
      console.error(`✗ ${file}: not found`)
      process.exit(1)
    }
    const n = src.split(BROKEN).length - 1
    if (n === 0) {
      if (src.includes(FIXED)) {
        console.log(`  = ${file}: card already shown in full`)
      } else {
        console.error(`✗ ${file}: mask pattern not found — chunk format changed?`)
        process.exit(1)
      }
      continue
    }
    if (n !== 1) {
      console.error(`✗ ${file}: expected 1 occurrence, found ${n}`)
      process.exit(1)
    }
    writeFileSync(path, src.replace(BROKEN, FIXED))
    console.log(`  + ${file}: card mask → full 4-4-4-4 grouping`)
    patched++
  }
  console.log(`✓ returns-card patches applied (${patched} chunk(s) changed)`)
}

main()
