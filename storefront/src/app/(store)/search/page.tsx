import Link from 'next/link'
import { apiGet, type CatalogItem, type GroupInfo } from '@/lib/api'
import { faNum } from '@/lib/format'
import ProductCard from '@/components/ProductCard'

export const dynamic = 'force-dynamic'

const SORTS: { key: string; label: string }[] = [
  { key: 'popular', label: 'پرفروش‌ترین' },
  { key: 'cheap', label: 'ارزان‌ترین' },
  { key: 'expensive', label: 'گران‌ترین' },
  { key: 'discount', label: 'بیشترین تخفیف' },
  { key: 'newest', label: 'جدیدترین' },
]

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''
  const sort = typeof sp.sort === 'string' && SORTS.some((s) => s.key === sp.sort) ? sp.sort : 'popular'
  const page = Math.max(1, parseInt(typeof sp.page === 'string' ? sp.page : '1') || 1)

  const res = await apiGet<{ items: CatalogItem[]; total: number; page: number; pageSize: number; groups?: GroupInfo[] }>(
    `/catalog?q=${encodeURIComponent(q)}&sort=${sort}&page=${page}&pageSize=24`,
    { revalidate: 30 },
  )
  const data = res.ok ? res.data : null
  const items = data?.items || []
  const total = data?.total || 0
  const pages = Math.ceil(total / 24)
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), sort, ...over })
    return `/search?${p.toString()}`
  }

  return (
    <div className="container">
      <h1 style={{ fontSize: 19, margin: '16px 0 2px' }}>
        {q ? <>نتیجهٔ جست‌وجوی «{q}»</> : sort === 'discount' ? '🔥 تخفیف‌دارها' : 'همهٔ کالاها'}
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 10px' }}>
        {total ? (
          <>
            <bdi>{faNum(total)}</bdi> کالا پیدا شد
          </>
        ) : res.error ? (
          res.error
        ) : (
          '—'
        )}
      </p>

      <nav className="cat-row" aria-label="مرتب‌سازی" style={{ marginBottom: 6 }}>
        {SORTS.map((s) => (
          <Link key={s.key} href={qs({ sort: s.key, page: '1' })} className="cat-chip" style={{ background: sort === s.key ? 'var(--olive-soft)' : undefined, borderColor: sort === s.key ? 'var(--olive-2)' : undefined, minWidth: 'auto', padding: '9px 16px', flexDirection: 'row', fontSize: 13.5 }}>
            {s.label}
          </Link>
        ))}
      </nav>

      {items.length ? (
        <div className="grid">
          {items.map((it) => (
            <ProductCard key={it.id} item={it} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <span className="e">🔍</span>
          چیزی پیدا نشد{q ? <> برای «{q}»</> : null} — املای فارسی را ساده‌تر کنید یا از دسته‌ها بگردید
          <div style={{ marginTop: 10 }}>
            <Link href="/categories" className="btn ghost" style={{ display: 'inline-flex' }}>
              دسته‌بندی‌ها
            </Link>
          </div>
        </div>
      )}

      {pages > 1 ? (
        <nav style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '22px 0' }} aria-label="صفحه‌ها">
          {page > 1 ? (
            <Link className="btn ghost" href={qs({ page: String(page - 1) })} style={{ minHeight: 40, padding: '6px 18px' }}>
              → قبل
            </Link>
          ) : null}
          <span style={{ alignSelf: 'center', fontSize: 13.5, color: 'var(--muted)' }}>
            صفحهٔ <bdi>{faNum(page)}</bdi> از <bdi>{faNum(pages)}</bdi>
          </span>
          {page < pages ? (
            <Link className="btn ghost" href={qs({ page: String(page + 1) })} style={{ minHeight: 40, padding: '6px 18px' }}>
              بعد ←
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  )
}
