/* Dashboard QA harness runtime — real React 19 + stub bridge with REAL fetch API
   (served same-origin from :3000 so cookies flow) + frozen CSS classes. QA-only. */
import * as R from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import * as ReactDOMClient from 'react-dom/client'

const FA_D = '۰۱۲۳۴۵۶۷۸۹'
const toFaDigits = (s) => String(s ?? '').replace(/[0-9]/g, (d) => FA_D[+d])
const toEnDigits = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => String(FA_D.indexOf(d)))
const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const WEEKDAY_FA = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه']
const MONTH_FA = ['', ...JALALI_MONTHS]
function g2j(gy, gm, gd) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  let jy = gy <= 1600 ? 0 : 979
  const gy2 = gy <= 1600 ? gy - 621 : gy - 1600
  const gy3 = gm > 2 ? gy2 + 1 : gy2
  let days = 365 * gy2 + Math.floor((gy3 + 3) / 4) - Math.floor((gy3 + 99) / 100) + Math.floor((gy3 + 399) / 400) - 80 + gd + gdm[gm - 1]
  jy += 33 * Math.floor(days / 12053); days %= 12053
  jy += 4 * Math.floor(days / 1461); days %= 1461
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365 }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30)
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30)
  return [jy, jm, jd]
}
function j2g(jy, jm, jd) {
  jy += 1595
  let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor((jy % 33 + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)
  let gy = 400 * Math.floor(days / 146097)
  days %= 146097
  if (days > 36524) { days--; gy += 100 * Math.floor(days / 36524); days %= 36524; if (days > 365) days++ }
  gy += 4 * Math.floor(days / 1461)
  days %= 1461
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365 }
  let gd = days + 1
  const months = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let gm = 0
  while (gm < 12 && gd > months[gm + 1]) { gd -= months[gm + 1]; gm++ }
  return [gy, gm + 1, gd]
}
const p2 = (n) => String(n).padStart(2, '0')
const dashOf = (d) => { const [jy, jm, jd] = g2j(d.getFullYear(), d.getMonth() + 1, d.getDate()); return `${jy}-${p2(jm)}-${p2(jd)}` }
const todayJalali = () => dashOf(new Date())
const parseJalali = (s) => {
  const m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return null
  const [gy, gm, gd] = j2g(+m[1], +m[2], +m[3])
  return new Date(gy, gm - 1, gd)
}
const toJalali = (d) => dashOf(d)
const addJalaliDays = (dash, n) => { const d = parseJalali(dash); if (!d) return String(dash); d.setDate(d.getDate() + n); return dashOf(d) }
const formatJalali = (d) => (d instanceof Date ? dashOf(d) : '')
const formatJalaliLong = (d) => { if (!(d instanceof Date)) return ''; const [y, m, day] = dashOf(d).split('-'); return `${+day} ${MONTH_FA[+m]} ${y}` }
const jalaliMonthLength = (y, m) => (m <= 6 ? 31 : m <= 11 ? 30 : 29)
const jalaliToDate = (jy, jm, jd) => { const [gy, gm, gd] = j2g(jy, jm, jd); return new Date(gy, gm - 1, gd) }
const jalaliWeekStart = () => ''
/* قرارداد زمان اجرا: نام روز هفته (ماژول 956657) */
const jalaliWeekday = (d) => WEEKDAY_FA[(new Date(d).getDay() + 1) % 7]

/* ─── api — REAL same-origin fetch (cookies included) ─── */
globalThis.__toasts = []
globalThis.__postedPrefs = []
const api = async (url, opts) => {
  const method = (opts?.method || 'GET').toUpperCase()
  const res = await fetch(String(url), {
    method,
    headers: opts?.body ? { 'content-type': 'application/json' } : undefined,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  })
  let j = null
  try { j = await res.json() } catch { /* ignore */ }
  if (String(url) === '/api/me/prefs' && method === 'POST') globalThis.__postedPrefs.push(opts?.body)
  return j || { ok: false, error: 'bad-json ' + res.status }
}
const qs = (params) => {
  const s = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
  return s ? '?' + s : ''
}

/* ─── shell / toast ─── */
const useShell = () => ({
  user: globalThis.__USER__ || null,
  go: (r) => { globalThis.__navigated = r },
  refreshBadges: () => {},
})
const toast = {
  success: (m) => globalThis.__toasts.push({ kind: 'success', m }),
  error: (m) => globalThis.__toasts.push({ kind: 'error', m }),
  info: (m) => globalThis.__toasts.push({ kind: 'info', m }),
  warning: (m) => globalThis.__toasts.push({ kind: 'warning', m }),
}

const cn = (...parts) => parts.flat(9).filter((p) => typeof p === 'string' && p).join(' ')

