// Verify HZ module IDs exist in live chunks and export the names lib/hz.ts imports
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
const DIR = 'public/_next/static/chunks'
const files = readdirSync(DIR).filter(f => f.endsWith('.js'))
// module defs look like: 123456,e=>{...e.s(["name",()=>..., "name2",()=>...])}
const wanted: Record<string, string[]> = {
  '271645': ['default', 'useState', 'useEffect', 'useMemo', 'useRef', 'useCallback', 'useReducer', 'useContext', 'memo', 'Fragment'],
  '843476': ['jsx', 'jsxs'],
  '29481': ['api', 'qs'],
  '573254': ['useShell'],
  '975157': ['cn', 'Button', 'buttonVariants'],
  '793479': ['Input'],
  '956657': ['JALALI_MONTHS', 'WEEKDAY_FA', 'addJalaliDays', 'formatJalali', 'formatJalaliLong', 'jalaliMonthLength', 'jalaliToDate', 'jalaliWeekStart', 'jalaliWeekday', 'parseJalali', 'toEnDigits', 'toFaDigits', 'toJalali', 'todayJalali'],
  '846696': ['toast'],
  '995926': ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription', 'DialogFooter', 'DialogClose'],
  '515288': ['Card', 'CardHeader', 'CardTitle', 'CardDescription', 'CardContent', 'CardFooter'],
  '967489': ['Select', 'SelectTrigger', 'SelectValue', 'SelectContent', 'SelectItem'],
  '487486': ['Badge'],
  '784774': ['Table', 'TableHeader', 'TableBody', 'TableHead', 'TableRow', 'TableCell'],
  '677572': ['Tabs', 'TabsList', 'TabsTrigger', 'TabsContent'],
  '168148': ['Progress'],
  '257428': ['Checkbox'],
  '624687': ['Textarea'],
  '337822': ['Popover'],
  '475254': ['X', 'Check', 'Plus', 'Loader2', 'ChevronDown', 'Search', 'Printer', 'Calendar', 'AlertTriangle', 'Users', 'Package', 'Send', 'Save', 'ClipboardList', 'Store', 'TrendingUp', 'Info', 'ChevronLeft', 'ChevronRight', 'CircleDot', 'Pencil', 'Trash2', 'Clock', 'BarChart3', 'Sparkles', 'Timer', 'TrendingDown'],
}
// build a map of all module definitions across chunks
const defs = new Map<string, { file: string, exportsList: string }>()
const re = /(\d{4,7}),e=>\{"use strict";/
// simpler: find `ID,e=>{` then capture the following e.s([...]) — scan text
for (const f of files) {
  const txt = readFileSync(join(DIR, f), 'utf8')
  for (const id of Object.keys(wanted)) {
    if (defs.has(id)) continue
    const at = txt.indexOf(`${id},e=>`)
    if (at < 0) continue
    // find e.s([ after module start within next 30k chars
    const seg = txt.slice(at, at + 40000)
    const es = seg.indexOf('e.s([')
    if (es < 0) { defs.set(id, { file: f, exportsList: 'NO e.s FOUND' }); continue }
    const end = seg.indexOf('])', es)
    defs.set(id, { file: f, exportsList: seg.slice(es + 5, end) })
  }
}
let fail = 0
for (const [id, names] of Object.entries(wanted)) {
  const d = defs.get(id)
  if (!d) { console.log(`✗ ${id}: module NOT FOUND in any chunk`); fail++; continue }
  const ex = d.exportsList
  const missing = names.filter(n => !new RegExp(`"${n}"`).test(ex))
  if (missing.length) { console.log(`✗ ${id} (${d.file}): missing exports ${missing.join(',')} | have: ${ex.slice(0, 200)}`); fail++ }
  else console.log(`✓ ${id} — all ${names.length} exports ok (${d.file})`)
}
console.log(fail === 0 ? 'ALL MODULES VERIFIED' : `${fail} PROBLEMS`)
process.exit(fail === 0 ? 0 : 1)
