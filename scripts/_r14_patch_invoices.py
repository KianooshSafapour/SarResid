# R14 — invoices.tsx: auto-archive UI (GM approve + archive dialog)
import io

p = 'hz-ext/src/views/invoices.tsx'
s = io.open(p, encoding='utf-8').read()
orig = s

# 1) Detail interface: autoArchiveBinder
old = """  gmApprovedAt: string | null
  gmApprovedByName: string | null
  cancelledByName: string | null"""
new = """  gmApprovedAt: string | null
  gmApprovedByName: string | null
  autoArchiveBinder: { id: string; name: string; code: string; shelf: string | null; cabinet: string | null } | null
  cancelledByName: string | null"""
assert old in s
s = s.replace(old, new)

# 2) state: auto-archive checkbox (default checked) + save-binder checkbox state
old_state = "  const [busy, setBusy] = useState(false)"
if old_state not in s:
    import re
    m = re.search(r"(const \[busy, setBusy\] = useState\(false\)\n)", s)
    assert m
    anchor = m.group(1)
else:
    anchor = old_state
s = s.replace(anchor, anchor + """  /* R14: بایگانی خودکار — چک پیش‌فرض روشن؛ زون‌بندِ شرکت از سرور می‌آید */
  const [autoArchive, setAutoArchive] = useState(true)
  const [saveBinder, setSaveBinder] = useState(true)
""", 1)

# 3) GM button block: checkbox + binder chip + act body
old_gm = """                {dState === 'final' && !detail.gmApprovedAt && canGm ? (
                  <Button disabled={busy} className="bg-violet-700 hover:bg-violet-800" onClick={() => void act(detail.id, { action: 'gm-approve' }, 'تأیید مدیر کل انجام شد — قیمت‌ها در سر رسید و هلو به‌روز شد؛ آمادهٔ بایگانی')}>
                    <I.shieldCheck size={14} /> تأیید مدیر کل (لطفی) و انتشار قیمت‌ها
                  </Button>
                ) : null}"""
new_gm = """                {dState === 'final' && !detail.gmApprovedAt && canGm ? (
                  <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/60 p-2.5">
                    <Button
                      disabled={busy}
                      className="bg-violet-700 hover:bg-violet-800"
                      onClick={() => void act(detail.id, { action: 'gm-approve', autoArchive: autoArchive && !!detail.autoArchiveBinder }, detail.autoArchiveBinder && autoArchive ? 'تأیید مدیر کل انجام شد — قیمت‌ها منتشر و سند خودکار بایگانی شد' : 'تأیید مدیر کل انجام شد — قیمت‌ها در سر رسید و هلو به‌روز شد؛ آمادهٔ بایگانی')}
                    >
                      <I.shieldCheck size={14} /> تأیید مدیر کل (لطفی) و انتشار قیمت‌ها
                    </Button>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-violet-900" title="اگر برای این شرکت زون‌بند تعیین شده باشد، سند همان‌جا و با برگهٔ خودکارِ بعدی بایگانی می‌شود">
                      <Checkbox checked={autoArchive} onCheckedChange={(v: boolean) => setAutoArchive(v === true)} />
                      بایگانی خودکار
                    </label>
                    {detail.autoArchiveBinder ? (
                      <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800" title={detail.autoArchiveBinder.cabinet ? `${detail.autoArchiveBinder.cabinet} ‹ ${detail.autoArchiveBinder.shelf ?? ''}` : undefined}>
                        زون‌بندِ این شرکت: «{detail.autoArchiveBinder.name}» · برگهٔ بعدی خودکار
                      </span>
                    ) : (
                      <span className="text-[10px] leading-4 text-stone-500">
                        زون‌بندی برای این شرکت تعیین نشده — پس از تأیید، از «بایگانی سند کاغذی» بایگانی و ذخیرهٔ زون‌بند کنید تا فاکتورهای بعدی خودکار شوند.
                      </span>
                    )}
                  </div>
                ) : null}"""
assert old_gm in s
s = s.replace(old_gm, new_gm)

# 4) archive action body: send saveBinder — find the archive submit call
old_arch = "await act(detail.id, { action: 'archive',"
assert old_arch in s
s = s.replace(old_arch, "await act(detail.id, { action: 'archive', saveBinder,")

assert s != orig
io.open(p, 'w', encoding='utf-8').write(s)
print('invoices auto-archive UI ok — saveBinder refs:', s.count('saveBinder'))
