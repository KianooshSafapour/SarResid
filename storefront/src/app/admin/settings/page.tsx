'use client'

import AdminShell from '@/components/admin/AdminShell'

import { useCallback, useEffect, useState } from 'react'

interface SlotsCfg { days: number; lead: number; cap: number; ranges: number[][]; closed: number[] }
interface SettingsData {
  open: boolean
  devOtp: boolean
  storeName: string
  announcement: string
  deliveryFee: number
  freeDeliveryMin: number
  minOrder: number
  shelfFloor: number
  hotline: string
  gateway: string
  gatewayMerchant: string
  gatewaySandbox: boolean
  notifyRoles: string[]
  hiddenGroups: string[]
  slotsJson: string
  apiToken: string
}
const fa = (n: number) => (Number.isFinite(n) ? n.toLocaleString('fa-IR') : '—')
const en = (s: string) => s.replace(/[^\d]/g, '')
const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']
const ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'SK', 'HC', 'CASHIER', 'SALES', 'PM', 'MERCH']

function SettingsInner() {
  const [st, setSt] = useState<SettingsData | null>(null)
  const [slots, setSlots] = useState<SlotsCfg>({ days: 3, lead: 90, cap: 6, ranges: [[9, 12], [14, 18], [18, 22]], closed: [] })
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [smsStatus, setSmsStatus] = useState<string>('')
  const [showToken, setShowToken] = useState(false)

  const say = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 4000)
  }

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/shop-admin/settings', { cache: 'no-store' })
    const j = await r.json()
    if (j.ok) {
      const s = j.data.settings
      setSt({ ...s, apiToken: '' })
      try { setSlots(JSON.parse(s.slotsJson)) } catch { /* پیش‌فرض */ }
    } else say(j.error || 'بارگذاری ناموفق')
    // وضعیت پنل پیامک (اطلاعی — بدون نیاز به دسترسی ویرایش)
    const p = await fetch('/api/admin/sms/panels', { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (p?.ok) {
      const def = (p.data.panels || []).find((x: { isDefault: boolean; active: boolean }) => x.isDefault && x.active)
      setSmsStatus(def ? `پنل پیش‌فرض: ${def.providerTitle || def.provider} (${def.mode === 'real' ? 'واقعی' : 'شبیه‌سازی'}) — از مرکز پیامک سررسید` : 'پنل پیش‌فرضی فعال نیست — از «تنظیمات ← مرکز پیامک» سررسید تعریف کنید')
    } else setSmsStatus('مرکز پیامک در دسترس نیست')
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const set = <K extends keyof SettingsData>(k: K, v: SettingsData[K]) => setSt((cur) => (cur ? { ...cur, [k]: v } : cur))

  const save = async () => {
    if (!st || busy) return
    setBusy(true)
    const body: Record<string, unknown> = {
      'shop:open': st.open,
      'shop:devOtp': st.devOtp,
      'shop:storeName': st.storeName,
      'shop:announcement': st.announcement,
      'shop:deliveryFee': st.deliveryFee,
      'shop:freeDeliveryMin': st.freeDeliveryMin,
      'shop:minOrder': st.minOrder,
      'shop:shelfFloor': st.shelfFloor,
      'shop:hotline': st.hotline,
      'shop:gateway': st.gateway,
      'shop:gatewayMerchant': st.gatewayMerchant,
      'shop:gatewaySandbox': st.gatewaySandbox,
      'shop:notifyRoles': st.notifyRoles,
      'shop:hiddenGroups': st.hiddenGroups,
      'shop:slots': slots,
    }
    const r = await fetch('/api/admin/shop-admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json()
    say(j.ok ? 'تنظیمات ذخیره شد ✓' : j.error || 'ذخیره ناموفق')
    setBusy(false)
  }

  const newToken = async () => {
    if (!confirm('توکن سرویس ویترین عوض شود؟ باید همزمان .env ویترین روی سرور به‌روز شود (deploy script این کار را می‌کند).')) return
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, '0')).join('')
    const r = await fetch('/api/admin/shop-admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ 'shop:apiToken': token }) })
    const j = await r.json()
    say(j.ok ? 'توکن جدید ساخته شد — در استقرار بعدی به ویترین هم می‌رسد' : j.error || 'ناموفق')
  }

  if (!st) return <div className="adm-skel" />

  const toggleIn = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  return (
    <>
      <h1 style={{ fontSize: 18, margin: '0 0 12px' }}>⚙️ تنظیمات فروشگاه آنلاین</h1>
      {toast && <div className="adm-toast">{toast}</div>}

      <div className="adm-card">
        <h3>وضعیت فروشگاه</h3>
        <label className="adm-toggle"><input type="checkbox" checked={st.open} onChange={(e) => set('open', e.target.checked)} /> فروشگاه باز است (مشتریان می‌توانند سفارش ثبت کنند)</label>
        {st.devOtp ? <div className="adm-note">⚠️ کد ورود آزمایشی ۱۱۱۱۱ فعال است — فقط برای تست! روی سرور اصلی خاموش کنید.</div> : null}
        <label className="adm-toggle" style={{ marginInlineStart: 18 }}><input type="checkbox" checked={st.devOtp} onChange={(e) => set('devOtp', e.target.checked)} /> کد آزمایشی dev (۱۱۱۱۱)</label>
        <div className="adm-grid" style={{ marginTop: 10 }}>
          <label className="adm-field"><span>نام فروشگاه</span><input value={st.storeName} onChange={(e) => set('storeName', e.target.value)} /></label>
          <label className="adm-field"><span>شمارهٔ پشتیبانی</span><input value={st.hotline} onChange={(e) => set('hotline', e.target.value)} dir="ltr" /></label>
        </div>
        <label className="adm-field"><span>بنر اعلان بالای سایت (خالی = بدون بنر)</span><input value={st.announcement} onChange={(e) => set('announcement', e.target.value)} placeholder="مثلاً: جشنوارهٔ پاییزهٔ هایپر زیتون آغاز شد" /></label>
        <p className="adm-note">{smsStatus}</p>
      </div>

      <div className="adm-card">
        <h3>ارسال و پرداخت</h3>
        <div className="adm-grid">
          <label className="adm-field"><span>هزینهٔ ارسال (ریال) — {fa(st.deliveryFee)}</span><input value={st.deliveryFee} inputMode="numeric" onChange={(e) => set('deliveryFee', Number(en(e.target.value)) || 0)} dir="ltr" /></label>
          <label className="adm-field"><span>ارسال رایگان از این مبلغ (ریال) — {fa(st.freeDeliveryMin)}</span><input value={st.freeDeliveryMin} inputMode="numeric" onChange={(e) => set('freeDeliveryMin', Number(en(e.target.value)) || 0)} dir="ltr" /></label>
          <label className="adm-field"><span>حداقل مبلغ سفارش (ریال؛ ۰ = خاموش)</span><input value={st.minOrder} inputMode="numeric" onChange={(e) => set('minOrder', Number(en(e.target.value)) || 0)} dir="ltr" /></label>
          <label className="adm-field"><span>کف قفسه — چند عدد نگه داریم و آنلاین نفروشیم</span><input value={st.shelfFloor} inputMode="numeric" onChange={(e) => set('shelfFloor', Number(en(e.target.value)) || 0)} dir="ltr" /></label>
        </div>
        <hr style={{ border: 0, borderTop: '1px dashed var(--line)', margin: '10px 0' }} />
        <b style={{ fontSize: 13.5 }}>روش پرداخت آنلاین:</b>
        <div className="adm-grid" style={{ marginTop: 8 }}>
          <label className="adm-field"><span>درگاه</span>
            <select value={st.gateway} onChange={(e) => set('gateway', e.target.value)}>
              <option value="mock">آزمایشی (mock) — فقط تست</option>
              <option value="zarinpal">زرین‌پال</option>
            </select>
          </label>
          <label className="adm-field"><span>شناسهٔ پذیرندگی (مرچنت زرین‌پال)</span><input value={st.gatewayMerchant} onChange={(e) => set('gatewayMerchant', e.target.value)} dir="ltr" placeholder="xxxxxxxx-xxxx-…" /></label>
        </div>
        <label className="adm-toggle"><input type="checkbox" checked={st.gatewaySandbox} onChange={(e) => set('gatewaySandbox', e.target.checked)} /> حالت آزمایشی درگاه (sandbox تا تست شود)</label>
      </div>

      <div className="adm-card">
        <h3>بازه‌های تحویل</h3>
        <div className="adm-grid">
          <label className="adm-field"><span>چند روز آینده قابل انتخاب باشد (۱-۷)</span><input value={slots.days} inputMode="numeric" onChange={(e) => setSlots({ ...slots, days: Math.min(7, Math.max(1, Number(en(e.target.value)) || 1)) })} dir="ltr" /></label>
          <label className="adm-field"><span>حداقل فاصلهٔ شروع بازه تا الان (دقیقه)</span><input value={slots.lead} inputMode="numeric" onChange={(e) => setSlots({ ...slots, lead: Math.max(30, Number(en(e.target.value)) || 90) })} dir="ltr" /></label>
          <label className="adm-field"><span>ظرفیت هر بازه (تعداد سفارش)</span><input value={slots.cap} inputMode="numeric" onChange={(e) => setSlots({ ...slots, cap: Math.max(1, Number(en(e.target.value)) || 6) })} dir="ltr" /></label>
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>ساعت‌های هر بازه (مثلاً ۹ تا ۱۲):</span>
        <div className="adm-chips" style={{ margin: '6px 0' }}>
          {slots.ranges.map((r, i) => (
            <span key={i} className="adm-chip">
              <bdi>{r[0]} تا {r[1]}</bdi>
              <button title="حذف بازه" onClick={() => setSlots({ ...slots, ranges: slots.ranges.filter((_, x) => x !== i) })}>✕</button>
            </span>
          ))}
          <button className="adm-btn sm" onClick={() => { const h = (slots.ranges.at(-1)?.[1] ?? 8) % 24; setSlots({ ...slots, ranges: [...slots.ranges, [h, Math.min(23, h + 4)]] }) }}>+ بازهٔ جدید</button>
        </div>
        {slots.ranges.map((r, i) => (
          <div key={i} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', margin: '0 0 6px', fontSize: 12.5 }}>
            <bdi>بازهٔ {i + 1}:</bdi>
            <input style={{ width: 58, padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 8 }} value={r[0]} inputMode="numeric" onChange={(e) => { const v = Math.min(23, Math.max(0, Number(en(e.target.value)) || 0)); const nr = [...slots.ranges]; nr[i] = [v, Math.max(v + 1, nr[i][1])]; setSlots({ ...slots, ranges: nr }) }} dir="ltr" />
            <span>تا</span>
            <input style={{ width: 58, padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 8 }} value={r[1]} inputMode="numeric" onChange={(e) => { const v = Math.min(24, Math.max(r[0] + 1, Number(en(e.target.value)) || 1)); const nr = [...slots.ranges]; nr[i] = [nr[i][0], v]; setSlots({ ...slots, ranges: nr }) }} dir="ltr" />
          </div>
        ))}
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>روزهای تعطیل:</span>
          <div className="adm-chips" style={{ marginTop: 6 }}>
            {WEEKDAYS.map((w, i) => (
              <label key={w} className="adm-toggle" style={{ fontSize: 12.5 }}>
                <input type="checkbox" checked={slots.closed.includes(i)} onChange={() => setSlots({ ...slots, closed: toggleIn(slots.closed.map(String), String(i)).map(Number) })} /> {w}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="adm-card">
        <h3>اعلان‌ها و دسته‌های پنهان</h3>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>سفارش جدید به کدام نقش‌ها اعلان بدهد:</span>
        <div className="adm-chips" style={{ margin: '6px 0 12px' }}>
          {ROLES.map((r) => (
            <label key={r} className="adm-toggle" style={{ fontSize: 12.5 }}>
              <input type="checkbox" checked={st.notifyRoles.includes(r)} onChange={() => set('notifyRoles', toggleIn(st.notifyRoles, r))} /> {r}
            </label>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>دسته‌هایی که در فروشگاه نشان داده نشوند (علاوه بر پالایش خودکار گروه‌های اداری):</span>
        <div className="adm-chips" style={{ marginTop: 6 }}>
          {st.hiddenGroups.map((g) => (
            <span key={g} className="adm-chip">{g}<button onClick={() => set('hiddenGroups', st.hiddenGroups.filter((x) => x !== g))}>✕</button></span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input id="hg-add" placeholder="نام دستهٔ پنهان…" style={{ flex: 1, maxWidth: 260, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
          <button className="adm-btn sm" onClick={() => { const el = document.getElementById('hg-add') as HTMLInputElement; const v = el.value.trim(); if (v) { set('hiddenGroups', [...st.hiddenGroups, v]); el.value = '' } }}>افزودن</button>
        </div>
      </div>

      <div className="adm-card">
        <h3>امنیت اتصال ویترین</h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 8px' }}>
          توکن سرویس بین فروشگاه آنلاین و سررسید — توسط اسکریپت استقرار ساخته و همزمان در دو سمت ذخیره می‌شود.
        </p>
        <button className="adm-btn danger small" onClick={newToken}>ساخت توکن جدید</button>{' '}
        <button className="adm-btn sm" onClick={() => setShowToken(!showToken)}>{showToken ? 'مخفی' : 'وضعیت'}</button>
        {showToken ? <span style={{ marginInlineStart: 8, fontSize: 12.5, color: 'var(--muted)' }}>{st.apiToken || 'تنظیم‌شده ✓'}</span> : null}
      </div>

      <button className="adm-btn primary" style={{ minWidth: 220 }} onClick={save} disabled={busy}>
        {busy ? 'در حال ذخیره…' : '💾 ذخیرهٔ همهٔ تنظیمات'}
      </button>
    </>
  )
}

export default function settings() {
  return <AdminShell><SettingsInner /></AdminShell>
}
