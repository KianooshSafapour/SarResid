/* Build a standalone IIFE of the REAL mountTour (fixed engine) for injection into the live app. */
import { build } from 'esbuild'

const stub = () => ({
  name: 'stub',
  setup(b) {
    b.onResolve({ filter: /^hz:/ }, (args) => ({ path: args.path, namespace: 'stub' }))
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
      const key = args.path.replace(/^hz:/, '')
      const mod = {
        'react': `import * as R from 'react'; module.exports = R`,
        'jsx': `const jr = require('react/jsx-runtime'); module.exports = { jsx: jr.jsx, jsxs: jr.jsxDEV || jr.jsxs, Fragment: jr.Fragment }`,
        'shell': `module.exports = { useShell: () => ({ user: null, go: (r) => { location.hash = '#/' + r } }) }`,
        'cn': `module.exports = { cn: (...a) => a.filter(Boolean).join(' ') }`,
        'button': `const R = require('react'); module.exports = { Button: (p) => R.createElement('button', p) }`,
        'input': `const R = require('react'); module.exports = { Input: (p) => R.createElement('input', p) }`,
        'jalali': `module.exports = { toFaDigits: (s) => String(s).replace(/\\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]), toEnDigits: (s) => String(s).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))), todayJalali: () => '1405-07-30', JALALI_MONTHS: ['فروردین'], WEEKDAY_FA: ['شنبه'], jalaliMonthLength: () => 30, parseJalali: () => ({ jy: 1405, jm: 7, jd: 28 }), formatJalaliLong: () => '۳۰ مهر ۱۴۰۵' }`,
      }
      if (!mod[key]) throw new Error('no stub for ' + key)
      return { contents: mod[key], loader: 'js', resolveDir: '/home/z/my-project' }
    })
  },
})

await build({
  entryPoints: ['/home/z/my-project/.f4h/standalone-entry.ts'],
  bundle: true, format: 'iife', target: 'es2020',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  outfile: '/tmp/f4h/mount-tour-standalone.js',
  plugins: [stub()],
  logLevel: 'error',
})
console.log('built standalone mountTour')
