'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { cfetch, cartChanged, toast } from '@/lib/client'
import { faMoney, faDateTime, faJalaliShort } from '@/lib/format'

interface Detail {
  id: string
  code: string
  status: string
  statusFa: string
  payMethod: string
  paidAt: string | null
  total: number
  itemsTotal: number
  deliveryFee: number
  slotDate: string | null
  slotFrom: string | null
  slotTo: string | null
  address: { label?: string; receiver?: string; phone?: string; city?: string; address?: string }
  note: string | null
  cancelReason: string | null
  createdAt: string
  deliveredAt: string | null
  cancelledAt: string | null
  items: { id: string; productId: string; name: string; unit: string; qty: number; unitPrice: number; lineTotal: number }[]
  history: { at: string; by: string; action: string; detail?: string }[]
}

const FLOW = ['create', 'paid', 'start-pick', 'picked', 'start-deliver', 'deliver', 'holoo-invoice']
const STEP_FA: Record<string, string> = {
  create: 'ثبت سفارش', paid: 'پرداخت', 'start-pick': 'شروع جمع‌آوری', picked: 'جمع‌آوری کامل',
  'start-deliver': 'ارسال با پیک', deliver: 'تحویل شد', 'holoo-invoice': 'صدور فاکتور',
  'customer-cancel': 'لغو سفارش', 'payment-failed': 'پرداخت ناموفق', cancel: 'لغو توسط فروشگاه',
}

function OrderDetailInner() {
  const { id } = useParams<{ id: string }>()
  const search = useSearchParams()
  const isNew = search.get('new') === '1'
  const [order, setOrder] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await cfetch<Detail>(`/orders/${id}`)
    if (res.ok) setOrder(res.data!)
    else setError(res.error || 'سفارش پیدا نشد')
  }, [id])

  useEffect(() => {
    load()
    const t = setInterval(load, 25000) // ردیابی زنده تا تحویل
    return () => clearInterval(t)
  }, [load])

  const cancel = async () => {
    if (!confirm('سفارش لغو شود؟')) return
    setBusy(true)
    const res = await cfetch(`/orders/${id}/cancel`, 'POST')
    setBusy(false)
    toast(res.ok ? 'سفارش لغو شد' : res.error || 'لغو ناموفق')
    load()
  }

  const reorder = async () => {
    if (!order) return
    setBusy(true)
    let fail = 0
    for (const it of order.items) {
      const r = await cfetch('/basket', 'POST', { productId: it.productId, qty: it.qty })
      if (!r.ok) fail++
    }
    cartChanged()
    toast(fail ? `${fail} قلم دیگر موجود نبود` : 'همهٔ اقلام به سبد اضافه شد')
    setBusy(false)
  }

  if (error) {
    return (
      <div className="container">
        <div className="empty">
          <span className="e">🔎</span>
          {error}
        </div>
      </div>
    )
  }
  if (!order) {
    return (
      <div className="container">
        <div className="skeleton" style={{ height: 220, marginTop: 16 }} />
      </div>
    )
  }

  const doneActions = new Set(order.history.map((h) => h.action))
  const canCancel = ['COD', 'PAID', 'AWAITING_PAYMENT'].includes(order.status)

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      {isNew ? (
        <div className="ok-text" style={{ background: 'var(--olive-soft)', borderRadius: 14, padding: '14px 16px', margin: '16px 0 0', fontSize: 14.5 }}>
          🎉 سفارش شما ثبت شد! کد پیگیری: <b>
            <bdi>{order.code}</bdi>
          </b>{' '}
          — وضعیت را همین‌جا و با پیامک دنبال کنید.
        </div>
      ) : null}

      <div className="order-card" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>
            سفارش <bdi>{order.code}</bdi>
          </h1>
          <span className="status-pill">{order.statusFa}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 0' }}>
          ثبت: {faDateTime(order.createdAt)}
          {order.slotDate ? ` · تحویل: ${faJalaliShort(order.slotDate)} ساعت ${order.slotFrom}–${order.slotTo}` : ''}
        </p>
        {order.cancelReason ? <p className="error-text">علت لغو: {order.cancelReason}</p> : null}

        {/* خط زمان وضعیت */}
        <ul className="timeline">
          {FLOW.filter((a) => a !== 'paid' || order.payMethod === 'GATEWAY').map((a) => {
            const hit = order.history.find((h) => h.action === a)
            if (!hit && a === 'holoo-invoice') return null
            return (
              <li key={a} className={hit ? 'on' : ''}>
                {STEP_FA[a] || a}
                {hit ? <span style={{ fontSize: 11.5, color: 'var(--muted)', marginInlineStart: 8 }}>{faDateTime(hit.at)}</span> : null}
              </li>
            )
          })}
          {order.history.filter((h) => h.action.includes('cancel') || h.action === 'payment-failed').map((h) => (
            <li key={h.at} className="on" style={{ color: 'var(--red)' }}>
              {STEP_FA[h.action] || h.action}
            </li>
          ))}
        </ul>

        <h3 style={{ fontSize: 14.5, margin: '10px 0 6px' }}>اقلام</h3>
        {order.items.map((it) => (
          <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '4px 0' }}>
            <span>
              <bdi>{it.qty}</bdi> × {it.name}
            </span>
            <bdi>{faMoney(it.lineTotal)}</bdi>
          </div>
        ))}
        <div className="summary" style={{ position: 'static', marginTop: 10 }}>
          <div className="row">
            <span>اقلام</span>
            <bdi>{faMoney(order.itemsTotal)}</bdi>
          </div>
          <div className="row">
            <span>ارسال</span>
            <bdi>{order.deliveryFee ? faMoney(order.deliveryFee) : 'رایگان'}</bdi>
          </div>
          <div className="row total">
            <span>جمع</span>
            <bdi>{faMoney(order.total)}</bdi>
          </div>
        </div>

        <h3 style={{ fontSize: 14.5, margin: '14px 0 4px' }}>تحویل به</h3>
        <p style={{ fontSize: 13.5, margin: 0 }}>
          {order.address.receiver} — <bdi dir="ltr">{order.address.phone}</bdi>
          <br />
          {order.address.city} — {order.address.address}
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {canCancel ? (
            <button className="btn red" onClick={cancel} disabled={busy}>
              لغو سفارش
            </button>
          ) : null}
          <button className="btn ghost" onClick={reorder} disabled={busy}>
            خرید مجدد این اقلام ↺
          </button>
          <Link href="/" className="btn ghost">
            ادامهٔ خرید
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<div className="container"><div className="skeleton" style={{ height: 260, marginTop: 16 }} /></div>}>
      <OrderDetailInner />
    </Suspense>
  )
}
