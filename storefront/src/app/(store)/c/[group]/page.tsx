import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiGet, type CatalogItem } from '@/lib/api'
import { faNum } from '@/lib/format'
import ProductCard from '@/components/ProductCard'

export const dynamic = 'force-dynamic'

const SORTS: { key: string; label: string }[] = [
  { key: 'popular', label: 'پرفروش‌ترین' },
  { key: 'cheap', label: 'ارزان‌ترین' },
  { key: 'expensive', label: 'گران‌ترین' },
  { key: 'discount', label: 'بیشترین تخفیف' },
]

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ group: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { group: rawGroup } = await params
  const group = decodeURIComponent(rawGroup)
  const sp = await searchParams
  const sort = typeof sp.sort === 'string' && SORTS.some((s) => s.key === sp.sort) ? sp.sort : 'popular'
  const page = Math.max(1, parseInt(typeof sp.page === 'string' ? sp.page : '1') || 1)
  const onlyAvail = sp.avail === '1'

  const res = await apiGet<{ items: CatalogItem[]; total: number }>(
    `/catalog?group=${encodeURIComponent(group)}&sort=${sort}&page=${page}&pageSize=24${onlyAvail ? '&avail=1' : ''}`,
    { revalidate: 30 },
  )
  if (!res.ok && res.status === 404) notFound()
  const items = res.data?.items || []
  const total = res.data?.total || 0
  const pages = Math.ceil(total / 24) || 1
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ sort, ...(onlyAvail ? { avail: '1' } : {}), ...over })
    return `/c/${encodeURIComponent(group)}?${p.toString()}`
  }

  return (
    <div className="container">
      <p className="crumbs">
        <Link href="/">خانه</Link> / <Link href="/categories">دسته‌بندی‌ها</Link> / {group}
      </p>
      <h1 style={{ fontSize: 21, margin: '4px 0 2px' }}>{group}</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 10px' }}>
        <bdi>{faNum(total)}</bdi> کالا
      </p>

      <nav className="cat-row" aria-label="مرتب‌سازی و فیلتر" style={{ marginBottom: 6 }}>
        {SORTS.map((s) => (
          <Link key={s.key} href={qs({ sort: s.key, page: '1' })} className="cat-chip" style={{ background: sort === s.key ? 'var(--olive-soft)' : undefined, borderColor: sort === s.key ? 'var(--olive-2)' : undefined, minWidth: 'auto', padding: '9px 16px', flexDirection: 'row', fontSize: 13.5 }}>
            {s.label}
          </Link>
        ))}
        <Link href={qs({ avail: onlyAvail ? '' : '1', page: '1' })} className="cat-chip" style={{ background: onlyAvail ? 'var(--olive-soft)' : undefined, borderColor: onlyAvail ? 'var(--olive-2)' : undefined, minWidth: 'auto', padding: '9px 16px', flexDirection: 'row', fontSize: 13.5 }}>
          فقط موجود
        </Link>
      </nav>

      {items.length ? (
        <div className="grid">
          {items.map((it) => (
            <ProductCard key={it.id} item={it} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <span className="e">🗂️</span>
          فعلاً کالایی در این دسته نیست
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
