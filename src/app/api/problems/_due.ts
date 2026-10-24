/**
 * منطق مشترک هشدارهای مهلت رسیدگی مشکلات (R5-P5).
 *
 * هم «GET /api/problems/alerts» (مسیر مستقیم) و هم «GET /api/problems» (فهرست —
 * تا با باز شدن صفحه توسط هر کاربری ارزیابی اجرا شود) از همین تابع استفاده
 * می‌کنند. یک‌باره و idempotent از طریق کلیدهای KV:
 *   problem:alert:{problemId}:{phase}   → نشانهٔ ارسال (due-1 | due0 | overdue)
 *   problem:smsalert:{problemId}        → کلید پیامکی مدیر برای همان مشکل
 */
import { db } from '@/lib/db'
import { safeJson } from '@/lib/api'
import { displayName, notify } from '@/lib/notify'
import { queueSms, normalizeMobile } from '@/lib/sms'
import { todayJalaliDash, addDaysJalaliDash, toFaDigits } from '@/lib/jalali'
import { problemSmsKey, problemAlertKey } from './route'

/** '1405-07-28' → '۱۴۰۵/۰۷/۲۸' */
function faSlash(dash: string): string {
  return toFaDigits(dash.replace(/-/g, '/'))
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type Phase = 'due-1' | 'due0' | 'overdue'

const PHASE_META: Record<Phase, { title: string; severity: string }> = {
  'due-1': { title: 'یادآوری — فردا مهلت رسیدگی مشکل است', severity: 'warning' },
  due0: { title: 'امروز آخرین مهلت رسیدگی مشکل است', severity: 'warning' },
  overdue: { title: 'مهلت رسیدگی مشکل گذشته است!', severity: 'critical' },
}

export interface DueAlertResult {
  checked: number
  created: number
  smsSent: number
}

/**
 * ارزیابی تنبل هشدارهای مهلت — مشکلات حل‌نشدهٔ دارای مهلت را بررسی می‌کند و
 * برای سه فاز (یک روز مانده / روز مهلت / گذشته از مهلت) یک‌باره به مسئول
 * پیگیری اعلان زنگوله‌ای می‌فرستد و در صورت فعال‌بودن کلید پیامکی مدیر،
 * پیامک در صف مرکز پیامک قرار می‌دهد. هرگز خطا به بیرون نمی‌دهد.
 */
export async function runDueAlerts(): Promise<DueAlertResult> {
  const empty: DueAlertResult = { checked: 0, created: 0, smsSent: 0 }
  try {
    const today = todayJalaliDash()

    const problems = await db.problem.findMany({
      where: { dueDate: { not: null }, status: { not: 'RESOLVED' } },
      take: 500,
    })
    if (!problems.length) return empty

    // فاز هر مشکل نسبت به امروز
    const candidates: { id: string; problem: string; dueDate: string; phase: Phase; assigneeId: string | null }[] = []
    for (const p of problems) {
      const due = String(p.dueDate || '')
      if (!DATE_RE.test(due)) continue
      let phase: Phase | null = null
      if (today === addDaysJalaliDash(due, -1)) phase = 'due-1'
      else if (today === due) phase = 'due0'
      else if (today > due) phase = 'overdue'
      if (phase) {
        candidates.push({ id: p.id, problem: p.problem, dueDate: due, phase, assigneeId: p.assigneeId })
      }
    }
    if (!candidates.length) return { checked: problems.length, created: 0, smsSent: 0 }

    // نشانه‌های از پیش ارسال‌شده
    const markerKeys = candidates.map((c) => problemAlertKey(c.id, c.phase))
    const existing = await db.setting.findMany({ where: { key: { in: markerKeys } }, select: { key: true } })
    const done = new Set(existing.map((e) => e.key))
    const todo = candidates.filter((c) => !done.has(problemAlertKey(c.id, c.phase)))
    if (!todo.length) return { checked: problems.length, created: 0, smsSent: 0 }

    // کلیدهای پیامکی فعال
    const smsRows = await db.setting.findMany({
      where: { key: { in: todo.map((c) => problemSmsKey(c.id)) } },
    })
    const smsMap = new Map(smsRows.map((r) => [r.key, safeJson<boolean>(r.value, false)]))

    // اطلاعات مسئولان
    const assigneeIds = [...new Set(todo.map((c) => c.assigneeId).filter((x): x is string => !!x))]
    const assignees = assigneeIds.length ? await db.user.findMany({ where: { id: { in: assigneeIds } } }) : []
    const assigneeMap = new Map(assignees.map((a) => [a.id, a]))

    let created = 0
    let smsSent = 0

    for (const c of todo) {
      const markerKey = problemAlertKey(c.id, c.phase)

      // ① اول نشانه را ثبت کن — اگر هم‌زمانی بود، ادامه نده (idempotency در برابر race)
      try {
        await db.setting.create({ data: { key: markerKey, value: 'true' } })
      } catch {
        continue // نشانه هم‌زمان توسط درخواست دیگری ثبت شده است
      }

      const assignee = c.assigneeId ? assigneeMap.get(c.assigneeId) : undefined
      const dueFa = faSlash(c.dueDate)
      const what = c.problem.length > 60 ? `${c.problem.slice(0, 60)}…` : c.problem
      const meta = PHASE_META[c.phase]

      const bodyText =
        c.phase === 'due-1'
          ? `${what} — مهلت رسیدگی فردا (${dueFa}) است؛ لطفاً پیش از پایان مهلت اقدام کنید.`
          : c.phase === 'due0'
            ? `${what} — امروز (${dueFa}) آخرین مهلت رسیدگی است.`
            : `${what} — مهلت رسیدگی (${dueFa}) گذشته است؛ رسیدگی فوری لازم است.`

      // ② اعلان زنگوله‌ای برای مسئول (یا مدیران اگر مسئولی نیست)
      await notify(
        assignee
          ? {
              userId: assignee.id,
              kind: 'problem',
              severity: meta.severity,
              title: meta.title,
              body: bodyText,
              go: '#/tasks/problems',
            }
          : {
              role: 'ADMIN',
              kind: 'problem',
              severity: meta.severity,
              title: meta.title,
              body: bodyText,
              go: '#/tasks/problems',
            },
      )
      created++

      // ③ پیامک (در صورت فعال‌بودن کلید و داشتن شمارهٔ معتبر)
      if (smsMap.get(problemSmsKey(c.id)) && assignee) {
        const to = normalizeMobile(assignee.mobile ?? assignee.phone ?? null)
        if (to) {
          const row = await queueSms('PROBLEM_DUE', to, `هایپر زیتون — ${bodyText}`, c.id, displayName(assignee))
          if (row) smsSent++
        }
      }
    }

    return { checked: problems.length, created, smsSent }
  } catch {
    return empty // هرگز فهرست مشکلات را به خاطر هشدار نسازیم
  }
}
