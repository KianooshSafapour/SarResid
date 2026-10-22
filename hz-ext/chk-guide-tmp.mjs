import { build } from 'esbuild'
await build({
  entryPoints: ['hz-ext/src/views/guide.tsx'],
  bundle: true, format: 'cjs', target: 'es2020',
  jsx: 'automatic', jsxImportSource: 'hz',
  minify: true, legalComments: 'none', logLevel: 'error',
  outfile: '/tmp/guide-bundle.js',
  plugins: [{
    name: 'hz',
    setup(b) {
      b.onResolve({ filter: /^hz[:/]/ }, (args) => ({ path: args.path, namespace: 'hz' }))
      b.onLoad({ filter: /.*/, namespace: 'hz' }, (args) => {
        const key = args.path.replace(/^hz[:\/]/, '').replace(/\//g, '-')
        return { contents: `module.exports = (globalThis.__HZ__ && globalThis.__HZ__["${key}"]) || {};`, loader: 'js' }
      })
    },
  }],
  define: { 'process.env.NODE_ENV': '"production"' },
})
console.log('BUILD OK')
