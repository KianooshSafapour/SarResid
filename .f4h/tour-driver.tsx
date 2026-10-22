/* Tour-engine isolation harness — drives the REAL mountTour from lib/ui.tsx
   against a synthetic page (rail/sidebar/targets/below-fold/late-mount). */
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { mountTour } from '../hz-ext/src/lib/ui.tsx'

;(window as any).__ERRS = []
const origErr = console.error.bind(console)
console.error = (...a: any[]) => { (window as any).__ERRS.push(a.map((x) => String(x?.message || x))); origErr(...a) }
window.addEventListener('error', (e: any) => (window as any).__ERRS.push('WIN-ERR: ' + e.message))
window.addEventListener('unhandledrejection', (e: any) => (window as any).__ERRS.push('REJ: ' + String(e.reason)))

/* synthetic app page — mimics shell + a target view */
function Page() {
  const [lateEl, setLateEl] = React.useState(false)
  React.useEffect(() => {
    const t = setTimeout(() => setLateEl(true), 1200) /* هدف دیرهنگام — تست پیمایش */
    return () => clearTimeout(t)
  }, [])
  return (
    <div dir="rtl" style={{ fontFamily: 'Vazirmatn, sans-serif' }}>
      <div style={{ display: 'flex', height: '100vh' }}>
        <div style={{ flex: 1, padding: 16, overflowY: 'auto' }} id="main-scroll">
          <h1>صفحهٔ آزمون</h1>
          <input placeholder="نام کالا — مثلاً: بیژن، شیر، چیپس…" style={{ display: 'block', margin: '40px 0', padding: 8, border: '1px solid #a8a29e', borderRadius: 8, width: 320 }} />
          <div style={{ height: 1400 }} />
          <div data-tour="belowfold" style={{ padding: 12, border: '1px dashed #a8a29e', borderRadius: 8 }}>هدف پایین صفحه</div>
          <div style={{ height: 300 }} />
          {lateEl && <div data-tour="late" style={{ padding: 12, border: '1px dashed #0e7a4a', borderRadius: 8 }}>هدف دیرهنگام (بعد از ۱.۲ ثانیه)</div>}
        </div>
        <div data-tour="rail" style={{ width: 88, borderLeft: '1px solid #d6d3d1' }}>rail</div>
        <div data-tour="sidebar" style={{ width: 250, borderLeft: '1px solid #d6d3d1', padding: 8 }}>sidebar</div>
      </div>
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<Page />)

/* ── کنترل از بیرون (agent-browser) ── */
declare global { interface Window { __goLog: string[] } }
(window as any).__goLog = []
;(window as any).runTour = (steps: any, opts?: any) => {
  return mountTour(steps, {
    goFn: (r: string) => { (window as any).__goLog.push(r); if (opts?.onGo) opts.onGo(r) },
    onClose: () => { (window as any).__closed = true },
    onDone: () => { (window as any).__done = true },
  })
}
;(window as any).__READY = true
