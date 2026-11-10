# R14 — receiving.tsx: off-schedule confirm dialog + per-row barcode scan
import io

p = 'hz-ext/src/views/receiving.tsx'
s = io.open(p, encoding='utf-8').read()
orig = s

# 0) imports: Textarea + todayJalali + jalaliToDate
old_imp = """  Checkbox,
  money, toman, fa, toEnDigits, toFaDigits, formatJalali, I,
  MoneyInput, NumInput,
} from '../lib/hz'"""
new_imp = """  Checkbox, Textarea,
  money, toman, fa, toEnDigits, toFaDigits, formatJalali, todayJalali, jalaliToDate, I,
  MoneyInput, NumInput,
} from '../lib/hz'"""
assert old_imp in s
s = s.replace(old_imp, new_imp)

# 1) row model: scan state
old_rows = """      receivedQty: it.receivedQty != null ? it.receivedQty : it.qty,
      returnedQty: it.returnedQty ?? 0,
      returnReason: it.returnReason ?? '',
    })))"""
new_rows = """      receivedQty: it.receivedQty != null ? it.receivedQty : it.qty,
      returnedQty: it.returnedQty ?? 0,
      returnReason: it.returnReason ?? '',
      /* R14: اسکن بارکد همین ردیف */
      productId: it.productId ?? null,
      scanInput: '',
      scanState: (it.productId == null ? 'na' : 'idle') as 'na' | 'idle' | 'ok' | 'new' | 'err',
    })))"""
assert old_rows in s
s = s.replace(old_rows, new_rows)

# 2) startReceive gate + off-schedule dialog + scanBarcode fn
old_start = """  /* شروع دریافت — درِ انبار باز می‌شود */
  async function startReceive() {
    if (!detail) return
    const d = await patchAction(detail.id, 'start-receive', undefined, 'start')
    if (!d) return
    toast.success(`دریافت ${d.code} شروع شد — اقلام را همان‌طور که رسیدند ثبت کنید`)
    initRows(d.items ?? [])
  }"""
new_start = """  /* شروع دریافت — درِ انبار باز می‌شود.
     R14: اگر امروز با تاریخ تحویل سفارش یکی نیست، ابتدا هشدار + توضیح اجباری می‌گیریم. */
  async function startReceive(offNote?: string, offDays?: number) {
    if (!detail) return
    const extra = offNote ? { offScheduleNote: offNote, offScheduleDays: offDays } : undefined
    const d = await patchAction(detail.id, 'start-receive', extra, 'start')
    if (!d) return
    toast.success(`دریافت ${d.code} شروع شد — اقلام را همان‌طور که رسیدند ثبت کنید`)
    initRows(d.items ?? [])
  }

  /* R14: آیا دریافت خارج از پنجرهٔ تحویل است؟ مثبت = زودتر، منفی = دیرتر */
  function offScheduleDaysOf(): number | null {
    const dd = detail?.deliveryDate
    if (!dd || !/^\\d{4}-\\d{2}-\\d{2}$/.test(dd)) return null
    try {
      const a = jalaliToDate(dd.replace(/-/g, '/')).getTime()
      const b = jalaliToDate(todayJalali().replace(/-/g, '/')).getTime()
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null
      return Math.round((a - b) / 86400000)
    } catch {
      return null
    }
  }

  /* R14: اسکن بارکد یک ردیف — شناخته؟ ✓ جدید؟ ثبت در بانک بارکد (+صف هلو) */
  async function scanBarcode(i: number) {
    if (!detail) return
    const it = rows?.[i]
    if (!it || !it.productId) return
    const code = String(it.scanInput ?? '').trim()
    if (!code) return
    const r = await api(`/api/orders/${detail.id}`, { method: 'PATCH', body: { action: 'scan-barcode', itemId: it.id, barcode: code } })
    if (!r.ok) {
      patchRow(i, { scanState: 'err' })
      return toast.error(r.error || 'اسکن ثبت نشد')
    }
    if (r.data?.known) {
      patchRow(i, { scanState: 'ok', scanInput: '' })
      toast.success(`بارکد ${toFaDigits(code)} با این کالا مطابقت دارد ✓`)
    } else {
      patchRow(i, { scanState: 'new', scanInput: '' })
      toast.success(`بارکد جدید ${toFaDigits(code)} برای «${it.name}» ثبت شد — در بانک بارکد سر رسید و صف هلو`)
    }
  }"""
assert old_start in s
s = s.replace(old_start, new_start)

# 3) شروع دریافت button → gate on off-schedule
old_btn = """                {canReceive ? (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void startReceive()} disabled={actBusy === 'start'} className="gap-2">
                      {actBusy === 'start' ? <I.loader size={16} className="animate-spin" /> : <I.play size={16} />} شروع دریافت کالا
                    </Button>
                  </div>
                ) : ("""
new_btn = """                {canReceive ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => {
                        const off = offScheduleDaysOf()
                        if (off != null && off !== 0) setOffDlg({ open: true, days: off, note: '' })
                        else void startReceive()
                      }}
                      disabled={actBusy === 'start'}
                      className="gap-2"
                    >
                      {actBusy === 'start' ? <I.loader size={16} className="animate-spin" /> : <I.play size={16} />} شروع دریافت کالا
                    </Button>
                  </div>
                ) : ("""
