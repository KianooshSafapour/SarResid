import Link from 'next/link'
import { apiGet, type GroupInfo } from '@/lib/api'
import { faNum } from '@/lib/format'

export const revalidate = 120

const emojiFor = (name: string) => {
  const m: Record<string, string> = { 'لبنیات': '🥛', 'میوه': '🍎', 'خواربار': '🌾', 'تنقلات': '🥨', 'پروتئینی': '🥩', 'نوشیدنی': '🧃' }
  return m[name] || '🛒'
}

export default async function CategoriesPage() {
  const res = await apiGet<{ groups: GroupInfo[] }>('/catalog?pageSize=1', { revalidate: 120 })
  const groups = res.data?.groups || []
  return (
    <div className="container">
      <h1 style={{ fontSize: 22, margin: '18px 0 4px' }}>دسته‌بندی‌ها</h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px', fontSize: 13.5 }}>
        <bdi>{faNum(groups.reduce((s, g) => s + g.count, 0))}</bdi> کالا در <bdi>{faNum(groups.length)}</bdi> دسته
      </p>
      <div className="grid">
        {groups.map((g) => (
          <Link key={g.name} href={`/c/${encodeURIComponent(g.name)}`} className="pcard" style={{ padding: 18, gap: 8, alignItems: 'center', display: 'flex', flexDirection: 'row', justifyContent: 'flex-start' }}>
            <span style={{ fontSize: 30 }} aria-hidden>
              {g.emoji || emojiFor(g.name)}
            </span>
            <span>
              <b style={{ fontSize: 15 }}>{g.name}</b>
              <small style={{ display: 'block', color: 'var(--muted)', fontSize: 12 }}>
                <bdi>{faNum(g.count)}</bdi> کالا
              </small>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
