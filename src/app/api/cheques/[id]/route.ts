import { db } from '@/lib/db'
import { appendHistory, fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { hasCap } from '@/lib/rbac'
import { addDaysIso, isFriday } from '@/lib/jalali'
import { CHEQUE_STATUSES } from '@/lib/constants'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** ویرایش کامل چک — ثبت‌کننده، مدیران اجرایی یا دارندهٔ دسترسی ثبت چک */
async function canEditCheque(
  me: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>,
  createdById: string
): Promise<boolean> {
  if (createdById === me.id) return true
  if (['OWNER', 'GM', 'OM', 'ADMIN'].includes(me.role)) return true
  return hasCap(me, 'cheques.create')
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const cheque = await db.cheque.findUnique({ where: { id } })
  if (!cheque) return fail('چک یافت نشد', 404)
  const body = await req.json()
  const action = body.action as string

  let entry: Record<string, unknown> | null = null
  const data: Record<string, unknown> = {}

  switch (action) {
    case 'sign': {
      if (me.role !== 'OWNER') return fail('فقط مالک امضا می‌کند', 403)
      if (cheque.status !== 'PENDING_OWNER') return fail('این چک در انتظار امضا نیست')
      if (body.number) data.number = body.number
      if (body.dueDate) {
        data.dueDate = body.dueDate
        data.periodDays = Math.max(
          1,
          Math.round(
            (new Date(body.dueDate + 'T12:00:00').getTime() -
              new Date(cheque.writtenAt + 'T12:00:00').getTime()) / 86400000
          )
        )
      }
      data.status = 'SIGNED'
      entry = { action: 'امضا و تأیید توسط مالک', detail: body.note || '' }
      break
    }
    case 'reject': {
      if (me.role !== 'OWNER') return fail('فقط مالک رد می‌کند', 403)
      data.status = 'REJECTED'
      data.ownerNote = body.note || ''
      entry = { action: 'رد توسط مالک', detail: body.note || '' }
      break
    }
    case 'split': {
      if (me.role !== 'OWNER') return fail('فقط مالک تفکیک می‌کند', 403)
      const parts: { amount: number; dueDate: string }[] = body.parts || []
      if (!parts.length) return fail('اجزای چک را وارد کنید')
      const total = parts.reduce((s, p) => s + Number(p.amount), 0)
      if (Math.abs(total - cheque.amount) > 1000)
        return fail('جمع اجزا باید برابر مبلغ چک باشد')
      let first: any = null
      for (const [i, p] of parts.entries()) {
        const created = await db.cheque.create({
          data: {
            number: body.number ? `${body.number}-${i + 1}` : '',
            amount: Number(p.amount),
            orderId: cheque.orderId,
            orderCode: cheque.orderCode,
            recipientName: cheque.recipientName,
            recipientPhone: cheque.recipientPhone,
            writtenAt: cheque.writtenAt,
            dueDate: p.dueDate,
            periodDays: Math.max(
              1,
              Math.round(
                (new Date(p.dueDate + 'T12:00:00').getTime() -
                  new Date(cheque.writtenAt + 'T12:00:00').getTime()) / 86400000
              )
            ),
            status: 'SIGNED',
            createdById: cheque.createdById,
            createdByName: cheque.createdByName,
            history: JSON.stringify([
              { at: new Date().toISOString(), userName: me.name, action: 'تفکیک چک', detail: `بخش ${i + 1} از ${cheque.orderCode || 'چک قبلی'}` },
            ]),
          },
        })
        if (isFriday(created.dueDate) || (await db.holiday.findUnique({ where: { date: created.dueDate } }))) {
          /* warned client-side */
        }
        if (i === 0) first = created
      }
      await db.cheque.update({
        where: { id },
        data: {
          status: 'RETURNED',
          ownerNote: `به ${parts.length} چک تفکیک شد`,
          history: appendHistory(cheque.history, { userName: me.name, action: 'تفکیک به چند چک', detail: `${parts.length} بخش` }),
        },
      })
      await logActivity(me, 'تفکیک چک', 'cheque', id, `${parts.length} بخش`)
      return json({ ok: true, cheques: [first] })
    }
    case 'deliver': {
      if (!['GM', 'ACC'].includes(me.role)) return fail('دسترسی غیرمجاز', 403)
      if (cheque.status !== 'SIGNED') return fail('چک امضاشده قابل تحویل است')
      data.status = 'DELIVERED'
      entry = { action: 'تحویل چک به نماینده', detail: body.detail || cheque.recipientName }
      break
    }
    case 'clear': {
      if (!['OWNER', 'ACC', 'GM'].includes(me.role)) return fail('دسترسی غیرمجاز', 403)
      if (cheque.status !== 'DELIVERED') return fail('چک تحویل‌شده قابل وصول است')
      data.status = 'CLEARED'
      entry = { action: 'چک پاس شد', detail: body.detail || '' }
      break
    }
    case 'bounce': {
      if (!['OWNER', 'ACC'].includes(me.role)) return fail('دسترسی غیرمجاز', 403)
      data.status = 'REJECTED'
      entry = { action: 'چک برگشت خورد', detail: body.detail || '' }
      break
    }
    case 'update': {
      // ویرایش اطلاعات شناسنامه‌ای چک — ثبت‌کننده، مالک یا مدیران مالی
      const allowed =
        cheque.createdById === me.id ||
        me.role === 'OWNER' ||
        ['GM', 'ACC', 'ADMIN'].includes(me.role) ||
        (await hasCap(me, 'cheques.create'))
      if (!allowed) return fail('دسترسی ویرایش چک را ندارید', 403)
      const changes: string[] = []
      const fieldMap: [string, string, (v: unknown) => unknown][] = [
        ['number', 'شماره', (v) => String(v ?? '').slice(0, 40)],
        ['sayadSerial', 'سریال صیاد', (v) => String(v ?? '').replace(/\s+/g, '').slice(0, 30)],
        ['holooReceiptNo', 'رسید هلو', (v) => String(v ?? '').slice(0, 60)],
        ['repId', 'شناسهٔ نماینده', (v) => String(v ?? '')],
        ['repName', 'نام نماینده', (v) => String(v ?? '').slice(0, 120)],
        ['recipientName', 'گیرنده', (v) => String(v ?? '').slice(0, 120)],
        ['recipientPhone', 'تلفن گیرنده', (v) => String(v ?? '').slice(0, 40)],
      ]
      for (const [key, label, norm] of fieldMap) {
        if (body[key] === undefined) continue
        const next = norm(body[key])
        if (next !== (cheque as unknown as Record<string, unknown>)[key]) {
          data[key] = next
          changes.push(`${label}: «${String((cheque as unknown as Record<string, unknown>)[key] ?? '')}» ← «${String(next)}»`)
        }
      }
      if (!changes.length) return json({ cheque: { ...cheque, history: JSON.parse(cheque.history || '[]') }, unchanged: true })
      entry = { action: 'ویرایش اطلاعات چک', detail: changes.join(' • ').slice(0, 300) }
      break
    }
    case 'edit': {
      // ── ویرایش کامل/اصلاح چک — هر وضعیتی قابل اصلاح به وضعیت دیگر با دلیل الزامی ──
      if (!(await canEditCheque(me, cheque.createdById))) return fail('دسترسی ویرایش چک را ندارید', 403)

      const changes: string[] = []
      const diff: Record<string, { from: string; to: string }> = {}
      const warnings: string[] = []
      const track = (key: string, label: string, next: unknown) => {
        const prev = (cheque as unknown as Record<string, unknown>)[key]
        if (String(next ?? '') !== String(prev ?? '')) {
          data[key] = next
          changes.push(`${label}: «${String(prev ?? '') || '—'}» ← «${String(next ?? '') || '—'}»`)
          diff[key] = { from: String(prev ?? ''), to: String(next ?? '') }
        }
      }

      if (body.amount !== undefined) {
        const amt = Number(body.amount)
        if (!isFinite(amt) || amt <= 0) return fail('مبلغ چک باید بزرگ‌تر از صفر باشد')
        track('amount', 'مبلغ', amt)
      }
      if (body.recipientName !== undefined) track('recipientName', 'گیرنده', String(body.recipientName).slice(0, 120))
      if (body.recipientPhone !== undefined) track('recipientPhone', 'تلفن گیرنده', String(body.recipientPhone).slice(0, 40))
      if (body.number !== undefined) track('number', 'شماره چک', String(body.number).slice(0, 40))
      if (body.sayadSerial !== undefined) track('sayadSerial', 'سریال صیاد', String(body.sayadSerial).replace(/\D/g, '').slice(0, 30))
      if (body.holooReceiptNo !== undefined) track('holooReceiptNo', 'رسید هلو', String(body.holooReceiptNo).slice(0, 60))
      if (body.repId !== undefined) track('repId', 'شناسهٔ نماینده', String(body.repId))
      if (body.repName !== undefined) track('repName', 'نام نماینده', String(body.repName).slice(0, 120))

      // ── سررسید/دوره: تاریخ چک هرگز دستی تایپ نمی‌شود — تاریخ نگارش + دوره؛ مگر سررسید صریح داده شود ──
      let newDue = cheque.dueDate
      let newPeriod = cheque.periodDays
      const dueRaw = body.dueDate === undefined || body.dueDate === null ? '' : String(body.dueDate).trim()
      const periodRaw = body.periodDays === undefined || body.periodDays === null ? '' : String(body.periodDays).trim()
      if (dueRaw) {
        const d = dueRaw.slice(0, 10)
        if (!ISO_DATE_RE.test(d)) return fail('تاریخ سررسید نامعتبر است (فرمت yyyy-mm-dd)')
        newDue = d
        newPeriod = Math.max(1, Math.round((new Date(d + 'T12:00:00').getTime() - new Date(cheque.writtenAt + 'T12:00:00').getTime()) / 86400000))
      } else if (periodRaw) {
        const p = Math.round(Number(periodRaw))
        if (!isFinite(p) || p < 1 || p > 365) return fail('دورهٔ چک باید بین ۱ تا ۳۶۵ روز باشد')
        newPeriod = p
        newDue = addDaysIso(p, cheque.writtenAt)
      }
      if (newDue !== cheque.dueDate) track('dueDate', 'سررسید', newDue)
      if (newPeriod !== cheque.periodDays) track('periodDays', 'دوره (روز)', newPeriod)

      // هشدار جمعه/تعطیل رسمی روی سررسید جدید — ثبت با پرچم «خودم بررسی کردم» مجاز است
      const holRow = await db.holiday.findUnique({ where: { date: newDue } })
      const isHol = !!holRow && holRow.kind !== 'OCCASION'
      const isFri = isFriday(newDue)
      if (isHol) warnings.push(`سررسید جدید روی تعطیل رسمی (${holRow!.title}) است`)
      if (isFri) warnings.push('سررسید جدید روی جمعه است — بانک‌ها تعطیل‌اند')
      if (warnings.length && !body.holidayOverride)
        return json({ error: `${warnings[0]} — در صورت تأیید خودتان گزینهٔ «خودم بررسی کردم» را بزنید`, warnings, needsOverride: true }, 400)

      // ── تغییر وضعیت به هر وضعیت دیگر با دلیل الزامی ──
      let statusChanged = false
      if (body.status !== undefined && body.status !== cheque.status) {
        if (!CHEQUE_STATUSES[body.status]) return fail('وضعیت چک نامعتبر است')
        const reason = String(body.reason || '').trim()
        if (reason.length < 3) return fail('برای اصلاح وضعیت چک، نوشتن دلیل الزامی است (حداقل ۳ حرف)')
        data.status = body.status
        statusChanged = true
        changes.push(`وضعیت: «${CHEQUE_STATUSES[cheque.status]?.label || cheque.status}» ← «${CHEQUE_STATUSES[body.status].label}»`)
        diff.status = { from: cheque.status, to: body.status }
      }

      if (!changes.length)
        return json({ cheque: { ...cheque, history: safeParse(cheque.history, [] as any[]) }, unchanged: true, warnings })

      const histArr = safeParse<Record<string, unknown>[]>(cheque.history, [])
      const now = new Date().toISOString()
      const editFields = changes.filter((c) => !c.startsWith('وضعیت'))
      if (editFields.length)
        histArr.push({
          at: now, userId: me.id, userName: me.name, action: 'ویرایش چک',
          detail: editFields.join(' • ').slice(0, 400) + (warnings.length ? ` — ⚠ خودم بررسی کردم: ${warnings.join('، ')}` : ''),
          diff,
        })
      if (statusChanged)
        histArr.push({
          at: now, userId: me.id, userName: me.name, action: 'اصلاح وضعیت چک',
          detail: `${String(body.reason || '').trim().slice(0, 300)} — از «${CHEQUE_STATUSES[cheque.status]?.label || cheque.status}» به «${CHEQUE_STATUSES[(data.status as string)].label}»`,
        })
      data.history = JSON.stringify(histArr.slice(-200))

      const updated = await db.cheque.update({ where: { id }, data })
      await logActivity(me, statusChanged ? 'ویرایش + اصلاح وضعیت چک' : 'ویرایش چک', 'cheque', id, changes.join(' • ').slice(0, 200))
      return json({ cheque: { ...updated, history: safeParse(updated.history, [] as any[]) }, warnings, diff })
    }
    default:
      return fail('عملیات نامعتبر')
  }

  if (entry) data.history = appendHistory(cheque.history, { userId: me.id, userName: me.name, ...entry })
  const updated = await db.cheque.update({ where: { id }, data })
  await logActivity(me, `چک: ${entry?.action || 'ویرایش'}`, 'cheque', id, cheque.recipientName)
  return json({ cheque: { ...updated, history: JSON.parse(updated.history || '[]') } })
}
