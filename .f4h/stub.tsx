/* Harness stub replacing '../lib/hz' — REAL React + REAL Radix + fixtures */
import * as React from 'react'
export default React
export const { useState, useEffect, useMemo, useRef, useCallback } = React
export { jsx, jsxs } from 'react/jsx-runtime'

/* ── api fixtures ── */
const LOG: any[] = []
const FIXTURE_USERS = [
  { id: 'u_lotfi', username: 'lotfi', fullName: 'محمد لطفی', honorific: 'آقای', role: 'OWNER', roleLabel: 'مدیر عامل', title: 'مدیر عامل هایپر زیتون', phone: '09121110000', avatarJson: JSON.stringify({ emoji: '👑', color: '#0e7a4a' }), active: true, points: 850, lastLoginAt: '2025-10-19T08:12:00.000Z', createdAt: '2025-01-01T00:00:00.000Z', permCount: 0, caps: { approveReturns: true, recordReturnPayment: true, manageUsers: true } },
  { id: 'u_kianoosh', username: 'kianoosh', fullName: 'کیانوش محمدی', honorific: 'مهندس', role: 'ADMIN', roleLabel: 'مدیر عملیات و IT', title: 'مدیر عملیات', phone: null, avatarJson: null, active: true, points: 1200, lastLoginAt: null, createdAt: '2025-01-01T00:00:00.000Z', permCount: 2, caps: { approveReturns: true, manageUsers: true } },
  { id: 'u_rezaie', username: 'rezaie', fullName: 'فاطمه رضایی', honorific: 'خانم', role: 'CASHIER', roleLabel: 'صندوقدار', title: 'صندوق ۲', phone: '09120001111', avatarJson: JSON.stringify({ emoji: '🧕', color: '#be185d' }), active: true, points: 320, lastLoginAt: '2025-10-18T14:02:00.000Z', createdAt: '2025-02-01T00:00:00.000Z', permCount: 1, caps: { approveReturns: false } },
  { id: 'u_mollaie', username: 'mollaie', fullName: 'رضا مولایی', honorific: 'آقای', role: 'EXEC', roleLabel: 'مدیر اجرایی', title: 'مدیر شیفت عصر', phone: null, avatarJson: null, active: false, points: 640, lastLoginAt: '2025-10-01T10:00:00.000Z', createdAt: '2025-01-15T00:00:00.000Z', permCount: 0, caps: { approveReturns: true, recordReturnPayment: true } },
]
let REZAIE_OV: any[] = [{ userId: 'u_rezaie', pageKey: 'finance/cheques', allow: true }]

