import Link from 'next/link'
import { apiGet, type HomeData, type GroupInfo } from '@/lib/api'
import { faNum } from '@/lib/format'
import ProductCard from '@/components/ProductCard'
import { RecentRail } from '@/components/RecentRail'
import ReorderRail from '@/components/ReorderRail'

export const revalidate = 60

const CAT_EMOJI: Record<string, string> = {
  'لبنیات': '🥛', 'میوه و سبزیجات': '🍎', 'میوه': '🍎', 'سبزیجات': '🥬', 'خواربار': '🌾', 'تنقلات': '🥨',
  'پروتئینی': '🥩', 'گوشت': '🥩', 'مرغ و گوشت': '🥩', 'آرایشی و بهداشتی': '💄', 'نوشیدنی': '🧃', 'نوشیدنیها': '🧃',
  'شویندگی': '🧼', 'خانگی': '🏠', 'کنسرو': '🥫', 'شیرینی': '🍪', 'خشکبار': '🥜', 'نان': '🍞', 'یخچالی': '🧊',
  'انجمادی': '🧊', 'سس و ترشی': '🫙', 'برنج و حبوبات': '🍚', 'روغن': '🫒', 'خوار و بار': '🌾', 'بهداشتی': '🧴',
}
const emojiFor = (name: string) => CAT_EMOJI[name] || (name.includes('میوه') ? '🍎' : name.includes('لبنی') ? '🥛' : name.includes('نوشیدنی') ? '🧃' : '🛒')

export default async function HomePage() {
  const res = await apiGet<HomeData>('/home', { revalidate: 60 })
  const home = res.ok && res.data ? res.data : null

  return (
    <div className="container">
      {/* هیروی واحد — بدون کاروسل (پژوهش: کاروسل بعد از اسلاید ۱ می‌میرد) */}
      <section className="hero">
        <span className="branch" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/olive-branch.svg" alt="" width={520} height={520} />
        </span>
        <h1>
          تازه‌های <em>هایپر زیتون</em>، درِ خانهٔ شما
        </h1>
        <p>میوه و سبزی تازهٔ روز، خواربار اصل و محصولات لوکس — با ضمانت تازگی، ارسال سریع در رفسنجان و پرداخت در محل.</p>
        <Link href="/categories" className="cta">
          شروع خرید
        </Link>
      </section>

      {/* نوار اعتماد — سیگنال‌های اعتماد در اولین نگاه */}
      <section className="trust" aria-label="مزایای خرید">
        <div>
          <b>🚚 ارسال سریع رفسنجان</b>بازهٔ دلخواه خودتان را انتخاب کنید
        </div>
        <div>
          <b>💵 پرداخت در محل</b>یا پرداخت آنلاین — به انتخاب شما
        </div>
        <div>
          <b>🌿 ضمانت تازگی</b>کالای تازه یا بازگشت وجه
        </div>
        <div>
          <b>🏷️ قیمت شفاف</b>همان قیمت فروشگاه، بی‌افق پنهان
        </div>
      </section>

      {home?.groups?.length ? (
        <section>
          <div className="rail-head">
            <h2>دسته‌بندی‌ها</h2>
            <Link href="/categories">همهٔ دسته‌ها ←</Link>
          </div>
          <div className="cat-row">
            {home.groups.map((g: GroupInfo) => (
              <Link key={g.name} href={`/c/${encodeURIComponent(g.name)}`} className="cat-chip">
                <span className="e" aria-hidden>
                  {g.emoji || emojiFor(g.name)}
                </span>
                {g.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {home?.deals?.length ? (
        <section>
          <div className="rail-head">
            <h2>🔥 تخفیف‌های امروز</h2>
            <Link href="/search?q=&sort=discount">همه ←</Link>
          </div>
          <div className="rail">
            {home.deals.map((it) => (
              <ProductCard key={it.id} item={it} />
            ))}
          </div>
        </section>
      ) : null}

      <ReorderRail />

      {home?.bestsellers?.length ? (
        <section>
          <div className="rail-head">
            <h2>⭐ پرفروش‌ترین‌ها</h2>
          </div>
          <div className="rail">
            {home.bestsellers.map((it) => (
              <ProductCard key={it.id} item={it} />
            ))}
          </div>
        </section>
      ) : null}

      <RecentRail />

      {!home ? (
        <div className="empty">
          <span className="e">🫒</span>
          فروشگاه در حال آماده‌سازی است — چند لحظه بعد دوباره تلاش کنید
        </div>
      ) : null}
    </div>
  )
}
