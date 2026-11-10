'use client'

import { useCallback, useEffect, useState } from 'react'

interface Media { id: string; url: string; isPrimary: boolean }
interface Product {
  id: string; name: string; rawName: string; barcode: string | null; group: string | null; subGroup: string | null
  price: number; stock: number; active: boolean; media: Media[]; legacyImage: string | null
}
interface ImgResult { url: string; caption: string; source: string }
const fa = (n: number) => (n || 0).toLocaleString('fa-IR')

/** جای‌نگهدار SVG (دایرهٔ طلایی روی کرم) */
const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%23f0efe6'/%3E%3Ccircle cx='40' cy='40' r='22' fill='none' stroke='%23c8a24a' stroke-width='3'/%3E%3C/svg%3E"

export default function ProductsClient() {
  const [q, setQ] = useState('')
  const [products, setProducts] = useState<Product[] | null>(null)
  const [selected, setSelected] = useState<Product | null>(null)
  const [results, setResults] = useState<ImgResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState('')
  const [manualUrl, setManualUrl] = useState('')

  const say = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 4000)
  }

  const search = useCallback(async (query: string) => {
    setProducts(null)
    const r = await fetch(`/api/shop-admin/products?q=${encodeURIComponent(query)}`, { cache: 'no-store' })
    const j = await r.json()
    if (j.ok) setProducts(j.data.products)
    else { say(j.error || 'جست‌وجو ناموفق'); setProducts([]) }
  }, [])

  useEffect(() => {
    search('')
  }, [search])

  const open = (p: Product) => {
    setSelected(p)
    setResults(null)
    setPicked(new Set())
    webSearch(p.rawName)
  }

  const webSearch = async (query?: string) => {
    if (!selected && !query) return
    setSearching(true)
    setResults(null)
    const r = await fetch('/api/shop-admin/products/image-search', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(query ? { query } : { productId: selected!.id }),
    })
    const j = await r.json()
    setSearching(false)
    if (j.ok) setResults(j.data.results)
    else say(j.error || 'جست‌وجوی تصویر ناموفق (کلید z.ai را در دستیار هوشمند تنظیم کنید)')
  }

  const refreshSelected = async () => {
    if (!selected) return
    const r = await fetch(`/api/shop-admin/products?q=${encodeURIComponent(selected.rawName)}`, { cache: 'no-store' })
    const j = await r.json()
    if (j.ok) {
      const fresh = (j.data.products as Product[]).find((x) => x.id === selected.id)
      if (fresh) setSelected(fresh)
      setProducts(j.data.products)
    }
  }

  const addPicked = async () => {
    if (!selected || !picked.size) return
    const r = await fetch('/api/shop-admin/products/media', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: selected.id, urls: [...picked].map((url) => ({ url, caption: results?.find((x) => x.url === url)?.caption || '' })), source: 'web-search' }),
    })
    const j = await r.json()
    say(j.ok ? `${fa(j.data.added)} تصویر اضافه شد ✓` : j.error || 'ناموفق')
    setPicked(new Set())
    refreshSelected()
  }

  const addManual = async () => {
    if (!selected || !/^https?:\/\//i.test(manualUrl)) { say('نشانی تصویر معتبر نیست'); return }
    const r = await fetch('/api/shop-admin/products/media', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: selected.id, urls: [{ url: manualUrl }], source: 'manual' }),
    })
    const j = await r.json()
    say(j.ok ? 'تصویر اضافه شد ✓' : j.error || 'ناموفق')
    setManualUrl('')
    refreshSelected()
  }

  const setPrimary = async (mediaId: string) => {
    const r = await fetch('/api/shop-admin/products/media', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mediaId, isPrimary: true }) })
    const j = await r.json()
    if (j.ok) { say('تصویر شاخس شد ✓'); refreshSelected() } else say(j.error || 'ناموفق')
  }

  const removeImg = async (mediaId: string) => {
    const r = await fetch(`/api/shop-admin/products/media?mediaId=${mediaId}`, { method: 'DELETE' })
    const j = await r.json()
    if (j.ok) { say('حذف شد'); refreshSelected() } else say(j.error || 'ناموفق')
  }

  return (
    <>
      <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>🖼️ کالاها و تصاویر</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>
        برای هر کالا چند تصویر از اینترنت جست‌وجو و انتخاب کنید — تصویرِ شاخص (primary) روی کارت و صفحهٔ کالا دیده می‌شود.
      </p>
      {toast && <div className="ops-toast">{toast}</div>}

      <div className="ops-card">
        <form onSubmit={(e) => { e.preventDefault(); search(q) }} style={{ display: 'flex', gap: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام یا بارکد کالا…" style={{ flex: 1, padding: '9px 13px', border: '1.5px solid var(--line)', borderRadius: 10, fontFamily: 'inherit', fontSize: 14 }} />
          <button className="ops-btn primary" type="submit">جست‌وجو</button>
        </form>
      </div>

      {products === null ? <div className="ops-skel" /> : products.length === 0 ? (
        <div className="ops-card ops-empty">کالایی پیدا نشد</div>
      ) : (
        <div className="ops-grid2">
          {products.slice(0, 24).map((p) => (
            <button key={p.id} className="ops-card" style={{ cursor: 'pointer', textAlign: 'start', border: selected?.id === p.id ? '2px solid var(--o-700)' : undefined }} onClick={() => open(p)}>
              <div style={{ display: 'flex', gap: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.media[0]?.url || p.legacyImage || PLACEHOLDER_IMG} alt="" width={54} height={54} style={{ borderRadius: 9, objectFit: 'cover', background: '#f0efe6' }} referrerPolicy="no-referrer" />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ fontSize: 13.5, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</b>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    {p.group || '—'} · موجودی {fa(p.stock)} · {fa(p.price)} ریال
                  </span>
                  <div style={{ fontSize: 11.5, color: p.media.length ? 'var(--o-700)' : 'var(--red)' }}>{p.media.length ? `${fa(p.media.length)} تصویر` : 'بدون تصویر'}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <div className="ops-card" style={{ position: 'sticky', bottom: 0, boxShadow: '0 -6px 24px #0002' }}>
          <h3 style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{selected.name}</span>
            <button className="ops-btn small" onClick={() => { setSelected(null); setResults(null) }}>بستن ✕</button>
          </h3>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {selected.media.map((m) => (
              <div key={m.id} style={{ position: 'relative', width: 84 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt="" width={84} height={84} style={{ borderRadius: 9, objectFit: 'cover', border: m.isPrimary ? '3px solid var(--gold)' : '1px solid var(--line)' }} referrerPolicy="no-referrer" />
                {m.isPrimary ? (
                  <span style={{ position: 'absolute', top: 3, insetInlineStart: 3, fontSize: 12 }}>⭐</span>
                ) : (
                  <button className="ops-btn small" style={{ position: 'absolute', bottom: 3, insetInlineStart: 3, padding: '1px 7px', minHeight: 22 }} onClick={() => setPrimary(m.id)} title="شاخص کن">⭐</button>
                )}
                <button className="ops-btn danger small" style={{ position: 'absolute', top: 3, insetInlineEnd: 3, padding: '1px 6px', minHeight: 22 }} onClick={() => removeImg(m.id)}>✕</button>
              </div>
            ))}
            {!selected.media.length ? (
              <span style={{ color: 'var(--muted)', fontSize: 13, alignSelf: 'center' }}>
                تصویری ندارد {selected.legacyImage ? '(فقط تصویر قدیمی پلتفرم داخلی — در فروشگاه همان استفاده می‌شود)' : ''}
              </span>
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="ops-btn" onClick={() => webSearch()} disabled={searching}>🔍 {searching ? 'در حال جست‌وجو…' : 'جست‌وجوی تصویر از اینترنت'}</button>
            <span style={{ flex: 1 }} />
            <input value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="یا نشانی تصویر (https://…)" style={{ flex: 1, minWidth: 220, padding: '7px 10px', border: '1.5px solid var(--line)', borderRadius: 9, fontFamily: 'inherit' }} dir="ltr" />
            <button className="ops-btn small" onClick={addManual}>افزودن نشانی</button>
          </div>

          {results ? (
            results.length ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                  {results.map((img) => (
                    <label key={img.url} style={{ cursor: 'pointer', border: picked.has(img.url) ? '3px solid var(--o-700)' : '1px solid var(--line)', borderRadius: 10, padding: 4, display: 'block' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={img.caption} width={'100%'} height={95} style={{ objectFit: 'cover', borderRadius: 7 }} referrerPolicy="no-referrer" />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                        <input type="checkbox" checked={picked.has(img.url)} onChange={() => { const nx = new Set(picked); if (nx.has(img.url)) nx.delete(img.url); else nx.add(img.url); setPicked(nx) }} />
                        <span style={{ fontSize: 10.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.caption || img.source || 'تصویر'}</span>
                      </div>
                    </label>
                  ))}
                </div>
                <button className="ops-btn primary" style={{ marginTop: 10 }} onClick={addPicked} disabled={!picked.size}>
                  افزودن {fa(picked.size)} تصویر انتخاب‌شده به «{selected.name}»
                </button>
              </>
            ) : (
              <div className="ops-empty">نتیجه‌ای پیدا نشد — عبارت دیگری امتحان کنید یا نشانی تصویر را دستی بدهید</div>
            )
          ) : null}
        </div>
      ) : null}
    </>
  )
}
