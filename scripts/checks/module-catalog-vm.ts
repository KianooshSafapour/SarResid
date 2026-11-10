process.on("unhandledRejection", () => {}); process.on("uncaughtException", () => {});
// Execute live chunks in a VM with stubbed turbopack runtime → exact module export catalog
import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import vm from 'node:vm'

const DIR = 'public/_next/static/chunks'
const files = readdirSync(DIR).filter(f => f.endsWith('.js') && !f.startsWith('hzext')).sort()
const bySId: Record<string, string[]> = {}   // exports recorded via e.s(list, trueModuleId)
const byCjs: Record<string, string[]> = {}   // exports via module/t.exports keys

const sandbox: Record<string, unknown> = {
  console: { log(){}, warn(){}, error(){} },
  document: { currentScript: null, querySelector: () => null, addEventListener(){}, createElement: () => ({ style:{}, setAttribute(){}, appendChild(){} }) },
  window: { addEventListener(){}, location:{href:''} },
  navigator: { userAgent: 'node' },
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, queueMicrotask,
  fetch: () => new Promise(() => {}),
  AbortController,
  TextDecoder, TextEncoder,
  performance: { now: () => 0 },
  URL, URLSearchParams, WeakMap, Map, Set, Promise, Symbol, Proxy, Reflect, Buffer,
}
sandbox.self = sandbox; sandbox.globalThis = sandbox
const ctx = vm.createContext(sandbox)
const pushes: unknown[][] = []
;(sandbox as any).TURBOPACK = { push: (entry: unknown[]) => { pushes.push(entry) } } as any

for (const f of files) {
  const code = readFileSync(join(DIR, f), 'utf8')
  try { vm.runInContext(code, ctx, { filename: f }) }
  catch (e) { console.error('LOAD FAIL', f, (e as Error).message?.slice(0, 60)) }
}

const dummy: any = new Proxy(function(){}, { get: (_t, k) => { if (k === '__esModule') return false; return () => ({}) }, apply: () => ({}) })
for (const entry of pushes) {
  if (!Array.isArray(entry)) continue
  for (let i = 1; i < entry.length - 1; i += 2) {
    const id = entry[i], factory = entry[i + 1]
    if (typeof id !== 'number') continue
    if (typeof factory !== 'function') continue
    if (byCjs[String(id)] || bySId[String(id)]) continue
    const tExports: Record<string, unknown> = {}
    const runtime: any = {
      i: () => dummy, r: () => dummy, v: () => dummy, n: () => dummy,
      d: () => dummy, g: () => dummy, u: () => dummy,
      s: (list: unknown[], mid?: number) => {
        const names: string[] = []
        if (Array.isArray(list)) for (let k = 0; k + 1 < list.length; k += 2) if (typeof list[k] === 'string') names.push(list[k] as string)
        if (names.length) bySId[String(mid ?? id)] = names
      },
      O: () => {}, A: () => Promise.resolve(), L: () => Promise.resolve(),
      get Scope() { return class {} },
    }
    try { (factory as (e: unknown, t: unknown, r: unknown) => void)(runtime, { exports: tExports }, {}) } catch { /* top-level may partially fail */ }
    const cjsKeys = Object.keys(tExports)
    if (cjsKeys.length && !bySId[String(id)]) byCjs[String(id)] = cjsKeys
  }
}
const all: Record<string, string[]> = { ...byCjs }
for (const [k, v] of Object.entries(bySId)) all[k] = v  // e.s wins (true module id)
console.log('modules:', Object.keys(all).length)
writeFileSync('scripts/checks/module-catalog.json', JSON.stringify(all, null, 1))
const want = process.argv[2]
if (want) for (const [id, ex] of Object.entries(all)) if (ex.includes(want)) console.log(id, '→', want, '|', ex.slice(0, 14).join(','))
