import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiGet, type ProductDetail } from '@/lib/api'
import { faNum } from '@/lib/format'
import ProductCard from '@/components/ProductCard'
import PdpBuy from './PdpBuy'
import Gallery from './Gallery'

export const revalidate = 30

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const res = await apiGet<ProductDetail>(`/product/${encodeURIComponent(id)}`, { revalidate: 30 })
  if (!res.ok || !res.data) notFound()
  const p = res.data

  return (
    <div className="container">
      <p className="crumbs">
        <Link href="/">خانه</Link> / <Link href="/categories">دسته‌بندی‌ها</Link>
        {p.group ? (
          <>
            {' / '}
            <Link href={`/c/${encodeURIComponent(p.group)}`}>{p.group}</Link>
          </>
        ) : null}
        {p.subGroup ? ` / ${p.subGroup}` : ''}
      </p>

      <div className="pdp">
        <div className="bigimg">
          {p.discountPct >= 5 ? <span className="off-badge" style={{ position: 'absolute', top: 10, insetInlineStart: 10, zIndex: 2 }}>٪{faNum(p.discountPct)} تخفیف</span> : null}
          <Gallery
            images={[...(p.gallery && p.gallery.length ? p.gallery : []), ...(p.image && !(p.gallery || []).some((g) => g.url === p.image) ? [{ url: p.image, caption: '' }] : [])]}
            alt={p.name}
          />
        </div>

        <div>
          <h1>{p.name}</h1>
          <p className="unit">
            واحد فروش: {p.unit}
            {p.imported ? ' · کالای وارداتی' : ' · کالای ایرانی'}
          </p>

          <div className="price-row" style={{ margin: '14px 0 4px' }}>
            <span className="price-big">
              <bdi>{faNum(p.price)}</bdi> <small>ریال</small>
            </span>
            {p.discountPct >= 5 && p.printedPrice > p.price ? (
              <span className="anchor" style={{ fontSize: 15 }}>
                {faNum(p.printedPrice)} ریال
              </span>
            ) : null}
          </div>

          <div className="guarantee">
            <span>🌿 ضمانت تازگی</span>
            <span>↩️ مرجوعی تا ۲۴ ساعت</span>
            <span>✅ کالای اصل هایپر زیتون</span>
          </div>

          <PdpBuy id={p.id} name={p.name} price={p.price} printedPrice={p.printedPrice} discountPct={p.discountPct} available={p.available} />

          <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 14 }}>
            ارسال درون‌شهری رفسنجان با پرداخت در محل یا آنلاین — بازهٔ تحویل را هنگام ثبت سفارش انتخاب می‌کنید.
          </p>
        </div>
      </div>

      {p.related.length ? (
        <section>
          <div className="rail-head">
            <h2>کالاهای مرتبط</h2>
          </div>
          <div className="rail">
            {p.related.map((it) => (
              <ProductCard key={it.id} item={it} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
