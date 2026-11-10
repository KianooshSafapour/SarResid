'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import SearchBox from './SearchBox'

function useCartCount() {
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
  }, [])
  return count
}

export default function Header({ hotline }: { hotline: string }) {
  const count = useCartCount()
  const pathname = usePathname()
  const [me, setMe] = useState<{ name: string } | null>(null)
  useEffect(() => {
    fetch('/api/shop/auth/me', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => setMe(j?.ok ? { name: j.data.name || j.data.phone } : null))
      .catch(() => setMe(null))
  }, [pathname])

  return (
    <header className="site-header">
      <div className="container header-row">
        <Link href="/" className="brand" aria-label="خانهٔ هایپر زیتون">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="لوگوی هایپر زیتون" width={38} height={38} />
          <span>
            هایپر زیتون
            <small>فروشگاه آنلاین رفسنجان</small>
          </span>
        </Link>
        <SearchBox />
        <nav className="header-icons" aria-label="حساب و سبد">
          <Link className="icon-btn" href={me ? '/account' : '/login'} title={me ? me.name : 'ورود / ثبت‌نام'}>
            <span className="ico" aria-hidden>
              {me ? '👤' : '🔑'}
            </span>
            {me ? 'حساب من' : 'ورود'}
          </Link>
          <Link className="icon-btn" href="/cart" title="سبد خرید">
            <span className="ico" aria-hidden>
              🧺
            </span>
            سبد
            {count > 0 ? (
              <span className="badge-dot">
                <bdi>{count.toLocaleString('fa-IR')}</bdi>
              </span>
            ) : null}
          </Link>
        </nav>
      </div>
    </header>
  )
}
