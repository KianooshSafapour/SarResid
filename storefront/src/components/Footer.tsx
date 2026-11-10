export default function Footer({ hotline, freeDeliveryMin }: { hotline: string; freeDeliveryMin: number }) {
  return (
    <footer className="site-footer">
      <div className="footer-branch" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/olive-branch.svg" alt="" width={520} height={520} loading="lazy" />
      </div>
      <div className="container footer-in">
        <div className="f-brand">
          <div className="f-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" width={44} height={44} />
          </div>
          <div>
            <h3>هایپر زیتون</h3>
            <p className="f-tag">هایپرمارکت لوکس رفسنجان</p>
          </div>
        </div>

        <div className="f-cols">
          <div className="f-col">
            <h4>خرید آنلاین</h4>
            <ul>
              <li>
                <a href="/categories">دسته‌بندی کالاها</a>
              </li>
              <li>
                <a href="/search?q=&sort=discount">تخفیف‌های امروز</a>
              </li>
              <li>
                <a href="/track">پیگیری سفارش</a>
              </li>
            </ul>
          </div>
          <div className="f-col">
            <h4>ارسال و پرداخت</h4>
            <ul className="f-facts">
              <li>
                ارسال سریع درون‌شهری رفسنجان
                {freeDeliveryMin > 0 ? (
                  <>
                    {' — '}
                    <span className="f-gold">ارسال رایگان از {freeDeliveryMin.toLocaleString('fa-IR')} ریال</span>
                  </>
                ) : null}
              </li>
              <li>پرداخت در محل یا آنلاین، به انتخاب شما</li>
              <li>ضمانت تازگی و مرجوعی تا ۲۴ ساعت</li>
            </ul>
          </div>
          <div className="f-col">
            <h4>تماس با ما</h4>
            <ul className="f-facts">
              <li>
                پشتیبانی: <bdi dir="ltr">{hotline}</bdi>
              </li>
              <li>هر روز، ۹ تا ۲۲</li>
              <li>رفسنجان، استان کرمان</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="container f-bottom">
        <span>© {new Date().toLocaleDateString('fa-IR', { year: 'numeric' })} هایپر زیتون — تمامی حقوق محفوظ است · <a href="/admin" style={{ color: '#8fa595' }}>مدیریت</a></span>
        <span className="f-made">🫒 از برداشت زیتونِ رفسنجان، تا درِ خانهٔ شما</span>
      </div>
    </footer>
  )
}
