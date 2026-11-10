'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cfetch, cartChanged, toast } from '@/lib/client'
import { faNum } from '@/lib/format'

interface LastOrderItem { id: string; productId: string; name: string; qty: number; unit: string; unitPrice: number }

/** «خرید مجدد سفارش قبلی» — برای مشتری واردشده؛ تک‌دکمه‌ای (پژوهش: شخصی‌سازی/ری‌آردر) */
export default function ReorderRail() {
  const [order, setOrder] = useState<{ code: string; items: LastOrderItem[] } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    cfetch<{ orders: { code: string; items?: LastOrderItem[]; itemsCount?: number }[] }>('/orders')
      .then((res) => {
        if (res.ok && res.data?.orders?.length) {
          const last = res.data.orders[0]
          if (last.items?.length) setOrder({ code: last.code, items: last.items })
        }
      })
      .catch(() => null)
  }, [])

  if (!order) return null

  const addAll = async () => {
    if (busy) return
    setBusy(true)
    let fail = 0
    for (const it of order.items.slice(0, 20)) {
      const r = await cfetch('/basket', 'POST', { productId: it.productId, qty: it.qty })
      if (!r.ok) fail++
    }
    cartChanged()
    toast(fail ? `${faNum(fail)} قلم از موجودی خارج شده بود` : `همهٔ اقلام سفارش ${order.code} به سبد اضافه شد`)
    setBusy(false)
  }

  return (
    <section>
      <div className="rail-head">
        <h2>خرید مجدد سفارش <bdi>{order.code}</bdi></h2>
        <a href="#" onClick={(e) => { e.preventDefault(); addAll() }} style={{ color: 'var(--gold-deep)', fontWeight: 700 }}>
          {busy ? 'در حال افزودن…' : 'افزودن همه به سبد ↺'}
        </a>
      </div>
      <div className="rail">
        {order.items.slice(0, 10).map((it) => (
          <Link key={it.id} href={`/p/${it.productId}`} className="pcard" style={{ padding: 12 }}>
            <span className="name" style={{ minHeight: '1.5em' }}>{it.name}</span>
            <span className="price" style={{ fontSize: 13 }}>
              <bdi>{faNum(it.unitPrice)}</bdi> <small>ریال</small> × <bdi>{faNum(it.qty)}</bdi>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
