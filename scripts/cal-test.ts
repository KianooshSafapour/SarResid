import { buildOfficialDays } from '../src/lib/iranian-calendar'
const days = buildOfficialDays(1404)
console.log('total', days.length)
for (const d of days) console.log(d.date, '|', d.kind.padEnd(8), '|', d.hijriLabel.padEnd(14), '|', d.title)
