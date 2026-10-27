# R13 — GM-step UI edits for hz-ext/src/views/invoices.tsx
import io

p = 'hz-ext/src/views/invoices.tsx'
s = io.open(p, encoding='utf-8').read()
orig = s

# 1) STEPS + stepIndex → GM step
s = s.replace("""const STEPS: { key: string; label: string; actor: string }[] = [
  { key: 'draft', label: 'پیش‌نویس (پیش‌فاکتور)', actor: 'فاکتورنویس سودسنج' },
  { key: 'delivered', label: 'تأیید تحویل کالا', actor: 'کارمند دریافت‌کننده' },
  { key: 'reviewing', label: 'بررسی حسابداری', actor: 'حسابدار / مدیر' },
  { key: 'final', label: 'فاکتور خرید', actor: 'حسابدار / مدیر' },
  { key: 'archived', label: 'بایگانی سند', actor: 'حسابدار / مدیر' },
]
function stepIndex(state: string): number {
  if (state === 'archived') return 4
  if (state === 'final') return 3
  if (state === 'reviewing') return 2
  if (state === 'delivered') return 1
  return 0
}""", """const STEPS: { key: string; label: string; actor: string }[] = [
  { key: 'draft', label: 'پیش‌نویس (پیش‌فاکتور)', actor: 'فاکتورنویس سودسنج' },
  { key: 'delivered', label: 'تأیید تحویل کالا', actor: 'کارمند دریافت‌کننده' },
  { key: 'reviewing', label: 'بررسی حسابداری', actor: 'حسابدار / مدیر' },
  { key: 'final', label: 'فاکتور خرید', actor: 'حسابدار / مدیر' },
  { key: 'gm', label: 'تأیید مدیرعامل', actor: 'مدیرعامل (خانم لطفی)' },
  { key: 'archived', label: 'بایگانی سند', actor: 'حسابدار / مدیر' },
]
/* R13 — گام تأیید مدیرعامل: final بدون gmApproved → گام ۳؛ با تأیید → گام ۴؛ archived → ۵ */
function stepIndex(state: string, gmApproved?: string | null | boolean): number {
  if (state === 'archived') return 5
  if (state === 'final') return gmApproved ? 4 : 3
  if (state === 'reviewing') return 2
  if (state === 'delivered') return 1
  return 0
}""")

# 2) Row interface
s = s.replace("""  dateJalali: string | null
  createdAt: string
  finalizedAt: string | null
}""", """  dateJalali: string | null
  createdAt: string
  finalizedAt: string | null
  gmApprovedAt: string | null
  gmPending: boolean
}""")

# 3) Detail interface
s = s.replace("""  finalizedByName: string | null
  cancelledByName: string | null""", """  finalizedByName: string | null
  gmApprovedAt: string | null
  gmApprovedByName: string | null
  cancelledByName: string | null""")

# 4) GM_ROLES + canGm flag
s = s.replace("""const MANAGER_ROLES = ['OWNER', 'GM', 'ADMIN']
const MARGIN_ROLES = ['OWNER', 'GM', 'ADMIN', 'ACC']""", """const MANAGER_ROLES = ['OWNER', 'GM', 'ADMIN']
const MARGIN_ROLES = ['OWNER', 'GM', 'ADMIN', 'ACC']
/* R13 — تأیید نهایی مدیرعامل (خانم لطفی)؛ در نبودِ ایشان مالک/ادمین */
const GM_ROLES = ['GM', 'OWNER', 'ADMIN']""")
s = s.replace("""  const isManager = MANAGER_ROLES.includes(role)
  const canEditDraft = MARGIN_ROLES.includes(role)""", """  const isManager = MANAGER_ROLES.includes(role)
  const canEditDraft = MARGIN_ROLES.includes(role)
  const canGm = GM_ROLES.includes(role)""")

# 5) header description
s = s.replace("""                پیش‌فاکتورِ ثبت‌شده در «سودسنج» را کارمندِ دریافت‌کننده تأیید تحویل می‌کند؛ خانم درویشی (یا یکی از مدیرها)
                قیمت‌ها و حاشیهٔ سود را بررسی و اقلام مشکل‌دار را مرجوع می‌کند؛ فاکتور خرید نهایی می‌شود (موجودی + هلو)
                و سند کاغذی در زون‌بند بایگانی می‌شود — همان‌جا هم پیدا.""", """                پیش‌فاکتورِ ثبت‌شده در «سودسنج» را کارمندِ دریافت‌کننده تأیید تحویل می‌کند؛ خانم درویشی (یا یکی از مدیرها)
                قیمت‌ها و حاشیهٔ سود را بررسی و اقلام مشکل‌دار را مرجوع می‌کند؛ فاکتور خرید نهایی می‌شود (موجودی + هلو)؛
                مدیرعامل (خانم لطفی) سود و قیمت‌ها را نهایی تأیید می‌کند و قیمت‌ها در هلو منتشر می‌شود؛ سپس سند کاغذی در زون‌بند بایگانی می‌شود — همان‌جا هم پیدا.""")

# 6) list stepper highlight index
s = s.replace("i === 4 ? 'bg-emerald-50 border-emerald-200 text-emerald-800'", "i === STEPS.length - 1 ? 'bg-emerald-50 border-emerald-200 text-emerald-800'")

# 7) status cell chip — add gmPending chip after state chip
s = s.replace("""                    <TableCell><span className={cn('inline-block rounded-full border px-2 py-0.5 text-[10px]', STATE_CLS[r.state])}>{STATE_FA[r.state]}</span></TableCell>""", """                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={cn('inline-block rounded-full border px-2 py-0.5 text-[10px]', STATE_CLS[r.state])}>{STATE_FA[r.state]}</span>
                        {r.gmPending ? <span className="inline-block rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[9px] text-violet-700" title="پیش از بایگانی، تأیید مدیرعامل لازم است">در انتظار مدیرعامل</span> : null}
                      </div>
                    </TableCell>""")

