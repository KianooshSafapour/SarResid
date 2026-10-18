import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { Server, type Socket } from 'socket.io'
import { Database } from 'bun:sqlite'

/**
 * SarResid realtime service (Agent A scope).
 *
 * - socket.io server on port 3030, path "/" — the live frontend connects with
 *   io("/?XTransformPort=3030", { path: "/", auth: { ticket }, transports: [...] })
 *   (engine.io with path "/" claims every HTTP request on its server, so the
 *   socket port cannot serve any custom HTTP route).
 * - one-time-ticket auth against the shared SQLite DB (RealtimeTicket table),
 *   accessed via bun:sqlite (no Prisma engine → small memory footprint; the
 *   sandbox OOM-killer targets fat processes).
 * - every authenticated socket joins rooms: user:{id} and role:{role}
 * - internal control API on port 3031 (localhost only):
 *     POST /emit {secret, room, event, payload}  → io.to(room).emit(event, payload)
 *     GET  /health
 *   used by Next.js route handlers via src/lib/notify.ts
 */

process.title = 'sarresid-realtime'

const PORT = 3030
const CTRL_PORT = 3031
const SECRET = process.env.REALTIME_SECRET || 'hz-realtime-internal-6677'
const DB_PATH = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/^file:/, '')
  : '/home/z/my-project/db/custom.db'

// ============ shared SQLite DB (RealtimeTicket + User tables) ============

interface TicketRow {
  id: string
  token: string
  userId: string
  expiresAt: string
}

const sqlite = new Database(DB_PATH)
sqlite.exec('PRAGMA busy_timeout = 5000')

// ============ socket.io (port 3030 — public through Caddy) ============

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path — Caddy forwards /?XTransformPort=3030 to this port
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.use(async (socket: Socket, next) => {
  try {
    const ticket = String(
      (socket.handshake.auth as { ticket?: string } | undefined)?.ticket || ''
    )
    if (!ticket) return next(new Error('unauthorized: missing ticket'))

    const row = sqlite
      .query('SELECT id, token, userId, expiresAt FROM RealtimeTicket WHERE token = ?')
      .get(ticket) as TicketRow | null
    if (!row) return next(new Error('unauthorized: invalid ticket'))
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      sqlite.query('DELETE FROM RealtimeTicket WHERE id = ?').run(row.id)
      return next(new Error('unauthorized: expired ticket'))
    }

    // one-time use — delete after validation
    sqlite.query('DELETE FROM RealtimeTicket WHERE id = ?').run(row.id)

    const user = sqlite
      .query('SELECT id, role, active FROM User WHERE id = ?')
      .get(row.userId) as { id: string; role: string; active: number } | null
    if (!user || !user.active) return next(new Error('unauthorized: inactive user'))

    socket.data.userId = user.id
    socket.data.role = user.role
    next()
  } catch {
    next(new Error('unauthorized: internal error'))
  }
})

io.on('connection', (socket: Socket) => {
  const userId = socket.data.userId as string
  const role = socket.data.role as string
  socket.join(`user:${userId}`)
  if (role) socket.join(`role:${role}`)
  console.log(
    `[realtime] connect user=${userId} role=${role} sockets=${io.engine.clientsCount}`
  )

  // Reserved channel — clients may push lightweight pings (unused by the live frontend)
  socket.on('notif', (payload: unknown) => {
    console.log('[realtime] notif from client', userId, JSON.stringify(payload ?? {}).slice(0, 200))
  })

  socket.on('disconnect', () => {
    console.log(`[realtime] disconnect user=${userId} sockets=${io.engine.clientsCount}`)
  })
})

httpServer.listen(PORT, () => {
  console.log(`[realtime] sarresid socket.io listening on :${PORT}`)
})

// ============ internal control API (port 3031 — localhost only) ============

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString()
      if (data.length > 2_000_000) req.destroy() // 2MB cap
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const ctrlServer = createServer(async (req, res) => {
  const url = (req.url || '').split('?')[0]

  if (req.method === 'GET' && url === '/health') {
    return json(res, 200, { ok: true, sockets: io.engine.clientsCount })
  }

  if (req.method === 'POST' && url === '/emit') {
    try {
      const raw = await readBody(req)
      const body = JSON.parse(raw || '{}') as {
        secret?: string
        room?: string
        event?: string
        payload?: unknown
      }
      if (body.secret !== SECRET) return json(res, 403, { ok: false, error: 'forbidden' })
      const room = body.room || 'all'
      const event = body.event || 'msg'
      if (room === 'all') io.emit(event, body.payload ?? {})
      else io.to(room).emit(event, body.payload ?? {})
      return json(res, 200, { ok: true })
    } catch (e) {
      return json(res, 400, { ok: false, error: String(e) })
    }
  }

  return json(res, 404, { ok: false, error: 'not found' })
})

ctrlServer.listen(CTRL_PORT, '127.0.0.1', () => {
  console.log(`[realtime] control API listening on 127.0.0.1:${CTRL_PORT}`)
})

process.on('SIGTERM', () => {
  httpServer.close()
  ctrlServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  httpServer.close()
  ctrlServer.close(() => process.exit(0))
})