assert old_btn in s
s = s.replace(old_btn, new_btn)

# 4) off-schedule state
old_state = "  const [actBusy, setActBusy] = useState<string | null>(null)"
assert old_state in s
s = s.replace(old_state, old_state + """
  /* R14: دریافت خارج از پنجرهٔ تحویل — تأیید + توضیح اجباری */
  const [offDlg, setOffDlg] = useState<{ open: boolean; days: number; note: string } | null>(null)""")

# 5) per-row scan input — در خطِ متای زیر نام کالا
old_meta = """                            <span className="flex flex-wrap items-center gap-1 text-[10px] text-stone-400">
                              <span>سفارش: {fa(it.qty)}</span>
                              {printedDiffers && ("""
new_meta = """                            <span className="flex flex-wrap items-center gap-1 text-[10px] text-stone-400">
                              <span>سفارش: {fa(it.qty)}</span>
                              {it.productId ? (
                                <span className="flex items-center gap-1" title="بارکد کالا را با اسکنر در این کادر بزنید و Enter — اگر بارکد جدید باشد برای همین کالا ثبت می‌شود">
                                  <Input
                                    value={it.scanInput}
                                    onChange={(e: any) => patchRow(i, { scanInput: e.target.value })}
                                    onKeyDown={(e: any) => { if (e.key === 'Enter') { e.preventDefault(); void scanBarcode(i) } }}
                                    placeholder="اسکن بارکد…"
                                    dir="ltr"
                                    className="h-6 w-32 border-stone-200 bg-white px-1.5 text-[10px] focus-visible:ring-teal-400"
                                  />
                                  {it.scanState === 'ok' ? <span className="rounded bg-emerald-100 px-1 py-px font-bold text-emerald-700">✓ مطابقت</span> : null}
                                  {it.scanState === 'new' ? <span className="rounded bg-sky-100 px-1 py-px font-bold text-sky-700">بارکد جدید ثبت شد</span> : null}
                                  {it.scanState === 'err' ? <span className="rounded bg-rose-100 px-1 py-px font-bold text-rose-700">خطا</span> : null}
                                </span>
                              ) : null}
                              {printedDiffers && ("""
assert old_meta in s
s = s.replace(old_meta, new_meta)

# 6) off-schedule dialog JSX — before the last closing of the view (anchor: آخرین Dialog یا </div>) — append near other dialogs; find a stable anchor: the проندهٔ بسته Card end is risky; use the add-item dialog if exists? Safer: append right before the closing `</div>\n  )\n}` of the component return.
anchor = s.rstrip()
assert anchor.endswith('}') or True
idx = s.rfind('\n      )\n    }\n  )')
# fallback: find end of file component return — place before last '}' is unreliable in tsx; instead anchor to a known dialog close.
# Use the 'کالای اضافی' dialog existence:
if 'openAddDlg' in s:
    # anchor after the last Dialog block: search for '</Dialog>' last occurrence
    last_dlg = s.rfind('</Dialog>')
    assert last_dlg > 0
    insert_at = last_dlg + len('</Dialog>')
    dialog_jsx = """

      {/* ── R14: هشدار دریافت خارج از تاریخ تحویل ── */}
      <Dialog open={!!offDlg?.open} onOpenChange={(o: boolean) => { if (!o) setOffDlg(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <I.alertTriangle size={17} /> دریافت خارج از تاریخ تحویل
            </DialogTitle>
            <DialogDescription className="text-[12px] leading-6">
              تاریخ تحویل این سفارش {fa(detail?.deliveryDate ?? '—')} است —
              {(offDlg?.days ?? 0) > 0
                ? ` یعنی ${fa(Math.abs(offDlg?.days ?? 0))} روز زودتر از موعد دریافت می‌کنید.`
                : ` یعنی ${fa(Math.abs(offDlg?.days ?? 0))} روز دیرتر از موعد دریافت می‌کنید.`}
              {' '}اگر مطمئنید، دلیل آن را بنویسید (حداقل ۵ حرف) تا در پروندهٔ سفارش ثبت شود.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={offDlg?.note ?? ''}
            onChange={(e: any) => setOffDlg((d) => (d ? { ...d, note: e.target.value } : d))}
            placeholder="مثلاً: تأمین‌کننده زودتر از قرار آورد / ترخیص به‌دلیل کمبود موجودی جلو افتاد…"
            className="min-h-20 text-xs"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOffDlg(null)}>انصراف</Button>
            <Button
              className="gap-1 bg-rose-700 hover:bg-rose-800"
              disabled={(offDlg?.note ?? '').trim().length < 5 || actBusy === 'start'}
              onClick={() => {
                if (!offDlg) return
                setOffDlg(null)
                void startReceive(offDlg.note.trim(), offDlg.days)
              }}
            >
              <I.alertTriangle size={14} /> تأیید دریافت خارج از موعد و ثبت توضیح
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>"""
    s = s[:insert_at] + dialog_jsx + s[insert_at:]
else:
    raise SystemExit('anchor dialog not found')

assert s != orig
io.open(p, 'w', encoding='utf-8').write(s)
print('receiving R14 scan+off patched')
