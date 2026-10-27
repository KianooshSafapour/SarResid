/** R13: dump sheet names + header rows of the new آبان upload files */
import * as XLSX from 'xlsx'
import path from 'path'
const UPLOAD = path.join(__dirname, '..', 'upload')
const files = [
  'خريد آبان‌ماه 1405.xls',
  'فروش آبان‌ماه 1405.xls',
  'موجودي کل انبار منتهي به 1405.08.05_0835.xls',
  'مشخصات کالاهاي انبار 1405.08.05_1033.xls',
]
for (const f of files) {
  const wb = XLSX.readFile(path.join(UPLOAD, f))
  console.log(`\n=== ${f} ===`)
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })
    console.log(`  sheet «${sn}» rows=${rows.length}`)
    for (let r = 0; r < Math.min(3, rows.length); r++) {
      console.log(`   r${r}: ${JSON.stringify((rows[r] || []).slice(0, 30)).slice(0, 1500)}`)
    }
  }
}
