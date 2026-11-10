'use client'

import { useEffect, useState } from 'react'
import { AddControl } from '@/components/ProductCard'
import { rememberViewed } from '@/components/RecentRail'
import { faNum } from '@/lib/format'

/** بخش تعاملی PDP: ثبت بازدید + قیمت چسبان پایین + افزودن */
export default function PdpBuy({ id, name, price, printedPrice, discountPct, available }: {
  id: string
  name: string
  price: number
  printedPrice: number
  discountPct: number
  available: number
}) {
  const [showSticky, setShowSticky] = useState(false)

  useEffect(() => {
    rememberViewed(id)
    const el = document.getElementById('buy-box')
    if (!el) return
    const io = new IntersectionObserver(([e]) => setShowSticky(!e.isIntersecting), { rootMargin: '-80px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [id])

  const out = available <= 0
  const low = !out && available <= 3

  return (
    <>
      <div id="buy-box">
        {out ? <div className="oos" style={{ marginTop: 8 }}>فعلاً ناموجود — به‌زودی دوباره موجود می‌شود</div> : null}
        {low ? (
          <p className="lowstock" style={{ margin: '8px 0 0' }}>
            ⚡ فقط <bdi>{faNum(available)}</bdi> عدد از این کالا مانده است
          </p>
        ) : null}
        <div style={{ marginTop: 14, maxWidth: 340 }}>
          <AddControl big item={{ id, name, price, printedPrice, discountPct, available }} />
        </div>
      </div>

      <div className={`sticky-buy ${showSticky ? 'show' : ''}`} aria-hidden={!showSticky}>
        <div className="in">
          <span className="pr">
            <bdi>{faNum(price)}</bdi> ریال
          </span>
          <div style={{ minWidth: 170 }}>
            <AddControl item={{ id, name, price, printedPrice, discountPct, available }} />
          </div>
        </div>
      </div>
    </>
  )
}
