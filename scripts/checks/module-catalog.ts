// Extract ALL module definitions from live chunks → catalog JSON (id → {file, exports[]})
import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
const DIR = 'public/_next/static/chunks'
const files = readdirSync(DIR).filter(f => f.endsWith('.js') && !f.startsWith('hzext'))
const catalog: Record<string, { file: string; exports: string[]; head: string }> = {}
for (const f of files) {
  const txt = readFileSync(join(DIR, f), 'utf8')
  // def start: [,{(;:] ID [, ASYNCID]? , e=> | (e.. | function
  const re = /(?:^|[,\[{(;])(\d{3,7})(?::|,)\s*(?:(\d{3,7}),)?\s*(?=(?:e\s*=>|\(e\)|\(e,|\(e,|function))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(txt))) {
    const id = m[1]
    if (catalog[id]) continue
    const defStart = txt.indexOf(m[1], m.index)
    const seg = txt.slice(defStart, defStart + 60000)
    let exports: string[] = []
    const es = seg.indexOf('e.s([')
    if (es >= 0) {
      // walk bracket depth from the '[' after e.s(
      let depth = 0, i = es + 4
      for (; i < seg.length; i++) {
        if (seg[i] === '[') depth++
        else if (seg[i] === ']') { depth--; if (depth === 0) break }
      }
      const list = seg.slice(es + 4, i)
      exports = [...list.matchAll(/"([^"]+)"\s*,\s*(?:\(\)|\(\))?\s*=>/g)].map(x => x[1])
    }
    catalog[id] = { file: f, exports, head: seg.slice(0, 90).replace(/\n/g, ' ') }
  }
}
console.log('modules:', Object.keys(catalog).length)
const withExports = Object.values(catalog).filter(v => v.exports.length).length
console.log('with exports:', withExports)
writeFileSync('scripts/checks/module-catalog.json', JSON.stringify(catalog, null, 1))
const want = process.argv[2]
if (want) for (const [id, v] of Object.entries(catalog)) if (v.exports.includes(want)) console.log(id, v.file, '→', want, '| exports:', v.exports.slice(0, 14).join(','))
