import { db } from '@/lib/db'

/* ═══════════════════════════════════════════════════════════════════════════
 * /api/health — ضربان‌سنج سامانه (بدون احراز هویت — برای watchdog و لودبالانسر)
 * لایهٔ ۱ تاب‌آوری: اگر DB پاسخ ندهد وضعیت ۵۰۳ برمی‌گردد تا watchdog وارد عمل شود.
 * ═══════════════════════════════════════════════════════════════════════════ */

export const dynamic = 'force-dynamic'

export async function GET() {
  const t0 = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    return Response.json({
      ok: true,
      service: 'sarresid',
      db: 'up',
      latencyMs: Date.now() - t0,
      ts: new Date().toISOString(),
    })
  } catch (e) {
    return Response.json(
      {
        ok: false,
        service: 'sarresid',
        db: 'down',
        error: e instanceof Error ? e.message : 'unknown',
        ts: new Date().toISOString(),
      },
      { status: 503 }
    )
  }
}
