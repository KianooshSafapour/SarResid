import { getSessionUser, ROLE_LABELS } from '@/lib/auth'
import { canUseShopOps } from '@/lib/shop-http'
import ShopOpsNav from './nav'

export const dynamic = 'force-dynamic'

/** چیدمان پنل فروشگاه آنلاین — ناوبری مشترک سفارش‌ها/دسته‌ها/کالاها/مشتریان/تنظیمات */
export default async function ShopOpsLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user || !canUseShopOps(user.role)) {
    return (
      <main style={{ padding: 40, textAlign: 'center', fontFamily: 'Vazirmatn, Tahoma, sans-serif' }}>
        <h1>پنل فروشگاه آنلاین</h1>
        <p style={{ color: '#64748b' }}>
          {user ? `برای نقش «${ROLE_LABELS[user.role] || user.role}» باز نیست — با مدیر سامانه تماس بگیرید.` : 'اول وارد سررسید شوید، بعد به همین نشانی برگردید.'}
        </p>
        <p dir="ltr">/shop-ops</p>
      </main>
    )
  }
  return (
    <>
      <style>{sharedCss}</style>
      <ShopOpsNav role={user.role} fullName={`${user.honorific || ''} ${user.fullName}`.trim()} />
      <main className="ops-main">{children}</main>
    </>
  )
}

const sharedCss = `
:root { --o-900:#14311f; --o-700:#0e7a4a; --o-soft:#eef3ee; --gold:#c8a24a; --line:#e4e7e1; --ink:#1c2620; --muted:#64748b; --red:#b3382c; }
* { box-sizing: border-box }
body { margin: 0; background: #f4f6f2; font-family: Vazirmatn, Tahoma, sans-serif; color: var(--ink); font-size: 14px }
.ops-nav { position: sticky; top: 0; z-index: 20; background: linear-gradient(135deg,#14311f,#0e7a4a); color: #fff; padding: 0 14px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; box-shadow: 0 2px 12px #14311f33 }
.ops-nav .who { margin-inline-end: auto; font-size: 12px; opacity: .85; padding: 8px 4px; white-space: nowrap }
.ops-nav a { color: #d7e4d9; text-decoration: none; padding: 11px 13px; font-size: 13.5px; border-bottom: 3px solid transparent; white-space: nowrap }
.ops-nav a:hover { color: #fff }
.ops-nav a.on { color: #fff; border-color: var(--gold); font-weight: 700 }
.ops-main { max-width: 1180px; margin: 0 auto; padding: 16px 14px 60px }
.ops-card { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; margin-bottom: 12px }
.ops-card h3 { margin: 0 0 10px; font-size: 15px }
.ops-grid2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px }
.ops-field { display: block; margin-bottom: 10px }
.ops-field > span { display: block; font-size: 12.5px; color: var(--muted); margin-bottom: 4px }
.ops-field input, .ops-field select, .ops-field textarea { width: 100%; padding: 8px 11px; border: 1.5px solid var(--line); border-radius: 10px; font-family: inherit; font-size: 14px; min-height: 40px; background: #fff }
.ops-field input:focus, .ops-field select:focus, .ops-field textarea:focus { outline: 0; border-color: var(--o-700) }
.ops-btn { border: 1.5px solid var(--o-700); background: #fff; color: var(--o-700); border-radius: 10px; padding: 8px 16px; font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; min-height: 40px }
.ops-btn:hover:not(:disabled) { background: var(--o-soft) }
.ops-btn.primary { background: var(--o-700); color: #fff }
.ops-btn.primary:hover:not(:disabled) { background: var(--o-900) }
.ops-btn.danger { border-color: #e4b7b1; color: var(--red); background: #fff }
.ops-btn.small { padding: 4px 10px; min-height: 30px; font-size: 12.5px; border-radius: 8px }
.ops-btn:disabled { opacity: .5; cursor: not-allowed }
.ops-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--o-soft); color: var(--o-900); border-radius: 999px; padding: 3px 11px; font-size: 12.5px; border: 1px solid #dbe5dc }
.ops-chip button { border: 0; background: none; color: var(--red); cursor: pointer; font-size: 13px; padding: 0 }
.ops-chips { display: flex; flex-wrap: wrap; gap: 6px }
.ops-toggle { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none }
.ops-toggle input { width: 18px; height: 18px; accent-color: var(--o-700) }
.ops-note { background: #fffbea; border: 1px solid #f2e3ac; color: #7a5d0d; border-radius: 10px; padding: 8px 12px; font-size: 12.5px; margin: 8px 0 }
.ops-toast { position: fixed; bottom: 16px; inset-inline-start: 16px; background: var(--o-900); color: #fff; padding: 10px 16px; border-radius: 10px; font-size: 13.5px; z-index: 60; box-shadow: 0 6px 20px #0003 }
.ops-table { width: 100%; border-collapse: collapse; font-size: 13px }
.ops-table th { text-align: start; color: var(--muted); font-weight: 600; font-size: 12px; padding: 7px 8px; border-bottom: 1px solid var(--line) }
.ops-table td { padding: 7px 8px; border-bottom: 1px solid #f0f2ec }
.ops-empty { text-align: center; color: var(--muted); padding: 26px 10px; font-size: 13.5px }
.ops-skel { background: linear-gradient(90deg,#eef0ea 25%,#f7f9f4 50%,#eef0ea 75%); background-size: 200% 100%; animation: opssh 1.1s infinite; border-radius: 12px; height: 90px }
@keyframes opssh { to { background-position: -200% 0 } }
`
