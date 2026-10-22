/**
 * HZ-EXT build pipeline
 * ---------------------
 * Bundles TSX view sources (hz-ext/src/views/*.tsx) into ONE turbopack-compatible
 * chunk file (public/_next/static/chunks/hzext-views.js) that registers each view
 * as a turbopack module, re-using the live app's shared modules (React, api, toast,
 * jalali, UI components...) by module ID via e.i().
 *
 * Then patches:
 *  - loader chunk  (2fb9e5ced3d1b0e6.js): async module entries so e.A(ID) loads our chunk
 *  - registry chunk (f58febe0f4682bee.js): H map + nav + access control for our views
 *
 * Patches are applied to pristine copies kept in hz-ext/originals/ (idempotent).
 */
import { build } from 'esbuild'
import { readFileSync, writeFileSync, copyFileSync, readdirSync, mkdirSync, unlinkSync } from 'fs'
import { join, basename, dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url))
import { createHash } from 'crypto'

const ROOT = join(__dirname, '..')
const SRC = join(__dirname, 'src', 'views')
const CHUNKS_DIR = join(ROOT, 'public', '_next', 'static', 'chunks')
let OUT_CHUNK = '' // set after assembling (content-hashed name)
const ORIG = join(__dirname, 'originals')
const LOADER = join(ROOT, 'public', '_next', 'static', 'chunks', '2fb9e5ced3d1b0e6.js')
const REGISTRY = join(ROOT, 'public', '_next', 'static', 'chunks', 'f58febe0f4682bee.js')

// Module IDs of shared app modules — ALL VERIFIED against live chunks
// (export lists extracted via scripts/checks/module-catalog-vm.ts + direct e.s greps)
const HZ_MODULES = {
  'react': 271645, 'jsx': 843476, 'api': 29481, 'shell': 573254,
  'cn': 975157, 'button': 519455, 'input': 793479, 'jalali': 956657, 'toast': 846696,
  'dialog': 776639, 'card': 515288, 'select': 967489, 'badge': 487486, 'table': 784774,
  'tabs': 677572, 'progress': 168148, 'checkbox': 257428, 'textarea': 624687,
  'popover': 337822,
}
// keys each module must expose (runtime validation — surfaces as __HZ_FAIL__ diagnostics)
const HZ_EXPECT = {
  'react': ['useState', 'useEffect', 'default'], 'jsx': ['jsx', 'jsxs'], 'api': ['api', 'qs'],
  'shell': ['useShell'], 'cn': ['cn'], 'button': ['Button'], 'input': ['Input'],
  'jalali': ['todayJalali', 'toFaDigits'], 'toast': ['toast'], 'dialog': ['Dialog', 'DialogContent'],
  'card': ['Card', 'CardContent'], 'select': ['Select', 'SelectItem'], 'badge': ['Badge'],
  'table': ['Table', 'TableCell'], 'tabs': ['Tabs', 'TabsContent'], 'progress': ['Progress'],
  'checkbox': ['Checkbox'], 'textarea': ['Textarea'], 'popover': ['Popover'],
}
// Dependency chunk files to load before our chunk (verified: all their own imports
// resolve from preloaded chunks or from this set)
const DEP_CHUNKS = [
  'static/chunks/0873604efdf00cc0.js', 'static/chunks/1144e04df74000dd.js',
  'static/chunks/03279e393cf0183f.js', 'static/chunks/2281e08d5f83160b.js',
  'static/chunks/50a5b03f5c7742a2.js', 'static/chunks/0a7d81014aab1f9e.js',
  'static/chunks/74ed3b02837acc76.js',
]
// Our module ID space (turbopack IDs are arbitrary ints; 99xxx never used by the app)
const ID_SETUP = 990000
const idFor = (i) => 990001 + i      // view modules 990001..
const asyncFor = (i) => 991001 + i   // async wrapper modules 991001..

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

