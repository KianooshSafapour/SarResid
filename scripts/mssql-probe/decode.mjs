// الگوریتم رمز هلو از روی نمونهٔ معلوم: رمز «30076677» آقای صفا پور
const stored = '>>E=>>@S>>@S>>EE>>E@>>E@>>EE>>EE'
// فرض: هر کاراکتر → ۴ نویسهٔ «>>XY» — نگاشت کشف‌شده:
const known = { '3': ['E','='], '0': ['@','S'], '7': ['E','E'], '6': ['E','@'] }
// رمز مدیر ۳۸ نویسه = ۹ کاراکتر + پیشوند؟
const admin = '>=>C>>ZL>==S>>ZL>=>>>>@Z>>E=>>E?>>EC>>EC'
console.log('admin len:', admin.length)
// تکه‌بندی مدیر با الگوی متغیر: شاید هر کاراکتر → «>» + ۱تا۳ نویسه
// آزمون فرض قوی‌تر: نگاشت روی «جفت‌نویسه‌های >X»:
// 30076677 → >> | E= | >> | @S ... نه — بیایم از الگوی «>X» برای رمز مدیر تقسیم کنیم:
const segs = []
let i = 0
while (i < stored.length) {
  if (stored[i] === '>') {
    // «>>» شروعِ کاراکتر جدید است؟ یا «>X»?
    segs.push(stored.slice(i, i + 4)); i += 4
  } else i++
}
console.log('stored segs(4):', segs.join(' '))
// نگاشت ۴نویسه‌ای مدیر
let j = 0
const asegs = []
while (j < admin.length) { if (admin[j] === '>') { asegs.push(admin.slice(j, j + 4)); j += 4 } else j++ }
console.log('admin segs(4):', asegs.join(' '), '| count:', asegs.length)
