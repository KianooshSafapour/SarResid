# R15 — gondola side zones + story→column lane flow
import io

# ── 1) lane-checks route: structured lane acceptance (side · story / column) ──
p = 'src/app/api/lane-checks/route.ts'
s = io.open(p, encoding='utf-8').read()
orig = s
old = """  const [sections, map] = await Promise.all([loadSections(), readLaneMap()])
  if (!sections.some((s) => s.label === sectionLabel)) return fail(`بخش «${sectionLabel}» در فروشگاه شناخته نشد`)
  const allowed = lanesFor(sectionLabel, map)
  if (!allowed.includes(lane)) return fail(`ردیف «${lane}» برای بخش «${sectionLabel}» تعریف نشده است`)"""
new = """  const [sections, map] = await Promise.all([loadSections(), readLaneMap()])
  if (!sections.some((s) => s.label === sectionLabel)) return fail(`بخش «${sectionLabel}» در فروشگاه شناخته نشد`)
  const allowed = lanesFor(sectionLabel, map)
  /* R15: ردیف ساختاری «سمت چپ|راست · طبقهٔ N / ستون M» بدون تعریف در ویرایشگر پذیرفته
     می‌شود — گوندولا‌ها دو سمت دارند و هر طبقه چند ستون؛ مدیر برای بازبینی انقضا
     همان ترکیب را در فرم می‌چیند. */
  const STRUCTURED_LANE_RE = /^(سمت (چپ|راست) · )?طبقهٔ [۱-۷]( \/ ستون [۱-۹]\\d?)?$/
  if (!allowed.includes(lane) && !STRUCTURED_LANE_RE.test(lane)) {
    return fail(`ردیف «${lane}» برای بخش «${sectionLabel}» تعریف نشده است`)
  }"""
assert old in s
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8').write(s)
print('lane api ok')

# ── 2) lanecheck.tsx: hierarchical lane picker in POST flow (step 2) ──
p = 'hz-ext/src/views/lanecheck.tsx'
s = io.open(p, encoding='utf-8').read()
orig = s

# find the lane-selection step (2) block — anchor on lanesOf(section).map usage in the wizard
import re
# add state near lane state
m = re.search(r"(const \[lane, setLane\] = useState\(''\)\n)", s)
assert m
s = s.replace(m.group(1), m.group(1) + """  /* R15: چینش ساختاری ردیف — سمت (برای گوندولا) ← طبقه ← ستون */
  const [laneSide, setLaneSide] = useState('')
  const [laneStory, setLaneStory] = useState('')
""")

# patch the step-2 lane chips grid: replace lanesOf(section).map( ... onClick setLane) block
old_grid = """                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {lanesOf(section).map((l) => {"""
assert old_grid in s
# add hierarchical picker BEFORE the grid
new_pre = """                    {/* R15: چینندهٔ ساختاری — سمت ← طبقه ← ستون؛ خروجی ردیفِ ترکیبی */}
                    {(() => {
                      const sec = sections.find((x: any) => x.label === section)
                      const isGondola = (sec as any)?.kind === 'GONDOLA'
                      const STORIES = ['طبقهٔ ۱', 'طبقهٔ ۲', 'طبقهٔ ۳', 'طبقهٔ ۴', 'طبقهٔ ۵', 'طبقهٔ ۶', 'طبقهٔ ۷']
                      const COLS = ['ستون ۱', 'ستون ۲', 'ستون ۳', 'ستون ۴', 'ستون ۵']
                      const composed = `${laneSide ? `${laneSide} · ` : ''}${laneStory}${/ستون/.test(lane) && lane.includes('/') ? ` / ${lane.split('/ ')[1]}` : ''}`
                      const chip = (on: boolean) => cn('rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-all', on ? 'border-teal-600 bg-teal-600 text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-teal-400')
                      return (
                        <div className="space-y-2 rounded-xl border border-teal-200 bg-teal-50/40 p-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-bold text-teal-800">چینش ردیف:</span>
                            {isGondola ? (
                              <>
                                <button type="button" className={chip(laneSide === 'سمت چپ')} onClick={() => setLaneSide('سمت چپ')}>سمت چپ</button>
                                <button type="button" className={chip(laneSide === 'سمت راست')} onClick={() => setLaneSide('سمت راست')}>سمت راست</button>
                              </>
                            ) : null}
                            <button type="button" className={chip(!laneSide && !isGondola)} onClick={() => setLaneSide('')} hidden={isGondola}>—</button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {STORIES.map((st) => (
                              <button key={st} type="button" className={chip(laneStory === st)} onClick={() => setLaneStory(st)}>{st}</button>
                            ))}
                          </div>
                          {laneStory ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] text-stone-500">ستون این طبقه:</span>
                              {COLS.map((c) => {
                                const full = `${laneSide ? `${laneSide} · ` : ''}${laneStory} / ${c}`
                                return (
                                  <button key={c} type="button" className={chip(lane === full)} onClick={() => { setLane(full); resetForm(); setStep(3) }}>{c}</button>
                                )
                              })}
                              <button type="button" className={chip(lane === `${laneSide ? `${laneSide} · ` : ''}${laneStory}`)} onClick={() => { setLane(`${laneSide ? `${laneSide} · ` : ''}${laneStory}`); resetForm(); setStep(3) }}>کل طبقه</button>
                            </div>
                          ) : null}
                          {lane && (lane.includes('·') || lane.includes('/')) ? (
                            <div className="text-[10px] text-teal-800">ردیف انتخاب‌شده: <b>{lane}</b></div>
                          ) : null}
                        </div>
                      )
                    })()}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {lanesOf(section).map((l) => {"""
s = s.replace(old_grid, new_pre, 1)
io.open(p, 'w', encoding='utf-8').write(s)
print('lanecheck view ok')