export async function api(path: string, opts?: any) {
  await new Promise((r) => setTimeout(r, 10))
  LOG.push({ path, method: opts?.method || 'GET', body: opts?.body })
  ;(globalThis as any).__APILOG = LOG
  const ok = (data: any) => ({ ok: true as const, data })
  const fail = (error: string) => ({ ok: false as const, error })
  if (path === '/api/admin/users') {
    if (opts?.method === 'POST') {
      const b = opts.body
      if (!b.username || b.username.length < 3) return fail('نام کاربری معتبر نیست')
      if (FIXTURE_USERS.some((u) => u.username === b.username)) return fail('این نام کاربری قبلاً ثبت شده است')
      return ok({ id: 'u_new' })
    }
    return ok({
      items: FIXTURE_USERS,
      stats: { total: 4, active: 3, inactive: 1, activeAdmins: 1, activeOwners: 1 },
    })
  }
  let m = path.match(/^\/api\/admin\/users\/([^/]+)$/)
  if (m) {
    const u = FIXTURE_USERS.find((x) => x.id === m[1])
    if (!u) return fail('کاربر یافت نشد')
    if (opts?.method === 'PATCH') return ok({ id: u.id, updated: ['نام'] })
    return ok({ user: { ...u, hasPassword: !!u.id.includes('kianoosh'), hasPin: u.role === 'CASHIER' }, overrides: REZAIE_OV.filter((o) => o.userId === u.id).map((o) => ({ pageKey: o.pageKey, allow: o.allow })) })
  }
  m = path.match(/^\/api\/admin\/users\/([^/]+)\/permissions$/)
  if (m) {
    const u = FIXTURE_USERS.find((x) => x.id === m[1])
    if (!u) return fail('کاربر یافت نشد')
    if (opts?.method === 'PUT') {
      const b = opts.body
      const map = new Map(REZAIE_OV.filter((o) => o.userId === u.id).map((o) => [o.pageKey, o]))
      for (const up of b.upserts || []) map.set(up.pageKey, { userId: u.id, pageKey: up.pageKey, allow: up.allow })
      for (const rm of b.removals || []) map.delete(rm)
      REZAIE_OV = [...map.values()]
      return ok({ overrides: REZAIE_OV.filter((o) => o.userId === u.id).map((o) => ({ pageKey: o.pageKey, allow: o.allow })), upserted: (b.upserts || []).length, removed: (b.removals || []).length })
    }
    return ok({
      overrides: REZAIE_OV.filter((o) => o.userId === u.id).map((o) => ({ pageKey: o.pageKey, allow: o.allow, createdAt: '2025-10-01T00:00:00.000Z' })),
      user: { id: u.id, fullName: u.fullName, username: u.username, role: u.role },
    })
  }
  if (path === '/api/me/profile') {
    const b = opts.body
    if (!b.fullName || b.fullName.trim().length < 2) return fail('نام کامل را وارد کنید')
    if (b.avatarJson === 'bad') return fail('قالب تصویر نمایه معتبر نیست')
    return ok({ user: { id: 'u_kianoosh', fullName: b.fullName }, updated: ['نام'] })
  }
  if (path === '/api/me/password') {
    const b = opts.body
    if (!b.current) return fail('رمز فعلی را وارد کنید')
    if (String(b.next || '').length < 6) return fail('رمز جدید باید حداقل ۶ نویسه باشد')
    return ok({ changed: true })
  }
  if (path === '/api/me/pin') {
    const b = opts.body
    if (!b.current) return fail('رمز فعلی را وارد کنید')
    if (!/^\d{4}$/.test(String(b.next || ''))) return fail('رمز چهاررقمی جدید باید دقیقاً ۴ رقم باشد')
    return ok({ changed: true })
  }
  if (path === '/api/kb') {
    if (opts?.method === 'POST') return ok({ id: 'kb_new' })
    if (opts?.method === 'PATCH') return ok({ id: 'kb_1' })
    if (opts?.method === 'DELETE') return ok({ id: 'kb_1' })
    let m2 = path
    if (opts?.method === 'GET' && (globalThis as any).__KB_ID) {
      return ok({ article: { id: (globalThis as any).__KB_ID, title: 'مقالهٔ آزمون', category: 'شروع سریع', summary: 'خلاصه', body: 'متن کامل مقاله', pinned: false, imageUrl: '' } })
    }
    return ok({
      articles: [
        { id: 'kb_1', title: 'شروع سریع با میزکار', category: 'شروع سریع', summary: 'خلاصهٔ شروع', body: 'متن', pinned: true, imageUrl: '' },
        { id: 'kb_2', title: 'ثبت مرجوعی در ۳ گام', category: 'مرجوعی', summary: 'خلاصه', body: 'متن', pinned: false, imageUrl: '' },
      ],
      categories: ['شروع سریع', 'مرجوعی'],
      canManage: true,
    })
  }
  if (path.startsWith('/api/kb?id=')) {
    const id = decodeURIComponent(path.split('id=')[1] || '')
    if (opts?.method === 'DELETE') return ok({ id })
    return ok({ article: { id, title: 'مقالهٔ آزمون', category: 'شروع سریع', summary: 'خلاصه', body: 'متن کامل', pinned: false, imageUrl: '' } })
  }
  if (path === '/api/me/tour') return ok({ ok: true })
  if (path === '/api/home') {
    if ((globalThis as any).__HOME_ERR) return fail('خطای آزمونی')
    return ok({
      stats: { pendingReturns: 2, myReturnsToday: 1, activeOrders: 3, receivingQueue: 1, chequesDue: 1, lowStock: 4 },
      myTasks: [
        { id: 't1', title: 'کنترل تاریخ گوندولا ۱', dueDate: '1405-07-20', status: 'OPEN' },
        { id: 't2', title: 'سفارش نان', dueDate: '1405-08-01', status: 'IN_PROGRESS' },
      ],
      checklistCards: [{ id: 'c1', title: 'باز کردن در', done: 4, total: 6 }],
      todayShifts: [{ user: { id: 'u_kianoosh' }, shiftType: 'MORNING' }],
      problemsOpen: 1,
      lowStockTop3: [{ id: 'p1', name: 'شیر پرچرب ۱ لیتری', stock: 0 }, { id: 'p2', name: 'پنیر لیقوان', stock: 2 }],
      handoverLatest: { author: { fullName: 'فاطمه درویشی' }, shift: 'MORNING', date: '1405-07-29', acknowledged: false },
      wall: [{ id: 'w1', content: 'جلسهٔ صبحگاهی فردا ۸:۳۰', pinned: true, createdAt: '2026-10-21T06:00:00.000Z' }, { id: 'w2', content: 'یادآوری کنترل تاریخ', pinned: false, createdAt: '2026-10-20T10:00:00.000Z' }],
      myRank: 4,
    })
  }
  if (path === '/api/me/prefs') {
    if (opts?.method === 'POST') {
      ;(globalThis as any).__PREFS_SAVED = opts.body
      return ok({ saved: true })
    }
    return ok({ prefs: (globalThis as any).__PREFS_FIXTURE || null })
  }
  if (path === '/api/floorplan-stats') {
    return ok({
      plan: { name: 'نقشهٔ اصلی', width: 1532, height: 2010 },
      blocks: [
        { id: 'b1', label: 'گوندولا ۱', kind: 'GONDOLA', x: 200, y: 380, w: 110, h: 700, zoneName: 'مرکز', responsible: 'عبدالله ملايی', productCount: 12, stockTotal: 340, lowStock: 1, topProducts: [{ name: 'روغن ۱.۸', stock: 4, sellPrice: 120000 }] },
        { id: 'b2', label: 'صندوق ۱', kind: 'CASHIER_U', x: 1050, y: 1700, w: 100, h: 170, zoneName: '', responsible: '', productCount: 0 },
      ],
      zones: [{ name: 'مرکز', pending: 1, confirmed: 2 }],
      stats: { blocks: 2, productBlocks: 1, products: 12, stock: 340, lowBlocks: 1 },
    })
  }
  if (path === '/api/store/floorplans') {
    return ok({ plans: [{ id: 'fp1', name: 'نقشهٔ اصلی', width: 1532, height: 2010, outlineJson: [[0, 0], [1532, 0], [1532, 2010], [1395, 2010], [1395, 1873], [995, 1873], [995, 2010], [460, 2010], [460, 1873], [60, 1873], [60, 2010], [0, 1782]] }] })
  }
  if (path === '/api/store/section-columns') {
    if ((globalThis as any).__COLS_DENIED) return fail('دسترسی به این بخش ندارید', 403)
    return ok({
      planId: 'fp1', planName: 'نقشهٔ اصلی',
      sections: [
        { blockLabel: 'گوندولا ۱', kind: 'GONDOLA', zone: 'مرکز', columns: [{ id: 'z1', name: 'ستون ۱', order: 0, active: true }, { id: 'z2', name: 'ستون ۲', order: 1, active: true }, { id: 'z3', name: 'ستون ۳', order: 2, active: true }], lastCheckedAt: null, lastCheckedColumns: [], nextStart: 'ستون ۱', coverage: 0 },
      ],
    })
  }
  if (path.startsWith('/api/date-checks')) {
    if ((globalThis as any).__DC_FIXTURE) return ok((globalThis as any).__DC_FIXTURE)
    return ok({
      month: '1405-07', date: null, refDate: '1405-07-28', todaySlot: 7, cycle: 28,
      lines: [{ id: 'LINE-01', label: 'گوندولا ۱ — روی شرقی', blockLabel: 'گوندولا ۱', daySlot: 7, kind: 'GONDOLA', zone: 'مرکز', columns: [{ id: 'z1', name: 'ستون ۱', order: 0 }], lastColumns: [], nextStart: 'ستون ۱' }],
      todayLines: [{ id: 'LINE-01', label: 'گوندولا ۱ — روی شرقی', blockLabel: 'گوندولا ۱', daySlot: 7, kind: 'GONDOLA', zone: 'مرکز', columns: [{ id: 'z1', name: 'ستون ۱', order: 0 }], lastColumns: [], nextStart: 'ستون ۱' }],
      results: [],
      todayPlan: [{ blockLabel: 'گوندولا ۱', startFrom: 'ستون ۱', suggested: 1 }],
    })
  }
  return fail('مسیر ناشناخته: ' + path)
}
export const qs = (p: any) => '?' + new URLSearchParams(Object.entries(p).filter(([, v]: any) => v !== null && v !== '' && v !== undefined).map(([k, v]: any) => [k, String(v)]) as any).toString()

