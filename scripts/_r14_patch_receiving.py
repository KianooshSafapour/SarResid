# R14 — receiving.tsx: GM approve UI in step 5
import io, re

p = 'hz-ext/src/views/receiving.tsx'
s = io.open(p, encoding='utf-8').read()
orig = s

# 1) GM role flag next to isManager
m = re.search(r"(const isManager = \['OWNER', 'GM', 'ADMIN', 'EXEC'\]\.includes\(role\)\n)", s)
assert m
s = s.replace(m.group(1), m.group(1) + "  /* R14 — تأیید مدیر کل (نقش GM = خانم لطفی، مدیر کل؛ در نبودِ ایشان مالک/ادمین) */\n  const isGmRole = ['GM', 'OWNER', 'ADMIN'].includes(role)\n")

# 2) gmApprove action near finalApprove
old_final = "    const d = await patchAction(detail.id, 'final-approve', undefined, 'final')"
assert old_final in s
s = s.replace(old_final, """    const d = await patchAction(detail.id, 'final-approve', undefined, 'final')""")

# add gmApprove before finalApprove — find the function containing final-approve
idx = s.find(old_final)
fn_start = s.rfind('\n  async function', 0, idx)
gm_fn = """
  /* R14 — تأیید مدیر کل پس از ثبت حسابداری (انتشار قیمت‌ها در سر رسید + هلو) */
  async function gmApprove() {
    if (!detail) return
    const d = await patchAction(detail.id, 'gm-approve', undefined, 'gm-approve')
    if (d) toast.success('تأیید مدیر کل انجام شد — قیمت‌ها منتشر شد؛ می‌توانید سفارش را ببندید')
  }
"""
s = s[:fn_start] + gm_fn + s[fn_start:]

# 3) step-5 UI: GM block + gated بستن سفارش
old = """                <p className="text-xs leading-5 text-stone-500">
                  ثبت حسابداری انجام شده است — حساب‌ها، سند آرشیو و فاکتور سودسنج همین سفارش آماده‌اند؛ با بستن، پروندهٔ تحویل کامل می‌شود.
                </p>
                {isManager ? (
                  <div className="flex justify-end">
                    <Button onClick={() => void finalApprove()} disabled={actBusy === 'final'} className="gap-1">
                      {actBusy === 'final' ? <I.loader size={15} className="animate-spin" /> : <I.check size={15} />} بستن سفارش
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white p-2.5 text-[11px] text-stone-500">
                    <I.clock size={14} className="text-stone-400" /> در انتظار بستن توسط مدیر.
                  </div>
                )}"""
new = """                <p className="text-xs leading-5 text-stone-500">
                  ثبت حسابداری انجام شده است — حساب‌ها، سند آرشیو و فاکتور سودسنج همین سفارش آماده‌اند؛
                  پس از تأیید مدیر کل (خانم لطفی) — که قیمت‌ها را نیز در هلو منتشر می‌کند — با بستن، پروندهٔ تحویل کامل می‌شود.
                </p>
                {/* R14: گام تأیید مدیر کل — پیش از بستن سفارش */}
                {d?.gmApprovedAt ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-[11px] font-bold text-emerald-800">
                    <I.shieldCheck size={14} className="-mt-0.5 inline align-middle" /> تأیید مدیر کل انجام شد{d.gmApprovedByName ? ` (${d.gmApprovedByName})` : ''} — قیمت‌ها منتشر شد؛ آمادهٔ بستن.
                  </div>
                ) : isGmRole ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200 bg-violet-50 p-2.5">
                    <span className="text-[11px] leading-5 text-violet-800">
                      <I.shieldCheck size={14} className="-mt-0.5 inline align-middle" /> این سفارش در انتظار تأیید نهایی شماست (مدیر کل — خانم لطفی).
                      با تأیید، قیمت فروش/قیمت چاپی روی کالاها و در هلو منتشر می‌شود.
                    </span>
                    <Button onClick={() => void gmApprove()} disabled={!!actBusy} className="gap-1 bg-violet-700 hover:bg-violet-800">
                      {actBusy === 'gm-approve' ? <I.loader size={15} className="animate-spin" /> : <I.shieldCheck size={15} />} تأیید مدیر کل (لطفی) و انتشار قیمت‌ها
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 p-2.5 text-[11px] text-violet-800">
                    <I.clock size={14} className="text-violet-400" /> در انتظار تأیید مدیر کل (خانم لطفی) — پس از ایشان، مدیر سفارش را می‌بندد.
                  </div>
                )}
                {isManager ? (
                  <div className="flex justify-end">
                    <Button onClick={() => void finalApprove()} disabled={actBusy === 'final' || !d?.gmApprovedAt} className="gap-1" title={d?.gmApprovedAt ? undefined : 'پیش از بستن، تأیید مدیر کل لازم است'}>
                      {actBusy === 'final' ? <I.loader size={15} className="animate-spin" /> : <I.check size={15} />} بستن سفارش
                    </Button>
                  </div>
                ) : null}"""
assert old in s
s = s.replace(old, new)

assert s != orig
io.open(p, 'w', encoding='utf-8').write(s)
print('ok — isGmRole:', s.count('isGmRole'), '| gmApprove:', s.count('gmApprove'))
