import { build } from 'esbuild'
import { writeFileSync, readFileSync, readdirSync } from 'fs'
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
// runtime
await build({ entryPoints: ['/home/z/my-project/public/__dashqa/runtime.mjs'], bundle: true, format: 'iife', target: 'es2020', outfile: '/home/z/my-project/public/__dashqa/runtime.js', logLevel: 'error' })
// view
await build({
  entryPoints: ['/home/z/my-project/hz-ext/src/views/dashboard.tsx'],
  bundle: true, format: 'cjs', target: 'es2020',
  jsx: 'automatic', jsxImportSource: 'hz',
  minify: false, legalComments: 'none', logLevel: 'error',
  outfile: '/home/z/my-project/public/__dashqa/.build-dashboard.js',
  plugins: [hzPlugin],
  define: { 'process.env.NODE_ENV': '"production"' },
})
const code = readFileSync('/home/z/my-project/public/__dashqa/.build-dashboard.js', 'utf8')
writeFileSync('/home/z/my-project/public/__dashqa/view-dashboard.js',
  `(function(){var __m={exports:{}};(function(module,exports){${code}\n})(__m,__m.exports);(globalThis.__HZ_VIEW__=(__m.exports&&__m.exports.default)||__m.exports);})();\n`)
console.log('built runtime.js + view-dashboard.js')