/* ── shell ── (single stable object — real app provides user from context state) */
const SHELL_USER = { id: 'u_kianoosh', username: 'kianoosh', fullName: 'کیانوش محمدی', honorific: 'مهندس', role: 'ADMIN', roleLabel: 'مدیر عملیات و IT', title: 'مدیر عملیات', phone: '0912', avatarJson: null, points: 1200, active: true, tourDone: true, caps: {} }
export function useShell() {
  return {
    user: SHELL_USER,
    go: (k: string) => { LOG.push({ go: k }); (globalThis as any).__APILOG = LOG },
    refreshBadges: () => {},
  }
}

export const cn = (...a: any[]) => a.filter((x) => typeof x === 'string' ? x.trim() : !!x).join(' ')

/* ── toast (records + DOM) ── */
const TOASTS: any[] = []
export const toast = {
  success: (m: string) => TOASTS.push({ kind: 'success', m }) && renderToasts(),
  error: (m: string) => TOASTS.push({ kind: 'error', m }) && renderToasts(),
  info: (m: string) => TOASTS.push({ kind: 'info', m }) && renderToasts(),
  warning: (m: string) => TOASTS.push({ kind: 'warning', m }) && renderToasts(),
}
function renderToasts() {
  ;(globalThis as any).__TOASTS = TOASTS
  const el = document.getElementById('toasts')
  if (el) el.innerHTML = TOASTS.map((t) => `<div class="t ${t.kind}">${t.m}</div>`).join('')
  if (TOASTS.length > 8) TOASTS.splice(0, TOASTS.length - 8)
}

