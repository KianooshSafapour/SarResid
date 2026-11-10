'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface AcItem { id: string; name: string; price: number; image: string | null; available: number }

/** جست‌وجوی چسبان با اتوکامپلیت فارسی (بعد از ۲ نویسه؛ تحمل غلط املایی سمت سرور) */
export default function SearchBox({ initial = '' }: { initial?: string }) {
  const [q, setQ] = useState(initial)
  const [items, setItems] = useState<AcItem[] | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const t = q.trim()
    if (t.length < 2) {
      setItems(null)
      setOpen(false)
      return
    }
    setLoading(true)
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/shop/catalog?q=${encodeURIComponent(t)}&pageSize=6&sort=popular`, { credentials: 'same-origin' })
      const j = await res.json().catch(() => null)
      if (j?.ok) {
        setItems(j.data.items)
        setOpen(true)
      }
      setLoading(false)
    }, 280)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [q])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  const go = () => {
    const t = q.trim()
    if (t) router.push(`/search?q=${encodeURIComponent(t)}`)
    setOpen(false)
  }

  return (
    <div className="header-search" ref={boxRef}>
      <div className="search-box">
        <span aria-hidden>🔍</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go()}
          onFocus={() => items && items.length && setOpen(true)}
          placeholder="جست‌وجو در هایپر زیتون… (مثلاً: روغن زیتون)"
          enterKeyHint="search"
          aria-label="جست‌وجوی کالا"
        />
        {q ? (
          <button className="go" onClick={go} aria-label="جست‌وجو">
            بگرد
          </button>
        ) : null}
      </div>
      {open && items ? (
        <div className="ac-panel">
          {loading && !items.length ? <div className="ac-item">…</div> : null}
          {items.map((it) => (
            <Link key={it.id} className="ac-item" href={`/p/${it.id}`} onClick={() => setOpen(false)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.image || '/img/placeholder.svg'} alt="" loading="lazy" referrerPolicy="no-referrer" />
              <span className="n">{it.name}</span>
              <span className="p">
                <bdi>{it.price.toLocaleString('fa-IR')}</bdi> ریال
              </span>
            </Link>
          ))}
          {!loading && !items.length ? (
            <div className="ac-item">
              <span className="n">چیزی پیدا نشد — املای کلمه را بررسی کنید یا از دسته‌ها بگردید</span>
            </div>
          ) : null}
          {items.length ? (
            <Link className="ac-item" href={`/search?q=${encodeURIComponent(q.trim())}`} onClick={() => setOpen(false)}>
              <span className="n" style={{ color: 'var(--olive-2)', fontWeight: 700 }}>
                دیدن همهٔ نتیجه‌های «{q.trim()}»
              </span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
