'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminShell from '@/components/admin/AdminShell'

interface OrderItem { id: string; name: string; unit: string; qty: number; unitPrice: number; lineTotal: number }
interface Order {
  id: string; code: string; status: string; statusFa: string; payMethod: string
  total: number; itemsTotal: number; deliveryFee: number
  slotDate: string | null; slotFrom: string | null; slotTo: string | null; note: string | null
  address: { label?: string; receiver?: string; phone?: string; city?: string; address?: string }
  customer: { phone: string; name: string }
  pickerName: string | null; delivererName: string | null
  holooInvoiceNo: string | null; holooError: string | null
  createdAt: string; cancelReason: string | null; items: OrderItem[]
}

const fa = (n: number) => n.toLocaleString('fa-IR')
const money = (n: number) => `${fa(Math.round(n))} ریال`
const dt = (iso: string | null) => {
  if (!iso) return ''
  try { return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) } catch { return iso }
}

const LANES = [
  { statuses: ['COD', 'PAID', 'AWAITING_PAYMENT'], title: '🆕 جدید', color: '#e3cf8a' },
  { statuses: ['PICKING'], title: '🧺 در حال جمع‌آوری', color: '#e8b96a' },
  { statuses: ['DELIVERING'], title: '🛵 در مسیر تحویل', color: '#7fb3e8' },
  { statuses: ['DELIVERED', 'INVOICED'], title: '✅ تحویل/فاکتور', color: '#8fce9f' },
  { statuses: ['CANCELLED'], title: '✖ لغوشده', color: '#e8938a' },
]

function OrdersInner() {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [toast, setToast] = useState('')
  const [courierFor, setCourierFor] = useState<Order | null>(null)
  const [courierName, setCourierName] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/shop-admin/orders', { cache: 'no-store' })
      const j = await r.json()
      if (j.ok) setOrders(j.data.orders)
    } catch { /* offline */ }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 20000)
    return () => clearInterval(t)
  }, [load])

  const act = async (o: Order, action: string, extra: Record<string, unknown> = {}) => {
    setBusyId(o.id)
    try {
      const r = await fetch(`/api/admin/shop-admin/orders/${o.id}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
      })
      const j = await r.json()
      setToast(j.ok ? `✓ ${o.code} — ${j.data?.statusFa || 'انجام شد'}${j.data?.invoiceNo ? ` (فاکتور هلو ${j.data.invoiceNo})` : ''}` : `✗ ${o.code} — ${j.error || 'ناموفق'}`)
      await load()
    } finally {
      setBusyId('')
      setTimeout(() => setToast(''), 5000)
    }
  }

  if (!orders) return <div className="adm-skel" />
  const lane = (l: typeof LANES[number]) => orders.filter((o) => l.statuses.includes(o.status))

  return (
    <>
      <h1>سفارش‌های آنلاین <small style={{ color: '#9db3a3', fontSize: 12.5 }}>— به‌روزرسانی هر ۲۰ ثانیه</small></h1>
      {toast && <div className="adm-toast">{toast}</div>}
      {orders.length === 0 && <div className="adm-card adm-empty">فعلاً سفارشی نیست</div>}
      {LANES.map((l) => {
        const rows = lane(l)
        if (!rows.length) return null
        return (
          <section key={l.title}>
            <p className="adm-lane" style={{ color: l.color }}>{l.title} ({fa(rows.length)})</p>
            {rows.map((o) => (
              <article key={o.id} className="adm-order" style={{ opacity: busyId === o.id ? 0.6 : 1 }}>
                <header>
                  <b>{o.code}</b>
                  <span className="adm-status" style={{ background: `${l.color}22`, color: l.color }}>{o.statusFa}</span>
                  <span style={{ fontSize: 12, color: '#9db3a3' }}>{o.payMethod === 'COD' ? '💵 در محل' : '💳 آنلاین'}</span>
                  <time style={{ fontSize: 11.5, color: '#7d9484', marginInlineStart: 'auto' }}>{dt(o.createdAt)}</time>
                </header>
                <div className="meta">👤 {o.address.receiver || o.customer.name || 'مشتری'} — <bdi dir="ltr">{o.address.phone || o.customer.phone}</bdi></div>
                <div className="meta">📍 {o.address.city} — {o.address.address}</div>
                <div className="meta">🕒 تحویل: <bdi>{o.slotDate} {o.slotFrom}–{o.slotTo}</bdi>{o.note ? ` · 📝 ${o.note}` : ''}</div>
                <div className="adm-items">
                  {o.items.map((i) => <div key={i.id}><bdi>{fa(i.qty)}</bdi> × {i.name} — {money(i.lineTotal)}</div>)}
                  <div style={{ borderTop: '1px dashed #2b4433', marginTop: 6, paddingTop: 6, fontWeight: 700 }}>
                    ارسال: {o.deliveryFee ? money(o.deliveryFee) : 'رایگان'} · جمع: {money(o.total)}
                  </div>
                </div>
                {o.holooInvoiceNo ? <div className="meta" style={{ color: '#8fce9f' }}>فاکتور هلو: <bdi>{o.holooInvoiceNo}</bdi></div> : null}
                {o.holooError ? <div className="meta" style={{ color: '#e8a9a2' }}>خطای هلو: {o.holooError}</div> : null}
                <div className="adm-actions">
                  {['COD', 'PAID'].includes(o.status) && (
                    <>
                      <button className="adm-btn sm" onClick={() => act(o, 'start-pick')}>🧺 شروع جمع‌آوری</button>
                      <button className="adm-btn sm danger" onClick={() => { const r = prompt('علت لغو؟'); if (r !== null) act(o, 'cancel', { reason: r }) }}>✖ لغو</button>
                    </>
                  )}
                  {o.status === 'PICKING' && (
                    <>
                      <button className="adm-btn sm" disabled={!!o.pickerName && false} onClick={() => act(o, 'picked')}>✔ پایان جمع‌آوری</button>
                      <button className="adm-btn sm" onClick={() => { setCourierFor(o); setCourierName('') }}>🛵 ارسال با پیک…</button>
                    </>
                  )}
                  {o.status === 'DELIVERING' && (
                    <button className="adm-btn sm" onClick={() => act(o, 'deliver')}>✅ تحویل شد (فاکتور هلو خودکار)</button>
                  )}
                  {o.status === 'DELIVERED' && o.holooError && (
                    <button className="adm-btn sm" onClick={() => act(o, 'retry-holoo')}>↻ تلاش دوبارهٔ هلو</button>
                  )}
                </div>
              </article>
            ))}
          </section>
        )
      })}

      {courierFor && (
        <div className="adm-modal" onClick={() => setCourierFor(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px' }}>ارسال {courierFor.code} با پیک</h3>
            <label className="adm-field"><span>نام پیک *</span>
              <input value={courierName} onChange={(e) => setCourierName(e.target.value)} autoFocus />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="adm-btn sm" onClick={() => setCourierFor(null)}>انصراف</button>
              <button className="adm-btn sm" disabled={!courierName.trim()} onClick={async () => { await act(courierFor, 'start-deliver', { delivererName: courierName }); setCourierFor(null) }}>ثبت و ارسال</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function AdminOrdersPage() {
  return <AdminShell><OrdersInner /></AdminShell>
}
