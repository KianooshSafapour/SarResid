# R13 — per-person lane assignment UI for hz-ext/src/views/lanecheck.tsx
import io

p = 'hz-ext/src/views/lanecheck.tsx'
s = io.open(p, encoding='utf-8').read()
orig = s

# 1) Data type
s = s.replace("""  todayPlan?: TodayPlan
  mutedUsers?: string[]
}""", """  todayPlan?: TodayPlan
  mutedUsers?: string[]
  assignments?: Record<string, { section: string; lane: string }[]>
}""")

# 2) state + handlers (after mutingId)
s = s.replace("""  const [mutingId, setMutingId] = useState<string | null>(null)""", """  const [mutingId, setMutingId] = useState<string | null>(null)
  /* R13 — تکلیف ردیف‌های مشخص به هر نفر (مدیر) */
  const [assignFor, setAssignFor] = useState<PlanPerson | null>(null)
  const [assignLanes, setAssignLanes] = useState<{ section: string; lane: string }[]>([])
  const [aSec, setASec] = useState('')
  const [assignSaving, setAssignSaving] = useState(false)""")

# 3) open/save handlers after jumpToCheck block
s = s.replace("""  /** پرش مستقیم از «برنامهٔ امروز» به فرم ثبتِ همان ردیف، با همان شخص/بخش/ردیف */
  function jumpToCheck(person: PlanPerson, l: PlanLane) {
    resetForm()
    setMerch({ id: person.userId || '', fullName: person.name, honorific: '', title: person.username ? `@${person.username}` : '', role: person.role || '' })
    setSection(l.section)
    setLane(l.lane)
    setStep(3)
  }""", """  /** پرش مستقیم از «برنامهٔ امروز» به فرم ثبتِ همان ردیف، با همان شخص/بخش/ردیف */
  function jumpToCheck(person: PlanPerson, l: PlanLane) {
    resetForm()
    setMerch({ id: person.userId || '', fullName: person.name, honorific: '', title: person.username ? `@${person.username}` : '', role: person.role || '' })
    setSection(l.section)
    setLane(l.lane)
    setStep(3)
  }

  /* ── R13: تکلیف چند ردیف مشخص از بخش‌های خودِ نفر به خودش (مدیر) ── */
  function openAssign(person: PlanPerson) {
    setAssignFor(person)
    setAssignLanes((data?.assignments?.[person.userId || ''] || []).slice())
    setASec(person.sections[0] || '')
  }
  function toggleAssignLane(section: string, lane: string) {
    setAssignLanes((cur) => {
      const hit = cur.some((l) => l.section === section && l.lane === lane)
      if (hit) return cur.filter((l) => !(l.section === section && l.lane === lane))
      if (cur.length >= 12) { toast.error('حداکثر ۱۲ ردیف برای هر نفر'); return cur }
      return [...cur, { section, lane }]
    })
  }
  async function saveAssign(clear = false) {
    if (!assignFor?.userId) return
    setAssignSaving(true)
    const r = await api('/api/lane-checks?assign=' + encodeURIComponent(assignFor.userId), {
      method: 'PUT',
      body: { lanes: clear ? [] : assignLanes },
    })
    setAssignSaving(false)
    if (!r.ok) return toast.error(r.error || 'تکلیف ذخیره نشد')
    toast.success(clear ? 'تکلیف پاک شد — برنامهٔ تصادفی روزانه برمی‌گردد' : `${fa(assignLanes.length)} ردیف به ${assignFor.name} سپرده شد`)
    setAssignFor(null)
    await refresh()
  }""")

# 4) person card: assigned badge + button (insert before the done counter span)
s = s.replace("""                      <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold', done === total ? 'bg-emerald-600 text-white' : done > 0 ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-500')}>
                        {fa(done)}/{fa(total)} ثبت شد
                      </span>
                    </div>""", """                      <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold', done === total ? 'bg-emerald-600 text-white' : done > 0 ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-500')}>
                        {fa(done)}/{fa(total)} ثبت شد
                      </span>
                      {p.userId ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 shrink-0 gap-1 border-violet-200 px-2 text-[10px] text-violet-700 hover:bg-violet-50"
                          onClick={() => openAssign(p)}
                          title="چند ردیفِ مشخص از بخش‌های این نفر را برای بازبینی انقضا به او بسپارید"
                        >
                          <I.clipboard size={12} /> {data?.assignments?.[p.userId]?.length ? 'ویرایش تکلیف' : 'تکلیف ردیف‌ها'}
                        </Button>
                      ) : null}
                    </div>
                    {data?.assignments?.[p.userId || '']?.length ? (
                      <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-2 py-1 text-[10px] font-bold text-violet-800">
                        تکلیفِ مدیر — این ردیف‌ها را مدیر مشخص کرده است (جایگزین نمونهٔ تصادفی)
                      </div>
                    ) : null}""")

