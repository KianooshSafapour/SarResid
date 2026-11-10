'use client'

import { useEffect, useState } from 'react'
import ProductCard, { type CardItem } from './ProductCard'

/** «بازدیدهای اخیر» — ذخیرهٔ محلی، بدون نیاز به ورود */
export function RecentRail() {
  const [items, setItems] = useState<CardItem[] | null>(null)
  useEffect(() => {
    try {
      const ids: string[] = JSON.parse(localStorage.getItem('hz-recent') || '[]').slice(0, 10)
      if (!ids.length) {
        setItems([])
        return
      }
      fetch(`/api/shop/catalog?ids=${ids.join(',')}`, { credentials: 'same-origin' })
        .then((r) => r.json())
        .then(async (j) => {
          if (j?.ok) {
            // ترتیب بر اساس آخرین بازدید
            const byId = new Map<string, CardItem & { available?: number; sold?: number; unit?: string }>(j.data.items.map((i: CardItem) => [i.id, i]))
            setItems(ids.flatMap((id) => { const it = byId.get(id); return it ? [it] : [] }))
          } else setItems([])
        })
        .catch(() => setItems([]))
    } catch {
      setItems([])
    }
  }, [])
  if (!items || items.length < 2) return null
  return (
    <section>
      <div className="rail-head">
        <h2>بازدیدهای اخیر شما</h2>
      </div>
      <div className="rail">
        {items.map((it) => (
          <ProductCard key={it.id} item={it} />
        ))}
      </div>
    </section>
  )
}

export function rememberViewed(id: string) {
  try {
    const cur: string[] = JSON.parse(localStorage.getItem('hz-recent') || '[]')
    const next = [id, ...cur.filter((x) => x !== id)].slice(0, 12)
    localStorage.setItem('hz-recent', JSON.stringify(next))
  } catch { /* private mode */ }
}
