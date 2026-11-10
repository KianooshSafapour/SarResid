/* Build the tour-engine isolation harness (real lib/ui + real React). */
import { build } from 'esbuild'
import { writeFileSync, copyFileSync, mkdirSync } from 'fs'

mkdirSync('/tmp/f4h', { recursive: true })

const stub = () => ({
  name: 'stub',
  setup(b) {
    b.onResolve({ filter: /^hz:/ }, (args) => ({ path: args.path, namespace: 'stub' }))
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
      const key = args.path.replace(/^hz:/, '')
      const mod = {
        'react': `import * as R from 'react'; module.exports = R`,
        'jsx': `const jr = require('react/jsx-runtime'); module.exports = { jsx: jr.jsx, jsxs: jr.jsxDEV || jr.jsxs, Fragment: jr.Fragment }`,
        'shell': `module.exports = { useShell: () => ({ user: { role: 'ADMIN', fullName: 'تستی' }, go: (r) => { (globalThis.__goLog = globalThis.__goLog || []).push(r) } }) }`,
        'cn': `module.exports = { cn: (...a) => a.filter(Boolean).join(' ') }`,
        'button': `const R = require('react'); module.exports = { Button: (p) => R.createElement('button', p) }`,
        'input': `const R = require('react'); module.exports = { Input: (p) => R.createElement('input', p) }`,
        'jalali': `module.exports = { toFaDigits: (s) => String(s).replace(/\\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]), toEnDigits: (s) => String(s).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))), todayJalali: () => '1405-07-28', JALALI_MONTHS: ['فروردین'], WEEKDAY_FA: ['شنبه'], jalaliMonthLength: () => 30, parseJalali: () => ({ jy: 1405, jm: 7, jd: 28 }), formatJalaliLong: () => '۲۸ مهر ۱۴۰۵' }`,
      }
      if (!mod[key]) throw new Error('no stub for ' + key)
      return { contents: mod[key], loader: 'js', resolveDir: '/home/z/my-project' }
    })
  },
})

await build({
  entryPoints: ['/home/z/my-project/.f4h/tour-driver.tsx'],
  bundle: true, format: 'iife', target: 'es2020',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  outfile: '/tmp/f4h/bundle-tour.js',
  plugins: [stub()],
  logLevel: 'error',
})
copyFileSync('/home/z/my-project/public/_next/static/chunks/b8c5081c57c11dd3.css', '/tmp/f4h/app.css')
writeFileSync('/tmp/f4h/index-tour.html', `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="app.css"><style>
  body { margin: 0; background: #fafaf9; }
  button { font-family: inherit; }
</style></head><body><div id="root"></div><script src="bundle-tour.js"></script></body></html>`)
console.log('built tour harness')
