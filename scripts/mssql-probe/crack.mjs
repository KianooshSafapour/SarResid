// الگوریتم رمز هلو: جست‌وجوی تبدیلی که "30076677" را به رشتهٔ ذخیره‌شده برساند
const stored = '>>E=>>@S>>@S>>EE>>E@>>E@>>EE>>EE'
const plain = '30076677'
// فرض: هر کاراکتر → دو کاراکتر «>X» — جفت‌ها:
const pairs = []
for (let i = 0; i < stored.length; i += 2) pairs.push(stored.slice(i, i + 2))
console.log('pairs:', pairs.join(' '), '| count:', pairs.length, 'vs pass len:', plain.length)
// نگاشت هر رقم → جفت
const map = {}
for (let i = 0; i < plain.length && i < pairs.length; i++) map[plain[i]] = pairs[i]
console.log('map:', JSON.stringify(map))
// آزمون روی رمز مدیر (>>E موجودة) — رمز مدیر احتمالاً «30076...» هم هست؟
// اعتبارسنجی: رمز مدیر طول ۳۸ → ۱۹ کاراکتر
