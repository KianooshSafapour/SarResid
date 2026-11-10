'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface OrderItem { id: string; name: string; unit: string; qty: number; unitPrice: number; lineTotal: number; pickNote?: string | null }
interface Order {
  id: string; code: string; status: string; statusFa: string; payMethod: string; paidAt: string | null
  total: number; itemsTotal: number; deliveryFee: number
  slotDate: string; slotFrom: string; slotTo: string; note: string | null
  address: { label?: string; receiver?: string; phone?: string; city?: string; address?: string; postalCode?: string | null; note?: string | null }
  customer: { phone: string; name: string }
  pickerName: string | null; pickedAt: string | null; delivererName: string | null; deliveredAt: string | null
  holooInvoiceNo: string | null; holooError: string | null
  createdAt: string; cancelReason: string | null; items: OrderItem[]
}

const fa = (n: number) => n.toLocaleString('fa-IR')
const money = (n: number) => `${fa(Math.round(n))} ریال`
const jdate = (iso: string | null) => {
  if (!iso) return ''
  try { return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) } catch { return iso }
}

const LANES: { key: string; title: string; statuses: string[]; color: string }[] = [
  { key: 'new', title: '🆕 جدید — در انتظار جمع‌آوری', statuses: ['COD', 'PAID', 'AWAITING_PAYMENT'], color: '#0e7a4a' },
  { key: 'picking', title: '🧺 در حال جمع‌آوری', statuses: ['PICKING'], color: '#b45309' },
  { key: 'delivering', title: '🛵 در مسیر تحویل', statuses: ['DELIVERING'], color: '#1d4ed8' },
  { key: 'done', title: '✅ تحویل/فاکتور', statuses: ['DELIVERED', 'INVOICED'], color: '#475569' },
  { key: 'cancelled', title: '✖ لغوشده', statuses: ['CANCELLED'], color: '#b91c1c' },
]

