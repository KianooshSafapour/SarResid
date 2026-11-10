import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, safeJson, logActivity } from '@/lib/api'
import { getSessionUser, isManager } from '@/lib/auth'
import { displayName, notify, realtimeEmit } from '@/lib/notify'

export const dynamic = 'force-dynamic'

/**
 * Message model has no attachment column — direct messages carrying an
 * attachment store the body column as `HZJSON:{...}` envelope.
 */
const HZJSON = 'HZJSON:'
const MAX_ATTACHMENT = 700_000 // ~500KB base64 + headroom

function packBody(content: string, attachment?: string | null): string {
  if (attachment) return HZJSON + JSON.stringify({ body: content, attachment })
  return content
}

function unpackBody(raw: string): { content: string; attachment: string | null } {
  if (raw.startsWith(HZJSON)) {
    const parsed = safeJson<{ body?: string; attachment?: string }>(raw.slice(HZJSON.length), {})
    return { content: parsed.body ?? '', attachment: parsed.attachment ?? null }
  }
  return { content: raw, attachment: null }
}

function peerView(u: {
  id: string
  fullName: string
  honorific: string
  role: string
  title: string
  avatarJson: string | null
}) {
  return {
    id: u.id,
    fullName: u.fullName,
    honorific: u.honorific,
    role: u.role,
    title: u.title,
    avatarJson: u.avatarJson,
  }
}

/** GET /api/messages — conversations + broadcasts + roster (+ ?with={peerId} thread) */
export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const withPeer = req.nextUrl.searchParams.get('with')

  // ---- single conversation thread ----
  if (withPeer) {
    const peer = await db.user.findUnique({ where: { id: withPeer } })
    if (!peer || !peer.active) return fail('کاربر یافت نشد', 404)

    const messages = await db.message.findMany({
      where: { OR: [{ fromId: me.id, toId: peer.id }, { fromId: peer.id, toId: me.id }] },
      orderBy: { createdAt: 'asc' },
      take: 500,
    })

    // opening a chat marks the peer's messages as read (badge refresh follows)
    await db.message.updateMany({
      where: { fromId: peer.id, toId: me.id, readAt: null },
      data: { readAt: new Date() },
    })

    return ok({
      peer: peerView(peer),
      messages: messages.map((m) => ({
        id: m.id,
        fromId: m.fromId,
        toId: m.toId,
        content: unpackBody(m.body).content,
        attachment: unpackBody(m.body).attachment,
        createdAt: m.createdAt,
        readAt: m.readAt,
      })),
    })
  }

  // ---- overview ----
  const [myMessages, broadcasts, roster] = await Promise.all([
    db.message.findMany({
      where: { OR: [{ fromId: me.id }, { toId: me.id }] },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    db.broadcast.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    db.user.findMany({ where: { active: true } }),
  ])

  // conversations = distinct peers with last message between me and peer
  const peerIds = new Set<string>()
  for (const m of myMessages) peerIds.add(m.fromId === me.id ? m.toId : m.fromId)
  const peerUsers = roster.filter((u) => peerIds.has(u.id))
  const peerMap = new Map(peerUsers.map((u) => [u.id, u]))

  const conversations = peerUsers
    .map((p) => {
      const thread = myMessages.filter(
        (m) =>
          (m.fromId === me.id && m.toId === p.id) || (m.fromId === p.id && m.toId === me.id)
      )
      const last = thread[0] // myMessages already sorted desc
      if (!last) return null
      return {
        peer: {
          id: p.id,
          fullName: p.fullName,
          honorific: p.honorific,
          role: p.role,
          avatarJson: p.avatarJson,
        },
        last: unpackBody(last.body).content,
        lastAt: last.createdAt,
        unread: thread.filter((m) => m.fromId === p.id && !m.readAt).length,
        mine: last.fromId === me.id,
      }
    })
    .filter((c): c is NonNullable<typeof c> => !!c)
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())

  const fromIds = [...new Set(broadcasts.map((b) => b.fromId))]
  const fromUsers = fromIds.length
    ? await db.user.findMany({ where: { id: { in: fromIds } } })
    : []
  const fromMap = new Map(fromUsers.map((u) => [u.id, u]))

  const broadcastViews = broadcasts.map((b) => {
    const seen = safeJson<string[]>(b.seenJson, [])
    const from = fromMap.get(b.fromId)
    return {
      id: b.id,
      from: from
        ? {
            id: from.id,
            fullName: from.fullName,
            honorific: from.honorific,
            role: from.role,
            avatarJson: from.avatarJson,
          }
        : null,
      content: b.content,
      attachment: b.attachment,
      createdAt: b.createdAt,
      seenCount: seen.length,
      mine: seen.includes(me.id),
      fromMe: b.fromId === me.id,
    }
  })

  return ok({
    conversations,
    broadcasts: broadcastViews,
    roster: roster
      .filter((u) => u.id !== me.id)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'fa'))
      .map(peerView),
    unreadBroadcasts: broadcastViews.filter((b) => !b.mine).length,
  })
}

