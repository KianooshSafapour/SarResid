'use client'

import AdminShell from '@/components/admin/AdminShell'

import { useCallback, useEffect, useState } from 'react'

interface Category { id: string; name: string; emoji: string; sortOrder: number; active: boolean; groups: string[]; count: number }
interface RawGroup { name: string; count: number; mapped: boolean }
interface Suggestion { normalized: string; groups: string[] }
const fa = (n: number) => n.toLocaleString('fa-IR')

function CategoriesInner() {
  const [cats, setCats] = useState<Category[] | null>(null)
  const [rawGroups, setRawGroups] = useState<RawGroup[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ name: '', emoji: '🛒', groups: '' })
  const [editId, setEditId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ name: '', emoji: '', groups: '', sortOrder: 100, active: true })

  const say = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 4000)
  }

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/shop-admin/categories', { cache: 'no-store' })
    const j = await r.json()
    if (j.ok) {
      setCats(j.data.categories)
      setRawGroups(j.data.rawGroups)
      setSuggestions(j.data.mergeSuggestions)
    } else say(j.error || 'بارگذاری ناموفق')
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = async (data: { name: string; emoji: string; groups: string[] }) => {
    if (busy || data.name.trim().length < 2) return
    setBusy(true)
    const r = await fetch('/api/admin/shop-admin/categories', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
    const j = await r.json()
    say(j.ok ? `دستهٔ «${data.name}» ساخته شد ✓` : j.error || 'ناموفق')
    setBusy(false)
    if (j.ok) { setCreating(false); setDraft({ name: '', emoji: '🛒', groups: '' }); load() }
  }

  const saveEdit = async () => {
    if (!editId || busy) return
    setBusy(true)
    const r = await fetch(`/api/admin/shop-admin/categories/${editId}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: editDraft.name, emoji: editDraft.emoji, groups: editDraft.groups.split(/[،,\n]/).map((g) => g.trim()).filter(Boolean), sortOrder: editDraft.sortOrder, active: editDraft.active }),
    })
    const j = await r.json()
    say(j.ok ? 'ذخیره شد ✓' : j.error || 'ناموفق')
    setBusy(false)
    if (j.ok) { setEditId(null); load() }
  }

  const remove = async (c: Category) => {
    if (!confirm(`دستهٔ «${c.name}» حذف شود؟ (کالاها حذف نمی‌شوند — فقط دسته از فروشگاه می‌رود)`)) return
    const r = await fetch(`/api/admin/shop-admin/categories/${c.id}`, { method: 'DELETE' })
    const j = await r.json()
    say(j.ok ? 'حذف شد' : j.error || 'ناموفق')
    load()
  }

  const applyMerge = async (s: Suggestion) => {
    const name = s.normalized
    const existing = cats?.find((c) => c.name === name)
    if (existing) {
      const groups = [...new Set([...existing.groups, ...s.groups])]
      const r = await fetch(`/api/admin/shop-admin/categories/${existing.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ groups, name: existing.name, emoji: existing.emoji }) })
      const j = await r.json()
      say(j.ok ? `گروه‌ها به دستهٔ «${name}» اضافه شد ✓` : j.error || 'ناموفق')
    } else {
      await create({ name, emoji: '🛒', groups: s.groups })
    }
    load()
  }

  if (!cats) return <div className="adm-skel" />

  const unmapped = rawGroups.filter((g) => !g.mapped)

  return (
    <>
      <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>🗂️ دسته‌بندی‌های فروشگاه</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>
        دسته‌های نمایشی مشتری را بسازید و گروه‌های هلو را به آن‌ها نگاشت کنید — چند گروه هم‌معنی (مثل «لبنیات» و «گروه لبنیات») در یک دسته ادغام می‌شوند.
      </p>
      {toast && <div className="adm-toast">{toast}</div>}

      {suggestions.length ? (
        <div className="adm-card" style={{ background: '#fffbea', borderColor: '#f2e3ac' }}>
          <h3>💡 پیشنهاد ادغام گروه‌های هم‌معنی</h3>
          {suggestions.map((s) => (
            <div key={s.normalized} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '5px 0' }}>
              <span style={{ fontSize: 13 }}>{s.groups.map((g) => `«${g}»`).join(' + ')}</span>
              <button className="adm-btn sm primary" onClick={() => applyMerge(s)}>ادغام در دستهٔ «{s.normalized}»</button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="adm-card">
        <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          دسته‌ها
          <button className="adm-btn sm primary" onClick={() => setCreating(!creating)}>+ دستهٔ جدید</button>
        </h3>

        {creating ? (
          <div style={{ border: '1px dashed var(--line)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div className="adm-grid">
              <label className="adm-field"><span>نام دسته (نمایش به مشتری)</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="مثلاً: لبنیات" /></label>
              <label className="adm-field"><span>ایموجی</span><input value={draft.emoji} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} style={{ width: 80 }} /></label>
            </div>
            <label className="adm-field"><span>گروه‌های هلو (با «،» جدا کنید — از فهرست پایین هم می‌توانید کلیک کنید)</span><input value={draft.groups} onChange={(e) => setDraft({ ...draft, groups: e.target.value })} placeholder="لبنیات، گروه لبنیات" /></label>
            <button className="adm-btn primary small" onClick={() => create({ name: draft.name.trim(), emoji: draft.emoji, groups: draft.groups.split(/[،,\n]/).map((g) => g.trim()).filter(Boolean) })} disabled={busy}>ایجاد دسته</button>{' '}
            <button className="adm-btn sm" onClick={() => setCreating(false)}>انصراف</button>
          </div>
        ) : null}

        {cats.length === 0 ? (
          <div className="adm-empty">هنوز دسته‌ای نساخته‌اید — فروشگاه فعلاً گروه‌های خام هلو را نشان می‌دهد</div>
        ) : (
          cats.map((c) => (
            <div key={c.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', marginBottom: 8, opacity: c.active ? 1 : 0.55 }}>
              {editId === c.id ? (
                <>
                  <div className="adm-grid">
                    <label className="adm-field"><span>نام</span><input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /></label>
                    <label className="adm-field"><span>ایموجی</span><input value={editDraft.emoji} onChange={(e) => setEditDraft({ ...editDraft, emoji: e.target.value })} style={{ width: 80 }} /></label>
                    <label className="adm-field"><span>ترتیب نمایش (کوچک‌تر = جلوتر)</span><input value={editDraft.sortOrder} inputMode="numeric" onChange={(e) => setEditDraft({ ...editDraft, sortOrder: Number(e.target.value.replace(/[^\d]/g, '')) || 100 })} dir="ltr" /></label>
                  </div>
                  <label className="adm-field"><span>گروه‌های هلو (با «،» جدا کنید)</span><input value={editDraft.groups} onChange={(e) => setEditDraft({ ...editDraft, groups: e.target.value })} /></label>
                  <label className="adm-toggle"><input type="checkbox" checked={editDraft.active} onChange={(e) => setEditDraft({ ...editDraft, active: e.target.checked })} /> فعال</label>
                  <div style={{ marginTop: 8 }}>
                    <button className="adm-btn primary small" onClick={saveEdit} disabled={busy}>ذخیره</button>{' '}
                    <button className="adm-btn sm" onClick={() => setEditId(null)}>انصراف</button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 22 }}>{c.emoji}</span>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <b>{c.name}</b>{c.active ? '' : ' (غیرفعال)'} <span style={{ color: 'var(--muted)', fontSize: 12 }}>— {fa(c.count)} کالا</span>
                    <div className="adm-chips" style={{ marginTop: 4 }}>
                      {c.groups.map((g) => <span key={g} className="adm-chip">{g}</span>)}
                    </div>
                  </div>
                  <button className="adm-btn sm" onClick={() => { setEditId(c.id); setEditDraft({ name: c.name, emoji: c.emoji, groups: c.groups.join('، '), sortOrder: c.sortOrder, active: c.active }) }}>ویرایش</button>
                  <button className="adm-btn danger small" onClick={() => remove(c)}>حذف</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="adm-card">
        <h3>گروه‌های هلو ({unmapped.length} نگاشت‌نشده از {fa(rawGroups.length)})</h3>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 8px' }}>روی هر گروه نگاشت‌نشده کلیک کنید تا دسته‌ای با همان نام (بدون پیشوند «گروه») ساخته و نگاشت شود.</p>
        <div className="adm-chips">
          {rawGroups.map((g) => (
            g.mapped ? (
              <span key={g.name} className="adm-chip" style={{ opacity: 0.55 }}>{g.name} ({fa(g.count)}) ✓</span>
            ) : (
              <button key={g.name} className="adm-btn sm" style={{ borderRadius: 999 }} title="ساخت دسته و نگاشت"
                onClick={() => create({ name: g.name.replace(/^\s*گروه\s+/, ''), emoji: '🛒', groups: [g.name] })}>
                {g.name} ({fa(g.count)}) +
              </button>
            )
          ))}
        </div>
      </div>
    </>
  )
}

export default function categories() {
  return <AdminShell><CategoriesInner /></AdminShell>
}
