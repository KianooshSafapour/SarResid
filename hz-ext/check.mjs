/**
 * hz-ext/check.mjs — compile-check a single view (or all views) with the hz plugin.
 * Usage: bunx tsx hz-ext/check.mjs [viewName]   (no name = check all)
 * Exit 0 = all OK. Does NOT write chunks or patch anything.
 */
import { build } from 'esbuild'
import { readFileSync, readdirSync } from 'fs'
import { join, basename, dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url))

const SRC = join(__dirname, 'src', 'views')
const hzPlugin = {
  name: 'hz',
  setup(b) {
    b.onResolve({ filter: /^hz[:/]/ }, (args) => ({ path: args.path, namespace: 'hz' }))
    b.onLoad({ filter: /.*/, namespace: 'hz' }, (args) => {
      const key = args.path.replace(/^hz[:\/]/, '').replace(/\//g, '-')
      return { contents: `module.exports = (globalThis.__HZ__ && globalThis.__HZ__["${key}"]) || {};`, loader: 'js' }
    })
  },
}

const files = readdirSync(SRC).filter((f) => f.endsWith('.tsx') && !f.startsWith('__'))
const target = process.argv[2]
const list = target ? files.filter((f) => basename(f, '.tsx') === target) : files
if (target && !list.length) { console.error(`✗ view "${target}" not found in ${SRC}`); process.exit(1) }
if (!list.length) { console.error('✗ no view sources found'); process.exit(1) }

let fail = 0
for (const f of list) {
  const name = basename(f, '.tsx')
  try {
    await build({
      entryPoints: [join(SRC, f)],
      bundle: true, format: 'cjs', target: 'es2020',
      jsx: 'automatic', jsxImportSource: 'hz',
      minify: true, legalComments: 'none', logLevel: 'error',
      outfile: '/dev/null',
      plugins: [hzPlugin],
      define: { 'process.env.NODE_ENV': '"production"' },
    })
    console.log(`✓ ${name}`)
  } catch (e) {
    fail++
    console.error(`✗ ${name}:`)
    console.error(String(e.message || e).split('\n').slice(0, 12).join('\n'))
  }
}
console.log(fail === 0 ? `ALL ${list.length} VIEWS OK` : `${fail}/${list.length} FAILED`)
process.exit(fail === 0 ? 0 : 1)
