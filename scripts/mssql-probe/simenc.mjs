const encKey = '!TNC@23067#'
const stored = '>>E=>>@S>>@S>>EE>>E@>>E@>>EE>>EE'
const pw = '30076677'
const L = encKey.length
let t = ''
for (const c of pw) t += String.fromCharCode(c.charCodeAt(0) + L)
console.log('phase1:', t)
function removeRepeated(s) { let o = ''; for (const c of s) if (o.at(-1) !== c) o += c; return o }
const rr = removeRepeated(t)
console.log('removeRepeated:', rr)
console.log('ords:', [...rr].map(c => c.charCodeAt(0)).join(','))
console.log('stored chars ords:', [...stored].map(c => c.charCodeAt(0)).join(','))