/* ── jalali ── */
export const JALALI_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند']
export const WEEKDAY_FA = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه']
export const toFaDigits = (s: any) => String(s ?? '').replace(/\d/g, (d: string) => '۰۱۲۳۴۵۶۷۸۹'[+d])
export const toEnDigits = (s: any) => String(s ?? '').replace(/[۰-۹]/g, (d: string) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
export const todayJalali = () => '1405-07-28'
export const formatJalali = (d?: any) => { try { const x = new Date(d); return isNaN(x.getTime()) ? '' : '1405/07/28' } catch { return '' } }
export const formatJalaliLong = () => '۲۸ مهر ۱۴۰۵'
export const parseJalali = () => ({ jy: 1405, jm: 7, jd: 28 })
export const jalaliMonthLength = () => 30
export const addJalaliDays = (s: string, n: number) => s
export const jalaliToDate = () => new Date()
export const jalaliWeekStart = () => '1405-07-26'
export const jalaliWeekday = () => 0
export const toJalali = () => ({ jy: 1405, jm: 7, jd: 28 })

/* ── icons ── */
const Icomp = (name: string) => {
  const C = (p: any) => <span data-icon={name} data-size={p?.size} className={p?.className} aria-hidden>◆</span>
  return C
}
const NAMES = ['check','x','plus','minus','search','printer','calendar','clock','alertTriangle','info','users','user','package','send','save','clipboard','store','trendingUp','trendingDown','chevronDown','chevronLeft','chevronRight','chevronUp','pencil','trash','loader','barChart','sparkles','timer','circleDot','eye','history','refresh','carton','banknote','receipt','filter','settings','scan','wallet','creditCard','packagePlus','arrowRight','arrowLeft','calendarDays','play','layers','layoutGrid','shield','shieldCheck','lock','keyRound','fileDown','columns','keyboard','link','zap','userCheck','bookOpen','penLine','handshake','flaskConical']
export const I: any = Object.fromEntries(NAMES.map((n) => [n, Icomp(n)]))
export const Icon = (p: any) => <span data-icon={String(p?.name)} data-size={p?.size} className={p?.className} aria-hidden>◆</span>

/* ── ui kit stubs (radix-backed where it matters) ── */
export const Button = React.forwardRef(function Button(p: any, ref: any) {
  return <button ref={ref} type={p.type || 'button'} disabled={p.disabled} onClick={p.onClick}
    data-variant={p.variant || 'default'} data-size={p.size || 'default'} className={p.className} aria-label={p['aria-label']}>{p.children}</button>
})
export const Input = React.forwardRef(function Input(p: any, ref: any) {
  const { onChange, ...rest } = p
  return <input ref={ref} {...rest} onChange={(e: any) => onChange?.({ target: { value: e.target.value }, preventDefault: () => {}, stopPropagation: () => {} })} />
})
export const Textarea = Input
export const Card = (p: any) => <div data-card className={p.className}>{p.children}</div>
export const CardContent = (p: any) => <div data-card-content className={p.className}>{p.children}</div>
export const CardHeader = (p: any) => <div data-card-header className={p.className}>{p.children}</div>
export const CardTitle = (p: any) => <div data-card-title className={p.className}>{p.children}</div>
export const Badge = (p: any) => <span data-badge={p.variant || 'default'} className={p.className}>{p.children}</span>
export const Progress = (p: any) => <div data-progress>{p.children}</div>

const TableCtx = React.createContext<any>(null)
export const Table = (p: any) => <table data-table className={p.className}><TableCtx.Provider value={1}><tbody-wrapper>{p.children}</tbody-wrapper></TableCtx.Provider></table>
const tbody_wrapper = (p: any) => <>{p.children}</>
export const TableHeader = (p: any) => <thead className={p.className}>{p.children}</thead>
export const TableBody = (p: any) => <tbody className={p.className}>{p.children}</tbody>
export const TableRow = (p: any) => <tr className={p.className}>{p.children}</tr>
export const TableHead = (p: any) => <th className={p.className}>{p.children}</th>
export const TableCell = (p: any) => <td className={p.className}>{p.children}</td>

/* Radix Select — real */
import * as RSelect from '@radix-ui/react-select'
export const Select = (p: any) => <RSelect.Root value={p.value} onValueChange={p.onValueChange} disabled={p.disabled}>{p.children}</RSelect.Root>
export const SelectTrigger = (p: any) => <RSelect.Trigger className={p.className} aria-label={p['aria-label']}>{p.children}</RSelect.Trigger>
export const SelectValue = (p: any) => <RSelect.Value placeholder={p.placeholder} />
export const SelectContent = (p: any) => <RSelect.Portal><RSelect.Content position="popper" className={p.className}>{p.children}</RSelect.Content></RSelect.Portal>
export const SelectItem = (p: any) => <RSelect.Item value={p.value} className={p.className}>{p.children}</RSelect.Item>

/* Radix Dialog — real */
import * as RDialog from '@radix-ui/react-dialog'
export const Dialog = (p: any) => <RDialog.Root open={p.open} onOpenChange={p.onOpenChange}>{p.children}</RDialog.Root>
export const DialogContent = (p: any) => <RDialog.Portal><RDialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 40 }} /><RDialog.Content className={p.className} style={{ position: 'fixed', top: '6%', left: '50%', transform: 'translateX(-50%)', background: '#fff', padding: 16, zIndex: 50, maxWidth: '92vw', maxHeight: '86vh', overflow: 'auto' }} dir="rtl">{p.children}</RDialog.Content></RDialog.Portal>
export const DialogHeader = (p: any) => <div data-dialog-header className={p.className}>{p.children}</div>
export const DialogTitle = (p: any) => <RDialog.Title className={p.className}>{p.children}</RDialog.Title>
export const DialogDescription = (p: any) => <RDialog.Description className={p.className}>{p.children}</RDialog.Description>
export const DialogFooter = (p: any) => <div data-dialog-footer className={p.className}>{p.children}</div>

