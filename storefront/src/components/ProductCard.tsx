'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cfetch, cartChanged, toast } from '@/lib/client'
import { faNum } from '@/lib/format'

export interface CardItem {
  id: string
  name: string
  unit?: string
  price: number
  printedPrice?: number
  discountPct?: number
  available?: number
  image?: string | null
  sold?: number
}

/** کنترل افزودن/تعداد — دکمهٔ «افزودن» تبدیل به استپر می‌شود (الگوی اسنپ‌مارکت/اوکالا) */
export function AddControl({ item, big = false }: { item: CardItem; big?: boolean }) {
  const [qty, setQty] = useState(0)
  const [busy, setBusy] = useState(false)
  const available = item.available ?? 1
  const out = available <= 0

  const set = async (next: number) => {
    if (busy) return
    setBusy(true)
    const prev = qty
    setQty(next)
    const res = await cfetch<{ count: number; trimmedTo?: number; available?: number }>('/basket', 'POST', { productId: item.id, qty: next })
    if (!res.ok) {
      setQty(prev)
      toast(res.error || 'افزودن به سبد ناموفق بود')
    } else {
      if (res.data?.trimmedTo !== undefined && res.data.trimmedTo < next) {
        setQty(res.data.trimmedTo)
        toast(`فقط ${faNum(res.data.trimmedTo)} عدد از «${item.name}» موجود است`)
      }
      cartChanged()
      if (next === 0) toast('از سبد حذف شد')
    }
    setBusy(false)
  }

  if (out) {
    return (
      <button className="add-btn" disabled>
        ناموجود
      </button>
    )
  }
  if (qty === 0) {
    return (
      <button className="add-btn" onClick={() => set(1)} disabled={busy} style={big ? { height: 50, fontSize: 15 } : undefined}>
        + افزودن به سبد
      </button>
    )
  }
  return (
    <div className="qty-stepper" style={big ? { height: 50 } : undefined} aria-label="تعداد در سبد">
      <button onClick={() => set(qty - 1)} aria-label="کم کردن" disabled={busy}>
        −
      </button>
      <span className="q">
        <bdi>{faNum(qty)}</bdi>
      </span>
      <button onClick={() => set(qty + 1)} aria-label="زیاد کردن" disabled={busy || qty >= available}>
        +
      </button>
    </div>
  )
}

/** کارت کالا — عکس با fallback، قیمت با لنگر واقعی، کمبودی صادقانه */
export default function ProductCard({ item }: { item: CardItem }) {
  const d = item.discountPct || 0
  const low = (item.available ?? 1) > 0 && (item.available ?? 0) <= 3
  return (
    <article className="pcard">
      <Link href={`/p/${item.id}`} className="imgbox" aria-label={item.name}>
        {d >= 5 ? <span className="off-badge">٪{faNum(d)} تخفیف</span> : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.image || '/img/placeholder.svg'} alt={item.name} loading="lazy" referrerPolicy="no-referrer" width={200} height={200} />
      </Link>
      <div className="body">
        <Link href={`/p/${item.id}`} className="name">
          {item.name}
        </Link>
        <div className="price-row">
          <span className="price">
            <bdi>{faNum(item.price)}</bdi> <small>ریال</small>
          </span>
          {d >= 5 && item.printedPrice ? <span className="anchor">{faNum(item.printedPrice)}</span> : null}
          {item.unit ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>هر {item.unit}</span> : null}
        </div>
        {low ? <span className="lowstock">تنها <bdi>{faNum(item.available || 0)}</bdi> عدد مانده</span> : null}
        <AddControl item={item} />
      </div>
    </article>
  )
}