async function main() {
  const files = readdirSync(SRC).filter((f) => f.endsWith('.tsx')).sort()
  if (!files.length) { console.error('no view sources in', SRC); process.exit(1) }

  // 1. Bundle each view to a self-contained IIFE assigning to a global
  const viewKeys = []
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const key = basename(f, '.tsx')
    viewKeys.push(key)
    await build({
      entryPoints: [join(SRC, f)],
      bundle: true,
      format: 'cjs',
      target: 'es2020',
      jsx: 'automatic',
      jsxImportSource: 'hz',
      minify: true,
      legalComments: 'none',
      outfile: join(__dirname, '.build', `${key}.js`),
      plugins: [hzPlugin],
      logLevel: 'error',
      define: { 'process.env.NODE_ENV': '"production"' },
    })
    // wrap the IIFE result: assign its default export
    const code = readFileSync(join(__dirname, '.build', `${key}.js`), 'utf8')
    const wrapped = `(function(){var __m={exports:{}};(function(module,exports){${code}\n})(__m,__m.exports);globalThis.__HZ_VIEWS__["${key}"]=(__m.exports&&__m.exports.default)||__m.exports;})();\n`
    writeFileSync(join(__dirname, '.build', `${key}.wrapped.js`), wrapped)
  }

  // 2. Assemble the turbopack chunk
  const setupModule = `
${ID_SETUP},e=>{"use strict";
if(!globalThis.__HZ__){
  var __fail=[];
  globalThis.__HZ__={};
  var __put=function(key,id,need){try{var m=e.i(id);if(!m){__fail.push(key+':null@'+id);return}
    for(var i=0;i<need.length;i++){if(m[need[i]]===undefined){__fail.push(key+':missing '+need[i]+'@'+id);return}}
    globalThis.__HZ__[key]=m;
  }catch(x){__fail.push(key+':'+String(x&&x.message||x).slice(0,50)+'@'+id)}};
${Object.entries(HZ_MODULES).map(([k, id]) => `  __put("${k}",${id},${JSON.stringify(HZ_EXPECT[k] || [])});`).join('\n')}
  globalThis.__HZ__['jsx-runtime']=globalThis.__HZ__['jsx-dev-runtime']=globalThis.__HZ__.jsx||{};
  globalThis.__HZ__['react/jsx-runtime']=globalThis.__HZ__['jsx-runtime'];
  if(__fail.length){globalThis.__HZ_FAIL__=__fail;try{console.warn('[hz-ext] module resolution failures:',__fail)}catch(_){}}
}
globalThis.__HZ_VIEWS__=globalThis.__HZ_VIEWS__||{};
${viewKeys.map((k) => readFileSync(join(__dirname, '.build', `${k}.wrapped.js`), 'utf8')).join('\n')}
e.s(["default",()=>globalThis.__HZ_VIEWS__],${ID_SETUP})},`
  const viewModules = viewKeys.map((k, i) =>
    `${idFor(i)},e=>{"use strict";e.i(${ID_SETUP});e.s(["default",()=>globalThis.__HZ_VIEWS__["${k}"]],${idFor(i)})}`
  ).join(',')
  const inner = `["object"==typeof document?document.currentScript:void 0,${setupModule}${viewModules}]`
  const chunkJs = `(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(${inner})\n`
  const hash = createHash('md5').update(chunkJs).digest('hex').slice(0, 8)
  // content-hashed filename — busts the browser cache on every rebuild
  const chunkName = `hzext-${hash}.js`
  OUT_CHUNK = join(CHUNKS_DIR, chunkName)
  writeFileSync(OUT_CHUNK, chunkJs)
  // remove stale hzext-*.js from previous builds
  for (const f of readdirSync(CHUNKS_DIR)) {
    if (/^hzext-.*\.js$/.test(f) && f !== chunkName) { try { unlinkSync(join(CHUNKS_DIR, f)) } catch {} }
  }
  console.log(`✓ ${chunkName} written (${(chunkJs.length / 1024).toFixed(1)}KB, ${viewKeys.length} views, hash ${hash})`)
  console.log('  views:', viewKeys.join(', '))
  DEP_CHUNKS.push(`static/chunks/${chunkName}`)

  // 3. Patch loader + registry chunks (from pristine originals)
  copyIfMissing(LOADER, join(ORIG, '2fb9e5ced3d1b0e6.js'))
  copyIfMissing(REGISTRY, join(ORIG, 'f58febe0f4682bee.js'))

  // ---- loader patch: append async entries before the final "]);"
  let loader = readFileSync(join(ORIG, '2fb9e5ced3d1b0e6.js'), 'utf8')
  const depList = DEP_CHUNKS.map((c) => `"${c}"`).join(',')
  const asyncEntries = viewKeys.map((k, i) =>
    `${asyncFor(i)},e=>{e.v(t=>Promise.all([${depList}].map(t=>e.l(t))).then(()=>t(${idFor(i)})))}`
  ).join(',')
  if (!loader.trimEnd().endsWith(']);')) { console.error('✗ loader chunk format changed!'); process.exit(1) }
  loader = loader.trimEnd().slice(0, -3) + ',' + asyncEntries + ']);\n'
  if (process.env.HZ_PROBE) {
    loader += `;(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push([document.currentScript,995000,e=>{globalThis.__hzRuntime=e}]);\n` +
      `;(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push([document.currentScript,{otherChunks:[],runtimeModuleIds:[995000]}]);\n`
  }
  writeFileSync(LOADER, loader)
  console.log(`✓ loader chunk patched (+${viewKeys.length} async entries)`)

  // ---- registry patch (driven by manifest)
  const manifest = JSON.parse(readFileSync(join(__dirname, 'manifest.json'), 'utf8'))
  let reg = readFileSync(join(ORIG, 'f58febe0f4682bee.js'), 'utf8')
  for (const entry of manifest.views) {
    const idx = viewKeys.indexOf(entry.src)
    if (idx < 0) { console.error(`✗ manifest references missing view src "${entry.src}"`); process.exit(1) }
    const aid = asyncFor(idx)
    const regEntry = `"${entry.key}":(0,I.default)(()=>e.A(${aid}),{loadableGenerated:{modules:[${idFor(idx)}]},loading:F,ssr:!1})`
    const existing = new RegExp(`"${entry.key.replace(/\//g, '\\/')}"\\:\\(0,I\\.default\\)\\(\\(\\)=>e\\.A\\(\\d+\\)`, 'm')
    if (existing.test(reg)) {
      // replace existing view entry
      reg = reg.replace(new RegExp(`"${entry.key.replace(/\//g, '\\/')}"\\:\\(0,I\\.default\\)\\(\\(\\)=>e\\.A\\(\\d+\\),\\{loadableGenerated:\\{modules:\\[\\d+\\]\\},loading:F,ssr:!1\\}\\)`), regEntry)
      console.log(`  ~ replaced view "${entry.key}"`)
    } else {
      // add new view: into H map (after the "system/activity" entry — anchor WITHOUT trailing })
      const anchor = '"system/activity":(0,I.default)(()=>e.A(567583),{loadableGenerated:{modules:[545223]},loading:F,ssr:!1})'
      const anchorPos = reg.indexOf(anchor)
      if (anchorPos < 0) { console.error('✗ H map anchor not found'); process.exit(1) }
      const insertAt = anchorPos + anchor.length
      reg = reg.slice(0, insertAt) + ',' + regEntry + reg.slice(insertAt)
      console.log(`  + added view "${entry.key}"`)
      // nav entry
      const navRe = new RegExp(`(\\{key:"${entry.section}"[^\\[]*pages:\\[)`)
      const m = reg.match(navRe)
      if (m) {
        const secPos = reg.indexOf(m[0])
        const pagesPos = reg.indexOf('pages:[', secPos) + 'pages:['.length
        // SAFEST icon: reuse an existing icon component reference from the SAME section
        // scope. The registry's scopes differ per module; module 475254 exports ONLY
        // {default} (the createLucideIcon factory), so invented refs like t.CircleDot
        // resolve to undefined and crash the whole nav render (React error #130).
        const after = reg.slice(pagesPos, pagesPos + 800)
        const iconM = after.match(/icon:([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/)
        const iconExpr = iconM ? `${iconM[1]}.${iconM[2]}` : null
        const pageEntry = `{key:"${entry.key}",title:"${entry.title}"${iconExpr ? `,icon:${iconExpr}` : ''}}`
        reg = reg.slice(0, pagesPos) + pageEntry + ',' + reg.slice(pagesPos)
        console.log(`  + nav "${entry.title}" → section ${entry.section}${iconExpr ? ` (icon ${iconExpr})` : ' (no icon)'}`)
      }
      // access map
      const accessAnchor = '"system/activity":["OWNER"'
      const accessPos = reg.indexOf(accessAnchor)
      if (accessPos > 0) {
        reg = reg.slice(0, accessPos) + `"${entry.key}":${JSON.stringify(entry.roles)},` + reg.slice(accessPos)
        console.log(`  + access "${entry.key}" → ${entry.roles.join(',')}`)
      }
    }
  }
  writeFileSync(REGISTRY, reg)
  console.log(`✓ registry chunk patched (${manifest.views.length} entries)`)

  // 4. Post-build: re-apply surgical fixes to frozen app chunks (idempotent)
  await import('./patch-checklists.mjs')
  await import('./patch-tour-acl.mjs')
}

function copyIfMissing(from, to) {
  try { readFileSync(to) } catch { copyFileSync(from, to) }
}

main().catch((e) => { console.error(e); process.exit(1) })
