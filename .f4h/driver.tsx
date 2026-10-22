import * as React from 'react'
import { createRoot } from 'react-dom/client'
import UsersView from '../hz-ext/src/views/users.tsx'
import AccountView from '../hz-ext/src/views/account.tsx'
import GuideView from '../hz-ext/src/views/guide.tsx'
import DashboardView from '../hz-ext/src/views/dashboard.tsx'
import LiveboardView from '../hz-ext/src/views/liveboard.tsx'

;(window as any).__ERRS = []
const origErr = console.error.bind(console)
console.error = (...a: any[]) => { (window as any).__ERRS.push(a.map((x) => {
  try { return x instanceof Error ? x.message + '\nSTACK:' + String(x.stack).slice(0, 900) : typeof x === 'object' ? JSON.stringify(x)?.slice(0, 300) : String(x) } catch { return String(x) }
})); origErr(...a) }
window.addEventListener('error', (e: any) => (window as any).__ERRS.push('WIN-ERR: ' + e.message + ' @ ' + (e.filename || '') + ':' + e.lineno))
window.addEventListener('unhandledrejection', (e: any) => (window as any).__ERRS.push('REJ: ' + String(e.reason && (e.reason.stack || e.reason.message || e.reason)).slice(0, 900)))

const view = new URLSearchParams(location.search).get('view') || 'users'

class EB extends React.Component<any, any> {
  constructor(props: any) { super(props); this.state = { err: null } }
  static getDerivedStateFromError(err: any) { return { err } }
  componentDidCatch(err: any, info: any) { origErr('RENDER-ERROR', err, info) }
  render() { return this.state.err ? <div id="errbox">RENDER-ERROR: {String(this.state.err && this.state.err.message)}</div> : this.props.children }
}

function App() {
  return (
    <EB>
      <div dir="rtl" style={{ fontFamily: 'sans-serif', padding: 12 }}>
        {view === 'users' ? <UsersView /> : view === 'account' ? <AccountView /> : view === 'guide' ? <GuideView /> : view === 'dashboard' ? <DashboardView /> : view === 'liveboard' ? <LiveboardView /> : <UsersView />}
      </div>
    </EB>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
;(window as any).__READY = true