export default function ShopOpsConsole({ user }: { user: { fullName: string; honorific: string; role: string } }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [counts, setCounts] = useState<{ status: string; count: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [courierFor, setCourierFor] = useState<Order | null>(null)
  const [courierName, setCourierName] = useState('')
  const [courierPhone, setCourierPhone] = useState('')
  const [cancelFor, setCancelFor] = useState<Order | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [busyId, setBusyId] = useState('')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/shop-admin/orders', { cache: 'no-store' })
      const j = await r.json()
      if (j.ok) { setOrders(j.data.orders); setCounts(j.data.counts); setError('') }
      else setError(j.error || 'خطا در دریافت سفارش‌ها')
    } catch { setError('ارتباط برقرار نشد') } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    timer.current = setInterval(load, 20000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [load])

  const act = async (order: Order, action: string, extra: Record<string, unknown> = {}) => {
    setBusyId(order.id)
    try {
      const r = await fetch(`/api/shop-admin/orders/${order.id}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const j = await r.json()
      setToast(j.ok ? `✓ ${order.code} — ${j.data?.statusFa || 'انجام شد'}${j.data?.invoiceNo ? ` (فاکتور هلو ${j.data.invoiceNo})` : ''}` : `✗ ${order.code} — ${j.error || 'ناموفق'}`)
      await load()
    } finally {
      setBusyId('')
      setTimeout(() => setToast(''), 6000)
    }
  }

  const lane = (l: typeof LANES[number]) => orders.filter((o) => l.statuses.includes(o.status))
  const countOf = (s: string) => counts.find((c) => c.status === s)?.count || 0

  return (
    <main style={{ padding: '16px', maxWidth: 1280, margin: '0 auto', fontFamily: 'Vazirmatn, Tahoma, sans-serif', background: '#f6f7f4', minHeight: '100vh' }}>
      <style>{css}</style>
      <div className="ops-head" style={{ background: 'none', color: 'inherit', padding: 0, marginBottom: 10 }}>
        <h1 style={{ margin: 0, fontSize: 18, color: 'var(--o-900)' }}>سفارش‌های آنلاین</h1>
        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>
          به‌روزرسانی خودکار هر ۲۰ ثانیه — گردش‌کار: جدید → جمع‌آوری → پیک → تحویل (فاکتور هلو خودکار)
        </p>
      </div>

      {toast && <div className="ops-toast">{toast}</div>}
      {error && <div className="ops-error">{error}</div>}
      {loading && <p>در حال بارگذاری…</p>}
      {!loading && orders.length === 0 && <p className="ops-empty">فعلاً سفارش آنلاینی نیست — سفارش‌های جدید اینجا با اعلان زنده ظاهر می‌شوند.</p>}

      <div className="ops-lanes">
        {LANES.map((l) => (
          <section key={l.key} className="ops-lane">
            <h2 style={{ color: l.color }}>{l.title} <bdi>({fa(lane(l).length)})</bdi></h2>
            {lane(l).map((o) => (
              <article key={o.id} className="ops-card" data-busy={busyId === o.id}>
                <header>
                  <strong>{o.code}</strong>
                  <span className="ops-status" style={{ background: l.color + '18', color: l.color }}>{o.statusFa}</span>
                  <span className="ops-pay">{o.payMethod === 'COD' ? '💵 پرداخت در محل' : '💳 پرداخت آنلاین'}</span>
                  <time>{jdate(o.createdAt)}</time>
                </header>
                <div className="ops-grid">
                  <div>
                    <p>👤 <b>{o.address.receiver || o.customer.name || 'مشتری'}</b> — <bdi><a href={`tel:${o.address.phone || o.customer.phone}`}>{o.address.phone || o.customer.phone}</a></bdi></p>
                    <p>📍 {o.address.city || 'رفسنجان'} — {o.address.address}{o.address.note ? ` (${o.address.note})` : ''}</p>
                    <p>🕒 تحویل: <bdi>{o.slotDate} — {o.slotFrom} تا {o.slotTo}</bdi></p>
                    {o.note && <p className="ops-note">📝 {o.note}</p>}
                  </div>
                  <div className="ops-items">
                    <ul>
                      {o.items.map((i) => (
                        <li key={i.id}><bdi>{i.qty}</bdi> × {i.name} <span className="ops-price"><bdi>{money(i.lineTotal)}</bdi></span></li>
                      ))}
                    </ul>
                    <p className="ops-total">
                      اقلام: <bdi>{money(o.itemsTotal)}</bdi> · ارسال: <bdi>{o.deliveryFee ? money(o.deliveryFee) : 'رایگان'}</bdi> ·
                      جمع: <bdi><b>{money(o.total)}</b></bdi>
                    </p>
                  </div>
                </div>
                {o.pickerName && <p className="ops-meta">جمع‌آوری: {o.pickerName}{o.pickedAt ? ` (${jdate(o.pickedAt)})` : ''}</p>}
                {o.delivererName && <p className="ops-meta">پیک: {o.delivererName}</p>}
                {o.holooInvoiceNo && <p className="ops-meta ops-ok">فاکتور هلو: <bdi>{o.holooInvoiceNo}</bdi></p>}
                {o.holooError && <p className="ops-meta ops-bad">خطای هلو: {o.holooError} — بعد از رفع، «تلاش دوبارهٔ هلو» را بزنید</p>}
                {o.cancelReason && <p className="ops-meta ops-bad">علت لغو: {o.cancelReason}</p>}

                <footer className="ops-actions">
                  {['COD', 'PAID'].includes(o.status) && (
                    <>
                      <button disabled={busyId === o.id} onClick={() => act(o, 'start-pick')}>🧺 شروع جمع‌آوری</button>
                      <button className="danger" disabled={busyId === o.id} onClick={() => { setCancelFor(o); setCancelReason('') }}>✖ لغو</button>
                    </>
                  )}
                  {o.status === 'PICKING' && (
                    <>
                      <button disabled={busyId === o.id || !!o.pickedAt} onClick={() => act(o, 'picked')}>{o.pickedAt ? '✓ جمع‌آوری کامل شد' : '✔ پایان جمع‌آوری'}</button>
                      <button disabled={busyId === o.id || !o.pickedAt} onClick={() => { setCourierFor(o); setCourierName(''); setCourierPhone('') }}>🛵 ارسال با پیک…</button>
                    </>
                  )}
                  {o.status === 'DELIVERING' && (
                    <button className="primary" disabled={busyId === o.id} onClick={() => act(o, 'deliver')}>✅ تحویل شد (فاکتور هلو خودکار)</button>
                  )}
                  {o.status === 'DELIVERED' && o.holooError && (
                    <button disabled={busyId === o.id} onClick={() => act(o, 'retry-holoo')}>↻ تلاش دوبارهٔ هلو</button>
                  )}
                  {o.status === 'AWAITING_PAYMENT' && <span className="ops-wait">در انتظار پرداخت مشتری — اگر پرداخت نشود خودکار لغو نمی‌شود؛ بعد از تماس می‌توانید لغو کنید</span>}
                </footer>
              </article>
            ))}
          </section>
        ))}
      </div>

      {courierFor && (
        <div className="ops-modal" onClick={() => setCourierFor(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <h3>ارسال سفارش {courierFor.code} با پیک</h3>
            <label>نام پیک / تحویل‌دهنده <span>*</span>
              <input value={courierName} onChange={(e) => setCourierName(e.target.value)} placeholder="مثلاً آقای رضایی" />
            </label>
            <label>موبایل پیک (اختیاری)
              <input value={courierPhone} onChange={(e) => setCourierPhone(e.target.value)} placeholder="09…" dir="ltr" />
            </label>
            <div className="ops-modal-actions">
              <button className="primary" disabled={!courierName.trim()} onClick={async () => {
                await act(courierFor, 'start-deliver', { delivererName: courierName, delivererPhone: courierPhone })
                setCourierFor(null)
              }}>ثبت و ارسال</button>
              <button onClick={() => setCourierFor(null)}>انصراف</button>
            </div>
          </div>
        </div>
      )}

      {cancelFor && (
        <div className="ops-modal" onClick={() => setCancelFor(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <h3>لغو سفارش {cancelFor.code}</h3>
            <label>علت لغو (برای مشتری پیامک می‌شود)
              <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="مثلاً کالای درخشتی تمام شد" />
            </label>
            <div className="ops-modal-actions">
              <button className="danger" onClick={async () => {
                await act(cancelFor, 'cancel', { reason: cancelReason })
                setCancelFor(null)
              }}>لغو سفارش</button>
              <button onClick={() => setCancelFor(null)}>انصراف</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

const css = `
.ops-head { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; background:linear-gradient(135deg,#14311f,#0e7a4a); color:#fff; border-radius:14px; padding:14px 18px; margin-bottom:14px }
.ops-head h1 { margin:0; font-size:20px } .ops-head p { margin:4px 0 0; font-size:13px; opacity:.9 }
.ops-badges { display:flex; gap:8px; flex-wrap:wrap } .ops-badge { background:#ffffff22; padding:4px 10px; border-radius:999px; font-size:13px }
.ops-lanes { display:grid; grid-template-columns:repeat(auto-fill,minmax(370px,1fr)); gap:14px; align-items:start }
.ops-lane h2 { font-size:15px; margin:4px 2px 8px }
.ops-card { background:#fff; border:1px solid #e4e7e1; border-radius:12px; padding:12px 14px; margin-bottom:10px; box-shadow:0 1px 2px #0e7a4a0d; transition:opacity .2s }
.ops-card[data-busy="true"] { opacity:.55 }
.ops-card header { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px }
.ops-card header strong { font-size:15px } .ops-card time { color:#94a3b8; font-size:12px; margin-inline-start:auto }
.ops-status { padding:2px 8px; border-radius:999px; font-size:12px } .ops-pay { font-size:12px; color:#475569 }
.ops-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px }
.ops-grid p { margin:3px 0; font-size:13px }
.ops-note { color:#b45309 }
.ops-items ul { margin:0; padding-inline-start:16px; font-size:13px } .ops-items li { margin:2px 0 }
.ops-price { color:#64748b; font-size:12px; margin-inline-start:6px }
.ops-total { border-top:1px dashed #e2e8f0; margin-top:6px; padding-top:6px; font-size:13px }
.ops-meta { font-size:12.5px; color:#475569; margin:6px 0 0 }
.ops-ok { color:#0e7a4a } .ops-bad { color:#b91c1c } .ops-wait { color:#92400e; font-size:12.5px }
.ops-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px }
.ops-actions button { border:1px solid #cbd5e1; background:#f8fafc; border-radius:8px; padding:7px 12px; font-family:inherit; font-size:13px; cursor:pointer }
.ops-actions button:hover:not(:disabled) { background:#eef2ee }
.ops-actions button.primary { background:#0e7a4a; border-color:#0e7a4a; color:#fff }
.ops-actions button.danger { background:#fff; border-color:#fca5a5; color:#b91c1c }
.ops-actions button:disabled { opacity:.5; cursor:not-allowed }
.ops-empty { text-align:center; color:#64748b; padding:30px }
.ops-toast { position:fixed; bottom:18px; inset-inline-start:18px; background:#14311f; color:#fff; padding:10px 16px; border-radius:10px; font-size:14px; z-index:50; box-shadow:0 4px 14px #0003 }
.ops-error { background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; border-radius:10px; padding:8px 12px; margin-bottom:10px; font-size:13px }
.ops-modal { position:fixed; inset:0; background:#0007; display:flex; align-items:center; justify-content:center; z-index:40 }
.ops-modal > div { background:#fff; border-radius:14px; padding:18px 20px; width:min(92vw,380px) }
.ops-modal h3 { margin:0 0 10px } .ops-modal label { display:block; font-size:13px; margin-bottom:10px } .ops-modal label span { color:#b91c1c }
.ops-modal input { display:block; width:100%; margin-top:4px; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-family:inherit; font-size:14px; box-sizing:border-box }
.ops-modal-actions { display:flex; gap:8px; justify-content:flex-end }
.ops-modal-actions button { border:1px solid #cbd5e1; background:#f8fafc; border-radius:8px; padding:8px 14px; font-family:inherit; cursor:pointer }
.ops-modal-actions button.primary { background:#0e7a4a; color:#fff; border-color:#0e7a4a }
.ops-modal-actions button.danger { background:#b91c1c; color:#fff; border-color:#b91c1c }
@media (max-width:700px){ .ops-grid{grid-template-columns:1fr} .ops-lanes{grid-template-columns:1fr} }
`