/* Radix Tabs — real */
import * as RTabs from '@radix-ui/react-tabs'
export const Tabs = (p: any) => <RTabs.Root value={p.value} onValueChange={p.onValueChange} defaultValue={p.defaultValue} className={p.className}>{p.children}</RTabs.Root>
export const TabsList = (p: any) => <RTabs.List className={p.className}>{p.children}</RTabs.List>
export const TabsTrigger = (p: any) => <RTabs.Trigger value={p.value} className={p.className}>{p.children}</RTabs.Trigger>
export const TabsContent = (p: any) => <RTabs.Content value={p.value} className={p.className}>{p.children}</RTabs.Content>

/* Radix Checkbox — real */
import * as RCheckbox from '@radix-ui/react-checkbox'
export const Checkbox = (p: any) => <RCheckbox.Root checked={p.checked} onCheckedChange={p.onCheckedChange} disabled={p.disabled} className={p.className} style={{ width: 16, height: 16, border: '1px solid #a8a29e' }}>{p.children}</RCheckbox.Root>

export const Popover = (p: any) => <div data-popover>{p.children}</div>
export const Stepper = (p: any) => <div data-stepper>{p.children}</div>
export const JalaliDate = (p: any) => <div data-jalalidate>{p.children}</div>

/* ── tour engine — records invocations (real engine tested in its own harness) ── */
export interface TourStep { target?: string; go?: string; title: string; body: string; mobileHint?: string }
export interface TourHandle { destroy(): void }
export function mountTour(steps: TourStep[], handlers: { goFn?: (r: string) => void; onClose: () => void; onDone: () => void }): TourHandle {
  const rec = { steps, handlers, destroyed: false }
  ;(globalThis as any).__TOURS = [...(((globalThis as any).__TOURS) || []), rec]
  return {
    destroy() { rec.destroyed = true; (globalThis as any).__TOURS = (((globalThis as any).__TOURS) || []).filter((x: any) => x !== rec) },
  }
}
export function TourEngine(props: { open: boolean; steps: TourStep[]; onClose: () => void; onDone: () => void }) {
  const { open, steps, onClose, onDone } = props
  useEffect(() => {
    if (!open) return
    const rec = { steps, handlers: { onClose, onDone }, engine: true, destroyed: false }
    ;(globalThis as any).__TOURS = [...(((globalThis as any).__TOURS) || []), rec]
    return () => { rec.destroyed = true; (globalThis as any).__TOURS = (((globalThis as any).__TOURS) || []).filter((x: any) => x !== rec) }
  }, [open])
  return null
}

/* ── print/docs stubs (not under test here) ── */
export const printHTML = () => {}
export const printDoc = () => {}
export const docHTML = () => ''
export const DocPreview = () => <div data-docpreview />
export const barcode128 = () => null
export const amountWords = (n: any) => ({ rial: String(n), toman: String(n) })
export const numberToPersianWords = (n: any) => String(n)
export const jsDateToJalali = (d: any) => { try { const x = new Date(d); return isNaN(x.getTime()) ? '' : '1405-07-28' } catch { return '' } }
export const fa = (n: any) => { if (n === null || n === undefined || n === '') return ''; const s = typeof n === 'number' ? n.toLocaleString('en-US') : String(n); return s.replace(/\d/g, (d: string) => '۰۱۲۳۴۵۶۷۸۹'[+d]) }
export const money = (n: any) => fa(Math.round(n || 0).toLocaleString('en-US'))
export const toman = (n: any) => money((n || 0) / 10)
export const minutesToHM = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