/** PUT /api/messages — mark every broadcast as seen by me */
export async function PUT() {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const broadcasts = await db.broadcast.findMany({ take: 200 })
  let updated = 0
  for (const b of broadcasts) {
    const seen = safeJson<string[]>(b.seenJson, [])
    if (!seen.includes(me.id)) {
      seen.push(me.id)
      await db.broadcast.update({ where: { id: b.id }, data: { seenJson: JSON.stringify(seen) } })
      updated++
    }
  }
  return ok({ updated })
}

/**
 * POST /api/messages
 *  - {toId:"<userId>", content, attachment?} → direct message
 *  - {toId:null, content}                    → group broadcast (managers)
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const body = (await req.json().catch(() => ({}))) as {
    toId?: string | null
    content?: string
    attachment?: string | null
    body?: string
  }
  const content = String(body.content ?? body.body ?? '').trim()
  if (!content) return fail('متن پیام الزامی است')
  const attachment = body.attachment ? String(body.attachment) : null
  if (attachment && attachment.length > MAX_ATTACHMENT) {
    return fail('حجم فایل پیوست بیش از حد مجاز است')
  }

  // ---- broadcast ----
  if (!body.toId) {
    if (!isManager(me)) return fail('فقط مدیران می‌توانند پیام گروهی بفرستند', 403)

    const broadcast = await db.broadcast.create({
      data: { fromId: me.id, content, attachment },
    })
    await realtimeEmit('all', { kind: 'broadcast', fromId: me.id, id: broadcast.id })
    await logActivity({
      userId: me.id,
      userName: displayName(me),
      action: 'broadcast_send',
      actionLabel: 'پیام گروهی',
      category: 'messages',
      detail: content.slice(0, 80),
      entityId: broadcast.id,
    })
    return ok({ broadcast: { id: broadcast.id } })
  }

  // ---- direct message ----
  const peer = await db.user.findUnique({ where: { id: String(body.toId) } })
  if (!peer || !peer.active) return fail('گیرنده یافت نشد', 404)
  if (peer.id === me.id) return fail('نمی‌توانید به خودتان پیام بدهید')

  const message = await db.message.create({
    data: {
      fromId: me.id,
      toId: peer.id,
      body: packBody(content, attachment),
    },
  })

  await notify({
    userId: peer.id,
    kind: 'message',
    severity: 'info',
    title: 'پیام جدید',
    body: `${displayName(me)}: ${content.slice(0, 80)}`,
    go: '#/tasks/messages',
  })
  await realtimeEmit(`user:${peer.id}`, {
    kind: 'private',
    fromId: me.id,
    toId: peer.id,
    id: message.id,
  })

  return ok({ message: { id: message.id } })
}

/** DELETE /api/messages?id= — own messages only */
export async function DELETE(req: NextRequest) {
  const me = await getSessionUser()
  if (!me) return fail('نیاز به ورود', 401)

  const id = req.nextUrl.searchParams.get('id') || ''
  const message = await db.message.findUnique({ where: { id } })
  if (!message) return fail('پیام یافت نشد', 404)
  if (message.fromId !== me.id) return fail('فقط می‌توانید پیام خودتان را حذف کنید', 403)

  await db.message.delete({ where: { id } })
  return ok({ deleted: id })
}
