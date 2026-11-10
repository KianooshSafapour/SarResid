'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cfetch } from '@/lib/client'
import { faMoney, faDateTime, faJalaliShort } from '@/lib/format'
import type { MyOrder } from '@/lib/api'

const STATUS_FA: Record<string, { fa: string; e: string }> = {
  AWAITING_PAYMENT: { fa: 'در انتظار پرداخت', e: '⏳' },
  PAID: { fa: 'پرداخت‌شده', e: '💳' },
  COD: { fa: 'پرداخت در محل', e: '💵' },
  PICKING: { fa: 'در حال جمع‌آوری', e: '🧺' },
  DELIVERING: { fa: 'در مسیر تحویل', e: '🛵' },
  DELIVERED: { fa: 'تحویل‌شده', e: '✅' },
  INVOICED: { fa: 'تسویه‌شده', e: '📑' },
  CANCELLED: { fa: 'لغو شده', e: '✖️' },
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<MyOrder[] | null>(null)
  const [needLogin, setNeedLogin] = useState(false)

  useEffect(() => {
    cfetch<{ orders: MyOrder[] }>('/orders').then((res) => {
      if (res.status === 401) setNeedLogin(true)
      else if (res.ok) setOrders(res.data!.orders)
      else setOrders([])
    })
  }, [])

  if (needLogin) {
    return (
      <div className="container">
        <div className="empty">
          <span className="e">🔑</span>
          برای دیدن سفارش‌ها وارد شوید
          <div style={{ marginTop: 12 }}>
            <Link href="/login?next=/orders" className="btn primary" style={{ display: 'inline-flex' }}>
              ورود با موبایل
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 20, margin: '16px 0 12px' }}>📋 سفارش‌های من</h1>
      {orders === null ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : orders.length === 0 ? (
        <div className="empty">
          <span className="e">🧺</span>
          هنوز سفارشی ثبت نکرده‌اید
          <div style={{ marginTop: 12 }}>
            <Link href="/categories" className="btn primary" style={{ display: 'inline-flex' }}>
              شروع خرید
            </Link>
          </div>
        </div>
      ) : (
        orders.map((o) => {
          const st = STATUS_FA[o.status] || { fa: o.status, e: '📦' }
          return (
            <Link key={o.id} href={`/orders/${o.id}`} className="order-card" style={{ display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <b>
                  <bdi>{o.code}</bdi>
                </b>
                <span className="status-pill">
                  {st.e} {st.fa}
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0' }}>
                {faDateTime(o.createdAt)}
                {o.slotDate ? ` · تحویل: ${faJalaliShort(o.slotDate)} ساعت ${o.slotFrom}–${o.slotTo}` : ''}
              </p>
              <p style={{ margin: 0, fontSize: 13.5 }}>
                <bdi>{faMoney(o.total)}</bdi> · {o.payMethod === 'COD' ? 'پرداخت در محل' : 'آنلاین'}
              </p>
            </Link>
          )
        })
      )}
    </div>
  )
}