# 8) dialog size — near fullscreen
s = s.replace('<DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">', '<DialogContent className="w-[97vw] max-w-[1700px] max-h-[94vh] overflow-y-auto">')

# 9) dialog stepper — gm-aware index
s = s.replace("""                {STEPS.map((s, i) => {
                  const cur = stepIndex(dState)""", """                {STEPS.map((s, i) => {
                  const cur = stepIndex(dState, detail.gmApprovedAt)""")

# 10) final actions block — GM approve button + gated archive + info text
old_final = """                {dState === 'final' && canReview ? (
                  <Button disabled={busy} onClick={() => { setArchForm({ binderId: '', folio: '', holooInvoiceNo: detail.holooInvoiceNo || '', holooReceiptNo: detail.holooReceiptNo || '', scanDataUrl: '', scanName: '' }); setArchiveOpen(true) }}>
                    <I.bookOpen size={14} /> بایگانی سند کاغذی
                  </Button>
                ) : null}
                {dState === 'final' ? (
                  <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-800 leading-6">
                    فاکتور خرید نهایی شده{detail.finalizedByName ? ` (${detail.finalizedByName})` : ''} — سند خرید{' '}
                    {detail.order ? <b>{fa(detail.order.code)}</b> : 'ثبت‌شده'} و موجودی/قیمت کالاها به‌روز است.
                    {detail.holooInvoiceNo ? ` شماره فاکتور هلو: ${fa(detail.holooInvoiceNo)}.` : ' اگر در هلو ثبت شد، شماره‌اش را هنگام بایگانی وارد کنید.'}
                    حالا سند کاغذی را در زون‌کن بایگانی و «بایگانی سند کاغذی» را بزنید.
                  </div>
                ) : null}"""
new_final = """                {dState === 'final' && detail.gmApprovedAt ? (
                  <Button disabled={busy} onClick={() => { setArchForm({ binderId: '', folio: '', holooInvoiceNo: detail.holooInvoiceNo || '', holooReceiptNo: detail.holooReceiptNo || '', scanDataUrl: '', scanName: '' }); setArchiveOpen(true) }}>
                    <I.bookOpen size={14} /> بایگانی سند کاغذی
                  </Button>
                ) : null}
                {dState === 'final' && !detail.gmApprovedAt && canGm ? (
                  <Button disabled={busy} className="bg-violet-700 hover:bg-violet-800" onClick={() => void act(detail.id, { action: 'gm-approve' }, 'تأیید مدیرعامل انجام شد — قیمت‌ها در سر رسید و هلو به‌روز شد؛ آمادهٔ بایگانی')}>
                    <I.shieldCheck size={14} /> تأیید مدیرعامل (لطفی) و انتشار قیمت‌ها
                  </Button>
                ) : null}
                {dState === 'final' ? (
                  <div className={cn('w-full rounded-lg border p-3 text-[11px] leading-6', detail.gmApprovedAt ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-violet-200 bg-violet-50 text-violet-800')}>
                    {detail.gmApprovedAt ? (
                      <>
                        تأیید مدیرعامل انجام شد{detail.gmApprovedByName ? ` (${detail.gmApprovedByName})` : ''} — قیمت فروش (نهایی) و قیمت چاپی (قیمت فروش ۲) روی کالاها به‌روز و در هلو منتشر شد.
                        حالا سند کاغذی را در زون‌کن بایگانی و «بایگانی سند کاغذی» را بزنید.
                      </>
                    ) : (
                      <>
                        فاکتور خرید ثبت شده{detail.finalizedByName ? ` (${detail.finalizedByName})` : ''} — سند خرید{' '}
                        {detail.order ? <b>{fa(detail.order.code)}</b> : 'ثبت‌شده'} و موجودی به‌روز است.
                        {detail.holooInvoiceNo ? ` شماره فاکتور هلو: ${fa(detail.holooInvoiceNo)}.` : ''}
                        {' '}اکنون در انتظار تأیید نهایی مدیرعامل (خانم لطفی) است؛ پس از تأیید، قیمت‌ها در هلو منتشر و بایگانی ممکن می‌شود.
                      </>
                    )}
                  </div>
                ) : null}"""
s = s.replace(old_final, new_final)

# 11) finalize dialog description
s = s.replace('با ثبت، سند خرید تشکیل، موجودی و قیمت‌های کالا به‌روز و (در صورت انتخاب) به هلو ارسال می‌شود.', 'با ثبت، سند خرید تشکیل و موجودی به‌روز می‌شود و (در صورت انتخاب) فاکتور به هلو ارسال می‌شود. انتشار قیمت‌ها پس از تأیید مدیرعامل انجام می‌شود.')

# 12) finalize success toast
s = s.replace("await act(detail.id, { action: 'finalize', payMethod, pushToHoloo }, 'فاکتور خرید ثبت شد — سند خرید و موجودی به‌روز شد')", "await act(detail.id, { action: 'finalize', payMethod, pushToHoloo }, 'فاکتور خرید ثبت شد — در انتظار تأیید مدیرعامل (خانم لطفی)')")

assert s != orig, 'no changes applied'
io.open(p, 'w', encoding='utf-8').write(s)
checks = ['gm-approve', 'تأیید مدیرعامل', 'w-[97vw]', 'gmPending', 'stepIndex(dState, detail.gmApprovedAt)', 'STEPS.length - 1', 'canGm']
for c in checks:
    print(c, s.count(c))
