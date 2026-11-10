import { apiGet, type ShopConfig } from '@/lib/api'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import Footer from '@/components/Footer'
import SwRegister from '@/components/SwRegister'

/** چیدمان ویترین مشتری — هدر/فوتر/تب‌بار فروشگاه */
export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const cfg = await apiGet<ShopConfig>('/config', { revalidate: 120 })
  const shop = cfg.ok && cfg.data ? cfg.data : null

  return (
    <>
      {shop?.announcement ? <div className="announce">{shop.announcement}</div> : null}
      {!shop?.open ? (
        <div className="announce" style={{ background: '#7a2d22' }}>
          فروشگاه آنلاین فعلاً بسته است — سفارش‌های ثبت‌شده انجام می‌شوند؛ به‌زودی برمی‌گردیم
        </div>
      ) : null}
      <Header hotline={shop?.hotline || ''} />
      <main>{children}</main>
      <Footer hotline={shop?.hotline || ''} freeDeliveryMin={shop?.freeDeliveryMin || 0} />
      <BottomNav />
      <SwRegister />
    </>
  )
}
