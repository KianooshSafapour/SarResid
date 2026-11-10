// اجرای ConvertStr.encryptText داخل SQL Server CLR؟ نه — راه ساده‌تر: خود SQL جاوا ندارد.
// پس: بازنویسی encryptText با منطق کامل استخراج‌شده و کالیبره با نمونهٔ معلوم.
// از دیسمبل: shift by keyLen(11) + removeRepeated + changeLength + returnOrd + جدول mm از خود رشته
// آزمون سریع: فقط شیفت + کلید:
const encKey = '!TNC@23067#'
const stored = '>>E=>>@S>>@S>>EE>>E@>>E@>>EE>>EE'
const pw = '30076677'
// فاز ۱: هر نویسه + طولِ آرگومان؟ '3'(0x33)+11=0x3E='>' ✓ نویسهٔ اول!
const L = encKey.length // 11
let t = ''
for (const c of pw) t += String.fromCharCode(c.charCodeAt(0) + L)
console.log('phase1 (shift+11):', t)
// فاز removeRepeated: حذف تکراری‌های متوالی؟ ';;;;;;;;;<' → ';<'
function removeRepeated(s) { let o = ''; for (const c of s) if (o[o.length-1] !== c) o += c; return o }
console.log('no-repeat:', removeRepeated(t))
PYEOF
echo "skip" && cat > sim-enc.mjs <<'EOF'
const encKey = '!TNC@23067#'
const stored = '>>E=>>@S>>@S>>EE>>E@>>E@>>EE>>EE'
const pw = '30076677'
const L = encKey.length
let t = ''
for (const c of pw) t += String.fromCharCode(c.charCodeAt(0) + L)
console.log('phase1:', t, '| len', t.length)
function removeRepeated(s) { let o=''; for (const c of s) if (o.at(-1) !== c) o += c; return o }
const rr = removeRepeated(t)
console.log('removeRepeated:', rr)
// فاز بعد: changeLength — رشته را به طول معیّن (کلید؟) می‌رساند
// و returnOrdAsciiValues — کدهای اسکی به‌صورت رشتهٔ عددی
// جدول mm: از خود رشتهٔ shift خواسته — چاپ کدها:
console.log('ords:', [...rr].map(c => c.charCodeAt(0)).join(','))
console.log('stored :', stored)
