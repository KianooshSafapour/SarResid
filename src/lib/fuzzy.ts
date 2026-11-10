/**
 * R13 — جست‌وجوی فازی کالا (و هر متن فارسی).
 * ---------------------------------------------------------------------------
 * هدف: کاربر کلمات را به هر ترتیبی بنویسد و همهٔ کالاهایی که «تمامِ» کلماتِ
 * واردشده در نامشان هست پیدا شوند — «کاله بستنی» ↔ «بستنی قیفی وانيلي کاله».
 *
 * نرمال‌سازی: ي/ى→ی، ك→ک، ZWNJ و کشیده→فاصله، انگلیسی کوچک، حذف فاصله‌های تکراری.
 * امتیازدهی: تطبیق کاملِ همهٔ توکن‌ها (AND) مقدم بر تطبیق جزئی؛ نامِ کوتاه‌تر،
 * شروعشده با توکن، و تطبیق دقیق کد/بارکد امتیاز بالاتر می‌گیرند.
 */

export function faNorm(s: string): string {
  return String(s ?? '')
    .replace(/ي/g, 'ی')
    .replace(/ى/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u0640/g, '')
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function tokenizeQuery(q: string): string[] {
  return faNorm(q)
    .split(' ')
    .filter((t) => t.length > 0)
    .slice(0, 6)
}

export interface FuzzyCandidate {
  name: string
  code?: string | null
  barcodesJson?: string | null
}

export interface FuzzyResult<T> {
  /** تطبیق کامل: همهٔ کلماتِ جست‌وجو در نام/کد/بارکد هست (مرتب‌شده با بهترین امتیاز) */
  matched: T[]
  /** اگر هیچ تطبیق کاملی نبود: بیشترین کلماتِ منطبق (نسبی) */
  partial: T[]
}

/** امتیاز یک کالا؛ ۰ = هیچ توکنی نمی‌خورد */
function scoreCandidate<T extends FuzzyCandidate>(tokens: string[], row: T): { score: number; hits: number } {
  const name = faNorm(row.name)
  const code = faNorm(row.code ?? '')
  const bank = faNorm(row.barcodesJson ?? '')
  let hits = 0
  let score = 0
  for (const t of tokens) {
    let ok = false
    if (name) {
      if (name === t) {
        score += 60
        ok = true
      } else if (name.startsWith(t)) {
        score += 40
        ok = true
      } else if (new RegExp(`(^| )${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(name)) {
        score += 30 // ابتدای یک کلمه در نام
        ok = true
      } else if (name.includes(t)) {
        score += 18
        ok = true
      }
    }
    if (!ok && code && code === t) {
      score += 80 // تطبیق دقیق کد هلو
      ok = true
    }
    if (!ok && bank && bank.includes(t)) {
      score += 50 // تطبیق در بانک بارکد
      ok = true
    }
    if (ok) hits++
  }
  if (hits === 0) return { score: 0, hits: 0 }
  if (hits === tokens.length) {
    score += 1000 // تطبیق کامل همهٔ کلمات
    /* نام کوتاه‌ترِ منطبق، مرتبط‌تر است */
    const words = name ? name.split(' ').length : 20
    score += Math.max(0, 20 - words)
  }
  return { score, hits }
}

/** مرتب‌سازی فازی — ورودی باید از قبل مجموعهٔ کاندید وسیعی باشد (OR توکن‌ها) */
export function rankFuzzy<T extends FuzzyCandidate>(q: string, rows: T[]): FuzzyResult<T> {
  const tokens = tokenizeQuery(q)
  if (!tokens.length) return { matched: rows, partial: [] }
  const scored: { row: T; score: number; hits: number }[] = []
  for (const row of rows) {
    const { score, hits } = scoreCandidate(tokens, row)
    if (hits > 0) scored.push({ row, score, hits })
  }
  scored.sort((a, b) => b.score - a.score || faNorm(a.row.name).localeCompare(faNorm(b.row.name), 'fa'))
  if (tokens.length === 1) {
    /* تک‌کلمه: همان تطبیق کامل است */
    return { matched: scored.map((s) => s.row), partial: [] }
  }
  const matched = scored.filter((s) => s.hits === tokens.length).map((s) => s.row)
  const partial = matched.length ? [] : scored.map((s) => s.row)
  return { matched, partial }
}