# 5) subtitle text update
s = s.replace("هر روز ۲ تا ۴ ردیف از بخش‌های هر مسؤول به‌صورت تصادفی — پایدار در طول امروز، متفاوت برای فردا؛ بازرسی انقضا روی کل ماه پخش می‌شود", "هر روز ۲ تا ۴ ردیف از بخش‌های هر مسؤول به‌صورت تصادفی — پایدار در طول امروز، متفاوت برای فردا؛ بازرسی انقضا روی کل ماه پخش می‌شود · مدیر می‌تواند با «تکلیف ردیف‌ها» چند ردیفِ مشخص فقط از بخش‌های خودِ همان نفر بسپارد")

# 6) assign dialog before the laneMap dialog (anchor: Dialog open={dlg.open})
s = s.replace("""      <Dialog open={dlg.open} onOpenChange={(o: boolean) => setDlg((d) => ({ ...d, open: o }))}>""", """      {/* ── R13: دیالوگ تکلیف ردیف‌های یک نفر ── */}
      <Dialog open={!!assignFor} onOpenChange={(o: boolean) => { if (!o) setAssignFor(null) }}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          {assignFor ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <I.clipboard size={16} className="text-violet-700" /> تکلیف ردیف‌های انقضا — {assignFor.name}
                </DialogTitle>
                <DialogDescription className="text-[12px] leading-6">
                  فقط از بخش‌های خودِ این نفر انتخاب کنید ({fa(assignFor.sections.length)} بخش: {assignFor.sections.join('، ')}).
                  ردیف‌های تیک‌خورده جای برنامهٔ تصادفی امروزِ او را می‌گیرند و به او اعلان می‌رود. خالی‌کردن همه = بازگشت به برنامهٔ تصادفی.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {assignFor.sections.map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setASec(sec)}
                      className={cn('rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors', aSec === sec ? 'border-violet-500 bg-violet-100 text-violet-800' : 'border-stone-200 bg-white text-stone-600 hover:border-violet-300')}
                    >
                      {sec}
                    </button>
                  ))}
                </div>
                {aSec ? (
                  <div>
                    <p className="mb-1.5 text-[11px] font-bold text-stone-500">ردیف‌های «{aSec}» — برای افزودن/حذف کلیک کنید</p>
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                      {lanesOf(aSec).map((l) => {
                        const on = assignLanes.some((x) => x.section === aSec && x.lane === l)
                        return (
                          <button
                            key={l}
                            type="button"
                            onClick={() => toggleAssignLane(aSec, l)}
                            className={cn('rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-all', on ? 'border-violet-500 bg-violet-600 text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-violet-300')}
                          >
                            {on ? '✓ ' : ''}{l}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] text-stone-400">برای شروع، یکی از بخش‌های بالا را انتخاب کنید.</p>
                )}
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5">
                  <p className="text-[11px] font-bold text-stone-600">تکلیف فعلی ({fa(assignLanes.length)} ردیف)</p>
                  <p className="mt-1 text-[11px] leading-5 text-stone-600" dir="rtl">
                    {assignLanes.length ? assignLanes.map((l) => `${l.section} — ${l.lane}`).join(' · ') : '— هیچ — (برنامهٔ تصادفی روزانه)'}
                  </p>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" disabled={assignSaving || !(data?.assignments?.[assignFor.userId || '']?.length)} onClick={() => void saveAssign(true)}>پاک‌کردن تکلیف</Button>
                <Button variant="outline" disabled={assignSaving} onClick={() => setAssignFor(null)}>انصراف</Button>
                <Button disabled={assignSaving || assignLanes.length === 0} onClick={() => void saveAssign(false)}>
                  {assignSaving ? 'در حال ذخیره…' : `ذخیرهٔ تکلیف (${fa(assignLanes.length)} ردیف)`}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dlg.open} onOpenChange={(o: boolean) => setDlg((d) => ({ ...d, open: o }))}>""")

assert s != orig
io.open(p, 'w', encoding='utf-8').write(s)
for c in ['openAssign', 'saveAssign', 'تکلیف ردیف‌ها', 'assignments?', 'toggleAssignLane']:
    print(c, s.count(c))
