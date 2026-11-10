'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function BottomNav() {
  const pathname = usePathname()
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch('/api/shop/basket', { credentials: 'same-origin' })
        const j = await r.json()
        if (alive && j.ok) setCount(j.data.count || 0)
      } catch { /* آفلاین */ }
    }
    load()
    const h = () => load()
    window.addEventListener('hz-cart-changed', h)
    return () => {
      alive = false
      window.removeEventListener('hz-cart-changed', h)
    }
  }, [pathname])

  const on = (p: string) => (p === '/' ? pathname === '/' : pathname.startsWith(p))

  return (
    <nav className="bottom-nav" aria-label="ناوبری اصلی">
      <Link href="/" className={on('/') ? 'on' : ''}>
        <span className="ico" aria-hidden>🏠</span>
        خانه
      </Link>
      <Link href="/categories" className={on('/categories') ? 'on' : ''}>
        <span className="ico" aria-hidden>🗂️</span>
        دسته‌ها
      </Link>
      <Link href="/cart" className={on('/cart') ? 'on' : ''} style={{ position: 'relative' }}>
        <span className="ico" aria-hidden>🧺</span>
        سبد
        {count > 0 ? (
          <span className="badge-dot" style={{ top: 0, insetInlineStart: '62%' }}>
            <bdi>{count.toLocaleString('fa-IR')}</bdi>
          </span>
        ) : null}
      </Link>
      <Link href="/orders" className={on('/orders') ? 'on' : ''}>
        <span className="ico" aria-hidden>📋</span>
        سفارش‌ها
      </Link>
      <Link href="/account" className={on('/account') ? 'on' : ''}>
        <span className="ico" aria-hidden>👤</span>
        حساب
      </Link>
    </nav>
  )
}
