import { build } from 'esbuild'
import { writeFileSync, copyFileSync, mkdirSync } from 'fs'
const view = process.argv[2] || 'users'
mkdirSync('/tmp/f4h', { recursive: true })
try { copyFileSync('/home/z/my-project/public/_next/static/chunks/b8c5081c57c11dd3.css', '/tmp/f4h/app.css') } catch {}
const stubPlugin = {
  name: 'stub',
  setup(b) {
    b.onResolve({ filter: /lib\/hz$/ }, () => ({ path: '/home/z/my-project/.f4h/stub.tsx' }))
  },
}
await build({
  entryPoints: ['/home/z/my-project/.f4h/driver.tsx'],
  bundle: true, format: 'iife', target: 'es2020',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  outfile: `/tmp/f4h/bundle-${view}.js`,
  plugins: [stubPlugin],
  logLevel: 'error',
})
writeFileSync(`/tmp/f4h/index-${view}.html`, `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="app.css"><style>
  body { margin: 0; background: #fafaf9; font-family: Vazirmatn, system-ui, sans-serif; }
  #toasts { position: fixed; bottom: 8px; right: 8px; z-index: 999; }
  #toasts .t { background: #fff; border: 1px solid #d6d3d1; border-radius: 8px; padding: 6px 10px; margin-top: 4px; font-size: 12px; max-width: 420px; }
  #toasts .t.error { border-color: #e11d48; color: #be123c; }
  #toasts .t.success { border-color: #059669; color: #047857; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e7e5e4; padding: 6px; text-align: right; font-size: 12px; }
  [data-table] { width: 100%; }
</style></head><body><div id="root"></div><div id="toasts"></div><script src="bundle-${view}.js"></script></body></html>`)
console.log('built', view)
