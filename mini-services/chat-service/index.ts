import { createServer } from 'http'
import { Server } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path — Caddy forwards to this port
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

type Presence = { userId: string; name: string; socketId: string }
const online = new Map<string, Presence>() // socketId -> presence

io.on('connection', (socket) => {
  console.log(`[chat] connected: ${socket.id}`)

  socket.on('hz-join', (data: { userId: string; name: string }) => {
    online.set(socket.id, { userId: data.userId, name: data.name, socketId: socket.id })
    // notify others this user is online
    io.emit('hz-presence', { userId: data.userId, name: data.name, online: true })
  })

  // real-time private message relay (persistence happens in the Next.js API)
  socket.on('hz-msg', (data: { toId: string; fromId: string; fromName: string; body: string }) => {
    // broadcast to all clients; only the matching recipient acts on it
    io.emit('hz-msg', data)
  })

  socket.on('disconnect', () => {
    const p = online.get(socket.id)
    if (p) {
      online.delete(socket.id)
      io.emit('hz-presence', { userId: p.userId, name: p.name, online: false })
    }
  })

  socket.on('error', (e) => console.error(`[chat] socket error:`, e))
})

const PORT = 3003
httpServer.listen(PORT, () => console.log(`[chat] Hyper Zeytoon realtime service on :${PORT}`))

process.on('SIGTERM', () => { httpServer.close(() => process.exit(0)) })
process.on('SIGINT', () => { httpServer.close(() => process.exit(0)) })
