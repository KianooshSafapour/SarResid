import { db } from '@/lib/db'
import { fail, getSessionUser, json, safeParse } from '@/lib/api-helpers'
import { faNum, formatJalaliShort } from '@/lib/jalali'
import { canAccess } from '@/lib/constants'
import { runBirthdayCheck, visibleToUser } from '@/lib/notif-engine'

export type Notif = {
  id: string
  category: 'order' | 'cheque' | 'stock' | 'task' | 'team' | 'workflow'
  severity: 'critical' | 'warning' | 'info'
  icon: string
  title: string
  detail: string
  go: string
  count?: number
  /** فقط اعلان‌های موتور قواعد (NotifOutbox) */
  ruleKey?: string
  outboxId?: string
  ts?: number
}

/** role helpers */
const isMgr = (r: string) => ['GM', 'OM', 'OWNER', 'PM'].includes(r)

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const today = new Date().toISOString().slice(0, 10)
  const now = Date.now()

  /* ── موتور روزانه: یادآوری تولد همکاران (T-7/T-3/T-0) — داخل خودش روزی یک‌بار کلید می‌خورد ── */
  try {
    await runBirthdayCheck()
  } catch {
    /* تولد هرگز نباید مانع پاسخ اعلان‌ها شود */
  }

  const [orders, orderItems, cheques, products, tasks, messages, feedbacks, preOrders, pref, zoneCounts, leaves] = await Promise.all([
    db.order.findMany({ orderBy: { createdAt: 'desc' } }),
    db.orderItem.findMany(),
    db.cheque.findMany({ orderBy: { dueDate: 'asc' } }),
    db.product.findMany({ where: { active: true } }),
    db.task.findMany({ orderBy: { createdAt: 'desc' } }),
    db.message.findMany({ where: { toId: me.id, readAt: null } }),
    db.feedback.findMany({ orderBy: { createdAt: 'desc' } }),
    db.preOrder.findMany({ orderBy: { createdAt: 'desc' } }),
    db.notifPref.findUnique({ where: { userId: me.id } }),
    db.zoneCount.findMany({ where: { forDate: today } }),
    db.leaveRequest.findMany({ orderBy: { createdAt: 'desc' } }),
  ])

  const mutedCats = pref ? (JSON.parse(pref.mutedCats || '[]') as string[]) : []
  const snoozed = !!pref?.snoozeUntil && new Date(pref.snoozeUntil).getTime() > now

  const out: Notif[] = []
  const push = (n: Notif) => out.push(n)

  /* ── سفارش‌ها ── */
  const overdue = orders.filter((o) => ['APPROVED', 'RECEIVING'].includes(o.status) && o.deliveryDate < today)
  if (overdue.length > 0 && isMgr(me.role))
    push({
      id: 'orders-overdue', category: 'order', severity: 'critical', icon: '⏰', go: 'orders', count: overdue.length,
      title: `${faNum(overdue.length)} سفارش از تاریخ تحویل گذشته`,
      detail: `نزدیک‌ترین: ${overdue[0].code} — ${overdue[0].providerName} (${formatJalaliShort(overdue[0].deliveryDate)}) — با تأمین‌کننده تماس بگیرید`,
    })

  const todayDeliveries = orders.filter((o) => o.deliveryDate === today && !['DONE', 'CANCELLED', 'DRAFT'].includes(o.status))
  // round-17 عزل نشان: فقط کسانی که بخش «دریافت مرسوله» را می‌بینند (صندوقدار نشانِ بخشی را نبیند که دسترسی‌اش را ندارد)
  if (todayDeliveries.length > 0 && canAccess('receiving', me.role, me.secondaryRoles))
    push({
      id: 'orders-today', category: 'order', severity: 'warning', icon: '🚚', go: 'receiving', count: todayDeliveries.length,
      title: `${faNum(todayDeliveries.length)} مرسوله برای امروز ثبت شده`,
      detail: todayDeliveries.slice(0, 3).map((o) => `${o.providerName}`).join(' • ') + ' — آماده‌گی دریافت را داشته باشید',
    })

  const toVerify = orders.filter((o) => o.status === 'RECEIVED')
  if (toVerify.length > 0 && ['SK', 'GM', 'OM'].includes(me.role))
    push({
      id: 'orders-verify', category: 'order', severity: 'warning', icon: '📦', go: 'verify', count: toVerify.length,
      title: `${faNum(toVerify.length)} مرسوله دریافتی منتظر تأیید انبار است`,
      detail: 'موجودی تا تأیید شما بالا نمی‌رود — امروز بررسی کنید',
    })

  const toAccount = orders.filter((o) => o.status === 'VERIFIED')
  if (toAccount.length > 0 && ['ACC', 'OM', 'OWNER'].includes(me.role))
    push({
      id: 'orders-account', category: 'order', severity: 'warning', icon: '🧾', go: 'accounting', count: toAccount.length,
      title: `${faNum(toAccount.length)} سفارش تأییدشده برای ثبت در هلو مانده`,
      detail: 'خروجی اکسل بگیرید، در هلو ثبت کنید و سفارش را تکمیل کنید',
    })

  const submitted = orders.filter((o) => o.status === 'SUBMITTED')
  if (submitted.length > 0 && ['GM', 'OM'].includes(me.role))
    push({
      id: 'orders-approve', category: 'order', severity: 'info', icon: '📝', go: 'orders', count: submitted.length,
      title: `${faNum(submitted.length)} سفارش در انتظار تأیید شماست`,
      detail: submitted.slice(0, 3).map((o) => `${o.code} (${o.createdByName})`).join(' • '),
    })

  /* ── چک‌ها ── */
  if (['GM', 'OWNER', 'ACC'].includes(me.role)) {
    const in3 = new Date(now + 3 * 86400000).toISOString().slice(0, 10)
    const dueSoon = cheques.filter((c) => !['CLEARED', 'REJECTED', 'RETURNED'].includes(c.status) && c.dueDate >= today && c.dueDate <= in3)
    if (dueSoon.length > 0)
      push({
        id: 'cheques-due', category: 'cheque', severity: 'critical', icon: '💰', go: 'cheques', count: dueSoon.length,
        title: `${faNum(dueSoon.length)} چک تا ۳ روز آینده سررسید می‌شود`,
        detail: `جمع: ${faNum(dueSoon.reduce((s, c) => s + c.amount, 0))} تومان — موجودی حساب را آماده کنید`,
      })
    const overdueCheques = cheques.filter((c) => !['CLEARED', 'REJECTED', 'RETURNED'].includes(c.status) && c.dueDate < today)
    if (overdueCheques.length > 0)
      push({
        id: 'cheques-past', category: 'cheque', severity: 'critical', icon: '🚨', go: 'cheques', count: overdueCheques.length,
        title: `${faNum(overdueCheques.length)} چک از سررسید گذشته و هنوز پاس نشده`,
        detail: 'وضعیت چک را در بخش چک‌ها به‌روزرسانی کنید (پاس شده / برگشتی)',
      })
    const pendingOwner = cheques.filter((c) => c.status === 'PENDING_OWNER')
    if (pendingOwner.length > 0 && me.role === 'OWNER')
      push({
        id: 'cheques-sign', category: 'cheque', severity: 'warning', icon: '✍️', go: 'cheques', count: pendingOwner.length,
        title: `${faNum(pendingOwner.length)} چک در انتظار امضای شماست`,
        detail: 'امضا کنید یا بازه برگشت را تغییر دهید',
      })
    const staleSigned = cheques.filter((c) => {
      if (c.status !== 'SIGNED') return false
      return now - new Date(c.writtenAt + 'T12:00:00').getTime() >= 7 * 86400000
    })
    if (staleSigned.length > 0)
      push({
        id: 'cheques-stale', category: 'cheque', severity: 'warning', icon: '📬', go: 'cheques', count: staleSigned.length,
        title: `${faNum(staleSigned.length)} چک امضاشده بیش از یک هفته است تحویل نشده`,
        detail: 'چک سرگردان نباشد — تحویل به نماینده تأمین‌کننده را پیگیری کنید',
      })
  }

  /* ── انبار ── */
  const out0 = products.filter((p) => p.stock === 0)
  const low = products.filter((p) => p.stock > 0 && p.stock <= p.reorderLevel)
  if (out0.length > 0)
    push({
      id: 'stock-out', category: 'stock', severity: 'critical', icon: '🔴', go: 'products', count: out0.length,
      title: `${faNum(out0.length)} کالا کاملاً ناموجود است`,
      detail: out0.slice(0, 4).map((p) => p.name).join(' • ') + ' — مشتری منتظر است',
    })
  if (low.length > 0)
    push({
      id: 'stock-low', category: 'stock', severity: 'warning', icon: '🟡', go: 'products', count: low.length,
      title: `${faNum(low.length)} کالا به نقطه سفارش رسیده`,
      detail: 'از «پیش‌نویس هوشمند سفارش» در بخش کالاها استفاده کنید',
    })

  const activeOrderIds = new Set(orders.filter((o) => !['CANCELLED', 'DRAFT'].includes(o.status)).map((o) => o.id))
  const in14 = new Date(now + 14 * 86400000).toISOString().slice(0, 10)
  const expiring = orderItems.filter((oi) => oi.expiryDate && activeOrderIds.has(oi.orderId) && oi.expiryDate <= in14 && oi.status !== 'REJECTED')
  const expiringSoon = expiring.filter((oi) => oi.expiryDate <= new Date(now + 3 * 86400000).toISOString().slice(0, 10))
  if (expiring.length > 0 && ['GM', 'OM', 'SK', 'ACC', 'HC'].includes(me.role))
    push({
      id: 'stock-expiry', category: 'stock', severity: expiringSoon.length > 0 ? 'critical' : 'info', icon: '⏳', go: 'dashboard', count: expiring.length,
      title: `${faNum(expiring.length)} قلم کالا تا ۱۴ روز آینده انقضا می‌شود${expiringSoon.length > 0 ? ` (${faNum(expiringSoon.length)} قلم فقط تا ۳ روز!)` : ''}`,
      detail: 'اول از قفسه بفروشید، تخفیف بزنید یا به پیشنهاد ویژه تبدیل کنید',
    })

  /* ── وظایف ── */
  const myTasks = tasks.filter((t) => t.assignedToId === me.id && !['DONE', 'CANCELLED'].includes(t.status))
  const overdueTasks = myTasks.filter((t) => t.dueDate && t.dueDate < today)
  if (overdueTasks.length > 0)
    push({
      id: 'tasks-overdue', category: 'task', severity: 'critical', icon: '🔥', go: 'tasks', count: overdueTasks.length,
      title: `${faNum(overdueTasks.length)} وظیفه از موعدش گذشته`,
      detail: overdueTasks.slice(0, 3).map((t) => t.title).join(' • '),
    })
  const todayTasks = myTasks.filter((t) => t.dueDate === today)
  if (todayTasks.length > 0)
    push({
      id: 'tasks-today', category: 'task', severity: 'warning', icon: '📋', go: 'tasks', count: todayTasks.length,
      title: `${faNum(todayTasks.length)} وظیفه برای امروز دارید`,
      detail: todayTasks.slice(0, 3).map((t) => t.title).join(' • '),
    })

  /* ── تیم و فروش ── */
  if (messages.length > 0)
    push({
      id: 'team-msgs', category: 'team', severity: 'info', icon: '💬', go: 'messages', count: messages.length,
      title: `${faNum(messages.length)} پیام خوانده‌نشده دارید`,
      detail: 'صندوق پیام‌های خصوصی خود را ببینید',
    })

  if (['GM', 'OM', 'PM', 'OWNER'].includes(me.role)) {
    const newIdeas = feedbacks.filter((f) => f.type === 'IDEA' && f.status === 'NEW')
    if (newIdeas.length > 0)
      push({
        id: 'team-ideas', category: 'team', severity: 'info', icon: '💡', go: 'feedback', count: newIdeas.length,
        title: `${faNum(newIdeas.length)} ایده تازه از تیم رسیده`,
        detail: 'به ایده‌ها رسیدگی کنید — انگیزه تیم به پاسخ شماست',
      })
  }

  const cashierQueue = preOrders.filter((p) => ['NEW', 'CASHIER_EDITED'].includes(p.status))
  if (cashierQueue.length > 0 && ['HC', 'CASHIER', 'GM'].includes(me.role))
    push({
      id: 'team-cashier', category: 'team', severity: 'warning', icon: '🛒', go: 'sales', count: cashierQueue.length,
      title: `${faNum(cashierQueue.length)} پیش‌فاکتور در صف صندوق است`,
      detail: 'مشتریان در انتظار نهایی‌سازی سفارش هستند',
    })

  /* ── شمارش روزانهٔ زون (blind count) ── */
  const myZoneToday = zoneCounts.filter((z) => z.userId === me.id)
  const zoneMismatch = zoneCounts.filter((z) => z.status === 'MISMATCH')
  if (['MERCH', 'SALES'].includes(me.role) || (me.secondaryRoles || []).includes('MERCH')) {
    if (myZoneToday.length === 0)
      push({
        id: 'zonecount-todo', category: 'task', severity: 'warning', icon: '🧮', go: 'zonecount',
        title: 'شمارش روزانهٔ زون شما ثبت نشده',
        detail: 'چند دقیقه شمارش کور بزنید — عدد سیستم نمایش داده نمی‌شود',
      })
  }
  if (['SK', 'OM', 'GM', 'PM'].includes(me.role) && zoneMismatch.length > 0)
    push({
      id: 'zonecount-mismatch', category: 'stock', severity: 'warning', icon: '⚖️', go: 'zonecount', count: zoneMismatch.length,
      title: `${faNum(zoneMismatch.length)} مغایرت در شمارش روزانهٔ زون‌ها`,
      detail: zoneMismatch.slice(0, 3).map((z) => `${z.zone} (${z.userName})`).join(' • ') + ' — جزئیات در تابلوی امروز',
    })

  /* ── مرخصی و برنامهٔ تیم ── */
  const outToday = leaves.filter((l) => l.status === 'APPROVED' && l.fromDate <= today && l.toDate >= today)
  if (outToday.length > 0 && ['OM', 'GM', 'OWNER'].includes(me.role))
    push({
      id: 'leaves-out', category: 'team', severity: 'info', icon: '🌴', go: 'leaves', count: outToday.length,
      title: `${faNum(outToday.length)} همکار امروز در مرخصی است`,
      detail: outToday.slice(0, 3).map((l) => l.userName).join(' • ') + ' — برنامهٔ پوشش شیفت را ببینید',
    })
  const pendingLeaves = leaves.filter((l) => l.status === 'PENDING')
  if (pendingLeaves.length > 0 && ['OM', 'GM', 'OWNER'].includes(me.role))
    push({
      id: 'leaves-pending', category: 'team', severity: 'info', icon: '📝', go: 'leaves', count: pendingLeaves.length,
      title: `${faNum(pendingLeaves.length)} درخواست مرخصی در صف تأیید است`,
      detail: 'اولویت با رزرو زودتر (FCFS) — صف را بررسی کنید',
    })

  /* مدیران: گزارش صبحگاهی آماده است */
  if (['GM', 'OM', 'OWNER', 'ACC'].includes(me.role))
    push({
      id: 'briefing-daily', category: 'team', severity: 'info', icon: '🌅', go: 'briefing',
      title: 'صبح‌نامه امروز آماده است',
      detail: 'گزارش یک‌صفحه‌ای صبح — چاپ کنید و در جلسه صبح بخوانید',
    })

  /* ── موتور قواعد (NotifOutbox) — ادغام با هشدارهای محاسباتی ──
   * مخاطب (round-17): تابع واحد visibleToUser — مستقیم به من (userId) یا نقشی از نقش‌های من یا همگانی.
   * ۷ روز اخیر، خوانده‌نشده برای من؛ سکوت موقت فقط فوری‌ها را رد می‌کند.
   * همین فیلتر مبنای نشان‌های سایدبار است — نشان = آنچه در مرکز اعلان‌ها دیده می‌شود. */
  const outboxRows = await db.notifOutbox.findMany({
    where: { createdAt: { gte: new Date(now - 7 * 86400000) } },
    orderBy: { createdAt: 'desc' },
  })
  const outboxNotifs: Notif[] = []
  for (const r of outboxRows) {
    if (!visibleToUser(r, me)) continue
    if (safeParse<string[]>(r.readBy, []).includes(me.id)) continue
    const severity = r.severity === 'critical' ? 'critical' : r.severity === 'important' ? 'warning' : 'info'
    outboxNotifs.push({
      id: `outbox-${r.id}`,
      outboxId: r.id,
      ruleKey: r.ruleKey,
      category: 'workflow',
      severity,
      icon: r.icon || '🔔',
      title: r.title,
      detail: r.detail,
      go: (r.go || '').replace(/^#\/?/, '') || 'notifs',
      ts: r.createdAt.getTime(),
    })
  }
  const outboxBefore = outboxNotifs.length
  let outboxVisible = outboxNotifs.filter((n) => !mutedCats.includes('workflow'))
  if (snoozed) outboxVisible = outboxVisible.filter((n) => n.severity === 'critical')

  /* ── فیلتر بر اساس تنظیمات کاربر ──
   * دسته‌های بی‌صدا حذف می‌شوند؛ در حالت سکوت موقت فقط اعلان‌های فوری زنگ می‌خورند */
  const before = out.length
  let visible = out.filter((n) => !mutedCats.includes(n.category))
  if (snoozed) visible = visible.filter((n) => n.severity === 'critical')
  const silenced = before - visible.length + (outboxBefore - outboxVisible.length)

  // ادغام: فوری‌ها اول، بعد تازه‌ترین‌ها (مرتب‌سازی پایدار — ترتیب تازه‌به‌قدیم outbox حفظ می‌شود)
  const merged = [...visible, ...outboxVisible]
  const sevRank = { critical: 0, warning: 1, info: 2 } as const
  merged.sort((a, b) => sevRank[a.severity] - sevRank[b.severity])

  return json({
    notifications: merged,
    summary: {
      total: merged.length,
      critical: merged.filter((n) => n.severity === 'critical').length,
      warning: merged.filter((n) => n.severity === 'warning').length,
      info: merged.filter((n) => n.severity === 'info').length,
    },
    prefs: {
      mutedCats,
      snoozeUntil: snoozed ? pref!.snoozeUntil : '',
    },
    silencedCount: silenced,
  })
}

/** POST /api/notifications — {action:'read-outbox', id} یا {action:'read-outbox', ids:[…]}
 *  علامت‌گذاری اعلان موتور قواعد به‌عنوان خوانده‌شده برای من (read-modify-write روی readBy) */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json().catch(() => null)
  if (body?.action !== 'read-outbox') return fail('عملیات نامعتبر است')

  const rawIds: string[] = Array.isArray(body.ids)
    ? body.ids.map((x: unknown) => String(x || '')).filter(Boolean)
    : body.id
      ? [String(body.id)]
      : []
  if (rawIds.length === 0) return fail('شناسهٔ اعلان الزامی است')

  let updated = 0
  for (const id of rawIds.slice(0, 50)) {
    const row = await db.notifOutbox.findUnique({ where: { id } })
    if (!row) continue
    const readBy = safeParse<string[]>(row.readBy, [])
    if (readBy.includes(me.id)) continue
    readBy.push(me.id)
    await db.notifOutbox.update({ where: { id }, data: { readBy: JSON.stringify(readBy) } })
    updated++
  }

  return json({ ok: true, updated })
}