/* ─── minimal shadcn-like components (frozen-CSS classes) ─── */
const Button = ({ className = '', variant = 'default', size, ...rest }) => {
  const base = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'
  const varCls = { default: 'bg-primary text-primary-foreground hover:bg-primary/90', outline: 'border border-input bg-background hover:bg-stone-100', secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80', ghost: 'hover:bg-stone-100', destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90' }[variant] || ''
  return jsx('button', { className: cn(base, varCls, size === 'icon' && 'h-10 w-10', size === 'sm' && 'h-8 px-3 text-xs', className), ...rest })
}
const Card = ({ className = '', ...rest }) => jsx('div', { className: cn('bg-card text-card-foreground flex flex-col rounded-xl border shadow-sm', className), ...rest })
const CardHeader = ({ className = '', ...rest }) => jsx('div', { className: cn('flex flex-col space-y-1.5', className), ...rest })
const CardTitle = ({ className = '', ...rest }) => jsx('div', { className: cn('font-semibold leading-none tracking-tight', className), ...rest })
const CardContent = ({ className = '', ...rest }) => jsx('div', { className: cn('', className), ...rest })
const Dialog = ({ open, onOpenChange, children }) => (open ? children : null)
const DialogContent = ({ className = '', children, ...rest }) => jsx('div', { ...rest, className: cn('fixed inset-0 z-50 flex items-center justify-center bg-slate-900/62 p-4', className.slice(0, 0)), children: jsx('div', { className: 'w-full max-w-md rounded-xl border bg-white p-4 shadow-2xl', children }) })
const DialogHeader = ({ className = '', ...rest }) => jsx('div', { className: cn('space-y-1.5', className), ...rest })
const DialogTitle = ({ className = '', ...rest }) => jsx('div', { className: cn('font-semibold', className), ...rest })
const DialogDescription = ({ className = '', ...rest }) => jsx('div', { className: cn('text-sm text-stone-500', className), ...rest })
const DialogFooter = ({ className = '', ...rest }) => jsx('div', { className: cn('flex gap-2', className), ...rest })
const Checkbox = ({ className = '', onCheckedChange, checked, ...rest }) => jsx('input', { type: 'checkbox', checked: !!checked, className: cn('size-4 accent-emerald-600', className), onChange: (e) => onCheckedChange && onCheckedChange(e.target.checked), ...rest })
const Progress = ({ className = '', value, ...rest }) => jsx('div', { className: cn('h-4 w-full overflow-hidden rounded-full bg-stone-100', className), ...rest, children: jsx('div', { style: { width: `${value ?? 0}%` }, className: 'h-full bg-emerald-600' }) })

globalThis.__HZ__ = {
  react: R,
  'jsx-runtime': { jsx, jsxs, Fragment: R.Fragment },
  jsx: { jsx, jsxs, Fragment: R.Fragment },
  api: { api, qs },
  shell: { useShell },
  cn: { cn },
  button: { Button, buttonVariants: {} },
  input: { Input: ({ className = '', ...rest }) => jsx('input', { className: cn('flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none', className), ...rest }) },
  jalali: { JALALI_MONTHS, WEEKDAY_FA, addJalaliDays, formatJalali, formatJalaliLong, jalaliMonthLength, jalaliToDate, jalaliWeekStart, jalaliWeekday, parseJalali, toEnDigits, toFaDigits, toJalali, todayJalali },
  toast: { toast },
  dialog: { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter },
  card: { Card, CardContent, CardHeader, CardTitle },
  select: { Select: ({ children }) => children, SelectTrigger: (p) => jsx('button', { type: 'button', ...p }), SelectValue: ({ placeholder, children }) => jsx('span', { children: children || placeholder || '' }), SelectContent: ({ children }) => jsx('div', { children }), SelectItem: (p) => jsx('div', { ...p }) },
  badge: { Badge: ({ className = '', ...rest }) => jsx('span', { className: cn('inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold', className), ...rest }) },
  table: { Table: (p) => jsx('div', p), TableHeader: (p) => jsx('div', p), TableBody: (p) => jsx('div', p), TableHead: (p) => jsx('div', p), TableRow: (p) => jsx('div', p), TableCell: (p) => jsx('div', p) },
  tabs: { Tabs: ({ children }) => children, TabsList: (p) => jsx('div', p), TabsTrigger: (p) => jsx('button', { type: 'button', ...p }), TabsContent: ({ children }) => jsx('div', { children }) },
  progress: { Progress },
  checkbox: { Checkbox },
  textarea: { Textarea: ({ className = '', ...rest }) => jsx('textarea', { className: cn('flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm', className), ...rest }) },
  popover: { Popover: ({ children }) => children },
}
globalThis.__HZ__['jsx-dev-runtime'] = globalThis.__HZ__['jsx-runtime']
globalThis.__HZ__['react/jsx-runtime'] = globalThis.__HZ__['jsx-runtime']
globalThis.__RD__ = ReactDOMClient
console.log('[dashqa runtime] ready')
