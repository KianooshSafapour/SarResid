'use client'

import { useState } from 'react'

/** گالری چندتصویری صفحهٔ کالا — تصویر اصلی + بندانگشتی‌ها */
export default function Gallery({ images, alt }: { images: { url: string; caption?: string }[]; alt: string }) {
  const list = images.length ? images : [{ url: '/img/placeholder.svg', caption: '' }]
  const [idx, setIdx] = useState(0)
  const cur = list[Math.min(idx, list.length - 1)]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ position: 'relative' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cur.url}
          alt={cur.caption ? `${alt} — ${cur.caption}` : alt}
          referrerPolicy="no-referrer"
          width={520}
          height={520}
          style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', background: '#f4f3ec' }}
          onError={(e) => { (e.target as HTMLImageElement).src = '/img/placeholder.svg' }}
        />
        {list.length > 1 ? (
          <span style={{ position: 'absolute', bottom: 8, insetInlineEnd: 8, background: '#102317cc', color: '#fff', borderRadius: 999, fontSize: 11, padding: '2px 9px' }}>
            <bdi>{(idx + 1).toLocaleString('fa-IR')} / {list.length.toLocaleString('fa-IR')}</bdi>
          </span>
        ) : null}
      </div>
      {list.length > 1 ? (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {list.map((im, i) => (
            <button
              key={im.url + i}
              onClick={() => setIdx(i)}
              aria-label={`تصویر ${(i + 1).toLocaleString('fa-IR')}`}
              style={{ flex: 'none', width: 62, height: 62, borderRadius: 10, overflow: 'hidden', border: i === idx ? '2.5px solid var(--olive-2)' : '1.5px solid var(--line)', padding: 0, cursor: 'pointer', background: '#f4f3ec' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={im.url} alt="" width={62} height={62} style={{ objectFit: 'cover' }} loading="lazy" referrerPolicy="no-referrer" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
