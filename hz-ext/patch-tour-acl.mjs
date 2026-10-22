/**
 * hz-ext/patch-tour-acl.mjs — surgical fixes for the frozen GuidedTour + access control.
 *
 * FIX 1 (tour dim): the tour highlight uses
 *     boxShadow:"0 0 0 2px hsl(var(--primary)/.9), 0 0 0 9999px rgba(15,23,42,.62)"
 *   but the app defines --primary as a COMPLETE color (#227849), not raw HSL channels —
 *   so `hsl(var(--primary)/.9)` is invalid CSS → the ENTIRE box-shadow declaration is
 *   dropped → after the first (welcome) step there is NO dim and NO ring.
 *   Fix: hsl(var(--primary)/.9) → var(--primary)
 *
 * FIX 2 (tour arrows): قبلی used ChevronLeft and بعدی used ChevronRight — flipped for
 *   RTL. The app-wide convention (and the tour's own keyboard handler) is
 *   previous=ChevronRight, next=ChevronLeft. Swap them.
 *
 * FIX 3 (per-user page access): canAccessPage/canAccessWorkspace consult
 *   globalThis.__HZ_PAGES__ = {deny:[pageKey|"section:x"], allow:[...]} which the
 *   AppShell sets from /api/auth/me (user.pageDeny/pageAllow — per-user overrides
 *   managed in system/users). OWNER/ADMIN can never be denied (anti-lockout).
 *
 * NOTE: build.mjs owns the ORIG snapshot for this chunk (view patches). This patcher
 * runs AFTER build.mjs and operates on the LIVE chunk only — never touches ORIG.
 * Idempotent via the __HZ_PAGES__ marker.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CHUNK = join(ROOT, 'public', '_next', 'static', 'chunks', 'f58febe0f4682bee.js')

function apply(src, name, broken, fixed, expect = 1) {
  const n = src.split(broken).length - 1
  if (n === 0) {
    if (src.includes(fixed)) { console.log(`  = ${name} already patched`); return src }
    console.error(`✗ ${name}: pattern not found — chunk format changed?`); process.exit(1)
  }
  if (n !== expect) { console.error(`✗ ${name}: expected ${expect} occurrence(s), found ${n}`); process.exit(1) }
  console.log(`  + ${name}`)
  return src.replace(broken, fixed)
}

function main() {
  let src = readFileSync(CHUNK, 'utf8')
  if (src.includes('__HZ_PAGES__')) {
    console.log('✓ registry chunk tour+ACL patches already applied')
    return
  }

  /* ── FIX 1: tour dim (box-shadow) ── */
  src = apply(src, 'tour dim box-shadow',
    'boxShadow:"0 0 0 2px hsl(var(--primary)/.9), 0 0 0 9999px rgba(15,23,42,.62)"',
    'boxShadow:"0 0 0 2.5px var(--primary), 0 0 0 9999px rgba(15,23,42,.62)"')

  /* ── FIX 2: tour arrows (RTL) ──
     Module 373375 exports ONLY ChevronLeft (var _); module 463059 (via async
     wrapper, var N) provides ChevronRight. Swapping the PROPERTY names would
     resolve to undefined → React error #130 — so we swap the MODULE vars. */
  src = apply(src, 'tour قبلی arrow → ChevronRight',
    '(0,s.jsx)(_.ChevronLeft,{className:"w-4 h-4 ml-1"}),"قبلی"',
    '(0,s.jsx)(N.ChevronRight,{className:"w-4 h-4 ml-1"}),"قبلی"')
  src = apply(src, 'tour بعدی arrow → ChevronLeft',
    'children:["بعدی",(0,s.jsx)(N.ChevronRight,{className:"w-4 h-4 mr-1"})]',
    'children:["بعدی",(0,s.jsx)(_.ChevronLeft,{className:"w-4 h-4 mr-1"})]')

  /* ── FIX 3a: canAccessWorkspace consults per-user overrides ── */
  src = apply(src, 'canAccessWorkspace per-user',
    'function n(e,n){let s=r[n];return!!s&&(!!t.includes(e)||s.includes("*")||s.includes(e))}',
    'function n(e,n){var z=globalThis.__HZ_PAGES__;if(z){if("OWNER"!==e&&"ADMIN"!==e&&z.deny&&z.deny.indexOf("section:"+n)>-1)return!1;if(z.allow&&z.allow.indexOf("section:"+n)>-1)return!0}let s=r[n];return!!s&&(!!t.includes(e)||s.includes("*")||s.includes(e))}')

  /* ── FIX 3b: canAccessPage consults per-user overrides ── */
  src = apply(src, 'canAccessPage per-user',
    'function o(e,r){let o=s[r];return o?!!t.includes(e)||o.includes("*")||o.includes(e):n(e,r.split("/")[0])}',
    'function o(e,r){var z=globalThis.__HZ_PAGES__;if(z){if("OWNER"!==e&&"ADMIN"!==e&&z.deny&&z.deny.indexOf(r)>-1)return!1;if(z.allow&&z.allow.indexOf(r)>-1)return!0}let o=s[r];return o?!!t.includes(e)||o.includes("*")||o.includes(e):n(e,r.split("/")[0])}')

  /* ── FIX 3c: AppShell sets __HZ_PAGES__ from /api/auth/me (mount) ── */
  src = apply(src, 'AppShell me → __HZ_PAGES__ (mount)',
    '(0,n.api)("/api/auth/me").then(t=>{t.ok&&t.data?.user&&(f(t.data.user),t.data.user.tourDone||(e=setTimeout(()=>$(!0),700))),w(!1)})',
    '(0,n.api)("/api/auth/me").then(t=>{t.ok&&t.data?.user&&(globalThis.__HZ_PAGES__={deny:t.data.user.pageDeny||[],allow:t.data.user.pageAllow||[]},f(t.data.user),t.data.user.tourDone||(e=setTimeout(()=>$(!0),700))),w(!1)})')

  /* ── FIX 3d: same for login callback ── */
  src = apply(src, 'AppShell me → __HZ_PAGES__ (login)',
    'e.ok&&e.data?.user&&(f(e.data.user),J(),e.data.user.tourDone||setTimeout(()=>$(!0),700))',
    'e.ok&&e.data?.user&&(globalThis.__HZ_PAGES__={deny:e.data.user.pageDeny||[],allow:e.data.user.pageAllow||[]},f(e.data.user),J(),e.data.user.tourDone||setTimeout(()=>$(!0),700))')

  writeFileSync(CHUNK, src)
  console.log('✓ registry chunk tour+ACL patches applied')
}

main()
